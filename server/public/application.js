// $Id: application.js 473 2017-06-14 04:32:44Z superuser $

class Application
{
    constructor() {
        this.clients = {};

        this.processListView = new ListView(document.querySelector('#apps > .list-view'));
        this.processListView.addEventListener('change', this.onSelectedClientChanged.bind(this));

        this.commandsListView = new ListView(document.querySelector('#commands > .list-view'));
        this.commandsListView.addEventListener('change', this.onSelectedCommandChanged.bind(this));

        this.reconnectTimeout = 3000; // ms
        this.reconnectAttemptsMax = Math.floor(60*1000 / this.reconnectTimeout);
        this.reconnectAttemptCount = 0;

        this.connect();
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
                var it = CommandListViewItem.create();
                it.bind(key, client);
                this.commandsListView.add(it);
            }
        }
    }

    createInputForm(command) {
        var form = document.createElement('div');

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
                // careful, we are creating a generator function to properly capture args, key and input
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
                        select.selectedIndex = 0; // because select makes the first item appera as selected, but does not change the selectedIndex
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

    updateOptionsView(commandId, target) {
        var element = document.querySelector('#input');
        if (element.firstElementChild) {
            element.removeChild(element.firstElementChild);
        }
        if (null == commandId || null == target) {
            return;
        }
        var command = target.commands[commandId];
        //console.log('->', target.name, command.name);
        var form = this.createInputForm(command);
        var execute = form.querySelector('#execute');
        execute.addEventListener('click', this.submitCommand.bind(this, commandId, target));
        element.appendChild(form);
    }

    onSelectedCommandChanged(e) {
        var status = document.querySelector('.tab-bar > .item > #command');
        var commandId = null;
        var target = null;
        if (-1 != e.selectedIndex) {
            commandId = this.commandsListView.element.children[e.selectedIndex].command;
            target = this.commandsListView.element.children[e.selectedIndex].target;
            status.textContent = target.commands[commandId].name;
            status.parentElement.style.display = '';
        }
        else {
            status.textContent = '';
            status.parentElement.style.display = 'none';
        }
        this.updateOptionsView(commandId, target);
    }

    onSelectedClientChanged(e) {
        var status = document.querySelector('.tab-bar > .item > #client');
        var id = -1;
        if (-1 != e.selectedIndex) {
            id = this.processListView.element.children[e.selectedIndex].id;
            var client = this.clients[id];
            status.textContent = client.name + '.' + client.instance;
            status.parentElement.style.display = '';
        }
        else {
            status.textContent = '';
            status.parentElement.style.display = 'none';
        }
        this.updateCommandsView(id);
    }

    updateClientItem(client) {
        var id = client.name + '_' + client.instance;
        var online = 'connected' == client.state;

        var it = null;

        if (undefined == this.clients[id]) {
            this.clients[id] = client;

            it = ProcessListViewItem.create();
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

        it.name = client.name + '.' + client.instance + '.' + client.pid;
        it.online = online;

        if (online) {
            it.info = (new Date(client.when)).toLocaleTimeString('en-GB') + ': logged in';
        }
        else {
            it.info = (new Date(client.when)).toLocaleTimeString('en-GB') + ': (' + client.error.code + ') ' + client.error.reason;
        }

    }

    updateStatusBar() {
        var bg = this.online ? '#00cc00' : 'crimson';
        //var fg = this.online ? 'rgb(80,80,80)' : 'white';
        var fg = 'white';
        var status = document.querySelector('.tab-bar > .item > #status');
        status.textContent = this.online ? document.location.host : 'connecting...';
        status.style.color = fg;
        status.parentElement.style.backgroundColor = bg;
        document.querySelector('.tab-bar > .item > #connected').textContent = this.connectedClientsCount;
    }

    get connectedClientsCount() {
        var total = 0;
        var connected = 0;

        for (var id in this.clients) {
            ++total;
            if ('connected' == this.clients[id].state) {
                ++connected;
            }
        }
        return connected;
    }

    connect() {
        this.reset(false);

        this.websocket = new WebSocket('ws://' + document.location.host + '/user');

        this.websocket.onmessage = function(message) {
            try {
                var message = JSON.parse(message.data);
                var id = Object.keys(message)[0];

                if ('function' == typeof(this['on'+id])) {
                    this['on'+id](message[id]);
                }

                return;
            }
            catch (e) {
                console.log('unhandled:', message.data);
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
                document.querySelector('.tab-bar > .item > #status').textContent = 'offline';
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

    onclients(message) {
        console.debug('clients', message);

        for (var id in message) {
            this.updateClientItem(message[id]);
        }

        this.updateStatusBar();
    }

    onlogin(message) {
        console.debug('login', message);
        this.updateClientItem(message);
        this.updateStatusBar();
    }

    onwarning(message) {
        console.debug('warning', message);
        var id = message.source.name + '_' + message.source.instance;
        var element = this.processListView.element.querySelector('#'+id);
        var it = null;
        if (null != element) {
            it = new ProcessListViewItem(element);
            it.warning = true;
            it.info = (new Date(message.when)).toLocaleTimeString('en-GB') + ': ' + message.message;
        }
        if (null == it) {
            console.error('onwarning() failed: list view item with id "', '#'+id, '" not found');
        }
    }

    ondisconnect(message) {
        console.debug('disconnect', message);
        this.updateClientItem(message);
        this.updateStatusBar();
    }

}

window.addEventListener('load', function main() {
    const app = new Application();
});

