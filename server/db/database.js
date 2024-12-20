const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

// 数据库操作类
class Database {
    // 记录插件连接
    static async recordConnection(extensionId, ipAddress) {
        const query = `
            INSERT INTO extension_connections (extension_id, ip_address, connected_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            RETURNING id
        `;
        const values = [extensionId, ipAddress];
        try {
            const result = await pool.query(query, values);
            return result.rows[0].id;
        } catch (error) {
            console.error('Error recording connection:', error);
            throw error;
        }
    }

    // 更新插件断开连接时间
    static async updateDisconnection(extensionId) {
        const query = `
            UPDATE extension_connections
            SET disconnected_at = CURRENT_TIMESTAMP,
                duration = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - connected_at))::INTEGER
            WHERE extension_id = $1 AND disconnected_at IS NULL
        `;
        try {
            await pool.query(query, [extensionId]);
        } catch (error) {
            console.error('Error updating disconnection:', error);
            throw error;
        }
    }

    // 更新插件统计信息
    static async updateStats(extensionId, bandwidthUsed, proxyRequests) {
        const query = `
            INSERT INTO extension_stats (extension_id, bandwidth_used, proxy_requests)
            VALUES ($1, $2, $3)
            ON CONFLICT (extension_id)
            DO UPDATE SET
                bandwidth_used = extension_stats.bandwidth_used + $2,
                proxy_requests = extension_stats.proxy_requests + $3,
                updated_at = CURRENT_TIMESTAMP
        `;
        const values = [extensionId, bandwidthUsed, proxyRequests];
        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error updating stats:', error);
            throw error;
        }
    }

    // 记录代理请求
    static async logProxyRequest(extensionId, requestUrl, method, status, bytes, duration) {
        const query = `
            INSERT INTO proxy_logs (
                extension_id, request_url, request_method,
                response_status, bytes_transferred, duration
            )
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const values = [extensionId, requestUrl, method, status, bytes, duration];
        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error logging proxy request:', error);
            throw error;
        }
    }

    // 获取插件统计信息
    static async getExtensionStats(extensionId) {
        const query = `
            SELECT 
                e.extension_id,
                e.ip_address,
                e.connected_at,
                s.bandwidth_used,
                s.proxy_requests,
                COUNT(p.id) as total_requests
            FROM extension_connections e
            LEFT JOIN extension_stats s ON e.extension_id = s.extension_id
            LEFT JOIN proxy_logs p ON e.extension_id = p.extension_id
            WHERE e.extension_id = $1
            GROUP BY e.extension_id, e.ip_address, e.connected_at, s.bandwidth_used, s.proxy_requests
        `;
        try {
            const result = await pool.query(query, [extensionId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error getting extension stats:', error);
            throw error;
        }
    }
}

module.exports = Database;
