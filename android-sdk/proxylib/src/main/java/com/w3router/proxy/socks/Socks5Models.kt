package com.w3router.proxy.socks

enum class Command(val value: Byte) {
    CONNECT(0x01),
    BIND(0x02),
    UDP_ASSOCIATE(0x03);
    
    companion object {
        fun fromByte(byte: Byte): Command {
            return values().find { it.value == byte }
                ?: throw IllegalArgumentException("Unknown command: $byte")
        }
    }
}

enum class AddressType(val value: Byte) {
    IPV4(0x01),
    DOMAIN(0x03),
    IPV6(0x04);
    
    companion object {
        fun fromByte(byte: Byte): AddressType {
            return values().find { it.value == byte }
                ?: throw IllegalArgumentException("Unknown address type: $byte")
        }
    }
}

enum class ResponseStatus(val value: Byte) {
    SUCCESS(0x00),
    GENERAL_FAILURE(0x01),
    CONNECTION_NOT_ALLOWED(0x02),
    NETWORK_UNREACHABLE(0x03),
    HOST_UNREACHABLE(0x04),
    CONNECTION_REFUSED(0x05),
    TTL_EXPIRED(0x06),
    COMMAND_NOT_SUPPORTED(0x07),
    ADDRESS_TYPE_NOT_SUPPORTED(0x08)
}

data class Socks5Request(
    val command: Command,
    val addressType: AddressType,
    val address: String,
    val port: Int
)

interface Socks5Callback {
    fun onServerStarted(port: Int)
    fun onError(error: Throwable)
}
