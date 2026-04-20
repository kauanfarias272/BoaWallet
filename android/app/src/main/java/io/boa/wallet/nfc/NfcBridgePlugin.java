package io.boa.wallet.nfc;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.FormatException;
import android.nfc.tech.Ndef;
import android.nfc.tech.IsoDep;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

@CapacitorPlugin(name = "NfcBridge")
public class NfcBridgePlugin extends Plugin implements NfcAdapter.ReaderCallback {

    private static final String PREFIX = "boa:";
    private static final int READER_FLAGS =
        NfcAdapter.FLAG_READER_NFC_A |
        NfcAdapter.FLAG_READER_NFC_B |
        NfcAdapter.FLAG_READER_NFC_F |
        NfcAdapter.FLAG_READER_NFC_V |
        NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private NfcAdapter nfcAdapter;
    private boolean readerActive = false;

    @Override
    public void load() {
        nfcAdapter = NfcAdapter.getDefaultAdapter(getContext());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", nfcAdapter != null);
        result.put("enabled", nfcAdapter != null && nfcAdapter.isEnabled());
        result.put("hceSupported", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION));
        result.put("hasPayload", BoaHostCardService.hasCurrentPayload());
        call.resolve(result);
    }

    @PluginMethod
    public void setProfilePayload(PluginCall call) {
        String userId = call.getString("userId", "");
        String username = call.getString("username", "");
        String name = call.getString("name");

        if (userId.isEmpty() || username.isEmpty()) {
            call.reject("userId and username are required", "INVALID_PROFILE");
            return;
        }

        try {
            JSONObject payload = new JSONObject();
            payload.put("app", "BoaWallet");
            payload.put("v", 1);
            payload.put("userId", userId);
            payload.put("username", username);
            if (name != null && !name.trim().isEmpty()) {
                payload.put("name", name.trim());
            }

            BoaHostCardService.setCurrentPayload(PREFIX + payload.toString());
            call.resolve(new JSObject());
        } catch (JSONException exception) {
            call.reject("Failed to encode NFC payload", exception);
        }
    }

    @PluginMethod
    public void clearProfilePayload(PluginCall call) {
        BoaHostCardService.clearCurrentPayload();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (nfcAdapter == null) {
            call.reject("NFC not available on this device", "NFC_UNAVAILABLE");
            return;
        }

        if (!nfcAdapter.isEnabled()) {
            call.reject("NFC is disabled", "NFC_DISABLED");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable", "ACTIVITY_UNAVAILABLE");
            return;
        }

        mainHandler.post(() -> {
            Bundle extras = new Bundle();
            extras.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
            nfcAdapter.enableReaderMode(activity, this, READER_FLAGS, extras);
            readerActive = true;
            call.resolve(new JSObject());
        });
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopReaderMode();
        call.resolve(new JSObject());
    }

    @Override
    public void handleOnPause() {
        stopReaderMode();
    }

    @Override
    public void handleOnDestroy() {
        stopReaderMode();
        BoaHostCardService.clearCurrentPayload();
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        JSObject profile = null;

        try {
            profile = readIsoDepProfile(tag);
            if (profile == null) {
                profile = readNdefProfile(tag);
            }
        } catch (Exception exception) {
            emitScanError("NFC scan failed: " + exception.getMessage(), "SCAN_FAILED");
            return;
        }

        if (profile == null) {
            emitScanError("No BoaWallet profile found on the NFC target", "PROFILE_NOT_FOUND");
            return;
        }

        JSObject discoveredProfile = profile;
        mainHandler.post(() -> notifyListeners("profileDiscovered", discoveredProfile));
    }

    private void stopReaderMode() {
        if (!readerActive || nfcAdapter == null) {
            readerActive = false;
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            readerActive = false;
            return;
        }

        mainHandler.post(() -> {
            try {
                nfcAdapter.disableReaderMode(activity);
            } catch (IllegalStateException ignored) {
                // Activity may already be detached.
            }
            readerActive = false;
        });
    }

    @Nullable
    private JSObject readIsoDepProfile(Tag tag) throws IOException, JSONException {
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) {
            return null;
        }

        try {
            isoDep.connect();
            byte[] selectResponse = isoDep.transceive(BoaHostCardService.buildSelectApdu());
            if (!isSuccessResponse(selectResponse)) {
                return null;
            }

            byte[] readResponse = isoDep.transceive(BoaHostCardService.getReadProfileApdu());
            if (!isSuccessResponse(readResponse)) {
                return null;
            }

            byte[] payloadBytes = Arrays.copyOf(readResponse, readResponse.length - 2);
            return decodeProfile(new String(payloadBytes, StandardCharsets.UTF_8));
        } finally {
            try {
                isoDep.close();
            } catch (IOException ignored) {
                // No-op.
            }
        }
    }

    @Nullable
    private JSObject readNdefProfile(Tag tag) throws IOException, JSONException, FormatException {
        Ndef ndef = Ndef.get(tag);
        if (ndef == null) {
            return null;
        }

        try {
            ndef.connect();
            NdefMessage message = ndef.getCachedNdefMessage();
            if (message == null) {
                message = ndef.getNdefMessage();
            }
            if (message == null) {
                return null;
            }

            for (NdefRecord record : message.getRecords()) {
                String payload = decodeNdefRecord(record);
                if (payload == null) {
                    continue;
                }

                JSObject profile = decodeProfile(payload);
                if (profile != null) {
                    return profile;
                }
            }

            return null;
        } finally {
            try {
                ndef.close();
            } catch (IOException ignored) {
                // No-op.
            }
        }
    }

    @Nullable
    private String decodeNdefRecord(NdefRecord record) {
        byte[] payload = record.getPayload();
        if (payload == null || payload.length == 0) {
            return null;
        }

        if (record.getTnf() == NdefRecord.TNF_WELL_KNOWN && Arrays.equals(record.getType(), NdefRecord.RTD_TEXT)) {
            int languageLength = payload[0] & 0x3F;
            if (payload.length <= languageLength + 1) {
                return null;
            }
            return new String(payload, languageLength + 1, payload.length - languageLength - 1, StandardCharsets.UTF_8);
        }

        return new String(payload, StandardCharsets.UTF_8);
    }

    @Nullable
    private JSObject decodeProfile(String rawPayload) throws JSONException {
        if (rawPayload == null || !rawPayload.startsWith(PREFIX)) {
            return null;
        }

        JSONObject payload = new JSONObject(rawPayload.substring(PREFIX.length()));
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

    private void emitScanError(String message, String code) {
        JSObject error = new JSObject();
        error.put("message", message);
        error.put("code", code);
        mainHandler.post(() -> notifyListeners("scanError", error));
    }

    private boolean isSuccessResponse(byte[] response) {
        if (response == null || response.length < 2) {
            return false;
        }

        int length = response.length;
        return response[length - 2] == (byte) 0x90 && response[length - 1] == 0x00;
    }
}
