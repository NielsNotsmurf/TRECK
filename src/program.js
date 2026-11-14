// Fase 13: voedingsprogramma. Instellingen (doel in detail + gekozen KPI's) in config k=prog:<id>; AI-advies max 1× per NL-dag in k=advice:<id>.
import { collect } from './insights.js';
import { tekst } from './ai.js';

const nlToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const get = async (env, k) => { const r = await env.DB.prepare('SELECT v FROM config WHERE k = ?').bind(k).first(); return r ? JSON.parse(r.v) : null; };
const put = (env, k, v) => env.DB.prepare('INSERT OR REPLACE INTO config (k, v) VALUES (?, ?)').bind(k, JSON.stringify(v)).run();
export const prog = (env, userId) => get(env, `prog:${userId}`).then((p) => p || {});
// Eiwit in g per kg lichaamsgewicht per focus.
export const PROT = { lose: 1.8, keep: 1.6, muscle: 2.2, gain: 1.8 };
// Coach: vet-aandeel van de energie per voedingsstijl; koolhydraten = de rest.
export const DIET = { balans: 0.25, laagkh: 0.4, laagvet: 0.2, keto: 0.7 };

const top = (env, userId) => env.DB.prepare(`SELECT MIN(product) name, COUNT(*) n, ROUND(AVG(kcal)) kcal, ROUND(AVG(protein_g)) p, MIN(portion) portion FROM items
  WHERE review IS NULL AND user_id = ? AND date >= date('now', '-30 days') GROUP BY lower(product) ORDER BY n DESC LIMIT 20`).bind(userId).all().then((r) => r.results);

export async function show({ env, user }) {
  return Response.json({ p: await prog(env, user.id), advice: await get(env, `advice:${user.id}`) });
}

// POST {h, age, sex, tkg, tdate, focus, kpis} (deels mag). Streefgewicht + datum bepalen doel en tempo (users.goal/pace).
export async function save({ request, env, user }) {
  const b = await request.json().catch(() => ({})), p = await prog(env, user.id);
  const num = (v, lo, hi) => (v === '' || v == null ? undefined : Math.min(hi, Math.max(lo, +String(v).replace(',', '.'))) || undefined);
  if ('h' in b) p.h = num(b.h, 100, 230);
  if ('age' in b) p.age = num(b.age, 12, 100);
  if ('sex' in b) p.sex = ['m', 'v'].includes(b.sex) ? b.sex : undefined;
  if ('tkg' in b) p.tkg = num(b.tkg, 30, 250);
  if ('tdate' in b) p.tdate = /^\d{4}-\d{2}-\d{2}$/.test(b.tdate) ? b.tdate : undefined;
  if ('diet' in b) p.diet = DIET[b.diet] ? b.diet : undefined;
  if ('focus' in b) p.focus = PROT[b.focus] ? b.focus : undefined;
  if (Array.isArray(b.kpis)) p.kpis = b.kpis.filter((k) => typeof k === 'string').slice(0, 40);
  await put(env, `prog:${user.id}`, p);
  const w = await env.DB.prepare('SELECT kg FROM weight WHERE user_id = ? ORDER BY date DESC LIMIT 1').bind(user.id).first();
  if (p.focus || (p.tkg && w)) {
    const diff = p.tkg && w ? p.tkg - w.kg : 0, weeks = p.tdate ? (Date.parse(p.tdate) - Date.parse(nlToday())) / 6048e5 : 0;
    const goal = p.focus === 'keep' || (p.tkg && w && Math.abs(diff) < 0.5) ? 'keep' : diff < 0 ? 'lose' : diff > 0 ? 'gain' : p.focus === 'lose' ? 'lose' : 'gain';
    const pace = weeks > 0 && diff ? Math.min(1, Math.max(0.1, Math.round(Math.abs(diff) / weeks * 20) / 20)) : null;
    await env.DB.prepare('UPDATE users SET goal = ?, pace = COALESCE(?, pace) WHERE id = ?').bind(goal, pace, user.id).run();
  }
  return Response.json({ p });
}

// POST: advies over 14 dagen + meest gegeten producten. Tweede keer dezelfde dag = bewaard antwoord, geen AI-verzoek.
export async function advice({ env, user }) {
  const have = await get(env, `advice:${user.id}`);
  if (have?.d === nlToday()) return Response.json(have);
  const [c, p, prods] = await Promise.all([collect(env, user.id, 14), prog(env, user.id), top(env, user.id)]);
  if (c.days.length < 3) return Response.json({ error: 'Log eerst minstens 3 dagen' }, { status: 400 });
  const T = c.target, w = c.weights.at(-1)?.kg;
  const FOC = { lose: 'afvallen', keep: 'op gewicht blijven', muscle: 'spieropbouw', gain: 'aankomen' };
  const prompt = `Je bent een nuchtere voedingscoach. Schrijf in het Nederlands (je-vorm), geen markdown, geen medisch advies.
Geef precies 3 concrete aanpassingen, elk op een eigen regel die begint met "- ", max. 25 woorden per regel, gebaseerd op de data (bijv. "vervang X door Y", eiwit verdelen, een maaltijd die steeds te zwaar is).
Daarna één regel "Voorbeelddag:" en dan 4 regels "Ontbijt: …", "Lunch: …", "Diner: …", "Tussendoor: …" met vooral producten uit de lijst hieronder, met kcal en eiwit per maaltijd, samen rond het dagdoel.
Doel: ${FOC[p.focus || c.me?.goal] || 'afvallen'}, voedingsstijl ${{ laagkh: 'koolhydraatarm', laagvet: 'vetarm', keto: 'keto' }[p.diet] || 'gebalanceerd'}${p.tkg ? `, naar ${p.tkg} kg${p.tdate ? ` op ${p.tdate}` : ''}` : ''}${w ? `; nu ${w} kg` : ''}.
${T?.kcal ? `Dagdoel ${T.kcal} kcal, eiwit ${T.protein_g} g, koolh ${T.carbs_g} g, vet ${T.fat_g} g; verbruik ≈ ${T.tdee} kcal.` : 'Nog geen persoonlijk dagdoel; houd ongeveer de huidige inname aan.'}
Laatste 14 dagen (datum,kcal,eiwit_g,koolh_g,vet_g):
${c.days.map((d) => [d.date, d.kcal, d.p, d.c, d.f].join(',')).join('\n')}
Meest gegeten (product,keer,kcal,eiwit_g per keer):
${prods.map((x) => [x.name, x.n, x.kcal, x.p].join(',')).join('\n')}`;
  try {
    const text = (await tekst(prompt, env, user.id)).trim();
    if (!text) throw new Error('Geen antwoord van de AI');
    const v = { d: nlToday(), text };
    await put(env, `advice:${user.id}`, v);
    return Response.json(v);
  } catch (e) {
    return Response.json({ error: e.limit ? e.message : e.retry ? 'Gemini is druk, probeer het zo opnieuw' : e.message }, { status: e.limit ? 429 : 502 });
  }
}
