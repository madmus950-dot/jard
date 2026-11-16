package com.madmus950.jard;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.google.android.gms.tasks.OnFailureListener;
import com.google.android.gms.tasks.OnSuccessListener;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * قراءة النص من صورة على الجوال نفسه (ML Kit، الحروف اللاتينية)، بلا إنترنت.
 * من الصفحة: JardOcr.recognize(id, base64Jpeg) ثم تُستدعى window.__ocr(id, json) عند الانتهاء.
 */
public class OcrBridge {
    private final Activity act;
    private final WebView web;
    private TextRecognizer rec;

    public OcrBridge(Activity act, WebView web) {
        this.act = act;
        this.web = web;
    }

    private synchronized TextRecognizer recognizer() {
        if (rec == null) rec = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        return rec;
    }

    @JavascriptInterface
    public String available() {
        return "1";
    }

    @JavascriptInterface
    public void recognize(final String id, String b64) {
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) { done(id, "{\"error\":\"image\"}"); return; }
            final int w = bmp.getWidth(), h = bmp.getHeight();
            InputImage img = InputImage.fromBitmap(bmp, 0);
            recognizer().process(img)
                .addOnSuccessListener(new OnSuccessListener<Text>() {
                    @Override
                    public void onSuccess(Text t) {
                        try { done(id, toJson(t, w, h)); } catch (Exception e) { done(id, "{\"error\":\"json\"}"); }
                    }
                })
                .addOnFailureListener(new OnFailureListener() {
                    @Override
                    public void onFailure(Exception e) {
                        done(id, "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
                    }
                });
        } catch (Throwable e) {
            done(id, "{\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
        }
    }

    private static JSONArray box(Rect r) {
        JSONArray a = new JSONArray();
        if (r == null) return a;
        a.put(r.left); a.put(r.top); a.put(r.right); a.put(r.bottom);
        return a;
    }

    private static String toJson(Text t, int w, int h) throws Exception {
        JSONObject o = new JSONObject();
        o.put("w", w); o.put("h", h); o.put("text", t.getText());
        JSONArray blocks = new JSONArray();
        for (Text.TextBlock b : t.getTextBlocks()) {
            JSONObject bo = new JSONObject();
            bo.put("t", b.getText()); bo.put("b", box(b.getBoundingBox()));
            JSONArray lines = new JSONArray();
            for (Text.Line l : b.getLines()) {
                JSONObject lo = new JSONObject();
                lo.put("t", l.getText()); lo.put("b", box(l.getBoundingBox()));
                lines.put(lo);
            }
            bo.put("l", lines);
            blocks.put(bo);
        }
        o.put("blocks", blocks);
        return o.toString();
    }

    private void done(final String id, final String json) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript("window.__ocr&&window.__ocr(" + JSONObject.quote(id) + "," + json + ")", null);
            }
        });
    }
}
