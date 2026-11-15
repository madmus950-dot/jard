/* الطباعة والمشاركة وحفظ الملفات: داخل تطبيق أندرويد عبر JardApp، وفي المتصفح بالطرق العادية. */
import { buildXlsx } from './xlsx.js';
const APP = () => window.JardApp || null;

function toB64(blob) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); }); }

export async function saveBlob(filename, blob) {
  const A = APP();
  if (A && A.saveFile) {
    const r = String(await A.saveFile(filename, blob.type || 'application/octet-stream', await toB64(blob)));
    if (r === 'cancel') return 'cancel';
    if (r !== 'ok') throw new Error(r);
    return 'app';
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'download';
}
export const saveXlsx = (filename, tables) => saveBlob(filename, buildXlsx(tables));

export async function shareText(text) {
  const A = APP();
  if (A && A.shareText) { const r = await A.shareText(text); return r || 'app'; }
  if (navigator.share) { try { await navigator.share({ text }); return 'share'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { return 'fail'; }
}

/**
 * يطبع HTML معيّناً فقط (الشاشة لا تتغير؛ قواعد الطباعة تُظهر #print وحده).
 * kind = 'receipt' للفواتير: على الكمبيوتر تذهب مباشرة إلى طابعة الإيصالات المختارة.
 */
export async function printHtml(html, title, kind) {
  const p = document.getElementById('print');
  p.innerHTML = html;
  p.className = kind === 'receipt' ? 'receipt' : 'page';
  const A = APP();
  if (A && A.print) { try { return await A.print(title || 'طباعة', kind || 'page'); } catch (e) { return 'fail'; } }
  window.print();
  return 'ok';
}
