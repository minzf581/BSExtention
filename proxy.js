class ProxyManager {
    constructor(config) {
        this.config = config;
        this.activeConnections = new Map();
        this.stats = {
            bandwidthUsed: 0,
            connections: 0
        };
    }

    // 初始化代理设置
    async initialize() {
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: this.config.proxyHost,
                    port: parseInt(this.config.proxyPort)
                },
                bypassList: ["localhost"]
            }
        };

        try {
            await chrome.proxy.settings.set({
                value: config,
                scope: 'regular'
            });
            return true;
        } catch (error) {
            console.error('Failed to initialize proxy:', error);
            return false;
        }
    }

    // 处理HTTP请求
    async handleHttpRequest(request) {
        const connectionId = Math.random().toString(36).substring(7);
        this.activeConnections.set(connectionId, {
            startTime: Date.now(),
            bytesTransferred: 0
        });

        try {
            const response = await this.forwardRequest(request);
            this.updateStats(connectionId, response.byteLength);
            return response;
        } catch (error) {
            console.error('Error forwarding request:', error);
            throw error;
        } finally {
            this.activeConnections.delete(connectionId);
        }
    }

    // 转发请求到指定服务器
    async forwardRequest(request) {
        const headers = new Headers(request.headers);
        headers.append('X-Forwarded-For', request.ip);

        const response = await fetch(request.url, {
            method: request.method,
            headers: headers,
            body: request.body,
            credentials: 'include'
        });

        return response;
    }

    // 更新统计信息
    updateStats(connectionId, bytes) {
        const connection = this.activeConnections.get(connectionId);
        if (connection) {
            connection.bytesTransferred += bytes;
            this.stats.bandwidthUsed += bytes;
        }
        this.stats.connections = this.activeConnections.size;

        // 通知popup更新统计信息
        chrome.runtime.sendMessage({
            type: 'statsUpdate',
            data: this.stats
        });
    }

    // 停止代理
    async stop() {
        try {
            await chrome.proxy.settings.clear({
                scope: 'regular'
            });
            this.activeConnections.clear();
            this.stats = {
                bandwidthUsed: 0,
                connections: 0
            };
            return true;
        } catch (error) {
            console.error('Failed to stop proxy:', error);
            return false;
        }
    }

    // 获取当前统计信息
    getStats() {
        return this.stats;
    }
}

// 导出ProxyManager类
export default ProxyManager;
