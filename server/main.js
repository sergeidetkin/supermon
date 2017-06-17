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

const clients = {};
const channels ={};

class EventSource extends EventEmitter
{
    notify() {
        //console.log('notify', this.listenerCount(arguments[0]), 'listeners', arguments[1]);
        this.emit.apply(this, arguments);
    }

    subscribe(self, event, handler) {
        let f = handler.bind(self);
        self['on'+event] = f;
        this.on(event, f);
        //console.log('subscribed for', event);
    }

    unsubscribe(event, handler) {
        this.removeListener(event, handler);
        //console.log('unsubscribed from', event);
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
        api.subscribe(this, 'command', this.oncommand);
    }

    onclose(socket, code, reason) {
        const client = clients[this.clientId];
        //client.when = Date.now();

        client.state = 'disconnected';
        client.error = { code: code, reason: reason || 'killed' };

        user.notify('disconnect', client);

        //delete clients[this.clientId];
        //console.log(clients);

        super.onclose(socket, code, reason);
    }

    ping() {
        if (this.connected) {
            this.send('hello!');
            setTimeout(() => {
                this.ping();
            }, 3000);
        }
    }

    onlogin(message) {
        const login = message;
        //login.when = Date.now();

        this.clientId = login.name + '.' + login.instance;
        clients[this.clientId] = login;

        login.state = 'connected';
        //console.log(util.inspect(schema, false, null));
        login.commands = schema.commands[login.name];
        login.channels = schema.channels[login.name];

        if (!channels.hasOwnProperty(this.clientId)) {
            channels[this.clientId] = {};
            let hub = channels[this.clientId];
            for (let topic in login.channels) {
                hub[topic] = new EventSource();
            }
        }

        user.notify('login', message);

        //this.ping();
    }

    onpush(message) {
        const channel = channels[this.clientId][message.channel];
        if (channel) {
            message.event.when = message.when;
            channel.notify('update', message.event);
        }
    }

    onwarning(message) {
        const client = clients[this.clientId];
        const warning = message;
        //warning.when = Date.now();
        warning.source = { name: client.name, instance: client.instance };
        user.notify('warning', message);
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

        user.subscribe(this, 'login', this.onlogin);
        user.subscribe(this, 'disconnect', this.ondisconnect);
        user.subscribe(this, 'warning', this.onwarning);

        const message = { "clients" : clients };
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
                channels[this.topic.name + '.' + this.topic.instance][this.topic.channel].subscribe(this, 'update', this.onupdate);
            }
        }
        else {
            this.topic = message;
            channels[this.topic.name + '.' + this.topic.instance][this.topic.channel].subscribe(this, 'update', this.onupdate);
        }
    }

    onupdate(event) {
        //console.log(JSON.stringify(event));
        const message = { update: event };
        this.send(message);
    }

    onlogin(event) {
        const message = { login: event };
        this.send(message);
    }

    ondisconnect(event) {
        const message = { disconnect: event };
        this.send(message);
    }

    oncommand(event) {
        api.notify('command', event);
    }

    onwarning(event) {
        const message = { warning: event };
        this.send(message);
    }

    finalize() {
        this.onunsubscribe();
        user.unsubscribe('login', this.onlogin);
        user.unsubscribe('disconnect', this.ondisconnect);
        user.unsubscribe('warning', this.onwarning);
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

        this.httpServer.listen(8080, () => {
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
