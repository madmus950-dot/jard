/* التعرّف عبر الإنترنت (اختياري): يرسل صورة العلبة إلى Gemini فيعيد الاسم والتركيز والشكل والعبوة والصلاحية.
   المفتاح يكتبه المستخدم في الإعدادات ويبقى على الجوال فقط. */

export const DEFAULT_MODEL = 'gemini-flash-latest';

const PROMPT = `You read photos of medicine packages (boxes, bottles, tubes, sachets, strips) for a pharmacy purchase order.
Read ONLY English/Latin text that is printed on the package. Never guess text that is not visible.
Return JSON with these keys (use "" or 0 when not visible):
- name: brand/trade name exactly as printed, including suffix words like Forte, Plus, Extra, XR, DS (no strength, no form)
- generic: active ingredient(s)
- strength: e.g. "500 mg", "250 mg/5 ml", "0.1 %", "1000 IU"
- form: e.g. "film-coated tablets", "capsules", "syrup", "suspension", "cream", "eye drops", "ampoules", "sachets", "effervescent granules"
- pack: number of units in the box (tablets/capsules/sachets/ampoules), integer
- packUnit: unit word for pack, e.g. "tablets"
- volume: e.g. "100 ml", "30 g"
- company: manufacturer name
- country: "made in" country
- exp: expiry date as MM/YYYY
- mfg: manufacturing date as MM/YYYY
- batch: batch / lot number
- barcode: digits under a barcode if readable
- confidence: 0..1 how sure you are about the name`;

export async function identify({ key, model, images, hint }) {
  if (!key) throw new Error('no-key');
  model = (model || DEFAULT_MODEL).trim();
  const parts = [{ text: PROMPT + (hint ? '\nThe local reader saw this text (may contain errors):\n' + String(hint).slice(0, 1500) : '') }];
  for (const b64 of images) parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
  const c = new AbortController(), t = setTimeout(() => c.abort(), 45000);
  let r;
  try {
    r = await fetch(url, {
      method: 'POST', signal: c.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } })
    });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timeout' : 'network'); }
  finally { clearTimeout(t); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || ('HTTP ' + r.status);
    const e = new Error(r.status === 400 && /API key/i.test(m) ? 'bad-key' : r.status === 404 ? 'bad-model' : r.status === 429 ? 'quota' : r.status === 403 ? 'denied' : m);
    e.detail = m; throw e;
  }
  const txt = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || '').join('');
  let out;
  try { out = JSON.parse(txt.replace(/^```(?:json)?|```$/g, '').trim()); } catch (e) { throw new Error('bad-reply'); }
  if (Array.isArray(out)) out = out[0] || {};
  return out;
}

export const AI_ERR = {
  'no-key': 'اكتب مفتاح Gemini في الإعدادات أولاً.',
  'bad-key': 'مفتاح Gemini غير صحيح. راجعه في الإعدادات.',
  'bad-model': 'اسم النموذج غير موجود. اكتب gemini-flash-latest في الإعدادات.',
  quota: 'انتهى الحد المجاني لهذه الدقيقة أو اليوم. انتظر قليلاً ثم أعد المحاولة.',
  denied: 'رفض Google الطلب من هذه الشبكة أو هذا المفتاح.',
  network: 'لا اتصال بالإنترنت.',
  timeout: 'تأخر الرد. أعد المحاولة.',
  'bad-reply': 'الرد غير مفهوم. أعد المحاولة بصورة أوضح.'
};
