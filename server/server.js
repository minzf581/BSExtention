require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');
const cors = require('cors');
const httpProxy = require('http-proxy');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const proxy = httpProxy.createProxyServer();

// 数据库连接配置
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// 存储在线插件信息
const onlineExtensions = new Map();

app.use(cors());
app.use(express.json());

// WebSocket连接处理
wss.on('connection', async (ws, req) => {
    const extensionId = uuidv4();
    const clientIp = req.socket.remoteAddress;
    
    // 记录新连接的插件
    onlineExtensions.set(extensionId, {
        ws,
        ip: clientIp,
        connectedAt: new Date(),
        lastHeartbeat: new Date(),
        proxyRequests: 0
    });

    // 记录插件连接到数据库
    try {
        await pool.query(
            'INSERT INTO extension_connections (extension_id, ip_address, connected_at) VALUES ($1, $2, $3)',
            [extensionId, clientIp, new Date()]
        );
    } catch (error) {
        console.error('Database error:', error);
    }

    // 处理来自插件的消息
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'heartbeat':
                    handleHeartbeat(extensionId);
                    break;
                case 'proxy_response':
                    handleProxyResponse(data, extensionId);
                    break;
                case 'stats_update':
                    updateExtensionStats(extensionId, data.stats);
                    break;
            }
        } catch (error) {
            console.error('Message handling error:', error);
        }
    });

    // 处理连接关闭
    ws.on('close', async () => {
        const extension = onlineExtensions.get(extensionId);
        if (extension) {
            const duration = new Date() - extension.connectedAt;
            try {
                await pool.query(
                    'UPDATE extension_connections SET disconnected_at = $1, duration = $2 WHERE extension_id = $3',
                    [new Date(), duration, extensionId]
                );
            } catch (error) {
                console.error('Database error on close:', error);
            }
            onlineExtensions.delete(extensionId);
        }
    });

    // 发送当前版本信息
    ws.send(JSON.stringify({
        type: 'version_check',
        version: process.env.EXTENSION_VERSION
    }));
});

// 处理心跳
function handleHeartbeat(extensionId) {
    const extension = onlineExtensions.get(extensionId);
    if (extension) {
        extension.lastHeartbeat = new Date();
        extension.ws.send(JSON.stringify({ type: 'heartbeat_response' }));
    }
}

// 处理代理响应
function handleProxyResponse(data, extensionId) {
    const extension = onlineExtensions.get(extensionId);
    if (extension) {
        extension.proxyRequests++;
    }
}

// 更新插件统计信息
async function updateExtensionStats(extensionId, stats) {
    try {
        await pool.query(
            'UPDATE extension_stats SET bandwidth_used = $1, proxy_requests = $2 WHERE extension_id = $3',
            [stats.bandwidthUsed, stats.proxyRequests, extensionId]
        );
    } catch (error) {
        console.error('Stats update error:', error);
    }
}

// API路由

// 获取所有在线插件
app.get('/api/extensions/online', (req, res) => {
    const extensions = Array.from(onlineExtensions.entries()).map(([id, ext]) => ({
        id,
        ip: ext.ip,
        connectedAt: ext.connectedAt,
        proxyRequests: ext.proxyRequests
    }));
    res.json(extensions);
});

// 代理请求处理
app.all('/proxy/*', async (req, res) => {
    // 选择合适的插件进行代理
    const availableExtensions = Array.from(onlineExtensions.values())
        .filter(ext => (new Date() - ext.lastHeartbeat) < 30000); // 只选择30秒内有心跳的插件

    if (availableExtensions.length === 0) {
        return res.status(503).json({ error: 'No available proxy extensions' });
    }

    // 简单的负载均衡：选择代理请求数最少的插件
    const selectedExtension = availableExtensions.reduce((min, curr) => 
        curr.proxyRequests < min.proxyRequests ? curr : min
    );

    // 转发请求
    const target = req.url.replace('/proxy/', '');
    proxy.web(req, res, { target });
});

// 清理过期连接
setInterval(() => {
    const now = new Date();
    for (const [id, extension] of onlineExtensions.entries()) {
        if (now - extension.lastHeartbeat > 60000) { // 60秒无心跳则断开
            extension.ws.terminate();
            onlineExtensions.delete(id);
        }
    }
}, 30000);

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
