// $Id: monitor.cpp 464 2017-06-09 05:09:20Z superuser $

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

#include "monitor.h"

namespace monitor
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
        onmessage = [](std::shared_ptr<std::string> text){
            std::clog << std::this_thread::get_id() << ": received: " << *text << std::endl;
        };

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

    void agent::dispatch(const std::shared_ptr<std::string>& text)
    {
        onmessage(text);
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
        auto opcode = std::make_shared<beast::websocket::opcode>();

        _websocket.async_read
        (
            *opcode,
            *streambuf,
            [this, opcode, streambuf](const boost::system::error_code& error)
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
                else if (beast::websocket::opcode::text == *opcode)
                {
                    auto text = std::make_shared<std::string>(boost::asio::buffers_begin(streambuf->data()), boost::asio::buffers_end(streambuf->data()));
                    dispatch(text);
                    streambuf->consume(streambuf->size()); // do we have to do this?
                }
            }
        );
    }

    void agent::send(const boost::property_tree::ptree& message, bool pretty)
    {
        boost::asio::streambuf buffer;
        std::ostream os(&buffer);

        boost::property_tree::write_json(os, message, pretty);

        _websocket.write(buffer.data());
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
                    _websocket.handshake(_config.host, "/api");

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
