/* قراءة الباركود: الكاميرا الحية (أسرع)، وإن تعذّرت فبصورة واحدة. يعمل أيضاً قارئ الباركود الخارجي كلوحة مفاتيح في حقل البحث. */
import { h, icon, toast } from './ui.js';

// كل أنواع الرموز: الخطية، والمربعة (QR وDataMatrix الدوائي)، وPDF417 وAztec
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix', 'pdf417', 'aztec'];
const zfmt = Z => ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'CODE_93', 'ITF', 'CODABAR', 'RSS_14', 'QR_CODE', 'DATA_MATRIX', 'PDF_417', 'AZTEC'].map(k => Z.BarcodeFormat[k]).filter(v => v !== undefined);
let zxingP = null;
function loadZXing() {
  if (window.ZXing) return Promise.resolve();
  if (!zxingP) zxingP = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'vendor/zxing.min.js';
    s.onload = ok; s.onerror = () => { zxingP = null; no(new Error('zxing')); };
    document.head.appendChild(s);
  });
  return zxingP;
}
async function detector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const sup = await BarcodeDetector.getSupportedFormats();
    const f = FORMATS.filter(x => sup.includes(x));
    return f.length ? new BarcodeDetector({ formats: f }) : null;
  } catch (e) { return null; }
}
function beep() {
  try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const a = beep.ctx || (beep.ctx = new C()), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 1650; g.gain.value = 0.08; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.09);
  } catch (e) {}
}

const DESK = () => !!(window.JardApp && window.JardApp.desktop) || (matchMedia('(min-width: 1000px)').matches && !matchMedia('(pointer: coarse)').matches);
async function hasCamera() {
  try { return (await navigator.mediaDevices.enumerateDevices()).some(d => d.kind === 'videoinput'); } catch (e) { return false; }
}

/** يفتح الكاميرا ويعيد أول باركود يُقرأ (أو null عند الإغلاق) */
export async function scanCode() {
  const desk = DESK();
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { return await live(); }
    catch (e) {
      if (e && e.name === 'NotAllowedError') toast(desk ? 'اسمح للبرنامج بالكاميرا من إعدادات ويندوز: الخصوصية ← الكاميرا' : 'اسمح للتطبيق باستخدام الكاميرا من إعدادات الجهاز', { bad: true });
      else if (e && e.message === 'closed') return null;
      else if (desk) toast('تعذّر تشغيل الكاميرا. استعمل قارئ الباركود.', { bad: true });
    }
  }
  return desk ? null : photo();
}

/**
 * زر المسح بجانب خانة البحث.
 * الجوال: كاميرا (مدمجة في الصفحة إن مُرّر inline). الكمبيوتر: أيقونة قارئ الباركود؛ القارئ يكتب في الخانة مباشرة دون ضغط الزر،
 * والزر يفتح كاميرا اللابتوب إن وُجدت، وإلا يجهّز الخانة للمسح.
 */
export function scanButton(onCode, input, opt = {}) {
  // برنامج الكمبيوتر: لا كاميرا (كاميرا اللابتوب لا تقرأ الباركود). القارئ USB يكتب في خانة البحث مباشرة
  if (window.JardApp && window.JardApp.desktop) return null;
  const desk = DESK();
  return h('button', { class: 'iconbtn', type: 'button', 'aria-label': desk ? 'قارئ الباركود' : 'مسح بالكاميرا', title: desk ? 'قارئ الباركود: امسح مباشرة، أو اضغط لاستعمال كاميرا الكمبيوتر' : '',
    on: { click: async () => {
      if (desk && !(await hasCamera())) {
        if (input) { input.focus(); input.select(); }
        toast('القارئ جاهز: امسح الباركود الآن');
        return;
      }
      if (opt.inline && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { opt.inline(); return; }
      const c = await scanCode(); if (c) onCode(c);
    } } }, icon(desk ? 'barcode' : 'camera'));
}

function openStream() {
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
}
/** يقرأ الرموز من الفيديو باستمرار ويستدعي onText لكل قراءة؛ يعيد دالة الإيقاف */
async function decodeLoop(video, stream, onText) {
  let stopped = false, timer = null, reader = null;
  const det = await detector();
  if (det) {
    timer = setInterval(async () => {
      if (stopped || video.readyState < 2) return;
      try { const r = await det.detect(video); if (r && r.length && !stopped) onText(r[0].rawValue); } catch (e) {}
    }, 130);
  } else {
    await loadZXing();
    const Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, zfmt(Z));
    reader = new Z.BrowserMultiFormatReader(hints, 120);
    reader.decodeFromStream(stream, video, res => { if (res && !stopped) onText(res.getText()); }).catch(() => {});
  }
  return () => { stopped = true; clearInterval(timer); try { if (reader) reader.reset(); } catch (e) {} };
}
function torch(stream, btn) {
  const track = stream.getVideoTracks()[0];
  try {
    if (track && track.getCapabilities && track.getCapabilities().torch) {
      let on = false; btn.classList.remove('hide');
      btn.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); };
    }
  } catch (e) {}
}

