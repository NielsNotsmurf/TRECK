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
  return Response.json({ items: results, total, estimate, queued: n });
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
