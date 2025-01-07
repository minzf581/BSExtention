# IP Proxy Backend Environment Setup Guide

## 目录
1. [环境要求](#环境要求)
2. [系统架构](#系统架构)
3. [安装步骤](#安装步骤)
4. [配置说明](#配置说明)
5. [调试指南](#调试指南)
6. [常见问题](#常见问题)

## 环境要求

### 基础环境
- Node.js >= 16.x
- MongoDB >= 4.4
- Redis >= 6.0
- PM2 (用于进程管理)

### 系统配置建议
- CPU: 4核心及以上
- 内存: 8GB及以上
- 硬盘: 50GB及以上
- 操作系统: Ubuntu 20.04 LTS 或 CentOS 8.x

## 系统架构

整个IP代理后台系统主要包含以下组件：
- API服务层：处理客户端请求
- 代理管理模块：管理和监控代理IP
- 数据存储层：存储代理IP信息和用户数据
- 任务调度模块：定时检测代理IP有效性
- 监控模块：系统运行状态监控

## 安装步骤

### 1. 安装基础环境
```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 MongoDB
sudo apt-get install -y mongodb

# 安装 Redis
sudo apt-get install -y redis-server

# 安装 PM2
npm install -g pm2
```

### 2. 克隆项目
```bash
git clone <project-repository-url>
cd <project-directory>
```

### 3. 安装依赖
```bash
npm install
```

### 4. 配置环境变量
创建 `.env` 文件并配置以下参数：
```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/proxy_db
REDIS_URL=redis://localhost:6379
API_KEY=your_api_key
```

### 5. 初始化数据库
```bash
npm run db:init
```

### 6. 启动服务
```bash
pm2 start ecosystem.config.js
```

## 配置说明

### 数据库配置
MongoDB配置文件位置：`/etc/mongodb.conf`
主要配置项：
- 数据库路径
- 日志路径
- 访问权限
- 连接池大小

### Redis配置
Redis配置文件位置：`/etc/redis/redis.conf`
关键配置项：
- 内存限制
- 持久化策略
- 密码设置

### 应用配置
配置文件位置：`config/default.js`
可配置项：
- 服务端口
- 数据库连接
- 日志级别
- 代理检测间隔
- API限流设置

## 调试指南

### 日志查看
```bash
# 查看应用日志
pm2 logs

# 查看错误日志
tail -f logs/error.log

# 查看访问日志
tail -f logs/access.log
```

### 常用调试命令
```bash
# 检查服务状态
pm2 status

# 重启服务
pm2 restart all

# 监控资源使用
pm2 monit
```

### 性能分析
1. 使用 Node.js 内置性能分析工具
```bash
node --prof app.js
```

2. 使用 Chrome DevTools 进行性能分析
```bash
node --inspect app.js
```

## 常见问题

### 1. 服务无法启动
检查项：
- 端口是否被占用
- 数据库连接是否正常
- 环境变量是否配置正确

### 2. 代理IP检测失败
检查项：
- 网络连接是否正常
- 检测超时设置是否合理
- 目标网站是否有访问限制

### 3. 内存占用过高
解决方案：
- 检查内存泄漏
- 优化数据库查询
- 调整缓存策略

### 4. API响应慢
优化建议：
- 添加适当的索引
- 优化查询语句
- 使用缓存
- 增加负载均衡

### 5. 数据库连接问题
检查项：
- MongoDB服务是否运行
- 连接字符串是否正确
- 防火墙设置
- 认证信息
