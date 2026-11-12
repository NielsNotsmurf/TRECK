// Fase 12: Inzichten-tab. Statistieken + grafieken (inline SVG, geen bibliotheek); AI-samenvatting max 1× per dag.
let insDays = 30, insData = null;
const nl = (x) => Math.round(x).toLocaleString('nl-NL');
const dec = (x, n = 1) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(n).replace('.', ',');
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const dDiff = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);

async function loadInsights() {
  const s = insData = await api(`/api/stats?days=${insDays}`);
  // Periode begint bij de eerste data (anders is 90 d vooral leeg).
  const first = [s.days[0]?.date, s.weights[0]?.date, s.burn[0]?.date].filter(Boolean).sort()[0];
  if (first > s.from) s.from = first;
  const v = $('insBody'), n = dDiff(s.from, s.to) + 1;
  const done = s.days.filter((d) => d.date < s.to); // vandaag is nog niet af: telt niet mee in gemiddelden
  if (!s.days.length) { v.innerHTML = `<div class="card empty">Nog niets gelogd in deze periode.</div>`; return; }
  const goal = s.me?.goal || 'lose', pace = s.me?.pace || (goal === 'gain' ? 0.25 : 0.5);
  const delta = goal === 'keep' ? 0 : (goal === 'gain' ? 1 : -1) * Math.round(pace * 1100);
  const burnMap = Object.fromEntries(s.burn.map((b) => [b.date, b.kcal]));
  const T = s.target?.kcal ? s.target : null, goalK = T?.kcal || Math.max(1200, Math.round(avg(s.burn.map((b) => b.kcal)) || 2000) + delta);
  const k = avg(done.map((d) => d.kcal)), hit = done.filter((d) => Math.abs(d.kcal - goalK) <= goalK * 0.1).length;
  const both = done.filter((d) => burnMap[d.date] != null), bal = avg(both.map((d) => burnMap[d.date] - d.kcal));
  // Gewichtstrend: lineaire regressie (kg/week) over de wegingen in de periode.
  const ws = s.weights, xs = ws.map((w) => dDiff(ws[0].date, w.date)), mx = avg(xs), my = avg(ws.map((w) => w.kg));
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0), slope = ws.length > 1 && den ? xs.reduce((a, x, i) => a + (x - mx) * (ws[i].kg - my), 0) / den * 7 : null;

  const cell = (t, sub, val) => `<div class="cell"><div>${t}<small>${sub}</small></div><span class="val">${val}</span></div>`;
  v.innerHTML = `
  <h2>AI-samenvatting</h2><div class="card" id="insAi"></div>
  <h2>Voortgang</h2><div class="group">
    ${cell('Gem. inname', `doel ${nl(goalK)} kcal${T ? '' : ' (tijdelijk)'} · ${done.length} van ${Math.max(1, n - 1)} d gelogd`, `${nl(k)} kcal`)}
    ${cell('Op doel', 'dagen binnen 10% van je doel', `${hit} / ${done.length}`)}
    ${both.length ? cell(bal >= 0 ? 'Gem. tekort' : 'Gem. overschot', `verbruik − inname, ${both.length} d · verwacht ${dec(-bal * 7 / 7700, 2)} kg/week`, `${nl(Math.abs(bal))} kcal`) : ''}
    ${ws.length ? cell('Gewicht', slope != null ? `trend ${dec(slope, 2)} kg/week · ${dec(ws.at(-1).kg - ws[0].kg)} kg in ${dDiff(ws[0].date, ws.at(-1).date)} d` : '1 weging, nog geen trend', `${kg(ws.at(-1).kg)} kg`) : ''}
  </div>
  <h2>Inname per dag</h2><div class="card">${intakeChart(s, n, goalK, burnMap)}</div>
  ${ws.length > 1 ? `<h2>Gewicht</h2><div class="card">${weightChart(s, n)}</div>` : ''}
  <h2>Macro's · gem. per dag</h2><div class="card">${macroView(done, T)}</div>`;
  aiView(s.insight);
}

