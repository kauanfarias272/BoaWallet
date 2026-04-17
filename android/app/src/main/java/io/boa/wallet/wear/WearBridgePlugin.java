package io.boa.wallet.wear;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "WearBridge")
public class WearBridgePlugin extends Plugin {

    private static final String TAG = "WearBridgePlugin";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void pushToWatch(PluginCall call) {
        String userJson = call.getString("userJson");
        String subsJson = call.getString("subsJson");

        if (userJson == null || subsJson == null) {
            call.reject("userJson and subsJson are required");
            return;
        }

        // Network I/O — run off the main thread
        executor.execute(() -> {
            try {
                WearDataSyncService.pushToWatch(getContext(), userJson, subsJson);
                call.resolve(new JSObject());
            } catch (Exception e) {
                Log.w(TAG, "pushToWatch failed: " + e.getMessage());
                // Resolve anyway — watch may simply not be connected
                call.resolve(new JSObject());
            }
        });
    }
}
