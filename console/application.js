// $Id: application.js 465 2017-06-09 05:42:30Z superuser $

class Application
{
    constructor() {
        this.clients = {};

        this.processListView = new ListView(document.querySelector('#apps > .list-view'));
        this.processListView.addEventListener('change', this.onSelectedClientChanged.bind(this));

        this.commandsListView = new ListView(document.querySelector('#commands > .list-view'));

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
                it.bind(command, id);
                this.commandsListView.add(it);
            }
        }
    }

    onSelectedClientChanged(e) {
        var id = -1;
        if (-1 != e.selectedIndex) {
            id = this.processListView.element.children[e.selectedIndex].id;
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
            it.info = (new Date(client.when)).toLocaleTimeString() + ': logged in';
        }
        else {
            it.info = (new Date(client.when)).toLocaleTimeString() + ': (' + client.error.code + ') ' + client.error.reason;
        }

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

        this.ws.onclose = function() {
            console.log('disconnected');

            this.reset(false);

            if (this.reconnectAttemptCount++ < this.reconnectAttemptsMax) {
                window.setTimeout(function() {
                    this.connect();
                }.bind(this), this.reconnectTimeout);
            }
            else {
                console.error('failed to reconnect');
                document.querySelector('#status-bar > .item > #status').textContent = 'POWERED OFF';
            }

        }.bind(this);

        this.ws.onerror = function(e) {
            console.error(e);
        }.bind(this);
    }

    reset(online) {
        this.online = online;
        this.clients = {};
        this.processListView.clear();
        this.updateStatusBar();
    }

    updateStatusBar() {
        var bg = this.online ? '#00cc00' : 'crimson';
        //var fg = this.online ? 'rgb(80,80,80)' : 'white';
        var fg = 'white';
        var status = document.querySelector('#status-bar > .item > #status');
        status.textContent = this.online ? 'online' : 'offline';
        status.style.color = fg;
        status.parentElement.style.backgroundColor = bg;
        document.querySelector('#status-bar > .item > #connected').textContent = this.connectedClientsCount;
    }

    onclients(message) {
        console.debug('clients', message);

        for (var id in message) {
            this.updateClientItem(message[id]);
        }

        this.updateStatusBar();
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

