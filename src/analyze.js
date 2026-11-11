import { analyseer } from './ai.js';

// Analyseer één invoer en sla de items op. Gooit door bij een AI-fout.
async function verwerk(input, userId, env) {
  const items = await analyseer(input, env);
  const note = input.text || (input.audio ? '[spraak]' : '') || (input.image ? '[foto]' : '');
  const inputId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO items (input_id, date, product, portion, kcal, protein_g, carbs_g, fat_g, note, created_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  if (items.length) {
    await env.DB.batch(items.map((i) => stmt.bind(
      inputId, i.date, i.product, i.portion,
      Math.round(i.kcal), Math.round(i.protein_g), Math.round(i.carbs_g), Math.round(i.fat_g),
      note, createdAt, userId,
    )));
  }
  return items;
}

// POST {text?, image?:{mime,data}, audio?:{mime,data}, now} -> {items} of {queued: true}
export async function onRequestPost({ request, env, user }) {
  const input = await request.json();
  try {
    return Response.json({ items: await verwerk(input, user.id, env) });
  } catch (e) {
    if (e.retry === false) return Response.json({ error: e.message }, { status: 502 });
    // Drukte of storing: bewaren en later opnieuw proberen. `now` blijft het moment van invoer.
    await env.DB.prepare('INSERT INTO queue (user_id, payload, attempts, created_at) VALUES (?, ?, 0, ?)')
      .bind(user.id, JSON.stringify(input), new Date().toISOString()).run();
    return Response.json({ queued: true });
  }
}

// Cron: de oudste 5 wachtende invoeren opnieuw proberen.
export async function retryQueue(env) {
  const { results } = await env.DB.prepare('SELECT * FROM queue WHERE attempts < 50 ORDER BY id LIMIT 5').all();
  for (const q of results) {
    try {
      await verwerk(JSON.parse(q.payload), q.user_id, env);
      await env.DB.prepare('DELETE FROM queue WHERE id = ?').bind(q.id).run();
    } catch (e) {
      await env.DB.prepare('UPDATE queue SET attempts = attempts + 1 WHERE id = ?').bind(q.id).run();
      if (e.retry !== false) break; // Gemini is nog druk: de rest hoeft nu niet.
    }
  }
}
