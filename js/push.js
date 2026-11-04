// تنبيهات Web Push — تعمل على الآيفون (iOS 16.4+) بعد إضافة التطبيق للشاشة الرئيسية، وعلى الكمبيوتر.
import { CONFIG } from './config.js';
import { cloudReady, rpc, callFunction } from './cloud.js';
import { getMeta, setNotifyTime } from './store.js';

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64uToBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  return 'جهاز';
}

// unsupported | needs-install | no-cloud | denied | off | on
export async function pushState() {
  if (!cloudReady() || !CONFIG.vapidPublicKey) return 'no-cloud';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('لم يتم السماح بالتنبيهات');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(CONFIG.vapidPublicKey) });
  }
  await rpc('push_subscribe', { p_key: getMeta().key, p_sub: sub.toJSON(), p_device: deviceName() });
  await setNotifyTime(getMeta().notifyHour ?? 9).catch(() => {});
  return sub;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await rpc('push_unsubscribe', { p_key: getMeta().key, p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

// يُحدّث الاشتراك بصمت عند كل فتح (قد يتغير عنوانه أو تتغير المساحة بعد الربط)
export async function refreshPush() {
  try {
    if ((await pushState()) !== 'on') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    await rpc('push_subscribe', { p_key: getMeta().key, p_sub: sub.toJSON(), p_device: deviceName() });
  } catch {}
}

export async function testPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) throw new Error('فعّل التنبيهات أولًا');
  const r = await callFunction('notify', { test: true, sub: sub.toJSON() });
  if (!r.ok) throw new Error('تعذّر الإرسال (' + r.status + ')');
}

// المستخدم ما يبي رقم على أيقونة التطبيق — نمسح أي رقم قديم
export async function clearBadge() {
  try { if ('clearAppBadge' in navigator) await navigator.clearAppBadge(); } catch {}
}
