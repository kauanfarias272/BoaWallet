package io.boa.wallet;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WearMainActivity extends Activity {

    static final String PREFS_NAME = "WearSyncCache";
    static final String KEY_USER_JSON = "cached_user_json";
    static final String KEY_SUBS_JSON = "cached_subs_json";
    static final String ACTION_DATA_UPDATED = "io.boa.wallet.DATA_UPDATED";

    private static final String PATH_REQUEST_SYNC = "/boa-wallet/request-sync";

    private TextView tvTotalCost, tvNextName, tvNextDate, tvCount, tvNoData;
    private LinearLayout layoutData, layoutSubs;
    private Button btnSync;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private final BroadcastReceiver dataReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_DATA_UPDATED.equals(intent.getAction())) {
                loadData();
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // RECEIVER_NOT_EXPORTED só existe em API 33+; no API 26-32 usa a forma sem flags
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(dataReceiver, new IntentFilter(ACTION_DATA_UPDATED),
                    Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(dataReceiver, new IntentFilter(ACTION_DATA_UPDATED));
        }
        loadData();
    }

    @Override
    protected void onPause() {
        super.onPause();
        try { unregisterReceiver(dataReceiver); } catch (Exception ignored) {}
    }

    // ── UI criada programaticamente (sem XML de layout) ─────────────────────

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFF0a0a0a);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(12), dp(20), dp(12), dp(20));

        // ── Header ──────────────────────────────────────────────────────────
        TextView tvTitle = new TextView(this);
        tvTitle.setText("BoaWallet");
        tvTitle.setTextColor(0xFFd0d0a0);
        tvTitle.setTextSize(15f);
        tvTitle.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        tvTitle.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        root.addView(tvTitle, matchWrap());

        // ── Sem dados ───────────────────────────────────────────────────────
        tvNoData = new TextView(this);
        tvNoData.setText("Aguardando sync\ndo celular...");
        tvNoData.setTextColor(0xFF888888);
        tvNoData.setTextSize(11f);
        tvNoData.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        tvNoData.setPadding(0, dp(12), 0, dp(4));
        tvNoData.setVisibility(View.GONE);
        root.addView(tvNoData, matchWrap());

        // ── Dados principais ─────────────────────────────────────────────────
        layoutData = new LinearLayout(this);
        layoutData.setOrientation(LinearLayout.VERTICAL);
        layoutData.setVisibility(View.GONE);

        addLabel(layoutData, "Total mensal", dp(14));
        tvTotalCost = addValue(layoutData, "--", 22f, 0xFFFFFFFF);

        addLabel(layoutData, "Próximo vencimento", dp(10));
        tvNextName = addValue(layoutData, "--", 13f, 0xFFd0d0a0);
        tvNextDate = addSmall(layoutData, "");

        addLabel(layoutData, "", dp(6));
        tvCount = addSmall(layoutData, "");

        root.addView(layoutData, matchWrap());

        // ── Lista de assinaturas ─────────────────────────────────────────────
        layoutSubs = new LinearLayout(this);
        layoutSubs.setOrientation(LinearLayout.VERTICAL);
        layoutSubs.setVisibility(View.GONE);
        root.addView(layoutSubs, matchWrap());

        // ── Botão Sincronizar ────────────────────────────────────────────────
        btnSync = new Button(this);
        btnSync.setText("Sincronizar");
        btnSync.setTextColor(0xFFd0d0a0);
        btnSync.setTextSize(11f);
        if (btnSync.getBackground() != null) {
            btnSync.getBackground().setTint(0xFF2a2a1a);
        }
        LinearLayout.LayoutParams btnParams = matchWrap();
        btnParams.topMargin = dp(14);
        btnSync.setOnClickListener(v -> requestSyncFromPhone());
        root.addView(btnSync, btnParams);

        scroll.addView(root, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.MATCH_PARENT));
        setContentView(scroll);
    }

    // ── Carrega dados do SharedPreferences ──────────────────────────────────

    private void loadData() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String userJson = prefs.getString(KEY_USER_JSON, null);
        String subsJson = prefs.getString(KEY_SUBS_JSON, null);

        if (userJson == null) {
            tvNoData.setVisibility(View.VISIBLE);
            layoutData.setVisibility(View.GONE);
            layoutSubs.setVisibility(View.GONE);
            requestSyncFromPhone();
            return;
        }

        tvNoData.setVisibility(View.GONE);
        layoutData.setVisibility(View.VISIBLE);

        try {
            JSONObject user = new JSONObject(userJson);
            double totalCost = user.optDouble("totalMonthlyCost", 0);
            String currency = user.optString("baseCurrency", "BRL");
            int count = user.optInt("subscriptionCount", 0);
            String nextName = user.optString("nextDueName", "");
            int nextDate = user.optInt("nextDueDate", 0);
            double nextAmount = user.optDouble("nextDueAmount", 0);
            String nextCurrency = user.optString("nextDueCurrency", currency);

            tvTotalCost.setText(fmt(totalCost, currency));
            tvCount.setText(count + " assinatura" + (count != 1 ? "s" : ""));

            if (!nextName.isEmpty()) {
                tvNextName.setText(nextName);
                tvNextDate.setText("dia " + nextDate + "  ·  " + fmt(nextAmount, nextCurrency));
            } else {
                tvNextName.setText("—");
                tvNextDate.setText("");
            }
        } catch (Exception ignored) {}

        // Popula lista de assinaturas
        if (subsJson != null) {
            try {
                layoutSubs.removeAllViews();
                JSONObject root = new JSONObject(subsJson);
                JSONArray items = root.optJSONArray("items");
                if (items != null && items.length() > 0) {
                    addLabel(layoutSubs, "Assinaturas", dp(10));
                    int limit = Math.min(items.length(), 8);
                    for (int i = 0; i < limit; i++) {
                        JSONObject sub = items.getJSONObject(i);
                        addSubRow(layoutSubs, sub);
                    }
                    if (items.length() > 8) {
                        TextView more = new TextView(this);
                        more.setText("+ " + (items.length() - 8) + " mais no celular");
                        more.setTextColor(0xFF666666);
                        more.setTextSize(10f);
                        more.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
                        more.setPadding(0, dp(4), 0, 0);
                        layoutSubs.addView(more, matchWrap());
                    }
                    layoutSubs.setVisibility(View.VISIBLE);
                }
            } catch (Exception ignored) {}
        }
    }

    private void addSubRow(LinearLayout parent, JSONObject sub) {
        try {
            String name = sub.optString("name", "Assinatura");
            String emoji = sub.optString("emoji", "📦");
            double amount = sub.optDouble("costAmount", 0);
            String currency = sub.optString("costCurrency", "BRL");
            int dueDate = sub.optInt("dueDate", 0);

            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setBackgroundColor(0xFF1a1a1a);
            row.setPadding(dp(8), dp(6), dp(8), dp(6));
            LinearLayout.LayoutParams rp = matchWrap();
            rp.topMargin = dp(3);
            row.setLayoutParams(rp);

            TextView tvEmoji = new TextView(this);
            tvEmoji.setText(emoji);
            tvEmoji.setTextSize(14f);
            tvEmoji.setPadding(0, 0, dp(6), 0);
            row.addView(tvEmoji);

            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

            TextView tvName = new TextView(this);
            tvName.setText(name);
            tvName.setTextColor(0xFFFFFFFF);
            tvName.setTextSize(11f);
            info.addView(tvName);

            TextView tvSub = new TextView(this);
            tvSub.setText(fmt(amount, currency) + "  ·  dia " + dueDate);
            tvSub.setTextColor(0xFF888888);
            tvSub.setTextSize(9f);
            info.addView(tvSub);

            row.addView(info);
            parent.addView(row);
        } catch (Exception ignored) {}
    }

    // ── Envia mensagem ao celular pedindo sync ───────────────────────────────

    private void requestSyncFromPhone() {
        executor.execute(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(this).getConnectedNodes());
                MessageClient mc = Wearable.getMessageClient(this);
                for (Node node : nodes) {
                    Tasks.await(mc.sendMessage(node.getId(), PATH_REQUEST_SYNC, new byte[0]));
                }
            } catch (Exception ignored) {
                // Celular pode não estar conectado — ignora
            }
        });
    }

    // ── Helpers de layout e formatação ──────────────────────────────────────

    private int dp(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private void addLabel(LinearLayout parent, String text, int topMargin) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(0xFF888888);
        tv.setTextSize(9f);
        tv.setAllCaps(true);
        tv.setLetterSpacing(0.12f);
        LinearLayout.LayoutParams lp = matchWrap();
        lp.topMargin = topMargin;
        tv.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        parent.addView(tv, lp);
    }

    private TextView addValue(LinearLayout parent, String text, float sizeSp, int color) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(color);
        tv.setTextSize(sizeSp);
        tv.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        tv.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        parent.addView(tv, matchWrap());
        return tv;
    }

    private TextView addSmall(LinearLayout parent, String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(0xFF888888);
        tv.setTextSize(10f);
        tv.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        parent.addView(tv, matchWrap());
        return tv;
    }

    private String fmt(double amount, String currency) {
        switch (currency) {
            case "BRL": return String.format("R$ %.2f", amount).replace('.', ',');
            case "USD": return String.format("US$ %.2f", amount);
            case "EUR": return String.format("€ %.2f", amount);
            case "GBP": return String.format("£ %.2f", amount);
            default:    return String.format("%.2f %s", amount, currency);
        }
    }
}
