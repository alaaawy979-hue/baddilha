// بدّلها — رابط تقويم (iCal) للقراءة فقط: يشترك فيه تقويم الآيفون/الكمبيوتر فتظهر المواعيد مع التنبيهات.
// GET /functions/v1/feed?t=<read_token>
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] as string;

type Item = { id: string; name: string; emoji?: string; room?: string; last?: string; next: string; remind?: number[]; notes?: string };

const enc = new TextEncoder();

function esc(s: string) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// طيّ الأسطر عند 75 بايت دون كسر الحروف العربية
function fold(line: string) {
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const ymd = (s: string) => s.replace(/-/g, '');
function addDay(s: string) {
  const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// تنبيه الساعة 9 صباحًا قبل الموعد بعدد أيام
function trigger(days: number) {
  const hours = days * 24 - 9;
  return hours <= 0 ? `PT${-hours}H` : `-PT${hours}H`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  if (!/^[a-f0-9]{36}$/.test(token)) return new Response('not found', { status: 404 });

  const headers: Record<string, string> = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  if (SERVICE_KEY.startsWith('ey')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/widget_items`, { method: 'POST', headers, body: JSON.stringify({ p_token: token }) });
  if (!r.ok) return new Response('error', { status: 502 });
  const items: Item[] = await r.json();

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baddilha//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:بدّلها — مواعيد التغيير', 'X-WR-TIMEZONE:Asia/Riyadh',
    'REFRESH-INTERVAL;VALUE=DURATION:PT4H', 'X-PUBLISHED-TTL:PT4H',
  ];
  for (const it of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.next)) continue;
    const desc = [it.room ? `المكان: ${it.room}` : '', it.last ? `آخر تغيير: ${it.last}` : '', it.notes || ''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${it.id}@baddilha`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(it.next)}`, `DTEND;VALUE=DATE:${ymd(addDay(it.next))}`,
      `SUMMARY:${esc(`${it.emoji || '🔁'} تغيير ${it.name}`)}`, 'TRANSP:TRANSPARENT');
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    const reminders = Array.isArray(it.remind) && it.remind.length ? it.remind : [7, 0];
    for (const d of reminders.slice(0, 4)) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`تغيير ${it.name}`)}`, `TRIGGER:${trigger(d)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'max-age=900' },
  });
});
