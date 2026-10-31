// بدّلها — مُرسل التنبيهات. يستدعيه pg_cron كل ساعة، ويرسل تنبيه "تجربة" عند الطلب.
import { sendPush } from '../_shared/webpush.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] as string;
const VAPID = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
  subject: Deno.env.get('VAPID_SUBJECT') || 'mailto:baddilha@example.com',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('ey')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${name}: ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

type Due = { name: string; emoji: string | null; next: string; days: number };

function when(days: number) {
  if (days === 0) return 'اليوم';
  if (days === 1) return 'غدًا';
  if (days === 2) return 'بعد يومين';
  if (days > 2 && days <= 10) return `بعد ${days} أيام`;
  if (days > 10) return `بعد ${days} يومًا`;
  const o = -days;
  if (o === 1) return 'متأخر يوم';
  if (o === 2) return 'متأخر يومين';
  return o <= 10 ? `متأخر ${o} أيام` : `متأخر ${o} يومًا`;
}

function compose(items: Due[]) {
  const line = (i: Due) => `${i.emoji || '🔁'} ${i.name} — ${when(i.days)}`;
  if (items.length === 1) {
    const i = items[0];
    const title = i.days <= 0 ? `🔔 حان وقت تغيير ${i.name}` : `⏳ اقترب موعد تغيير ${i.name}`;
    const body = i.days < 0 ? `${when(i.days)} — لا تنسَ تغييره` : i.days === 0 ? 'موعد التغيير اليوم' : `موعد التغيير ${when(i.days)} (${i.next})`;
    return { title, body };
  }
  const urgent = items.filter((i) => i.days <= 0).length;
  const title = urgent ? `🔔 عندك ${items.length} تغييرات تحتاج انتباهك` : `⏳ ${items.length} تغييرات تقترب`;
  return { title, body: items.slice(0, 5).map(line).join('\n') + (items.length > 5 ? `\n+${items.length - 5} أخرى` : '') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));

    // تنبيه تجريبي لجهاز واحد
    if (body?.test && body?.sub?.endpoint) {
      const r = await sendPush(body.sub, {
        title: '✅ التنبيهات شغّالة',
        body: 'هكذا ستصلك تذكيرات مواعيد التغيير من بدّلها',
        tag: 'test',
      }, VAPID);
      return json({ test: true, ...r });
    }

    const batch: { endpoint: string; sub: any; items: Due[] }[] = (await rpc('notify_take')) || [];
    const gone: string[] = [];
    let sent = 0;
    await Promise.all(batch.map(async (b) => {
      const msg = compose(b.items);
      const r = await sendPush(b.sub, { ...msg, tag: 'due', badge: b.items.filter((i) => i.days <= 0).length }, VAPID)
        .catch((e) => ({ ok: false, gone: false, status: 0, text: String(e) }));
      if (r.ok) sent++;
      if (r.gone) gone.push(b.endpoint);
      if (!r.ok) console.log('push failed', r.status, r.text);
    }));
    if (gone.length) await rpc('push_drop', { p_endpoints: gone });
    return json({ checked: batch.length, sent, dropped: gone.length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
