package com.w3router.proxy.socks

import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.net.*
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.fail

class Socks5ServerTest {
    private lateinit var server: Socks5Server
    private var serverPort: Int = 0
    private val testTimeout = 5000L // 5秒超时

    @Before
    fun setup() {
        val latch = CountDownLatch(1)
        
        server = Socks5Server(0, object : Socks5Callback {
            override fun onServerStarted(port: Int) {
                serverPort = port
                latch.countDown()
            }
            
            override fun onError(error: Throwable) {
                fail("Server error: ${error.message}")
            }
        })
        
        server.start()
        assertTrue(latch.await(testTimeout, TimeUnit.MILLISECONDS), "Server failed to start")
    }

    @After
    fun tearDown() {
        server.stop()
    }

    @Test
    fun `test TCP connection through SOCKS5`() {
        val socket = Socket()
        socket.connect(InetSocketAddress("127.0.0.1", serverPort))

        try {
            // 1. 认证阶段
            val out = socket.getOutputStream()
            val input = socket.getInputStream()

            // 发送认证方法
            out.write(byteArrayOf(
                0x05, // SOCKS version
                0x01, // Number of methods
                0x00  // NO AUTHENTICATION REQUIRED
            ))
            
            // 读取认证响应
            val authResponse = ByteArray(2)
            input.read(authResponse)
            assertEquals(0x05, authResponse[0]) // SOCKS version
            assertEquals(0x00, authResponse[1]) // Selected method (NO AUTH)

            // 2. 请求阶段 - 连接到echo服务器
            val echoServer = createEchoServer()
            val echoPort = (echoServer.localSocketAddress as InetSocketAddress).port

            // 发送连接请求
            out.write(byteArrayOf(
                0x05, // SOCKS version
                0x01, // CONNECT command
                0x00, // Reserved
                0x01, // IPv4 address type
                127, 0, 0, 1, // localhost
                (echoPort shr 8).toByte(), echoPort.toByte() // Port
            ))

            // 读取连接响应
            val connectResponse = ByteArray(10)
            input.read(connectResponse)
            assertEquals(0x05, connectResponse[0]) // SOCKS version
            assertEquals(0x00, connectResponse[1]) // Success

            // 3. 测试数据传输
            val testData = "Hello, SOCKS5!"
            out.write(testData.toByteArray())
            
            // 读取echo响应
            val response = ByteArray(testData.length)
            input.read(response)
            assertEquals(testData, String(response))

        } finally {
            socket.close()
        }
    }

    @Test
    fun `test UDP forwarding through SOCKS5`() = runBlocking {
        val socket = Socket()
        socket.connect(InetSocketAddress("127.0.0.1", serverPort))
        
        try {
            val out = socket.getOutputStream()
            val input = socket.getInputStream()

            // 1. 认证阶段
            out.write(byteArrayOf(
                0x05, // SOCKS version
                0x01, // Number of methods
                0x00  // NO AUTHENTICATION REQUIRED
            ))
            
            val authResponse = ByteArray(2)
            input.read(authResponse)

            // 2. 请求UDP ASSOCIATE
            out.write(byteArrayOf(
                0x05, // SOCKS version
                0x03, // UDP ASSOCIATE command
                0x00, // Reserved
                0x01, // IPv4 address type
                0, 0, 0, 0, // 0.0.0.0
                0, 0 // Port 0
            ))

            // 读取UDP中继服务器地址和端口
            val response = ByteArray(10)
            input.read(response)
            assertEquals(0x05, response[0]) // SOCKS version
            assertEquals(0x00, response[1]) // Success

            // 获取UDP中继服务器端口
            val relayPort = ((response[8].toInt() and 0xFF) shl 8) or (response[9].toInt() and 0xFF)

            // 3. 创建UDP socket并测试数据转发
            val udpSocket = DatagramSocket()
            val echoServer = createUdpEchoServer()
            val echoPort = (echoServer.localSocketAddress as InetSocketAddress).port

            // 构建UDP请求
            val testData = "Hello, UDP!"
            val udpRequest = buildUdpRequest(testData, "127.0.0.1", echoPort)
            
            // 发送UDP数据到中继服务器
            val packet = DatagramPacket(
                udpRequest,
                udpRequest.size,
                InetAddress.getByName("127.0.0.1"),
                relayPort
            )
            udpSocket.send(packet)

            // 接收响应
            val receiveBuffer = ByteArray(1024)
            val receivePacket = DatagramPacket(receiveBuffer, receiveBuffer.size)
            udpSocket.receive(receivePacket)

            // 解析响应数据
            val responseData = parseUdpResponse(
                receivePacket.data,
                receivePacket.offset,
                receivePacket.length
            )
            assertEquals(testData, responseData)

        } finally {
            socket.close()
        }
    }

    private fun createEchoServer(): ServerSocket {
        val server = ServerSocket(0)
        Thread {
            try {
                val client = server.accept()
                val buffer = ByteArray(1024)
                val read = client.getInputStream().read(buffer)
                if (read > 0) {
                    client.getOutputStream().write(buffer, 0, read)
                }
                client.close()
            } finally {
                server.close()
            }
        }.start()
        return server
    }

    private fun createUdpEchoServer(): DatagramSocket {
        val server = DatagramSocket()
        Thread {
            try {
                val buffer = ByteArray(1024)
                val packet = DatagramPacket(buffer, buffer.size)
                server.receive(packet)
                
                // Echo back
                val response = DatagramPacket(
                    packet.data,
                    packet.length,
                    packet.address,
                    packet.port
                )
                server.send(response)
            } finally {
                server.close()
            }
        }.start()
        return server
    }

    private fun buildUdpRequest(data: String, targetHost: String, targetPort: Int): ByteArray {
        val addressBytes = InetAddress.getByName(targetHost).address
        val header = ByteArray(10) // UDP请求头
        var offset = 0
        
        // RSV
        header[offset++] = 0
        header[offset++] = 0
        
        // FRAG
        header[offset++] = 0
        
        // ATYP (IPv4)
        header[offset++] = 1
        
        // DST.ADDR
        System.arraycopy(addressBytes, 0, header, offset, 4)
        offset += 4
        
        // DST.PORT
        header[offset++] = (targetPort shr 8).toByte()
        header[offset] = targetPort.toByte()

        // 组合头部和数据
        return header + data.toByteArray()
    }

    private fun parseUdpResponse(data: ByteArray, offset: Int, length: Int): String {
        // 跳过UDP响应头
        val headerLength = 10 // 固定长度的UDP响应头
        return String(data, offset + headerLength, length - headerLength)
    }
}
