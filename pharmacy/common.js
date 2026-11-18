/* أدوات مشتركة بين الصفحات */
import { h, icon, toast, picker } from './ui.js';
import { money, price, qty, norm, phon, phonV, dmy, today, expKey, monthsLeft, monthStart, yearStart, addDays } from './util.js';
import { TYPES, totals, STORES, PARTY_TYPES, partyBalance } from './engine.js';
import { printHtml } from './out.js';
import { openExport } from './export.js';

export { money, price, qty };
export const typeName = t => TYPES[t] || t;

/** رصيد طرف بلغة الدفتر: عليه (يدين لنا) / له (ندين له) */
export function balWords(b, t) {
  if (Math.abs(b) < 0.005) return { txt: 'مسدَّد', cls: 'muted', amt: 0 };
  return b > 0 ? { txt: 'عليه', cls: t === 's' ? 'amber' : '', amt: b } : { txt: 'له', cls: t === 'c' ? 'green' : '', amt: -b };
}
export function balEl(b, t, big) {
  const w = balWords(b, t);
  return h('span', { class: 'v ' + w.cls }, w.amt ? h('span', { class: 'num' }, money(w.amt)) : null, ' ', h('small', { style: { fontWeight: 500, fontSize: big ? '15px' : '12.5px' } }, w.txt));
}

/* ---------- الأصناف: فهرس البحث والباركود ---------- */
let IX = null, IXv = -1;
export function itemIndex(store) {
  if (IX && IXv === store.ver) return IX;
  const list = [], byBc = new Map();
  for (const it of store.items.values()) {
    if (it.act === false) continue;
    list.push({ it, k: norm(it.n + ' ' + (it.co || '')), ph: phon(it.n).replace(/ /g, ''), pv: phonV(it.n) });
    for (const b of it.bc || []) if (b && !byBc.has(b)) byBc.set(b, { id: it.id, u: unitByBarcode(it, b) });
    (it.u || []).forEach((u, k) => { if (u.b) byBc.set(u.b, { id: it.id, u: k }); for (const b of u.bx || []) if (b) byBc.set(b, { id: it.id, u: k }); });
  }
  list.sort((a, b) => a.it.n.localeCompare(b.it.n, 'ar'));
  IX = { list, byBc }; IXv = store.ver;
  return IX;
}
function unitByBarcode(it, b) { const k = (it.u || []).findIndex(u => u.b === b); return k >= 0 ? k : 0; }
export function findBarcode(store, code) {
  const k = String(code).trim(), x = itemIndex(store).byBc.get(k);
  if (x) return { it: store.items.get(x.id), u: x.u };
  // ملصق مطبوع من تطبيق الجرد للأصناف بلا باركود: الباركود فيه هو رقم الصنف نفسه (مثل 05-5833)
  const it = k && !/^\d{8,}$/.test(k) ? store.items.get(k) : null;
  return it && it.act !== false ? { it, u: 0 } : null;
}

/**
 * يقرأ أي رمز: باركود خطي، أو مربع (QR/DataMatrix)، أو رمز GS1 الدوائي (01)رقم الصنف(17)الانتهاء(10)التشغيلة.
 * يعيد الأرقام المحتملة للبحث بالترتيب، والصلاحية MM/YYYY والتشغيلة إن وُجدتا.
 */
