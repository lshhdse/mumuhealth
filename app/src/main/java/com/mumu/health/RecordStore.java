package com.mumu.health;

import android.content.Context;
import android.util.AtomicFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;

public final class RecordStore {
    private final AtomicFile file;
    private final JSONArray defaultTemplates, legacyTemplates;
    private JSONObject data;
    public RecordStore(Context context) throws Exception {
        file = new AtomicFile(new File(context.getFilesDir(), "records.json"));
        defaultTemplates = readTemplates(context, "web/workout-templates.json");
        legacyTemplates = readTemplates(context, "web/workout-templates-legacy.json");
        if (file.getBaseFile().exists()) {
            data = new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8));
            if (data.optInt("version") != 1 || data.optJSONArray("meals") == null || data.optJSONArray("workouts") == null)
                throw new Exception("记录文件格式有误，原文件已保留。");
        } else data = new JSONObject().put("version", 1).put("meals", new JSONArray()).put("workouts", new JSONArray());
        if (!data.has("templates")) data.put("templates", new JSONArray());
        if (data.optJSONArray("templates") == null) throw new Exception("模板文件格式有误，原文件已保留。");
        JSONObject upgraded = upgradeTemplateDefaults(data);
        if (upgraded != data && file.getBaseFile().exists()) write(upgraded);
        else data = upgraded;
    }
    private static JSONArray readTemplates(Context context, String path) throws Exception {
        try (java.io.InputStream in = context.getAssets().open(path)) {
            return new JSONArray(AiClient.read(in, 100000));
        }
    }
    private static JSONObject templateWithId(JSONArray templates, String id) throws Exception {
        for (int i = 0; i < templates.length(); i++) {
            JSONObject template = templates.getJSONObject(i);
            if (template.getString("id").equals(id)) return template;
        }
        return null;
    }
    // Saving adds metadata; only user-editable fields identify a changed preset.
    private static boolean sameTemplateContent(JSONObject template, JSONObject preset) throws Exception {
        if (preset == null || !template.optString("name").equals(preset.optString("name"))) return false;
        JSONArray exercises = template.getJSONArray("exercises"), defaults = preset.getJSONArray("exercises");
        if (exercises.length() != defaults.length()) return false;
        for (int i = 0; i < exercises.length(); i++) {
            JSONObject exercise = exercises.getJSONObject(i), baseline = defaults.getJSONObject(i);
            for (String field : new String[]{"type", "name", "note"}) {
                String fallback = field.equals("type") ? "strength" : "";
                if (!exercise.optString(field, fallback).equals(baseline.optString(field, fallback))) return false;
            }
            for (String field : new String[]{"sets", "reps"})
                if (exercise.optDouble(field, Double.NaN) != baseline.optDouble(field, Double.NaN)) return false;
            boolean blankWeight = !exercise.has("weight") || exercise.isNull("weight");
            boolean baselineBlank = !baseline.has("weight") || baseline.isNull("weight");
            if (blankWeight != baselineBlank || !blankWeight && exercise.optDouble("weight", Double.NaN) != baseline.optDouble("weight", Double.NaN)) return false;
        }
        return true;
    }
    private JSONObject upgradeTemplateDefaults(JSONObject source) throws Exception {
        if (source.optInt("templateDefaultsVersion") >= 2) return source;
        JSONObject upgraded = new JSONObject(source.toString());
        JSONArray templates = new JSONArray(defaultTemplates.toString()), previous = source.getJSONArray("templates");
        for (int i = 0; i < previous.length(); i++) {
            JSONObject template = previous.getJSONObject(i);
            String id = template.getString("id");
            JSONObject current = templateWithId(defaultTemplates, id), legacy = templateWithId(legacyTemplates, id);
            if (current == null && legacy == null) templates.put(new JSONObject(template.toString()));
            else if (!sameTemplateContent(template, current) && !sameTemplateContent(template, legacy))
                templates.put(new JSONObject(template.toString()).put("id", UUID.randomUUID().toString()));
        }
        return upgraded.put("templateDefaultsVersion", 2).put("templates", templates);
    }
    public synchronized JSONObject snapshot() throws Exception { return new JSONObject(data.toString()); }
    private void write(JSONObject next) throws Exception {
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(next.toString().getBytes(StandardCharsets.UTF_8));
            file.finishWrite(output);
            data = next;
        } catch (Exception error) { if (output != null) file.failWrite(output); throw new Exception("保存失败，请检查手机存储空间。"); }
    }
    public static String text(JSONObject object, String field, int max) throws Exception {
        String value = object.optString(field, "").trim();
        if (value.length() > max) throw new Exception("填写内容过长，请适当缩短。");
        return value;
    }
    public static double number(JSONObject object, String field, double min, double max) throws Exception {
        double value = object.optDouble(field, Double.NaN);
        if (!Double.isFinite(value) || value < min || value > max) throw new Exception("请填写有效的数值：" + field);
        return value;
    }
    private JSONObject normalize(String kind, JSONObject input) throws Exception {
        if (kind.equals("templates")) return normalizeTemplate(input);
        String date = text(input, "date", 10);
        try { if (!LocalDate.parse(date).toString().equals(date)) throw new Exception(); } catch (Exception e) { throw new Exception("请选择有效日期。"); }
        String id = input.optString("id", "");
        if (id.isEmpty()) id = UUID.randomUUID().toString();
        if (!id.matches("[a-zA-Z0-9-]{1,80}")) throw new Exception("记录编号无效。");
        JSONObject out = new JSONObject().put("id", id).put("date", date).put("note", text(input, "note", 2000)).put("updatedAt", System.currentTimeMillis());
        if (kind.equals("meals")) {
            String meal = text(input, "meal", 20);
            if (!meal.equals("breakfast") && !meal.equals("lunch") && !meal.equals("dinner")) throw new Exception("请选择餐次。");
            String description = text(input, "description", 3000);
            String photo = text(input, "photo", 80);
            if (!photo.isEmpty() && !photo.matches("[a-f0-9-]+\\.jpg")) throw new Exception("照片格式无效。");
            JSONArray foods = input.optJSONArray("foods");
            if (foods == null || foods.length() > 30 || (foods.length() == 0 && description.isEmpty() && photo.isEmpty()))
                throw new Exception("请描述吃了什么、添加照片，或手动添加食物。");
            JSONArray cleanFoods = new JSONArray();
            for (int i = 0; i < foods.length(); i++) {
                JSONObject food = foods.getJSONObject(i);
                String name = text(food, "name", 100);
                if (name.isEmpty()) throw new Exception("请填写食物名称。");
                JSONObject clean = new JSONObject().put("name", name).put("portion", text(food, "portion", 100));
                clean.put("kcal", food.isNull("kcal") || !food.has("kcal") ? JSONObject.NULL : Math.round(number(food, "kcal", 0, 20000)));
                cleanFoods.put(clean);
            }
            String status = text(input, "analysisStatus", 12);
            if (status.isEmpty()) status = "none";
            if (!status.equals("none") && !status.equals("pending") && !status.equals("done") && !status.equals("failed")) throw new Exception("分析状态无效。");
            String token = text(input, "analysisToken", 80);
            if (!token.isEmpty() && !token.matches("[a-zA-Z0-9-]{1,80}")) throw new Exception("分析编号无效。");
            if (status.equals("pending") && (token.isEmpty() || description.isEmpty() && photo.isEmpty())) throw new Exception("分析请求无效。");
            out.put("meal", meal).put("foods", cleanFoods).put("photo", photo).put("description", description);
            out.put("title", text(input, "title", 100)).put("source", input.optString("source", "manual"))
                .put("assumptions", text(input, "assumptions", 2000)).put("analysisStatus", status)
                .put("analysisToken", token).put("analysisError", text(input, "analysisError", 500));
        } else {
            String type = text(input, "type", 20);
            if (!type.equals("cardio") && !type.equals("strength")) throw new Exception("请选择训练类型。");
            String name = text(input, "name", 100);
            if (name.isEmpty()) throw new Exception("请填写运动名称。");
            out.put("type", type).put("name", name);
            if (type.equals("cardio")) out.put("minutes", number(input, "minutes", 1, 1440));
            else {
                double sets = number(input, "sets", 1, 100), reps = number(input, "reps", 1, 1000);
                if (sets != Math.floor(sets) || reps != Math.floor(reps)) throw new Exception("组数与次数需要是整数。");
                out.put("sets", (int)sets).put("reps", (int)reps);
                out.put("weight", input.isNull("weight") || !input.has("weight") ? JSONObject.NULL : number(input, "weight", 0, 2000));
            }
        }
        return out;
    }
    private JSONObject normalizeTemplate(JSONObject input) throws Exception {
        String id = text(input, "id", 80), name = text(input, "name", 100);
        if (id.isEmpty()) id = UUID.randomUUID().toString();
        if (!id.matches("[a-zA-Z0-9-]{1,80}")) throw new Exception("模板编号无效。");
        if (name.isEmpty()) throw new Exception("请填写模板名称，如练腿、练背。");
        JSONArray exercises = input.optJSONArray("exercises"), clean = new JSONArray();
        if (exercises == null || exercises.length() < 1 || exercises.length() > 30) throw new Exception("每个模板需要 1 到 30 个动作。");
        for (int i = 0; i < exercises.length(); i++) {
            if (!exercises.getJSONObject(i).optString("type", "strength").equals("strength")) throw new Exception("模板只支持力量训练动作。");
            JSONObject source = new JSONObject(exercises.getJSONObject(i).toString()).put("date", "2000-01-01").put("type", "strength");
            source.remove("id");
            JSONObject exercise;
            try { exercise = normalize("workouts", source); }
            catch (Exception error) { throw new Exception("动作 " + (i + 1) + "：" + error.getMessage()); }
            exercise.remove("id"); exercise.remove("date"); exercise.remove("updatedAt");
            clean.put(exercise);
        }
        return new JSONObject().put("id", id).put("name", name).put("exercises", clean).put("updatedAt", System.currentTimeMillis());
    }
    public synchronized JSONObject save(String kind, JSONObject input) throws Exception {
        JSONObject record = normalize(kind, input);
        JSONObject next = snapshot();
        JSONArray records = next.getJSONArray(kind), result = new JSONArray();
        boolean replaced = false;
        for (int i = 0; i < records.length(); i++) {
            JSONObject old = records.getJSONObject(i);
            if (old.getString("id").equals(record.getString("id"))) { result.put(record); replaced = true; }
            else result.put(old);
        }
        if (!replaced) result.put(record);
        next.put(kind, result);
        write(next);
        return record;
    }
    public synchronized JSONArray saveWorkouts(JSONArray inputs) throws Exception {
        if (inputs == null || inputs.length() == 0 || inputs.length() > 30)
            throw new Exception("请添加 1 到 30 项运动。");
        JSONArray saved = new JSONArray();
        java.util.HashSet<String> ids = new java.util.HashSet<>();
        for (int i = 0; i < inputs.length(); i++) {
            JSONObject record;
            try { record = normalize("workouts", inputs.getJSONObject(i)); }
            catch (Exception error) { throw new Exception("运动 " + (i + 1) + "：" + error.getMessage()); }
            if (!ids.add(record.getString("id"))) throw new Exception("训练记录编号重复，请重新打开表单。");
            saved.put(record);
        }
        JSONObject next = snapshot();
        JSONArray current = next.getJSONArray("workouts"), merged = new JSONArray();
        for (int i = 0; i < current.length(); i++) {
            JSONObject old = current.getJSONObject(i);
            if (ids.contains(old.getString("id"))) {
                for (int j = 0; j < saved.length(); j++) {
                    JSONObject replacement = saved.getJSONObject(j);
                    if (replacement.getString("id").equals(old.getString("id"))) { merged.put(replacement); break; }
                }
                ids.remove(old.getString("id"));
            } else merged.put(old);
        }
        for (int i = 0; i < saved.length(); i++) {
            JSONObject record = saved.getJSONObject(i);
            if (ids.contains(record.getString("id"))) merged.put(record);
        }
        next.put("workouts", merged);
        write(next);
        return saved;
    }
    public synchronized void delete(String kind, String id) throws Exception {
        JSONObject next = snapshot();
        JSONArray records = next.getJSONArray(kind), result = new JSONArray();
        for (int i = 0; i < records.length(); i++) { JSONObject record = records.getJSONObject(i); if (!record.getString("id").equals(id)) result.put(record); }
        next.put(kind, result); write(next);
    }
    public synchronized JSONObject findPendingMeal(String id, String token) throws Exception {
        JSONArray meals = data.getJSONArray("meals");
        for (int i = 0; i < meals.length(); i++) {
            JSONObject meal = meals.getJSONObject(i);
            if (meal.getString("id").equals(id) && meal.optString("analysisStatus").equals("pending")
                && meal.optString("analysisToken").equals(token)) return new JSONObject(meal.toString());
        }
        return null;
    }
    public synchronized JSONObject applyMealAnalysis(String id, String token, JSONObject estimate, String error) throws Exception {
        JSONObject meal = findPendingMeal(id, token);
        if (meal == null) return null;
        if (error == null && estimate != null && estimate.getJSONArray("foods").length() > 0) {
            meal.put("foods", estimate.getJSONArray("foods"));
            meal.put("title", text(estimate, "title", 100));
            meal.put("assumptions", text(estimate, "assumptions", 2000));
            meal.put("source", "ai").put("analysisStatus", "done").put("analysisError", "");
        } else {
            String reason = error == null && estimate != null ? estimate.optString("assumptions", "").trim() : error;
            if (reason == null || reason.isEmpty()) reason = "没有识别到食物，请补充描述或手动填写。";
            meal.put("analysisStatus", "failed").put("analysisError", reason.length() > 500 ? reason.substring(0, 500) : reason);
        }
        return save("meals", meal);
    }
    public synchronized void restore(JSONObject imported) throws Exception {
        if (imported.optInt("version") != 1) throw new Exception("不支持此备份版本。");
        JSONObject clean = new JSONObject().put("version", 1).put("templateDefaultsVersion",
            imported.has("templates") ? imported.optInt("templateDefaultsVersion", 0) : data.optInt("templateDefaultsVersion", 0));
        for (String kind : new String[]{"meals", "workouts", "templates"}) {
            JSONArray list = kind.equals("templates") && !imported.has(kind) ? data.getJSONArray(kind) : imported.getJSONArray(kind), result = new JSONArray();
            if (list.length() > 50000) throw new Exception("备份记录过多。");
            java.util.HashSet<String> ids = new java.util.HashSet<>();
            for (int i = 0; i < list.length(); i++) {
                JSONObject record = normalize(kind, list.getJSONObject(i));
                if (!ids.add(record.getString("id"))) throw new Exception("备份存在重复记录。");
                result.put(record);
            }
            clean.put(kind, result);
        }
        write(upgradeTemplateDefaults(clean));
    }
}
