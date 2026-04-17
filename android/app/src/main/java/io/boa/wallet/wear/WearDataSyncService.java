package io.boa.wallet.wear;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.DataClient;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.PutDataRequest;
import com.google.android.gms.wearable.Wearable;
import com.google.android.gms.wearable.WearableListenerService;

import java.util.concurrent.ExecutionException;

public class WearDataSyncService extends WearableListenerService {

    private static final String TAG = "WearDataSyncService";
    private static final String PATH_USER_DATA = "/boa-wallet/user-data";
    private static final String PATH_SUBSCRIPTIONS = "/boa-wallet/subscriptions";
    private static final String PATH_REQUEST_SYNC = "/boa-wallet/request-sync";
    private static final String PATH_OPEN_PHONE = "/boa-wallet/open-phone-app";
    private static final String PREFS_NAME = "WearSyncCache";
    private static final String KEY_USER_JSON = "cached_user_json";
    private static final String KEY_SUBS_JSON = "cached_subs_json";

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        Log.d(TAG, "Message received: " + path);

        if (PATH_REQUEST_SYNC.equals(path)) {
            // Watch requested a sync — resend cached data
            Context ctx = getApplicationContext();
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String userJson = prefs.getString(KEY_USER_JSON, null);
            String subsJson = prefs.getString(KEY_SUBS_JSON, null);
            if (userJson != null && subsJson != null) {
                pushToWatch(ctx, userJson, subsJson);
            }
        } else if (PATH_OPEN_PHONE.equals(path)) {
            // Watch asked to open the phone app
            android.content.Intent launchIntent = getPackageManager()
                    .getLaunchIntentForPackage(getPackageName());
            if (launchIntent != null) {
                launchIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
            }
        }
    }

    /**
     * Pushes user and subscription data to the connected watch via Wearable Data Layer.
     * Also caches the data locally for re-sync on watch reconnect.
     */
    public static void pushToWatch(Context context, String userJson, String subsJson) {
        // Cache for re-sync requests
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_USER_JSON, userJson)
                .putString(KEY_SUBS_JSON, subsJson)
                .apply();

        try {
            DataClient dataClient = Wearable.getDataClient(context);

            // Push user data
            PutDataMapRequest userRequest = PutDataMapRequest.create(PATH_USER_DATA);
            DataMap userMap = userRequest.getDataMap();
            userMap.putString("json", userJson);
            userMap.putLong("timestamp", System.currentTimeMillis());
            PutDataRequest userPut = userRequest.asPutDataRequest().setUrgent();
            Task<com.google.android.gms.wearable.DataItem> userTask = dataClient.putDataItem(userPut);

            // Push subscriptions
            PutDataMapRequest subsRequest = PutDataMapRequest.create(PATH_SUBSCRIPTIONS);
            DataMap subsMap = subsRequest.getDataMap();
            subsMap.putString("json", subsJson);
            subsMap.putLong("timestamp", System.currentTimeMillis());
            PutDataRequest subsPut = subsRequest.asPutDataRequest().setUrgent();
            Task<com.google.android.gms.wearable.DataItem> subsTask = dataClient.putDataItem(subsPut);

            // Wait for both (on background thread — caller should not be on main thread)
            Tasks.await(userTask);
            Tasks.await(subsTask);

            Log.d(TAG, "Data pushed to watch successfully");
        } catch (ExecutionException | InterruptedException e) {
            Log.w(TAG, "Failed to push data to watch: " + e.getMessage());
        }
    }
}
