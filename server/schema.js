
var enumerations = {};

enumerations.time =
[
    { name: "Now",   value: "0"},
    { name: "Later", value: "1"}
];


var commands = {};

commands.monitor_test =
{
    pong: {
        name: "pong process",
        description: "Pong selected process",
        parameters: {
            user: {
                name: "User"
            }
        }
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
        parameters: {
            user: {
                name: "User"
            }
        }
    },
    shutdown: {
        name: "shutdown process",
        description: "Send shutdown notification to the selected process",
        parameters: {
            user: {
                name: "User"
            },
            time1: {
                name: "Time 1",
                values: enumerations.time
            },
            time2: {
                name: "Time 2",
                values: enumerations.time
            }
        }
    }
};

exports.commands = commands;

