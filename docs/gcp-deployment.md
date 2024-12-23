# Google Cloud Platform (GCP) 部署方案

## 1. GCP 资源规划

### 1.1 计算资源
#### 应用服务器 (Google Compute Engine)
- **实例类型**: e2-standard-4 (4 vCPU, 16GB 内存)
- **区域**: asia-east1 (台湾)
- **操作系统**: Ubuntu 20.04 LTS
- **磁盘**: 100GB SSD
- **网络**: Premium Tier

#### 数据库服务器 (Cloud SQL)
- **类型**: PostgreSQL 14
- **实例类型**: db-custom-8-32768 (8 vCPU, 32GB 内存)
- **存储**: 500GB SSD
- **高可用性**: 启用故障转移副本
- **自动备份**: 每日备份，保留7天

### 1.2 网络配置
#### VPC 网络
- **模式**: Custom mode
- **子网**:
  - 应用子网: 10.0.1.0/24
  - 数据库子网: 10.0.2.0/24
  - 代理服务子网: 10.0.3.0/24

#### Cloud Load Balancing
- **类型**: HTTPS Load Balancer
- **SSL 证书**: 托管的 SSL 证书
- **健康检查**: TCP 检查

### 1.3 安全配置
#### Cloud IAM
- 应用服务账号
- 数据库访问账号
- 监控账号

#### Cloud Armor
- DDoS 防护
- Web 应用防火墙
- IP 白名单

### 1.4 监控和日志
#### Cloud Monitoring
- CPU 使用率
- 内存使用率
- 磁盘 I/O
- 网络流量

#### Cloud Logging
- 应用日志
- 数据库日志
- 负载均衡器日志
- 安全审计日志

## 2. 部署步骤

### 2.1 前期准备
1. **创建 GCP 项目**
```bash
gcloud projects create [PROJECT_ID] --name="Browser Extension System"
gcloud config set project [PROJECT_ID]
```

2. **启用必要的 API**
```bash
gcloud services enable compute.googleapis.com
gcloud services enable sql-component.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
```

### 2.2 网络设置
1. **创建 VPC 网络**
```bash
gcloud compute networks create extension-network --subnet-mode=custom

gcloud compute networks subnets create app-subnet \
    --network=extension-network \
    --region=asia-east1 \
    --range=10.0.1.0/24

gcloud compute networks subnets create db-subnet \
    --network=extension-network \
    --region=asia-east1 \
    --range=10.0.2.0/24
```

2. **配置防火墙规则**
```bash
# 允许内部通信
gcloud compute firewall-rules create allow-internal \
    --network=extension-network \
    --allow=tcp,udp,icmp \
    --source-ranges=10.0.0.0/16

# 允许外部 HTTPS 访问
gcloud compute firewall-rules create allow-https \
    --network=extension-network \
    --allow=tcp:443 \
    --target-tags=https-server
```

### 2.3 数据库部署
1. **创建 Cloud SQL 实例**
```bash
gcloud sql instances create extension-db \
    --database-version=POSTGRES_14 \
    --cpu=8 \
    --memory=32GB \
    --region=asia-east1 \
    --network=extension-network \
    --root-password=[YOUR_PASSWORD]
```

2. **创建数据库和用户**
```bash
gcloud sql databases create extension_db --instance=extension-db

gcloud sql users create extension_user \
    --instance=extension-db \
    --password=[USER_PASSWORD]
```

### 2.4 应用服务器部署
1. **创建计算引擎实例**
```bash
gcloud compute instances create extension-app \
    --machine-type=e2-standard-4 \
    --image-family=ubuntu-2004-lts \
    --image-project=ubuntu-os-cloud \
    --network=extension-network \
    --subnet=app-subnet \
    --tags=https-server \
    --metadata-from-file startup-script=startup.sh
```

2. **配置启动脚本 (startup.sh)**
```bash
#!/bin/bash
# 安装依赖
apt-get update
apt-get install -y nodejs npm nginx

# 克隆代码
git clone [YOUR_REPO_URL]
cd [REPO_DIR]

# 安装依赖
npm install

# 配置环境变量
cat > .env << EOL
DB_HOST=[CLOUD_SQL_IP]
DB_USER=extension_user
DB_PASSWORD=[USER_PASSWORD]
DB_NAME=extension_db
EOL

# 启动应用
npm run build
pm2 start server.js
```

