/* المزيد: المستندات، السجل، تفاصيل السند، الإعدادات، الاستيراد */
import { h, icon, toast, field, numField, seg, confirmBox, sheet, put } from './ui.js';
import { money, price, qty, norm, dmy, today, num, r2, newId } from './util.js';
import { totals, check, TYPES, STORES, PARTY_TYPES, describe } from './engine.js';
import { typeName, voucherLine, partyName, units, printVoucher, cashAccounts } from './common.js';
import { shareText, printHtml } from './out.js';

export function moreView(ctx) {
  const it = (k, label, sub, ic, href) => ctx.can(k) ? h('a', { class: 'ln link', href: '#/' + href }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon(ic, 22), h('span', null, h('b', null, label), sub ? h('small', null, sub) : null)), icon('fwd', 18)) : null;
  const S = ctx.store.settings;
  return {
    title: 'المزيد',
    el: h('div', null,
      h('h3', { class: 'sect' }, 'المستندات'),
      h('section', { class: 'page tight' },
        it('pur', 'فاتورة شراء', 'استلام بضاعة من مورد، نقداً أو آجلاً', 'in', 'doc/pur'),
        it('sret', 'مرتجع مبيعات', 'إرجاع صنف من زبون', 'undo', 'doc/sret'),
        it('pret', 'مرتجع مشتريات', 'إعادة أصناف إلى المورد', 'out', 'doc/pret'),
        it('rcpt', 'سند قبض', 'استلام مبلغ من عميل أو غيره', 'wallet', 'v/rcpt'),
        it('pay', 'سند صرف', 'دفع مبلغ لمورد أو موظف', 'out', 'v/pay'),
        it('exp', 'مصروف', 'إيجار، كهرباء، رواتب…', 'out', 'v/exp'),
        it('cxf', 'تحويل بين الصناديق', '', 'swap', 'v/cxf'),
        it('adj', 'تسوية مخزون', 'نتيجة جرد، منتهي، تالف', 'box', 'v/adj'),
        it('xfer', 'تحويل بين المخازن', 'من الصيدلية إلى المخزن أو العكس', 'swap', 'v/xfer'),
        it('jv', 'قيد يومية', 'للمحاسب: قيد يدوي متوازن', 'doc', 'v/jv')),
      h('h3', { class: 'sect' }, 'السجل والتقارير'),
      h('section', { class: 'page tight' },
        h('a', { class: 'ln link', href: '#/vouchers' }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon('doc', 22), h('span', null, h('b', null, 'كل السندات'), h('small', null, 'بحث، طباعة، إلغاء'))), icon('fwd', 18)),
        h('a', { class: 'ln link', href: '#/reports' }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon('report', 22), h('span', null, h('b', null, 'التقارير'), h('small', null, 'المبيعات، الصندوق، الديون، الصلاحيات، الأرباح'))), icon('fwd', 18))),
      h('h3', { class: 'sect' }, 'الحساب'),
      h('section', { class: 'page tight' },
        it('settings', 'الإعدادات', 'اسم الصيدلية، الصناديق، المصروفات، المستخدمون، قفل الفترة', 'gear', 'settings'),
        it('import', 'الأرصدة الافتتاحية', 'استيراد الأصناف والأسماء والأرصدة', 'in', 'import'),
        h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, ctx.user.name), h('small', null, (ctx.user.role === 'admin' ? 'مشرف' : 'كاشير') + '، ' + ctx.user.email)),
          h('button', { class: 'btn ghost sm', on: { click: async () => { if (ctx.store.status.pending && !(await confirmBox('سندات لم تُرفع', ctx.store.status.pending + ' سند لم يصل الخادم بعد. إن خرجت الآن تبقى على هذا الجهاز وتُرفع عند دخولك ثانية. اخرج؟', 'خروج'))) return; ctx.logout(); } } }, 'خروج'))),
      h('p', { class: 'muted', style: { fontSize: '12.5px', textAlign: 'center', marginTop: '16px' } },
        (S.name || 'الصيدلية') + '، الحسابات محسوبة من ' + ctx.store.vouchers.size + ' سنداً في ' + (ctx.store.L.ms || 0) + ' ملّي ثانية' + (window.JardApp && window.JardApp.version ? '، نسخة ' + window.JardApp.version() : '')))
  };
}

