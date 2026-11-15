import fs from 'fs';
import * as E from '../engine.js';
const D = '/home/claude/demo/';
const items = new Map(Object.entries(JSON.parse(fs.readFileSync(D + 'items.json'))));
const parties = new Map(Object.entries(JSON.parse(fs.readFileSync(D + 'parties.json'))));
const vouchers = JSON.parse(fs.readFileSync(D + 'vouchers.json'));
const bs = JSON.parse(fs.readFileSync(D + 'bs_stock.json'));
const accounts = new Map(E.DEFAULT_ACCOUNTS.map(a => [a.id, a]));
let bad = 0; const errs = {};
for (const v of vouchers) { const e = E.check(v, { items, parties, accounts }); if (e) { bad++; errs[e] = (errs[e] || 0) + 1; } }
console.log('vouchers', vouchers.length, 'rejected by check:', bad, Object.entries(errs).slice(0, 6));
let t = Date.now();
const L = E.build({ items, parties, accounts, vouchers });
console.log('build ms', Date.now() - t, '| postings', L.post.length, '| dr', L.dr, 'cr', L.cr);
let mism = 0, n = 0; const ex = [];
for (const [id, st] of Object.entries(bs)) {
  const s = L.itm.get(id) || { st: { 1: 0, 2: 0 } };
  for (const k of ['1', '2']) {
    const want = st[k] || 0, got = s.st[k] || 0; n++;
    if (Math.abs(want - got) > 0.01) { mism++; if (ex.length < 8) ex.push([id, k, want, +got.toFixed(3)]); }
  }
}
console.log('stock compare: cells', n, 'mismatches', mism, ex);
const pl = E.profitLoss(L, accounts, '2026-01-01', '2026-12-31');
console.log('P&L 2026: net sales', pl.net, 'cogs', pl.cogs, 'gross', pl.gross, 'margin', (pl.margin * 100).toFixed(1) + '%', 'expenses', pl.expT, 'profit', pl.profit);
const bsx = E.balanceSheet(L, accounts, '2026-12-31', parties);
console.log('balance sheet check', bsx.check, '| cash', E.accBalance(L, '1101'), '| inventory', E.accBalance(L, '1300'), '| receivables', bsx.recv, '| payables', bsx.pay);
console.log('issues', L.issues.length, 'neg-stock events', L.issues.filter(i => i.k === 'neg').length);
t = Date.now(); const ag = E.aging(L, parties, '2026-11-01', 'c'); console.log('aging ms', Date.now() - t, 'customers with balance', ag.length, 'top', ag.slice(0, 3).map(a => a.p.n + ' ' + a.bal));
t = Date.now(); const st = E.statement(L, { p: ag[0].p.id, from: '2026-01-01', to: '2026-12-31' }); console.log('statement rows', st.rows.length, 'ms', Date.now() - t);
