/* فاتورة البيع والشراء والمرتجعات: مسح أو بحث ← سطر ← حفظ. المسودة تبقى محفوظة لو أُغلق التطبيق. */
import { h, $, icon, toast, picker, numField, confirmBox, field, put, wide, seg, sheet } from './ui.js';
import { money, price as fp, qty, num, today, parseExp, dmy, norm } from './util.js';
import { totals, check, STORES, partyBalance } from './engine.js';
import { findBarcode, findCode, parseCode, linkBarcode, searchItems, units, stockOf, nearestExp, expTag, qtyText, cashAccounts, partyRows, partyFilter, partyName, avgCost, printVoucher, balWords } from './common.js';
import { scanButton, inlineScanner } from './scan.js';

const META = {
  sale: { title: 'فاتورة بيع', pt: 'c', who: 'العميل', none: 'زبون نقدي', price: 'p', pay: 'cash', saved: 'حُفظت فاتورة البيع' },
  sret: { title: 'مرتجع مبيعات', pt: 'c', who: 'العميل', none: 'زبون نقدي', price: 'p', pay: 'cash', saved: 'حُفظ مرتجع المبيعات' },
  pur: { title: 'فاتورة شراء', pt: 's', who: 'المورد', none: 'اختر المورد', price: 'c', pay: 'credit', saved: 'حُفظت فاتورة الشراء' },
  pret: { title: 'مرتجع مشتريات', pt: 's', who: 'المورد', none: 'اختر المورد', price: 'c', pay: 'credit', saved: 'حُفظ مرتجع المشتريات' }
};
const drafts = {};
const fresh = t => ({ t, pt: '', ca: '1101', d: today(), ln: [], ds: '', pay: META[t].pay, pd: '', m: '', inv: '', s: 1 });
function load(t) {
  if (!drafts[t]) { let d = null; try { d = JSON.parse(localStorage.getItem('pharm.draft.' + t) || 'null'); } catch (e) {} drafts[t] = d && d.t === t ? d : fresh(t); }
  return drafts[t];
}
const persist = D => { try { localStorage.setItem('pharm.draft.' + D.t, JSON.stringify(D)); } catch (e) {} };

