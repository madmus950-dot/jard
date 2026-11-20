/* المزيد: المستندات، السجل، تفاصيل السند، الإعدادات، الاستيراد */
import { h, icon, toast, field, numField, seg, confirmBox, sheet, put, wide } from './ui.js';
import { money, price, qty, norm, dmy, today, num, r2, newId, parseExp } from './util.js';
import { totals, check, TYPES, STORES, PARTY_TYPES, describe } from './engine.js';
import { typeName, voucherLine, partyName, units, printVoucher, cashAccounts, exportVoucher } from './common.js';
import { shareText, printHtml, saveBlob } from './out.js';
import { COLS } from './store.js';
import { activeCloses } from './v_close.js';

export function moreView(ctx) {
  const it = (k, label, sub, ic, href) => ctx.can(k) ? h('a', { class: 'ln link', href: '#/' + href }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon(ic, 22), h('span', null, h('b', null, label), sub ? h('small', null, sub) : null)), icon('fwd', 18)) : null;
  const S = ctx.store.settings;
  return {
    title: 'المزيد',
    el: h('div', null,
      h('h3', { class: 'sect' }, 'المستندات'),
      h('section', { class: 'page tight' },
        it('pur', 'فاتورة شراء', 'استلام بضاعة من مورد، نقداً أو آجلاً', 'in', 'doc/pur'),
        it('sret', 'مرتجع مبيعات', 'إرجاع صنف من زبون', 'undo', 'doc/sret'),
        it('pret', 'مرتجع مشتريات', 'إعادة أصناف إلى المورد', 'out', 'doc/pret'),
        it('rcpt', 'سند قبض', 'استلام مبلغ من عميل أو غيره', 'wallet', 'v/rcpt'),
        it('pay', 'سند صرف', 'دفع مبلغ لمورد أو موظف', 'out', 'v/pay'),
        it('exp', 'مصروف', 'إيجار، كهرباء، رواتب…', 'out', 'v/exp'),
        it('cxf', 'تحويل بين الصناديق', '', 'swap', 'v/cxf'),
        it('adj', 'تسوية مخزون', 'نتيجة جرد، منتهي، تالف', 'box', 'v/adj'),
        it('xfer', 'تحويل بين المخازن', 'من الصيدلية إلى المخزن أو العكس', 'swap', 'v/xfer'),
        it('jv', 'قيد يومية', 'للمحاسب: قيد يدوي متوازن', 'doc', 'v/jv')),
      !(window.JardApp && window.JardApp.desktop) && ctx.can('sale') ? h('section', { class: 'page tight' },
        h('a', { class: 'ln link', href: '#/scanpc' }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon('camera', 22), h('span', null, h('b', null, 'قارئ للكمبيوتر'), h('small', null, 'امسح بكاميرا الجوال فيُضاف الصنف إلى الفاتورة المفتوحة على الكمبيوتر'))), icon('fwd', 18))) : null,
      h('h3', { class: 'sect' }, 'السجل والتقارير'),
      h('section', { class: 'page tight' },
        h('a', { class: 'ln link', href: '#/vouchers' }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon('doc', 22), h('span', null, h('b', null, 'كل السندات'), h('small', null, 'بحث، طباعة، إلغاء'))), icon('fwd', 18)),
        h('a', { class: 'ln link', href: '#/reports' }, h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon('report', 22), h('span', null, h('b', null, 'التقارير'), h('small', null, 'المبيعات، الصندوق، الديون، الصلاحيات، الأرباح'))), icon('fwd', 18))),
      h('h3', { class: 'sect' }, 'الحساب'),
      h('section', { class: 'page tight' },
        it('settings', 'الإعدادات', 'اسم الصيدلية، الصناديق، المصروفات، المستخدمون', 'gear', 'settings'),
        it('settings', 'الإقفال والتدقيق', 'إقفال الشهر أو السنة، فحص سلامة الدفاتر، سجل الفتح والإقفال', 'doc', 'close'),
        it('import', 'الأرصدة الافتتاحية', 'استيراد الأصناف والأسماء والأرصدة', 'in', 'import'),
        ctx.can('import') ? h('button', { type: 'button', class: 'ln link', style: { width: '100%', border: '0', background: 'none', textAlign: 'start', font: 'inherit', color: 'inherit', cursor: 'pointer' }, on: { click: () => backupAll(ctx) } },
          h('span', { class: 'k', style: { display: 'flex', gap: '12px', alignItems: 'center' } }, icon('doc', 22), h('span', null, h('b', null, 'نسخة احتياطية كاملة'), h('small', null, 'ملف واحد فيه كل الأصناف والأسماء والسندات والإعدادات'))), icon('fwd', 18)) : null,
        h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, ctx.user.name), h('small', null, (ctx.user.role === 'admin' ? 'مشرف' : 'كاشير') + '، ', h('bdi', null, ctx.user.email))),
          h('button', { class: 'btn ghost sm', on: { click: async () => { if (ctx.store.status.pending && !(await confirmBox('سندات لم تُرفع', ctx.store.status.pending + ' سند لم يصل الخادم بعد. إن خرجت الآن تبقى على هذا الجهاز وتُرفع عند دخولك ثانية. اخرج؟', 'خروج'))) return; ctx.logout(); } } }, 'خروج'))),
      h('p', { class: 'muted', style: { fontSize: '12.5px', textAlign: 'center', margin: '18px 0 2px' } }, 'نظام إدارة الصيدليات، تطوير وبرمجة MOSMAD'),
      h('p', { class: 'muted', style: { fontSize: '12.5px', textAlign: 'center', marginTop: '0' } },
        (S.name || 'الصيدلية') + '، الحسابات محسوبة من ' + ctx.store.vouchers.size + ' سنداً في ' + (ctx.store.L.ms || 0) + ' ملّي ثانية' + (window.JardApp && window.JardApp.version ? '، نسخة ' + window.JardApp.version() : '')))
  };
}

