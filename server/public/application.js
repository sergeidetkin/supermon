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

Date.prototype.strtime = function() {
    return ('00' + this.getHours()).slice(-2) + ':'
           + ('00' + this.getMinutes()).slice(-2) + ':'
           + ('00' + this.getSeconds()).slice(-2) + '.'
           + ('000' + this.getMilliseconds()).slice(-3);
};

function identify(client) {
    return (client.name + '-' + client.instance).replace(/\W/g, '-');
}

class Application
{
    constructor() {
        this.clients = {};

        var leftView = new View(document.querySelector('#left'));
        leftView.createVSplitter();

        var inputView = new View(document.querySelector('#input'));
        inputView.createHSplitter();

        var header = document.querySelector('#left > .section-header');
        var appsView = new View(document.querySelector('#apps'));
        appsView.createHSplitter({offset:0, size: header.getBoundingClientRect().height + 'px'});

        this.processListView = new ListView(document.querySelector('#proc-view'));
        this.processListView.addEventListener('change', this.onSelectedClientChanged.bind(this));

        this.commandsListView = new ListView(document.querySelector('#commands > .list-view'));
        this.commandsListView.addEventListener('change', this.onSelectedCommandChanged.bind(this));

        this.channelsListView = new ListView(document.querySelector('#channel-bar'));
        this.channelsListView.addEventListener('change', this.onSelectedChannelChanged.bind(this));

        this.channelView = new ListView(document.querySelector('#channel-view'));
        this.channelView.maxCount = 100;

        this.reconnectTimeout = 3000; // ms
        this.reconnectAttemptsMax = Math.floor(60*1000 / this.reconnectTimeout);
        this.reconnectAttemptCount = 0;

        this.connect();
    }

    onSelectedChannelChanged(e) {
        this.websocket.send(JSON.stringify({ unsubscribe: {} }));
        this.channelView.clear();

        if (-1 != e.selectedIndex) {
            var topic = this.channelsListView.element.children[e.selectedIndex].target;
            var message = {
                subscribe: topic
            };
            this.websocket.send(JSON.stringify(message));
        }
    }

    updateChannelsView(id) {
        this.channelsListView.clear()
        if (-1 == id) {
            return;
        }
        var client = this.clients[id];
        if (client.hasOwnProperty('channels')) {
            for (var key in client.channels) {
                //var command = client.commands[key];
                var it = new ChannelsListViewItem();
                it.bind(key, client);
                this.channelsListView.add(it);
            }
        }
    }

    updateCommandsView(id) {
        this.commandsListView.clear()
        if (-1 == id) {
            return;
        }
        var client = this.clients[id];
        if (client.hasOwnProperty('commands')) {
            for (var key in client.commands) {
                //var command = client.commands[key];
                var it = new CommandListViewItem();
                it.bind(key, client);
                this.commandsListView.add(it);
            }
        }
    }

    createInputForm(command) {
        var form = document.createElement('div');
        form.id = 'form';

        var div = document.createElement('div');
        div.textContent = command.description || command.name;
        form.appendChild(div);

        var table = document.createElement('table');

        for (var key in command.parameters) {
            var parameter = command.parameters[key];
            var args = command.arguments || {};
            if (undefined == command.arguments) command.arguments = args;
            var row = table.insertRow();
            var cell = row.insertCell();
            cell.textContent = parameter.name;
            cell = row.insertCell();
            if (undefined == parameter.values || 0 == parameter.values.length) {
                var input = document.createElement('input');
                input.type = 'text';
                input.value = args[key] || '';
                cell.appendChild(input);
                // need this to properly capture args, key and input
                input.addEventListener('input',
                    (function(args, key, input) {
                        return function() {
                            args[key] = input.value;
                        };
                    })(args, key, input)
                );
            }
            else {
                var select = document.createElement('select');
                for (var n = 0; n < parameter.values.length; ++n) {
                    var option = document.createElement('option');
                    var value = parameter.values[n];
                    option = document.createElement('option');
                    option.text = value.name;
                    option.value = value.value;
                    select.add(option);
                    if (0 == n && undefined == args[key]) {
                        // because select element makes the first item selected, but does not change the selectedIndex
                        select.selectedIndex = 0;
                        args[key] = option.value;
                    }
                    if (args[key] == option.value) {
                        select.selectedIndex = n;
                    }
                }
                cell.appendChild(select);
                select.addEventListener('change',
                    (function(args, key, parameter, select) {
                        return function() {
                            args[key] = parameter.values[select.selectedIndex].value;
                        };
                    })(args, key, parameter, select)
                );
            }
            if (undefined == args[key]) {
                args[key] = '';
            }
        }

        form.appendChild(table);

        div = document.createElement('div');
        var button = document.createElement('input');
        button.id = 'execute';
        button.type = 'button';
        button.value = 'Execute';
        div.appendChild(button);

        form.appendChild(div);

        return form;
    }

