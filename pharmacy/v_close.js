/* الإقفال المحاسبي: فحوصات قبل الإقفال، لقطة ختامية ببصمة، سجل تدقيق، وكشف أي تغيير في فترة مقفلة. للمشرف فقط. */
import { h, icon, toast, confirmBox, put } from './ui.js';
import { money, dmy, today, r2 } from './util.js';
import { build, trialBalance, profitLoss, accBalance, A } from './engine.js';

/* ---------- البصمة ---------- */
const stable = o => Array.isArray(o) ? '[' + o.map(stable).join(',') + ']'
  : o && typeof o === 'object' ? '{' + Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}'
  : JSON.stringify(o === undefined ? null : o);
function cyrb(str, seed) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
async function sha(str) {
  try {
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  return 'x' + cyrb(str, 1) + cyrb(str, 2);
}
/** بصمة كل السندات بتاريخ ≤ date (بما فيها الملغاة): بصمة كلية وبصمة لكل شهر لتحديد موضع أي خلل */
export async function fingerprint(store, date) {
  const vs = [...store.vouchers.values()].filter(v => v && v.d && v.d <= date).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const months = {};
  for (const v of vs) (months[v.d.slice(0, 7)] || (months[v.d.slice(0, 7)] = [])).push(stable(v));
  const mh = {}, mn = {};
  for (const m of Object.keys(months).sort()) { const s = months[m].join('\n'); mh[m] = (await sha(s)).slice(0, 16); mn[m] = months[m].length; }
  return { n: vs.length, hash: await sha(Object.keys(mh).sort().map(m => m + mn[m] + mh[m]).join('|')), mh, mn };
}

/* ---------- الأرقام حتى تاريخ معيّن (تُبنى من السندات حتى ذلك التاريخ فقط) ---------- */
function figures(store, date, from) {
  const vs = [...store.vouchers.values()].filter(v => v && v.d && v.d <= date);
  const L = build({ items: store.items, parties: store.parties, accounts: store.accounts, vouchers: vs });
  const tb = trialBalance(L, store.accounts, '', date), pl = profitLoss(L, store.accounts, from || '', date);
  let stockV = 0, stockQ = 0; const neg = [];
  for (const [id, s] of L.itm) {
    stockV += s.V; stockQ += s.Q;
    if (s.Q < -1e-9 || (s.st[1] || 0) < -1e-9 || (s.st[2] || 0) < -1e-9) { const it = store.items.get(id); neg.push((it && it.n) || id); }
  }
  let recv = 0, pay = 0;
  for (const p of store.parties.values()) { let b = 0; for (const e of L.byP.get(p.id) || []) b += e.dr - e.cr; if (b > 0) recv += b; else pay -= b; }
  return { L, tb, pl, stockV: r2(stockV), invGL: accBalance(L, A.INV, '', date), neg, recv: r2(recv), pay: r2(pay), n: vs.filter(v => v.st !== 'void').length };
}

/** فحوصات الإقفال: أي فحص فاشل يمنع الإقفال */
export function preChecks(store, date) {
  const S = store.settings, st = store.status, out = [];
  const add = (ok, title, detail) => out.push({ ok, title, detail: detail || '' });
  add(/^\d{4}-\d{2}-\d{2}$/.test(date || ''), 'تاريخ الإقفال صحيح');
  add(date <= today(), 'تاريخ الإقفال ليس في المستقبل', date > today() ? 'اختر تاريخاً حتى اليوم.' : '');
  add(!S.lock || date > S.lock, 'بعد آخر قفل (' + (S.lock ? dmy(S.lock) : 'لا يوجد') + ')', S.lock && date <= S.lock ? 'التاريخ يجب أن يكون بعد القفل الحالي. للتراجع استخدم «إعادة فتح».' : '');
  add(st.pending === 0, 'كل السندات على هذا الجهاز وصلت الخادم', st.pending ? st.pending + ' سند لم يُرفع بعد، انتظر المزامنة.' : '');
  add(st.online !== false && st.ready && st.error !== 'permission-denied', 'الاتصال والمزامنة سليمان', st.online === false ? 'لا اتصال بالإنترنت.' : !st.ready ? 'المزامنة لم تكتمل.' : st.error === 'permission-denied' ? 'Firebase يرفض الوصول.' : '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    const f = figures(store, date);
    add(Math.abs(f.tb.dr - f.tb.cr) < 0.01 && !f.L.issues.some(i => i.k === 'unbalanced'), 'ميزان المراجعة متوازن', 'مدين ' + money(f.tb.dr) + ' ، دائن ' + money(f.tb.cr));
    add(Math.abs(f.stockV - f.invGL) < 1, 'قيمة المخزون في الدفتر = مجموع قيم الأصناف', 'الأصناف ' + money(f.stockV) + ' ، الحساب ' + money(f.invGL));
    add(!f.neg.length, 'لا مخزون سالب في الصيدلية أو المخزن', f.neg.length ? f.neg.length + ' صنف: ' + f.neg.slice(0, 6).join('، ') + (f.neg.length > 6 ? '…' : '') + '. صحّحها بتحويل مخزني أو جرد قبل الإقفال.' : '');
  }
  return out;
}

const closes = store => [...store.data.meta.values()].filter(m => m.kind === 'close').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.at || 0) - (b.at || 0)));
export const activeCloses = store => closes(store).filter(c => !c.reopened);

