// De enige plek die de AI-provider kent. Wisselen = alleen dit bestand aanpassen.
// analyseer({text, image, audio, now, memory}, env) -> [{date, product, portion, kcal, protein_g, carbs_g, fat_g, amount, unit}]

const MODEL = 'gemini-3.1-flash-lite';

const PROMPT = (now) => `Je bent een voedingsassistent. Nu is het: ${now}.
Bepaal uit de invoer (tekst, foto en/of spraak) elk gegeten product of gerecht.
Geef per item: date (JJJJ-MM-DD, de dag waarop het gegeten is; standaard de geopende dag als die genoemd is, anders vandaag; alleen bij een expliciete dag ("gisteravond", "zaterdag", een datum) die dag, relatieve woorden omrekenen vanaf de echte datum van nu, niet vanaf de geopende dag),
product (kort, Nederlands), portion (bijv. "1 bord, ca. 350 g"), kcal, protein_g, carbs_g, fat_g (getallen, schatting),
amount + unit: de hoeveelheid waar kcal bij hoort. unit "g" voor vast eten dat je weegt (pasta, kaas, vlees), "ml" voor dranken/vloeibaar, "stuk" voor telbare dingen (boterham, ei, appel, koek).
meal: alleen als de invoer het dagdeel noemt of duidelijk maakt (ontbijt, lunch, avondeten/diner, tussendoor/snack/extraatje, of bijv. "gisteravond" = diner): ontbijt|lunch|diner|snack; anders weglaten.
Gebruik je de foto, let dan op wat de tekst erbij zegt (bijv. "halve portie", "zonder saus").
Geen eten herkend? Geef een lege lijst.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' }, product: { type: 'STRING' }, portion: { type: 'STRING' },
          kcal: { type: 'NUMBER' }, protein_g: { type: 'NUMBER' }, carbs_g: { type: 'NUMBER' }, fat_g: { type: 'NUMBER' },
          amount: { type: 'NUMBER' }, unit: { type: 'STRING', enum: ['g', 'ml', 'stuk'] },
          meal: { type: 'STRING', enum: ['ontbijt', 'lunch', 'diner', 'snack'] },
        },
        required: ['date', 'product', 'portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'amount', 'unit'],
      },
    },
  },
  required: ['items'],
};

export async function analyseer({ text, image, audio, now, memory, fast }, env, userId) {
  const parts = [{ text: PROMPT(now) }];
  if (memory) parts.push({ text: memory });
  if (text) parts.push({ text: `Invoer: ${text}` });
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  if (audio) parts.push({ inline_data: { mime_type: audio.mime, data: audio.data } });
  const out = await ask(parts, { responseMimeType: 'application/json', responseSchema: SCHEMA }, env, userId, fast);
  return JSON.parse(out || '{"items":[]}').items || [];
}

// Spraak → tekst via Groq Whisper (losse spraakdienst, gratis 2000/dag): telt niet mee in de AI-limiet.
export async function transcribe({ request, env }) {
  const { audio } = await request.json();
  if (!env.GROQ_API_KEY) return Response.json({ error: 'GROQ_API_KEY ontbreekt' }, { status: 502 });
  const form = new FormData();
  const ext = audio.mime.includes('webm') ? 'webm' : audio.mime.includes('ogg') ? 'ogg' : 'm4a';
  form.append('file', new Blob([Uint8Array.from(atob(audio.data), (c) => c.charCodeAt(0))], { type: audio.mime }), `spraak.${ext}`);
  form.append('model', env.WHISPER_MODEL || 'whisper-large-v3');
  form.append('language', 'nl');
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', body: form, signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
  }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) return Response.json({ error: `Whisper ${res.status}: ${(await res.text()).slice(0, 200)}` }, { status: 502 });
  return Response.json({ text: ((await res.json()).text || '').trim() });
}

// Activiteiten: extra verbruik bovenop rust, want rust komt al uit Apple Health.
const ACT = { type: 'OBJECT', properties: { acts: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
  date: { type: 'STRING' }, name: { type: 'STRING' }, minutes: { type: 'NUMBER' }, kcal: { type: 'NUMBER' } }, required: ['date', 'name', 'minutes', 'kcal'] } } }, required: ['acts'] };
export async function activiteit({ text, now, kg }, env, userId) {
  const p = `Je schat verbrande kcal van sport en activiteiten. Nu is het: ${now}. Gewicht: ${kg ? `${kg} kg` : 'onbekend, neem 75 kg'}.
