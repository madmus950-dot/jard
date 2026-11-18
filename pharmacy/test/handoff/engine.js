/*
 * المحرك المحاسبي.
 * لا يُخزَّن أي رصيد في القاعدة: الأرصدة والمخزون والتكلفة والأرباح تُحسب كلها من السندات نفسها
 * بالترتيب الزمني، فلا يمكن أن يختلف رصيد عن حركته. كل سند يولّد قيداً متوازناً (مدين = دائن).
 */
import { r2, expKey, monthsLeft, daysBetween } from './util.js';

export const TYPES = {
  open: 'قيد افتتاحي', sale: 'فاتورة بيع', sret: 'مرتجع مبيعات', pur: 'فاتورة شراء', pret: 'مرتجع مشتريات',
  rcpt: 'سند قبض', pay: 'سند صرف', cxf: 'تحويل نقدية', jv: 'قيد يومية', adj: 'تسوية مخزون', xfer: 'تحويل مخزني'
};

/* دليل الحسابات الأساسي. النوع يحدد مكانه في الميزانية أو الأرباح. */
export const DEFAULT_ACCOUNTS = [
  ['1101', 'الصندوق', 'cash'],
  ['1200', 'العملاء', 'ar'],
  ['1300', 'المخزون', 'inv'],
  ['2100', 'الموردون', 'ap'],
  ['2200', 'الموظفون', 'emp'],
  ['2300', 'أطراف أخرى', 'oth'],
  ['3100', 'رأس المال', 'eq'],
  ['3200', 'مسحوبات المالك', 'eq'],
  ['4100', 'المبيعات', 'rev'],
  ['4200', 'مردودات المبيعات', 'rev'],
  ['4300', 'الخصم المسموح به', 'rev'],
  ['4400', 'إيرادات أخرى', 'rev'],
  ['5100', 'تكلفة المبيعات', 'cogs'],
  ['5200', 'عجز وفروقات الجرد', 'exp'],
  ['5300', 'أصناف منتهية وتالفة', 'exp'],
  ['6100', 'الإيجار', 'exp'],
  ['6200', 'الرواتب والأجور', 'exp'],
  ['6300', 'الكهرباء والماء', 'exp'],
  ['6400', 'الاتصالات والإنترنت', 'exp'],
  ['6500', 'النقل والمواصلات', 'exp'],
  ['6600', 'الصيانة', 'exp'],
  ['6700', 'الرسوم والضرائب والزكاة', 'exp'],
  ['6800', 'الضيافة والنثريات', 'exp'],
  ['6900', 'مصروفات أخرى', 'exp'],
  ['6950', 'ديون معدومة', 'exp']
].map(([id, n, k]) => ({ id, n, k, sys: true }));

export const A = { CASH: '1101', AR: '1200', INV: '1300', AP: '2100', EMP: '2200', OTH: '2300', CAP: '3100', DRAW: '3200',
  SALES: '4100', SRET: '4200', DISC: '4300', OTHINC: '4400', COGS: '5100', DIFF: '5200', EXPD: '5300' };
export const CTRL = { c: A.AR, s: A.AP, e: A.EMP, o: A.OTH };
export const PARTY_TYPES = { c: 'عميل', s: 'مورد', e: 'موظف', o: 'طرف آخر' };
export const ASSET = new Set(['cash', 'ar', 'inv', 'asset']);
export const LIAB = new Set(['ap', 'emp', 'oth', 'liab']);
export const ADJ_REASONS = { count: 'نتيجة جرد', exp: 'أصناف منتهية', dmg: 'تالف', use: 'استخدام داخلي', found: 'زيادة' };
export const STORES = { 1: 'الصيدلية', 2: 'المخزن' };

const toMap = x => x instanceof Map ? x : new Map(Object.entries(x || {}));
const sortKey = v => (v.d || '') + '|' + String(v.at || 0).padStart(15, '0') + '|' + (v.id || '');

/** إجماليات الفاتورة/السند كما تُحسب في كل مكان (الشاشة، الطباعة، المحرك). */
export function totals(v) {
  const t = v.t;
  if (t === 'sale' || t === 'sret') {
    const gross = r2((v.ln || []).reduce((s, l) => s + (+l.q || 0) * (+l.p || 0), 0));
    const ds = r2(Math.min(+v.ds || 0, gross)), tot = r2(gross - ds), pd = r2(+v.pd || 0);
    return { gross, ds, tot, pd, credit: r2(tot - pd) };
  }
  if (t === 'pur' || t === 'pret') {
    const gross = r2((v.ln || []).reduce((s, l) => s + (+l.q || 0) * (+l.c || 0), 0));
    const ds = r2(Math.min(+v.ds || 0, gross)), tot = r2(gross - ds), pd = r2(+v.pd || 0);
    return { gross, ds, tot, pd, credit: r2(tot - pd) };
  }
  if (t === 'rcpt' || t === 'pay' || t === 'cxf') { const a = r2(+v.a || 0); return { gross: a, ds: 0, tot: a, pd: a, credit: 0 }; }
  if (t === 'jv') { const a = r2((v.je || []).reduce((s, e) => s + (+e.dr || 0), 0)); return { gross: a, ds: 0, tot: a, pd: 0, credit: 0 }; }
  return { gross: 0, ds: 0, tot: 0, pd: 0, credit: 0 };
}

