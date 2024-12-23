const net = require('net');
const dgram = require('dgram');
const Socks5Server = require('../server');

describe('Socks5Server', () => {
    let server;
    let serverAddress;

    beforeEach(async () => {
        server = new Socks5Server({ port: 0 }); // 使用随机端口
        await server.start();
        serverAddress = server.server.address();
    });

    afterEach(async () => {
        await server.stop();
    });

    test('should handle TCP CONNECT command', async () => {
        // 创建echo服务器
        const echoServer = await createEchoServer();
        const echoPort = echoServer.address().port;

        // 创建SOCKS5客户端连接
        const client = new net.Socket();
        await new Promise((resolve) => {
            client.connect(serverAddress.port, '127.0.0.1', resolve);
        });

        try {
            // 1. 认证阶段
            client.write(Buffer.from([
                0x05, // SOCKS version
                0x01, // Number of methods
                0x00  // NO AUTHENTICATION REQUIRED
            ]));

            const authResponse = await readExactly(client, 2);
            expect(authResponse[0]).toBe(0x05); // SOCKS version
            expect(authResponse[1]).toBe(0x00); // Selected method (NO AUTH)

            // 2. 请求阶段
            const connectRequest = Buffer.from([
                0x05, // SOCKS version
                0x01, // CONNECT command
                0x00, // Reserved
                0x01, // IPv4 address type
                127, 0, 0, 1, // localhost
                (echoPort >> 8) & 0xff, echoPort & 0xff // Port
            ]);
            client.write(connectRequest);

            const connectResponse = await readExactly(client, 10);
            expect(connectResponse[0]).toBe(0x05); // SOCKS version
            expect(connectResponse[1]).toBe(0x00); // Success

            // 3. 测试数据传输
            const testData = 'Hello, SOCKS5!';
            client.write(Buffer.from(testData));

            const response = await readExactly(client, testData.length);
            expect(response.toString()).toBe(testData);

        } finally {
            client.destroy();
            echoServer.close();
        }
    });

    test('should handle UDP ASSOCIATE command', async () => {
        // 创建SOCKS5客户端连接
        const client = new net.Socket();
        await new Promise((resolve) => {
            client.connect(serverAddress.port, '127.0.0.1', resolve);
        });

        try {
            // 1. 认证阶段
            client.write(Buffer.from([
                0x05, // SOCKS version
                0x01, // Number of methods
                0x00  // NO AUTHENTICATION REQUIRED
            ]));

            const authResponse = await readExactly(client, 2);
            expect(authResponse[0]).toBe(0x05);
            expect(authResponse[1]).toBe(0x00);

            // 2. UDP ASSOCIATE请求
            client.write(Buffer.from([
                0x05, // SOCKS version
                0x03, // UDP ASSOCIATE command
                0x00, // Reserved
                0x01, // IPv4 address type
                0, 0, 0, 0, // 0.0.0.0
                0, 0 // Port 0
            ]));

            const response = await readExactly(client, 10);
            expect(response[0]).toBe(0x05); // SOCKS version
            expect(response[1]).toBe(0x00); // Success

            // 获取UDP中继服务器端口
            const relayPort = (response[8] << 8) | response[9];

            // 3. 创建UDP echo服务器
            const echoServer = dgram.createSocket('udp4');
            await new Promise((resolve) => {
                echoServer.bind(0, '127.0.0.1', resolve);
            });

            const echoPort = echoServer.address().port;
            echoServer.on('message', (msg, rinfo) => {
                // Echo服务器简单地返回接收到的数据
                echoServer.send(msg, rinfo.port, rinfo.address);
            });

            // 4. 创建UDP客户端
            const udpClient = dgram.createSocket('udp4');

            try {
                // 构建UDP请求
                const testData = 'Hello, UDP!';
                const udpRequest = buildUdpRequest(testData, '127.0.0.1', echoPort);

                // 发送UDP数据到中继服务器
                await new Promise((resolve) => {
                    udpClient.send(udpRequest, relayPort, '127.0.0.1', resolve);
                });

                // 接收响应
                const response = await new Promise((resolve) => {
                    udpClient.once('message', (msg, rinfo) => {
                        resolve(msg);
                    });
                });

                // 解析响应数据
                const responseData = parseUdpResponse(response);
                expect(responseData.toString()).toBe(testData);

            } finally {
                udpClient.close();
                echoServer.close();
            }

        } finally {
            client.destroy();
        }
    });
});

// 辅助函数

async function createEchoServer() {
    const server = net.createServer((socket) => {
        socket.pipe(socket);
    });

    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });

    return server;
}

function readExactly(socket, length) {
    return new Promise((resolve, reject) => {
        const buffer = Buffer.alloc(length);
        let offset = 0;

        function onData(chunk) {
            const remaining = length - offset;
            const copyLength = Math.min(remaining, chunk.length);
            chunk.copy(buffer, offset, 0, copyLength);
            offset += copyLength;

            if (offset === length) {
                socket.removeListener('data', onData);
                resolve(buffer);
            }
        }

        socket.on('data', onData);
    });
}

function buildUdpRequest(data, targetHost, targetPort) {
    const addressBytes = Buffer.from(targetHost.split('.').map(Number));
    const header = Buffer.alloc(10);
    let offset = 0;

    // RSV
    header[offset++] = 0;
    header[offset++] = 0;

    // FRAG
    header[offset++] = 0;

    // ATYP (IPv4)
    header[offset++] = 1;

    // DST.ADDR
    addressBytes.copy(header, offset);
    offset += 4;

    // DST.PORT
    header[offset++] = (targetPort >> 8) & 0xff;
    header[offset] = targetPort & 0xff;

    return Buffer.concat([header, Buffer.from(data)]);
}

function parseUdpResponse(data) {
    // 跳过UDP响应头
    const headerLength = 10;
    return data.slice(headerLength);
}
