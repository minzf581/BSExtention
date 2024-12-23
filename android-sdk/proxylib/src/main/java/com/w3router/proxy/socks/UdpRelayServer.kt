package com.w3router.proxy.socks

import kotlinx.coroutines.*
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class UdpRelayServer(
    private val bindAddress: InetAddress = InetAddress.getByName("0.0.0.0"),
    private val port: Int = 0, // 0表示随机端口
    private val callback: UdpRelayCallback
) {
    private var relaySocket: DatagramSocket? = null
    private val isRunning = AtomicBoolean(false)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val clientSessions = ConcurrentHashMap<InetSocketAddress, UdpSession>()
    
    fun start() {
        if (isRunning.getAndSet(true)) {
            return
        }
        
        try {
            relaySocket = DatagramSocket(port, bindAddress)
            callback.onServerStarted(relaySocket?.localPort ?: 0)
            
            scope.launch {
                receiveLoop()
            }
        } catch (e: Exception) {
            callback.onError(e)
            stop()
        }
    }
    
    private suspend fun receiveLoop() = coroutineScope {
        val buffer = ByteArray(65507) // UDP最大包大小
        
        while (isRunning.get()) {
            try {
                val packet = DatagramPacket(buffer, buffer.size)
                relaySocket?.receive(packet)
                
                // 处理接收到的数据包
                launch {
                    handlePacket(packet)
                }
            } catch (e: Exception) {
                if (isRunning.get()) {
                    callback.onError(e)
                }
            }
        }
    }
    
    private fun handlePacket(packet: DatagramPacket) {
        val clientAddress = packet.socketAddress as InetSocketAddress
        val data = packet.data.copyOfRange(0, packet.length)
        
        try {
            // 解析SOCKS5 UDP请求头
            val header = parseSocks5UdpHeader(data)
            
            // 获取或创建会话
            val session = clientSessions.computeIfAbsent(clientAddress) { addr ->
                createSession(addr, header.targetAddress, header.targetPort)
            }
            
            // 转发数据
            when (packet.socketAddress) {
                session.clientAddress -> {
                    // 来自客户端的数据，转发到目标服务器
                    val targetData = data.copyOfRange(header.headerLength, data.size)
                    session.forwardToTarget(targetData)
                }
                session.targetAddress -> {
                    // 来自目标服务器的数据，转发到客户端
                    val responseHeader = createUdpResponseHeader(
                        header.fragmentId,
                        session.targetAddress as InetSocketAddress
                    )
                    session.forwardToClient(responseHeader + data)
                }
            }
        } catch (e: Exception) {
            callback.onError(e)
        }
    }
    
    private fun createSession(
        clientAddress: InetSocketAddress,
        targetHost: String,
        targetPort: Int
    ): UdpSession {
        val targetAddress = InetSocketAddress(targetHost, targetPort)
        return UdpSession(
            clientAddress = clientAddress,
            targetAddress = targetAddress,
            relaySocket = relaySocket!!
        )
    }
    
    fun stop() {
        if (!isRunning.getAndSet(false)) {
            return
        }
        
        scope.cancel()
        clientSessions.clear()
        relaySocket?.close()
        relaySocket = null
    }
    
    private fun parseSocks5UdpHeader(data: ByteArray): UdpHeader {
        var offset = 0
        val rsv = ByteBuffer.wrap(data, offset, 2).short // RSV
        offset += 2
        val frag = data[offset++] // FRAG
        val atyp = data[offset++] // ATYP
        
        val targetAddress = when (atyp.toInt()) {
            1 -> { // IPv4
                val addr = ByteArray(4)
                System.arraycopy(data, offset, addr, 0, 4)
                offset += 4
                InetAddress.getByAddress(addr).hostAddress
            }
            3 -> { // Domain name
                val len = data[offset++].toInt() and 0xFF
                val domain = String(data, offset, len)
                offset += len
                domain
            }
            4 -> { // IPv6
                val addr = ByteArray(16)
                System.arraycopy(data, offset, addr, 0, 16)
                offset += 16
                InetAddress.getByAddress(addr).hostAddress
            }
            else -> throw IllegalArgumentException("Unsupported address type: $atyp")
        }
        
        val targetPort = ByteBuffer.wrap(data, offset, 2).short.toInt() and 0xFFFF
        offset += 2
        
        return UdpHeader(frag, targetAddress, targetPort, offset)
    }
    
    private fun createUdpResponseHeader(frag: Byte, targetAddress: InetSocketAddress): ByteArray {
        val buffer = ByteBuffer.allocate(10) // 固定使用IPv4地址格式
        buffer.putShort(0) // RSV
        buffer.put(frag) // FRAG
        buffer.put(1) // ATYP (IPv4)
        buffer.put(targetAddress.address.address) // 目标地址
        buffer.putShort(targetAddress.port.toShort()) // 目标端口
        return buffer.array()
    }
    
    data class UdpHeader(
        val fragmentId: Byte,
        val targetAddress: String,
        val targetPort: Int,
        val headerLength: Int
    )
}

class UdpSession(
    val clientAddress: InetSocketAddress,
    val targetAddress: InetSocketAddress,
    private val relaySocket: DatagramSocket
) {
    fun forwardToTarget(data: ByteArray) {
        val packet = DatagramPacket(
            data,
            data.size,
            targetAddress
        )
        relaySocket.send(packet)
    }
    
    fun forwardToClient(data: ByteArray) {
        val packet = DatagramPacket(
            data,
            data.size,
            clientAddress
        )
        relaySocket.send(packet)
    }
}

interface UdpRelayCallback {
    fun onServerStarted(port: Int)
    fun onError(error: Throwable)
}
