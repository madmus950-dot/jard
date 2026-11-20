/* التشغيل: الدخول، ثم فتح البيانات، ثم التنقل بين الصفحات. */
import { h, $, icon, toast } from './ui.js';
import { Store } from './store.js';
import { home } from './v_home.js';
import { docView } from './v_doc.js';
import { vchView } from './v_vch.js';
import { partiesView, partyView, partyEdit } from './v_parties.js';
import { itemsView, itemView, itemEdit } from './v_items.js';
import { reportsView, reportView } from './v_reports.js';
import { moreView, vouchersView, voucherView, settingsView, importView } from './v_more.js';
import { closeView } from './v_close.js';
import { startReceiver, scanpcView } from './remote.js';

const cfg = window.JARD_CONFIG || {};
if (cfg.env) { try { const b = document.createElement('div'); b.textContent = 'نسخة اختبار (' + ((cfg.firebase || {}).projectId || '') + ') بيانات تجريبية فقط'; b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b42318;color:#fff;text-align:center;font:600 12px sans-serif;padding:2px;pointer-events:none'; document.body.appendChild(b); } catch (e) {} }
const params = new URLSearchParams(location.search);
const app = $('#app');
let be = null, store = null, ctx = null, cur = null, unsubStore = null, entered = false;

/* ---------- الصلاحيات ---------- */
const CASHIER = new Set(['sale', 'sret', 'pur', 'rcpt', 'party-add', 'item-add', 'r-daily', 'r-expiry', 'r-short', 'r-aging']);
const can = (role, a) => role === 'admin' || (role === 'cashier' && CASHIER.has(a));

/* ---------- الدخول ---------- */
const ERR = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة.', 'auth/wrong-password': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/user-not-found': 'اسم المستخدم أو كلمة المرور غير صحيحة.', 'auth/invalid-email': 'اسم المستخدم غير صحيح.',
  'auth/user-disabled': 'هذا الحساب معطّل.', 'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  'auth/network-request-failed': 'تعذّر الوصول إلى خادم الدخول. تأكد من الإنترنت.'
};
const toEmail = u => { u = u.trim().toLowerCase(); return u.includes('@') ? u : u + '@' + (cfg.emailDomain || 'jard.local'); };
const roleOf = staff => staff && staff.active === true ? (staff.acc || (staff.role === 'admin' ? 'admin' : '')) : '';

/* ---------- الدخول بدون إنترنت ----------
   بعد كل دخول ناجح بالإنترنت يُحفظ على هذا الجهاز: الاسم والصلاحية، وبصمة مشتقة من كلمة المرور (PBKDF2، لا كلمة المرور نفسها).
   بلا إنترنت يُقبل الدخول بنفس كلمة المرور لمن دخل على هذا الجهاز بالإنترنت خلال آخر 30 يوماً. السندات تُحفظ على الجهاز،
   وعند عودة الاتصال يُعاد الدخول للخادم في الخلفية، وتُراجع الصلاحية، وتُرفع السندات. */
const OFF_DAYS = 30, OFF_IT = 150000;
let pendingPw = null, offAuth = null, resumeTimer = null;
const offKey = email => 'pharm.off.' + email;
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const canHash = () => !!(window.crypto && crypto.subtle && window.TextEncoder);
async function pwHash(pw, salt, it) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), c => c.charCodeAt(0)), iterations: it }, k, 256);
  return b64(bits);
}
function offGet(email) { try { return JSON.parse(localStorage.getItem(offKey(email)) || 'null'); } catch (e) { return null; } }
async function offRemember(uid, email, name, role, pw) {
  const old = offGet(email);
  const rec = { uid, name, role, at: Date.now() };
  if (old && old.uid === uid && old.hash) Object.assign(rec, { salt: old.salt, it: old.it, hash: old.hash });
  if (pw && canHash()) { try { const salt = b64(crypto.getRandomValues(new Uint8Array(16))); Object.assign(rec, { salt, it: OFF_IT, hash: await pwHash(pw, salt, OFF_IT) }); } catch (e) {} }
  try { localStorage.setItem(offKey(email), JSON.stringify(rec)); } catch (e) {}
}
const netErr = e => !navigator.onLine || /network|unavailable|offline|timeout|deadline/i.test(String((e && (e.code || e.message)) || ''));
const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
/** يعيد true إن دخل، أو نص الخطأ */
async function offlineLogin(email, pw) {
  const rec = offGet(email);
  if (!rec || !rec.hash || !canHash()) return 'لا يوجد إنترنت. هذا الحساب لم يدخل على هذا الجهاز بالإنترنت من قبل، فيحتاج الدخول الأول إلى الإنترنت.';
  if (Date.now() - (rec.at || 0) > OFF_DAYS * 864e5) return 'لا يوجد إنترنت، وآخر دخول بالإنترنت على هذا الجهاز أقدم من ' + OFF_DAYS + ' يوماً. اتصل بالإنترنت مرة للدخول.';
  let h1 = '';
  try { h1 = await pwHash(pw, rec.salt, rec.it || OFF_IT); } catch (e) { return 'تعذّر التحقق بدون إنترنت.'; }
  if (h1 !== rec.hash) return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  if (rec.role !== 'admin' && rec.role !== 'cashier') return 'حسابك غير مفعّل في الحسابات.';
  entered = true; offAuth = { email, pw };
  await start({ uid: rec.uid, email, name: rec.name || email.split('@')[0], role: rec.role }, true);
  return true;
}
/** بعد الدخول بلا إنترنت: عند عودة الاتصال يُعاد الدخول في الخلفية وتُراجع الصلاحية ثم تُرفع السندات */
function watchResume() {
  let busy = false;
  const tryIt = async () => {
    if (busy || !navigator.onLine || !ctx) return;
    busy = true;
    try {
      if (offAuth) await timeout(be.signIn(offAuth.email, offAuth.pw), 20000);
      const st = await timeout(be.getStaff(ctx.user.email), 15000);
      const role = roleOf(st);
      if (role !== 'admin' && role !== 'cashier') { toast('أُلغيت صلاحيتك في الحسابات.', { bad: true }); setTimeout(() => ctx.logout(), 2000); return; }
      await offRemember(ctx.user.uid, ctx.user.email, (st.name || '').trim() || ctx.user.name, role, offAuth && offAuth.pw);
      offAuth = null; clearInterval(resumeTimer); resumeTimer = null; removeEventListener('online', tryIt);
      if (role !== ctx.user.role) { location.reload(); return; }
      store.listen(); store.flush();
      toast('عاد الاتصال، وتُرفع السندات الآن.');
    } catch (e) {
      if (/invalid-credential|wrong-password|user-not-found|user-disabled/.test(String(e && e.code || ''))) {
        offAuth = null; clearInterval(resumeTimer); resumeTimer = null; removeEventListener('online', tryIt);
        toast('تغيّرت كلمة المرور أو أُوقف الحساب. سجّل الدخول من جديد، والسندات محفوظة على الجهاز.', { bad: true });
        setTimeout(() => ctx.logout(), 3000);
      }
    } finally { busy = false; }
  };
  addEventListener('online', tryIt);
  resumeTimer = setInterval(tryIt, 60000);
  setTimeout(tryIt, 3000);
}

