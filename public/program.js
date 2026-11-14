// Fase 13: Programma-tab, 14 nov: Coach (weekbudget, week-check-in, voedingsstijl). Doel in detail, kerncijfers (zelf te kiezen), voortgang, "vandaag nog" uit je favorieten (zonder AI) en AI-advies max 1× per dag.
let prg = null;
const KPI_DEF = ['bmi', 'weight', 'toGoal', 'trend', 'protKg', 'streak'];
const num = (x, n = 0) => x.toFixed(n).replace('.', ',');
const shortDate = (d) => new Date(d + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

// Gewichtstrend in kg/week (lineaire regressie) over wegingen vanaf `from`.
function trendOf(ws) {
  if (ws.length < 2 || dDiff(ws[0].date, ws.at(-1).date) < 5) return null;
  const xs = ws.map((w) => dDiff(ws[0].date, w.date)), mx = avg(xs), my = avg(ws.map((w) => w.kg));
  return xs.reduce((a, x, i) => a + (x - mx) * (ws[i].kg - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0) * 7;
}

// Context voor alle kerncijfers, één keer berekend.
function ctxOf(s, p) {
  const to = s.to, done = s.days.filter((d) => d.date < to), last7 = done.filter((d) => d.date >= addDays(to, -7));
  const ws = s.weights, w = ws.at(-1)?.kg, T = s.target?.kcal ? s.target : null, h = p.h / 100;
  const bmi = w && h ? w / h / h : null;
  const fat = bmi && p.age && p.sex ? 1.2 * bmi + 0.23 * p.age - 10.8 * (p.sex === 'm') - 5.4 : null; // Deurenberg
  const bmr = w && p.h && p.age && p.sex ? 10 * w + 6.25 * p.h - 5 * p.age + (p.sex === 'm' ? 5 : -161) : null; // Mifflin-St Jeor
  const tdee = T?.tdee || (bmr ? Math.round(bmr * 1.4) : null);
  const goal = s.me?.goal || 'lose', pace = s.me?.pace || (goal === 'gain' ? 0.25 : 0.5);
  const goalK = T?.kcal || (tdee ? Math.max(1200, tdee + (goal === 'keep' ? 0 : (goal === 'gain' ? 1 : -1) * Math.round(pace * 1100))) : null);
  const protT = T?.protein_g || (w ? Math.round(w * ({ lose: 1.8, keep: 1.6, muscle: 2.2, gain: 1.8 }[p.focus || goal] || 1.8)) : null);
  const trend = trendOf(ws.filter((x) => x.date >= addDays(to, -28)));
  let streak = 0; const logged = new Set(s.days.map((d) => d.date));
  for (let d = logged.has(to) ? to : addDays(to, -1); logged.has(d); d = addDays(d, -1)) streak++;
  const m = { p: avg(last7.map((d) => d.p)), c: avg(last7.map((d) => d.c)), f: avg(last7.map((d) => d.f)) }, e = m.p * 4 + m.c * 4 + m.f * 9 || 1;
  const eta = p.tkg && w && trend && Math.sign(p.tkg - w) === Math.sign(trend) ? addDays(to, Math.round((p.tkg - w) / trend * 7)) : null;
  const burn7 = s.burn.filter((b) => b.date >= addDays(to, -7) && b.date < to);
  return { s, p, to, done, last7, ws, w, T, bmi, fat, bmr, tdee, goalK, protT, trend, streak, m, e, eta, burn7, today: s.days.find((d) => d.date === to) || { kcal: 0, p: 0 } };
}

// Catalogus: [id, groep, label, (c) => [waarde, toelichting] of null als data ontbreekt (met wat er nodig is)].
const need = (t) => [null, t];
const KPIS = [
  ['bmi', 'Lichaam', 'BMI', (c) => (c.bmi ? [num(c.bmi, 1), c.bmi < 18.5 ? 'ondergewicht' : c.bmi < 25 ? 'gezond' : c.bmi < 30 ? 'overgewicht' : 'obesitas'] : need('lengte + weging'))],
  ['weight', 'Lichaam', 'Gewicht', (c) => (c.w ? [`${kg(c.w)} kg`, shortDate(c.ws.at(-1).date)] : need('weging'))],
  ['toGoal', 'Lichaam', 'Naar streefgewicht', (c) => (c.w && c.p.tkg ? [`${dec(c.p.tkg - c.w)} kg`, `doel ${kg(c.p.tkg)} kg`] : need('streefgewicht'))],
  ['eta', 'Lichaam', 'Verwacht op doel', (c) => (c.eta ? [shortDate(c.eta), 'bij huidige trend'] : need(c.p.tkg ? 'trend richting doel' : 'streefgewicht'))],
  ['trend', 'Lichaam', 'Gewichtstrend', (c) => (c.trend != null ? [`${dec(c.trend, 2)}`, 'kg/week · 4 weken'] : need('wegingen ≥ 5 d'))],
  ['change30', 'Lichaam', 'Verschil 30 d', (c) => { const ws = c.ws.filter((x) => x.date >= addDays(c.to, -30)); return ws.length > 1 ? [`${dec(ws.at(-1).kg - ws[0].kg)} kg`, `sinds ${shortDate(ws[0].date)}`] : need('2 wegingen'); }],
  ['change90', 'Lichaam', 'Verschil 90 d', (c) => (c.ws.length > 1 ? [`${dec(c.ws.at(-1).kg - c.ws[0].kg)} kg`, `sinds ${shortDate(c.ws[0].date)}`] : need('2 wegingen'))],
  ['healthy', 'Lichaam', 'Gezond gewicht', (c) => (c.p.h ? [`${Math.round(18.5 * (c.p.h / 100) ** 2)}–${Math.round(25 * (c.p.h / 100) ** 2)}`, 'kg · BMI 18,5–25'] : need('lengte'))],
  ['fat', 'Lichaam', 'Vetpercentage', (c) => (c.fat ? [`${Math.round(c.fat)}%`, 'schatting uit BMI'] : need('lengte, leeftijd, geslacht'))],
  ['lbm', 'Lichaam', 'Vetvrije massa', (c) => (c.fat ? [`${kg(c.w * (1 - c.fat / 100))} kg`, 'schatting'] : need('lengte, leeftijd, geslacht'))],
  ['bmr', 'Energie', 'Ruststofwisseling', (c) => (c.bmr ? [nl(c.bmr), 'kcal/dag · Mifflin'] : need('lengte, leeftijd, geslacht'))],
  ['tdee', 'Energie', 'Verbruik', (c) => (c.tdee ? [nl(c.tdee), c.T?.adaptive ? 'kcal/dag · uit je data' : 'kcal/dag · schatting'] : need('14 d loggen of je lengte'))],
  ['goalK', 'Energie', 'Dagdoel', (c) => (c.goalK ? [nl(c.goalK), c.T?.adaptive ? 'kcal · adaptief' : 'kcal · voorlopig'] : need('verbruik'))],
  ['left', 'Energie', 'Nog vandaag', (c) => (c.goalK ? [nl(c.goalK - c.today.kcal), 'kcal over'] : need('dagdoel'))],
  ['avg7', 'Energie', 'Gem. inname', (c) => (c.last7.length ? [nl(avg(c.last7.map((d) => d.kcal))), 'kcal · 7 d'] : need('gelogde dagen'))],
  ['avg30', 'Energie', 'Gem. inname 30 d', (c) => { const d = c.done.filter((x) => x.date >= addDays(c.to, -30)); return d.length ? [nl(avg(d.map((x) => x.kcal))), 'kcal/dag'] : need('gelogde dagen'); }],
  ['deficit', 'Energie', 'Gem. tekort', (c) => (c.tdee && c.last7.length ? [nl(c.tdee - avg(c.last7.map((d) => d.kcal))), 'kcal/dag · 7 d'] : need('verbruik + logs'))],
  ['burn7', 'Energie', 'Gem. verbruik (Garmin)', (c) => (c.burn7.length ? [nl(avg(c.burn7.map((b) => b.kcal))), 'kcal · 7 d'] : need('verbruik koppelen'))],
  ['protKg', "Macro's", 'Eiwit per kg', (c) => (c.w && c.last7.length ? [num(c.m.p / c.w, 1), `g/kg · doel ${num(c.protT / c.w, 1)}`] : need('weging + logs'))],
  ['prot', "Macro's", 'Eiwit', (c) => (c.last7.length ? [`${nl(c.m.p)} g`, c.protT ? `gem. 7 d · doel ${c.protT}` : 'gem. 7 d'] : need('logs'))],
  ['protPct', "Macro's", 'Eiwit-aandeel', (c) => (c.last7.length ? [`${Math.round(c.m.p * 4 / c.e * 100)}%`, 'van je energie'] : need('logs'))],
  ['carbPct', "Macro's", 'Koolhydraat-aandeel', (c) => (c.last7.length ? [`${Math.round(c.m.c * 4 / c.e * 100)}%`, 'van je energie'] : need('logs'))],
  ['fatPct', "Macro's", 'Vet-aandeel', (c) => (c.last7.length ? [`${Math.round(c.m.f * 9 / c.e * 100)}%`, 'van je energie'] : need('logs'))],
  ['protHit', "Macro's", 'Eiwit gehaald', (c) => (c.protT && c.last7.length ? [`${c.last7.filter((d) => d.p >= c.protT * 0.9).length}/${c.last7.length}`, 'dagen · 7 d'] : need('eiwitdoel'))],
  ['onGoal', 'Gewoonten', 'Op doel', (c) => (c.goalK && c.last7.length ? [`${c.last7.filter((d) => Math.abs(d.kcal - c.goalK) <= c.goalK * 0.1).length}/${c.last7.length}`, 'dagen ±10% · 7 d'] : need('dagdoel'))],
  ['streak', 'Gewoonten', 'Reeks', (c) => [`${c.streak} d`, 'achter elkaar gelogd']],
  ['logged30', 'Gewoonten', 'Gelogd', (c) => [`${c.done.filter((d) => d.date >= addDays(c.to, -30)).length}/30`, 'dagen · 30 d']],
  ['weighs30', 'Gewoonten', 'Wegingen', (c) => [`${c.ws.filter((x) => x.date >= addDays(c.to, -30)).length}`, 'laatste 30 d']],
];

async function loadProgram() {
  const [s, r, q] = await Promise.all([api('/api/stats?days=90'), api('/api/program'), api('/api/quick')]);
  prg = { s, p: r.p || {}, advice: r.advice, q };
  renderProgram();
}

function renderProgram() {
  const { s, p } = prg, c = ctxOf(s, p), v = $('prgBody');
  const on = p.kpis?.length ? p.kpis : KPI_DEF;
  const tiles = on.map((id) => KPIS.find((k) => k[0] === id)).filter(Boolean).map(([, , t, f]) => {
    const [val, sub] = f(c);
    return `<div class="kpi${val == null ? ' off' : ''}"><span>${t}</span><b>${val ?? 'Nog niet'}</b><small>${val == null ? `nodig: ${sub}` : sub}</small></div>`;
  }).join('');
  const FOC = { lose: 'Afvallen', keep: 'Op gewicht', muscle: 'Spieropbouw', gain: 'Aankomen' }, DIET = { laagkh: 'koolhydraatarm', laagvet: 'vetarm', keto: 'keto' };
  const goalTxt = p.tkg ? `${kg(p.tkg)} kg${p.tdate ? ` op ${shortDate(p.tdate)}` : ''}` : 'Stel je streefgewicht in';
  v.innerHTML = `
  <div class="group"><button class="cell nav" id="prgGoal">${svg('target')}<div>${FOC[p.focus || s.me?.goal || 'lose']}${p.diet && DIET[p.diet] ? ` · ${DIET[p.diet]}` : ''}<small>${goalTxt}</small></div></button></div>
  <h2>Weekbudget</h2>${budget(c)}
  <h2>Week-check-in</h2><div class="group">${progress(c)}</div>
  <div class="kpihead"><h2>Kerncijfers</h2><button id="kpiEdit">Wijzig</button></div>
  <div class="kpis">${tiles || '<div class="kpi off"><b>Kies cijfers via Wijzig</b></div>'}</div>
  <h2>Past nog vandaag</h2><div class="group" id="prgNow">${nowView(c)}</div>
  <h2>Coach-advies</h2><div class="card" id="prgAi"></div>`;
  $('prgGoal').onclick = openGoal; $('kpiEdit').onclick = openKpis;
  v.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => addNow(prg.sugg[+b.dataset.add]); });
  adviceView(prg.advice);
}

