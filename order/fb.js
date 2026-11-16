/* الاتصال بـ Firebase: الدخول + قراءة قاعدة الأصناف والموردين فقط. في نسخة التطبيق تُضمَّن المكتبة محلياً بدل gstatic. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, memoryLocalCache, collection, doc, getDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let app = null, auth = null, fs = null;

export async function init(cfg) {
  app = initializeApp(cfg);
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  // نسخة الجهاز يحفظها التطبيق نفسه (db.js) فيعمل بلا إنترنت
  fs = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
}
export const onAuth = cb => onAuthStateChanged(auth, cb, () => cb(null));
export async function signIn(email, pw) { return (await signInWithEmailAndPassword(auth, email, pw)).user; }
export async function signOut() { await fbSignOut(auth); }
export async function getStaff(email) { const s = await getDoc(doc(fs, 'staff', email)); return s.exists() ? s.data() : null; }

/** قاعدة الأصناف من تطبيق الجرد */
export async function loadCatalog() {
  const snap = await getDocs(collection(fs, 'catalog'));
  let meta = null; const parts = [];
  snap.forEach(d => { if (d.id === 'meta') meta = d.data(); else if (/^p\d+$/.test(d.id)) parts[+d.id.slice(1)] = d.data().json; });
  if (!meta) return null;
  for (let i = 0; i < meta.n; i++) if (!parts[i]) throw new Error('catalog-incomplete');
  const it = []; for (let i = 0; i < meta.n; i++) for (const r of JSON.parse(parts[i])) it.push(r);
  return { co: meta.co || [], un: meta.un || [], it, at: meta.at || 0 };
}
/** أصناف نظام الحسابات والموردون (لمن له صلاحية الحسابات فقط؛ غيره يكتفي بقاعدة الأصناف) */
export async function loadAcc() {
  const out = { items: [], parties: [] };
  try { const s = await getDocs(collection(fs, 'acc_items')); s.forEach(d => { const x = d.data(); if (x.act !== false) out.items.push(Object.assign({ id: d.id }, x)); }); } catch (e) { out.noItems = true; }
  try { const s = await getDocs(collection(fs, 'acc_parties')); s.forEach(d => { const x = d.data(); if (x.t === 's') out.parties.push({ id: d.id, n: x.n, ph: x.ph || '' }); }); } catch (e) { out.noParties = true; }
  return out;
}
