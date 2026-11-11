const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

let key = localStorage.getItem('treck-key');
if (!key) { key = prompt('Toegangscode'); localStorage.setItem('treck-key', key); }

let day = iso(new Date());
let image = null, audio = null, rec = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-key': key } });
  if (res.status === 401) { localStorage.removeItem('treck-key'); location.reload(); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.status === 204 ? null : res.json();
}

async function load() {
  const d = new Date(day + 'T12:00');
  $('day').textContent = day === iso(new Date()) ? 'Vandaag' : `${DAGEN[d.getDay()]} ${d.getDate()}-${d.getMonth() + 1}`;
  const { items, total } = await api(`/api/items?date=${day}`);
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
    const { items } = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ text, image, audio, now }) });
    $('status').textContent = items.length ? `${items.length} item(s) opgeslagen` : 'Geen eten herkend';
    if (items.length) day = items[0].date;
    $('text').value = ''; image = audio = null; $('photo').value = '';
    $('photoBtn').classList.remove('on'); $('mic').classList.remove('on'); $('mic').textContent = 'Opnemen';
    load();
  } catch (e) {
    $('status').textContent = `Fout: ${e.message}`;
  }
  $('send').disabled = false;
};

load();
