const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const today = () => iso(new Date());
const addDays = (d, n) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return iso(x); };
const dayName = (d) => { const x = new Date(d + 'T12:00'); return d === today() ? 'Vandaag' : d === addDays(today(), -1) ? 'Gisteren' : `${DAGEN[x.getDay()]} ${x.getDate()}-${x.getMonth() + 1}`; };
const kg = (x) => x.toFixed(1).replace('.', ',');

let token = localStorage.getItem('treck-token');
let admin = localStorage.getItem('treck-admin') === '1';

let day = today();
const svg = (i, c = '') => `<svg class="ic ${c}"><use href="#i-${i}"/></svg>`;
const el = (tag, cls, text) => Object.assign(document.createElement(tag), cls ? { className: cls } : {}, text != null ? { textContent: text } : {});
const show = (id) => $(id).classList.remove('hidden'), hide = (id) => $(id).classList.add('hidden');
// Fase 11: maaltijd per item: zelf gekozen, anders afgeleid van het tijdstip van invoer.
const MEALS = { ontbijt: 'Ontbijt', lunch: 'Lunch', diner: 'Avondeten', snack: 'Tussendoor' };
const slotOf = (h) => (h >= 5 && h < 11 ? 'ontbijt' : h >= 11 && h < 15 ? 'lunch' : h >= 17 && h < 22 ? 'diner' : 'snack');
const mealOf = (i) => i.meal || slotOf(new Date(i.created_at).getHours());
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
let image = null, data = {}, yest = [], fresh = null;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
  if (res.status === 401 && token) { localStorage.removeItem('treck-token'); location.reload(); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.status === 204 ? null : res.json();
}

// Fase 11: toast onderin (i.p.v. alert), optioneel met actie zoals "Ongedaan maken".
function toast(text, action, fn) {
  const t = $('toast'); t.innerHTML = ''; t.append(el('span', '', text));
  if (action) { const b = el('button', '', action); b.onclick = () => { hide('toast'); fn(); }; t.append(b); }
  show('toast'); clearTimeout(toast.t); toast.t = setTimeout(() => hide('toast'), action ? 6000 : 3000);
}
const say = (t) => toast(t);
// Actieblad (iOS action sheet) en invoervenster (iOS alert met tekstveld) i.p.v. confirm/prompt.
function actions(title, opts, cancel = 'Annuleer') {
  const l = $('actsList'); l.innerHTML = ''; if (title) l.append(el('div', 'astitle', title));
  for (const o of opts) { const b = el('button', `cell${o.danger ? ' danger' : ''}`); b.append(el('div', '', o.label)); b.onclick = () => { hide('acts'); o.fn(); }; l.append(b); }
  $('actsX').firstChild.textContent = cancel; show('acts');
}
$('actsX').onclick = () => hide('acts');
function ask({ title, msg = '', value = '', type = 'text', mode = 'text', placeholder = '', okText = 'Bewaar', ok }) {
  $('askT').textContent = title; $('askM').textContent = msg; $('askS').textContent = ''; $('askOk').textContent = okText;
  Object.assign($('askIn'), { type, inputMode: mode, placeholder, value });
  $('askOk').onclick = async () => { try { await ok($('askIn').value.trim()); hide('ask'); } catch (e) { $('askS').textContent = e.message; } };
  show('ask'); $('askIn').focus(); if (value) $('askIn').select();
}
$('askX').onclick = () => hide('ask');
$('askIn').onkeydown = (e) => { if (e.key === 'Enter') $('askOk').click(); };
// Lang drukken (iOS contextmenu) op rijen en chips.
function press(node, fn) {
  let t, x0, y0;
  node.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t = setTimeout(() => { t = 'done'; navigator.vibrate?.(10); fn(); }, 500); }, { passive: true });
  node.addEventListener('touchmove', (e) => { if (Math.hypot(e.touches[0].clientX - x0, e.touches[0].clientY - y0) > 10) clearTimeout(t); }, { passive: true });
  node.addEventListener('touchend', (e) => { if (t === 'done') { e.preventDefault(); t = null; } else clearTimeout(t); });
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); if (t !== 'done') fn(); });
}

