/* خادم وهمي للتجربة على الحاسوب فقط (?mock=1). لا يُستعمل في التطبيق الحقيقي. */
export const kind = 'mock';
const db = { meta: new Map(), accounts: new Map(), parties: new Map(), items: new Map(), v: new Map() };
let clock = Date.now() - 1e9, user = null, authCb = null, listeners = [];
const tick = () => (clock += 1000);
export async function init() {
  const p = new URLSearchParams(location.search);
  if (p.get('demo')) {
    for (const [c, f] of [['items', 'items'], ['parties', 'parties']]) {
      const o = await (await fetch('demo/' + f + '.json')).json();
      for (const [id, d] of Object.entries(o)) db[c].set(id, { data: d, u: tick() });
    }
    const vs = await (await fetch('demo/vouchers.json')).json();
    for (const v of vs) db.v.set(v.id, { data: v, u: tick() });
    db.meta.set('settings', { data: { name: 'صيدلية التجربة', addr: 'التربة', ph: '' }, u: tick() });
  }
  if (p.get('user')) user = { uid: 'u_' + p.get('user'), email: p.get('user') + '@jard.local' };
}
export function onAuth(cb) { authCb = cb; setTimeout(() => cb(user), 10); return () => {}; }
const mockNet = () => { if (window.__mockOffline || localStorage.getItem('mockOffline')) { const e = new Error('offline'); e.code = 'auth/network-request-failed'; throw e; } };
export async function signIn(email, pw) { mockNet(); if (pw === 'bad') { const e = new Error('bad'); e.code = 'auth/invalid-credential'; throw e; } user = { uid: 'u_' + email.split('@')[0], email }; setTimeout(() => authCb && authCb(user), 0); return user; }
export async function signOut() { user = null; if (authCb) authCb(null); }
export async function getStaff(email) {
  if (window.__mockOffline || localStorage.getItem('mockOffline')) { const e = new Error('Failed to get document because the client is offline.'); e.code = 'unavailable'; throw e; }
  if (email.startsWith('cashier')) return { name: 'جوهر', role: 'counter', acc: 'cashier', active: true };
  return { name: 'مصطفى', role: 'admin', active: true };
}
export function listen(col, since, cb) {
  const l = { col, cb }; listeners.push(l);
  setTimeout(() => cb([...db[col]].filter(([, d]) => d.u > since).map(([id, d]) => ({ id, data: d.data, u: d.u })), true), 30);
  return () => { listeners = listeners.filter(x => x !== l); };
}
export async function put(col, id, data, merge) {
  if (window.__mockOffline || localStorage.getItem('mockOffline')) { const e = new Error('offline'); e.code = 'unavailable'; throw e; }
  const cur = db[col].get(id), d = merge && cur ? Object.assign({}, cur.data, data) : data, u = tick();
  db[col].set(id, { data: d, u });
  for (const l of listeners) if (l.col === col) setTimeout(() => l.cb([{ id, data: d, u }], true), 5);
}
export async function exists(col, id) { return db[col].has(id); }
export async function putMany(col, list, onProgress) { for (const x of list) await put(col, x.id, x.data); if (onProgress) onProgress(list.length, list.length); }
export async function loadArchive() { return null; }
export async function loadCount() { return []; }
const staff = new Map([['admin@jard.local', { name: 'مصطفى', role: 'admin', active: true }], ['123@jard.local', { name: 'جوهر', role: 'counter', active: true }]]);
export async function listStaff() { return [...staff].map(([id, d]) => Object.assign({ id }, d)); }
export async function setStaff(email, data) { staff.set(email, Object.assign({}, staff.get(email), data)); }
