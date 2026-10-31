// يولّد سكربت ودجت الآيفون لتطبيق Scriptable (مجاني على App Store).
// السكربت يقرأ فقط (رمز قراءة)، ويحفظ آخر نسخة ليعمل بدون إنترنت.
import { CONFIG } from './config.js';

export function scriptableCode(readToken) {
  return `// بدّلها — ودجت الشاشة الرئيسية وشاشة القفل
// icon-color: teal; icon-glyph: sync-alt;
const SUPA = ${JSON.stringify(CONFIG.supabaseUrl)};
const KEY = ${JSON.stringify(CONFIG.supabaseKey)};
const TOKEN = ${JSON.stringify(readToken)};
const APP = ${JSON.stringify(CONFIG.appUrl)};

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "baddilha-cache.json");

async function load() {
  try {
    const r = new Request(SUPA + "/rest/v1/rpc/widget_items");
    r.method = "POST";
    r.timeoutInterval = 15;
    r.headers = { apikey: KEY, "Content-Type": "application/json" };
    if (KEY.startsWith("ey")) r.headers.Authorization = "Bearer " + KEY;
    r.body = JSON.stringify({ p_token: TOKEN });
    const data = await r.loadJSON();
    if (Array.isArray(data)) { fm.writeString(CACHE, JSON.stringify(data)); return data; }
  } catch (e) {}
  return fm.fileExists(CACHE) ? JSON.parse(fm.readString(CACHE)) : [];
}

function daysTo(s) {
  const n = new Date();
  const t = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  const [y, m, d] = s.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - t) / 86400000);
}
function plural(n, w) {
  if (n === 1) return w[0]; if (n === 2) return w[1];
  return n <= 10 ? n + " " + w[2] : n + " " + w[3];
}
function when(d) {
  if (d === 0) return "اليوم";
  if (d === 1) return "غدًا";
  if (d < 0) return "متأخر " + plural(-d, ["يوم", "يومين", "أيام", "يومًا"]);
  if (d >= 60) {
    const mo = Math.floor(d / 30.44);
    return "بعد " + plural(mo, ["شهر", "شهرين", "أشهر", "شهرًا"]);
  }
  return "بعد " + plural(d, ["يوم", "يومين", "أيام", "يومًا"]);
}
function tone(d) {
  if (d < 0) return new Color("#fb7185");
  if (d === 0) return new Color("#fb923c");
  if (d <= 7) return new Color("#fbbf24");
  if (d <= 30) return new Color("#facc15");
  return new Color("#5eead4");
}

const items = (await load()).map((i) => ({ ...i, days: daysTo(i.next) })).sort((a, b) => a.days - b.days);
const fam = config.widgetFamily || "medium";
const w = new ListWidget();
w.url = APP;
w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

if (fam.startsWith("accessory")) {
  const it = items[0];
  if (fam === "accessoryCircular") {
    const s = w.addStack(); s.layoutVertically(); s.centerAlignContent();
    const t1 = s.addText(it ? String(Math.abs(it.days)) : "–"); t1.font = Font.boldRoundedSystemFont(20); t1.centerAlignText();
    const t2 = s.addText(it ? (it.days < 0 ? "متأخر" : "يوم") : ""); t2.font = Font.systemFont(9); t2.centerAlignText();
  } else if (fam === "accessoryInline") {
    w.addText(it ? (it.emoji || "🔁") + " " + it.name + " · " + when(it.days) : "بدّلها");
  } else {
    for (const it of items.slice(0, 2)) {
      const t = w.addText((it.emoji || "🔁") + " " + it.name + " — " + when(it.days));
      t.font = Font.semiboldSystemFont(13); t.rightAlignText(); t.lineLimit = 1;
    }
    if (!items.length) w.addText("لا توجد مواعيد");
  }
} else {
  const g = new LinearGradient();
  g.colors = [new Color("#0b1220"), new Color("#11213b")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(14, 14, 14, 14);

  const head = w.addStack();
  head.centerAlignContent();
  const urgent = items.filter((i) => i.days <= 0).length;
  if (urgent) { const b = head.addText("● " + urgent); b.font = Font.boldSystemFont(11); b.textColor = new Color("#fb7185"); }
  head.addSpacer();
  const title = head.addText("بدّلها");
  title.font = Font.boldRoundedSystemFont(13); title.textColor = new Color("#5eead4");
  w.addSpacer(fam === "small" ? 6 : 8);

  if (!items.length) {
    const t = w.addText("لا توجد عناصر بعد — أضف من التطبيق");
    t.font = Font.systemFont(13); t.textColor = Color.white(); t.rightAlignText();
  } else if (fam === "small") {
    const it = items[0];
    const e = w.addText(it.emoji || "🔁"); e.font = Font.systemFont(26); e.rightAlignText();
    const n = w.addText(it.name); n.font = Font.boldSystemFont(14); n.textColor = Color.white(); n.rightAlignText(); n.lineLimit = 2;
    w.addSpacer();
    const d = w.addText(it.days === 0 ? "اليوم" : String(Math.abs(it.days)));
    d.font = Font.boldRoundedSystemFont(30); d.textColor = tone(it.days); d.rightAlignText();
    const s = w.addText(it.days === 0 ? "موعد التغيير" : it.days < 0 ? "يوم تأخير" : "يوم متبقي");
    s.font = Font.mediumSystemFont(11); s.textColor = new Color("#94a3b8"); s.rightAlignText();
  } else {
    const max = fam === "large" || fam === "extraLarge" ? 7 : 3;
    for (const it of items.slice(0, max)) {
      const row = w.addStack();
      row.centerAlignContent();
      const badge = row.addStack();
      badge.backgroundColor = tone(it.days); badge.cornerRadius = 8; badge.setPadding(3, 8, 3, 8);
      const bt = badge.addText(when(it.days)); bt.font = Font.boldSystemFont(11); bt.textColor = new Color("#0b1220");
      row.addSpacer();
      const name = row.addText(it.name); name.font = Font.semiboldSystemFont(14); name.textColor = Color.white(); name.lineLimit = 1;
      row.addSpacer(6);
      const em = row.addText(it.emoji || "🔁"); em.font = Font.systemFont(16);
      w.addSpacer(fam === "medium" ? 7 : 9);
    }
    w.addSpacer();
  }
}

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
`;
}
