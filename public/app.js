const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

let token = localStorage.getItem('treck-token');
let admin = localStorage.getItem('treck-admin') === '1';

let day = iso(new Date());
const svg = (i, c = '') => `<svg class="ic ${c}"><use href="#i-${i}"/></svg>`;
const say = (t) => { $('status').textContent = t; clearTimeout(say.t); say.t = setTimeout(() => { $('status').textContent = ''; }, 5000); };
// Fase 10: automatisch een icoon per item, op trefwoord in de productnaam (geen AI-verzoek).
const FOOD = [['\u{1F963}', 'muesli|granola|cruesli|havermout|oat|ontbijtgran|cornflakes|pap\\b'], ['\u{1F373}', 'ei\\b|eieren|eitje|omelet|egg'], ['\u{1F95E}', 'pannenkoek|pancake|poffert'], ['\u{1F96A}', 'boterham|sandwich|tosti|broodje|wrap'], ['\u{1F950}', 'croissant|crois'], ['\u{1F35E}', 'brood|toast|beschuit|cracker|rijstwafel|knäck'],
  ['\u{1F9C0}', 'kaas|cheese'], ['\u{1F95B}', 'melk|milk|karnemelk|chocomel'], ['\u{1F366}', 'ijs\\b|ijsje|softijs'], ['\u{1F944}', 'yoghurt|kwark|skyr|vla|pudding'], ['\u{1F35D}', 'pasta|spaghetti|macaroni|penne|lasagne|bolognese|tagliatelle'], ['\u{1F355}', 'pizza'],
  ['\u{1F354}', 'burger'], ['\u{1F35F}', 'friet|patat|fries'], ['\u{1F363}', 'sushi'], ['\u{1F35C}', 'noodle|ramen|bami|mie\\b|pho'], ['\u{1F35A}', 'rijst|nasi|risotto|rice|couscous|quinoa'], ['\u{1F32E}', 'taco|burrito|nacho|quesad'],
  ['\u{1F372}', 'soep|stoof|curry|chili|stamppot|soup|hutspot'], ['\u{1F957}', 'salade|salad|sla\\b|rauwkost'], ['\u{1F357}', 'kip|chicken|kalkoen|shoarma|kebab|gyros'], ['\u{1F969}', 'biefstuk|steak|vlees|gehakt|rund|varken|karbonade|worst|ham\\b|spek|bacon|frikandel|kroket|bitterbal'], ['\u{1F41F}', 'vis\\b|zalm|tonijn|kabeljauw|haring|makreel|garnal|fish|salmon|tuna'], ['\u{1F954}', 'aardappel|potato|puree'],
  ['\u{1F966}', 'broccoli|groente|bloemkool|spinazie|boontje|sperzie|andijvie|courgette|paprika|wortel|bonen|erwt'], ['\u{1F345}', 'tomaat|tomato'], ['\u{1F951}', 'avocado|guacamole'], ['\u{1F34C}', 'banaan|banana'], ['\u{1F34E}', 'appel|apple'], ['\u{1F353}', 'aardbei|framboos|bes\\b|bessen|blauwe bes|fruit'],
  ['\u{1F34A}', 'sinaasappel|mandarijn|orange'], ['\u{1F347}', 'druif|druiven|grape'], ['\u{1F95C}', 'noot|noten|nuts|pinda|amandel|cashew|walnoot'], ['\u{1F36B}', 'chocola|choco|snickers|mars|twix|hagelslag|nutella'], ['\u{1F36A}', 'koek|biscuit|cookie|stroopwafel|speculaas|ontbijtkoek'], ['\u{1F370}', 'taart|gebak|cake|tompouce|appeltaart|brownie|muffin|donut'],
  ['\u{1F36C}', 'snoep|drop|candy|winegum'], ['\u{1F968}', 'chips|popcorn|zoutje|borrel|pretzel'], ['\u{2615}', 'koffie|coffee|cappuccino|latte|espresso|thee|tea'], ['\u{1F37A}', 'bier|beer|pils|radler'], ['\u{1F377}', 'wijn|wine|prosecco|cava'], ['\u{1F964}', 'cola|fanta|sprite|frisdrank|limonade|ranja|sap\\b|juice|smoothie|shake|ice ?tea|energy|red bull|monster'],
  ['\u{1F4A7}', 'water'], ['\u{1F4AA}', 'eiwit|protein|whey']]
  .map(([e, k]) => [e, new RegExp(k, 'i')]);
