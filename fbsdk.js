/* طبقة الاتصال بـ Firebase (Auth + Firestore). كل ما يخص Firebase في هذا الملف فقط. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let app = null, auth = null, fs = null;

export async function init(cfg){
  app = initializeApp(cfg);
  auth = getAuth(app);
  fs = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true
  });
}
export function onAuth(cb){ return onAuthStateChanged(auth, cb, () => cb(null)); }
export async function signIn(email, pw){ const r = await signInWithEmailAndPassword(auth, email, pw); return r.user; }
export async function signOut(){ await fbSignOut(auth); }

export async function getStaff(email){
  const s = await getDoc(doc(fs, 'staff', email));
  return s.exists() ? s.data() : null;
}
export async function listStaff(){
  const s = await getDocs(collection(fs, 'staff'));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* نفس الواجهة التي يستعملها التطبيق: collection(name).doc(id).set/delete و collection(name).onSnapshot */
export const db = {
  collection: name => ({
    doc: id => ({
      set: d => setDoc(doc(fs, name, id), JSON.parse(JSON.stringify(d))),
      delete: () => deleteDoc(doc(fs, name, id))
    }),
    onSnapshot: (cb, err) => onSnapshot(collection(fs, name), { includeMetadataChanges: true }, cb, err || (() => {}))
  })
};

/* قاعدة الأصناف: تُخزَّن في وثائق catalog/meta و catalog/p0..pN خلف تسجيل الدخول */
const PART_BYTES = 400000;
export async function loadCatalog(){
  const snap = await getDocs(collection(fs, 'catalog'));
  let meta = null; const parts = [];
  snap.forEach(d => {
    if (d.id === 'meta') meta = d.data();
    else if (/^p\d+$/.test(d.id)) parts[Number(d.id.slice(1))] = d.data().json;
  });
  if (!meta) return null;
  for (let i = 0; i < meta.n; i++) if (!parts[i]) throw new Error('catalog-incomplete');
  const it = [];
  for (let i = 0; i < meta.n; i++) { const rows = JSON.parse(parts[i]); for (const r of rows) it.push(r); }
  return { co: meta.co || [], un: meta.un || [], it };
}
export async function saveCatalog(obj, by){
  const enc = new TextEncoder(), parts = []; let cur = [], size = 2;
  for (const r of obj.it) {
    const n = enc.encode(JSON.stringify(r)).length + 1;
    if (cur.length && size + n > PART_BYTES) { parts.push(cur); cur = []; size = 2; }
    cur.push(r); size += n;
  }
  if (cur.length) parts.push(cur);
  const batch = writeBatch(fs);
  for (let i = 0; i < parts.length; i++) batch.set(doc(fs, 'catalog', 'p' + i), { i, json: JSON.stringify(parts[i]) });
  batch.set(doc(fs, 'catalog', 'meta'), { co: obj.co || [], un: obj.un || [], n: parts.length, count: obj.it.length, at: Date.now(), by: by || '' });
  const all = await getDocs(collection(fs, 'catalog'));
  for (const d of all.docs) if (/^p\d+$/.test(d.id) && Number(d.id.slice(1)) >= parts.length) batch.delete(d.ref);
  await batch.commit();
}
