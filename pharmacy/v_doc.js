/* فاتورة البيع والشراء والمرتجعات: مسح أو بحث ← سطر ← حفظ. المسودة تبقى محفوظة لو أُغلق التطبيق. */
import { h, $, icon, toast, picker, numField, confirmBox, field, put } from './ui.js';
import { money, price as fp, qty, num, today, parseExp, dmy } from './util.js';
import { totals, check, STORES } from './engine.js';
import { findBarcode, searchItems, units, stockOf, nearestExp, expTag, qtyText, cashAccounts, partyRows, partyFilter, partyName, avgCost, printVoucher } from './common.js';
import { scanCode } from './scan.js';

const META = {
  sale: { title: 'فاتورة بيع', pt: 'c', who: 'العميل', none: 'زبون نقدي', price: 'p', pay: 'cash', saved: 'حُفظت فاتورة البيع' },
  sret: { title: 'مرتجع مبيعات', pt: 'c', who: 'العميل', none: 'زبون نقدي', price: 'p', pay: 'cash', saved: 'حُفظ مرتجع المبيعات' },
  pur: { title: 'فاتورة شراء', pt: 's', who: 'المورد', none: 'اختر المورد', price: 'c', pay: 'credit', saved: 'حُفظت فاتورة الشراء' },
  pret: { title: 'مرتجع مشتريات', pt: 's', who: 'المورد', none: 'اختر المورد', price: 'c', pay: 'credit', saved: 'حُفظ مرتجع المشتريات' }
};
const drafts = {};
const fresh = t => ({ t, pt: '', ca: '1101', d: today(), ln: [], ds: '', pay: META[t].pay, pd: '', m: '', inv: '', s: 1 });
function load(t) {
  if (!drafts[t]) { let d = null; try { d = JSON.parse(localStorage.getItem('pharm.draft.' + t) || 'null'); } catch (e) {} drafts[t] = d && d.t === t ? d : fresh(t); }
  return drafts[t];
}
const persist = D => { try { localStorage.setItem('pharm.draft.' + D.t, JSON.stringify(D)); } catch (e) {} };

