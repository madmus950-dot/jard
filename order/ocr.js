/*
 * محرك التعرّف: من نص صورة العلبة (قارئ النصوص على الجوال، أو الذكاء الاصطناعي عبر الإنترنت)
 * إلى الصنف في قاعدة الأصناف، مع التركيز والشكل وعدد العبوة وتاريخ الانتهاء.
 * كله على الجوال بلا إنترنت. الإنجليزية فقط.
 */

/* ---------- الأشكال الدوائية ---------- */
const FORM_DEFS = [
  ['efftab', 'أقراص فوارة', /\bEFFERVESCENT\s+TAB(LET)?S?\b|\bEFF\.?\s*TABS?\b/],
  ['effgran', 'فوار (أكياس)', /\bEFFERVESCENT\s+(GRANULES?|POWDER|SALT)\b|\bEFF\.?\s*(GRAN|SACH)/],
  ['fctab', 'أقراص مغلفة', /\bFILM[\s-]*COATED\b|\bF\.?\s?C\.?\s+TAB/],
  ['tab', 'أقراص', /\bTAB(LET)?S?\b|\bCAPLETS?\b/],
  ['cap', 'كبسولات', /\bCAP(SULE)?S?\b|\bSOFTGELS?\b/],
  ['sach', 'أكياس', /\bSACHETS?\b|\bSACH\b/],
  ['syr', 'شراب', /\bSYRUP\b|\bSYP\b|\bELIXIR\b/],
  ['susp', 'معلق', /\bSUSPENSION\b|\bSUSP\b/],
  ['drop', 'قطرة', /\bDROPS?\b|\bEYE\s*DROPS?\b|\bEAR\s*DROPS?\b|\bNASAL\s*DROPS?\b/],
  ['cream', 'كريم', /\bCREAM\b/],
  ['oint', 'مرهم', /\bOINTMENT\b|\bOINT\b/],
  ['gel', 'جل', /\bGEL\b/],
  ['amp', 'أمبولات', /\bAMPOULES?\b|\bAMPS?\b|\bAMPULES?\b/],
  ['vial', 'فيالات', /\bVIALS?\b/],
  ['inj', 'حقن', /\bINJECTION\b|\bINJ\b|\bI\.?M\.?\b|\bI\.?V\.?\b/],
  ['supp', 'تحاميل', /\bSUPPOSITOR(Y|IES)\b|\bSUPP\b/],
  ['spray', 'بخاخ', /\bSPRAY\b/],
  ['inh', 'بخاخ استنشاق', /\bINHALER\b|\bINHALATION\b|\bMETERED\b/],
  ['sol', 'محلول', /\bSOLUTION\b|\bSOL\b|\bORAL\s+SOLUTION\b/],
  ['lot', 'لوشن', /\bLOTION\b/],
  ['loz', 'أقراص استحلاب', /\bLOZENGES?\b/],
  ['powder', 'بودرة', /\bPOWDER\b/],
  ['shamp', 'شامبو', /\bSHAMPOO\b/],
  ['patch', 'لصقات', /\bPATCH(ES)?\b/]
];
export const FORM_AR = Object.fromEntries(FORM_DEFS.map(([k, ar]) => [k, ar]));
// الأشكال القريبة تُعدّ متوافقة عند المطابقة
const FORM_FAMILY = { efftab: 'tab', fctab: 'tab', tab: 'tab', cap: 'cap', sach: 'sach', effgran: 'sach', syr: 'liq', susp: 'liq', sol: 'liq', drop: 'drop', cream: 'top', oint: 'top', gel: 'top', lot: 'top', amp: 'inj', vial: 'inj', inj: 'inj', supp: 'supp', spray: 'spray', inh: 'spray', loz: 'tab', powder: 'sach', shamp: 'top', patch: 'patch' };
// كلمات الشكل في أسماء قاعدة الأصناف المختصرة (TAB، CAPS، EFF، SYP…)
const NAME_FORM = { TAB: 'tab', TABS: 'tab', TABLET: 'tab', TABLETS: 'tab', CAP: 'cap', CAPS: 'cap', CAPSULE: 'cap', CAPSULES: 'cap', SACH: 'sach', SACHET: 'sach', SACHETS: 'sach', EFF: 'effgran', SYRUP: 'syr', SYP: 'syr', SYR: 'syr', SUSP: 'susp', SUSPENSION: 'susp', DROP: 'drop', DROPS: 'drop', CREAM: 'cream', OINT: 'oint', OINTMENT: 'oint', GEL: 'gel', AMP: 'amp', AMPS: 'amp', AMPOULE: 'amp', VIAL: 'vial', VIALS: 'vial', INJ: 'inj', SUPP: 'supp', SUPPOSITORY: 'supp', SPRAY: 'spray', INHALER: 'inh', SOL: 'sol', SOLUTION: 'sol', LOTION: 'lot', LOZ: 'loz', POWDER: 'powder', SHAMPOO: 'shamp' };