/** وصف السطر في كشف الحساب */
export function describe(v, tt) {
  const no = v.no ? ' ' + v.no : '';
  const memo = v.m ? '، ' + v.m : '';
  switch (v.t) {
    case 'sale': return (tt && tt.credit > 0.004 ? 'فاتورة بيع آجل' : 'فاتورة بيع') + no + memo;
    case 'sret': return 'مرتجع مبيعات' + no + memo;
    case 'pur': return 'فاتورة شراء' + no + (v.inv ? ' (فاتورة المورد ' + v.inv + ')' : '') + memo;
    case 'pret': return 'مرتجع مشتريات' + no + memo;
    case 'rcpt': return 'سند قبض' + no + memo;
    case 'pay': return 'سند صرف' + no + memo;
    case 'open': return 'رصيد افتتاحي' + memo;
    case 'jv': return 'قيد يومية' + no + memo;
    case 'cxf': return 'تحويل نقدية' + no + memo;
    case 'adj': return 'تسوية مخزون' + no + (v.r ? ' (' + (ADJ_REASONS[v.r] || v.r) + ')' : '') + memo;
    case 'xfer': return 'تحويل مخزني' + no + memo;
    default: return (TYPES[v.t] || v.t) + no + memo;
  }
}

/**
 * يتحقق من السند قبل حفظه. يعيد نص الخطأ أو null.
 * ctx: { items: Map, parties: Map, accounts: Map, lock: 'YYYY-MM-DD' (لا سندات بتاريخ قبله أو فيه) }
 */
