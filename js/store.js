// المخزن: يعمل بدون إنترنت أولًا (localStorage)، ويزامن مع السحابة عند توفرها.
// قاعدة التعارض: آخر تعديل يفوز (updated)، والحذف "شاهد قبر" يُزامن أيضًا.
import * as D from './dates.js';
import { cloudReady, rpc, Live, sha256Hex } from './cloud.js';

const K = { items: 'bd.items.v1', meta: 'bd.meta.v1', prefs: 'bd.prefs.v1' };

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function randomKey(bytes = 18) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

const listeners = new Set();
const emit = (what) => listeners.forEach((fn) => fn(what));
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

const items = new Map(Object.entries(load(K.items, {})));
const meta = Object.assign({ key: null, rev: 0, dirty: {}, deviceId: null, readToken: null, tz: null, notifyHour: 9, lastSync: 0 }, load(K.meta, {}));
export const prefs = Object.assign({ theme: 'auto', digits: 'latn', remind: [7, 0] }, load(K.prefs, {}));

if (!meta.deviceId) meta.deviceId = randomKey(9);
if (!meta.key) meta.key = randomKey();
persist(K.meta, meta);

export const getMeta = () => meta;
export const savePrefs = () => { persist(K.prefs, prefs); emit('prefs'); };

function saveAll() {
  persist(K.items, Object.fromEntries(items));
  persist(K.meta, meta);
}

// ===== القراءة =====
export function get(id) {
  return sane(items.get(id));
}

// يصلح أي عنصر ناقص (مثلًا وصل تالفًا من جهاز آخر) بدل ما يكسر الشاشة كلها
function sane(i) {
  if (!i || i.deleted || !i.id) return null;
  if (!D.parse(i.last)) return null;
  const every = i.every && +i.every.n > 0 && 'dwmy'.includes(i.every.unit) ? i.every : { n: 1, unit: 'y' };
  const fixed = { ...i, name: String(i.name || 'بدون اسم'), every, remind: Array.isArray(i.remind) ? i.remind : [7, 0] };
  if (!D.parse(fixed.next)) fixed.next = D.addInterval(fixed.last, every);
  return fixed;
}

export function list() {
  return [...items.values()]
    .map(sane).filter(Boolean)
    .sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.name.localeCompare(b.name, 'ar')));
}

// الأماكن للتصفية: السطر الأول من خانة المكان فقط، وإذا كان قصيرًا
export const roomKey = (room) => String(room || '').split(/\r?\n/)[0].trim();
export function rooms() {
  return [...new Set(list().map((i) => roomKey(i.room)).filter((r) => r && r.length <= 24))];
}

// ===== الكتابة =====
function stamp(prev) {
  return Math.max(Date.now(), (prev?.updated || 0) + 1);
}

function commit(item) {
  items.set(item.id, item);
  meta.dirty[item.id] = item.updated;
  saveAll();
  emit('items');
  scheduleSync();
  return item;
}

export function computeNext(item) {
  return item.nextManual && item.next ? item.next : D.addInterval(item.last, item.every);
}

