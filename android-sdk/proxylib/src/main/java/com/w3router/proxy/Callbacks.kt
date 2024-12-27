package com.w3router.proxy

interface ProxyCallback {
    fun onProxyReady()
    fun onProxyDisconnected()
    fun onError(error: Throwable)
    fun onPointsUpdate(pointsInfo: PointsInfo)  // 新增积分更新回调
    fun onSocks5Ready(port: Int)  // 新增SOCKS5服务器就绪回调
}

interface WebSocketCallback {
    fun onConnected()
    fun onMessage(message: ProxyMessage)
    fun onDisconnected()
    fun onError(error: Throwable)
}

interface ProxyConnectionCallback {
    fun onDataReceived(data: ByteArray)
    fun onError(error: Throwable)
}