export function check(v, ctx = {}) {
  const items = toMap(ctx.items), parties = toMap(ctx.parties), accounts = toMap(ctx.accounts);
  if (!TYPES[v.t]) return 'نوع سند غير معروف';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.d || '')) return 'التاريخ غير صحيح';
  if (ctx.lock && v.d <= ctx.lock) return 'الفترة حتى ' + ctx.lock + ' مقفلة. لا يمكن إضافة سند بتاريخ فيها.';
  if (v.pt && !parties.has(v.pt)) return 'الحساب المختار غير موجود';
  if (v.ca && !accounts.has(v.ca)) return 'الصندوق المختار غير موجود';
  const ln = v.ln || [];
  if (['sale', 'sret', 'pur', 'pret', 'adj', 'xfer'].includes(v.t)) {
    if (!ln.length) return 'أضف صنفاً واحداً على الأقل';
    for (const l of ln) {
      if (!l.i || !(items.has(l.i) || l.n)) return 'صنف غير معروف في الفاتورة';
      if (!(+l.z > 0)) return 'وحدة غير صحيحة للصنف ' + (l.n || '');
      if (v.t === 'adj') { if (!(+l.q) || !isFinite(+l.q)) return 'كمية التسوية للصنف ' + (l.n || '') + ' غير صحيحة'; continue; }
      if (v.t === 'pur' || v.t === 'pret') { if (!((+l.q || 0) > 0 || (+l.f || 0) > 0) || +l.q < 0 || +l.f < 0) return 'الكمية للصنف ' + (l.n || '') + ' غير صحيحة'; }
      else if (!(+l.q > 0)) return 'الكمية للصنف ' + (l.n || '') + ' غير صحيحة';
      if ((v.t === 'sale' || v.t === 'sret') && !(+l.p >= 0)) return 'سعر الصنف ' + (l.n || '') + ' غير صحيح';
      if ((v.t === 'pur' || v.t === 'pret') && !(+l.c >= 0)) return 'تكلفة الصنف ' + (l.n || '') + ' غير صحيحة';
      if (v.t === 'xfer' && (!STORES[l.s] || !STORES[l.s2] || l.s === l.s2)) return 'اختر مخزناً مختلفاً للتحويل';
    }
  }
  const tt = totals(v);
  if (['sale', 'sret', 'pur', 'pret'].includes(v.t)) {
    if (+v.ds < 0) return 'الخصم لا يكون سالباً';
    if (+v.ds > tt.gross + 0.004) return 'الخصم أكبر من الإجمالي';
    if (tt.pd < 0) return 'المبلغ المدفوع لا يكون سالباً';
    if (tt.pd > 0 && !v.ca) return 'اختر الصندوق';
    if (!v.pt && Math.abs(tt.credit) > 0.004) {
      return v.t === 'sale' ? 'البيع الآجل يحتاج اسم العميل' : v.t === 'pur' ? 'الشراء الآجل يحتاج اسم المورد' : 'اختر الحساب أو اجعل المبلغ كله نقداً';
    }
  }
  if (v.t === 'rcpt' || v.t === 'pay') {
    if (!(tt.tot > 0)) return 'اكتب المبلغ';
    if (!v.ca) return 'اختر الصندوق';
    if (!v.pt && !v.ac) return v.t === 'rcpt' ? 'اختر ممن القبض' : 'اختر لمن الصرف أو نوع المصروف';
    if (v.ac && !accounts.has(v.ac)) return 'الحساب غير موجود';
    if (v.ac && ['cash', 'ar', 'ap', 'emp', 'oth', 'inv'].includes((accounts.get(v.ac) || {}).k)) return 'اختر الحساب من القائمة';
  }
  if (v.t === 'cxf') {
    if (!(tt.tot > 0)) return 'اكتب المبلغ';
    if (!v.ca || !v.ca2 || v.ca === v.ca2) return 'اختر صندوقين مختلفين';
    if (!accounts.has(v.ca2)) return 'الصندوق غير موجود';
  }
  if (v.t === 'jv') {
    const je = v.je || [];
    if (je.length < 2) return 'القيد يحتاج سطرين على الأقل';
    let dr = 0, cr = 0;
    for (const e of je) {
      if (!accounts.has(e.a)) return 'حساب غير موجود في القيد';
      if ((+e.dr || 0) < 0 || (+e.cr || 0) < 0) return 'لا تُكتب مبالغ سالبة في القيد';
      if (e.pt && !parties.has(e.pt)) return 'طرف غير موجود في القيد';
      const k = (accounts.get(e.a) || {}).k;
      if (['ar', 'ap', 'emp', 'oth'].includes(k) && !e.pt) return 'اختر اسم الطرف لسطر ' + (accounts.get(e.a) || {}).n;
      dr += +e.dr || 0; cr += +e.cr || 0;
    }
    if (!(dr > 0)) return 'القيد بلا مبالغ';
    if (Math.abs(r2(dr) - r2(cr)) > 0.004) return 'القيد غير متوازن: المدين ' + r2(dr) + ' والدائن ' + r2(cr);
  }
  if (v.t === 'open') {
    for (const l of ln) if (!(+l.q > 0) || !(+l.c >= 0) || !(+l.z > 0)) return 'سطر مخزون افتتاحي غير صحيح: ' + (l.n || l.i);
    for (const b of v.pb || []) if (!parties.has(b.pt)) return 'طرف غير موجود في الأرصدة الافتتاحية';
    for (const b of v.cb || []) if (!accounts.has(b.ca)) return 'صندوق غير موجود في الأرصدة الافتتاحية';
  }
  return null;
}

/* ---------------------------------------------------------------- */

function newItemState() {
  return { Q: 0, V: 0, st: { 1: 0, 2: 0 }, bt: { 1: new Map(), 2: new Map() }, lastC: 0, lastIn: '', lastOut: '', lastSale: '', sold: 0, soldV: 0 };
}

/**
 * يبني الدفاتر كلها من السندات.
 * data: { items, parties, accounts (Map أو كائن), vouchers: [] }
 * يعيد L: القيود، أرصدة الحسابات والأطراف، المخزون والتكلفة لكل صنف، وملاحظات.
 */
