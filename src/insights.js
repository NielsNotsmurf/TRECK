// Fase 12: Inzichten. Statistieken zonder AI; AI-samenvatting max 1 per dag (NL), bewaard in config k=insight:<id>.
import { target } from './items.js';
import { tekst } from './ai.js';

const nlToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const mondayOf = (date) => { const d = new Date(date + 'T12:00Z'); return new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };

async function collect(env, userId, n) {
  const to = nlToday(), from = new Date(Date.parse(to + 'T12:00Z') - (n - 1) * 864e5).toISOString().slice(0, 10);
  const q = (sql) => env.DB.prepare(sql).bind(userId, from, to).all().then((r) => r.results);
  const [days, burn, weights] = await Promise.all([
    q(`SELECT date, ROUND(SUM(kcal)) kcal, ROUND(SUM(protein_g)) p, ROUND(SUM(carbs_g)) c, ROUND(SUM(fat_g)) f
       FROM items WHERE review IS NULL AND user_id = ? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`),
    q('SELECT date, kcal FROM burn WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date'),
    q('SELECT date, kg FROM weight WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date'),
  ]);
  const me = await env.DB.prepare('SELECT goal, pace FROM users WHERE id = ?').bind(userId).first();
  return { from, to, days, burn, weights, me, target: await target(env, userId, mondayOf(to)) };
}
const stored = async (env, userId) => {
  const r = await env.DB.prepare('SELECT v FROM config WHERE k = ?').bind(`insight:${userId}`).first();
  const v = r ? JSON.parse(r.v) : null;
  return v?.d === nlToday() ? v : null;
};

// GET ?days=7|30|90
export async function stats({ request, env, user }) {
  const n = [7, 30, 90].includes(+new URL(request.url).searchParams.get('days')) ? +new URL(request.url).searchParams.get('days') : 30;
  return Response.json({ ...(await collect(env, user.id, n)), insight: await stored(env, user.id) });
}

// POST: samenvatting van de laatste 30 dagen. Tweede keer dezelfde dag = bewaard antwoord, geen AI-verzoek.
const GOAL = { lose: 'afvallen', keep: 'op gewicht blijven', gain: 'aankomen' };
export async function summary({ env, user }) {
  const have = await stored(env, user.id);
  if (have) return Response.json(have);
  const c = await collect(env, user.id, 30);
  if (c.days.length < 3) return Response.json({ error: 'Log eerst minstens 3 dagen' }, { status: 400 });
  const burn = Object.fromEntries(c.burn.map((b) => [b.date, b.kcal])), kgs = Object.fromEntries(c.weights.map((w) => [w.date, w.kg]));
  const dates = [...new Set([...c.days.map((d) => d.date), ...c.weights.map((w) => w.date)])].sort();
  const byDate = Object.fromEntries(c.days.map((d) => [d.date, d]));
  const rows = dates.map((d) => { const x = byDate[d] || {}; return [d, x.kcal ?? '', x.p ?? '', x.c ?? '', x.f ?? '', burn[d] ?? '', kgs[d] ?? ''].join(','); });
  const T = c.target;
  const prompt = `Je bent een nuchtere voedingscoach. Schrijf in het Nederlands (je-vorm) een korte analyse van de laatste 30 dagen, max. 4 zinnen, geen opsomming, geen markdown.
Benoem: gemiddelde inname t.o.v. het doel, eiwit, hoe het gewicht beweegt en wat dat zegt over het verbruik, en één ding dat opvalt (bijv. weekend, uitschieters, ontbrekende dagen). Geen medisch advies, geen voedingsprogramma.
Doel: ${GOAL[c.me?.goal] || 'afvallen'}${c.me?.pace ? `, ${c.me.pace} kg/week` : ''}. ${T?.kcal ? `Dagdoel ${T.kcal} kcal, eiwit ${T.protein_g} g, koolh ${T.carbs_g} g, vet ${T.fat_g} g; geschat verbruik ${T.tdee} kcal.` : 'Nog geen persoonlijk dagdoel.'}
Data (datum,kcal,eiwit_g,koolh_g,vet_g,verbruik_kcal,gewicht_kg; leeg = niet gelogd):
${rows.join('\n')}`;
  try {
    const text = (await tekst(prompt, env, user.id)).trim();
    if (!text) throw new Error('Geen antwoord van de AI');
    const v = { d: nlToday(), text };
    await env.DB.prepare('INSERT OR REPLACE INTO config (k, v) VALUES (?, ?)').bind(`insight:${user.id}`, JSON.stringify(v)).run();
    return Response.json(v);
  } catch (e) {
    return Response.json({ error: e.limit ? e.message : e.retry ? 'Gemini is druk, probeer het zo opnieuw' : e.message }, { status: e.limit ? 429 : 502 });
  }
}
