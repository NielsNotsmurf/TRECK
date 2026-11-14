// Inloggen: "admin" + APP_SECRET, naam + wachtwoord, of Google. Nieuwe gebruikers wachten op goedkeuring door admin.
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const clean = (s) => String(s || '').trim().toLowerCase();
const now = () => new Date().toISOString();
const ADMIN = 'admin';
// Eigenaar (Google-account) is ook beheerder; alleen de SHA-256 staat in de code, niet het e-mailadres.
const OWNER = 'e54729a695479ca545669cdab1f925363d9eeea2dcddcbe760d356d07ecc1f56';
const isAdmin = async (name) => name === ADMIN || hex(await crypto.subtle.digest('SHA-256', enc.encode(name))) === OWNER;

// Database bijwerken bij de eerste aanvraag; geen handwerk in de console nodig.
let schemaOk = false;
export async function ensureSchema(env) {
  if (schemaOk) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, pw TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS meals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, items TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id, name))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS burn (user_id INTEGER NOT NULL, date TEXT NOT NULL, kcal INTEGER NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS weight (user_id INTEGER NOT NULL, date TEXT NOT NULL, kg REAL NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, date))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push (user_id INTEGER PRIMARY KEY, endpoint TEXT NOT NULL, origin TEXT NOT NULL, times TEXT NOT NULL, sent TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS acts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, name TEXT NOT NULL, minutes INTEGER, kcal INTEGER NOT NULL, created_at TEXT NOT NULL)'),
  ]);
  const { results } = await env.DB.prepare('PRAGMA table_info(items)').all();
  if (!results.some((c) => c.name === 'user_id')) await env.DB.prepare('ALTER TABLE items ADD COLUMN user_id INTEGER').run();
  if (!results.some((c) => c.name === 'amount')) await env.DB.batch(['amount REAL', 'unit TEXT'].map((c) => env.DB.prepare(`ALTER TABLE items ADD COLUMN ${c}`)));
  const { results: m } = await env.DB.prepare('PRAGMA table_info(meals)').all();
  if (!m.some((c) => c.name === 'source')) await env.DB.prepare('ALTER TABLE meals ADD COLUMN source TEXT').run();
  const { results: bu } = await env.DB.prepare('PRAGMA table_info(burn)').all();
  if (!bu.some((c) => c.name === 'active')) await env.DB.batch(['active', 'resting'].map((c) => env.DB.prepare(`ALTER TABLE burn ADD COLUMN ${c} INTEGER`)));
  const { results: us } = await env.DB.prepare('PRAGMA table_info(users)').all();
  if (!us.some((c) => c.name === 'plan')) await env.DB.prepare('ALTER TABLE users ADD COLUMN plan TEXT').run();
  if (!us.some((c) => c.name === 'goal')) await env.DB.prepare('ALTER TABLE users ADD COLUMN goal TEXT').run();
  if (!us.some((c) => c.name === 'pace')) await env.DB.prepare('ALTER TABLE users ADD COLUMN pace REAL').run();
  if (!us.some((c) => c.name === 'req')) await env.DB.prepare('ALTER TABLE users ADD COLUMN req TEXT').run(); // aangevraagd abonnement
  if (!us.some((c) => c.name === 'src')) await env.DB.prepare('ALTER TABLE users ADD COLUMN src TEXT').run();
  // Verbruik incl. ingevoerde activiteiten, alleen bij bron "Alleen iPhone" (horloge meet sport al: anders dubbel).
  await env.DB.prepare(`CREATE VIEW IF NOT EXISTS burn_total AS SELECT b.user_id, b.date, b.updated_at, b.kcal + CASE WHEN u.src = 'iphone'
    THEN COALESCE((SELECT SUM(a.kcal) FROM acts a WHERE a.user_id = b.user_id AND a.date = b.date), 0) ELSE 0 END kcal FROM burn b JOIN users u ON u.id = b.user_id`).run();
  const { results: it } = await env.DB.prepare('PRAGMA table_info(items)').all();
  if (!it.some((c) => c.name === 'meal')) await env.DB.prepare('ALTER TABLE items ADD COLUMN meal TEXT').run();
  if (!it.some((c) => c.name === 'review')) await env.DB.prepare('ALTER TABLE items ADD COLUMN review INTEGER').run();
  if (!it.some((c) => c.name === 'photo')) await env.DB.prepare('ALTER TABLE items ADD COLUMN photo TEXT').run();
  const { results: pu } = await env.DB.prepare('PRAGMA table_info(push)').all();
  if (!pu.some((c) => c.name === 'weigh')) await env.DB.batch(['weigh', 'msg'].map((c) => env.DB.prepare(`ALTER TABLE push ADD COLUMN ${c} TEXT`)));
  await env.DB.prepare('DELETE FROM burn WHERE active > 15000 OR resting > 15000').run(); // foute invoer uit test opdracht
  await env.DB.prepare('UPDATE burn SET active = ROUND(active / 1000.0), kcal = ROUND(active / 1000.0) + COALESCE(resting, 0) WHERE active > 6000').run(); // "11.823" als duizendtal gelezen
  schemaOk = true;
}

