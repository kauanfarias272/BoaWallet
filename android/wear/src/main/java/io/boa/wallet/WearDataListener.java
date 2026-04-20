package io.boa.wallet;

import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMap;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.WearableListenerService;

/**
 * Recebe dados do celular via Wearable Data Layer e os armazena em
 * SharedPreferences para a WearMainActivity ler.
 *
 * O celular envia:
 *   /boa-wallet/user-data  → JSON com resumo do usuário
 *   /boa-wallet/subscriptions → JSON com lista de assinaturas
 */
public class WearDataListener extends WearableListenerService {

    private static final String TAG = "WearDataListener";
    private static final String PATH_USER_DATA = "/boa-wallet/user-data";
    private static final String PATH_SUBSCRIPTIONS = "/boa-wallet/subscriptions";
    private static final String PATH_OPEN_PHONE = "/boa-wallet/open-phone-app";

    @Override
    public void onDataChanged(DataEventBuffer dataEvents) {
        SharedPreferences prefs = getSharedPreferences(WearMainActivity.PREFS_NAME, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        boolean changed = false;

        for (DataEvent event : dataEvents) {
            if (event.getType() != DataEvent.TYPE_CHANGED) continue;

            String path = event.getDataItem().getUri().getPath();
            DataMap dataMap = DataMapItem.fromDataItem(event.getDataItem()).getDataMap();

            if (PATH_USER_DATA.equals(path)) {
                String json = dataMap.getString("json");
                if (json != null) {
                    editor.putString(WearMainActivity.KEY_USER_JSON, json);
                    changed = true;
                    Log.d(TAG, "User data updated");
                }
            } else if (PATH_SUBSCRIPTIONS.equals(path)) {
                String json = dataMap.getString("json");
                if (json != null) {
                    editor.putString(WearMainActivity.KEY_SUBS_JSON, json);
                    changed = true;
                    Log.d(TAG, "Subscriptions updated: " + json.length() + " chars");
                }
            }
        }

        if (changed) {
            editor.apply();
            // Notifica a Activity (se estiver na tela) para recarregar os dados
            Intent broadcast = new Intent(WearMainActivity.ACTION_DATA_UPDATED);
            sendBroadcast(broadcast);
        }
    }

    @Override
    public void onMessageReceived(MessageEvent messageEvent) {
        // Relógio recebe mensagem do celular pedindo para abrir o app
        if (PATH_OPEN_PHONE.equals(messageEvent.getPath())) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
            }
        }
    }
}
