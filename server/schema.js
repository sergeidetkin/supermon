
var enumerations = {};

enumerations.time =
[
    { name: "Now",              value: 0},
    { name: "Later",            value: 1},
    { name: "In a few minutes", value: 2},
    { name: "Tomorrow",         value: 3}
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
    publish_weather_report: {
        name: "weather report",
        description: "Update and publish the weather report",
        channel: "weather"
    },
    get_weather_private: {
        name: "get private weather report",
        description: "Update and send the weather report to this instance only",
        channel: "weather"
    },
    ping: {
        name: "ping process",
        description: "Ping the process",
        parameters: {
            user: {
                name: "User"
            }
        }
    },
    raise_alert: {
        name: "raise alert",
        description: "Raise alert",
        parameters: {
            text: {
                name: "Text"
            }
        }
    },
    make_love: {
        name: "make love"
    },
    shutdown: {
        name: "shutdown process",
        description: "Send shutdown request",
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

var channels = {};

channels.monitor =
{
    log: {
        name: "info (log)",
        history: 98
    },
    warning: {
        name: "warnings",
        history: 99
    },
    error: {
        name: "errors",
        history: 100
    },
    weather: {
        name: "weather report",
        columns: [ "City", "State", "Temperature", "Comments", "City 2", "State 2", "Temperature 2", "Comments 2" ]
    }
};

channels.monitor_test = channels.monitor;

exports.commands = commands;
exports.channels = channels;

