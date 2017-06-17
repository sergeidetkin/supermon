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

#include <exception>
#include <iostream>
#include <string>
#include <thread>

#include "boost/property_tree/json_parser.hpp"

#include "supermon/agent.h"

int main(int argc, char* argv[])
{
    try
    {
        std::cerr << std::this_thread::get_id() << ": start..." << std::endl;

        boost::asio::io_service io;
        boost::asio::io_service::work work(io);

        supermon::agent agent({argv[0], 1 < argc ? argv[1] : "abc", "localhost", 8080});

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
                //std::cout << std::this_thread::get_id() << ": tag=" << tag << ", message=";
                //boost::property_tree::write_json(std::cout, *request, true);

                agent.send("warning", "got '" + tag + "' message");

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
