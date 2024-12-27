package com.w3router.proxy

import android.os.Handler
import android.os.Looper
import okhttp3.*
import okio.ByteString
import com.google.gson.Gson
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class WebSocketClient(
    private val serverUrl: String,
    private val config: ProxyConfig,
    private val callback: WebSocketCallback
) {
    private var webSocket: WebSocket? = null
    private val isConnected = AtomicBoolean(false)
    private val reconnectAttempts = AtomicInteger(0)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val gson = Gson()
    private val connectionStartTime = AtomicLong(0)
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(config.connectionTimeout, TimeUnit.MILLISECONDS)
        .readTimeout(config.connectionTimeout, TimeUnit.MILLISECONDS)
        .writeTimeout(config.connectionTimeout, TimeUnit.MILLISECONDS)
        .pingInterval(config.heartbeatInterval, TimeUnit.MILLISECONDS)
        .retryOnConnectionFailure(true)
        .build()
    
    private fun getReconnectDelay(): Long {
        val attempt = reconnectAttempts.get()
        return minOf(
            (Math.pow(2.0, attempt.toDouble()) * 1000).toLong(),
            config.maxReconnectDelay
        )
    }
    
    fun connect() {
        if (isConnected.get()) {
            return
        }
        
        val request = Request.Builder()
            .url(serverUrl)
            .header("Device-ID", config.deviceId)
            .header("Client-Type", "Android")
            .build()
            
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected.set(true)
                reconnectAttempts.set(0)
                connectionStartTime.set(System.currentTimeMillis())
                callback.onConnected()
                
                sendInitMessage()
                startHeartbeat()
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val message = gson.fromJson(text, ProxyMessage::class.java)
                    when (message.type) {
                        MessageType.POINTS_UPDATE -> {
                            message.pointsInfo?.let { pointsInfo ->
                                config.callback.onPointsUpdate(pointsInfo)
                            }
                        }
                        else -> callback.onMessage(message)
                    }
                } catch (e: Exception) {
                    callback.onError(e)
                }
            }
            
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val message = ProxyMessage(
                    type = MessageType.DATA,
                    connectionId = extractConnectionId(bytes),
                    data = extractData(bytes)
                )
                callback.onMessage(message)
            }
            
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                handleDisconnect()
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                handleDisconnect()
                callback.onError(t)
            }
        })
    }
    
    private fun handleDisconnect() {
        if (isConnected.getAndSet(false)) {
            connectionStartTime.set(0)
            callback.onDisconnected()
            
            if (reconnectAttempts.get() < config.maxRetries) {
                val delay = getReconnectDelay()
                mainHandler.postDelayed({
                    reconnectAttempts.incrementAndGet()
                    connect()
                }, delay)
            }
        }
    }
    
    private fun sendInitMessage() {
        val initMessage = ProxyMessage(
            type = MessageType.INIT,
            connectionId = "",
            deviceInfo = DeviceInfo(
                id = config.deviceId,
                type = "Android",
                version = BuildConfig.VERSION_NAME,
                capabilities = listOf("http", "https", "socks5")
            )
        )
        send(initMessage)
    }
    
    private var heartbeatJob: Runnable? = null
    
    private fun startHeartbeat() {
        heartbeatJob?.let { mainHandler.removeCallbacks(it) }
        
        heartbeatJob = object : Runnable {
            override fun run() {
                if (isConnected.get()) {
                    val connectionTime = if (connectionStartTime.get() > 0) {
                        (System.currentTimeMillis() - connectionStartTime.get()) / 1000
                    } else 0
                    
                    send(ProxyMessage(
                        type = MessageType.PING,
                        connectionId = "",
                        pointsInfo = PointsInfo(
                            points = 0,
                            ipQuality = 0,
                            connectionTime = connectionTime,
                            pointsRate = 0.0,
                            lastUpdateTime = System.currentTimeMillis()
                        )
                    ))
                    mainHandler.postDelayed(this, config.heartbeatInterval)
                }
            }
        }
        
        mainHandler.post(heartbeatJob!!)
    }
    
    fun disconnect() {
        heartbeatJob?.let { mainHandler.removeCallbacks(it) }
        heartbeatJob = null
        
        webSocket?.close(1000, "Normal closure")
        webSocket = null
        isConnected.set(false)
        connectionStartTime.set(0)
    }
    
    fun send(message: ProxyMessage) {
        if (!isConnected.get()) {
            return
        }
        
        try {
            when (message.type) {
                MessageType.DATA -> {
                    val data = addConnectionIdHeader(message.connectionId, message.data)
                    webSocket?.send(ByteString.of(*data))
                }
                else -> {
                    webSocket?.send(gson.toJson(message))
                }
            }
        } catch (e: Exception) {
            callback.onError(e)
        }
    }
    
    private fun addConnectionIdHeader(connectionId: String, data: ByteArray): ByteArray {
        val header = ByteArray(8)
        connectionId.toByteArray().copyInto(header, 0, 0, minOf(8, connectionId.length))
        return header + data
    }
    
    private fun extractConnectionId(bytes: ByteString): String {
        return String(bytes.toByteArray().copyOfRange(0, 8)).trim()
    }
    
    private fun extractData(bytes: ByteString): ByteArray {
        return bytes.toByteArray().copyOfRange(8, bytes.size())
    }
}
