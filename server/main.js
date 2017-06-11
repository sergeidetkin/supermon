// $Id: main.js 472 2017-06-11 23:05:45Z superuser $

const fs = require('fs');
const path = require('path');
const HTTP = require('http');
const WebSocket = require('ws');
const EventEmitter = require('events');
const schema = require('./schema');
const util = require('util');

const clients = {};

class EventSource extends EventEmitter
{
    notify() {
        this.emit.apply(this, arguments);
    }

    subscribe(self, event, handler) {
        let f = handler.bind(self);
        self['on'+event] = f;
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
            socket.send(message, (error) => {
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
        client.when = Date.now();

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
        login.when = Date.now();

        this.clientId = login.name + '.' + login.instance;
        clients[this.clientId] = login;

        login.state = 'connected';
        //console.log(util.inspect(schema, false, null));
        login.commands = schema.commands[login.name];

        user.notify('login', message);

        //this.ping();
    }

    onwarning(message) {
        const client = clients[this.clientId];
        const warning = message;
        warning.when = Date.now();
        warning.source = { name: client.name, instance: client.instance };
        user.notify('warning', message);
    }

    oncommand(event) {
        if (this.clientId != event.clientId) return;
        const message = {};
        message[event.id] = event.arguments;
        this.send(JSON.stringify(message));
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

        user.subscribe(this, 'login', this.onlogin);
        user.subscribe(this, 'disconnect', this.ondisconnect);
        user.subscribe(this, 'warning', this.onwarning);

        const message = { "clients" : clients };
        this.send(JSON.stringify(message));
    }

    onlogin(event) {
        const message = { login: event };
        this.send(JSON.stringify(message));
    }

    ondisconnect(event) {
        const message = { disconnect: event };
        this.send(JSON.stringify(message));
    }

    oncommand(event) {
        api.notify('command', event);
    }

    onwarning(event) {
        const message = { warning: event };
        this.send(JSON.stringify(message));
    }

    finalize() {
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

    sendSchema(response) {
        var json = JSON.stringify(schema);
        response.writeHead(200, {
            'Content-Length': json.length,
            'Content-Type': 'application/json'
        });
        response.write(json);
        response.end();
    }

    onHttpRequest(request, response) {
        let url = request.url == '/' ? '/index.html' : request.url;

        if (-1 != url.search(/\.\./)) {
            console.error('forbidden "%s"', url);
            return this.forbidden(response);
        }

//        if ('/schema' == url) {
//            return this.sendSchema(response);
//        }

        const fname = path.join(__dirname, '/../html', url);

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