    submitCommand(commandId, target) {
        var message = {
            command: {
                id: commandId,
                clientId: target.name + '.' + target.instance,
                arguments: target.commands[commandId].arguments || {}
            }
        };
        this.websocket.send(JSON.stringify(message));
    }

    updateInputView(commandId, target) {
        var input = document.querySelector('#input');
        var form = input.querySelector('#form');
        if (form) {
            input.removeChild(form);
        }
        if (null == commandId || null == target) {
            return;
        }
        var command = target.commands[commandId];
        //console.log('->', target.name, command.name);
        form = this.createInputForm(command);
        var execute = form.querySelector('#execute');
        execute.addEventListener('click', this.submitCommand.bind(this, commandId, target));
        input.appendChild(form);
    }

    onSelectedCommandChanged(e) {
        var input = document.querySelector('#input');
        var status = document.querySelector('#statusbar > .item > #command');
        var commandId = null;
        var target = null;
        if (-1 != e.selectedIndex) {
            commandId = this.commandsListView.element.children[e.selectedIndex].command;
            target = this.commandsListView.element.children[e.selectedIndex].target;
            status.textContent = target.commands[commandId].name;
            status.parentElement.style.display = '';
            input.style.flexBasis = 'auto';
            //input.style.display = '';
        }
        else {
            status.textContent = '';
            status.parentElement.style.display = 'none';
            //input.style.display = 'none';
        }
        this.updateInputView(commandId, target);
        window.setTimeout(function() {
            window.dispatchEvent(new Event('split'));
        });
    }

    onSelectedClientChanged(e) {
        var status = document.querySelector('#statusbar > .item > #client');
        var id = -1;
        if (-1 != e.selectedIndex) {
            id = this.processListView.element.children[e.selectedIndex].id;
            var client = this.clients[id];
            status.textContent = client.name + '.' + client.instance + '@' + client.hostname;
            status.parentElement.style.display = '';
        }
        else {
            status.textContent = '';
            status.parentElement.style.display = 'none';
        }
        this.updateCommandsView(id);
        this.updateChannelsView(id);
    }

    updateClientStatus(client) {
        var id = identify(client);
        var element = this.processListView.element.querySelector('#'+id);
        var it = null;
        if (null != element) {
            it = new ProcessListViewItem(element);
            it.alert = 'alert' == client.status.type;
            it.online = 'offline' != client.status.type;
            it.info = (new Date(client.status.when)).strtime() + ': ' + client.status.text;
        }
        if (null == it) {
            console.error('onstatus() failed: list view item with id "', '#'+id, '" not found');
        }
    }

    updateClientItem(client) {
        var id = identify(client);
        var it = null;

        if (undefined == this.clients[id]) {
            this.clients[id] = client;

            it = new ProcessListViewItem();
            it.element.id = id;

            this.processListView.add(it);
        }
        else {
            Object.assign(client.commands, this.clients[id].commands);
            Object.assign(this.clients[id], client);

            var itemElement = this.processListView.element.querySelector('#'+id);
            if (null != itemElement) {
                it = new ProcessListViewItem(itemElement);
            }
            else {
                console.error('updateClientItem() failed: list view item with id "', '#'+id, '" not found');
                return;
            }
        }

        it.name = client.name + '.' + client.instance;
        it.element.title = client.name + '.' + client.instance + '.' + client.pid;

        this.updateClientStatus(client);
    }

