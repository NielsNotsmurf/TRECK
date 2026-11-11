const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

let token = localStorage.getItem('treck-token');
let admin = localStorage.getItem('treck-admin') === '1';

let day = iso(new Date());
let image = null;

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
  $('total').innerHTML = `${total.kcal}<small>kcal</small>`;
  $('macros').innerHTML = [['Eiwit', total.protein_g], ['Koolh.', total.carbs_g], ['Vet', total.fat_g]]
    .map(([k, v]) => `<div><b>${v} g</b><span>${k}</span></div>`).join('');
  $('list').innerHTML = items.length ? '' : '<li class="empty">Nog niets ingevoerd</li>';
  for (const i of items) {
    const li = document.createElement('li');
    li.innerHTML = `<div></div><span class="kcal"></span><button aria-label="Bewaar als gerecht">☆</button><button aria-label="Wis">×</button>`;
    li.querySelector('div').textContent = i.product;
    li.querySelector('div').append(Object.assign(document.createElement('small'), { textContent: i.portion }));
    li.querySelector('span').textContent = `${i.kcal}`;
    const [star, del] = li.querySelectorAll('button');
    star.onclick = async () => {
      const name = prompt('Bewaar deze maaltijd als gerecht, bijv. "Mijn ontbijt":', i.product);
      if (!name) return;
      await api('/api/meals', { method: 'POST', body: JSON.stringify({ input_id: i.input_id, name }) });
      $('status').textContent = `"${name}" bewaard. Typ of zeg die naam, of tik hem hierboven aan.`;
      loadQuick();
    };
    del.onclick = async () => { await api(`/api/items?id=${i.id}`, { method: 'DELETE' }); load(); };
    $('list').append(li);
  }
}

// Fase 2: eigen gerechten en vaak gegeten combinaties met één tik toevoegen.
let meals = [];
async function loadQuick() {
  const q = await api('/api/quick');
  meals = q.meals;
  $('quick').innerHTML = '';
  for (const m of [...q.meals.map((m) => ({ ...m, saved: true })), ...q.combos]) {
    const kcal = m.items.reduce((s, i) => s + i.kcal, 0);
    const b = Object.assign(document.createElement('button'), { className: `chip${m.saved ? ' saved' : ''}`, textContent: `${m.saved ? '★ ' : ''}${m.name} · ${kcal}` });
    b.onclick = async () => {
      await api('/api/quick', { method: 'POST', body: JSON.stringify({ items: m.items, date: day }) });
      $('status').textContent = `${m.name} toegevoegd`; load();
    };
    $('quick').append(b);
  }
  $('quickWrap').classList.toggle('hidden', !$('quick').children.length);
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

$('send').onclick = async () => {
  const text = $('text').value.trim();
  if (!text && !image) return;
  const n = new Date();
  const now = `${DAGEN[n.getDay()]} ${iso(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  $('status').textContent = 'Analyseren…'; $('send').disabled = true;
  try {
    const { items, queued } = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ text, image, now }) });
    $('status').textContent = queued ? 'Gemini is druk: bewaard, wordt automatisch later verwerkt.' : items.length ? `${items.length} item(s) opgeslagen` : 'Geen eten herkend';
    if (items?.length) day = items[0].date;
    $('text').value = ''; image = null; $('photo').value = '';
    $('photoBtn').classList.remove('on');
    load(); loadQuick();
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
  $('pendingCard').classList.toggle('hidden', !users.length);
}

// Menu: gerechten beheren, uitloggen, account verwijderen.
const bye = () => { localStorage.removeItem('treck-token'); localStorage.removeItem('treck-admin'); location.reload(); };
$('menuBtn').onclick = () => {
  $('meals').innerHTML = meals.length ? '' : '<li class="empty">Nog geen gerechten. Tik ☆ bij een item om er een te bewaren.</li>';
  for (const m of meals) {
    const li = document.createElement('li');
    li.innerHTML = '<div></div><button aria-label="Wis gerecht">×</button>';
    li.querySelector('div').textContent = m.name;
    li.querySelector('div').append(Object.assign(document.createElement('small'), { textContent: m.items.map((i) => i.product).join(', ') }));
    li.querySelector('button').onclick = async () => { await api(`/api/meals?id=${m.id}`, { method: 'DELETE' }); await loadQuick(); li.remove(); };
    $('meals').append(li);
  }
  $('sheet').classList.remove('hidden');
};
$('closeSheet').onclick = () => $('sheet').classList.add('hidden');
$('sheet').onclick = (e) => { if (e.target === $('sheet')) $('sheet').classList.add('hidden'); };
$('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); bye(); };
$('delAccount').onclick = async () => {
  if (!confirm('Account en al je gegevens definitief verwijderen?')) return;
  await api('/api/account', { method: 'DELETE' }); bye();
};

if (token) { $('app').classList.remove('hidden'); load(); loadQuick(); if (admin) loadPending(); }
else { $('login').classList.remove('hidden'); setupGoogle(); }
$('text').oninput = (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