// Weekbudget (ma–zo, zoals Lose It/MacroFactor): dagdoel × 7; wat je eerder in de week over- of onderat verdeelt zich over de resterende dagen.
// Niet-gelogde dagen tellen als op doel, zodat vergeten loggen het budget niet opblaast.
function budget(c) {
  if (!c.goalK) return '<div class="group"><div class="cell"><div>Nog geen dagdoel<small>Stel je doel in of log twee weken</small></div></div></div>';
  const dow = (new Date(c.to + 'T12:00').getDay() + 6) % 7, mon = addDays(c.to, -dow), B = c.goalK * 7;
  const wk = [...Array(7)].map((_, i) => { const d = addDays(mon, i), x = c.s.days.find((y) => y.date === d); return { d, i, k: x ? x.kcal : null }; });
  const past = wk.slice(0, dow).reduce((a, x) => a + (x.k ?? c.goalK), 0), perDay = Math.round((B - past) / (7 - dow));
  const used = past + c.today.kcal, left = B - used, todayLeft = perDay - c.today.kcal, max = Math.max(c.goalK * 1.4, ...wk.map((x) => x.k || 0), perDay);
  const h = (k) => `${Math.min(100, k / max * 100)}%`;
  const bars = wk.map((x) => x.i < dow ? `<div><i class="${x.k == null ? 'est' : ''}" style="height:${h(x.k ?? c.goalK)}${x.k == null ? '' : `;background:linear-gradient(${tone(x.k / c.goalK)}, ${tone(x.k / c.goalK * 0.8, false, 60)})`}"></i></div>`
    : x.i === dow ? `<div><i style="height:${h(Math.max(c.today.kcal, 1))};background:linear-gradient(${tone(c.today.kcal / perDay)}, ${tone(c.today.kcal / perDay * 0.8, false, 60)})"></i></div>` : `<div><i class="plan" style="height:${h(perDay)}"></i></div>`).join('');
  const diff = perDay - c.goalK, note = Math.abs(diff) < 25 ? 'Je ligt op koers: je dagdoel blijft gelijk.'
    : diff > 0 ? `Je hebt ${nl(diff * (7 - dow))} kcal gespaard: ${nl(diff)} kcal per dag extra ruimte tot zondag.`
    : `Eerder deze week ${nl(-diff * (7 - dow))} kcal te veel: ${nl(-diff)} kcal per dag minder tot zondag.${perDay < 1200 ? ' Ga niet onder 1200 kcal; neem het verlies liever mee.' : ''}`;
  return `<div class="wb"><div class="top"><b>${nl(Math.max(0, todayLeft))}</b><span>${nl(left)} van ${nl(B)} kcal over</span></div><span class="sub">kcal ruimte vandaag</span>
    <div class="days"><hr style="bottom:${h(c.goalK)}">${bars}</div>
    <div class="lbl">${['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((t, i) => `<span${i === dow ? ' class="now"' : ''}>${t}</span>`).join('')}</div>
    <div class="aibar${used > B ? ' full' : ''}"><span><i style="width:${Math.min(100, used / B * 100)}%"></i></span></div><p>${note}</p></div>`;
}

