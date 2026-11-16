/* تصوير الطلبيات: الدخول، قائمة الطلبيات، شاشة الطلبية، الإعدادات، والتصدير. */
import { $, h, icon, toast, sheet, picker, confirmBox, field } from './ui.js';
import * as FB from './fb.js';
import * as DB from './db.js';
import * as CAM from './cam.js';
import * as AI from './ai.js';
import { C, load as loadItems, setData } from './items.js';
import { openCamera, itemPicker, newLine, num, money, CONF_AR, METHOD_AR, whyChips } from './flow.js';
import { expState, normExp, analyze } from './ocr.js';
import { saveBlob } from './out.js';
import { buildXlsx } from './xlsx.js';

const cfg = window.JARD_CONFIG || {};
const APPV = (() => { try { return window.JardApp && window.JardApp.version ? String(window.JardApp.version()) : ''; } catch (e) { return ''; } })();
const S = { user: null, staff: null, orders: [], settings: { key: '', model: AI.DEFAULT_MODEL, askExp: true, autoExp: true }, online: navigator.onLine };
const root = () => $('#app');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtDate = s => { if (!s) return ''; const [y, m, d] = String(s).split('-'); return d + '/' + m + '/' + y; };
const ago = t => { if (!t) return ''; const d = new Date(t); return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };

/* ---------- الدخول ---------- */
const ERR = {
  'auth/invalid-credential': 'اسم المستخدم أو كلمة المرور غير صحيحة.', 'auth/wrong-password': 'اسم المستخدم أو كلمة المرور غير صحيحة.',
  'auth/user-not-found': 'اسم المستخدم أو كلمة المرور غير صحيحة.', 'auth/invalid-email': 'اسم المستخدم غير صحيح.',
  'auth/user-disabled': 'هذا الحساب معطّل. راجع المشرف.', 'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.',
  'auth/network-request-failed': 'لا اتصال بالإنترنت. الدخول أول مرة يحتاج إنترنت، وبعدها يعمل التطبيق بدونه.'
};
const toEmail = u => { u = u.trim().toLowerCase(); return u.includes('@') ? u : u + '@' + (cfg.emailDomain || 'jard.local'); };

function loginView(msg) {
  const u = h('input', { autocomplete: 'username', placeholder: 'اسم المستخدم', dir: 'ltr', autocapitalize: 'none' });
  const p = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'كلمة المرور', dir: 'ltr' });
  const err = h('p', { class: 'lerr', role: 'alert' }, msg || '');
  const go = h('button', { class: 'btn big', type: 'submit' }, 'دخول');
  const form = h('form', { class: 'lform', on: { submit: async e => {
    e.preventDefault();
    if (!u.value.trim() || !p.value) { err.textContent = 'اكتب اسم المستخدم وكلمة المرور.'; return; }
    go.disabled = true; go.textContent = 'جارٍ الدخول…'; err.textContent = '';
    try { await FB.signIn(toEmail(u.value), p.value); }
    catch (x) { err.textContent = ERR[x.code] || ('تعذّر الدخول: ' + (x.code || x.message)); go.disabled = false; go.textContent = 'دخول'; }
  } } }, u, p, go, err);
  root().textContent = '';
  root().appendChild(h('div', { class: 'login' },
    h('div', { class: 'lhero' }, h('img', { src: 'brand.jpg', alt: '' })),
    h('div', { class: 'lcard' },
      h('h1', null, 'تصوير الطلبيات'),
      h('p', { class: 'lsub' }, 'صوّر العلبة، يتعرّف على الصنف وتاريخه، وتخرج الطلبية ملف Excel جاهزاً للاستيراد.'),
      form,
      h('p', { class: 'lfoot' }, 'نفس حساب تطبيق الجرد وحسابات الصيدلية.'))));
  setTimeout(() => u.focus(), 300);
}
function waitView(text) {
  root().textContent = '';
  root().appendChild(h('div', { class: 'boot' }, h('img', { src: 'icon.png', alt: '' }), h('span', { class: 'spin' }), h('p', null, text || '')));
}

/* ---------- البيانات ---------- */
async function syncCatalog(force) {
  if (!navigator.onLine && !force) return false;
  const mark = $('#catstate'); if (mark) mark.textContent = 'جارٍ تحديث قاعدة الأصناف…';
  try {
    const [cat, acc] = await Promise.all([FB.loadCatalog(), FB.loadAcc().catch(() => null)]);
    if (!cat && !(acc && acc.items.length)) throw new Error('empty');
    const now = Date.now();
    if (cat) { cat.at = cat.at || now; await DB.set('catalog', cat); }
    if (acc) { acc.at = now; await DB.set('acc', acc); }
    setData(cat || await DB.get('catalog'), acc || await DB.get('acc'));
    await DB.set('syncAt', now);
    S.syncAt = now;
    if (mark) mark.textContent = catText();
    return true;
  } catch (e) {
    console.warn('sync', e);
    if (mark) mark.textContent = C.ix ? catText() + ' (تعذّر التحديث)' : 'تعذّر تحميل قاعدة الأصناف: اتصل بالإنترنت ثم اضغط تحديث';
    return false;
  }
}
const catText = () => C.ix ? 'قاعدة الأصناف: ' + C.n.toLocaleString('en-US') + ' صنف، حُدّثت ' + ago(S.syncAt || C.at) : 'قاعدة الأصناف غير محمّلة';

async function saveSettings() { await DB.set('settings', S.settings); }

