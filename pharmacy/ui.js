/* أدوات الواجهة: إنشاء العناصر، النوافذ السفلية، الرسائل، الأيقونات. */

export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

/** h('div', {class:'x', on:{click}}, 'نص', child) */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const frag = (...kids) => { const f = document.createDocumentFragment(); add(f, kids); return f; };
/** مثل append لكن يتجاهل null/false (append العادية تكتب «null») */
export function put(el, ...kids) { add(el, kids); return el; }
/** اسم لاتيني (أسماء الأدوية) يُكتب بخط الواجهة لا بخط النسخ */
export const isLatin = s => !/[\u0600-\u06FF]/.test(String(s || ''));

/* ---------- أيقونات خطية بسيطة ---------- */
const P = {
  today: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 11h7M9 15h7"/>',
  sale: '<path d="M4 4h2l2.2 10.2a1 1 0 0 0 1 .8h7.6a1 1 0 0 0 1-.8L19.5 8H7"/><circle cx="10" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6M17 14.3c1.8.6 3 2.2 3.5 4.7"/>',
  pill: '<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9.2 8.1l5.6 7.8"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  barcode: '<path d="M4 6v12M7 6v12M10 6v12M13 6v12M15 6v12M18 6v12M20 6v12"/>',
  camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  back: '<path d="M9 5l7 7-7 7"/>', fwd: '<path d="M15 5l-7 7 7 7"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v7h14v-7"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  off: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/><path d="M4 4l16 16"/>',
  in: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>', out: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  report: '<path d="M5 20V10M10 20V4M15 20v-7M20 20v-11"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>', cal: '<rect x="4" y="5" width="16" height="15" rx="1.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>', edit: '<path d="M5 19h4L19 9l-4-4L5 15z"/>',
  wallet: '<rect x="3.5" y="6.5" width="17" height="12" rx="2"/><path d="M16 12.5h4.5"/><path d="M6 6.5l9-3 1 3"/>',
  undo: '<path d="M9 7H4V2"/><path d="M4.5 7A8 8 0 1 1 6 17"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'
};
export function icon(name, size) {
  const s = size || 22;
  const el = document.createElement('span'); el.className = 'ic';
  el.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  return el;
}

/* ---------- رسائل قصيرة ---------- */
let toastT = null;
export function toast(msg, opt = {}) {
  let t = $('#toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.appendChild(t); }
  t.className = 'toast on' + (opt.bad ? ' bad' : '');
  t.textContent = '';
  t.appendChild(h('span', null, msg));
  if (opt.action) t.appendChild(h('button', { class: 'tact', on: { click: () => { t.className = 'toast'; opt.action.fn(); } } }, opt.action.label));
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = 'toast'; }, opt.ms || (opt.action ? 6000 : 2600));
}

/* ---------- نافذة سفلية ---------- */
export function sheet(title, body, opt = {}) {
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 180); removeEventListener('popstate', onPop); if (opt.onClose) opt.onClose(); };
  const onPop = () => close();
  const wrap = h('div', { class: 'sheetwrap', on: { click: e => { if (e.target === wrap) { history.back(); } } } },
    h('div', { class: 'sheet' + (opt.tall ? ' tall' : ''), role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheethead' }, h('h3', null, title), h('button', { class: 'iconbtn', 'aria-label': 'إغلاق', on: { click: () => history.back() } }, icon('x', 20))),
      h('div', { class: 'sheetbody' }, body)));
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));
  history.pushState({ sheet: 1 }, '');
  addEventListener('popstate', onPop);
  return { close: () => history.back(), el: wrap };
}

export function confirmBox(title, msg, okLabel, danger) {
  return new Promise(res => {
    let done = false;
    const s = sheet(title, h('div', null,
      h('p', { class: 'lead' }, msg),
      h('div', { class: 'actions' },
        h('button', { class: 'btn' + (danger ? ' danger' : ''), on: { click: () => { done = true; res(true); s.close(); } } }, okLabel || 'تأكيد'),
        h('button', { class: 'btn ghost', on: { click: () => s.close() } }, 'رجوع'))), { onClose: () => { if (!done) res(false); } });
  });
}

/** حقل رقمي يقبل الأرقام العربية */
export function numField(attrs) {
  const el = h('input', Object.assign({ type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'num' }, attrs));
  return el;
}

/** قائمة اختيار بحث (أطراف، أصناف، حسابات) */
export function picker(title, rows, opt = {}) {
  return new Promise(res => {
    let done = false;
    const list = h('div', { class: 'plist' });
    const q = h('input', { type: 'search', placeholder: opt.placeholder || 'ابحث', class: 'psearch', autocomplete: 'off' });
    const draw = () => {
      const f = opt.filter ? opt.filter(q.value) : rows;
      list.textContent = '';
      if (opt.add && q.value.trim()) list.appendChild(h('button', { class: 'prow add', on: { click: () => { done = true; res({ add: q.value.trim() }); s.close(); } } }, icon('plus', 18), h('span', null, opt.add + ': ' + q.value.trim())));
      for (const r of f.slice(0, 80)) list.appendChild(h('button', { class: 'prow', on: { click: () => { done = true; res(r.value); s.close(); } } },
        h('span', { class: 'pmain' }, h('b', null, r.label), r.sub ? h('small', null, r.sub) : null), r.side ? h('span', { class: 'pside num' }, r.side) : null));
      if (!f.length && !(opt.add && q.value.trim())) list.appendChild(h('p', { class: 'empty' }, opt.empty || 'لا نتائج'));
    };
    q.addEventListener('input', draw);
    const s = sheet(title, h('div', null, q, list), { tall: true, onClose: () => { if (!done) res(null); } });
    draw(); setTimeout(() => q.focus(), 250);
  });
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), input, hint ? h('small', { class: 'fhint' }, hint) : null);
}
export function seg(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'group' });
  for (const [v, label] of options) el.appendChild(h('button', { type: 'button', class: v === value ? 'on' : '', on: { click: () => { $$('button', el).forEach(b => b.classList.remove('on')); el.children[options.findIndex(o => o[0] === v)].classList.add('on'); onChange(v); } } }, label));
  return el;
}