/* ---------- نسخة احتياطية كاملة (للمشرف) ---------- */
async function backupAll(ctx, quiet) {
  const st = ctx.store;
  if (!quiet && st.status.pending && !(await confirmBox('سندات لم تُرفع', st.status.pending + ' سند على هذا الجهاز لم يصل الخادم بعد، وهي داخلة في النسخة. أكمل؟', 'أكمل'))) return 'cancel';
  const data = {};
  for (const c of COLS) data[c] = Object.fromEntries([...(st.data[c] || new Map()).entries()].map(([k, v]) => [k, v && v.data !== undefined && v.u !== undefined ? v.data : v]));
  const now = new Date(), stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1_$2');
  const cfg = (window.JARD_CONFIG || {}).firebase || {};
  const pkg = { kind: 'pharm-backup', v: 1, at: now.toISOString(), project: cfg.projectId || '', by: ctx.user.email, counts: Object.fromEntries(COLS.map(c => [c, Object.keys(data[c]).length])), data };
  try {
    const r = await saveBlob('نسخة_الحسابات_' + stamp + '.json', new Blob([JSON.stringify(pkg)], { type: 'application/json' }));
    if (r === 'cancel') return 'cancel';
    toast('حُفظت النسخة: ' + pkg.counts.v + ' سند، ' + pkg.counts.items + ' صنف، ' + pkg.counts.parties + ' اسم');
    return 'ok';
  } catch (e) { toast('تعذّر حفظ النسخة: ' + e.message, { bad: true }); return 'error'; }
}

/* ---------- تصفير بيانات التجربة قبل التشغيل الفعلي ----------
   لا يُحذف شيء: كل سند فعّال يُلغى بسبب مسجّل (ويُخفى من «كل السندات»)، وتُفتح الفترات المقفلة،
   وتُوقف الأسماء والأصناف التي أُضيفت يدوياً للتجربة. تُحفظ نسخة احتياطية كاملة أولاً، وبدونها لا يبدأ. */
