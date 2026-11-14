// 14 nov: Recepten-tab, een blog van alle gebruikers: zoeken, plaatsen (foto + ✦ macro's), reageren, "wat doet dit met mijn dag" en in één tik aan vandaag toevoegen.
let rcList = [], rcCur = null, rcPhoto = null, rcQ = '';
const rcBusy = (btn, fn) => busy(btn, () => fn().catch((e) => toast(e.message)));
const rcMac = (r, n = 1) => `${Math.round(r.protein_g * n)} g eiwit · ${Math.round(r.carbs_g * n)} g koolh. · ${Math.round(r.fat_g * n)} g vet`;
const rcAgo = (t) => { const m = (Date.now() - new Date(t)) / 6e4; return m < 60 ? `${Math.max(1, Math.round(m))} min` : m < 1440 ? `${Math.round(m / 60)} u` : new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }); };

async function loadRecipes() {
  const { recipes } = await api(`/api/recipes?q=${encodeURIComponent(rcQ)}`); rcList = recipes;
  $('rcList').innerHTML = recipes.length ? recipes.map((r) => `<button class="rc" data-id="${r.id}">${r.thumb ? `<img src="${r.thumb}" alt="">` : `<span class="rcimg">${foodIcon(r.title)}</span>`}
    <div><b>${esc(r.title)}</b><small>${r.kcal} kcal per portie · ${rcMac(r)}</small><small>${esc(r.author)} · ${rcAgo(r.created_at)}${r.n ? ` · ${r.n} ${r.n > 1 ? 'reacties' : 'reactie'}` : ''}</small></div></button>`).join('')
    : `<p class="note">${rcQ ? 'Niets gevonden.' : 'Nog geen recepten. Plaats de eerste met +.'}</p>`;
  for (const b of $('rcList').querySelectorAll('.rc')) b.onclick = () => openRecipe(+b.dataset.id).catch((e) => toast(e.message));
}
let rcT; $('rcSearch').oninput = () => { clearTimeout(rcT); rcT = setTimeout(() => { rcQ = $('rcSearch').value.trim(); loadRecipes().catch(() => {}); }, 300); };

// Ring zoals op Vandaag: gegeten van het dagdoel (zelfde formule als load() in app.js).
async function rcDay() {
  const d = day === today() && data.total ? data : await api(`/api/items?date=${today()}`);
  const T = d.target?.kcal ? d.target : null, xtra = d.move != null && T?.active ? Math.max(0, d.move - T.active) : 0;
  return { t: d.total, T, goal: T?.kcal ? Math.max(1200, T.kcal + xtra) : 2000, gain: T?.goal === 'gain' };
}
const rcRing = (f, gain, big, label) => `<div class="rcring"><svg viewBox="-6 -6 132 132"><circle class="trk" cx="60" cy="60" r="52"/>
  <circle cx="60" cy="60" r="52" stroke="${tone(f, gain)}" stroke-dasharray="326.7" stroke-dashoffset="${326.7 * (1 - Math.min(f, 1))}"/></svg><div><b>${big}</b><small>${label}</small></div></div>`;
let rcN = 1;
async function rcPreview() {
  const r = rcCur, D = await rcDay(), k = Math.round(r.kcal * rcN);
  const side = (kcal, lab) => { const left = D.goal - kcal; return rcRing(kcal / D.goal, D.gain, nl(Math.abs(left)), `${left >= 0 ? 'mag nog' : 'te veel'}<br>${lab}`); };
  const mac = [['Eiwit', 'protein_g', true], ['Koolh.', 'carbs_g'], ['Vet', 'fat_g']].map(([l, m, up]) => {
    const a = D.t[m], b = a + Math.round(r[m] * rcN), tg = D.T?.[m];
    return `<div><span>${l}</span><b>${a} → ${b} g</b>${tg ? `<i style="--w:${Math.min(100, b / tg / 1.25 * 100)}%;--m:${tone(b / tg, up)}"></i><small>doel ${tg} g</small>` : ''}</div>`; }).join('');
  $('rcPrev').innerHTML = `<div class="rings">${side(D.t.kcal, 'nu')}<span>→</span>${side(D.t.kcal + k, 'na dit recept')}</div><div class="rcmac">${mac}</div>`;
  $('rcN').textContent = `${String(rcN).replace('.', ',')} ${rcN === 1 ? 'portie' : 'porties'}`;
  $('rcAdd').textContent = `Voeg toe aan vandaag · ${k} kcal`;
}