function loginView(msg) {
  const user = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'off', spellcheck: false, class: 'num', style: { textAlign: 'right' } });
  const pass = h('input', { type: 'password', autocomplete: 'current-password' });
  const err = h('div', { class: 'err', role: 'alert' }, msg || '');
  const btn = h('button', { class: 'btn wide', type: 'submit' }, 'دخول');
  const form = h('form', { on: { submit: async e => {
    e.preventDefault();
    if (!user.value.trim() || !pass.value) { err.textContent = 'اكتب اسم المستخدم وكلمة المرور.'; return; }
    btn.disabled = true; err.textContent = '';
    const email = toEmail(user.value), pw = pass.value;
    try { pendingPw = pw; await timeout(be.signIn(email, pw), 20000); pass.value = ''; }
    catch (x) {
      if (netErr(x)) {
        // بلا إنترنت: الدخول بما حُفظ على هذا الجهاز من آخر دخول بالإنترنت
        pendingPw = null;
        err.textContent = 'لا يوجد إنترنت، جارٍ الدخول من هذا الجهاز…';
        const r = await offlineLogin(email, pw).catch(e => 'تعذّر الفتح: ' + (e.message || e));
        if (r === true) return;
        err.textContent = r;
      } else { pendingPw = null; err.textContent = ERR[x.code] || ('تعذّر الدخول (' + (x.code || x.message) + ')'); }
    }
    btn.disabled = false;
  } } },
    h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'اسم المستخدم'), user),
    h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'كلمة المرور'), pass),
    err, btn);
  app.className = ''; app.textContent = '';
  app.appendChild(brandScreen(h('div', { class: 'page' },
    h('div', { class: 'ph', style: { borderBottom: '0' } }, h('h1', null, 'حسابات الصيدلية'), h('div', { class: 'meta' }, 'الفواتير والحسابات والمخزون')),
    form, ver())));
  setTimeout(() => user.focus(), 50);
}
function waitView(msg) {
  app.className = ''; app.textContent = '';
  app.appendChild(brandScreen(h('div', { class: 'page' }, h('div', { class: 'ph', style: { borderBottom: '0' } }, h('h1', null, 'حسابات الصيدلية'), h('div', { class: 'meta' }, msg)))));
}
/** شاشة الدخول والتحميل: صورة النظام بجانب بطاقة الدخول (فوقها على الجوال) */
function brandScreen(card) {
  return h('div', { class: 'login brand' },
    h('div', { class: 'loginpane' }, card),
    h('div', { class: 'brandpane' }, h('img', { src: 'brand.jpg', alt: 'نظام إدارة الصيدليات، تطوير وبرمجة MOSMAD', decoding: 'async' })));
}
function ver() { const A = window.JardApp; return A && A.version ? h('p', { class: 'muted', style: { fontSize: '12.5px', marginTop: '14px' } }, 'نسخة التطبيق ' + A.version()) : null; }