export function build(data) {
  const items = toMap(data.items), parties = toMap(data.parties), accounts = toMap(data.accounts);
  const vs = (data.vouchers || []).filter(v => v && v.st !== 'void' && TYPES[v.t]).slice().sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);
  const L = {
    post: [], acc: new Map(), pty: new Map(), itm: new Map(), mv: new Map(), vm: new Map(),
    byP: new Map(), byA: new Map(), issues: [], days: new Map(), first: vs.length ? vs[0].d : '', last: vs.length ? vs[vs.length - 1].d : ''
  };
  const it = id => { let s = L.itm.get(id); if (!s) { s = newItemState(); L.itm.set(id, s); } return s; };
  const master = id => items.get(id) || {};
  const avg = (id) => { const s = it(id); return s.Q > 1e-9 ? s.V / s.Q : (s.lastC || +master(id).c0 || 0); };
  const day = d => { let x = L.days.get(d); if (!x) { x = { sales: 0, cash: 0, credit: 0, ret: 0, cost: 0, n: 0, pur: 0, rc: 0, py: 0, exp: 0 }; L.days.set(d, x); } return x; };

  function ctrlOf(pt) { const p = parties.get(pt); return (p && CTRL[p.t]) || A.OTH; }
  function post(v, a, p, dr, cr, memo) {
    dr = r2(dr); cr = r2(cr);
    if (dr < 0) { cr = r2(cr - dr); dr = 0; }
    if (cr < 0) { dr = r2(dr - cr); cr = 0; }
    if (!dr && !cr) return;
    const e = { v, d: v.d, a, p: p || '', dr, cr, m: memo || '' };
    L.post.push(e);
    let x = L.acc.get(a); if (!x) { x = { dr: 0, cr: 0 }; L.acc.set(a, x); } x.dr = r2(x.dr + dr); x.cr = r2(x.cr + cr);
    let la = L.byA.get(a); if (!la) { la = []; L.byA.set(a, la); } la.push(e);
    if (p) {
      let y = L.pty.get(p); if (!y) { y = { dr: 0, cr: 0, last: '', lastPay: '', n: 0 }; L.pty.set(p, y); }
      y.dr = r2(y.dr + dr); y.cr = r2(y.cr + cr); y.last = v.d; y.n++;
      if ((v.t === 'rcpt' || v.t === 'pay') || ((v.t === 'sale' || v.t === 'pur') && +v.pd > 0)) y.lastPay = v.d;
      let lp = L.byP.get(p); if (!lp) { lp = []; L.byP.set(p, lp); } lp.push(e);
    }
  }
  function addBatch(s, store, x, q) { const m = s.bt[store] || (s.bt[store] = new Map()); const k = x || ''; m.set(k, (m.get(k) || 0) + q); if (Math.abs(m.get(k)) < 1e-9) m.delete(k); }
  /** يخرج من الدفعات: المحددة أولاً ثم الأقرب انتهاءً. يعيد ما أُخذ من كل دفعة. */
  function takeBatch(s, store, x, q) {
    const m = s.bt[store] || (s.bt[store] = new Map()), taken = [];
    const take = (k, t) => { const have = m.get(k); m.set(k, have - t); if (Math.abs(have - t) < 1e-9) m.delete(k); taken.push({ k, q: t }); q -= t; };
    if (x && m.has(x) && m.get(x) > 1e-9) take(x, Math.min(m.get(x), q));
    if (q > 1e-9) {
      const keys = [...m.keys()].filter(k => m.get(k) > 1e-9).sort((a, b) => expKey(a) - expKey(b));
      for (const k of keys) { if (q <= 1e-9) break; take(k, Math.min(m.get(k), q)); }
    }
    if (q > 1e-9) { addBatch(s, store, x || '', -q); taken.push({ k: x || '', q }); }
    return taken;
  }
  function move(v, l, q, value, store, extra) {
    let arr = L.mv.get(l.i); if (!arr) { arr = []; L.mv.set(l.i, arr); }
    arr.push(Object.assign({ v, d: v.d, q, value: r2(value), s: store, x: l.x || '' }, extra || {}));
  }
  /** إدخال كمية بقيمة (شراء، افتتاحي، مرتجع بيع، زيادة جرد) */
  let resid = 0;
  function inn(v, l, q, value, store) {
    const s = it(l.i); value = r2(value);
    s.Q += q; s.V = r2(s.V + value); s.st[store] = (s.st[store] || 0) + q; addBatch(s, store, l.x, q);
    if (Math.abs(s.Q) < 1e-9) { s.Q = 0; resid = r2(resid + s.V); s.V = 0; }
    s.lastIn = v.d;
    return value;
  }
  /** إخراج كمية بالتكلفة المتوسطة. يعيد التكلفة. */
  function out(v, l, q, store) {
    const s = it(l.i); const a = avg(l.i);
    if (s.Q - q < -1e-9 && !(v._neg)) L.issues.push({ k: 'neg', v, i: l.i, n: l.n, have: s.st[store] || 0, q });
    let cost = r2(a * q);
    s.Q -= q; s.V = r2(s.V - cost); s.st[store] = (s.st[store] || 0) - q; takeBatch(s, store, l.x, q);
    if (Math.abs(s.Q) < 1e-9) { s.Q = 0; cost = r2(cost + s.V); s.V = 0; }
    s.lastOut = v.d;
    return cost;
  }

  for (const v of vs) {
    resid = 0;
    const tt = totals(v), memo = describe(v, tt);
    const meta = { tot: tt.tot, cost: 0, gp: 0, credit: tt.credit, pd: tt.pd, gross: tt.gross, ds: tt.ds };
    L.vm.set(v.id, meta);
    const ca = v.ca || A.CASH;
    const st = l => (l.s === 2 || l.s === '2') ? 2 : 1;
    switch (v.t) {
      case 'open': {
        let assets = 0, liab = 0;
        for (const l of v.ln || []) { const q = +l.q * +l.z; const val = inn(v, l, q, +l.q * +l.c, st(l)); move(v, l, q, val, st(l), { k: 'open' }); assets += val; }
        if (assets) post(v, A.INV, '', assets, 0, memo);
        for (const b of v.pb || []) { const amt = r2(+b.b || 0); if (!amt) continue; post(v, ctrlOf(b.pt), b.pt, amt, 0, memo); if (amt > 0) assets += amt; else liab += -amt; }
        for (const b of v.cb || []) { const amt = r2(+b.b || 0); if (!amt) continue; post(v, b.ca, '', amt, 0, memo); if (amt > 0) assets += amt; else liab += -amt; }
        const cap = r2(assets - liab);
        post(v, A.CAP, '', 0, cap, memo);
        meta.tot = cap;
        break;
      }
      case 'sale': case 'sret': {
        const sign = v.t === 'sale' ? 1 : -1;
        let cost = 0;
        const k = tt.gross > 0 ? (tt.gross - tt.ds) / tt.gross : 1;
        for (const l of v.ln || []) {
          const q = +l.q * +l.z, amt = r2(+l.q * +l.p * k);
          if (sign > 0) {
            const c = out(v, l, q, st(l)); cost += c; move(v, l, -q, -c, st(l), { k: 'sale', amt, pt: v.pt || '' });
            const s = it(l.i); s.lastSale = v.d; s.sold += q; s.soldV = r2(s.soldV + amt);
          } else {
            const c = r2(avg(l.i) * q); inn(v, l, q, c, st(l)); cost -= c; move(v, l, q, c, st(l), { k: 'sret', amt: -amt, pt: v.pt || '' });
            const s = it(l.i); s.sold -= q; s.soldV = r2(s.soldV - amt);
          }
        }
        cost = r2(cost);
        // الإيراد بالإجمالي، والخصم في حسابه، والتكلفة مقابل المخزون
        if (sign > 0) { post(v, A.SALES, '', 0, tt.gross, memo); if (tt.ds) post(v, A.DISC, '', tt.ds, 0, memo); }
        else { post(v, A.SRET, '', tt.gross, 0, memo); if (tt.ds) post(v, A.DISC, '', 0, tt.ds, memo); }
        if (tt.pd) post(v, ca, '', sign * tt.pd, 0, memo);
        if (Math.abs(tt.credit) > 0.004) post(v, v.pt ? ctrlOf(v.pt) : A.AR, v.pt, sign * tt.credit, 0, memo);
        if (cost) { post(v, A.COGS, '', cost, 0, memo); post(v, A.INV, '', 0, cost, memo); }
        meta.cost = sign > 0 ? cost : -cost; meta.gp = r2(sign * tt.tot - cost);
        const dd = day(v.d);
        if (sign > 0) { dd.sales = r2(dd.sales + tt.tot); dd.cash = r2(dd.cash + tt.pd); dd.credit = r2(dd.credit + tt.credit); dd.n++; }
        else { dd.ret = r2(dd.ret + tt.tot); dd.cash = r2(dd.cash - tt.pd); dd.credit = r2(dd.credit - tt.credit); }
        dd.cost = r2(dd.cost + cost);
        break;
      }
      case 'pur': case 'pret': {
        const sign = v.t === 'pur' ? 1 : -1;
        const k = tt.gross > 0 ? (tt.gross - tt.ds) / tt.gross : 1;
        let inv = 0, lastL = null;
        for (const l of v.ln || []) {
          lastL = l;
          const val = r2((+l.q || 0) * (+l.c || 0) * k);
          if (sign > 0) {
            const q = ((+l.q || 0) + (+l.f || 0)) * +l.z;
            inn(v, l, q, val, st(l)); if (q > 0) it(l.i).lastC = val / q; inv += val; move(v, l, q, val, st(l), { k: 'pur', pt: v.pt || '' });
          } else {
            const q = ((+l.q || 0) + (+l.f || 0)) * +l.z; const s = it(l.i);   // يرجع المجاني مع المدفوع
            // المرتجع يخرج بقيمته في الفاتورة، والفرق عن المتوسط يبقى في قيمة الصنف
            if (s.Q - q < -1e-9) L.issues.push({ k: 'neg', v, i: l.i, n: l.n, have: s.st[st(l)] || 0, q });
            s.Q -= q; s.V = r2(s.V - val); s.st[st(l)] = (s.st[st(l)] || 0) - q; takeBatch(s, st(l), l.x, q);
            let adj = 0; if (Math.abs(s.Q) < 1e-9) { s.Q = 0; adj = s.V; s.V = 0; }
            inv += val; move(v, l, -q, -val, st(l), { k: 'pret', pt: v.pt || '' });
            if (adj) { post(v, A.COGS, '', adj, 0, memo); post(v, A.INV, '', 0, adj, memo); }
          }
        }
        inv = r2(inv);
        // فرق تقريب توزيع الخصم يذهب للمخزون حتى يتوازن القيد
        const diff = r2(tt.tot - inv);
        if (diff && lastL) { inv = r2(inv + diff); const s = it(lastL.i); s.V = r2(s.V + sign * diff); }
        post(v, A.INV, '', sign > 0 ? inv : 0, sign > 0 ? 0 : inv, memo);
        if (tt.pd) post(v, ca, '', sign > 0 ? 0 : tt.pd, sign > 0 ? tt.pd : 0, memo);
        if (Math.abs(tt.credit) > 0.004) post(v, v.pt ? ctrlOf(v.pt) : A.AP, v.pt, sign > 0 ? 0 : tt.credit, sign > 0 ? tt.credit : 0, memo);
        const dd = day(v.d); dd.pur = r2(dd.pur + sign * tt.tot);
        break;
      }
      case 'rcpt': {
        post(v, ca, '', tt.tot, 0, memo);
        if (v.pt) post(v, ctrlOf(v.pt), v.pt, 0, tt.tot, memo); else post(v, v.ac, '', 0, tt.tot, memo);
        const dd = day(v.d); dd.rc = r2(dd.rc + tt.tot);
        break;
      }
      case 'pay': {
        if (v.pt) post(v, ctrlOf(v.pt), v.pt, tt.tot, 0, memo); else post(v, v.ac, '', tt.tot, 0, memo);
        post(v, ca, '', 0, tt.tot, memo);
        const dd = day(v.d); dd.py = r2(dd.py + tt.tot);
        if (!v.pt && (accounts.get(v.ac) || {}).k === 'exp') dd.exp = r2(dd.exp + tt.tot);
        break;
      }
      case 'cxf': post(v, v.ca2, '', tt.tot, 0, memo); post(v, v.ca, '', 0, tt.tot, memo); break;
      case 'jv': for (const e of v.je || []) post(v, e.a, e.pt || '', +e.dr || 0, +e.cr || 0, e.m ? memo + '، ' + e.m : memo); break;
      case 'adj': {
        const acc = v.r === 'exp' || v.r === 'dmg' ? A.EXPD : v.r === 'use' ? '6900' : A.DIFF;
        let net = 0;
        for (const l of v.ln || []) {
          const q = +l.q * +l.z;
          if (q > 0) { const c = r2(avg(l.i) * q); inn(v, l, q, c, st(l)); net += c; move(v, l, q, c, st(l), { k: 'adj' }); }
          else if (q < 0) { const c = out(Object.assign({ _neg: true }, v), l, -q, st(l)); net -= c; move(v, l, q, -c, st(l), { k: 'adj' }); }
        }
        net = r2(net);
        if (net > 0) { post(v, A.INV, '', net, 0, memo); post(v, acc, '', 0, net, memo); }
        else if (net < 0) { post(v, acc, '', -net, 0, memo); post(v, A.INV, '', 0, -net, memo); }
        meta.tot = net;
        break;
      }
      case 'xfer': {
        for (const l of v.ln || []) {
          const q = +l.q * +l.z, s = it(l.i), a = +l.s === 2 ? 2 : 1, b = +l.s2 === 2 ? 2 : 1;
          s.st[a] = (s.st[a] || 0) - q; s.st[b] = (s.st[b] || 0) + q;
          for (const t of takeBatch(s, a, l.x, q)) addBatch(s, b, t.k, t.q);   // الدفعات تنتقل بتواريخها
          move(v, l, -q, 0, a, { k: 'xfer' }); move(v, l, q, 0, b, { k: 'xfer' });
        }
        break;
      }
    }
    if (resid) { post(v, A.COGS, '', resid, 0, memo); post(v, A.INV, '', 0, resid, memo); }
  }
  // تحقق: مجموع المدين = مجموع الدائن
  let dr = 0, cr = 0; for (const x of L.acc.values()) { dr += x.dr; cr += x.cr; }
  L.dr = r2(dr); L.cr = r2(cr);
  if (Math.abs(L.dr - L.cr) > 0.01) L.issues.push({ k: 'unbalanced', dr: L.dr, cr: L.cr });
  return L;
}