    updateStatusBar() {
        var bg = this.online ? '#0C0' : 'crimson';
        var fg = 'white';
        var status = document.querySelector('#statusbar > .item > #status');
        status.textContent = this.online ? document.location.host : 'connecting...';
        status.style.color = fg;
        status.parentElement.style.backgroundColor = bg;
        document.querySelector('#statusbar > .item > #connected').textContent = this.connectedClientsCount;
    }

    get connectedClientsCount() {
        var total = 0;
        var connected = 0;

        for (var id in this.clients) {
            ++total;
            if ('offline' != this.clients[id].status.type) {
                ++connected;
            }
        }
        return connected;
    }

    connect() {
        this.reset(false);

        this.websocket = new WebSocket('ws://' + document.location.host + '/user');

        this.websocket.onmessage = function(msg) {
            try {
                var message = JSON.parse(msg.data);
                var id = Object.keys(message)[0];

                if ('function' == typeof(this['on'+id])) {
                    this['on'+id](message[id]);
                }
                else {
                    console.debug('unhandled:', message);
                }
                return;
            }
            catch (e) {
                console.error('failed to dispatch message "' + msg.data + '":', e);
            }
        }.bind(this);

        this.websocket.onopen = function() {
            console.log('connected');
            this.reconnectAttemptCount = 0;
            this.reset(true);
        }.bind(this);

        var reconnect = function(e) {
            if (e) {
                console.log(e);
            }

            this.reset(false);

            if (this.reconnectAttemptCount++ < this.reconnectAttemptsMax) {
                window.setTimeout(function() {
                    this.connect();
                }.bind(this), this.reconnectTimeout);
            }
            else {
                console.error('failed to reconnect');
                document.querySelector('#statusbar > .item > #status').textContent = 'offline';
            }
            
        }.bind(this);

        this.websocket.onclose = reconnect;
        this.websocket.onerror = reconnect;
    }

    reset(online) {
        this.online = online;
        this.clients = {};
        this.processListView.clear();
        this.updateStatusBar();
    }

    onsnapshot(message) {
        for (var id in message) {
            this.updateClientItem(message[id]);
        }
        this.updateStatusBar();
    }

    onlogin(message) {
        //console.debug('login', message);
        this.updateClientItem(message);
        this.updateStatusBar();
    }

    onupdate(message) {
        //console.debug('update', message);
        if (Array.isArray(message)) {
            this.channelView.autoScroll = false;
            if (0 < message.length) {
                this.channelView.maxCount = this.clients[identify(message[0].source)].channels[message[0].channel].history || 100;
            }
            for (var n = 0; n < message.length; ++n) {
                var item = message[n];
                var it = new EventListViewItem();
                it.text = (new Date(item.when)).strtime() + ': ' + item.event.text;
                this.channelView.add(it);
            }
            this.channelView.autoScroll = true;
        }
        else {
            var it = null;
            if (message.event.hasOwnProperty('text')) {
                this.channelView.maxCount = this.clients[identify(message.source)].channels[message.channel].history || 100;
                it = new EventListViewItem();
                it.text = (new Date(message.when)).strtime() + ': ' + message.event.text;
            }
            else if (message.event.hasOwnProperty('data')) {
                this.channelView.maxCount = 1;
                it = new TableView();
                it.columns = this.clients[identify(message.source)].channels[message.channel].columns;
                it.data = message.event.data;
            }
            this.channelView.add(it);
        }
    }

    onstatus(message) {
        var id = identify(message.source);
        var client = this.clients[id];
        if (undefined == client) {
            console.error('onstatus() failed: client not found', message.source);
            return;
        }
        client.status = message.status;
        this.updateClientStatus(client);
        this.updateStatusBar();
    }
}

window.addEventListener('load', function main() {
    const app = new Application();
});