async function load() {
  $('day').textContent = $('mini').textContent = dayName(day);
  $('day').style.fontSize = dayName(day).length > 9 ? '28px' : '';
  $('datePick').value = day; $('todayBtn').classList.toggle('hidden', day === today());
  placeholder();
  const d = await api(`/api/items?date=${day}`); data = d;
  api(`/api/items?date=${addDays(day, -1)}`).then((y) => { yest = y.items; renderQuick(); }).catch(() => {});
  const { items, total, estimate, queued, burn, burnEst, burnAt, week, month, weights, target } = d;
  if (queued) say(`${queued} invoer wacht op verwerking (Gemini druk)`);
  const est = day < today() && estimate; // vergeten dag: schatting, alleen getoond
  const t = est || total;
  $('total').classList.toggle('est', !!est); $('ring').classList.toggle('est', !!est); $('estTag').classList.toggle('hidden', !est);
  $('total').innerHTML = `${est ? '≈ ' : ''}${t.kcal}<small>kcal</small>`;
  // Fase 9: ring = inname t.o.v. adaptief doel; zonder doel (nog < 14 dagen) t.o.v. verbruik of 2000 kcal.
  const T = target?.kcal ? target : null;
  const goal = T?.kcal || burn || 2000, left = goal - t.kcal, f = t.kcal / goal;
  $('arc').style.strokeDashoffset = 326.7 * (1 - Math.min(f, 1));
  $('ring').classList.toggle('over', f > 1.05);
  $('goal').textContent = T ? `van ${T.kcal} doel` : burn ? `van ${burn} verbruik` : 'van 2000 kcal';
  $('why').textContent = T ? T.why : `Doel volgt na 14 gelogde dagen en 2 wegingen (week uit elkaar) · nu ${target?.days ?? 0} d, ${target?.weighs ?? 0} wegingen`;
  $('motto').textContent = est ? 'Geschat op je gemiddelde' : !t.kcal ? (day === today() ? 'Klaar voor een goede dag?' : 'Niets gelogd op deze dag')
    : f < 0.5 ? `Lekker bezig, nog ${left} kcal ruimte` : f < 0.9 ? `Goed op weg, nog ${left} kcal` : f <= 1.05 ? 'Precies op koers' : `${-left} kcal boven je ${T ? 'doel' : 'verbruik'}, morgen weer een dag`;
  $('macros').innerHTML = [['Eiwit', 'protein_g'], ['Koolh.', 'carbs_g'], ['Vet', 'fat_g']]
    .map(([k, m]) => `<div${T ? ` style="--w:${Math.min(100, t[m] / T[m] * 100 || 0)}%"` : ''}><b>${est ? '≈ ' : ''}${t[m]}${T ? `<small>/${T[m]}</small>` : ''} g</b><span>${k}${T && T[m] > t[m] ? ` · nog ${T[m] - t[m]}` : ''}</span></div>`).join('');
  // Fase 4: verbruik (Garmin via Apple Health) per dag; vandaag = tot nu toe.
  const bal = (x, approx = '') => `<b class="${x >= 0 ? 'neg' : 'pos'}">${approx}${x >= 0 ? 'tekort' : 'overschot'} ${Math.abs(x)}</b>`;
  const at = burnAt ? new Date(burnAt) : null;
  const upto = !at ? '' : iso(at) === day ? ` t/m ${pad(at.getHours())}:${pad(at.getMinutes())}` : iso(at) > day ? ' hele dag' : '';
  const sum = (p, label) => p.days ? `${label} ${bal(p.diff)} <small>(${p.days} d)</small>` : '';
  $('burnCell').parentNode.classList.toggle('hidden', day > today());
  $('burnVal').textContent = burn == null ? '' : `${burnEst ? '≈ ' : ''}${burn} kcal`;
  $('burn').innerHTML = `Verbruik${upto}<small>${burn == null ? 'Nog niet binnen' : 'Vandaag ' + bal(burn - t.kcal, est || burnEst ? '≈ ' : '')}`
    + `${[sum(week, 'Week'), sum(month, 'Maand')].filter(Boolean).map((x) => `<br>${x}`).join('')}</small>`;
  // Fase 5: gewicht, laatste weging t/m deze dag + lijn van 30 dagen.
  const w = weights.at(-1), w0 = weights[0];
  const pts = weights.map((x) => [(new Date(x.date) - new Date(day)) / 864e5 + 30, x.kg]);
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1])) || 1;
  $('weight').innerHTML = `<span class="tile" style="background:#34c759">${svg('scale')}</span><div>Gewicht`
    + (!w ? '<small>Tik om te wegen</small></div><span class="val">Voeg toe</span>' : `<small>${dayName(w.date)}`
    + (weights.length > 1 ? ` · 30 d ${w.kg - w0.kg > 0 ? '+' : ''}${kg(w.kg - w0.kg)} kg` : '') + '</small>'
    + (weights.length > 1 ? `<svg viewBox="0 0 30 10" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" points="${pts.map(([x, y]) => `${x},${9 - (y - lo) / (hi - lo || 1) * 8}`).join(' ')}"/></svg>` : '') + `</div><span class="val">${kg(w.kg)} kg</span>`);
  renderList(items, est);
}

