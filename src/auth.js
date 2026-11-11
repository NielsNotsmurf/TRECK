// Inloggen met naam + wachtwoord. Nieuwe gebruikers wachten op goedkeuring van ADMIN_USER.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const clean = (s) => String(s || '').trim().toLowerCase();

async function hash(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `${hex(salt)}:${hex(bits)}`;
}

const isAdmin = (env, name) => name === clean(env.ADMIN_USER);

// POST {name, pw} -> {pending}
export async function register({ request, env }) {
  const { name: n, pw } = await request.json();
  const name = clean(n);
  if (!name || !pw || pw.length < 8) return Response.json({ error: 'Naam en wachtwoord (min. 8 tekens) nodig' }, { status: 400 });
  const approved = isAdmin(env, name) ? 1 : 0;
  try {
    await env.DB.prepare('INSERT INTO users (name, pw, approved, created_at) VALUES (?, ?, ?, ?)')
      .bind(name, await hash(pw), approved, new Date().toISOString()).run();
  } catch {
    return Response.json({ error: 'Naam is al in gebruik' }, { status: 409 });
  }
  // De beheerder krijgt de items van vóór het inloggen.
  if (approved) await env.DB.prepare('UPDATE items SET user_id = (SELECT id FROM users WHERE name = ?) WHERE user_id IS NULL').bind(name).run();
  return Response.json({ pending: !approved });
}

// POST {name, pw} -> {token, admin}
export async function login({ request, env }) {
  const { name: n, pw } = await request.json();
  const name = clean(n);
  const u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
  if (!u || (await hash(pw || '', u.pw.split(':')[0])) !== u.pw) return Response.json({ error: 'Naam of wachtwoord klopt niet' }, { status: 401 });
  if (!u.approved) return Response.json({ error: 'Je account wacht nog op goedkeuring' }, { status: 403 });
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').bind(token, u.id, new Date().toISOString()).run();
  return Response.json({ token, admin: isAdmin(env, name) });
}

// Bearer-token -> goedgekeurde gebruiker of null
export async function currentUser(request, env) {
  const token = (request.headers.get('authorization') || '').replace('Bearer ', '');
  if (!token) return null;
  const u = await env.DB.prepare('SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.approved = 1').bind(token).first();
  return u && { ...u, admin: isAdmin(env, u.name) };
}

// Beheerder: GET -> wachtende gebruikers; POST {id, ok} -> goedkeuren of weigeren
export async function pending({ env }) {
  const { results } = await env.DB.prepare('SELECT id, name, created_at FROM users WHERE approved = 0 ORDER BY id').all();
  return Response.json({ users: results });
}
export async function decide({ request, env }) {
  const { id, ok } = await request.json();
  await env.DB.prepare(ok ? 'UPDATE users SET approved = 1 WHERE id = ?' : 'DELETE FROM users WHERE id = ? AND approved = 0').bind(id).run();
  return new Response(null, { status: 204 });
}
