/* الأصناف: البحث، بطاقة الصنف (المخزون، الصلاحيات، التكلفة، الحركة)، والتعديل */
import { h, icon, toast, field, numField, confirmBox, put, isLatin } from './ui.js';
import { money, price, qty, norm, dmy, today, addDays, monthsLeft, expKey, num, r2 } from './util.js';
import { STORES, TYPES } from './engine.js';
import { units, stockOf, qtyText, expTag, avgCost, partyName, typeName, searchItems, nearestExp, findCode, linkBarcode } from './common.js';
import { scanButton } from './scan.js';
import { openExport } from './export.js';

const F = { q: '', f: 'all' };
const FILTERS = [['all', 'الكل'], ['have', 'متوفر'], ['out', 'نفد'], ['exp', 'قريب الانتهاء'], ['still', 'راكد']];

export function itemsView(ctx) {
  const { store } = ctx, L = store.L, d = today(), d90 = addDays(d, -90);
  const list = h('section', { class: 'page tight' });
  const q = h('input', { type: 'search', value: F.q, placeholder: 'ابحث بالاسم أو الشركة أو الباركود', on: { input: e => { F.q = e.target.value; draw(); },
    keydown: e => { if (e.key !== 'Enter') return; const f = findCode(store, q.value); if (f) { e.preventDefault(); F.q = ''; ctx.go('item/' + encodeURIComponent(f.it.id)); } } } });
  const all = [...store.items.values()].filter(it => it.act !== false);
  function match(it) {
    const s = L.itm.get(it.id), Q = s ? s.Q : 0;
    if (F.f === 'have' && !(Q > 1e-9)) return false;
    if (F.f === 'out' && (Q > 1e-9 || !(s && s.lastSale))) return false;
    if (F.f === 'still' && !(Q > 1e-9 && (!s.lastSale || s.lastSale < d90))) return false;
    if (F.f === 'exp') { if (!s) return false; let near = false; for (const st of [1, 2]) for (const [x, qq] of s.bt[st] || []) if (qq > 1e-9 && x && monthsLeft(x, d) <= 3) near = true; if (!near) return false; }
    return true;
  }
  function draw() {
    list.textContent = '';
    const n = norm(F.q), digits = /^\d{4,}$/.test(F.q.trim());
    let r;
    if (!n) r = all.filter(match).sort((a, b) => a.n.localeCompare(b.n, 'ar'));
    else if (digits) r = all.filter(it => (it.bc || []).concat(...(it.u || []).map(u => [u.b, ...(u.bx || [])])).some(b => b && b.includes(F.q.trim())) && match(it));
    else r = searchItems(store, F.q, 400).filter(match);
    if (!r.length) { put(list, h('p', { class: 'empty' }, all.length ? 'لا أصناف بهذا البحث.' : 'لا أصناف بعد. استوردها من الإعدادات أو أضف صنفاً.')); return; }
    for (const it of r.slice(0, 200)) {
      const s = L.itm.get(it.id), Q = s ? s.Q : 0, u0 = units(it)[0];
      put(list, h('a', { class: 'ln link', href: '#/item/' + encodeURIComponent(it.id) },
        h('span', { class: 'k' }, h('b', null, it.n), h('small', null, [it.co, price(u0.p) + ' لل' + u0.n].filter(Boolean).join('، '))),
        h('span', { class: 'v', style: { fontSize: '15px', textAlign: 'left' } }, h('span', { class: Q > 1e-9 ? '' : 'red' }, qtyText(it, Q)))));
    }
    if (r.length > 200) put(list, h('p', { class: 'empty' }, r.length + ' صنفاً. ابحث لتضييق القائمة.'));
  }
  draw();
  return {
    title: 'الأصناف', sub: all.length + ' صنف', live: true, scanInput: q,
    actions: [
      h('button', { class: 'iconbtn', 'aria-label': 'تصدير قاعدة الأصناف', on: { click: () => exportItems(ctx, all.filter(match)) } }, icon('print')),
      scanButton(async c => { const f = findCode(store, c); if (f) { ctx.go('item/' + encodeURIComponent(f.it.id)); return; } const L = await linkBarcode(ctx, c); if (L) ctx.go('item/' + encodeURIComponent(L.it.id)); }, q),
      ctx.can('item-add') ? h('a', { class: 'iconbtn', href: '#/item-edit/', 'aria-label': 'صنف جديد' }, icon('plus')) : null],
    el: h('div', null, q,
      h('div', { class: 'chips', style: { marginTop: '10px' } }, FILTERS.map(([k, l]) => h('button', { class: 'chip' + (F.f === k ? ' set' : ''), on: { click: () => { F.f = k; ctx.redraw(); } } }, l))),
      list)
  };
}

