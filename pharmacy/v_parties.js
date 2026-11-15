/* العملاء والموردون وكشوف الحساب */
import { h, icon, toast, field, seg, confirmBox, put, sheet, numField } from './ui.js';
import { money, norm, dmy, today, daysBetween, num } from './util.js';
import { statement, partyBalance, PARTY_TYPES, totals, check, CTRL } from './engine.js';
import { balWords, balEl, periodChips, periodRange, typeName, printVoucher } from './common.js';
import { shareText, saveXlsx, printHtml } from './out.js';

const TABS = [['c', 'العملاء'], ['s', 'الموردون'], ['e', 'الموظفون'], ['o', 'أخرى']];
const view = { q: '', sort: 'bal' };

export function partiesView(ctx, type) {
  const { store } = ctx, L = store.L;
  const rows = [];
  let total = 0;
  for (const p of store.parties.values()) {
    if (p.t !== type || p.act === false) continue;
    const b = partyBalance(L, p.id), y = L.pty.get(p.id) || {};
    rows.push({ p, b, last: y.last || '', lastPay: y.lastPay || '' });
    total += b;
  }
  const list = h('section', { class: 'page tight' });
  const q = h('input', { type: 'search', value: view.q, placeholder: 'ابحث بالاسم أو الهاتف', on: { input: e => { view.q = e.target.value; draw(); } } });
  function draw() {
    list.textContent = '';
    const n = norm(view.q);
    let r = n ? rows.filter(x => norm(x.p.n + ' ' + (x.p.ph || '')).includes(n)) : rows.slice();
    if (view.sort === 'bal') r.sort((a, b) => Math.abs(b.b) - Math.abs(a.b));
    else if (view.sort === 'name') r.sort((a, b) => a.p.n.localeCompare(b.p.n, 'ar'));
    else r.sort((a, b) => (b.last || '').localeCompare(a.last || ''));
    if (!r.length) { put(list, h('p', { class: 'empty' }, n ? 'لا أحد بهذا الاسم.' : 'لا أسماء هنا بعد.')); return; }
    for (const x of r.slice(0, 300)) {
      const idle = x.b > 0.5 && type === 'c' && (x.lastPay || x.last) ? daysBetween(x.lastPay || x.last, today()) : 0;
      put(list, h('a', { class: 'ln link', href: '#/party/' + encodeURIComponent(x.p.id) },
        h('span', { class: 'k' }, h('b', null, x.p.n), h('small', null, [x.p.ph, x.last ? 'آخر حركة ' + dmy(x.last) : 'بلا حركة', idle > 90 ? 'لم يسدد منذ ' + idle + ' يوماً' : ''].filter(Boolean).join('، '))),
        balEl(x.b, type)));
    }
    if (r.length > 300) put(list, h('p', { class: 'empty' }, 'يظهر أول 300 اسم. ابحث للوصول إلى غيرهم.'));
  }
  draw();
  const tw = balWords(total, type);
  return {
    title: 'الحسابات', live: true,
    actions: ctx.can('party-add') ? [h('a', { class: 'iconbtn', href: '#/party-edit//' + type, 'aria-label': 'إضافة اسم' }, icon('plus'))] : [],
    el: h('div', null,
      seg(TABS, type, v => ctx.go('parties/' + v, true)),
      h('div', { class: 'ln', style: { borderBottom: 0, padding: '14px 4px 6px' } },
        h('span', { class: 'k' }, h('b', null, type === 's' ? 'مجموع ما علينا' : type === 'c' ? 'مجموع ما لنا' : 'الصافي'), h('small', null, rows.length + ' اسم')),
        h('span', { class: 'v num' }, money(tw.amt), ' ', h('small', null, tw.txt))),
      h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px' } }, q,
        h('select', { style: { width: 'auto' }, on: { change: e => { view.sort = e.target.value; draw(); } } },
          [['bal', 'الأكبر رصيداً'], ['name', 'بالاسم'], ['last', 'الأحدث حركة']].map(([v, l]) => h('option', { value: v, selected: view.sort === v }, l)))),
      list)
  };
}

