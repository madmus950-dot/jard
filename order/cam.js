/* الكاميرا: معاينة حية، التقاط صورة، قراءة الباركود بكل أنواعه، وقراءة النص على الجوال (ML Kit عبر JardOcr). */

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
let detP = null;
function detector() {
  if (!detP) detP = (async () => {
    if (!('BarcodeDetector' in window)) return null;
    try { const sup = await BarcodeDetector.getSupportedFormats(); const f = FORMATS.filter(x => sup.includes(x)); return f.length ? new BarcodeDetector({ formats: f }) : null; }
    catch (e) { return null; }
  })();
  return detP;
}

export function beep(hi) {
  try { if (navigator.vibrate) navigator.vibrate(hi ? [30, 40, 30] : 45); } catch (e) {}
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const a = beep.ctx || (beep.ctx = new C()), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = hi ? 1900 : 1500; g.gain.value = 0.07; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.08);
  } catch (e) {}
}

/** يشغّل الكاميرا الخلفية بأعلى دقة مناسبة لقراءة النص */
export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  const track = stream.getVideoTracks()[0];
  let caps = {};
  try { caps = track.getCapabilities ? track.getCapabilities() : {}; } catch (e) {}
  try { if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
  video.setAttribute('playsinline', ''); video.muted = true; video.srcObject = stream;
  try { await video.play(); } catch (e) {}
  let torchOn = false, zoomV = caps.zoom ? (caps.zoom.min || 1) : 1;
  return {
    stream, track,
    hasTorch: !!caps.torch,
    zoomRange: caps.zoom ? [caps.zoom.min || 1, Math.min(caps.zoom.max || 1, 4)] : null,
    torch() { torchOn = !torchOn; track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => {}); return torchOn; },
    zoom(z) { zoomV = z; track.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {}); },
    get zoomValue() { return zoomV; },
    stop() { stream.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  };
}

/**
 * صورة من الفيديو. crop = {x, y, w, h} نسب من 0 إلى 1 من الصورة المعروضة (لصورة الصلاحية: الشريط داخل الإطار فقط).
 * max: أطول ضلع. يعيد {blob, w, h}.
 */
export async function snap(video, crop, max) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) throw new Error('no-frame');
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (crop) {
    // الفيديو معروض بـ object-fit: cover؛ نحوّل نسب الشاشة إلى نسب الفيديو
    const r = video.getBoundingClientRect(), scale = Math.max(r.width / vw, r.height / vh);
    const dw = vw * scale, dh = vh * scale, ox = (dw - r.width) / 2, oy = (dh - r.height) / 2;
    sx = Math.max(0, (crop.x * r.width + ox) / scale); sy = Math.max(0, (crop.y * r.height + oy) / scale);
    sw = Math.min(vw - sx, crop.w * r.width / scale); sh = Math.min(vh - sy, crop.h * r.height / scale);
  }
  max = max || 1600;
  // الصور الصغيرة (شريط التاريخ) تُكبَّر قليلاً فيقرؤها قارئ النص أوضح
  const k = Math.min(max / Math.max(sw, sh), crop ? 2 : 1);
  const c = document.createElement('canvas'); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
  g.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
  return { blob, w: c.width, h: c.height };
}

/** صورة من الاستديو أو ملف → JPEG بحجم مناسب */
export async function fromFile(file, max) {
  max = max || 1600;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
  return { blob, w: c.width, h: c.height };
}
/** صورة مصغّرة للقائمة */
export async function thumb(blob, size) {
  size = size || 144;
  const bmp = await createImageBitmap(blob);
  const k = size / Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const w = bmp.width * k, hh = bmp.height * k;
  c.getContext('2d').drawImage(bmp, (size - w) / 2, (size - hh) / 2, w, hh);
  if (bmp.close) bmp.close();
  return c.toDataURL('image/jpeg', 0.72);
}

/** قراءة الباركود من الفيديو باستمرار؛ يعيد دالة الإيقاف */
export async function decodeLoop(video, stream, onText) {
  let stopped = false, timer = null, reader = null;
  const det = await detector();
  if (det) {
    timer = setInterval(async () => {
      if (stopped || video.readyState < 2) return;
      try { const r = await det.detect(video); if (r && r.length && !stopped) onText(r[0].rawValue); } catch (e) {}
    }, 160);
  } else {
    await loadZXing();
    const Z = window.ZXing, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, zfmt(Z));
    reader = new Z.BrowserMultiFormatReader(hints, 150);
    reader.decodeFromStream(stream, video, res => { if (res && !stopped) onText(res.getText()); }).catch(() => {});
  }
  return () => { stopped = true; clearInterval(timer); try { if (reader) reader.reset(); } catch (e) {} };
}
/** باركود من صورة ملتقطة (إن لم يُقرأ مباشرة) */
export async function decodeBlob(blob) {
  try {
    const det = await detector();
    if (det) { const bmp = await createImageBitmap(blob); const r = await det.detect(bmp); if (bmp.close) bmp.close(); if (r && r.length) return r[0].rawValue; return ''; }
    await loadZXing();
    const Z = window.ZXing, hints = new Map(); hints.set(Z.DecodeHintType.TRY_HARDER, true); hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, zfmt(Z));
    const url = URL.createObjectURL(blob);
    try { return (await new Z.BrowserMultiFormatReader(hints).decodeFromImageUrl(url)).getText(); } finally { URL.revokeObjectURL(url); }
  } catch (e) { return ''; }
}

/* ---------- قراءة النص على الجوال ---------- */
const OCR = () => window.JardOcr || null;
export const hasOcr = () => { try { return !!(OCR() && String(OCR().available()) === '1'); } catch (e) { return false; } };
const waiting = new Map();
window.__ocr = (id, json) => {
  const w = waiting.get(id); if (!w) return;
  waiting.delete(id); clearTimeout(w.t);
  try { const r = typeof json === 'string' ? JSON.parse(json) : json; if (r && r.error) w.no(new Error(r.error)); else w.ok(r); }
  catch (e) { w.no(e); }
};
export function blobToB64(blob) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); }); }
/** يعيد {w, h, text, blocks} أو يرمي خطأ */
export async function ocr(blob) {
  const A = OCR(); if (!A) throw new Error('no-ocr');
  const id = 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const b64 = await blobToB64(blob);
  return new Promise((ok, no) => {
    const t = setTimeout(() => { waiting.delete(id); no(new Error('timeout')); }, 25000);
    waiting.set(id, { ok, no, t });
    try { A.recognize(id, b64); } catch (e) { waiting.delete(id); clearTimeout(t); no(e); }
  });
}
