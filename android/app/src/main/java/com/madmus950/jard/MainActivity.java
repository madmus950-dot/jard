package com.madmus950.jard;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Gravity;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * جرد الصيدلية: الواجهة كلها داخل التطبيق (assets/www) وتُقدَّم من عنوان محلي آمن،
 * فلا يحتاج التطبيق أي موقع خارجي غير خوادم Firebase من Google.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/index.html";
    static final int REQ_FILES = 41;
    static final int REQ_CAM = 42;

    private WebView web;
    private ValueCallback<Uri[]> pending;
    private File camFile;
    private Uri camUri;
    private PermissionRequest pendingPerm;
    private boolean pendingCapture;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            web = new WebView(this);
        } catch (Throwable t) {
            TextView tv = new TextView(this);
            tv.setText("لا يمكن تشغيل التطبيق على هذا الجهاز.\nفعّل أو حدّث «Android System WebView» من متجر Play ثم أعد فتح التطبيق.");
            tv.setTextSize(18);
            tv.setPadding(48, 48, 48, 48);
            tv.setGravity(Gravity.CENTER);
            setContentView(tv);
            return;
        }
        web.setBackgroundColor(Color.parseColor("#eef2f3"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " JardApp/" + version());
        web.addJavascriptInterface(new Bridge(), "JardApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                return HOST.equals(u.getHost()) ? asset(u.getPath()) : null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception e) {
                    // no app for this link
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest r) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        boolean video = false;
                        for (String res : r.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) video = true;
                        if (!video || !declaresCamera()) { r.deny(); return; }
                        if (cameraGranted()) { r.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE}); return; }
                        pendingPerm = r;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                camFile = null;
                camUri = null;
                String[] types = p.getAcceptTypes();
                boolean image = types != null && types.length > 0 && types[0] != null && types[0].startsWith("image/");
                if (p.isCaptureEnabled() && declaresCamera() && !cameraGranted()) {
                    pendingCapture = true;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
                    return true;
                }
                if (p.isCaptureEnabled()) {
                    Intent cam = cameraIntent();
                    if (cam != null) {
                        try {
                            startActivityForResult(cam, REQ_FILES);
                            return true;
                        } catch (ActivityNotFoundException e) {
                            camFile = null;
                            camUri = null;
                        }
                    }
                }
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType(image ? "image/*" : "*/*");
                if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(pick, REQ_FILES);
                } catch (ActivityNotFoundException e) {
                    pending = null;
                    cb.onReceiveValue(null);
                    toast("لا يوجد على الجهاز تطبيق لاختيار الملفات");
                }
                return true;
            }
        });

        web.loadUrl(START);
    }

    /** الكاميرا تحفظ الصورة كاملة الدقة في ملف مؤقت داخل التطبيق (أفضل لقراءة الباركود من الصورة المصغرة). */
    private Intent cameraIntent() {
        try {
            File dir = new File(getCacheDir(), "cam");
            if (!dir.exists()) dir.mkdirs();
            File[] old = dir.listFiles();
            long cutoff = System.currentTimeMillis() - 10 * 60 * 1000L;
            if (old != null) for (File f : old) if (f.lastModified() < cutoff) f.delete();
            camFile = new File(dir, "scan_" + System.currentTimeMillis() + ".jpg");
            camUri = FilesProvider.uri(this, "cam", camFile.getName());
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, camUri);
            i.setClipData(ClipData.newRawUri("", camUri));
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            return i;
        } catch (Exception e) {
            camFile = null;
            camUri = null;
            return null;
        }
    }

    boolean declaresCamera() {
        try {
            String[] perms = getPackageManager().getPackageInfo(getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
            if (perms != null) for (String x : perms) if (Manifest.permission.CAMERA.equals(x)) return true;
        } catch (Exception e) {
            // ignore
        }
        return false;
    }

    boolean cameraGranted() {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req != REQ_CAM) return;
        boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
        if (pendingPerm != null) {
            if (ok) pendingPerm.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else pendingPerm.deny();
            pendingPerm = null;
        }
        if (pendingCapture) {
            pendingCapture = false;
            Intent i = ok ? cameraIntent() : null;
            if (i == null) {
                i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
            }
            try {
                startActivityForResult(i, REQ_FILES);
            } catch (Exception e) {
                if (pending != null) { pending.onReceiveValue(null); pending = null; }
            }
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_FILES || pending == null) return;
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (camFile != null) {
                if (camFile.length() == 0 && data != null && data.getExtras() != null) {
                    Object bm = data.getExtras().get("data");
                    if (bm instanceof Bitmap) {
                        try (FileOutputStream o = new FileOutputStream(camFile)) {
                            ((Bitmap) bm).compress(Bitmap.CompressFormat.JPEG, 95, o);
                        } catch (Exception e) {
                            // keep out = null
                        }
                    }
                }
                if (camFile.length() > 0) out = new Uri[]{camUri};
            } else if (data != null) {
                ClipData c = data.getClipData();
                if (c != null && c.getItemCount() > 0) {
                    out = new Uri[c.getItemCount()];
                    for (int k = 0; k < out.length; k++) out[k] = c.getItemAt(k).getUri();
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
        }
        pending.onReceiveValue(out);
        pending = null;
        camFile = null;
        camUri = null;
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.isEmpty() || path.equals("/")) path = "/index.html";
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-cache");
        if (path.contains("..")) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
        }
        String name = "www" + path;
        try {
            InputStream in = getAssets().open(name);
            return new WebResourceResponse(mime(name), "utf-8", 200, "OK", h, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", h, new ByteArrayInputStream(new byte[0]));
        }
    }

    static String mime(String n) {
        n = n.toLowerCase();
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".ico")) return "image/x-icon";
        if (n.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    void toast(final String t) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, t, Toast.LENGTH_LONG).show();
            }
        });
    }

    /** ما تستدعيه الواجهة من داخل التطبيق: window.JardApp */
    class Bridge {
        @JavascriptInterface
        public String version() {
            return MainActivity.this.version();
        }

        @JavascriptInterface
        public String copyText(final String t) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("jard", t));
                    if (Build.VERSION.SDK_INT < 33) toast("تم النسخ");
                }
            });
            return "ok";
        }

        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent s = new Intent(Intent.ACTION_SEND);
                    s.setType("text/plain");
                    s.putExtra(Intent.EXTRA_TEXT, text);
                    try {
                        startActivity(Intent.createChooser(s, "مشاركة"));
                    } catch (Exception e) {
                        // no app to share with
                    }
                }
            });
        }

        /** طباعة ما في #print عبر خدمة الطباعة في أندرويد (طابعة أو حفظ PDF) */
        @JavascriptInterface
        public void print(final String title) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        String job = title == null || title.isEmpty() ? "طباعة" : title;
                        pm.print(job, web.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
                    } catch (Exception e) {
                        toast("تعذّرت الطباعة على هذا الجهاز");
                    }
                }
            });
        }

        /** يحفظ الملف في «التنزيلات/Jard» ثم يفتح قائمة الإرسال (واتساب وغيره). */
        @JavascriptInterface
        public String saveFile(String name, final String mime, String b64) {
            try {
                final byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                final String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                File dir = new File(getCacheDir(), "out");
                if (!dir.exists()) dir.mkdirs();
                File f = new File(dir, safe);
                try (FileOutputStream o = new FileOutputStream(f)) {
                    o.write(bytes);
                }
                boolean inDownloads = false;
                if (Build.VERSION.SDK_INT >= 29) {
                    try {
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                        cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                        cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Jard");
                        Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (u != null) {
                            try (OutputStream o = getContentResolver().openOutputStream(u)) {
                                if (o != null) {
                                    o.write(bytes);
                                    inDownloads = true;
                                }
                            }
                        }
                    } catch (Exception e) {
                        // sharing below still works
                    }
                }
                final boolean saved = inDownloads;
                final Uri share = FilesProvider.uri(MainActivity.this, "out", safe);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (saved) toast("حُفظ في التنزيلات/Jard: " + safe);
                        Intent s = new Intent(Intent.ACTION_SEND);
                        s.setType(mime);
                        s.putExtra(Intent.EXTRA_STREAM, share);
                        s.setClipData(ClipData.newRawUri(safe, share));
                        s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        try {
                            startActivity(Intent.createChooser(s, "إرسال الملف"));
                        } catch (Exception e) {
                            // nothing to share with
                        }
                    }
                });
                return "ok";
            } catch (Throwable t) {
                return "error: " + t.getMessage();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