const RESET_WHY = 'تصفير بيانات التجربة قبل التشغيل الفعلي';
const isResetVoid = v => v.st === 'void' && v.vd && v.vd.reset;
function testState(store) {
  return {
    vs: [...store.vouchers.values()].filter(v => v.st !== 'void'),
    closes: activeCloses(store),
    lock: store.settings.lock || '',
    parties: [...store.parties.values()].filter(p => p.act !== false && !/^p\d{8}$/.test(p.id)),
    items: [...store.items.values()].filter(i => i.act !== false && /^i[0-9a-z]{8,}$/.test(i.id))
  };
}
function resetBox(ctx, after) {
  const { store } = ctx, T = testState(store);
  if (!T.vs.length && !T.closes.length && !T.lock) return null;
  const by = {}; for (const v of T.vs) by[v.t] = (by[v.t] || 0) + 1;
  const ds = T.vs.map(v => v.d).filter(Boolean).sort();
  return h('section', { class: 'page' },
    h('div', { class: 'ph' }, h('h2', null, 'في النظام بيانات قبل الافتتاح'), h('div', { class: 'meta' }, T.vs.length + ' سنداً فعّالاً' + (ds.length ? '، من ' + dmy(ds[0]) + ' إلى ' + dmy(ds[ds.length - 1]) : ''))),
    ...Object.entries(by).map(([t, n]) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, typeName(t))), h('span', { class: 'v num' }, String(n)))),
    T.lock ? h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, 'فترة مقفلة')), h('span', { class: 'v' }, 'حتى ' + dmy(T.lock))) : null,
    h('p', { class: 'muted', style: { fontSize: '14px', margin: '10px 4px' } }, 'إن كانت هذه بيانات تجربة، ألغِها كلها قبل استيراد الأرصدة الحقيقية حتى لا تدخل في الحسابات.'),
    h('button', { class: 'btn ghost wide', style: { color: 'var(--red)' }, on: { click: () => resetTest(ctx, after) } }, icon('trash', 20), 'إلغاء بيانات التجربة'));
}
function resetTest(ctx, after) {
  const { store } = ctx, T = testState(store);
  const chosen = new Set([...T.parties.map(p => 'p:' + p.id), ...T.items.map(i => 'i:' + i.id)]);
  const word = h('input', { type: 'text', autocomplete: 'off', placeholder: 'تصفير' });
  const prog = h('div', { class: 'muted', style: { minHeight: '22px', margin: '6px 4px' } });
  const pick = (k, label) => h('label', { class: 'field', style: { display: 'flex', gap: '10px', alignItems: 'center' } },
    h('input', { type: 'checkbox', checked: true, style: { width: '22px', minHeight: '22px' }, on: { change: e => { if (e.target.checked) chosen.add(k); else chosen.delete(k); } } }), label);
  const go = h('button', { class: 'btn danger' }, 'نسخة احتياطية ثم إلغاء');
  const s = sheet('إلغاء بيانات التجربة', h('div', null,
    h('p', { class: 'lead' }, 'يُلغى كل سند فعّال (' + T.vs.length + ')، بما فيه أي قيد افتتاحي، فتصبح كل الأرصدة والمخزون صفراً' + (T.lock || T.closes.length ? '، وتُفتح الفترة المقفلة' : '') + '. يبدأ ترقيم السندات من 1.'),
    h('p', { class: 'muted', style: { fontSize: '14px' } }, 'لا يُحذف شيء: السندات تبقى في السجل ملغاة بسبب «' + RESET_WHY + '». تُحفظ أولاً نسخة احتياطية كاملة، وإن لم تُحفظ لا يُلغى شيء.'),
    T.parties.length + T.items.length ? h('div', null,
      h('h3', { class: 'sect' }, 'أُضيفت يدوياً في التطبيق (تُوقف ولا تُحذف)'),
      ...T.parties.map(p => pick('p:' + p.id, p.n + ' (' + (PARTY_TYPES[p.t] || p.t) + ')')),
      ...T.items.map(i => pick('i:' + i.id, i.n + ' (صنف)')),
      h('p', { class: 'muted', style: { fontSize: '13px' } }, 'أزل العلامة عن أي اسم أو صنف حقيقي تريد بقاءه.')) : null,
    field('للتأكيد اكتب كلمة «تصفير»', word),
    prog,
    h('div', { class: 'actions' }, go, h('button', { class: 'btn ghost', on: { click: () => s.close() } }, 'رجوع'))), { tall: true });
  go.addEventListener('click', async () => {
    if (word.value.trim() !== 'تصفير') { toast('اكتب كلمة «تصفير» للتأكيد', { bad: true }); return; }
    go.disabled = true;
    try {
      prog.textContent = 'حفظ النسخة الاحتياطية…';
      if ((await backupAll(ctx, true)) !== 'ok') { prog.textContent = 'لم تُحفظ النسخة الاحتياطية، فلم يُلغَ شيء.'; go.disabled = false; return; }
      const who = { by: store.user.uid, bn: store.user.name };
      let n = 0;
      for (const v of T.vs) {
        await store.put('v', v.id, { st: 'void', vd: Object.assign({ at: Date.now(), why: RESET_WHY, reset: 1 }, who) }, true);
        prog.textContent = 'إلغاء السندات ' + (++n) + ' من ' + T.vs.length;
      }
      for (const c of T.closes) await store.put('meta', c.id, { reopened: Object.assign({ at: Date.now(), why: RESET_WHY }, who) }, true);
      if (T.lock || T.closes.length) await store.put('meta', 'settings', Object.assign({}, store.settings, { kind: 'settings', lock: '' }));
      for (const k of chosen) await store.put(k[0] === 'p' ? 'parties' : 'items', k.slice(2), { act: false }, true);
      await store.put('meta', 'lock_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        Object.assign({ kind: 'lockLog', action: 'reset', date: today(), prev: T.lock, n: T.vs.length, off: chosen.size, why: RESET_WHY, at: Date.now() }, who));
      toast('أُلغيت سندات التجربة (' + T.vs.length + ')' + (chosen.size ? ' وأُوقفت الأسماء والأصناف المختارة (' + chosen.size + ')' : '') + '. انتظر حتى يكتمل الرفع.');
      s.close();
      after();
    } catch (e) { prog.textContent = 'تعذّر: ' + (e.code || e.message); go.disabled = false; }
  });
}

/* ---------- كل السندات ---------- */
const VF = { g: 'all', q: '', n: 150 };
const GROUPS = [['all', 'الكل', null], ['s', 'المبيعات', ['sale', 'sret']], ['p', 'المشتريات', ['pur', 'pret']], ['c', 'القبض والصرف', ['rcpt', 'pay', 'cxf', 'jv']], ['i', 'المخزون', ['adj', 'xfer', 'open']]];
export function vouchersView(ctx) {
  const { store } = ctx;
  const g = GROUPS.find(x => x[0] === VF.g);
  const n = norm(VF.q);
  const mine = ctx.can('sup') ? null : ['sale', 'sret', 'pur', 'rcpt'];
  let hid = 0;
  let list = [...store.vouchers.values()].filter(v => { if (isResetVoid(v)) { hid++; return false; } return true; })
    .filter(v => (!mine || mine.includes(v.t)) && (!g[2] || g[2].includes(v.t)) && (!n || norm([v.no, typeName(v.t), partyName(store, v.pt), v.m, v.inv].join(' ')).includes(n)));
  list.sort((a, b) => (b.d + b.at) > (a.d + a.at) ? 1 : -1);
  const box = h('section', { class: 'page tight' });
  let lastD = '';
  for (const v of list.slice(0, VF.n)) {
    if (v.d !== lastD) { put(box, h('div', { class: 'sect', style: { margin: '12px 0 2px' } }, dmy(v.d))); lastD = v.d; }
    put(box, voucherLine(store, v));
  }
  if (!list.length) put(box, h('p', { class: 'empty' }, 'لا سندات.'));
  return {
    title: 'كل السندات', sub: list.length + ' سند' + (hid && ctx.can('sup') ? '، و' + hid + ' سند تجربة ملغى لا يظهر' : ''), live: true,
    el: h('div', null,
      h('input', { type: 'search', value: VF.q, placeholder: 'رقم السند أو الاسم أو البيان', on: { change: e => { VF.q = e.target.value; ctx.redraw(); } } }),
      h('div', { class: 'chips', style: { marginTop: '10px' } }, GROUPS.filter(x => ctx.can('sup') || x[0] !== 'i').map(([k, l]) => h('button', { class: 'chip' + (VF.g === k ? ' set' : ''), on: { click: () => { VF.g = k; ctx.redraw(); } } }, l))),
      box,
      list.length > VF.n ? h('button', { class: 'btn ghost wide', on: { click: () => { VF.n += 200; ctx.redraw(); } } }, 'عرض المزيد') : null)
  };
}

/* ---------- تفاصيل سند ---------- */
const fpx = price;
function when(t) { const d = new Date(t || 0), hh = d.getHours(), mm = String(d.getMinutes()).padStart(2, '0'); return dmy(today(t)) + ' الساعة ' + ((hh % 12) || 12) + ':' + mm + (hh < 12 ? ' ص' : ' م'); }
export function voucherView(ctx, id) {
  const { store } = ctx, v = store.vouchers.get(id);
  if (!v) return { title: 'السند', el: h('div', { class: 'note bad' }, 'السند غير موجود.') };
  if (!ctx.can('sup') && !['sale', 'sret', 'pur', 'rcpt'].includes(v.t)) return { title: typeName(v.t) + ' ' + (v.no || ''), el: h('div', { class: 'note bad' }, 'هذا السند للمشرف فقط.') };
  const tt = totals(v), L = store.L, meta = L.vm.get(id) || {};
  const isBuy = v.t === 'pur' || v.t === 'pret';
  const row = (k, val, cls) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, k)), h('span', { class: 'v ' + (cls || ''), style: { fontSize: '16px' } }, val));
  const lines = (v.ln || []).map(l => {
    const it = store.items.get(l.i) || {}, u = (it.u || [])[l.u] || {};
    const price = isBuy ? l.c : v.t === 'open' ? l.c : l.p;
    return h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, l.n || it.n), h('small', null, [qty(l.q) + ' ' + (u.n || '') + (l.f ? ' + بونص ' + qty(l.f) : ''), price != null ? '× ' + fpx(price) : '', l.x ? 'صلاحية ' + l.x : '', l.s2 ? STORES[l.s] + ' ← ' + STORES[l.s2] : STORES[l.s || 1]].filter(Boolean).join('، '))),
      price != null ? h('span', { class: 'v num', style: { fontSize: '15px' } }, money((+l.q || 0) * price)) : null);
  });
  // على الكمبيوتر: السطور جدول بأعمدة
  const anyF = (v.ln || []).some(l => +l.f), anyX = (v.ln || []).some(l => l.x), anyS = (v.ln || []).some(l => l.s2 || (l.s && l.s !== 1));
  const linesTable = () => h('table', { class: 'stmt vlines' },
    h('thead', null, h('tr', null, h('th', { class: 'i' }, '#'), h('th', null, 'الصنف'), h('th', { class: 'n' }, 'الكمية'), h('th', null, 'الوحدة'),
      anyF ? h('th', { class: 'n' }, 'بونص') : null, h('th', { class: 'n' }, isBuy || v.t === 'open' ? 'التكلفة' : 'السعر'),
      anyX ? h('th', null, 'الصلاحية') : null, anyS ? h('th', null, 'المخزن') : null, h('th', { class: 'n' }, 'المبلغ'))),
    h('tbody', null, (v.ln || []).map((l, i) => {
      const it = store.items.get(l.i) || {}, u = (it.u || [])[l.u] || {};
      const pr = isBuy ? l.c : v.t === 'open' ? l.c : l.p;
      return h('tr', { on: it.id ? { click: () => ctx.go('item/' + encodeURIComponent(it.id)) } : null },
        h('td', { class: 'i num' }, i + 1), h('td', null, l.n || it.n), h('td', { class: 'n num' }, qty(l.q)), h('td', null, u.n || ''),
        anyF ? h('td', { class: 'n num' }, +l.f ? qty(l.f) : '') : null, h('td', { class: 'n num' }, pr != null ? fpx(pr) : ''),
        anyX ? h('td', { class: 'num', style: { textAlign: 'right' } }, l.x || '') : null,
        anyS ? h('td', null, l.s2 ? STORES[l.s] + ' ← ' + STORES[l.s2] : STORES[l.s || 1]) : null,
        h('td', { class: 'n num' }, pr != null ? money((+l.q || 0) * pr) : ''));
    })));
  const posts = L.post.filter(e => e.v.id === id);
  const who = v.pt ? partyName(store, v.pt) : v.ac ? (store.accounts.get(v.ac) || {}).n : '';
  const locked = store.settings.lock && v.d <= store.settings.lock;
  const doVoid = async () => {
    const why = h('input', { placeholder: 'مثلاً: فاتورة مكررة' });
    const s = sheet('إلغاء ' + typeName(v.t) + ' ' + (v.no || ''), h('div', null,
      h('p', { class: 'lead' }, 'يبقى السند في السجل مشطوباً، وتُعاد الأرصدة والمخزون كأنه لم يكن.'),
      field('سبب الإلغاء', why),
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', on: { click: async () => { if (!why.value.trim()) { toast('اكتب السبب', { bad: true }); return; } await store.voidVoucher(id, why.value.trim()); s.close(); toast('أُلغي السند'); } } }, 'إلغاء السند'))));
  };
  return {
    title: typeName(v.t) + ' ' + (v.no || ''), sub: dmy(v.d), live: true,
    el: h('div', null,
      v.st === 'void' ? h('div', { class: 'note bad' }, 'ملغى' + (v.vd ? ' بواسطة ' + (v.vd.bn || '') + (v.vd.why ? '، السبب: ' + v.vd.why : '') : '')) : null,
      h('section', { class: 'page' },
        h('div', { class: 'ph' }, h('h2', null, typeName(v.t) + ' ' + (v.no || '')), h('div', { class: 'meta' }, [dmy(v.d), who, v.inv ? 'فاتورة المورد ' + v.inv : ''].filter(Boolean).join('، '))),
        ...(wide() && lines.length ? [linesTable()] : lines),
        tt.ds ? row('الخصم', h('span', { class: 'num' }, money(tt.ds))) : null,
        row(v.t === 'open' ? 'رأس المال الناتج' : 'الإجمالي', h('span', { class: 'num' }, money(v.t === 'open' || v.t === 'adj' ? meta.tot || 0 : tt.tot))),
        ['sale', 'sret', 'pur', 'pret'].includes(v.t) ? row('المدفوع نقداً', h('span', { class: 'num' }, money(tt.pd))) : null,
        tt.credit > 0.004 && ['sale', 'sret', 'pur', 'pret'].includes(v.t) ? row('آجل', h('span', { class: 'num' }, money(tt.credit)), 'amber') : null,
        ctx.can('profit') && v.t === 'sale' ? row('ربح الفاتورة', h('span', { class: 'num' }, money(meta.gp || 0)), (meta.gp || 0) < 0 ? 'red' : 'green') : null,
        v.m ? row('البيان', v.m) : null,
        row('أدخله', [v.bn || '', v.at > 1e11 ? when(v.at) : 'مستورد من BetaSys'].filter(Boolean).join('، '))),
      posts.length && ctx.can('profit') ? h('h3', { class: 'sect' }, 'القيد المحاسبي') : null,
      posts.length && ctx.can('profit') ? h('section', { class: 'page tight' }, h('table', { class: 'stmt' },
        h('thead', null, h('tr', null, h('th', null, 'الحساب'), h('th', { class: 'n' }, 'مدين'), h('th', { class: 'n' }, 'دائن'))),
        h('tbody', null, posts.map(e => h('tr', null, h('td', null, (store.accounts.get(e.a) || {}).n || e.a, e.p ? h('small', { style: { display: 'block' } }, partyName(store, e.p)) : null), h('td', { class: 'n num' }, e.dr ? money(e.dr) : ''), h('td', { class: 'n num' }, e.cr ? money(e.cr) : '')))))) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', on: { click: () => exportVoucher(store, v) } }, icon('print', 20), 'تصدير وطباعة'),
        ['sale', 'sret', 'rcpt', 'pay'].includes(v.t) ? h('button', { class: 'btn ghost', on: { click: () => printVoucher(store, v) } }, 'إيصال صغير') : null,
        h('button', { class: 'btn ghost', on: { click: async () => { const r = await shareText(typeName(v.t) + ' ' + (v.no || '') + '\n' + dmy(v.d) + (who ? '\n' + who : '') + '\n' + (v.ln || []).map(l => (l.n || '') + ' × ' + qty(l.q)).join('\n') + '\nالإجمالي: ' + money(tt.tot)); if (r === 'copied') toast('نُسخ النص'); } } }, icon('share', 20), 'مشاركة'),
        ctx.can('void') && v.st !== 'void' && !locked ? h('button', { class: 'btn ghost', style: { color: 'var(--red)' }, on: { click: doVoid } }, icon('trash', 20), 'إلغاء') : null))
  };
}

