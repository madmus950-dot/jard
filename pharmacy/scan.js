/* قراءة الباركود: الكاميرا الحية (أسرع)، وإن تعذّرت فبصورة واحدة. يعمل أيضاً قارئ الباركود الخارجي كلوحة مفاتيح في حقل البحث. */
import { h, icon, toast } from './ui.js';

const FORMATS = ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'code_39', 'itf', 'codabar', 'qr_code', 'data_matrix'];
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

/** يفتح الكاميرا ويعيد أول باركود يُقرأ (أو null عند الإغلاق) */
export async function scanCode() {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { return await live(); }
    catch (e) {
      if (e && e.name === 'NotAllowedError') toast('اسمح للتطبيق باستخدام الكاميرا من إعدادات الجهاز', { bad: true });
      else if (e && e.message === 'closed') return null;
    }
  }
  return photo();
}

function live() {
  return new Promise(async (resolve, reject) => {
    let stream = null, done = false, timer = null, reader = null;
    const video = h('video', { playsinline: true, muted: true, autoplay: true });
    video.setAttribute('playsinline', ''); video.muted = true;
    const torchBtn = h('button', { class: 'iconbtn hide', 'aria-label': 'الإضاءة' }, icon('bolt'));
    const ui = h('div', { class: 'cam' }, video, h('div', { class: 'frame' }),
      h('div', { class: 'camtop' }, h('button', { class: 'iconbtn', 'aria-label': 'إغلاق', on: { click: () => finish(null) } }, icon('x')), torchBtn),
      h('div', { class: 'camhint' }, 'وجّه الكاميرا إلى الباركود'));
    const onPop = () => finish(null, true);
    function finish(code, fromPop) {
      if (done) return; done = true;
      clearInterval(timer);
      try { if (reader) reader.reset(); } catch (e) {}
      if (stream) stream.getTracks().forEach(t => t.stop());
      ui.remove(); removeEventListener('popstate', onPop);
      if (!fromPop) history.back();
      if (code) beep();
      resolve(code);
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { reject(e); return; }
    document.body.appendChild(ui);
    history.pushState({ cam: 1 }, ''); addEventListener('popstate', onPop);
    video.srcObject = stream;
    try { await video.play(); } catch (e) {}
    const track = stream.getVideoTracks()[0];
    try {
      if (track && track.getCapabilities && track.getCapabilities().torch) {
        let on = false; torchBtn.classList.remove('hide');
        torchBtn.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); };
      }
    } catch (e) {}
    const det = await detector();
    if (det) {
      timer = setInterval(async () => {
        if (done || video.readyState < 2) return;
        try { const r = await det.detect(video); if (r && r.length) finish(r[0].rawValue); } catch (e) {}
      }, 140);
      return;
    }
    try {
      await loadZXing();
      const Z = window.ZXing, hints = new Map();
      hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX]);
      reader = new Z.BrowserMultiFormatReader(hints, 150);
      const res = await reader.decodeOnceFromStream(stream, video);
      finish(res && res.getText());
    } catch (e) { if (!done) { toast('تعذّر تشغيل قارئ الباركود', { bad: true }); finish(null); } }
  });
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
