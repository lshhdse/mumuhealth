package com.mumu.health;

import android.content.Context;
import android.content.Intent;
import android.content.ClipData;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;

final class UpdateClient {
    static final String API = "https://api.github.com/repos/lshhdse/mumuhealth/releases/latest";
    static final String AUTHORITY = "com.mumu.health.updates";
    private static final long MAX_APK_BYTES = 100L * 1024 * 1024;

    static final class Release {
        final int code;
        final String name, url, sha256;
        final long size;
        Release(int code, String name, String url, String sha256, long size) {
            this.code = code; this.name = name; this.url = url; this.sha256 = sha256; this.size = size;
        }
    }

    static JSONObject check(Context context) throws Exception {
        HttpURLConnection connection = open(API, "application/vnd.github+json");
        try {
            int status = connection.getResponseCode();
            if (status == 404) return new JSONObject().put("status", "unpublished").put("available", false);
            if (status != 200) throw new Exception("无法检查更新（GitHub 返回 " + status + "）。");
            byte[] bytes = readLimited(connection.getInputStream(), 512 * 1024);
            Release release = parseRelease(new JSONObject(new String(bytes, "UTF-8")));
            int installed = versionCode(context.getPackageManager().getPackageInfo(context.getPackageName(), 0));
            return new JSONObject().put("status", release.code > installed ? "available" : "current")
                .put("available", release.code > installed).put("versionCode", release.code)
                .put("versionName", release.name).put("installedVersionCode", installed);
        } finally { connection.disconnect(); }
    }

    static Release latest() throws Exception {
        HttpURLConnection connection = open(API, "application/vnd.github+json");
        try {
            if (connection.getResponseCode() != 200) throw new Exception("无法获取最新安装包，请稍后重试。");
            return parseRelease(new JSONObject(new String(readLimited(connection.getInputStream(), 512 * 1024), "UTF-8")));
        } finally { connection.disconnect(); }
    }

    static Release parseRelease(JSONObject release) throws Exception {
        if (release.optBoolean("draft") || release.optBoolean("prerelease")) throw new Exception("最新发布版本无效。");
        String tag = release.optString("tag_name");
        if (!tag.matches("build-[1-9][0-9]{0,8}")) throw new Exception("最新版本编号无效。");
        int code = Integer.parseInt(tag.substring(6));
        String name = release.optString("name", tag);
        JSONArray assets = release.optJSONArray("assets");
        if (assets == null) throw new Exception("最新版本没有安装包。");
        String expectedName = "mumu-health-" + code + ".apk";
        for (int i = 0; i < assets.length(); i++) {
            JSONObject asset = assets.getJSONObject(i);
            if (!expectedName.equals(asset.optString("name"))) continue;
            String url = asset.optString("browser_download_url");
            URL parsed = new URL(url);
            if (!"https".equals(parsed.getProtocol()) || !"github.com".equals(parsed.getHost()) ||
                !parsed.getPath().matches("/lshhdse/mumuhealth/releases/download/build-" + code + "/mumu-health-" + code + "\\.apk") ||
                parsed.getQuery() != null || parsed.getRef() != null || parsed.getUserInfo() != null) {
                throw new Exception("安装包地址无效。");
            }
            String digest = asset.optString("digest");
            if (!digest.matches("sha256:[a-fA-F0-9]{64}")) {
                java.util.regex.Matcher match = java.util.regex.Pattern.compile("SHA256: ([a-fA-F0-9]{64})").matcher(release.optString("body"));
                if (match.find()) digest = "sha256:" + match.group(1);
            }
            if (!digest.matches("sha256:[a-fA-F0-9]{64}")) throw new Exception("安装包缺少 SHA-256 校验值。");
            long size = asset.optLong("size");
            if (size < 1024 || size > MAX_APK_BYTES) throw new Exception("安装包大小无效。");
            return new Release(code, name, url, digest.substring(7).toLowerCase(), size);
        }
        throw new Exception("最新版本没有可用的安装包。");
    }

    static File downloadAndVerify(Context context, Release release) throws Exception {
        int installed = versionCode(context.getPackageManager().getPackageInfo(context.getPackageName(), 0));
        if (release.code <= installed) throw new Exception("当前已是最新版本。");
        File dir = new File(context.getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法准备更新目录。");
        File target = new File(dir, "update.apk"), part = new File(dir, "update.part");
        if (part.exists()) part.delete();
        HttpURLConnection connection = open(release.url, "application/vnd.android.package-archive");
        try {
            if (connection.getResponseCode() != 200) throw new Exception("下载更新失败，请稍后重试。");
            URL destination = connection.getURL();
            if (!"https".equals(destination.getProtocol()) || !("github.com".equals(destination.getHost()) || destination.getHost().endsWith(".githubusercontent.com")))
                throw new Exception("下载地址不安全。");
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            long count = 0;
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[64 * 1024]; int n;
                while ((n = in.read(buffer)) != -1) {
                    count += n;
                    if (count > MAX_APK_BYTES) throw new Exception("安装包超过大小限制。");
                    hash.update(buffer, 0, n); out.write(buffer, 0, n);
                }
                out.getFD().sync();
            }
            if (count != release.size || !hex(hash.digest()).equals(release.sha256)) throw new Exception("安装包校验失败，请重试。");
            verifyPackage(context, part, release.code);
            if (target.exists() && !target.delete()) throw new Exception("无法替换旧安装包。");
            if (!part.renameTo(target)) throw new Exception("无法保存安装包。");
            return target;
        } finally { connection.disconnect(); if (part.exists()) part.delete(); }
    }

    static Intent installerIntent() {
        Uri uri = Uri.parse("content://" + AUTHORITY + "/update.apk");
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
        intent.setClipData(ClipData.newRawUri("update", uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        return intent;
    }

    static Intent permissionIntent(Context context) {
        return new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
    }

    private static void verifyPackage(Context context, File apk, int expectedCode) throws Exception {
        PackageManager pm = context.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo downloaded = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        PackageInfo installed = pm.getPackageInfo(context.getPackageName(), flags);
        if (downloaded == null || !context.getPackageName().equals(downloaded.packageName) || versionCode(downloaded) != expectedCode)
            throw new Exception("安装包应用名称或版本不符。");
        Signature[] next = signatures(downloaded), current = signatures(installed);
        if (next == null || current == null || next.length != current.length) throw new Exception("安装包签名不符。");
        for (Signature signature : next) if (!Arrays.asList(current).contains(signature)) throw new Exception("安装包签名不符。");
    }

    private static Signature[] signatures(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= 28) return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        return info.signatures;
    }
    private static int versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? (int) info.getLongVersionCode() : info.versionCode;
    }
    private static HttpURLConnection open(String address, String accept) throws Exception {
        URL url = new URL(address);
        if (!"https".equals(url.getProtocol())) throw new Exception("更新地址必须使用 HTTPS。");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setConnectTimeout(10000); connection.setReadTimeout(30000);
        connection.setRequestProperty("User-Agent", "MumuHealth-Android");
        connection.setRequestProperty("Accept", accept);
        return connection;
    }
    private static byte[] readLimited(InputStream in, int max) throws Exception {
        try (InputStream input = in; java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int n, count = 0;
            while ((n = input.read(buffer)) != -1) { count += n; if (count > max) throw new Exception("更新信息过大。"); out.write(buffer, 0, n); }
            return out.toByteArray();
        }
    }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(java.util.Locale.US, "%02x", value & 0xff));
        return result.toString();
    }
}
