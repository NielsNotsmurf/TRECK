import { analyseer } from './ai.js';

// POST {text?, image?:{mime,data}, audio?:{mime,data}, now} -> {items}
export async function onRequestPost({ request, env }) {
  const input = await request.json();
  const note = input.text || (input.audio ? '[spraak]' : '') || (input.image ? '[foto]' : '');
  let items;
  try {
    items = await analyseer(input, env);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
  const inputId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const stmt = env.DB.prepare(
    `INSERT INTO items (input_id, date, product, portion, kcal, protein_g, carbs_g, fat_g, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  if (items.length) {
    await env.DB.batch(items.map((i) => stmt.bind(
      inputId, i.date, i.product, i.portion,
      Math.round(i.kcal), Math.round(i.protein_g), Math.round(i.carbs_g), Math.round(i.fat_g),
      note, createdAt,
    )));
  }
  return Response.json({ items });
}
