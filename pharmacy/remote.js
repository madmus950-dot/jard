/* الجوال قارئاً للكمبيوتر
   الجوال (بنفس حساب الكمبيوتر) يمسح بالكاميرا ويكتب كل رمز في مستند acc_meta/dev_scan_<uid> (طابور آخر 25 مسحة بأرقام تسلسلية).
   الكمبيوتر يستمع لنفس المستند، ويمرّر كل رمز جديد إلى الفاتورة المفتوحة عليه كأنه من قارئ USB،
   ثم يكتب النتيجة في dev_scanack_<uid> فيعرضها الجوال (أُضيف / غير مسجّل / لا فاتورة مفتوحة).
   القواعد الحالية تسمح للكاشير بكتابة مستندات dev_* فلا يحتاج تغييراً في Firebase. */
import { h, icon, toast, put } from './ui.js';
import { findCode } from './common.js';
import { inlineScanner } from './scan.js';

const scanId = uid => 'dev_scan_' + uid;
const ackId = uid => 'dev_scanack_' + uid;
const isDesk = () => !!(window.JardApp && window.JardApp.desktop) || new URLSearchParams(location.search).has('desk');
const ONLINE_MS = 75000;

/* ---------- على الكمبيوتر ---------- */
let H = null;                       // معالج الشاشة المفتوحة: { fn(code) → اسم الصنف أو false, hash }
let phoneAt = 0;                    // آخر إشارة من الجوال (بساعة الكمبيوتر)
const badges = new Set();
/** تسجّله شاشة الفاتورة: كل رمز من الجوال يمر عبر fn ما دامت الشاشة نفسها مفتوحة */
export function setRemoteHandler(fn) { H = { fn, hash: location.hash }; }
export function startReceiver(ctx) {
  if (!isDesk()) return;
  const { store } = ctx, uid = ctx.user.uid, id = scanId(uid);
  const seqs = d => (d && d.q || []).map(e => e.s);
  let last = Math.max(0, ...seqs(store.data.meta.get(id)));   // ما مُسح قبل فتح البرنامج لا يُعاد
  let lastOn = (store.data.meta.get(id) || {}).on || 0;
  let acks = ((store.data.meta.get(ackId(uid)) || {}).a || []).slice(-25);
  let busy = false, again = false;
  async function handle(code) {
    if (!H || H.hash !== location.hash) return { ok: false, m: 'لا فاتورة مفتوحة على الكمبيوتر' };
    try {
      const n = await H.fn(code);
      if (n) { toast('من الجوال: ' + n); return { ok: true, m: n }; }
      return { ok: false, m: 'غير مسجّل: أكمله على الكمبيوتر' };
    } catch (e) { return { ok: false, m: 'تعذّر: ' + (e.message || e) }; }
  }
  async function run() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const d = store.data.meta.get(id);
      if (d && d.on !== lastOn) { lastOn = d.on; phoneAt = d.on ? Date.now() : 0; paint(); }
      const fresh = (d && d.q || []).filter(e => e.s > last).sort((a, b) => a.s - b.s);
      if (!fresh.length) return;
      phoneAt = Date.now(); paint();
      for (const e of fresh) { last = e.s; const r = await handle(e.c); acks.push({ s: e.s, ok: r.ok ? 1 : 0, m: r.m }); }
      acks = acks.slice(-25);
      await store.put('meta', ackId(uid), { kind: 'rscan', a: acks }, true);
    } finally {
      busy = false;
      if (again) { again = false; run(); }
    }
  }
  store.on(() => { run(); });
  setInterval(paint, 5000);
}
function paint() {
  const on = phoneAt && Date.now() - phoneAt < ONLINE_MS;
  for (const b of [...badges]) {
    if (!b.isConnected) { badges.delete(b); continue; }
    b.className = 'rscan' + (on ? ' on' : '');
    b.lastChild.textContent = on ? 'الجوال متصل' : 'امسح بالجوال';
    b.title = on ? 'كل ما يُمسح بالجوال يُضاف هنا' : 'على الجوال: المزيد ← قارئ للكمبيوتر، بنفس الحساب';
  }
}
/** شارة صغيرة بجانب خانة البحث على الكمبيوتر: حالة الجوال */
export function remoteBadge() {
  if (!isDesk()) return null;
  const b = h('span', { class: 'rscan', role: 'status' }, icon('camera', 18), h('span', null, ''));
  badges.add(b); setTimeout(paint, 0);
  return b;
}