async function hash(pw, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/../g), (h) => parseInt(h, 16)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `${hex(salt)}:${hex(bits)}`;
}

async function session(env, u) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').bind(token, u.id, now()).run();
  return Response.json({ token, admin: await isAdmin(u.name) });
}

// Bestaande gebruiker inloggen, of nieuwe aanmaken die op goedkeuring wacht.
async function loginOrRequest(env, name, pw) {
  let u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
  if (!u) {
    await env.DB.prepare('INSERT INTO users (name, pw, approved, created_at) VALUES (?, ?, 0, ?)').bind(name, pw, now()).run();
    return Response.json({ pending: true });
  }
  if (!u.approved) return Response.json({ error: 'Je account wacht nog op goedkeuring' }, { status: 403 });
  return session(env, u);
}

// POST {name, pw} -> {pending}
export async function register({ request, env }) {
  const { name: n, pw } = await request.json();
  const name = clean(n);
  if (!name || name === ADMIN || name.includes('@') || !pw || pw.length < 8) {
    return Response.json({ error: 'Kies een naam en een wachtwoord van min. 8 tekens' }, { status: 400 });
  }
  if (await env.DB.prepare('SELECT 1 FROM users WHERE name = ?').bind(name).first()) {
    return Response.json({ error: 'Naam is al in gebruik' }, { status: 409 });
  }
  return loginOrRequest(env, name, await hash(pw));
}

// POST {name, pw} -> {token, admin}
export async function login({ request, env }) {
  const { name: n, pw } = await request.json();
  const name = clean(n);
  if (name === ADMIN) {
    if (!env.APP_SECRET || pw !== env.APP_SECRET) return Response.json({ error: 'Naam of wachtwoord klopt niet' }, { status: 401 });
    await env.DB.prepare('INSERT OR IGNORE INTO users (name, pw, approved, created_at) VALUES (?, ?, 1, ?)').bind(ADMIN, '-', now()).run();
    const u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(ADMIN).first();
    // Items van vóór het inloggen horen bij admin.
    await env.DB.prepare('UPDATE items SET user_id = ? WHERE user_id IS NULL').bind(u.id).run();
    return session(env, u);
  }
  const u = await env.DB.prepare('SELECT * FROM users WHERE name = ?').bind(name).first();
  const ok = u && u.pw.includes(':') && (await hash(pw || '', u.pw.split(':')[0])) === u.pw;
  if (!ok) return Response.json({ error: 'Naam of wachtwoord klopt niet' }, { status: 401 });
  if (!u.approved) return Response.json({ error: 'Je account wacht nog op goedkeuring' }, { status: 403 });
  return session(env, u);
}

// POST {credential} (Google ID-token) -> {token, admin} of {pending}
export async function google({ request, env }) {
  const { credential } = await request.json();
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential || '')}`);
  const t = res.ok ? await res.json() : {};
  if (t.aud !== env.GOOGLE_CLIENT_ID || t.email_verified !== 'true' || !t.email) {
    return Response.json({ error: 'Google-inlog mislukt' }, { status: 401 });
  }
  return loginOrRequest(env, clean(t.email), 'google');
}

// Bearer-token -> goedgekeurde gebruiker of null
export async function currentUser(request, env) {
  const token = (request.headers.get('authorization') || '').trim().replace(/^bearer\s*/i, '').trim(); // iOS-opdracht: hoofdletters/spaties maken niet uit
  if (!token) return null;
  const u = await env.DB.prepare('SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.approved = 1').bind(token).first();
  return u && { ...u, admin: await isAdmin(u.name) };
}

// Admin: POST {id, ok} -> nieuwe gebruiker goedkeuren of weigeren (lijst: ai.adminUsers)
export async function decide({ request, env }) {
  const { id, ok } = await request.json();
  await env.DB.prepare(ok ? 'UPDATE users SET approved = 1 WHERE id = ?' : 'DELETE FROM users WHERE id = ? AND approved = 0').bind(id).run();
  return new Response(null, { status: 204 });
}

// Sleutel voor de iOS-opdracht: een eigen sessie die blijft bestaan na uitloggen op de telefoon.
export async function syncKey({ env, user }) { return session(env, user); }

// Uitloggen: alleen deze sessie. Account verwijderen: gebruiker met al zijn data.
export const token = (request) => (request.headers.get('authorization') || '').replace('Bearer ', '');
export async function logout({ request, env }) {
  await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token(request)).run();
  return new Response(null, { status: 204 });
}
export async function deleteAccount({ env, user }) {
  await env.DB.batch(['items', 'queue', 'meals', 'sessions', 'burn', 'acts', 'weight', 'push'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(user.id))
    .concat(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id), env.DB.prepare('DELETE FROM config WHERE k IN (?, ?)').bind(`ai:${user.id}`, `insight:${user.id}`), env.DB.prepare('DELETE FROM config WHERE k IN (?, ?)').bind(`prog:${user.id}`, `advice:${user.id}`)));
  return new Response(null, { status: 204 });
}
