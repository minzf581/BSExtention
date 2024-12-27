const WebSocket = require('ws');
const ProxySocks5 = require('./socks5');
const { EventEmitter } = require('events');

class ProxyManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.wsClient = null;
        this.socks5Server = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
        this.reconnectDelay = options.reconnectDelay || 5000;
    }

    async start() {
        try {
            // 启动SOCKS5服务器
            this.socks5Server = new ProxySocks5({
                port: this.options.socks5Port || 0,
                host: '127.0.0.1'
            });

            this.socks5Server.on('ready', (address) => {
                this.emit('socks5-ready', address);
                this.connectWebSocket();
            });

            this.socks5Server.on('error', (err) => {
                this.emit('error', err);
            });

            await this.socks5Server.start();
        } catch (err) {
            this.emit('error', err);
            throw err;
        }
    }

    connectWebSocket() {
        if (this.wsClient) {
            return;
        }

        this.wsClient = new WebSocket(this.options.serverUrl);

        this.wsClient.on('open', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');

            // 发送初始化消息
            this.sendMessage({
                type: 'INIT',
                deviceId: this.options.deviceId,
                socks5Port: this.socks5Server.getAddress().port
            });

            // 开始发送心跳
            this.startHeartbeat();
        });

        this.wsClient.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (err) {
                this.emit('error', err);
            }
        });

        this.wsClient.on('close', () => {
            this.isConnected = false;
            this.emit('disconnected');
            this.handleReconnect();
        });

        this.wsClient.on('error', (err) => {
            this.emit('error', err);
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'PONG':
                // 处理心跳响应
                break;
            case 'POINTS_UPDATE':
                this.emit('points-update', message.pointsInfo);
                break;
            default:
                this.emit('message', message);
        }
    }

    sendMessage(message) {
        if (this.isConnected && this.wsClient) {
            this.wsClient.send(JSON.stringify(message));
        }
    }

    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.sendMessage({
                    type: 'PING',
                    timestamp: Date.now()
                });
            }
        }, this.options.heartbeatInterval || 30000);
    }

    handleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(
                this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
                60000
            );

            this.reconnectTimer = setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            this.emit('max-reconnect-attempts');
        }
    }

    async stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
        }

        if (this.socks5Server) {
            await this.socks5Server.stop();
            this.socks5Server = null;
        }

        this.isConnected = false;
        this.reconnectAttempts = 0;
    }
}

module.exports = ProxyManager;
