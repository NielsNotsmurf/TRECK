import { recept } from './ai.js';
// 14 nov: receptenblog. Iedereen (goedgekeurd) plaatst recepten met foto en macro's per portie, reageert eronder; eigenaar of admin wist.
const nick = (n) => String(n || '').split('@')[0]; // Google-namen zijn e-mailadressen: alleen het deel vóór @ tonen
const LIST = `SELECT r.id, r.title, r.servings, r.kcal, r.protein_g, r.carbs_g, r.fat_g, r.thumb, r.created_at, u.name author,
  (SELECT COUNT(*) FROM comments c WHERE c.recipe_id = r.id) n FROM recipes r JOIN users u ON u.id = r.user_id`;

// GET ?q= -> {recipes}; GET ?id= -> {recipe, comments}
export async function get({ request, env, user }) {
  const p = new URL(request.url).searchParams, id = p.get('id');
  if (id) {
    const r = await env.DB.prepare('SELECT r.*, u.name author FROM recipes r JOIN users u ON u.id = r.user_id WHERE r.id = ?').bind(id).first();
    if (!r) return Response.json({ error: 'Recept bestaat niet meer' }, { status: 404 });
    const { results } = await env.DB.prepare('SELECT c.id, c.text, c.created_at, c.user_id, u.name author FROM comments c JOIN users u ON u.id = c.user_id WHERE c.recipe_id = ? ORDER BY c.id').bind(id).all();
    const mine = (x) => x.user_id === user.id || user.admin;
    return Response.json({ recipe: { ...r, thumb: undefined, author: nick(r.author), mine: mine(r) }, comments: results.map((c) => ({ ...c, author: nick(c.author), mine: mine(c) })) });
  }
  const q = (p.get('q') || '').trim();
  const words = q.split(/\s+/).filter(Boolean).slice(0, 5);
  const where = words.length ? ` WHERE ${words.map(() => '(r.title LIKE ? OR r.body LIKE ?)').join(' AND ')}` : '';
  const { results } = await env.DB.prepare(`${LIST}${where} ORDER BY r.id DESC LIMIT 50`).bind(...words.flatMap((w) => [`%${w}%`, `%${w}%`])).all();
  return Response.json({ recipes: results.map((r) => ({ ...r, author: nick(r.author) })) });
}

// POST {title, body, servings, kcal, protein_g, carbs_g, fat_g, photo, thumb} -> {id}
export async function post({ request, env, user }) {
  const b = await request.json();
  const title = String(b.title || '').trim().slice(0, 80), body = String(b.body || '').trim().slice(0, 5000);
  if (!title || !body || !(b.kcal > 0)) return Response.json({ error: 'Geef een titel, ingrediënten en kcal per portie' }, { status: 400 });
  if ((b.photo || '').length > 400000) return Response.json({ error: 'Foto te groot' }, { status: 400 });
  const n = (x) => Math.max(0, Math.round(+x || 0));
  const r = await env.DB.prepare(`INSERT INTO recipes (user_id, title, body, servings, kcal, protein_g, carbs_g, fat_g, photo, thumb, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(user.id, title, body, Math.max(1, n(b.servings) || 1), n(b.kcal), n(b.protein_g), n(b.carbs_g), n(b.fat_g),
    b.photo || null, b.thumb || null, new Date().toISOString()).first();
  return Response.json({ id: r.id });
}

// DELETE ?id= : eigen recept of admin (ongepaste posts).
export async function del({ request, env, user }) {
  const id = new URL(request.url).searchParams.get('id');
  const r = await env.DB.prepare('SELECT user_id FROM recipes WHERE id = ?').bind(id).first();
  if (!r || (r.user_id !== user.id && !user.admin)) return Response.json({ error: 'Mag niet' }, { status: 403 });
  await env.DB.batch([env.DB.prepare('DELETE FROM comments WHERE recipe_id = ?').bind(id), env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id)]);
  return new Response(null, { status: 204 });
}

// POST {recipe_id, text}; DELETE ?id= (eigen reactie of admin)
export async function comment({ request, env, user }) {
  const { recipe_id, text } = await request.json();
  const t = String(text || '').trim().slice(0, 1000);
  if (!t) return Response.json({ error: 'Lege reactie' }, { status: 400 });
  await env.DB.prepare('INSERT INTO comments (recipe_id, user_id, text, created_at) VALUES (?, ?, ?, ?)').bind(recipe_id, user.id, t, new Date().toISOString()).run();
  return new Response(null, { status: 204 });
}
export async function uncomment({ request, env, user }) {
  const id = new URL(request.url).searchParams.get('id');
  await env.DB.prepare(`DELETE FROM comments WHERE id = ?${user.admin ? '' : ' AND user_id = ?'}`).bind(...(user.admin ? [id] : [id, user.id])).run();
  return new Response(null, { status: 204 });
}

// POST {title, body, servings} -> {kcal, protein_g, carbs_g, fat_g} per portie (1 AI-verzoek)
export async function macros({ request, env, user }) {
  try { return Response.json(await recept(await request.json(), env, user.id)); } catch (e) {
    return Response.json({ error: e.limit ? e.message : 'AI is druk, probeer het zo opnieuw of vul zelf in' }, { status: 502 });
  }
}