async function openRecipe(id) {
  const { recipe: r, comments } = await api(`/api/recipes?id=${id}`); rcCur = r; rcN = 1;
  $('rcBody').innerHTML = `${r.photo ? `<img class="rchero" src="${r.photo}" alt="">` : ''}<h1>${esc(r.title)}</h1>
    <p class="by">${esc(r.author)} · ${rcAgo(r.created_at)} · ${r.servings} ${r.servings > 1 ? 'porties' : 'portie'}</p>
    <div class="card"><div class="rck"><b>${r.kcal}</b> kcal per portie<small>${rcMac(r)}</small></div></div>
    <h2>Wat doet dit met je dag?</h2><div class="card"><div id="rcPrev"></div>
    <div class="adj"><button class="round" data-n="-0.5">${svg('minus')}</button><b id="rcN"></b><button class="round" data-n="0.5">${svg('plus')}</button></div>
    <button class="btn primary" id="rcAdd"></button></div>
    <h2>Recept</h2><div class="card rctext">${esc(r.body)}</div>
    <h2>Reacties</h2><ul class="group" id="rcCom">${comments.map((c) => `<li class="cell"><div>${esc(c.text)}<small>${esc(c.author)} · ${rcAgo(c.created_at)}</small></div>${c.mine ? `<button class="rcx" data-c="${c.id}" aria-label="Wis reactie">${svg('trash')}</button>` : ''}</li>`).join('') || '<li class="cell"><div><small>Nog geen reacties.</small></div></li>'}</ul>
    <div class="group airow"><input id="rcMsg" placeholder="Schrijf een reactie" enterkeyhint="send"><button id="rcSend" class="btn primary">Plaats</button></div>
    ${r.mine ? '<button class="btn danger" id="rcDel">Verwijder recept</button>' : ''}`;
  for (const b of $('rcBody').querySelectorAll('[data-n]')) b.onclick = () => { rcN = Math.max(0.5, rcN + +b.dataset.n); rcPreview(); };
  for (const b of $('rcBody').querySelectorAll('[data-c]')) b.onclick = () => actions('Reactie wissen?', [{ label: 'Wis', danger: true, fn: async () => { await api(`/api/comments?id=${b.dataset.c}`, { method: 'DELETE' }); openRecipe(id); } }]);
  $('rcAdd').onclick = () => rcBusy($('rcAdd'), async () => {
    const n = rcN, x = (m) => Math.round(r[m] * n);
    const { input_id } = await api('/api/quick', { method: 'POST', body: JSON.stringify({ date: today(), items: [{ product: r.title, portion: `${String(n).replace('.', ',')} portie`, kcal: x('kcal'), protein_g: x('protein_g'), carbs_g: x('carbs_g'), fat_g: x('fat_g'), amount: n, unit: 'stuk' }] }) });
    hide('rcSheet'); toast('Toegevoegd aan vandaag', 'Ongedaan maken', async () => { await api(`/api/items?input=${input_id}`, { method: 'DELETE' }).catch((e) => toast(e.message)); if (day === today()) load(); });
    if (day === today()) load();
  });
  const sendC = () => { const t = $('rcMsg').value.trim(); if (t) rcBusy($('rcSend'), async () => { await api('/api/comments', { method: 'POST', body: JSON.stringify({ recipe_id: id, text: t }) }); await openRecipe(id); loadRecipes(); }); };
  $('rcSend').onclick = sendC; $('rcMsg').onkeydown = (e) => { if (e.key === 'Enter') sendC(); };
  if (r.mine) $('rcDel').onclick = () => actions('Recept verwijderen? Reacties gaan ook weg.', [{ label: 'Verwijder', danger: true, fn: async () => { await api(`/api/recipes?id=${id}`, { method: 'DELETE' }); hide('rcSheet'); loadRecipes(); } }]);
  show('rcSheet'); $('rcSheet').querySelector('.card').scrollTop = 0;
  await rcPreview();
}
$('rcClose').onclick = () => hide('rcSheet');

// Nieuw recept: foto (verkleind, plus thumbnail), tekst, ✦ macro's per portie via AI (1 verzoek) of zelf invullen.
const rcShrink = async (img, max, q) => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = Object.assign(document.createElement('canvas'), { width: img.width * s, height: img.height * s }); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
$('rcPhotoIn').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return; const img = await createImageBitmap(f);
  rcPhoto = { photo: await rcShrink(img, 900, 0.72), thumb: await rcShrink(img, 200, 0.7) };
  $('rcPhotoL').style.backgroundImage = `url(${rcPhoto.photo})`; $('rcPhotoL').classList.add('on');
};
const rcF = ['rcTitle', 'rcServ', 'rcText', 'rcK', 'rcP', 'rcC', 'rcV'];
$('rcNewBtn').onclick = () => { rcF.forEach((f) => { $(f).value = f === 'rcServ' ? 2 : ''; }); rcPhoto = null; $('rcPhotoIn').value = ''; $('rcPhotoL').style.backgroundImage = ''; $('rcPhotoL').classList.remove('on'); $('rcNewS').textContent = ''; show('rcNew'); };
$('rcNewX').onclick = () => hide('rcNew');
$('rcAi').onclick = () => rcBusy($('rcAi'), async () => {
  if (!$('rcText').value.trim()) return void ($('rcNewS').textContent = 'Vul eerst de ingrediënten in.');
  $('rcNewS').textContent = '';
  const m = await api('/api/recipes/macros', { method: 'POST', body: JSON.stringify({ title: $('rcTitle').value, body: $('rcText').value, servings: +$('rcServ').value || 1 }) }).catch((e) => void ($('rcNewS').textContent = e.message));
  if (m) [['rcK', 'kcal'], ['rcP', 'protein_g'], ['rcC', 'carbs_g'], ['rcV', 'fat_g']].forEach(([f, k]) => { $(f).value = Math.round(m[k]) || 0; });
});
$('rcNewOk').onclick = () => rcBusy($('rcNewOk'), async () => {
  const b = { title: $('rcTitle').value, body: $('rcText').value, servings: +$('rcServ').value, kcal: +$('rcK').value, protein_g: +$('rcP').value, carbs_g: +$('rcC').value, fat_g: +$('rcV').value, ...rcPhoto };
  const r = await api('/api/recipes', { method: 'POST', body: JSON.stringify(b) }).catch((e) => void ($('rcNewS').textContent = e.message));
  if (!r) return; hide('rcNew'); rcQ = ''; $('rcSearch').value = ''; await loadRecipes(); openRecipe(r.id);
});
