import * as D from './dates.js';
import * as S from './store.js';
import { CONFIG, VERSION } from './config.js';
import { cloudReady } from './cloud.js';
import { EMOJIS, REMIND_OPTIONS } from './templates.js';
import * as P from './push.js';

// ===== أيقونات =====
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  gear: I('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  check: I('<path d="M20 6 9 17l-5-5"/>'),
  edit: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: I('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  cal: I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  bell: I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  search: I('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  x: I('<path d="M18 6 6 18M6 6l12 12"/>'),
  sync: I('<path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7l3-2.7"/><path d="M16 16h5v5"/>'),
  copy: I('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  down: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>'),
  up: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>'),
  clock: I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
};

// ===== أدوات =====
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmts = {};
const num = (n) => (fmts[S.prefs.digits] ||= new Intl.NumberFormat(S.prefs.digits === 'arab' ? 'ar-u-nu-arab' : 'en-US', { useGrouping: false })).format(n);
// يحدّث العنصر فقط إذا تغيّر محتواه — يمنع إعادة الحركات والوميض مع كل حرف بحث أو مزامنة
function setHTML(el, html) {
  if (el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}
const greg = (s, style) => D.gregorian(s, S.prefs.digits, style);
const hij = (s) => D.hijri(s, S.prefs.digits);
const rel = (next) => D.relText(next, D.today(), num);
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch {} };

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { action.run(); t.classList.remove('show'); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

function download(name, text, type) {
  // داخل تطبيق الآيفون المثبّت لا تعمل التنزيلات — نفتح الملف فيعرض iOS خيار الإضافة
  if (P.isIOS() && type === 'text/calendar') {
    window.open(`data:text/calendar;charset=utf-8,${encodeURIComponent(text)}`, '_blank');
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const view = { filter: 'all', room: '', q: '' };
// التنبيهات والمزامنة تحتاج السحابة — بدونها لا نَعِد بها في النصوص
const PUSH = cloudReady() && !!CONFIG.vapidPublicKey;

function decorate(it) {
  const days = D.diffDays(D.today(), it.next);
  return { ...it, days, u: D.urgency(days), prog: D.progress(it.last, it.next) };
}

function unitLabel(days) {
  const a = Math.abs(days);
  if (a === 1) return days < 0 ? 'يوم تأخير' : 'يوم';
  if (a === 2) return days < 0 ? 'يومين تأخير' : 'يومين';
  return days < 0 ? 'تأخير' : (a >= 3 && a <= 10 ? 'أيام' : 'يومًا');
}

// ===== الرسم =====
function render() {
  const today = D.today();
  $('#todayLabel').textContent = `${greg(today)} · ${hij(today)}`;

  const all = S.list().map(decorate);
  const rooms = S.rooms();
  if (view.room && !rooms.includes(view.room)) view.room = '';
  const counts = {
    all: all.length,
    overdue: all.filter((i) => i.days <= 0).length,
    week: all.filter((i) => i.days >= 0 && i.days <= 7).length,
    month: all.filter((i) => i.days >= 0 && i.days <= 30).length,
  };
  P.setBadge(counts.overdue);

  renderHero(all);

  const stats = [
    ['all', 'الكل'], ['overdue', 'حان وقتها'], ['week', 'خلال أسبوع'], ['month', 'خلال شهر'],
  ];
  setHTML($('#stats'), all.length ? stats.map(([f, l]) =>
    `<button class="stat" role="tab" data-f="${f}" aria-selected="${view.filter === f}"><b>${num(counts[f])}</b><span>${l}</span></button>`).join('') : '');

  setHTML($('#rooms'), rooms.length > 1 ? [['', 'كل الأماكن'], ...rooms.map((r) => [r, r])].map(([v, l]) =>
    `<button class="chip" data-room="${esc(v)}" aria-pressed="${view.room === v}">${esc(l)}</button>`).join('') : '');
  $('.toolbar').hidden = !all.length;

  const q = view.q.trim().toLowerCase();
  const shown = all.filter((i) =>
    (view.filter === 'all' || (view.filter === 'overdue' && i.days <= 0) ||
      (view.filter === 'week' && i.days >= 0 && i.days <= 7) || (view.filter === 'month' && i.days >= 0 && i.days <= 30)) &&
    (!view.room || S.roomKey(i.room) === view.room) &&
    (!q || `${i.name} ${i.room} ${i.notes}`.toLowerCase().includes(q)));

  const list = $('#list');
  const first = !list._html;
  setHTML(list, shown.map((i, n) => `
    <button class="card u-${i.u}" data-id="${i.id}" style="--i:${Math.min(n, 12)}">
      <div class="card-top">
        <div class="emoji">${esc(i.emoji)}</div>
        <div class="meta">
          <h3>${esc(i.name)}</h3>
          ${i.room ? `<span class="sub">${esc(i.room)}</span>` : ''}
        </div>
        <div class="days"><b>${i.days === 0 ? '!' : num(Math.abs(i.days))}</b><small>${i.days === 0 ? 'اليوم' : unitLabel(i.days)}</small></div>
      </div>
      <div class="bar"><i style="width:${Math.round(i.prog * 100)}%"></i></div>
      <div class="facts">
        <div><span>آخر تغيير</span><b>${esc(greg(i.last, 'short'))}</b></div>
        <div><span>المدة</span><b>${esc(D.everyText(i.every, num))}</b></div>
        <div><span>موعد التغيير</span><b>${esc(greg(i.next, 'short'))}</b><em>${esc(rel(i.next))}</em></div>
      </div>
    </button>`).join(''));
  list.classList.toggle('calm', !first);

  const empty = $('#empty');
  if (!all.length) {
    empty.hidden = false;
    empty.innerHTML = `
      <div class="empty">
        <div class="art">🔁</div>
        <h2>ولا شي يحتاج تغيير… للحين</h2>
        <p>أضف أي شي تغيّره كل فترة — فلتر، بطارية، مخدات، زيت السيارة — وبدّلها يحسب لك موعد التغيير ويذكّرك قبله.</p>
        <button class="btn primary" data-act="add">${ICON.plus} أضف أول شي</button>
        ${cloudReady() ? `<p style="margin-top:22px">عندك بياناتك على جهاز ثاني؟ <button class="link-btn" data-act="join">اربط هذا الجهاز</button></p>` : ''}
      </div>`;
  } else if (!shown.length) {
    empty.hidden = false;
    empty.innerHTML = `<div class="empty"><div class="art">🔎</div><p>لا توجد نتائج مطابقة</p></div>`;
  } else {
    empty.hidden = true;
  }
  renderBanner(all.length);
}

function renderHero(all) {
  const hero = $('#hero');
  const it = all[0];
  if (!it) { setHTML(hero, ''); return; }
  const C = 2 * Math.PI * 54;
  const label = it.days < 0 ? 'أقرب تغيير — متأخر' : it.days === 0 ? 'موعد التغيير اليوم' : 'أقرب تغيير';
  const changed = setHTML(hero, `
    <div class="hero u-${it.u}" style="--u:var(--${it.u})" data-id="${it.id}">
      <div class="ring">
        <svg viewBox="0 0 120 120"><circle class="track" cx="60" cy="60" r="54" fill="none" stroke-width="9"/>
          <circle class="val" cx="60" cy="60" r="54" fill="none" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - it.prog)}"/></svg>
        <div class="ring-center"><b>${it.days === 0 ? 'اليوم' : num(Math.abs(it.days))}</b><small>${it.days === 0 ? '' : unitLabel(it.days)}</small></div>
      </div>
      <div>
        <div class="kicker">${ICON.clock.replace('<svg', '<svg width="14" height="14"')} ${label}</div>
        <h2>${esc(it.emoji)} ${esc(it.name)}</h2>
        <div class="rel">${esc(rel(it.next))}</div>
        <div class="dates">${esc(greg(it.next))}<br>${esc(hij(it.next))}</div>
        <div class="hero-actions">
          <button class="btn primary small" data-done="${it.id}">${ICON.check} تم التغيير</button>
          <button class="btn small" data-open="${it.id}">التفاصيل</button>
        </div>
      </div>
    </div>`);
  if (!changed) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const v = hero.querySelector('.val'); if (v) v.style.strokeDashoffset = v.dataset.off;
  }));
}

let bannerDismissed = (() => { try { return JSON.parse(sessionStorage.getItem('bd.banner') || '{}'); } catch { return {}; } })();
async function renderBanner(count) {
  const box = $('#banner');
  let html = '';
  if (!P.isStandalone() && !bannerDismissed.install) {
    const ios = P.isIOS();
    html = `<div class="banner" data-b="install"><span style="font-size:1.4rem">📲</span><div class="grow"><b>ثبّت بدّلها كتطبيق</b><br>${ios
      ? (PUSH ? 'التنبيهات على الآيفون تشتغل من التطبيق المثبّت فقط، ' : 'افتحه دايم من الأيقونة — ') + 'وما تضيفه هنا في Safari يبقى في Safari.'
      : 'يصير له أيقونة ويشتغل بدون إنترنت' + (PUSH ? ' وتوصلك التنبيهات.' : '.')}</div><button class="btn primary small" data-act="install">طريقة التثبيت</button><button class="x" aria-label="إخفاء">×</button></div>`;
  } else if (count && !bannerDismissed.push && (await P.pushState()) === 'off') {
    html = `<div class="banner" data-b="push"><span style="font-size:1.4rem">🔔</span><div class="grow"><b>فعّل التنبيهات</b> عشان يذكّرك قبل موعد التغيير حتى لو التطبيق مقفل.</div><button class="btn primary small" data-act="enable-push">تفعيل</button><button class="x" aria-label="إخفاء">×</button></div>`;
  }
  setHTML(box, html);
}

// ===== النافذة =====
let onSheetClose = null;
function openSheet(html, mount) {
  const wrap = $('#sheet');
  $('#sheetBody').innerHTML = html;
  wrap.hidden = false;
  document.body.style.overflow = 'hidden';
  $('.sheet', wrap).scrollTop = 0;
  mount?.($('#sheetBody'));
}
function closeSheet() {
  $('#sheet').hidden = true;
  document.body.style.overflow = '';
  onSheetClose?.(); onSheetClose = null;
}
const head = (title) => `<div class="sheet-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="إغلاق">${ICON.x}</button></div>`;

// ===== إضافة / تعديل =====
const BIG = [{ n: 1, unit: 'y', l: 'سنة' }, { n: 2, unit: 'y', l: 'سنتين' }, { n: 3, unit: 'y', l: '3 سنوات' }];
const SMALL = [{ n: 1, unit: 'm', l: 'شهر' }, { n: 3, unit: 'm', l: '3 أشهر' }, { n: 6, unit: 'm', l: '6 أشهر' }, { custom: true, l: 'مدة أخرى' }];
const same = (a, b) => a && b && +a.n === +b.n && a.unit === b.unit;

function openEditor(src = {}) {
  const editing = !!src.id;
  const st = {
    id: src.id, name: src.name || '', emoji: src.emoji || '🔁', room: src.room || '',
    last: src.last || D.today(), every: src.every ? { ...src.every } : { n: 1, unit: 'y' },
    nextManual: !!src.nextManual, next: src.next || '', remind: [...(src.remind || S.prefs.remind)], notes: src.notes || '',
    history: src.history,
  };
  let custom = !BIG.concat(SMALL).some((o) => same(o, st.every));

  openSheet(`
    ${head(editing ? 'تعديل' : 'إضافة شي جديد')}
    <form id="ed" autocomplete="off">
      <div class="field">
        <label for="f-name">وش الشي اللي تغيّره؟</label>
        <div class="row">
          <button type="button" class="emoji-btn" id="f-emoji" aria-label="اختر رمزًا">${esc(st.emoji)}</button>
          <input class="input grow" id="f-name" required maxlength="80" placeholder="مثال: فلتر الماء" value="${esc(st.name)}">
        </div>
        <div id="emojiGrid" class="emoji-grid" hidden>${EMOJIS.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="f-room">المكان (اختياري)</label>
        <textarea class="input" id="f-room" rows="2" maxlength="300" placeholder="المطبخ، السيارة… (تقدر تنزل سطر)">${esc(st.room)}</textarea>
      </div>
      <div class="field">
        <label for="f-last">متى غيّرته آخر مرة؟</label>
        <input class="input" id="f-last" type="date" required value="${st.last}" max="${D.addInterval(D.today(), { n: 1, unit: 'y' })}">
        <div class="hint" id="lastHijri"></div>
      </div>
      <div class="field">
        <div class="label">يتغيّر كل</div>
        <div class="seg" id="segBig">${BIG.map((o, k) => `<button type="button" data-k="${k}">${o.l}</button>`).join('')}</div>
        <div class="seg small" id="segSmall">${SMALL.map((o, k) => `<button type="button" data-k="${k}">${o.l}</button>`).join('')}</div>
        <div class="row" id="customRow" style="margin-top:8px" ${custom ? '' : 'hidden'}>
          <input class="input" id="f-n" type="number" min="1" max="999" inputmode="numeric" value="${st.every.n}" style="width:110px">
          <select class="input grow" id="f-unit">
            <option value="d">يوم</option><option value="w">أسبوع</option><option value="m">شهر</option><option value="y">سنة</option>
          </select>
        </div>
      </div>

      <div class="result" id="result"></div>
      <div class="field" style="margin-top:-8px">
        <button type="button" class="link-btn" id="manualToggle"></button>
        <div id="manualRow" hidden style="margin-top:8px">
          <input class="input" id="f-next" type="date" value="${st.next}">
          <div class="hint">يُستخدم هذا التاريخ للمرة القادمة فقط، وبعد «تم التغيير» يرجع الحساب حسب المدة.</div>
        </div>
      </div>

      <div class="field">
        <div class="label">ذكّرني</div>
        <div class="chips" id="remind">${REMIND_OPTIONS.map((o) => `<button type="button" class="chip" data-d="${o.d}">${o.label}</button>`).join('')}</div>
      </div>
      <div class="field">
        <label for="f-notes">ملاحظات (اختياري)</label>
        <textarea class="input" id="f-notes" maxlength="1000" placeholder="رقم الموديل، مكان الشراء، السعر…">${esc(st.notes)}</textarea>
      </div>
      <button class="btn primary block" type="submit" style="height:56px;font-size:1.05rem">${ICON.check} ${editing ? 'حفظ التعديل' : 'حفظ'}</button>
    </form>`, (root) => {
    const f = (id) => $(`#${id}`, root);
    f('f-unit').value = st.every.unit;

    const paint = () => {
      $$('#segBig button', root).forEach((b) => b.setAttribute('aria-pressed', !custom && same(BIG[b.dataset.k], st.every)));
      $$('#segSmall button', root).forEach((b) => {
        const o = SMALL[b.dataset.k];
        b.setAttribute('aria-pressed', o.custom ? custom : !custom && same(o, st.every));
      });
      f('customRow').hidden = !custom;
      $$('#remind .chip', root).forEach((c) => c.setAttribute('aria-pressed', st.remind.includes(+c.dataset.d)));
      f('manualRow').hidden = !st.nextManual;
      f('manualToggle').textContent = st.nextManual ? 'ارجع للحساب التلقائي' : 'أو حدّد موعد التغيير القادم بنفسك';
      f('lastHijri').textContent = D.parse(st.last) ? `${greg(st.last)} — ${hij(st.last)}` : '';
      updateResult();
    };
    const updateResult = (flash) => {
      const box = f('result');
      if (!D.parse(st.last)) { box.innerHTML = '<div class="t3">اختر تاريخ آخر تغيير</div>'; return; }
      const next = st.nextManual && D.parse(st.next) ? st.next : D.addInterval(st.last, st.every);
      if (!st.nextManual) { st.next = next; f('f-next').value = next; }
      const days = D.diffDays(D.today(), next);
      box.innerHTML = `
        <div class="big">🗓️</div>
        <div>
          <div class="t1">موعد التغيير القادم</div>
          <div class="t2">${esc(greg(next))}</div>
          <div class="t3">${esc(hij(next))}</div>
          <div class="t4">${esc(rel(next))}${Math.abs(days) > 1 ? ` · ${num(Math.abs(days))} ${days < 0 ? 'يوم تأخير' : 'يوم'}` : ''}</div>
        </div>`;
      if (flash) { box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash'); }
    };

    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'f-emoji') {
        f('emojiGrid').hidden = !f('emojiGrid').hidden;
      } else if (t.dataset.e) {
        st.emoji = t.dataset.e; f('f-emoji').textContent = st.emoji; f('emojiGrid').hidden = true;
      } else if (t.closest('#segBig')) {
        custom = false; st.every = { n: BIG[t.dataset.k].n, unit: BIG[t.dataset.k].unit }; st.nextManual = false;
        paint(); updateResult(true); buzz();
      } else if (t.closest('#segSmall')) {
        const o = SMALL[t.dataset.k];
        if (o.custom) { custom = true; st.every = { n: +f('f-n').value || 1, unit: f('f-unit').value }; }
        else { custom = false; st.every = { n: o.n, unit: o.unit }; }
        st.nextManual = false;
        f('f-n').value = st.every.n; f('f-unit').value = st.every.unit;
        paint(); updateResult(true); buzz();
      } else if (t.id === 'manualToggle') {
        st.nextManual = !st.nextManual; paint();
      } else if (t.dataset.d != null && t.closest('#remind')) {
        const d = +t.dataset.d;
        st.remind = st.remind.includes(d) ? st.remind.filter((x) => x !== d) : [...st.remind, d];
        paint();
      }
    });
    f('f-last').addEventListener('input', (e) => { st.last = e.target.value; paint(); });
    f('f-next').addEventListener('input', (e) => { st.next = e.target.value; updateResult(); });
    const onCustom = () => { st.every = { n: Math.max(1, +f('f-n').value || 1), unit: f('f-unit').value }; updateResult(); };
    f('f-n').addEventListener('input', onCustom);
    f('f-unit').addEventListener('change', onCustom);

    f('ed').addEventListener('submit', (e) => {
      e.preventDefault();
      st.name = f('f-name').value.trim();
      st.room = f('f-room').value.trim();
      st.notes = f('f-notes').value.trim();
      if (!st.name) { f('f-name').focus(); return; }
      if (!D.parse(st.last)) { f('f-last').focus(); return; }
      if (st.nextManual && !D.parse(st.next)) st.nextManual = false;
      const saved = S.upsert(st);
      buzz(20);
      closeSheet();
      toast(editing ? 'تم الحفظ' : `تمت الإضافة — الموعد ${rel(saved.next)}`);
      maybeAskPush();
    });
    paint();
    if (!editing && !src.name) setTimeout(() => f('f-name').focus(), 350);
  });
}

