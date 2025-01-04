const express = require('express');
const router = express.Router();
const statusReportService = require('../services/StatusReportService');
const { validateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

// 更新设备状态
router.post('/update', validateApiKey, async (req, res) => {
    try {
        const deviceStatus = req.body;
        statusReportService.updateDeviceStatus(deviceStatus);
        res.status(200).json({ message: 'Status updated successfully' });
    } catch (error) {
        logger.error('Error updating device status:', error);
        res.status(500).json({ error: 'Failed to update device status' });
    }
});

// 设备离线通知
router.post('/offline', validateApiKey, async (req, res) => {
    try {
        const { deviceId } = req.body;
        statusReportService.removeDeviceStatus(deviceId);
        res.status(200).json({ message: 'Device marked as offline' });
    } catch (error) {
        logger.error('Error marking device as offline:', error);
        res.status(500).json({ error: 'Failed to mark device as offline' });
    }
});

// 获取所有设备状态（仅供内部使用）
router.get('/all', validateApiKey, async (req, res) => {
    try {
        const statuses = statusReportService.getAllDeviceStatuses();
        res.status(200).json(statuses);
    } catch (error) {
        logger.error('Error getting device statuses:', error);
        res.status(500).json({ error: 'Failed to get device statuses' });
    }
});

// 强制立即上报状态
router.post('/force-report', validateApiKey, async (req, res) => {
    try {
        await statusReportService.forceStatusReport();
        res.status(200).json({ message: 'Force report triggered successfully' });
    } catch (error) {
        logger.error('Error triggering force report:', error);
        res.status(500).json({ error: 'Failed to trigger force report' });
    }
});

module.exports = router;
