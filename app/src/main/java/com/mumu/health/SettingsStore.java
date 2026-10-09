package com.mumu.health;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.net.URI;

public final class SettingsStore {
    private final SharedPreferences prefs;
    public SettingsStore(Context context) { prefs = context.getSharedPreferences("ai_settings", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        String alias = "mumu.health.api.v1";
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(alias, null);
    }
    public synchronized String apiKey() throws Exception {
        String value = prefs.getString("encryptedKey", "");
        if (value.isEmpty()) return "";
        String[] parts = value.split(":");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    public synchronized JSONObject publicSettings() throws Exception {
        return new JSONObject().put("baseUrl", prefs.getString("baseUrl", "https://dashscope.aliyuncs.com/compatible-mode/v1"))
            .put("textModel", prefs.getString("textModel", "qwen-plus")).put("visionModel", prefs.getString("visionModel", "qwen3-vl-plus"))
            .put("hasKey", !prefs.getString("encryptedKey", "").isEmpty());
    }
    public synchronized JSONObject save(JSONObject input) throws Exception {
        String base = RecordStore.text(input, "baseUrl", 1000).replaceAll("/+$", "");
        URI uri;
        try { uri = new URI(base); } catch (Exception e) { throw new Exception("请填写正确的服务地址。"); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null)
            throw new Exception("服务地址需要使用 HTTPS，且不能包含密钥或参数。");
        String text = RecordStore.text(input, "textModel", 100), vision = RecordStore.text(input, "visionModel", 100);
        if (text.isEmpty() || vision.isEmpty()) throw new Exception("请填写文字模型与图片模型名称。");
        SharedPreferences.Editor editor = prefs.edit().putString("baseUrl", base).putString("textModel", text).putString("visionModel", vision);
        String api = RecordStore.text(input, "apiKey", 4096);
        if (!api.isEmpty()) {
            if (api.contains("\n") || api.contains("\r")) throw new Exception("API Key 格式有误。");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            editor.putString("encryptedKey", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(api.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
        }
        if (input.optBoolean("clearKey")) editor.remove("encryptedKey");
        if (!editor.commit()) throw new Exception("设置保存失败。");
        return publicSettings();
    }
}
