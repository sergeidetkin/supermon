// $Id: schema.js 466 2017-06-09 05:45:33Z superuser $

var enumerations = {};
var commands = {};

enumerations.time =
[
    { name: "Now",   value: "0"},
    { name: "Later", value: "1"}
];

commands.monitor =
{
    ping: {
        name: "pong process",
        description: "Pong selected process",
        options: [
            {
                name: "User"
            }
        ]
    }
};

commands.monitor_test =
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

