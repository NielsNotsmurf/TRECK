import { activiteit } from './ai.js';
import { favs } from './memory.js';
import { prog, PROT } from './program.js';
const nlToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' }); // dag in NL-tijd
// GET ?date=JJJJ-MM-DD -> {items, total}
export async function onRequestGet({ request, env, user }) {
  const date = new URL(request.url).searchParams.get('date');
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE review IS NULL AND user_id = ? AND date = ? ORDER BY created_at, id').bind(user.id, date).all();
  const total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const r of results) for (const k in total) total[k] += r[k];
  // Fase 3: lege dag -> schatting uit gemiddelde van echte dagen in de 14 dagen ervoor; niet opgeslagen, dus telt nergens mee.
  let estimate = null;
  if (!results.length) {
    const { results: days } = await env.DB.prepare(`SELECT SUM(kcal) kcal, SUM(protein_g) protein_g, SUM(carbs_g) carbs_g, SUM(fat_g) fat_g
      FROM items WHERE review IS NULL AND user_id = ? AND date < ? AND date >= date(?, '-14 days') GROUP BY date`).bind(user.id, date, date).all();
    if (days.length) {
      estimate = { days: days.length };
      for (const k in total) estimate[k] = Math.round(days.reduce((t, d) => t + d[k], 0) / days.length);
    }
  }
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM queue WHERE user_id = ?').bind(user.id).first();
  const fav = await favs(env, user.id);
  const b = await env.DB.prepare('SELECT kcal, updated_at FROM burn_total WHERE user_id = ? AND date = ?').bind(user.id, date).first();
  // Geen verbruik op een voorbije dag: schatting = gemiddelde van de 14 dagen ervoor (niet opgeslagen). Vandaag/toekomst: geen schatting.
  const be = b || date >= nlToday() ? null : await env.DB.prepare(`SELECT ROUND(AVG(kcal)) kcal FROM burn_total WHERE user_id = ? AND date < ? AND date >= date(?, '-14 days')`).bind(user.id, date, date).first();
  // Week (vanaf maandag) en maand (vanaf de 1e) t/m de geopende dag: alleen dagen met echte inname én echt verbruik.
  const d = new Date(date + 'T12:00Z');
  const monday = new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  const period = async (from) => env.DB.prepare(`SELECT COALESCE(SUM(b.kcal - i.k), 0) diff, COUNT(*) days FROM
    (SELECT date, SUM(kcal) k FROM items WHERE review IS NULL AND user_id = ? AND date BETWEEN ? AND ? GROUP BY date) i JOIN burn_total b ON b.user_id = ? AND b.date = i.date`)
    .bind(user.id, from, date, user.id).first();
  const me = await env.DB.prepare('SELECT name, pace, src FROM users WHERE id = ?').bind(user.id).first();
  const { results: review } = await env.DB.prepare('SELECT * FROM items WHERE user_id = ? AND review = 1 ORDER BY created_at, id').bind(user.id).all();
  const linked = !!(await env.DB.prepare('SELECT 1 FROM burn WHERE user_id = ? LIMIT 1').bind(user.id).first());
  const { results: acts } = await env.DB.prepare('SELECT id, name, minutes, kcal FROM acts WHERE user_id = ? AND date = ? ORDER BY id').bind(user.id, date).all();
  return Response.json({ me, review, linked, acts, items: results.map((r) => ({ ...r, fav: fav(r) })), total, estimate, queued: n,
    burn: b ? b.kcal : be?.kcal ?? null, burnEst: !b && be?.kcal != null, burnAt: b?.updated_at || null,
    week: await period(monday), month: await period(date.slice(0, 8) + '01'),
    target: await target(env, user.id, monday),
    weights: (await env.DB.prepare(`SELECT date, kg FROM weight WHERE user_id = ? AND date BETWEEN date(?, '-30 days') AND ? ORDER BY date`).bind(user.id, date, date).all()).results });
}