export function itemView(ctx, id) {
  const { store } = ctx, it = store.items.get(id), L = store.L;
  if (!it) return { title: 'الصنف', el: h('div', { class: 'note bad' }, 'الصنف غير موجود.') };
  const s = L.itm.get(id) || { Q: 0, V: 0, st: { 1: 0, 2: 0 }, bt: { 1: new Map(), 2: new Map() } };
  const us = units(it), ac = avgCost(L, store, id), d = today();
  const mv = (L.mv.get(id) || []).slice().reverse();
  const sold = days => -mv.filter(m => (m.k === 'sale' || m.k === 'sret') && m.d >= addDays(d, -days)).reduce((t, m) => t + m.q, 0);
  const lastPur = mv.find(m => m.k === 'pur');
  const batches = [];
  for (const st of [1, 2]) for (const [x, q] of s.bt[st] || []) if (Math.abs(q) > 1e-9) batches.push({ st, x, q });
  batches.sort((a, b) => expKey(a.x) - expKey(b.x));
  const row = (k, v, cls) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, k)), h('span', { class: 'v ' + (cls || ''), style: { fontSize: '16px' } }, v));
  const s90 = sold(90);
  return {
    title: it.n, sub: it.co || '',
    actions: ctx.can('item-edit') ? [h('a', { class: 'iconbtn', href: '#/item-edit/' + encodeURIComponent(id), 'aria-label': 'تعديل' }, icon('edit'))] : [],
    el: h('div', { class: 'twocol' }, h('div', null,
      h('section', { class: 'page' },
        h('div', { class: 'ph' }, h('h2', { class: isLatin(it.n) ? 'lat' : '' }, it.n), h('div', { class: 'meta' }, [it.co, (it.bc || []).slice(0, 2).join('، ')].filter(Boolean).join('، '))),
        row('المخزون', qtyText(it, s.Q), s.Q > 1e-9 ? '' : 'red'),
        row(STORES[1], qtyText(it, s.st[1] || 0)),
        row(STORES[2], qtyText(it, s.st[2] || 0)),
        ...us.map(u => row('سعر ال' + u.n, h('span', { class: 'num' }, price(u.p)))),
        ctx.can('profit') ? row('متوسط التكلفة لل' + us[0].n, h('span', { class: 'num' }, price(ac * us[0].s))) : null,
        ctx.can('profit') && us[0].p ? row('هامش الربح', h('span', { class: 'num' }, us[0].p ? Math.round((1 - ac * us[0].s / us[0].p) * 100) + '%' : '')) : null,
        ctx.can('profit') ? row('قيمة المخزون بالتكلفة', h('span', { class: 'num' }, money(s.V))) : null,
        row('مبيعات آخر 30 يوماً', qtyText(it, sold(30))),
        row('مبيعات آخر 90 يوماً', qtyText(it, s90)),
        s90 > 0 && s.Q > 0 ? row('يكفي تقريباً', Math.round(s.Q / (s90 / 3) * 10) / 10 + ' شهر') : null,
        lastPur ? row('آخر شراء', dmy(lastPur.d) + (lastPur.pt ? '، ' + partyName(store, lastPur.pt) : '')) : null)),
      h('div', null,
      batches.length ? h('h3', { class: 'sect' }, 'الصلاحيات في المخزون') : null,
      batches.length ? h('section', { class: 'page tight' }, batches.map(b => h('div', { class: 'ln' },
        h('span', { class: 'k' }, h('b', null, b.x || 'بلا تاريخ'), h('small', null, STORES[b.st])),
        h('span', { class: 'v', style: { fontSize: '15px' } }, qtyText(it, b.q), ' ', b.x ? expTag(b.x, d) : null)))) : null,
      h('h3', { class: 'sect' }, 'حركة الصنف'),
      h('section', { class: 'page tight' }, mv.length ? mv.slice(0, 60).map(m => h('a', { class: 'ln link', href: '#/vch/' + encodeURIComponent(m.v.id) },
        h('span', { class: 'k' }, h('b', null, typeName(m.v.t) + ' ' + (m.v.no || '')), h('small', null, [dmy(m.d), STORES[m.s], m.pt ? partyName(store, m.pt) : '', m.x].filter(Boolean).join('، '))),
        h('span', { class: 'v ' + (m.q < 0 ? 'red' : 'green'), style: { fontSize: '15px' } }, (m.q > 0 ? '+' : '−') + qtyText(it, Math.abs(m.q))))) : h('p', { class: 'empty' }, 'لا حركة لهذا الصنف بعد.'))))
  };
}

