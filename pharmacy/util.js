/* أدوات عامة: أرقام، تواريخ، بحث عربي. لا تعتمد على الصفحة، فتُختبر في Node أيضاً. */

export const r2 = x => Math.round((+x || 0) * 100 + (x < 0 ? -1e-9 : 1e-9)) / 100;
export const r3 = x => Math.round((+x || 0) * 1000) / 1000;

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** مبلغ بالريال الكامل (الحساب الداخلي بقرشين، والعرض بلا كسور) */
export function money(n) {
  n = Math.round(r2(n));
  if (Object.is(n, -0)) n = 0;
  return nf0.format(n);
}
/** سعر وحدة: قد يكون كسرياً (سعر الحبة مثلاً) */
export function price(n) {
  n = r2(n);
  if (Object.is(n, -0)) n = 0;
  return Number.isInteger(n) ? nf0.format(n) : nf2.format(n);
}
/** فترة مختصرة: 1–15 نوفمبر 2026 */
export function rangeText(a, b) {
  if (!a) return 'كل الفترات';
  if (a === b) return dmy(a);
  return (a.slice(0, 4) === b.slice(0, 4) ? a.slice(8, 10) + '/' + a.slice(5, 7) : dmy(a)) + ' إلى ' + dmy(b);
}
/** كمية: حتى ثلاث خانات عشرية. */
export const qty = n => nf3.format(r3(n) || 0);

/** تاريخ اليوم بتوقيت الجهاز: YYYY-MM-DD */
export function today(t) {
  const d = t ? new Date(t) : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
export function addDays(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return today(x.getTime()); }
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
export const monthStart = d => d.slice(0, 8) + '01';
export const yearStart = d => d.slice(0, 4) + '-01-01';

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
/** 15/01/2027 */
export const dmy = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
/** الخميس 15 يناير 2027 */
export function longDate(d) {
  const x = new Date(d + 'T12:00:00');
  return AR_DAYS[x.getDay()] + ' ' + x.getDate() + ' ' + AR_MONTHS[x.getMonth()] + ' ' + x.getFullYear();
}
export const monthName = ym => AR_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

/** صلاحية MM/YYYY ← رقم شهر للمقارنة. الفارغ يأتي آخراً. */
export const expKey = x => x && /^\d{2}\/\d{4}$/.test(x) ? (+x.slice(3)) * 12 + (+x.slice(0, 2)) : 1e9;
/** يقبل 0327 أو 3/27 أو 03/2027 ← 03/2027 */
export function parseExp(s) {
  s = String(s || '').trim().replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[-.\s]/g, '/');
  let m = s.match(/^(\d{1,2})\/(\d{2}|\d{4})$/) || s.match(/^(\d{2})(\d{2})$/) || s.match(/^(\d{2})(\d{4})$/);
  if (!m) return '';
  const mo = +m[1], y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
  if (mo < 1 || mo > 12 || y < 2000 || y > 2099) return '';
  return String(mo).padStart(2, '0') + '/' + y;
}
/** أشهر متبقية حتى الصلاحية من تاريخ */
export const monthsLeft = (x, d) => x ? expKey(x) - ((+d.slice(0, 4)) * 12 + (+d.slice(5, 7))) : null;

/** تطبيع البحث العربي: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والأرقام العربية */
export function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c))
    .replace(/\s+/g, ' ').trim();
}
/** أرقام عربية يكتبها المستخدم ← رقم */
export function num(s) {
  if (typeof s === 'number') return s;
  s = String(s || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[٬,\s]/g, '').replace(/٫/g, '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

export function newId(prefix) {
  const r = Math.random().toString(36).slice(2, 8);
  return (prefix || '') + Date.now().toString(36) + r;
}

/*
 * هيكل صوتي للبحث: يكتب الصيدلي «بانادول» فيجد PANADOL، و«اموكس» فيجد AMOXIL.
 * الحروف المتقاربة نطقاً تتوحد، وتُحذف حروف العلة، فيتطابق الاسم العربي مع الإنجليزي.
 */
const AR_PH = { 'ب': 'b', 'پ': 'b', 'ت': 't', 'ط': 't', 'ث': 't', 'ج': 'j', 'غ': 'j', 'ح': 'h', 'ه': 'h', 'ة': 'h', 'خ': 'k', 'ك': 'k', 'ق': 'k', 'د': 'd', 'ض': 'd', 'ذ': 'z', 'ز': 'z', 'ظ': 'z', 'ر': 'r', 'س': 's', 'ص': 's', 'ش': 's', 'ف': 'f', 'ڤ': 'f', 'ل': 'l', 'م': 'm', 'ن': 'n' };
export function phon(s) {
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
/** نفس الهيكل لكن مع مواضع حروف العلة (كلها «a»)، لترتيب الأقرب نطقاً */
export function phonV(s) {
  s = String(s || '').toLowerCase();
  let out = '';
  if (/[؀-ۿ]/.test(s)) {
    for (const ch of s) { if (AR_PH[ch]) out += AR_PH[ch]; else if ('اأإآىوي'.includes(ch)) out += 'a'; else if (ch === ' ') break; }
  } else {
    s = s.split(' ')[0].replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'sh').replace(/sh/g, 's').replace(/ck/g, 'k').replace(/x/g, 'ks')
      .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/p/g, 'b').replace(/v/g, 'f').replace(/g/g, 'j').replace(/w/g, '');
    for (const ch of s) { if ('bdfhjklmnrstz'.includes(ch)) out += ch; else if ('aeiouy'.includes(ch)) out += 'a'; }
  }
  return out.replace(/(.)\1+/g, '$1');
}
