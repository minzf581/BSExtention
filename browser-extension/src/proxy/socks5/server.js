const net = require('net');
const dgram = require('dgram');
const { EventEmitter } = require('events');

const SOCKS_VERSION = 0x05;
const AUTHENTICATION_METHODS = {
    NO_AUTH: 0x00
};

const COMMANDS = {
    CONNECT: 0x01,
    BIND: 0x02,
    UDP_ASSOCIATE: 0x03
};

const ADDRESS_TYPES = {
    IPV4: 0x01,
    DOMAIN: 0x03,
    IPV6: 0x04
};

const RESPONSES = {
    SUCCESS: 0x00,
    GENERAL_FAILURE: 0x01,
    CONNECTION_NOT_ALLOWED: 0x02,
    NETWORK_UNREACHABLE: 0x03,
    HOST_UNREACHABLE: 0x04,
    CONNECTION_REFUSED: 0x05,
    TTL_EXPIRED: 0x06,
    COMMAND_NOT_SUPPORTED: 0x07,
    ADDRESS_TYPE_NOT_SUPPORTED: 0x08
};

class Socks5Server extends EventEmitter {
    constructor(options = {}) {
        super();
        this.port = options.port || 0;
        this.host = options.host || '127.0.0.1';
        this.server = null;
        this.udpServer = null;
        this.udpSessions = new Map();
    }

    start() {
        return new Promise((resolve, reject) => {
            this.server = net.createServer((socket) => {
                this.handleConnection(socket);
            });

            this.server.on('error', (err) => {
                this.emit('error', err);
                reject(err);
            });

            this.server.listen(this.port, this.host, () => {
                const address = this.server.address();
                this.emit('listening', address);
                resolve(address);
            });
        });
    }

    async handleConnection(socket) {
        try {
            await this.handleAuthentication(socket);
            await this.handleRequest(socket);
        } catch (err) {
            this.emit('error', err);
            socket.destroy();
        }
    }

    async handleAuthentication(socket) {
        const version = await this.readByte(socket);
        if (version !== SOCKS_VERSION) {
            throw new Error('Unsupported SOCKS version');
        }

        const methodCount = await this.readByte(socket);
        const methods = await this.readBytes(socket, methodCount);

        // 目前只支持无认证方式
        socket.write(Buffer.from([SOCKS_VERSION, AUTHENTICATION_METHODS.NO_AUTH]));
    }

    async handleRequest(socket) {
        const version = await this.readByte(socket);
        if (version !== SOCKS_VERSION) {
            throw new Error('Invalid SOCKS version');
        }

        const command = await this.readByte(socket);
        await this.readByte(socket); // Reserved byte
        const addressType = await this.readByte(socket);

        const address = await this.readAddress(socket, addressType);
        const port = await this.readPort(socket);

        switch (command) {
            case COMMANDS.CONNECT:
                await this.handleConnect(socket, address, port);
                break;
            case COMMANDS.UDP_ASSOCIATE:
                await this.handleUdpAssociate(socket, address, port);
                break;
            default:
                this.sendResponse(socket, RESPONSES.COMMAND_NOT_SUPPORTED);
                socket.destroy();
        }
    }

    async handleConnect(socket, address, port) {
        try {
            const target = net.createConnection(port, address);

            target.on('connect', () => {
                this.sendResponse(socket, RESPONSES.SUCCESS, target.localAddress, target.localPort);
                socket.pipe(target);
                target.pipe(socket);
            });

            target.on('error', (err) => {
                this.sendResponse(socket, RESPONSES.GENERAL_FAILURE);
                socket.destroy();
            });

            socket.on('close', () => {
                target.destroy();
            });

            target.on('close', () => {
                socket.destroy();
            });
        } catch (err) {
            this.sendResponse(socket, RESPONSES.GENERAL_FAILURE);
            socket.destroy();
        }
    }

