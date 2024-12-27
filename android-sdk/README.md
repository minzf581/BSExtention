# W3Router Android Proxy SDK

Android代理转发SDK，用于与W3Router代理服务器后台通信，实现动态IP代理功能。

## 功能特点

- WebSocket实时通信
- 动态代理连接管理
- 自动重连机制
- 心跳保活
- 异步非阻塞I/O
- 数据传输加密

## 安装

1. 在项目的build.gradle中添加:
```gradle
allprojects {
    repositories {
        maven { url 'https://jitpack.io' }
    }
}
```

2. 在app的build.gradle中添加依赖:
```gradle
dependencies {
    implementation 'com.github.w3router:android-proxy-sdk:1.0.0'
}
```

## 使用方法

1. 初始化SDK:
```kotlin
val config = ProxyConfig(
    serverUrl = "wss://proxy.w3router.com/ws",
    deviceId = "unique_device_id",
    maxRetries = 5,
    connectionTimeout = 30000,
    heartbeatInterval = 30000,
    callback = object : ProxyCallback {
        override fun onProxyReady() {
            // SDK已连接到代理服务器，准备就绪
        }
        
        override fun onProxyDisconnected() {
            // 与代理服务器的连接已断开
        }
        
        override fun onError(error: Throwable) {
            // 发生错误
        }
    }
)

ProxySDK.init(context, config)
```

2. 连接代理服务器:
```kotlin
ProxySDK.getInstance().connect()
```

3. 断开连接:
```kotlin
ProxySDK.getInstance().disconnect()
```

## 工作原理

1. SDK通过WebSocket与代理服务器建立长连接
2. 代理服务器接收到用户的代理请求后，通过WebSocket发送给SDK
3. SDK建立与目标服务器的连接
4. SDK与代理服务器之间通过WebSocket传输数据
5. SDK负责数据的转发和连接管理

## 注意事项

1. 需要添加权限：
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

2. 建议在Application类中初始化SDK
3. 注意处理网络状态变化
4. 合理配置重试参数
5. 及时处理错误回调

## 安全性

1. WebSocket连接使用WSS加密
2. 设备认证使用唯一标识
3. 数据传输采用加密通道
4. 错误信息脱敏处理

## 性能优化

1. 使用连接池管理连接
2. 异步处理所有I/O操作
3. 自动管理连接生命周期
4. 智能的重连策略

## License

```
MIT License

Copyright (c) 2024 W3Router

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
