/*
 * الكاميرا بخطوات: ١ واجهة العلبة ← ٢ تاريخ الانتهاء ← ٣ الكمية والبونص والسعر، ثم الصنف التالي دون إغلاق الكاميرا.
 * الباركود يُقرأ تلقائياً أثناء المعاينة؛ النص يُقرأ على الجوال؛ والإنترنت اختياري لإعادة التعرّف.
 */
import { h, icon, toast, picker, confirmBox } from './ui.js';
import * as CAM from './cam.js';
import * as AI from './ai.js';
import * as DB from './db.js';
import { analyze, fromFields, parseDates, normExp, expState, FORM_AR } from './ocr.js';
import { C, identify, lookupCode, search, learn, lastPrice, rememberPrice } from './items.js';

export const CONF_AR = { high: 'متأكد', mid: 'راجِع', low: 'غير متأكد', manual: 'اختيار يدوي', none: 'غير معروف' };
export const METHOD_AR = { barcode: 'بالباركود', ocr: 'من النص', ai: 'عبر الإنترنت', manual: 'يدوي', '': '' };
export const num = s => { const v = parseFloat(String(s == null ? '' : s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,]/g, '.')); return isFinite(v) ? v : 0; };
export const money = n => (Math.round((+n || 0) * 100) / 100).toLocaleString('en-US');
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function newLine() {
  return { id: rid('l'), at: Date.now(), item: null, read: null, ocr: null, conf: 'none', method: '', why: null, bc: '', qty: '', bonus: '', price: '', exp: '', mfg: '', batch: '', photo: '', photo2: '', photo3: '', thumb: '' };
}
const snapItem = it => it ? { i: it.i, n: it.n, u: it.u, c: it.c } : null;
const readOf = a => a ? { name: a.name || '', strength: (a.strengths || []).join(' + '), form: a.form ? (FORM_AR[a.form] || a.form) : '', pack: a.pack || '', vol: a.vol || '', company: a.company || '', made: a.made || '' } : null;
/** سطور النص مختصرة لتُحفظ مع الصنف (لإعادة التعرّف لاحقاً بدمجها مع صورة ثانية) */
const keepLines = a => a ? a.lines.slice(0, 40).map(l => ({ t: l.t, h: Math.round(l.h), y: Math.round(l.y) })) : null;

/* ---------- واجهة الكاميرا ---------- */
function shell(onClose) {
  const video = h('video', { class: 'cv', playsinline: true, muted: true, autoplay: true, poster: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
  const frame = h('div', { class: 'cframe' }, h('i', { class: 'c1' }), h('i', { class: 'c2' }), h('i', { class: 'c3' }), h('i', { class: 'c4' }), h('b', { class: 'scanline' }));
  const steps = h('ol', { class: 'steps' }, h('li', { 'data-s': 'front' }, 'الواجهة'), h('li', { 'data-s': 'exp' }, 'الصلاحية'), h('li', { 'data-s': 'qty' }, 'الكمية والسعر'));
  const torchB = h('button', { class: 'cbtn hide', type: 'button', 'aria-label': 'الإضاءة' }, icon('bolt'));
  const zoomB = h('button', { class: 'cbtn zoom hide', type: 'button', 'aria-label': 'تقريب' }, '1×');
  const closeB = h('button', { class: 'cbtn', type: 'button', 'aria-label': 'إغلاق الكاميرا', on: { click: onClose } }, icon('x'));
  const hint = h('div', { class: 'chint' });
  const live = h('div', { class: 'clive', hidden: true });
  const shutter = h('button', { class: 'shutter', type: 'button', 'aria-label': 'التقاط' }, h('span'));
  const gallery = h('button', { class: 'cside', type: 'button' }, icon('image'), h('small', null, 'من الصور'));
  const manual = h('button', { class: 'cside', type: 'button' }, icon('search'), h('small', null, 'بحث يدوي'));
  const count = h('div', { class: 'ccount' });
  const shot = h('div', { class: 'cshot', hidden: true });
  const panel = h('div', { class: 'cpanel', hidden: true });
  const root = h('div', { class: 'cam', role: 'dialog', 'aria-label': 'تصوير الأصناف' }, video, frame, shot,
    h('div', { class: 'chead' }, closeB, steps, h('div', { class: 'ctools' }, zoomB, torchB)),
    hint, live, count,
    h('div', { class: 'cbar' }, gallery, shutter, manual), panel);
  return { root, video, frame, steps, torchB, zoomB, hint, live, shutter, gallery, manual, count, shot, panel };
}

/** الصورة الملتقطة مع إطارات السطور المقروءة؛ الضغط على سطر يجعله اسم الصنف */
function drawShot(host, blob, o, nameText, onTap) {
  host.textContent = '';
  if (!blob) { host.hidden = true; return; }
  host.hidden = false;
  const url = URL.createObjectURL(blob);
  const img = h('img', { src: url, alt: '' });
  img.onload = () => setTimeout(() => URL.revokeObjectURL(url), 1000);
  const wrap = h('div', { class: 'shotwrap' }, img);
  if (o && o.blocks && o.w && o.h) {
    wrap.style.aspectRatio = o.w + ' / ' + o.h;
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + o.w + ' ' + o.h); svg.setAttribute('preserveAspectRatio', 'none');
    for (const b of o.blocks) for (const l of b.l || []) {
      const [x0, y0, x1, y1] = l.b || [0, 0, 0, 0];
      if (x1 <= x0 || y1 <= y0) continue;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x0 - 4); r.setAttribute('y', y0 - 4); r.setAttribute('width', x1 - x0 + 8); r.setAttribute('height', y1 - y0 + 8); r.setAttribute('rx', 6);
      const isName = nameText && nameText.toUpperCase().includes(String(l.t).toUpperCase().trim()) && String(l.t).trim().length > 2;
      r.setAttribute('class', isName ? 'nm' : '');
      r.addEventListener('click', e => { e.stopPropagation(); onTap && onTap(l.t); });
      svg.appendChild(r);
    }
    wrap.appendChild(svg);
  }
  host.appendChild(wrap);
  // حجم الصورة داخل المساحة المتاحة مع الحفاظ على النسبة (حتى تنطبق الإطارات على النص)
  const fit = () => {
    const W = host.clientWidth - 24, H = host.clientHeight, iw = (o && o.w) || img.naturalWidth, ih = (o && o.h) || img.naturalHeight;
    if (!W || !H || !iw || !ih) return;
    const k = Math.min(W / iw, H / ih);
    wrap.style.width = Math.round(iw * k) + 'px'; wrap.style.height = Math.round(ih * k) + 'px';
  };
  if (o && o.w) requestAnimationFrame(fit); else img.addEventListener('load', fit);
}

