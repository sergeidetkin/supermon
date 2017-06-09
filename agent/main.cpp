// $Id: main.cpp 464 2017-06-09 05:09:20Z superuser $

#include <exception>
#include <iostream>
#include <string>
#include <thread>

#include "monitor.h"

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

        agent.onmessage = [&io](std::shared_ptr<std::string> text)
        {
            io.post([&io, text]()
            {
                std::cout << std::this_thread::get_id() << ": " << *text << std::endl;
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
