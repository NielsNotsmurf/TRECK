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

// Fase 4: POST {date, active, resting} (of {date, kcal}) vanuit de iOS-opdracht (Garmin -> Apple Health). Overschrijft die dag.
export async function burn({ request, env, user }) {
  const h = (k) => request.headers.get(k);
  const b = await request.json().catch(() => ({})); // waarden mogen ook als header (iOS-opdracht)
  for (const k of ['date', 'kcal', 'active', 'resting']) if (b[k] == null && h(k)) b[k] = h(k);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : nlToday();
  const num = (v) => { // iOS stuurt soms "1.812,4 kcal"
    let t = String(v ?? '').replace(/[^\d.,]/g, '');
    t = t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
    return parseFloat(t) || 0;
  };
  const kcal = Math.round(num(b.kcal) || num(b.active) + num(b.resting));
  if (!kcal) return Response.json({ error: 'Geen verbruik ontvangen' }, { status: 400 });
  await env.DB.prepare('INSERT INTO burn (user_id, date, kcal, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, date) DO UPDATE SET kcal = excluded.kcal, updated_at = excluded.updated_at')
    .bind(user.id, date, kcal, new Date().toISOString()).run();
  return Response.json({ ok: true, date, kcal });
}

// DELETE ?id=123
export async function onRequestDelete({ request, env, user }) {
  const id = new URL(request.url).searchParams.get('id');
  await env.DB.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(id, user.id).run();
  return new Response(null, { status: 204 });
}

// PUT {id, product, portion, kcal, protein_g, carbs_g, fat_g} -> handmatig aanpassen
export async function onRequestPut({ request, env, user }) {
  const i = await request.json();
  await env.DB.prepare('UPDATE items SET product = ?, portion = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ? WHERE id = ? AND user_id = ?')
    .bind(i.product, i.portion, Math.round(i.kcal) || 0, Math.round(i.protein_g) || 0, Math.round(i.carbs_g) || 0, Math.round(i.fat_g) || 0, i.id, user.id).run();
  return new Response(null, { status: 204 });
}
