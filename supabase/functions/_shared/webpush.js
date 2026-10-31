// Web Push بدون مكتبات: تشفير RFC 8291 (aes128gcm) + توقيع VAPID (RFC 8292).
// يعمل في Deno (Supabase Edge Functions) وفي Node 20+ (للاختبار).

const enc = new TextEncoder();

export function b64uEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

// يولّد مفاتيح VAPID: العام (لـ applicationServerKey) والخاص (JWK مُختصر: d,x,y)
export async function generateVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { publicKey: b64uEncode(raw), privateKey: `${jwk.d}.${jwk.x}.${jwk.y}` };
}

async function vapidAuth(endpoint, vapid) {
  const [d, x, y] = vapid.privateKey.split('.');
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d, x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: vapid.subject || 'mailto:admin@example.com',
  })));
  const unsigned = `${header}.${claims}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
}

// يشفّر الرسالة لاشتراك واحد ويعيد جسم الطلب (aes128gcm)
export async function encryptPayload(subscription, payload) {
  const uaPublic = b64uDecode(subscription.keys.p256dh);
  const authSecret = b64uDecode(subscription.keys.auth);
  const plain = typeof payload === 'string' ? enc.encode(payload) : payload;

  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = (await hmac(prkKey, concat(keyInfo, new Uint8Array([1])))).slice(0, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, enc.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, enc.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);

  const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const record = concat(plain, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, record));

  const rs = 4096;
  const header = concat(salt, new Uint8Array([(rs >>> 24) & 255, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255]),
    new Uint8Array([asPublic.length]), asPublic);
  return concat(header, cipher);
}

// يرسل تنبيهًا. يعيد { ok, status, gone } — gone=true يعني الاشتراك انتهى ويجب حذفه
export async function sendPush(subscription, payload, vapid, { ttl = 86400, urgency = 'high', topic } = {}) {
  const body = await encryptPayload(subscription, JSON.stringify(payload));
  const headers = {
    'Authorization': await vapidAuth(subscription.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'TTL': String(ttl),
    'Urgency': urgency,
  };
  if (topic) headers['Topic'] = topic;
  const res = await fetch(subscription.endpoint, { method: 'POST', headers, body });
  const text = res.ok ? '' : await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410, text: text.slice(0, 300) };
}