/* ---------- لوحات النتائج ---------- */
function chip(ok, label, extra) {
  return h('span', { class: 'chk ' + (ok === true ? 'ok' : ok === false ? 'no' : '') }, ok === true ? icon('check', 14) : ok === false ? icon('alert', 14) : null, label, extra ? h('em', null, extra) : null);
}
export function whyChips(why, read, it) {
  if (!why || !it) return [];
  const out = [];
  if (why.strength != null) out.push(chip(why.strength, 'التركيز', why.strength ? '' : 'مختلف'));
  if (why.form != null) out.push(chip(why.form || why.formSoft ? true : false, 'الشكل', why.form ? '' : why.formSoft ? 'قريب' : 'مختلف'));
  if (why.pack != null) out.push(chip(why.pack, 'العبوة', why.pack ? '' : 'الصورة ' + (read && read.pack || '?') + ' ≠ القاعدة ' + (it.pack || '?')));
  if (why.vol != null) out.push(chip(why.vol, 'الحجم', why.vol ? '' : 'مختلف'));
  if (why.learned) out.push(chip(true, 'تعلّمه من اختيارك'));
  return out;
}

/**
 * فتح الكاميرا لإضافة أصناف إلى الطلبية.
 * hooks: { save(line) → Promise, needSupplier() → Promise<bool>, settings, lines() }
 * opt.reid = line: إعادة تعرّف صنف موجود بصورة ثانية (عبر الإنترنت إن أمكن). opt.expOnly = line: تصوير الصلاحية فقط.
 */