// Staafjes = inname, stippellijn = doel, oranje lijn = verbruik. Vandaag lichter (nog niet af).
function intakeChart(s, n, goalK, burnMap) {
  const W = 300, H = 130, top = 4, base = 112, bw = W / n;
  const max = Math.max(goalK * 1.2, ...s.days.map((d) => d.kcal), ...s.burn.map((b) => b.kcal));
  const y = (kc) => base - (kc / max) * (base - top), x = (date) => dDiff(s.from, date) * bw;
  const bars = s.days.map((d) => `<rect x="${(x(d.date) + bw * 0.15).toFixed(1)}" y="${y(d.kcal).toFixed(1)}" width="${(bw * 0.7).toFixed(1)}" height="${(base - y(d.kcal)).toFixed(1)}" rx="${Math.min(2, bw * 0.2).toFixed(1)}" fill="var(--accent)"${d.date === s.to ? ' opacity=".4"' : ''}/>`).join('');
  const burn = s.burn.length > 1 ? `<polyline fill="none" stroke="var(--warn)" stroke-width="1.5" points="${s.burn.map((b) => `${(x(b.date) + bw / 2).toFixed(1)},${y(b.kcal).toFixed(1)}`).join(' ')}"/>` : '';
  const lbl = (date, anchor) => `<text x="${anchor === 'end' ? W : 0}" y="${H - 2}" text-anchor="${anchor}" class="ax">${new Date(date + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">${bars}${burn}
    <line x1="0" x2="${W}" y1="${y(goalK)}" y2="${y(goalK)}" stroke="var(--fg)" stroke-opacity=".5" stroke-dasharray="3 3"/>
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>${lbl(s.from, 'start')}${lbl(s.to, 'end')}</svg>
    <div class="legend"><span><i style="background:var(--accent)"></i>Inname</span>${burn ? '<span><i style="background:var(--warn)"></i>Verbruik</span>' : ''}<span><i class="dash"></i>Doel ${nl(goalK)}</span></div>`;
}

function weightChart(s, n) {
  const W = 300, H = 120, ws = s.weights, lo = Math.min(...ws.map((w) => w.kg)) - 0.3, hi = Math.max(...ws.map((w) => w.kg)) + 0.3;
  const x = (date) => 34 + dDiff(s.from, date) / Math.max(1, n - 1) * (W - 40), y = (v) => 100 - (v - lo) / (hi - lo) * 90;
  const pts = ws.map((w) => [x(w.date), y(w.kg)]);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    <text x="0" y="${y(hi - 0.3) + 4}" class="ax">${kg(hi - 0.3)}</text><text x="0" y="${y(lo + 0.3) + 4}" class="ax">${kg(lo + 0.3)}</text>
    <line x1="34" x2="${W}" y1="100" y2="100" stroke="var(--line)"/>
    <polyline fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}"/>
    ${pts.map(([a, b]) => `<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}
    <text x="34" y="${H - 2}" class="ax">${new Date(s.from + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</text>
    <text x="${W}" y="${H - 2}" text-anchor="end" class="ax">${new Date(s.to + 'T12:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</text></svg>`;
}

// Gem. grammen t.o.v. doel + verdeling van de energie (eiwit/koolh. 4, vet 9 kcal per g).
function macroView(done, T) {
  if (!done.length) return '<div class="empty">Nog geen volledige dag gelogd</div>';
  const m = { p: avg(done.map((d) => d.p)), c: avg(done.map((d) => d.c)), f: avg(done.map((d) => d.f)) };
  const e = { p: m.p * 4, c: m.c * 4, f: m.f * 9 }, tot = e.p + e.c + e.f || 1;
  const rows = [['Eiwit', 'p', 'protein_g'], ['Koolhydraten', 'c', 'carbs_g'], ['Vet', 'f', 'fat_g']];
  return `<div id="insMac">${rows.map(([t, key, tk]) => `<div style="--m:var(--${key});--w:${T ? Math.min(100, m[key] / T[tk] * 100) : 100}%"><b>${nl(m[key])}${T ? `<small>/${T[tk]}</small>` : ''} g</b><span>${t}</span></div>`).join('')}</div>
    <div class="split">${rows.map(([, key]) => `<i style="width:${(e[key] / tot * 100).toFixed(1)}%;background:var(--${key})"></i>`).join('')}</div>
    <div class="legend">${rows.map(([t, key]) => `<span><i style="background:var(--${key})"></i>${t} ${Math.round(e[key] / tot * 100)}%</span>`).join('')}</div>
    ${T ? '' : '<p class="note">Doelen per macro volgen met je persoonlijke dagdoel.</p>'}`;
}

function aiView(ins) {
  const c = $('insAi');
  if (ins) { c.innerHTML = `<p class="aitxt"></p><p class="note">Vandaag gemaakt over de laatste 30 dagen · morgen kan er een nieuwe</p>`; c.querySelector('.aitxt').textContent = ins.text; return; }
  c.innerHTML = `<button class="btn primary" id="insBtn">${svg('spark')} Maak samenvatting</button><p class="note">1× per dag, over de laatste 30 dagen · telt mee voor je AI-limiet</p>`;
  $('insBtn').onclick = async () => {
    const b = $('insBtn'); b.disabled = true; b.innerHTML = '<span class="spin"></span>';
    try { aiView(await api('/api/insight', { method: 'POST' })); } catch (e) { toast(e.message); aiView(null); }
  };
}

$('insSeg').onclick = (e) => {
  const d = +e.target.dataset.d; if (!d) return; insDays = d;
  document.querySelectorAll('#insSeg button').forEach((b) => b.classList.toggle('on', b === e.target));
  loadInsights().catch((x) => toast(x.message));
};
