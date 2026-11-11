// Fase 2 Geheugen: eigen gerechten op naam, vaste porties en snelle combinaties.
const KEYS = ['product', 'portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g'];
const pick = (i) => Object.fromEntries(KEYS.map((k) => [k, i[k]]));

// Context voor de AI: eigen gerechten + meest gegeten producten met vaste portie.
export async function context(env, userId) {
  const { results: meals } = await env.DB.prepare('SELECT name, items FROM meals WHERE user_id = ?').bind(userId).all();
  const { results: top } = await env.DB.prepare(
    `SELECT product, portion, kcal FROM items WHERE user_id = ? AND id IN (SELECT MAX(id) FROM items WHERE user_id = ? GROUP BY lower(product) HAVING COUNT(*) > 1)
     ORDER BY id DESC LIMIT 20`,
  ).bind(userId, userId).all();
  const lines = meals.map((m) => `- "${m.name}" = ${JSON.parse(m.items).map((i) => `${i.product} (${i.portion}, ${i.kcal} kcal)`).join(' + ')}`);
  const vast = top.map((t) => `- ${t.product}: ${t.portion}, ${t.kcal} kcal`);
  return [lines.length && `Eigen gerechten (neem precies deze items over als de naam genoemd wordt):\n${lines.join('\n')}`,
    vast.length && `Vaste porties van deze gebruiker (gebruik deze als geen portie genoemd wordt):\n${vast.join('\n')}`]
    .filter(Boolean).join('\n');
}

// GET -> {meals, combos}: eigen gerechten + combinaties die in 60 dagen minstens 2x gegeten zijn.
export async function quick({ env, user }) {
  const { results: meals } = await env.DB.prepare('SELECT id, name, items FROM meals WHERE user_id = ? ORDER BY name').bind(user.id).all();
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE user_id = ? AND date >= ? ORDER BY id').bind(user.id, since).all();
  const inputs = {};
  for (const r of results) (inputs[r.input_id] ||= []).push(pick(r));
  const count = {};
  for (const items of Object.values(inputs)) {
    const sig = items.map((i) => i.product.toLowerCase()).sort().join(' + ');
    count[sig] = { n: (count[sig]?.n || 0) + 1, items };
  }
  const named = new Set(meals.map((m) => JSON.parse(m.items).map((i) => i.product.toLowerCase()).sort().join(' + ')));
  const combos = Object.entries(count).filter(([s, c]) => c.n > 1 && !named.has(s))
    .sort((a, b) => b[1].n - a[1].n).slice(0, 6).map(([, c]) => ({ name: c.items.map((i) => i.product).join(' + '), items: c.items }));
  return Response.json({ meals: meals.map((m) => ({ ...m, items: JSON.parse(m.items) })), combos });
}

// POST {items, date} -> zonder AI toevoegen aan de dag.
export async function add({ request, env, user }) {
  const { items, date } = await request.json();
  const inputId = crypto.randomUUID(), at = new Date().toISOString();
  const stmt = env.DB.prepare(`INSERT INTO items (input_id, date, product, portion, kcal, protein_g, carbs_g, fat_g, note, created_at, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[snel]', ?, ?)`);
  await env.DB.batch(items.map((i) => stmt.bind(inputId, date, i.product, i.portion, i.kcal, i.protein_g, i.carbs_g, i.fat_g, at, user.id)));
  return new Response(null, { status: 204 });
}

// POST {input_id, name} -> invoer bewaren als eigen gerecht. DELETE ?id= -> wissen.
export async function save({ request, env, user }) {
  const { input_id, name } = await request.json();
  const { results } = await env.DB.prepare('SELECT * FROM items WHERE user_id = ? AND input_id = ? ORDER BY id').bind(user.id, input_id).all();
  if (!results.length || !String(name || '').trim()) return Response.json({ error: 'Niets om te bewaren' }, { status: 400 });
  await env.DB.prepare('INSERT OR REPLACE INTO meals (user_id, name, items, created_at) VALUES (?, ?, ?, ?)')
    .bind(user.id, name.trim(), JSON.stringify(results.map(pick)), new Date().toISOString()).run();
  return new Response(null, { status: 204 });
}
export async function remove({ request, env, user }) {
  await env.DB.prepare('DELETE FROM meals WHERE id = ? AND user_id = ?').bind(new URL(request.url).searchParams.get('id'), user.id).run();
  return new Response(null, { status: 204 });
}
