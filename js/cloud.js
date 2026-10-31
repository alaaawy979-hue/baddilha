// الاتصال بـ Supabase بدون مكتبات: RPC عبر REST + قناة لحظية (Realtime Broadcast) بين الأجهزة.
import { CONFIG } from './config.js';

export const cloudReady = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseKey);

function headers() {
  const k = CONFIG.supabaseKey;
  const h = { apikey: k, 'Content-Type': 'application/json' };
  if (k.startsWith('ey')) h.Authorization = `Bearer ${k}`;
  return h;
}

export async function rpc(name, args = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    let r;
    try {
      r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: headers(), body: JSON.stringify(args), signal: ctrl.signal,
      });
    } catch {
      // انقطاع شبكة أو الخادم غير متاح — رسالة مفهومة بدل "Failed to fetch"
      throw Object.assign(new Error(navigator.onLine === false
        ? 'ما فيه إنترنت — بيتزامن تلقائيًا أول ما يرجع الاتصال'
        : 'تعذّر الاتصال بالسحابة — جرّب بعد شوي'), { network: true });
    }
    if (!r.ok) {
      const err = new Error(r.status >= 500 ? 'السحابة مشغولة — جرّب بعد شوي' : 'تعذّر تنفيذ الطلب');
      err.status = r.status;
      err.detail = await r.text().catch(() => '');
      throw err;
    }
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  } finally { clearTimeout(timer); }
}

export async function callFunction(name, body) {
  const r = await fetch(`${CONFIG.supabaseUrl}/functions/v1/${name}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `${name} ${r.status}`), { data });
  return data;
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// قناة لحظية: كل جهاز يرسل "تغيّر شي" فيسحب الباقون التحديثات فورًا.
export class Live {
  constructor(topic, { onPing, onState } = {}) {
    this.topic = `realtime:${topic}`;
    this.onPing = onPing || (() => {});
    this.onState = onState || (() => {});
    this.ref = 0;
    this.retry = 0;
    this.closed = false;
    this.joined = false;
  }

  connect() {
    if (!cloudReady() || this.closed) return;
    if (this.ws && this.ws.readyState <= 1) return;
    const url = CONFIG.supabaseUrl.replace(/^http/, 'ws') +
      `/realtime/v1/websocket?apikey=${encodeURIComponent(CONFIG.supabaseKey)}&vsn=1.0.0`;
    let ws;
    try { ws = new WebSocket(url); } catch { return this.schedule(); }
    this.ws = ws;
    this.joinRef = String(++this.ref);
    ws.onopen = () => {
      this.send({
        topic: this.topic, event: 'phx_join', ref: this.joinRef, join_ref: this.joinRef,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, postgres_changes: [], private: false } },
      });
      clearInterval(this.hb);
      this.hb = setInterval(() => this.send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) }), 25000);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.event === 'phx_reply' && m.ref === this.joinRef) {
        this.joined = m.payload?.status === 'ok';
        if (this.joined) { this.retry = 0; this.onState(true); }
      } else if (m.event === 'broadcast' && m.payload?.event === 'changed') {
        this.onPing(m.payload.payload || {});
      } else if (m.event === 'phx_error' || m.event === 'phx_close') {
        try { ws.close(); } catch {}
      }
    };
    ws.onclose = () => {
      clearInterval(this.hb);
      this.joined = false;
      this.onState(false);
      this.schedule();
    };
    ws.onerror = () => {};
  }

  schedule() {
    if (this.closed) return;
    clearTimeout(this.rt);
    const wait = Math.min(30000, 1000 * 2 ** this.retry++);
    this.rt = setTimeout(() => this.connect(), wait);
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  ping(payload = {}) {
    if (!this.joined) return;
    this.send({
      topic: this.topic, event: 'broadcast', ref: String(++this.ref), join_ref: this.joinRef,
      payload: { type: 'broadcast', event: 'changed', payload },
    });
  }

  wake() {
    if (!this.ws || this.ws.readyState > 1) { this.retry = 0; this.connect(); }
  }

  close() {
    this.closed = true;
    clearInterval(this.hb); clearTimeout(this.rt);
    try { this.ws?.close(); } catch {}
  }
}
