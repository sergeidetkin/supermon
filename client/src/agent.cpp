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
#include "boost/algorithm/string/replace.hpp"
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
        if (_config.name.empty() || _config.instance.empty() || _config.host.empty() || _config.port < 80)
        {
            throw std::invalid_argument("invalid config");
        }

        onabort = [](std::exception_ptr eptr)
        {
            try
            {
                std::rethrow_exception(eptr);
            }
            catch (const std::exception& e)
            {
                std::cerr << "supermon::agent: unhandled exception: " << e.what() << std::endl;
            }
            catch (...)
            {
                std::cerr << "supermon::agent: unhandled exception" << std::endl;
            }
        };

        _work = std::make_shared<boost::asio::io_service::work>(_io);
        _result = std::async(std::launch::async, [this]()
        {
            while (true)
            {
                try
                {
                    _io.run();
                    break; // exit normally
                }
                catch (const std::exception& e)
                {
                    // if there is a handler for soft error call it and continue
                    if (onerror)
                    {
                        onerror(std::runtime_error(e.what()));
                        continue;
                    }
                    // if not, call onabort and then bail out
                    if (onabort)
                    {
                        onabort(std::current_exception());
                    }
                    break;
                }
                catch (...)
                {
                    if (onabort)
                    {
                        onabort(std::current_exception());
                    }
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

    boost::asio::io_service& agent::io_service()
    {
        return _io;
    }

    void agent::dispatch(std::shared_ptr<boost::asio::streambuf> streambuf)
    {
        std::istream is(&*streambuf);
        auto message = std::make_shared<boost::property_tree::ptree>();
        try
        {
            boost::property_tree::read_json(is, *message);

            const auto& tag = message->begin()->first;
            auto& root = message->begin()->second;

            // achtung! aliasing constructor
            auto head = std::shared_ptr<boost::property_tree::ptree>(message, &root.get_child("head"));
            auto body = std::shared_ptr<boost::property_tree::ptree>(message, &root.get_child("body"));

            const auto& it = _handlers.find(tag);
            if (_handlers.end() != it && it->second)
            {
                head->put("tag", tag);
                const auto& handler = it->second;
                handler(head, body);
            }
            else if (onmessage)
            {
                onmessage(tag, head, body);
            }
        }
        catch (const std::exception& e)
        {
            if (onerror) onerror(std::runtime_error(e.what()));
        }
        listen(streambuf);
    }

    void agent::retry(std::chrono::seconds interval)
    {
        _timer.expires_from_now(interval);
        _timer.async_wait([this](const boost::system::error_code& error)
        {
            if (error != boost::asio::error::operation_aborted)
            {
                connect();
            }
        });
    }

    void agent::listen(std::shared_ptr<boost::asio::streambuf> buffer)
    {
        auto streambuf = nullptr != buffer ? buffer : std::make_shared<boost::asio::streambuf>();

        _websocket.async_read
        (
            *streambuf,
            [this, streambuf](const boost::system::error_code& error)
            {
                if (error)
                {
                    switch (error.value())
                    {
                        case (int)beast::websocket::error::closed:
                        case (int)boost::asio::error::eof:
                            if (ondisconnect) ondisconnect(std::runtime_error(error.message()));
                            retry();
                            return;

                        default: throw std::runtime_error((std::to_string(error.value()) + ": " + error.message()).c_str());
                    }
                }
                else
                {
                    dispatch(streambuf);
                    if (0 < streambuf->size())
                    {
                        streambuf->consume(streambuf->size());
                    }
                }
            }
        );
    }

    void agent::send(const boost::property_tree::ptree& message)
    {
        try
        {
            boost::asio::streambuf buffer;
            std::ostream os(&buffer);
            boost::property_tree::write_json(os, message, false);
            _websocket.write(buffer.data());
        }
        catch (const std::exception& e)
        {
            if (onerror) onerror(std::runtime_error(e.what()));
        }
    }

    template<typename T = std::chrono::milliseconds>
    long long timestamp()
    {
        std::chrono::microseconds now = std::chrono::system_clock::now().time_since_epoch();
        return std::chrono::duration_cast<T>(now).count();
    }

    void agent::send(const std::string& channel, const dataset& data, long port)
    {
        try
        {
            boost::asio::streambuf buffer;
            std::ostream os(&buffer);
            os << "{\"push\":{"
               << "\"when\":\"" << timestamp() << "\","
               << "\"channel\":\"" << channel << "\","
               << "\"port\":\"" << port << "\","
               << "\"event\":{\"data\":" << data
               << "}}}";
            _websocket.write(buffer.data());
        }
        catch (const std::exception& e)
        {
            if (onerror) onerror(std::runtime_error(e.what()));
        }
    }

    void agent::send(const std::string& channel, const std::string& text, long port)
    {
        boost::property_tree::ptree msg;
        msg.put("push.channel", channel);
        msg.put("push.port", port);
        msg.put("push.when", timestamp());
        msg.put("push.event.text", text);
        send(msg);
    }

    void agent::alert(const std::string& text)
    {
        boost::property_tree::ptree msg;
        msg.put("status.type", "alert");
        msg.put("status.when", timestamp());
        msg.put("status.text", text);
        send(msg);
    }

    void agent::info(const std::string& text)
    {
        boost::property_tree::ptree msg;
        msg.put("status.type", "info");
        msg.put("status.when", timestamp());
        msg.put("status.text", text);
        send(msg);
    }

    void agent::connect()
    {
        boost::asio::async_connect
        (
            _socket,
            boost::asio::ip::tcp::resolver(_io).resolve(boost::asio::ip::tcp::resolver::query(_config.host, std::to_string(_config.port))),
            [this](const boost::system::error_code& error, boost::asio::ip::tcp::resolver::iterator /*it*/)
            {
                if (!error)
                {
                    _websocket.handshake(_config.host, "/api");

                    std::vector<std::string> words;
                    boost::algorithm::split(words, _config.name, boost::algorithm::is_any_of("/\\"));
                    const std::string& name = 0 < words.size() ? words[words.size() - 1] : std::string(_config.name);

                    boost::property_tree::ptree login;

                    login.put("login.name",      name);
                    login.put("login.instance",  _config.instance);
                    login.put("login.pid",       boost::this_process::get_id());
                    login.put("login.hostname",  boost::asio::ip::host_name());
                    login.put("login.when",      timestamp());
                    login.put("login.timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(_when.time_since_epoch()).count());

                    send(login);
                    
                    if (onconnect) onconnect();
                    
                    listen();
                }
                else
                {
                    if (ondisconnect) ondisconnect(std::runtime_error(error.message()));
                    retry();
                }
            }
        );
    }

    void agent::on(const std::string& tag, const callback::handler& f)
    {
        _handlers[tag] = f;
    }

}
