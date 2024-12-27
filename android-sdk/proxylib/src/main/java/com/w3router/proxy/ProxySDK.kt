package com.w3router.proxy

import android.content.Context
import com.w3router.proxy.socks.Socks5Server
import com.w3router.proxy.socks.Socks5Callback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

class ProxySDK private constructor(
    private val context: Context,
    private val config: ProxyConfig
) {
    private val scope = CoroutineScope(Dispatchers.IO)
    private val wsClient: WebSocketClient
    private val proxyConnections = ConcurrentHashMap<String, ProxyConnection>()
    private var connectionJob: Job? = null
    private var socks5Server: Socks5Server? = null
    
    init {
        wsClient = WebSocketClient(config.serverUrl, config, object : WebSocketCallback {
            override fun onConnected() {
                config.callback.onProxyReady()
                startSocks5Server()
            }
            
            override fun onMessage(message: ProxyMessage) {
                handleProxyMessage(message)
            }
            
            override fun onDisconnected() {
                config.callback.onProxyDisconnected()
                stopSocks5Server()
                reconnectWithBackoff()
            }
            
            override fun onError(error: Throwable) {
                config.callback.onError(error)
            }
        })
    }
    
    private fun startSocks5Server() {
        socks5Server = Socks5Server(config.socks5Port, object : Socks5Callback {
            override fun onServerStarted(port: Int) {
                config.callback.onSocks5Ready(port)
            }
            
            override fun onError(error: Throwable) {
                config.callback.onError(error)
            }
        })
        socks5Server?.start()
    }
    
    private fun stopSocks5Server() {
        socks5Server?.stop()
        socks5Server = null
    }
    
    fun connect() {
        connectionJob = scope.launch {
            wsClient.connect()
        }
    }
    
    fun disconnect() {
        connectionJob?.cancel()
        connectionJob = null
        stopSocks5Server()
        wsClient.disconnect()
        proxyConnections.forEach { (_, connection) ->
            connection.close()
        }
        proxyConnections.clear()
    }
    
    private fun handleProxyMessage(message: ProxyMessage) {
        when (message.type) {
            MessageType.NEW_CONNECTION -> {
                // 服务器请求建立新的代理连接
                val connection = ProxyConnection(
                    connectionId = message.connectionId,
                    targetHost = message.targetHost,
                    targetPort = message.targetPort,
                    callback = object : ProxyConnectionCallback {
                        override fun onDataReceived(data: ByteArray) {
                            wsClient.send(ProxyMessage(
                                type = MessageType.DATA,
                                connectionId = message.connectionId,
                                data = data
                            ))
                        }
                        
                        override fun onError(error: Throwable) {
                            wsClient.send(ProxyMessage(
                                type = MessageType.ERROR,
                                connectionId = message.connectionId,
                                error = error.message
                            ))
                            proxyConnections.remove(message.connectionId)
                        }
                    }
                )
                proxyConnections[message.connectionId] = connection
                connection.start()
            }
            
            MessageType.DATA -> {
                // 接收到服务器转发的数据
                proxyConnections[message.connectionId]?.sendData(message.data)
            }
            
            MessageType.CLOSE -> {
                // 服务器请求关闭连接
                proxyConnections[message.connectionId]?.close()
                proxyConnections.remove(message.connectionId)
            }
            
            MessageType.ERROR -> {
                // 处理错误
                proxyConnections[message.connectionId]?.close()
                proxyConnections.remove(message.connectionId)
                config.callback.onError(Exception(message.error))
            }
        }
    }
    
    private fun reconnectWithBackoff() {
        // 实现重连逻辑，使用指数退避算法
        scope.launch {
            var retryCount = 0
            while (retryCount < config.maxRetries) {
                try {
                    wsClient.connect()
                    break
                } catch (e: Exception) {
                    retryCount++
                    val delay = (Math.pow(2.0, retryCount.toDouble()) * 1000).toLong()
                    kotlinx.coroutines.delay(delay)
                }
            }
        }
    }
    
    companion object {
        @Volatile
        private var instance: ProxySDK? = null
        
        fun init(context: Context, config: ProxyConfig): ProxySDK {
            return instance ?: synchronized(this) {
                instance ?: ProxySDK(context.applicationContext, config).also { instance = it }
            }
        }
        
        fun getInstance(): ProxySDK {
            return instance ?: throw IllegalStateException("ProxySDK must be initialized first")
        }
    }
}
