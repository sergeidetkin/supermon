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

void badge(boost::asio::io_service& io, supermon::agent& agent)
{
    boost::asio::system_timer timer(io);
    bool flag = true;

    std::function<void(const boost::system::error_code&)> tick = [&](const boost::system::error_code& error)
    {
        if (error != boost::asio::error::operation_aborted)
        {
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
}

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

        std::cout << std::this_thread::get_id() << ": started..." << std::endl;

        boost::asio::io_service io;
        boost::asio::io_service::work work(io);

        supermon::agent agent
        ({
            arguments.count("alias") ? arguments["alias"].as<std::string>() : argv[0],
            arguments.count("instance") ? arguments["instance"].as<std::string>() : "A1",
            arguments["host"].as<std::string>(),
            arguments["port"].as<std::uint16_t>()
        });

        // setup error and status notification handlers
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
            std::cout << std::this_thread::get_id() << ": connected! " << std::endl;
            agent.send("log", "hello!");
        };

        agent.ondisconnect = [&io](const std::runtime_error& error)
        {
            io.post([&io, error]()
            {
                std::cout << std::this_thread::get_id() << ": disconnected: " << error.what() << std::endl;
                //io.stop();
            });
        };

        // now set up the message handlers

        agent.on("modify_schema", [&](const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& msg)
        {
            std::ostringstream os;
            boost::property_tree::write_json(os, *msg, false);
            agent.send
            (
                "warning",
                "not implemented yet: "
                + head->get<std::string>("tag")
                + ": " + os.str()
            );
//            supermon::ptree_t subtree;
//            subtree.put("action", msg->get<std::string>("action"));
//            subtree.put("path", msg->get<std::string>("path"));
            agent.panic("Really long and annoying message!");
        });

        agent.on("raise_alert", [&](const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& msg)
        {
            std::string text = msg->get<std::string>("text");
            agent.alert(text);
            agent.send("warning", "raised alert '" + text + "'");
        });

        agent.on("get_weather_private", [&](const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& msg)
        {
            io.post([=, &agent]()
            {
                agent.send("log", "executing " + head->get<std::string>("tag") + "...");

                auto receive_time = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
                auto send_time = head->get<long>("when");

                supermon::dataset data;
                data.header += "Latency (ms)", "Port", "Text";

                for (size_t n = 0; n < 10; ++n)
                {
                    supermon::dataset::row& r = data.insertRow();
                    r += receive_time - send_time, head->get<long>("port"), "This is a test";
                }

                agent.send("weather", data, head->get<long>("port"));
            });
        });

        agent.on("publish_weather_report", [&](const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& msg)
        {
            io.post([=, &agent]()
            {
                auto tag = head->get<std::string>("tag");
                agent.send("log", "executing " + tag + "...");


                // how to deal with chrono serialization
                auto now = std::chrono::system_clock::now().time_since_epoch();
                auto timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(now).count();

                std::time_t t = timestamp / 1000;
                auto ms = timestamp % 1000;

                std::ostringstream os;
                os << std::put_time(std::localtime(&t), "%T.") << std::setfill('0') << std::setw(3) << ms;
                auto strtime = os.str();

                supermon::dataset data;

                for (size_t n = 0; n < 10; ++n)
                {
                    data.insert(strtime, "foo", nullptr, false, "New York", "NY", "blah", "bar");
                    data.insert(true, strtime, "blah", tag, "London", "UK", "foo", false);
                    // or
                    supermon::dataset::row& r = data.insertRow();
                    r += strtime, 2, true, 4, nullptr, false, 7, 8.0;
                }

                agent.send("weather", data);
            });
        });

        agent.on("shutdown", [&](const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& msg)
        {
            agent.send("warning", "shutting down...");
            io.stop();
        });

        // unhandled message handler
        agent.onmessage = [&](const std::string& tag, const supermon::ptree_ptr_t& head, const supermon::ptree_ptr_t& msg)
        {
            if ("ping" == tag)
            {
                agent.info(tag);
                agent.send("log", msg->get<std::string>("user"));
            }
            else {
                std::ostringstream os;
                boost::property_tree::write_json(os, *msg, false);
                agent.send("error", "don't know how to " + tag + ": " + os.str());
            }
        };

        // call agent.connect() *after* setting the message handlers to avoid race conditions
        agent.connect();

        // chage the alert|info badge periodically
        badge(io, agent);


        // run our own event pump
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
