const Socks5Server = require('./server');
const { EventEmitter } = require('events');

class ProxySocks5 extends EventEmitter {
    constructor(options = {}) {
        super();
        this.server = null;
        this.options = options;
    }

    async start() {
        if (this.server) {
            return;
        }

        try {
            this.server = new Socks5Server(this.options);

            this.server.on('error', (err) => {
                this.emit('error', err);
            });

            this.server.on('listening', (address) => {
                this.emit('ready', address);
            });

            await this.server.start();
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    async stop() {
        if (this.server) {
            await this.server.stop();
            this.server = null;
        }
    }

    getAddress() {
        return this.server ? this.server.server.address() : null;
    }
}

module.exports = ProxySocks5;
