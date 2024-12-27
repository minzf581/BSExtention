package com.w3router.proxy

import kotlinx.coroutines.*
import java.io.IOException
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

class ProxyConnection(
    private val connectionId: String,
    private val targetHost: String,
    private val targetPort: Int,
    private val callback: ProxyConnectionCallback
) {
    private var socket: Socket? = null
    private val scope = CoroutineScope(Dispatchers.IO)
    private var job: Job? = null
    private val isRunning = AtomicBoolean(false)
    
    fun start() {
        if (isRunning.getAndSet(true)) {
            return
        }
        
        job = scope.launch {
            try {
                socket = Socket(targetHost, targetPort)
                
                // 启动读取循环
                launch {
                    val buffer = ByteArray(8192)
                    while (isRunning.get()) {
                        try {
                            val bytesRead = socket?.getInputStream()?.read(buffer) ?: -1
                            if (bytesRead == -1) break
                            
                            callback.onDataReceived(buffer.copyOfRange(0, bytesRead))
                        } catch (e: IOException) {
                            if (isRunning.get()) {
                                callback.onError(e)
                                break
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                callback.onError(e)
            }
        }
    }
    
    fun sendData(data: ByteArray) {
        if (!isRunning.get()) return
        
        scope.launch {
            try {
                socket?.getOutputStream()?.write(data)
                socket?.getOutputStream()?.flush()
            } catch (e: Exception) {
                callback.onError(e)
            }
        }
    }
    
    fun close() {
        if (!isRunning.getAndSet(false)) {
            return
        }
        
        job?.cancel()
        job = null
        
        try {
            socket?.close()
            socket = null
        } catch (e: Exception) {
            callback.onError(e)
        }
    }
}
