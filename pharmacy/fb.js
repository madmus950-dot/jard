/* الاتصال بـ Firebase: الدخول + Firestore. في نسخة التطبيق تُضمَّن المكتبة محلياً بدل gstatic. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, memoryLocalCache, collection, doc, setDoc, getDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp, Timestamp, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const kind = 'firebase';
const NAMES = { meta: 'acc_meta', accounts: 'acc_accounts', parties: 'acc_parties', items: 'acc_items', v: 'acc_v' };
let app = null, auth = null, fs = null;

export async function init(cfg) {
  app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // نسخة الجهاز يديرها التطبيق نفسه (store.js)، فلا حاجة لنسخة ثانية داخل Firestore
  fs = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
}
export const onAuth = cb => onAuthStateChanged(auth, cb, () => cb(null));
export async function signIn(email, pw) { return (await signInWithEmailAndPassword(auth, email, pw)).user; }
export async function signOut() { await fbSignOut(auth); }
export async function getStaff(email) { const s = await getDoc(doc(fs, 'staff', email)); return s.exists() ? s.data() : null; }

/** يجلب ما تغيّر بعد since (ملّي ثانية من وقت الخادم) ثم يتابع كل جديد */
export function listen(col, since, cb, onErr) {
  const q = query(collection(fs, NAMES[col]), where('u_', '>', Timestamp.fromMillis(since)), orderBy('u_'));
  return onSnapshot(q, { includeMetadataChanges: false }, snap => {
    const docs = [];
    snap.docChanges().forEach(ch => {
      if (ch.type === 'removed') return;
      const d = ch.doc.data({ serverTimestamps: 'estimate' });
      const u = d.u_ && d.u_.toMillis ? d.u_.toMillis() : 0; delete d.u_;
      docs.push({ id: ch.doc.id, data: d, u: ch.doc.metadata.hasPendingWrites ? 0 : u });
    });
    cb(docs, !snap.metadata.fromCache);
  }, e => onErr && onErr(e));
}
export async function put(col, id, data, merge) {
  const d = Object.assign({}, data, { u_: serverTimestamp() });
  await setDoc(doc(fs, NAMES[col], id), d, merge ? { merge: true } : {});
}
export async function exists(col, id) { const s = await getDoc(doc(fs, NAMES[col], id)); return s.exists(); }
export async function putMany(col, list, onProgress) {
  for (let i = 0; i < list.length; i += 400) {
    const b = writeBatch(fs);
    for (const x of list.slice(i, i + 400)) b.set(doc(fs, NAMES[col], x.id), Object.assign({}, x.data, { u_: serverTimestamp() }));
    await b.commit();
    if (onProgress) onProgress(Math.min(list.length, i + 400), list.length);
  }
}
/** أرشيف الأصناف من تطبيق الجرد (catalog) — للقراءة فقط */
export async function loadArchive() {
  const snap = await getDocs(collection(fs, 'catalog'));
  let meta = null; const parts = [];
  snap.forEach(d => { if (d.id === 'meta') meta = d.data(); else if (/^p\d+$/.test(d.id)) parts[+d.id.slice(1)] = d.data().json; });
  if (!meta) return null;
  const it = []; for (let i = 0; i < meta.n; i++) if (parts[i]) for (const r of JSON.parse(parts[i])) it.push(r);
  return { co: meta.co || [], un: meta.un || [], it };
}
/** نتائج الجرد من تطبيق الجرد — للقراءة فقط */
export async function loadCount() { const s = await getDocs(collection(fs, 'count')); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
/** المستخدمون (للمشرف): قراءة staff وتعديل صلاحية الحسابات */
export async function listStaff() { const s = await getDocs(collection(fs, 'staff')); return s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
export async function setStaff(email, data) { await setDoc(doc(fs, 'staff', email), data, { merge: true }); }
