/* الدخول ثم تشغيل التطبيق. لا يبدأ التطبيق ولا يُحمَّل شيء من البيانات قبل التحقق من الحساب. */
import * as FB from './fbsdk.js';
const cfg = window.JARD_CONFIG || {};
const APP = window.JardApp || null;   // موجود فقط داخل تطبيق أندرويد
const $ = s => document.querySelector(s);
const ERR = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/wrong-password': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/user-not-found': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/invalid-email': 'اسم المستخدم غير صحيح.',
  'auth/user-disabled': 'هذا الحساب معطّل. راجع المشرف.',
  'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  'auth/network-request-failed': 'تعذّر الوصول إلى خادم الدخول. تأكد من الإنترنت، ثم اضغط «فحص الاتصال بالخادم» بالأسفل.',
  'auth/invalid-api-key': 'إعدادات Firebase في config.js غير صحيحة.',
  'auth/api-key-not-valid': 'إعدادات Firebase في config.js غير صحيحة.'
};
const toEmail = u => { u = u.trim().toLowerCase(); return u.includes('@') ? u : u + '@' + (cfg.emailDomain || 'jard.local'); };
function view(name, text){
  $('#login').hidden = name === 'app';
  $('#loginForm').hidden = name !== 'form';
  $('#loginWait').hidden = name !== 'wait';
  $('#loginText').textContent = text || '';
  $('#loginErr').textContent = name === 'form' ? (text || '') : '';
  $('#loginText').hidden = name === 'form';
}
/* ---------- فحص الاتصال: هل خوادم Firebase (Google) مفتوحة على هذه الشبكة؟ ---------- */
const HOSTS = [['identitytoolkit.googleapis.com', 'الدخول'], ['securetoken.googleapis.com', 'تجديد الدخول'], ['firestore.googleapis.com', 'البيانات']];
async function reach(h){
  const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
  try { await fetch('https://' + h + '/', { mode: 'no-cors', cache: 'no-store', signal: c.signal }); return true; }
  catch (e) { return false; }
  finally { clearTimeout(t); }
}
let checking = false;
async function netCheck(){
  const out = $('#netOut'), b = $('#netBtn');
  if (!out || checking) return;
  checking = true; if (b) b.disabled = true;
  out.textContent = 'جارٍ فحص الاتصال…';
  const r = await Promise.all(HOSTS.map(h => reach(h[0])));
  out.textContent = '';
  HOSTS.forEach((h, i) => {
    const d = document.createElement('div'), host = document.createElement('span');
    d.textContent = (r[i] ? '✓ ' : '✗ ') + 'خادم ' + h[1] + ' ';
    host.dir = 'ltr'; host.style.fontSize = '12px'; host.style.opacity = '.75'; host.textContent = h[0];
    d.appendChild(host); d.style.color = r[i] ? 'var(--good)' : 'var(--bad)';
    out.appendChild(d);
  });
  const s = document.createElement('div'); s.style.marginTop = '6px';
  s.textContent = r.every(Boolean) ? 'الاتصال بالخوادم يعمل. إن لم يُفتح الحساب فراجع اسم المستخدم وكلمة المرور.'
    : !r.some(Boolean) ? 'لا اتصال بخوادم Google من هذا الجهاز: تأكد من الإنترنت أو جرّب شبكة أخرى.'
    : 'بعض الخوادم محجوبة على هذه الشبكة: جرّب شبكة أخرى (واي فاي أو بيانات الجوال) وأرسل صورة هذه النتيجة للمشرف.';
  out.appendChild(s);
  checking = false; if (b) b.disabled = false;
}
function addTools(){
  const box = document.querySelector('#login .box');
  if (!box || $('#netBtn')) return;
  const d = document.createElement('div');
  d.style.marginTop = '14px'; d.style.textAlign = 'center';
  d.innerHTML = '<button type="button" class="btn ghost" id="netBtn" style="width:100%">فحص الاتصال بالخادم</button><div id="netOut" class="hint" style="margin-top:8px;text-align:right"></div>';
  if (APP && APP.version) { const v = document.createElement('div'); v.className = 'hint'; v.style.marginTop = '8px'; v.textContent = 'تطبيق جرد الصيدلية — نسخة ' + APP.version(); d.appendChild(v); }
  box.appendChild(d);
  $('#netBtn').addEventListener('click', netCheck);
}