/* ---------- كل السندات ---------- */
const VF = { g: 'all', q: '', n: 150 };
const GROUPS = [['all', 'الكل', null], ['s', 'المبيعات', ['sale', 'sret']], ['p', 'المشتريات', ['pur', 'pret']], ['c', 'القبض والصرف', ['rcpt', 'pay', 'cxf', 'jv']], ['i', 'المخزون', ['adj', 'xfer', 'open']]];
export function vouchersView(ctx) {
  const { store } = ctx;
  const g = GROUPS.find(x => x[0] === VF.g);
  const n = norm(VF.q);
  let list = [...store.vouchers.values()].filter(v => (!g[2] || g[2].includes(v.t)) && (!n || norm([v.no, typeName(v.t), partyName(store, v.pt), v.m, v.inv].join(' ')).includes(n)));
  list.sort((a, b) => (b.d + b.at) > (a.d + a.at) ? 1 : -1);
  const box = h('section', { class: 'page tight' });
  let lastD = '';
  for (const v of list.slice(0, VF.n)) {
    if (v.d !== lastD) { put(box, h('div', { class: 'sect', style: { margin: '12px 0 2px' } }, dmy(v.d))); lastD = v.d; }
    put(box, voucherLine(store, v));
  }
  if (!list.length) put(box, h('p', { class: 'empty' }, 'لا سندات.'));
  return {
    title: 'كل السندات', sub: list.length + ' سند', live: true,
    el: h('div', null,
      h('input', { type: 'search', value: VF.q, placeholder: 'رقم السند أو الاسم أو البيان', on: { change: e => { VF.q = e.target.value; ctx.redraw(); } } }),
      h('div', { class: 'chips', style: { marginTop: '10px' } }, GROUPS.map(([k, l]) => h('button', { class: 'chip' + (VF.g === k ? ' set' : ''), on: { click: () => { VF.g = k; ctx.redraw(); } } }, l))),
      box,
      list.length > VF.n ? h('button', { class: 'btn ghost wide', on: { click: () => { VF.n += 200; ctx.redraw(); } } }, 'عرض المزيد') : null)
  };
}

