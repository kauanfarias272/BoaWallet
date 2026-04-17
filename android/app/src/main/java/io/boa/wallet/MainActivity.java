package io.boa.wallet;

import com.getcapacitor.BridgeActivity;
import io.boa.wallet.wear.WearBridgePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Registra o plugin WearBridge antes do super.onCreate
        registerPlugin(WearBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
