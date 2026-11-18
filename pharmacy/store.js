/*
 * طبقة البيانات: نسخة كاملة على الجهاز (IndexedDB) + مزامنة تدريجية مع الخادم + صندوق صادر لا يضيع.
 * - كل حفظ يظهر فوراً على الجهاز ويُكتب في «الصادر»، ثم يُرسل للخادم متى توفر الإنترنت (حتى بعد إغلاق التطبيق).
 * - من الخادم لا يُجلب إلا ما تغيّر بعد آخر مزامنة (بختم وقت الخادم u)، فلا تتكرر قراءة القاعدة كلها.
 */
import { build, DEFAULT_ACCOUNTS } from './engine.js';
import { newId } from './util.js';

export const COLS = ['meta', 'accounts', 'parties', 'items', 'v'];

/* ---------- IndexedDB صغير ---------- */
function idb(name) {
  return new Promise((ok, no) => {
    const rq = indexedDB.open(name, 1);
    rq.onupgradeneeded = () => { const db = rq.result; db.createObjectStore('docs'); db.createObjectStore('kv'); };
    rq.onsuccess = () => ok(rq.result);
    rq.onerror = () => no(rq.error);
  });
}
function tx(db, store, mode, fn) {
  return new Promise((ok, no) => {
    const t = db.transaction(store, mode), s = t.objectStore(store); let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => ok(out); t.onerror = () => no(t.error); t.onabort = () => no(t.error);
  });
}
const reqP = rq => new Promise((ok, no) => { rq.onsuccess = () => ok(rq.result); rq.onerror = () => no(rq.error); });

export class Store {
  constructor(backend, user) {
    this.be = backend; this.user = user;
    this.data = {}; for (const c of COLS) this.data[c] = new Map();
    this.marks = {}; this.outbox = new Map();
    this.subs = new Set(); this.unsub = [];
    this.status = { online: navigator.onLine !== false, pending: 0, synced: {}, error: '', ready: false };
    this._L = null; this._dirty = true;
    this.dev = null;
  }

  /* ---------- فتح: من الجهاز أولاً ثم الخادم ---------- */
  async open() {
    this.db = await idb('pharm_' + this.user.uid);
    const all = await tx(this.db, 'docs', 'readonly', s => reqP(s.getAll()));
    const keys = await tx(this.db, 'docs', 'readonly', s => reqP(s.getAllKeys()));
    keys.forEach((k, i) => { const [c, id] = splitKey(k); if (this.data[c]) this.data[c].set(id, all[i]); });
    const kv = await tx(this.db, 'kv', 'readonly', s => reqP(s.get('state')));
    if (kv) { this.marks = kv.marks || {}; for (const o of kv.outbox || []) this.outbox.set(o.k, o); }
    for (const o of this.outbox.values()) this.apply(o.col, o.id, o.merge ? Object.assign({}, this.data[o.col].get(o.id), o.data) : o.data, true);
    this.dev = loadDev(this.user.uid);
    this.status.pending = this.outbox.size;
    this._dirty = true; this.ver = 1;
    this.listen();
    this.flush();
    addEventListener('online', () => { this.status.online = true; this.flush(); this.emit(); });
    addEventListener('offline', () => { this.status.online = false; this.emit(); });
    setInterval(() => this.flush(), 30000);
    return this;
  }

  listen() {
    for (const u of Object.values(this.unsub)) try { u(); } catch (e) {}
    this.unsub = {};
    for (const c of COLS) this.listenOne(c);
  }
  /** متابعة مجموعة واحدة. إن توقفت بخطأ (لا صلاحية، انقطاع) تُعاد بعد قليل تلقائياً */
  listenOne(c, wait) {
    const since = Math.max(0, (this.marks[c] || 0) - 120000);   // هامش دقيقتين لأمان التوقيت
    this.unsub[c] = this.be.listen(c, since, (docs, fromServer) => this.receive(c, docs, fromServer), err => {
      this.status.error = (err && (err.code || err.message)) || 'sync'; this.emit();
      const next = Math.min(120000, (wait || 10000) * 1.5);
      setTimeout(() => this.listenOne(c, next), wait || 10000);
    });
  }

  receive(c, docs, fromServer) {
    let changed = false, mark = this.marks[c] || 0;
    const puts = [];
    for (const d of docs) {
      if (this.outbox.has(c + '/' + d.id)) continue;           // تعديلي المحلي أحدث حتى يصل
      const data = d.data.id === d.id ? d.data : Object.assign({}, d.data, { id: d.id });
      this.data[c].set(d.id, data); puts.push([c + '/' + d.id, data]); changed = true;
      if (d.u > mark) mark = d.u;
    }
    if (fromServer) { this.status.synced[c] = Date.now(); if (this.status.error !== 'write') this.status.error = ''; }
    if (mark > (this.marks[c] || 0)) this.marks[c] = mark;
    if (fromServer && !this.status.ready && COLS.every(x => this.status.synced[x])) this.status.ready = true;
    if (puts.length) this.persist(puts);
    if (changed) { this._dirty = true; this.ver = (this.ver || 0) + 1; }
    this.emit();
  }

  async persist(puts, dels) {
    try {
      await tx(this.db, 'docs', 'readwrite', s => { for (const [k, v] of puts || []) s.put(v, k); for (const k of dels || []) s.delete(k); });
      await this.saveKv();
    } catch (e) { console.warn('persist', e); }
  }
  saveKv() { return tx(this.db, 'kv', 'readwrite', s => s.put({ marks: this.marks, outbox: [...this.outbox.values()] }, 'state')); }

