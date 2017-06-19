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

#ifndef supermon_agent_h
#define supermon_agent_h

#include <iostream>
#include <string>
#include <memory>
#include <future>
#include <chrono>

#include "boost/asio.hpp"
#include "boost/asio/system_timer.hpp"
#include "boost/property_tree/ptree.hpp"

#include "beast/websocket.hpp"

namespace supermon
{

    struct config
    {
        std::string   name;
        std::string   instance;
        std::string   host = {"localhost"};
        std::uint16_t port = 8080;
        std::string   url = {"/api"};
    };

    class agent final
    {
    public:
        agent(const config&);
        ~agent();

    public:
        void connect();
        void shutdown();

    public:
        void send(const std::string& tag, const boost::property_tree::ptree&);
        void send(const std::string& tag, const std::string& message);
        void alert(const std::string& text);
        void info(const std::string& text);

    protected:
        void init();
        void listen();
        void retry(std::chrono::seconds timeout = std::chrono::seconds(5));
        void dispatch(const std::shared_ptr<boost::asio::streambuf>&);
        void send(const boost::property_tree::ptree&, bool indent = false);

    public:
        std::function<void (std::exception_ptr)>                           onabort = [](std::exception_ptr){};
        std::function<void (const boost::system::error_code&)>             onerror = [](const boost::system::error_code&){};
        std::function<void ()>                                             onconnect = [](){};
        std::function<void (const boost::system::error_code&)>             ondisconnect = [](const boost::system::error_code&){};
        std::function<void (const std::string& tag,
                            std::shared_ptr<boost::property_tree::ptree>)> onmessage = [](const std::string&, std::shared_ptr<boost::property_tree::ptree>){};

    private:
        config                                                  _config;
        boost::asio::io_service                                 _io;
        std::shared_ptr<boost::asio::io_service::work>          _work;
        std::future<void>                                       _result;
        boost::asio::system_timer                               _timer;
        boost::asio::ip::tcp::socket                            _socket;
        beast::websocket::stream<boost::asio::ip::tcp::socket&> _websocket;
        std::chrono::time_point<std::chrono::system_clock>      _when = std::chrono::system_clock::now();
    };

}

#endif
