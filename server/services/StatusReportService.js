const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const statsService = require('./StatsService');

class StatusReportService {
    constructor() {
        // 存储所有设备的状态
        this.deviceStatuses = new Map();
        // 启动定时上报任务
        this.startReportingTask();
    }

    // 更新设备状态
    updateDeviceStatus(deviceStatus) {
        const { deviceId } = deviceStatus;
        
        // 更新状态存储
        this.deviceStatuses.set(deviceId, {
            ...deviceStatus,
            lastUpdate: new Date().toISOString()
        });

        // 更新统计信息
        statsService.updateStats(deviceStatus);
    }

    // 移除设备状态
    removeDeviceStatus(deviceId) {
        const status = this.deviceStatuses.get(deviceId);
        if (status) {
            // 更新离线统计
            statsService.handleNodeOffline(status);
            this.deviceStatuses.delete(deviceId);
        }
    }

    // 获取所有设备状态
    getAllDeviceStatuses() {
        return Array.from(this.deviceStatuses.values());
    }

    // 开始定时上报任务
    startReportingTask() {
        // 每5分钟执行一次批量上报
        setInterval(() => {
            this.reportBatchStatus();
        }, 5 * 60 * 1000);
    }

    // 批量上报状态
    async reportBatchStatus() {
        try {
            const statuses = this.getAllDeviceStatuses();
            if (statuses.length === 0) {
                return;
            }

            // 转换为系统API要求的格式
            const nodes = statuses.map(status => ({
                deviceId: status.deviceId,
                username: status.username,
                status: status.status,
                ipAddress: status.ipAddress,
                duration: status.duration,
                traffic: status.traffic,
                reportType: 'daily'
            }));

            // 向系统API发送状态报告
            const response = await axios.post(
                `${config.MAIN_SYSTEM_API}/proxy/report/batch`,
                { nodes },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': config.MAIN_SYSTEM_API_KEY
                    }
                }
            );

            if (response.status === 200) {
                logger.info(`Successfully reported ${nodes.length} device statuses to main system`);
                
                // 清理超过6小时未更新的设备状态
                this.cleanupStaleStatuses();
            } else {
                throw new Error(`Failed to report status: ${response.statusText}`);
            }
        } catch (error) {
            logger.error('Error reporting batch status:', error);
        }
    }

    // 清理过期的状态数据
    cleanupStaleStatuses() {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        
        for (const [deviceId, status] of this.deviceStatuses.entries()) {
            const lastUpdate = new Date(status.lastUpdate);
            if (lastUpdate < sixHoursAgo) {
                // 更新离线统计
                statsService.handleNodeOffline(status);
                this.deviceStatuses.delete(deviceId);
                logger.info(`Cleaned up stale status for device: ${deviceId}`);
            }
        }
    }

    // 立即触发状态上报
    async forceStatusReport() {
        await this.reportBatchStatus();
    }
}

// 创建单例实例
const statusReportService = new StatusReportService();

module.exports = statusReportService;
