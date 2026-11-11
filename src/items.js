// GET ?date=JJJJ-MM-DD -> {items, total}
export async function onRequestGet({ request, env }) {
  const date = new URL(request.url).searchParams.get('date');
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE date = ? ORDER BY created_at, id').bind(date).all();
  const total = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const r of results) for (const k in total) total[k] += r[k];
  return Response.json({ items: results, total });
}

// DELETE ?id=123
export async function onRequestDelete({ request, env }) {
  const id = new URL(request.url).searchParams.get('id');
  await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
  return new Response(null, { status: 204 });
}