/* ---------- على الجوال ---------- */
export function scanpcView(ctx) {
  const { store } = ctx, uid = ctx.user.uid, id = scanId(uid);
  const rows = [];                  // { s, c, n, st: 'wait'|'ok'|'bad', m, t }
  let lastS = 0, cam = null, beat = null;
  const camHost = h('div', { class: 'rs-cam' });
  const list = h('div', { class: 'page tight' });
  const stat = h('div', { class: 'muted', style: { fontSize: '13.5px', margin: '6px 4px 0' } });
  const manual = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'أو اكتب الباركود أو رقم الصنف', autocomplete: 'off', enterkeyhint: 'send',
    on: { keydown: e => { if (e.key === 'Enter') { e.preventDefault(); sendManual(); } } } });

  async function send(code) {
    const cur = store.data.meta.get(id) || {};
    const s = Math.max(Date.now(), lastS + 1); lastS = s;
    const q = (cur.q || []).filter(e => e.s > s - 15 * 60000).concat([{ s, c: code }]).slice(-25);
    const f = findCode(store, code);
    rows.unshift({ s, c: code, n: f && f.it ? f.it.n : '', st: 'wait', t: Date.now() });
    rows.length = Math.min(rows.length, 30);
    drawRows();
    if (navigator.vibrate) try { navigator.vibrate(40); } catch (e) {}
    await store.put('meta', id, { kind: 'rscan', q, on: Date.now() }, true);
    return 'أُرسل: ' + (f && f.it ? f.it.n : code);
  }
  function sendManual() { const v = manual.value.trim(); if (!v) return; manual.value = ''; send(v); }
  function drawRows() {
    list.textContent = '';
    const now = Date.now();
    if (!rows.length) { put(list, h('p', { class: 'empty', style: { padding: '14px' } }, 'لم يُمسح شيء بعد.')); }
    for (const r of rows) {
      const late = r.st === 'wait' && now - r.t > 10000;
      const tag = r.st === 'ok' ? h('span', { class: 'tag green' }, 'أُضيف')
        : r.st === 'bad' ? h('span', { class: 'tag red' }, r.m || 'لم يُضف')
        : h('span', { class: late ? 'tag amber' : 'tag' }, late ? 'لم يصل بعد' : 'بانتظار الكمبيوتر');
      const name = r.n || (r.st === 'ok' && r.m) || '';
      put(list, h('div', { class: 'ln' },
        h('span', { class: 'k' }, h('b', null, name || r.c), name ? h('small', { class: 'num' }, r.c) : null), tag));
    }
    const ok = rows.filter(r => r.st === 'ok').length, wait = rows.filter(r => r.st === 'wait').length;
    stat.textContent = rows.length ? 'أُرسل ' + rows.length + '، أُضيف منها ' + ok + (wait ? '، بانتظار ' + wait : '') : '';
    if (rows.some(r => r.st === 'wait' && now - r.t > 10000)) stat.textContent += '. تأكد أن الفاتورة مفتوحة على الكمبيوتر بنفس الحساب وأن الإنترنت يعمل.';
  }
  const offAck = store.on(() => {
    const a = (store.data.meta.get(ackId(uid)) || {}).a || [];
    let ch = false;
    for (const r of rows) if (r.st === 'wait') { const x = a.find(y => y.s === r.s); if (x) { r.st = x.ok ? 'ok' : 'bad'; r.m = x.m; ch = true; if (!x.ok && navigator.vibrate) try { navigator.vibrate([60, 60, 60]); } catch (e) {} } }
    if (ch) drawRows();
  });
  async function startCam() {
    if (cam) return;
    cam = await inlineScanner(camHost, send, () => { cam = null; startBtn.classList.remove('hide'); });
    if (cam) startBtn.classList.add('hide');
  }
  const startBtn = h('button', { class: 'btn wide hide', on: { click: startCam } }, icon('camera', 20), 'تشغيل الكاميرا');
  function stopAll() {
    if (cam) { cam.stop(); cam = null; }
    clearInterval(beat); offAck();
    store.put('meta', id, { kind: 'rscan', on: 0 }, true).catch(() => {});
    removeEventListener('hashchange', stopAll);
  }
  addEventListener('hashchange', stopAll);
  // إشارة «الجوال متصل» للكمبيوتر كل 30 ثانية ما دامت الشاشة مفتوحة
  store.put('meta', id, { kind: 'rscan', on: Date.now() }, true).catch(() => {});
  beat = setInterval(() => { if (!document.hidden) store.put('meta', id, { kind: 'rscan', on: Date.now() }, true).catch(() => {}); drawRows(); }, 30000);
  drawRows();
  return {
    title: 'قارئ للكمبيوتر',
    el: h('div', null,
      h('p', { class: 'muted', style: { fontSize: '14px', margin: '0 4px 10px' } }, 'افتح فاتورة على الكمبيوتر بحسابك (' + ctx.user.name + ')، ثم امسح هنا. كل صنف يُضاف إلى الفاتورة المفتوحة هناك.'),
      camHost, startBtn,
      h('div', { class: 'scan', style: { position: 'static' } }, manual, h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'إرسال', on: { click: sendManual } }, icon('fwd'))),
      stat,
      h('h3', { class: 'sect' }, 'آخر ما أُرسل'), list),
    onShow: () => startCam()
  };
}
