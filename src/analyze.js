import { analyseer, usage } from './ai.js';
import { context } from './memory.js';

// Dagdeel uit een woord in de tekst (zonder AI); gaat vóór het tijdstip. Eén dagdeel genoemd → geldt voor de hele invoer.
const WORDS = {
  ontbijt: /ontbijt|ontbeten|ochtend|'s morgens|smorgens|brunch|bij de koffie|ochtendeten/,
  lunch: /lunch|middageten|tussen de middag|'s middags|smiddags|middagmaal/,
  diner: /avondeten|diner|avondmaal|gedineerd|avond|warm eten|toetje|nagerecht|dessert/,
  snack: /tussendoor|snack|extraatje|borrel|'s nachts|snachts|nachtje|tussendoortje|knabbel|snoep/,
};
// Aantallen zonder AI herkennen ("2x", "twee keer", "dubbel") en als harde hint meegeven in hetzelfde ene verzoek.
const NUM = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, dubbel: 2, dubbele: 2, half: 0.5, halve: 0.5, anderhalf: 1.5, anderhalve: 1.5 };
export const counts = (t) => [...String(t || '').toLowerCase().matchAll(/\b(\d+(?:[.,]\d+)?|een|twee|drie|vier|vijf|zes)\s*(?:x|×|keer|maal)\b(?:\s+(?:een\s+|de\s+)?([a-zà-ÿ'-]+))?|\b(dubbele?|halve?|anderhalve?)\s+([a-zà-ÿ'-]+)/g)]
  .map((m) => `${m[1] ? (NUM[m[1]] || +m[1].replace(',', '.')) : NUM[m[3]]}× ${m[2] || m[4] || ''}`.trim());
export const mealWord = (t) => { const hit = Object.keys(WORDS).filter((k) => WORDS[k].test(String(t || '').toLowerCase())); return hit.length === 1 ? hit[0] : null; };

// Analyseer één invoer en sla de items op. Gooit door bij een AI-fout.
// review = 1: later uit de wachtrij verwerkt, telt pas mee na goedkeuring in de app. at = moment van invoer.
async function verwerk(input, userId, env, review = null, at = null) {
  const n = counts(input.text);
  const items = await analyseer({ ...input, text: n.length ? `${input.text}\n(Genoemde aantallen: ${n.join(', ')}. Zet amount en kcal voor het totaal.)` : input.text, fast: !review, memory: await context(env, userId) }, env, userId);
  const note = input.text || (input.audio ? '[spraak]' : '') || (input.image ? '[foto]' : '');
  const word = mealWord(input.text);
  const inputId = crypto.randomUUID();
  const createdAt = at || new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO items (input_id, date, product, portion, kcal, protein_g, carbs_g, fat_g, note, created_at, user_id, amount, unit, review, meal, photo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  if (items.length) {
    // Goedkeuren toont je eigen foto: alleen bij wachtrij-invoer, op het eerste item; gewist bij goedkeuren.
    const photo = review && input.image ? `data:${input.image.mime};base64,${input.image.data}` : null;
    await env.DB.batch(items.map((i, k) => stmt.bind(
      inputId, i.date, i.product, i.portion,
      Math.round(i.kcal), Math.round(i.protein_g), Math.round(i.carbs_g), Math.round(i.fat_g),
      note, createdAt, userId, i.amount || null, i.unit || null, review, word || i.meal || null, k ? null : photo,
    )));
  }
  return items.map((i) => ({ ...i, meal: word || i.meal || null, input_id: inputId }));
}

// POST {text?, image?:{mime,data}, audio?:{mime,data}, now} -> {items} of {queued: true}
export async function onRequestPost({ request, env, user }) {
  const input = await request.json();
  try {
    return Response.json({ items: await verwerk(input, user.id, env) });
  } catch (e) {
    if (e.retry === false) return Response.json({ error: e.message }, { status: e.limit ? 429 : 502 });
    // Drukte of storing: bewaren en later opnieuw proberen. `now` blijft het moment van invoer.
    await env.DB.prepare('INSERT INTO queue (user_id, payload, attempts, created_at) VALUES (?, ?, 0, ?)')
      .bind(user.id, JSON.stringify(input), new Date().toISOString()).run();
    return Response.json({ queued: true, quota: e.quota });
  }
}

// Cron: de oudste 5 wachtende invoeren opnieuw proberen.
export async function retryQueue(env) {
  if ((await usage(env)).full) return; // daglimiet op: wachten tot de reset.
  // Slot: een trage ronde mag niet overlappen met de volgende cron, anders wordt dezelfde invoer twee keer geanalyseerd.
  const lock = await env.DB.prepare("SELECT v FROM config WHERE k = 'queuelock'").first();
  if (lock && Date.now() - +lock.v < 5 * 60000) return;
  await env.DB.prepare("INSERT OR REPLACE INTO config (k, v) VALUES ('queuelock', ?)").bind(String(Date.now())).run();
  try { await retry(env); } finally { await env.DB.prepare("DELETE FROM config WHERE k = 'queuelock'").run(); }
}
async function retry(env) {
  const { results } = await env.DB.prepare('SELECT * FROM queue WHERE attempts < 50 ORDER BY id LIMIT 2').all();
  for (const q of results) {
    try {
      await verwerk(JSON.parse(q.payload), q.user_id, env, 1, q.created_at);
      await env.DB.prepare('DELETE FROM queue WHERE id = ?').bind(q.id).run();
    } catch (e) {
      await env.DB.prepare('UPDATE queue SET attempts = attempts + 1 WHERE id = ?').bind(q.id).run();
      if (e.retry !== false) break; // Gemini is nog druk: de rest hoeft nu niet.
    }
  }
}