export function docView(ctx, t) {
  const { store } = ctx, M = META[t];
  if (!ctx.can(t)) return { title: M.title, el: h('div', { class: 'note bad' }, 'ليس لديك صلاحية لهذا المستند.') };
  let D = load(t);
  const anyStore = ctx.can('store-any');   // المشرف فقط يختار المخزن، والكاشير على الصيدلية
  D.s = anyStore && +D.s === 2 ? 2 : 1;
  if (!anyStore) D.ln.forEach(l => { l.s = 1; });
  if (!D.ln.length && D.d !== today()) D.d = today();
  const isBuy = t === 'pur' || t === 'pret', isSale = !isBuy;
  const P = M.price;   // p = سعر البيع، c = التكلفة

  const head = h('div', { class: 'chips' });
  const input = h('input', { type: 'search', placeholder: 'امسح الباركود أو اكتب اسم الصنف', autocomplete: 'off', enterkeyhint: 'search', 'aria-label': 'بحث عن صنف' });
  const sugg = h('div', { class: 'sugg hide' });
  const lines = h('section', { class: 'page tight' });
  const foot = h('footer', { class: 'foot' });
  const extra = h('div');

  /* تنبيه: غير متوفر في المخزن المختار ويوجد في الآخر */
  const elsewhere = (it, l, need) => {
    const os = +l.s === 2 ? 1 : 2, have = stockOf(store.L, l.i, +l.s === 2 ? 2 : 1), oq = stockOf(store.L, l.i, os);
    return need > have + 1e-9 && oq > 1e-9 ? h('span', { class: 'tag red' }, 'غير متوفر في ' + STORES[+l.s === 2 ? 2 : 1] + '، يوجد ' + qtyText(it, oq) + ' في ' + STORES[os]) : null;
  };

  /* ---------- رأس الفاتورة ---------- */
  function drawHead() {
    head.textContent = '';
    const pn = D.pt ? partyName(store, D.pt) : '';
    put(head, 
      h('button', { class: 'chip' + (D.pt ? ' set' : ''), on: { click: pickParty } }, icon('user', 18), h('b', null, pn || M.none)),
      h('button', { class: 'chip' + (D.pay === 'credit' ? ' set' : ''), on: { click: () => { D.pay = D.pay === 'cash' ? 'credit' : 'cash'; if (D.pay === 'credit' && !D.pt) pickParty(); change(); } } },
        D.pay === 'cash' ? 'نقداً' : 'آجل'),
      h('label', { class: 'chip' }, icon('cal', 18), h('input', { type: 'date', value: D.d, style: { border: 0, minHeight: '30px', padding: 0, width: '128px', background: 'none' }, on: { change: e => { D.d = e.target.value || today(); change(); } } })),
      null);
    const boxes = cashAccounts(store);
    if (boxes.length > 1) put(head, h('button', { class: 'chip', on: { click: async () => { const a = await picker('الصندوق', boxes.map(b => ({ value: b.id, label: b.n }))); if (a) { D.ca = a; change(); } } } }, icon('wallet', 18), (store.accounts.get(D.ca) || {}).n || 'الصندوق'));
  }
  async function pickParty() {
    const rows = partyRows(store, [M.pt, ...(M.pt === 'c' ? ['e', 'o'] : ['o'])], ctx.can('sup') ? null : ['s', 'e', 'o']);
    const r = await picker(M.who, [{ value: '', label: M.none }, ...rows], { filter: q => q ? partyFilter(rows)(q) : [{ value: '', label: M.none }, ...rows], add: ctx.can('party-add') ? 'إضافة ' + M.who + ' جديد' : '', placeholder: 'ابحث بالاسم أو الهاتف' });
    if (r === null) { if (!D.pt && D.pay === 'credit' && isSale) { D.pay = 'cash'; change(); } return; }
    if (r && r.add) {
      const id = await store.put('parties', null, { n: r.add, t: M.pt, ph: '', act: true, at: Date.now() });
      D.pt = id;
    } else D.pt = r ? r.id : '';
    if (!D.pt && D.pay === 'credit' && isSale) D.pay = 'cash';
    change();
  }

  /* ---------- إضافة صنف ---------- */
  function addItem(it, uIdx, exp) {
    const us = units(it); uIdx = uIdx || 0;
    const u = us[uIdx] || us[0];
    const same = D.ln.find(l => l.i === it.id && l.u === uIdx && !l.b && (!isBuy || !l.x || (exp && l.x === exp)));
    if (same && isSale) { same.q = +(same.q || 0) + 1; D.ln.splice(D.ln.indexOf(same), 1); D.ln.unshift(same); }
    else {
      const l = { i: it.id, n: it.n, u: uIdx, z: u.s, q: 1, s: D.s };
      if (P === 'p') l.p = +u.p || 0;
      else { l.c = Math.round(avgCost(store.L, store, it.id) * u.s * 100) / 100; l.f = 0; l.x = exp || ''; }   // الرمز الدوائي المربع يحمل الصلاحية
      D.ln.unshift(l);
    }
    input.value = ''; sugg.classList.add('hide');
    change();
    setTimeout(() => { const first = $('input.q', lines); if (isBuy && first) first.select(); }, 30);
  }
  /* ---------- صنف من صيدلية أخرى (يُؤخذ لزبون ويُخلَّص لاحقاً) ----------
     يُضاف سطراً عادياً معلَّماً بالصيدلية. عند حفظ الفاتورة يُحفظ قبلها سند شراء من تلك الصيدلية
     (آجل حتى التخليص، أو نقداً إن دُفع الآن)، فيدخل الصنف المخزون ثم يخرج بالبيع ويبقى المستحق في حسابها. */
  async function borrow(q0) {
    const last = (() => { try { return localStorage.getItem('pharm.lender') || ''; } catch (e) { return ''; } })();
    const S = { pt: last && store.parties.has(last) ? last : '', it: null, name: q0 || '', un: 'علبة', u: 0, q: 1, c: '', p: '', cash: false };
    const body = h('div');
    let s = null;
    // الصيدليات المجاورة أزراراً ظاهرة، وغيرها بالبحث (لا نافذة فوق النافذة)
    const lq = h('input', { type: 'search', placeholder: 'صيدلية أخرى: ابحث أو اكتب اسماً جديداً', autocomplete: 'off', on: { input: () => drawLenders() } });
    const lbox = h('div');
    function drawLenders() {
      lbox.textContent = '';
      const near = [...store.parties.values()].filter(p => p.nbr && p.act !== false).sort((a, b) => a.n.localeCompare(b.n, 'ar'));
      if (S.pt && !near.some(p => p.id === S.pt) && store.parties.has(S.pt)) near.unshift(store.parties.get(S.pt));
      put(lbox, h('div', { class: 'chips', style: { flexWrap: 'wrap', overflow: 'visible' } }, near.map(p => h('button', { type: 'button', class: 'chip' + (S.pt === p.id ? ' set' : ''), style: { flex: '0 0 auto', whiteSpace: 'nowrap' }, on: { click: () => { S.pt = p.id; lq.value = ''; drawLenders(); } } }, p.n))));
      const n = norm(lq.value);
      if (!n) return;
      const list = h('div', { class: 'sugg' });
      for (const p of [...store.parties.values()].filter(p => p.act !== false && ['c', 's', 'o'].includes(p.t) && norm(p.n).includes(n)).slice(0, 6))
        put(list, h('button', { type: 'button', on: { click: () => { S.pt = p.id; lq.value = ''; drawLenders(); } } }, h('span', null, h('b', { style: { fontWeight: 500 } }, p.n))));
      if (ctx.can('party-add')) put(list, h('button', { type: 'button', on: { click: async () => { S.pt = await store.put('parties', null, { n: lq.value.trim(), t: 'c', ph: '', act: true, nbr: 1, at: Date.now() }); lq.value = ''; drawLenders(); } } },
        h('span', null, h('b', { style: { fontWeight: 500 } }, 'إضافة صيدلية جديدة: ' + lq.value.trim()))));
      put(lbox, list);
    }
    const nameIn = h('input', { type: 'search', value: S.name, placeholder: 'اسم الصنف', autocomplete: 'off', on: { input: e => { S.name = e.target.value; S.it = null; drawFound(); drawItem(); } } });
    const found = h('div', { class: 'sugg' });
    const itemBox = h('div');
    function drawFound() {
      found.textContent = '';
      const q = S.name.trim();
      if (!q || S.it) { found.classList.add('hide'); return; }
      found.classList.remove('hide');
      for (const it of searchItems(store, q, 6)) put(found, h('button', { type: 'button', on: { click: () => { S.it = it; S.name = it.n; nameIn.value = it.n; S.u = 0; S.p = (units(it)[0] || {}).p || ''; drawFound(); drawItem(); } } },
        h('span', null, h('b', { style: { fontWeight: 500 } }, it.n), h('small', null, 'المتوفر ' + qtyText(it, stockOf(store.L, it.id, D.s)))), h('span', { class: 'num' }, fp((units(it)[0] || {}).p || 0))));
      put(found, h('button', { type: 'button', on: { click: () => { found.classList.add('hide'); drawItem(); } } }, h('span', null, h('b', { style: { fontWeight: 500 } }, 'صنف جديد: ' + q), h('small', null, 'غير موجود في النظام، يُضاف باسمه'))));
    }
    function drawItem() {
      itemBox.textContent = '';
      const nw = !S.it && S.name.trim();
      if (!S.it && !nw) return;
      const us = S.it ? units(S.it) : null;
      put(itemBox,
        S.it ? h('div', { class: 'note good' }, 'صنف موجود: ' + S.it.n) : h('div', { class: 'note' }, 'صنف جديد يُضاف للنظام باسم «' + S.name.trim() + '». أكمل بياناته لاحقاً من بطاقة الصنف.'),
        h('div', { class: 'row2' },
          field('الكمية', numField({ value: S.q, on: { input: e => { S.q = num(e.target.value); } } })),
          us && us.length > 1 ? field('الوحدة', h('select', { on: { change: e => { S.u = +e.target.value; S.p = (us[S.u] || {}).p || ''; drawItem(); } } }, us.map((u, j) => h('option', { value: j, selected: j === S.u }, u.n))))
            : !us ? field('الوحدة', h('input', { value: S.un, on: { input: e => { S.un = e.target.value; } } })) : h('span')),
        h('div', { class: 'row2' },
          field('سعرها علينا (للوحدة)', numField({ value: S.c, placeholder: '0', on: { input: e => { S.c = e.target.value; } } })),
          field('سعر البيع للزبون', numField({ value: S.p, placeholder: '0', on: { input: e => { S.p = e.target.value; } } }))));
    }
    function draw() {
      body.textContent = '';
      put(body,
        h('p', { class: 'muted', style: { fontSize: '14px', margin: '0 0 10px' } }, 'للصنف غير الموجود عندك: تأخذه من صيدلية أخرى للزبون، ويُسجّل عليك لها حتى التخليص.'),
        h('div', { class: 'field' }, h('span', { class: 'flabel' }, 'من صيدلية'), lbox, lq),
        field('الصنف', nameIn), found, itemBox,
        field('التخليص', seg([[0, 'آجل حتى التخليص'], [1, 'دفعناه نقداً الآن']], S.cash ? 1 : 0, v => { S.cash = !!v; })),
        h('div', { class: 'actions' },
          h('button', { class: 'btn', on: { click: add } }, icon('plus', 18), 'أضف إلى الفاتورة'),
          h('button', { class: 'btn ghost', on: { click: () => s && s.close() } }, 'رجوع')));
      drawLenders(); drawFound(); drawItem();
    }
    async function add() {
      const q = num(S.q), c = num(S.c), p = num(S.p), nm = S.name.trim();
      if (!S.pt) { toast('اختر الصيدلية', { bad: true }); return; }
      if (!S.it && !nm) { toast('اكتب اسم الصنف', { bad: true }); return; }
      if (!(q > 0)) { toast('اكتب الكمية', { bad: true }); return; }
      if (!(c > 0)) { toast('اكتب سعره عليك من الصيدلية', { bad: true }); return; }
      if (!(p > 0)) { toast('اكتب سعر البيع', { bad: true }); return; }
      let it = S.it, uIdx = S.u;
      if (!it) {
        const id = await store.put('items', null, { n: nm, co: '', bc: [], u: [{ n: (S.un || 'علبة').trim() || 'علبة', s: 1, p }], c0: c, min: 0, act: true, nb: 1, at: Date.now() });
        it = store.items.get(id); uIdx = 0;
      }
      const u = units(it)[uIdx] || units(it)[0];
      D.ln.unshift({ i: it.id, n: it.n, u: uIdx, z: u.s, q, s: D.s, p, b: { pt: S.pt, c, cash: S.cash ? 1 : 0 } });
      const pa = store.parties.get(S.pt);
      if (pa && !pa.nbr) store.put('parties', S.pt, { nbr: 1 }, true);
      try { localStorage.setItem('pharm.lender', S.pt); } catch (e) {}
      input.value = ''; sugg.classList.add('hide');
      s.close(); change();
    }
    draw();
    s = sheet('صنف من صيدلية أخرى', body, { tall: true });
    setTimeout(() => nameIn.focus(), 250);
  }
  const lenderTag = l => h('span', { class: 'tag' }, 'من ' + partyName(store, l.b.pt) + '، عليك ' + money((+l.b.c || 0) * (+l.q || 0)) + (l.b.cash ? ' مدفوعة' : ' حتى التخليص'));

  /** يعيد اسم الصنف المضاف، أو false */
  async function lookup(raw) {
    const f = findCode(store, raw);
    if (f && f.it) { addItem(f.it, f.u, f.exp); return f.it.n; }
    const pc = parseCode(raw), code = pc.main;
    // أرشيف أصناف BetaSys (من تطبيق الجرد): صنف قديم لم يُستورد بعد
    let old = null;
    if (ctx.can('item-add')) for (const c of pc.codes) { old = await archiveFind(ctx, c); if (old) break; }
    if (old) {
      toast('صنف من الأرشيف: ' + old.n, { action: { label: 'إضافة للفاتورة', fn: async () => {
        const id = await store.put('items', old.id, { n: old.n, bc: old.bc, co: old.co, u: [{ n: old.un || 'علبة', s: 1, p: 0 }], c0: 0, act: true, at: Date.now(), arc: true });
        const it = store.items.get(id); if (it) { addItem(it, 0); toast('أُضيف. اكتب سعره في الفاتورة ثم عدّله من بطاقة الصنف.'); }
      } } });
      return false;
    }
    // غير مسجّل: يُربط بصنف موجود (يُحفظ ويُقرأ بعدها مباشرة) أو يُضاف صنف جديد به
    const L = await linkBarcode(ctx, raw, { onNew: () => persist(D) });
    if (L) { addItem(L.it, L.u, L.exp); return L.it.n; }
    return false;
  }
  function showSugg() {
    const q = input.value.trim();
    sugg.textContent = '';
    if (!q) { sugg.classList.add('hide'); return; }
    const found = searchItems(store, q, 12), L = store.L;
    if (!found.length) { put(sugg, h('p', { class: 'empty', style: { padding: '12px' } }, /^\d{5,}$/.test(q) ? 'اضغط إدخال للبحث بالباركود' : 'لا يوجد صنف بهذا الاسم')); }
    for (const it of found) {
      const st = stockOf(store.L, it.id, D.s), u0 = units(it)[0], os = D.s === 1 ? 2 : 1, oq = stockOf(store.L, it.id, os);
      put(sugg, h('button', { type: 'button', on: { click: () => addItem(it, 0) } },
        h('span', null, h('b', { style: { fontWeight: 500 } }, it.n), h('small', null, [it.co, qtyText(it, st) + ' في ' + STORES[D.s], t === 'sale' && st <= 1e-9 && oq > 1e-9 ? 'يوجد ' + qtyText(it, oq) + ' في ' + STORES[os] : ''].filter(Boolean).join('، '))),
        h('span', { class: 'num', style: { fontWeight: 600 } }, fp(isSale ? u0.p : avgCost(L, store, it.id) * u0.s))));
    }
    if (t === 'sale' && !/^\d{5,}$/.test(q)) put(sugg, h('button', { type: 'button', on: { click: () => borrow(found.length ? '' : q) } }, h('span', null, h('b', { style: { fontWeight: 500 } }, 'غير موجود عندك؟ خذه من صيدلية أخرى'), h('small', null, 'يُسجّل عليك للصيدلية حتى التخليص'))));
    sugg.classList.remove('hide');
  }
  input.addEventListener('input', () => { hl = -1; showSugg(); });
  let hl = -1;
  const mark = () => [...sugg.querySelectorAll('button')].forEach((b, i) => { b.classList.toggle('hl', i === hl); if (i === hl) b.scrollIntoView({ block: 'nearest' }); });
  input.addEventListener('keydown', e => {
    const bs = sugg.classList.contains('hide') ? [] : [...sugg.querySelectorAll('button')];
    if (e.key === 'ArrowDown' && bs.length) { e.preventDefault(); hl = Math.min(bs.length - 1, hl + 1); mark(); return; }
    if (e.key === 'ArrowUp' && bs.length) { e.preventDefault(); hl = Math.max(-1, hl - 1); mark(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (hl >= 0 && bs[hl]) { bs[hl].click(); hl = -1; return; }
    const q = input.value.trim(); if (!q) return;
    if (/^[\]\x1d()0-9A-Za-z\-]{5,}$/.test(q) && findCode(store, q)) { lookup(q); return; }
    const found = searchItems(store, q, 2);
    if (found.length === 1 || (found.length && !/^\d+$/.test(q))) addItem(found[0], 0);
    else if (/^\d{5,}$/.test(q) || (/^\S{6,}$/.test(q) && /\d/.test(q))) lookup(q);   // باركود أو رمز مربع غير مسجّل
  });

  /* ---------- سطور الفاتورة ---------- */
  function drawLines() {
    lines.textContent = '';
    lines.className = 'page tight' + (wide() && D.ln.length ? ' glines' : '');
    if (!D.ln.length) {
      put(lines, h('div', { class: 'empty' }, h('p', null, isSale ? 'امسح الباركود أو ابحث بالاسم لإضافة صنف.' : 'أضف أصناف فاتورة المورد بالمسح أو البحث.')));
      return;
    }
    const L = store.L;
    if (wide()) { gridLines(L); return; }
    D.ln.forEach((l, k) => {
      const it = store.items.get(l.i) || { id: l.i, n: l.n, u: [{ n: 'وحدة', s: l.z, p: l.p }] };
      const us = units(it), price = +l[P] || 0;
      const amt = (+l.q || 0) * price;
      const have = stockOf(L, l.i, l.s);
      const unitSel = h('select', { 'aria-label': 'الوحدة', disabled: !!l.b, on: { change: e => { const nu = +e.target.value, u = us[nu]; l.u = nu; l.z = u.s; if (P === 'p') l.p = +u.p || 0; else l.c = Math.round(avgCost(L, store, l.i) * u.s * 100) / 100; change(); } } },
        us.map((u, j) => h('option', { value: j, selected: j === l.u }, u.n)));
      const qIn = h('input', { class: 'q num', inputmode: 'decimal', value: l.q, 'aria-label': 'الكمية', on: { change: e => { l.q = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } });
      const step = h('span', { class: 'step' },
        h('button', { type: 'button', 'aria-label': 'زيادة', on: { click: () => { l.q = (+l.q || 0) + 1; change(); } } }, icon('plus', 18)),
        qIn,
        h('button', { type: 'button', 'aria-label': 'إنقاص', on: { click: () => { l.q = Math.max(0, (+l.q || 0) - 1); if (!l.q) D.ln.splice(k, 1); change(); } } }, icon('minus', 18)));
      const priceIn = numField({ value: price, 'aria-label': isSale ? 'السعر' : 'التكلفة', on: { change: e => { l[P] = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } });
      const ctl = h('div', { class: 'ctl' }, step, h('span', { class: 'mini' }, unitSel), h('span', { class: 'mini' }, '×', priceIn));
      if (isBuy) {
        put(ctl, 
          h('span', { class: 'mini' }, 'بونص', numField({ value: l.f || '', placeholder: '0', style: { width: '64px' }, on: { change: e => { l.f = Math.max(0, num(e.target.value)); change(); } } })),
          h('span', { class: 'mini' }, 'صلاحية', h('input', { value: l.x || '', placeholder: '03/28', class: 'num', style: { width: '86px' }, inputmode: 'numeric', on: { change: e => { l.x = parseExp(e.target.value); if (e.target.value && !l.x) toast('اكتب الصلاحية شهر/سنة مثل 03/28', { bad: true }); change(); } } })));
        if (t === 'pur') {
          const cur = (us[l.u] || {}).p || 0;
          put(ctl, h('span', { class: 'mini' }, 'سعر البيع', numField({ value: l.np != null ? l.np : cur, style: { width: '86px' }, on: { change: e => { const v = num(e.target.value); l.np = v === cur ? undefined : v; change(); } } })));
        }
      }
      const info = h('div', { class: 'info' });
      if (t === 'sale' && l.b) put(info, lenderTag(l));
      else if (isSale && t === 'sale') {
        const need = (+l.q || 0) * l.z;
        put(info, h('span', { class: need > have + 1e-9 ? 'red' : '' }, 'المتوفر ' + qtyText(it, have)));
        put(info, elsewhere(it, l, need));
        const x = nearestExp(L, l.i, l.s); if (x) put(info, expTag(x, D.d));
        const cost = avgCost(L, store, l.i) * l.z;
        if (ctx.can('profit') && cost && price < cost) put(info, h('span', { class: 'tag red' }, 'أقل من التكلفة ' + money(cost)));
      } else put(info, h('span', null, 'المتوفر ' + qtyText(it, have)));
      put(info, h('button', { type: 'button', class: 'linkish', style: { border: 0, background: 'none', color: 'var(--red)', padding: 0, fontSize: '12.5px' }, on: { click: () => { D.ln.splice(k, 1); change(); } } }, 'حذف'));
      put(lines, h('div', { class: 'line' },
        h('div', { class: 'top' }, h('span', { class: 'name' }, it.n || l.n), h('span', { class: 'amt num' }, money(amt))),
        ctl, info));
    });
  }

  /* سطور الفاتورة على الكمبيوتر: جدول بأعمدة ثابتة، كل خانة تُعدَّل في مكانها */
  function gridLines(L) {
    // المشتريات تُكتب من فاتورة المورد بلوحة المفاتيح: خانة كمية بلا أزرار لتتسع أعمدة البونص والصلاحية
    const cols = ['22px', isBuy ? 'minmax(140px, 1fr)' : 'minmax(160px, 1fr)', isBuy ? '62px' : '116px', '84px', '88px'];
    const heads = ['#', 'الصنف', 'الكمية', 'الوحدة', isSale ? 'السعر' : 'التكلفة'];
    if (isBuy) { cols.push('54px', '70px'); heads.push('بونص', 'الصلاحية'); }
    if (t === 'pur') { cols.push('82px'); heads.push('سعر البيع'); }
    cols.push(isBuy ? '92px' : '104px', '28px'); heads.push('المبلغ', '');
    lines.style.setProperty('--gcols', cols.join(' '));
    put(lines, h('div', { class: 'gh' }, heads.map((x, i) => h('span', { class: i === heads.length - 2 ? 'n' : '' }, x))));
    const n = D.ln.length;
    D.ln.forEach((l, k) => {
      const it = store.items.get(l.i) || { id: l.i, n: l.n, u: [{ n: 'وحدة', s: l.z, p: l.p }] };
      const us = units(it), price = +l[P] || 0, amt = (+l.q || 0) * price, have = stockOf(L, l.i, l.s);
      const cell = (attrs, w) => numField(Object.assign({ class: 'num cell', on: { focus: e => e.target.select() } }, attrs));
      const qIn = numField({ class: 'q num', value: l.q, 'aria-label': 'الكمية', on: { change: e => { l.q = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } });
      const step = isBuy ? (qIn.classList.add('cell'), qIn) : h('span', { class: 'step' },
        h('button', { type: 'button', tabindex: -1, 'aria-label': 'زيادة', on: { click: () => { l.q = (+l.q || 0) + 1; change(); } } }, icon('plus', 16)), qIn,
        h('button', { type: 'button', tabindex: -1, 'aria-label': 'إنقاص', on: { click: () => { l.q = Math.max(0, (+l.q || 0) - 1); if (!l.q) D.ln.splice(k, 1); change(); } } }, icon('minus', 16)));
      const unitSel = h('select', { class: 'cell', 'aria-label': 'الوحدة', disabled: !!l.b, on: { change: e => { const nu = +e.target.value, u = us[nu]; l.u = nu; l.z = u.s; if (P === 'p') l.p = +u.p || 0; else l.c = Math.round(avgCost(L, store, l.i) * u.s * 100) / 100; change(); } } },
        us.map((u, j) => h('option', { value: j, selected: j === l.u }, u.n)));
      const info = h('small', { class: 'gi' });
      if (t === 'sale' && l.b) put(info, lenderTag(l));
      else if (t === 'sale') {
        const need = (+l.q || 0) * l.z;
        put(info, h('span', { class: need > have + 1e-9 ? 'red' : '' }, 'المتوفر ' + qtyText(it, have)));
        put(info, elsewhere(it, l, need));
        const x = nearestExp(L, l.i, l.s); if (x) put(info, expTag(x, D.d));
        const cost = avgCost(L, store, l.i) * l.z;
        if (ctx.can('profit') && cost && price < cost) put(info, h('span', { class: 'tag red' }, 'أقل من التكلفة ' + money(cost)));
      } else put(info, h('span', null, 'المتوفر ' + qtyText(it, have)));
      const row = h('div', { class: 'gl' },
        h('span', { class: 'gn num' }, n - k),
        h('span', { class: 'gname' }, h('b', { class: isLatinName(it.n || l.n) ? 'lat' : '' }, it.n || l.n), info),
        step, unitSel,
        cell({ value: price, 'aria-label': isSale ? 'السعر' : 'التكلفة', on: { change: e => { l[P] = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } }));
      if (isBuy) put(row,
        cell({ value: l.f || '', placeholder: '0', 'aria-label': 'بونص', on: { change: e => { l.f = Math.max(0, num(e.target.value)); change(); }, focus: e => e.target.select() } }),
        h('input', { class: 'num cell', value: l.x || '', placeholder: 'شهر/سنة', inputmode: 'numeric', 'aria-label': 'الصلاحية', on: { change: e => { l.x = parseExp(e.target.value); if (e.target.value && !l.x) toast('اكتب الصلاحية شهر/سنة مثل 03/28', { bad: true }); change(); } } }));
      if (t === 'pur') { const cur = (us[l.u] || {}).p || 0; put(row, cell({ value: l.np != null ? l.np : cur, 'aria-label': 'سعر البيع', on: { change: e => { const v = num(e.target.value); l.np = v === cur ? undefined : v; change(); }, focus: e => e.target.select() } })); }
      put(row, h('span', { class: 'gamt num' }, money(amt)),
        h('button', { type: 'button', class: 'gdel', tabindex: -1, 'aria-label': 'حذف السطر', title: 'حذف', on: { click: () => { D.ln.splice(k, 1); change(); } } }, icon('x', 17)));
      put(lines, row);
    });
  }
  const isLatinName = x => !/[\u0600-\u06FF]/.test(String(x || ''));

  /* ---------- الإجمالي والحفظ ---------- */
  function draft() {
    const v = { t, d: D.d, ca: D.ca, ln: D.ln.filter(l => (+l.q || 0) > 0 || (+l.f || 0) > 0).map(l => clean(l)), ds: Math.max(0, num(D.ds)), m: (D.m || '').trim() };
    if (!anyStore) v.ln.forEach(l => { l.s = 1; });
    const tt = totals(v);
    v.pd = D.pay === 'cash' ? tt.tot : Math.max(0, Math.min(num(D.pd), tt.tot));
    if (D.pt) v.pt = D.pt;
    if (D.inv) v.inv = String(D.inv).trim();
    return v;
  }
  function clean(l) {
    const o = { i: l.i, n: l.n, u: l.u, z: l.z, q: +l.q || 0, s: l.s || 1 };
    if (P === 'p') o.p = +l.p || 0; else { o.c = +l.c || 0; if (+l.f) o.f = +l.f; }
    if (l.x) o.x = l.x;
    if (l.b && t === 'sale') o.bw = l.b.pt;
    return o;
  }
  function drawFoot() {
    const v = draft(), tt = totals(v);
    foot.textContent = '';
    const ds = numField({ value: D.ds, placeholder: '0', on: { change: e => { D.ds = e.target.value; change(); } } });
    const pd = numField({ value: D.pd, placeholder: '0', on: { change: e => { D.pd = e.target.value; change(); } } });
    const n = v.ln.length;
    put(foot, h('div', null,
      h('div', { class: 'tot' },
        h('span', null, h('small', null, n ? n + ' صنف' + (tt.ds ? '، بعد خصم ' + money(tt.ds) : '') : 'الإجمالي'), h('br'),
          D.pay === 'credit' ? h('small', null, 'آجل ' + money(Math.max(0, tt.tot - v.pd))) : null),
        h('span', { class: 'big num' }, money(tt.tot))),
      h('div', { class: D.pay === 'credit' ? 'row2' : '', style: { marginBottom: '8px' } },
        h('label', { class: 'mini', style: { width: '100%' } }, 'خصم', ds),
        D.pay === 'credit' ? h('label', { class: 'mini', style: { width: '100%' } }, 'المدفوع', pd) : null),
      wide() ? panelInfo(tt) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: !n, on: { click: save } }, icon('check', 20), M.saved.replace('حُفظت', 'حفظ').replace('حُفظ', 'حفظ')),
        n ? h('button', { class: 'btn ghost sm', style: { flex: '0 0 auto' }, on: { click: clearAll } }, 'تفريغ') : null),
      h('p', { class: 'keys' }, 'F9 حفظ، F4 ' + M.who + '، F8 نقداً أو آجل، F2 فاتورة بيع جديدة، Esc مسح البحث، والأسهم للتنقل في نتائج البحث.')));
    ds.style.width = '100%'; pd.style.width = '100%';
  }
  /* لوحة الكمبيوتر: رصيد العميل أو المورد، والمستلم والباقي في البيع النقدي (للعرض فقط، لا يُحفظ) */
  let cashIn = '';
  function panelInfo(tt) {
    const box = h('div', { class: 'pinfo' });
    if (D.pt && store.parties.get(D.pt) && (ctx.can('sup') || store.parties.get(D.pt).t === 'c')) {
      const p = store.parties.get(D.pt), b = partyBalance(store.L, D.pt), w = balWords(b, p.t);
      put(box, h('div', { class: 'pl' }, h('span', null, 'رصيد ' + (p.n || '')), h('b', { class: 'num ' + w.cls }, w.amt ? money(w.amt) + ' ' : '', h('small', null, w.txt))));
    }
    if (t === 'sale' && D.pay === 'cash' && tt.tot > 0) {
      const rest = h('b', { class: 'num' }, '');
      const upd = () => { const r = num(cashIn) - tt.tot; rest.textContent = cashIn === '' ? '' : money(Math.abs(r)) + (r < -0.004 ? ' ناقص' : ''); rest.className = 'num ' + (r < -0.004 ? 'red' : 'green'); };
      const inp = numField({ value: cashIn, placeholder: money(tt.tot), 'aria-label': 'المستلم من الزبون', on: { input: e => { cashIn = e.target.value; upd(); }, focus: e => e.target.select() } });
      put(box, h('label', { class: 'mini pl' }, 'المستلم من الزبون', inp), h('div', { class: 'pl' }, h('span', null, 'الباقي له'), rest));
      upd();
    }
    return box.childNodes.length ? box : null;
  }
  async function clearAll() { if (await confirmBox('تفريغ الفاتورة', 'تُحذف كل السطور من هذه المسودة.', 'تفريغ', true)) { drafts[t] = D = fresh(t); change(); } }

  let saving = false;
  async function save() {
    if (saving) return;
    const v = draft();
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); if (/العميل|المورد/.test(err)) pickParty(); return; }
    if (t === 'sale') {
      const L = store.L, need = new Map();
      for (const l of v.ln) if (!l.bw) need.set(l.i + '|' + l.s, (need.get(l.i + '|' + l.s) || 0) + l.q * l.z);
      const short = [...need].filter(([k, q]) => { const [i, s] = k.split('|'); return q > stockOf(L, i, +s) + 1e-9; });
      const other = short.filter(([k]) => { const [i, s2] = k.split('|'); return stockOf(L, i, +s2 === 2 ? 1 : 2) > 1e-9; }).map(([k]) => { const i = k.split('|')[0], it = store.items.get(i); return it ? it.n : i; });
      if (short.length && !(await confirmBox('الكمية أكبر من المتوفر', short.length + ' صنف كميته في الفاتورة أكبر مما في ' + STORES[D.s] + ' حسب الدفتر.' + (other.length ? ' منها موجود في ' + STORES[D.s === 1 ? 2 : 1] + ': ' + other.slice(0, 5).join('، ') + (other.length > 5 ? '…' : '') + '.' : '') + ' احفظ إن كان الصنف موجوداً فعلاً، ثم صحّح المخزون بالجرد.', 'حفظ على أي حال'))) return;
    }
    // أصناف من صيدليات أخرى: سند شراء لكل صيدلية (آجل أو نقداً) يُحفظ قبل الفاتورة
    const bg = new Map();
    if (t === 'sale') for (const l of D.ln) if (l.b && (+l.q || 0) > 0) { const k = l.b.pt + '|' + (l.b.cash ? 1 : 0); if (!bg.has(k)) bg.set(k, []); bg.get(k).push(l); }
    const purs = [...bg].map(([k, ls], j) => {
      const [pt, cash] = k.split('|');
      const pv = { t: 'pur', d: v.d, ca: v.ca, pt, ln: ls.map(l => ({ i: l.i, n: l.n, u: l.u, z: l.z, q: +l.q, c: +l.b.c, s: anyStore ? (l.s || 1) : 1 })), ds: 0, m: 'أصناف أُخذت لزبون من ' + partyName(store, pt), bw: 1, at: Date.now() - 2000 + j };
      pv.pd = cash === '1' ? totals(pv).tot : 0;
      return pv;
    });
    for (const pv of purs) { const e = check(pv, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock }); if (e) { toast('سند الصيدلية الأخرى: ' + e, { bad: true }); return; } }
    saving = true;
    try {
      for (const pv of purs) await store.saveVoucher(pv);
      const doc = await store.saveVoucher(v);
      if (t === 'pur') for (const l of D.ln) if (l.np != null && store.items.get(l.i)) {
        const it = store.items.get(l.i), us = units(it).map(u => Object.assign({}, u));
        if (us[l.u]) { const ratio = (+l.np || 0) / (+us[l.u].p || 1); us[l.u].p = +l.np; us.forEach((u, j) => { if (j !== l.u && us[l.u].p && u.p) u.p = Math.round(u.p * ratio); }); await store.put('items', it.id, Object.assign({}, it, { u: us })); }
      }
      drafts[t] = D = fresh(t); persist(D); cashIn = '';
      toast(M.saved + ' ' + doc.no + (purs.length ? '، ومعها ' + (purs.length === 1 ? 'سند شراء من الصيدلية الأخرى' : purs.length + ' سندات شراء من صيدليات أخرى') : ''), { action: { label: 'طباعة', fn: () => printVoucher(store, doc) } });
      change();
      input.focus();
    } catch (e) { toast('تعذّر الحفظ: ' + (e.message || e), { bad: true }); }
    saving = false;
  }

  function change() { persist(D); drawHead(); drawLines(); drawFoot(); }

  if (isBuy) put(extra, h('div', { class: 'row2', style: { marginTop: '4px' } },
    t === 'pur' ? field('رقم فاتورة المورد', h('input', { value: D.inv, class: 'num', style: { textAlign: 'right' }, on: { change: e => { D.inv = e.target.value; persist(D); } } })) : h('span'),
    field('ملاحظة', h('input', { value: D.m, on: { change: e => { D.m = e.target.value; persist(D); } } }))));
  else put(extra, field('ملاحظة (اختياري)', h('input', { value: D.m, on: { change: e => { D.m = e.target.value; persist(D); } } })));

  /* ---------- استيراد أصناف الفاتورة من ملف CSV (نفس صيغة تصدير الفاتورة) ---------- */
  const fileIn = h('input', { type: 'file', accept: '.csv,.txt,text/csv,text/plain', style: { display: 'none' }, on: { change: async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (f) await importFile(f);
  } } });
  async function importFile(f) {
    let txt;
    try {
      const buf = await f.arrayBuffer();
      txt = new TextDecoder('utf-8').decode(buf);
      if (txt.includes('�')) txt = new TextDecoder('windows-1256').decode(buf);
    } catch (x) { toast('تعذّرت قراءة الملف', { bad: true }); return; }
    const rows = parseCsv(txt);
    const res = rowsToLines(rows);
    if (res.err) { toast(res.err, { bad: true }); return; }
    if (!res.ok.length) { toast('لم يُستورد أي صنف من الملف', { bad: true }); await report(res, 0); return; }
    if (D.ln.length && !(await confirmBox('استيراد من ملف', 'ستُضاف ' + res.ok.length + ' سطراً إلى سطور الفاتورة الحالية. أكمل؟', 'استيراد'))) return;
    for (const l of res.ok) D.ln.unshift(l);
    change();
    toast('استُوردت ' + res.ok.length + ' سطراً');
    await report(res, res.ok.length);
  }
  async function report(res, n) {
    const bad = [];
    if (res.miss.length) bad.push(res.miss.length + ' صنف غير موجود في النظام (أضفه بالمسح أو البحث ثم أعد الاستيراد): ' + res.miss.slice(0, 8).join('، ') + (res.miss.length > 8 ? '…' : ''));
    if (res.unit.length) bad.push(res.unit.length + ' صنف وحدته غير معروفة فاعتُمدت الوحدة الأولى، راجع الوحدة والتكلفة: ' + res.unit.slice(0, 6).join('، ') + (res.unit.length > 6 ? '…' : ''));
    if (res.exp.length) bad.push('صلاحية غير مفهومة في: ' + res.exp.slice(0, 6).join('، ') + (res.exp.length > 6 ? '…' : ''));
    if (bad.length) await confirmBox('ملاحظات على الاستيراد', (n ? 'استُورد ' + n + ' سطراً. ' : '') + bad.join(' — '), 'حسناً');
  }
  function parseCsv(txt) {
    txt = txt.replace(/^﻿/, '');
    const first = txt.split(/\r?\n/, 1)[0] || '';
    const dl = [',', ';', '\t'].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
    const out = []; let row = [], cur = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === dl) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) out.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(x => x.trim() !== '')) out.push(row);
    return out;
  }
  const toExp = s0 => {
    const s = String(s0 || '').trim().replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c));
    if (!s) return '';
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);       // يوم/شهر/سنة (أو شهر/يوم/سنة إن كان الأوسط أكبر من 12)
    if (m) return parseExp((+m[2] > 12 && +m[1] <= 12 ? m[1] : m[2]) + '/' + m[3]);
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})(?:[\/\-.]\d{1,2})?(?:[T ].*)?$/);   // سنة-شهر-يوم
    if (m) return parseExp(m[2] + '/' + m[1]);
    return parseExp(s);
  };
  function rowsToLines(rows) {
    if (rows.length < 1) return { err: 'الملف فارغ' };
    const KEYS = { code: ['رقم الصنف', 'رمز الصنف', 'الكود', 'كود الصنف', 'كود'], bc: ['الباركود', 'باركود'], name: ['اسم الصنف', 'الصنف', 'الاسم', 'اسم المادة', 'المادة'], unit: ['الوحدة', 'وحدة'], q: ['الكمية', 'كمية'], f: ['بونص', 'البونص'], c: ['التكلفة', 'سعر الشراء', 'سعر التكلفة', 'السعر', 'سعر الوحدة'], x: ['تاريخ الانتهاء', 'الصلاحية', 'الانتهاء', 'انتهاء الصلاحية'] };
    const head = rows[0].map(x => norm(x)), col = {};
    for (const k in KEYS) { const i = head.findIndex(h0 => KEYS[k].some(a => norm(a) === h0)); if (i >= 0) col[k] = i; }
    let body = rows.slice(1);
    if (col.q == null || (col.name == null && col.code == null && col.bc == null)) {
      // لا رؤوس أعمدة: الترتيب المعتاد رقم، اسم، وحدة، كمية، بونص، تكلفة، مبلغ، صلاحية
      if (rows[0].length >= 6 && !isNaN(num(rows[0][3]))) { Object.assign(col, { code: 0, name: 1, unit: 2, q: 3, f: 4, c: 5, x: 7 }); body = rows; }
      else return { err: 'لم أجد أعمدة «اسم الصنف» و«الكمية» في الملف. استخدم ملف تصدير فاتورة الشراء.' };
    }
    const byName = new Map(), bySrc = new Map();
    for (const it of store.items.values()) { if (it.act === false) continue; byName.set(norm(it.n), it); if (it.src) bySrc.set(String(it.src).trim(), it); }
    const g = (r, k) => col[k] == null ? '' : String(r[col[k]] == null ? '' : r[col[k]]).trim();
    const res = { ok: [], miss: [], unit: [], exp: [] };
    for (const r of body) {
      const code = g(r, 'code'), bcv = g(r, 'bc'), nm = g(r, 'name');
      const qv = num(g(r, 'q')), fv = num(g(r, 'f'));
      if (!code && !bcv && !nm) continue;
      if (!(qv > 0) && !(fv > 0)) continue;
      let it = (code && (store.items.get(code) || bySrc.get(code))) || null, uIdx = null;
      if (!it && code) { const f = findCode(store, code); if (f && f.it) { it = f.it; uIdx = f.u; } }
      if (!it && bcv) { const f = findCode(store, bcv); if (f && f.it) { it = f.it; uIdx = f.u; } }
      if (!it && nm) it = byName.get(norm(nm)) || null;
      if (!it) { res.miss.push(nm || code || bcv); continue; }
      const us = units(it), un = g(r, 'unit');
      let ui = us.findIndex(u => norm(u.n) === norm(un));
      if (ui < 0) { if (un && uIdx == null) res.unit.push(it.n); ui = uIdx != null ? uIdx : 0; }
      const u = us[ui] || us[0];
      const cs = g(r, 'c'), cost = cs !== '' ? num(cs) : Math.round(avgCost(store.L, store, it.id) * u.s * 100) / 100;
      const xs = g(r, 'x'), x = toExp(xs);
      if (xs && !x) res.exp.push(it.n);
      res.ok.push({ i: it.id, n: it.n, u: ui, z: u.s, q: qv, s: D.s, c: cost, f: fv > 0 ? fv : 0, x });
    }
    return res;
  }

  // الكاميرا المدمجة: تبقى مفتوحة فوق الفاتورة وتضيف كل صنف يُمسح
  const camHost = h('div');
  let cam = null;
  async function toggleCam() {
    if (cam) { cam.stop(); cam = null; return; }
    cam = await inlineScanner(camHost, async code => { const n = await lookup(code); return n ? 'أُضيف: ' + n : 'لم يُضف: ' + parseCode(code).main; }, () => { cam = null; });
  }

  drawHead(); drawLines(); drawFoot();
  /* اختيار المخزن: الصيدلية أو المخزن (يُطبَّق على كل سطور الفاتورة) */
  const storeLbl = { pur: 'إضافة الأصناف إلى', sret: 'إرجاع الأصناف إلى', sale: 'الصرف من', pret: 'الإرجاع من' }[t];
  const storeBox = h('div', { class: 'field', style: { margin: '0 0 10px' } },
    h('span', { class: 'flabel' }, storeLbl),
    anyStore ? seg([[1, STORES[1]], [2, STORES[2]]], D.s, v => { D.s = v; D.ln.forEach(l => { l.s = v; }); change(); })
      : h('div', { class: 'chip set' }, icon('box', 18), STORES[1]));
  const el = h('div', null, head, storeBox,
    h('div', { class: 'scan' }, input, scanButton(code => lookup(code), input, { inline: toggleCam })),
    camHost,
    isBuy ? h('div', { style: { margin: '0 0 10px' } }, h('button', { type: 'button', class: 'btn ghost sm', on: { click: () => fileIn.click() } }, icon('doc', 18), 'استيراد من ملف'), fileIn) : null,
    t === 'sale' ? h('div', { style: { margin: '0 0 10px' } }, h('button', { type: 'button', class: 'btn ghost sm', on: { click: () => borrow(input.value.trim()) } }, icon('swap', 18), 'صنف من صيدلية أخرى')) : null,
    sugg, lines, extra);
  return {
    title: M.title, sub: D.ln.length ? 'مسودة محفوظة' : '', el, foot,
    keys: { F4: pickParty, F8: () => { D.pay = D.pay === 'cash' ? 'credit' : 'cash'; if (D.pay === 'credit' && !D.pt) pickParty(); change(); } },
    scanInput: input,
    onShow: () => { if (!isBuy || matchMedia('(min-width: 1000px)').matches) setTimeout(() => input.focus(), 60); }
  };
}

/* أرشيف الأصناف: يُحمَّل مرة واحدة عند الحاجة فقط */
let ARC = null;
async function archiveFind(ctx, code) {
  try {
    if (!ARC) {
      if (!ctx.be.loadArchive) return null;
      const a = await ctx.be.loadArchive(); if (!a) return null;
      const m = new Map();
      for (const r of a.it) for (const b of String(r[1] || '').split('|')) if (b) m.set(b, { id: String(r[0]).replace(/[\/\s]+/g, '_'), bc: String(r[1]).split('|').filter(Boolean), n: r[2], un: a.un[r[3]] || '', co: a.co[r[4]] || '' });
      ARC = m;
    }
    const x = ARC.get(String(code).trim());
    return x && !ctx.store.items.has(x.id) ? x : null;
  } catch (e) { return null; }
}
