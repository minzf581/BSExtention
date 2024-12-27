package com.w3router.proxy

data class ProxyMessage(
    val type: MessageType,
    val connectionId: String,
    val targetHost: String? = null,
    val targetPort: Int = 0,
    val data: ByteArray = ByteArray(0),
    val error: String? = null,
    val deviceInfo: DeviceInfo? = null,
    val pointsInfo: PointsInfo? = null
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as ProxyMessage

        if (type != other.type) return false
        if (connectionId != other.connectionId) return false
        if (targetHost != other.targetHost) return false
        if (targetPort != other.targetPort) return false
        if (!data.contentEquals(other.data)) return false
        if (error != other.error) return false
        if (deviceInfo != other.deviceInfo) return false
        if (pointsInfo != other.pointsInfo) return false

        return true
    }

    override fun hashCode(): Int {
        var result = type.hashCode()
        result = 31 * result + connectionId.hashCode()
        result = 31 * result + (targetHost?.hashCode() ?: 0)
        result = 31 * result + targetPort
        result = 31 * result + data.contentHashCode()
        result = 31 * result + (error?.hashCode() ?: 0)
        result = 31 * result + (deviceInfo?.hashCode() ?: 0)
        result = 31 * result + (pointsInfo?.hashCode() ?: 0)
        return result
    }
}

data class DeviceInfo(
    val id: String,
    val type: String,
    val version: String,
    val capabilities: List<String>
)

data class PointsInfo(
    val points: Long,                // 当前积分
    val ipQuality: Int,             // IP质量等级 (1-5)
    val connectionTime: Long,        // 连接时长（秒）
    val pointsRate: Double,         // 积分获取速率（点/小时）
    val lastUpdateTime: Long        // 最后更新时间
)

enum class MessageType {
    INIT,
    NEW_CONNECTION,
    DATA,
    CLOSE,
    ERROR,
    PING,
    PONG,
    POINTS_UPDATE    // 新增积分更新消息类型
}