export function itemEdit(ctx, id) {
  const { store } = ctx;
  let preBc = '';
  if (id && id.startsWith('bc:')) { preBc = id.slice(3); id = ''; }
  const cur = id ? store.items.get(id) : null;
  if (cur && !ctx.can('item-edit')) return { title: 'تعديل صنف', el: h('div', { class: 'note bad' }, 'التعديل للمشرف فقط.') };
  if (!cur && !ctx.can('item-add')) return { title: 'صنف جديد', el: h('div', { class: 'note bad' }, 'ليس لديك صلاحية.') };
  const S = cur ? JSON.parse(JSON.stringify(cur)) : { n: '', co: '', bc: preBc ? [preBc] : [], u: [{ n: 'علبة', s: 1, p: 0 }], c0: 0, min: 0, act: true };
  if (!S.u || !S.u.length) S.u = [{ n: 'علبة', s: 1, p: 0 }];
  const body = h('div'), foot = h('footer', { class: 'foot' });
  const unitsBox = h('section', { class: 'page tight' });
  function drawUnits() {
    unitsBox.textContent = '';
    S.u.forEach((u, k) => put(unitsBox, h('div', { class: 'line' },
      h('div', { class: 'row3' },
        h('label', { class: 'mini', style: { display: 'block' } }, 'الوحدة', h('input', { value: u.n, style: { width: '100%' }, on: { input: e => { u.n = e.target.value; } } })),
        h('label', { class: 'mini', style: { display: 'block' } }, k ? 'جزء من الأولى' : 'الحجم', numField({ value: k ? r2(u.s) : 1, disabled: !k, style: { width: '100%' }, on: { change: e => { const v = num(e.target.value); u.s = v > 1 ? 1 / v : v; e.target.value = r2(u.s); } } })),
        h('label', { class: 'mini', style: { display: 'block' } }, 'سعر البيع', numField({ value: u.p, style: { width: '100%' }, on: { input: e => { u.p = num(e.target.value); } } }))),
      h('div', { class: 'ctl' }, h('label', { class: 'mini', style: { flex: 1 } }, 'باركود الوحدة', h('input', { value: u.b || '', class: 'num', style: { width: '100%' }, on: { input: e => { u.b = e.target.value.trim(); } } })),
        k ? h('button', { style: { border: 0, background: 'none', color: 'var(--red)' }, on: { click: () => { S.u.splice(k, 1); drawUnits(); } } }, 'حذف') : null))));
    put(unitsBox, h('p', { class: 'muted', style: { fontSize: '12.5px', margin: '8px 0' } }, 'الوحدة الأولى هي الأساس (العلبة غالباً). الشريط نصف علبة يُكتب 0.5 أو 2، والحبة من 20 حبة تُكتب 20.'));
  }
  put(body, 
    field('اسم الصنف', h('input', { value: S.n, on: { input: e => { S.n = e.target.value; } } })),
    field('الشركة', h('input', { value: S.co || '', on: { input: e => { S.co = e.target.value; } } })),
    field('الباركود', h('textarea', { rows: 2, class: 'num', style: { textAlign: 'left' }, on: { input: e => { S.bc = e.target.value.split(/[\s,،]+/).filter(Boolean); } } }, (S.bc || []).join('\n')), 'باركود واحد في كل سطر.'),
    h('h3', { class: 'sect' }, 'الوحدات والأسعار'), unitsBox,
    h('button', { class: 'btn ghost wide', on: { click: () => { S.u.push({ n: 'شريط', s: 0.5, p: 0 }); drawUnits(); } } }, icon('plus', 18), 'إضافة وحدة أصغر'),
    h('div', { class: 'row2', style: { marginTop: '12px' } },
      field('حد الطلب', numField({ value: S.min || '', placeholder: '0', on: { input: e => { S.min = num(e.target.value); } } }), 'تنبيه عند نزول المخزون عنه.'),
      field('التكلفة التقديرية', numField({ value: S.c0 || '', on: { input: e => { S.c0 = num(e.target.value); } } }), 'تُستعمل قبل أول شراء.')),
    cur ? h('label', { class: 'field', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: S.act !== false, style: { width: '22px', minHeight: '22px' }, on: { change: e => { S.act = e.target.checked; } } }), 'الصنف نشط') : null);
  drawUnits();
  put(foot, h('div', null, h('div', { class: 'actions' }, h('button', { class: 'btn', on: { click: async () => {
    if (!S.n.trim()) { toast('اكتب اسم الصنف', { bad: true }); return; }
    const taken = (S.bc || []).find(b => [...store.items.values()].some(x => x.id !== id && (x.bc || []).includes(b)));
    if (taken && !(await confirmBox('باركود مستخدم', 'الباركود ' + taken + ' مسجّل لصنف آخر. احفظ على أي حال؟', 'حفظ'))) return;
    S.u.forEach(u => { u.s = +u.s || 1; u.p = +u.p || 0; if (!u.b) delete u.b; });
    S.u[0].s = 1;
    const doc = Object.assign({}, S, { n: S.n.trim(), co: (S.co || '').trim(), at: S.at || Date.now() });
    const nid = await store.put('items', id || null, doc);
    toast('حُفظ الصنف');
    if (preBc) history.back(); else ctx.go('item/' + encodeURIComponent(nid), true);
  } } }, icon('check', 20), 'حفظ الصنف'))));
  return { title: cur ? 'تعديل صنف' : 'صنف جديد', el: body, foot };
}