const UNITS = new Set(['MG', 'MCG', 'UG', 'G', 'GM', 'GR', 'ML', 'IU', 'MMOL', 'KG', 'L', 'CM', 'MM', 'X', 'MG/ML', 'MG/5ML']);
// كلمات لا تميّز الصنف
const STOP = new Set(['THE', 'AND', 'FOR', 'WITH', 'OF', 'IN', 'BY', 'TO', 'MADE', 'EACH', 'CONTAINS', 'CONTAIN', 'ORAL', 'USE', 'ONLY', 'KEEP', 'OUT', 'REACH', 'CHILDREN', 'STORE', 'BELOW', 'ABOVE', 'TEMPERATURE', 'DOSAGE', 'DOSE', 'READ', 'LEAFLET', 'PACKAGE', 'INSERT', 'SEE', 'BEFORE', 'AFTER', 'DATE', 'EXP', 'MFG', 'LOT', 'BATCH', 'PRICE', 'RETAIL', 'REG', 'NO', 'PHARMA', 'PHARMACEUTICAL', 'PHARMACEUTICALS', 'LABORATORIES', 'LABS', 'LTD', 'LIMITED', 'INC', 'CO', 'COMPANY', 'INDUSTRIES', 'HEALTHCARE', 'GMBH', 'SAE', 'PVT', 'EGYPT', 'INDIA', 'JORDAN', 'SAUDI', 'ARABIA', 'UAE', 'SYRIA', 'YEMEN', 'GERMANY', 'FRANCE', 'UK', 'USA', 'PACK', 'BOX', 'NET', 'WT', 'VOL', 'EACH', 'PER', 'ANTISEPTIC', 'TREATMENT', 'RELIEF', 'PAIN', 'FAST', 'ACTION', 'NEW', 'PLUS', 'FORTE', 'EXTRA', 'JUNIOR', 'ADULT', 'ADULTS', 'KIDS', 'CHILD', 'SUGAR', 'FREE', 'FILM', 'COATED', 'EFFERVESCENT', 'GRANULES', 'PRESCRIPTION', 'MEDICINE', 'DRUG', 'RX', 'OTC', 'BP', 'USP', 'EP', 'HCL', 'HYDROCHLORIDE', 'SODIUM', 'POTASSIUM', 'CALCIUM']);
// لا نريد أن تمنع STOP كلمات مثل FORTE/EXTRA/PLUS من المطابقة إذا كانت جزءاً من اسم الصنف: تُعطى وزناً خفيفاً بدل الإهمال
const WEAK = new Set(['FORTE', 'EXTRA', 'PLUS', 'JUNIOR', 'ADULT', 'KIDS', 'CHILD', 'NEW', 'FAST', 'SUGAR', 'FREE', 'HCL', 'SODIUM', 'POTASSIUM', 'CALCIUM']);

