/*
 * «تصدير وطباعة» موحّد لكل الجداول، بنفس طريقة تطبيق الجرد:
 * طباعة A4 مرتبة، تنزيل Excel، تنزيل CSV، نسخ للصق، وإعداد الأعمدة (إظهار، تسمية، ترتيب) يُحفظ لكل نوع جدول.
 *
 * openExport({
 *   id: 'voucher-sale',            // مفتاح حفظ إعداد الأعمدة
 *   title: 'فاتورة بيع A-12',      // عنوان الورقة والملف
 *   head: ['التاريخ: …', 'العميل: …'],  // سطور تحت العنوان في الطباعة
 *   cols: [{ k, t, f: 'n'|'q'|'d'|'x'|'', on: true }],   // f: مبلغ، كمية، تاريخ، صلاحية، نص
 *   rows: [ {k: value} أو [..] ],
 *   totals: [[label, value]],      // تحت الجدول
 *   extra: [{ name, cols, rows }], // جداول إضافية (أوراق Excel أخرى) بلا إعداد
 *   presets: [{ label, cols: [[k, t], ...] }]
 * })
 */
import { h, icon, toast, sheet, put, wide } from './ui.js';
import { money, qty, dmy, today } from './util.js';
import { saveXlsx, saveBlob, printHtml } from './out.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const loadCfg = id => { try { return JSON.parse(localStorage.getItem('pharm.cols.' + id) || 'null'); } catch (e) { return null; } };
const saveCfg = (id, c) => { try { localStorage.setItem('pharm.cols.' + id, JSON.stringify(c)); } catch (e) {} };

/** قيمة الخلية للملف (Excel وCSV): أرقام حقيقية، والتواريخ والصلاحيات نصاً بالصيغة المختارة */
function fileVal(v, c, xf) {
  if (v === '' || v == null) return '';
  if (c.f === 'n' || c.f === 'q') { const n = typeof v === 'number' ? v : Number(v); if (!isFinite(n)) return String(v); return c.f === 'n' ? Math.round(n * 100) / 100 : Math.round(n * 1000) / 1000; }
  if (c.f === 'd') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? dmy(v) : String(v);
  if (c.f === 'x') return xf === 'my' ? v : (/^\d{2}\/\d{4}$/.test(v) ? '01/' + v : v);
  return String(v);
}
/** قيمة الخلية للطباعة: مبالغ بفواصل */
function printVal(v, c, xf) {
  if (v === '' || v == null) return '';
  const fv = fileVal(v, c, xf);
  if (typeof fv === 'number') return c.f === 'n' ? money(fv) : qty(fv);
  return String(fv);
}

function activeCols(o) {
  const saved = loadCfg(o.id);
  let cols = o.cols.map(c => Object.assign({}, c, { on: c.on !== false }));
  if (saved && Array.isArray(saved.cols)) {
    const byK = new Map(cols.map(c => [String(c.k), c]));
    const out = [];
    for (const s of saved.cols) { const c = byK.get(String(s.k)); if (c) { out.push(Object.assign(c, { t: s.t || c.t, on: !!s.on })); byK.delete(String(s.k)); } }
    for (const c of byK.values()) out.push(c);                  // أعمدة جديدة لم تكن في الإعداد المحفوظ
    cols = out;
  }
  return { cols, xf: (saved && saved.xf) || 'dmy' };
}

function tableRows(o, cols, xf, forFile) {
  const shown = cols.filter(c => c.on);
  const head = shown.map(c => c.t);
  const body = o.rows.map(r => shown.map(c => forFile ? fileVal(r[c.k], c, xf) : printVal(r[c.k], c, xf)));
  return { shown, head, body };
}