/* ---------------------------- تقارير ---------------------------- */

/** رصيد حساب (مدين موجب) حتى تاريخ، أو في فترة */
export function accBalance(L, a, from, to) {
  let b = 0; for (const e of L.byA.get(a) || []) { if ((from && e.d < from) || (to && e.d > to)) continue; b += e.dr - e.cr; } return r2(b);
}
export function partyBalance(L, p, to) {
  if (!to) { const y = L.pty.get(p); return y ? r2(y.dr - y.cr) : 0; }
  let b = 0; for (const e of L.byP.get(p) || []) { if (e.d > to) break; b += e.dr - e.cr; } return r2(b);
}

/** كشف حساب طرف: رصيد ما قبل الفترة ثم الحركات بالرصيد المتراكم */
export function statement(L, opt) {
  const list = opt.p ? (L.byP.get(opt.p) || []) : (L.byA.get(opt.a) || []);
  let open = 0, run = 0; const rows = []; let dr = 0, cr = 0;
  for (const e of list) {
    if (opt.from && e.d < opt.from) { open += e.dr - e.cr; continue; }
    if (opt.to && e.d > opt.to) continue;
    if (!rows.length) run = open;
    run += e.dr - e.cr; dr += e.dr; cr += e.cr;
    rows.push({ e, d: e.d, v: e.v, m: e.m, dr: e.dr, cr: e.cr, bal: r2(run) });
  }
  return { open: r2(open), rows, dr: r2(dr), cr: r2(cr), close: r2(open + dr - cr) };
}

