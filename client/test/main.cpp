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
        std::cerr << std::this_thread::get_id() << ": started..." << std::endl;

        boost::asio::io_service io;
        boost::asio::io_service::work work(io);

        supermon::agent agent
        (
            {
                1 < argc ? argv[1] : argv[0],
                2 < argc ? argv[2] : "abc",
                "localhost",
                8080
            }
         );

        agent.onerror = [&io](const std::exception& error)
        {
            io.post([&io, error]()
            {
                std::cerr << std::this_thread::get_id() << ": " << error.what() << std::endl;
                io.stop();
            });
        };

        agent.onconnect = [&io, &agent]()
        {
            io.post([&agent]()
            {
                std::cout << std::this_thread::get_id() << ": connected :)" << std::endl;
                agent.send("log", "hello!");
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
                if ("send_alert" == tag) {
                    std::string text = request->get<std::string>("text");
                    agent.alert(text);
                    agent.send("warning", "raised alert '" + text + "'");
                }
                else if ("shutdown" == tag) {
                    agent.send("warning", "shutting down...");
                    io.stop();
                }
                else if ("ping" == tag) {
                    agent.info(tag);
                    agent.send("log", request->get<std::string>("user"));
                }
                else {
                    agent.info(tag);
                    agent.send("error", "don't know what to do with '" + tag + "'");
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
