const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function initializeDatabase() {
    const pool = new Pool(config.database);

    try {
        // 读取并执行数据库迁移文件
        const migrationFiles = [
            'migrations.sql',
            'migrations_users.sql'
        ];

        for (const file of migrationFiles) {
            const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
            console.log(`Executing ${file}...`);
            await pool.query(sql);
            console.log(`${file} executed successfully`);
        }

        // 创建管理员用户
        const adminUser = {
            username: 'admin',
            email: 'admin@example.com',
            password: 'admin123' // 请在生产环境中更改
        };

        // 检查管理员用户是否已存在
        const existingAdmin = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [adminUser.username]
        );

        if (existingAdmin.rows.length === 0) {
            const bcrypt = require('bcrypt');
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(adminUser.password, salt);

            await pool.query(
                'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)',
                [adminUser.username, adminUser.email, passwordHash]
            );
            console.log('Admin user created successfully');
        }

        console.log('Database initialization completed successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// 如果直接运行此文件，则执行初始化
if (require.main === module) {
    initializeDatabase().catch(console.error);
}

module.exports = initializeDatabase;