/* ---------- الإعدادات ---------- */
export function settingsView(ctx) {
  const { store, be } = ctx;
  if (!ctx.can('settings')) return { title: 'الإعدادات', el: h('div', { class: 'note bad' }, 'للمشرف فقط.') };
  const S = Object.assign({ name: '', addr: '', ph: '', foot: '', pw: 58, lock: '' }, store.settings);
  const save = async (msg) => { await store.put('meta', 'settings', Object.assign({}, S, { kind: 'settings' })); toast(msg || 'حُفظ'); };
  const accList = kind => h('section', { class: 'page tight' }, [...store.accounts.values()].filter(a => a.k === kind).map(a => h('div', { class: 'ln' },
    h('span', { class: 'k' }, h('b', null, a.n), h('small', null, a.id + (a.act === false ? '، موقوف' : ''))),
    h('button', { class: 'btn ghost sm', on: { click: async () => { const n = prompt('الاسم الجديد', a.n); if (n && n.trim()) { await store.put('accounts', a.id, { n: n.trim(), k: a.k }, true); toast('حُفظ'); ctx.redraw(); } } } }, 'تسمية'))));
  const addAcc = async (kind, base, label) => {
    const n = prompt(label); if (!n || !n.trim()) return;
    let id = base; while (store.accounts.has(String(id))) id++;
    await store.put('accounts', String(id), { n: n.trim(), k: kind }); toast('أُضيف'); ctx.redraw();
  };
  const users = h('section', { class: 'page tight' }, h('p', { class: 'muted', style: { padding: '8px 0' } }, 'جارٍ تحميل المستخدمين…'));
  if (be.listStaff) be.listStaff().then(list => {
    users.textContent = '';
    for (const u of list) {
      const role = u.acc || (u.role === 'admin' ? 'admin' : '');
      put(users, h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, u.name || u.id), h('small', null, h('bdi', null, u.id))),
        h('select', { style: { width: 'auto' }, disabled: u.id === ctx.user.email, on: { change: async e => { try { await be.setStaff(u.id, { acc: e.target.value }); toast('حُفظت صلاحية ' + (u.name || u.id)); } catch (x) { toast('تعذّر: ' + (x.code || x.message) + '. حدّث قواعد Firestore.', { bad: true }); } } } },
          [['', 'لا يدخل الحسابات'], ['cashier', 'كاشير'], ['admin', 'مشرف']].map(([v, l]) => h('option', { value: v, selected: role === v }, l)))));
    }
  }).catch(e => { users.textContent = ''; put(users, h('p', { class: 'note bad' }, 'تعذّر تحميل المستخدمين: ' + (e.code || e.message))); });
  return {
    title: 'الإعدادات',
    el: h('div', null,
      h('h3', { class: 'sect' }, 'بيانات الصيدلية'),
      field('اسم الصيدلية', h('input', { value: S.name, on: { input: e => { S.name = e.target.value; } } })),
      h('div', { class: 'row2' }, field('العنوان', h('input', { value: S.addr, on: { input: e => { S.addr = e.target.value; } } })), field('الهاتف', h('input', { value: S.ph, class: 'num', on: { input: e => { S.ph = e.target.value; } } }))),
      field('سطر أسفل الفاتورة', h('input', { value: S.foot, placeholder: 'شكراً لزيارتكم', on: { input: e => { S.foot = e.target.value; } } })),
      field('عرض ورق الطابعة', seg([[58, '58 ملم'], [80, '80 ملم']], +S.pw || 58, v => { S.pw = v; })),
      desktopPrinter(),
      h('button', { class: 'btn wide', on: { click: () => save('حُفظت بيانات الصيدلية') } }, 'حفظ'),
      h('p', { class: 'muted', style: { margin: '14px 4px 0', fontSize: '13px' } }, 'قاعدة البيانات المتصل بها: ', h('bdi', null, ((window.JARD_CONFIG || {}).firebase || {}).projectId || '؟'), (window.JARD_CONFIG || {}).env ? ' (اختبار)' : ' (إنتاج)'),
      h('h3', { class: 'sect' }, 'قفل الفترة'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'بعد إقفال فترة لا يمكن إضافة أو إلغاء أي سند بتاريخ فيها، فتبقى أرقامها ثابتة.'),
      h('a', { class: 'ln link', href: '#/close' }, h('span', { class: 'k' }, h('b', null, S.lock ? 'مقفل حتى ' + dmy(S.lock) : 'لا توجد فترة مقفلة'), h('small', null, 'الإقفال وإعادة الفتح من شاشة «الإقفال والتدقيق» (فحوصات ولقطة وسجل تدقيق)')), icon('fwd', 18)),
      h('h3', { class: 'sect' }, 'الصناديق'), accList('cash'),
      h('button', { class: 'btn ghost wide', on: { click: () => addAcc('cash', 1102, 'اسم الصندوق الجديد (مثلاً: صندوق الإدارة، الكريمي)') } }, icon('plus', 18), 'صندوق جديد'),
      h('h3', { class: 'sect' }, 'أنواع المصروفات'), accList('exp'),
      h('button', { class: 'btn ghost wide', on: { click: () => addAcc('exp', 6910, 'اسم المصروف الجديد') } }, icon('plus', 18), 'نوع مصروف جديد'),
      h('h3', { class: 'sect' }, 'المستخدمون'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'أنشئ المستخدم أولاً في Firebase كما في تطبيق الجرد، ثم حدّد صلاحيته هنا.'),
      users)
  };
}