/* ---------- تفاصيل سند ---------- */
const fpx = price;
function when(t) { const d = new Date(t || 0), hh = d.getHours(), mm = String(d.getMinutes()).padStart(2, '0'); return dmy(today(t)) + ' الساعة ' + ((hh % 12) || 12) + ':' + mm + (hh < 12 ? ' ص' : ' م'); }
export function voucherView(ctx, id) {
  const { store } = ctx, v = store.vouchers.get(id);
  if (!v) return { title: 'السند', el: h('div', { class: 'note bad' }, 'السند غير موجود.') };
  const tt = totals(v), L = store.L, meta = L.vm.get(id) || {};
  const isBuy = v.t === 'pur' || v.t === 'pret';
  const row = (k, val, cls) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, k)), h('span', { class: 'v ' + (cls || ''), style: { fontSize: '16px' } }, val));
  const lines = (v.ln || []).map(l => {
    const it = store.items.get(l.i) || {}, u = (it.u || [])[l.u] || {};
    const price = isBuy ? l.c : v.t === 'open' ? l.c : l.p;
    return h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, l.n || it.n), h('small', null, [qty(l.q) + ' ' + (u.n || '') + (l.f ? ' + بونص ' + qty(l.f) : ''), price != null ? '× ' + fpx(price) : '', l.x ? 'صلاحية ' + l.x : '', l.s2 ? STORES[l.s] + ' ← ' + STORES[l.s2] : STORES[l.s || 1]].filter(Boolean).join('، '))),
      price != null ? h('span', { class: 'v num', style: { fontSize: '15px' } }, money((+l.q || 0) * price)) : null);
  });
  const posts = L.post.filter(e => e.v.id === id);
  const who = v.pt ? partyName(store, v.pt) : v.ac ? (store.accounts.get(v.ac) || {}).n : '';
  const locked = store.settings.lock && v.d <= store.settings.lock;
  const doVoid = async () => {
    const why = h('input', { placeholder: 'مثلاً: فاتورة مكررة' });
    const s = sheet('إلغاء ' + typeName(v.t) + ' ' + (v.no || ''), h('div', null,
      h('p', { class: 'lead' }, 'يبقى السند في السجل مشطوباً، وتُعاد الأرصدة والمخزون كأنه لم يكن.'),
      field('سبب الإلغاء', why),
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', on: { click: async () => { if (!why.value.trim()) { toast('اكتب السبب', { bad: true }); return; } await store.voidVoucher(id, why.value.trim()); s.close(); toast('أُلغي السند'); } } }, 'إلغاء السند'))));
  };
  return {
    title: typeName(v.t) + ' ' + (v.no || ''), sub: dmy(v.d), live: true,
    el: h('div', null,
      v.st === 'void' ? h('div', { class: 'note bad' }, 'ملغى' + (v.vd ? ' بواسطة ' + (v.vd.bn || '') + (v.vd.why ? '، السبب: ' + v.vd.why : '') : '')) : null,
      h('section', { class: 'page' },
        h('div', { class: 'ph' }, h('h2', null, typeName(v.t) + ' ' + (v.no || '')), h('div', { class: 'meta' }, [dmy(v.d), who, v.inv ? 'فاتورة المورد ' + v.inv : ''].filter(Boolean).join('، '))),
        ...lines,
        tt.ds ? row('الخصم', h('span', { class: 'num' }, money(tt.ds))) : null,
        row(v.t === 'open' ? 'رأس المال الناتج' : 'الإجمالي', h('span', { class: 'num' }, money(v.t === 'open' || v.t === 'adj' ? meta.tot || 0 : tt.tot))),
        ['sale', 'sret', 'pur', 'pret'].includes(v.t) ? row('المدفوع نقداً', h('span', { class: 'num' }, money(tt.pd))) : null,
        tt.credit > 0.004 && ['sale', 'sret', 'pur', 'pret'].includes(v.t) ? row('آجل', h('span', { class: 'num' }, money(tt.credit)), 'amber') : null,
        ctx.can('profit') && v.t === 'sale' ? row('ربح الفاتورة', h('span', { class: 'num' }, money(meta.gp || 0)), (meta.gp || 0) < 0 ? 'red' : 'green') : null,
        v.m ? row('البيان', v.m) : null,
        row('أدخله', (v.bn || '') + '، ' + when(v.at))),
      posts.length && ctx.can('profit') ? h('h3', { class: 'sect' }, 'القيد المحاسبي') : null,
      posts.length && ctx.can('profit') ? h('section', { class: 'page tight' }, h('table', { class: 'stmt' },
        h('thead', null, h('tr', null, h('th', null, 'الحساب'), h('th', { class: 'n' }, 'مدين'), h('th', { class: 'n' }, 'دائن'))),
        h('tbody', null, posts.map(e => h('tr', null, h('td', null, (store.accounts.get(e.a) || {}).n || e.a, e.p ? h('small', { style: { display: 'block' } }, partyName(store, e.p)) : null), h('td', { class: 'n num' }, e.dr ? money(e.dr) : ''), h('td', { class: 'n num' }, e.cr ? money(e.cr) : '')))))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', on: { click: () => printVoucher(store, v) } }, icon('print', 20), 'طباعة'),
        h('button', { class: 'btn ghost', on: { click: async () => { const r = await shareText(typeName(v.t) + ' ' + (v.no || '') + '\n' + dmy(v.d) + (who ? '\n' + who : '') + '\n' + (v.ln || []).map(l => (l.n || '') + ' × ' + qty(l.q)).join('\n') + '\nالإجمالي: ' + money(tt.tot)); if (r === 'copied') toast('نُسخ النص'); } } }, icon('share', 20), 'مشاركة'),
        ctx.can('void') && v.st !== 'void' && !locked ? h('button', { class: 'btn ghost', style: { color: 'var(--red)' }, on: { click: doVoid } }, icon('trash', 20), 'إلغاء') : null))
  };
}

/* ---------- الإعدادات ---------- */
export function settingsView(ctx) {
  const { store, be } = ctx;
  if (!ctx.can('settings')) return { title: 'الإعدادات', el: h('div', { class: 'note bad' }, 'للمشرف فقط.') };
  const S = Object.assign({ name: '', addr: '', ph: '', foot: '', pw: 58, lock: '' }, store.settings);
  const save = async (msg) => { await store.put('meta', 'settings', Object.assign({}, S, { kind: 'settings' })); toast(msg || 'حُفظ'); };
  const accList = kind => h('section', { class: 'page tight' }, [...store.accounts.values()].filter(a => a.k === kind).map(a => h('div', { class: 'ln' },
    h('span', { class: 'k' }, h('b', null, a.n), h('small', null, a.id + (a.act === false ? '، موقوف' : ''))),
    h('button', { class: 'btn ghost sm', on: { click: async () => { const n = prompt('الاسم الجديد', a.n); if (n && n.trim()) { await store.put('accounts', a.id, { n: n.trim(), k: a.k }, true); toast('حُفظ'); ctx.redraw(); } } } }, 'تسمية'))));
  const addAcc = async (kind, base, label) => {
    const n = prompt(label); if (!n || !n.trim()) return;
    let id = base; while (store.accounts.has(String(id))) id++;
    await store.put('accounts', String(id), { n: n.trim(), k: kind }); toast('أُضيف'); ctx.redraw();
  };
  const users = h('section', { class: 'page tight' }, h('p', { class: 'muted', style: { padding: '8px 0' } }, 'جارٍ تحميل المستخدمين…'));
  if (be.listStaff) be.listStaff().then(list => {
    users.textContent = '';
    for (const u of list) {
      const role = u.acc || (u.role === 'admin' ? 'admin' : '');
      put(users, h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, u.name || u.id), h('small', null, u.id)),
        h('select', { style: { width: 'auto' }, disabled: u.id === ctx.user.email, on: { change: async e => { try { await be.setStaff(u.id, { acc: e.target.value }); toast('حُفظت صلاحية ' + (u.name || u.id)); } catch (x) { toast('تعذّر: ' + (x.code || x.message) + '. حدّث قواعد Firestore.', { bad: true }); } } } },
          [['', 'لا يدخل الحسابات'], ['cashier', 'كاشير'], ['admin', 'مشرف']].map(([v, l]) => h('option', { value: v, selected: role === v }, l)))));
    }
  }).catch(e => { users.textContent = ''; put(users, h('p', { class: 'note bad' }, 'تعذّر تحميل المستخدمين: ' + (e.code || e.message))); });
  return {
    title: 'الإعدادات',
    el: h('div', null,
      h('h3', { class: 'sect' }, 'بيانات الصيدلية'),
      field('اسم الصيدلية', h('input', { value: S.name, on: { input: e => { S.name = e.target.value; } } })),
      h('div', { class: 'row2' }, field('العنوان', h('input', { value: S.addr, on: { input: e => { S.addr = e.target.value; } } })), field('الهاتف', h('input', { value: S.ph, class: 'num', on: { input: e => { S.ph = e.target.value; } } }))),
      field('سطر أسفل الفاتورة', h('input', { value: S.foot, placeholder: 'شكراً لزيارتكم', on: { input: e => { S.foot = e.target.value; } } })),
      field('عرض ورق الطابعة', seg([[58, '58 ملم'], [80, '80 ملم']], +S.pw || 58, v => { S.pw = v; })),
      desktopPrinter(),
      h('button', { class: 'btn wide', on: { click: () => save('حُفظت بيانات الصيدلية') } }, 'حفظ'),
      h('h3', { class: 'sect' }, 'قفل الفترة'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'بعد مراجعة شهر وإقفاله لا يمكن إضافة أو إلغاء أي سند بتاريخ فيه، فتبقى أرقامه ثابتة.'),
      h('div', { class: 'row2' }, h('input', { type: 'date', value: S.lock || '', on: { change: e => { S.lock = e.target.value; } } }), h('button', { class: 'btn ghost', on: { click: () => save(S.lock ? 'أُقفلت الفترة حتى ' + dmy(S.lock) : 'أُلغي القفل') } }, 'حفظ القفل')),
      h('h3', { class: 'sect' }, 'الصناديق'), accList('cash'),
      h('button', { class: 'btn ghost wide', on: { click: () => addAcc('cash', 1102, 'اسم الصندوق الجديد (مثلاً: صندوق الإدارة، الكريمي)') } }, icon('plus', 18), 'صندوق جديد'),
      h('h3', { class: 'sect' }, 'أنواع المصروفات'), accList('exp'),
      h('button', { class: 'btn ghost wide', on: { click: () => addAcc('exp', 6910, 'اسم المصروف الجديد') } }, icon('plus', 18), 'نوع مصروف جديد'),
      h('h3', { class: 'sect' }, 'المستخدمون'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'أنشئ المستخدم أولاً في Firebase كما في تطبيق الجرد، ثم حدّد صلاحيته هنا.'),
      users)
  };
}