// Week-check-in (zoals MacroFactor): deze week tegenover vorige week, op schema richting streefgewicht en waarom je doel is wat het is.
const wAvg = (ws, a, b) => { const x = ws.filter((w) => w.date >= a && w.date <= b); return x.length ? avg(x.map((w) => w.kg)) : null; };
function checkin(c) {
  const dow = (new Date(c.to + 'T12:00').getDay() + 6) % 7, mon = addDays(c.to, -dow), pm = addDays(mon, -7);
  const now = wAvg(c.ws, mon, c.to), prev = wAvg(c.ws, pm, addDays(mon, -1));
  const dd = (a, b) => c.s.days.filter((d) => d.date >= a && d.date <= b && d.date < c.to);
  const iNow = dd(mon, c.to), iPrev = dd(pm, addDays(mon, -1));
  const cell = (t, sub, val) => `<div class="cell"><div>${t}<small>${sub}</small></div><span class="val">${val}</span></div>`;
  const out = [];
  if (now != null) out.push(cell('Gewicht', prev != null ? `gem. deze week · vorige week ${kg(prev)} kg` : 'gem. deze week', prev != null ? `${dec(now - prev)} kg` : `${kg(now)} kg`));
  if (iNow.length || iPrev.length) out.push(cell('Inname', `gem. per gelogde dag${iPrev.length ? ` · vorige week ${nl(avg(iPrev.map((d) => d.kcal)))}` : ''}`, iNow.length ? `${nl(avg(iNow.map((d) => d.kcal)))} kcal` : '–'));
  if (c.T?.why) out.push(`<div class="cell"><div>Je doel<small>${c.T.why}</small></div></div>`);
  return out.join('');
}

