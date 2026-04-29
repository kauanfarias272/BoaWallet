package io.boa.wallet;

import com.getcapacitor.BridgeActivity;
import io.boa.wallet.nearby.NearbyPeoplePlugin;
import io.boa.wallet.nfc.NfcBridgePlugin;
import io.boa.wallet.wear.WearBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Registra o plugin WearBridge antes do super.onCreate
        registerPlugin(WearBridgePlugin.class);
        registerPlugin(NfcBridgePlugin.class);
        registerPlugin(NearbyPeoplePlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setOverScrollMode(android.view.View.OVER_SCROLL_NEVER);
        }
    }
}
