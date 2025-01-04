// 开发环境配置
const CONFIG = {
    // 代理后台API地址
    API_URL: 'http://localhost:3000/api',
    // WebSocket服务器地址
    WS_URL: 'ws://localhost:3000',
    // API密钥
    API_KEY: 'proxy_api_key_d1e8a37b5c4f9',
    // 心跳间隔（毫秒）
    HEARTBEAT_INTERVAL: 30000,
    // 重连间隔（毫秒）
    RECONNECT_INTERVAL: 5000,
    // 状态上报间隔（毫秒）
    STATUS_REPORT_INTERVAL: 300000, // 5分钟
    // 设备ID前缀
    DEVICE_ID_PREFIX: 'proxy_device_',
    // 设备类型
    DEVICE_TYPE: 'extension' // 或 'android'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