/** أخطاء القراءة الشائعة داخل كلمة أغلبها حروف: 0→O، 1→I، 5→S، 8→B */
function fixWord(w) {
  const letters = (w.match(/[A-Z]/g) || []).length, digits = (w.match(/\d/g) || []).length;
  if (letters >= 3 && digits && digits <= letters / 2) return w.replace(/0/g, 'O').replace(/1/g, 'I').replace(/5/g, 'S').replace(/8/g, 'B');
  return w;
}
/** تصحيح أخطاء القراءة على مستوى السطر: «8RUFEN»→BRUFEN، «4OO mg»→400 mg */
export function normLine(t) {
  return String(t || '').replace(/[A-Za-z0-9]+/g, w => fixWord(w.toUpperCase()) === w.toUpperCase() ? w : fixWord(w.toUpperCase()))
    .replace(/(^|[^A-Za-z0-9])([\dOoIl]{1,5}(?:[.,][\dOo]+)?)(\s*)(MG|MCG|ML|IU|G|GM)\b/gi, (m, p, n, sp, u) => /\d/.test(n) ? p + n.replace(/[Oo]/g, '0').replace(/[Il]/g, '1') + sp + u : m);
}
/** تقطيع اسم إلى كلمات وأرقام: "500MG" ← 500 و MG */
export function tokens(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9.%]+/g, ' ').replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2')
    .split(' ').filter(Boolean);
}
const isNum = t => /^\d+(\.\d+)?$/.test(t);

/* ---------- قاعدة الأصناف ---------- */
/**
 * cat: {co, un, it: [[i, barcodes, name, unitIdx, coIdx, s, exps]]} كما في تطبيق الجرد.
 * extra: أصناف تعلّمها التطبيق أو أُضيفت (اختياري).
 */
