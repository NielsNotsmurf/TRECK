import { favs } from './memory.js';
const nlToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }); // dag in NL-tijd
// GET ?date=JJJJ-MM-DD -> {items, total}
export async function onRequestGet({ request, env, user }) {
  const date = new URL(request.url).searchParams.get('date');
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE user_id = ? AND date = ? ORDER BY created_at, id').bind(user.id, date).all();
  const total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const r of results) for (const k in total) total[k] += r[k];
  // Fase 3: lege dag -> schatting uit gemiddelde van echte dagen in de 14 dagen ervoor; niet opgeslagen, dus telt nergens mee.
  let estimate = null;
  if (!results.length) {
    const { results: days } = await env.DB.prepare(`SELECT SUM(kcal) kcal, SUM(protein_g) protein_g, SUM(carbs_g) carbs_g, SUM(fat_g) fat_g
      FROM items WHERE user_id = ? AND date < ? AND date >= date(?, '-14 days') GROUP BY date`).bind(user.id, date, date).all();
    if (days.length) {
      estimate = { days: days.length };
      for (const k in total) estimate[k] = Math.round(days.reduce((t, d) => t + d[k], 0) / days.length);
    }
  }
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM queue WHERE user_id = ?').bind(user.id).first();
  const fav = await favs(env, user.id);
  const b = await env.DB.prepare('SELECT kcal, updated_at FROM burn WHERE user_id = ? AND date = ?').bind(user.id, date).first();
  // Geen verbruik op een voorbije dag: schatting = gemiddelde van de 14 dagen ervoor (niet opgeslagen). Vandaag/toekomst: geen schatting.
  const be = b || date >= nlToday() ? null : await env.DB.prepare(`SELECT ROUND(AVG(kcal)) kcal FROM burn WHERE user_id = ? AND date < ? AND date >= date(?, '-14 days')`).bind(user.id, date, date).first();
  // Week (vanaf maandag) en maand (vanaf de 1e) t/m de geopende dag: alleen dagen met echte inname én echt verbruik.
  const d = new Date(date + 'T12:00Z');
  const monday = new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  const period = async (from) => env.DB.prepare(`SELECT COALESCE(SUM(b.kcal - i.k), 0) diff, COUNT(*) days FROM
    (SELECT date, SUM(kcal) k FROM items WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY date) i JOIN burn b ON b.user_id = ? AND b.date = i.date`)
    .bind(user.id, from, date, user.id).first();
  return Response.json({ items: results.map((r) => ({ ...r, fav: fav(r) })), total, estimate, queued: n,
    burn: b ? b.kcal : be?.kcal ?? null, burnEst: !b && be?.kcal != null, burnAt: b?.updated_at || null,
    week: await period(monday), month: await period(date.slice(0, 8) + '01') });
}

// Datum zoals iOS hem stuurt zonder opmaak: "2026-11-12", "12 Nov 2026 at 00:00", "Nov 12, 2026", "12 nov. 2026 om 00:00", "12-11-2026".
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'ma', 'jun', 'jul', 'aug', 'sep', 'o', 'nov', 'dec'];
function parseDate(v) {
  const t = String(v || '').trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fmt(m[1], m[2], m[3]);
  m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); // dag-maand-jaar (NL)
  if (m) return fmt(m[3], m[2], m[1]);
  const y = t.match(/\b(\d{4})\b/), name = t.match(/\b(jan|feb|mrt|maa|mar|apr|mei|may|jun|jul|aug|sep|okt|oct|nov|dec)[a-z]*\.?/);
  const day = t.replace(y?.[0] ?? '', '').match(/\b(\d{1,2})\b/);
  if (!y || !name || !day) return null;
  const n = { mrt: 2, maa: 2, mar: 2, mei: 4, may: 4, okt: 9, oct: 9 }[name[1]] ?? MONTHS.indexOf(name[1]);
  return fmt(y[1], n + 1, day[1]);
}
const fmt = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// Fase 4: POST {date, active?, resting?} (body of headers) vanuit de iOS-opdracht (Garmin -> Apple Health).
// Actief en rust apart bewaard; een verzoek met alleen één van beide laat de ander staan. Zo kan de opdracht per dag/per soort sturen.
export async function burn({ request, env, user }) {
  const h = (k) => request.headers.get(k);
  const b = await request.json().catch(() => ({}));
  for (const k of ['date', 'kcal', 'active', 'resting']) if (b[k] == null && h(k)) b[k] = h(k);
  const date = parseDate(b.date) || nlToday();
  const num = (v) => { // iOS stuurt soms "1.812,4 kcal"; leeg = null
    if (v == null || v === '') return null;
    let t = String(v).replace(/[^\d.,]/g, '');
    t = t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
    return Math.round(parseFloat(t)) || 0;
  };
  let active = num(b.active), resting = num(b.resting);
  if (b.kcal != null && active == null && resting == null) { active = num(b.kcal); resting = 0; }
  if (active == null && resting == null) return Response.json({ error: 'Geen verbruik ontvangen' }, { status: 400 });
  await env.DB.prepare(`INSERT INTO burn (user_id, date, active, resting, kcal, updated_at) VALUES (?1, ?2, ?3, ?4, COALESCE(?3, 0) + COALESCE(?4, 0), ?5)
    ON CONFLICT (user_id, date) DO UPDATE SET active = COALESCE(?3, active), resting = COALESCE(?4, resting),
    kcal = COALESCE(?3, active, 0) + COALESCE(?4, resting, 0), updated_at = ?5`)
    .bind(user.id, date, active, resting, new Date().toISOString()).run();
  const r = await env.DB.prepare('SELECT kcal FROM burn WHERE user_id = ? AND date = ?').bind(user.id, date).first();
  return Response.json({ ok: true, date, kcal: r.kcal });
}