Geef per genoemde activiteit: date (JJJJ-MM-DD; standaard de geopende dag als die genoemd is, anders vandaag; alleen bij een expliciete dag ("gisteren", "zaterdag", een datum) die dag, relatief vanaf de echte datum van nu), name (kort, Nederlands, bijv. "Fietsen, rustig"),
minutes (duur; niet genoemd = gebruikelijke duur), kcal = extra verbruik bovenop rust: (MET − 1) × kg × uren, afgerond. Geen activiteit herkend? Lege lijst.
Invoer: ${text}`;
  const out = await ask([{ text: p }], { responseMimeType: 'application/json', responseSchema: ACT }, env, userId, true);
  return JSON.parse(out || '{"acts":[]}').acts || [];
}

// 14 nov: macro's per portie van een recept (receptenblog).
const REC = { type: 'OBJECT', properties: Object.fromEntries(['kcal', 'protein_g', 'carbs_g', 'fat_g'].map((k) => [k, { type: 'NUMBER' }])), required: ['kcal', 'protein_g', 'carbs_g', 'fat_g'] };
export async function recept({ title, body, servings }, env, userId) {
  const p = `Bereken de voedingswaarde PER PORTIE van dit recept (${servings || 1} porties). Tel de ingrediënten op en deel door het aantal porties. Geef kcal, protein_g, carbs_g, fat_g als afgeronde getallen.
Recept: ${title}
${body}`;
  return JSON.parse(await ask([{ text: p }], { responseMimeType: 'application/json', responseSchema: REC }, env, userId, true) || '{}');
}

// Fase 12: vrije tekst (AI-samenvatting in Inzichten); zelfde limiet en teller.
export const tekst = (prompt, env, userId) => ask([{ text: prompt }], {}, env, userId, true);

// Volgorde live: Gemini (8 s) → Groq (10 s) → wachtrij, die alleen Gemini opnieuw probeert. Elke stap is precies één verzoek.
async function ask(parts, cfg, env, userId, fast) {
  try { return await gemini(parts, cfg, env, userId, fast); } catch (e) {
    if (!fast || e.retry === false || !env.GROQ_API_KEY || parts.some((p) => p.inline_data?.mime_type?.startsWith('audio'))) throw e;
    try { return await groq(parts, cfg, env, userId); } catch (g) { console.log('groq', g.message); e.why = `${e.message.slice(0, 60)} · ${g.message.slice(0, 80)}`; throw e; }
  }
}

async function groq(parts, cfg, env, userId) {
  const content = parts.map((p) => p.text ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } });
  const json = !!cfg.responseSchema;
  if (json) content.push({ type: 'text', text: `Antwoord alleen met JSON volgens dit schema: ${JSON.stringify(cfg.responseSchema)}` });
  // Llama 4 Scout is op 17-07-2026 uitgezet. Modellen verdwijnen vaker: probeer de lijst af, een onbekend model (400/404) kost niets.
  const img = parts.some((p) => p.inline_data);
  const models = [env.GROQ_MODEL, ...(img ? ['qwen/qwen3.8-27b'] : ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'])].filter(Boolean);
  let res;
  for (const model of models) {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], ...(json && { response_format: { type: 'json_object' } }) }),
    });
    if (res.ok || ![400, 404].includes(res.status)) break;
    console.log('groq', model, res.status, (await res.clone().text()).slice(0, 200));
  }
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (userId) { const u = await usage(env, userId); await saveUsage(env, { d: u.d, n: u.n + 1, full: u.full }, `ai:${userId}`); }
  return (await res.json()).choices?.[0]?.message?.content || '';
}

async function gemini(parts, generationConfig, env, userId, fast) {
  const mine = userId ? await usage(env, userId) : null;
  if (mine && mine.n >= mine.limit) throw Object.assign(new Error(`AI-daglimiet bereikt (${mine.n}/${mine.limit}). Kies een groter abonnement via Instellingen, of wacht tot de reset.`), { retry: false, limit: true });
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || MODEL}:generateContent`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(fast ? 8000 : 25000), // live snel opgeven → Groq → wachtrij; wachtrij < 1 min (cron)
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    },
  );
  if (res.status === 429) {
    // Fase 8: QuotaFailure.quotaId zegt of het de minuut- of daglimiet is.
    const body = await res.text();
    const day = /PerDay/i.test(body);
    if (day) await saveUsage(env, { ...(await usage(env)), full: true }, 'ai');
    throw Object.assign(new Error(`Gemini 429: ${body.slice(0, 300)}`), { retry: true, quota: day ? 'day' : 'minute' });
  }
  if (res.ok) for (const k of ['ai', userId && `ai:${userId}`].filter(Boolean)) { const u = await usage(env, k === 'ai' ? null : userId); await saveUsage(env, { d: u.d, n: u.n + 1, full: u.full }, k); }
  if (!res.ok) {
    // retry = tijdelijk (drukte/storing): de invoer gaat dan in de wachtrij.
    throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { retry: res.status === 429 || res.status >= 500 });
  }
  const out = await res.json();
  return out.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Fase 8: eigen teller per Pacific-dag (Gemini reset om middernacht Pacific). Totaal (k=ai, voor de echte 429) + per gebruiker (k=ai:<id>).
