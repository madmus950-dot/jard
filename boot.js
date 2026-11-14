/* الدخول ثم تشغيل التطبيق. لا يبدأ التطبيق ولا يُحمَّل شيء من البيانات قبل التحقق من الحساب. */
import * as FB from './fbsdk.js';
const cfg = window.JARD_CONFIG || {};
const $ = s => document.querySelector(s);
const ERR = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/wrong-password': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/user-not-found': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/invalid-email': 'اسم المستخدم غير صحيح.',
  'auth/user-disabled': 'هذا الحساب معطّل. راجع المشرف.',
  'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  'auth/network-request-failed': 'لا يوجد اتصال بالإنترنت.',
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
  catch (e) { view('form', 'تعذّر التحقق من الحساب (' + (e.code || e.message || 'خطأ') + '). تأكد من الإنترنت وأعد المحاولة.'); return; }
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
  window.__jardStore = { use: async n => n === 'db' ? FB.db : null };
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
  view('wait', 'جارٍ التحميل…');
  try { await FB.init(cfg.firebase); }
  catch (e) { view('form', 'تعذّر تشغيل Firebase. راجع ملف config.js.'); return; }
  $('#loginForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const u = $('#lgUser').value, p = $('#lgPass').value;
    if (!u.trim() || !p) { $('#loginErr').textContent = 'اكتب اسم المستخدم وكلمة المرور.'; return; }
    $('#lgBtn').disabled = true; $('#loginErr').textContent = '';
    try { const user = await FB.signIn(toEmail(u), p); $('#lgPass').value = ''; await enter(user); }
    catch (e) { $('#loginErr').textContent = ERR[e.code] || ('تعذّر الدخول (' + (e.code || e.message || 'خطأ') + ')'); }
    $('#lgBtn').disabled = false;
  });
  FB.onAuth(user => { if (user) enter(user); else if (!started) view('form', ''); });
}
main();