export function parseCode(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/^\][A-Za-z]\d/, '');   // بادئة نوع الرمز من بعض القارئات
  const out = { raw: s, codes: [], exp: '', batch: '', main: '' };
  const add = c => { c = String(c || '').replace(/\x1d/g, '').trim(); if (c && !out.codes.includes(c)) out.codes.push(c); };
  const g = s.replace(/\((\d{2,4})\)/g, '\x1d$1').replace(/^\x1d/, '');
  if (/^01\d{14}/.test(g)) {
    const FIX = { '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
    let i = 0;
    while (i < g.length) {
      if (g[i] === '\x1d') { i++; continue; }
      const ai = g.slice(i, i + 2);
      if (FIX[ai]) {
        const v = g.slice(i + 2, i + 2 + FIX[ai]); i += 2 + FIX[ai];
        if (ai === '01') { add(v.replace(/^0/, '')); add(v); if (/^00/.test(v)) add(v.slice(2)); }
        if (ai === '17' && /^\d{6}$/.test(v) && +v.slice(2, 4) >= 1 && +v.slice(2, 4) <= 12) out.exp = v.slice(2, 4) + '/20' + v.slice(0, 2);
        continue;
      }
      const vai = /^(10|21|22|30|37|9\d)$/.test(ai) ? ai : /^(24\d|25\d|71\d)$/.test(g.slice(i, i + 3)) ? g.slice(i, i + 3) : '';
      if (!vai) break;
      let j = g.indexOf('\x1d', i + vai.length); if (j < 0) j = g.length;
      if (vai === '10') out.batch = g.slice(i + 2, j);
      i = j;
    }
  }
  add(s);
  if (/^\d{13}$/.test(s)) add('0' + s);
  if (/^\d{12}$/.test(s)) add('0' + s);
  if (/^0\d{13}$/.test(s)) add(s.slice(1));
  out.main = out.codes[0] || '';
  return out;
}
/** يبحث عن الصنف بكل أشكال الرمز المقروء */
export function findCode(store, raw) {
  const p = parseCode(raw);
  for (const c of p.codes) { const f = findBarcode(store, c); if (f && f.it) return Object.assign(f, { code: c, exp: p.exp, batch: p.batch }); }
  return null;
}
/**
 * باركود غير مسجّل: يُربط بصنف موجود (يُحفظ في وحدته فيُقرأ بعد ذلك مباشرة)، أو يُفتح صنف جديد به.
 * يعيد { it, u } عند الربط، أو null.
 */