// ===== التفاصيل =====
function openDetail(id) {
  const raw = S.get(id);
  if (!raw) return;
  const it = decorate(raw);
  const b = D.breakdown(D.today(), it.next);
  const remindTxt = (it.remind || []).slice().sort((a, b) => b - a)
    .map((d) => REMIND_OPTIONS.find((o) => o.d === d)?.label || `قبل ${num(d)} يوم`).join('، ') || 'بدون';
  const hist = [it.last, ...(it.history || [])];
  openSheet(`
    ${head('')}
    <div style="--u:var(--${it.u})">
      <div class="detail-head u-${it.u}">
        <div class="emoji">${esc(it.emoji)}</div>
        <div><h2>${esc(it.name)}</h2>${it.room ? `<div class="muted room-text">${esc(it.room)}</div>` : ''}</div>
      </div>
      <div class="countdown">
        <div><b>${num(Math.abs(it.days))}</b><span>${it.days < 0 ? 'يوم تأخير' : 'يوم'}</span></div>
        <div><b>${num(b.months)}</b><span>شهر${b.months ? ` و${num(b.d)} يوم` : ''}</span></div>
        <div><b>${num(Math.round(it.prog * 100))}٪</b><span>من المدة مضى</span></div>
      </div>
      <div class="big-rel">${esc(rel(it.next))}</div>
      <dl class="info">
        <div><dt>الموعد القادم</dt><dd>${esc(greg(it.next))}<small>${esc(hij(it.next))}</small></dd></div>
        <div><dt>آخر تغيير</dt><dd>${esc(greg(it.last))}<small>${esc(hij(it.last))}</small></dd></div>
        <div><dt>التكرار</dt><dd>${esc(D.everyText(it.every, num))}${it.nextManual ? '<small>الموعد القادم محدد يدويًا</small>' : ''}</dd></div>
        <div><dt>التذكير</dt><dd>${esc(remindTxt)}</dd></div>
      </dl>
      ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ''}
      <div class="actions">
        <button class="btn primary wide" data-done="${it.id}" style="height:54px">${ICON.check} تم التغيير اليوم</button>
        <button class="btn" id="doneOther">${ICON.cal} غيّرته بتاريخ آخر</button>
        <button class="btn" data-edit="${it.id}">${ICON.edit} تعديل</button>
        <button class="btn" id="ics">${ICON.bell} أضف للتقويم</button>
        <button class="btn danger" id="del">${ICON.trash} حذف</button>
      </div>
      <div id="otherRow" class="row" style="margin-top:10px" hidden>
        <input class="input grow" type="date" id="otherDate" value="${D.today()}" max="${D.today()}">
        <button class="btn primary" id="otherSave">حفظ</button>
      </div>
      ${hist.length > 1 ? `<h4 class="sec">سجل التغييرات</h4><ul class="history">${hist.map((d, k) =>
        `<li><b>${esc(greg(d, 'short'))}</b><span>${k === 0 ? 'آخر تغيير' : esc(hij(d))}</span></li>`).join('')}</ul>` : ''}
    </div>`, (root) => {
    $('#doneOther', root).onclick = () => { $('#otherRow', root).hidden = false; $('#otherDate', root).focus(); };
    $('#otherSave', root).onclick = () => {
      const d = $('#otherDate', root).value;
      if (D.parse(d)) doDone(it.id, d);
    };
    $('#ics', root).onclick = () => download(`${it.name}.ics`, icsFor(raw), 'text/calendar');
    let armed = false;
    $('#del', root).onclick = (e) => {
      if (!armed) { armed = true; e.currentTarget.innerHTML = `${ICON.trash} اضغط مرة ثانية للتأكيد`; return; }
      const snap = { ...raw };
      S.remove(it.id);
      closeSheet();
      toast(`تم حذف «${it.name}»`, { label: 'تراجع', run: () => S.restore(snap) });
    };
  });
}

