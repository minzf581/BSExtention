const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class RegistrationService {
    constructor() {
        this.pendingRegistrations = new Map();
        // 启动定时上报任务
        this.startReportingTask();
    }

    // 添加新的注册信息
    async addRegistration(registrationData) {
        const {
            username,
            deviceId,
            deviceType,
            referralCode,
            ipAddress,
            registrationTime
        } = registrationData;

        // 存储注册信息
        this.pendingRegistrations.set(deviceId, {
            username,
            deviceId,
            deviceType,
            referralCode,
            ipAddress,
            registrationTime: registrationTime || new Date().toISOString(),
            status: 'pending'
        });

        // 尝试立即上报
        await this.reportRegistration(deviceId);
    }

    // 上报单个注册信息
    async reportRegistration(deviceId) {
        const registration = this.pendingRegistrations.get(deviceId);
        if (!registration) {
            return;
        }

        try {
            // 转换为系统API要求的格式
            const registrationPayload = {
                username: registration.username,
                deviceId: registration.deviceId,
                deviceType: registration.deviceType,
                referralCode: registration.referralCode,
                ipAddress: registration.ipAddress,
                registrationTime: registration.registrationTime
            };

            // 向系统API发送注册信息
            const response = await axios.post(
                `${config.MAIN_SYSTEM_API}/proxy/register`,
                registrationPayload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': config.MAIN_SYSTEM_API_KEY
                    }
                }
            );

            if (response.status === 200) {
                logger.info(`Successfully reported registration for device: ${deviceId}`);
                // 移除已上报的注册信息
                this.pendingRegistrations.delete(deviceId);
                return true;
            } else {
                throw new Error(`Failed to report registration: ${response.statusText}`);
            }
        } catch (error) {
            logger.error(`Error reporting registration for device ${deviceId}:`, error);
            // 标记为失败，等待下次重试
            const registration = this.pendingRegistrations.get(deviceId);
            if (registration) {
                registration.lastError = error.message;
                registration.retryCount = (registration.retryCount || 0) + 1;
            }
            return false;
        }
    }

    // 批量上报注册信息
    async reportBatchRegistrations() {
        const registrations = Array.from(this.pendingRegistrations.values());
        if (registrations.length === 0) {
            return;
        }

        try {
            // 过滤出需要重试的注册（重试次数小于最大重试次数）
            const retriableRegistrations = registrations.filter(
                reg => (reg.retryCount || 0) < config.MAX_RETRY_ATTEMPTS
            );

            if (retriableRegistrations.length === 0) {
                // 清理所有超过重试次数的注册
                this.cleanupFailedRegistrations();
                return;
            }

            // 转换为系统API要求的格式
            const registrationPayload = retriableRegistrations.map(reg => ({
                username: reg.username,
                deviceId: reg.deviceId,
                deviceType: reg.deviceType,
                referralCode: reg.referralCode,
                ipAddress: reg.ipAddress,
                registrationTime: reg.registrationTime
            }));

            // 向系统API发送批量注册信息
            const response = await axios.post(
                `${config.MAIN_SYSTEM_API}/proxy/register/batch`,
                { registrations: registrationPayload },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': config.MAIN_SYSTEM_API_KEY
                    }
                }
            );

            if (response.status === 200) {
                logger.info(`Successfully reported ${retriableRegistrations.length} registrations`);
                // 移除已上报的注册信息
                retriableRegistrations.forEach(reg => {
                    this.pendingRegistrations.delete(reg.deviceId);
                });
            } else {
                throw new Error(`Failed to report batch registrations: ${response.statusText}`);
            }
        } catch (error) {
            logger.error('Error reporting batch registrations:', error);
            // 更新所有失败的注册信息的重试计数
            registrations.forEach(reg => {
                reg.lastError = error.message;
                reg.retryCount = (reg.retryCount || 0) + 1;
            });
        }
    }

    // 开始定时上报任务
    startReportingTask() {
        // 每1分钟检查一次待上报的注册信息
        setInterval(() => {
            this.reportBatchRegistrations();
        }, 60 * 1000);
    }

    // 清理失败的注册信息
    cleanupFailedRegistrations() {
        for (const [deviceId, registration] of this.pendingRegistrations.entries()) {
            if ((registration.retryCount || 0) >= config.MAX_RETRY_ATTEMPTS) {
                logger.warn(`Removing failed registration for device ${deviceId} after ${registration.retryCount} attempts`);
                this.pendingRegistrations.delete(deviceId);
            }
        }
    }

    // 获取待处理的注册信息
    getPendingRegistrations() {
        return Array.from(this.pendingRegistrations.values());
    }

    // 强制立即上报所有待处理的注册信息
    async forceReportAll() {
        await this.reportBatchRegistrations();
    }
}

// 创建单例实例
const registrationService = new RegistrationService();

module.exports = registrationService;