async function enter(user) {
  waitView('جارٍ التحقق من الصلاحية…');
  const email = (user.email || '').toLowerCase(), pw = pendingPw;
  pendingPw = null;
  let staff = null;
  try { staff = await timeout(be.getStaff(email), 15000); }
  catch (e) {
    // الدخول محفوظ على الجهاز لكن لا إنترنت: الصلاحية من آخر تحقق بالإنترنت
    const rec = offGet(email);
    if (netErr(e) && rec && rec.uid === user.uid && (rec.role === 'admin' || rec.role === 'cashier')) {
      await start({ uid: user.uid, email, name: rec.name || email.split('@')[0], role: rec.role }, true);
      return;
    }
    entered = false;
    loginView('تعذّر التحقق من الحساب (' + (e.code || e.message) + '). تأكد من الإنترنت.'); return;
  }
  const role = roleOf(staff);
  if (role !== 'admin' && role !== 'cashier') {
    try { await be.signOut(); } catch (e) {}
    loginView('حسابك غير مفعّل في الحسابات. اطلب من المشرف تفعيله.');
    return;
  }
  const u = { uid: user.uid, email: user.email, name: (staff.name || '').trim() || user.email.split('@')[0], role };
  offRemember(user.uid, email, u.name, role, pw);
  await start(u, false);
}