    async handleUdpAssociate(socket, address, port) {
        try {
            const udpServer = dgram.createSocket('udp4');

            udpServer.on('error', (err) => {
                this.emit('error', err);
                socket.destroy();
            });

            await new Promise((resolve) => {
                udpServer.bind(0, '0.0.0.0', () => {
                    const addr = udpServer.address();
                    this.sendResponse(socket, RESPONSES.SUCCESS, addr.address, addr.port);
                    resolve();
                });
            });

            const session = {
                udpServer,
                clientAddress: null,
                targetAddress: null
            };

            udpServer.on('message', (msg, rinfo) => {
                this.handleUdpMessage(session, msg, rinfo);
            });

            socket.on('close', () => {
                udpServer.close();
                this.udpSessions.delete(socket);
            });

            this.udpSessions.set(socket, session);

            // 保持TCP连接直到客户端断开
            socket.on('data', () => {});
        } catch (err) {
            this.sendResponse(socket, RESPONSES.GENERAL_FAILURE);
            socket.destroy();
        }
    }

    handleUdpMessage(session, msg, rinfo) {
        try {
            // 解析SOCKS5 UDP请求头
            let offset = 0;
            offset += 2; // RSV
            const frag = msg[offset++];
            if (frag !== 0) {
                // 暂不支持分片
                return;
            }

            const atyp = msg[offset++];
            let targetAddress;
            switch (atyp) {
                case ADDRESS_TYPES.IPV4:
                    targetAddress = msg.slice(offset, offset + 4).join('.');
                    offset += 4;
                    break;
                case ADDRESS_TYPES.DOMAIN:
                    const domainLength = msg[offset++];
                    targetAddress = msg.slice(offset, offset + domainLength).toString();
                    offset += domainLength;
                    break;
                case ADDRESS_TYPES.IPV6:
                    // 简化的IPv6地址处理
                    targetAddress = msg.slice(offset, offset + 16)
                        .toString('hex')
                        .match(/.{1,4}/g)
                        .join(':');
                    offset += 16;
                    break;
                default:
                    return;
            }

            const targetPort = msg.readUInt16BE(offset);
            offset += 2;

            const data = msg.slice(offset);

            if (!session.clientAddress) {
                session.clientAddress = rinfo;
            }

            // 转发数据到目标地址
            session.udpServer.send(data, targetPort, targetAddress, (err) => {
                if (err) {
                    this.emit('error', err);
                }
            });
        } catch (err) {
            this.emit('error', err);
        }
    }

    sendResponse(socket, status, bindAddr = '0.0.0.0', bindPort = 0) {
        const response = Buffer.alloc(10);
        response[0] = SOCKS_VERSION;
        response[1] = status;
        response[2] = 0x00; // Reserved
        response[3] = ADDRESS_TYPES.IPV4;

        // Bind address
        const addr = bindAddr.split('.').map(Number);
        response[4] = addr[0];
        response[5] = addr[1];
        response[6] = addr[2];
        response[7] = addr[3];

        // Bind port
        response.writeUInt16BE(bindPort, 8);

        socket.write(response);
    }

    async readByte(socket) {
        const buffer = await this.readBytes(socket, 1);
        return buffer[0];
    }

    readBytes(socket, length) {
        return new Promise((resolve, reject) => {
            socket.once('readable', () => {
                const buffer = socket.read(length);
                if (buffer) {
                    resolve(buffer);
                } else {
                    reject(new Error('Connection closed'));
                }
            });
        });
    }

    async readAddress(socket, type) {
        switch (type) {
            case ADDRESS_TYPES.IPV4:
                const ipv4 = await this.readBytes(socket, 4);
                return ipv4.join('.');
            case ADDRESS_TYPES.DOMAIN:
                const length = await this.readByte(socket);
                const domain = await this.readBytes(socket, length);
                return domain.toString();
            case ADDRESS_TYPES.IPV6:
                const ipv6 = await this.readBytes(socket, 16);
                return ipv6.toString('hex')
                    .match(/.{1,4}/g)
                    .join(':');
            default:
                throw new Error('Unsupported address type');
        }
    }

    async readPort(socket) {
        const buffer = await this.readBytes(socket, 2);
        return buffer.readUInt16BE(0);
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.udpSessions.forEach((session) => {
                    session.udpServer.close();
                });
                this.udpSessions.clear();

                this.server.close(() => {
                    this.server = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = Socks5Server;