// Fase 11: gegeten-lijst per maaltijd met subtotaal; tik = uitklappen (hoeveelheid), vegen = favoriet/wissen, lang drukken = menu.
function renderList(items, est) {
  const L = $('list'); L.innerHTML = '';
  if (!items.length) {
    L.append(el('h2', '', 'Gegeten'));
    const ul = el('ul', 'group'); ul.append(el('li', 'empty', est ? `Schatting: gemiddelde van ${est.days} ingevulde dag(en) in de 14 dagen ervoor. Voer iets in om te vervangen.` : 'Nog niets ingevoerd'));
    L.append(ul); return;
  }
  const groups = {};
  for (const i of items) (groups[mealOf(i)] ||= []).push(i);
  let first = null;
  for (const k of Object.keys(MEALS)) {
    if (!groups[k]) continue;
    const h = el('h2', 'sec'); h.append(el('span', '', MEALS[k]), el('span', '', `${groups[k].reduce((a, i) => a + i.kcal, 0)} kcal`));
    const ul = el('ul', 'group');
    for (const i of groups[k]) { const li = itemRow(i); ul.append(li); if (fresh && i.input_id === fresh) { li.classList.add('new'); first ||= li; } }
    L.append(h, ul);
  }
  fresh = null; first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
const closeSwipes = (except) => document.querySelectorAll('#list li.swiped').forEach((x) => { if (x !== except) { x.classList.remove('swiped'); x.querySelector('.row').style.transform = ''; } });
function itemRow(i) {
  const li = el('li');
  li.innerHTML = `<div class="swrap"><div class="sw"><button style="background:#ff9500">${svg('star', i.fav ? 'fill' : '')}${i.fav ? 'Uit fav.' : 'Favoriet'}</button><button style="background:var(--red)">${svg('trash')}Wis</button></div>
    <div class="row"><span class="food">${foodIcon(i.product)}</span><div></div><span class="kcal"></span>${i.fav ? `<span class="act on">${svg('star', 'fill')}</span>` : ''}</div></div>`;
  const row = li.querySelector('.row'), txt = row.querySelector('div');
  txt.append(i.product, el('small', '', i.portion));
  row.querySelector('.kcal').textContent = i.kcal;
  const [favB, delB] = li.querySelectorAll('.sw button');
  favB.onclick = () => toggleFav(i); delB.onclick = () => removeItem(i);
  row.onclick = () => { if (li.classList.contains('swiped')) return closeSwipes(); closeSwipes(); li.classList.toggle('open'); };
  press(row, () => actions(i.product, [
    { label: 'Wijzig', fn: () => editItem(i) },
    { label: 'Naar andere dag', fn: () => ask({ title: 'Naar andere dag', type: 'date', value: i.date, okText: 'Verplaats',
      ok: async (v) => { await api('/api/items', { method: 'PUT', body: JSON.stringify({ ...i, date: v }) }); toast(`Verplaatst naar ${dayName(v).toLowerCase()}`); load(); } }) },
    { label: 'Dupliceer', fn: () => quickAdd(`${i.product}`, [{ ...i, meal: mealOf(i) }]) },
    { label: i.fav ? 'Uit favorieten' : 'Bewaar als favoriet', fn: () => toggleFav(i) },
    { label: 'Verwijder', danger: true, fn: () => removeItem(i) },
  ]));
  // Vegen naar links toont Favoriet en Wis.
  let x0, y0, dx = 0, base = 0, mode; const W = 148;
  row.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; mode = null; dx = base = li.classList.contains('swiped') ? -W : 0; row.style.transition = 'none'; }, { passive: true });
  row.addEventListener('touchmove', (e) => {
    const x = e.touches[0].clientX - x0, y = e.touches[0].clientY - y0;
    mode ||= Math.abs(x) > 8 && Math.abs(x) > Math.abs(y) ? 'x' : Math.abs(y) > 8 ? 'y' : null;
    if (mode === 'x') { dx = Math.min(0, Math.max(-W - 40, base + x)); row.style.transform = `translateX(${dx}px)`; }
  }, { passive: true });
  row.addEventListener('touchend', () => {
    row.style.transition = ''; if (mode !== 'x') return;
    const open = dx < -W / 2; closeSwipes(li); li.classList.toggle('swiped', open); row.style.transform = open ? `translateX(${-W}px)` : '';
  });
  li.append(adjust(i, row.querySelector('.kcal')));
  return li;
}
async function toggleFav(i) {
  if (i.fav) { await api(`/api/meals?id=${i.fav}`, { method: 'DELETE' }); say('Uit favorieten gehaald'); load(); loadQuick(); return; }
  ask({ title: 'Bewaar als favoriet', msg: 'Typ deze naam later, of tik hem aan bij Snel toevoegen.', value: i.product, placeholder: 'Bijv. Mijn ontbijt',
    ok: async (name) => { if (!name) throw new Error('Geef een naam'); await api('/api/meals', { method: 'POST', body: JSON.stringify({ input_id: i.input_id, name }) }); toast(`"${name}" bewaard`); load(); loadQuick(); } });
}
async function removeItem(i) {
  await api(`/api/items?id=${i.id}`, { method: 'DELETE' }); load();
  toast(`${i.product} verwijderd`, 'Ongedaan', async () => { await api('/api/quick', { method: 'POST', body: JSON.stringify({ items: [{ ...i, meal: mealOf(i) }], date: i.date }) }); load(); });
}
const editItem = (i) => editor({ title: 'Aanpassen', items: [i], single: true, meta: { date: i.date, meal: mealOf(i) },
  save: async (_, [x], meta) => { await api('/api/items', { method: 'PUT', body: JSON.stringify({ ...x, ...meta, id: i.id }) }); load(); },
  remove: () => removeItem(i) });

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
  const ed = Object.assign(document.createElement('button'), { className: 'link', textContent: 'Wijzig' }); // Fase 11: details via uitgeklapte rij
  ed.style.marginLeft = 'auto'; ed.onclick = () => editItem(i); el.append(ed);
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

// Typebalk = zoeken: favorieten sorteren op overeenkomst met wat je typt, daarna op het tijdstip waarop je ze meestal eet.
function score(m, words) {
  const hay = `${m.name} ${m.items.map((i) => i.product).join(' ')}`.toLowerCase();
  return words.reduce((s, w) => s + (hay.includes(w) ? 2 : w.length > 3 && hay.includes(w.slice(0, 4)) ? 1 : 0), 0);
}
const hourGap = (h) => { if (h == null) return 99; const d = Math.abs(h - new Date().getHours()); return Math.min(d, 24 - d); };
async function quickAdd(name, items, meal_id) {
  const { input_id } = await api('/api/quick', { method: 'POST', body: JSON.stringify({ items, date: day, meal_id }) });
  $('text').value = ''; renderQuick(); load();
  toast(`${name} toegevoegd`, 'Ongedaan', async () => { await api(`/api/items?input=${input_id}`, { method: 'DELETE' }); load(); });
}
function renderQuick() {
  const words = $('text').value.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  const list = chips.map((m, n) => ({ m, n, s: score(m, words), g: hourGap(m.h) })).sort((a, b) => b.s - a.s || a.g - b.g || a.n - b.n);
  $('quick').innerHTML = '';
  const plus = Object.assign(el('button', 'chip add'), { innerHTML: svg('plus'), ariaLabel: 'Nieuw gerecht' });
  plus.onclick = () => editor({ title: 'Nieuw gerecht', name: '', items: [], save: saveMeal() });
  $('quick').append(plus);
  // "Zelfde als gisteren": de maaltijd van nu, zoals gisteren gegeten.
  const slot = slotOf(new Date().getHours()), same = yest.filter((i) => mealOf(i) === slot);
  if (same.length && !words.length) {
    const b = el('button', 'chip'); b.innerHTML = svg('left');
    b.append(`${MEALS[slot]} als gisteren`, el('small', '', same.reduce((t, i) => t + i.kcal, 0)));
    b.onclick = () => quickAdd(`${MEALS[slot]} van gisteren`, same.map((i) => ({ ...i, meal: slot })));
    $('quick').append(b);
  }
  for (const { m, s } of list) {
    const kcal = m.items.reduce((t, i) => t + i.kcal, 0);
    const b = el('button', `chip${words.length && !s ? ' dim' : ''}`);
    b.innerHTML = m.saved ? svg('star', 'fill') : `<span>${foodIcon(m.items[0]?.product)}</span>`;
    b.append(m.name, el('small', '', kcal));
    b.onclick = () => quickAdd(m.name, m.items, m.saved ? m.id : undefined);
    press(b, () => actions(m.name, m.saved ? [
      { label: 'Wijzig', fn: () => mealEditor(m) },
      { label: 'Verwijder gerecht', danger: true, fn: async () => { await api(`/api/meals?id=${m.id}`, { method: 'DELETE' }); await loadQuick(); load(); } },
    ] : [{ label: 'Bewaar als gerecht', fn: () => ask({ title: 'Bewaar als gerecht', value: m.name, ok: async (name) => { await saveMeal()(name, m.items); toast(`"${name}" bewaard`); } }) }]));
    $('quick').append(b);
  }
  $('quick').scrollLeft = 0;
}
$('text').addEventListener('input', renderQuick);
const canSend = () => { $('send').disabled = !$('text').value.trim() && !image; };
$('text').addEventListener('input', canSend);
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('send').click(); } });
function placeholder() {
  const s = slotOf(new Date().getHours());
  $('text').placeholder = day === addDays(today(), -1) ? 'Wat at je gisteren?' : day !== today() ? `Wat at je op ${dayName(day)}?`
    : { ontbijt: 'Wat had je als ontbijt?', lunch: 'Wat had je als lunch?', diner: 'Wat at je vanavond?', snack: 'Iets tussendoor gegeten?' }[s];
}

