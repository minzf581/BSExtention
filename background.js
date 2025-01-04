// 配置常量
import CONFIG from './config.js';

let ws = null;
let heartbeatTimer = null;
let statusReportTimer = null;
let reconnectAttempts = 0;
let deviceId = null;
let proxyStats = {
    bandwidthUsed: 0,
    proxyRequests: 0,
    startTime: null,
    traffic: {
        upload: 0,
        download: 0
    }
};

// 初始化设备ID
function initDeviceId() {
    deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
        deviceId = CONFIG.DEVICE_ID_PREFIX + Date.now();
        localStorage.setItem('deviceId', deviceId);
    }
}

// 用户注册
async function registerUser(userData) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CONFIG.API_KEY
            },
            body: JSON.stringify({
                ...userData,
                deviceType: CONFIG.DEVICE_TYPE
            })
        });

        if (!response.ok) {
            throw new Error('Registration failed');
        }

        return await response.json();
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

// 初始化WebSocket连接
function initializeWebSocket() {
    if (!deviceId) return;

    // 如果已经有连接，先关闭
    if (ws) {
        ws.close();
        ws = null;
    }

    ws = new WebSocket(`${CONFIG.WS_URL}?deviceId=${deviceId}&deviceType=${CONFIG.DEVICE_TYPE}`);

    ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts = 0;
        startHeartbeat();
        startStatusReporting();
        // 连接成功后立即发送一次状态
        reportStatus();
    };

    ws.onmessage = (event) => {
        handleMessage(JSON.parse(event.data));
    };

    ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        stopHeartbeat();
        stopStatusReporting();

        // 指数退避重连
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;

        setTimeout(() => {
            if (deviceId) {
                console.log('Attempting to reconnect...');
                initializeWebSocket();
            }
        }, timeout);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// 开始状态上报
function startStatusReporting() {
    stopStatusReporting();
    // 每5分钟上报一次状态
    statusReportTimer = setInterval(reportStatus, CONFIG.STATUS_REPORT_INTERVAL);
}

// 停止状态上报
function stopStatusReporting() {
    if (statusReportTimer) {
        clearInterval(statusReportTimer);
        statusReportTimer = null;
    }
}

// 上报状态
async function reportStatus() {
    if (!deviceId || !ws || ws.readyState !== WebSocket.OPEN) return;

    try {
        const statusData = {
            deviceId: deviceId,
            deviceType: CONFIG.DEVICE_TYPE,
            username: localStorage.getItem('username'),
            status: 'online',
            ipAddress: await getPublicIP(),
            duration: Math.floor((Date.now() - (proxyStats.startTime || Date.now())) / 1000),
            traffic: proxyStats.traffic,
            timestamp: new Date().toISOString()
        };

        // 通过WebSocket发送状态
        ws.send(JSON.stringify({
            type: 'status_report',
            data: statusData
        }));

        // 重置流量统计
        proxyStats.traffic = { upload: 0, download: 0 };

    } catch (error) {
        console.error('Status report error:', error);
    }
}

// 获取公网IP
async function getPublicIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error('Failed to get public IP:', error);
        return 'unknown';
    }
}

// 开始心跳
function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ 
                type: 'heartbeat',
                data: {
                    deviceId: deviceId,
                    deviceType: CONFIG.DEVICE_TYPE,
                    timestamp: new Date().toISOString()
                }
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

// 处理接收到的消息
function handleMessage(message) {
    switch (message.type) {
        case 'proxy_request':
            handleProxyRequest(message.data);
            break;
        case 'heartbeat_ack':
            // 心跳确认，可以用来检测连接状态
            break;
        case 'force_report':
            // 服务器要求立即上报状态
            reportStatus();
            break;
        case 'config_update':
            // 服务器下发新的配置
            handleConfigUpdate(message.data);
            break;
    }
}

// 处理配置更新
function handleConfigUpdate(config) {
    // 更新本地配置
    if (config.statusReportInterval) {
        CONFIG.STATUS_REPORT_INTERVAL = config.statusReportInterval;
        // 重启状态上报定时器
        startStatusReporting();
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

        // 更新流量统计
        proxyStats.traffic.upload += data.body ? data.body.length : 0;
        proxyStats.traffic.download += responseData.byteLength;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'proxy_response',
                requestId: data.requestId,
                status: response.status,
                headers: Object.fromEntries(response.headers),
                data: responseData
            }));
        }
    } catch (error) {
        console.error('Proxy request error:', error);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'proxy_error',
                requestId: data.requestId,
                error: error.message
            }));
        }
    }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'register':
            registerUser(message.data)
                .then(response => {
                    localStorage.setItem('username', message.data.username);
                    initDeviceId();
                    sendResponse({ success: true, data: response });
                })
                .catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
            return true;

        case 'startProxy':
            if (!proxyStats.startTime) {
                proxyStats.startTime = Date.now();
            }
            initializeWebSocket();
            sendResponse({ success: true });
            break;

        case 'stopProxy':
            if (ws) {
                // 发送离线状态
                ws.send(JSON.stringify({
                    type: 'status_report',
                    data: {
                        deviceId: deviceId,
                        deviceType: CONFIG.DEVICE_TYPE,
                        status: 'offline',
                        timestamp: new Date().toISOString()
                    }
                }));
                ws.close();
                ws = null;
            }
            stopHeartbeat();
            stopStatusReporting();
            proxyStats.startTime = null;
            sendResponse({ success: true });
            break;

        case 'getStats':
            sendResponse({ success: true, data: proxyStats });
            break;
    }
});

// 初始化扩展
chrome.storage.local.get(['deviceId'], (result) => {
    if (result.deviceId) {
        deviceId = result.deviceId;
        initializeWebSocket();
    }
});