// Op schema: verwachte datum bij huidige trend vs streefdatum; plus weekscore.
function progress(c) {
  const cell = (t, sub, val) => `<div class="cell"><div>${t}<small>${sub}</small></div><span class="val">${val}</span></div>`;
  const out = [];
  if (c.p.tkg && c.w) {
    const weeks = c.p.tdate ? dDiff(c.to, c.p.tdate) / 7 : 0, need_ = weeks > 0 ? (c.p.tkg - c.w) / weeks : null;
    let sub = c.trend == null ? 'Nog geen trend: weeg minstens een week' : c.eta ? `Bij je trend haal je het rond ${shortDate(c.eta)}` : 'Je trend gaat nog de andere kant op';
    if (c.eta && c.p.tdate) { const late = Math.round(dDiff(c.p.tdate, c.eta) / 7); sub += late > 0 ? `, ${late} wk later dan gepland` : late < 0 ? `, ${-late} wk eerder dan gepland` : ', precies op tijd'; }
    out.push(cell('Op schema', sub, need_ != null ? `${dec(need_, 2)} kg/wk nodig` : ''));
  }
  if (c.last7.length) {
    const kh = c.goalK ? c.last7.filter((d) => Math.abs(d.kcal - c.goalK) <= c.goalK * 0.1).length : null, ph = c.protT ? c.last7.filter((d) => d.p >= c.protT * 0.9).length : null;
    out.push(cell('Laatste 7 dagen', [kh != null && `kcal binnen marge ${kh}/${c.last7.length}`, ph != null && `eiwit gehaald ${ph}/${c.last7.length}`].filter(Boolean).join(' · ') || 'Nog geen doel', `${c.last7.length}/7 gelogd`));
  }
  return checkin(c) + out.join('') || '<div class="cell"><div>Nog te weinig data<small>Log een paar dagen en weeg je af en toe</small></div></div>';
}

