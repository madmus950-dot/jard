/*
 * حسابات الصيدلية — نسخة ويندوز.
 * نفس واجهة تطبيق الجوال (مجلد www)، تُقدَّم من خادم محلي على هذا الكمبيوتر فقط (127.0.0.1)،
 * وتتصل بنفس قاعدة Firebase فتبقى مربوطة بالجوال. الطباعة على طابعة الإيصالات مباشرة.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 47831;                      // ثابت: بيانات الجهاز (الدخول والنسخة المحلية) مرتبطة بهذا العنوان
const ROOT = path.join(__dirname, 'www');
const ORIGIN = 'http://127.0.0.1:' + PORT;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
let win = null;

// التواريخ يوم/شهر/سنة بأرقام إنجليزية كما في الفواتير، مهما كانت لغة ويندوز
app.commandLine.appendSwitch('lang', 'en-GB');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(start);
}
app.on('window-all-closed', () => app.quit());

/* ---------- إعدادات هذا الكمبيوتر (الطابعة) ---------- */
const cfgFile = () => path.join(app.getPath('userData'), 'desktop.json');
function cfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch (e) { return {}; } }
function setCfg(o) { const c = Object.assign(cfg(), o); try { fs.writeFileSync(cfgFile(), JSON.stringify(c)); } catch (e) {} return c; }

/* ---------- الخادم المحلي: ملفات التطبيق فقط، لهذا الكمبيوتر فقط ---------- */
function serve() {
  return new Promise((ok, no) => {
    const srv = http.createServer((req, res) => {
      let p;
      try { p = decodeURIComponent(new URL(req.url, ORIGIN).pathname); } catch (e) { res.writeHead(400); res.end(); return; }
      if (p === '/' || p === '') p = '/index.html';
      const f = path.normalize(path.join(ROOT, p));
      if (!f.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
      fs.readFile(f, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
    srv.on('error', no);
    srv.listen(PORT, '127.0.0.1', () => ok(srv));
  });
}

async function start() {
  try { await serve(); }
  catch (e) {
    dialog.showErrorBox('حسابات الصيدلية', 'تعذّر التشغيل: المنفذ ' + PORT + ' مستخدم من برنامج آخر.\n' + (e.message || e));
    app.quit();
    return;
  }
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1366, height: 820, minWidth: 900, minHeight: 600, show: false,
    backgroundColor: '#f2f5f3', title: 'حسابات الصيدلية', icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // الروابط الخارجية تفتح في المتصفح، ولا تُحمَّل داخل البرنامج
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url).catch(() => {}); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN + '/')) { e.preventDefault(); shell.openExternal(url).catch(() => {}); } });
  // تكبير وتصغير الخط وإعادة التحميل
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return;
    const wc = win.webContents;
    if (i.control && (i.key === '=' || i.key === '+')) { wc.setZoomLevel(Math.min(4, wc.getZoomLevel() + 0.5)); e.preventDefault(); }
    else if (i.control && i.key === '-') { wc.setZoomLevel(Math.max(-3, wc.getZoomLevel() - 0.5)); e.preventDefault(); }
    else if (i.control && i.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
    else if (i.key === 'F5') { wc.reload(); e.preventDefault(); }
    else if (i.control && i.shift && (i.key === 'I' || i.key === 'i')) { wc.toggleDevTools(); e.preventDefault(); }
  });
  win.loadURL(ORIGIN + '/index.html');
}

/* ---------- ما تطلبه الواجهة (window.JardApp) ---------- */
ipcMain.on('version', e => { e.returnValue = app.getVersion(); });

ipcMain.handle('save-file', async (e, name, mime, b64) => {
  const safe = String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
  const ext = path.extname(safe).slice(1);
  const dir = path.join(app.getPath('documents'), 'حسابات الصيدلية');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (x) {}
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(dir, safe), filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [] });
  if (r.canceled || !r.filePath) return 'cancel';
  try { fs.writeFileSync(r.filePath, Buffer.from(b64, 'base64')); shell.showItemInFolder(r.filePath); return 'ok'; }
  catch (x) { return 'error: ' + x.message; }
});

ipcMain.handle('share-text', (e, text) => { clipboard.writeText(String(text || '')); return 'copied'; });
ipcMain.handle('copy-text', (e, text) => { clipboard.writeText(String(text || '')); return 'ok'; });

ipcMain.handle('printers', async () => {
  try { return (await win.webContents.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName, isDefault: !!p.isDefault })); }
  catch (x) { return []; }
});
ipcMain.handle('get-printer', () => cfg().printer || '');
ipcMain.handle('set-printer', (e, name) => { setCfg({ printer: String(name || '') }); return 'ok'; });

/** الفواتير (receipt) تذهب مباشرة إلى طابعة الإيصالات إن اختيرت، وغيرها يفتح نافذة الطباعة */
ipcMain.handle('print', (e, title, kind) => new Promise(resolve => {
  const printer = kind === 'receipt' ? (cfg().printer || '') : '';
  const opts = printer
    ? { silent: true, deviceName: printer, printBackground: true, margins: { marginType: 'none' } }
    : { silent: false, printBackground: true };
  win.webContents.print(opts, (ok, reason) => resolve(ok ? 'ok' : (reason === 'cancelled' ? 'cancel' : 'fail: ' + reason)));
}));
