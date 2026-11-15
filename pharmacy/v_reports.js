/* التقارير: كلها محسوبة من الدفتر نفسه لحظة فتحها، وتُطبع أو تُحفظ Excel */
import { h, icon, toast, put } from './ui.js';
import { money, qty, dmy, today, addDays, monthsLeft, expKey, r2, daysBetween, rangeText } from './util.js';
import { trialBalance, profitLoss, balanceSheet, aging, expiries, itemSales, statement, accBalance, STORES } from './engine.js';
import { periodChips, periodRange, cashAccounts, units, qtyText, partyName, balWords } from './common.js';
import { saveXlsx, printHtml } from './out.js';

const LIST = [
  ['daily', 'المبيعات اليومية', 'المبيعات والمرتجعات والنقد والآجل لكل يوم', 'r-daily'],
  ['cash', 'حركة الصندوق', 'كل ما دخل الصندوق وخرج منه بالرصيد', 'r-cash'],
  ['aging', 'أعمار الديون', 'من عليه دين ومنذ متى، ومن توقف عن السداد', 'r-aging'],
  ['expiry', 'الصلاحيات', 'المنتهي وما ينتهي خلال 3 و6 أشهر', 'r-expiry'],
  ['short', 'النواقص', 'أصناف نفدت أو نزلت عن حد الطلب وهي تُباع', 'r-short'],
  ['isales', 'مبيعات الأصناف وأرباحها', 'أكثر الأصناف بيعاً وربحاً في الفترة', 'profit'],
  ['still', 'الأصناف الراكدة', 'مخزون لم يُبع منه شيء خلال 90 يوماً', 'profit'],
  ['pnl', 'الأرباح والخسائر', 'صافي المبيعات وتكلفتها والمصروفات والربح', 'profit'],
  ['exps', 'المصروفات', 'المصروفات حسب النوع في الفترة', 'profit'],
  ['bs', 'الميزانية', 'الأصول والالتزامات ورأس المال الحقيقي', 'profit'],
  ['tb', 'ميزان المراجعة', 'أرصدة كل الحسابات، والمدين يساوي الدائن', 'profit']
];
const st = { per: 'm', sup: false };

export function reportsView(ctx) {
  return {
    title: 'التقارير',
    el: h('section', { class: 'page tight' }, LIST.filter(r => ctx.can(r[3])).map(([k, n, d]) => h('a', { class: 'ln link', href: '#/r/' + k },
      h('span', { class: 'k' }, h('b', null, n), h('small', null, d)), icon('fwd', 18))))
  };
}

function tableEl(cols, rows, foot) {
  return h('table', { class: 'stmt' },
    h('thead', null, h('tr', null, cols.map(c => h('th', { class: c.n ? 'n' : '' }, c.t)))),
    h('tbody', null, rows.map(r => h('tr', { on: r._go ? { click: r._go } : null }, cols.map((c, i) => h('td', { class: (c.n ? 'n num' : '') + (c.d ? ' d' : '') + (r._cls && r._cls[i] ? ' ' + r._cls[i] : '') }, fmt(r[i], c))))),
      foot ? h('tr', { class: 'close' }, cols.map((c, i) => h('td', { class: c.n ? 'n num' : '' }, fmt(foot[i], c)))) : null));
}
function fmt(v, c) { if (v === '' || v == null) return ''; if (c.n === 'q') return qty(v); if (c.n) return money(v); if (c.d) return dmy(v); return String(v); }

function frame(ctx, k, title, opts, content) {
  const exportX = async () => {
    try { await saveXlsx(title.replace(/\s+/g, '_') + '_' + today() + '.xlsx', opts.sheets()); toast('حُفظ الملف'); }
    catch (e) { toast('تعذّر الحفظ: ' + (e.message || e), { bad: true }); }
  };
  const printIt = () => {
    const sh = opts.sheets()[0], esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const body = sh.rows.slice(1).map(r => '<tr>' + r.map(v => `<td class="${typeof v === 'number' ? 'n' : ''}">${typeof v === 'number' ? money(v) : esc(v)}</td>`).join('') + '</tr>').join('');
    printHtml(`<div><h2>${esc(ctx.store.settings.name || 'الصيدلية')}</h2><div class="pc">${esc(title)} — ${esc(opts.range || dmy(today()))}</div><table><tr>${sh.rows[0].map(x => `<th>${esc(x)}</th>`).join('')}</tr>${body}</table></div>`, title);
  };
  return {
    title, sub: opts.range || '',
    actions: [h('button', { class: 'iconbtn', 'aria-label': 'طباعة', on: { click: printIt } }, icon('print')), h('button', { class: 'iconbtn', 'aria-label': 'حفظ Excel', on: { click: exportX } }, icon('share'))],
    el: h('div', null, opts.chips ? periodChips(st.per, p => { st.per = p; ctx.redraw(); }, opts.chips) : null, content)
  };
}