/* ---------- التنقل ---------- */
function route() {
  const hsh = location.hash || '#/';
  let m;
  if ((m = hsh.match(/^#\/o\/(.+)$/))) return orderView(decodeURIComponent(m[1]));
  if (hsh === '#/settings') return settingsView();
  return listView();
}
addEventListener('hashchange', () => { if (S.user) route(); });

function topbar(title, opt = {}) {
  return h('header', { class: 'top' },
    opt.back ? h('button', { class: 'iconbtn', 'aria-label': 'رجوع', on: { click: () => { if (history.length > 1) history.back(); else location.hash = '#/'; } } }, icon('back')) : h('img', { class: 'logo', src: 'icon.png', alt: '' }),
    h('div', { class: 'ttl' }, h('h1', null, title), opt.sub ? h('small', { id: opt.subId || null }, opt.sub) : null),
    opt.right || null);
}

/* ---------- قائمة الطلبيات ---------- */
const orderTotal = o => (o.lines || []).reduce((s, l) => s + num(l.qty) * num(l.price), 0);
const issuesOf = l => {
  const r = [];
  if (!l.item) r.push(['bad', 'غير معروف']);
  else if ((l.conf === 'low' || l.conf === 'mid') && !l.ok) r.push(['warn', 'راجِع الصنف']);
  if (l.why && l.why.pack === false && !l.ok) r.push(['warn', 'العبوة مختلفة']);
  if (!l.exp) r.push(['warn', 'بلا صلاحية']);
  else { const st = expState(l.exp); if (st === 'exp') r.push(['bad', 'منتهي']); else if (st === 'soon') r.push(['warn', 'قريب الانتهاء']); }
  if (!(num(l.qty) > 0) && !(num(l.bonus) > 0)) r.push(['bad', 'بلا كمية']);
  if (!(num(l.price) > 0)) r.push(['warn', 'بلا سعر']);
  return r;
};
const needsReview = l => issuesOf(l).some(x => x[1] !== 'قريب الانتهاء');

async function listView() {
  S.orders = (await DB.orders()).sort((a, b) => (b.created || 0) - (a.created || 0));
  const list = h('div', { class: 'olist' });
  if (!S.orders.length) list.appendChild(h('div', { class: 'empty' },
    h('img', { src: 'icon.png', alt: '' }),
    h('p', null, 'لا توجد طلبيات بعد.'),
    h('p', { class: 'muted' }, 'اضغط «طلبية جديدة» ثم صوّر الأصناف واحداً بعد الآخر.')));
  for (const o of S.orders) {
    const n = (o.lines || []).length, rv = (o.lines || []).filter(needsReview).length;
    list.appendChild(h('a', { class: 'orow', href: '#/o/' + encodeURIComponent(o.id) },
      h('div', { class: 'omain' },
        h('b', { class: o.supplier ? '' : 'nosup' }, o.supplier ? o.supplier.n : 'بلا مورد'),
        h('small', null, 'طلبية ' + o.no + '، ' + fmtDate(o.date) + (o.inv ? '، فاتورة ' + o.inv : ''))),
      h('div', { class: 'oside' },
        h('b', { class: 'num' }, money(orderTotal(o))),
        h('small', null, n + (n === 1 ? ' صنف' : ' أصناف'), rv ? h('span', { class: 'dot warn' }, rv + ' للمراجعة') : null, o.exported ? h('span', { class: 'dot ok' }, 'صُدّرت') : null))));
  }
  root().textContent = '';
  root().appendChild(h('div', { class: 'page' },
    topbar('الطلبيات', { sub: catText(), subId: 'catstate', right: h('button', { class: 'iconbtn', 'aria-label': 'الإعدادات', on: { click: () => { location.hash = '#/settings'; } } }, icon('gear')) }),
    !C.ix ? h('div', { class: 'banner bad' }, 'قاعدة الأصناف غير محمّلة. اتصل بالإنترنت، ثم افتح الإعدادات واضغط «تحديث قاعدة الأصناف».') : null,
    !CAM.hasOcr() ? h('div', { class: 'banner' }, 'قراءة النص بدون إنترنت تعمل في تطبيق الجوال. هنا يعمل الباركود والبحث والتعرّف عبر الإنترنت.') : null,
    list,
    h('div', { class: 'dock' }, h('button', { class: 'btn big', on: { click: newOrder } }, icon('plus', 20), 'طلبية جديدة'))));
}
async function newOrder() {
  const all = await DB.orders();
  const no = all.reduce((m, o) => Math.max(m, o.no || 0), 0) + 1;
  const o = { id: 'o' + Date.now().toString(36), no, date: today(), supplier: null, inv: '', note: '', lines: [], created: Date.now(), by: S.staff ? S.staff.name || '' : '' };
  await DB.saveOrder(o);
  location.hash = '#/o/' + encodeURIComponent(o.id);
  setTimeout(() => cameraFor(o), 350);
}

/* ---------- الموردون ---------- */
async function chooseSupplier(o, required, hintCos) {
  // اقتراحات: موردو نظام الحسابات، ثم شركات الأصناف في هذه الطلبية، ثم من استعملتهم سابقاً، ثم كل الشركات
  const recent = (await DB.get('recentSup')) || [];
  const fromLines = new Map();
  for (const l of o.lines || []) if (l.item && l.item.c) fromLines.set(l.item.c, (fromLines.get(l.item.c) || 0) + 1);
  const seen = new Set(), rows = [];
  const add = (n, sub, val) => { const k = String(n || '').trim(); if (!k || seen.has(k)) return; seen.add(k); rows.push({ value: val || { n: k }, label: k, sub }); };
  for (const c of hintCos || []) if (c) fromLines.set(c, (fromLines.get(c) || 0) + 5);
  // موردو النظام الذين يشبه اسمهم شركة الأصناف (شركة الفتح --فاركو ≈ شركة الفتح قسم فاركو) أولاً
  const words = s => String(s || '').replace(/[-–/\\.,()]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !/^(شركة|مؤسسة|قسم|للادوية|للأدوية|الادوية|الأدوية|لتجارة|التجارية|العامة)$/.test(w));
  const cos = [...fromLines.keys()].map(words);
  if (cos.length) for (const p of C.suppliers.map(p => [p, words(p.n)]).map(([p, w]) => [p, Math.max(...cos.map(c => c.filter(x => w.includes(x)).length))]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)) add(p[0].n, 'مقترح من شركة الصنف', { id: p[0].id, n: p[0].n });
  for (const r of recent) add(r.n, 'استعملته سابقاً', r);
  for (const [c] of [...fromLines.entries()].sort((a, b) => b[1] - a[1])) add(c, 'شركة أصناف هذه الطلبية');
  for (const p of C.suppliers) add(p.n, 'مورد في نظام الحسابات', { id: p.id, n: p.n });
  for (const c of C.companies) add(c, 'شركة في قاعدة الأصناف');
  const pick = await picker(required ? 'اختر المورد قبل الحفظ' : 'المورد', rows, {
    placeholder: 'اسم المورد', add: 'مورد جديد', addLast: true,
    filter: q => { q = q.trim(); if (!q) return rows.slice(0, 60); const t = q.split(/\s+/); return rows.filter(r => t.every(x => r.label.includes(x))).slice(0, 60); }
  });
  if (!pick) return false;
  const sup = pick.add ? { n: pick.add } : pick;
  o.supplier = sup.id ? { id: sup.id, n: sup.n } : { n: sup.n };
  await DB.set('recentSup', [o.supplier].concat(recent.filter(r => r.n !== o.supplier.n)).slice(0, 12));
  await DB.saveOrder(o);
  return true;
}

/* ---------- شاشة الطلبية ---------- */
let curTab = 'all';
async function orderView(id) {
  const o = await DB.order(id);
  if (!o) { location.hash = '#/'; return; }
  const lines = o.lines || [];
  const review = lines.filter(needsReview);
  const total = orderTotal(o), qtySum = lines.reduce((s, l) => s + num(l.qty), 0), bonusSum = lines.reduce((s, l) => s + num(l.bonus), 0);
  const supBtn = h('button', { class: 'sup' + (o.supplier ? '' : ' need'), type: 'button', on: { click: async () => { if (await chooseSupplier(o)) route(); } } },
    h('small', null, 'المورد'), h('b', null, o.supplier ? o.supplier.n : 'اختر المورد'), o.supplier ? null : h('em', null, 'مطلوب قبل الحفظ والتصدير'));
  const date = h('input', { type: 'date', value: o.date || today(), on: { change: async () => { o.date = date.value; await DB.saveOrder(o); } } });
  const inv = h('input', { type: 'text', inputmode: 'numeric', value: o.inv || '', placeholder: 'اختياري', dir: 'ltr', on: { change: async () => { o.inv = inv.value.trim(); await DB.saveOrder(o); } } });
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    h('button', { class: curTab === 'all' ? 'on' : '', role: 'tab', on: { click: () => { curTab = 'all'; route(); } } }, 'الأصناف', h('span', { class: 'cnt' }, lines.length)),
    h('button', { class: (curTab === 'rev' ? 'on' : '') + (review.length ? ' hasrev' : ''), role: 'tab', on: { click: () => { curTab = 'rev'; route(); } } }, 'تحتاج مراجعة', h('span', { class: 'cnt' }, review.length)));
  const shown = curTab === 'rev' ? review : lines;
  const list = h('div', { class: 'lines' });
  if (!shown.length) list.appendChild(h('div', { class: 'empty small' }, curTab === 'rev' ? h('p', null, 'لا شيء يحتاج مراجعة.') : [h('p', null, 'صوّر أول صنف من زر الكاميرا بالأسفل.'), h('p', { class: 'muted' }, 'الواجهة أولاً، ثم تاريخ الانتهاء، ثم الكمية والسعر.')]));
  for (const l of shown.slice().reverse()) list.appendChild(lineRow(o, l, curTab === 'rev'));
  const menu = h('button', { class: 'iconbtn', 'aria-label': 'خيارات الطلبية', on: { click: () => orderMenu(o) } }, icon('more'));
  root().textContent = '';
  root().appendChild(h('div', { class: 'page order' },
    topbar('طلبية ' + o.no, { back: true, sub: fmtDate(o.date) + (o.by ? '، ' + o.by : ''), right: menu }),
    h('section', { class: 'ohead' }, supBtn,
      h('div', { class: 'orow2' }, field('تاريخ الفاتورة', date), field('رقم فاتورة المورد', inv))),
    tabs, list,
    h('div', { class: 'dock odock' },
      h('div', { class: 'tot' }, h('small', null, lines.length + ' صنف، ' + qtySum + ' قطعة' + (bonusSum ? ' + ' + bonusSum + ' بونص' : '')), h('b', { class: 'num' }, money(total))),
      h('button', { class: 'fab', 'aria-label': 'صوّر صنفاً', on: { click: () => cameraFor(o) } }, icon('camera', 30)),
      h('button', { class: 'btn ghost exp', on: { click: () => finish(o) } }, icon('xls', 20), 'حفظ وتصدير'))));
}

function lineRow(o, l, rev) {
  const iss = issuesOf(l);
  const amt = num(l.qty) * num(l.price);
  const th = l.thumb ? h('img', { class: 'th', src: l.thumb, alt: '' }) : h('div', { class: 'th none' }, icon('box', 22));
  const row = h('div', { class: 'line' + (l.item ? '' : ' unk') },
    h('button', { class: 'lmain', type: 'button', on: { click: () => editLine(o, l) } }, th,
      h('div', { class: 'ltxt' },
        h('b', { dir: 'ltr', class: 'lat' }, l.item ? l.item.n : (l.read && l.read.name) || 'صنف غير معروف'),
        h('small', null,
          h('span', { class: 'conf ' + (l.conf || 'none') }, CONF_AR[l.conf || 'none']),
          l.exp ? h('span', { class: 'xd ' + (expState(l.exp) ? 'x-' + expState(l.exp) : ''), dir: 'ltr' }, l.exp) : null,
          l.read && l.read.strength ? h('span', { dir: 'ltr' }, l.read.strength) : null),
        iss.length ? h('div', { class: 'iss' }, iss.map(([k, t]) => h('span', { class: 'tag ' + k }, t))) : null),
      h('div', { class: 'lnum' },
        h('b', { class: 'num' }, num(l.qty) + (num(l.bonus) ? '+' + num(l.bonus) : '')),
        h('small', { class: 'num' }, num(l.price) ? '× ' + money(l.price) : 'بلا سعر'),
        amt ? h('small', { class: 'num amt' }, money(amt)) : null)));
  if (rev) row.appendChild(h('div', { class: 'revacts' },
    h('button', { class: 'btn ghost ai', type: 'button', on: { click: () => reidentify(o, l) } }, icon('spark', 18), 'أعد التعرّف بصورة ثانية'),
    h('button', { class: 'btn ghost', type: 'button', on: { click: () => changeItem(o, l) } }, icon('search', 18), 'اختر الصنف'),
    !l.exp ? h('button', { class: 'btn ghost', type: 'button', on: { click: () => cameraFor(o, { expOnly: l }) } }, icon('clock', 18), 'صوّر الصلاحية') : null,
    l.item && !l.ok && issuesOf(l).some(x => x[1] === 'راجِع الصنف' || x[1] === 'العبوة مختلفة') ? h('button', { class: 'btn ghost', type: 'button', on: { click: async () => { l.ok = true; await hooksFor(o).save(l); route(); } } }, icon('check', 18), 'الصنف صحيح') : null));
  return row;
}

function hooksFor(o) {
  return {
    settings: S.settings,
    lines: () => o.lines,
    needSupplier: async line => { if (o.supplier) return true; const ok = await chooseSupplier(o, true, [line && line.item && line.item.c]); if (!ok) toast('اختر المورد قبل التصدير', { bad: true }); return ok; },
    save: async (line, opt = {}) => {
      const fresh = await DB.order(o.id);
      if (fresh) { o.lines = fresh.lines; o.supplier = o.supplier || fresh.supplier; o.inv = o.inv || fresh.inv; o.date = o.date || fresh.date; }
      const k = o.lines.findIndex(x => x.id === line.id);
      if (k >= 0) o.lines[k] = line;
      else {
        // نفس الصنف ونفس التاريخ ونفس السعر: تُجمع الكمية في سطر واحد
        const same = line.item && o.lines.find(x => x.item && x.item.i === line.item.i && (x.exp || '') === (line.exp || '') && num(x.price) === num(line.price));
        if (same) { same.qty = num(same.qty) + num(line.qty); same.bonus = num(same.bonus) + num(line.bonus); if (!same.photo && line.photo) { same.photo = line.photo; same.thumb = line.thumb; } toast('أُضيفت الكمية إلى السطر الموجود'); }
        else o.lines.push(line);
      }
      o.exported = false;
      await DB.saveOrder(o);
    },
    onClose: () => route()
  };
}
function cameraFor(o, opt) { openCamera(o, hooksFor(o), opt || {}); }
function reidentify(o, l) {
  if (!S.settings.key) toast('بدون مفتاح الإنترنت ستُدمج الصورتان وتُقرآن على الجوال فقط. أضف المفتاح من الإعدادات لدقة أعلى.', { ms: 5000 });
  openCamera(o, hooksFor(o), { reid: l });
}
async function changeItem(o, l) {
  const q = l.item ? l.item.n.split(/\s+/)[0] : l.read && l.read.name || '';
  const it = await itemPicker(q);
  if (!it) return;
  l.item = { i: it.i, n: it.n, u: it.u, c: it.c }; l.conf = 'manual'; l.why = null;
  if (l.ocr) { const { learn } = await import('./items.js'); learn(analyze({ lines: l.ocr }), it.i, l.bc).catch(() => {}); }
  await hooksFor(o).save(l);
  route();
}

/* ---------- تعديل سطر ---------- */
async function editLine(o, l) {
  const q = h('input', { class: 'num', inputmode: 'decimal', value: l.qty || '' });
  const b = h('input', { class: 'num', inputmode: 'decimal', value: l.bonus || '' });
  const p = h('input', { class: 'num', inputmode: 'decimal', value: l.price || '' });
  const ex = h('input', { class: 'num', dir: 'ltr', inputmode: 'numeric', value: l.exp || '', placeholder: 'MM/YYYY', maxlength: 7 });
  const bt = h('input', { class: 'num', dir: 'ltr', value: l.batch || '', placeholder: 'اختياري' });
  const photos = h('div', { class: 'photos' });
  for (const [k, lab] of [['photo', 'الواجهة'], ['photo3', 'الصورة الثانية'], ['photo2', 'الصلاحية']]) if (l[k]) {
    const blob = await DB.photo(l[k]);
    if (blob) { const url = URL.createObjectURL(blob); photos.appendChild(h('figure', { on: { click: () => viewPhoto(url) } }, h('img', { src: url, alt: lab }), h('figcaption', null, lab))); }
  }
  const iss = issuesOf(l);
  const s = sheet(l.item ? 'تعديل الصنف' : 'صنف غير معروف', h('div', { class: 'edit' },
    h('div', { class: 'pickname', dir: 'ltr' }, l.item ? l.item.n : (l.read && l.read.name) || 'غير معروف'),
    h('div', { class: 'picksub' }, [l.item && l.item.u, l.item && l.item.c, l.item && l.item.i, METHOD_AR[l.method], l.bc].filter(Boolean).join('، ')),
    l.item && l.why ? h('div', { class: 'chips' }, whyChips(l.why, { pack: l.read && l.read.pack }, Object.assign({}, l.item, { pack: (C.ix && C.ix.byId.get(l.item.i) || {}).pack }))) : null,
    l.read && l.read.name ? h('div', { class: 'readbox' }, h('small', null, 'في الصورة'), h('span', { dir: 'ltr', class: 'lat' }, [l.read.name, l.read.strength, l.read.vol].filter(Boolean).join('  ')), h('span', null, [l.read.form, l.read.pack ? 'العبوة ' + l.read.pack : ''].filter(Boolean).join('، ')), l.read.company ? h('span', { dir: 'ltr', class: 'lat co' }, l.read.company) : null) : null,
    iss.length ? h('div', { class: 'iss' }, iss.map(([k, t]) => h('span', { class: 'tag ' + k }, t))) : null,
    photos.childNodes.length ? photos : null,
    h('div', { class: 'qgrid' }, h('label', null, h('span', null, 'الكمية'), q), h('label', null, h('span', null, 'البونص'), b), h('label', null, h('span', null, 'سعر الشراء'), p)),
    h('div', { class: 'qgrid two' }, h('label', null, h('span', null, 'تاريخ الانتهاء'), ex), h('label', null, h('span', null, 'التشغيلة'), bt)),
    h('div', { class: 'acts' },
      h('button', { class: 'btn big', on: { click: async () => {
        const v = ex.value.trim() ? normExp(ex.value.replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x))) : '';
        if (v === null) { toast('التاريخ غير صحيح. مثال: 03/2027', { bad: true }); return; }
        l.qty = num(q.value); l.bonus = num(b.value); l.price = num(p.value); l.exp = v; l.batch = bt.value.trim();
        await hooksFor(o).save(l); s.close(); route();
      } } }, 'حفظ'),
      h('div', { class: 'acts2' },
        h('button', { class: 'btn ghost', on: { click: () => { s.close(); setTimeout(() => changeItem(o, l), 250); } } }, icon('search', 18), 'غيّر الصنف'),
        h('button', { class: 'btn ghost ai', on: { click: () => { s.close(); setTimeout(() => reidentify(o, l), 250); } } }, icon('spark', 18), 'صورة ثانية'),
        h('button', { class: 'btn ghost', on: { click: () => { s.close(); setTimeout(() => cameraFor(o, { expOnly: l }), 250); } } }, icon('clock', 18), 'صوّر الصلاحية')),
      h('button', { class: 'btn link danger', on: { click: async () => {
        if (!(await confirmBox('حذف الصنف', 'حذف «' + (l.item ? l.item.n : 'هذا الصنف') + '» من الطلبية؟', 'حذف', true))) return;
        o.lines = o.lines.filter(x => x.id !== l.id);
        for (const k of ['photo', 'photo2', 'photo3']) if (l[k]) DB.delPhoto(l[k]).catch(() => {});
        await DB.saveOrder(o); s.close(); route();
      } } }, 'حذف الصنف من الطلبية'))), { tall: true, onClose: () => photos.querySelectorAll('img').forEach(i => setTimeout(() => URL.revokeObjectURL(i.src), 500)) });
}
function viewPhoto(url) {
  const v = h('div', { class: 'viewer', on: { click: () => v.remove() } }, h('img', { src: url, alt: '' }), h('button', { class: 'cbtn', 'aria-label': 'إغلاق' }, icon('x')));
  document.body.appendChild(v);
}