  apply(c, id, data, silent) {
    this.data[c].set(id, data);
    this._dirty = true; this.ver = (this.ver || 0) + 1;
    if (!silent) this.emit();
  }

  /* ---------- الحفظ: محلياً فوراً، ثم الخادم ---------- */
  async put(c, id, data, merge) {
    id = id || newId(c === 'parties' ? 'p' : c === 'items' ? 'i' : '');
    if (!merge) data = Object.assign({}, data, { id });
    const full = merge ? Object.assign({}, this.data[c].get(id), data) : data;
    const k = c + '/' + id;
    const prev = this.outbox.get(k);
    let send = data, sendMerge = !!merge;
    if (merge && prev) { if (prev.merge) send = Object.assign({}, prev.data, data); else { send = full; sendMerge = false; } }
    const o = { k, col: c, id, data: send, merge: sendMerge, t: Date.now() };
    this.outbox.set(k, o);
    this.apply(c, id, full);
    this.status.pending = this.outbox.size;
    await this.persist([[k, full]]);
    this.flush();
    return id;
  }

  async flush() {
    if (this.flushing || !this.outbox.size) return;
    this.flushing = true;
    try {
      for (const o of [...this.outbox.values()]) {
        try {
          await this.be.put(o.col, o.id, o.data, o.merge);
          if (this.outbox.get(o.k) === o) this.outbox.delete(o.k);
        } catch (e) {
          const code = e && e.code || '';
          if (code === 'permission-denied' && await this.be.exists(o.col, o.id).catch(() => false)) {
            this.outbox.delete(o.k);                         // موجود على الخادم بنسخة أحدث (مثلاً أُلغي): لا نعيد كتابته
          } else {
            this.status.error = code || 'write';
            if (code === 'permission-denied' || code === 'invalid-argument') { o.err = code; }
            break;
          }
        }
      }
    } finally {
      this.flushing = false;
      this.status.pending = this.outbox.size;
      await this.saveKv().catch(() => {});
      this.emit();
    }
  }

  /* ---------- القراءة ---------- */
  get accounts() {
    if (this._accV !== this.ver) {
      const m = new Map(DEFAULT_ACCOUNTS.map(a => [a.id, a]));
      for (const [id, a] of this.data.accounts) m.set(id, Object.assign({ id }, m.get(id) || {}, a));
      this._acc = m; this._accV = this.ver;
    }
    return this._acc;
  }
  get items() { return this.data.items; }
  get parties() { return this.data.parties; }
  get settings() { return this.data.meta.get('settings') || {}; }
  get vouchers() { return this.data.v; }

  /** الدفاتر المحسوبة (تُعاد عند أي تغيير فقط) */
  get L() {
    if (this._dirty || !this._L) {
      const t = performance.now();
      this._L = build({ items: this.items, parties: this.parties, accounts: this.accounts, vouchers: [...this.data.v.values()] });
      this._L.ms = Math.round(performance.now() - t);
      this._dirty = false;
    }
    return this._L;
  }

  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit() { if (this._emitT) return; this._emitT = setTimeout(() => { this._emitT = null; for (const f of this.subs) try { f(this); } catch (e) { console.error(e); } }, 30); }

  /* ---------- رقم الجهاز وترقيم السندات ---------- */
  async deviceCode() {
    if (this.dev && this.dev.code) return this.dev.code;
    const used = new Set([...this.data.meta.values()].filter(m => m.code && m.kind === 'dev').map(m => m.code));
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = [...letters].find(l => !used.has(l));
    if (!code) code = 'Z' + Math.floor(Math.random() * 90 + 10);
    const id = (this.dev && this.dev.id) || newId('d');
    this.dev = { id, code };
    saveDev(this.user.uid, this.dev);
    await this.put('meta', 'dev_' + id, { kind: 'dev', code, uid: this.user.uid, n: this.user.name, at: Date.now() });
    return code;
  }
  async nextNo(t) {
    const code = await this.deviceCode();
    let max = 0; const pre = code + '-';
    // سندات التجربة الملغاة بالتصفير لا تُحسب: الترقيم الفعلي يبدأ من 1
    for (const v of this.data.v.values()) if (v.t === t && v.no && v.no.startsWith(pre) && !(v.st === 'void' && v.vd && v.vd.reset)) { const n = parseInt(v.no.slice(pre.length), 10); if (n > max) max = n; }
    return pre + (max + 1);
  }

  /** حفظ سند جديد (مع رقمه وختم المستخدم) */
  async saveVoucher(v) {
    const id = v.id || newId('v');
    const doc = Object.assign({}, v, { id, st: 'ok', by: this.user.uid, bn: this.user.name, at: v.at || Date.now() });
    if (!doc.no) doc.no = await this.nextNo(v.t);
    await this.put('v', id, doc);
    return doc;
  }
  async voidVoucher(id, why) {
    await this.put('v', id, { st: 'void', vd: { by: this.user.uid, bn: this.user.name, at: Date.now(), why: why || '' } }, true);
  }
}

function splitKey(k) { const i = k.indexOf('/'); return [k.slice(0, i), k.slice(i + 1)]; }
function loadDev(uid) { try { return JSON.parse(localStorage.getItem('pharm.dev.' + uid) || 'null'); } catch (e) { return null; } }
function saveDev(uid, d) { try { localStorage.setItem('pharm.dev.' + uid, JSON.stringify(d)); } catch (e) {} }
