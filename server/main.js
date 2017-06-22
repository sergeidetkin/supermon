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
const HTTP = require('http');
const WebSocket = require('ws');
const EventEmitter = require('events');
const schema = require('./schema');
const util = require('util');
const config = require('./config');

const clients = {};
const channels ={};

class EventSource extends EventEmitter
{
    constructor(args) {
        super();
        this.cache = {};
        const options = args || { history: 0 };
        this.cache_max = options.history || 0;
    }

    notify() {
        if (0 < this.cache_max) {
            const type = arguments[0];
            if (undefined == this.cache[type]) {
                this.cache[type] = [];
            }
            const history = this.cache[type];
            while (history.length >= this.cache_max) {
                history.shift();
            }
            history.push(arguments[1]);
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
    subscribe(event, target, handler) {
        let f = handler.bind(target);
        target['on'+event] = f;
//        this.history(event).forEach((e) => {
//            f(e);
//        });
        const hist = this.history(event);
        if (0 < hist.length) {
            f(this.history(event));
        }
        this.on(event, f);
    }

    unsubscribe(event, handler) {
        this.removeListener(event, handler);
    }
}

const user = new EventSource();
const api = new EventSource();

class MessageHandler
{
    constructor(socket) {
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

    onmessage(socket, buffer) {
        try {
            const message = JSON.parse(buffer);
            const id = Object.keys(message)[0];
            if ('function' == typeof(this['on'+id])) {
                // timestamp the incoming message
                message[id].when = Date.now();
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
                hub[topic] = new EventSource({ history: login.channels[topic].history });
            }
        }

        login.status = {
            type: 'info',
            text: 'started',
            when: parseInt(message.timestamp)
        };

        user.notify('login', message);
    }

    onpush(message) {
        const channel = channels[this.clientId][message.channel];
        if (channel) {
            const client = clients[this.clientId];

            channel.notify('update', {
                channel: message.channel,
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
        client.status = message;

        user.notify('status', {
            status: message.status,
            source: {
                name: client.name, 
                instance: client.instance 
            }
        });
    }

    oncommand(event) {
        if (this.clientId != event.clientId) return;
        const message = {};
        message[event.id] = event.arguments;
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

        user.subscribe('login', this, this.onlogin);
        user.subscribe('status', this, this.onstatus);

        const message = { "snapshot" : clients };
        this.send(message);
    }

    onunsubscribe() {
        //console.log('unsubscribe');
        if (null != this.topic) {
            channels[this.topic.name + '.' + this.topic.instance][this.topic.channel].unsubscribe('update', this.onupdate);
            this.topic = null;
        }
    }

    onsubscribe(message) {
        //console.log(JSON.stringify(message));
        if (null != this.topic) {
            if (this.topic.channel != message.channel || this.topic.instance != message.instance || this.topic.name != message.name) {
                this.onunsubscribe();
                this.topic = message;
                channels[this.topic.name + '.' + this.topic.instance][this.topic.channel].subscribe('update', this, this.onupdate);
            }
        }
        else {
            this.topic = message;
            channels[this.topic.name + '.' + this.topic.instance][this.topic.channel].subscribe('update', this, this.onupdate);
        }
    }

    oncommand(message) {
        api.notify('command', message);
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
        const client = clients[event.source.name + '.' + event.source.instance];
        if (undefined == client) {
            console.log('failed to locate the source for:', JSON.stringify(event));
            return;
        }

        const message = {
            status: {
                status: client.status,
                source: event.source
            }
        };
        this.send(message);
    }

    finalize() {
        this.onunsubscribe();
        user.unsubscribe('login', this.onlogin);
        user.unsubscribe('status', this.onstatus);
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
