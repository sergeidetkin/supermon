// exempli gratia

var enumerations = {};
var commands = {};
var channels = {};

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

// common commands
commands.common =
{
    ping: {
        name: "ping process",
        description: "Ping the process",
        parameters: {
            user: {
                name: "User"
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
    }
};

// commands for monitor_test
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
    command_1: { name: "command 1" },
    command_2: { name: "command 2" },
    command_3: { name: "command 3" }
};

// append common commands to monitor_test
// common commands at the end
Object.assign(commands.monitor_test, commands.common);

// monitor commands
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
    }
};

// append common commands to monitor
Object.assign(commands.monitor, commands.common);


// combine common commands with one_more command for foobar process
// common commands first
commands.foobar = Object.assign({}, commands.common, {
    one_more: {
        name: "foobar's own command"
    }
});

// add another command to the foobar
commands.foobar.plus_one =
{
    name: "one last thing",
    parameters: {
        thing: {
            name: "The thing",
            // optional values inlined
            values: [
                { name: "is false", value: false },
                { name: "is true", value: true }
            ]
        }
    }
};

// plain copy single command from another process
commands.foobar.publish_weather_report = commands.monitor.publish_weather_report;


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

channels.foobar = channels.monitor;


exports.commands = commands;
exports.channels = channels;

