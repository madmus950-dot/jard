/* أدوات عامة: أرقام، تواريخ، بحث عربي. لا تعتمد على الصفحة، فتُختبر في Node أيضاً. */

const r2 = x => Math.round((+x || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100;
const r3 = x => Math.round((+x || 0) * 1000) / 1000;

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** مبلغ بالريال الكامل (الحساب الداخلي بقرشين، والعرض بلا كسور) */
function money(n) {
  n = Math.round(r2(n));
  if (Object.is(n, -0)) n = 0;
  return nf0.format(n);
}
/** سعر وحدة: قد يكون كسرياً (سعر الحبة مثلاً) */
function price(n) {
  n = r2(n);
  if (Object.is(n, -0)) n = 0;
  return Number.isInteger(n) ? nf0.format(n) : nf2.format(n);
}
/** فترة مختصرة: 1–15 نوفمبر 2026 */
function rangeText(a, b) {
  if (!a) return 'كل الفترات';
  if (a === b) return dmy(a);
  return (a.slice(0, 4) === b.slice(0, 4) ? a.slice(8, 10) + '/' + a.slice(5, 7) : dmy(a)) + ' إلى ' + dmy(b);
}
/** كمية: حتى ثلاث خانات عشرية. */
const qty = n => nf3.format(r3(n) || 0);

/** تاريخ اليوم بتوقيت الجهاز: YYYY-MM-DD */
function today(t) {
  const d = t ? new Date(t) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
function addDays(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return today(x.getTime()); }
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
const monthStart = d => d.slice(0, 8) + '01';
const yearStart = d => d.slice(0, 4) + '-01-01';

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** 15/01/2027 */
const dmy = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
/** الخميس 15 يناير 2027 */
function longDate(d) {
  const x = new Date(d + 'T12:00:00');
  return AR_DAYS[x.getDay()] + ' ' + x.getDate() + ' ' + AR_MONTHS[x.getMonth()] + ' ' + x.getFullYear();
}
const monthName = ym => AR_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

/** صلاحية MM/YYYY ← رقم شهر للمقارنة. الفارغ يأتي آخراً. */
const expKey = x => x && /^\d{2}\/\d{4}$/.test(x) ? (+x.slice(3)) * 12 + (+x.slice(0, 2)) : 1e9;
/** يقبل 0327 أو 3/27 أو 03/2027 ← 03/2027 */
function parseExp(s) {
  s = String(s || '').trim().replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[-.\s]/g, '/');
  let m = s.match(/^(\d{1,2})\/(\d{2}|\d{4})$/) || s.match(/^(\d{2})(\d{2})$/) || s.match(/^(\d{2})(\d{4})$/);
  if (!m) return '';
  const mo = +m[1], y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
  if (mo < 1 || mo > 12 || y < 2000 || y > 2099) return '';
  return String(mo).padStart(2, '0') + '/' + y;
}
/** أشهر متبقية حتى الصلاحية من تاريخ */
const monthsLeft = (x, d) => x ? expKey(x) - ((+d.slice(0, 4)) * 12 + (+d.slice(5, 7))) : null;

/** تطبيع البحث العربي: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والأرقام العربية */
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c))
    .replace(/\s+/g, ' ').trim();
}
/** أرقام عربية يكتبها المستخدم ← رقم */
function num(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function newId(prefix) {
  const r = Math.random().toString(36).slice(2, 8);
  return (prefix || '') + Date.now().toString(36) + r;
}

/*
 * هيكل صوتي للبحث: يكتب الصيدلي «بانادول» فيجد PANADOL، و«اموكس» فيجد AMOXIL.
 * الحروف المتقاربة نطقاً تتوحد، وتُحذف حروف العلة، فيتطابق الاسم العربي مع الإنجليزي.
 */
const AR_PH = { 'ب': 'b', 'پ': 'b', 'ت': 't', 'ط': 't', 'ث': 't', 'ج': 'j', 'غ': 'j', 'ح': 'h', 'ه': 'h', 'ة': 'h', 'خ': 'k', 'ك': 'k', 'ق': 'k', 'د': 'd', 'ض': 'd', 'ذ': 'z', 'ز': 'z', 'ظ': 'z', 'ر': 'r', 'س': 's', 'ص': 's', 'ش': 's', 'ف': 'f', 'ڤ': 'f', 'ل': 'l', 'م': 'm', 'ن': 'n' };
function phon(s) {
  s = String(s || '').toLowerCase();
  let out = '';
  if (/[؀-ۿ]/.test(s)) {
    for (const ch of s) { if (AR_PH[ch]) out += AR_PH[ch]; else if (ch === ' ') out += ' '; else if (/[0-9]/.test(ch)) out += ch; }
  } else {
    s = s.replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'sh').replace(/sh/g, 's').replace(/ck/g, 'k').replace(/x/g, 'ks')
      .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/p/g, 'b').replace(/v/g, 'f').replace(/g/g, 'j').replace(/w/g, '');
    for (const ch of s) { if ('bdfhjklmnrstz'.includes(ch)) out += ch; else if (ch === ' ') out += ' '; else if (/[0-9]/.test(ch)) out += ch; }
  }
  return out.replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ').trim();
}
/** نفس الهيكل مع حروف العلة (a / o / i)، لترتيب الأقرب نطقاً */
function phonV(s) {
  s = String(s || '').toLowerCase();
  let out = '';
  if (/[\u0600-\u06FF]/.test(s)) {
    for (const ch of s) {
      if (AR_PH[ch]) out += AR_PH[ch];
      else if ('اأإآى'.includes(ch)) out += 'a'; else if (ch === 'و') out += 'o'; else if (ch === 'ي') out += 'i';
      else if (ch === ' ') break;
    }
  } else {
    s = s.split(' ')[0].replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'sh').replace(/sh/g, 's').replace(/ck/g, 'k').replace(/x/g, 'ks')
      .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/p/g, 'b').replace(/v/g, 'f').replace(/g/g, 'j').replace(/w/g, '');
    for (const ch of s) { if ('bdfhjklmnrstz'.includes(ch)) out += ch; else if (ch === 'a') out += 'a'; else if (ch === 'o' || ch === 'u') out += 'o'; else if ('eiy'.includes(ch)) out += 'i'; }
  }
  return out.replace(/(.)\1+/g, '$1');
}

const D={s:2};
const store={items:new Map([['05-5833',{id:'05-5833',n:'DEXA-BASA VIAL',u:[{n:'فيالة',s:1,p:5}]}],['x2',{id:'x2',n:'PROFINAL SYRUP 120 ML',src:'1372-086',u:[{n:'علبة',s:1,p:1}]}],['x3',{id:'x3',n:'TAMSUONE 0.4 MG 10 CAP',u:[{n:'علبة',s:1},{n:'باكت',s:10}]}]]),L:{}};
const avgCost=()=>0, units=it=>it.u, findCode=()=>null;
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


import fs from 'fs';
const t=fs.readFileSync(process.argv[2],'utf8');
console.log(JSON.stringify(rowsToLines(parseCsv(t)),null,0));