/** قاعدة الأصناف: الأسعار والمخزون والصلاحيات، بنفس طريقة تنزيل تطبيق الجرد */
function exportItems(ctx, list) {
  const { store } = ctx, L = store.L, prof = ctx.can('profit');
  const rows = list.slice().sort((a, b) => a.n.localeCompare(b.n, 'ar')).map(it => {
    const s = L.itm.get(it.id) || { Q: 0, V: 0, st: {} }, us = units(it), u0 = us[0] || {}, u1 = us[1] || {};
    const sz = u0.s || 1;
    return { code: it.id, bc: (it.bc || []).join(' '), name: it.n, co: it.co || '', unit: u0.n || '', price: u0.p || 0, unit2: u1.n || '', price2: u1.p || '',
      s1: (s.st[1] || 0) / sz, s2: (s.st[2] || 0) / sz, q: (s.Q || 0) / sz, cost: prof ? avgCost(L, store, it.id) * sz : '', value: prof ? s.V || 0 : '',
      x: nearestExp(L, it.id, 1) || nearestExp(L, it.id, 2), last: s.lastSale || '' };
  });
  const cols = [
    { k: 'code', t: 'رقم الصنف', f: '' }, { k: 'bc', t: 'الباركود', f: '' }, { k: 'name', t: 'اسم الصنف', f: '' }, { k: 'co', t: 'الشركة', f: '' },
    { k: 'unit', t: 'الوحدة', f: '' }, { k: 'price', t: 'سعر البيع', f: 'n' }, { k: 'unit2', t: 'الوحدة الصغرى', f: '', on: false }, { k: 'price2', t: 'سعرها', f: 'n', on: false },
    { k: 's1', t: 'الصيدلية', f: 'q' }, { k: 's2', t: 'المخزن', f: 'q' }, { k: 'q', t: 'الإجمالي', f: 'q', on: false },
    ...(prof ? [{ k: 'cost', t: 'متوسط التكلفة', f: 'n', on: false }, { k: 'value', t: 'قيمة المخزون', f: 'n', on: false }] : []),
    { k: 'x', t: 'أقرب صلاحية', f: 'x' }, { k: 'last', t: 'آخر بيع', f: 'd', on: false }
  ];
  openExport({ id: 'items', title: 'قاعدة الأصناف', file: 'قاعدة_الأصناف', sheet: 'الأصناف', settings: store.settings, head: [list.length + ' صنف'], cols, rows,
    totals: prof ? [['قيمة المخزون بالتكلفة', rows.reduce((t, r) => t + (+r.value || 0), 0)]] : [],
    presets: [
      { label: 'قاعدة الأصناف', cols: [['code'], ['bc'], ['name'], ['co'], ['unit']] },
      { label: 'قائمة الأسعار', cols: [['code'], ['name'], ['unit'], ['price'], ['unit2'], ['price2']] },
      { label: 'المخزون والصلاحية', cols: [['code'], ['name'], ['unit'], ['s1'], ['s2'], ['q'], ['x']] },
      ...(prof ? [{ label: 'قيمة المخزون', cols: [['code'], ['name'], ['q'], ['cost'], ['value']] }] : []),
      { label: 'English (ID, Name, Qty)', cols: [['code', 'ID'], ['bc', 'Barcode'], ['name', 'Name'], ['unit', 'Unit'], ['q', 'Qty'], ['x', 'Expiry']] }
    ] });
}
