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

const fs = require('fs');
const path = require('path');
const util = require('util');

const HTTP = require('http');
const WebSocket = require('ws');
const EventEmitter = require('events');

const schema = require('./schema');
const config = require('./config');

const clients = {};
const channels = {};
const panic = {
    last: 0,
    messages: []
};

class EventSource extends EventEmitter
{
    constructor(args) {
        super();
        this.setMaxListeners(0);
        this.cache = {};
        const options = args || { history: 0, name: 'unnamed'};
        this.name = options.name;
        this.cache_max = options.history || 0;
    }

    notify(type, event) {
        if (0 < this.cache_max) {
            if (undefined == this.cache[type]) {
                this.cache[type] = [];
            }
            const history = this.cache[type];
            while (history.length >= this.cache_max) {
                history.shift();
            }
            history.push(event);
        }
        this.emit.apply(this, arguments);
    }

    history(type) {
        if (0 == this.cache_max) {
            return [];
        }
        if (undefined == this.cache[type]) {
            return [];
        }
        return this.cache[type];
    }

    // need this to be able get the stable handler reference to unsubscribe later
    subscribe(type, target, method, snapshot) {
        let handler = null;

        if (null != target) {
            handler = method.bind(target);
            target['on' + type.split('@')[0]] = handler;
        }
        else {
            handler = method;
        }

        const history = this.history(type);

        if (0 < history.length) {
            if (snapshot && 1 < history.length) {
                handler(history);
            }
            else {
                history.forEach((e) => {
                    handler(e);
                });
            }
        }

        this.on(type, handler);
    }

    unsubscribe(type, handler, purge) {
        this.removeListener(type, handler);

        if (purge) {
            //console.log("purging data cache channel '" + this.name + "', event type '" + type + "'");
            if (-1 != type.indexOf('@')) {
                if (undefined != this.cache[type]) {
                    this.cache[type].length = 0;
                    delete this.cache[type];
                }
            }
        }
    }
}

const user = new EventSource({ name: 'user' });
const api = new EventSource({ name: 'api' });

class MessageHandler
{
    constructor(socket) {
        if (!MessageHandler.hasOwnProperty('_counter')) {
            MessageHandler._counter = 0;
        }

        this._id = ++MessageHandler._counter;

        socket.on('message', (message) => { this.onmessage(socket, message); });
        socket.on('close', (code, reason) => { this.onclose(socket, code, reason); });
        socket.on('error', (error) => { this.onerror(error); });

        this.send = (message) => {
            if (!this.connected) return;
            socket.send(JSON.stringify(message), (error) => {
                if (error) {
                    console.error('websocket: failed to send <', message, '>', ' error: ', error);
                }
            });
        }

        this.connected = true;
    }

    get id() {
        return this._id;
    }

    onmessage(socket, buffer) {
        try {
            const message = JSON.parse(buffer);
            const id = Object.keys(message)[0];
            if ('function' == typeof(this['on'+id])) {
                // timestamp the incoming message
                if (!message[id].hasOwnProperty('when')) {
                    message[id].when = Date.now();
                }
                else {
                    message[id].when = parseInt(message[id].when);
                }
                this['on'+id](message[id]);
            }
            else {
                console.log("unhandled: '%s'", buffer);
            }
        }
        catch (e) {
            console.error('failed to process incoming message', buffer, ': ', e);
        }
    }

    onclose(socket, code, reason) {
        this.connected = false;
        //console.log('websocket: close: (%d) %s', code, reason);
        this.finalize();
    }

    onerror(error) {
        this.connected = false;
        console.error('websocket: error: ', error);
        this.finalize();
    }

    finalize() {
    }
}

class ApiMessageHandler extends MessageHandler
{
    constructor(socket) {
        super(socket);
        api.subscribe('command', this, this.oncommand);
    }

    onclose(socket, code, reason) {
        const client = clients[this.clientId];

        client.status = {
            type: 'offline',
            when: Date.now(),
            text: reason || 'disconnected'
        };

        const event = {
            type: client.status.type,
            text: client.status.text,
            when: client.status.when,
            source: {
                name: client.name,
                instance: client.instance
            }
        };

        user.notify('status', event);

        super.onclose(socket, code, reason);
    }

    onlogin(message) {
        const login = message;

        this.clientId = login.name + '.' + login.instance;
        clients[this.clientId] = login;

        login.commands = schema.commands[login.name] || {};
        login.channels = schema.channels[login.name] || {};

        if (!channels.hasOwnProperty(this.clientId)) {
            channels[this.clientId] = {};
            const hub = channels[this.clientId];
            for (let topic in login.channels) {
                //console.log(login.channels[topic].history);
                hub[topic] = new EventSource({
                    name: topic,
                    history: login.channels[topic].hasOwnProperty('columns') ? 1 : login.channels[topic].history
                });
            }
        }

        login.status = {
            type: 'info',
            text: 'started',
            when: parseInt(message.timestamp)
        };

        user.notify('login', message);
    }

    onschema(message)
    {
        console.log('schema', JSON.stringify(message));
    }

    onpush(message) {
        const channel = channels[this.clientId][message.channel];
        if (channel) {
            const client = clients[this.clientId];

            let topic = 'update' + ((0 < message.port) ? ('@' + message.port) : '');

            channel.notify(topic, {
                channel: message.channel,
                port: message.port,
                event: message.event,
                source: {
                    name: client.name,
                    instance: client.instance
                },
                when: message.when
            });
        }
        else {
            console.log('Failed to dispatch push notification from', this.clientId, ':', JSON.stringify(message));
        }
    }