// Fase 9: adaptief doel zonder AI. Venster = 28 dagen vóór de maandag van de geopende week (doel blijft een week staan).
// Verbruik = gem. inname op gelogde dagen − gewichtstrend (kg/dag, lineaire regressie) × 7700. Doel = verbruik + tempo.
// Fase 11: tempo (kg/week) per gebruiker instelbaar; 1 kg ≈ 7700 kcal → per dag pace × 1100.
const PACE = { lose: [-0.5, 'voor −%s kg/week'], keep: [0, 'om op gewicht te blijven'], gain: [0.25, 'voor +%s kg/week'] };
export async function target(env, userId, monday) {
  const from = `date('${monday}', '-28 days')`;
  const { results: days } = await env.DB.prepare(`SELECT date, SUM(kcal) k FROM items WHERE review IS NULL AND user_id = ? AND date >= ${from} AND date < ? GROUP BY date`).bind(userId, monday).all();
  const { results: ws } = await env.DB.prepare(`SELECT date, kg FROM weight WHERE user_id = ? AND date >= ${from} AND date < ? ORDER BY date`).bind(userId, monday).all();
  const span = ws.length > 1 ? (new Date(ws.at(-1).date) - new Date(ws[0].date)) / 864e5 : 0;
  const u = await env.DB.prepare('SELECT goal, pace FROM users WHERE id = ?').bind(userId).first();
  const pf = PROT[(await prog(env, userId)).focus || u?.goal] || 1.8; // Fase 13: eiwit per kg volgt de focus
  if (days.length < 14 || span < 7) return { days: days.length, weighs: ws.length, goal: u?.goal || 'lose' };
  const xs = ws.map((w) => (new Date(w.date) - new Date(ws[0].date)) / 864e5), mx = xs.reduce((a, b) => a + b) / xs.length, my = ws.reduce((a, w) => a + w.kg, 0) / ws.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ws[i].kg - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0); // kg per dag
  const intake = days.reduce((a, d) => a + d.k, 0) / days.length, tdee = Math.round((intake - slope * 7700) / 10) * 10;
  const [p0, txt] = PACE[u?.goal] || PACE.lose, pace = p0 && (u?.pace ? Math.sign(p0) * u.pace : p0);
  const delta = Math.round(pace * 1100), why = txt.replace('%s', String(Math.abs(pace)).replace('.', ',')), kcal = Math.max(1200, tdee + delta), kg = ws.at(-1).kg;
  const protein_g = Math.round(kg * pf), fat_g = Math.round(kcal * 0.25 / 9), carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  const wk = (slope * 7).toFixed(2).replace('.', ',').replace(/^(\d)/, '+$1');
  return { kcal, tdee, protein_g, carbs_g, fat_g, goal: u?.goal || 'lose', days: days.length, weighs: ws.length,
    why: `Je verbruik is ≈ ${tdee} kcal: ${days.length} dagen gem. ${Math.round(intake)} kcal gegeten bij ${wk} kg/week. Doel ${kcal} kcal ${why}, eiwit ${String(pf).replace('.', ',')} g per kg.` };
}

