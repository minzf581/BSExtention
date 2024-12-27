package com.w3router.proxy

data class ProxyConfig(
    val serverUrl: String,                   // WebSocket服务器地址
    val deviceId: String,                    // 设备唯一标识
    val maxRetries: Int = 5,                 // 最大重试次数
    val maxReconnectDelay: Long = 60000,     // 最大重连延迟（毫秒）
    val connectionTimeout: Long = 30000,     // 连接超时时间（毫秒）
    val heartbeatInterval: Long = 30000,     // 心跳间隔（毫秒）
    val socks5Port: Int = 0,                 // SOCKS5服务器端口（0表示随机端口）
    val callback: ProxyCallback              // 代理回调接口
)