    onstatus(message) {
        const client = clients[this.clientId];

        if ('panic' == message.type) {
            ++panic.last;

            const event = {
                id: panic.last,
                text: message.text,
                source: {
                    name: client.name,
                    instance: client.instance
                },
                when: message.when
            };

            panic.messages.push(event);
            user.notify('panic', event);

            return;
        }
        else {
            client.status = message;

            user.notify('status', {
                type: message.type,
                text: message.text,
                source: {
                    name: client.name,
                    instance: client.instance
                },
                when: message.when
            });
        }
    }

    oncommand(event) {
        if (this.clientId != event.clientId) return;

        const message = {};

        message[event.id] = {
            head: {
                port: event.port,
                when: event.when
            },
            body: event.arguments
        };

        this.send(message);
    }

    finalize() {
        api.unsubscribe('command', this.oncommand);
        super.finalize();
    }
}

class UserMessageHandler extends MessageHandler
{
    constructor(socket) {
        super(socket);

        this.topic = null;

        this.onupdate = this.onupdate.bind(this);

        user.subscribe('login', this, this.onlogin);
        user.subscribe('status', this, this.onstatus);

        if (0 < panic.messages.length) {
            this.onpanic(panic.messages[panic.messages.length - 1]);
        }

        user.subscribe('panic', this, this.onpanic);

        const message = { 'snapshot' : clients };
        this.send(message);
    }

    get connection() {
        return channels[this.topic.name + '.' + this.topic.instance][this.topic.channel];
    }

    onunsubscribe(purge) {
        //console.log('unsubscribe');
        if (null != this.topic) {
            this.connection.unsubscribe('update@' + this.id, this.onupdate, true == purge);
            this.connection.unsubscribe('update', this.onupdate);
            this.topic = null;
        }
    }

    onsubscribe(message) {
        //console.log(JSON.stringify(message));
        if (null != this.topic) {
            if (this.topic.channel != message.channel || this.topic.instance != message.instance || this.topic.name != message.name) {
                this.onunsubscribe();
                this.topic = message;
                this.connection.subscribe('update', null, this.onupdate, true);
                this.connection.subscribe('update@' + this.id, null, this.onupdate, true);
            }
        }
        else {
            this.topic = message;
            this.connection.subscribe('update', null, this.onupdate, true);
            this.connection.subscribe('update@' + this.id, null, this.onupdate, true);
        }
    }

    oncommand(message) {
        message.port = this.id;
        api.notify('command', message);
    }

    onunpanic(message) {
        if (0 < panic.messages.length && message.id == panic.messages[panic.messages.length - 1].id) {
            panic.messages.pop();

            if (0 < panic.messages.length) {
                user.notify('panic', panic.messages[panic.messages.length - 1]);
            }
            else {
                user.notify('panic', {});
            }
        }
    }

    onupdate(event) {
        const message = { update: event };
        this.send(message);
    }

    onlogin(event) {
        const message = { login: event };
        this.send(message);
    }

    onstatus(event) {
        const message = { status: event };
        this.send(message);
    }

    onpanic(event) {
        const message = { panic: event };
        this.send(message);
    }

    finalize() {
        this.onunsubscribe(true);
        user.unsubscribe('login', this.onlogin);
        user.unsubscribe('status', this.onstatus);
        user.unsubscribe('panic', this.onstatus);
        super.finalize();
    }

}

var application = new class Application
{
    constructor() {

        this.httpServer = HTTP.createServer((request, response) => {
            this.onHttpRequest(request, response);
        });

        this.webSocketServer = new WebSocket.Server({server: this.httpServer});

        this.webSocketServer.on('connection', (socket, request) => {
            this.onWebSocketConnect(socket, request);
        });

        this.httpServer.listen(config.http.port, () => {
            console.log('HTTP server listening on port %d', this.httpServer.address().port);
        });

    }

    onWebSocketConnect(socket, request) {
        //console.log("websocket: accepted new connection. url: '%s'", request.url);
        switch (request.url) {
            case '/api': new ApiMessageHandler(socket); break;
            case '/user': new UserMessageHandler(socket); break;
            default: socket.close(3404, 'bad endpoint "' + request.url + '"');
        }
    }

    sendFile(fname, stat, response) {
        const file = fs.createReadStream(fname);
        response.writeHead(200, { 
            'Content-Length': stat.size
        });
        file.pipe(response);
    }

    notFound(response) {
        response.writeHead(404);
        response.end();
    }

    forbidden(response) {
        response.writeHead(403);
        response.end();
    }

    onHttpRequest(request, response) {
        let url = request.url == '/' ? '/index.html' : request.url;

        if (-1 != url.search(/\.\./)) {
            console.error('forbidden "%s"', url);
            return this.forbidden(response);
        }

        const fname = path.join(__dirname, '/public', url);

        if (fs.existsSync(fname)) {
            const stat = fs.statSync(fname);
            if (stat.isDirectory()) {
                console.error('forbidden "%s"', url);
                return this.forbidden(response);
            }
            if (stat.isFile()) {
                return this.sendFile(fname, stat, response);
            }
        }

        console.error('not found "%s"', url);
        return this.notFound(response);
    }

}