/** يقارن البصمة الحالية بكل لقطة إقفال سارية. يعيد قائمة بما اختلّ. */
export async function integrity(store) {
  const bad = [];
  for (const c of activeCloses(store)) {
    const now = await fingerprint(store, c.date);
    if (now.hash === c.hash) continue;
    const months = [];
    for (const m of new Set([...Object.keys(c.mh || {}), ...Object.keys(now.mh)])) if ((c.mh || {})[m] !== now.mh[m]) months.push(m);
    bad.push({ c, now, months: months.sort() });
  }
  return bad;
}

/* ---------- الشاشة ---------- */
export function closeView(ctx) {
  const { store } = ctx;
  if (!ctx.can('settings')) return { title: 'الإقفال والتدقيق', el: h('div', { class: 'note bad' }, 'للمشرف فقط.') };
  const root = h('div');
  const D = { date: today() };
  const latest = () => activeCloses(store).slice(-1)[0];
  const log = async (action, extra) => store.put('meta', 'lock_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), Object.assign({ kind: 'lockLog', action, by: store.user.uid, bn: store.user.name, at: Date.now() }, extra));
  const setLock = d => store.put('meta', 'settings', Object.assign({}, store.settings, { kind: 'settings', lock: d }));

  async function doClose() {
    const checks = preChecks(store, D.date);
    if (checks.some(c => !c.ok)) { toast('لا يمكن الإقفال: أصلح الفحوصات الحمراء أولاً', { bad: true }); return; }
    const prev = latest(), from = prev ? prev.date : '';
    const f = figures(store, D.date, from ? addDay(from) : '');
    if (!(await confirmBox('إقفال حتى ' + dmy(D.date), 'لن يمكن إضافة أو إلغاء أي سند بهذا التاريخ أو قبله. ربح الفترة ' + money(f.pl.profit) + '، وقيمة المخزون ' + money(f.stockV) + '، وعدد السندات ' + f.n + '. تُحفظ لقطة ببصمة لكشف أي تغيير لاحق. أكمل؟', 'إقفال'))) return;
    const fp = await fingerprint(store, D.date);
    const id = 'close_' + D.date + '_' + Date.now().toString(36);
    await store.put('meta', id, { kind: 'close', date: D.date, from: from ? addDay(from) : '', at: Date.now(), by: store.user.uid, bn: store.user.name, n: fp.n, hash: fp.hash, mh: fp.mh, mn: fp.mn,
      tbDr: f.tb.dr, tbCr: f.tb.cr, sales: f.pl.net, cogs: f.pl.cogs, exp: f.pl.expT, profit: f.pl.profit, stockV: f.stockV, recv: f.recv, pay: f.pay });
    await log('close', { date: D.date, prev: store.settings.lock || '', ref: id });
    await setLock(D.date);
    toast('أُقفلت الفترة حتى ' + dmy(D.date));
    draw();
  }
  async function doReopen() {
    const c = latest(); if (!c) return;
    const why = (prompt('سبب إعادة فتح الفترة حتى ' + dmy(c.date) + ' (إلزامي ويُسجَّل باسمك)') || '').trim();
    if (why.length < 4) { toast('اكتب سبباً واضحاً', { bad: true }); return; }
    if (!(await confirmBox('إعادة فتح الفترة', 'ستُفتح الفترة حتى ' + dmy(c.date) + ' ويصبح تعديلها ممكناً، وتُسجَّل العملية والسبب. بعد التعديل أعد الإقفال لتُحفظ لقطة جديدة.', 'إعادة فتح', true))) return;
    const rest = activeCloses(store).filter(x => x.id !== c.id), back = rest.length ? rest[rest.length - 1].date : '';
    await store.put('meta', c.id, { reopened: { by: store.user.uid, bn: store.user.name, at: Date.now(), why } }, true);
    await log('reopen', { date: c.date, to: back, why, ref: c.id });
    await setLock(back);
    toast('أُعيد فتح الفترة');
    draw();
  }
  const addDay = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };
  const when = ms => { const d = new Date(ms); return dmy(d.toISOString().slice(0, 10)) + ' ' + d.toTimeString().slice(0, 5); };
  const ln = (k, v, cls, sub) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, k), sub ? h('small', null, sub) : null), h('span', { class: 'v num ' + (cls || ''), style: { fontSize: '15px' } }, v));

  async function draw() {
    root.textContent = '';
    const S = store.settings, last = latest(), checks = preChecks(store, D.date), okAll = checks.every(c => c.ok);
    const intg = h('div', null, h('div', { class: 'note' }, 'جارٍ فحص سلامة الفترات المقفلة…'));
    put(root,
      h('section', { class: 'page' },
        h('div', { class: 'ph' }, h('h2', null, 'حالة الإقفال'), h('div', { class: 'meta' }, S.lock ? 'مقفل حتى ' + dmy(S.lock) : 'لا توجد فترة مقفلة')),
        last ? ln('آخر إقفال', dmy(last.date), '', 'بواسطة ' + (last.bn || '') + ' في ' + when(last.at)) : null,
        last ? ln('ربح الفترة المقفلة', money(last.profit), last.profit < 0 ? 'red' : 'green') : null,
        last ? ln('قيمة المخزون', money(last.stockV)) : null,
        S.lock && (!last || last.date !== S.lock) ? h('div', { class: 'note bad' }, 'تاريخ القفل (' + dmy(S.lock) + ') لا يطابق آخر لقطة إقفال. القفل غُيّر خارج هذه الشاشة، فلا لقطة تحميه.') : null),
      intg,
      h('h3', { class: 'sect' }, 'إقفال فترة جديدة'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'اختر آخر يوم في الشهر أو السنة. تُفحص الدفاتر أولاً، فإن سلمت تُحفظ لقطة ببصمة ثم تُقفل الفترة.'),
      h('div', { class: 'row2' }, h('input', { type: 'date', value: D.date, max: today(), on: { change: e => { D.date = e.target.value; draw(); } } }),
        h('button', { class: 'btn', disabled: !okAll, on: { click: doClose } }, icon('check', 20), 'إقفال')),
      h('section', { class: 'page tight' }, checks.map(c => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, (c.ok ? '✓ ' : '✗ ') + c.title), c.detail ? h('small', null, c.detail) : null), h('span', { class: 'v ' + (c.ok ? 'green' : 'red') }, c.ok ? 'سليم' : 'خلل')))),
      last ? h('button', { class: 'btn ghost wide', style: { color: 'var(--red)', marginTop: '10px' }, on: { click: doReopen } }, 'إعادة فتح آخر إقفال (بسبب مسجّل)') : null,
      h('h3', { class: 'sect' }, 'سجل الإقفال والفتح'),
      h('section', { class: 'page tight' }, (() => {
        const L = [...store.data.meta.values()].filter(m => m.kind === 'lockLog').sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30);
        return L.length ? L.map(m => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, m.action === 'reset' ? 'تصفير بيانات التجربة (' + (m.n || 0) + ' سنداً) في ' + dmy(m.date) : (m.action === 'close' ? 'إقفال حتى ' : 'إعادة فتح ') + dmy(m.date)), h('small', null, m.bn + '، ' + when(m.at) + (m.why ? '، السبب: ' + m.why : ''))))) : [h('p', { class: 'empty' }, 'لا عمليات بعد.')];
      })()));
    // فحص السلامة بعد رسم الشاشة (يحسب البصمات)
    const bad = await integrity(store);
    intg.textContent = '';
    if (!activeCloses(store).length) { intg.remove(); return; }
    if (!bad.length) put(intg, h('div', { class: 'note good' }, '✓ سلامة الفترات المقفلة: لا يوجد أي تغيير في سنداتها منذ الإقفال.'));
    else for (const b of bad) put(intg, h('div', { class: 'note bad' }, 'اختلال في الفترة المقفلة حتى ' + dmy(b.c.date) + ': عدد السندات ' + b.c.n + ' عند الإقفال و' + b.now.n + ' الآن' + (b.months.length ? '، والأشهر المتأثرة: ' + b.months.join('، ') : '') + '. راجع سندات هذه الأشهر في «كل السندات» (قد يكون سنداً أُضيف أو أُلغي أو عُدّل بعد الإقفال).'));
  }
  draw();
  return { title: 'الإقفال والتدقيق', el: root };
}

/** للصفحة الرئيسية: يعيد عنصراً يظهر عند وجود اختلال فقط */
export function integrityBanner(ctx) {
  const box = h('div');
  if (!ctx.can('settings') || !activeCloses(ctx.store).length) return box;
  integrity(ctx.store).then(bad => {
    if (bad.length) put(box, h('a', { class: 'note bad', href: '#/close', style: { display: 'block' } }, 'تنبيه: تغيّر شيء في فترة مقفلة (حتى ' + dmy(bad[0].c.date) + '). اضغط للتفاصيل.'));
  }).catch(() => {});
  return box;
}
