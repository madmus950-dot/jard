/* السندات: قبض، صرف، مصروف، تحويل نقدية، قيد يومية، تسوية مخزون، تحويل مخزني */
import { h, $, icon, toast, picker, numField, field, seg, confirmBox, put } from './ui.js';
import { money, num, today, parseExp, norm } from './util.js';
import { check, totals, partyBalance, CTRL, PARTY_TYPES, ADJ_REASONS, STORES } from './engine.js';
import { cashAccounts, partyRows, partyFilter, partyName, balWords, printVoucher, searchItems, findBarcode, units, stockOf, qtyText } from './common.js';
import { scanButton } from './scan.js';

const TITLES = { rcpt: 'سند قبض', pay: 'سند صرف', exp: 'مصروف', cxf: 'تحويل بين الصناديق', jv: 'قيد يومية', adj: 'تسوية مخزون', xfer: 'تحويل بين المخازن' };

export function vchView(ctx, kind, arg) {
  const { store } = ctx;
  const title = TITLES[kind];
  if (!ctx.can(kind)) return { title, el: h('div', { class: 'note bad' }, 'ليس لديك صلاحية لهذا السند.') };
  if (kind === 'jv') return jvView(ctx);
  if (kind === 'adj' || kind === 'xfer') return stockView(ctx, kind);
  const boxes = cashAccounts(store);
  const S = { pt: '', ac: '', a: '', ca: boxes[0] ? boxes[0].id : '1101', ca2: boxes[1] ? boxes[1].id : '', d: today(), m: '' };
  if (arg) { if (store.parties.has(arg)) S.pt = arg; else if (store.accounts.has(arg)) S.ac = arg; }
  const body = h('div'), foot = h('footer', { class: 'foot' });
  const t = kind === 'exp' ? 'pay' : kind;

  async function pickWho() {
    if (kind === 'exp') return pickAcc();
    const types = kind === 'rcpt' ? ['c', 'e', 'o', 's'] : ['s', 'e', 'o', 'c'];
    const rows = partyRows(store, types, ctx.can('sup') ? null : ['s', 'e', 'o']);
    const accRows = [...store.accounts.values()].filter(a => kind === 'rcpt' ? (a.k === 'eq' || (a.k === 'rev' && a.id >= '4400') || a.k === 'liab') : (a.k === 'exp' || a.k === 'eq' || a.k === 'asset' || a.k === 'liab'))
      .map(a => ({ value: { acc: a.id }, label: a.n, sub: 'حساب ' + a.id }));
    const all = rows.concat(accRows);
    const r = await picker(kind === 'rcpt' ? 'قبض من' : 'صرف إلى', all, { filter: q => { const n = norm(q); return n ? all.filter(x => norm(x.label).includes(n)) : all; }, add: ctx.can('party-add') ? 'إضافة اسم جديد' : '' });
    if (!r) return;
    if (r.add) { const id = await store.put('parties', null, { n: r.add, t: kind === 'rcpt' ? 'c' : 's', ph: '', act: true, at: Date.now() }); S.pt = id; S.ac = ''; }
    else if (r.acc) { S.ac = r.acc; S.pt = ''; }
    else { S.pt = r.id; S.ac = ''; }
    draw();
  }
  async function pickAcc() {
    const rows = [...store.accounts.values()].filter(a => a.k === 'exp' && a.act !== false).map(a => ({ value: a.id, label: a.n, sub: a.id }));
    const r = await picker('نوع المصروف', rows, { filter: q => { const n = norm(q); return n ? rows.filter(x => norm(x.label).includes(n)) : rows; } });
    if (r) { S.ac = r; S.pt = ''; draw(); }
  }

  function draw() {
    body.textContent = '';
    const amount = numField({ value: S.a, placeholder: '0', style: { fontSize: '26px', fontWeight: 600, minHeight: '60px' }, on: { input: e => { S.a = e.target.value; drawFoot(); } } });
    const who = S.pt ? partyName(store, S.pt) : S.ac ? (store.accounts.get(S.ac) || {}).n : '';
    if (kind === 'cxf') {
      put(body, 
        field('من الصندوق', boxSel('ca')), field('إلى الصندوق', boxSel('ca2')),
        field('المبلغ', amount));
    } else {
      const quickExp = kind === 'exp' ? h('div', { class: 'chips', style: { flexWrap: 'wrap' } },
        [...store.accounts.values()].filter(a => a.k === 'exp' && !['5100', '5200', '5300'].includes(a.id) && a.act !== false).map(a =>
          h('button', { class: 'chip' + (S.ac === a.id ? ' set' : ''), on: { click: () => { S.ac = a.id; draw(); } } }, a.n))) : null;
      put(body, 
        kind === 'exp' ? h('div', null, h('span', { class: 'flabel' }, 'نوع المصروف'), quickExp) :
          field(kind === 'rcpt' ? 'قبض من' : 'صرف إلى', h('button', { class: 'chip' + (who ? ' set' : ''), style: { width: '100%', minHeight: '48px', justifyContent: 'flex-start' }, on: { click: pickWho } }, icon('user', 18), h('b', null, who || 'اختر الاسم أو الحساب'))),
        S.pt && (ctx.can('sup') || (store.parties.get(S.pt) || {}).t === 'c') ? balInfo() : null,
        field('المبلغ', amount),
        boxes.length > 1 ? field('الصندوق', boxSel('ca')) : null);
    }
    put(body, h('div', { class: 'row2' },
      field('التاريخ', h('input', { type: 'date', value: S.d, on: { change: e => { S.d = e.target.value || today(); } } })),
      field('البيان', h('input', { value: S.m, placeholder: kind === 'rcpt' ? 'دفعة من الحساب' : 'مثلاً: إيجار نوفمبر', on: { input: e => { S.m = e.target.value; } } }))));
    drawFoot();
  }
  function boxSel(k) {
    return h('select', { on: { change: e => { S[k] = e.target.value; } } }, boxes.map(b => h('option', { value: b.id, selected: S[k] === b.id }, b.n)));
  }
  function balInfo() {
    const p = store.parties.get(S.pt), b = partyBalance(store.L, S.pt), a = num(S.a);
    const after = kind === 'rcpt' ? b - a : b + a;
    const w = balWords(b, p.t), wa = balWords(after, p.t);
    return h('div', { class: 'note good', style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } },
      h('span', null, 'الرصيد الآن: ', h('b', { class: 'num' }, money(w.amt)), ' ' + w.txt),
      a ? h('span', null, 'بعد السند: ', h('b', { class: 'num' }, money(wa.amt)), ' ' + wa.txt) : null);
  }
  function voucher() {
    const v = { t, d: S.d, a: num(S.a), ca: S.ca, m: S.m.trim() };
    if (kind === 'cxf') v.ca2 = S.ca2;
    if (S.pt) v.pt = S.pt; else if (S.ac) v.ac = S.ac;
    return v;
  }
  function drawFoot() {
    foot.textContent = '';
    put(foot, h('div', null, h('div', { class: 'actions' }, h('button', { class: 'btn', on: { click: save } }, icon('check', 20), 'حفظ ' + title))));
    const bi = $('.note.good', body); if (bi && S.pt && (ctx.can('sup') || (store.parties.get(S.pt) || {}).t === 'c')) bi.replaceWith(balInfo());
  }
  let saving = false;
  async function save() {
    if (saving) return;
    const v = voucher();
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); return; }
    saving = true;
    try {
      const doc = await store.saveVoucher(v);
      toast('حُفظ ' + title + ' ' + doc.no, { action: { label: 'طباعة', fn: () => printVoucher(store, doc) } });
      const keepPt = S.pt;
      S.a = ''; S.m = '';
      if (kind !== 'rcpt') S.pt = keepPt;
      draw();
    } catch (e) { toast('تعذّر الحفظ: ' + (e.message || e), { bad: true }); }
    saving = false;
  }
  draw();
  return { title, el: body, foot, onShow: () => setTimeout(() => { const i = $('input.num', body); if (i && (S.pt || S.ac || kind === 'cxf')) i.focus(); }, 80) };
}

