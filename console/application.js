// $Id: application.js 469 2017-06-10 11:56:24Z superuser $

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
                var command = client.commands[key];
                var it = CommandListViewItem.create();
                it.bind(command, client);
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

        for (var key in command.options) {
            var option = command.options[key];
            var row = table.insertRow();
            var cell = row.insertCell();
            cell.textContent = option.name;
            cell = row.insertCell();
            if (undefined == option.values || 0 == option.values.length) {
                var input = document.createElement('input');
                cell.appendChild(input);
            }
            else {
                var select = document.createElement('select');
                for (var n = 0; n < option.values.length; ++n) {
                    var v = option.values[n];
                    var o = document.createElement('option');
                    o.text = v.name;
                    o.value = v.value;
                    select.add(o);
                }
                cell.appendChild(select);
            }
        }

        form.appendChild(table);

        div = document.createElement('div');
        var button = document.createElement('input');
        button.type = 'button';
        button.value = 'Execute';
        div.appendChild(button);

        form.appendChild(div);

        return form;
    }

    updateOptionsView(command, target) {
        var element = document.querySelector('#input');
        if (element.firstElementChild) {
            element.removeChild(element.firstElementChild);
        }
        if (null == command || null == target) {
            return;
        }
        console.log('->', target.name, command.name);
        var form = this.createInputForm(command);
        element.appendChild(form);
    }

    onSelectedCommandChanged(e) {
        var status = document.querySelector('#status-bar > .item > #command');
        var command = null;
        var target = null;
        if (-1 != e.selectedIndex) {
            command = this.commandsListView.element.children[e.selectedIndex].command;
            target = this.commandsListView.element.children[e.selectedIndex].target;
            status.textContent = command.name;
            status.parentElement.style.display = '';
        }
        else {
            status.textContent = '';
            status.parentElement.style.display = 'none';
        }
        this.updateOptionsView(command, target);
    }

    onSelectedClientChanged(e) {
        var status = document.querySelector('#status-bar > .item > #client');
        var id = -1;
        if (-1 != e.selectedIndex) {
            id = this.processListView.element.children[e.selectedIndex].id;
            status.textContent = this.clients[id].name;
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
        var status = document.querySelector('#status-bar > .item > #status');
        status.textContent = this.online ? document.location.host : 'connecting...';
        status.style.color = fg;
        status.parentElement.style.backgroundColor = bg;
        document.querySelector('#status-bar > .item > #connected').textContent = this.connectedClientsCount;
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

        this.ws = new WebSocket('ws://' + document.location.host + '/user');

        this.ws.onmessage = function(e) {
            try {
                var message = JSON.parse(e.data);
                var id = Object.keys(message)[0];

                if ('function' == typeof(this['on'+id])) {
                    this['on'+id](message[id]);
                }

                return;
            }
            catch (ex) {
                console.log('unhandled:', e.data);
            }
        }.bind(this);

        this.ws.onopen = function() {
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
                document.querySelector('#status-bar > .item > #status').textContent = 'offline';
            }
            
        }.bind(this);

        this.ws.onclose = reconnect;
        this.ws.onerror = reconnect;
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

    ondisconnect(message) {
        console.debug('disconnect', message);
        this.updateClientItem(message);
        this.updateStatusBar();
    }

}

window.addEventListener('load', function main() {
    const app = new Application();
});

