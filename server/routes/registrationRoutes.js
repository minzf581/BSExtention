const express = require('express');
const router = express.Router();
const registrationService = require('../services/RegistrationService');
const { validateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

// 处理新用户注册
router.post('/register', validateApiKey, async (req, res) => {
    try {
        const registrationData = req.body;
        
        // 添加IP地址
        registrationData.ipAddress = req.ip;
        
        // 添加注册时间
        registrationData.registrationTime = new Date().toISOString();
        
        // 添加到注册服务
        await registrationService.addRegistration(registrationData);
        
        res.status(200).json({
            message: 'Registration successful',
            deviceId: registrationData.deviceId
        });
    } catch (error) {
        logger.error('Error processing registration:', error);
        res.status(500).json({ error: 'Failed to process registration' });
    }
});

// 获取待处理的注册信息（仅供内部使用）
router.get('/pending', validateApiKey, async (req, res) => {
    try {
        const pendingRegistrations = registrationService.getPendingRegistrations();
        res.status(200).json(pendingRegistrations);
    } catch (error) {
        logger.error('Error getting pending registrations:', error);
        res.status(500).json({ error: 'Failed to get pending registrations' });
    }
});

// 强制立即上报所有待处理的注册信息
router.post('/force-report', validateApiKey, async (req, res) => {
    try {
        await registrationService.forceReportAll();
        res.status(200).json({ message: 'Force report triggered successfully' });
    } catch (error) {
        logger.error('Error triggering force report:', error);
        res.status(500).json({ error: 'Failed to trigger force report' });
    }
});

module.exports = router;
