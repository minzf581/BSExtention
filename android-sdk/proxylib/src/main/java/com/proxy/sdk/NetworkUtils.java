package com.proxy.sdk;

import android.util.Log;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public class NetworkUtils {
    private static final String TAG = "NetworkUtils";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();

    public static String getPublicIP() {
        Future<String> future = executor.submit(() -> {
            try {
                URL url = new URL("https://api.ipify.org?format=text");
                BufferedReader reader = new BufferedReader(new InputStreamReader(url.openStream()));
                String ip = reader.readLine();
                reader.close();
                return ip;
            } catch (Exception e) {
                Log.e(TAG, "Error getting public IP", e);
                return "unknown";
            }
        });

        try {
            return future.get(5, TimeUnit.SECONDS);
        } catch (Exception e) {
            Log.e(TAG, "Timeout getting public IP", e);
            return "unknown";
        }
    }
}