export async function openCamera(order, hooks, opt = {}) {
  const set = hooks.settings || {};
  let cam = null, stopDec = null, closed = false, liveT = null;
  const UI = shell(() => close());
  document.body.appendChild(UI.root);
  history.pushState({ cam: 1 }, '');
  const onPop = () => { if (history.state && history.state.cam) return; close(true); };
  addEventListener('popstate', onPop);
  // التطبيق في الخلفية (اختيار صورة من الاستديو، نافذة إذن، مكالمة): نوقف الكاميرا مؤقتاً ونعيد تشغيلها عند الرجوع
  const onVis = () => {
    if (closed) return;
    if (document.hidden) { if (cam && !starting) { clearTimeout(liveT); if (stopDec) { stopDec(); stopDec = null; } cam.stop(); cam = null; } }
    else if (!cam && !starting) setTimeout(() => { if (!closed && !document.hidden) startCam(); }, 250);
  };
  document.addEventListener('visibilitychange', onVis);

  // الحالة الحالية للصنف الذي يُصوَّر
  let cur = null, step = 'front', busy = false, panelOn = false;
  const fresh = () => {
    if (opt.reid) { const l = opt.reid; return { line: l, a: l.ocr ? analyze({ lines: l.ocr }) : null, cands: [], pick: null, blob: null, o: null, reid: true }; }
    if (opt.expOnly) return { line: opt.expOnly, cands: [], pick: null };
    return { line: newLine(), a: null, cands: [], pick: null, blob: null, o: null };
  };
  cur = fresh();

  async function close(fromPop) {
    if (closed) return; closed = true;
    clearTimeout(liveT);
    if (stopDec) stopDec();
    if (cam) cam.stop();
    UI.root.remove();
    removeEventListener('popstate', onPop); document.removeEventListener('visibilitychange', onVis);
    if (!fromPop) history.back();
    if (hooks.onClose) hooks.onClose();
  }

  function setCount() {
    const n = hooks.lines ? hooks.lines().length : 0;
    UI.count.textContent = opt.reid ? 'إعادة تعرّف: ' + ((cur.line.item && cur.line.item.n) || (cur.line.read && cur.line.read.name) || 'صنف') : n ? n + (n === 1 ? ' صنف' : ' أصناف') + ' في الطلبية' : 'الطلبية فارغة';
  }
  function setStep(s) {
    step = s;
    UI.root.dataset.step = s;
    for (const li of UI.steps.children) { const k = ['front', 'exp', 'qty'].indexOf(li.dataset.s), m = ['front', 'exp', 'qty'].indexOf(s); li.className = k < m ? 'done' : k === m ? 'on' : ''; }
    UI.hint.textContent = s === 'front' ? (opt.reid ? 'صوّر جانباً آخر من العلبة يظهر فيه الاسم بوضوح' : 'وجّه الكاميرا إلى واجهة العلبة: الاسم والتركيز داخل الإطار. الباركود يُقرأ وحده')
      : s === 'exp' ? 'قرّب الكاميرا من تاريخ الانتهاء حتى يملأ الشريط' : '';
    UI.manual.lastChild.textContent = s === 'front' ? 'بحث يدوي' : 'اكتب التاريخ';
    if (cam) UI.live.hidden = true;
    hidePanel();
    setCount();
    if (s === 'exp') liveExp();
  }
  function showPanel(content, withShot) {
    panelOn = true; UI.root.classList.add('panel-on');
    UI.panel.hidden = false; UI.panel.textContent = ''; UI.panel.appendChild(content);
    if (!withShot) UI.shot.hidden = true;
    UI.panel.scrollTop = 0;
  }
  function hidePanel() { panelOn = false; UI.root.classList.remove('panel-on'); UI.panel.hidden = true; UI.shot.hidden = true; UI.panel.textContent = ''; }
  function working(on, text) { busy = on; UI.shutter.classList.toggle('busy', on); if (text) UI.hint.textContent = text; }

  /* ----- الكاميرا والباركود ----- */
  let lastCode = '', lastT = 0, starting = false;
  async function startCam() {
    if (starting || cam || closed) return;
    starting = true;
    UI.live.hidden = false; UI.live.textContent = 'جارٍ تشغيل الكاميرا…';
    try { cam = await CAM.startCamera(UI.video, t => { UI.live.textContent = t; }); }
    catch (e) {
      starting = false;
      const msg = e && e.name === 'NotAllowedError' ? 'الكاميرا غير مسموحة: اسمح لتطبيق «تصوير الطلبيات» باستخدام الكاميرا من إعدادات الجوال، ثم اضغط زر التصوير.'
        : e && e.name === 'NotFoundError' ? 'لم يُعثر على كاميرا في هذا الجهاز. اختر الصور من الاستديو.'
        : 'لم تعمل الكاميرا (' + ((e && (e.name || e.message)) || 'خطأ') + '). اضغط زر التصوير لإعادة المحاولة، أو اختر من الصور.';
      UI.live.hidden = false; UI.live.textContent = msg;
      return;
    }
    starting = false;
    if (closed) { cam.stop(); return; }
    UI.live.hidden = true;
    if (cam.hasTorch) { UI.torchB.classList.remove('hide'); UI.torchB.onclick = () => UI.torchB.classList.toggle('on', cam.torch()); }
    if (cam.zoomRange && cam.zoomRange[1] > 1.4) {
      UI.zoomB.classList.remove('hide');
      const zs = [cam.zoomRange[0], Math.min(2, cam.zoomRange[1]), cam.zoomRange[1]].filter((v, i, a) => a.indexOf(v) === i);
      let zi = 0; UI.zoomB.onclick = () => { zi = (zi + 1) % zs.length; cam.zoom(zs[zi]); UI.zoomB.textContent = (Math.round(zs[zi] * 10) / 10) + '×'; };
    }
    if (step === 'exp') liveExp();
    CAM.decodeLoop(UI.video, cam.stream, text => {
      const now = Date.now();
      if (text === lastCode && now - lastT < 2500) { lastT = now; return; }
      lastCode = text; lastT = now;
      onCode(text);
    }).then(f => { if (closed) f(); else stopDec = f; }).catch(() => {});
  }

  function onCode(text) {
    if (closed || busy || panelOn) return;
    const r = lookupCode(text), p = r.p;
    if (step === 'exp' || step === 'qty') {
      // رمز GS1 أثناء خطوة الصلاحية: يملأ التاريخ والتشغيلة مباشرة
      if (p && p.exp && step === 'exp') { CAM.beep(true); cur.line.exp = p.exp; if (p.batch) cur.line.batch = p.batch; showExp({ exp: p.exp, batch: p.batch, all: [p.exp] }, 'من الرمز المربع'); }
      return;
    }
    if (opt.expOnly) return;
    CAM.beep();
    cur.line.bc = p ? p.main : String(text);
    if (p && p.exp && !cur.line.exp) { cur.line.exp = p.exp; cur.line.batch = p.batch || cur.line.batch; }
    if (r.it && !opt.reid) {
      grabFrame().then(() => {
        cur.cands = [{ it: r.it, conf: 'high', why: null, score: 99 }]; cur.pick = 0;
        cur.line.method = 'barcode'; cur.line.conf = 'high';
        showResult();
      });
    } else if (!r.it) {
      UI.live.hidden = false; UI.live.textContent = 'باركود غير موجود في القاعدة: ' + cur.line.bc + '. صوّر الواجهة ليُعرف الصنف، وسيُربط الباركود به.';
    }
  }
  async function grabFrame() {
    try { const s = await CAM.snap(UI.video, null, 1600); cur.blob = s.blob; cur.o = null; } catch (e) {}
  }

  /* ----- الخطوة ١: الواجهة ----- */
  async function captureFront(src) {
    if (busy) return;
    working(true, 'جارٍ قراءة العلبة…');
    try {
      const s = src || await CAM.snap(UI.video, null, 1600);
      if (opt.reid) { cur.blob2 = s.blob; } else cur.blob = s.blob;
      UI.root.classList.add('flash'); setTimeout(() => UI.root.classList.remove('flash'), 220);
      let o = null;
      if (CAM.hasOcr()) { try { o = await CAM.ocr(s.blob); } catch (e) { console.warn('ocr', e); } }
      if (!cur.line.bc) { const code = await CAM.decodeBlob(s.blob); if (code) { const r = lookupCode(code); cur.line.bc = r.p ? r.p.main : code; if (r.p && r.p.exp && !cur.line.exp) { cur.line.exp = r.p.exp; cur.line.batch = r.p.batch; } if (r.it && !opt.reid) { cur.o = o; cur.a = o ? analyze(o) : null; cur.cands = [{ it: r.it, conf: 'high', score: 99 }]; cur.pick = 0; cur.line.method = 'barcode'; cur.line.conf = 'high'; working(false); showResult(); return; } } }
      if (opt.reid) {
        // إعادة التعرّف: نص الصورة الأولى + الثانية معاً، ثم الإنترنت إن توفر المفتاح
        const a2 = o ? analyze(o) : null;
        const lines = [].concat(cur.line.ocr || [], a2 ? a2.lines.map(l => ({ t: l.t, h: l.h, y: l.y + 5000 })) : []);
        cur.a = lines.length ? analyze({ lines }) : null; cur.o = o;
        cur.cands = cur.a ? identify(cur.a) : []; cur.pick = cur.cands.length ? 0 : null;
        cur.line.method = 'ocr';
        working(false);
        showResult();
        if (set.key) online();
        return;
      }
      cur.o = o; cur.a = o ? analyze(o) : null;
      cur.cands = cur.a ? identify(cur.a) : [];
      cur.pick = cur.cands.length ? 0 : null;
      cur.line.method = 'ocr';
      working(false);
      showResult();
    } catch (e) { console.error(e); working(false); toast('تعذّر التقاط الصورة. أعد المحاولة.', { bad: true }); }
  }

  function retake() { cur = fresh(); lastCode = ''; setStep('front'); }

  function showResult() {
    const shotBlob = opt.reid && cur.blob2 ? cur.blob2 : cur.blob;
    const top = cur.pick != null ? cur.cands[cur.pick] : null;
    drawShot(UI.shot, shotBlob, cur.o, cur.a && cur.a.name, t => {
      // الاسم الذي ضغطت عليه في الصورة يصبح الأهم
      if (!cur.a) return;
      const lines = cur.a.lines.map(l => ({ t: l.t, h: l.t === t ? 999 : l.h, y: l.y }));
      cur.a = analyze({ lines }); cur.a.name = t;
      cur.cands = identify(cur.a); cur.pick = cur.cands.length ? 0 : null;
      showResult();
    });
    const a = cur.a, conf = cur.line.method === 'barcode' ? 'high' : top ? (cur.pick === 0 ? top.conf : 'manual') : 'none';
    const body = h('div', { class: 'res' });
    body.appendChild(h('div', { class: 'reshead' },
      h('span', { class: 'conf ' + conf }, CONF_AR[conf]),
      h('span', { class: 'meth' }, METHOD_AR[cur.line.method] || ''),
      cur.line.bc ? h('span', { class: 'bcode num', dir: 'ltr' }, cur.line.bc) : null));
    if (top) {
      body.appendChild(h('div', { class: 'pickname', dir: 'ltr' }, top.it.n));
      body.appendChild(h('div', { class: 'picksub' }, [top.it.u, top.it.c, top.it.i].filter(Boolean).join('، ')));
      const chips = whyChips(top.why, a, top.it);
      if (chips.length) body.appendChild(h('div', { class: 'chips' }, chips));
    } else {
      body.appendChild(h('div', { class: 'pickname none' }, a && a.name ? h('span', { dir: 'ltr' }, a.name) : 'لم يُقرأ اسم'));
      body.appendChild(h('p', { class: 'muted' }, !CAM.hasOcr() && !a ? 'قراءة النص تعمل داخل تطبيق الجوال. ابحث يدوياً أو استعمل التعرّف عبر الإنترنت.' : 'لم أجد هذا الصنف في القاعدة. ابحث بالاسم، أو أعد التصوير، أو جرّب عبر الإنترنت.'));
    }
    if (a && (a.name || a.strengths.length || a.pack)) {
      body.appendChild(h('div', { class: 'readbox' }, h('small', null, 'في الصورة'),
        h('span', { dir: 'ltr', class: 'lat' }, [a.name, a.strengths.join(' + '), a.vol, a.form ? '' : ''].filter(Boolean).join('  ')),
        h('span', null, [a.form ? FORM_AR[a.form] : '', a.pack ? 'العبوة ' + a.pack : ''].filter(Boolean).join('، ')),
        a.company ? h('span', { dir: 'ltr', class: 'lat co' }, a.company) : null));
      if (cur.o) body.appendChild(h('p', { class: 'tip' }, 'إن كان الاسم خطأ فاضغط على اسم الدواء في الصورة.'));
    }
    const alts = cur.cands.map((c, k) => k === cur.pick ? null : h('button', { class: 'alt', type: 'button', on: { click: () => { cur.pick = k; showResult(); } } },
      h('span', { dir: 'ltr', class: 'lat' }, c.it.n), h('small', null, [c.it.u, c.it.c].filter(Boolean).join('، ')))).filter(Boolean).slice(0, 4);
    if (alts.length) body.appendChild(h('div', { class: 'alts' }, h('small', null, 'أصناف قريبة'), alts));
    const acts = h('div', { class: 'acts' });
    if (top) acts.appendChild(h('button', { class: 'btn big', type: 'button', on: { click: () => accept() } }, opt.reid ? 'اعتمد هذا الصنف' : 'صحيح، التالي', icon('fwd', 18)));
    acts.appendChild(h('div', { class: 'acts2' },
      h('button', { class: 'btn ghost', type: 'button', on: { click: () => manualPick(a && a.name) } }, icon('search', 18), 'بحث'),
      h('button', { class: 'btn ghost', type: 'button', on: { click: () => retake() } }, icon('retake', 18), 'أعد التصوير'),
      h('button', { class: 'btn ghost ai', type: 'button', on: { click: () => online() } }, icon('spark', 18), 'عبر الإنترنت')));
    if (!top && a && a.name && !opt.reid) acts.appendChild(h('button', { class: 'btn link', type: 'button', on: { click: () => { cur.pick = null; accept(true); } } }, 'احفظه باسمه المقروء (يُراجع لاحقاً)'));
    body.appendChild(acts);
    showPanel(body, true);
  }

  async function manualPick(q) {
    const it = await itemPicker(q || '');
    if (!it) return;
    const k = cur.cands.findIndex(c => c.it.i === it.i);
    if (k >= 0) cur.pick = k; else { cur.cands.unshift({ it, conf: 'manual', score: 0 }); cur.pick = 0; }
    if (cur.line.method !== 'barcode') cur.line.method = cur.line.method || 'manual';
    if (!cur.blob && !opt.reid && !opt.expOnly) cur.line.method = 'manual';
    if (!cur.blob && !cur.a) { accept(); return; }
    showResult();
  }

  async function online() {
    if (!set.key) { toast(AI.AI_ERR['no-key'], { bad: true, ms: 4500 }); return; }
    const blobs = [cur.blob, cur.blob2].filter(Boolean);
    if (opt.reid && !blobs.length && cur.line.photo) { const b = await DB.photo(cur.line.photo); if (b) blobs.unshift(b); }
    if (opt.reid && cur.line.photo && cur.blob2 && blobs.length < 2) { const b = await DB.photo(cur.line.photo); if (b) blobs.unshift(b); }
    if (!blobs.length) { toast('صوّر العلبة أولاً', { bad: true }); return; }
    working(true, 'جارٍ التعرّف عبر الإنترنت…');
    const wait = h('div', { class: 'aiwait' }, h('span', { class: 'spin' }), 'جارٍ التعرّف عبر الإنترنت…');
    UI.panel.prepend(wait);
    try {
      const imgs = await Promise.all(blobs.slice(-2).map(CAM.blobToB64));
      const f = await AI.identify({ key: set.key, model: set.model, images: imgs, hint: cur.a ? cur.a.text : '' });
      const a = fromFields({ name: f.name, strength: f.strength, form: f.form, pack: f.pack, packUnit: f.packUnit, company: f.company, generic: f.generic });
      a.vol = f.volume || a.vol;
      cur.a = a; cur.ai = f;
      cur.cands = identify(a); cur.pick = cur.cands.length ? 0 : null;
      cur.line.method = 'ai';
      if (f.exp && normExp(f.exp) && !cur.line.exp) cur.aiExp = normExp(f.exp);
      if (f.batch && !cur.line.batch) cur.line.batch = String(f.batch).slice(0, 20);
      if (f.barcode && !cur.line.bc && /^\d{8,14}$/.test(String(f.barcode))) cur.line.bc = String(f.barcode);
      working(false);
      showResult();
      if (!cur.cands.length) toast('قرأ: ' + (f.name || '؟') + ' — غير موجود في القاعدة', { ms: 4000 });
    } catch (e) {
      working(false); wait.remove();
      toast(AI.AI_ERR[e.message] || ('تعذّر التعرّف: ' + (e.detail || e.message)), { bad: true, ms: 5000 });
    }
  }

  async function accept(unknown) {
    const top = !unknown && cur.pick != null ? cur.cands[cur.pick] : null;
    const L = cur.line;
    L.item = top ? snapItem(top.it) : null;
    L.why = top && top.why ? top.why : null;
    L.conf = !top ? 'none' : L.method === 'barcode' ? 'high' : cur.pick === 0 && top.conf !== 'manual' ? top.conf : 'manual';
    if (cur.a) { L.read = readOf(cur.a); L.ocr = keepLines(cur.a); }
    if (top) learn(cur.a, top.it.i, L.bc).catch(() => {});
    if (opt.reid) {
      if (cur.blob2) { L.photo3 = await DB.putPhoto(cur.blob2); if (!L.photo) { L.photo = L.photo3; L.thumb = await CAM.thumb(cur.blob2); } }
      if (cur.aiExp && !L.exp) L.exp = cur.aiExp;
      await hooks.save(L, { replace: true });
      toast('حُدّث الصنف');
      close();
      return;
    }
    if (cur.aiExp && !L.exp) L.exp = cur.aiExp;
    if (L.exp && set.askExp !== false && L.method !== 'barcode') { showExp({ exp: L.exp, batch: L.batch, all: [L.exp] }, cur.aiExp ? 'قرأه الإنترنت' : 'من الرمز المربع'); setStepQuiet('exp'); return; }
    if (L.exp || set.askExp === false) { toQty(); return; }
    setStep('exp');
  }
  function setStepQuiet(s) { step = s; UI.root.dataset.step = s; for (const li of UI.steps.children) { const k = ['front', 'exp', 'qty'].indexOf(li.dataset.s), m = ['front', 'exp', 'qty'].indexOf(s); li.className = k < m ? 'done' : k === m ? 'on' : ''; } }

  /* ----- الخطوة ٢: الصلاحية ----- */
  // يحاول قراءة التاريخ من المعاينة كل ثانية؛ إذا قُرئ نفس التاريخ مرتين يلتقطه وحده
  let liveLast = '';
  function liveExp() {
    clearTimeout(liveT); liveLast = '';
    if (!cam || !CAM.hasOcr() || set.autoExp === false) return;
    const tick = async () => {
      if (closed || step !== 'exp') return;
      if (!busy && !panelOn) {
        try {
          const s = await CAM.snap(UI.video, EXP_CROP, 1100);
          const o = await CAM.ocr(s.blob);
          if (step !== 'exp' || panelOn || busy || closed) return;
          const r = parseDates(o.text || '');
          if (r.exp) {
            UI.live.hidden = false; UI.live.textContent = 'أقرأ: ' + r.exp + (r.batch ? '، التشغيلة ' + r.batch : '');
            if (r.exp === liveLast) { CAM.beep(true); cur.expBlob = s.blob; cur.line.mfg = r.mfg || cur.line.mfg; if (r.batch && !cur.line.batch) cur.line.batch = r.batch; showExp(r, 'التقاط تلقائي'); return; }
            liveLast = r.exp;
          }
        } catch (e) {}
      }
      liveT = setTimeout(tick, 900);
    };
    liveT = setTimeout(tick, 900);
  }
  const EXP_CROP = { x: 0.07, y: 0.36, w: 0.86, h: 0.2 };
  async function captureExp(src) {
    if (busy) return;
    working(true, 'جارٍ قراءة التاريخ…');
    try {
      const s = src || await CAM.snap(UI.video, EXP_CROP, 1400);
      cur.expBlob = s.blob;
      let r = { exp: '', mfg: '', batch: '', all: [] };
      if (CAM.hasOcr()) {
        try {
          const o = await CAM.ocr(s.blob);
          r = parseDates(o.text || '');
          // لم يُقرأ في الشريط؟ نجرب الصورة كاملة
          if (!r.exp && !src) { const full = await CAM.snap(UI.video, null, 1600); const o2 = await CAM.ocr(full.blob); const r2 = parseDates(o2.text || ''); if (r2.exp) { r = r2; cur.expBlob = full.blob; } }
        } catch (e) {}
      }
      if (!r.exp && !cur.line.bc) { const code = await CAM.decodeBlob(s.blob); const p = code ? lookupCode(code).p : null; if (p && p.exp) r = { exp: p.exp, batch: p.batch, all: [p.exp] }; }
      working(false);
      if (r.mfg) cur.line.mfg = r.mfg;
      if (r.batch && !cur.line.batch) cur.line.batch = r.batch;
      showExp(r, r.exp ? '' : 'لم يُقرأ تاريخ');
    } catch (e) { working(false); toast('تعذّر التقاط الصورة', { bad: true }); }
  }
  function showExp(r, note) {
    clearTimeout(liveT);
    const L = cur.line;
    const inp = h('input', { class: 'expin num', dir: 'ltr', inputmode: 'numeric', placeholder: 'MM/YYYY', value: r.exp || L.exp || '', autocomplete: 'off', maxlength: 7 });
    const bat = h('input', { class: 'num', dir: 'ltr', placeholder: 'التشغيلة', value: L.batch || '', autocomplete: 'off', maxlength: 20 });
    const state = h('div', { class: 'expstate' });
    const upd = () => {
      const v = normExp(inp.value);
      const st = v ? expState(v) : '';
      state.className = 'expstate ' + st;
      state.textContent = inp.value && v === null ? 'اكتب الشهر والسنة: 03/2027' : st === 'exp' ? 'منتهي الصلاحية!' : st === 'soon' ? 'قريب الانتهاء (أقل من ٦ أشهر)' : v ? 'صالح' : '';
    };
    inp.addEventListener('input', () => {
      // كتابة سريعة: 0327 → 03/2027
      const d = inp.value.replace(/[٠-٩]/g, x => '٠١٢٣٤٥٦٧٨٩'.indexOf(x));
      if (d !== inp.value) inp.value = d;
      upd();
    });
    upd();
    const others = (r.all || []).filter((x, i, a) => a.indexOf(x) === i && x !== r.exp);
    const body = h('div', { class: 'res' },
      h('div', { class: 'reshead' }, h('span', { class: 'conf ' + (r.exp ? 'high' : 'none') }, r.exp ? 'قُرئ التاريخ' : 'اكتب التاريخ'), note ? h('span', { class: 'meth' }, note) : null),
      h('div', { class: 'pickname small', dir: 'ltr' }, L.item ? L.item.n : (L.read && L.read.name) || ''),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'تاريخ الانتهاء'), inp, state),
      others.length ? h('div', { class: 'alts row' }, h('small', null, 'تواريخ أخرى في الصورة'), others.map(x => h('button', { class: 'pill', type: 'button', on: { click: () => { inp.value = x; upd(); } } }, x))) : null,
      r.mfg ? h('p', { class: 'muted' }, 'تاريخ الإنتاج: ', h('span', { class: 'num', dir: 'ltr' }, r.mfg)) : null,
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'التشغيلة (اختياري)'), bat),
      h('div', { class: 'acts' },
        h('button', { class: 'btn big', type: 'button', on: { click: () => {
          const v = inp.value.trim() ? normExp(inp.value) : '';
          if (v === null) { toast('التاريخ غير صحيح. مثال: 03/2027', { bad: true }); inp.focus(); return; }
          L.exp = v || ''; L.batch = bat.value.trim();
          if (opt.expOnly) { finishExpOnly(); return; }
          toQty();
        } } }, opt.expOnly ? 'حفظ التاريخ' : 'التالي: الكمية والسعر', icon('fwd', 18)),
        h('div', { class: 'acts2' },
          h('button', { class: 'btn ghost', type: 'button', on: { click: () => { setStep('exp'); } } }, icon('retake', 18), 'أعد التصوير'),
          opt.expOnly ? null : h('button', { class: 'btn ghost', type: 'button', on: { click: () => { L.exp = ''; toQty(); } } }, 'بلا تاريخ'))));
    drawShot(UI.shot, cur.expBlob, null);
    showPanel(body, !!cur.expBlob);
    if (!r.exp) setTimeout(() => inp.focus(), 200);
  }
  async function finishExpOnly() {
    const L = cur.line;
    if (cur.expBlob) L.photo2 = await DB.putPhoto(cur.expBlob);
    await hooks.save(L, { replace: true });
    toast('حُفظ التاريخ');
    close();
  }

  /* ----- الخطوة ٣: الكمية والبونص والسعر ----- */
  function toQty() {
    setStepQuiet('qty');
    const L = cur.line;
    const lp = L.item ? lastPrice(L.item.i) : null;
    const q = h('input', { class: 'num big', inputmode: 'decimal', autocomplete: 'off', value: L.qty || '', placeholder: '0' });
    const b = h('input', { class: 'num big', inputmode: 'decimal', autocomplete: 'off', value: L.bonus || '', placeholder: '0' });
    const p = h('input', { class: 'num big', inputmode: 'decimal', autocomplete: 'off', value: L.price || (lp ? lp.p : ''), placeholder: '0' });
    const tot = h('b', { class: 'num' });
    const upd = () => { tot.textContent = money(num(q.value) * num(p.value)); };
    [q, b, p].forEach(x => x.addEventListener('input', upd)); upd();
    const dup = (hooks.lines ? hooks.lines() : []).find(x => x.id !== L.id && x.item && L.item && x.item.i === L.item.i);
    const body = h('div', { class: 'res qty' },
      h('div', { class: 'pickname small', dir: 'ltr' }, L.item ? L.item.n : (L.read && L.read.name) || 'صنف غير معروف'),
      h('div', { class: 'picksub' }, [L.item && L.item.u, L.exp ? 'ينتهي ' + L.exp : 'بلا تاريخ'].filter(Boolean).join('، ')),
      dup ? h('p', { class: 'note' }, 'موجود في الطلبية: ' + (dup.qty || 0) + (dup.bonus ? ' + ' + dup.bonus + ' بونص' : '') + (dup.exp ? '، صلاحية ' + dup.exp : '')) : null,
      h('div', { class: 'qgrid' },
        h('label', null, h('span', null, 'الكمية'), q),
        h('label', null, h('span', null, 'البونص'), b),
        h('label', null, h('span', null, 'سعر الشراء'), p)),
      h('div', { class: 'qtot' }, h('span', null, lp ? 'السعر المقترح من ' + lp.src + ': ' + money(lp.p) : 'الإجمالي'), h('span', null, 'الإجمالي ', tot)),
      h('div', { class: 'acts' },
        h('button', { class: 'btn big', type: 'button', on: { click: () => save(true) } }, icon('camera', 18), 'حفظ وصنف آخر'),
        h('div', { class: 'acts2' },
          h('button', { class: 'btn ghost', type: 'button', on: { click: () => save(false) } }, icon('check', 18), 'حفظ وإنهاء'),
          h('button', { class: 'btn ghost', type: 'button', on: { click: () => { if (set.askExp === false) { setStepQuiet('front'); showResult(); } else { setStepQuiet('exp'); showExp({ exp: L.exp, batch: L.batch, all: [] }, ''); } } } }, 'رجوع'))));
    drawShot(UI.shot, null);
    showPanel(body, false);
    setTimeout(() => q.focus(), 150);
    async function save(next) {
      const qty = num(q.value), bonus = num(b.value), price = num(p.value);
      if (!(qty > 0) && !(bonus > 0)) { toast('اكتب الكمية', { bad: true }); q.focus(); return; }
      L.qty = qty; L.bonus = bonus; L.price = price;
      if (!order.supplier && hooks.needSupplier) { await hooks.needSupplier(L); }
      if (cur.blob && !L.photo) { L.photo = await DB.putPhoto(cur.blob); L.thumb = await CAM.thumb(cur.blob); }
      if (cur.expBlob && !L.photo2) L.photo2 = await DB.putPhoto(cur.expBlob);
      if (L.item && price > 0) rememberPrice(L.item.i, price).catch(() => {});
      await hooks.save(L);
      CAM.beep();
      toast('حُفظ: ' + (L.item ? L.item.n : (L.read && L.read.name) || 'صنف') + ' × ' + qty);
      if (next) { cur = fresh(); lastCode = ''; setStep('front'); }
      else close();
    }
  }

  /* ----- الأزرار ----- */
  UI.shutter.onclick = () => { if (panelOn) return; if (!cam) { startCam(); return; } if (step === 'front') captureFront(); else if (step === 'exp') captureExp(); };
  UI.gallery.onclick = () => {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      try { const s = await CAM.fromFile(f, 1600); if (step === 'exp') captureExp(s); else captureFront(s); } catch (e) { toast('تعذّر فتح الصورة', { bad: true }); }
    };
    document.body.appendChild(inp); inp.click();
  };
  UI.manual.onclick = () => { if (step === 'exp') showExp({ exp: '', all: [] }, 'كتابة يدوية'); else manualPick(''); };

  if (opt.expOnly) setStep('exp'); else setStep('front');
  startCam();
}

/** نافذة البحث في قاعدة الأصناف */
export function itemPicker(q) {
  return picker('اختر الصنف', [], {
    q, dir: 'ltr', placeholder: 'اسم الصنف بالإنجليزية أو الباركود',
    empty: C.ix ? 'اكتب جزءاً من الاسم، مثل: PANADOL 500' : 'قاعدة الأصناف لم تُحمَّل بعد',
    filter: s => search(s, 60).map(it => ({ value: it, label: it.n, ltr: true, sub: [it.u, it.c, it.i].filter(Boolean).join('، ') }))
  });
}