export async function linkBarcode(ctx, raw, opt = {}) {
  const { store } = ctx, p = parseCode(raw), code = p.main;
  if (!code) return null;
  const rowsFor = q => q.trim() ? searchItems(store, q, 40).map(it => {
    const has = (it.bc || []).length || (it.u || []).some(u => u.b);
    return { value: it, label: it.n, sub: [it.co, has ? '' : 'بلا باركود'].filter(Boolean).join('، ') };
  }) : [];
  const r = await picker('باركود غير مسجّل: ' + code, [], { filter: rowsFor, placeholder: 'اكتب اسم الصنف لربط الباركود به',
    empty: 'اكتب اسم الصنف الذي على علبته هذا الباركود. يُحفظ الربط ويُقرأ الصنف بعدها مباشرة.',
    add: ctx.can('item-add') ? 'صنف جديد بهذا الباركود، اسمه' : '', addLast: true });
  if (!r) return null;
  if (r.add) { if (opt.onNew) opt.onNew(); ctx.go('item-edit/' + encodeURIComponent('bc:' + code)); return null; }
  const it = r, us = units(it).map(u => Object.assign({}, u));
  let j = 0;
  if (us.length > 1) {
    const ru = await picker('الباركود لأي وحدة؟', us.map((u, k) => ({ value: { k }, label: u.n, sub: 'سعر ' + price(u.p) })));
    if (!ru) return null;
    j = ru.k;
  }
  const u = us[j];
  if (!u.b) u.b = code; else if (u.b !== code) u.bx = [...new Set([...(u.bx || []), code])];
  try { await store.put('items', it.id, { u: us }, true); }   // الوحدات فقط: مسموح للكاشير
  catch (e) { toast('تعذّر حفظ الربط: ' + (e.code || e.message), { bad: true }); return null; }
  toast('رُبط الباركود بـ ' + it.n);
  return { it: store.items.get(it.id) || it, u: j, exp: p.exp };
}
export function searchItems(store, q, lim) {
  const n = norm(q); if (!n) return [];
  lim = lim || 30;
  const parts = n.split(' ').filter(Boolean), out = [], seen = new Set();
  for (const x of itemIndex(store).list) {
    if (parts.every(p => x.k.includes(p))) { out.push(x.it); seen.add(x.it.id); if (out.length >= lim) break; }
  }
  // الأقرب: ما يبدأ بالنص أولاً
  out.sort((a, b) => (norm(a.n).startsWith(n) ? 0 : 1) - (norm(b.n).startsWith(n) ? 0 : 1));
  // بحث بالنطق: عربي ← اسم إنجليزي
  const pq = phon(q).replace(/ /g, '');
  if (out.length < lim && pq.length >= 3) {
    const qv0 = phonV(q), qlead = /^[aoi]/.test(qv0), qv = qv0.replace(/^[aoi]/, ''), cand = [];
    const common = a0 => { const a = a0.replace(/^[aoi]/, ''); let i = 0; while (i < a.length && i < qv.length && a[i] === qv[i]) i++; return i + (qlead && /^[aoi]/.test(a0) ? 0.5 : 0); };
    for (const x of itemIndex(store).list) {
      if (seen.has(x.it.id)) continue;
      if (x.ph.startsWith(pq)) cand.push([x.it, 100 + common(x.pv)]);
      else if (pq.length >= 4 && x.ph.includes(pq)) cand.push([x.it, common(x.pv)]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    out.push(...cand.slice(0, lim - out.length).map(c => c[0]));
  }
  return out.slice(0, lim);
}
export const units = it => (it && it.u && it.u.length ? it.u : [{ n: 'وحدة', s: 1, p: 0 }]);

/** مخزون صنف (بالوحدة الأساسية) في مخزن أو الكل */
export function stockOf(L, id, store) { const s = L.itm.get(id); if (!s) return 0; return store ? (s.st[store] || 0) : s.Q; }
export function avgCost(L, store, id) {
  const s = L.itm.get(id), it = store.items.get(id) || {};
  return s && s.Q > 1e-9 ? s.V / s.Q : (s && s.lastC) || +it.c0 || 0;
}
/** أقرب صلاحية متوفرة في المخزن */
export function nearestExp(L, id, st) {
  const s = L.itm.get(id); if (!s) return '';
  const m = s.bt[st || 1]; if (!m) return '';
  let best = ''; for (const [x, q] of m) if (q > 1e-9 && x && (!best || expKey(x) < expKey(best))) best = x;
  return best;
}
export function expTag(x, d) {
  if (!x) return null;
  const left = monthsLeft(x, d || today());
  if (left < 0) return h('span', { class: 'tag red' }, 'منتهي ' + x);
  if (left <= 3) return h('span', { class: 'tag amber' }, 'ينتهي ' + x);
  return h('span', { class: 'tag' }, 'صلاحية ' + x);
}
/** كمية بالوحدة الأساسية ← نص مفهوم: 3 علبة و2 شريط */
export function qtyText(it, base) {
  const us = units(it); const main = us[0];
  if (!main) return qty(base);
  const whole = base >= 0 ? Math.floor(base / main.s + 1e-9) : Math.ceil(base / main.s - 1e-9);
  let rest = Math.round((base - whole * main.s) * 1e6) / 1e6;
  let t = (whole ? qty(whole) + ' ' + main.n : '');
  if (Math.abs(rest) > 1e-6 && us[1]) { const r = Math.round(rest / us[1].s * 1000) / 1000; t += (t ? ' و' : '') + qty(r) + ' ' + us[1].n; }
  else if (Math.abs(rest) > 1e-6) t += (t ? ' و' : '') + qty(rest) + ' ' + main.n;
  return t || ('0 ' + main.n);
}

/* ---------- الصناديق والحسابات والأطراف ---------- */
export const cashAccounts = store => [...store.accounts.values()].filter(a => a.k === 'cash' && a.act !== false);
export const partyName = (store, id) => (store.parties.get(id) || {}).n || '';
/** hideBal: أنواع لا يُعرض رصيدها (الكاشير لا يرى أرصدة الموردين والموظفين) */
export function partyRows(store, types, hideBal) {
  const L = store.L, rows = [];
  for (const p of store.parties.values()) {
    if (p.act === false || (types && !types.includes(p.t))) continue;
    const b = partyBalance(L, p.id);
    const w = balWords(b, p.t), hid = hideBal && hideBal.includes(p.t);
    rows.push({ value: p, label: p.n, sub: PARTY_TYPES[p.t] + (p.ph ? '، ' + p.ph : ''), side: w.amt && !hid ? money(w.amt) + ' ' + w.txt : '' });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}
export function partyFilter(rows) {
  return q => {
    const n = norm(q); if (!n) return rows;
    const rank = r => { const l = norm(r.label); return l.startsWith(n) ? 0 : (' ' + l).includes(' ' + n) ? 1 : 2; };   // يبدأ بالاسم أولاً، ثم كلمة تبدأ به
    return rows.filter(r => norm(r.label + ' ' + (r.value.ph || '')).includes(n)).sort((a, b) => rank(a) - rank(b));
  };
}

/* ---------- الفترات ---------- */
export const PERIODS = [['m', 'هذا الشهر'], ['pm', 'الشهر الماضي'], ['y', 'هذه السنة'], ['all', 'الكل'], ['d', 'اليوم']];
export function periodRange(k, ref) {
  const d = ref || today();
  if (k === 'd') return [d, d];
  if (k === 'm') return [monthStart(d), d];
  if (k === 'pm') { const e = addDays(monthStart(d), -1); return [monthStart(e), e]; }
  if (k === 'y') return [yearStart(d), d];
  return ['', ''];
}
export function periodChips(sel, onPick, extra) {
  return h('div', { class: 'chips' }, PERIODS.filter(p => !extra || extra.includes(p[0])).map(([k, l]) => h('button', { class: 'chip' + (k === sel ? ' set' : ''), on: { click: () => onPick(k) } }, l)));
}

/* ---------- عرض سند ---------- */
export function voucherLine(store, v, opt = {}) {
  const tt = totals(v), meta = store.L.vm.get(v.id) || {};
  const who = v.pt ? partyName(store, v.pt) : v.ac ? (store.accounts.get(v.ac) || {}).n : v.t === 'sale' ? 'نقدي' : '';
  const amt = v.t === 'adj' || v.t === 'open' ? meta.tot : tt.tot;
  const sign = ['sale', 'rcpt'].includes(v.t) ? 'green' : ['pay'].includes(v.t) ? 'red' : '';
  return h('a', { class: 'ln link', href: '#/vch/' + encodeURIComponent(v.id) },
    h('span', { class: 'k' }, h('b', null, typeName(v.t) + (v.no ? ' ' + v.no : '')), h('small', null, [dmy(v.d), who, v.st === 'void' ? 'ملغى' : ''].filter(Boolean).join('، '))),
    h('span', { class: 'v ' + (v.st === 'void' ? 'muted' : sign), style: v.st === 'void' ? { textDecoration: 'line-through' } : null }, h('span', { class: 'num' }, money(amt || 0))));
}

/* ---------- طباعة فاتورة/سند ---------- */
export function printVoucher(store, v) {
  const S = store.settings, tt = totals(v), esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const width = S.pw === 80 ? '72mm' : '48mm';
  let rows = '';
  for (const l of v.ln || []) {
    const it = store.items.get(l.i) || {}, u = (it.u || [])[l.u] || {};
    const pr = (v.t === 'pur' || v.t === 'pret' || v.t === 'open' ? l.c : l.p) || 0;
    rows += `<tr><td>${esc(l.n || it.n)}${u.n && u.s !== 1 ? ' (' + esc(u.n) + ')' : ''}</td><td class="n">${qty(l.q)}${l.f ? '+' + qty(l.f) : ''}×${price(pr)}</td><td class="n">${money(l.q * pr)}</td></tr>`;
  }
  const who = v.pt ? partyName(store, v.pt) : v.ac ? (store.accounts.get(v.ac) || {}).n : '';
  const html = `<div style="width:${width};margin:0 auto">
    <h2>${esc(S.name || 'الصيدلية')}</h2>
    ${S.addr || S.ph ? `<div class="pc">${esc([S.addr, S.ph].filter(Boolean).join(' — '))}</div>` : ''}
    <div class="pc" style="margin:4px 0">${esc(typeName(v.t))} ${esc(v.no || '')}، ${dmy(v.d)}</div>
    ${who ? `<div>${v.t === 'pur' || v.t === 'pret' ? 'المورد' : v.t === 'pay' ? 'إلى' : 'العميل'}: ${esc(who)}</div>` : ''}
    ${rows ? `<table><tr><th>الصنف</th><th class="n">الكمية×السعر</th><th class="n">المبلغ</th></tr>${rows}</table>` : ''}
    ${tt.ds ? `<div class="ptot" style="font-size:12px;font-weight:400"><span>الخصم</span><span>${money(tt.ds)}</span></div>` : ''}
    <div class="ptot"><span>الإجمالي</span><span>${money(tt.tot)}</span></div>
    ${rows && tt.credit > 0.004 ? `<div class="ptot" style="font-size:12px"><span>المدفوع</span><span>${money(tt.pd)}</span></div><div class="ptot" style="font-size:12px"><span>المتبقي آجل</span><span>${money(tt.credit)}</span></div>` : ''}
    ${v.m ? `<div style="margin-top:4px">${esc(v.m)}</div>` : ''}
    <div class="pc" style="margin-top:8px">${esc(S.foot || 'شكراً لزيارتكم')}</div>
  </div>`;
  printHtml(html, typeName(v.t) + ' ' + (v.no || ''), 'receipt');
}

export function emptyState(text, btn) {
  return h('div', { class: 'empty' }, h('p', null, text), btn || null);
}
export function ic(name) { return icon(name, 20); }

/* ---------- تصدير وطباعة سند بجدول كامل (A4، Excel، CSV، نسخ) ---------- */
export function exportVoucher(store, v) {
  const tt = totals(v), meta = store.L.vm.get(v.id) || {};
  const isBuy = v.t === 'pur' || v.t === 'pret' || v.t === 'open';
  const who = v.pt ? partyName(store, v.pt) : v.ac ? (store.accounts.get(v.ac) || {}).n : '';
  const head = [dmy(v.d), who ? (isBuy ? 'المورد: ' : v.t === 'pay' ? 'إلى: ' : 'العميل: ') + who : '', v.inv ? 'فاتورة المورد ' + v.inv : '', v.m || ''].filter(Boolean);
  const rows = (v.ln || []).map(l => {
    const it = store.items.get(l.i) || {}, u = (it.u || [])[l.u] || {};
    const price = isBuy ? l.c : l.p;
    return {
      code: it.src || l.i, bc: (u.b || (it.bc || [])[0] || ''), name: l.n || it.n || l.i, co: it.co || '', unit: u.n || (l.z === 1 ? (units(it)[0] || {}).n : '') || '',
      q: +l.q || 0, f: +l.f || '', base: (+l.q || 0) * (+l.z || 1) + (+l.f || 0) * (+l.z || 1), price: price == null ? '' : +price,
      amt: price == null ? '' : (+l.q || 0) * (+price || 0), x: l.x || '', st: STORES[l.s || 1] + (l.s2 ? ' ← ' + STORES[l.s2] : '')
    };
  });
  const cols = [
    { k: 'code', t: 'رقم الصنف', f: '' }, { k: 'bc', t: 'الباركود', f: '', on: false }, { k: 'name', t: 'اسم الصنف', f: '' },
    { k: 'co', t: 'الشركة', f: '', on: false }, { k: 'unit', t: 'الوحدة', f: '' }, { k: 'q', t: 'الكمية', f: 'q' },
    ...(v.t === 'pur' || v.t === 'pret' ? [{ k: 'f', t: 'بونص', f: 'q' }] : []),
    { k: 'base', t: 'الكمية بالوحدة الكبرى', f: 'q', on: false },
    ...(v.t === 'adj' || v.t === 'xfer' ? [] : [{ k: 'price', t: isBuy ? 'التكلفة' : 'السعر', f: 'n' }, { k: 'amt', t: 'المبلغ', f: 'n' }]),
    { k: 'x', t: 'تاريخ الانتهاء', f: 'x', on: isBuy || v.t === 'adj' }, { k: 'st', t: 'المخزن', f: '', on: v.t === 'xfer' || v.t === 'open' }
  ];
  const tot = [];
  if (['sale', 'sret', 'pur', 'pret'].includes(v.t)) {
    if (tt.ds) tot.push(['الإجمالي قبل الخصم', tt.gross], ['الخصم', tt.ds]);
    tot.push(['الإجمالي', tt.tot], ['المدفوع نقداً', tt.pd]);
    if (tt.credit > 0.004) tot.push(['المتبقي آجل', tt.credit]);
  } else if (v.t === 'open') tot.push(['قيمة المخزون', rows.reduce((s, r) => s + (+r.amt || 0), 0)], ['رأس المال الناتج', meta.tot || 0]);
  else if (v.t === 'adj') tot.push(['قيمة التسوية بالتكلفة', meta.tot || 0]);
  else if (tt.tot) tot.push(['المبلغ', tt.tot]);
  const extra = [];
  if (v.t === 'open' && (v.pb || []).length) extra.push({ name: 'أرصدة الأسماء', cols: [{ k: 'n', t: 'الاسم', f: '' }, { k: 't', t: 'النوع', f: '' }, { k: 'dr', t: 'عليه (مدين)', f: 'n' }, { k: 'cr', t: 'له (دائن)', f: 'n' }],
    rows: v.pb.map(b => { const p = store.parties.get(b.pt) || {}; return { n: p.n || b.pt, t: PARTY_TYPES[p.t] || '', dr: b.b > 0 ? b.b : '', cr: b.b < 0 ? -b.b : '' }; }) });
  const posts = store.L.post.filter(e => e.v.id === v.id);
  if (!rows.length || v.t === 'rcpt' || v.t === 'pay' || v.t === 'jv' || v.t === 'cxf') {
    const jr = posts.map(e => ({ a: (store.accounts.get(e.a) || {}).n || e.a, p: e.p ? partyName(store, e.p) : '', dr: e.dr || '', cr: e.cr || '' }));
    if (!rows.length) {
      return openExport({ id: 'je', title: typeName(v.t) + ' ' + (v.no || ''), head, settings: store.settings, sheet: 'القيد',
        cols: [{ k: 'a', t: 'الحساب', f: '' }, { k: 'p', t: 'الاسم', f: '' }, { k: 'dr', t: 'مدين', f: 'n' }, { k: 'cr', t: 'دائن', f: 'n' }], rows: jr, totals: tot,
        receipt: ['rcpt', 'pay'].includes(v.t) ? () => printVoucher(store, v) : null });
    }
  }
  openExport({
    id: 'v-' + (v.t === 'sret' ? 'sale' : v.t === 'pret' ? 'pur' : v.t), title: typeName(v.t) + ' ' + (v.no || ''), file: typeName(v.t) + '_' + (v.no || ''), head, settings: store.settings, sheet: typeName(v.t),
    cols, rows, totals: tot, extra,
    receipt: ['sale', 'sret'].includes(v.t) ? () => printVoucher(store, v) : null,
    presets: [
      { label: 'أعمدة الفاتورة', cols: [['code'], ['name'], ['unit'], ['q'], ['price'], ['amt']] },
      { label: 'رقم الصنف + الكمية فقط', cols: [['code'], ['base', 'الكمية']] },
      { label: 'للجرد والمراجعة', cols: [['code'], ['bc'], ['name'], ['unit'], ['q'], ['x'], ['st']] },
      { label: 'English (ID, Name, Qty)', cols: [['code', 'ID'], ['name', 'Name'], ['unit', 'Unit'], ['q', 'Qty'], ['price', 'Price'], ['amt', 'Amount'], ['x', 'Expiry']] }
    ]
  });
}