export function reportView(ctx, k) {
  const { store } = ctx, L = store.L, A = store.accounts;
  const meta = LIST.find(x => x[0] === k);
  if (!meta || !ctx.can(meta[3])) return { title: 'التقارير', el: h('div', { class: 'note bad' }, 'هذا التقرير غير متاح لحسابك.') };
  const [from, to] = periodRange(st.per);
  const range = rangeText(from, to);
  const sheet = (name, cols, rows, foot) => [{ name, rows: [cols.map(c => c.t), ...rows.map(r => cols.map((c, i) => r[i] === '' || r[i] == null ? '' : r[i])), ...(foot ? [foot] : [])], widths: cols.map(c => c.w || (c.n ? 14 : 30)) }];
  const page = (...x) => h('section', { class: 'page tight', style: { overflowX: 'auto' } }, ...x);

  if (k === 'daily') {
    const cols = [{ t: 'اليوم', d: 1 }, { t: 'الفواتير', n: 'q' }, { t: 'المبيعات', n: 1 }, { t: 'المرتجعات', n: 1 }, { t: 'نقداً', n: 1 }, { t: 'آجل', n: 1 }];
    if (ctx.can('profit')) cols.push({ t: 'مجمل الربح', n: 1 });
    const rows = [...L.days.entries()].filter(([d, x]) => (!from || d >= from) && (!to || d <= to) && (x.sales || x.ret)).sort((a, b) => b[0].localeCompare(a[0]))
      .map(([d, x]) => { const r = [d, x.n, x.sales, x.ret, x.cash, x.credit]; if (ctx.can('profit')) r.push(r2(x.sales - x.ret - x.cost)); return r; });
    const sum = i => r2(rows.reduce((s, r) => s + (+r[i] || 0), 0));
    const foot = ['الإجمالي', sum(1), sum(2), sum(3), sum(4), sum(5)]; if (ctx.can('profit')) foot.push(sum(6));
    return frame(ctx, k, meta[1], { chips: ['d', 'm', 'pm', 'y', 'all'], range, sheets: () => sheet(meta[1], cols, rows, foot) }, page(rows.length ? tableEl(cols, rows, foot) : h('p', { class: 'empty' }, 'لا مبيعات في هذه الفترة.')));
  }
  if (k === 'cash') {
    const boxes = cashAccounts(store), out = h('div');
    for (const b of boxes) {
      const s = statement(L, { a: b.id, from, to });
      const cols = [{ t: 'التاريخ', d: 1 }, { t: 'البيان' }, { t: 'داخل', n: 1 }, { t: 'خارج', n: 1 }, { t: 'الرصيد', n: 1 }];
      const rows = s.rows.map(r => Object.assign([r.d, r.m, r.dr || '', r.cr || '', r.bal], { _go: () => ctx.go('vch/' + encodeURIComponent(r.v.id)) }));
      if (from) rows.unshift(['', 'رصيد أول الفترة', '', '', s.open]);
      put(out, h('h3', { class: 'sect' }, b.n + ': ' + money(s.close)), page(rows.length ? tableEl(cols, rows, ['', 'الإجمالي', s.dr, s.cr, s.close]) : h('p', { class: 'empty' }, 'لا حركة.')));
    }
    return frame(ctx, k, meta[1], { chips: ['d', 'm', 'pm', 'y', 'all'], range, sheets: () => boxes.map(b => { const s = statement(L, { a: b.id, from, to }); return { name: b.n, rows: [['التاريخ', 'البيان', 'داخل', 'خارج', 'الرصيد'], ...s.rows.map(r => [r.d, r.m, r.dr || '', r.cr || '', r.bal])], widths: [12, 50, 14, 14, 16] }; }) }, out);
  }
  if (k === 'aging') {
    const type = st.sup ? 's' : 'c', ag = aging(L, store.parties, today(), type);
    const cols = [{ t: 'الاسم' }, { t: 'الرصيد', n: 1 }, { t: 'حتى 30 يوماً', n: 1 }, { t: '31–90', n: 1 }, { t: '91–180', n: 1 }, { t: '181–365', n: 1 }, { t: 'أكثر من سنة', n: 1 }, { t: 'آخر سداد', d: 1 }];
    const rows = ag.filter(a => a.bal > 0.5).map(a => Object.assign([a.p.n, a.bal, ...a.b, a.lastPay], { _go: () => ctx.go('party/' + encodeURIComponent(a.p.id)), _cls: { 0: a.idle > 180 ? 'red' : '' } }));
    const sum = i => r2(rows.reduce((s, r) => s + (+r[i] || 0), 0));
    const foot = ['الإجمالي', sum(1), sum(2), sum(3), sum(4), sum(5), sum(6), ''];
    const dormant = ag.filter(a => a.bal > 0.5 && a.idle > 180);
    return frame(ctx, k, meta[1], { range: 'حتى ' + dmy(today()), sheets: () => sheet(meta[1], cols, rows, foot) }, h('div', null,
      h('div', { class: 'chips' }, h('button', { class: 'chip' + (!st.sup ? ' set' : ''), on: { click: () => { st.sup = false; ctx.redraw(); } } }, 'ديون العملاء'), h('button', { class: 'chip' + (st.sup ? ' set' : ''), on: { click: () => { st.sup = true; ctx.redraw(); } } }, 'مستحقات الموردين')),
      dormant.length && !st.sup ? h('div', { class: 'note bad' }, dormant.length + ' عميلاً لم يسددوا شيئاً منذ أكثر من 6 أشهر، مجموعها ' + money(dormant.reduce((s, a) => s + a.bal, 0)) + '. راجعهم قبل اعتبارها ديوناً معدومة.') : null,
      page(rows.length ? tableEl(cols, rows, foot) : h('p', { class: 'empty' }, 'لا ديون قائمة.'))));
  }
  if (k === 'expiry') {
    const ex = expiries(L, store.items, today()).filter(e => e.x);
    const groups = [['منتهية', e => e.left < 0, 'red'], ['تنتهي خلال 3 أشهر', e => e.left >= 0 && e.left <= 3, 'amber'], ['تنتهي خلال 6 أشهر', e => e.left > 3 && e.left <= 6, '']];
    const cols = [{ t: 'الصنف' }, { t: 'الصلاحية' }, { t: 'المخزن' }, { t: 'الكمية' }, { t: 'القيمة', n: 1 }];
    const out = h('div'); const all = [];
    for (const [title, f, cls] of groups) {
      const rows = ex.filter(f).map(e => { const it = store.items.get(e.id); return Object.assign([e.n, e.x, STORES[e.store], qtyText(it, e.q), ctx.can('profit') ? e.value : ''], { _go: () => ctx.go('item/' + encodeURIComponent(e.id)) }); });
      all.push(...rows.map(r => [title, ...r]));
      put(out, h('h3', { class: 'sect ' + cls }, title + ' (' + rows.length + ')'), page(rows.length ? tableEl(cols, rows) : h('p', { class: 'empty' }, 'لا شيء.')));
    }
    return frame(ctx, k, meta[1], { range: 'حتى ' + dmy(today()), sheets: () => [{ name: 'الصلاحيات', rows: [['الحالة', 'الصنف', 'الصلاحية', 'المخزن', 'الكمية', 'القيمة'], ...all], widths: [18, 44, 10, 12, 18, 14] }] }, out);
  }
  if (k === 'short') {
    const d = today(), d60 = addDays(d, -60), rows = [];
    for (const it of store.items.values()) {
      if (it.act === false) continue;
      const s = L.itm.get(it.id); if (!s) continue;
      const sold60 = -(L.mv.get(it.id) || []).filter(m => (m.k === 'sale' || m.k === 'sret') && m.d >= d60).reduce((t, m) => t + m.q, 0);
      const low = it.min && s.Q < +it.min;
      if ((s.Q <= 1e-9 && sold60 > 0) || low) rows.push(Object.assign([it.n, qtyText(it, s.Q), qtyText(it, sold60), s.lastSale || '', it.co || ''], { _go: () => ctx.go('item/' + encodeURIComponent(it.id)), _q: sold60 }));
    }
    rows.sort((a, b) => b._q - a._q);
    const cols = [{ t: 'الصنف' }, { t: 'المتوفر' }, { t: 'بيع 60 يوماً' }, { t: 'آخر بيع', d: 1 }, { t: 'الشركة' }];
    return frame(ctx, k, meta[1], { range: 'حتى ' + dmy(d), sheets: () => sheet(meta[1], cols, rows) }, page(rows.length ? tableEl(cols, rows) : h('p', { class: 'empty' }, 'لا نواقص.')));
  }
  if (k === 'isales') {
    const rows = itemSales(L, from, to).filter(r => r.q || r.amt).sort((a, b) => b.amt - a.amt).map(r => { const it = store.items.get(r.id) || {}; return Object.assign([it.n || r.id, qtyText(it, r.q), r.amt, r.cost, r.gp, r.amt ? Math.round(r.gp / r.amt * 100) + '%' : ''], { _go: () => ctx.go('item/' + encodeURIComponent(r.id)) }); });
    const cols = [{ t: 'الصنف' }, { t: 'الكمية' }, { t: 'المبيعات', n: 1 }, { t: 'التكلفة', n: 1 }, { t: 'الربح', n: 1 }, { t: 'الهامش' }];
    const sum = i => r2(rows.reduce((s, r) => s + (+r[i] || 0), 0));
    const foot = ['الإجمالي', '', sum(2), sum(3), sum(4), sum(2) ? Math.round(sum(4) / sum(2) * 100) + '%' : ''];
    return frame(ctx, k, meta[1], { chips: ['m', 'pm', 'y', 'all'], range, sheets: () => sheet(meta[1], cols, rows, foot) }, page(rows.length ? tableEl(cols, rows.slice(0, 300), foot) : h('p', { class: 'empty' }, 'لا مبيعات في الفترة.')));
  }
  if (k === 'still') {
    const d90 = addDays(today(), -90), rows = [];
    for (const [id, s] of L.itm) { const it = store.items.get(id); if (!it || s.Q <= 1e-9) continue; if (s.lastSale && s.lastSale >= d90) continue; rows.push(Object.assign([it.n, qtyText(it, s.Q), s.V, s.lastSale || 'لم يُبع', s.lastIn || ''], { _go: () => ctx.go('item/' + encodeURIComponent(id)), _v: s.V })); }
    rows.sort((a, b) => b._v - a._v);
    const cols = [{ t: 'الصنف' }, { t: 'المخزون' }, { t: 'القيمة', n: 1 }, { t: 'آخر بيع' }, { t: 'آخر دخول', d: 1 }];
    const foot = ['الإجمالي', '', r2(rows.reduce((s, r) => s + r._v, 0)), '', ''];
    return frame(ctx, k, meta[1], { range: 'حتى ' + dmy(today()), sheets: () => sheet(meta[1], cols, rows, foot) }, page(rows.length ? tableEl(cols, rows.slice(0, 300), foot) : h('p', { class: 'empty' }, 'لا أصناف راكدة.')));
  }
  if (k === 'pnl') {
    const p = profitLoss(L, A, from, to);
    const ln = (a, b, cls, sub) => h('div', { class: 'ln' + (sub ? '' : '') }, h('span', { class: 'k' }, sub ? h('small', { style: { fontSize: '14.5px' } }, a) : h('b', null, a)), h('span', { class: 'v num ' + (cls || ''), style: { fontSize: sub ? '15px' : '18px' } }, money(b)));
    const rows = [['المبيعات', p.sales], ['مردودات المبيعات', -p.sret], ['الخصم المسموح به', -p.disc], ['صافي المبيعات', p.net], ['تكلفة المبيعات', -p.cogs], ['مجمل الربح', p.gross], ...p.exps.map(e => [e.a.n, -e.x]), ...p.otherRev.map(e => [e.a.n, e.x]), ['صافي الربح', p.profit]];
    return frame(ctx, k, meta[1], { chips: ['m', 'pm', 'y', 'all'], range, sheets: () => [{ name: 'الأرباح والخسائر', rows: [['البند', 'المبلغ'], ...rows], widths: [40, 18] }] },
      h('section', { class: 'page' },
        ln('المبيعات', p.sales), ln('مردودات المبيعات', -p.sret, '', 1), ln('الخصم المسموح به', -p.disc, '', 1),
        ln('صافي المبيعات', p.net), ln('تكلفة البضاعة المباعة', -p.cogs, '', 1),
        ln('مجمل الربح' + (p.net ? ' (' + Math.round(p.margin * 100) + '%)' : ''), p.gross, 'green'),
        ...p.exps.map(e => ln(e.a.n, -e.x, '', 1)),
        ...p.otherRev.map(e => ln(e.a.n, e.x, '', 1)),
        h('div', { class: 'ln big' }, h('span', { class: 'k' }, h('b', null, 'صافي الربح')), h('span', { class: 'v num ' + (p.profit < 0 ? 'red' : 'green') }, money(p.profit)))));
  }
  if (k === 'exps') {
    const p = profitLoss(L, A, from, to);
    const cols = [{ t: 'المصروف' }, { t: 'المبلغ', n: 1 }];
    const rows = p.exps.map(e => [e.a.n, e.x]);
    return frame(ctx, k, meta[1], { chips: ['m', 'pm', 'y', 'all'], range, sheets: () => sheet(meta[1], cols, rows, ['الإجمالي', p.expT]) }, page(rows.length ? tableEl(cols, rows, ['الإجمالي', p.expT]) : h('p', { class: 'empty' }, 'لا مصروفات في الفترة.')));
  }
  if (k === 'bs') {
    const b = balanceSheet(L, A, today(), store.parties);
    const ln = (a, v, strong, cls) => h('div', { class: 'ln' }, h('span', { class: 'k' }, strong ? h('b', null, a) : h('small', { style: { fontSize: '14.5px' } }, a)), h('span', { class: 'v num ' + (cls || ''), style: { fontSize: strong ? '18px' : '15px' } }, money(v)));
    const rows = [['الأصول', ''], ...b.assets.map(x => [x.a.n, x.b]), ['ذمم العملاء وغيرهم (لنا)', b.recv], ['مجموع الأصول', b.assetsT], ['الالتزامات', ''], ['ذمم الموردين وغيرهم (علينا)', b.pay], ...b.liabs.map(x => [x.a.n, x.b]), ['مجموع الالتزامات', b.liabT], ['حقوق المالك', ''], ...b.equity.map(x => [x.a.n, x.b]), ['أرباح الفترات', b.pl], ['مجموع حقوق المالك', b.eqT]];
    return frame(ctx, k, meta[1], { range: 'في ' + dmy(today()), sheets: () => [{ name: 'الميزانية', rows: [['البند', 'المبلغ'], ...rows], widths: [40, 18] }] }, h('div', null,
      h('section', { class: 'page' }, h('div', { class: 'ph' }, h('h2', null, 'الأصول')), ...b.assets.map(x => ln(x.a.n, x.b)), ln('ذمم لنا عند العملاء وغيرهم', b.recv), ln('مجموع الأصول', b.assetsT, 1)),
      h('section', { class: 'page' }, h('div', { class: 'ph' }, h('h2', null, 'الالتزامات')), ln('ذمم علينا للموردين وغيرهم', b.pay), ...b.liabs.map(x => ln(x.a.n, x.b)), ln('مجموع الالتزامات', b.liabT, 1)),
      h('section', { class: 'page' }, h('div', { class: 'ph' }, h('h2', null, 'رأس المال الحقيقي')), ...b.equity.map(x => ln(x.a.n, x.b)), ln('أرباح الفترات', b.pl), ln('صافي حقوق المالك', b.eqT, 1, 'green'),
        h('p', { class: 'muted', style: { fontSize: '13px' } }, 'صافي حقوق المالك = الأصول − الالتزامات. هذا هو رأس مالك الفعلي اليوم.'),
        Math.abs(b.check) > 0.01 ? h('div', { class: 'note bad' }, 'فرق غير متوقع ' + money(b.check)) : h('div', { class: 'note good' }, 'الميزانية متوازنة.'))));
  }
  if (k === 'tb') {
    const t = trialBalance(L, A, from, to);
    const cols = [{ t: 'الحساب' }, { t: 'أول الفترة', n: 1 }, { t: 'مدين', n: 1 }, { t: 'دائن', n: 1 }, { t: 'الرصيد', n: 1 }];
    const rows = t.rows.map(r => [r.a.id + ' ' + r.a.n, r.open, r.dr, r.cr, r.close]);
    const foot = ['الإجمالي', t.open, t.dr, t.cr, t.close];
    return frame(ctx, k, meta[1], { chips: ['m', 'pm', 'y', 'all'], range, sheets: () => sheet(meta[1], cols, rows, foot) }, h('div', null,
      Math.abs(t.dr - t.cr) < 0.01 ? h('div', { class: 'note good' }, 'المدين يساوي الدائن: ' + money(t.dr)) : h('div', { class: 'note bad' }, 'فرق ' + money(t.dr - t.cr)),
      page(tableEl(cols, rows, foot))));
  }
  return { title: 'التقارير', el: h('p', { class: 'empty' }, 'تقرير غير معروف') };
}