export function buildIndex(cat) {
  const items = [], inv = new Map(), byBc = new Map(), byId = new Map();
  for (const r of cat.it || []) {
    const it = { i: String(r[0]), bs: r[1] ? String(r[1]).split('|').filter(Boolean) : [], n: String(r[2] || ''), u: (cat.un || [])[r[3]] || '', c: (cat.co || [])[r[4]] || '', e: r[6] ? String(r[6]).split('|') : [] };
    const tk = tokens(it.n);
    const words = [], nums = [];
    let form = '';
    for (const t of tk) {
      if (isNum(t)) { nums.push(+t); continue; }
      if (NAME_FORM[t] && !form) form = NAME_FORM[t];
      if (NAME_FORM[t] || UNITS.has(t) || t.length < 2) continue;
      words.push(t);
    }
    it.w = [...new Set(words)]; it.brand = words[0] || ''; it.nums = nums; it.form = form;
    // عدد العبوة في الاسم: "URICOL 12 EFF"، "AMOL 20 TAB"
    const m = it.n.toUpperCase().match(/\b(\d{1,3})\s*(?:'S\s*)?(TABS?|TABLETS?|CAPS?|CAPSULES?|SACH(?:ETS?)?|EFF|AMPS?|VIALS?|SUPP|LOZ)\b/);
    it.pack = m ? +m[1] : 0;
    const k = items.length; items.push(it); byId.set(it.i, it);
    for (const w of it.w) { if (!inv.has(w)) inv.set(w, []); inv.get(w).push(k); }
    for (const b of it.bs) { byBc.set(b, it); byBc.set(b.replace(/^0+/, ''), it); }
  }
  // للبحث التقريبي: الكلمات مجمّعة بالحرف الأول
  const vocab = new Map();
  for (const w of inv.keys()) { if (w.length < 3) continue; const k = w[0]; if (!vocab.has(k)) vocab.set(k, []); vocab.get(k).push(w); }
  return { items, inv, byBc, byId, vocab, N: items.length };
}

/** مسافة التحرير بحد أقصى (للمقارنة التقريبية السريعة) */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* ---------- قراءة الحقول من نص العلبة ---------- */
/**
 * ocr: {w, h, blocks:[{t, b:[l,t,r,b], l:[{t, b}]}]} من قارئ الجوال، أو {lines:[{t, h}]} من أي مصدر.
 * يعيد السطور مرتبة بالحجم، والحقول المقروءة.
 */
export function analyze(ocr) {
  let lines = [];
  if (ocr && ocr.blocks) {
    for (const b of ocr.blocks) for (const l of b.l || []) {
      const bx = l.b || [0, 0, 0, 0];
      lines.push({ t: String(l.t || ''), h: Math.max(1, (bx[3] || 0) - (bx[1] || 0)), y: bx[1] || 0, x: bx[0] || 0 });
    }
  } else if (ocr && ocr.lines) lines = ocr.lines.map((l, k) => ({ t: String(l.t || ''), h: l.h || 10, y: l.y != null ? l.y : k * 20, x: 0 }));
  lines = lines.filter(l => /[A-Za-z0-9]/.test(l.t));
  for (const l of lines) l.t = normLine(l.t);
  const maxH = Math.max(1, ...lines.map(l => l.h));
  const text = lines.map(l => l.t).join('\n');
  const U = text.toUpperCase();

  // الشكل الدوائي
  let form = '';
  for (const [k, , re] of FORM_DEFS) if (re.test(U)) { form = k; break; }

  // التركيز: 500 mg، 250mg/5ml، 0.1%، 1000 IU
  const strengths = [];
  const reS = /(\d+(?:[.,]\d+)?)\s*(MG|MCG|ΜG|UG|G|IU|I\.U\.|%|MMOL)\b(?:\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(ML|G|TAB|DOSE|SPRAY|ACTUATION)\b)?/g;
  let m;
  while ((m = reS.exec(U))) {
    const v = m[1].replace(',', '.'), un = m[2].replace('ΜG', 'MCG').replace('UG', 'MCG').replace('I.U.', 'IU').toLowerCase();
    if (un === 'g' && +v > 50) continue;   // وزن العبوة لا التركيز
    const s = v + ' ' + un + (m[4] ? '/' + (m[3] || '') + m[4].toLowerCase() : '');
    if (!strengths.includes(s)) strengths.push(s);
  }
  // عدد العبوة: 6 SACHETS، 20 FILM-COATED TABLETS، 30'S، PACK OF 10
  let pack = 0, packUnit = '';
  const reP = /(\d{1,4})\s*(?:X\s*)?(?:'S\s+)?(?:(?!(?:MG|MCG|ML|G|GM|IU|KG|MMOL)\b)[A-Z][A-Z.\-]*\s+){0,3}?(TABLETS?|TABS?|CAPLETS?|CAPSULES?|CAPS|SACHETS?|AMPOULES?|AMPULES?|AMPS?|VIALS?|SUPPOSITOR(?:Y|IES)|LOZENGES?|PATCH(?:ES)?|SOFTGELS?|PRE[\s-]*FILLED\s+SYRINGES?)\b/;
  const mx = U.match(/\b(\d{1,3})\s*[X×*]\s*(\d{1,3})\s*(TABLETS?|TABS?|CAPSULES?|CAPS|SACHETS?|AMPOULES?|AMPS?|VIALS?)\b/);
  if (mx) { pack = +mx[1] * +mx[2]; packUnit = mx[3].toLowerCase(); }
  else if ((m = U.match(reP))) { pack = +m[1]; packUnit = m[2].toLowerCase(); }
  else if ((m = U.match(/\b(?:PACK|BOX|PACKET)\s+OF\s+(\d{1,4})\b/)) || (m = U.match(/\b(\d{1,3})\s*'S\b/))) pack = +m[1];
  // الحجم للسوائل والكريمات: 100 ML، 30 G
  let vol = '';
  if ((m = U.match(/(?<!\/\s*)\b(\d{1,4}(?:\.\d+)?)\s*(ML|G|GM)\b(?!\s*\/)/))) vol = m[1] + ' ' + m[2].toLowerCase().replace('gm', 'g');

  // الشركة وبلد الصنع
  let company = '', made = '';
  const reCo = /PHARMA|LABORATOR|\bLABS?\b|\bLTD\b|LIMITED|\bINC\b|\bCO\.|S\.A\.E|\bSAE\b|GMBH|INDUSTRIES|HEALTHCARE|LIFE\s*SCIENCES|\bA\/S\b|\bS\.A\.\b|\bPLC\b/i;
  for (const l of lines) if (reCo.test(l.t)) { company = l.t.replace(/^(MANUFACTURED|MFD|PRODUCED|MARKETED)\s+(BY|FOR)\s*:?\s*/i, '').trim(); break; }
  if ((m = U.match(/MADE\s+IN\s+([A-Z ]{3,20})/))) made = m[1].trim().split(/\s{2,}|\n/)[0];

  // الاسم: أكبر سطر نصّي ليس شكلاً أو تركيزاً أو شركة
  const nameLine = lines.filter(l => {
    const T = l.t.toUpperCase();
    const ws = tokens(T).filter(t => !isNum(t) && t.length >= 3 && !STOP.has(t) && !UNITS.has(t) && !NAME_FORM[t]);
    return ws.length && !reCo.test(l.t) && !/MADE\s+IN|EXP|MFG|BATCH|LOT\b/.test(T);
  }).sort((a, b) => b.h - a.h)[0];
  let name = nameLine ? nameLine.t.trim() : '';
  // إن كان السطر التالي بنفس الحجم تقريباً وتحته مباشرة فهو تكملة الاسم (PANADOL / EXTRA)
  if (nameLine) {
    const next = lines.find(l => l !== nameLine && l.h >= nameLine.h * 0.6 && l.y > nameLine.y && l.y - nameLine.y < nameLine.h * 1.9 && tokens(l.t).length <= 3 && !reCo.test(l.t));
    if (next && !FORM_DEFS.some(f => f[2].test(next.t.toUpperCase()))) name += ' ' + next.t.trim();
  }

  // كلمات موزونة بحجم الخط: الأكبر أهم
  const words = [];
  for (const l of lines) {
    const wgt = 0.25 + 0.75 * (l.h / maxH);
    for (let t of tokens(l.t)) {
      if (isNum(t) || t.length < 3 || UNITS.has(t)) continue;
      t = fixWord(t);
      if (STOP.has(t) && !WEAK.has(t)) continue;
      words.push({ t, w: WEAK.has(t) ? wgt * 0.4 : wgt, sz: l.h / maxH });
    }
  }
  const nums = (U.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return { lines, text, name, form, strengths, pack, packUnit, vol, company, made, words, nums };
}

/** حقول جاهزة (من الذكاء الاصطناعي عبر الإنترنت) → نفس شكل analyze لتمر على المطابقة */
export function fromFields(f) {
  f = f || {};
  const name = String(f.name || '').trim(), str = String(f.strength || '').trim();
  const lines = [];
  if (name) lines.push({ t: name, h: 50 });
  if (str) lines.push({ t: str, h: 20 });
  if (f.form) lines.push({ t: String(f.form), h: 14 });
  if (f.pack) lines.push({ t: f.pack + ' ' + (f.packUnit || f.form || 'units'), h: 12 });
  if (f.company) lines.push({ t: String(f.company), h: 10 });
  if (f.generic) lines.push({ t: String(f.generic), h: 8 });
  const a = analyze({ lines: lines.map((l, k) => ({ ...l, y: k * 60 })) });
  if (name) a.name = name;
  if (f.pack && +f.pack) a.pack = +f.pack;
  if (f.company) a.company = String(f.company);
  return a;
}

/* ---------- المطابقة مع قاعدة الأصناف ---------- */
/**
 * يعيد أفضل المرشحين: [{it, score, conf: 'high'|'mid'|'low', why: {...}}]
 * learned: Map كلمة ← رقم صنف تعلّمها التطبيق من تصحيحاتك.
 */
export function match(ix, a, learned) {
  const cand = new Map();
  const add = (k, s, tag) => { const c = cand.get(k) || { s: 0, hit: new Set() }; c.s += s; c.hit.add(tag); cand.set(k, c); };
  const seen = new Set();
  for (const { t, w } of a.words) {
    if (seen.has(t)) continue; seen.add(t);
    const exact = ix.inv.get(t);
    if (exact && exact.length < ix.N / 8) {
      const idf = Math.log(ix.N / exact.length);
      for (const k of exact) add(k, w * idf * (ix.items[k].brand === t ? 2 : 1), t);
    }
    // تقريبي: حرف أو حرفان مختلفان (أخطاء القراءة)
    if (t.length >= 4) {
      const max = t.length >= 8 ? 2 : 1;
      for (const v of ix.vocab.get(t[0]) || []) {
        if (v === t || Math.abs(v.length - t.length) > max) continue;
        if (lev(t, v, max) <= max) {
          const list = ix.inv.get(v); if (!list || list.length > ix.N / 8) continue;
          const idf = Math.log(ix.N / list.length);
          for (const k of list) add(k, 0.7 * w * idf * (ix.items[k].brand === v ? 2 : 1), v);
        }
      }
    }
    if (learned && learned.has(t)) { const it = ix.byId.get(learned.get(t)); if (it) add(ix.items.indexOf(it), 6 * w, '★' + t); }
  }
  if (!cand.size) return [];
  const top = [...cand.entries()].sort((x, y) => y[1].s - x[1].s).slice(0, 40);
  const fam = f => FORM_FAMILY[f] || f;
  const sNums = a.strengths.map(s => parseFloat(s)).filter(n => !isNaN(n));
  // كلمات كبيرة في العلبة موجودة في قاعدة الأصناف: غيابها عن اسم المرشح يُضعفه (PANADOL EXTRA ≠ PANADOL)
  const big = [...new Map(a.words.filter(x => x.sz >= 0.55 && ix.inv.has(x.t) && x.t.length >= 3).map(x => [x.t, x])).values()];
  const volN = a.vol ? parseFloat(a.vol) : 0;
  const out = top.map(([k, c]) => {
    const it = ix.items[k];
    let s = c.s;
    const why = { name: [...c.hit].filter(h => !h.startsWith('★')), learned: [...c.hit].some(h => h.startsWith('★')) };
    for (const x of big) if (!it.w.includes(x.t) && !c.hit.has(x.t)) s -= 1.2 * x.sz;
    // التركيز
    const inum = it.nums.filter(n => n !== it.pack);
    if (sNums.length && inum.length) {
      if (sNums.some(n => inum.includes(n))) { s += 2.5; why.strength = true; }
      else if (!(volN && inum.length === 1 && inum[0] === volN)) { s -= 1.5; why.strength = false; }
    } else if (inum.length && a.nums.some(n => inum.includes(n))) { s += 0.8; why.strength = true; }
    // الحجم (شراب 100 مل)
    if (volN && /\bML\b/.test(it.n.toUpperCase())) { if (inum.includes(volN)) { s += 0.8; why.vol = true; } else { s -= 0.4; why.vol = false; } }
    // الشكل: أقراص/كبسولات كثيراً ما تُكتب خطأ في الأسماء، فالفرق بينهما خفيف
    if (a.form && it.form) {
      if (fam(a.form) === fam(it.form)) { s += 1; why.form = true; }
      else { const soft = ['tab', 'cap'].includes(fam(a.form)) && ['tab', 'cap'].includes(fam(it.form)); s -= soft ? 0.3 : 1.2; why.form = false; why.formSoft = soft; }
    }
    // عدد العبوة: 24 قرص ≠ 100 قرص
    if (a.pack && it.pack) { if (a.pack === it.pack) { s += 1.5; why.pack = true; } else { s -= 1.2; why.pack = false; } }
    // كم من كلمات اسم الصنف وُجد في العلبة
    const cover = it.w.length ? it.w.filter(x => c.hit.has(x)).length / it.w.length : 0;
    s += cover * 1.5;
    return { it, score: Math.round(s * 100) / 100, why, cover };
  }).sort((x, y) => y.score - x.score);
  const [b1, b2] = out;
  if (b1) {
    const gap = b2 ? b1.score / Math.max(0.01, b2.score) : 9;
    const w = b1.why;
    const brandHit = w.name.includes(b1.it.brand) || w.learned;
    const conflict = (w.strength === false ? 1 : 0) + (w.form === false && !w.formSoft ? 1 : 0) + (w.pack === false ? 0.5 : 0) + (w.vol === false ? 0.5 : 0);
    const support = w.strength === true || w.pack === true || b1.cover >= 0.99 || w.learned;
    b1.conf = brandHit && conflict < 1 && support && gap >= 1.12 ? 'high' : brandHit && conflict < 1.5 ? 'mid' : 'low';
    b1.gap = Math.round(gap * 100) / 100;
    for (const o of out.slice(1)) o.conf = 'low';
  }
  return out.slice(0, 6);
}

/* ---------- الباركود ورمز GS1 الدوائي ---------- */
export function parseCode(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/^\][A-Za-z]\d/, '');
  const out = { raw: s, codes: [], exp: '', batch: '', main: '' };
  const add = c => { c = String(c || '').replace(/\x1d/g, '').trim(); if (c && !out.codes.includes(c)) out.codes.push(c); };
  const g = s.replace(/\((\d{2,4})\)/g, '\x1d$1').replace(/^\x1d/, '');
  if (/^01\d{14}/.test(g)) {
    const FIX = { '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };
    let i = 0;
    while (i < g.length) {
      if (g[i] === '\x1d') { i++; continue; }
      const ai = g.slice(i, i + 2);
      if (FIX[ai]) {
        const v = g.slice(i + 2, i + 2 + FIX[ai]); i += 2 + FIX[ai];
        if (ai === '01') { add(v.replace(/^0/, '')); add(v); if (/^00/.test(v)) add(v.slice(2)); }
        if (ai === '17' && /^\d{6}$/.test(v) && +v.slice(2, 4) >= 1 && +v.slice(2, 4) <= 12) out.exp = v.slice(2, 4) + '/20' + v.slice(0, 2);
        continue;
      }
      const vai = /^(10|21|22|30|37|9\d)$/.test(ai) ? ai : /^(24\d|25\d|71\d)$/.test(g.slice(i, i + 3)) ? g.slice(i, i + 3) : '';
      if (!vai) break;
      let j = g.indexOf('\x1d', i + vai.length); if (j < 0) j = g.length;
      if (vai === '10') out.batch = g.slice(i + 2, j);
      i = j;
    }
  }
  add(s);
  if (/^\d{13}$/.test(s)) add('0' + s);
  if (/^\d{12}$/.test(s)) add('0' + s);
  if (/^0\d{13}$/.test(s)) add(s.slice(1));
  out.main = out.codes[0] || '';
  return out;
}
export function byCode(ix, raw, links) {
  const p = parseCode(raw);
  for (const c of p.codes) { const it = ix.byBc.get(c) || ix.byBc.get(c.replace(/^0+/, '')) || (links && links[c] && ix.byId.get(links[c])); if (it) return { it, p }; }
  return { it: null, p };
}

/* ---------- تاريخ الانتهاء ---------- */
const MON = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 };
/** أخطاء القراءة داخل الأرقام: O→0، I/l→1، S→5، B→8، Z→2 */
function fixDigits(s) {
  return s.replace(/[A-Z0-9|][A-Z0-9|\/.\-]*/g, w => {
    if (/JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|EXP|MFG|MFD|LOT|BATCH/.test(w)) return w;
    const d = (w.match(/\d/g) || []).length, l = (w.match(/[A-Z|]/g) || []).length;
    return d >= 2 && d >= l ? w.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2') : w;
  });
}
const yr = y => { y = +y; return y < 100 ? 2000 + y : y; };
/**
 * يقرأ التواريخ من نص صورة الصلاحية. يعيد {exp: 'MM/YYYY', mfg, batch, all:[...]}
 * يفضّل التاريخ المكتوب بعد EXP، وإلا فالأبعد بين تاريخين.
 */
export function parseDates(text, now) {
  now = now || new Date();
  const lines = String(text || '').split(/\n/).map(l => fixDigits(l.toUpperCase()));
  const found = [];
  const push = (mo, y, idx, line) => {
    mo = +mo; y = yr(y);
    if (!(mo >= 1 && mo <= 12) || y < 2015 || y > 2045) return;
    // نوع التاريخ من الكلمة قبله في نفس السطر أو السطر السابق
    const before = line.slice(0, idx), prev = lines[found.lineNo - 1] || '';
    const kw = s => { const e = s.search(/EXP|USE\s*BY|USE\s*BEFORE|BEST\s*BEFORE|\bBB\b|\bE\s*[:.]|VALID|EXPIRY/), mf = s.search(/MFG|MFD|MANUF|PROD|\bM\.?\s*D\b|\bP\.?\s*D\b|\bDOM\b|\bMD\b|\bPD\b/); return e < 0 && mf < 0 ? '' : e > mf ? 'exp' : 'mfg'; };
    const k = kw(before) || (before.trim() ? '' : kw(prev));
    found.push({ mo, y, k, v: y * 12 + mo });
  };
  lines.forEach((line, n) => {
    found.lineNo = n;
    let m;
    const re = [
      [/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/g, x => [x[2], x[3]]],            // DD/MM/YYYY
      [/\b(\d{4})[\/.\-](\d{1,2})(?:[\/.\-]\d{1,2})?\b/g, x => [x[2], x[1]]],               // YYYY-MM(-DD)
      [/\b(\d{1,2})\s*[\/.\-]\s*(\d{4})\b/g, x => [x[1], x[2]]],                              // MM/YYYY
      [/\b(\d{1,2})\s*[\/.\-]\s*(\d{2})\b(?![\/.\-]\d)/g, x => [x[1], x[2]]],                 // MM/YY
      [/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*[\s.\-\/]*(\d{4}|\d{2})\b/g, x => [MON[x[1]], x[2]]],  // MAR 2027
      [/\b(\d{1,2})\s*[\s.\-\/]\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*[\s.\-\/]*(\d{4}|\d{2})\b/g, x => [MON[x[2]], x[3]]],
      [/(?:EXP|EXPIRY|E\.?)\s*[:.]?\s*(\d{2})\s?(\d{4})\b/g, x => [x[1], x[2]]],              // EXP 032027
      [/(?:^|\s)(\d{1,2})\s+(20\d{2})\b/g, x => [x[1], x[2]]]                                // 05 2025
    ];
    const used = [];
    for (const [r, f] of re) {
      r.lastIndex = 0;
      while ((m = r.exec(line))) {
        const a = m.index, b = a + m[0].length;
        if (used.some(([x, y]) => a < y && b > x)) continue;
        used.push([a, b]);
        const [mo, y] = f(m); push(mo, y, a, line);
      }
    }
  });
  const fmt = d => d ? String(d.mo).padStart(2, '0') + '/' + d.y : '';
  let exp = found.find(d => d.k === 'exp'), mfg = found.find(d => d.k === 'mfg');
  const rest = found.filter(d => d !== exp && d !== mfg).sort((a, b) => b.v - a.v);
  if (!exp && rest.length) {
    if (mfg) exp = rest.find(d => d.v > mfg.v) || null;
    else if (rest.length >= 2) { exp = rest[0]; mfg = rest[rest.length - 1]; }
    else exp = rest[0];
  }
  let batch = '';
  const bm = String(text || '').toUpperCase().match(/(?:BATCH|LOT|B\.?\s*NO|B\/N|BN)\s*[:.#]?\s*([A-Z0-9\-\/]{3,14})/);
  if (bm) batch = bm[1];
  return { exp: fmt(exp), mfg: fmt(mfg), batch, all: found.map(fmt) };
}

/** هل التاريخ منتهٍ أو قريب؟ */
export function expState(ex, now) {
  if (!ex) return '';
  const [mo, y] = ex.split('/').map(Number); now = now || new Date();
  const em = y * 12 + mo, cm = now.getFullYear() * 12 + now.getMonth() + 1;
  return em < cm ? 'exp' : em <= cm + 6 ? 'soon' : '';
}
/** «0327» أو «3/27» أو «03/2027» → «03/2027» */
export function normExp(raw) {
  const s = String(raw || '').trim(); if (!s) return '';
  let m;
  if ((m = s.match(/^(\d{1,2})\s*[\/.\-]?\s*(\d{4})$/))) return +m[1] >= 1 && +m[1] <= 12 ? String(+m[1]).padStart(2, '0') + '/' + m[2] : null;
  if ((m = s.match(/^(\d{1,2})\s*[\/.\-]\s*(\d{2})$/)) || (m = s.match(/^(\d{2})(\d{2})$/))) return +m[1] >= 1 && +m[1] <= 12 ? String(+m[1]).padStart(2, '0') + '/20' + m[2] : null;
  return null;
}
