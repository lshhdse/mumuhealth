package com.mumu.health;

import android.app.Instrumentation;
import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Method;

/** Debug APK only. Does not replace or clear the user's normal record file. */
public class TestInstrumentation extends Instrumentation {
    private int checks;
    private void check(boolean condition, String message) throws Exception { if (!condition) throw new Exception(message); checks++; }
    private void rejects(Throwing runnable, String message) throws Exception { boolean rejected = false; try { runnable.run(); } catch (Exception e) { rejected = true; } check(rejected, message); }
    private interface Throwing { void run() throws Exception; }
    @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Context scoped = new ContextWrapper(getTargetContext()) {
                @Override public File getFilesDir() { File dir = new File(super.getFilesDir(), "native-test-" + System.currentTimeMillis()); dir.mkdirs(); return dir; }
                @Override public SharedPreferences getSharedPreferences(String name, int mode) { return super.getSharedPreferences("native_test_" + name, mode); }
            };
            File testDir = scoped.getFilesDir();
            Context stable = new ContextWrapper(scoped) { @Override public File getFilesDir() { return testDir; } };
            RecordStore records = new RecordStore(stable);
            JSONObject meal = new JSONObject("{\"date\":\"2026-10-08\",\"meal\":\"breakfast\",\"foods\":[{\"name\":\"鸡蛋\",\"portion\":\"2 个\",\"kcal\":150},{\"name\":\"粥\",\"portion\":\"1 碗\",\"kcal\":null}]}");
            JSONObject saved = records.save("meals", meal);
            check(records.snapshot().getJSONArray("meals").length() == 1, "保存饮食记录");
            check(saved.getJSONArray("foods").getJSONObject(1).isNull("kcal"), "未知热量保存为 null");
            RecordStore reopened = new RecordStore(stable);
            check(reopened.snapshot().getJSONArray("meals").getJSONObject(0).getString("id").equals(saved.getString("id")), "磁盘持久化和重启读取");
            saved.getJSONArray("foods").getJSONObject(0).put("kcal", 160);
            reopened.save("meals", saved);
            check(reopened.snapshot().getJSONArray("meals").length() == 1, "修改不会增加重复记录");
            rejects(() -> reopened.save("meals", new JSONObject(meal.toString()).put("date", "2026-02-30")), "拒绝无效日期");
            JSONObject invalid = new JSONObject(meal.toString()); invalid.getJSONArray("foods").getJSONObject(0).put("kcal", -1);
            rejects(() -> reopened.save("meals", invalid), "拒绝负热量");
            JSONObject workout = new JSONObject("{\"date\":\"2026-10-08\",\"type\":\"strength\",\"name\":\"深蹲\",\"sets\":4,\"reps\":12,\"weight\":null}");
            reopened.save("workouts", workout);
            check(reopened.snapshot().getJSONArray("workouts").getJSONObject(0).isNull("weight"), "自重训练可不填写重量");
            rejects(() -> reopened.save("workouts", new JSONObject(workout.toString()).put("sets", 1.5)), "拒绝小数组数");
            String before = reopened.snapshot().toString();
            JSONObject badBackup = new JSONObject(before); badBackup.getJSONArray("meals").getJSONObject(0).put("meal", "bad");
            rejects(() -> reopened.restore(badBackup), "拒绝损坏备份");
            check(reopened.snapshot().toString().equals(before), "无效备份不覆盖原记录");
            reopened.restore(new JSONObject(before));
            check(reopened.snapshot().getJSONArray("workouts").length() == 1, "有效备份恢复");
            reopened.delete("meals", saved.getString("id"));
            check(new RecordStore(stable).snapshot().getJSONArray("meals").length() == 0, "删除持久化");
            Context batchContext = new ContextWrapper(stable) {
                @Override public File getFilesDir() { File dir = new File(testDir, "batch"); dir.mkdirs(); return dir; }
            };
            RecordStore batchStore = new RecordStore(batchContext);
            Context pendingContext = new ContextWrapper(stable) {
                @Override public File getFilesDir() { File dir = new File(testDir, "pending"); dir.mkdirs(); return dir; }
            };
            RecordStore pendingStore = new RecordStore(pendingContext);
            JSONObject pendingMeal = pendingStore.save("meals", new JSONObject()
                .put("date", "2026-10-08").put("meal", "lunch").put("description", "一碗泡面")
                .put("foods", new JSONArray()).put("analysisStatus", "pending").put("analysisToken", "token-1"));
            check(new RecordStore(pendingContext).findPendingMeal(pendingMeal.getString("id"), "token-1") != null, "文字记录即时保存并保留待分析状态");
            check(pendingStore.applyMealAnalysis(pendingMeal.getString("id"), "old-token", null, "过期") == null, "过期分析不能覆盖记录");
            JSONObject estimate = new JSONObject().put("title", "一碗泡面").put("assumptions", "常见份量")
                .put("foods", new JSONArray().put(new JSONObject().put("name", "泡面").put("portion", "1 碗").put("kcal", 430)));
            JSONObject analyzed = pendingStore.applyMealAnalysis(pendingMeal.getString("id"), "token-1", estimate, null);
            check(analyzed.getString("analysisStatus").equals("done") && analyzed.getString("title").equals("一碗泡面")
                && analyzed.getJSONArray("foods").getJSONObject(0).getInt("kcal") == 430, "后台结果写回总热量与详情");
            check(pendingStore.applyMealAnalysis(pendingMeal.getString("id"), "token-1", estimate, null) == null, "完成后的重复回填被忽略");
            JSONObject unknownMeal = pendingStore.save("meals", new JSONObject().put("date", "2026-10-08")
                .put("meal", "dinner").put("description", "这是什么").put("foods", new JSONArray())
                .put("analysisStatus", "pending").put("analysisToken", "token-2"));
            JSONObject failed = pendingStore.applyMealAnalysis(unknownMeal.getString("id"), "token-2",
                new JSONObject().put("foods", new JSONArray()).put("assumptions", "未识别到食物"), null);
            check(failed.getString("analysisStatus").equals("failed") && failed.getString("analysisError").equals("未识别到食物"), "识别失败保留记录和原因");
            JSONObject cardio = new JSONObject("{\"date\":\"2026-10-08\",\"type\":\"cardio\",\"name\":\"跑步\",\"minutes\":30}");
            JSONArray batchSaved = batchStore.saveWorkouts(new JSONArray().put(cardio).put(workout));
            check(batchSaved.length() == 2 && new RecordStore(batchContext).snapshot().getJSONArray("workouts").length() == 2, "多运动统一保存并持久化");
            String batchBefore = batchStore.snapshot().toString();
            rejects(() -> batchStore.saveWorkouts(new JSONArray().put(cardio).put(new JSONObject(workout.toString()).put("sets", 0))), "批量训练拒绝无效项");
            check(batchStore.snapshot().toString().equals(batchBefore), "批量失败不保存前面的有效项");
            batchSaved.getJSONObject(0).put("minutes", 45);
            batchStore.saveWorkouts(new JSONArray().put(batchSaved.getJSONObject(0)));
            check(batchStore.snapshot().getJSONArray("workouts").length() == 2 && batchStore.snapshot().getJSONArray("workouts").getJSONObject(0).getInt("minutes") == 45, "批量保存后独立修改不重复");
            check(batchStore.snapshot().getJSONArray("templates").length() == 4, "旧数据加载默认部位模板");
            JSONObject templateExercise = new JSONObject(workout.toString()); templateExercise.remove("date");
            JSONObject template = batchStore.save("templates", new JSONObject().put("name", "自定义练腿").put("exercises", new JSONArray().put(templateExercise)));
            check(new RecordStore(batchContext).snapshot().getJSONArray("templates").length() == 5, "模板持久化");
            check(!template.getJSONArray("exercises").getJSONObject(0).has("id"), "模板动作不携带已记录运动编号");
            JSONObject oldBackup = new JSONObject().put("version", 1).put("meals", new JSONArray()).put("workouts", new JSONArray());
            batchStore.restore(oldBackup);
            check(batchStore.snapshot().getJSONArray("templates").length() == 5, "恢复旧版备份保留当前模板");
            JSONObject backupWithTemplates = batchStore.snapshot();
            batchStore.delete("templates", template.getString("id"));
            check(batchStore.snapshot().getJSONArray("templates").length() == 4, "模板删除");
            batchStore.restore(backupWithTemplates);
            check(new RecordStore(batchContext).snapshot().getJSONArray("templates").length() == 5, "新版备份恢复模板");
            SettingsStore settings = new SettingsStore(stable);
            String testKey = "sk-NATIVE-TEST-ONLY-not-a-real-key";
            JSONObject config = new JSONObject().put("baseUrl", "https://example.invalid/v1").put("textModel", "fixture-text").put("visionModel", "fixture-vision").put("apiKey", testKey);
            settings.save(config);
            check(settings.apiKey().equals(testKey), "Android Keystore 加解密");
            check(!settings.publicSettings().toString().contains(testKey), "界面不能读取已保存密钥");
            check(!stable.getSharedPreferences("ai_settings", 0).getAll().toString().contains(testKey), "偏好文件没有明文密钥");
            config.put("apiKey", ""); settings.save(config);
            check(settings.apiKey().equals(testKey), "留空保留旧密钥");
            rejects(() -> settings.save(new JSONObject(config.toString()).put("baseUrl", "http://example.invalid")), "拒绝 HTTP 服务地址");
            settings.save(config.put("clearKey", true)); check(settings.apiKey().isEmpty(), "密钥清除");
            JSONObject ai = AiClient.parseEstimate("```json\n{\"foods\":[{\"name\":\"鸡蛋\",\"portion\":\"2 个\",\"kcal\":150},{\"name\":\"粥\",\"portion\":\"一碗\",\"kcal\":null}],\"assumptions\":\"常见份量\"}\n```");
            check(ai.getJSONArray("foods").length() == 2 && ai.getJSONArray("foods").getJSONObject(1).isNull("kcal"), "解析多模态返回与未知热量");
            rejects(() -> AiClient.parseEstimate("{\"foods\":[{\"name\":\"食物\",\"kcal\":-5}]}"), "拒绝异常 AI 热量");
            rejects(() -> AiClient.parseEstimate("这不是 JSON"), "拒绝非结构化响应");
            check(AiClient.parseEstimate("{\"foods\":[],\"assumptions\":\"非食物照片\"}").getJSONArray("foods").length() == 0, "非食物照片结果为空");
            rejects(() -> AiClient.test(settings), "没有密钥时不能误报连接成功");
            JSONObject release = new JSONObject().put("tag_name", "build-100002").put("name", "沐沐健康 1.0.4.2")
                .put("body", "SHA256: " + new String(new char[64]).replace('\0', 'a'))
                .put("assets", new JSONArray().put(new JSONObject().put("name", "mumu-health-100002.apk")
                    .put("browser_download_url", "https://github.com/lshhdse/mumuhealth/releases/download/build-100002/mumu-health-100002.apk")
                    .put("size", 1234567)));
            check(UpdateClient.parseRelease(release).code == 100002, "发布信息解析与哈希回退");
            rejects(() -> UpdateClient.parseRelease(new JSONObject(release.toString()).put("tag_name", "build-100003")), "拒绝版本与下载路径不一致");
            release.getJSONArray("assets").getJSONObject(0).put("browser_download_url", "https://evil.example/update.apk");
            rejects(() -> UpdateClient.parseRelease(release), "拒绝非 GitHub 安装包地址");
            Activity activity = startActivitySync(new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            Bitmap photo = Bitmap.createBitmap(2400, 1800, Bitmap.Config.ARGB_8888);
            File source = new File(getTargetContext().getCacheDir(), "native-photo-test.jpg");
            try (FileOutputStream out = new FileOutputStream(source)) { photo.compress(Bitmap.CompressFormat.JPEG, 90, out); } photo.recycle();
            Method copy = MainActivity.class.getDeclaredMethod("copyPhoto", Uri.class); copy.setAccessible(true);
            JSONObject converted = (JSONObject)copy.invoke(activity, Uri.fromFile(source));
            File dest = new File(getTargetContext().getFilesDir(), "photos/" + converted.getString("name"));
            check(dest.exists() && dest.length() > 0, "图片转码后保存在私有目录");
            Bitmap decoded = android.graphics.BitmapFactory.decodeFile(dest.getPath());
            check(Math.max(decoded.getWidth(), decoded.getHeight()) <= 1600, "图片缩小到最长边1600以内"); decoded.recycle();
            result.putString("stream", "PASS: " + checks + " native Android checks\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable e) { result.putString("stream", "FAIL after " + checks + " checks: " + e.toString()); finish(Activity.RESULT_CANCELED, result); }
    }
}