/* ---------- خيارات الطلبية ---------- */
function orderMenu(o) {
  const s = sheet('الطلبية ' + o.no, h('div', { class: 'menu' },
    h('button', { class: 'mrow', on: { click: () => { s.close(); setTimeout(() => finish(o), 250); } } }, icon('xls'), h('span', null, 'حفظ وتصدير Excel')),
    h('button', { class: 'mrow', on: { click: async () => { s.close(); if (await chooseSupplier(o)) route(); } } }, icon('people'), h('span', null, 'تغيير المورد')),
    h('button', { class: 'mrow', on: { click: async () => { s.close(); await shareSummary(o); } } }, icon('share'), h('span', null, 'مشاركة ملخص نصي')),
    h('button', { class: 'mrow danger', on: { click: async () => {
      s.close();
      if (!(await confirmBox('حذف الطلبية', 'حذف الطلبية ' + o.no + ' بكل أصنافها وصورها؟ لا يمكن التراجع.', 'حذف', true))) return;
      await DB.deleteOrder(o); location.hash = '#/';
    } } }, icon('trash'), h('span', null, 'حذف الطلبية'))));
}

/* ---------- الحفظ والتصدير ---------- */
const COLS_AR = ['م', 'رقم الصنف', 'الباركود', 'اسم الصنف', 'الاسم في الصورة', 'التركيز', 'الشكل', 'العبوة', 'الشركة', 'الوحدة', 'الكمية', 'البونص', 'سعر الشراء', 'الإجمالي', 'تاريخ الانتهاء', 'التشغيلة', 'طريقة التعرف', 'الثقة'];
const expDate = e => { if (!e) return ''; const [m, y] = e.split('/').map(Number); const d = new Date(y, m, 0).getDate(); return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };
function tablesOf(o) {
  const L = o.lines || [];
  const rows = [COLS_AR];
  L.forEach((l, k) => rows.push([k + 1, l.item ? l.item.i : '', l.bc || '', l.item ? l.item.n : '', (l.read && l.read.name) || '', (l.read && l.read.strength) || '', (l.read && l.read.form) || '', (l.read && l.read.pack) || '', (l.item && l.item.c) || (l.read && l.read.company) || '', (l.item && l.item.u) || '',
    num(l.qty), num(l.bonus), num(l.price), num(l.qty) * num(l.price), l.exp || '', l.batch || '', METHOD_AR[l.method] || '', CONF_AR[l.conf || 'none']]));
  const tq = L.reduce((s, l) => s + num(l.qty), 0), tb = L.reduce((s, l) => s + num(l.bonus), 0), tt = orderTotal(o);
  rows.push(['', '', '', 'الإجمالي', '', '', '', '', '', '', tq, tb, '', tt, '', '', '', '']);
  const head = [['البيان', 'القيمة'], ['المورد', o.supplier ? o.supplier.n : ''], ['رقم المورد في نظام الحسابات', o.supplier && o.supplier.id || ''], ['تاريخ الفاتورة', fmtDate(o.date)], ['رقم فاتورة المورد', o.inv || ''], ['رقم الطلبية', o.no], ['عدد الأصناف', L.length], ['إجمالي الكمية', tq], ['إجمالي البونص', tb], ['إجمالي الفاتورة', tt], ['أدخلها', o.by || ''], ['تاريخ التصدير', new Date().toLocaleString('en-GB')]];
  // ورقة بعناوين إنجليزية ثابتة لأي نظام آخر: كل سطر كامل بذاته
  const imp = [['item_code', 'barcode', 'item_name', 'qty', 'bonus', 'unit_cost', 'line_total', 'expiry', 'expiry_date', 'batch', 'supplier', 'supplier_code', 'invoice_no', 'invoice_date', 'read_name', 'strength', 'pack', 'unit']];
  for (const l of L) imp.push([l.item ? l.item.i : '', l.bc || '', l.item ? l.item.n : (l.read && l.read.name) || '', num(l.qty), num(l.bonus), num(l.price), num(l.qty) * num(l.price), l.exp || '', expDate(l.exp), l.batch || '', o.supplier ? o.supplier.n : '', (o.supplier && o.supplier.id) || '', o.inv || '', o.date || '', (l.read && l.read.name) || '', (l.read && l.read.strength) || '', (l.read && l.read.pack) || '', (l.item && l.item.u) || '']);
  return [
    { name: 'فاتورة الشراء', rows, widths: [5, 11, 16, 34, 22, 14, 14, 8, 22, 9, 9, 9, 12, 13, 12, 12, 12, 11] },
    { name: 'بيانات الفاتورة', rows: head, widths: [26, 34] },
    { name: 'import', rows: imp, widths: [11, 16, 34, 8, 8, 10, 11, 9, 12, 12, 22, 12, 12, 12, 22, 14, 8, 9] }
  ];
}
function jsonOf(o) {
  return {
    kind: 'pharm-purchase', v: 1, app: 'order', at: Date.now(), by: o.by || '',
    supplier: o.supplier || null, date: o.date, inv: o.inv || '', no: o.no,
    lines: (o.lines || []).map(l => ({ i: l.item ? l.item.i : '', n: l.item ? l.item.n : '', bc: l.bc || '', rn: (l.read && l.read.name) || '', s: (l.read && l.read.strength) || '', pk: (l.read && l.read.pack) || '', u: (l.item && l.item.u) || '', q: num(l.qty), b: num(l.bonus), p: num(l.price), x: l.exp || '', bt: l.batch || '', m: l.method || '', c: l.conf || '' })),
    total: orderTotal(o)
  };
}
const fileBase = o => ('طلبية_' + (o.supplier ? o.supplier.n : 'بلا_مورد') + '_' + (o.date || today())).replace(/[\\/:*?"<>|\s]+/g, '_');

async function finish(o) {
  o = await DB.order(o.id) || o;
  if (!(o.lines || []).length) { toast('الطلبية فارغة: صوّر الأصناف أولاً', { bad: true }); return; }
  if (!o.supplier && !(await chooseSupplier(o, true))) { toast('لا يمكن الحفظ بلا مورد', { bad: true }); return; }
  const L = o.lines, rv = L.filter(needsReview);
  const unk = L.filter(l => !l.item).length, noExp = L.filter(l => !l.exp).length, noPrice = L.filter(l => !(num(l.price) > 0)).length;
  const s = sheet('حفظ وتصدير', h('div', { class: 'finish' },
    h('div', { class: 'sumgrid' },
      h('div', null, h('small', null, 'المورد'), h('b', null, o.supplier.n)),
      h('div', null, h('small', null, 'الأصناف'), h('b', { class: 'num' }, L.length)),
      h('div', null, h('small', null, 'الإجمالي'), h('b', { class: 'num' }, money(orderTotal(o))))),
    rv.length ? h('div', { class: 'note warn' }, rv.length + ' تحتاج مراجعة' + (unk ? '، ' + unk + ' غير معروفة' : '') + (noExp ? '، ' + noExp + ' بلا صلاحية' : '') + (noPrice ? '، ' + noPrice + ' بلا سعر' : '') + '. يمكنك التصدير الآن والمراجعة لاحقاً.',
      h('button', { class: 'btn link', on: { click: () => { s.close(); curTab = 'rev'; setTimeout(route, 200); } } }, 'افتح «تحتاج مراجعة»')) : h('div', { class: 'note ok' }, 'كل الأصناف معروفة ومكتملة.'),
    h('div', { class: 'menu' },
      h('button', { class: 'mrow', on: { click: async () => { await exportXlsx(o); } } }, icon('xls'), h('span', null, h('b', null, 'ملف Excel'), h('small', null, 'ثلاث أوراق: الفاتورة، بياناتها، وورقة import بعناوين إنجليزية لأي نظام'))),
      h('button', { class: 'mrow', on: { click: async () => { await exportJson(o); } } }, icon('in'), h('span', null, h('b', null, 'ملف لنظام حسابات الصيدلية'), h('small', null, 'يُستورد كفاتورة مشتريات عند إضافة الاستيراد للنظام'))),
      h('button', { class: 'mrow', on: { click: async () => { await shareSummary(o); } } }, icon('share'), h('span', null, h('b', null, 'مشاركة ملخص'), h('small', null, 'نص للواتساب أو الرسائل'))))));
  return s;
}
async function exportXlsx(o) {
  try {
    const r = await saveBlob(fileBase(o) + '.xlsx', buildXlsx(tablesOf(o)));
    if (r === 'cancel') return;
    o.exported = true; await DB.saveOrder(o);
    toast(r === 'app' ? 'حُفظ ملف Excel' : 'نُزّل ملف Excel');
  } catch (e) { toast('تعذّر حفظ الملف: ' + e.message, { bad: true }); }
}
async function exportJson(o) {
  try {
    const r = await saveBlob(fileBase(o) + '.json', new Blob([JSON.stringify(jsonOf(o), null, 1)], { type: 'application/json' }));
    if (r === 'cancel') return;
    o.exported = true; await DB.saveOrder(o);
    toast('حُفظ ملف الاستيراد');
  } catch (e) { toast('تعذّر حفظ الملف: ' + e.message, { bad: true }); }
}
async function shareSummary(o) {
  const L = o.lines || [];
  const t = ['طلبية ' + o.no + ' — ' + (o.supplier ? o.supplier.n : 'بلا مورد'), 'التاريخ: ' + fmtDate(o.date) + (o.inv ? '، فاتورة ' + o.inv : ''), ''];
  L.forEach((l, k) => t.push((k + 1) + ') ' + (l.item ? l.item.n : (l.read && l.read.name) || '؟') + ' — ' + num(l.qty) + (num(l.bonus) ? '+' + num(l.bonus) : '') + ' × ' + money(l.price) + (l.exp ? ' — ' + l.exp : '')));
  t.push('', 'الإجمالي: ' + money(orderTotal(o)));
  const { shareText } = await import('./out.js');
  const r = await shareText(t.join('\n'));
  if (r === 'copied') toast('نُسخ الملخص');
}

/* ---------- الإعدادات ---------- */
async function settingsView() {
  const st = S.settings;
  const key = h('input', { type: 'password', dir: 'ltr', value: st.key || '', placeholder: 'AIza…', autocomplete: 'off' });
  const showK = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'إظهار المفتاح', on: { click: () => { key.type = key.type === 'password' ? 'text' : 'password'; } } }, icon('key', 20));
  const model = h('input', { dir: 'ltr', value: st.model || AI.DEFAULT_MODEL, autocomplete: 'off' });
  const test = h('p', { class: 'muted' });
  const tog = (k, label, sub) => h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: st[k] !== false, on: { change: async e => { st[k] = e.target.checked; await saveSettings(); } } }), h('span', null, h('b', null, label), h('small', null, sub)));
  const used = await DB.usage();
  root().textContent = '';
  root().appendChild(h('div', { class: 'page settings' },
    topbar('الإعدادات', { back: true }),
    h('section', { class: 'card' },
      h('h2', null, 'قاعدة الأصناف'),
      h('p', { id: 'catstate', class: 'muted' }, catText()),
      h('button', { class: 'btn ghost', on: { click: async e => { e.target.disabled = true; const ok = await syncCatalog(true); e.target.disabled = false; toast(ok ? 'حُدّثت قاعدة الأصناف' : 'تعذّر التحديث: تأكد من الإنترنت', { bad: !ok }); } } }, icon('cloud', 18), 'تحديث قاعدة الأصناف'),
      h('p', { class: 'muted' }, 'تُحفظ على الجوال وتعمل بدون إنترنت. تُحدّث وحدها عند فتح التطبيق مع اتصال.')),
    h('section', { class: 'card' },
      h('h2', null, 'التصوير'),
      tog('askExp', 'اطلب تصوير تاريخ الانتهاء بعد كل صنف', 'إن أُطفئ تنتقل مباشرة إلى الكمية والسعر'),
      tog('autoExp', 'التقاط التاريخ تلقائياً', 'يقرأ التاريخ من المعاينة ويلتقطه حين يثبت، دون ضغط الزر'),
      h('p', { class: 'muted' }, CAM.hasOcr() ? 'قارئ النص على الجوال: يعمل بدون إنترنت.' : 'قارئ النص على الجوال غير متاح هنا (يعمل في تطبيق أندرويد).')),
    h('section', { class: 'card' },
      h('h2', null, 'التعرّف عبر الإنترنت (اختياري)'),
      h('p', { class: 'muted' }, 'يُستعمل فقط حين تضغط «عبر الإنترنت» أو «أعد التعرّف بصورة ثانية». يرسل صورة العلبة إلى Gemini من Google ويعيد الاسم والتركيز والتاريخ. المفتاح مجاني ضمن حد يومي، ويبقى على هذا الجوال فقط.'),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'مفتاح Gemini API'), h('div', { class: 'inrow' }, key, showK)),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'النموذج'), model, h('small', { class: 'fhint' }, 'اتركه gemini-flash-latest ليستعمل أحدث نموذج سريع تلقائياً.')),
      h('div', { class: 'acts2' },
        h('button', { class: 'btn', on: { click: async () => { st.key = key.value.trim(); st.model = model.value.trim() || AI.DEFAULT_MODEL; await saveSettings(); toast('حُفظ'); } } }, 'حفظ'),
        h('button', { class: 'btn ghost', on: { click: async e => {
          st.key = key.value.trim(); st.model = model.value.trim() || AI.DEFAULT_MODEL; await saveSettings();
          e.target.disabled = true; test.textContent = 'جارٍ التجربة…';
          try { await testKey(); test.textContent = '✓ المفتاح يعمل.'; test.className = 'good'; }
          catch (x) { test.textContent = AI.AI_ERR[x.message] || x.detail || x.message; test.className = 'bad'; }
          e.target.disabled = false;
        } } }, 'جرّب المفتاح')),
      test,
      h('details', { class: 'how' }, h('summary', null, 'كيف أحصل على المفتاح؟'),
        h('ol', null,
          h('li', null, 'افتح من المتصفح: ', h('b', { dir: 'ltr' }, 'aistudio.google.com/apikey')),
          h('li', null, 'ادخل بحساب Google، ثم اضغط Create API key.'),
          h('li', null, 'انسخ المفتاح والصقه هنا، ثم اضغط «جرّب المفتاح».')))),
    h('section', { class: 'card' },
      h('h2', null, 'الحساب'),
      h('p', null, (S.staff && S.staff.name) || '', ' ', h('small', { class: 'muted', dir: 'ltr' }, S.user ? S.user.email : '')),
      h('p', { class: 'muted' }, 'المساحة المستعملة على الجوال: ' + (used ? Math.round(used / 1048576) + ' ميغابايت' : 'غير معروفة') + (APPV ? '، نسخة التطبيق ' + APPV : '')),
      h('button', { class: 'btn ghost danger', on: { click: async () => { if (await confirmBox('خروج', 'الخروج من الحساب؟ الطلبيات تبقى محفوظة على الجوال.', 'خروج')) { await FB.signOut(); } } } }, 'خروج'))));
}
async function testKey() {
  // صورة صغيرة فيها نص لتجربة المفتاح والنموذج
  const c = document.createElement('canvas'); c.width = 320; c.height = 120;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 120); g.fillStyle = '#000'; g.font = 'bold 40px sans-serif'; g.fillText('PANADOL', 20, 60); g.font = '22px sans-serif'; g.fillText('500 mg 24 Tablets', 20, 98);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
  const r = await AI.identify({ key: S.settings.key, model: S.settings.model, images: [await CAM.blobToB64(blob)] });
  if (!r || !String(r.name || '').toUpperCase().includes('PANADOL')) throw Object.assign(new Error('bad-reply'), { detail: JSON.stringify(r).slice(0, 120) });
}