/* ---------- داخل تطبيق أندرويد: حفظ الملفات ومشاركتها، والنسخ للحافظة ---------- */
const MIME = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv', json: 'application/json' };
function b64(blob){ return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); }); }
const appDownloads = APP && APP.saveFile ? {
  save: async ({filename, data}) => {
    const ext = String(filename).split('.').pop().toLowerCase();
    const type = MIME[ext] || (data instanceof Blob && data.type) || 'application/octet-stream';
    const blob = data instanceof Blob ? data : new Blob([data], {type});
    const res = String(APP.saveFile(String(filename), type, await b64(blob)));
    if (res !== 'ok') { const e = new Error(res); e.code = 'app-save'; throw e; }
  }
} : null;
if (APP && APP.copyText) {
  try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { if (String(APP.copyText(String(t))) !== 'ok') throw new Error('copy'); } } }); } catch (e) {}
}

function clearLocal(){ ['jard.entries', 'jard.rv', 'jard.who', 'jard.uid'].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); }
let started = false;

let entering = false;
async function enter(user){
  if (started || entering) return;
  entering = true;
  try { await enter2(user); } finally { entering = false; }
}
async function enter2(user){
  view('wait', 'جارٍ التحقق من الصلاحية…');
  let staff = null;
  try { staff = await FB.getStaff((user.email || '').toLowerCase()); }
  catch (e) { view('form', 'تعذّر التحقق من الحساب (' + (e.code || e.message || 'خطأ') + '). تأكد من الإنترنت وأعد المحاولة.'); if (e.code === 'unavailable') netCheck(); return; }
  if (!staff || staff.active !== true || (staff.role !== 'admin' && staff.role !== 'counter')) {
    try { await FB.signOut(); } catch (e) {}
    view('form', 'حسابك غير مفعّل في هذا الجرد. راجع المشرف.');
    return;
  }
  started = true;
  let last = null; try { last = localStorage.getItem('jard.uid'); } catch (e) {}
  if (last && last !== user.uid) clearLocal();            // another employee on the same phone: never mix local data
  try { localStorage.setItem('jard.uid', user.uid); } catch (e) {}
  window.__UID = user.uid; window.__NAME = (staff.name || '').trim() || user.email.split('@')[0]; window.__ROLE = staff.role;
  window.__jardStore = { use: async n => n === 'db' ? FB.db : n === 'downloads' ? appDownloads : null };
  view('wait', 'جارٍ تحميل قاعدة الأصناف…');
  let cat = null;
  try { cat = await FB.loadCatalog(); }
  catch (e) { started = false; view('form', 'تعذّر تحميل قاعدة الأصناف (' + (e.code || e.message || 'خطأ') + ').'); return; }
  if (!cat) {
    if (staff.role !== 'admin') { started = false; view('form', 'لم تُرفع قاعدة الأصناف بعد. أبلغ المشرف.'); return; }
    cat = { co: [], un: [], it: [] };
  }
  window.__CAT = cat;
  window.__admin = staff.role === 'admin' ? { listStaff: FB.listStaff, saveCatalog: o => FB.saveCatalog(o, window.__NAME) } : null;
  window.__logout = async () => { clearLocal(); try { await FB.signOut(); } catch (e) {} location.reload(); };
  document.body.classList.add('ready');
  view('app');
  window.__startApp();
}

async function main(){
  addTools();
  view('wait', 'جارٍ التحميل…');
  try { await FB.init(cfg.firebase); }
  catch (e) { view('form', 'تعذّر تشغيل Firebase. راجع ملف config.js.'); return; }
  $('#loginForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const u = $('#lgUser').value, p = $('#lgPass').value;
    if (!u.trim() || !p) { $('#loginErr').textContent = 'اكتب اسم المستخدم وكلمة المرور.'; return; }
    $('#lgBtn').disabled = true; $('#loginErr').textContent = '';
    try { const user = await FB.signIn(toEmail(u), p); $('#lgPass').value = ''; await enter(user); }
    catch (e) { $('#loginErr').textContent = ERR[e.code] || ('تعذّر الدخول (' + (e.code || e.message || 'خطأ') + ')'); if (e.code === 'auth/network-request-failed') netCheck(); }
    $('#lgBtn').disabled = false;
  });
  FB.onAuth(user => { if (user) enter(user); else if (!started) view('form', ''); });
}
main();
