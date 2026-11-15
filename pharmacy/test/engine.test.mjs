import * as E from '../engine.js';
import { r2 } from '../util.js';
let fails = 0;
const eq = (name, got, want) => { const ok = Math.abs(r2(got) - r2(want)) < 0.011; console.log((ok ? 'ok   ' : 'FAIL ') + name + ': ' + got + (ok ? '' : ' (want ' + want + ')')); if (!ok) fails++; };
const accounts = new Map(E.DEFAULT_ACCOUNTS.map(a => [a.id, a]));
const items = new Map([
  ['A', { id: 'A', n: 'باراسيتامول', u: [{ n: 'علبة', s: 1, p: 1000 }, { n: 'شريط', s: 0.5, p: 550 }] }],
  ['B', { id: 'B', n: 'شراب كحة', u: [{ n: 'علبة', s: 1, p: 2000 }] }]
]);
const parties = new Map([['c1', { id: 'c1', n: 'عميل تجريبي', t: 'c' }], ['s1', { id: 's1', n: 'مورد تجريبي', t: 's' }]]);
let at = 1;
const V = (o) => Object.assign({ id: 'v' + at, at: at++, st: 'ok' }, o);
const vouchers = [
  V({ t: 'open', d: '2027-01-01', ln: [{ i: 'A', n: 'باراسيتامول', q: 10, z: 1, c: 700, x: '06/2027', s: 1 }, { i: 'B', n: 'شراب', q: 5, z: 1, c: 1500, s: 1 }],
      pb: [{ pt: 'c1', b: 5000 }, { pt: 's1', b: -20000 }], cb: [{ ca: '1101', b: 30000 }] }),
  V({ t: 'pur', d: '2027-01-02', pt: 's1', ca: '1101', ln: [{ i: 'A', n: 'باراسيتامول', q: 20, f: 2, z: 1, c: 800, x: '12/2027', s: 1 }], ds: 1000, pd: 5000 }),
  V({ t: 'sale', d: '2027-01-03', ca: '1101', ln: [{ i: 'A', n: 'باراسيتامول', q: 3, z: 1, p: 1000, s: 1 }, { i: 'A', n: 'باراسيتامول', q: 2, z: 0.5, p: 550, s: 1 }], ds: 100, pd: 4000 }),
  V({ t: 'sale', d: '2027-01-03', pt: 'c1', ca: '1101', ln: [{ i: 'B', n: 'شراب', q: 2, z: 1, p: 2000, s: 1 }], pd: 1000 }),
  V({ t: 'rcpt', d: '2027-01-04', pt: 'c1', ca: '1101', a: 6000 }),
  V({ t: 'pay', d: '2027-01-05', pt: 's1', ca: '1101', a: 12000 }),
  V({ t: 'pay', d: '2027-01-05', ac: '6100', ca: '1101', a: 5000, m: 'إيجار يناير' }),
  V({ t: 'sret', d: '2027-01-06', pt: 'c1', ca: '1101', ln: [{ i: 'B', n: 'شراب', q: 1, z: 1, p: 2000, s: 1 }], pd: 0 }),
  V({ t: 'pret', d: '2027-01-07', pt: 's1', ca: '1101', ln: [{ i: 'A', n: 'باراسيتامول', q: 2, z: 1, c: 800, x: '12/2027', s: 1 }], pd: 0 }),
  V({ t: 'adj', d: '2027-01-08', r: 'exp', ln: [{ i: 'A', n: 'باراسيتامول', q: -1, z: 1, x: '06/2027', s: 1 }] }),
  V({ t: 'xfer', d: '2027-01-08', ln: [{ i: 'A', n: 'باراسيتامول', q: 5, z: 1, s: 1, s2: 2 }] }),
  V({ t: 'pay', d: '2027-01-09', ac: '3200', ca: '1101', a: 2000, m: 'سحب المالك' }),
  V({ t: 'sale', d: '2027-01-09', ca: '1101', st: 'void', ln: [{ i: 'B', n: 'شراب', q: 1, z: 1, p: 999999, s: 1 }], pd: 999999 })
];
const ctx = { items, parties, accounts };
for (const v of vouchers) { const e = E.check(v, ctx); if (e) { console.log('FAIL check ' + v.t + ': ' + e); fails++; } }
// invalid examples must be rejected
const bad = [
  [{ t: 'sale', d: '2027-01-03', ca: '1101', ln: [{ i: 'A', q: 1, z: 1, p: 1000 }], pd: 0 }, 'credit sale without customer'],
  [{ t: 'jv', d: '2027-01-03', je: [{ a: '1101', dr: 100 }, { a: '4100', cr: 90 }] }, 'unbalanced jv'],
  [{ t: 'sale', d: '2026-12-31', ca: '1101', ln: [{ i: 'A', q: 1, z: 1, p: 1000 }], pd: 1000 }, 'locked period'],
  [{ t: 'rcpt', d: '2027-01-03', ca: '1101', a: 0, pt: 'c1' }, 'zero receipt']
];
for (const [v, why] of bad) { const e = E.check(v, { ...ctx, lock: '2026-12-31' }); console.log((e ? 'ok   ' : 'FAIL ') + 'rejects ' + why + (e ? ' → ' + e : '')); if (!e) fails++; }

const t0 = Date.now();
const L = E.build({ items, parties, accounts, vouchers });
eq('trial balance dr = cr', L.dr, L.cr);
eq('cash', E.accBalance(L, '1101'), 17000);
eq('customer c1', E.partyBalance(L, 'c1'), 0);
eq('supplier s1', E.partyBalance(L, 's1'), -16400);
const A = L.itm.get('A'), B = L.itm.get('B');
eq('A qty', A.Q, 25); eq('A store1', A.st[1], 20); eq('A store2', A.st[2], 5);
eq('A value', A.V, 16971.15); eq('B qty', B.Q, 4); eq('B value', B.V, 6000);
eq('inventory account = sum of item values', E.accBalance(L, '1300'), A.V + B.V);
eq('capital', -E.accBalance(L, '3100'), 29500);
const pl = E.profitLoss(L, accounts, '2027-01-01', '2027-12-31');
eq('net sales', pl.net, 6000); eq('cogs', pl.cogs, 4250); eq('profit', pl.profit, -3928.85);
const bs = E.balanceSheet(L, accounts, '2027-12-31', parties);
eq('balance sheet balances', bs.check, 0); eq('assets', bs.assetsT, 39971.15); eq('payables', bs.pay, 16400);
const stt = E.statement(L, { p: 'c1', from: '2027-01-02', to: '2027-12-31' });
eq('statement opening', stt.open, 5000); eq('statement close', stt.close, 0); eq('statement rows', stt.rows.length, 3);
const ag = E.aging(L, parties, '2027-01-31');
eq('aging: supplier owed', (ag.find(x => x.p.id === 's1') || {}).bal || 0, 16400);
const ex = E.expiries(L, items, '2027-01-31');
console.log('     expiries:', ex.map(x => x.n + ' ' + x.store + ' ' + (x.x || '—') + ' q=' + x.q).join(' | '));
eq('A: 06/2027 batch moved to store 2 by FEFO transfer', (ex.find(x => x.id === 'A' && x.x === '06/2027' && x.store === 2) || {}).q || 0, 5);
eq('A: 12/2027 batch in store 1', (ex.find(x => x.id === 'A' && x.x === '12/2027' && x.store === 1) || {}).q || 0, 20);
console.log('issues:', L.issues.map(i => i.k));
console.log(fails ? fails + ' FAILED' : 'all passed', '(' + (Date.now() - t0) + ' ms)');
process.exit(fails ? 1 : 0);