/** فتح البيانات والواجهة لمستخدم تحققت صلاحيته (بالإنترنت، أو من آخر تحقق محفوظ على الجهاز) */
async function start(u, offline) {
  const role = u.role;
  waitView('جارٍ فتح البيانات…');
  store = await new Store(be, u).open();
  ctx = {
    store, user: u, be,
    can: a => can(role, a),
    go: (p, replace) => { if (replace) location.replace('#/' + p); else location.hash = '#/' + p; },
    back: () => history.length > 1 ? history.back() : (location.hash = '#/'),
    redraw: () => draw(),
    logout: async () => { try { await be.signOut(); } catch (e) {} location.hash = ''; location.reload(); }
  };
  unsubStore = store.on(() => { syncChip(); if (cur && cur.v && cur.v.live) draw(true); });
  startReceiver(ctx);   // الكمبيوتر: يستقبل ما يُمسح بالجوال بنفس الحساب
  addEventListener('hashchange', route);
  route();
  if (offline) {
    toast('تعمل بدون إنترنت. السندات تُحفظ على الجهاز وتُرفع عند عودة الاتصال.');
    watchResume();
  }
}

/* ---------- التنقل ---------- */
const ROUTES = [
  [/^$/, () => home(ctx), { root: 'home' }],
  [/^sale$/, () => docView(ctx, 'sale'), { form: true, grid: true }],
  [/^doc\/(sret|pur|pret)$/, m => docView(ctx, m[1]), { form: true, grid: true }],
  [/^v\/(adj|xfer)(?:\/(.+))?$/, m => vchView(ctx, m[1], m[2]), { form: true, grid: true }],
  [/^v\/(rcpt|pay|exp|cxf|jv)(?:\/(.+))?$/, m => vchView(ctx, m[1], m[2]), { form: true }],
  [/^parties(?:\/([csoe]))?$/, m => partiesView(ctx, m[1] || 'c'), { root: 'parties' }],
  [/^party\/([^/]+)$/, m => partyView(ctx, decodeURIComponent(m[1]))],
  [/^party-edit(?:\/([^/]*))?(?:\/([csoe]))?$/, m => partyEdit(ctx, decodeURIComponent(m[1] || ''), m[2]), { form: true }],
  [/^items$/, () => itemsView(ctx), { root: 'items' }],
  [/^item\/([^/]+)$/, m => itemView(ctx, decodeURIComponent(m[1]))],
  [/^item-edit(?:\/([^/]*))?$/, m => itemEdit(ctx, decodeURIComponent(m[1] || '')), { form: true }],
  [/^more$/, () => moreView(ctx), { root: 'more' }],
  [/^reports$/, () => reportsView(ctx)],
  [/^r\/(\w+)$/, m => reportView(ctx, m[1])],
  [/^vouchers$/, () => vouchersView(ctx)],
  [/^vch\/([^/]+)$/, m => voucherView(ctx, decodeURIComponent(m[1]))],
  [/^settings$/, () => settingsView(ctx), { narrow: true }],
  [/^close$/, () => closeView(ctx), { narrow: true }],
  [/^import$/, () => importView(ctx), { narrow: true }],
  [/^scanpc$/, () => scanpcView(ctx), { narrow: true }]
];
function route() {
  const path = location.hash.replace(/^#\/?/, '');
  const r = ROUTES.find(x => x[0].test(path)) || ROUTES[0];
  const m = path.match(r[0]) || [];
  cur = { path, make: () => r[1](m), opt: r[2] || {} };
  draw();
  window.scrollTo(0, 0);
}
function draw(keepScroll) {
  if (!cur) return;
  const y = keepScroll ? window.scrollY : 0;
  let v;
  try { v = cur.make(); }
  catch (e) { console.error(e); v = { title: 'خطأ', el: h('div', { class: 'note bad' }, 'تعذّر عرض الصفحة: ' + (e.message || e)) }; }
  cur.v = v;
  app.className = [cur.opt.form ? 'form' : '', cur.opt.grid ? 'grid' : '', cur.opt.narrow ? 'narrow' : ''].filter(Boolean).join(' ');
  app.textContent = '';
  app.appendChild(bar(v));
  app.appendChild(h('main', null, v.el));
  if (!cur.opt.form || WIDE.matches) app.appendChild(nav(cur.opt.root));
  if (v.foot) app.appendChild(v.foot);
  if (keepScroll) window.scrollTo(0, y);
  syncChip();
  if (v.onShow) v.onShow();
}
function bar(v) {
  const root = !!cur.opt.root;
  return h('header', { class: 'bar' },
    root ? null : h('button', { class: 'iconbtn', 'aria-label': 'رجوع', on: { click: () => ctx.back() } }, icon('back')),
    h('h1', { class: /[\u0600-\u06FF]/.test(v.title || '') ? '' : 'lat' }, v.title || '', v.sub ? h('span', { class: 'sub' }, v.sub) : null),
    ...(v.actions || []),
    h('span', { id: 'sync', class: 'sync' + (root ? '' : ' dot') }, h('i'), h('span', null, '')));
}
function syncChip() {
  const el = $('#sync'); if (!el || !store) return;
  const s = store.status;
  let cls = '', txt = 'متزامن';
  if (s.pending) { cls = 'wait'; txt = 'بانتظار الرفع ' + s.pending; }
  if (!s.online) { cls = 'off'; txt = s.pending ? 'بلا إنترنت، ' + s.pending : 'بلا إنترنت'; }
  else if (s.error && s.error !== 'unavailable') { cls = 'err'; txt = s.error === 'permission-denied' ? 'لا صلاحية' : 'خطأ مزامنة'; }
  else if (!s.ready && !s.pending) { cls = 'wait'; txt = 'جارٍ التحديث'; }
  el.className = 'sync ' + cls + (el.classList.contains('dot') ? ' dot' : ''); el.lastChild.textContent = txt; el.title = txt;
}
function nav(on) {
  if (WIDE.matches) return sideNav();
  const b = (id, label, ic, path, cls) => h('button', { class: (on === id ? 'on ' : '') + (cls || ''), on: { click: () => ctx.go(path) } }, icon(ic, 23), h('span', null, label));
  return h('nav', { class: 'nav' }, h('div', null,
    b('home', 'اليوم', 'today', ''),
    b('parties', 'الحسابات', 'people', 'parties'),
    ctx.can('sale') ? b('sale', 'بيع', 'sale', 'sale', 'sell') : null,
    b('items', 'الأصناف', 'pill', 'items'),
    b('more', 'المزيد', 'more', 'more')));
}
/* الكمبيوتر: قائمة جانبية كاملة بدل الشريط السفلي، فيظهر النظام كله بنقرة واحدة */
function navKey(p) {
  let m;
  if (!p) return 'home';
  if (p === 'sale') return 'sale';
  if ((m = p.match(/^doc\/(\w+)/))) return m[1];
  if ((m = p.match(/^v\/(\w+)/))) return ['rcpt', 'pay', 'exp'].includes(m[1]) ? m[1] : 'more';
  if (/^part/.test(p)) return 'parties';
  if (/^item/.test(p)) return 'items';
  if (/^(vouchers|vch\/)/.test(p)) return 'vouchers';
  if (/^(reports|r\/)/.test(p)) return 'reports';
  return 'more';
}
function sideNav() {
  const on = navKey(cur.path), S = store.settings || {};
  const a = (k, label, ic, path, ok, kbd) => ok === false ? null : h('a', { class: 'si' + (on === k ? ' on' : ''), href: '#/' + path, 'aria-current': on === k ? 'page' : null }, icon(ic, 19), h('span', null, label), kbd ? h('kbd', null, kbd) : null);
  const g = (label, ...items) => { items = items.filter(Boolean); return items.length ? h('div', { class: 'sg' }, h('div', { class: 'sgl' }, label), ...items) : null; };
  return h('nav', { class: 'nav side', 'aria-label': 'القائمة' },
    h('div', { class: 'sh' }, h('b', null, S.name || 'حسابات الصيدلية'), h('small', null, ctx.user.name + '، ' + (ctx.user.role === 'admin' ? 'مشرف' : 'كاشير'))),
    ctx.can('sale') ? h('a', { class: 'si sell' + (on === 'sale' ? ' on' : ''), href: '#/sale' }, icon('sale', 20), h('span', null, 'فاتورة بيع'), h('kbd', null, 'F2')) : null,
    a('home', 'اليوم', 'today', ''),
    g('المستندات',
      a('sret', 'مرتجع مبيعات', 'undo', 'doc/sret', ctx.can('sret')),
      a('pur', 'فاتورة شراء', 'in', 'doc/pur', ctx.can('pur')),
      a('pret', 'مرتجع مشتريات', 'out', 'doc/pret', ctx.can('pret'))),
    g('النقدية',
      a('rcpt', 'سند قبض', 'wallet', 'v/rcpt', ctx.can('rcpt')),
      a('pay', 'سند صرف', 'out', 'v/pay', ctx.can('pay')),
      a('exp', 'مصروف', 'bolt', 'v/exp', ctx.can('exp'))),
    g('الدفاتر',
      a('parties', ctx.can('sup') ? 'العملاء والموردون' : 'العملاء', 'people', 'parties'),
      a('items', 'الأصناف والمخزون', 'pill', 'items'),
      a('vouchers', 'كل السندات', 'doc', 'vouchers'),
      a('reports', 'التقارير', 'report', 'reports')),
    h('div', { class: 'sfoot' }, a('more', 'أدوات وإعدادات', 'gear', 'more')));
}
setInterval(() => syncChip(), 2000);

/* ---------- الكمبيوتر: شاشة عريضة واختصارات لوحة المفاتيح وقارئ الباركود ---------- */
const WIDE = matchMedia('(min-width: 1000px)');
WIDE.addEventListener('change', () => { if (cur) draw(true); });
document.addEventListener('keydown', e => {
  if (!ctx || !cur) return;
  const k = e.key, open = document.querySelector('.sheetwrap, .cam');
  if (k === 'Escape') {
    if (open) { e.preventDefault(); history.back(); return; }
    const si = cur.v && cur.v.scanInput;
    if (si && si.value) { e.preventDefault(); si.value = ''; si.dispatchEvent(new Event('input')); si.focus(); }
    return;
  }
  if (open) return;
  if (k === 'F2') { e.preventDefault(); if (cur.path === 'sale' && cur.v.scanInput) cur.v.scanInput.focus(); else if (ctx.can('sale')) ctx.go('sale'); return; }
  if (k === 'F3') { e.preventDefault(); const i = (cur.v && cur.v.scanInput) || document.querySelector('main input[type=search]'); if (i) i.focus(); return; }
  if (k === 'F9') { e.preventDefault(); const b = document.querySelector('.foot .actions .btn:not(.ghost)'); if (b && !b.disabled) b.click(); return; }
  if (cur.v && cur.v.keys && cur.v.keys[k]) { e.preventDefault(); cur.v.keys[k](); return; }
  // قارئ الباركود يكتب كلوحة مفاتيح: إن لم يكن المؤشر في حقل، وجّه الكتابة إلى خانة البحث
  const a = document.activeElement, typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  if (!typing && cur.v && cur.v.scanInput && k.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const si = cur.v.scanInput; si.focus(); si.value += k; si.dispatchEvent(new Event('input'));
  }
});

/* ---------- البدء ---------- */
async function boot() {
  try {
    be = params.get('mock') ? await import('./mock.js') : await import('./fb.js');
    await be.init(cfg.firebase);
  } catch (e) { console.error(e); waitView('تعذّر التشغيل: ' + (e.message || e)); return; }
  be.onAuth(user => {
    if (user && !entered) { entered = true; enter(user).catch(e => { console.error(e); loginView('تعذّر الفتح: ' + (e.message || e)); }); }
    else if (!user) { entered = false; if (unsubStore) unsubStore(); store = null; loginView(); }
  });
}
boot();
window.__booted = true;