/** على الكمبيوتر: طابعة الإيصالات التي تُطبع عليها الفواتير مباشرة */
function desktopPrinter() {
  const A = window.JardApp;
  if (!A || !A.printers) return null;
  const sel = h('select', { on: { change: async e => { await A.setPrinter(e.target.value); toast(e.target.value ? 'تُطبع الفواتير مباشرة على ' + e.target.value : 'ستظهر نافذة الطباعة عند كل فاتورة'); } } }, h('option', { value: '' }, 'جارٍ تحميل الطابعات…'));
  Promise.all([A.printers(), A.getPrinter()]).then(([list, cur]) => {
    sel.textContent = '';
    sel.appendChild(h('option', { value: '' }, 'اسألني عند كل طباعة'));
    for (const p of list || []) sel.appendChild(h('option', { value: p.name, selected: p.name === cur }, (p.displayName || p.name) + (p.isDefault ? ' (الافتراضية)' : '')));
  }).catch(() => { sel.textContent = ''; sel.appendChild(h('option', { value: '' }, 'تعذّر قراءة الطابعات')); });
  return h('div', null,
    field('طابعة الإيصالات (على هذا الكمبيوتر)', sel, 'الفواتير تُطبع عليها مباشرة دون نافذة. التقارير والكشوف تفتح نافذة الطباعة دائماً.'),
    h('button', { class: 'btn ghost wide', style: { marginBottom: '12px' }, on: { click: () => printHtml('<div style="text-align:center"><h2>طباعة تجربة</h2><div>إن ظهرت هذه الورقة فالطابعة جاهزة.</div></div>', 'تجربة', 'receipt') } }, 'طباعة تجربة'));
}

