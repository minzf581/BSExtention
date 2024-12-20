document.addEventListener('DOMContentLoaded', function() {
    // 常量定义
    const API_BASE_URL = 'http://your-server-url.com/api';
    
    // DOM元素
    const navTabs = document.querySelectorAll('.nav-tab');
    const containers = document.querySelectorAll('.container');
    const loginForm = {
        username: document.getElementById('loginUsername'),
        password: document.getElementById('loginPassword'),
        error: document.getElementById('loginError'),
        button: document.getElementById('loginButton')
    };
    const registerForm = {
        username: document.getElementById('registerUsername'),
        email: document.getElementById('registerEmail'),
        password: document.getElementById('registerPassword'),
        referralCode: document.getElementById('referralCode'),
        error: document.getElementById('registerError'),
        button: document.getElementById('registerButton')
    };
    const mainElements = {
        statusIndicator: document.getElementById('connectionStatus'),
        statusText: document.getElementById('statusText'),
        bandwidthShared: document.getElementById('bandwidthShared'),
        activeConnections: document.getElementById('activeConnections'),
        uptime: document.getElementById('uptime'),
        toggleButton: document.getElementById('toggleProxy'),
        logoutButton: document.getElementById('logout')
    };
    const pointsElements = {
        current: document.getElementById('currentPoints'),
        totalReferrals: document.getElementById('totalReferrals'),
        totalEarned: document.getElementById('totalPointsEarned'),
        history: document.getElementById('pointsHistory'),
        referralCode: document.getElementById('myReferralCode'),
        copyButton: document.getElementById('copyReferralCode')
    };

    let isProxyActive = false;
    let startTime = null;
    let authToken = localStorage.getItem('authToken');

    // 初始化检查登录状态
    checkAuthStatus();

    // 标签切换
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if ((tabName === 'main' || tabName === 'points') && !authToken) {
                return; // 未登录不能访问这些页面
            }
            
            navTabs.forEach(t => t.classList.remove('active'));
            containers.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tabName + 'Container').classList.add('active');
        });
    });

    // 登录表单提交
    loginForm.button.addEventListener('click', async () => {
        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                authToken = data.token;
                localStorage.setItem('authToken', authToken);
                localStorage.setItem('username', data.user.username);
                showMainContainer();
                updatePointsData();
            } else {
                loginForm.error.textContent = data.error || '登录失败';
            }
        } catch (error) {
            loginForm.error.textContent = '网络错误，请稍后重试';
        }
    });

    // 注册表单提交
    registerForm.button.addEventListener('click', async () => {
        const username = registerForm.username.value;
        const email = registerForm.email.value;
        const password = registerForm.password.value;
        const referralCode = registerForm.referralCode.value;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password, referralCode })
            });

            const data = await response.json();
            if (response.ok) {
                showLoginContainer();
                registerForm.error.textContent = '注册成功，请登录';
                registerForm.error.style.color = '#4CAF50';
            } else {
                registerForm.error.textContent = data.error || '注册失败';
            }
        } catch (error) {
            registerForm.error.textContent = '网络错误，请稍后重试';
        }
    });

    // 退出登录
    mainElements.logoutButton.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('username');
        authToken = null;
        showLoginContainer();
    });

    // 复制推荐码
    pointsElements.copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(pointsElements.referralCode.value)
            .then(() => {
                pointsElements.copyButton.textContent = '已复制';
                setTimeout(() => {
                    pointsElements.copyButton.textContent = '复制推荐码';
                }, 2000);
            });
    });

    // 代理开关
    mainElements.toggleButton.addEventListener('click', function() {
        if (!authToken) {
            showLoginContainer();
            return;
        }

        isProxyActive = !isProxyActive;
        
        if (isProxyActive) {
            startTime = Date.now();
            chrome.runtime.sendMessage({ 
                action: 'startProxy',
                token: authToken
            });
        } else {
            startTime = null;
            chrome.runtime.sendMessage({ 
                action: 'stopProxy',
                token: authToken
            });
        }
        
        updateStatus(isProxyActive);
    });

    // 更新状态UI
    function updateStatus(connected) {
        mainElements.statusIndicator.className = `status ${connected ? 'online' : 'offline'}`;
        mainElements.statusText.textContent = connected ? '已连接' : '未连接';
        mainElements.toggleButton.textContent = connected ? '停止共享' : '开始共享';
    }

    // 更新统计信息
    function updateStats(data) {
        if (data.bandwidthUsed) {
            mainElements.bandwidthShared.textContent = `${(data.bandwidthUsed / (1024 * 1024)).toFixed(2)} MB`;
        }
        if (data.connections) {
            mainElements.activeConnections.textContent = data.connections;
        }
        if (startTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(elapsed / 3600);
            const minutes = Math.floor((elapsed % 3600) / 60);
            const seconds = elapsed % 60;
            mainElements.uptime.textContent = `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // 更新积分信息
    async function updatePointsData() {
        if (!authToken) return;

        try {
            const response = await fetch(`${API_BASE_URL}/auth/points`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            const data = await response.json();
            if (response.ok) {
                pointsElements.current.textContent = data.currentPoints;
                pointsElements.totalReferrals.textContent = data.totalReferrals;
                pointsElements.totalEarned.textContent = data.totalPointsEarned;
                pointsElements.referralCode.value = localStorage.getItem('username');

                // 更新积分历史
                pointsElements.history.innerHTML = data.recentHistory
                    .map(item => `
                        <div class="history-item">
                            ${item.points_change > 0 ? '+' : ''}${item.points_change} 积分
                            (${item.reason})
                            - ${new Date(item.created_at).toLocaleDateString()}
                        </div>
                    `)
                    .join('');
            }
        } catch (error) {
            console.error('Failed to fetch points data:', error);
        }
    }

    // 检查认证状态
    function checkAuthStatus() {
        if (authToken) {
            showMainContainer();
            updatePointsData();
        } else {
            showLoginContainer();
        }
    }

    // 显示登录容器
    function showLoginContainer() {
        navTabs.forEach(t => t.classList.remove('active'));
        containers.forEach(c => c.classList.remove('active'));
        
        document.querySelector('[data-tab="login"]').classList.add('active');
        document.getElementById('loginContainer').classList.add('active');
    }

    // 显示主界面容器
    function showMainContainer() {
        navTabs.forEach(t => t.classList.remove('active'));
        containers.forEach(c => c.classList.remove('active'));
        
        document.querySelector('[data-tab="main"]').classList.add('active');
        document.getElementById('mainContainer').classList.add('active');
    }

    // 监听来自background script的消息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'statsUpdate') {
            updateStats(message.data);
        } else if (message.type === 'connectionStatus') {
            updateStatus(message.connected);
        } else if (message.type === 'pointsUpdate') {
            updatePointsData();
        }
    });

    // 定期更新统计信息
    setInterval(() => {
        if (startTime) {
            updateStats({});
        }
    }, 1000);

    // 定期更新积分信息
    setInterval(() => {
        if (authToken) {
            updatePointsData();
        }
    }, 60000); // 每分钟更新一次

    // 初始化时获取当前状态
    chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
        if (response) {
            isProxyActive = response.isActive;
            updateStatus(isProxyActive);
            if (isProxyActive) {
                startTime = response.startTime;
                updateStats(response.stats);
            }
        }
    });
});
