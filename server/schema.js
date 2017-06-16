
var enumerations = {};

enumerations.time =
[
    { name: "Now",              value: "0"},
    { name: "Later",            value: "1"},
    { name: "In a few minutes", value: "3"},
    { name: "Tomorrow",         value: "4"}
];

enumerations.colors =
[
    { name: "Red",    value: "0"},
    { name: "Orange", value: "1"},
    { name: "Yellow", value: "Y"},
    { name: "Green",  value: "green"},
    { name: "Blue",   value: "rgb(0,0,255)"}
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
    change_color: {
        name: "color picker",
        description: "Choose the color",
        parameters: {
            color: {
                name: "Color",
                values: enumerations.colors
            }
        }
    },
    shutdown: {
        name: "shutdown",
        description: "Kill the process",
        parameters: {
            when: {
                name: "When",
                values: enumerations.time
            }
        }
    },
    command_1: { name: "command 1" },
    command_2: { name: "command 2" },
    command_3: { name: "command 3" }
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