/* ---------- التشغيل ---------- */
async function start() {
  DB.persist();
  const st = await DB.get('settings');
  if (st) Object.assign(S.settings, st);
  if (!S.settings.model) S.settings.model = AI.DEFAULT_MODEL;
  S.syncAt = await DB.get('syncAt');
  waitView('جارٍ التشغيل…');
  try { await FB.init(cfg.firebase); }
  catch (e) { waitView('إعدادات Firebase غير صحيحة'); return; }
  let first = true;
  FB.onAuth(async user => {
    if (!user) { S.user = null; loginView(); return; }
    S.user = user;
    waitView('جارٍ فتح الحساب…');
    let staff = null;
    try { staff = await FB.getStaff(user.email); if (staff) await DB.set('staff', staff); }
    catch (e) { staff = await DB.get('staff'); }   // بدون إنترنت: آخر بيانات محفوظة
    if (staff && staff.active === false) { await FB.signOut(); loginView('هذا الحساب معطّل. راجع المشرف.'); return; }
    if (!staff && navigator.onLine) { await FB.signOut(); loginView('هذا الحساب غير مسجل كموظف. راجع المشرف.'); return; }
    S.staff = staff || { name: user.email.split('@')[0] };
    waitView('جارٍ تحميل قاعدة الأصناف…');
    await loadItems().catch(e => console.warn(e));
    if (!C.ix) await syncCatalog(true);
    route();
    if (first && C.ix) { first = false; syncCatalog().then(ok => { if (ok && !/^#\/o\//.test(location.hash)) route(); }); }
  });
}
addEventListener('online', () => { S.online = true; });
addEventListener('offline', () => { S.online = false; });
start();
