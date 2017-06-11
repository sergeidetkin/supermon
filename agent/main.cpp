// $Id: main.cpp 472 2017-06-11 23:05:45Z superuser $

#include <exception>
#include <iostream>
#include <string>
#include <thread>

#include "monitor.h"
#include "boost/property_tree/json_parser.hpp"

int main(int argc, char* argv[])
{
    try
    {
        std::cerr << std::this_thread::get_id() << ": start..." << std::endl;

        boost::asio::io_service io;
        boost::asio::io_service::work work(io);

        monitor::agent agent({argv[0], "abc", "localhost", 8080});

        agent.onerror = [&io](const boost::system::error_code& error)
        {
            io.post([&io, error]()
            {
                std::cerr << std::this_thread::get_id() << ": " << error.message() << std::endl;
                io.stop();
            });
        };

        agent.onconnect = [&io]()
        {
            io.post([]()
            {
                std::cout << std::this_thread::get_id() << ": connected :)" << std::endl;
            });
        };

        agent.ondisconnect = [&io](const boost::system::error_code&)
        {
            io.post([&io]()
            {
                std::cout << std::this_thread::get_id() << ": disconnected :(" << std::endl;
                //io.stop();
            });
        };

        agent.onmessage = [&io, &agent](const std::string& tag, std::shared_ptr<boost::property_tree::ptree> request)
        {
            io.post([&io, &agent, tag, request]()
            {
                std::cout << std::this_thread::get_id() << ": tag=" << tag << ", message=";

                boost::property_tree::write_json(std::cout, *request, true);

                boost::property_tree::ptree response;
                response.put("warning.message", "got '" + tag + "' message");
                agent.send(response);

                if ("shutdown" == tag) {
                    io.stop();
                }
            });
        };

        agent.connect();

        io.run();

        std::cerr << std::this_thread::get_id() << ": done." << std::endl;
    }
    catch (const std::exception& e)
    {
        std::cerr << std::this_thread::get_id() << ": " << e.what() << std::endl;
        return EXIT_FAILURE;
    }

    return EXIT_SUCCESS;
}