/** ميزان المراجعة للفترة */
export function trialBalance(L, accounts, from, to) {
  const rows = [];
  for (const a of toMap(accounts).values()) {
    let o = 0, dr = 0, cr = 0;
    for (const e of L.byA.get(a.id) || []) { if (to && e.d > to) continue; if (from && e.d < from) o += e.dr - e.cr; else { dr += e.dr; cr += e.cr; } }
    if (!o && !dr && !cr) continue;
    rows.push({ a, open: r2(o), dr: r2(dr), cr: r2(cr), close: r2(o + dr - cr) });
  }
  rows.sort((x, y) => x.a.id < y.a.id ? -1 : 1);
  const sum = k => r2(rows.reduce((s, r) => s + r[k], 0));
  return { rows, dr: sum('dr'), cr: sum('cr'), open: sum('open'), close: sum('close') };
}

/** الأرباح والخسائر للفترة */
export function profitLoss(L, accounts, from, to) {
  const acc = toMap(accounts);
  const flow = id => { let b = 0; for (const e of L.byA.get(id) || []) { if ((from && e.d < from) || (to && e.d > to)) continue; b += e.cr - e.dr; } return r2(b); };
  const sales = flow(A.SALES), sret = -flow(A.SRET), disc = -flow(A.DISC), other = flow(A.OTHINC);
  const net = r2(sales - sret - disc), cogs = -flow(A.COGS), gross = r2(net - cogs);
  const exps = [];
  for (const a of acc.values()) if (a.k === 'exp') { const x = -flow(a.id); if (x) exps.push({ a, x }); }
  exps.sort((x, y) => y.x - x.x);
  const expT = r2(exps.reduce((s, e) => s + e.x, 0));
  const otherRev = [];
  for (const a of acc.values()) if (a.k === 'rev' && ![A.SALES, A.SRET, A.DISC].includes(a.id)) { const x = flow(a.id); if (x) otherRev.push({ a, x }); }
  const otherT = r2(otherRev.reduce((s, e) => s + e.x, 0));
  return { sales, sret, disc, net, cogs, gross, margin: net ? gross / net : 0, exps, expT, otherRev, otherT, profit: r2(gross - expT + otherT) };
}

