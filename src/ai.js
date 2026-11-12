// De enige plek die de AI-provider kent. Wisselen = alleen dit bestand aanpassen.
// analyseer({text, image, audio, now, memory}, env) -> [{date, product, portion, kcal, protein_g, carbs_g, fat_g, amount, unit}]

const MODEL = 'gemini-3.1-flash-lite';

const PROMPT = (now) => `Je bent een voedingsassistent. Nu is het: ${now}.
Bepaal uit de invoer (tekst, foto en/of spraak) elk gegeten product of gerecht.
Geef per item: date (JJJJ-MM-DD, de dag waarop het gegeten is; "gisteravond", "zaterdag" e.d. omrekenen vanaf nu; standaard de geopende dag als die genoemd is, anders vandaag),
product (kort, Nederlands), portion (bijv. "1 bord, ca. 350 g"), kcal, protein_g, carbs_g, fat_g (getallen, schatting),
amount + unit: de hoeveelheid waar kcal bij hoort. unit "g" voor vast eten dat je weegt (pasta, kaas, vlees), "ml" voor dranken/vloeibaar, "stuk" voor telbare dingen (boterham, ei, appel, koek).
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
        },
        required: ['date', 'product', 'portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'amount', 'unit'],
      },
    },
  },
  required: ['items'],
};

export async function analyseer({ text, image, audio, now, memory }, env) {
  const parts = [{ text: PROMPT(now) }];
  if (memory) parts.push({ text: memory });
  if (text) parts.push({ text: `Invoer: ${text}` });
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  if (audio) parts.push({ inline_data: { mime_type: audio.mime, data: audio.data } });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL || MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    },
  );
  if (res.status === 429) {
    // Fase 8: QuotaFailure.quotaId zegt of het de minuut- of daglimiet is.
    const body = await res.text();
    const day = /PerDay/i.test(body);
    if (day) await saveUsage(env, { ...(await usage(env)), full: true });
    throw Object.assign(new Error(`Gemini 429: ${body.slice(0, 300)}`), { retry: true, quota: day ? 'day' : 'minute' });
  }
  if (res.ok) { const u = await usage(env); await saveUsage(env, { ...u, n: u.n + 1 }); }
  if (!res.ok) {
    // retry = tijdelijk (drukte/storing): de invoer gaat dan in de wachtrij.
    throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { retry: res.status === 429 || res.status >= 500 });
  }
  const out = await res.json();
  const json = out.candidates?.[0]?.content?.parts?.[0]?.text || '{"items":[]}';
  return JSON.parse(json).items;
}

// Fase 8: eigen teller per Pacific-dag (Gemini reset om middernacht Pacific; stuurt geen resterend-headers).
const pacific = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
export async function usage(env) {
  const row = await env.DB.prepare("SELECT v FROM config WHERE k = 'ai'").first();
  const u = row ? JSON.parse(row.v) : {};
  return u.d === pacific() ? u : { d: pacific(), n: 0, full: false };
}
const saveUsage = (env, u) => env.DB.prepare("INSERT OR REPLACE INTO config (k, v) VALUES ('ai', ?)").bind(JSON.stringify(u)).run();

// GET /api/ai -> {used, limit, full, reset} ; reset = volgende middernacht Pacific (ISO).
export async function status({ env }) {
  const u = await usage(env);
  const now = new Date();
  const la = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const reset = new Date(now.getTime() + (new Date(la).setHours(24, 0, 0, 0) - la.getTime()));
  return Response.json({ used: u.n, limit: Number(env.AI_DAY_LIMIT) || 100, full: !!u.full, reset: reset.toISOString() });
}
