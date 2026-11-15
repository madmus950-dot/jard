package com.madmus950.jard;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.List;

/**
 * يعطي الكاميرا مكاناً تكتب فيه الصورة، ويعطي تطبيقات الإرسال (واتساب…) الملف المُصدَّر.
 * لا يصل إليه أحد إلا بإذن مؤقت لملف بعينه، ومن مجلدين فقط داخل ذاكرة التطبيق المؤقتة.
 */
public class FilesProvider extends ContentProvider {

    static Uri uri(Context c, String dir, String name) {
        return new Uri.Builder().scheme("content").authority(c.getPackageName() + ".files")
                .appendPath(dir).appendPath(name).build();
    }

    private File file(Uri u) throws FileNotFoundException {
        List<String> seg = u.getPathSegments();
        if (seg == null || seg.size() != 2) throw new FileNotFoundException("bad path");
        String dir = seg.get(0), name = seg.get(1);
        if (!("cam".equals(dir) || "out".equals(dir))) throw new FileNotFoundException("bad dir");
        if (name.contains("/") || name.contains("..")) throw new FileNotFoundException("bad name");
        Context c = getContext();
        if (c == null) throw new FileNotFoundException("no context");
        return new File(new File(c.getCacheDir(), dir), name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri u, String mode) throws FileNotFoundException {
        File f = file(u);
        File parent = f.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public String getType(Uri u) {
        String n = u.getLastPathSegment();
        if (n == null) return null;
        n = n.toLowerCase();
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    public Cursor query(Uri u, String[] projection, String selection, String[] args, String sort) {
        File f;
        try {
            f = file(u);
        } catch (FileNotFoundException e) {
            return null;
        }
        String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override
    public Uri insert(Uri u, ContentValues v) {
        return null;
    }

    @Override
    public int update(Uri u, ContentValues v, String s, String[] a) {
        return 0;
    }

    @Override
    public int delete(Uri u, String s, String[] a) {
        return 0;
    }
}
