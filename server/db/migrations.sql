-- 创建插件连接记录表
CREATE TABLE IF NOT EXISTS extension_connections (
    id SERIAL PRIMARY KEY,
    extension_id UUID NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    connected_at TIMESTAMP NOT NULL,
    disconnected_at TIMESTAMP,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建插件统计信息表
CREATE TABLE IF NOT EXISTS extension_stats (
    id SERIAL PRIMARY KEY,
    extension_id UUID NOT NULL,
    bandwidth_used BIGINT DEFAULT 0,
    proxy_requests INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (extension_id) REFERENCES extension_connections(extension_id)
);

-- 创建代理请求日志表
CREATE TABLE IF NOT EXISTS proxy_logs (
    id SERIAL PRIMARY KEY,
    extension_id UUID NOT NULL,
    request_url TEXT NOT NULL,
    request_method VARCHAR(10) NOT NULL,
    response_status INTEGER,
    bytes_transferred INTEGER,
    duration INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (extension_id) REFERENCES extension_connections(extension_id)
);

-- 创建索引
CREATE INDEX idx_extension_connections_extension_id ON extension_connections(extension_id);
CREATE INDEX idx_extension_stats_extension_id ON extension_stats(extension_id);
CREATE INDEX idx_proxy_logs_extension_id ON proxy_logs(extension_id);
CREATE INDEX idx_extension_connections_connected_at ON extension_connections(connected_at);
