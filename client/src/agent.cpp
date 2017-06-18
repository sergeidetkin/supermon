/* This file is part of Supermon project

 Supermon is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 Supermon is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with Supermon.  If not, see http://www.gnu.org/licenses/
 */

#include <iostream>
#include <exception>
#include <string>
#include <vector>
#include <memory>
#include <future>
#include <chrono>

#include "boost/asio.hpp"
#include "beast/websocket.hpp"
#include "boost/process/environment.hpp"
#include "boost/algorithm/string/split.hpp"
#include "boost/algorithm/string/classification.hpp"
#include "boost/property_tree/ptree.hpp"
#include "boost/property_tree/json_parser.hpp"

#include "supermon/agent.h"

namespace supermon
{
    agent::agent(const config& config) : _config(config), _timer(_io), _socket(_io), _websocket(_socket)
    {
        init();
    }

    agent::~agent()
    {
        shutdown();
    }

    void agent::init()
    {
        _work = std::make_shared<boost::asio::io_service::work>(_io);
        _result = std::async(std::launch::async, [this]()
        {
            while (true)
            {
                try
                {
                    _io.run();
                    break;
                }
                catch (...)
                {
                    onabort(std::current_exception());
                    break;
                }
            }

            _work.reset();
        });
    }

    void agent::shutdown()
    {
        if (_work)
        {
            _work.reset();
            _io.stop();
            _result.get();
        }
    }

    void agent::dispatch(const std::shared_ptr<boost::asio::streambuf>& streambuf)
    {
        std::istream is(&*streambuf);
        auto message = std::make_shared<boost::property_tree::ptree>();
        try
        {
            boost::property_tree::read_json(is, *message);
            auto body = std::shared_ptr<boost::property_tree::ptree>(message, &message->begin()->second);

            onmessage(message->begin()->first, body);
        }
        catch (const boost::property_tree::json_parser_error& e)
        {
            // TODO
            std::cerr << "failed to parse incoming json message" << std::endl;
        }
        listen();
    }

    void agent::retry(std::chrono::seconds timeout)
    {
        _timer.expires_from_now(timeout);
        _timer.async_wait([this](const boost::system::error_code& error)
        {
            if (error != boost::asio::error::operation_aborted)
            {
                connect();
            }
        });
    }

    void agent::listen()
    {
        auto streambuf = std::make_shared<boost::asio::streambuf>();
        //auto opcode = std::make_shared<beast::websocket::opcode>();

        _websocket.async_read
        (
            //*opcode,
            *streambuf,
            [this, /*opcode,*/ streambuf](const boost::system::error_code& error)
            {
                if (error)
                {
                    switch (error.value())
                    {
                        case (int)beast::websocket::error::closed:
                        case (int)boost::asio::error::eof:
                            ondisconnect(error);
                            retry();
                            return;

                        default: throw std::runtime_error((std::to_string(error.value()) + ": " + error.message()).c_str());
                    }
                }
                else //if (beast::websocket::opcode::text == *opcode)
                {
                    dispatch(streambuf);
                    streambuf->consume(streambuf->size()); // do we have to do this?
                }
            }
        );
    }

    void agent::send(const boost::property_tree::ptree& message, bool indent)
    {
        boost::asio::streambuf buffer;
        std::ostream os(&buffer);
        boost::property_tree::write_json(os, message, indent);
        _websocket.write(buffer.data());
    }
    
    void agent::send(const std::string& tag, const boost::property_tree::ptree& message)
    {
        boost::property_tree::ptree msg;
        msg.put("push.channel", tag);
        msg.put_child("push.event", message);
        send(msg);
    }

    void agent::send(const std::string& tag, const std::string& message)
    {
        boost::property_tree::ptree msg;
        msg.put("text", message);
        send(tag, msg);
    }

    void agent::alert(const std::string& text)
    {
        boost::property_tree::ptree msg;
        msg.put("alert.text", text);
        send(msg);
    }

    void agent::connect()
    {
        boost::asio::async_connect
        (
            _socket,
            boost::asio::ip::tcp::resolver(_io).resolve(boost::asio::ip::tcp::resolver::query(_config.host, std::to_string(_config.port))),
            [this](const boost::system::error_code& error, auto /*iterator*/)
            {
                if (!error)
                {
                    _websocket.handshake(_config.host, _config.url);

                    std::vector<std::string> words;
                    boost::algorithm::split(words, _config.name, boost::algorithm::is_any_of("/\\"));
                    const std::string& name = 0 < words.size() ? words[words.size() - 1] : std::string(_config.name);

                    boost::property_tree::ptree login;

                    login.put("login.name", name);
                    login.put("login.instance", _config.instance);
                    login.put("login.pid", boost::this_process::get_id());

                    send(login);
                    
                    onconnect();
                    
                    listen();
                }
                else
                {
                    ondisconnect(error);
                    retry();
                }
            }
        );
    }
}
