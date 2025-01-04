const logger = require('../utils/logger');

class StatsService {
    constructor() {
        // 用于存储节点统计信息
        this.stats = {
            online: {
                count: 0,
                totalUploadBytes: 0,
                totalDownloadBytes: 0,
                totalOnlineTime: 0
            },
            offline: {
                count: 0,
                totalUploadBytes: 0,
                totalDownloadBytes: 0,
                totalOnlineTime: 0
            }
        };
    }

    // 更新节点统计信息
    updateStats(nodeStatus) {
        const status = nodeStatus.status;
        const stats = this.stats[status];

        if (!stats) {
            logger.error(`Invalid status: ${status}`);
            return;
        }

        // 更新计数
        stats.count++;

        // 更新流量统计
        if (nodeStatus.traffic) {
            stats.totalUploadBytes += nodeStatus.traffic.upload || 0;
            stats.totalDownloadBytes += nodeStatus.traffic.download || 0;
        }

        // 更新在线时长
        if (nodeStatus.duration) {
            stats.totalOnlineTime += nodeStatus.duration;
        }
    }

    // 节点离线时更新统计
    handleNodeOffline(nodeStatus) {
        // 减少在线节点计数
        this.stats.online.count = Math.max(0, this.stats.online.count - 1);
        // 增加离线节点计数
        this.stats.offline.count++;

        // 更新流量和时长统计
        if (nodeStatus.traffic) {
            this.stats.offline.totalUploadBytes += nodeStatus.traffic.upload || 0;
            this.stats.offline.totalDownloadBytes += nodeStatus.traffic.download || 0;
        }
        if (nodeStatus.duration) {
            this.stats.offline.totalOnlineTime += nodeStatus.duration;
        }
    }

    // 获取所有统计信息
    getStats() {
        return [
            {
                status: 'online',
                ...this.stats.online
            },
            {
                status: 'offline',
                ...this.stats.offline
            }
        ];
    }

    // 重置统计信息
    resetStats() {
        this.stats = {
            online: {
                count: 0,
                totalUploadBytes: 0,
                totalDownloadBytes: 0,
                totalOnlineTime: 0
            },
            offline: {
                count: 0,
                totalUploadBytes: 0,
                totalDownloadBytes: 0,
                totalOnlineTime: 0
            }
        };
    }
}

// 创建单例实例
const statsService = new StatsService();

module.exports = statsService;
