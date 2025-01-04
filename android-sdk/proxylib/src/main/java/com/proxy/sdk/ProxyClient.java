package com.proxy.sdk;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.json.JSONObject;

import java.net.URI;
import java.util.Timer;
import java.util.TimerTask;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public class ProxyClient {
    private static final String TAG = "ProxyClient";
    private static final long HEARTBEAT_INTERVAL = 30000; // 30秒
    private static final long STATUS_REPORT_INTERVAL = 300000; // 5分钟
    private static final long RECONNECT_BASE_DELAY = 1000; // 1秒
    private static final long MAX_RECONNECT_DELAY = 30000; // 30秒

    private final Context context;
    private final String serverUrl;
    private final String apiKey;
    private final Handler mainHandler;
    private WebSocketClient webSocket;
    private Timer heartbeatTimer;
    private Timer statusReportTimer;
    private int reconnectAttempts = 0;
    private String deviceId;
    private ProxyStats proxyStats;
    private boolean isConnected = false;

    public ProxyClient(Context context, String serverUrl, String apiKey) {
        this.context = context.getApplicationContext();
        this.serverUrl = serverUrl;
        this.apiKey = apiKey;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.proxyStats = new ProxyStats();
        initDeviceId();
    }

    private void initDeviceId() {
        // 从SharedPreferences获取设备ID，如果没有则生成新的
        deviceId = context.getSharedPreferences("proxy_sdk", Context.MODE_PRIVATE)
                .getString("device_id", null);
        if (deviceId == null) {
            deviceId = "android_" + UUID.randomUUID().toString();
            context.getSharedPreferences("proxy_sdk", Context.MODE_PRIVATE)
                    .edit()
                    .putString("device_id", deviceId)
                    .apply();
        }
    }

    public void connect() {
        if (webSocket != null && webSocket.isOpen()) {
            return;
        }

        try {
            String url = String.format("%s?deviceId=%s&deviceType=android&apiKey=%s", 
                    serverUrl, deviceId, apiKey);
            webSocket = new WebSocketClient(new URI(url)) {
                @Override
                public void onOpen(ServerHandshake handshakedata) {
                    Log.i(TAG, "WebSocket connected");
                    isConnected = true;
                    reconnectAttempts = 0;
                    startHeartbeat();
                    startStatusReporting();
                    // 连接后立即发送一次状态
                    reportStatus();
                }

                @Override
                public void onMessage(String message) {
                    handleMessage(message);
                }

                @Override
                public void onClose(int code, String reason, boolean remote) {
                    Log.w(TAG, "WebSocket closed: " + code + " " + reason);
                    isConnected = false;
                    stopTimers();
                    scheduleReconnect();
                }

                @Override
                public void onError(Exception ex) {
                    Log.e(TAG, "WebSocket error", ex);
                    isConnected = false;
                }
            };
            webSocket.connect();
        } catch (Exception e) {
            Log.e(TAG, "Failed to create WebSocket", e);
        }
    }

    public void disconnect() {
        if (webSocket != null) {
            try {
                // 发送离线状态
                JSONObject statusData = new JSONObject();
                statusData.put("deviceId", deviceId);
                statusData.put("deviceType", "android");
                statusData.put("status", "offline");
                statusData.put("timestamp", System.currentTimeMillis());

                JSONObject message = new JSONObject();
                message.put("type", "status_report");
                message.put("data", statusData);

                webSocket.send(message.toString());
            } catch (Exception e) {
                Log.e(TAG, "Error sending offline status", e);
            }

            webSocket.close();
            webSocket = null;
        }
        stopTimers();
        isConnected = false;
    }

    private void startHeartbeat() {
        stopHeartbeat();
        heartbeatTimer = new Timer();
        heartbeatTimer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                if (webSocket != null && webSocket.isOpen()) {
                    try {
                        JSONObject heartbeat = new JSONObject();
                        heartbeat.put("type", "heartbeat");
                        JSONObject data = new JSONObject();
                        data.put("deviceId", deviceId);
                        data.put("deviceType", "android");
                        data.put("timestamp", System.currentTimeMillis());
                        heartbeat.put("data", data);
                        webSocket.send(heartbeat.toString());
                    } catch (Exception e) {
                        Log.e(TAG, "Error sending heartbeat", e);
                    }
                }
            }
        }, 0, HEARTBEAT_INTERVAL);
    }

    private void startStatusReporting() {
        stopStatusReporting();
        statusReportTimer = new Timer();
        statusReportTimer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
                reportStatus();
            }
        }, 0, STATUS_REPORT_INTERVAL);
    }

    private void reportStatus() {
        if (webSocket == null || !webSocket.isOpen()) return;

        try {
            JSONObject statusData = new JSONObject();
            statusData.put("deviceId", deviceId);
            statusData.put("deviceType", "android");
            statusData.put("status", "online");
            statusData.put("ipAddress", NetworkUtils.getPublicIP());
            statusData.put("duration", proxyStats.getDuration());
            
            JSONObject traffic = new JSONObject();
            traffic.put("upload", proxyStats.getUploadBytes());
            traffic.put("download", proxyStats.getDownloadBytes());
            statusData.put("traffic", traffic);
            
            statusData.put("timestamp", System.currentTimeMillis());

            JSONObject message = new JSONObject();
            message.put("type", "status_report");
            message.put("data", statusData);

            webSocket.send(message.toString());

            // 重置流量统计
            proxyStats.resetTraffic();
        } catch (Exception e) {
            Log.e(TAG, "Error reporting status", e);
        }
    }

    private void handleMessage(String message) {
        try {
            JSONObject json = new JSONObject(message);
            String type = json.getString("type");

            switch (type) {
                case "heartbeat_ack":
                    // 心跳确认
                    break;
                case "force_report":
                    // 服务器要求立即上报状态
                    reportStatus();
                    break;
                case "config_update":
                    // 处理配置更新
                    handleConfigUpdate(json.getJSONObject("data"));
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling message", e);
        }
    }

    private void handleConfigUpdate(JSONObject config) {
        try {
            if (config.has("statusReportInterval")) {
                long newInterval = config.getLong("statusReportInterval");
                if (newInterval > 0) {
                    // 重启状态上报定时器
                    startStatusReporting();
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling config update", e);
        }
    }

    private void scheduleReconnect() {
        long delay = Math.min(RECONNECT_BASE_DELAY * (1L << reconnectAttempts), MAX_RECONNECT_DELAY);
        reconnectAttempts++;

        mainHandler.postDelayed(() -> {
            if (!isConnected) {
                Log.i(TAG, "Attempting to reconnect...");
                connect();
            }
        }, delay);
    }

    private void stopTimers() {
        stopHeartbeat();
        stopStatusReporting();
    }

    private void stopHeartbeat() {
        if (heartbeatTimer != null) {
            heartbeatTimer.cancel();
            heartbeatTimer = null;
        }
    }

    private void stopStatusReporting() {
        if (statusReportTimer != null) {
            statusReportTimer.cancel();
            statusReportTimer = null;
        }
    }

    // 更新流量统计
    public void updateTraffic(long uploadBytes, long downloadBytes) {
        proxyStats.addTraffic(uploadBytes, downloadBytes);
    }

    public boolean isConnected() {
        return isConnected;
    }

    public String getDeviceId() {
        return deviceId;
    }
}
