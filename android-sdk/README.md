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

# Proxy SDK for Android

## 概述

代理SDK提供Android设备的状态上报功能，通过WebSocket与代理后台保持长连接，定期上报设备状态和流量统计信息。

## 功能特点

- WebSocket长连接
- 自动重连机制
- 定期状态上报（每5分钟）
- 流量统计
- 心跳检测
- 动态配置更新

## 集成步骤

1. 添加依赖

```gradle
dependencies {
    implementation 'com.proxy.sdk:proxylib:1.0.0'
}
```

2. 初始化SDK

```java
public class MyApplication extends Application {
    private ProxyClient proxyClient;

    @Override
    public void onCreate() {
        super.onCreate();
        
        // 初始化代理客户端
        proxyClient = new ProxyClient(
            this,
            "ws://your-server-url.com",
            "your_api_key_here"
        );
        
        // 连接服务器
        proxyClient.connect();
    }

    @Override
    public void onTerminate() {
        // 断开连接
        if (proxyClient != null) {
            proxyClient.disconnect();
        }
        super.onTerminate();
    }
}
```

3. 更新流量统计

```java
// 在网络请求完成后更新流量统计
proxyClient.updateTraffic(uploadBytes, downloadBytes);
```

## 状态上报数据格式

每5分钟上报一次状态，数据格式如下：

```json
{
    "type": "status_report",
    "data": {
        "deviceId": "android_xxxx",
        "deviceType": "android",
        "status": "online",
        "ipAddress": "1.2.3.4",
        "duration": 300,
        "traffic": {
            "upload": 1024000,
            "download": 2048000
        },
        "timestamp": 1641288000000
    }
}
```

## 注意事项

1. SDK会自动生成并保存设备ID
2. 使用前需要配置正确的服务器地址和API密钥
3. SDK会自动处理断线重连
4. 每次状态上报后会重置流量统计
5. 可以通过`isConnected()`方法检查连接状态

## 错误处理

SDK内部会处理大多数错误情况：
- 网络断开时自动重连
- 使用指数退避策略避免频繁重连
- 超时处理
- 错误日志记录

## 示例代码

完整的示例代码：

```java
public class MainActivity extends AppCompatActivity {
    private ProxyClient proxyClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // 初始化代理客户端
        proxyClient = new ProxyClient(
            this,
            "ws://your-server-url.com",
            "your_api_key_here"
        );

        // 连接服务器
        proxyClient.connect();

        // 模拟网络请求完成后更新流量
        simulateNetworkRequest();
    }

    private void simulateNetworkRequest() {
        // 模拟上传和下载流量
        long uploadBytes = 1024 * 100;  // 100KB
        long downloadBytes = 1024 * 200; // 200KB
        proxyClient.updateTraffic(uploadBytes, downloadBytes);
    }

    @Override
    protected void onDestroy() {
        // 断开连接
        if (proxyClient != null) {
            proxyClient.disconnect();
        }
        super.onDestroy();
    }
}