/** الميزانية في تاريخ */
export function balanceSheet(L, accounts, asOf, parties) {
  const acc = toMap(accounts), pts = toMap(parties);
  const bal = id => accBalance(L, id, '', asOf);
  const assets = [], liabs = [], equity = [];
  // الأطراف: المدين أصل والدائن التزام، أياً كان نوع الحساب
  let recv = 0, pay = 0;
  for (const [p] of L.byP) { const b = partyBalance(L, p, asOf); if (b > 0) recv += b; else pay -= b; }
  for (const a of acc.values()) if (['ar', 'ap', 'emp', 'oth'].includes(a.k)) {
    let u = 0; for (const e of L.byA.get(a.id) || []) { if (asOf && e.d > asOf) continue; if (!e.p) u += e.dr - e.cr; }
    if (u > 0) recv += u; else pay -= u;
  }
  recv = r2(recv); pay = r2(pay);
  for (const a of acc.values()) {
    const b = bal(a.id); if (!b && !a.sys) continue;
    if (a.k === 'cash' || a.k === 'inv' || a.k === 'asset') { if (b) assets.push({ a, b }); }
    else if (a.k === 'liab') { if (b) liabs.push({ a, b: -b }); }
    else if (a.k === 'eq') { if (b) equity.push({ a, b: -b }); }
  }
  let pl = 0; for (const a of acc.values()) if (['rev', 'cogs', 'exp'].includes(a.k)) pl -= bal(a.id);
  pl = r2(pl);
  const assetsT = r2(assets.reduce((s, x) => s + x.b, 0) + recv);
  const liabT = r2(liabs.reduce((s, x) => s + x.b, 0) + pay);
  const eqT = r2(equity.reduce((s, x) => s + x.b, 0) + pl);
  return { assets, liabs, equity, recv, pay, pl, assetsT, liabT, eqT, check: r2(assetsT - liabT - eqT), pts };
}

