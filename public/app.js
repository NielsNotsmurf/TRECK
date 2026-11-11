const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

let token = localStorage.getItem('treck-token');
let admin = localStorage.getItem('treck-admin') === '1';

let day = iso(new Date());
let image = null, audio = null, rec = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
  if (res.status === 401 && token) { localStorage.removeItem('treck-token'); location.reload(); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.status === 204 ? null : res.json();
}

async function load() {
  const d = new Date(day + 'T12:00');
  $('day').textContent = day === iso(new Date()) ? 'Vandaag' : `${DAGEN[d.getDay()]} ${d.getDate()}-${d.getMonth() + 1}`;
  const { items, total, queued } = await api(`/api/items?date=${day}`);
  if (queued) $('status').textContent = `${queued} invoer wacht op verwerking (Gemini druk)`;
  $('total').textContent = `${total.kcal} kcal`;
  $('macros').textContent = `E ${total.protein_g} g · K ${total.carbs_g} g · V ${total.fat_g} g`;
  $('list').innerHTML = '';
  for (const i of items) {
    const li = document.createElement('li');
    li.innerHTML = `<div></div><span></span><button aria-label="Wis">×</button>`;
    li.querySelector('div').textContent = i.product;
    li.querySelector('div').append(Object.assign(document.createElement('small'), { textContent: i.portion }));
    li.querySelector('span').textContent = `${i.kcal}`;
    li.querySelector('button').onclick = async () => { await api(`/api/items?id=${i.id}`, { method: 'DELETE' }); load(); };
    $('list').append(li);
  }
}

function shift(n) { const d = new Date(day + 'T12:00'); d.setDate(d.getDate() + n); day = iso(d); load(); }
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);

const b64 = (blob) => new Promise((ok) => {
  const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.readAsDataURL(blob);
});

// Foto verkleinen tot max 1024 px: minder tokens, sneller versturen.
$('photo').onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: img.width * s, height: img.height * s });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
  image = { mime: 'image/jpeg', data: await b64(blob) };
  $('photoBtn').classList.add('on');
};

$('mic').onclick = async () => {
  if (rec) { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      audio = { mime: (rec.mimeType || 'audio/mp4').split(';')[0], data: await b64(blob) };
      rec = null;
      $('mic').textContent = 'Opname ✓';
    };
    rec.start();
    $('mic').textContent = 'Stop'; $('mic').classList.add('on');
  } catch {
    $('status').textContent = 'Microfoon werkt niet; gebruik de dicteerknop van je toetsenbord.';
  }
};

$('send').onclick = async () => {
  const text = $('text').value.trim();
  if (!text && !image && !audio) return;
  const n = new Date();
  const now = `${DAGEN[n.getDay()]} ${iso(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  $('status').textContent = 'Analyseren…'; $('send').disabled = true;
  try {
    const { items, queued } = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ text, image, audio, now }) });
    $('status').textContent = queued ? 'Gemini is druk: bewaard, wordt automatisch later verwerkt.' : items.length ? `${items.length} item(s) opgeslagen` : 'Geen eten herkend';
    if (items?.length) day = items[0].date;
    $('text').value = ''; image = audio = null; $('photo').value = '';
    $('photoBtn').classList.remove('on'); $('mic').classList.remove('on'); $('mic').textContent = 'Opnemen';
      } catch (e) {
    $('status').textContent = `Fout: ${e.message}`;
  }
  $('send').disabled = false;
};


// Inloggen / account aanvragen
const creds = () => JSON.stringify({ name: $('name').value, pw: $('pw').value });
$('registerBtn').onclick = async () => {
  try {
    await api('/api/register', { method: 'POST', body: creds() });
    $('loginStatus').textContent = 'Aangevraagd. Je kunt inloggen zodra je bent goedgekeurd.';
  } catch (e) { $('loginStatus').textContent = e.message; }
};
$('login').onsubmit = async (e) => {
  e.preventDefault();
  try {
    loggedIn(await api('/api/login', { method: 'POST', body: creds() }));
  } catch (e) { $('loginStatus').textContent = e.message; }
};
function loggedIn(r) {
  if (r.pending) { $('loginStatus').textContent = 'Aangevraagd. Je kunt inloggen zodra je bent goedgekeurd.'; return; }
  localStorage.setItem('treck-token', r.token); localStorage.setItem('treck-admin', r.admin ? '1' : '0');
  location.reload();
}

// Inloggen met Google (alleen als GOOGLE_CLIENT_ID is ingesteld)
async function setupGoogle() {
  const { googleClientId } = await api('/api/config');
  if (!googleClientId) return;
  const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client' });
  s.onload = () => {
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async ({ credential }) => {
        try { loggedIn(await api('/api/google', { method: 'POST', body: JSON.stringify({ credential }) })); }
        catch (e) { $('loginStatus').textContent = e.message; }
      },
    });
    google.accounts.id.renderButton($('gbtn'), { theme: 'outline', size: 'large', text: 'signin_with', locale: 'nl' });
  };
  document.head.append(s);
}

// Beheerder: wachtende gebruikers goedkeuren of weigeren
async function loadPending() {
  const { users } = await api('/api/pending');
  $('pending').innerHTML = '';
  for (const u of users) {
    const li = document.createElement('li');
    li.innerHTML = '<div></div><button>Goedkeuren</button><button aria-label="Weigeren">×</button>';
    li.querySelector('div').textContent = `Nieuw: ${u.name}`;
    const [ok, no] = li.querySelectorAll('button');
    const decide = (v) => async () => { await api('/api/decide', { method: 'POST', body: JSON.stringify({ id: u.id, ok: v }) }); loadPending(); };
    ok.onclick = decide(true); no.onclick = decide(false);
    $('pending').append(li);
  }
}

if (token) { $('app').classList.remove('hidden'); load(); if (admin) loadPending(); }
else { $('login').classList.remove('hidden'); setupGoogle(); }
