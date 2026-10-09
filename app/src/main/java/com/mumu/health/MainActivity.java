package com.mumu.health;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.*;
import android.widget.FrameLayout;
import android.util.Base64;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.Iterator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends Activity {
    private static final String HOST = "app.mumu.local";
    private static final int PICK = 101, CAMERA = 102, EXPORT = 103, IMPORT = 104;
    private WebView web;
    private RecordStore records;
    private SettingsStore settings;
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final ExecutorService analysisExecutor = Executors.newFixedThreadPool(2);
    private final Set<String> runningMealAnalyses = ConcurrentHashMap.newKeySet();
    private String pendingId, pendingExport;
    private JSONObject pendingImport;
    private String bootError;
    private volatile boolean closing;
    private volatile boolean installingUpdate;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try { records = new RecordStore(this); settings = new SettingsStore(this); }
        catch (Exception e) { bootError = e.getMessage(); }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xfff6f5f0);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1)); setContentView(root);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        WebSettings config = web.getSettings();
        config.setCacheMode(WebSettings.LOAD_NO_CACHE);
        config.setJavaScriptEnabled(true); config.setDomStorageEnabled(true);
        config.setAllowFileAccess(false); config.setAllowContentAccess(false);
        config.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        config.setDefaultTextEncodingName("UTF-8");
        config.setSupportMultipleWindows(false);
        config.setTextZoom(100);
        web.setBackgroundColor(0xfff6f5f0);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        web.addJavascriptInterface(new Bridge(), "NativeBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return !HOST.equals(request.getUrl().getHost()); }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost()) || !"https".equals(uri.getScheme())) return emptyResponse();
                String path = uri.getPath();
                if (path == null || path.contains("..")) return emptyResponse();
                try {
                    if (path.startsWith("/photos/")) {
                        String name = path.substring(8);
                        if (!name.matches("[a-f0-9-]+\\.jpg")) return emptyResponse();
                        return new WebResourceResponse("image/jpeg", null, new FileInputStream(new File(photoDir(), name)));
                    }
                    if (path.equals("/")) path = "/index.html";
                    String mime = path.endsWith(".js") || path.endsWith(".mjs") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
                    return new WebResourceResponse(mime, "UTF-8", getAssets().open("web" + path));
                } catch (Exception e) { return emptyResponse(); }
            }
        });
        web.loadUrl("https://" + HOST + "/index.html");
    }
    private WebResourceResponse emptyResponse() { return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0])); }
    private File photoDir() { File dir = new File(getFilesDir(), "photos"); dir.mkdirs(); return dir; }
    private void reply(String id, Object result, String error) {
        if (id == null || isFinishing() || isDestroyed()) return;
        final String response;
        try { response = new JSONObject().put("id", id).put("result", result == null ? JSONObject.NULL : result).put("error", error == null ? JSONObject.NULL : error).toString(); }
        catch (Exception e) { return; }
        runOnUiThread(() -> { if (!isDestroyed()) web.evaluateJavascript("window.nativeResult(" + JSONObject.quote(response) + ")", null); });
    }
    private void notifyMealAnalysis(JSONObject meal) {
        if (meal == null || isFinishing() || isDestroyed()) return;
        runOnUiThread(() -> { if (!isDestroyed()) web.evaluateJavascript("window.mealAnalysisUpdated(" + JSONObject.quote(meal.toString()) + ")", null); });
    }
    private void schedulePendingMealAnalyses() throws Exception {
        JSONArray meals = records.snapshot().getJSONArray("meals");
        for (int i = 0; i < meals.length(); i++) {
            JSONObject meal = meals.getJSONObject(i);
            if (meal.optString("analysisStatus").equals("pending")) scheduleMealAnalysis(meal);
        }
    }
    private void scheduleMealAnalysis(JSONObject meal) {
        String id = meal.optString("id"), token = meal.optString("analysisToken");
        if (id.isEmpty() || token.isEmpty() || !runningMealAnalyses.add(id + ":" + token)) return;
        analysisExecutor.execute(() -> {
            try {
                JSONObject current = records.findPendingMeal(id, token);
                if (current == null) return;
                String description = current.optString("description", ""), photo = current.optString("photo", "");
                String image = "";
                if (!photo.isEmpty()) {
                    if (!photo.matches("[a-f0-9-]+\\.jpg")) throw new Exception("照片无效，请重新选择。");
                    File file = new File(photoDir(), photo);
                    if (!file.exists() || file.length() > 3 * 1024 * 1024) throw new Exception("照片不存在或过大，请重新选择。");
                    image = Base64.encodeToString(java.nio.file.Files.readAllBytes(file.toPath()), Base64.NO_WRAP);
                }
                JSONObject result = AiClient.estimate(settings, description, image);
                notifyMealAnalysis(records.applyMealAnalysis(id, token, result, null));
            } catch (Exception error) {
                if (closing) return;
                try { notifyMealAnalysis(records.applyMealAnalysis(id, token, null,
                    error.getMessage() == null ? "分析失败，请稍后重试。" : error.getMessage())); }
                catch (Exception ignored) { /* The pending record remains available for retry on next launch. */ }
            } finally { runningMealAnalyses.remove(id + ":" + token); }
        });
    }
    private final class Bridge {
        @JavascriptInterface public void call(String method, String payload, String id) {
            if (id == null || !id.matches("[0-9]{1,20}") || payload == null || payload.length() > 200000) return;
            executor.execute(() -> {
                try {
                    if (bootError != null) throw new Exception(bootError);
                    JSONObject input = new JSONObject(payload);
                    switch (method) {
                        case "init": reply(id, new JSONObject().put("data", records.snapshot()).put("settings", settings.publicSettings()).put("native", true).put("appVersion", getPackageManager().getPackageInfo(getPackageName(), 0).versionName), null); schedulePendingMealAnalyses(); break;
                        case "saveMeal": {
                            JSONObject meal = records.save("meals", input);
                            reply(id, meal, null);
                            if (meal.optString("analysisStatus").equals("pending")) scheduleMealAnalysis(meal);
                            break;
                        }
                        case "saveWorkout": reply(id, records.save("workouts", input), null); break;
                        case "saveWorkouts": reply(id, records.saveWorkouts(input.optJSONArray("records")), null); break;
                        case "saveTemplate": reply(id, records.save("templates", input), null); break;
                        case "delete": {
                            String kind = input.getString("kind");
                            if (!kind.equals("meals") && !kind.equals("workouts") && !kind.equals("templates")) throw new Exception("记录类型无效。");
                            records.delete(kind, input.getString("id")); reply(id, true, null); break;
                        }
                        case "settings": reply(id, settings.save(input), null); break;
                        case "checkUpdate": reply(id, UpdateClient.check(MainActivity.this), null); break;
                        case "installUpdate": {
                            if (installingUpdate) throw new Exception("更新正在准备中，请稍候。");
                            installingUpdate = true;
                            try {
                                if (!getPackageManager().canRequestPackageInstalls()) {
                                    runOnUiThread(() -> {
                                        try { startActivity(UpdateClient.permissionIntent(MainActivity.this)); reply(id, new JSONObject().put("status", "permission"), null); }
                                        catch (Exception e) { reply(id, null, "无法打开安装权限设置。"); }
                                    });
                                } else {
                                    UpdateClient.Release release = UpdateClient.latest();
                                    UpdateClient.downloadAndVerify(MainActivity.this, release);
                                    runOnUiThread(() -> {
                                        try { startActivity(UpdateClient.installerIntent()); reply(id, new JSONObject().put("status", "installer"), null); }
                                        catch (Exception e) { reply(id, null, "无法打开系统安装界面。"); }
                                    });
                                }
                            } finally { installingUpdate = false; }
                            break;
                        }
                        case "testAi": reply(id, AiClient.test(settings), null); break;
                        case "analyze": {
                            String description = RecordStore.text(input, "description", 3000), photo = RecordStore.text(input, "photo", 80);
                            if (description.isEmpty() && photo.isEmpty()) throw new Exception("请描述吃了什么，或选择一张照片。");
                            String image = "";
                            if (!photo.isEmpty()) {
                                if (!photo.matches("[a-f0-9-]+\\.jpg")) throw new Exception("照片无效。");
                                File file = new File(photoDir(), photo);
                                if (!file.exists() || file.length() > 3 * 1024 * 1024) throw new Exception("照片不存在或过大，请重新选择。");
                                image = Base64.encodeToString(java.nio.file.Files.readAllBytes(file.toPath()), Base64.NO_WRAP);
                            }
                            reply(id, AiClient.estimate(settings, description, image), null); break;
                        }
                        case "photo": runOnUiThread(() -> pickPhoto(input.optBoolean("camera"), id)); break;
                        case "export": {
                            JSONObject backup = records.snapshot(); JSONObject photos = new JSONObject();
                            JSONArray meals = backup.getJSONArray("meals");
                            for (int i = 0; i < meals.length(); i++) {
                                String name = meals.getJSONObject(i).optString("photo");
                                if (!name.isEmpty() && !photos.has(name)) {
                                    File file = new File(photoDir(), name);
                                    if (file.exists()) photos.put(name, Base64.encodeToString(java.nio.file.Files.readAllBytes(file.toPath()), Base64.NO_WRAP));
                                }
                            }
                            backup.put("photos", photos).put("app", "mumu-health");
                            String backupText = backup.toString();
                            runOnUiThread(() -> startExport(id, backupText)); break;
                        }
                        case "import": runOnUiThread(() -> startImport(id)); break;
                        case "restore": {
                            if (pendingImport == null) throw new Exception("请先选择备份文件。");
                            JSONObject imported = new JSONObject(pendingImport.toString());
                            JSONObject photos = imported.optJSONObject("photos");
                            java.util.HashMap<String, String> restoredNames = new java.util.HashMap<>();
                            if (photos != null) {
                                Iterator<String> names = photos.keys();
                                while (names.hasNext()) {
                                    String name = names.next();
                                    if (!name.matches("[a-f0-9-]+\\.jpg")) throw new Exception("备份照片名称无效。");
                                    byte[] bytes = Base64.decode(photos.getString(name), Base64.NO_WRAP);
                                    if (bytes.length > 3 * 1024 * 1024) throw new Exception("备份照片过大。");
                                    // Re-encode restored pixels: imported files never become executable assets.
                                    BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                                    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                                    BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
                                    while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2000) options.inSampleSize *= 2;
                                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                                    if (bitmap == null) throw new Exception("备份照片已损坏。");
                                    String newName = UUID.randomUUID() + ".jpg";
                                    try (FileOutputStream out = new FileOutputStream(new File(photoDir(), newName))) { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out); }
                                    bitmap.recycle();
                                    restoredNames.put(name, newName);
                                }
                            }
                            JSONArray restoredMeals = imported.getJSONArray("meals");
                            for (int i = 0; i < restoredMeals.length(); i++) {
                                JSONObject meal = restoredMeals.getJSONObject(i);
                                String oldName = meal.optString("photo", "");
                                if (!oldName.isEmpty()) {
                                    String newName = restoredNames.get(oldName);
                                    if (newName == null) throw new Exception("备份缺少部分餐食照片，请检查文件是否完整。");
                                    meal.put("photo", newName);
                                }
                            }
                            records.restore(imported); pendingImport = null; reply(id, records.snapshot(), null); schedulePendingMealAnalyses(); break;
                        }
                        case "openHelp": runOnUiThread(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://help.aliyun.com/zh/model-studio/get-api-key"))); reply(id, true, null); } catch (Exception e) { reply(id, null, "手机没有可用的浏览器。"); } }); break;
                        default: throw new Exception("不支持的操作。");
                    }
                } catch (Exception e) { reply(id, null, e.getMessage() == null ? "操作失败，请重试。" : e.getMessage()); }
            });
        }
    }
    private boolean reserve(String id) {
        if (pendingId != null) { reply(id, null, "请先完成当前的照片或文件选择。"); return false; }
        pendingId = id; return true;
    }
    private void pickPhoto(boolean camera, String id) {
        if (!reserve(id)) return;
        try {
            Intent intent;
            if (camera) {
                Uri output = Uri.parse("content://com.mumu.health.photos/camera.jpg");
                intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, output);
                intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.setClipData(ClipData.newRawUri("photo", output));
            } else {
                intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);
            }
            startActivityForResult(intent, camera ? CAMERA : PICK);
        } catch (Exception e) { pendingId = null; reply(id, null, camera ? "未找到相机应用，请使用相册选择。" : "无法打开图片选择器。"); }
    }
    private void startExport(String id, String content) {
        if (!reserve(id)) return;
        pendingExport = content;
        try { startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, "沐沐健康-" + java.time.LocalDate.now() + ".json"), EXPORT); }
        catch (Exception e) { pendingId = null; pendingExport = null; reply(id, null, "无法打开文件保存器。"); }
    }
    private void startImport(String id) {
        if (!reserve(id)) return;
        pendingImport = null;
        try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), IMPORT); }
        catch (Exception e) { pendingId = null; reply(id, null, "无法打开文件选择器。"); }
    }
    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        final String id = pendingId; pendingId = null;
        if (result != RESULT_OK) { pendingExport = null; reply(id, null, null); return; }
        executor.execute(() -> {
            try {
                if (request == CAMERA || request == PICK) {
                    Uri uri = request == CAMERA ? Uri.fromFile(new File(getCacheDir(), "camera.jpg")) : intent.getData();
                    reply(id, copyPhoto(uri), null);
                } else if (request == EXPORT) {
                    String content = pendingExport; pendingExport = null;
                    if (content == null) throw new Exception("导出已中断，请重试。");
                    try (OutputStream out = getContentResolver().openOutputStream(intent.getData(), "wt")) { out.write(content.getBytes(StandardCharsets.UTF_8)); }
                    reply(id, true, null);
                } else if (request == IMPORT) {
                    JSONObject imported;
                    try (InputStream in = getContentResolver().openInputStream(intent.getData())) { imported = new JSONObject(AiClient.read(in, 100 * 1024 * 1024)); }
                    if (imported.optInt("version") != 1 || imported.optJSONArray("meals") == null || imported.optJSONArray("workouts") == null) throw new Exception("请选择沐沐健康导出的备份文件。");
                    pendingImport = imported;
                    reply(id, new JSONObject().put("meals", imported.getJSONArray("meals").length()).put("workouts", imported.getJSONArray("workouts").length()), null);
                }
            } catch (Exception e) { reply(id, null, e.getMessage() == null ? "照片或文件处理失败，请重新选择。" : e.getMessage()); }
        });
    }
    private InputStream imageStream(Uri uri) throws Exception { return "file".equals(uri.getScheme()) ? new FileInputStream(uri.getPath()) : getContentResolver().openInputStream(uri); }
    private JSONObject copyPhoto(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        try (InputStream in = imageStream(uri)) { BitmapFactory.decodeStream(in, null, bounds); }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new Exception("无法读取这张图片，请选择 JPG 或 PNG 图片。");
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > 2000) options.inSampleSize *= 2;
        Bitmap bitmap;
        try (InputStream in = imageStream(uri)) { bitmap = BitmapFactory.decodeStream(in, null, options); }
        if (bitmap == null) throw new Exception("无法读取图片。");
        int orientation = 1;
        try (InputStream in = imageStream(uri)) { orientation = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1); } catch (Exception ignored) { }
        Matrix matrix = new Matrix();
        switch (orientation) {
            case 2: matrix.setScale(-1, 1); break;
            case 3: matrix.setRotate(180); break;
            case 4: matrix.setScale(1, -1); break;
            case 5: matrix.setRotate(90); matrix.postScale(-1, 1); break;
            case 6: matrix.setRotate(90); break;
            case 7: matrix.setRotate(-90); matrix.postScale(-1, 1); break;
            case 8: matrix.setRotate(-90); break;
        }
        float ratio = Math.min(1f, 1600f / Math.max(bitmap.getWidth(), bitmap.getHeight())); matrix.postScale(ratio, ratio);
        Bitmap finalBitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
        String name = UUID.randomUUID() + ".jpg";
        try (FileOutputStream out = new FileOutputStream(new File(photoDir(), name))) { finalBitmap.compress(Bitmap.CompressFormat.JPEG, 84, out); }
        if (bitmap != finalBitmap) bitmap.recycle(); finalBitmap.recycle();
        return new JSONObject().put("name", name).put("url", "https://" + HOST + "/photos/" + name);
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("window.handleBack ? window.handleBack() : false", value -> { if (!"true".equals(value)) MainActivity.super.onBackPressed(); });
    }
    @Override protected void onDestroy() { closing = true; super.onDestroy(); executor.shutdownNow(); analysisExecutor.shutdownNow(); if (web != null) { web.removeJavascriptInterface("NativeBridge"); web.destroy(); } }
}