/** أعمار الديون: يُطفأ أقدم دين أولاً بالمدفوعات */
export function aging(L, parties, asOf, type) {
  const out = [];
  for (const p of toMap(parties).values()) {
    if (type && p.t !== type) continue;
    const list = L.byP.get(p.id); if (!list) continue;
    const sg = p.t === 's' ? -1 : 1;          // للمورد: ما علينا له هو "الدين"
    const debts = []; let credit = 0, lastPay = '', last = '';
    for (const e of list) {
      if (asOf && e.d > asOf) break;
      last = e.d;
      let amt = r2(sg * (e.dr - e.cr));
      if (amt < 0 && e.v.t !== 'sret' && e.v.t !== 'pret') lastPay = e.d;
      if (amt > 0) { if (credit > 0) { const t = Math.min(credit, amt); credit -= t; amt -= t; } if (amt > 0.004) debts.push({ d: e.d, a: amt }); }
      else if (amt < 0) { let c = -amt; while (c > 0.004 && debts.length) { const t = Math.min(debts[0].a, c); debts[0].a -= t; c -= t; if (debts[0].a <= 0.004) debts.shift(); } credit += c; }
    }
    const bal = r2(debts.reduce((s, x) => s + x.a, 0) - credit);
    if (Math.abs(bal) < 0.5) continue;
    const b = [0, 0, 0, 0, 0];
    for (const x of debts) { const age = daysBetween(x.d, asOf); b[age <= 30 ? 0 : age <= 90 ? 1 : age <= 180 ? 2 : age <= 365 ? 3 : 4] += x.a; }
    out.push({ p, bal, b: b.map(r2), oldest: debts.length ? debts[0].d : '', lastPay, last, idle: lastPay ? daysBetween(lastPay, asOf) : (debts.length ? daysBetween(debts[0].d, asOf) : 0) });
  }
  out.sort((x, y) => y.bal - x.bal);
  return out;
}

/** صلاحيات المخزون: كل دفعة بتاريخها وكميتها في كل مخزن */
export function expiries(L, items, asOf) {
  const out = [];
  for (const [id, s] of L.itm) {
    const m = toMap(items).get(id) || {};
    for (const store of [1, 2]) {
      for (const [x, q] of s.bt[store] || []) {
        if (q <= 1e-9) continue;
        const left = x ? monthsLeft(x, asOf) : null;
        out.push({ id, n: m.n || id, store, x, q, left, value: r2(q * (s.Q > 1e-9 ? s.V / s.Q : s.lastC || 0)) });
      }
    }
  }
  out.sort((a, b) => expKey(a.x) - expKey(b.x));
  return out;
}

/** مبيعات وأرباح كل صنف في فترة */
export function itemSales(L, from, to) {
  const m = new Map();
  for (const [id, arr] of L.mv) for (const x of arr) {
    if (x.k !== 'sale' && x.k !== 'sret') continue;
    if ((from && x.d < from) || (to && x.d > to)) continue;
    let r = m.get(id); if (!r) { r = { id, q: 0, amt: 0, cost: 0 }; m.set(id, r); }
    r.q -= x.q; r.amt += x.amt; r.cost -= x.value;
  }
  return [...m.values()].map(r => ({ ...r, q: r.q, amt: r2(r.amt), cost: r2(r.cost), gp: r2(r.amt - r.cost) }));
}