const saveMeal = (id) => async (name, items) => {
  await api('/api/meals', { method: 'POST', body: JSON.stringify({ id, name, items }) });
  await loadQuick();
};
const mealEditor = (m) => editor({ title: 'Gerecht', name: m.name, items: m.items, save: saveMeal(m.id),
  remove: async () => { await api(`/api/meals?id=${m.id}`, { method: 'DELETE' }); await loadQuick(); load(); } });

// Editor: één gegeten item aanpassen, of een gerecht maken/aanpassen (velden of AI-balk).
const NUMS = [['kcal', 'kcal'], ['protein_g', 'Eiwit'], ['carbs_g', 'Koolh.'], ['fat_g', 'Vet']];
function edRow(i = {}) {
  const r = el('div', 'edrow');
  r.innerHTML = `<input data-k="product" placeholder="Product"><input data-k="portion" placeholder="Portie"><button aria-label="Wis">${svg('trash')}</button>
    <div class="amt"><input data-k="amount" type="number" inputmode="decimal" placeholder="Hoeveelheid"><select data-k="unit" aria-label="Eenheid"><option value="">–</option><option value="g">gram</option><option value="ml">ml</option><option value="stuk">stuks</option></select></div>
    <div class="nums">${NUMS.map(([k, l]) => `<label>${l}<input data-k="${k}" type="number" inputmode="decimal"></label>`).join('')}</div>`;
  r.querySelectorAll('input, select').forEach((x) => { x.value = i[x.dataset.k] ?? ''; });
  r.querySelector('button').onclick = () => r.remove();
  // Hoeveelheid wijzigen schaalt kcal en macro's mee.
  const amt = r.querySelector('[data-k=amount]'); let prev = +amt.value;
  amt.oninput = () => {
    const n = +amt.value; if (prev > 0 && n > 0) for (const [k] of NUMS) { const x = r.querySelector(`[data-k=${k}]`); x.value = Math.round(+x.value * n / prev); }
    if (n > 0) prev = n; hero();
  };
  r.querySelector('[data-k=kcal]').addEventListener('input', hero);
  r.querySelector('[data-k=product]').addEventListener('input', hero);
  $('edRows').append(r);
}
const edState = () => JSON.stringify([...document.querySelectorAll('#editor input, #editor select')].map((x) => x.value));
function hero() {
  const r = $('edRows').firstElementChild; if (!r) return;
  $('edKcal').textContent = r.querySelector('[data-k=kcal]').value || 0; $('edIcon').textContent = foodIcon(r.querySelector('[data-k=product]').value);
}
let edSave = null, edRemove = null, edSnap = '';
$('edDel').onclick = () => actions(null, [{ label: 'Verwijder', danger: true, fn: async () => { await edRemove(); hide('editor'); } }]);
function editor({ title, name, items, single, meta, save, remove }) {
  $('edDelWrap').classList.toggle('hidden', !remove); edRemove = remove;
  $('edTitle').textContent = title;
  $('edTop').classList.toggle('hidden', !!single); $('edName').value = name || ''; $('edAiText').value = '';
  $('edAdd').classList.toggle('hidden', !!single);
  $('edHero').classList.toggle('hidden', !single); $('edMeta').classList.toggle('hidden', !meta);
  if (meta) { $('edDate').value = meta.date; $('edMeal').value = meta.meal; }
  $('edRows').innerHTML = ''; (items.length ? items : [{}]).forEach(edRow);
  $('edRows').classList.toggle('single', !!single);
  $('edStatus').textContent = ''; hero();
  edSave = save; edSnap = edState();
  show('editor');
}
$('edAdd').onclick = () => edRow();
const edCancel = () => (edState() === edSnap ? hide('editor')
  : actions(null, [{ label: 'Wijzigingen weggooien', danger: true, fn: () => hide('editor') }], 'Doorgaan met wijzigen'));
$('edCancel').onclick = edCancel;
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
  const items = [...$('edRows').children].map((r) => Object.fromEntries([...r.querySelectorAll('input, select')]
    .map((x) => [x.dataset.k, x.dataset.k === 'amount' ? +x.value || null : x.type === 'number' ? Math.round(+x.value || 0) : x.value.trim()]))).filter((i) => i.product);
  if (!items.length) { $('edStatus').textContent = 'Vul minstens één product in.'; return; }
  try { await edSave($('edName').value.trim(), items, { date: $('edDate').value, meal: $('edMeal').value }); hide('editor'); }
  catch (e) { $('edStatus').textContent = e.message; }
};

// Dagnavigatie: pijlen, vegen, "Vandaag" en tik op de titel = kalender.
function goto(d) { day = d; closeSwipes(); load(); }
const shift = (n) => goto(addDays(day, n));
$('prev').onclick = () => shift(-1);
$('next').onclick = () => shift(1);
$('todayBtn').onclick = () => goto(today());
$('datePick').onchange = () => $('datePick').value && goto($('datePick').value);
{
  let x0, y0, ok;
  $('todayView').addEventListener('touchstart', (e) => { ok = !e.target.closest('#list li, #quick, input, .adj'); x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  $('todayView').addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (ok && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) shift(dx < 0 ? 1 : -1);
  });
}
addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 50), { passive: true });

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

