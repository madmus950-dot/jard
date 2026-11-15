/* أدوات مشتركة بين الصفحات */
import { h, icon } from './ui.js';
import { money, price, qty, norm, phon, phonV, dmy, today, expKey, monthsLeft, monthStart, yearStart, addDays } from './util.js';
import { TYPES, totals, STORES, PARTY_TYPES, partyBalance } from './engine.js';
import { printHtml } from './out.js';

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
    (it.u || []).forEach((u, k) => { if (u.b) byBc.set(u.b, { id: it.id, u: k }); });
  }
  list.sort((a, b) => a.it.n.localeCompare(b.it.n, 'ar'));
  IX = { list, byBc }; IXv = store.ver;
  return IX;
}
function unitByBarcode(it, b) { const k = (it.u || []).findIndex(u => u.b === b); return k >= 0 ? k : 0; }
export function findBarcode(store, code) { const x = itemIndex(store).byBc.get(String(code).trim()); return x ? { it: store.items.get(x.id), u: x.u } : null; }
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
    const qv = phonV(q), cand = [];
    const common = a => { let i = 0; while (i < a.length && i < qv.length && a[i] === qv[i]) i++; return i; };
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
export function partyRows(store, types) {
  const L = store.L, rows = [];
  for (const p of store.parties.values()) {
    if (p.act === false || (types && !types.includes(p.t))) continue;
    const b = partyBalance(L, p.id);
    const w = balWords(b, p.t);
    rows.push({ value: p, label: p.n, sub: PARTY_TYPES[p.t] + (p.ph ? ' · ' + p.ph : ''), side: w.amt ? money(w.amt) + ' ' + w.txt : '' });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
}
export function partyFilter(rows) { return q => { const n = norm(q); return n ? rows.filter(r => norm(r.label + ' ' + (r.value.ph || '')).includes(n)) : rows; }; }

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
    h('span', { class: 'k' }, h('b', null, typeName(v.t) + (v.no ? ' ' + v.no : '')), h('small', null, [dmy(v.d), who, v.st === 'void' ? 'ملغى' : ''].filter(Boolean).join(' · '))),
    h('span', { class: 'v ' + (v.st === 'void' ? 'muted' : sign), style: v.st === 'void' ? { textDecoration: 'line-through' } : null }, h('span', { class: 'num' }, money(amt || 0))));
}

/* ---------- طباعة فاتورة/سند ---------- */
export function printVoucher(store, v) {
  const S = store.settings, tt = totals(v), esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const width = S.pw === 80 ? '72mm' : '48mm';
  let rows = '';
  for (const l of v.ln || []) {
    const it = store.items.get(l.i) || {}, u = (it.u || [])[l.u] || {};
    const pr = v.t === 'pur' || v.t === 'pret' ? l.c : l.p;
    rows += `<tr><td>${esc(l.n || it.n)}${u.n && u.s !== 1 ? ' (' + esc(u.n) + ')' : ''}</td><td class="n">${qty(l.q)}${l.f ? '+' + qty(l.f) : ''}×${price(pr)}</td><td class="n">${money(l.q * pr)}</td></tr>`;
  }
  const who = v.pt ? partyName(store, v.pt) : v.ac ? (store.accounts.get(v.ac) || {}).n : '';
  const html = `<div style="width:${width};margin:0 auto">
    <h2>${esc(S.name || 'الصيدلية')}</h2>
    ${S.addr || S.ph ? `<div class="pc">${esc([S.addr, S.ph].filter(Boolean).join(' — '))}</div>` : ''}
    <div class="pc" style="margin:4px 0">${esc(typeName(v.t))} ${esc(v.no || '')} · ${dmy(v.d)}</div>
    ${who ? `<div>${v.t === 'pur' || v.t === 'pret' ? 'المورد' : v.t === 'pay' ? 'إلى' : 'العميل'}: ${esc(who)}</div>` : ''}
    ${rows ? `<table><tr><th>الصنف</th><th class="n">الكمية×السعر</th><th class="n">المبلغ</th></tr>${rows}</table>` : ''}
    ${tt.ds ? `<div class="ptot" style="font-size:12px;font-weight:400"><span>الخصم</span><span>${money(tt.ds)}</span></div>` : ''}
    <div class="ptot"><span>الإجمالي</span><span>${money(tt.tot)}</span></div>
    ${rows && tt.credit > 0.004 ? `<div class="ptot" style="font-size:12px"><span>المدفوع</span><span>${money(tt.pd)}</span></div><div class="ptot" style="font-size:12px"><span>المتبقي آجل</span><span>${money(tt.credit)}</span></div>` : ''}
    ${v.m ? `<div style="margin-top:4px">${esc(v.m)}</div>` : ''}
    <div class="pc" style="margin-top:8px">${esc(S.foot || 'شكراً لزيارتكم')}</div>
  </div>`;
  printHtml(html, typeName(v.t) + ' ' + (v.no || ''));
}

export function emptyState(text, btn) {
  return h('div', { class: 'empty' }, h('p', null, text), btn || null);
}
export function ic(name) { return icon(name, 20); }
