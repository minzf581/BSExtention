const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// 用户注册
router.post('/register', async (req, res) => {
    const { username, email, password, referralCode } = req.body;

    try {
        // 检查用户名和邮箱是否已存在
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE username = $1 OR email = $2',
            [username, email]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // 加密密码
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 开始事务
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 创建新用户
            const newUser = await client.query(
                'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
                [username, email, passwordHash]
            );

            // 处理推荐关系
            if (referralCode) {
                const referrer = await client.query(
                    'SELECT id FROM users WHERE username = $1',
                    [referralCode]
                );

                if (referrer.rows.length > 0) {
                    // 创建推荐关系
                    await client.query(
                        'INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)',
                        [referrer.rows[0].id, newUser.rows[0].id]
                    );

                    // 给推荐人奖励积分
                    const REFERRAL_POINTS = 100;
                    await client.query(
                        'UPDATE users SET points = points + $1 WHERE id = $2',
                        [REFERRAL_POINTS, referrer.rows[0].id]
                    );

                    // 记录积分历史
                    await client.query(
                        'INSERT INTO points_history (user_id, points_change, reason) VALUES ($1, $2, $3)',
                        [referrer.rows[0].id, REFERRAL_POINTS, 'Referral bonus']
                    );
                }
            }

            await client.query('COMMIT');
            res.json({ message: 'Registration successful' });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 用户登录
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // 更新最后登录时间
        await pool.query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // 生成JWT令牌
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                points: user.points
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 获取用户积分信息
router.get('/points', async (req, res) => {
    try {
        const userId = req.user.id; // 从JWT中获取
        const result = await pool.query(
            `SELECT 
                u.points,
                (SELECT COUNT(*) FROM referrals WHERE referrer_id = $1) as total_referrals,
                (SELECT SUM(points_change) FROM points_history WHERE user_id = $1) as total_points_earned
            FROM users u
            WHERE u.id = $1`,
            [userId]
        );

        const pointsHistory = await pool.query(
            `SELECT points_change, reason, created_at
            FROM points_history
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 10`,
            [userId]
        );

        res.json({
            currentPoints: result.rows[0].points,
            totalReferrals: result.rows[0].total_referrals,
            totalPointsEarned: result.rows[0].total_points_earned,
            recentHistory: pointsHistory.rows
        });
    } catch (error) {
        console.error('Points fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
