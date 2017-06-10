// $Id: schema.js 469 2017-06-10 11:56:24Z superuser $

var enumerations = {};
var commands = {};

enumerations.time =
[
    { name: "Now",   value: "0"},
    { name: "Later", value: "1"}
];

commands.monitor_test =
{
    ping: {
        name: "pong process",
        description: "Pong selected process",
        options: [
            {
                name: "User"
            }
        ]
    },
    shutdown: {
        name: "kill",
        description: "Kill the process",
    },
    command_1: { name: "command 1" },
    command_2: { name: "command 2" },
    command_3: { name: "command 3" },
    command_4: { name: "command 4" },
    command_5: { name: "command 5" },
    command_6: { name: "command 6" },
    command_7: { name: "command 7" },
    command_8: { name: "command 8" },
    command_9: { name: "command 9" },
    command_10: { name: "command 10" }
};

commands.monitor =
{
    ping: {
        name: "ping process",
        description: "Ping selected process",
        options: [
            {
                name: "User"
            }
        ]
    },
    shutdown: {
        name: "shutdown process",
        description: "Send shutdown notification to the selected process",
        options: [
            {
                name: "User"
            },
            {
                name: "Time1",
                values: enumerations.time
            },
            {
                name: "Time2",
                values: enumerations.time
            }
        ]
    }
};

exports.enumerations = enumerations;
exports.commands = commands;