/** على الكمبيوتر: طابعة الإيصالات التي تُطبع عليها الفواتير مباشرة */
function desktopPrinter() {
  const A = window.JardApp;
  if (!A || !A.printers) return null;
  const sel = h('select', { on: { change: async e => { await A.setPrinter(e.target.value); toast(e.target.value ? 'تُطبع الفواتير مباشرة على ' + e.target.value : 'ستظهر نافذة الطباعة عند كل فاتورة'); } } }, h('option', { value: '' }, 'جارٍ تحميل الطابعات…'));
  Promise.all([A.printers(), A.getPrinter()]).then(([list, cur]) => {
    sel.textContent = '';
    sel.appendChild(h('option', { value: '' }, 'اسألني عند كل طباعة'));
    for (const p of list || []) sel.appendChild(h('option', { value: p.name, selected: p.name === cur }, (p.displayName || p.name) + (p.isDefault ? ' (الافتراضية)' : '')));
  }).catch(() => { sel.textContent = ''; sel.appendChild(h('option', { value: '' }, 'تعذّر قراءة الطابعات')); });
  return h('div', null,
    field('طابعة الإيصالات (على هذا الكمبيوتر)', sel, 'الفواتير تُطبع عليها مباشرة دون نافذة. التقارير والكشوف تفتح نافذة الطباعة دائماً.'),
    h('button', { class: 'btn ghost wide', style: { marginBottom: '12px' }, on: { click: () => printHtml('<div style="text-align:center"><h2>طباعة تجربة</h2><div>إن ظهرت هذه الورقة فالطابعة جاهزة.</div></div>', 'تجربة', 'receipt') } }, 'طباعة تجربة'));
}