export function upsert(data) {
  const prev = data.id ? items.get(data.id) : null;
  const item = {
    id: data.id || uuid(),
    name: String(data.name || '').trim().slice(0, 80),
    emoji: data.emoji || '🔁',
    room: String(data.room || '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300),
    last: data.last || D.today(),
    every: { n: Math.max(1, Math.min(999, Math.round(+data.every?.n || 1))), unit: data.every?.unit || 'y' },
    nextManual: !!data.nextManual,
    next: data.next || null,
    remind: [...new Set((data.remind || prefs.remind).map(Number))].sort((a, b) => b - a),
    notes: String(data.notes || '').slice(0, 1000),
    history: data.history || prev?.history || [],
    created: prev?.created || Date.now(),
    deleted: false,
  };
  item.next = computeNext(item);
  item.updated = stamp(prev);
  return commit(item);
}

// تم التغيير: ينقل التاريخ الحالي للسجل ويبدأ دورة جديدة
export function markDone(id, date = D.today()) {
  const prev = items.get(id);
  if (!prev) return null;
  const history = [prev.last, ...(prev.history || [])].filter((d, i, a) => d && a.indexOf(d) === i).slice(0, 50);
  const item = { ...prev, last: date, history, nextManual: false };
  item.next = computeNext(item);
  item.updated = stamp(prev);
  return commit(item);
}

export function remove(id) {
  const prev = items.get(id);
  if (!prev) return;
  commit({ ...prev, deleted: true, updated: stamp(prev) });
}

// للتراجع: يعيد نسخة سابقة كما هي (بطابع زمني جديد)
export function restore(snapshot) {
  const cur = items.get(snapshot.id);
  commit({ ...snapshot, updated: stamp(cur) });
}

export function exportData() {
  return { app: 'baddilha', version: 1, exported: new Date().toISOString(), items: list() };
}

export function importData(obj) {
  const arr = Array.isArray(obj) ? obj : obj?.items;
  if (!Array.isArray(arr)) throw new Error('ملف غير صالح');
  let n = 0;
  for (const raw of arr) {
    if (!raw?.name || !D.parse(raw.last)) continue;
    const cur = raw.id && items.get(raw.id);
    if (cur && cur.updated >= (raw.updated || 0) && !cur.deleted) continue;
    upsert({ ...raw, id: raw.id || uuid() });
    n++;
  }
  return n;
}

// ===== المزامنة =====
let syncing = false, again = false, timer = null, live = null;
export const status = { state: cloudReady() ? 'idle' : 'local', online: false, error: '' };

function setStatus(state, error = '') {
  status.state = state; status.error = error;
  emit('status');
}

export function scheduleSync(delay = 400) {
  clearTimeout(timer);
  timer = setTimeout(sync, delay);
}

export async function sync() {
  if (!cloudReady()) return setStatus('local');
  if (syncing) { again = true; return; }
  syncing = true;
  setStatus('syncing');
  let pushed = false, pulled = 0;
  try {
    if (!meta.readToken) {
      const s = await rpc('space_open', { p_key: meta.key });
      meta.readToken = s.read_token; meta.tz = s.tz; meta.notifyHour = s.notify_hour;
    }
    const ids = Object.keys(meta.dirty);
    if (ids.length) {
      const rows = ids.map((id) => items.get(id)).filter(Boolean).map((i) => {
        const { updated, deleted, ...data } = i;
        return { id: i.id, data, updated, deleted: !!deleted };
      });
      for (let i = 0; i < rows.length; i += 300) {
        await rpc('items_push', { p_key: meta.key, p_items: rows.slice(i, i + 300) });
      }
      for (const id of ids) if (meta.dirty[id] === items.get(id)?.updated) delete meta.dirty[id];
      pushed = true;
    }
    const res = await rpc('items_pull', { p_key: meta.key, p_since: meta.rev || 0 });
    // السحابة رجعت أقدم مما شفناه = انمسحت أو انعادت من الصفر: نرفع كل ما عندنا من جديد
    if ((res.rev || 0) < (meta.rev || 0)) {
      console.warn('cloud was reset — re-uploading local items');
      meta.rev = 0;
      meta.readToken = null;
      for (const it of items.values()) meta.dirty[it.id] = it.updated;
      saveAll();
      again = true;
      setStatus('syncing');
      return;
    }
    for (const r of res.items || []) {
      const local = items.get(r.id);
      if (local && local.updated > r.updated) continue;
      items.set(r.id, { ...r.data, id: r.id, updated: r.updated, deleted: !!r.deleted });
      pulled++;
    }
    meta.rev = Math.max(meta.rev || 0, res.rev || 0);
    meta.lastSync = Date.now();
    saveAll();
    if (pulled) emit('items');
    if (pushed) live?.ping({ from: meta.deviceId });
    setStatus('ok');
  } catch (e) {
    console.warn('sync failed', e);
    setStatus(navigator.onLine === false ? 'offline' : 'error', e.message);
  } finally {
    syncing = false;
    if (again) { again = false; scheduleSync(200); }
  }
}

export async function startLive() {
  if (!cloudReady()) return;
  live?.close();
  const topic = 'bd-' + (await sha256Hex(meta.key + ':rt')).slice(0, 32);
  live = new Live(topic, {
    onPing: () => scheduleSync(150),
    onState: (on) => { status.online = on; emit('status'); if (on) scheduleSync(100); },
  });
  live.connect();
}

export function wake() {
  live?.wake();
  scheduleSync(50);
}

// ===== ربط الأجهزة =====
export async function createPairCode() {
  await sync();
  return rpc('pair_create', { p_key: meta.key });
}

// يربط هذا الجهاز بمساحة جهاز آخر. merge=true يرفع عناصر هذا الجهاز للمساحة الجديدة.
export async function joinWithCode(code, merge) {
  const key = await rpc('pair_claim', { p_code: code });
  if (!key) throw new Error('الرمز غير صحيح أو انتهت صلاحيته');
  if (key === meta.key) return 'same';
  meta.key = key; meta.rev = 0; meta.readToken = null; meta.dirty = {};
  if (merge) {
    for (const it of items.values()) if (!it.deleted) meta.dirty[it.id] = it.updated;
  } else {
    items.clear();
  }
  saveAll();
  emit('items');
  await startLive();
  await sync();
  return 'joined';
}

export async function setNotifyTime(hour) {
  meta.notifyHour = hour;
  persist(K.meta, meta);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Riyadh';
  await rpc('space_settings', { p_key: meta.key, p_tz: tz, p_hour: hour });
}