/** شاشة كاميرا كاملة لقراءة رمز واحد */
function live() {
  return new Promise(async (resolve, reject) => {
    let stream = null, done = false, stopDec = null;
    const video = h('video', { playsinline: true, muted: true, autoplay: true });
    video.setAttribute('playsinline', ''); video.muted = true;
    const torchBtn = h('button', { class: 'iconbtn hide', 'aria-label': 'الإضاءة' }, icon('bolt'));
    const ui = h('div', { class: 'cam' }, video, h('div', { class: 'frame' }),
      h('div', { class: 'camtop' }, h('button', { class: 'iconbtn', 'aria-label': 'إغلاق', on: { click: () => finish(null) } }, icon('x')), torchBtn),
      h('div', { class: 'camhint' }, 'وجّه الكاميرا إلى الباركود أو الرمز المربع'));
    const onPop = () => finish(null, true);
    function finish(code, fromPop) {
      if (done) return; done = true;
      if (stopDec) stopDec();
      if (stream) stream.getTracks().forEach(t => t.stop());
      ui.remove(); removeEventListener('popstate', onPop);
      if (!fromPop) history.back();
      if (code) beep();
      resolve(code);
    }
    try { stream = await openStream(); } catch (e) { reject(e); return; }
    document.body.appendChild(ui);
    history.pushState({ cam: 1 }, ''); addEventListener('popstate', onPop);
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    torch(stream, torchBtn);
    try { stopDec = await decodeLoop(video, stream, t => finish(t)); if (done && stopDec) stopDec(); }
    catch (e) { if (!done) { toast('تعذّر تشغيل قارئ الباركود', { bad: true }); finish(null); } }
  });
}

/**
 * كاميرا مدمجة داخل الصفحة تقرأ صنفاً بعد صنف دون إغلاق.
 * onCode(text) يعيد نصاً يظهر تحت الكاميرا (مثل اسم الصنف المضاف). تتوقف عند مغادرة الصفحة أو إخفاء التطبيق.
 */
export async function inlineScanner(host, onCode, onClose) {
  let stream;
  try { stream = await openStream(); }
  catch (e) {
    if (e && e.name === 'NotAllowedError') toast(DESK() ? 'اسمح للبرنامج بالكاميرا من إعدادات ويندوز: الخصوصية ← الكاميرا' : 'اسمح للتطبيق باستخدام الكاميرا من إعدادات الجهاز', { bad: true });
    else toast('تعذّر تشغيل الكاميرا', { bad: true });
    return null;
  }
  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  video.setAttribute('playsinline', ''); video.muted = true;
  const msg = h('div', { class: 'camhint' }, 'امسح الأصناف واحداً بعد الآخر: باركود أو رمز مربع');
  const torchBtn = h('button', { class: 'iconbtn hide', type: 'button', 'aria-label': 'الإضاءة' }, icon('bolt'));
  let stopped = false, stopDec = null;
  const box = h('div', { class: 'camstrip' }, video, h('div', { class: 'frame' }),
    h('div', { class: 'camtop' }, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'إغلاق الكاميرا', on: { click: () => stop(true) } }, icon('x')), torchBtn), msg);
  host.textContent = ''; host.appendChild(box);
  video.srcObject = stream;
  try { await video.play(); } catch (e) {}
  torch(stream, torchBtn);
  let last = '', seenT = 0, busy = false;
  const onVis = () => { if (document.hidden) stop(true); };
  const onHash = () => stop(false);
  function stop(user) {
    if (stopped) return; stopped = true;
    if (stopDec) stopDec();
    stream.getTracks().forEach(t => t.stop());
    box.remove();
    removeEventListener('hashchange', onHash); document.removeEventListener('visibilitychange', onVis);
    if (onClose) onClose(user);
  }
  addEventListener('hashchange', onHash); document.addEventListener('visibilitychange', onVis);
  try {
    stopDec = await decodeLoop(video, stream, text => {
      const now = Date.now();
      // نفس العلبة ما زالت أمام الكاميرا: لا تُضاف ثانية حتى تُبعد ثم تُعاد
      if (text === last && now - seenT < 1500) { seenT = now; return; }
      if (busy) return;
      last = text; seenT = now; busy = true;
      beep(); box.classList.add('hit'); setTimeout(() => box.classList.remove('hit'), 380);
      Promise.resolve(onCode(text)).then(r => { if (r) msg.textContent = r; }).catch(e => console.error(e)).finally(() => { busy = false; seenT = Date.now(); });
    });
    if (stopped) stopDec();
  } catch (e) { toast('تعذّر تشغيل قارئ الباركود', { bad: true }); stop(false); return null; }
  return { stop: () => stop(true) };
}

/** بديل: صورة واحدة من الكاميرا */
function photo() {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; inp.remove();
      if (!f) return resolve(null);
      toast('جارٍ قراءة الباركود…');
      try { resolve(await decodeFile(f)); } catch (e) { toast('لم يُقرأ باركود. صوّره وحده بإضاءة جيدة.', { bad: true }); resolve(null); }
    });
    document.body.appendChild(inp); inp.click();
  });
}
export async function decodeFile(file) {
  const det = await detector();
  if (det) { const bmp = await createImageBitmap(file); const r = await det.detect(bmp); if (bmp.close) bmp.close(); if (r && r.length) return r[0].rawValue; }
  await loadZXing();
  const Z = window.ZXing, hints = new Map(); hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const url = URL.createObjectURL(file);
  try { const res = await new Z.BrowserMultiFormatReader(hints).decodeFromImageUrl(url); return res.getText(); }
  finally { URL.revokeObjectURL(url); }
}