/* ---------- الأرصدة الافتتاحية ---------- */
/* ---------- فحص حزمة الأرصدة الافتتاحية: أي خطأ يمنع الرفع والقيد ---------- */
export function validateOpening(pkg, store) {
  const G = {}, W = {};
  const bad = (m, who) => { (G[m] || (G[m] = [])).push(who); }, warn = (m, who) => { (W[m] || (W[m] = [])).push(who); };
  const arr = k => Array.isArray(pkg[k]) ? pkg[k] : [];
  for (const k of ['items', 'parties', 'stock']) if (!Array.isArray(pkg[k])) bad('ينقص الملف القسم ' + k, k);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pkg.asof || '')) warn('الملف بلا تاريخ asof صحيح', 'asof');
  const items = arr('items'), parties = arr('parties'), stock = arr('stock'), cash = arr('cash');
  const dup = (list, label) => { const seen = new Set(); for (const x of list) { const k = x && x.id; if (k == null || k === '') { bad(label + ' بلا رقم', '؟'); continue; } if (seen.has(k)) bad(label + ' مكرر', k); seen.add(k); } };
  dup(items, 'صنف'); dup(parties, 'طرف');
  const ids = new Set(items.map(x => x && x.id));
  for (const x of items) {
    if (!x || !x.n) bad('صنف بلا اسم', x && x.id);
    else if (!Array.isArray(x.u) || !x.u.length || +x.u[0].s !== 1 || x.u.some(u => !u.n || !(+u.s > 0))) bad('وحدات الصنف غير صحيحة (الوحدة الأولى حجمها 1 ولكل وحدة اسم وحجم)', x.n);
    else if (!(+x.u[0].p > 0)) warn('صنف سعر بيعه صفر', x.n);
  }
  for (const p of parties) {
    if (!p || !p.n) bad('طرف بلا اسم', p && p.id);
    else if (!['c', 's', 'e', 'o'].includes(p.t)) bad('نوع طرف غير معروف (c عميل، s مورد، e موظف، o آخر)', p.n);
    else if (p.b != null && !isFinite(+p.b)) bad('رصيد طرف غير رقمي', p.n);
    else if (p.t === 's' && +p.b > 0) warn('مورد برصيد موجب (أي لنا عنده، وهو عكس المعتاد: المستحق للمورد يُكتب بالسالب)', p.n);
    else if (p.t === 'c' && +p.b < 0) warn('عميل برصيد سالب (دائن)', p.n);
  }
  const seenSt = new Set();
  for (const l of stock) {
    const nm = (store.items.get(l.i) || items.find(x => x.id === l.i) || {}).n || l.i;
    if (!ids.has(l.i) && !store.items.has(l.i)) bad('سطر مخزون لصنف غير موجود في الملف ولا في النظام', l.i);
    if (!(+l.q > 0) || !isFinite(+l.q)) bad('كمية غير صحيحة في سطر مخزون', nm);
    if (!isFinite(+l.c) || +l.c < 0) bad('تكلفة غير صحيحة في سطر مخزون', nm);
    else if (+l.c === 0) warn('سطر مخزون بتكلفة صفر', nm);
    if (l.s != null && ![1, 2, '1', '2'].includes(l.s)) bad('مخزن غير معروف (1 الصيدلية، 2 المخزن)', nm);
    if (l.x && parseExp(l.x) !== l.x) warn('صلاحية بغير صيغة شهر/سنة (مثل 03/2028)', nm);
    const k = l.i + '|' + (+l.s === 2 ? 2 : 1) + '|' + (l.x || ''); if (seenSt.has(k)) warn('سطران لنفس الصنف والمخزن والصلاحية', nm); seenSt.add(k);
  }
  for (const c of cash) {
    const a = store.accounts.get(c.ca);
    if (!a || a.k !== 'cash') bad('صندوق غير موجود في الإعدادات (أنشئه أولاً وانسخ رقمه)', String(c.ca));
    if (!isFinite(+c.b)) bad('رصيد صندوق غير رقمي', String(c.ca));
  }
  const fmt = (o, pre) => Object.entries(o).map(([m, w]) => pre + m + ' (' + w.length + '): ' + w.slice(0, 4).join('، ') + (w.length > 4 ? '…' : ''));
  return { err: fmt(G, ''), warn: fmt(W, '') };
}

