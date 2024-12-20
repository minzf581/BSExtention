require('dotenv').config();

const config = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        baseUrl: process.env.BASE_URL || 'http://localhost:3000',
        wsUrl: process.env.WS_URL || 'ws://localhost:3000'
    },
    
    // 数据库配置
    database: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? {
            rejectUnauthorized: false
        } : false
    },
    
    // JWT配置
    jwt: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        expiresIn: '24h'
    },
    
    // 积分规则配置
    points: {
        bytesPerPoint: 1024 * 1024, // 每1MB流量1积分
        referralBonus: 100 // 推荐奖励积分
    }
};

module.exports = config;
