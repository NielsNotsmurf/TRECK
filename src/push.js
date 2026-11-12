// Fase 6: herinneringen via Web Push (zonder payload; sw.js haalt de tekst op via /api/pushmsg). VAPID-sleutel wordt eenmalig gemaakt en server-side in D1 bewaard.
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const nlNow = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 16); // "JJJJ-MM-DD UU:MM"

async function vapid(env) {
  const row = await env.DB.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  if (row) return JSON.parse(row.v);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
  await env.DB.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run();
  return vapid(env); // bij gelijktijdige aanmaak wint de eerste
}

// Stuurt één lege push; geeft false als het abonnement verlopen is.
async function send(env, sub) {
  const v = await vapid(env);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: new URL(sub.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 43200, sub: sub.origin })}`;
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  const res = await fetch(sub.endpoint, { method: 'POST', headers: { authorization: `vapid t=${unsigned}.${b64u(sig)}, k=${v.pub}`, ttl: '3600', urgency: 'normal' } });
  return !(res.status === 404 || res.status === 410);
}

// GET ?e=endpoint (zonder login, voor sw.js) -> tekst van de laatste melding
export async function msg({ request, env }) {
  const row = await env.DB.prepare('SELECT msg FROM push WHERE endpoint = ?').bind(new URL(request.url).searchParams.get('e')).first();
  return Response.json({ msg: row?.msg || null });
}

// GET -> {publicKey, times, weigh}
export async function get({ env, user }) {
  const row = await env.DB.prepare('SELECT times, weigh FROM push WHERE user_id = ?').bind(user.id).first();
  return Response.json({ publicKey: (await vapid(env)).pub, times: row?.times || '', weigh: row?.weigh || '' });
}

// POST {sub, times:"12:30,20:00", weigh:"ma 08:00"} -> opslaan + testmelding. Lege times = uit.
export async function save({ request, env, user }) {
  const b = await request.json();
  const times = (b.times || '').match(/\d{1,2}[:.]\d{2}/g)?.map((t) => t.replace('.', ':').padStart(5, '0')).sort().join(',') || '';
  const w = (b.weigh || '').toLowerCase().match(/(ma|di|wo|do|vr|za|zo)\D*(\d{1,2})[:.](\d{2})/);
  const weigh = w ? `${w[1]} ${w[2].padStart(2, '0')}:${w[3]}` : '';
  if (!(times || weigh) || !b.sub?.endpoint) {
    await env.DB.prepare('DELETE FROM push WHERE user_id = ?').bind(user.id).run();
    return Response.json({ times: '', weigh: '' });
  }
  const sub = { endpoint: b.sub.endpoint, origin: new URL(request.url).origin };
  await env.DB.prepare('INSERT OR REPLACE INTO push (user_id, endpoint, origin, times, sent, weigh, msg) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(user.id, sub.endpoint, sub.origin, times, nlNow(), weigh, 'Meldingen staan aan.').run();
  await send(env, sub);
  return Response.json({ times, weigh });
}

// Cron (elke minuut): stuur per gekozen tijd één melding, binnen 30 min na die tijd.
export async function remind(env) {
  const now = nlNow(), [today, hm] = now.split(' ');
  const mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const dag = new Date().toLocaleDateString('nl-NL', { weekday: 'short', timeZone: 'Europe/Amsterdam' }).slice(0, 2);
  const { results } = await env.DB.prepare('SELECT * FROM push').all();
  for (const r of results) {
    const slots = r.times.split(',').filter(Boolean).map((t) => [t, 'Al ingevoerd wat je gegeten hebt?']);
    if (r.weigh?.startsWith(dag)) slots.push([r.weigh.slice(3), 'Tijd om te wegen: tik op je gewicht in TRECK.']);
    const s = slots.sort((a, b) => (a[0] > b[0]) - (a[0] < b[0])).filter(([t]) => t <= hm && mins(hm) - mins(t) < 30).pop(); // zelfde tijd: wegen wint
    if (!s || r.sent >= `${today} ${s[0]}`) continue;
    await env.DB.prepare('UPDATE push SET sent = ?, msg = ? WHERE user_id = ?').bind(now, s[1], r.user_id).run();
    if (!(await send(env, r))) await env.DB.prepare('DELETE FROM push WHERE user_id = ?').bind(r.user_id).run();
  }
}
