// 开发环境配置
const DEV_CONFIG = {
    SERVER_URL: 'ws://localhost:3000',
    API_BASE_URL: 'http://localhost:3000/api'
};

// 生产环境配置
const PROD_CONFIG = {
    SERVER_URL: 'wss://your-production-server.com',
    API_BASE_URL: 'https://your-production-server.com/api'
};

// 根据环境选择配置
const config = process.env.NODE_ENV === 'production' ? PROD_CONFIG : DEV_CONFIG;

export default config;
