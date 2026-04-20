package io.boa.wallet.nearby;

import android.Manifest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(
    name = "NearbyPeople",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_SCAN }, alias = "scan"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_ADVERTISE }, alias = "advertise"),
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "connect")
    }
)
public class NearbyPeoplePlugin extends Plugin {

    private static final String SERVICE_ID = "io.boa.wallet.nearby";
    private static final Strategy STRATEGY = Strategy.P2P_CLUSTER;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Set<String> pendingEndpoints = new HashSet<>();
    private final Set<String> connectedEndpoints = new HashSet<>();

    private ConnectionsClient connectionsClient;
    private String localEndpointName = "BoaWallet";
    private String localProfileJson = "";

    private final EndpointDiscoveryCallback endpointDiscoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(@NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
            if (pendingEndpoints.contains(endpointId) || connectedEndpoints.contains(endpointId)) {
                return;
            }

            pendingEndpoints.add(endpointId);
            connectionsClient
                .requestConnection(localEndpointName, endpointId, connectionLifecycleCallback)
                .addOnFailureListener(error -> {
                    pendingEndpoints.remove(endpointId);
                    emitSessionError("Failed to request nearby connection: " + error.getMessage(), "REQUEST_CONNECTION_FAILED");
                });
        }

        @Override
        public void onEndpointLost(@NonNull String endpointId) {
            pendingEndpoints.remove(endpointId);
            connectedEndpoints.remove(endpointId);
        }
    };

    private final ConnectionLifecycleCallback connectionLifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(@NonNull String endpointId, @NonNull ConnectionInfo connectionInfo) {
            connectionsClient
                .acceptConnection(endpointId, payloadCallback)
                .addOnFailureListener(error -> {
                    pendingEndpoints.remove(endpointId);
                    emitSessionError("Failed to accept nearby connection: " + error.getMessage(), "ACCEPT_CONNECTION_FAILED");
                });
        }

        @Override
        public void onConnectionResult(@NonNull String endpointId, @NonNull ConnectionResolution result) {
            pendingEndpoints.remove(endpointId);

            if (result.getStatus().isSuccess()) {
                connectedEndpoints.add(endpointId);
                sendLocalProfile(endpointId);
                return;
            }

            connectedEndpoints.remove(endpointId);
            int statusCode = result.getStatus().getStatusCode();
            if (statusCode != ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) {
                emitSessionError("Nearby connection failed with status " + statusCode, "CONNECTION_FAILED");
            }
        }

        @Override
        public void onDisconnected(@NonNull String endpointId) {
            pendingEndpoints.remove(endpointId);
            connectedEndpoints.remove(endpointId);
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
            byte[] bytes = payload.asBytes();
            if (bytes == null) {
                return;
            }

            try {
                JSObject profile = decodeProfile(new String(bytes, StandardCharsets.UTF_8));
                if (profile != null) {
                    mainHandler.post(() -> notifyListeners("personDiscovered", profile));
                }
            } catch (JSONException error) {
                emitSessionError("Invalid nearby profile payload", "INVALID_PROFILE");
            } finally {
                connectionsClient.disconnectFromEndpoint(endpointId);
            }
        }

        @Override
        public void onPayloadTransferUpdate(@NonNull String endpointId, @NonNull PayloadTransferUpdate update) {
            if (update.getStatus() == PayloadTransferUpdate.Status.FAILURE) {
                connectionsClient.disconnectFromEndpoint(endpointId);
            }
        }
    };

    @Override
    public void load() {
        connectionsClient = Nearby.getConnectionsClient(getContext());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject status = new JSObject();
        status.put("available", hasGooglePlayServices());
        status.put("permissionsOk", hasNearbyPermissions());
        status.put("needsLocation", Build.VERSION.SDK_INT < Build.VERSION_CODES.S);
        call.resolve(status);
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        if (!hasGooglePlayServices()) {
            call.reject("Google Play services not available", "PLAY_SERVICES_UNAVAILABLE");
            return;
        }

        String userId = call.getString("userId", "");
        String username = call.getString("username", "");
        String name = call.getString("name");

        if (userId.isEmpty() || username.isEmpty()) {
            call.reject("userId and username are required", "INVALID_PROFILE");
            return;
        }

        if (!hasNearbyPermissions()) {
            requestNearbyPermissions(call);
            return;
        }

        startSessionInternal(call, userId, username, name);
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        stopSessionInternal();
        call.resolve(new JSObject());
    }

    @Override
    protected void handleOnDestroy() {
        stopSessionInternal();
    }

    @PermissionCallback
    private void nearbyPermissionsCallback(PluginCall call) {
        if (call == null) {
            return;
        }

        if (!hasNearbyPermissions()) {
            call.reject("Nearby permissions denied", "PERMISSION_DENIED");
            return;
        }

        startSessionInternal(
            call,
            call.getString("userId", ""),
            call.getString("username", ""),
            call.getString("name")
        );
    }

    private void startSessionInternal(PluginCall call, String userId, String username, String name) {
        stopSessionInternal();

        try {
            JSONObject payload = new JSONObject();
            payload.put("app", "BoaWallet");
            payload.put("v", 1);
            payload.put("userId", userId);
            payload.put("username", username);
            if (name != null && !name.trim().isEmpty()) {
                payload.put("name", name.trim());
            }

            localProfileJson = payload.toString();
            localEndpointName = buildEndpointName(username, name);
        } catch (JSONException error) {
            call.reject("Failed to encode nearby profile", error);
            return;
        }

        AdvertisingOptions advertisingOptions = new AdvertisingOptions.Builder()
            .setStrategy(STRATEGY)
            .build();

        DiscoveryOptions discoveryOptions = new DiscoveryOptions.Builder()
            .setStrategy(STRATEGY)
            .build();

        connectionsClient
            .startAdvertising(localEndpointName, SERVICE_ID, connectionLifecycleCallback, advertisingOptions)
            .addOnSuccessListener(unused ->
                connectionsClient
                    .startDiscovery(SERVICE_ID, endpointDiscoveryCallback, discoveryOptions)
                    .addOnSuccessListener(ignored -> {
                        JSObject result = new JSObject();
                        result.put("active", true);
                        call.resolve(result);
                    })
                    .addOnFailureListener(error -> {
                        connectionsClient.stopAdvertising();
                        call.reject("Failed to start nearby discovery", error);
                    })
            )
            .addOnFailureListener(error -> call.reject("Failed to start nearby advertising", error));
    }

    private void stopSessionInternal() {
        pendingEndpoints.clear();
        connectedEndpoints.clear();

        if (connectionsClient != null) {
            connectionsClient.stopAdvertising();
            connectionsClient.stopDiscovery();
            connectionsClient.stopAllEndpoints();
        }
    }

    private void sendLocalProfile(String endpointId) {
        if (localProfileJson == null || localProfileJson.isEmpty()) {
            return;
        }

        Payload payload = Payload.fromBytes(localProfileJson.getBytes(StandardCharsets.UTF_8));
        connectionsClient
            .sendPayload(endpointId, payload)
            .addOnFailureListener(error -> emitSessionError("Failed to send nearby profile", "SEND_PROFILE_FAILED"));
    }

    private boolean hasGooglePlayServices() {
        return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext()) == ConnectionResult.SUCCESS;
    }

    private boolean hasNearbyPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return getPermissionState("scan") == PermissionState.GRANTED
                && getPermissionState("advertise") == PermissionState.GRANTED
                && getPermissionState("connect") == PermissionState.GRANTED;
        }

        return getPermissionState("location") == PermissionState.GRANTED;
    }

    private void requestNearbyPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAliases(new String[] { "scan", "advertise", "connect" }, call, "nearbyPermissionsCallback");
            return;
        }

        requestPermissionForAliases(new String[] { "location" }, call, "nearbyPermissionsCallback");
    }

    private void emitSessionError(String message, String code) {
        JSObject error = new JSObject();
        error.put("message", message);
        error.put("code", code);
        mainHandler.post(() -> notifyListeners("sessionError", error));
    }

    private JSObject decodeProfile(String rawJson) throws JSONException {
        JSONObject payload = new JSONObject(rawJson);
        if (!"BoaWallet".equals(payload.optString("app"))) {
            return null;
        }

        String userId = payload.optString("userId");
        String username = payload.optString("username");
        if (userId.isEmpty() || username.isEmpty()) {
            return null;
        }

        JSObject profile = new JSObject();
        profile.put("app", "BoaWallet");
        profile.put("v", payload.optInt("v", 1));
        profile.put("userId", userId);
        profile.put("username", username);
        profile.put("name", payload.optString("name", ""));
        return profile;
    }

    private String buildEndpointName(String username, String name) {
        String preferred = (name != null && !name.trim().isEmpty()) ? name.trim() : username.trim();
        if (preferred.length() > 24) {
            return preferred.substring(0, 24);
        }
        return preferred;
    }
}
