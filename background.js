// 配置常量
const CONFIG = {
    SERVER_URL: 'wss://your-server-url.com',  // WebSocket服务器地址
    API_BASE_URL: 'http://your-server-url.com/api',  // REST API地址
    HEARTBEAT_INTERVAL: 30000,  // 心跳间隔（毫秒）
    RECONNECT_INTERVAL: 5000    // 重连间隔（毫秒）
};

let ws = null;
let heartbeatTimer = null;
let authToken = null;
let proxyStats = {
    bandwidthUsed: 0,
    proxyRequests: 0,
    startTime: null
};

// 初始化WebSocket连接
function initializeWebSocket() {
    if (!authToken) return;

    ws = new WebSocket(`${CONFIG.SERVER_URL}?token=${authToken}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        startHeartbeat();
        // 发送初始状态
        sendStats();
    };

    ws.onmessage = (event) => {
        handleMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        stopHeartbeat();
        setTimeout(() => {
            if (authToken) {
                initializeWebSocket();
            }
        }, CONFIG.RECONNECT_INTERVAL);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// 开始心跳
function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'heartbeat',
                data: { stats: proxyStats }
            }));
        }
    }, CONFIG.HEARTBEAT_INTERVAL);
}

// 停止心跳
function stopHeartbeat() {
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// 发送统计信息
function sendStats() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'stats_update',
            data: proxyStats
        }));
    }
}

// 处理接收到的消息
async function handleMessage(message) {
    switch (message.type) {
        case 'proxy_request':
            await handleProxyRequest(message.data);
            break;
        case 'upgrade':
            handleUpgrade(message.data);
            break;
        case 'points_update':
            handlePointsUpdate(message.data);
            break;
        case 'heartbeat_response':
            // 处理心跳响应
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
}

// 处理代理请求
async function handleProxyRequest(data) {
    try {
        const response = await fetch(data.url, {
            method: data.method,
            headers: data.headers,
            body: data.body
        });

        const responseData = await response.arrayBuffer();
        proxyStats.bandwidthUsed += responseData.byteLength;
        proxyStats.proxyRequests++;

        // 更新积分
        if (authToken) {
            await updatePoints(responseData.byteLength);
        }

        // 发送响应回服务器
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'proxy_response',
                data: {
                    requestId: data.requestId,
                    status: response.status,
                    headers: Object.fromEntries(response.headers),
                    body: Array.from(new Uint8Array(responseData))
                }
            }));
        }

        // 通知popup更新统计信息
        chrome.runtime.sendMessage({
            type: 'statsUpdate',
            data: proxyStats
        });
    } catch (error) {
        console.error('Proxy request error:', error);
    }
}

// 更新积分
async function updatePoints(bytes) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/points/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                bytes: bytes,
                type: 'proxy_usage'
            })
        });

        if (response.ok) {
            const data = await response.json();
            chrome.runtime.sendMessage({
                type: 'pointsUpdate',
                data: data
            });
        }
    } catch (error) {
        console.error('Points update error:', error);
    }
}

// 处理升级请求
function handleUpgrade(data) {
    chrome.runtime.requestUpdateCheck((status) => {
        if (status === "update_available") {
            chrome.runtime.reload();
        }
    });
}

// 处理积分更新
function handlePointsUpdate(data) {
    chrome.runtime.sendMessage({
        type: 'pointsUpdate',
        data: data
    });
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'startProxy':
            authToken = message.token;
            proxyStats.startTime = Date.now();
            initializeWebSocket();
            sendResponse({ success: true });
            break;

        case 'stopProxy':
            if (ws) {
                ws.close();
            }
            stopHeartbeat();
            proxyStats.startTime = null;
            sendResponse({ success: true });
            break;

        case 'getStatus':
            sendResponse({
                isActive: ws && ws.readyState === WebSocket.OPEN,
                startTime: proxyStats.startTime,
                stats: proxyStats
            });
            break;
    }
    return true;
});

// 初始化扩展
chrome.runtime.onInstalled.addListener(() => {
    // 从storage中恢复认证状态
    chrome.storage.local.get(['authToken'], (result) => {
        if (result.authToken) {
            authToken = result.authToken;
            initializeWebSocket();
        }
    });
});
