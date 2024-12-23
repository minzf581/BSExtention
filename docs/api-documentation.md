# IP代理服务 API文档

## 基础信息

### 服务器地址
- 开发环境: `http://localhost:3000`
- 生产环境: `https://your-production-server.com`

### 认证方式
所有API请求需要在header中携带认证token：
```
Authorization: Bearer <your_token>
```

## API接口

### 1. 用户认证

#### 1.1 用户登录
- **URL**: `/api/auth/login`
- **Method**: `POST`
- **请求体**:
```json
{
    "username": "your_username",
    "password": "your_password"
}
```
- **响应示例**:
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
        "id": "user_id",
        "username": "your_username"
    }
}
```

#### 1.2 验证Token
- **URL**: `/api/auth/verify`
- **Method**: `GET`
- **Headers**: 需要包含Authorization
- **响应示例**:
```json
{
    "valid": true,
    "user": {
        "id": "user_id",
        "username": "your_username"
    }
}
```

### 2. 代理服务

#### 2.1 获取代理配置
- **URL**: `/api/proxy/config`
- **Method**: `GET`
- **Headers**: 需要包含Authorization
- **响应示例**:
```json
{
    "proxyHost": "proxy.example.com",
    "proxyPort": 8080,
    "scheme": "http"
}
```

#### 2.2 获取使用统计
- **URL**: `/api/proxy/stats`
- **Method**: `GET`
- **Headers**: 需要包含Authorization
- **响应示例**:
```json
{
    "bandwidthUsed": 1024000,
    "totalRequests": 100,
    "activeConnections": 5
}
```

## 使用示例

### cURL示例

1. 登录获取token:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'
```

2. 获取代理配置:
```bash
curl http://localhost:3000/api/proxy/config \
  -H "Authorization: Bearer your_token"
```

### Python示例

```python
import requests

# 配置
BASE_URL = 'http://localhost:3000'
USERNAME = 'your_username'
PASSWORD = 'your_password'

# 登录
def login():
    response = requests.post(f'{BASE_URL}/api/auth/login', json={
        'username': USERNAME,
        'password': PASSWORD
    })
    return response.json()['token']

# 使用代理
def use_proxy(token):
    # 获取代理配置
    config = requests.get(f'{BASE_URL}/api/proxy/config', 
        headers={'Authorization': f'Bearer {token}'}).json()
    
    # 设置代理
    proxies = {
        'http': f"http://{config['proxyHost']}:{config['proxyPort']}",
        'https': f"http://{config['proxyHost']}:{config['proxyPort']}"
    }
    
    # 使用代理访问目标网站
    response = requests.get('http://example.com', proxies=proxies)
    return response.text

# 使用示例
token = login()
result = use_proxy(token)
```

### Node.js示例

```javascript
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const USERNAME = 'your_username';
const PASSWORD = 'your_password';

// 登录
async function login() {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        username: USERNAME,
        password: PASSWORD
    });
    return response.data.token;
}

// 使用代理
async function useProxy(token) {
    // 获取代理配置
    const config = await axios.get(`${BASE_URL}/api/proxy/config`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    
    // 设置代理
    const proxyConfig = {
        host: config.data.proxyHost,
        port: config.data.proxyPort
    };
    
    // 使用代理访问目标网站
    const response = await axios.get('http://example.com', {
        proxy: proxyConfig,
        headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
}

// 使用示例
async function main() {
    try {
        const token = await login();
        const result = await useProxy(token);
        console.log(result);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
```

## WebSocket实时统计

WebSocket连接用于获取实时的代理使用统计信息：

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
    // 发送认证信息
    ws.send(JSON.stringify({
        type: 'auth',
        token: 'your_token'
    }));
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('实时统计:', data);
    // {
    //     bandwidthUsed: 1024000,
    //     activeConnections: 5,
    //     lastMinuteRequests: 60
    // }
};
```

## 注意事项

1. 所有请求都需要携带有效的认证token
2. 代理服务会自动处理HTTP和HTTPS请求
3. WebSocket连接用于获取实时统计信息
4. 本地请求（localhost）会自动绕过代理
5. 建议定期检查代理统计信息以监控使用情况

## 错误处理

所有API都使用标准的HTTP状态码，常见错误：

- 401: 未认证或token无效
- 403: 无权限访问
- 429: 请求超过限制
- 500: 服务器内部错误

错误响应格式：
```json
{
    "error": true,
    "message": "错误描述",
    "code": "ERROR_CODE"
}
```