export function docView(ctx, t) {
  const { store } = ctx, M = META[t];
  if (!ctx.can(t)) return { title: M.title, el: h('div', { class: 'note bad' }, 'ليس لديك صلاحية لهذا المستند.') };
  let D = load(t);
  if (!D.ln.length && D.d !== today()) D.d = today();
  const isBuy = t === 'pur' || t === 'pret', isSale = !isBuy;
  const P = M.price;   // p = سعر البيع، c = التكلفة

  const head = h('div', { class: 'chips' });
  const input = h('input', { type: 'search', placeholder: 'امسح الباركود أو اكتب اسم الصنف', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'بحث عن صنف' });
  const sugg = h('div', { class: 'sugg hide' });
  const lines = h('section', { class: 'page tight' });
  const foot = h('footer', { class: 'foot' });
  const extra = h('div');

  /* ---------- رأس الفاتورة ---------- */
  function drawHead() {
    head.textContent = '';
    const pn = D.pt ? partyName(store, D.pt) : '';
    put(head, 
      h('button', { class: 'chip' + (D.pt ? ' set' : ''), on: { click: pickParty } }, icon('user', 18), h('b', null, pn || M.none)),
      h('button', { class: 'chip' + (D.pay === 'credit' ? ' set' : ''), on: { click: () => { D.pay = D.pay === 'cash' ? 'credit' : 'cash'; if (D.pay === 'credit' && !D.pt) pickParty(); change(); } } },
        D.pay === 'cash' ? 'نقداً' : 'آجل'),
      h('label', { class: 'chip' }, icon('cal', 18), h('input', { type: 'date', value: D.d, style: { border: 0, minHeight: '30px', padding: 0, width: '128px', background: 'none' }, on: { change: e => { D.d = e.target.value || today(); change(); } } })),
      h('button', { class: 'chip', on: { click: () => { D.s = D.s === 1 ? 2 : 1; D.ln.forEach(l => { l.s = D.s; }); change(); } } }, icon('box', 18), STORES[D.s]));
    const boxes = cashAccounts(store);
    if (boxes.length > 1) put(head, h('button', { class: 'chip', on: { click: async () => { const a = await picker('الصندوق', boxes.map(b => ({ value: b.id, label: b.n }))); if (a) { D.ca = a; change(); } } } }, icon('wallet', 18), (store.accounts.get(D.ca) || {}).n || 'الصندوق'));
  }
  async function pickParty() {
    const rows = partyRows(store, [M.pt, ...(M.pt === 'c' ? ['e', 'o'] : ['o'])]);
    const r = await picker(M.who, [{ value: '', label: M.none }, ...rows], { filter: q => q ? partyFilter(rows)(q) : [{ value: '', label: M.none }, ...rows], add: ctx.can('party-add') ? 'إضافة ' + M.who + ' جديد' : '', placeholder: 'ابحث بالاسم أو الهاتف' });
    if (r === null) return;
    if (r && r.add) {
      const id = await store.put('parties', null, { n: r.add, t: M.pt, ph: '', act: true, at: Date.now() });
      D.pt = id;
    } else D.pt = r ? r.id : '';
    if (!D.pt && D.pay === 'credit' && isSale) D.pay = 'cash';
    change();
  }

  /* ---------- إضافة صنف ---------- */
  function addItem(it, uIdx) {
    const us = units(it); uIdx = uIdx || 0;
    const u = us[uIdx] || us[0];
    const same = D.ln.find(l => l.i === it.id && l.u === uIdx && (!isBuy || !l.x));
    if (same && isSale) { same.q = +(same.q || 0) + 1; D.ln.splice(D.ln.indexOf(same), 1); D.ln.unshift(same); }
    else {
      const l = { i: it.id, n: it.n, u: uIdx, z: u.s, q: 1, s: D.s };
      if (P === 'p') l.p = +u.p || 0;
      else { l.c = Math.round(avgCost(store.L, store, it.id) * u.s * 100) / 100; l.f = 0; l.x = ''; }
      D.ln.unshift(l);
    }
    input.value = ''; sugg.classList.add('hide');
    change();
    setTimeout(() => { const first = $('.line input.q', lines); if (isBuy && first) first.select(); }, 30);
  }
  function lookup(code) {
    const f = findBarcode(store, code);
    if (f && f.it) { addItem(f.it, f.u); return true; }
    toast('الباركود ' + code + ' غير مسجّل', ctx.can('item-add') ? { bad: true, action: { label: 'إضافة صنف', fn: () => { persist(D); ctx.go('item-edit/' + encodeURIComponent('bc:' + code)); } } } : { bad: true });
    return false;
  }
  function showSugg() {
    const q = input.value.trim();
    sugg.textContent = '';
    if (!q) { sugg.classList.add('hide'); return; }
    const found = searchItems(store, q, 12), L = store.L;
    if (!found.length) { put(sugg, h('p', { class: 'empty', style: { padding: '12px' } }, /^\d{5,}$/.test(q) ? 'اضغط إدخال للبحث بالباركود' : 'لا يوجد صنف بهذا الاسم')); }
    for (const it of found) {
      const st = stockOf(store.L, it.id, D.s), u0 = units(it)[0];
      put(sugg, h('button', { type: 'button', on: { click: () => addItem(it, 0) } },
        h('span', null, h('b', { style: { fontWeight: 500 } }, it.n), h('small', null, [it.co, qtyText(it, st) + ' في ' + STORES[D.s]].filter(Boolean).join('، '))),
        h('span', { class: 'num', style: { fontWeight: 600 } }, fp(isSale ? u0.p : avgCost(L, store, it.id) * u0.s))));
    }
    sugg.classList.remove('hide');
  }
  input.addEventListener('input', showSugg);
  input.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim(); if (!q) return;
    if (/^[0-9A-Za-z\-]{5,}$/.test(q) && findBarcode(store, q)) { lookup(q); return; }
    const found = searchItems(store, q, 2);
    if (found.length === 1 || (found.length && !/^\d+$/.test(q))) addItem(found[0], 0);
    else if (/^\d{5,}$/.test(q)) lookup(q);
  });
  async function camera() {
    const code = await scanCode();
    if (code) lookup(code);
  }

  /* ---------- سطور الفاتورة ---------- */
  function drawLines() {
    lines.textContent = '';
    if (!D.ln.length) {
      put(lines, h('div', { class: 'empty' }, h('p', null, isSale ? 'امسح الباركود أو ابحث بالاسم لإضافة صنف.' : 'أضف أصناف فاتورة المورد بالمسح أو البحث.')));
      return;
    }
    const L = store.L;
    D.ln.forEach((l, k) => {
      const it = store.items.get(l.i) || { id: l.i, n: l.n, u: [{ n: 'وحدة', s: l.z, p: l.p }] };
      const us = units(it), price = +l[P] || 0;
      const amt = (+l.q || 0) * price;
      const have = stockOf(L, l.i, l.s);
      const unitSel = h('select', { 'aria-label': 'الوحدة', on: { change: e => { const nu = +e.target.value, u = us[nu]; l.u = nu; l.z = u.s; if (P === 'p') l.p = +u.p || 0; else l.c = Math.round(avgCost(L, store, l.i) * u.s * 100) / 100; change(); } } },
        us.map((u, j) => h('option', { value: j, selected: j === l.u }, u.n)));
      const qIn = h('input', { class: 'q num', inputmode: 'decimal', value: l.q, 'aria-label': 'الكمية', on: { change: e => { l.q = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } });
      const step = h('span', { class: 'step' },
        h('button', { type: 'button', 'aria-label': 'زيادة', on: { click: () => { l.q = (+l.q || 0) + 1; change(); } } }, icon('plus', 18)),
        qIn,
        h('button', { type: 'button', 'aria-label': 'إنقاص', on: { click: () => { l.q = Math.max(0, (+l.q || 0) - 1); if (!l.q) D.ln.splice(k, 1); change(); } } }, icon('minus', 18)));
      const priceIn = numField({ value: price, 'aria-label': isSale ? 'السعر' : 'التكلفة', on: { change: e => { l[P] = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } });
      const ctl = h('div', { class: 'ctl' }, step, h('span', { class: 'mini' }, unitSel), h('span', { class: 'mini' }, '×', priceIn));
      if (isBuy) {
        put(ctl, 
          h('span', { class: 'mini' }, 'بونص', numField({ value: l.f || '', placeholder: '0', style: { width: '64px' }, on: { change: e => { l.f = Math.max(0, num(e.target.value)); change(); } } })),
          h('span', { class: 'mini' }, 'صلاحية', h('input', { value: l.x || '', placeholder: '03/28', class: 'num', style: { width: '86px' }, inputmode: 'numeric', on: { change: e => { l.x = parseExp(e.target.value); if (e.target.value && !l.x) toast('اكتب الصلاحية شهر/سنة مثل 03/28', { bad: true }); change(); } } })));
        if (t === 'pur') {
          const cur = (us[l.u] || {}).p || 0;
          put(ctl, h('span', { class: 'mini' }, 'سعر البيع', numField({ value: l.np != null ? l.np : cur, style: { width: '86px' }, on: { change: e => { const v = num(e.target.value); l.np = v === cur ? undefined : v; change(); } } })));
        }
      }
      const info = h('div', { class: 'info' });
      if (isSale && t === 'sale') {
        const need = (+l.q || 0) * l.z;
        put(info, h('span', { class: need > have + 1e-9 ? 'red' : '' }, 'المتوفر ' + qtyText(it, have)));
        const x = nearestExp(L, l.i, l.s); if (x) put(info, expTag(x, D.d));
        const cost = avgCost(L, store, l.i) * l.z;
        if (ctx.can('profit') && cost && price < cost) put(info, h('span', { class: 'tag red' }, 'أقل من التكلفة ' + money(cost)));
      } else put(info, h('span', null, 'المتوفر ' + qtyText(it, have)));
      put(info, h('button', { type: 'button', class: 'linkish', style: { border: 0, background: 'none', color: 'var(--red)', padding: 0, fontSize: '12.5px' }, on: { click: () => { D.ln.splice(k, 1); change(); } } }, 'حذف'));
      put(lines, h('div', { class: 'line' },
        h('div', { class: 'top' }, h('span', { class: 'name' }, it.n || l.n), h('span', { class: 'amt num' }, money(amt))),
        ctl, info));
    });
  }

  /* ---------- الإجمالي والحفظ ---------- */
  function draft() {
    const v = { t, d: D.d, ca: D.ca, ln: D.ln.filter(l => (+l.q || 0) > 0 || (+l.f || 0) > 0).map(l => clean(l)), ds: Math.max(0, num(D.ds)), m: (D.m || '').trim() };
    const tt = totals(v);
    v.pd = D.pay === 'cash' ? tt.tot : Math.max(0, Math.min(num(D.pd), tt.tot));
    if (D.pt) v.pt = D.pt;
    if (D.inv) v.inv = String(D.inv).trim();
    return v;
  }
  function clean(l) {
    const o = { i: l.i, n: l.n, u: l.u, z: l.z, q: +l.q || 0, s: l.s || 1 };
    if (P === 'p') o.p = +l.p || 0; else { o.c = +l.c || 0; if (+l.f) o.f = +l.f; }
    if (l.x) o.x = l.x;
    return o;
  }
  function drawFoot() {
    const v = draft(), tt = totals(v);
    foot.textContent = '';
    const ds = numField({ value: D.ds, placeholder: '0', on: { change: e => { D.ds = e.target.value; change(); } } });
    const pd = numField({ value: D.pd, placeholder: '0', on: { change: e => { D.pd = e.target.value; change(); } } });
    const n = v.ln.length;
    put(foot, h('div', null,
      h('div', { class: 'tot' },
        h('span', null, h('small', null, n ? n + ' صنف' + (tt.ds ? '، بعد خصم ' + money(tt.ds) : '') : 'الإجمالي'), h('br'),
          D.pay === 'credit' ? h('small', null, 'آجل ' + money(Math.max(0, tt.tot - v.pd))) : null),
        h('span', { class: 'big num' }, money(tt.tot))),
      h('div', { class: D.pay === 'credit' ? 'row2' : '', style: { marginBottom: '8px' } },
        h('label', { class: 'mini', style: { width: '100%' } }, 'خصم', ds),
        D.pay === 'credit' ? h('label', { class: 'mini', style: { width: '100%' } }, 'المدفوع', pd) : null),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: !n, on: { click: save } }, icon('check', 20), M.saved.replace('حُفظت', 'حفظ').replace('حُفظ', 'حفظ')),
        n ? h('button', { class: 'btn ghost sm', style: { flex: '0 0 auto' }, on: { click: clearAll } }, 'تفريغ') : null)));
    ds.style.width = '100%'; pd.style.width = '100%';
  }
  async function clearAll() { if (await confirmBox('تفريغ الفاتورة', 'تُحذف كل السطور من هذه المسودة.', 'تفريغ', true)) { drafts[t] = D = fresh(t); change(); } }

  let saving = false;
  async function save() {
    if (saving) return;
    const v = draft();
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); if (/العميل|المورد/.test(err)) pickParty(); return; }
    if (t === 'sale') {
      const L = store.L, need = new Map();
      for (const l of v.ln) need.set(l.i + '|' + l.s, (need.get(l.i + '|' + l.s) || 0) + l.q * l.z);
      const short = [...need].filter(([k, q]) => { const [i, s] = k.split('|'); return q > stockOf(L, i, +s) + 1e-9; });
      if (short.length && !(await confirmBox('الكمية أكبر من المتوفر', short.length + ' صنف كميته في الفاتورة أكبر مما في ' + STORES[D.s] + ' حسب الدفتر. احفظ إن كان الصنف موجوداً فعلاً، ثم صحّح المخزون بالجرد.', 'حفظ على أي حال'))) return;
    }
    saving = true;
    try {
      const doc = await store.saveVoucher(v);
      if (t === 'pur') for (const l of D.ln) if (l.np != null && store.items.get(l.i)) {
        const it = store.items.get(l.i), us = units(it).map(u => Object.assign({}, u));
        if (us[l.u]) { const ratio = (+l.np || 0) / (+us[l.u].p || 1); us[l.u].p = +l.np; us.forEach((u, j) => { if (j !== l.u && us[l.u].p && u.p) u.p = Math.round(u.p * ratio); }); await store.put('items', it.id, Object.assign({}, it, { u: us })); }
      }
      drafts[t] = D = fresh(t); persist(D);
      toast(M.saved + ' ' + doc.no, { action: { label: 'طباعة', fn: () => printVoucher(store, doc) } });
      change();
      input.focus();
    } catch (e) { toast('تعذّر الحفظ: ' + (e.message || e), { bad: true }); }
    saving = false;
  }

  function change() { persist(D); drawHead(); drawLines(); drawFoot(); }

  if (isBuy) put(extra, h('div', { class: 'row2', style: { marginTop: '4px' } },
    t === 'pur' ? field('رقم فاتورة المورد', h('input', { value: D.inv, class: 'num', style: { textAlign: 'right' }, on: { change: e => { D.inv = e.target.value; persist(D); } } })) : h('span'),
    field('ملاحظة', h('input', { value: D.m, on: { change: e => { D.m = e.target.value; persist(D); } } }))));
  else put(extra, field('ملاحظة (اختياري)', h('input', { value: D.m, on: { change: e => { D.m = e.target.value; persist(D); } } })));

  drawHead(); drawLines(); drawFoot();
  const el = h('div', null, head,
    h('div', { class: 'scan' }, input, h('button', { class: 'iconbtn', 'aria-label': 'مسح بالكاميرا', on: { click: camera } }, icon('camera'))),
    sugg, lines, extra);
  return {
    title: M.title, sub: D.ln.length ? 'مسودة محفوظة' : '', el, foot,
    onShow: () => { if (!isBuy) setTimeout(() => input.focus(), 60); }
  };
}