// Typebalk: "denkt na"-bubbel, resultaatkaartje en fout met "Opnieuw".
function bubble(text, buttons = [], cls = '') {
  const b = $('bubble'); b.className = cls; b.innerHTML = '';
  if (text === 'dots') b.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>TRECK denkt na';
  else b.append(el('span', '', text));
  for (const [l, fn] of buttons) { const x = el('button', '', l); x.onclick = () => { hide('bubble'); fn(); }; b.append(x); }
  b.classList.toggle('hidden', !text); clearTimeout(bubble.t);
  if (text && text !== 'dots' && cls !== 'err') bubble.t = setTimeout(() => hide('bubble'), 8000);
}
async function analyze(payload) {
  bubble('dots'); $('send').disabled = true;
  try {
    const { items, queued, quota } = await api('/api/analyze', { method: 'POST', body: JSON.stringify(payload) });
    if (queued) bubble(quota === 'day' ? 'AI-daglimiet bereikt: bewaard, verwerkt na de reset.' : quota === 'minute' ? 'Even wachten (AI-minuutlimiet): bewaard, volgt vanzelf.' : 'Gemini is druk: bewaard, wordt later verwerkt.');
    else if (!items.length) bubble('Geen eten herkend. Omschrijf het iets anders?', [], 'err');
    else {
      const d = items[0].date, k = items.reduce((t, i) => t + i.kcal, 0), n = items.length === 1 ? '1 item' : `${items.length} items`;
      fresh = items[0].input_id;
      const undo = ['Ongedaan', async () => { await api(`/api/items?input=${items[0].input_id}`, { method: 'DELETE' }); load(); }];
      bubble(d === day ? `${n} toegevoegd · ${k} kcal` : `${n} op ${dayName(d).toLowerCase()} · ${k} kcal`, d === day ? [undo] : [['Bekijk', () => { fresh = items[0].input_id; goto(d); }], undo]);
    }
    load(); loadQuick();
  } catch (e) {
    bubble(`Niet gelukt: ${e.message}`, [['Opnieuw', () => analyze(payload)]], 'err');
  }
  canSend();
}
$('send').onclick = () => {
  const text = $('text').value.trim();
  if (!text && !image) return;
  const n = new Date();
  let now = `${DAGEN[n.getDay()]} ${iso(n)} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  if (day !== iso(n)) now += `. Geopende dag in de app: ${DAGEN[new Date(day + 'T12:00').getDay()]} ${day}`; // invoer hoort standaard bij de geopende dag
  const payload = { text, image, now };
  $('text').value = ''; $('text').style.height = ''; clearPhoto(); renderQuick();
  analyze(payload);
};
$('thumbX').onclick = clearPhoto;
// Typebalk boven het toetsenbord houden (iOS schuift vaste balken anders achter het toetsenbord).
if (window.visualViewport) {
  const vv = visualViewport;
  const fit = () => { const k = Math.max(0, innerHeight - vv.height - vv.offsetTop); document.body.classList.toggle('kb', k > 80); $('compose').style.bottom = k > 80 ? `${k}px` : ''; };
  vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
}

// Onderbalk: lege tabs = "Binnenkort"; opnieuw tikken op Vandaag = naar boven en naar vandaag.
for (const b of document.querySelectorAll('#tabs [data-tab]')) b.onclick = () => {
  const today_ = b.dataset.tab === 'today';
  if (today_ && b.classList.contains('act')) { scrollTo({ top: 0, behavior: 'smooth' }); if (day !== today()) goto(today()); return; }
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('act', x === b));
  $('todayView').classList.toggle('hidden', !today_); $('soon').classList.toggle('hidden', today_);
  document.body.classList.toggle('tab-other', !today_); if (!today_) $('soonI').setAttribute('href', `#${b.dataset.i}`);
  $('soonT').textContent = { recipes: 'Recepten en gerechten op maat', insights: 'AI-analyse en voortgang', plan: 'Voedingsprogramma\'s' }[b.dataset.tab] || '';
  scrollTo(0, 0);
};