export function openExport(o) {
  let { cols, xf } = activeCols(o);
  const store = () => saveCfg(o.id, { cols: cols.map(c => ({ k: c.k, t: c.t, on: c.on })), xf });
  const fname = (o.file || o.title || 'ملف').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, '_') + '_' + today();
  const msg = h('div', { class: 'fhint', role: 'status' });
  const count = h('p', { class: 'muted', style: { margin: '2px 2px 10px' } });

  const xlsxTables = () => {
    const t = tableRows(o, cols, xf, true);
    const main = { name: (o.sheet || o.title || 'الجدول').slice(0, 31), rows: [t.head, ...t.body, ...(o.totals || []).map(([l, v]) => { const r = t.shown.map(() => ''); r[0] = l; r[r.length - 1] = typeof v === 'number' ? Math.round(v * 100) / 100 : v; return r; })], widths: t.shown.map(c => c.w || (c.f === 'n' || c.f === 'q' ? 14 : c.f ? 12 : 30)) };
    const extra = (o.extra || []).map(e => ({ name: e.name.slice(0, 31), rows: [e.cols.map(c => c.t), ...e.rows.map(r => e.cols.map(c => fileVal(r[c.k], c, xf)))], widths: e.cols.map(c => c.f ? 14 : 30) }));
    return [main, ...extra];
  };
  async function doXlsx() {
    try { const r = await saveXlsx(fname + '.xlsx', xlsxTables()); if (r !== 'cancel') msg.textContent = 'حُفظ ملف Excel.'; }
    catch (e) { msg.textContent = 'تعذّر الحفظ. جرّب «نسخ للصق».'; }
  }
  async function doCsv() {
    const t = tableRows(o, cols, xf, true);
    const txt = '﻿' + [t.head, ...t.body].map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
    try { const r = await saveBlob(fname + '.csv', new Blob([txt], { type: 'text/csv' })); if (r !== 'cancel') msg.textContent = 'حُفظ ملف CSV.'; }
    catch (e) { msg.textContent = 'تعذّر الحفظ. جرّب «نسخ للصق».'; }
  }
  async function doCopy() {
    const t = tableRows(o, cols, xf, true);
    const txt = [t.head, ...t.body].map(r => r.join('\t')).join('\n');
    const A = window.JardApp;
    try {
      if (A && A.copyText) { const r = await A.copyText(txt); if (String(r) !== 'ok') throw new Error('copy'); }
      else await navigator.clipboard.writeText(txt);
      msg.textContent = 'نُسخ الجدول. الصقه في Excel أو واتساب.';
    } catch (e) {
      msg.textContent = 'انسخ النص يدوياً:';
      const ta = h('textarea', { readonly: true, rows: 6, style: { width: '100%', direction: 'ltr', fontSize: '13px' } }); ta.value = txt;
      put(msg, ta); setTimeout(() => ta.select(), 50);
    }
  }
  function doPrint() {
    const t = tableRows(o, cols, xf, false);
    const wide = t.shown.length > 7;
    const numCls = c => (c.f === 'n' || c.f === 'q') ? ' class="n"' : '';
    const S = o.settings || {};
    let html = `<style>@page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 10mm; }</style>
      <div class="doc-h"><div><h1>${esc(o.title || '')}</h1>${(o.head || []).map(x => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="doc-s"><b>${esc(S.name || 'الصيدلية')}</b>${S.addr || S.ph ? `<div>${esc([S.addr, S.ph].filter(Boolean).join('، '))}</div>` : ''}<div>طُبع ${dmy(today())}</div></div></div>
      <table class="grid"><thead><tr><th class="i">#</th>${t.shown.map(c => `<th${numCls(c)}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>`;
    t.body.forEach((r, i) => { html += `<tr><td class="i">${i + 1}</td>${r.map((v, j) => `<td${numCls(t.shown[j])}>${esc(v)}</td>`).join('')}</tr>`; });
    html += '</tbody></table>';
    if (o.totals && o.totals.length) html += `<table class="tots">${o.totals.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n">${typeof v === 'number' ? money(v) : esc(v)}</td></tr>`).join('')}</table>`;
    for (const e of o.extra || []) {
      html += `<h2>${esc(e.name)}</h2><table class="grid"><thead><tr>${e.cols.map(c => `<th${numCls(c)}>${esc(c.t)}</th>`).join('')}</tr></thead><tbody>` +
        e.rows.map(r => `<tr>${e.cols.map(c => `<td${numCls(c)}>${esc(printVal(r[c.k], c, xf))}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
    }
    printHtml(html, o.title, 'page');
  }

  const colsBox = h('div');
  function drawCols() {
    colsBox.textContent = '';
    cols.forEach((c, i) => {
      const title = h('input', { value: c.t, style: { minHeight: '40px', padding: '6px 10px' }, on: { change: e => { c.t = e.target.value.trim() || c.t; store(); } } });
      put(colsBox, h('div', { class: 'colrow' },
        h('input', { type: 'checkbox', checked: c.on, 'aria-label': 'إظهار ' + c.t, on: { change: e => { c.on = e.target.checked; store(); updCount(); } } }),
        title,
        h('button', { class: 'btn ghost sm', 'aria-label': 'لأعلى', disabled: i === 0, on: { click: () => { [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; store(); drawCols(); } } }, '↑'),
        h('button', { class: 'btn ghost sm', 'aria-label': 'لأسفل', disabled: i === cols.length - 1, on: { click: () => { [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; store(); drawCols(); } } }, '↓')));
    });
  }
  function applyPreset(p) {
    const byK = new Map(cols.map(c => [String(c.k), c]));
    const next = [];
    for (const [k, t] of p.cols) { const c = byK.get(String(k)); if (c) { next.push(Object.assign(c, { on: true, t: t || c.t })); byK.delete(String(k)); } }
    for (const c of byK.values()) { c.on = false; next.push(c); }
    cols = next; store(); drawCols(); updCount();
  }
  function reset() { saveCfg(o.id, null); ({ cols, xf } = activeCols(Object.assign({}, o, { id: '__none__' }))); store(); drawCols(); updCount(); }
  const updCount = () => { count.textContent = o.rows.length + ' سطر، ' + cols.filter(c => c.on).length + ' عمود'; };
  const hasExp = cols.some(c => c.f === 'x');

  const body = h('div', null,
    count,
    h('div', { class: 'xgrid xmain' },
      h('button', { class: 'btn', on: { click: doPrint } }, icon('print', 20), 'طباعة A4'),
      h('button', { class: 'btn ghost', on: { click: doXlsx } }, 'تنزيل Excel'),
      h('button', { class: 'btn ghost', on: { click: doCsv } }, 'تنزيل CSV'),
      h('button', { class: 'btn ghost', on: { click: doCopy } }, 'نسخ للصق'),
      o.receipt ? h('button', { class: 'btn ghost', style: { gridColumn: '1 / -1' }, on: { click: o.receipt } }, 'طباعة إيصال صغير (طابعة الفواتير)') : null),
    msg,
    h('details', { class: 'colset', open: wide() },
      h('summary', null, 'إعداد الأعمدة'),
      h('p', { class: 'muted', style: { fontSize: '13.5px', margin: '8px 2px' } }, 'اختر الأعمدة وأسماءها وترتيبها. يُحفظ الإعداد لهذا النوع من الجداول.'),
      (o.presets && o.presets.length) ? h('div', { class: 'xgrid' }, o.presets.map(p => h('button', { class: 'btn ghost sm', on: { click: () => applyPreset(p) } }, p.label))) : null,
      hasExp ? h('label', { class: 'field', style: { marginTop: '10px' } }, h('span', { class: 'flabel' }, 'صيغة تاريخ الانتهاء في الملف'),
        h('select', { on: { change: e => { xf = e.target.value; store(); } } }, h('option', { value: 'dmy', selected: xf === 'dmy' }, '01/03/2027'), h('option', { value: 'my', selected: xf === 'my' }, '03/2027'))) : null,
      colsBox,
      h('button', { class: 'btn ghost sm', style: { marginTop: '8px' }, on: { click: reset } }, 'إرجاع الأعمدة الافتراضية')));
  drawCols(); updCount();
  sheet('تصدير وطباعة: ' + (o.title || ''), body, { tall: !wide(), cls: 'xsheet' });
}