// Vandaag nog: eigen gerechten en vaste combinaties die in je resterende kcal passen; meer eiwit eerst als je eiwit tekort komt.
function nowView(c) {
  const kLeft = c.goalK ? c.goalK - c.today.kcal : null, pLeft = c.protT ? c.protT - c.today.p : 0;
  if (kLeft == null) return '<div class="cell"><div>Nog geen dagdoel<small>Stel je doel in of log twee weken</small></div></div>';
  const all = [...prg.q.meals, ...prg.q.combos].map((m) => ({ ...m, k: m.items.reduce((a, i) => a + (+i.kcal || 0), 0), pr: m.items.reduce((a, i) => a + (+i.protein_g || 0), 0) }));
  prg.sugg = all.filter((m) => m.k > 0 && m.k <= kLeft + 50).sort((a, b) => (pLeft > 10 ? b.pr / b.k - a.pr / a.k : b.k - a.k)).slice(0, 3);
  const head = `<div class="cell"><div>${kLeft > 0 ? `Nog ${nl(kLeft)} kcal` : `${nl(-kLeft)} kcal boven je doel`}<small>${pLeft > 0 ? `en ${nl(pLeft)} g eiwit` : 'eiwit gehaald'}</small></div></div>`;
  if (kLeft <= 50) return head;
  return head + (prg.sugg.map((m, i) => `<div class="cell"><div>${esc(m.name)}<small>${nl(m.k)} kcal · ${nl(m.pr)} g eiwit</small></div><button class="add" data-add="${i}" aria-label="Toevoegen">${svg('plus')}</button></div>`).join('')
    || '<div class="cell"><div><small>Bewaar favorieten om hier suggesties te krijgen</small></div></div>');
}
async function addNow(m) {
  const { input_id } = await api('/api/quick', { method: 'POST', body: JSON.stringify({ items: m.items, date: prg.s.to, meal_id: m.id }) });
  toast(`${m.name} toegevoegd`, 'Ongedaan', async () => { await api(`/api/items?input=${input_id}`, { method: 'DELETE' }); loadProgram(); });
  loadProgram();
}

