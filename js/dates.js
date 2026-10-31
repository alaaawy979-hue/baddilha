// حسابات التواريخ — كل التواريخ نصوص محلية "YYYY-MM-DD" لتفادي مشاكل المناطق الزمنية.

const pad = (n) => String(n).padStart(2, '0');

export function parse(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

export const fmt = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;

export function today() {
  const n = new Date();
  return fmt({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() });
}

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const utc = (s) => { const p = parse(s); return Date.UTC(p.y, p.m - 1, p.d); };

export function addMonths(s, months) {
  const p = parse(s);
  const total = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(total / 12), m = (total % 12) + 1;
  return fmt({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

export function addDays(s, days) {
  const t = new Date(utc(s) + days * 86400000);
  return fmt({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

// every = { n, unit: 'd' | 'w' | 'm' | 'y' }
export function addInterval(s, every) {
  const n = Math.max(1, Math.round(+every.n || 1));
  switch (every.unit) {
    case 'd': return addDays(s, n);
    case 'w': return addDays(s, n * 7);
    case 'y': return addMonths(s, n * 12);
    default: return addMonths(s, n);
  }
}

export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);

// المدة بين تاريخين مفصّلة: سنوات/أشهر/أيام (من الأقدم للأحدث)
export function breakdown(from, to) {
  let a = from, b = to, sign = 1;
  if (diffDays(a, b) < 0) { [a, b] = [b, a]; sign = -1; }
  let months = 0;
  const pa = parse(a), pb = parse(b);
  months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (months > 0 && diffDays(addMonths(a, months), b) < 0) months--;
  const days = diffDays(addMonths(a, months), b);
  return { sign, y: Math.floor(months / 12), m: months % 12, months, d: days, total: diffDays(from, to) };
}

// ===== صياغة عربية سليمة للأعداد =====
const WORDS = {
  y: ['سنة', 'سنتين', 'سنوات', 'سنة'],
  m: ['شهر', 'شهرين', 'أشهر', 'شهرًا'],
  d: ['يوم', 'يومين', 'أيام', 'يومًا'],
  w: ['أسبوع', 'أسبوعين', 'أسابيع', 'أسبوعًا'],
};

export function count(n, unit, num = String) {
  const [one, two, few, many] = WORDS[unit];
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${num(n)} ${few}`;
  return `${num(n)} ${many}`;
}

export function durationText({ y, m, d }, num = String) {
  const parts = [];
  if (y) parts.push(count(y, 'y', num));
  if (m) parts.push(count(m, 'm', num));
  if (d || !parts.length) parts.push(count(d, 'd', num));
  return parts.join(' و');
}

export function everyText(every, num = String) {
  const n = Math.max(1, Math.round(+every.n || 1));
  if (every.unit === 'm' && n % 12 === 0) return 'كل ' + count(n / 12, 'y', num);
  return 'كل ' + count(n, every.unit || 'm', num);
}

// وصف قصير للمتبقي: "اليوم"، "غدًا"، "بعد ٣ أشهر و٥ أيام"، "متأخر يومين"
export function relText(next, ref = today(), num = String) {
  const total = diffDays(ref, next);
  if (total === 0) return 'اليوم';
  if (total === 1) return 'غدًا';
  if (total === -1) return 'متأخر يوم';
  const b = breakdown(ref, next);
  return (total > 0 ? 'بعد ' : 'متأخر ') + durationText(b, num);
}

// حالة الإلحاح: overdue | today | soon (≤7) | near (≤30) | ok
export function urgency(days) {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7) return 'soon';
  if (days <= 30) return 'near';
  return 'ok';
}

// نسبة الوقت المنقضي بين آخر تغيير والموعد القادم (0..1)
export function progress(last, next, ref = today()) {
  const span = diffDays(last, next);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, diffDays(last, ref) / span));
}

// ===== عرض التاريخ =====
const cache = new Map();
function formatter(locale, opts) {
  const k = locale + JSON.stringify(opts);
  if (!cache.has(k)) {
    try { cache.set(k, new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts })); }
    catch { cache.set(k, new Intl.DateTimeFormat('ar', { timeZone: 'UTC', ...opts })); }
  }
  return cache.get(k);
}
const asDate = (s) => new Date(utc(s));

export function gregorian(s, digits = 'latn', style = 'long') {
  const opts = style === 'short' ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return formatter(`ar-u-nu-${digits}-ca-gregory`, opts).format(asDate(s));
}

export function hijri(s, digits = 'latn') {
  return formatter(`ar-SA-u-nu-${digits}-ca-islamic-umalqura`, { day: 'numeric', month: 'long', year: 'numeric' })
    .format(asDate(s));
}
