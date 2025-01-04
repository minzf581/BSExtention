# IP代理后台 API 文档

## 概述

本文档描述了IP代理后台与积分系统之间的接口规范。通过这些接口，代理后台可以上报节点状态变更、查询统计信息，系统会自动计算和发放用户积分。

## 基础信息

### 服务器地址
- 生产环境：`https://eonhome-445809.et.r.appspot.com`
- 测试环境：`http://localhost:3000`

### API路径前缀
所有API都以 `/api` 作为前缀，例如：
- 生产环境：`https://eonhome-445809.et.r.appspot.com/api`
- 测试环境：`http://localhost:3000/api`

### API密钥获取
1. 联系系统管理员申请API密钥
2. API密钥用于代理后台的身份认证
3. 每个代理后台使用唯一的API密钥
4. 默认测试API密钥：`proxy_api_key_d1e8a37b5c4f9`（仅用于测试环境）
5. API密钥格式：以 `proxy_api_key_` 为前缀的字符串

## 用户注册

用户注册需要使用系统提供的注册接口：

```http
POST /api/auth/register
Content-Type: application/json

{
    "username": "user123",
    "password": "password123",
    "email": "user@example.com",
    "referralCode": "REF123"  // 可选
}
```

## 状态上报

### 认证

所有接口都需要通过API密钥进行认证。

#### 认证方式
- 在HTTP请求头中添加 `X-API-Key` 字段
- 示例：`X-API-Key: your_api_key_here`

### 1. 上报节点状态

在以下情况下需要上报节点状态：
1. 节点状态发生变化时（上线或下线）
2. 节点持续在线超过24小时时（每日上报一次）

每次上报需要包含自上次上报以来的统计数据。

#### 请求
```http
POST /api/proxy/report/batch
Content-Type: application/json
X-API-Key: your_api_key_here
```

#### 请求体
```json
{
    "nodes": [
        {
            "deviceId": "unique_device_id",
            "username": "user123",        // 用户注册时使用的用户名
            "status": "online",           // online 或 offline
            "ipAddress": "1.2.3.4",
            "duration": 86400,            // 自上次上报以来的在线时长（秒）
            "traffic": {
                "upload": 1073741824,     // 自上次上报以来的上传流量（bytes）
                "download": 2147483648    // 自上次上报以来的下载流量（bytes）
            },
            "reportType": "daily"         // status_change: 状态变更, daily: 每日上报
        }
    ]
}
```

#### 响应
```json
{
    "code": 200,
    "message": "success",
    "data": {
        "syncTime": "2025-01-04T07:44:54.000Z",
        "processedNodes": 1,       // 成功处理的节点数
        "activeNodes": 1,          // 当前在线节点数
        "skippedNodes": 0          // 跳过的节点数（用户不存在）
    }
}
```

#### 字段说明
- deviceId: 设备唯一标识
- username: 用户注册时使用的用户名（必须）
- status: 节点状态，可选值：online/offline
- ipAddress: 节点IP地址
- duration: 自上次上报以来的在线时长（秒）
- traffic: 自上次上报以来的流量统计
  - upload: 上传流量（bytes）
  - download: 下载流量（bytes）
- reportType: 上报类型
  - status_change: 状态变更上报
  - daily: 每日定时上报

### 2. 获取节点统计信息

#### 请求
```http
GET /api/proxy/stats
X-API-Key: your_api_key_here
```

#### 响应
```json
{
    "code": 200,
    "message": "success",
    "data": [
        {
            "status": "online",
            "count": 100,
            "totalUploadBytes": 1024000000,    // 总上传流量，单位：bytes
            "totalDownloadBytes": 2048000000,  // 总下载流量，单位：bytes
            "totalOnlineTime": 3600            // 总在线时长，单位：秒
        },
        {
            "status": "offline",
            "count": 50,
            "totalUploadBytes": 512000000,
            "totalDownloadBytes": 1024000000,
            "totalOnlineTime": 1800
        }
    ]
}
```

## 积分计算规则

系统会根据以下规则自动计算和发放积分：

1. 在线时长积分
   - 每小时在线可获得1积分
   - 按秒计算，不足1小时按比例计算

2. 流量积分
   - 每GB上传流量可获得10积分
   - 每GB下载流量可获得5积分
   - 按实际流量计算，不足1GB按比例计算

## 错误码

| 错误码 | 描述 |
|--------|------|
| 200    | 成功 |
| 400    | 请求参数错误 |
| 401    | 认证失败 |
| 500    | 服务器内部错误 |

## 注意事项

1. 用户必须先通过系统注册接口注册
2. 状态上报时必须提供正确的用户名
3. 以下情况需要上报：
   - 节点状态变更（上线/下线）时
   - 节点持续在线超过24小时时（每日上报）
4. 每次上报都需要包含完整的统计数据（在线时长和流量）
5. API密钥不要泄露给第三方
6. 流量和时长数据应准确记录，避免重复计算

## 开发工具

### 测试脚本
我们提供了完整的API测试脚本 `test_api.sh`，可以用来测试所有API功能：

```bash
# 使用方法
chmod +x test_api.sh
./test_api.sh

# 测试前需要配置
1. 设置正确的 BASE_URL（生产环境或测试环境）
2. 设置有效的 API_KEY
```

### API调用示例

#### cURL
```bash
# 节点状态上报
curl -X POST "https://eonhome-445809.et.r.appspot.com/api/proxy/report/batch" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "nodes": [{
      "deviceId": "device_001",
      "username": "user123",
      "status": "online",
      "ipAddress": "1.2.3.4",
      "duration": 3600,
      "traffic": {
        "upload": 1073741824,
        "download": 2147483648
      },
      "reportType": "status_change"
    }]
  }'

# 获取节点统计
curl -X GET "https://eonhome-445809.et.r.appspot.com/api/proxy/stats" \
  -H "X-API-Key: your_api_key_here"
```

#### Python
```python
import requests
import json

API_KEY = "your_api_key_here"
BASE_URL = "https://eonhome-445809.et.r.appspot.com/api"

# 节点状态上报
def report_node_status():
    url = f"{BASE_URL}/proxy/report/batch"
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY
    }
    data = {
        "nodes": [{
            "deviceId": "device_001",
            "username": "user123",
            "status": "online",
            "ipAddress": "1.2.3.4",
            "duration": 3600,
            "traffic": {
                "upload": 1073741824,
                "download": 2147483648
            },
            "reportType": "status_change"
        }]
    }
    response = requests.post(url, headers=headers, json=data)
    return response.json()

# 获取节点统计
def get_node_stats():
    url = f"{BASE_URL}/proxy/stats"
    headers = {"X-API-Key": API_KEY}
    response = requests.get(url, headers=headers)
    return response.json()
```
