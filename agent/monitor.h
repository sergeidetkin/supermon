// $Id: monitor.h 464 2017-06-09 05:09:20Z superuser $

#ifndef rotor_monitor_h
#define rotor_monitor_h

#include <iostream>
#include <string>
#include <memory>
#include <future>

#include "boost/asio.hpp"
#include "boost/asio/system_timer.hpp"
#include "boost/property_tree/ptree.hpp"

#include "beast/websocket.hpp"

namespace monitor
{

    struct config
    {
        std::string   name;
        std::string   instance;
        std::string   host;
        std::uint16_t port;
    };

    class agent final
    {
    public:
        agent(const config&);
        ~agent();

    public:
        void connect();
        void send(const boost::property_tree::ptree&, bool pretty = true);
        void shutdown();

    protected:
        void init();
        void listen();
        void retry(std::chrono::seconds timeout = std::chrono::seconds(5));
        void dispatch(const std::shared_ptr<std::string>&);

    public:
        std::function<void (std::exception_ptr)>               onabort = [](std::exception_ptr){};
        std::function<void (const boost::system::error_code&)> onerror = [](const boost::system::error_code&){};
        std::function<void ()>                                 onconnect = [](){};
        std::function<void (const boost::system::error_code&)> ondisconnect = [](const boost::system::error_code&){};
        std::function<void (std::shared_ptr<std::string>)>     onmessage = [](std::shared_ptr<std::string>){};

    private:
        config                                                  _config;
        boost::asio::io_service                                 _io;
        std::shared_ptr<boost::asio::io_service::work>          _work;
        std::future<void>                                       _result;
        boost::asio::system_timer                               _timer;
        boost::asio::ip::tcp::socket                            _socket;
        beast::websocket::stream<boost::asio::ip::tcp::socket&> _websocket;
    };

}

#endif
