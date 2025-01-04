const express = require('express');
const router = express.Router();
const statsService = require('../services/StatsService');
const { validateApiKey } = require('../middleware/auth');
const logger = require('../utils/logger');

// 获取节点统计信息
router.get('/stats', validateApiKey, async (req, res) => {
    try {
        const stats = statsService.getStats();
        res.status(200).json({
            code: 200,
            message: 'success',
            data: stats
        });
    } catch (error) {
        logger.error('Error getting stats:', error);
        res.status(500).json({
            code: 500,
            message: 'Failed to get stats',
            error: error.message
        });
    }
});

// 重置统计信息（仅供内部使用）
router.post('/stats/reset', validateApiKey, async (req, res) => {
    try {
        statsService.resetStats();
        res.status(200).json({
            code: 200,
            message: 'Stats reset successfully'
        });
    } catch (error) {
        logger.error('Error resetting stats:', error);
        res.status(500).json({
            code: 500,
            message: 'Failed to reset stats',
            error: error.message
        });
    }
});

module.exports = router;