const stState = { per: 'y' };
export function partyView(ctx, id) {
  const { store } = ctx, p = store.parties.get(id);
  if (!p) return { title: 'الحساب', el: h('div', { class: 'note bad' }, 'الاسم غير موجود.') };
  const L = store.L;
  const [from, to] = periodRange(stState.per);
  const st = statement(L, { p: id, from, to });
  const b = partyBalance(L, id), w = balWords(b, p.t);
  const tbl = h('table', { class: 'stmt' },
    h('thead', null, h('tr', null, h('th', null, 'التاريخ'), h('th', null, 'البيان'), h('th', { class: 'n' }, 'مدين'), h('th', { class: 'n' }, 'دائن'), h('th', { class: 'n' }, 'الرصيد'))),
    h('tbody', null,
      from && st.open ? h('tr', { class: 'open' }, h('td', { class: 'd' }, dmy(from)), h('td', null, 'رصيد سابق'), h('td'), h('td'), h('td', { class: 'n num' }, money(st.open))) : null,
      st.rows.map(r => h('tr', { on: { click: () => ctx.go('vch/' + encodeURIComponent(r.v.id)) } },
        h('td', { class: 'd' }, dmy(r.d)), h('td', null, r.m), h('td', { class: 'n num' }, r.dr ? money(r.dr) : ''), h('td', { class: 'n num' }, r.cr ? money(r.cr) : ''), h('td', { class: 'n num' }, money(r.bal)))),
      h('tr', { class: 'close' }, h('td'), h('td', null, 'الإجمالي'), h('td', { class: 'n num' }, money(st.dr)), h('td', { class: 'n num' }, money(st.cr)), h('td', { class: 'n num' }, money(st.close)))));

  const textSummary = () => {
    const S = store.settings, cw = balWords(st.close, p.t);
    const last = st.rows.slice(-6).map(r => dmy(r.d) + '  ' + r.m + '  ' + (r.dr ? '+' + money(r.dr) : '-' + money(r.cr)));
    return [(S.name || 'الصيدلية') + ' — كشف حساب', p.n, (from ? 'من ' + dmy(from) + ' ' : '') + 'حتى ' + dmy(to || today()), '', ...last, '', 'الرصيد: ' + money(cw.amt) + ' ريال ' + cw.txt].join('\n');
  };
  const rowsX = () => [['التاريخ', 'البيان', 'مدين', 'دائن', 'الرصيد'], ...(from && st.open ? [[from, 'رصيد سابق', '', '', st.open]] : []), ...st.rows.map(r => [r.d, r.m, r.dr || '', r.cr || '', r.bal]), ['', 'الإجمالي', st.dr, st.cr, st.close]];
  const printSt = () => {
    const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const body = rowsX().slice(1).map(r => `<tr><td>${esc(r[0] ? dmy(r[0]) : '')}</td><td>${esc(r[1])}</td><td class="n">${r[2] !== '' ? money(r[2]) : ''}</td><td class="n">${r[3] !== '' ? money(r[3]) : ''}</td><td class="n">${money(r[4])}</td></tr>`).join('');
    printHtml(`<div><h2>${esc(store.settings.name || 'الصيدلية')}</h2><div class="pc">كشف حساب: ${esc(p.n)}${p.ph ? ' — ' + esc(p.ph) : ''}</div><div class="pc">${from ? 'من ' + dmy(from) + ' ' : ''}حتى ${dmy(to || today())}</div><table><tr><th>التاريخ</th><th>البيان</th><th class="n">مدين</th><th class="n">دائن</th><th class="n">الرصيد</th></tr>${body}</table><div class="ptot"><span>الرصيد</span><span>${money(Math.abs(st.close))} ${balWords(st.close, p.t).txt}</span></div></div>`, 'كشف حساب ' + p.n);
  };
  const act = (label, ic, fn) => h('button', { class: 'btn ghost sm', on: { click: fn } }, h('span', null, label));
  const actions = h('div', { class: 'actions', style: { marginTop: '0', marginBottom: '12px' } },
    p.t === 'c' && ctx.can('rcpt') ? h('a', { class: 'btn sm', href: '#/v/rcpt/' + encodeURIComponent(id) }, 'قبض منه') : null,
    p.t === 's' && ctx.can('pay') ? h('a', { class: 'btn sm', href: '#/v/pay/' + encodeURIComponent(id) }, 'صرف له') : null,
    p.t === 'e' && ctx.can('pay') ? h('a', { class: 'btn sm', href: '#/v/pay/' + encodeURIComponent(id) }, 'صرف له') : null,
    act('مشاركة', 'share', async () => { const r = await shareText(textSummary()); if (r === 'copied') toast('نُسخ الكشف. الصقه في واتساب.'); }),
    act('طباعة', 'print', printSt),
    p.t === 'c' && b > 0.5 && ctx.can('jv') ? act('إعدام الدين', 'trash', () => writeOff(ctx, p, b)) : null,
    act('Excel', 'doc', async () => { try { await saveXlsx('كشف_' + p.n.replace(/\s+/g, '_') + '.xlsx', [{ name: 'كشف حساب', rows: rowsX(), widths: [12, 46, 14, 14, 16] }]); } catch (e) { toast('تعذّر الحفظ', { bad: true }); } }));
  return {
    title: p.n, sub: PARTY_TYPES[p.t] + (p.ph ? '، ' + p.ph : ''), live: true,
    actions: ctx.can('party-add') ? [h('a', { class: 'iconbtn', href: '#/party-edit/' + encodeURIComponent(id), 'aria-label': 'تعديل' }, icon('edit'))] : [],
    el: h('div', null,
      h('section', { class: 'page' },
        h('div', { class: 'ph', style: { borderBottom: 0 } },
          h('h2', null, p.n),
          h('div', { class: 'bal-big num ' + w.cls }, money(w.amt), ' ', h('span', { style: { fontSize: '17px', fontWeight: 500 } }, w.txt)),
          h('div', { class: 'bal-note' }, w.amt ? (p.t === 's' ? (b < 0 ? 'مبلغ علينا للمورد' : 'دفعنا للمورد أكثر من فواتيره') : (b > 0 ? 'مبلغ لنا عنده' : 'دفع أكثر مما عليه')) : 'لا رصيد قائم'),
          p.lim && b > +p.lim ? h('div', { class: 'note bad' }, 'تجاوز حد الدين ' + money(p.lim)) : null)),
      actions,
      periodChips(stState.per, k => { stState.per = k; ctx.redraw(); }, ['m', 'pm', 'y', 'all']),
      h('section', { class: 'page tight', style: { overflowX: 'auto' } }, st.rows.length || st.open ? tbl : h('p', { class: 'empty' }, 'لا حركة في هذه الفترة.')))
  };
}