// POST {goal: lose|keep|gain, pace: kg/week} -> doel en tempo opslaan (Fase 11: eigen Doel-scherm)
export async function goal({ request, env, user }) {
  const b = await request.json().catch(() => ({}));
  const g = ['lose', 'keep', 'gain'].includes(b.goal) ? b.goal : 'lose', pace = Math.min(1, Math.max(0.1, +b.pace || 0.5));
  await env.DB.prepare('UPDATE users SET goal = ?, pace = ? WHERE id = ?').bind(g, pace, user.id).run();
  return Response.json({ goal: g, pace });
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

// GET -> laatste 30 dagen verbruik (controle in het menu)
export async function burnList({ env, user }) {
  const { results } = await env.DB.prepare('SELECT date, kcal, active, resting, updated_at FROM burn WHERE user_id = ? ORDER BY date DESC LIMIT 30').bind(user.id).all();
  return Response.json({ days: results });
}

// DELETE -> al het verbruik van deze gebruiker wissen (opnieuw testen; de opdracht vult het weer aan)
export async function burnClear({ env, user }) {
  await env.DB.prepare('DELETE FROM burn WHERE user_id = ?').bind(user.id).run();
  return new Response(null, { status: 204 });
}

// Fase 4: POST {date, active?, resting?} (body of headers) vanuit de iOS-opdracht (Garmin -> Apple Health).
// Actief en rust apart bewaard; een verzoek met alleen één van beide laat de ander staan. Zo kan de opdracht per dag/per soort sturen.
export async function burn({ request, env, user }) {
  const h = (k) => request.headers.get(k);
  const b = await request.json().catch(() => ({}));
  for (const k of ['date', 'kcal', 'active', 'resting']) if (b[k] == null && h(k)) b[k] = h(k);
  if (b.date && !parseDate(b.date)) return Response.json({ error: `Datum niet herkend: ${b.date}` }, { status: 400 });
  const date = parseDate(b.date) || nlToday();
  const num = (v) => { // iOS stuurt soms "1.812,4 kcal"; leeg = null
    if (v == null || v === '') return null;
    const parts = String(v).match(/\d[\d.,]*/g) || [];
    if (parts.length !== 1) return NaN; // lijst of rommel (bijv. hele Health Samples i.p.v. Repeat Item)
    let t = parts[0];
    // "1.545" kan duizendtal (Garmin) of decimaal zijn (iPhone: "11.823" kcal). Duizendtal alleen als dat een logische dagwaarde (≤ 6000) geeft.
    const th = t.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t;
    return Math.round(parseFloat(th) > 6000 && !t.includes(',') ? parseFloat(t) : parseFloat(th)) || 0;
  };
  let active = num(b.active), resting = num(b.resting);
  if (b.kcal != null && active == null && resting == null) { active = num(b.kcal); resting = 0; }
  if (active == null && resting == null) return Response.json({ error: 'Geen verbruik ontvangen' }, { status: 400 });
  if ([active, resting].some((x) => Number.isNaN(x) || x > 15000)) {
    return Response.json({ error: `Onlogische waarde (active: ${b.active}, resting: ${b.resting}). Kies Repeat Item → Value.` }, { status: 400 });
  }
  await env.DB.prepare(`INSERT INTO burn (user_id, date, active, resting, kcal, updated_at) VALUES (?1, ?2, ?3, ?4, COALESCE(?3, 0) + COALESCE(?4, 0), ?5)
    ON CONFLICT (user_id, date) DO UPDATE SET active = COALESCE(?3, active), resting = COALESCE(?4, resting),
    kcal = COALESCE(?3, active, 0) + COALESCE(?4, resting, 0), updated_at = ?5`)
    .bind(user.id, date, active, resting, new Date().toISOString()).run();
  const r = await env.DB.prepare('SELECT kcal FROM burn WHERE user_id = ? AND date = ?').bind(user.id, date).first();
  return Response.json({ ok: true, date, kcal: r.kcal });
}

// Fase 5: POST {date, kg} bij handmatig wegen in de app (headers mogen ook). Laatste weging van de dag wint.
export async function weight({ request, env, user }) {
  const b = await request.json().catch(() => ({}));
  for (const k of ['date', 'kg']) if (b[k] == null && request.headers.get(k)) b[k] = request.headers.get(k);
  if (b.date && !parseDate(b.date)) return Response.json({ error: `Datum niet herkend: ${b.date}` }, { status: 400 });
  const parts = String(b.kg ?? '').match(/\d+(?:[.,]\d+)?/g) || []; // "82,4 kg" of "82.4"
  const kg = parts.length === 1 ? Math.round(parseFloat(parts[0].replace(',', '.')) * 10) / 10 : NaN;
  if (!(kg >= 20 && kg <= 400)) return Response.json({ error: `Onlogisch gewicht: ${b.kg}. Kies Repeat Item → Value.` }, { status: 400 });
  const date = parseDate(b.date) || nlToday();
  await env.DB.prepare(`INSERT INTO weight (user_id, date, kg, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (user_id, date) DO UPDATE SET kg = ?3, updated_at = ?4`).bind(user.id, date, kg, new Date().toISOString()).run();
  return Response.json({ ok: true, date, kg });
}


// Fase 11f: POST {ids} -> later verwerkte items goedkeuren (tellen daarna mee)
export async function approve({ request, env, user }) {
  const { ids } = await request.json();
  await env.DB.batch((ids || []).map((id) => env.DB.prepare('UPDATE items SET review = NULL, photo = NULL WHERE id = ? AND user_id = ?').bind(id, user.id)));
  return new Response(null, { status: 204 });
}

// DELETE ?id=123
export async function onRequestDelete({ request, env, user }) {
  const q = new URL(request.url).searchParams, input = q.get('input'); // ?input= : hele invoer ongedaan maken
  await env.DB.prepare(`DELETE FROM items WHERE ${input ? 'input_id' : 'id'} = ? AND user_id = ?`).bind(input || q.get('id'), user.id).run();
  return new Response(null, { status: 204 });
}

// PUT {id, product, portion, kcal, protein_g, carbs_g, fat_g, amount?, unit?} -> aanpassen (editor, +/− en slider)
export async function onRequestPut({ request, env, user }) {
  const i = await request.json();
  await env.DB.prepare('UPDATE items SET product = ?, portion = ?, kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?, amount = ?, unit = ?, date = COALESCE(?, date), meal = COALESCE(?, meal) WHERE id = ? AND user_id = ?')
    .bind(i.product, i.portion, Math.round(i.kcal) || 0, Math.round(i.protein_g) || 0, Math.round(i.carbs_g) || 0, Math.round(i.fat_g) || 0,
      +i.amount || null, i.unit || null, /^\d{4}-\d\d-\d\d$/.test(i.date) ? i.date : null, i.meal || null, i.id, user.id).run();
  return new Response(null, { status: 204 });
}

// Activiteiten (zonder horloge): POST {text, now} -> AI schat kcal -> opgeslagen per dag. Telt als AI-verzoek.
export async function actAdd({ request, env, user }) {
  const { text, now } = await request.json();
  const w = await env.DB.prepare('SELECT kg FROM weight WHERE user_id = ? ORDER BY date DESC LIMIT 1').bind(user.id).first();
  let acts;
  try { acts = await activiteit({ text, now, kg: w?.kg }, env, user.id); } catch (e) { return Response.json({ error: e.limit ? e.message : 'AI is even druk, probeer zo opnieuw.' }, { status: e.limit ? 429 : 502 }); }
  const at = new Date().toISOString(), stmt = env.DB.prepare('INSERT INTO acts (user_id, date, name, minutes, kcal, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const ok = acts.filter((a) => parseDate(a.date) && a.kcal > 0);
  if (ok.length) await env.DB.batch(ok.map((a) => stmt.bind(user.id, parseDate(a.date), a.name, Math.round(a.minutes) || null, Math.round(a.kcal), at)));
  return Response.json({ acts: ok });
}
export async function actDel({ request, env, user }) {
  await env.DB.prepare('DELETE FROM acts WHERE id = ? AND user_id = ?').bind(new URL(request.url).searchParams.get('id'), user.id).run();
  return Response.json({ ok: true });
}
// Bron van verbruik (garmin|watch|iphone); alleen bij iphone tellen activiteiten mee.
export async function src({ request, env, user }) {
  const { src } = await request.json();
  await env.DB.prepare('UPDATE users SET src = ? WHERE id = ?').bind(['garmin', 'watch', 'iphone'].includes(src) ? src : null, user.id).run();
  return Response.json({ ok: true });
}