/* ---------- الأرصدة الافتتاحية ---------- */
export function importView(ctx) {
  const { store, be } = ctx;
  if (!ctx.can('import')) return { title: 'الأرصدة الافتتاحية', el: h('div', { class: 'note bad' }, 'للمشرف فقط.') };
  const out = h('div');
  let pkg = null;
  const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, on: { change: async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { pkg = JSON.parse(await f.text()); if (pkg.kind !== 'pharm-opening') throw new Error('kind'); }
    catch (x) { pkg = null; out.textContent = ''; put(out, h('div', { class: 'note bad' }, 'الملف ليس ملف أرصدة افتتاحية صحيحاً (' + f.name + ').')); return; }
    drawPkg();
  } } });
  const D = { d: '2027-01-01', stock: true, parties: true, cash: true };
  function drawPkg() {
    out.textContent = '';
    const nC = pkg.parties.filter(p => p.t === 'c').length, nS = pkg.parties.filter(p => p.t === 's').length;
    const stockV = r2(pkg.stock.reduce((s, x) => s + x.q * x.c, 0));
    const recv = r2(pkg.parties.filter(p => p.b > 0).reduce((s, p) => s + p.b, 0)), pay = r2(-pkg.parties.filter(p => p.b < 0).reduce((s, p) => s + p.b, 0));
    const cash = r2((pkg.cash || []).reduce((s, x) => s + x.b, 0));
    const newItems = pkg.items.filter(x => !store.items.has(x.id)).length, newParties = pkg.parties.filter(x => !store.parties.has(x.id)).length;
    const status = h('div');
    put(out, 
      h('section', { class: 'page' },
        h('div', { class: 'ph' }, h('h2', null, 'ملف ' + (pkg.src || '')), h('div', { class: 'meta' }, 'أرصدة بتاريخ ' + dmy(pkg.asof || ''))),
        lnx('الأصناف', pkg.items.length + (newItems < pkg.items.length ? ' (' + newItems + ' جديد)' : '')),
        lnx('العملاء', nC), lnx('الموردون', nS), lnx('موظفون وغيرهم', pkg.parties.length - nC - nS),
        lnx('المخزون بالتكلفة', money(stockV) + ' (' + pkg.stock.length + ' سطر)'),
        lnx('لنا عند العملاء وغيرهم', money(recv)), lnx('علينا للموردين وغيرهم', money(pay)), lnx('النقدية', money(cash)),
        lnx('رأس المال الناتج', money(r2(stockV + recv + cash - pay)), 'green')),
      h('h3', { class: 'sect' }, '1. الأصناف والأسماء'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'تُضاف الأصناف (بالباركود والوحدات والأسعار) والأسماء دون أرصدة. يمكن تكرار هذه الخطوة بأمان.'),
      h('button', { class: 'btn wide', on: { click: async e => {
        e.target.disabled = true;
        try {
          status.textContent = 'جارٍ رفع الأصناف…';
          const items = pkg.items.map(x => ({ id: x.id, data: Object.assign({}, store.items.get(x.id) || {}, x, { act: true, at: Date.now() }) }));
          await be.putMany('items', items, (a, b) => { status.textContent = 'الأصناف ' + a + ' من ' + b; });
          const parties = pkg.parties.map(p => ({ id: p.id, data: Object.assign({}, store.parties.get(p.id) || {}, { id: p.id, n: p.n, t: p.t, ph: p.ph || '', act: true, at: Date.now() }) }));
          await be.putMany('parties', parties, (a, b) => { status.textContent = 'الأسماء ' + a + ' من ' + b; });
          status.textContent = 'تم: ' + items.length + ' صنف و' + parties.length + ' اسم.';
        } catch (x) { status.textContent = x.code === 'permission-denied' ? 'Firebase رفض الكتابة: انشر قواعد Firestore الجديدة أولاً ثم أعد المحاولة.' : 'تعذّر: ' + (x.code || x.message); }
        e.target.disabled = false;
      } } }, 'رفع الأصناف والأسماء'), status,
      h('h3', { class: 'sect' }, '2. القيد الافتتاحي'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'سند واحد بتاريخ بداية السنة: المخزون والأرصدة والنقدية، ورأس المال = الأصول − الالتزامات. يمكنك إلغاؤه وإعادته إن تغيرت الأرقام.'),
      field('تاريخ القيد', h('input', { type: 'date', value: D.d, on: { change: e => { D.d = e.target.value; } } })),
      chk('المخزون', 'stock'), chk('أرصدة العملاء والموردين', 'parties'), chk('النقدية', 'cash'),
      h('button', { class: 'btn wide', on: { click: makeOpening } }, 'إنشاء القيد الافتتاحي'));
  }
  const lnx = (k, v, cls) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, k)), h('span', { class: 'v num ' + (cls || ''), style: { fontSize: '16px' } }, String(v)));
  const chk = (label, k) => h('label', { class: 'field', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: D[k], style: { width: '22px', minHeight: '22px' }, on: { change: e => { D[k] = e.target.checked; } } }), label);
  async function makeOpening() {
    const missingI = pkg.stock.filter(x => !store.items.has(x.i)).length, missingP = pkg.parties.filter(p => p.b && !store.parties.has(p.id)).length;
    if ((D.stock && missingI) || (D.parties && missingP)) { toast('ارفع الأصناف والأسماء أولاً (الخطوة 1) وانتظر اكتمالها.', { bad: true }); return; }
    const v = { t: 'open', d: D.d, m: 'أرصدة افتتاحية من ' + (pkg.src || 'الملف') + ' بتاريخ ' + (pkg.asof || ''), ln: [], pb: [], cb: [] };
    if (D.stock) v.ln = pkg.stock.filter(x => x.q > 0).map(x => { const it = store.items.get(x.i); return { i: x.i, n: it ? it.n : x.i, u: 0, z: 1, q: x.q, c: x.c, s: x.s || 1, ...(x.x ? { x: x.x } : {}) }; });
    if (D.parties) v.pb = pkg.parties.filter(p => Math.abs(p.b || 0) > 0.004).map(p => ({ pt: p.id, b: p.b }));
    if (D.cash) v.cb = (pkg.cash || []).filter(x => x.b).map(x => ({ ca: store.accounts.has(x.ca) ? x.ca : '1101', b: x.b }));
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); return; }
    const exist = [...store.vouchers.values()].filter(x => x.t === 'open' && x.st !== 'void');
    if (exist.length && !(await confirmBox('يوجد قيد افتتاحي', 'يوجد ' + exist.length + ' قيد افتتاحي سابق. سيُضاف قيد جديد فوقه، فألغِ القديم من السجل إن كان يكرر نفس الأرصدة. أكمل؟', 'إنشاء'))) return;
    const doc = await store.saveVoucher(v);
    toast('أُنشئ القيد الافتتاحي');
    ctx.go('vch/' + encodeURIComponent(doc.id));
  }
  return {
    title: 'الأرصدة الافتتاحية',
    el: h('div', null,
      h('p', { class: 'lead' }, 'اختر ملف الأرصدة الافتتاحية (pharmacy_opening.json) الذي جهّزناه من نسخة BetaSys بعد مراجعة الديون.'),
      h('label', { class: 'btn ghost wide' }, icon('doc', 20), 'اختيار ملف الأرصدة', file), out)
  };
}