// Inloggen / account aanvragen: oog bij wachtwoord, fout onder het veld, spinner in de knop.
const creds = () => JSON.stringify({ name: $('name').value, pw: $('pw').value });
const loginMsg = (t, err) => { $('loginStatus').textContent = t; $('loginStatus').classList.toggle('err', !!err); };
$('eye').onclick = () => { const p = $('pw'); p.type = p.type === 'password' ? 'text' : 'password'; $('eye').style.color = p.type === 'text' ? 'var(--accent)' : ''; };
async function busy(btn, fn) {
  const t = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try { await fn(); } catch (e) { loginMsg(e.message, true); } finally { btn.disabled = false; btn.textContent = t; }
}
$('registerBtn').onclick = () => busy($('registerBtn'), async () => {
  await api('/api/register', { method: 'POST', body: creds() });
  loginMsg('Aangevraagd. Je kunt inloggen zodra je bent goedgekeurd.');
});
$('login').onsubmit = (e) => { e.preventDefault(); busy($('loginBtn'), async () => loggedIn(await api('/api/login', { method: 'POST', body: creds() }))); };
function loggedIn(r) {
  if (r.pending) { loginMsg('Aangevraagd. Je kunt inloggen zodra je bent goedgekeurd.'); return; }
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
        catch (e) { loginMsg(e.message, true); }
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

// Meer: profielkop, status rechts in de rijen, subschermen met terugknop.
const bye = () => { localStorage.removeItem('treck-token'); localStorage.removeItem('treck-admin'); location.reload(); };
const GOALS = { lose: 'Afvallen', keep: 'Op gewicht blijven', gain: 'Aankomen' };
const paceTxt = (g, p) => (g === 'keep' ? 'Op gewicht' : `${g === 'gain' ? '+' : '−'}${String(p).replace('.', ',')} kg/week`);
const sub = (id) => { hide('sheet'); show(id); };
document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = () => { b.closest('.sheet').classList.add('hidden'); openMenu(); }; });
function openMenu() {
  const me = data.me || {}, g = data.target?.goal || 'lose', w = data.weights?.at(-1);
  $('profAv').textContent = (me.name || '?')[0]; $('profName').textContent = me.name || '';
  $('profSub').textContent = [GOALS[g], w && `${kg(w.kg)} kg`].filter(Boolean).join(' · ');
  $('goalSub').textContent = paceTxt(g, me.pace || (g === 'gain' ? 0.25 : 0.5));
  $('mealsSub').textContent = meals.length || '';
  show('sheet');
  api('/api/ai').then(showAi).catch(() => {});
  api('/api/push').then((p) => { const n = p.times ? p.times.split(',').length : 0; $('pushSub').textContent = n || p.weigh ? `Aan · ${n}×` : 'Uit'; }).catch(() => {});
  api('/api/burn').then(({ days }) => { $('garminSub').textContent = days[0] && Date.now() - new Date(days[0].updated_at) < 2 * 864e5 ? 'Verbonden' : 'Niet verbonden'; }).catch(() => {});
}
$('menuBtn').onclick = openMenu;
$('mealsBtn').onclick = () => { renderMeals(); sub('meals'); };
$('mealNew').onclick = () => { hide('meals'); editor({ title: 'Nieuw gerecht', name: '', items: [], save: saveMeal() }); };
function renderMeals() {
  $('mealList').innerHTML = meals.length ? '' : '<li class="empty">Nog geen gerechten. Veeg een item naar links → Favoriet, of tik + bij Snel toevoegen.</li>';
  for (const m of meals) {
    const li = el('li');
    li.innerHTML = `<span class="food">${foodIcon(m.items[0]?.product)}</span><div></div><span class="kcal">${m.items.reduce((t, i) => t + i.kcal, 0)}</span>`;
    li.querySelector('div').append(m.name, el('small', '', m.items.map((i) => i.product).join(', ')));
    li.onclick = () => { hide('meals'); mealEditor(m); };
    $('mealList').append(li);
  }
}
// Fase 8: AI-limietbalk (oranje vanaf 80%) + nep-abonnement (gratis 10/dag, abonnement 100/dag).
function showAi({ used, limit, plan, full, reset }) {
  $('aiBar').classList.toggle('full', full); $('aiBar').classList.toggle('warn', !full && used >= limit * 0.8);
  $('aiTxt').textContent = full ? `vol · ${used}/${limit}` : `${used}/${limit}`;
  $('aiSub').textContent = `Verzoeken vandaag · reset ${new Date(reset).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
  $('aiFill').style.width = `${full ? 100 : Math.min(100, (used / limit) * 100)}%`;
  $('planSub').textContent = plan === 'pro' ? 'Actief (proef): 100 per dag · tik om op te zeggen' : 'Gratis: 10 per dag · tik voor 100 per dag';
}
$('planBtn').onclick = () => api('/api/plan', { method: 'POST' }).then(showAi);
$('closeSheet').onclick = () => hide('sheet');
// Sheets sluiten door op de achtergrond te tikken (editor vraagt eerst bij wijzigingen).
document.querySelectorAll('.sheet').forEach((s) => { s.onclick = (e) => { if (e.target === s) (s.id === 'editor' ? edCancel() : s.classList.add('hidden')); }; });

// Doel: segmentkeuze + tempo, live dagdoel en voortgang naar een persoonlijk doel.
let gSel = 'lose';
function goalView() {
  document.querySelectorAll('#goalSeg button').forEach((b) => b.classList.toggle('on', b.dataset.g === gSel));
  const p = +$('pace').value, T = data.target || {};
  $('paceWrap').classList.toggle('hidden', gSel === 'keep'); $('paceVal').textContent = paceTxt(gSel, p);
  $('goalKcal').textContent = T.tdee ? `≈ ${Math.max(1200, Math.round(T.tdee + (gSel === 'keep' ? 0 : (gSel === 'gain' ? 1 : -1) * p * 1100)))} kcal` : '–';
  $('goalHint').textContent = T.tdee ? `per dag · je verbruik is ≈ ${T.tdee} kcal` : 'Je dagdoel volgt zodra beide balken hieronder vol zijn';
  const d = Math.min(14, T.days || 0), w = Math.min(2, T.weighs || 0);
  $('gDays').textContent = `${T.days || 0}/14`; $('gDaysBar').style.width = `${d / 14 * 100}%`;
  $('gW').textContent = `${T.weighs || 0}/2`; $('gWBar').style.width = `${w / 2 * 100}%`;
}
$('goalBtn').onclick = () => { gSel = data.target?.goal || 'lose'; $('pace').value = data.me?.pace || (gSel === 'gain' ? 0.25 : 0.5); goalView(); sub('goalSheet'); };
$('goalSeg').onclick = (e) => { const g = e.target.dataset.g; if (!g) return; gSel = g; if (g !== 'keep') $('pace').value = g === 'gain' ? 0.25 : 0.5; goalView(); };
$('pace').oninput = goalView;
$('goalSave').onclick = async () => {
  await api('/api/goal', { method: 'POST', body: JSON.stringify({ goal: gSel, pace: +$('pace').value }) });
  hide('goalSheet'); toast('Doel bewaard'); load();
};

// Handmatig wegen: geldt voor de geopende dag (overschrijft die dag).
$('weight').onclick = () => ask({ title: 'Gewicht', msg: `Op ${dayName(day).toLowerCase()}, in kg`, type: 'text', mode: 'decimal', placeholder: '82,4',
  value: data.weights?.at(-1) ? kg(data.weights.at(-1).kg) : '',
  ok: async (v) => { await api('/api/weight', { method: 'POST', body: JSON.stringify({ date: day, kg: v }) }); load(); } });

// Verbruik koppelen (Fase 11b): bron kiezen, stappen met plaatjes die uitklappen, ontvangen dagen ingeklapt.
const STEPS = 'treck-steps', SRC = 'treck-src';
const mock = (title, rows) => `<div class="mock"><b>${title}</b>${rows.map(([l, r, hl]) => `<div class="mr${hl ? ' hl' : ''}">${l}${r === true || r === false ? `<i class="t${r ? ' on' : ''}"></i>` : `<span>${r ?? '›'}</span>`}</div>`).join('')}</div>`;
const SHORTCUT = 'https://www.icloud.com/shortcuts/2525ede97e6b4983a72b4ef96c300ff8';
function stepList(src) {
  const health = {
    garmin: ['Garmin koppelen aan Gezondheid', 'In de Garmin Connect-app', `<p>Open <b>Garmin Connect</b> → Meer → Instellingen → Verbonden apps → <b>Apple Gezondheid</b>. Zet deze twee aan:</p>${mock('Apple Gezondheid', [['Actieve energie', true, 1], ['Rustenergie', true, 1], ['Stappen', false]])}`],
    watch: ['Apple Watch staat al goed', 'Niets te doen, alleen even checken', `<p>Je Apple Watch zet je verbruik vanzelf in Gezondheid. Check in <b>Gezondheid</b> → Activiteit dat er waarden staan:</p>${mock('Activiteit', [['Actieve energie', '520 kcal'], ['Rustenergie', '1.740 kcal']])}<p>Een andere app die naar Gezondheid schrijft (Polar, Fitbit, Strava) telt ook mee.</p>`],
    iphone: ['iPhone meet je beweging', 'Alleen actieve energie', `<p>Zonder horloge maakt je iPhone van je stappen <b>actieve energie</b>. Check in <b>Gezondheid</b> → Activiteit:</p>${mock('Activiteit', [['Actieve energie', '310 kcal'], ['Rustenergie', 'geen data']])}<p>Rustenergie meet een iPhone niet. TRECK krijgt dan alleen je actieve verbruik; je doel rekent het later goed via je gewicht.</p>`],
  }[src];
  const auto = src === 'garmin'
    ? [['App', 'Garmin Connect'], ['Is Closed', true], ['Run Immediately', true, 1]]
    : [['Time of Day', '23:55'], ['Repeat', 'Daily'], ['Run Immediately', true, 1]];
  return [
    health,
    ['Sleutel kopiëren', 'Je persoonlijke code voor de opdracht', '<p>De opdracht gebruikt deze sleutel om jouw verbruik naar jouw account te sturen.</p><button class="btn primary" data-key>Kopieer sleutel</button>'],
    ['Opdracht installeren', 'TRECK in de app Opdrachten', `<a class="btn primary" href="${SHORTCUT}" target="_blank" rel="noopener">Installeer TRECK-opdracht</a><p style="margin-top:12px">Open daarna de opdracht. In beide blokken <b>Get contents of URL</b> plak je de sleutel achter <b>Bearer</b>:</p>${mock('Get contents of URL', [['Method', 'POST'], ['authorization', 'Bearer ••••', 1]])}`],
    ['Automatisch laten draaien', src === 'garmin' ? 'Na elke Garmin-sync en om 23:55' : 'Elke avond om 23:55', `<p>Open <b>Opdrachten</b> → Automation → <b>+</b>${src === 'garmin' ? ' → App' : ' → Time of Day'}. Kies <b>Run Immediately</b> en daarna de TRECK-opdracht.</p>${mock('New Automation', auto)}${src === 'garmin' ? `<p>Maak er nog één met <b>Time of Day</b> 23:55, zodat de dag altijd compleet is.</p>` : ''}`],
    ['Testen', 'Eén keer handmatig draaien', `<p>Tik in Opdrachten één keer op <b>TRECK</b>. Bovenaan dit scherm wordt de stip groen en zie je de tijd.</p>${mock('Opdrachten', [['▶︎ TRECK', 'tik'], ['Klaar', '✓']])}`],
  ];
}
function renderSteps(ok) {
  const src = localStorage.getItem(SRC) || 'garmin', done = new Set(JSON.parse(localStorage.getItem(`${STEPS}-${src}`) || '[]'));
  if (ok) done.add(4);
  document.querySelectorAll('#srcSeg button').forEach((b) => b.classList.toggle('on', b.dataset.s === src));
  const list = stepList(src); $('steps').innerHTML = '';
  $('stepsH').textContent = `Instellen · ${done.size} van ${list.length} klaar`;
  const firstOpen = list.findIndex((_, n) => !done.has(n));
  list.forEach(([t, sub_, more], n) => {
    const li = el('li', `step${done.has(n) ? ' done' : ''}${n === firstOpen ? ' open' : ''}`);
    li.innerHTML = `<div class="sh" role="button"><button class="num" aria-label="Gedaan">${done.has(n) ? svg('check') : n + 1}</button><div><b>${t}</b><small>${sub_}</small></div></div><div class="more">${more}</div>`;
    li.querySelector('.sh').onclick = () => { const o = li.classList.contains('open'); document.querySelectorAll('#steps .open').forEach((x) => x.classList.remove('open')); li.classList.toggle('open', !o); };
    li.querySelector('.num').onclick = (e) => { e.stopPropagation(); done.has(n) ? done.delete(n) : done.add(n); localStorage.setItem(`${STEPS}-${src}`, JSON.stringify([...done])); renderSteps(ok); };
    li.querySelector('[data-key]')?.addEventListener('click', copyKey);
    $('steps').append(li);
  });
  document.querySelectorAll('#steps .num .ic').forEach((i) => { i.style.width = i.style.height = '16px'; i.style.strokeWidth = 3; });
}
$('srcSeg').onclick = (e) => { const s = e.target.dataset.s; if (s) { localStorage.setItem(SRC, s); renderSteps($('gDot').classList.contains('ok')); } };
$('burnsBtn').onclick = () => $('burnsWrap').classList.toggle('hidden');
$('garminBtn').onclick = () => {
  hide('burnsWrap'); renderSteps(false); sub('garmin');
  api('/api/burn').then(({ days }) => {
    const last = days[0] && new Date(days[0].updated_at), ok = last && Date.now() - last < 2 * 864e5;
    $('gDot').classList.toggle('ok', !!ok); renderSteps(ok);
    $('gWhen').textContent = last ? last.toLocaleString('nl-NL', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (ok ? '' : ' · controleer de automatisering') : 'Nog niets ontvangen · volg de stappen hieronder';
    const by = Object.fromEntries(days.map((b) => [b.date, b])), oldest = days.at(-1)?.date;
    const rows = []; let got = 0;
    for (let n = 0; n < 14; n++) {
      const d = addDays(today(), -n); if (!oldest || d < oldest) break;
      const b = by[d]; if (b) got++;
      rows.push(b ? `<li><div>${dayName(d)}<small>actief ${b.active ?? '–'} · rust ${b.resting ?? '–'} · ontvangen ${new Date(b.updated_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</small></div><span class="kcal">${b.kcal}</span></li>`
        : `<li class="miss"><div>${dayName(d)}<small>Niets ontvangen</small></div><span class="kcal">Ontbreekt</span></li>`);
    }
    $('burnsVal').textContent = rows.length ? `${got}/${rows.length}` : 'Geen';
    $('burns').innerHTML = rows.join('') || '<li class="empty">Nog niets ontvangen</li>';
  });
};
$('closeGarmin').onclick = () => hide('garmin');
async function copyKey() {
  const { token: k } = await api('/api/synckey', { method: 'POST' });
  try { await navigator.clipboard.writeText(k); toast('Sleutel gekopieerd'); }
  catch { ask({ title: 'Kopieer je sleutel', msg: 'Plak hem in de iOS-opdracht bij "Bearer ".', value: k, okText: 'Klaar', ok: () => {} }); }
};
$('burnClear').onclick = () => actions('Al het ontvangen verbruik wissen? De iOS-opdracht vult het daarna weer aan.', [{ label: 'Verbruik wissen', danger: true,
  fn: async () => { await api('/api/burn', { method: 'DELETE' }); $('burns').innerHTML = '<li class="empty">Nog niets ontvangen</li>'; load(); } }]);

// Fase 6/11: meldingen in een eigen scherm: tijden met schakelaar, wekelijks wegen, testmelding (iOS: alleen als beginscherm-app).
navigator.serviceWorker?.register('sw.js');
const OFF = 'treck-push-off'; let pushT = [], pushKey = '';
function renderPush() {
  pushT.sort((a, b) => (a.t > b.t) - (a.t < b.t));
  $('pushTimes').innerHTML = pushT.length ? '' : '<li class="empty">Geen tijden</li>';
  pushT.forEach((p, n) => {
    const li = el('li', 'cell');
    li.innerHTML = `<input type="time" aria-label="Tijd"><span style="flex:1"></span><input type="checkbox" class="tgl" aria-label="Aan"><button class="x" aria-label="Wis">${svg('x')}</button>`;
    const [t, on] = li.querySelectorAll('input'); t.value = p.t; on.checked = p.on;
    t.onchange = () => { p.t = t.value; }; on.onchange = () => { p.on = on.checked; };
    li.querySelector('button').onclick = () => { pushT.splice(n, 1); renderPush(); };
    $('pushTimes').append(li);
  });
}
$('pushBtn').onclick = async () => {
  sub('pushSheet');
  const ok = 'Notification' in window && navigator.serviceWorker;
  $('pushNote').textContent = 'Meldingen werken alleen als TRECK op je beginscherm staat (iOS 16.4+).'; $('pushNote').classList.toggle('hidden', !!ok);
  const { publicKey, times, weigh } = await api('/api/push'); pushKey = publicKey;
  const on = times.split(',').filter(Boolean), off = JSON.parse(localStorage.getItem(OFF) || '[]').filter((t) => !on.includes(t));
  pushT = on.length || off.length ? [...on.map((t) => ({ t, on: true })), ...off.map((t) => ({ t, on: false }))] : ['10:00', '14:00', '20:00', '22:00'].map((t) => ({ t, on: false }));
  $('wOn').checked = !!weigh; if (weigh) { $('wDay').value = weigh.slice(0, 2); $('wTime').value = weigh.slice(3); }
  renderPush();
};
$('pushAdd').onclick = () => { pushT.push({ t: '12:00', on: true }); renderPush(); };
async function savePush() {
  const perm = 'Notification' in window ? Notification.requestPermission() : null; // direct in de tik, anders weigert iOS
  const times = pushT.filter((p) => p.on && p.t).map((p) => p.t).join(','), weigh = $('wOn').checked ? `${$('wDay').value} ${$('wTime').value}` : '';
  localStorage.setItem(OFF, JSON.stringify(pushT.filter((p) => !p.on && p.t).map((p) => p.t)));
  let sub_ = null;
  if (times || weigh) {
    if (!perm || await perm !== 'granted') throw new Error('Meldingen staan uit voor TRECK: zet ze aan in iOS Instellingen → Meldingen.');
    const reg = await navigator.serviceWorker.ready;
    sub_ = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(atob(pushKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) });
  }
  return api('/api/push', { method: 'POST', body: JSON.stringify({ sub: sub_, times, weigh }) });
}
$('pushSave').onclick = () => savePush().then((r) => { hide('pushSheet'); toast(r.times || r.weigh ? 'Bewaard · je krijgt een testmelding' : 'Meldingen staan uit'); }).catch((e) => toast(e.message));
$('pushTest').onclick = () => savePush().then((r) => toast(r.times || r.weigh ? 'Testmelding verstuurd' : 'Zet eerst een melding aan')).catch((e) => toast(e.message));

$('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); bye(); };
$('delAccount').onclick = () => actions('Je account en al je gegevens worden definitief verwijderd.', [{ label: 'Verwijder account', danger: true,
  fn: async () => { await api('/api/account', { method: 'DELETE' }); bye(); } }]);

if (token) { ['app', 'tabs', 'compose'].forEach(show); load(); loadQuick(); if (admin) loadPending(); }
else { show('login'); setupGoogle(); }
$('text').oninput = (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };
