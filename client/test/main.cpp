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
#include <tuple>

#include "boost/property_tree/json_parser.hpp"
#include "boost/program_options.hpp"

#include "supermon/agent.h"

int main(int argc, char* argv[])
{
    try
    {
        namespace config = boost::program_options;
        config::options_description options("options");
        options.add_options()
            ("help,?",                                                               ": print this message")
            ("alias,a",    config::value<std::string>(),                             ": use 'arg' instead of the executable's name")
            ("instance,i", config::value<std::string>(),                             ": set the process instance")
            ("host,h",     config::value<std::string>()->default_value("localhost"), ": supermon server host")
            ("port,p",     config::value<std::uint16_t>()->default_value(8080),      ": supermon server port");

        config::variables_map arguments;
        config::store(config::parse_command_line(argc, argv, options), arguments);
        config::notify(arguments);

        if (arguments.count("help"))
        {
            std::cout << options << std::endl;
            return EXIT_FAILURE;
        }

        std::cerr << std::this_thread::get_id() << ": started..." << std::endl;

        boost::asio::io_service io;
        boost::asio::io_service::work work(io);

        supermon::agent agent
        ({
            arguments.count("alias") ? arguments["alias"].as<std::string>() : argv[0],
            arguments.count("instance") ? arguments["instance"].as<std::string>() : "A1",
            arguments["host"].as<std::string>(),
            arguments["port"].as<std::uint16_t>()
        });

        agent.onerror = [&io](const std::runtime_error& error)
        {
            io.post([&io, error]()
            {
                std::cerr << std::this_thread::get_id() << ": error: " << error.what() << std::endl;
                //io.stop();
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

        agent.ondisconnect = [&io](const std::runtime_error& error)
        {
            io.post([&io, error]()
            {
                std::cout << std::this_thread::get_id() << ": disconnected: " << error.what() << std::endl;
                //io.stop();
            });
        };

        agent.onmessage = [&io, &agent](const std::string& tag, const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& request)
        {
            io.post([&io, &agent, tag, head, request]()
            {
                if ("send_alert" == tag) {
                    std::string text = request->get<std::string>("text");
                    agent.alert(text);
                    agent.send("warning", "raised alert '" + text + "'");
                }
                else if ("publish_weather_report" == tag)
                {
                    agent.send("log", "executing " + tag + "...");
                    std::chrono::microseconds now = std::chrono::system_clock::now().time_since_epoch();
                    std::chrono::milliseconds timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(now);

                    supermon::dataset data;

                    for (size_t n = 0; n < 10; ++n) {
                        data.insert(std::to_string(now.count()), "foo", nullptr, false, "New York", "NY", "blah", "bar");
                        data.insert(true, std::to_string(timestamp.count()), "blah", tag, "London", "UK", "foo", false);
                        // or
                        supermon::dataset::row& r = data.insertRow();
                        r += "12:30", 2, true, 4, nullptr, false, 7, 8.0;
                    }

                    agent.send("weather", data);
                    //agent.send("log", "executed " + tag + ".");
                }
                else if ("get_weather_private" == tag)
                {
                    agent.send("log", "executing " + tag + "...");
                    supermon::dataset data;

                    for (size_t n = 0; n < 10; ++n) {
                        supermon::dataset::row& r = data.insertRow();
                        r += "12:30", head->get<long>("port"), 3, 4, nullptr, false, 7, 8.0;
                    }

                    agent.send("weather", data, head->get<long>("port"));
                }
                else if ("shutdown" == tag) {
                    std::ostringstream os;
                    boost::property_tree::write_json(os, *request, false);
                    os << ": shutting down...";
                    agent.send("warning", os.str());
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

        boost::asio::system_timer timer(io);

        bool flag = true;

        std::function<void(const boost::system::error_code&)> tick = [&](const boost::system::error_code& error)
        {
            if (error != boost::asio::error::operation_aborted)
            {
                auto ticks = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
                agent.send("log", "the time now is: " + std::to_string(ticks));

                if (flag)
                {
                    agent.alert("testing, attention please!");
                }
                else
                {
                    agent.info("blah blah blah");
                }

                flag = !flag;

                timer.expires_from_now(std::chrono::milliseconds(5000));
                timer.async_wait(tick);
            }
        };

        timer.expires_from_now(std::chrono::milliseconds(5000));
        timer.async_wait(tick);

        io.run();

        std::cerr << std::this_thread::get_id() << ": done." << std::endl;
    }
    catch (const std::exception& e)
    {
        std::cerr << std::this_thread::get_id() << ": main thread exception: " << e.what() << std::endl;
        return EXIT_FAILURE;
    }

    return EXIT_SUCCESS;
}