/* ---------- قيد يومية ---------- */
function jvView(ctx) {
  const { store } = ctx;
  const S = { d: today(), m: '', je: [{ a: '', pt: '', dr: '', cr: '' }, { a: '', pt: '', dr: '', cr: '' }] };
  const body = h('div'), foot = h('footer', { class: 'foot' });
  const accRows = () => [...store.accounts.values()].map(a => ({ value: a.id, label: a.n, sub: a.id }));
  function draw() {
    body.textContent = '';
    const page = h('section', { class: 'page tight' });
    S.je.forEach((e, k) => {
      const acc = store.accounts.get(e.a), needsP = acc && ['ar', 'ap', 'emp', 'oth'].includes(acc.k);
      put(page, h('div', { class: 'line' },
        h('div', { class: 'row2' },
          h('button', { class: 'chip' + (acc ? ' set' : ''), on: { click: async () => { const r = await picker('الحساب', accRows(), { filter: q => accRows().filter(x => norm(x.label + x.sub).includes(norm(q))) }); if (r) { e.a = r; e.pt = ''; draw(); } } } }, h('b', null, acc ? acc.n : 'الحساب')),
          needsP ? h('button', { class: 'chip' + (e.pt ? ' set' : ''), on: { click: async () => { const rows = partyRows(store); const r = await picker('الطرف', rows, { filter: partyFilter(rows) }); if (r) { e.pt = r.id; draw(); } } } }, h('b', null, e.pt ? partyName(store, e.pt) : 'اسم الطرف')) : h('span')),
        h('div', { class: 'row2', style: { marginTop: '8px' } },
          h('label', { class: 'mini', style: { width: '100%' } }, 'مدين', numField({ value: e.dr, style: { width: '100%' }, on: { input: x => { e.dr = x.target.value; if (num(e.dr)) e.cr = ''; drawFoot(); }, change: draw } })),
          h('label', { class: 'mini', style: { width: '100%' } }, 'دائن', numField({ value: e.cr, style: { width: '100%' }, on: { input: x => { e.cr = x.target.value; if (num(e.cr)) e.dr = ''; drawFoot(); }, change: draw } }))),
        S.je.length > 2 ? h('div', { class: 'info' }, h('button', { style: { border: 0, background: 'none', color: 'var(--red)', padding: 0 }, on: { click: () => { S.je.splice(k, 1); draw(); } } }, 'حذف السطر')) : null));
    });
    put(body, page,
      h('button', { class: 'btn ghost wide', on: { click: () => { S.je.push({ a: '', pt: '', dr: '', cr: '' }); draw(); } } }, icon('plus', 18), 'سطر آخر'),
      h('div', { class: 'row2', style: { marginTop: '12px' } },
        field('التاريخ', h('input', { type: 'date', value: S.d, on: { change: e => { S.d = e.target.value || today(); } } })),
        field('البيان', h('input', { value: S.m, on: { input: e => { S.m = e.target.value; } } }))));
    drawFoot();
  }
  function drawFoot() {
    const dr = S.je.reduce((s, e) => s + num(e.dr), 0), cr = S.je.reduce((s, e) => s + num(e.cr), 0), ok = dr > 0 && Math.abs(dr - cr) < 0.005;
    foot.textContent = '';
    put(foot, h('div', null,
      h('div', { class: 'tot' }, h('span', null, 'مدين ', h('b', { class: 'num' }, money(dr)), '  دائن ', h('b', { class: 'num' }, money(cr))), h('span', { class: ok ? 'green' : 'red' }, ok ? 'متوازن' : 'الفرق ' + money(Math.abs(dr - cr)))),
      h('div', { class: 'actions' }, h('button', { class: 'btn', disabled: !ok, on: { click: save } }, icon('check', 20), 'حفظ القيد'))));
  }
  async function save() {
    const v = { t: 'jv', d: S.d, m: S.m.trim(), je: S.je.filter(e => e.a && (num(e.dr) || num(e.cr))).map(e => Object.assign({ a: e.a, dr: num(e.dr), cr: num(e.cr) }, e.pt ? { pt: e.pt } : {})) };
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); return; }
    const doc = await store.saveVoucher(v);
    toast('حُفظ القيد ' + doc.no);
    S.je = [{ a: '', pt: '', dr: '', cr: '' }, { a: '', pt: '', dr: '', cr: '' }]; S.m = ''; draw();
  }
  draw();
  return { title: TITLES.jv, el: body, foot };
}

