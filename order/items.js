/* قاعدة الأصناف على الجوال: الدمج، البحث، الباركود، وما تعلّمه التطبيق من تصحيحاتك. */
import { buildIndex, byCode, match, tokens } from './ocr.js';
import * as DB from './db.js';

export const C = { ix: null, n: 0, at: 0, cost: new Map(), learned: new Map(), links: {}, prices: {}, suppliers: [], companies: [] };

/** يدمج قاعدة الأصناف (الجرد) مع أصناف نظام الحسابات: الباركودات الجديدة والأصناف المضافة لاحقاً */
export function merge(cat, acc) {
  const co = (cat && cat.co || []).slice(), un = (cat && cat.un || []).slice(), it = (cat && cat.it || []).map(r => r.slice());
  const coIx = new Map(co.map((c, k) => [c, k])), unIx = new Map(un.map((u, k) => [u, k])), byId = new Map(it.map((r, k) => [String(r[0]), k]));
  const idx = (arr, map, v) => { v = v || ''; if (!map.has(v)) { map.set(v, arr.length); arr.push(v); } return map.get(v); };
  const cost = new Map();
  for (const x of (acc && acc.items) || []) {
    const bcs = new Set((x.bc || []).filter(Boolean));
    for (const u of x.u || []) { if (u.b) bcs.add(u.b); for (const b of u.bx || []) if (b) bcs.add(b); }
    if (x.c0) cost.set(String(x.id), +x.c0);
    const k = byId.get(String(x.id));
    if (k != null) {
      const r = it[k], have = new Set(String(r[1] || '').split('|').filter(Boolean));
      for (const b of bcs) have.add(b);
      r[1] = [...have].join('|');
    } else {
      it.push([String(x.id), [...bcs].join('|'), x.n || '', idx(un, unIx, (x.u && x.u[0] && x.u[0].n) || ''), idx(co, coIx, x.co || ''), 0, '']);
      byId.set(String(x.id), it.length - 1);
    }
  }
  return { cat: { co, un, it }, cost };
}

export async function load() {
  const [cat, acc, learned, links, prices] = await Promise.all([DB.get('catalog'), DB.get('acc'), DB.get('learned'), DB.get('links'), DB.get('prices')]);
  C.learned = new Map(Object.entries(learned || {}));
  C.links = links || {}; C.prices = prices || {};
  C.suppliers = (acc && acc.parties) || [];
  if (cat || acc) setData(cat, acc);
  return !!C.ix;
}
export function setData(cat, acc) {
  const m = merge(cat, acc);
  C.ix = buildIndex(m.cat); C.cost = m.cost; C.n = C.ix.N;
  C.at = Math.max((cat && cat.at) || 0, (acc && acc.at) || 0);
  C.companies = (cat && cat.co || []).filter(c => c && c.length > 2 && !/^[-~k]+$/.test(c));
  C.suppliers = (acc && acc.parties) || C.suppliers;
}

/** بحث نصي: كل الكلمات يجب أن تظهر في الاسم؛ الأقرب أولاً. يقبل الباركود أيضاً */
export function search(q, limit) {
  if (!C.ix) return [];
  q = String(q || '').trim();
  if (!q) return [];
  if (/^\d{6,}$/.test(q) || /^\(01\)/.test(q)) { const r = byCode(C.ix, q, C.links); return r.it ? [r.it] : []; }
  const tk = tokens(q);
  if (!tk.length) return [];
  const out = [];
  for (const it of C.ix.items) {
    const N = it.n.toUpperCase();
    let ok = true, score = 0;
    for (const t of tk) { const p = N.indexOf(t); if (p < 0) { ok = false; break; } score += p === 0 ? 3 : /\W/.test(N[p - 1] || ' ') ? 2 : 1; }
    if (ok) out.push([score - N.length / 200, it]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit || 60).map(x => x[1]);
}

export function lookupCode(raw) { return C.ix ? byCode(C.ix, raw, C.links) : { it: null, p: null }; }
export const identify = a => C.ix ? match(C.ix, a, C.learned) : [];
export const item = id => C.ix ? C.ix.byId.get(String(id)) : null;

/**
 * يتعلّم من اختيارك: الاسم المقروء ← الصنف، والباركود غير المعروف ← الصنف.
 * المرة القادمة يظهر الصنف الصحيح أولاً.
 */
export async function learn(a, itemId, bc) {
  let ch = false;
  if (a && a.name) {
    const w = tokens(a.name).filter(t => t.length >= 3 && !/^\d/.test(t))[0];
    const top = identify(a)[0];
    if (w && (!top || top.it.i !== String(itemId) || top.conf !== 'high')) { C.learned.set(w, String(itemId)); ch = true; }
  }
  if (bc && C.ix && !C.ix.byBc.get(bc)) { C.links[bc] = String(itemId); await DB.set('links', C.links); }
  if (ch) await DB.set('learned', Object.fromEntries(C.learned));
}
export async function rememberPrice(id, p) {
  if (!id || !(p > 0)) return;
  C.prices[id] = { p, d: Date.now() };
  await DB.set('prices', C.prices);
}
/** آخر سعر شراء: من طلبياتك السابقة، وإلا تكلفة الصنف في نظام الحسابات */
export function lastPrice(id) {
  const x = C.prices[id];
  if (x && x.p) return { p: x.p, src: 'آخر طلبية' };
  const c = C.cost.get(String(id));
  return c ? { p: c, src: 'تكلفة النظام' } : null;
}