const IMP = { pkg: null, D: null };
export function importView(ctx) {
  const { store, be } = ctx;
  if (!ctx.can('import')) return { title: 'الأرصدة الافتتاحية', el: h('div', { class: 'note bad' }, 'للمشرف فقط.') };
  const out = h('div');
  // يبقى الملف المختار إن أعيد رسم الصفحة (تدوير الشاشة أو تغيير حجم النافذة)
  let pkg = IMP.pkg;
  const file = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, on: { change: async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { pkg = JSON.parse(await f.text()); if (pkg.kind !== 'pharm-opening') throw new Error('kind'); IMP.pkg = pkg; IMP.D = null; }
    catch (x) { pkg = null; IMP.pkg = null; out.textContent = ''; put(out, h('div', { class: 'note bad' }, 'الملف ليس ملف أرصدة افتتاحية صحيحاً (' + f.name + ').')); return; }
    IMP.D = Object.assign(D, { d: /^\d{4}-\d{2}-\d{2}$/.test(pkg.asof || '') ? pkg.asof : today(), stock: true, parties: true, cash: true });
    drawPkg();
  } } });
  const D = IMP.D || (IMP.D = { d: today(), stock: true, parties: true, cash: true });
  let creating = false;
  const isStore2 = () => !!pkg && (pkg.part === 'store2' || (pkg.stock.length > 0 && pkg.stock.every(x => +x.s === 2) && !pkg.parties.some(p => Math.abs(p.b || 0) > 0.004) && !(pkg.cash || []).some(c => +c.b)));
  function drawPkg() {
    out.textContent = '';
    const nC = pkg.parties.filter(p => p.t === 'c').length, nS = pkg.parties.filter(p => p.t === 's').length;
    const stockV = r2(pkg.stock.reduce((s, x) => s + x.q * x.c, 0));
    const recv = r2(pkg.parties.filter(p => p.b > 0).reduce((s, p) => s + p.b, 0)), pay = r2(-pkg.parties.filter(p => p.b < 0).reduce((s, p) => s + p.b, 0));
    const cash = r2((pkg.cash || []).reduce((s, x) => s + x.b, 0));
    const newItems = pkg.items.filter(x => !store.items.has(x.id)).length, newParties = pkg.parties.filter(x => !store.parties.has(x.id)).length;
    const status = h('div'), V = validateOpening(pkg, store);
    const sv = k => r2(pkg.stock.filter(x => (+x.s === 2 ? 2 : 1) === k).reduce((t, x) => t + x.q * x.c, 0));
    const sn = k => pkg.stock.filter(x => (+x.s === 2 ? 2 : 1) === k).length;
    put(out,
      V.err.length ? h('div', { class: 'note bad' }, h('b', null, 'أخطاء تمنع الرفع والقيد:'), ...V.err.map(e => h('div', null, '• ' + e))) : h('div', { class: 'note good' }, '✓ الحزمة سليمة البنية'),
      V.warn.length ? h('div', { class: 'note' }, h('b', null, 'تنبيهات للمراجعة:'), ...V.warn.map(e => h('div', null, '• ' + e))) : null,
      h('section', { class: 'page' },
        h('div', { class: 'ph' }, h('h2', null, 'ملف ' + (pkg.src || '')), h('div', { class: 'meta' }, 'أرصدة بتاريخ ' + dmy(pkg.asof || ''))),
        lnx('الأصناف', pkg.items.length + (newItems < pkg.items.length ? ' (' + newItems + ' جديد)' : '')),
        lnx('العملاء', nC), lnx('الموردون', nS), lnx('موظفون وغيرهم', pkg.parties.length - nC - nS),
        lnx('المخزون بالتكلفة', money(stockV) + ' (' + pkg.stock.length + ' سطر)'),
        lnx('· في الصيدلية', money(sv(1)) + ' (' + sn(1) + ' سطر)'), lnx('· في المخزن', money(sv(2)) + ' (' + sn(2) + ' سطر)'),
        lnx('لنا عند العملاء وغيرهم', money(recv)), lnx('علينا للموردين وغيرهم', money(pay)), lnx('النقدية', money(cash)),
        lnx('رأس المال الناتج', money(r2(stockV + recv + cash - pay)), 'green')),
      h('h3', { class: 'sect' }, '1. الأصناف والأسماء'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'تُضاف الأصناف (بالباركود والوحدات والأسعار) والأسماء دون أرصدة. يمكن تكرار هذه الخطوة بأمان.'),
      h('button', { class: 'btn wide', disabled: V.err.length > 0, on: { click: async e => {
        const nOld = pkg.items.filter(x => store.items.has(x.id)).length + pkg.parties.filter(x => store.parties.has(x.id)).length;
        if (nOld && !(await confirmBox('تحديث بيانات موجودة', nOld + ' صنف أو اسم موجود سيُحدَّث بقيم الملف (الأسعار والباركود والوحدات والأسماء)، فتُفقد أي تعديلات أُجريت عليها في التطبيق. أكمل فقط إن كنت تقصد ذلك.', 'تحديث', true))) return;
        e.target.disabled = true;
        try {
          status.textContent = 'جارٍ رفع الأصناف…';
          const items = pkg.items.map(x => ({ id: x.id, data: Object.assign({}, store.items.get(x.id) || {}, x, { act: true, at: Date.now() }) }));
          await be.putMany('items', items, (a, b) => { status.textContent = 'الأصناف ' + a + ' من ' + b; });
          const parties = pkg.parties.map(p => ({ id: p.id, data: Object.assign({}, store.parties.get(p.id) || {}, { id: p.id, n: p.n, t: p.t, ph: p.ph || '', act: true, at: Date.now() }, p.nbr ? { nbr: 1 } : {}) }));
          await be.putMany('parties', parties, (a, b) => { status.textContent = 'الأسماء ' + a + ' من ' + b; });
          status.textContent = 'تم: ' + items.length + ' صنف و' + parties.length + ' اسم.';
        } catch (x) { status.textContent = x.code === 'permission-denied' ? 'Firebase رفض الكتابة: انشر قواعد Firestore الجديدة أولاً ثم أعد المحاولة.' : 'تعذّر: ' + (x.code || x.message); }
        e.target.disabled = false;
      } } }, 'رفع الأصناف والأسماء'), status,
      isStore2() ? h('div', { class: 'note' }, h('b', null, 'حزمة مخزون المخزن فقط. '), 'تُضاف قيداً تكميلياً بعد القيد الافتتاحي الأساسي، بنفس تاريخه، مرة واحدة.') : null,
      h('h3', { class: 'sect' }, '2. القيد الافتتاحي'),
      h('p', { class: 'muted', style: { margin: '0 4px 8px', fontSize: '14px' } }, 'سند واحد بتاريخ بداية السنة: المخزون والأرصدة والنقدية، ورأس المال = الأصول − الالتزامات. يمكنك إلغاؤه وإعادته إن تغيرت الأرقام.'),
      field('تاريخ القيد', h('input', { type: 'date', value: D.d, on: { change: e => { D.d = e.target.value; } } })),
      chk('المخزون', 'stock'), chk('أرصدة العملاء والموردين', 'parties'), chk('النقدية', 'cash'),
      h('button', { class: 'btn wide', disabled: V.err.length > 0, on: { click: makeOpening } }, isStore2() ? 'إضافة مخزون المخزن' : 'إنشاء القيد الافتتاحي'));
  }
  const lnx = (k, v, cls) => h('div', { class: 'ln' }, h('span', { class: 'k' }, h('b', null, k)), h('span', { class: 'v num ' + (cls || ''), style: { fontSize: '16px' } }, String(v)));
  const chk = (label, k) => h('label', { class: 'field', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: D[k], style: { width: '22px', minHeight: '22px' }, on: { change: e => { D[k] = e.target.checked; } } }), label);
  async function makeOpening() {
    if (creating) return;
    const V = validateOpening(pkg, store);
    if (V.err.length) { toast('أصلح أخطاء الملف أولاً', { bad: true }); return; }
    if (store.status.pending) { toast('انتظر اكتمال رفع السندات (' + store.status.pending + ') ثم أعد المحاولة', { bad: true }); return; }
    const had = [...store.vouchers.values()].filter(x => x.t === 'open' && x.st !== 'void');
    if (had.length && !isStore2()) { toast('يوجد قيد افتتاحي فعّال. ألغِه من سجل السندات (بسبب مسجّل) قبل إنشاء بديل، منعاً للتكرار.', { bad: true }); return; }
    if (isStore2()) {
      // مخزون المخزن يُجرد بعد الافتتاح: يُضاف قيداً تكميلياً مرة واحدة، بنفس تاريخ القيد الافتتاحي وبعده مباشرة
      if (!had.length) { toast('أنشئ القيد الافتتاحي الأساسي أولاً، ثم أضف مخزون المخزن.', { bad: true }); return; }
      if (had.some(o => (o.ln || []).some(l => +l.s === 2))) { toast('مخزون المخزن موجود في قيد افتتاحي سابق، فلا يُضاف مرتين.', { bad: true }); return; }
      const base = had.slice().sort((a, b) => (a.at || 0) - (b.at || 0))[0];
      if (!(await confirmBox('إضافة مخزون المخزن', pkg.stock.length + ' سطراً بقيمة ' + money(r2(pkg.stock.reduce((t, x) => t + x.q * x.c, 0))) + '، بتاريخ القيد الافتتاحي ' + dmy(base.d) + '. يُضاف مرة واحدة ويرفع رأس المال بقيمته.', 'إضافة'))) return;
      creating = true; try { await makeOpening2(base); } finally { creating = false; }
      return;
    }
    const others = [...store.vouchers.values()].filter(x => x.st !== 'void' && x.t !== 'open');
    if (others.length && !(await confirmBox('سندات موجودة قبل الافتتاح', 'في النظام ' + others.length + ' سنداً فعّالاً (بيع أو شراء أو غيرها) ستدخل في الحسابات مع الأرصدة الافتتاحية. إن كانت للتجربة فارجع وألغِها بزر «إلغاء بيانات التجربة» أعلى الصفحة. أكمل رغم ذلك؟', 'أكمل', true))) return;
    if (pkg.asof && D.d !== pkg.asof && !(await confirmBox('تاريخ القيد يخالف تاريخ الملف', 'الملف بتاريخ ' + dmy(pkg.asof) + ' وتاريخ القيد المختار ' + dmy(D.d) + '. الأرصدة تُنسب للتاريخ الذي تختاره. أكمل؟', 'متابعة', true))) return;
    creating = true; try { await makeOpening2(); } finally { creating = false; }
  }
  async function makeOpening2(base) {
    const missingI = pkg.stock.filter(x => !store.items.has(x.i)).length, missingP = pkg.parties.filter(p => p.b && !store.parties.has(p.id)).length;
    if ((D.stock && missingI) || (D.parties && missingP && !base)) { toast('ارفع الأصناف والأسماء أولاً (الخطوة 1) وانتظر اكتمالها.', { bad: true }); return; }
    const v = base
      ? { t: 'open', d: base.d, at: (base.at || Date.now()) + 1, m: 'مخزون المخزن الافتتاحي (قيد تكميلي) من جرد ' + (pkg.asof || ''), ln: [], pb: [], cb: [] }
      : { t: 'open', d: D.d, m: 'أرصدة افتتاحية من ' + (pkg.src || 'الملف') + ' بتاريخ ' + (pkg.asof || ''), ln: [], pb: [], cb: [] };
    if (base) { D.stock = true; D.parties = false; D.cash = false; }
    if (D.stock) v.ln = pkg.stock.filter(x => x.q > 0).map(x => { const it = store.items.get(x.i); return { i: x.i, n: it ? it.n : x.i, u: 0, z: 1, q: x.q, c: x.c, s: x.s || 1, ...(x.x ? { x: x.x } : {}) }; });
    if (D.parties) v.pb = pkg.parties.filter(p => Math.abs(p.b || 0) > 0.004).map(p => ({ pt: p.id, b: p.b }));
    if (D.cash) v.cb = (pkg.cash || []).filter(x => x.b).map(x => ({ ca: store.accounts.has(x.ca) ? x.ca : '1101', b: x.b }));
    const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
    if (err) { toast(err, { bad: true }); return; }
    const doc = await store.saveVoucher(v);
    toast(base ? 'أُضيف مخزون المخزن' : 'أُنشئ القيد الافتتاحي');
    ctx.go('vch/' + encodeURIComponent(doc.id));
  }
  if (pkg) setTimeout(drawPkg, 0);
  return {
    title: 'الأرصدة الافتتاحية',
    el: h('div', null,
      resetBox(ctx, () => ctx.redraw()),
      h('p', { class: 'lead' }, 'اختر ملف الأرصدة الافتتاحية (pharm-opening.json) الذي جهّزناه من نسخة BetaSys بعد مراجعة الديون.'),
      h('label', { class: 'btn ghost wide' }, icon('doc', 20), 'اختيار ملف الأرصدة', file), out)
  };
}