/* ---------- تسوية مخزون / تحويل مخزني ---------- */
function stockView(ctx, kind) {
  const { store } = ctx;
  const S = { d: today(), m: '', r: 'count', s: 1, s2: 2, ln: [] };
  const body = h('div'), foot = h('footer', { class: 'foot' });
  const input = h('input', { type: 'search', placeholder: 'امسح أو ابحث عن الصنف', autocomplete: 'off' });
  const sugg = h('div', { class: 'sugg hide' });
  const lines = h('section', { class: 'page tight' });
  function add(it, u) {
    const uu = units(it)[u || 0];
    S.ln.unshift({ i: it.id, n: it.n, u: u || 0, z: uu.s, q: kind === 'adj' ? -1 : 1, s: S.s, x: '' });
    input.value = ''; sugg.classList.add('hide'); drawLines(); drawFoot();
  }
  input.addEventListener('input', () => {
    sugg.textContent = ''; const q = input.value.trim(); if (!q) { sugg.classList.add('hide'); return; }
    for (const it of searchItems(store, q, 10)) put(sugg, h('button', { on: { click: () => add(it, 0) } }, h('span', null, it.n, h('small', null, qtyText(it, stockOf(store.L, it.id, S.s)) + ' في ' + STORES[S.s]))));
    sugg.classList.remove('hide');
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = findBarcode(store, input.value.trim()); if (f) add(f.it, f.u); else { const r = searchItems(store, input.value, 1); if (r[0]) add(r[0], 0); } } });
  function drawLines() {
    lines.textContent = '';
    if (!S.ln.length) { put(lines, h('p', { class: 'empty' }, kind === 'adj' ? 'أضف الأصناف التي تريد تصحيح كمياتها. اكتب الكمية بالسالب للنقص وبالموجب للزيادة.' : 'أضف الأصناف المنقولة من مخزن إلى آخر.')); return; }
    S.ln.forEach((l, k) => {
      const it = store.items.get(l.i) || {}, us = units(it);
      put(lines, h('div', { class: 'line' },
        h('div', { class: 'top' }, h('span', { class: 'name' }, l.n), h('span', { class: 'muted', style: { fontSize: '13px' } }, 'المتوفر ' + qtyText(it, stockOf(store.L, l.i, S.s)))),
        h('div', { class: 'ctl' },
          h('span', { class: 'mini' }, kind === 'adj' ? 'الفرق' : 'الكمية', numField({ value: l.q, style: { width: '86px' }, on: { change: e => { l.q = num(e.target.value); if (kind === 'xfer') l.q = Math.abs(l.q); } } })),
          h('span', { class: 'mini' }, h('select', { on: { change: e => { l.u = +e.target.value; l.z = us[l.u].s; } } }, us.map((u, j) => h('option', { value: j, selected: j === l.u }, u.n)))),
          h('span', { class: 'mini' }, 'صلاحية', h('input', { value: l.x, class: 'num', placeholder: 'اختياري', style: { width: '90px' }, on: { change: e => { l.x = parseExp(e.target.value); } } })),
          h('button', { style: { border: 0, background: 'none', color: 'var(--red)' }, on: { click: () => { S.ln.splice(k, 1); drawLines(); drawFoot(); } } }, 'حذف'))));
    });
  }
  function drawFoot() {
    foot.textContent = '';
    put(foot, h('div', null, h('div', { class: 'actions' }, h('button', { class: 'btn', disabled: !S.ln.length, on: { click: save } }, icon('check', 20), 'حفظ ' + TITLES[kind]))));
  }
  async function save() {
    const v = { t: kind, d: S.d, m: S.m.trim(), ln: S.ln.filter(l => l.q).map(l => { const o = { i: l.i, n: l.n, u: l.u, z: l.z, q: l.q, s: kind === 'xfer' ? S.s : S.s }; if (kind === 'xfer') o.s2 = S.s2; if (l.x) o.x = l.x; return o; }) };
    if (kind === 'adj') v.r = S.r;
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); return; }
    const doc = await store.saveVoucher(v);
    toast('حُفظ ' + TITLES[kind] + ' ' + doc.no);
    S.ln = []; S.m = ''; drawLines(); drawFoot();
  }
  const toLbl = h('div', { class: 'chip set', style: { minHeight: '48px', width: '100%' } }, STORES[S.s2]);
  put(body, 
    kind === 'adj'
      ? field('السبب', seg(Object.entries(ADJ_REASONS).filter(([k]) => k !== 'found'), S.r, v => { S.r = v; }))
      : h('div', { class: 'row2' }, field('من', seg([[1, STORES[1]], [2, STORES[2]]], S.s, v => { S.s = v; S.s2 = v === 1 ? 2 : 1; toLbl.textContent = STORES[S.s2]; drawLines(); })), h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'إلى'), toLbl)),
    kind === 'adj' ? field('المخزن', seg([[1, STORES[1]], [2, STORES[2]]], S.s, v => { S.s = v; S.ln.forEach(l => { l.s = v; }); drawLines(); })) : null,
    h('div', { class: 'scan' }, input, scanButton(c => { const f = findBarcode(store, c); if (f) add(f.it, f.u); else toast('الباركود غير مسجّل', { bad: true }); }, input)),
    sugg, lines,
    h('div', { class: 'row2' },
      field('التاريخ', h('input', { type: 'date', value: S.d, on: { change: e => { S.d = e.target.value || today(); } } })),
      field('البيان', h('input', { value: S.m, on: { input: e => { S.m = e.target.value; } } }))));
  drawLines(); drawFoot();
  return { title: TITLES[kind], el: body, foot, scanInput: input };
}