// Advies: tips (regels met "- ") als lijst, de voorbeelddag eronder.
function adviceView(a) {
  const c = $('prgAi'), fresh = a?.d === prg.s.to;
  const btn = `<button class="btn ${a ? '' : 'primary'}" id="advBtn">${svg('spark')} ${a ? 'Nieuw advies' : 'Vraag advies'}</button>`;
  if (a) {
    const lines = a.text.split('\n').map((l) => l.trim()).filter(Boolean), tips = lines.filter((l) => /^[-•*]\s/.test(l)), rest = lines.filter((l) => !/^[-•*]\s/.test(l));
    c.innerHTML = `<ul>${tips.map((t) => `<li>${esc(t.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul><p class="day">${esc(rest.join('\n'))}</p>
      ${fresh ? '' : btn}<p class="note">${fresh ? 'Vandaag gemaakt · morgen kan er een nieuw' : `Van ${shortDate(a.d)} · 1× per dag, telt mee voor je AI-limiet`}</p>`;
  } else c.innerHTML = `${btn}<p class="note">Op basis van je laatste 14 dagen en wat je vaak eet · 1× per dag, telt mee voor je AI-limiet</p>`;
  const b = $('advBtn'); if (!b) return;
  b.onclick = async () => {
    b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try { prg.advice = await api('/api/advice', { method: 'POST' }); } catch (e) { toast(e.message); }
    adviceView(prg.advice);
  };
}

// Mijn doel
function openGoal() {
  const p = prg.p;
  $('pFocus').value = p.focus || prg.s.me?.goal || 'lose'; $('pDiet').value = p.diet || 'balans'; $('pTkg').value = p.tkg ? kg(p.tkg) : ''; $('pTdate').value = p.tdate || ''; $('pPace').value = String(prg.s.me?.pace || 0.5);
  $('pH').value = p.h || ''; $('pAge').value = p.age || ''; $('pSex').value = p.sex || '';
  show('progSheet');
}
$('progSave').onclick = async () => {
  const body = { focus: $('pFocus').value, diet: $('pDiet').value, tkg: $('pTkg').value, tdate: $('pTdate').value, pace: $('pPace').value, h: $('pH').value, age: $('pAge').value, sex: $('pSex').value };
  await api('/api/program', { method: 'POST', body: JSON.stringify(body) });
  hide('progSheet'); toast('Doel bewaard'); loadProgram();
};

// Kerncijfers kiezen: per groep een lijst met schakelaars; volgorde = volgorde van aanzetten.
let kpiSel = [];
function openKpis() {
  kpiSel = [...(prg.p.kpis?.length ? prg.p.kpis : KPI_DEF)];
  const groups = [...new Set(KPIS.map((k) => k[1]))];
  $('kpiList').innerHTML = groups.map((g) => `<h2>${g}</h2><div class="group">${KPIS.filter((k) => k[1] === g).map(([id, , t]) =>
    `<label class="cell"><div>${t}</div><input type="checkbox" class="tgl" data-k="${id}"${kpiSel.includes(id) ? ' checked' : ''}></label>`).join('')}</div>`).join('');
  $('kpiList').querySelectorAll('[data-k]').forEach((i) => { i.onchange = () => { kpiSel = kpiSel.filter((k) => k !== i.dataset.k); if (i.checked) kpiSel.push(i.dataset.k); }; });
  show('kpiSheet');
}
$('kpiSave').onclick = async () => {
  const r = await api('/api/program', { method: 'POST', body: JSON.stringify({ kpis: kpiSel.length ? kpiSel : KPI_DEF }) });
  prg.p = r.p; hide('kpiSheet'); renderProgram();
};
document.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => b.closest('.sheet').classList.add('hidden'); });
