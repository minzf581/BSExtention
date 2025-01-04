package com.proxy.sdk;

public class ProxyStats {
    private long startTime;
    private long uploadBytes;
    private long downloadBytes;

    public ProxyStats() {
        startTime = System.currentTimeMillis();
        uploadBytes = 0;
        downloadBytes = 0;
    }

    public synchronized void addTraffic(long upload, long download) {
        uploadBytes += upload;
        downloadBytes += download;
    }

    public synchronized void resetTraffic() {
        uploadBytes = 0;
        downloadBytes = 0;
    }

    public synchronized long getUploadBytes() {
        return uploadBytes;
    }

    public synchronized long getDownloadBytes() {
        return downloadBytes;
    }

    public long getDuration() {
        return (System.currentTimeMillis() - startTime) / 1000;
    }

    public void resetStartTime() {
        startTime = System.currentTimeMillis();
    }
}