const foodIcon = (name) => (FOOD.find(([, r]) => r.test(name || '')) || ['\u{1F37D}\u{FE0F}'])[0];
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
  const { items, total, estimate, queued, burn, burnEst, burnAt, week, month, weights, target } = await api(`/api/items?date=${day}`);
  if (queued) say(`${queued} invoer wacht op verwerking (Gemini druk)`);
  const est = day < iso(new Date()) && estimate; // vergeten dag: schatting, alleen getoond
  const t = est || total;
  $('total').classList.toggle('est', !!est);
  $('total').innerHTML = `${est ? '≈ ' : ''}${t.kcal}<small>kcal</small>`;
  // Fase 9: ring = inname t.o.v. adaptief doel; zonder doel (nog < 14 dagen) t.o.v. verbruik of 2000 kcal.
  const T = target?.kcal ? target : null; showGoal(target?.goal);
  const goal = T?.kcal || burn || 2000, left = goal - t.kcal, f = t.kcal / goal;
  $('arc').style.strokeDashoffset = 326.7 * (1 - Math.min(f, 1));
  $('ring').classList.toggle('over', f > 1.05);
  $('goal').textContent = T ? `van ${T.kcal} doel` : burn ? `van ${burn} verbruik` : 'van 2000 kcal';
  $('why').textContent = T ? T.why : `Doel volgt na 14 gelogde dagen en 2 wegingen (week uit elkaar) · nu ${target?.days ?? 0} d, ${target?.weighs ?? 0} wegingen`;
  $('motto').textContent = est ? 'Geschat op je gemiddelde' : !t.kcal ? (day === iso(new Date()) ? 'Klaar voor een goede dag?' : 'Niets gelogd op deze dag')
    : f < 0.5 ? `Lekker bezig, nog ${left} kcal ruimte` : f < 0.9 ? `Goed op weg, nog ${left} kcal` : f <= 1.05 ? 'Precies op koers' : `${-left} kcal boven je ${T ? 'doel' : 'verbruik'}, morgen weer een dag`;
  $('macros').innerHTML = [['Eiwit', 'protein_g'], ['Koolh.', 'carbs_g'], ['Vet', 'fat_g']]
    .map(([k, m]) => `<div${T ? ` style="--w:${Math.min(100, t[m] / T[m] * 100 || 0)}%"` : ''}><b>${est ? '≈ ' : ''}${t[m]}${T ? `<small>/${T[m]}</small>` : ''} g</b><span>${k}${T && T[m] > t[m] ? ` · nog ${T[m] - t[m]}` : ''}</span></div>`).join('');
  // Fase 4: verbruik (Garmin via Apple Health) per dag; vandaag = tot nu toe.
  const bal = (x, approx = '') => `<b class="${x >= 0 ? 'neg' : 'pos'}">${approx}${x >= 0 ? 'tekort' : 'overschot'} ${Math.abs(x)}</b>`;
  // Tijdstip van de laatste meting: tijdens die dag = "t/m HH:MM", daarna binnengekomen = hele dag.
  const at = burnAt ? new Date(burnAt) : null;
  const upto = !at ? '' : iso(at) === day ? ` t/m ${pad(at.getHours())}:${pad(at.getMinutes())}` : iso(at) > day ? ' hele dag' : '';
  const sum = (p, label) => p.days ? `${label} ${bal(p.diff)} <small>(${p.days} d)</small>` : '';
  $('burnCell').parentNode.classList.toggle('hidden', day > iso(new Date()));
  $('burnVal').textContent = burn == null ? '' : `${burnEst ? '≈ ' : ''}${burn} kcal`;
  $('burn').innerHTML = `Verbruik${upto}<small>${burn == null ? 'Nog niet binnen' : 'Vandaag ' + bal(burn - t.kcal, est || burnEst ? '≈ ' : '')}`
    + `${[sum(week, 'Week'), sum(month, 'Maand')].filter(Boolean).map((x) => `<br>${x}`).join('')}</small>`;
  // Fase 5: gewicht (weegschaal via Apple Health), laatste weging t/m deze dag + lijn van 30 dagen.
  const kg = (x) => x.toFixed(1).replace('.', ',');
  const w = weights.at(-1), w0 = weights[0];
  const pts = weights.map((x) => [(new Date(x.date) - new Date(day)) / 864e5 + 30, x.kg]);
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])) || 1;
  $('weight').innerHTML = `<span class="tile" style="background:#34c759">${svg('scale')}</span><div>Gewicht`
    + (!w ? '<small>Tik om te wegen</small></div><span class="val">Voeg toe</span>' : `<small>${w.date === day ? 'Vandaag' : `${+w.date.slice(8)}-${+w.date.slice(5, 7)}`}`
    + (weights.length > 1 ? ` · 30 d ${w.kg - w0.kg > 0 ? '+' : ''}${kg(w.kg - w0.kg)} kg` : '') + '</small>'
    + (weights.length > 1 ? `<svg viewBox="0 0 30 10" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" points="${pts.map(([x, y]) => `${x},${9 - (y - lo) / (hi - lo || 1) * 8}`).join(' ')}"/></svg>` : '') + `</div><span class="val">${kg(w.kg)} kg</span>`);
  $('list').innerHTML = items.length ? '' : est ? `<li class="empty">Schatting: gemiddelde van ${est.days} ingevulde dag(en) in de 14 dagen ervoor. Voer iets in om te vervangen.</li>` : '<li class="empty">Nog niets ingevoerd</li>';
  for (const i of items) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="food">${foodIcon(i.product)}</span><div></div><span class="kcal"></span><button class="act" aria-label="Bewaar als gerecht">${svg('star')}</button>`;
    li.querySelector('div').textContent = i.product;
    li.querySelector('div').append(Object.assign(document.createElement('small'), { textContent: i.portion }));
    li.querySelector('.kcal').textContent = `${i.kcal}`;
    li.querySelector('div').onclick = () => editor({ title: 'Aanpassen', items: [i], single: true,
      save: async (_, [x]) => { await api('/api/items', { method: 'PUT', body: JSON.stringify({ amount: i.amount, unit: i.unit, ...x, id: i.id }) }); load(); },
      remove: async () => { await api(`/api/items?id=${i.id}`, { method: 'DELETE' }); load(); } });
    const star = li.querySelector('button');
    if (i.fav) { star.innerHTML = svg('star', 'fill'); star.classList.add('on'); star.ariaLabel = 'Uit favorieten'; }
    star.onclick = async () => {
      if (i.fav) {
        await api(`/api/meals?id=${i.fav}`, { method: 'DELETE' });
        say('Uit favorieten gehaald');
      } else {
        const name = prompt('Bewaar deze maaltijd als favoriet, bijv. "Mijn ontbijt":', i.product);
        if (!name) return;
        await api('/api/meals', { method: 'POST', body: JSON.stringify({ input_id: i.input_id, name }) });
        say(`"${name}" bewaard. Typ die naam, of tik hem hierboven aan.`);
      }
      load(); loadQuick();
    };
    li.append(adjust(i, li.querySelector('.kcal')));
    $('list').append(li);
  }
}

// Fase 7: hoeveelheid aanpassen zonder AI. g/ml = slider, stuks/porties = +/−; kcal en macro's schalen mee.
function adjust(i, kcalEl) {
  const base = i.amount || 1, unit = i.unit || 'stuk', grams = unit !== 'stuk';
  const label = (a) => grams ? `${a} ${unit}` : `${String(a).replace('.', ',')}×`;
  const el = document.createElement('div'); el.className = 'adj';
  let cur = base, timer;
  const set = (a) => {
    cur = a; el.querySelector('b').textContent = label(a); kcalEl.textContent = Math.round(i.kcal * a / base);
    clearTimeout(timer); timer = setTimeout(async () => {
      if (cur === base) return;
      const k = cur / base, n = String(cur).replace('.', ','), p = i.portion || '';
      const x = { ...i, amount: cur, unit, portion: grams ? `${cur} ${unit}` : /^\d/.test(p) ? p.replace(/^\d+(?:[.,]\d+)?/, n) : `${n}× ${p}` };
      for (const m of ['kcal', 'protein_g', 'carbs_g', 'fat_g']) x[m] = Math.round(i[m] * k);
      await api('/api/items', { method: 'PUT', body: JSON.stringify(x) }); load();
    }, grams ? 0 : 700);
  };
  if (grams) {
    const max = Math.max(100, Math.ceil(base * 2.5 / 50) * 50), step = max > 500 ? 10 : 5;
    el.innerHTML = `<input type="range" min="${step}" max="${max}" step="${step}" value="${base}" aria-label="Hoeveelheid"><b></b>`;
    const r = el.querySelector('input');
    r.oninput = () => { cur = +r.value; el.querySelector('b').textContent = label(cur); kcalEl.textContent = Math.round(i.kcal * cur / base); };
    r.onchange = () => set(+r.value);
  } else {
    el.innerHTML = `<button class="round" aria-label="Minder">${svg('minus')}</button><b></b><button class="round" aria-label="Meer">${svg('plus')}</button>`;
    const [minus, plus] = el.querySelectorAll('button');
    minus.onclick = () => cur > 0.5 && set(cur - (cur > 1 ? 1 : 0.5));
    plus.onclick = () => set(cur < 1 ? cur + 0.5 : cur + 1);
  }
  el.querySelector('b').textContent = label(base);
  return el;
}

// Fase 2: eigen gerechten en vaak gegeten combinaties met één tik toevoegen.
let meals = [], chips = [];
async function loadQuick() {
  const q = await api('/api/quick');
  meals = q.meals;
  chips = [...q.meals.map((m) => ({ ...m, saved: true })), ...q.combos];
  renderQuick();
}

// Typebalk = zoeken: favorieten sorteren op overeenkomst met wat je typt.
function score(m, words) {
  const hay = `${m.name} ${m.items.map((i) => i.product).join(' ')}`.toLowerCase();
  return words.reduce((s, w) => s + (hay.includes(w) ? 2 : w.length > 3 && hay.includes(w.slice(0, 4)) ? 1 : 0), 0);
}
function renderQuick() {
  const words = $('text').value.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  const list = chips.map((m, n) => ({ m, n, s: score(m, words) })).sort((a, b) => b.s - a.s || a.n - b.n);
  $('quick').innerHTML = '';
  const plus = Object.assign(document.createElement('button'), { className: 'chip add', innerHTML: svg('plus'), ariaLabel: 'Nieuw gerecht' });
  plus.onclick = () => editor({ title: 'Nieuw gerecht', name: '', items: [], save: saveMeal() });
  $('quick').append(plus);
  for (const { m, s } of list) {
    const kcal = m.items.reduce((t, i) => t + i.kcal, 0);
    const b = Object.assign(document.createElement('button'), { className: `chip${words.length && !s ? ' dim' : ''}` });
    b.innerHTML = m.saved ? svg('star', 'fill') : `<span>${foodIcon(m.items[0]?.product)}</span>`;
    b.append(m.name, Object.assign(document.createElement('small'), { textContent: kcal }));
    b.onclick = async () => {
      await api('/api/quick', { method: 'POST', body: JSON.stringify({ items: m.items, date: day, meal_id: m.saved ? m.id : undefined }) });
      say(`${m.name} toegevoegd`); $('text').value = ''; renderQuick(); load();
    };
    $('quick').append(b);
  }
  $('quick').scrollLeft = 0;
}
$('text').addEventListener('input', renderQuick);
const canSend = () => { $('send').disabled = !$('text').value.trim() && !image; };
$('text').addEventListener('input', canSend);
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('send').click(); } });

const saveMeal = (id) => async (name, items) => {
  await api('/api/meals', { method: 'POST', body: JSON.stringify({ id, name, items }) });
  await loadQuick();
};

// Editor: één gegeten item aanpassen, of een preset maken/aanpassen (velden of AI-balk).
const NUMS = [['kcal', 'kcal'], ['protein_g', 'Eiwit'], ['carbs_g', 'Koolh.'], ['fat_g', 'Vet']];
function edRow(i = {}) {
  const r = document.createElement('div');
  r.className = 'edrow';
  r.innerHTML = `<input data-k="product" placeholder="Product"><input data-k="portion" placeholder="Portie"><button aria-label="Wis">${svg('trash')}</button>
    <div class="nums">${NUMS.map(([k, l]) => `<label>${l}<input data-k="${k}" type="number" inputmode="decimal"></label>`).join('')}</div>`;
  r.querySelectorAll('input').forEach((el) => { el.value = i[el.dataset.k] ?? ''; });
  r.querySelector('button').onclick = () => r.remove();
  $('edRows').append(r);
}
let edSave = null, edRemove = null;
$('edDel').onclick = async () => { await edRemove(); $('editor').classList.add('hidden'); };
function editor({ title, name, items, single, save, remove }) {
  $('edDelWrap').classList.toggle('hidden', !remove); edRemove = remove;
  $('edTitle').textContent = title;
  $('edTop').classList.toggle('hidden', !!single); $('edName').value = name || ''; $('edAiText').value = '';
  $('edAdd').classList.toggle('hidden', !!single);
  $('edRows').innerHTML = ''; (items.length ? items : [{}]).forEach(edRow);
  $('edRows').classList.toggle('single', !!single);
  $('edStatus').textContent = '';
  edSave = save;
  $('editor').classList.remove('hidden');
}
$('edAdd').onclick = () => edRow();
$('edCancel').onclick = () => $('editor').classList.add('hidden');
$('edAiBtn').onclick = async () => {
  const text = $('edAiText').value.trim(); if (!text) return;
  $('edStatus').textContent = 'AI vult in…';
  try {
    const { items } = await api('/api/parse', { method: 'POST', body: JSON.stringify({ text, now: new Date().toString() }) });
    $('edRows').innerHTML = ''; items.forEach(edRow);
    if (!$('edName').value) $('edName').value = text;
    $('edStatus').textContent = 'Pas aan waar nodig en sla op.';
  } catch (e) { $('edStatus').textContent = e.message; }
};
$('edSave').onclick = async () => {
  const items = [...$('edRows').children].map((r) => Object.fromEntries([...r.querySelectorAll('input')]
    .map((el) => [el.dataset.k, el.type === 'number' ? Math.round(+el.value || 0) : el.value.trim()]))).filter((i) => i.product);
  if (!items.length) { $('edStatus').textContent = 'Vul minstens één product in.'; return; }
  try { await edSave($('edName').value.trim(), items); $('editor').classList.add('hidden'); }
  catch (e) { $('edStatus').textContent = e.message; }
};

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
  $('photoBtn').classList.add('on'); canSend();
  $('thumb').src = URL.createObjectURL(blob); $('thumbWrap').classList.remove('hidden'); $('text').focus();
};
const clearPhoto = () => {
  image = null; $('photo').value = ''; $('photoBtn').classList.remove('on'); $('thumbWrap').classList.add('hidden'); canSend();
};

$('send').onclick = async () => {
  const text = $('text').value.trim();
  if (!text && !image) return;
  const n = new Date();
  let now = `${DAGEN[n.getDay()]} ${iso(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  if (day !== iso(n)) now += `. Geopende dag in de app: ${DAGEN[new Date(day + 'T12:00').getDay()]} ${day}`; // invoer hoort standaard bij de geopende dag
  $('status').textContent = 'Analyseren…'; $('send').disabled = true;
  try {
    const { items, queued, quota } = await api('/api/analyze', { method: 'POST', body: JSON.stringify({ text, image, now }) });
    say(queued ? (quota === 'day' ? 'AI-daglimiet bereikt: bewaard, verwerkt na de reset.' : quota === 'minute' ? 'Even wachten (AI-minuutlimiet): bewaard, volgt vanzelf.' : 'Gemini is druk: bewaard, wordt automatisch later verwerkt.') : items.length ? `${items.length} item(s) opgeslagen` : 'Geen eten herkend');
    if (items?.length) day = items[0].date;
    $('text').value = ''; $('text').style.height = ''; clearPhoto();
    load(); loadQuick();
  } catch (e) {
    say(`Fout: ${e.message}`);
  }
  canSend();
};


$('thumbX').onclick = clearPhoto;

// Fase 7: onderbalk. Alleen Vandaag werkt; de rest zijn plekken voor latere fases.
for (const b of document.querySelectorAll('#tabs [data-tab]')) b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('act', x === b));
  const today = b.dataset.tab === 'today';
  $('todayView').classList.toggle('hidden', !today); $('soon').classList.toggle('hidden', today);
  document.body.classList.toggle('tab-other', !today); if (!today) $('soonI').setAttribute('href', `#${b.dataset.i}`);
  $('soonT').textContent = { recipes: 'Recepten en gerechten op maat', insights: 'AI-analyse en voortgang', plan: 'Voedingsprogramma\'s' }[b.dataset.tab] || '';
  scrollTo(0, 0);
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
  $('meals').innerHTML = meals.length ? '' : '<li class="empty">Nog geen gerechten. Tik de ster bij een item, of + bij Snel toevoegen.</li>';
  for (const m of meals) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="food">${foodIcon(m.items[0]?.product)}</span><div></div><button class="act" aria-label="Wis gerecht">${svg('trash')}</button>`;
    li.querySelector('div').textContent = m.name;
    li.querySelector('div').append(Object.assign(document.createElement('small'), { textContent: m.items.map((i) => i.product).join(', ') }));
    li.querySelector('div').onclick = () => { $('sheet').classList.add('hidden'); editor({ title: 'Gerecht', name: m.name, items: m.items, save: saveMeal(m.id),
      remove: async () => { await api(`/api/meals?id=${m.id}`, { method: 'DELETE' }); await loadQuick(); load(); } }); };
    li.querySelector('button').onclick = async () => { await api(`/api/meals?id=${m.id}`, { method: 'DELETE' }); await loadQuick(); load(); li.remove(); };
    $('meals').append(li);
  }
  $('sheet').classList.remove('hidden');
  api('/api/ai').then(showAi).catch(() => {});
};
// Fase 8: AI-limietbalk + nep-abonnement (gratis 10/dag, abonnement 100/dag).
function showAi({ used, limit, plan, full, reset }) {
  $('aiBar').classList.toggle('full', full);
  $('aiTxt').textContent = full ? `vol · ${used}/${limit}` : `${used}/${limit}`;
  $('aiSub').textContent = `Verzoeken vandaag · reset ${new Date(reset).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
  $('aiFill').style.width = `${full ? 100 : Math.min(100, (used / limit) * 100)}%`;
  $('planSub').textContent = plan === 'pro' ? 'Actief (proef): 100 per dag · tik om op te zeggen' : 'Gratis: 10 per dag · tik voor 100 per dag';
}
const GOALS = { lose: 'Afvallen (−0,5 kg/week)', keep: 'Op gewicht blijven', gain: 'Aankomen (+0,25 kg/week)' };
function showGoal(g) { $('goalSub').textContent = GOALS[g] || GOALS.lose; }
$('goalBtn').onclick = () => api('/api/goal', { method: 'POST' }).then(({ goal }) => { showGoal(goal); load(); });
$('planBtn').onclick = () => api('/api/plan', { method: 'POST' }).then(showAi);
$('closeSheet').onclick = () => $('sheet').classList.add('hidden');
$('sheet').onclick = (e) => { if (e.target === $('sheet')) $('sheet').classList.add('hidden'); };
$('garminBtn').onclick = () => {
  $('sheet').classList.add('hidden'); $('garmin').classList.remove('hidden');
  api('/api/burn').then(({ days }) => { // controle: wat de iOS-opdracht heeft gestuurd
    $('burns').innerHTML = days.length ? days.map((b) => `<li><div>${b.date}<small>actief ${b.active ?? '–'} · rust ${b.resting ?? '–'} · ontvangen ${new Date(b.updated_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</small></div><span class="kcal">${b.kcal}</span></li>`).join('') : '<li class="empty">Nog niets ontvangen</li>';
  });
};
// Handmatig wegen: tik op de gewichtregel, geldt voor de geopende dag (overschrijft die dag).
$('weight').onclick = async () => {
  const v = prompt(`Gewicht op ${day === iso(new Date()) ? 'vandaag' : day} (kg):`);
  if (!v) return;
  try { await api('/api/weight', { method: 'POST', body: JSON.stringify({ date: day, kg: v }) }); load(); } catch (e) { alert(e.message); }
};
$('closeGarmin').onclick = () => $('garmin').classList.add('hidden');
$('syncKey').onclick = async () => {
  const { token: k } = await api('/api/synckey', { method: 'POST' });
  try { await navigator.clipboard.writeText(k); alert('Sleutel gekopieerd. Plak hem in de iOS-opdracht bij "Bearer ".'); }
  catch { prompt('Kopieer deze sleutel voor de iOS-opdracht:', k); }
};
$('burnClear').onclick = async () => {
  if (!confirm('Al het ontvangen verbruik wissen? De iOS-opdracht vult het daarna weer aan.')) return;
  await api('/api/burn', { method: 'DELETE' }); $('burns').innerHTML = '<li class="empty">Nog niets ontvangen</li>'; load();
};
// Fase 6: herinneringen via Web Push (iOS: alleen als beginscherm-app).
navigator.serviceWorker?.register('sw.js');
$('pushBtn').onclick = async () => {
  if (!('Notification' in window) || !navigator.serviceWorker) return alert('Meldingen werken alleen als TRECK op je beginscherm staat (iOS 16.4+).');
  const perm = Notification.requestPermission(); // direct in de tik, anders weigert iOS
  try {
    const { publicKey, times, weigh } = await api('/api/push');
    const t = prompt('Herinneren om (bijv. 12:30, 20:00). Leeg = uit:', times ? times.replace(/,/g, ', ') : '10:00, 14:00, 20:00, 22:00');
    if (t === null) return;
    const w = prompt('Wekelijks wegen (dag en tijd, bijv. ma 08:00). Leeg = uit:', weigh || 'ma 08:00');
    if (w === null) return;
    let sub = null;
    if (t.trim() || w.trim()) {
      if (await perm !== 'granted') return alert('Meldingen geweigerd. Zet ze aan via iOS Instellingen → Meldingen → TRECK.');
      const reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) });
    }
    const r = await api('/api/push', { method: 'POST', body: JSON.stringify({ sub, times: t, weigh: w }) });
    alert(r.times || r.weigh ? `Eten: ${r.times.replace(/,/g, ', ') || 'uit'}\nWegen: ${r.weigh || 'uit'}\nJe krijgt nu een testmelding.` : 'Meldingen staan uit.');
  } catch (e) { alert(e.message); }
};
$('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); bye(); };
$('delAccount').onclick = async () => {
  if (!confirm('Account en al je gegevens definitief verwijderen?')) return;
  await api('/api/account', { method: 'DELETE' }); bye();
};

if (token) { ['app', 'tabs', 'compose'].forEach((x) => $(x).classList.remove('hidden')); load(); loadQuick(); if (admin) loadPending(); }
else { $('login').classList.remove('hidden'); setupGoogle(); }
$('text').oninput = (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
