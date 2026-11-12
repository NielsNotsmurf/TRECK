// De enige plek die de AI-provider kent. Wisselen = alleen dit bestand aanpassen.
// analyseer({text, image, audio, now, memory}, env) -> [{date, product, portion, kcal, protein_g, carbs_g, fat_g}]

const MODEL = 'gemini-3.1-flash-lite';

const PROMPT = (now) => `Je bent een voedingsassistent. Nu is het: ${now}.
Bepaal uit de invoer (tekst, foto en/of spraak) elk gegeten product of gerecht.
Geef per item: date (JJJJ-MM-DD, de dag waarop het gegeten is; "gisteravond", "zaterdag" e.d. omrekenen vanaf nu; standaard de geopende dag als die genoemd is, anders vandaag),
product (kort, Nederlands), portion (bijv. "1 bord, ca. 350 g"), kcal, protein_g, carbs_g, fat_g (getallen, schatting).
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
        },
        required: ['date', 'product', 'portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
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
  if (!res.ok) {
    // retry = tijdelijk (drukte/storing): de invoer gaat dan in de wachtrij.
    throw Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { retry: res.status === 429 || res.status >= 500 });
  }
  const out = await res.json();
  const json = out.candidates?.[0]?.content?.parts?.[0]?.text || '{"items":[]}';
  return JSON.parse(json).items;
}