export function partyEdit(ctx, id, type) {
  const { store } = ctx;
  const cur = id ? store.parties.get(id) : null;
  const S = Object.assign({ n: '', t: type || 'c', ph: '', note: '', lim: '', act: true }, cur || {});
  const body = h('div'), foot = h('footer', { class: 'foot' });
  put(body, 
    field('الاسم', h('input', { value: S.n, on: { input: e => { S.n = e.target.value; } } })),
    field('النوع', seg([['c', 'عميل'], ['s', 'مورد'], ['e', 'موظف'], ['o', 'طرف آخر']], S.t, v => { S.t = v; })),
    field('الهاتف', h('input', { value: S.ph, class: 'num', inputmode: 'tel', style: { textAlign: 'right' }, on: { input: e => { S.ph = e.target.value; } } })),
    field('حد الدين (اختياري)', h('input', { value: S.lim || '', class: 'num', inputmode: 'decimal', on: { input: e => { S.lim = e.target.value; } } }), 'ينبّهك التطبيق إذا تجاوز العميل هذا المبلغ.'),
    field('ملاحظة', h('input', { value: S.note || '', on: { input: e => { S.note = e.target.value; } } })),
    cur ? h('label', { class: 'field', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: S.act !== false, style: { width: '22px', minHeight: '22px' }, on: { change: e => { S.act = e.target.checked; } } }), 'الحساب نشط (يظهر في القوائم)') : null);
  put(foot, h('div', null, h('div', { class: 'actions' }, h('button', { class: 'btn', on: { click: async () => {
    if (!S.n.trim()) { toast('اكتب الاسم', { bad: true }); return; }
    const dup = [...store.parties.values()].find(x => x.id !== id && norm(x.n) === norm(S.n));
    if (dup && !(await confirmBox('اسم مكرر', 'يوجد حساب بنفس الاسم: ' + dup.n + '. هل تريد إنشاء حساب آخر بنفس الاسم؟', 'نعم، أنشئه'))) return;
    const doc = { n: S.n.trim(), t: S.t, ph: (S.ph || '').trim(), note: (S.note || '').trim(), lim: +S.lim || 0, act: S.act !== false, at: (cur && cur.at) || Date.now() };
    const nid = await store.put('parties', id || null, doc);
    toast('حُفظ الحساب');
    ctx.go('party/' + encodeURIComponent(nid), true);
  } } }, icon('check', 20), 'حفظ'))));
  return { title: cur ? 'تعديل الحساب' : 'حساب جديد', el: body, foot };
}

/** إعدام دين عميل: قيد يومية من «ديون معدومة» إلى حساب العميل، ويبقى ظاهراً في كشفه */
function writeOff(ctx, p, bal) {
  const { store } = ctx;
  const amt = numField({ value: Math.round(bal) });
  const why = h('input', { placeholder: 'مثلاً: متوقف عن السداد منذ سنة' });
  const s = sheet('إعدام دين ' + p.n, h('div', null,
    h('p', { class: 'lead' }, 'يُسجَّل المبلغ مصروفاً في «ديون معدومة» ويُغلق من حساب العميل. يظهر القيد في كشفه، ويمكن إلغاؤه لاحقاً إن سدد.'),
    field('المبلغ', amt), field('السبب', why),
    h('div', { class: 'actions' }, h('button', { class: 'btn danger', on: { click: async () => {
      const a = Math.min(num(amt.value), bal);
      if (!(a > 0)) { toast('اكتب المبلغ', { bad: true }); return; }
      const v = { t: 'jv', d: today(), m: 'إعدام دين' + (why.value.trim() ? '، ' + why.value.trim() : ''), je: [{ a: '6950', dr: a, cr: 0 }, { a: CTRL[p.t], pt: p.id, dr: 0, cr: a }] };
      const err = check(v, { items: store.items, parties: store.parties, accounts: store.accounts, lock: store.settings.lock });
      if (err) { toast(err, { bad: true }); return; }
      await store.saveVoucher(v); s.close(); toast('سُجّل إعدام الدين');
    } } }, 'إعدام الدين'))));
}
