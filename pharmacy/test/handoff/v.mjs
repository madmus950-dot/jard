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

function validateOpening(pkg, store) {
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


import fs from 'fs';
const store={items:new Map(),accounts:new Map([['1101',{id:'1101',k:'cash'}]])};
const pkg=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(validateOpening(pkg,store),null,1));
const b=JSON.parse(JSON.stringify(pkg)); b.stock[0].q=0; b.stock[1].s=3; b.stock.push({i:'ZZ',q:1,c:1}); b.cash[0].ca='9999'; b.items[1].u[0].s=2; b.parties[1].b=5; b.items.push(b.items[0]);
console.log(JSON.stringify(validateOpening(b,store),null,1));
