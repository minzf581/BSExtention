import CONFIG from './config.js';

document.addEventListener('DOMContentLoaded', function() {
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
    let deviceId = localStorage.getItem('deviceId');

    // 初始化检查登录状态
    checkAuthStatus();

    // 标签切换
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if ((tabName === 'main' || tabName === 'points') && !deviceId) {
                return;
            }
            switchTab(tabName);
        });
    });

    // 注册表单提交
    registerForm.button.addEventListener('click', async () => {
        const username = registerForm.username.value.trim();
        const email = registerForm.email.value.trim();
        const password = registerForm.password.value;
        const referralCode = registerForm.referralCode.value.trim();

        if (!username || !email || !password) {
            registerForm.error.textContent = '请填写所有必填字段';
            return;
        }

        try {
            registerForm.button.disabled = true;
            const response = await chrome.runtime.sendMessage({
                action: 'register',
                data: {
                    username,
                    email,
                    password,
                    referralCode: referralCode || undefined
                }
            });

            if (response.success) {
                deviceId = localStorage.getItem('deviceId');
                showMainContainer();
                updateStatus(false);
            } else {
                registerForm.error.textContent = response.error || '注册失败，请重试';
            }
        } catch (error) {
            registerForm.error.textContent = '注册失败，请重试';
            console.error('Registration error:', error);
        } finally {
            registerForm.button.disabled = false;
        }
    });

    // 代理开关
    mainElements.toggleButton.addEventListener('click', async () => {
        try {
            mainElements.toggleButton.disabled = true;
            
            if (!isProxyActive) {
                const response = await chrome.runtime.sendMessage({
                    action: 'startProxy'
                });
                
                if (response.success) {
                    isProxyActive = true;
                    startTime = Date.now();
                    updateStatus(true);
                }
            } else {
                const response = await chrome.runtime.sendMessage({
                    action: 'stopProxy'
                });
                
                if (response.success) {
                    isProxyActive = false;
                    startTime = null;
                    updateStatus(false);
                }
            }
        } catch (error) {
            console.error('Toggle proxy error:', error);
        } finally {
            mainElements.toggleButton.disabled = false;
        }
    });

    // 注销
    mainElements.logoutButton.addEventListener('click', () => {
        if (isProxyActive) {
            chrome.runtime.sendMessage({ action: 'stopProxy' });
        }
        localStorage.clear();
        deviceId = null;
        showLoginContainer();
    });

    // 更新状态UI
    function updateStatus(connected) {
        mainElements.statusIndicator.className = connected ? 'status-on' : 'status-off';
        mainElements.statusText.textContent = connected ? '已连接' : '未连接';
        mainElements.toggleButton.textContent = connected ? '停止共享' : '开始共享';
        
        if (connected && startTime) {
            updateUptime();
            setInterval(updateUptime, 1000);
        }
    }

    // 更新在线时长
    function updateUptime() {
        if (!startTime) return;
        
        const duration = Math.floor((Date.now() - startTime) / 1000);
        const hours = Math.floor(duration / 3600);
        const minutes = Math.floor((duration % 3600) / 60);
        const seconds = duration % 60;
        
        mainElements.uptime.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // 更新统计信息
    function updateStats() {
        chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
            if (response.success) {
                const { traffic } = response.data;
                const totalTraffic = (traffic.upload + traffic.download) / (1024 * 1024 * 1024); // Convert to GB
                mainElements.bandwidthShared.textContent = totalTraffic.toFixed(2) + ' GB';
            }
        });
    }

    // 检查认证状态
    function checkAuthStatus() {
        if (deviceId) {
            showMainContainer();
            chrome.runtime.sendMessage({ action: 'getStats' }, (response) => {
                if (response.success && response.data.startTime) {
                    isProxyActive = true;
                    startTime = response.data.startTime;
                    updateStatus(true);
                } else {
                    updateStatus(false);
                }
            });
        } else {
            showLoginContainer();
        }
    }

    // 显示登录容器
    function showLoginContainer() {
        containers.forEach(container => {
            container.style.display = container.id === 'loginContainer' ? 'block' : 'none';
        });
        navTabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === 'login') {
                tab.classList.add('active');
            }
        });
    }

    // 显示主界面容器
    function showMainContainer() {
        containers.forEach(container => {
            container.style.display = container.id === 'mainContainer' ? 'block' : 'none';
        });
        navTabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === 'main') {
                tab.classList.add('active');
            }
        });
    }

    // 切换标签页
    function switchTab(tabName) {
        containers.forEach(container => {
            container.style.display = container.id === `${tabName}Container` ? 'block' : 'none';
        });
        navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
    }

    // 定时更新统计信息
    if (deviceId) {
        updateStats();
        setInterval(updateStats, 5000);
    }
});