function doDone(id, date = D.today()) {
  const before = S.get(id);
  if (!before) return;
  const snap = { ...before };
  const after = S.markDone(id, date);
  buzz([15, 40, 15]);
  closeSheet();
  toast(`👌 ${after.name}: الموعد الجديد ${rel(after.next)}`, { label: 'تراجع', run: () => S.restore(snap) });
}

function icsFor(it) {
  const ymd = (s) => s.replace(/-/g, '');
  const e = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const trig = (d) => { const h = d * 24 - 9; return h <= 0 ? `PT${-h}H` : `-PT${h}H`; };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Baddilha//AR', 'BEGIN:VEVENT', `UID:${it.id}-${it.next}@baddilha`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(it.next)}`, `DTEND;VALUE=DATE:${ymd(D.addDays(it.next, 1))}`,
    `SUMMARY:${e(`${it.emoji} تغيير ${it.name}`)}`, it.notes ? `DESCRIPTION:${e(it.notes)}` : '',
    ...(Array.isArray(it.remind) ? it.remind : [7, 0]).flatMap((d) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(it.name)}`, `TRIGGER:${trig(d)}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

// ===== الإعدادات =====
async function openSettings(focus) {
  const meta = S.getMeta();
  const cloud = cloudReady();
  const ps = await P.pushState().catch(() => 'unsupported');
  const statusTxt = { ok: 'متزامن', syncing: 'جارٍ المزامنة…', error: 'تعذّرت المزامنة', offline: 'بدون إنترنت', idle: 'جاهز', local: 'محلي فقط' }[S.status.state];
  const pushTxt = { on: ['مفعّلة', 'on'], off: ['غير مفعّلة', ''], denied: ['مرفوضة من الإعدادات', 'warn'], 'needs-install': ['تحتاج تثبيت التطبيق', 'warn'], unsupported: ['غير مدعومة هنا', 'warn'], 'no-cloud': ['تحتاج السحابة', 'warn'] }[ps];
  const hours = Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === (meta.notifyHour ?? 9) ? 'selected' : ''}>${num(h % 12 || 12)}:00 ${h < 12 ? 'صباحًا' : 'مساءً'}</option>`).join('');
  const feedUrl = meta.readToken ? `${CONFIG.supabaseUrl.replace(/^https?/, 'webcal')}/functions/v1/feed?t=${meta.readToken}` : '';

  openSheet(`
    ${head('الإعدادات')}
    <section class="set-group">
      <h3>${ICON.link.replace('<svg', '<svg width="18" height="18"')} شارك بدّلها</h3>
      <p>أرسل الرابط لأصحابك — كل واحد بياناته خاصة فيه ومستقلة.</p>
      <div class="set-row">
        <button class="btn primary small" data-act="share">${ICON.link} مشاركة الرابط</button>
        ${P.isStandalone() ? '' : '<button class="btn small" data-act="install">طريقة التثبيت</button>'}
      </div>
    </section>
${cloud ? `
    <section class="set-group" id="sec-sync">
      <h3>${ICON.sync.replace('<svg', '<svg width="18" height="18"')} المزامنة بين أجهزتك <span class="pill ${S.status.state === 'ok' ? 'on' : S.status.state === 'error' ? 'warn' : ''}">${statusTxt}${S.status.online ? ' · لحظي' : ''}</span></h3>
      ${cloud ? `
        <p>أي تعديل في جوالك يظهر في الكمبيوتر فورًا والعكس. اربط أجهزتك برمز مؤقت:</p>
        <div id="pairOut"></div>
        <div class="set-row">
          <button class="btn primary small" id="pairNew">${ICON.link} ربط جهاز جديد</button>
          <button class="btn small" id="pairJoinBtn">عندي رمز من جهاز ثاني</button>
          <button class="btn ghost small" id="syncNow">${ICON.sync} زامن الآن</button>
        </div>
        <div id="joinBox" hidden style="margin-top:12px">
          <input class="input code-input" id="joinCode" maxlength="9" placeholder="XXXX-XXXX" autocomplete="one-time-code">
          <label class="hint" style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="joinMerge" checked> انقل الأشياء الموجودة في هذا الجهاز للمساحة المشتركة</label>
          <button class="btn primary block" id="joinGo">ربط</button>
        </div>
        ${S.status.error && S.status.state === 'error' ? `<p class="hint">${esc(S.status.error.slice(0, 160))}</p>` : ''}
      ` : `<p>السحابة غير مفعّلة في هذه النسخة — البيانات محفوظة في هذا الجهاز فقط.</p>`}
    </section>

    <section class="set-group" id="sec-push">
      <h3>${ICON.bell.replace('<svg', '<svg width="18" height="18"')} التنبيهات <span class="pill ${pushTxt[1]}">${pushTxt[0]}</span></h3>
      ${ps === 'needs-install' ? `<p>على الآيفون، التنبيهات تشتغل فقط بعد تثبيت التطبيق:</p>
        <ol class="steps"><li>افتح الرابط في Safari</li><li>اضغط زر المشاركة ⬆︎</li><li>اختر «إضافة إلى الشاشة الرئيسية»</li><li>افتح بدّلها من الأيقونة وفعّل التنبيهات من هنا</li></ol>` : ''}
      ${ps === 'denied' ? `<p>رفضت التنبيهات سابقًا — فعّلها من إعدادات الجهاز ← الإشعارات ← بدّلها.</p>` : ''}
      ${ps === 'off' || ps === 'on' ? `
        <p>يوصلك تنبيه حسب أيام التذكير لكل شي، وإذا تأخرت يذكّرك كل أسبوع.</p>
        <div class="set-row">
          ${ps === 'off' ? `<button class="btn primary small" data-act="enable-push">${ICON.bell} تفعيل التنبيهات</button>` :
            `<button class="btn small" id="testPush">أرسل تنبيه تجربة</button><button class="btn ghost small" id="offPush">إيقاف على هذا الجهاز</button>`}
        </div>
        <div class="set-row"><span>وقت التنبيه اليومي</span><select class="input" id="hour" style="width:auto;min-height:42px">${hours}</select></div>` : ''}
      <div class="field" style="margin:14px 0 0">
        <div class="label">التذكير الافتراضي للأشياء الجديدة</div>
        <div class="chips" id="defRemind">${REMIND_OPTIONS.map((o) => `<button class="chip" data-d="${o.d}" aria-pressed="${S.prefs.remind.includes(o.d)}">${o.label}</button>`).join('')}</div>
      </div>
    </section>
` : `
    <section class="set-group">
      <h3>${ICON.bell.replace('<svg', '<svg width="18" height="18"')} التذكير الافتراضي</h3>
      <p>يُستخدم لكل شي جديد تضيفه، ويطلع كتنبيه لما تضغط «أضف للتقويم» في صفحة أي شي.</p>
      <div class="chips" id="defRemind">${REMIND_OPTIONS.map((o) => `<button class="chip" data-d="${o.d}" aria-pressed="${S.prefs.remind.includes(o.d)}">${o.label}</button>`).join('')}</div>
    </section>
`}

    ${feedUrl ? `<section class="set-group">
      <h3>${ICON.cal.replace('<svg', '<svg width="18" height="18"')} تقويم الجوال والكمبيوتر</h3>
      <p>اشترك مرة وحدة وتظهر كل مواعيد التغيير في تقويمك مع تنبيهاتها، وتتحدث تلقائيًا. (على الآيفون: بعد الاشتراك أطفئ خيار «إزالة التنبيهات»).</p>
      <div class="set-row">
        <a class="btn primary small" href="${esc(feedUrl)}">${ICON.cal} اشترك في التقويم</a>
        <button class="btn small" id="copyFeed">${ICON.copy} نسخ الرابط</button>
      </div>
    </section>` : ''}

    <section class="set-group">
      <h3>المظهر</h3>
      <div class="set-row"><span>الوضع</span>
        <div class="chips" id="theme">${[['auto', 'تلقائي'], ['dark', 'داكن'], ['light', 'فاتح']].map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${S.prefs.theme === v}">${l}</button>`).join('')}</div>
      </div>
      <div class="set-row"><span>الأرقام</span>
        <div class="chips" id="digits">${[['latn', '123'], ['arab', '١٢٣']].map(([v, l]) => `<button class="chip" data-v="${v}" aria-pressed="${S.prefs.digits === v}">${l}</button>`).join('')}</div>
      </div>
    </section>

    <section class="set-group">
      <h3>نسخة احتياطية</h3>
      <p>ملف فيه كل بياناتك — تقدر ترجعه في أي وقت.</p>
      <div class="set-row">
        <button class="btn small" id="exp">${ICON.down} تصدير</button>
        <label class="btn small">${ICON.up} استيراد<input type="file" id="imp" accept="application/json,.json" hidden></label>
      </div>
    </section>
    <p class="hint" style="text-align:center">بدّلها ${VERSION} · <a href="https://github.com/alaaawy979-hue/baddilha" style="color:inherit">GitHub</a></p>
  `, (root) => {
    const on = (sel, fn) => { const el = $(sel, root); if (el) el.onclick = fn; };
    on('#syncNow', async () => { await S.sync(); toast(S.status.state === 'ok' ? 'تمت المزامنة ✓' : 'تعذّرت المزامنة'); });
    on('#pairNew', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const r = await S.createPairCode();
        const code = r.code.slice(0, 4) + '-' + r.code.slice(4);
        $('#pairOut', root).innerHTML = `<div class="code-box">${code}</div>
          <p class="hint" style="text-align:center">في الجهاز الثاني: افتح بدّلها ← الإعدادات ← «عندي رمز من جهاز ثاني» واكتب الرمز. صالح 15 دقيقة.</p>`;
        copy(code);
      } catch { toast('تعذّر إنشاء الرمز — تأكد من الإنترنت'); }
      btn.disabled = false;
    });
    on('#pairJoinBtn', () => { $('#joinBox', root).hidden = false; $('#joinCode', root).focus(); });
    on('#joinGo', async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try {
        const r = await S.joinWithCode($('#joinCode', root).value, $('#joinMerge', root).checked);
        await P.refreshPush();
        closeSheet();
        toast(r === 'same' ? 'هذا الجهاز مربوط أصلًا' : 'تم ربط الجهاز ✓ — بياناتك صارت مشتركة');
      } catch (err) { toast(err.message || 'تعذّر الربط'); }
      btn.disabled = false;
    });
    const jc = $('#joinCode', root);
    if (jc) jc.oninput = () => {
      const v = jc.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      jc.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
    };
    on('#testPush', async () => { try { await P.testPush(); toast('أُرسل — بيوصلك خلال ثواني'); } catch (e) { toast(e.message); } });
    on('#offPush', async () => { await P.disablePush(); toast('تم إيقاف التنبيهات على هذا الجهاز'); openSettings(); });
    const hourSel = $('#hour', root);
    if (hourSel) hourSel.onchange = async () => { try { await S.setNotifyTime(+hourSel.value); toast('تم حفظ وقت التنبيه'); } catch { toast('تعذّر الحفظ'); } };
    $('#defRemind', root).onclick = (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      const d = +c.dataset.d;
      S.prefs.remind = S.prefs.remind.includes(d) ? S.prefs.remind.filter((x) => x !== d) : [...S.prefs.remind, d];
      S.savePrefs(); c.setAttribute('aria-pressed', S.prefs.remind.includes(d));
    };
    on('#copyFeed', async () => { await copy(feedUrl); toast('تم نسخ رابط التقويم'); });
    $('#theme', root).onclick = (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      S.prefs.theme = c.dataset.v; S.savePrefs(); applyTheme();
      $$('#theme .chip', root).forEach((x) => x.setAttribute('aria-pressed', x === c));
    };
    $('#digits', root).onclick = (e) => {
      const c = e.target.closest('.chip'); if (!c) return;
      S.prefs.digits = c.dataset.v; S.savePrefs();
      $$('#digits .chip', root).forEach((x) => x.setAttribute('aria-pressed', x === c));
    };
    on('#exp', () => download(`baddilha-${D.today()}.json`, JSON.stringify(S.exportData(), null, 2), 'application/json'));
    $('#imp', root).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try { const n = S.importData(JSON.parse(await file.text())); toast(`تم استيراد ${num(n)} عنصر`); }
      catch (err) { toast(err.message || 'ملف غير صالح'); }
    };
    if (focus) setTimeout(() => $(focus, root)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    if (focus === '#sec-sync') $('#pairJoinBtn', root)?.click();
  });
}

// ===== التثبيت والمشاركة =====
const platform = () => (P.isIOS() ? 'ios' : /Android/i.test(navigator.userAgent) ? 'android' : 'desktop');
let installPrompt = null;

const PUSH_STEP = PUSH ? '، وفعّل التنبيهات من الإعدادات' : '';
const STEPS = {
  ios: ['افتح الرابط في متصفح <b>Safari</b>', 'اضغط زر المشاركة <b>⬆︎</b> أسفل الشاشة',
    'اختر <b>«إضافة إلى الشاشة الرئيسية»</b> ثم <b>«إضافة»</b>', 'افتح بدّلها من الأيقونة الجديدة دائمًا' + PUSH_STEP],
  android: ['افتح الرابط في متصفح <b>Chrome</b>', 'اضغط <b>«تثبيت التطبيق»</b> إذا ظهر لك، أو القائمة <b>⋮</b> ← <b>«تثبيت التطبيق»</b>',
    'افتح بدّلها من الأيقونة' + PUSH_STEP],
  desktop: ['افتح الرابط في <b>Edge</b> أو <b>Chrome</b>', 'اضغط زر <b>«تثبيت التطبيق»</b> أعلى الصفحة، أو أيقونة التثبيت في شريط العنوان',
    'يصير له أيقونة في قائمة ابدأ وشريط المهام' + (PUSH ? '، وتوصلك التنبيهات' : '')],
};
const PLATFORM_NAMES = { ios: 'آيفون', android: 'أندرويد', desktop: 'كمبيوتر' };

async function shareApp() {
  const data = { title: 'بدّلها', text: 'بدّلها — يذكّرك بمواعيد تغيير أغراض البيت: الفلاتر، البطاريات، زيت السيارة وغيرها', url: CONFIG.appUrl };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  await copy(`${data.text}\n${data.url}`);
  toast('تم نسخ الرابط — أرسله لأصحابك');
}

function openInstallGuide() {
  let shown = platform();
  const stepsHTML = (p) => `<ol class="steps big">${STEPS[p].map((s) => `<li>${s}</li>`).join('')}</ol>`;
  openSheet(`
    ${head('ثبّت بدّلها على جهازك')}
    <p class="muted" style="margin-top:-6px">يشتغل كتطبيق كامل على الآيفون والأندرويد والكمبيوتر — بأيقونة، وبدون إنترنت${PUSH ? '، ومع تنبيهات' : ''}.</p>
    ${installPrompt ? `<button class="btn primary block" id="doInstall" style="height:54px;margin-bottom:14px">${ICON.down} تثبيت الآن</button>` : ''}
    <div class="chips" id="plat" style="margin-bottom:8px">${Object.keys(STEPS).map((p) =>
      `<button class="chip" data-p="${p}" aria-pressed="${p === shown}">${PLATFORM_NAMES[p]}</button>`).join('')}</div>
    <div id="platSteps">${stepsHTML(shown)}</div>
    <div class="banner" style="margin:6px 0 14px"><span style="font-size:1.3rem">🔒</span><div class="grow">بياناتك خاصة فيك — كل شخص يثبّت التطبيق له مساحته المستقلة، ولا أحد يشوف أغراضك.</div></div>
    <button class="btn block" id="shareApp">${ICON.link} شارك التطبيق مع أصحابك</button>
  `, (root) => {
    $('#plat', root).onclick = (e) => {
      const c = e.target.closest('[data-p]'); if (!c) return;
      shown = c.dataset.p;
      $$('#plat .chip', root).forEach((x) => x.setAttribute('aria-pressed', x === c));
      $('#platSteps', root).innerHTML = stepsHTML(shown);
    };
    $('#shareApp', root).onclick = shareApp;
    const btn = $('#doInstall', root);
    if (btn) btn.onclick = installNow;
  });
}

async function installNow() {
  if (!installPrompt) return openInstallGuide();
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  closeSheet();
}

async function enablePushFlow() {
  try {
    await P.enablePush();
    toast('🔔 تم تفعيل التنبيهات');
    bannerDismissed.push = true;
    render();
    if (!$('#sheet').hidden) openSettings('#sec-push');
  } catch (e) { toast(e.message || 'تعذّر التفعيل'); }
}

let askedPush = false;
async function maybeAskPush() {
  if (askedPush) return;
  askedPush = true;
  if ((await P.pushState()) === 'off') setTimeout(() => toast('تبي يذكّرك قبل الموعد؟', { label: 'فعّل التنبيهات', run: enablePushFlow }), 2800);
}

function applyTheme() {
  const t = S.prefs.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $$('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#0b1220' : '#f4f6fb'; });
}

// ===== حالة المزامنة =====
function renderStatus() {
  const dot = $('.sync-dot');
  const s = S.status;
  dot.dataset.s = s.state === 'ok' && s.online ? 'live' : s.state;
  $('#syncBtn').title = { ok: s.online ? 'متزامن لحظيًا' : 'متزامن', syncing: 'جارٍ المزامنة', error: 'تعذّرت المزامنة', offline: 'بدون إنترنت', local: 'محلي فقط', idle: '' }[s.state] || '';
}

// ===== الأحداث =====
function bind() {
  $('#settingsBtn').innerHTML = ICON.gear;
  $('#syncBtn').hidden = !cloudReady();
  $('.search-icon').innerHTML = ICON.search;
  $('#fab span').innerHTML = ICON.plus;
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) $('#search').placeholder = 'ابحث… (اضغط / للبحث، N للإضافة)';
  else $('#search').placeholder = 'ابحث…';

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-close],[data-done],[data-open],[data-edit],[data-act],.card,.hero,.stat,[data-room],.banner .x');
    if (!t) return;
    if (t.matches('[data-close]')) return closeSheet();
    if (t.matches('[data-done]')) { e.stopPropagation(); return doDone(t.dataset.done); }
    if (t.matches('[data-edit]')) { const it = S.get(t.dataset.edit); closeSheet(); return setTimeout(() => openEditor(it), 120); }
    if (t.matches('[data-open]')) return openDetail(t.dataset.open);
    if (t.matches('.banner .x')) {
      bannerDismissed[t.closest('.banner').dataset.b] = true;
      try { sessionStorage.setItem('bd.banner', JSON.stringify(bannerDismissed)); } catch {}
      return render();
    }
    if (t.matches('[data-act]')) {
      const a = t.dataset.act;
      if (a === 'add') return openEditor();
      if (a === 'join') return openSettings('#sec-sync');
      if (a === 'enable-push') return enablePushFlow();
      if (a === 'install') return installPrompt ? installNow() : openInstallGuide();
      if (a === 'share') return shareApp();
      return;
    }
    if (t.matches('.card, .hero')) return openDetail(t.dataset.id);
    if (t.matches('.stat')) { view.filter = view.filter === t.dataset.f ? 'all' : t.dataset.f; return render(); }
    if (t.matches('[data-room]')) { view.room = t.dataset.room; return render(); }
  });

  $('#fab').onclick = () => openEditor();
  $('#settingsBtn').onclick = () => openSettings();
  $('#syncBtn').onclick = () => { S.wake(); openSettings(); };
  $('#search').addEventListener('input', (e) => { view.q = e.target.value; render(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) return closeSheet();
    if (e.target.matches('input, textarea, select') || !$('#sheet').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '/') { e.preventDefault(); $('#search').focus(); }
    if (e.key === 'n' || e.key === 'N' || e.key === 'ى') { e.preventDefault(); openEditor(); }
  });

  // سحب النافذة للأسفل لإغلاقها (الجوال)
  const sheet = $('.sheet');
  let y0 = null;
  sheet.addEventListener('touchstart', (e) => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    sheet.style.transform = '';
    if (dy > 120) closeSheet();
    y0 = null;
  });

  // عند الرجوع للتطبيق: حدّث كل شي
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.wake(); render(); } });
  addEventListener('online', () => S.wake());
  addEventListener('focus', () => S.scheduleSync(100));
  setInterval(() => { if (!document.hidden) S.scheduleSync(0); }, 90000);

  // تغيّر اليوم عند منتصف الليل
  let day = D.today();
  setInterval(() => { if (D.today() !== day) { day = D.today(); render(); } }, 30000);

  // زر التثبيت (الكمبيوتر وأندرويد)
  $('#installBtn').hidden = P.isStandalone();
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  $('#installBtn').onclick = () => (installPrompt ? installNow() : openInstallGuide());
  addEventListener('appinstalled', () => { $('#installBtn').hidden = true; installPrompt = null; toast('تم تثبيت بدّلها ✓'); });
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) { reloading = true; location.reload(); }
  });
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && e.data.id) openDetail(e.data.id);
  });
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  } catch (e) { console.warn('SW', e); }
}

// ===== التشغيل =====
function start() {
  applyTheme();
  bind();
  S.subscribe((what) => { if (what === 'status') renderStatus(); else render(); });
  render();
  renderStatus();
  registerSW();
  if (cloudReady()) {
    S.sync().then(() => P.refreshPush());
    S.startLive();
  }
  const m = /#pair=([A-Za-z0-9-]+)/.exec(location.hash);
  if (m) {
    history.replaceState(null, '', location.pathname);
    openSettings('#sec-sync').then(() => { const i = $('#joinCode'); if (i) { i.value = m[1]; i.dispatchEvent(new Event('input')); } });
  }
  if (location.hash === '#add') { history.replaceState(null, '', location.pathname); openEditor(); }
  else if (!m && !P.isStandalone()) {
    let seen = false;
    try { seen = localStorage.getItem('bd.guide') === '1'; localStorage.setItem('bd.guide', '1'); } catch {}
    if (!seen) setTimeout(openInstallGuide, 700);
  }
}

start();