// Per gebruiker een limiet per abonnement; betaald abonnement = aanvraag die de beheerder goedkeurt.
export const PLANS = { free: 10, plus: 40, pro: 100 };
const pacific = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
export async function usage(env, userId) {
  const k = userId ? `ai:${userId}` : 'ai';
  const row = await env.DB.prepare('SELECT v FROM config WHERE k = ?').bind(k).first();
  const u = row ? JSON.parse(row.v) : {};
  const out = u.d === pacific() ? u : { d: pacific(), n: 0, full: false };
  if (userId) {
    const p = await env.DB.prepare('SELECT plan, req FROM users WHERE id = ?').bind(userId).first();
    out.plan = PLANS[p?.plan] ? p.plan : 'free'; out.limit = PLANS[out.plan]; out.req = p?.req || null;
  }
  return out;
}
const saveUsage = (env, u, k) => env.DB.prepare('INSERT OR REPLACE INTO config (k, v) VALUES (?, ?)').bind(k, JSON.stringify(u)).run();

// GET /api/ai -> {used, limit, plan, req, full, reset, admin, todo}; reset = volgende middernacht Pacific (ISO). todo = wachtende users + aanvragen.
export async function status({ env, user }) {
  const u = await usage(env, user.id);
  const g = await usage(env);
  const now = new Date();
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const reset = new Date(now.getTime() + (new Date(la).setHours(24, 0, 0, 0) - la.getTime()));
  const todo = user.admin ? (await env.DB.prepare('SELECT COUNT(*) n FROM users WHERE approved = 0 OR req IS NOT NULL').first()).n : 0;
  return Response.json({ used: u.n, limit: u.limit, plan: u.plan, req: u.req, full: u.n >= u.limit || !!g.full, reset: reset.toISOString(), admin: user.admin, todo });
}

// POST /api/plan {plan}: omlaag of aanvraag intrekken gaat direct; omhoog wordt een aanvraag (beheerder zelf: direct).
export async function plan({ request, env, user }) {
  const { plan: want } = await request.json().catch(() => ({}));
  if (!PLANS[want]) return Response.json({ error: 'Onbekend abonnement' }, { status: 400 });
  const u = await usage(env, user.id);
  const now = want === 'free' || want === u.plan || PLANS[want] < PLANS[u.plan] || user.admin;
  await env.DB.prepare(now ? 'UPDATE users SET plan = ?, req = NULL WHERE id = ?' : 'UPDATE users SET req = ? WHERE id = ?').bind(want, user.id).run();
  return status({ env, user });
}

// Beheer: GET alle gebruikers met abonnement, aanvraag en AI-gebruik vandaag; POST {id, plan} zet abonnement (plan leeg = aanvraag weigeren).
export async function adminUsers({ env }) {
  const { results } = await env.DB.prepare(`SELECT u.id, u.name, u.approved, u.plan, u.req, u.created_at, c.v ai FROM users u
    LEFT JOIN config c ON c.k = 'ai:' || u.id ORDER BY u.approved, u.req IS NULL, u.name`).all();
  const d = pacific();
  return Response.json({ plans: PLANS, users: results.map(({ ai, ...u }) => { const a = ai ? JSON.parse(ai) : {}; return { ...u, plan: PLANS[u.plan] ? u.plan : 'free', used: a.d === d ? a.n : 0 }; }) });
}
export async function setPlan({ request, env }) {
  const { id, plan: p } = await request.json();
  const q = PLANS[p] ? env.DB.prepare('UPDATE users SET plan = ?, req = NULL WHERE id = ?').bind(p, id) : env.DB.prepare('UPDATE users SET req = NULL WHERE id = ?').bind(id);
  await q.run();
  return adminUsers({ env });
}
