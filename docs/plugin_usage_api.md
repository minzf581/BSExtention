# 插件使用数据记录 API 文档

## 接口概述

该接口用于记录插件用户的使用数据，包括在线时长、IP地址和账户信息等。数据将被存储在 Google Cloud 上的 PostgreSQL 数据库中。

## API 端点

```
POST /api/v1/plugin-usage
```

## 请求头部

```
Content-Type: application/json
Authorization: Bearer <access_token>
```

## 请求体

```json
{
  "userId": "string",         // 用户唯一标识符
  "username": "string",       // 用户账户名
  "sessionDuration": number,  // 在线时长（秒）
  "ipAddress": "string",      // 用户IP地址
  "pluginVersion": "string",  // 插件版本号
  "timestamp": "string",      // ISO 8601格式的时间戳
  "deviceInfo": {            // 设备信息（可选）
    "os": "string",          // 操作系统
    "browser": "string",     // 浏览器类型
    "browserVersion": "string" // 浏览器版本
  }
}
```

## 响应

### 成功响应 (200 OK)

```json
{
  "status": "success",
  "message": "Usage data recorded successfully",
  "recordId": "string"  // 记录的唯一标识符
}
```

### 错误响应 (4xx/5xx)

```json
{
  "status": "error",
  "code": "string",
  "message": "string"
}
```

## 错误代码

| 错误代码 | 描述 |
|---------|------|
| 400 | 请求参数无效 |
| 401 | 未授权访问 |
| 403 | 访问被禁止 |
| 500 | 服务器内部错误 |

## 数据库表结构

```sql
CREATE TABLE plugin_usage (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    username VARCHAR(100) NOT NULL,
    session_duration INTEGER NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    plugin_version VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    os VARCHAR(50),
    browser VARCHAR(50),
    browser_version VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以优化查询性能
CREATE INDEX idx_plugin_usage_user_id ON plugin_usage(user_id);
CREATE INDEX idx_plugin_usage_timestamp ON plugin_usage(timestamp);
```

## 安全性考虑

1. 所有API请求必须通过HTTPS进行
2. 使用Bearer token进行身份验证
3. 实施速率限制以防止滥用
4. 对敏感数据进行加密存储
5. 定期清理过期数据

## 使用示例

### cURL
```bash
curl -X POST https://your-api-endpoint/api/v1/plugin-usage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-access-token" \
  -d '{
    "userId": "user123",
    "username": "john_doe",
    "sessionDuration": 3600,
    "ipAddress": "203.0.113.1",
    "pluginVersion": "1.0.0",
    "timestamp": "2024-12-27T08:19:19Z",
    "deviceInfo": {
      "os": "Windows",
      "browser": "Chrome",
      "browserVersion": "120.0.0"
    }
  }'
```

## 注意事项

1. 时间戳应使用 ISO 8601 格式
2. IP地址应同时支持IPv4和IPv6格式
3. 建议在客户端实现重试机制以处理网络故障
4. 确保遵守相关的数据保护法规（如GDPR）
