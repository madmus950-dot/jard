/* صفحة اليوم: ما يحتاجه صاحب الصيدلية بنظرة واحدة، وكل رقم يفتح أصله */
import { h, icon } from './ui.js';
import { today, longDate, monthsLeft, money } from './util.js';
import { accBalance, partyBalance } from './engine.js';
import { cashAccounts, voucherLine, emptyState } from './common.js';

export function home(ctx) {
  const { store } = ctx, L = store.L, d = today(), S = store.settings;
  const day = L.days.get(d) || { sales: 0, cash: 0, credit: 0, ret: 0, n: 0, cost: 0, exp: 0 };
  const cash = cashAccounts(store).reduce((s, a) => s + accBalance(L, a.id), 0);
  let recv = 0, pay = 0, nRecv = 0;
  for (const p of store.parties.values()) {
    const b = partyBalance(L, p.id);
    if (p.t === 'c' && b > 0.5) { recv += b; nRecv++; }
    if (p.t === 's' && b < -0.5) pay -= b;
  }
  let expd = 0, soon = 0, out = 0;
  for (const [id, s] of L.itm) {
    const it = store.items.get(id); if (!it || it.act === false) continue;
    for (const st of [1, 2]) for (const [x, q] of s.bt[st] || []) { if (q <= 1e-9 || !x) continue; const left = monthsLeft(x, d); if (left < 0) expd++; else if (left <= 3) soon++; }
    if (s.Q <= 1e-9 && s.lastSale) out++;
  }

  const row = (label, sub, val, href, cls, big) => h('a', { class: 'ln link' + (big ? ' big' : ''), href: href ? '#/' + href : null },
    h('span', { class: 'k' }, h('b', null, label), sub ? h('small', null, sub) : null),
    h('span', { class: 'v num ' + (cls || '') }, val));

  const page = h('section', { class: 'page' },
    h('div', { class: 'ph' }, h('h2', null, longDate(d)), h('div', { class: 'meta' }, S.name || 'الصيدلية')),
    row('مبيعات اليوم', day.n ? (day.n + ' فاتورة، نقداً ' + money(day.cash) + '، آجل ' + money(day.credit)) : 'لا فواتير بعد', money(day.sales - day.ret), 'r/daily', '', true),
    row('في الصندوق', cashAccounts(store).length > 1 ? cashAccounts(store).length + ' صناديق' : '', money(cash), 'r/cash'),
    row('لنا عند العملاء', nRecv ? nRecv + ' عميل عليه رصيد' : '', money(recv), 'parties/c'),
    row('علينا للموردين', '', money(pay), 'parties/s', pay ? 'amber' : ''),
    row('أصناف منتهية الصلاحية', expd ? 'أخرجها من الرفوف' : '', String(expd), 'r/expiry', expd ? 'red' : ''),
    row('تنتهي خلال 3 أشهر', '', String(soon), 'r/expiry', soon ? 'amber' : ''),
    row('نفدت وكانت تُباع', '', String(out), 'r/short', out ? 'amber' : ''));

  const q = (label, ic, path, ok) => ok ? h('button', { on: { click: () => ctx.go(path) } }, icon(ic), label) : null;
  const quick = h('div', { class: 'quick' },
    q('فاتورة بيع', 'sale', 'sale', ctx.can('sale')),
    q('شراء', 'in', 'doc/pur', ctx.can('pur')),
    q('سند قبض', 'wallet', 'v/rcpt', ctx.can('rcpt')),
    ctx.can('exp') ? q('مصروف', 'out', 'v/exp', true) : q('مرتجع', 'undo', 'doc/sret', ctx.can('sret')));

  const recent = [...store.vouchers.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 8);
  const first = !store.vouchers.size;
  return {
    title: 'اليوم', live: true,
    el: h('div', null,
      first ? h('div', { class: 'note good' }, ctx.can('import')
        ? h('span', null, 'الدفتر فارغ. ابدأ بإدخال الأرصدة الافتتاحية من ', h('a', { href: '#/import' }, 'الاستيراد'), ' أو أضف أول فاتورة.')
        : 'الدفتر فارغ. ستظهر الحركات هنا عند أول فاتورة.') : null,
      quick, page,
      recent.length ? h('h3', { class: 'sect' }, 'آخر الحركات') : null,
      recent.length ? h('section', { class: 'page tight' }, recent.map(v => voucherLine(store, v))) : null,
      recent.length ? h('a', { class: 'btn ghost wide', href: '#/vouchers', style: { marginTop: '4px' } }, 'كل السندات') : null)
  };
}
