/* التخزين على الجوال (IndexedDB): الطلبيات، الصور، وقاعدة الأصناف والإعدادات. لا شيء من هذا يُرفع إلى الإنترنت. */
const NAME = 'order-app', VER = 1;
let dbp = null;
function open() {
  if (!dbp) dbp = new Promise((ok, no) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('orders')) d.createObjectStore('orders', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  return dbp;
}
function tx(store, mode, fn) {
  return open().then(d => new Promise((ok, no) => {
    const t = d.transaction(store, mode), r = fn(t.objectStore(store));
    t.oncomplete = () => ok(r instanceof IDBRequest ? r.result : undefined);
    t.onerror = () => no(t.error); t.onabort = () => no(t.error);
  }));
}

export const get = (k) => tx('kv', 'readonly', s => s.get(k));
export const set = (k, v) => tx('kv', 'readwrite', s => { s.put(v, k); });
export const del = (k) => tx('kv', 'readwrite', s => { s.delete(k); });

export const orders = () => tx('orders', 'readonly', s => s.getAll());
export const order = id => tx('orders', 'readonly', s => s.get(id));
export const saveOrder = o => { o.updated = Date.now(); return tx('orders', 'readwrite', s => { s.put(o); }); };
export async function deleteOrder(o) {
  const ids = [];
  for (const l of o.lines || []) for (const k of ['photo', 'photo2', 'photo3']) if (l[k]) ids.push(l[k]);
  await tx('photos', 'readwrite', s => { for (const id of ids) s.delete(id); });
  await tx('orders', 'readwrite', s => { s.delete(o.id); });
}

export const photo = id => tx('photos', 'readonly', s => s.get(id));
export async function putPhoto(blob) {
  const id = 'ph' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await tx('photos', 'readwrite', s => { s.put(blob, id); });
  return id;
}
export const delPhoto = id => tx('photos', 'readwrite', s => { s.delete(id); });

/** مساحة التخزين المستعملة (تقريبية) */
export async function usage() {
  try { const e = await navigator.storage.estimate(); return e.usage || 0; } catch (e) { return 0; }
}
export function persist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} }