### 2.5 负载均衡器配置
1. **创建实例组**
```bash
gcloud compute instance-groups managed create extension-group \
    --zone=asia-east1-a \
    --template=extension-template \
    --size=2
```

2. **配置负载均衡器**
```bash
# 创建健康检查
gcloud compute health-checks create tcp extension-health-check \
    --port=443

# 创建后端服务
gcloud compute backend-services create extension-backend \
    --protocol=HTTPS \
    --health-checks=extension-health-check \
    --global

# 创建 URL 映射
gcloud compute url-maps create extension-map \
    --default-service extension-backend

# 配置 SSL 证书
gcloud compute ssl-certificates create extension-cert \
    --domains=[YOUR_DOMAIN]
```

## 3. 持续集成/持续部署 (CI/CD)

### 3.1 Cloud Build 配置
```yaml
# cloudbuild.yaml
steps:
- name: 'gcr.io/cloud-builders/npm'
  args: ['install']
- name: 'gcr.io/cloud-builders/npm'
  args: ['test']
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', 'gcr.io/$PROJECT_ID/extension-app', '.']
- name: 'gcr.io/cloud-builders/docker'
  args: ['push', 'gcr.io/$PROJECT_ID/extension-app']
- name: 'gcr.io/cloud-builders/gke-deploy'
  args:
  - run
  - --filename=kubernetes.yaml
  - --location=asia-east1
  - --cluster=extension-cluster
```

### 3.2 自动化部署触发器
1. **配置 GitHub 触发器**
```bash
gcloud builds triggers create github \
    --repo-name=[REPO_NAME] \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml
```

## 4. 监控和告警设置

### 4.1 监控指标
1. **设置监控策略**
```bash
# CPU 使用率告警
gcloud monitoring policies create \
    --display-name="High CPU Usage" \
    --conditions="metric.type=\"compute.googleapis.com/instance/cpu/utilization\" resource.type=\"gce_instance\" threshold=0.8" \
    --notification-channels="email=[YOUR_EMAIL]"

# 内存使用率告警
gcloud monitoring policies create \
    --display-name="High Memory Usage" \
    --conditions="metric.type=\"compute.googleapis.com/instance/memory/utilization\" resource.type=\"gce_instance\" threshold=0.85" \
    --notification-channels="email=[YOUR_EMAIL]"
```

### 4.2 日志导出
```bash
# 设置日志导出到 BigQuery
gcloud logging sinks create extension-logs bigquery.googleapis.com/projects/[PROJECT_ID]/datasets/extension_logs \
    --log-filter="resource.type=gce_instance"
```

## 5. 灾难恢复计划

### 5.1 数据备份
1. **配置自动备份**
```bash
# 数据库备份
gcloud sql instances patch extension-db \
    --backup-start-time="23:00" \
    --enable-bin-log

# 设置跨区域复制
gcloud sql instances patch extension-db \
    --secondary-zone=asia-east2-a
```

### 5.2 恢复程序
1. **数据库恢复**
```bash
gcloud sql backups restore [BACKUP_ID] \
    --restore-instance=extension-db
```

2. **应用恢复**
```bash
# 从备份实例组部署
gcloud compute instance-groups managed rolling-action start-update extension-group \
    --version=template=extension-template
```

## 6. 成本优化建议

### 6.1 资源优化
- 使用预留实例折扣
- 配置自动扩缩容
- 使用合适的机器类型
- 优化存储使用

### 6.2 监控成本
- 设置预算告警
- 定期审查资源使用情况
- 删除未使用的资源

## 7. 安全最佳实践

### 7.1 网络安全
- 使用私有 IP
- 实施最小权限原则
- 定期更新安全补丁
- 启用 Cloud Armor 保护

### 7.2 访问控制
- 使用服务账号
- 启用双因素认证
- 定期轮换密钥
- 审计日志监控

## 8. 性能优化

### 8.1 应用优化
- 使用 CDN
- 配置缓存策略
- 优化数据库查询
- 使用连接池

### 8.2 扩展策略
- 配置自动扩缩容规则
- 使用负载均衡
- 实施缓存机制
- 优化后端服务
