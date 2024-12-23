package com.w3router.proxy.socks

import kotlinx.coroutines.*
import java.io.IOException
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

class Socks5Server(
    private val port: Int = 0,  // 0表示随机端口
    private val callback: Socks5Callback
) {
    private var serverSocket: ServerSocket? = null
    private var udpRelayServer: UdpRelayServer? = null
    private val isRunning = AtomicBoolean(false)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val connections = mutableSetOf<Socket>()
    
    fun start() {
        if (isRunning.getAndSet(true)) {
            return
        }
        
        scope.launch {
            try {
                serverSocket = ServerSocket(port)
                callback.onServerStarted(serverSocket?.localPort ?: 0)
                
                while (isRunning.get()) {
                    try {
                        val clientSocket = serverSocket?.accept() ?: break
                        handleConnection(clientSocket)
                    } catch (e: IOException) {
                        if (isRunning.get()) {
                            callback.onError(e)
                        }
                    }
                }
            } catch (e: Exception) {
                callback.onError(e)
            }
        }
    }
    
    private fun handleConnection(clientSocket: Socket) {
        scope.launch {
            try {
                connections.add(clientSocket)
                processAuthentication(clientSocket)
                val request = processRequest(clientSocket)
                
                when (request.command) {
                    Command.CONNECT -> handleConnect(clientSocket, request)
                    Command.BIND -> handleBind(clientSocket, request)
                    Command.UDP_ASSOCIATE -> handleUdpAssociate(clientSocket, request)
                }
            } catch (e: Exception) {
                callback.onError(e)
                closeSocket(clientSocket)
            } finally {
                connections.remove(clientSocket)
            }
        }
    }
    
    private fun processAuthentication(socket: Socket) {
        val input = socket.getInputStream()
        val output = socket.getOutputStream()
        
        // 读取版本和认证方法数量
        val version = input.read()
        if (version != 5) {
            throw IOException("Unsupported SOCKS version: $version")
        }
        
        val methodCount = input.read()
        val methods = ByteArray(methodCount)
        input.read(methods)
        
        // 目前支持无认证方式
        output.write(byteArrayOf(0x05, 0x00))
    }
    
    private fun processRequest(socket: Socket): Socks5Request {
        val input = socket.getInputStream()
        val buffer = ByteArray(4)
        input.read(buffer)
        
        // 检查SOCKS版本
        if (buffer[0] != 0x05.toByte()) {
            throw IOException("Invalid SOCKS version")
        }
        
        val command = Command.fromByte(buffer[1])
        // buffer[2] 是保留字节
        val addressType = AddressType.fromByte(buffer[3])
        
        // 读取目标地址
        val address = when (addressType) {
            AddressType.IPV4 -> {
                val ipBytes = ByteArray(4)
                input.read(ipBytes)
                InetAddress.getByAddress(ipBytes).hostAddress
            }
            AddressType.DOMAIN -> {
                val length = input.read()
                val domainBytes = ByteArray(length)
                input.read(domainBytes)
                String(domainBytes)
            }
            AddressType.IPV6 -> {
                val ipBytes = ByteArray(16)
                input.read(ipBytes)
                InetAddress.getByAddress(ipBytes).hostAddress
            }
        }
        
        // 读取端口号
        val portBytes = ByteArray(2)
        input.read(portBytes)
        val port = ByteBuffer.wrap(portBytes).short.toInt() and 0xFFFF
        
        return Socks5Request(command, addressType, address, port)
    }
    
    private fun handleConnect(clientSocket: Socket, request: Socks5Request) {
        try {
            // 连接目标服务器
            val targetSocket = Socket(request.address, request.port)
            
            // 发送成功响应
            sendResponse(clientSocket, ResponseStatus.SUCCESS)
            
            // 开始数据转发
            scope.launch {
                try {
                    forwardData(clientSocket, targetSocket)
                } finally {
                    closeSocket(targetSocket)
                }
            }
        } catch (e: Exception) {
            sendResponse(clientSocket, ResponseStatus.GENERAL_FAILURE)
            throw e
        }
    }
    
    private fun handleBind(clientSocket: Socket, request: Socks5Request) {
        // 暂不支持BIND命令
        sendResponse(clientSocket, ResponseStatus.COMMAND_NOT_SUPPORTED)
    }
    
    private fun handleUdpAssociate(clientSocket: Socket, request: Socks5Request) {
        try {
            // 创建UDP中继服务器
            udpRelayServer = UdpRelayServer(
                bindAddress = InetAddress.getByName("0.0.0.0"),
                port = 0, // 使用随机端口
                callback = object : UdpRelayCallback {
                    override fun onServerStarted(port: Int) {
                        // 发送UDP中继服务器地址和端口给客户端
                        val bindAddr = clientSocket.localAddress
                        sendUdpResponse(clientSocket, ResponseStatus.SUCCESS, bindAddr, port)
                    }
                    
                    override fun onError(error: Throwable) {
                        callback.onError(error)
                    }
                }
            )
            
            udpRelayServer?.start()
            
            // 保持TCP连接，直到客户端断开
            try {
                val buffer = ByteArray(1)
                while (clientSocket.getInputStream().read(buffer) != -1) {
                    // 当TCP连接断开时，停止UDP中继
                }
            } finally {
                udpRelayServer?.stop()
                udpRelayServer = null
            }
        } catch (e: Exception) {
            sendResponse(clientSocket, ResponseStatus.GENERAL_FAILURE)
            throw e
        }
    }
    
    private fun sendResponse(socket: Socket, status: ResponseStatus) {
        val response = ByteArray(10)
        response[0] = 0x05  // SOCKS版本
        response[1] = status.value
        response[2] = 0x00  // 保留字节
        response[3] = 0x01  // IPv4地址类型
        // 后面6个字节为绑定地址和端口，全部置0
        socket.getOutputStream().write(response)
    }
    
    private fun sendUdpResponse(
        socket: Socket,
        status: ResponseStatus,
        bindAddr: InetAddress,
        bindPort: Int
    ) {
        val response = ByteArray(10)
        response[0] = 0x05  // SOCKS版本
        response[1] = status.value
        response[2] = 0x00  // 保留字节
        response[3] = 0x01  // IPv4地址类型
        
        // 绑定地址
        System.arraycopy(bindAddr.address, 0, response, 4, 4)
        
        // 绑定端口
        response[8] = (bindPort shr 8).toByte()
        response[9] = (bindPort and 0xFF).toByte()
        
        socket.getOutputStream().write(response)
    }
    
    private suspend fun forwardData(client: Socket, target: Socket) = coroutineScope {
        val clientToTarget = async {
            val buffer = ByteArray(8192)
            try {
                while (isRunning.get()) {
                    val bytesRead = client.getInputStream().read(buffer)
                    if (bytesRead == -1) break
                    target.getOutputStream().write(buffer, 0, bytesRead)
                    target.getOutputStream().flush()
                }
            } catch (e: IOException) {
                if (isRunning.get()) throw e
            }
        }
        
        val targetToClient = async {
            val buffer = ByteArray(8192)
            try {
                while (isRunning.get()) {
                    val bytesRead = target.getInputStream().read(buffer)
                    if (bytesRead == -1) break
                    client.getOutputStream().write(buffer, 0, bytesRead)
                    client.getOutputStream().flush()
                }
            } catch (e: IOException) {
                if (isRunning.get()) throw e
            }
        }
        
        try {
            clientToTarget.await()
            targetToClient.await()
        } finally {
            closeSocket(client)
            closeSocket(target)
        }
    }
    
    fun stop() {
        isRunning.set(false)
        scope.cancel()
        
        udpRelayServer?.stop()
        udpRelayServer = null
        
        connections.forEach { socket ->
            closeSocket(socket)
        }
        connections.clear()
        
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            callback.onError(e)
        }
        serverSocket = null
    }
    
    private fun closeSocket(socket: Socket) {
        try {
            if (!socket.isClosed) {
                socket.close()
            }
        } catch (e: Exception) {
            callback.onError(e)
        }
    }
}
