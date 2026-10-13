/* Taf' – pointage d'heures pour jobs étudiants (version web / iPhone)
 * Toutes les données sont stockées sur l'appareil (localStorage).
 */
'use strict';
 
// =====================================================================
// Données
// =====================================================================
const STORE_KEY = 'taf-data-v1';
const SINCE_FOREVER = '0000-01-01';
const PALETTE = ['#6C4CF1', '#00A88F', '#FF7A3D', '#E84A7F', '#2E86DE', '#F5B700', '#8E44AD', '#27AE60', '#D35400', '#34495E'];
const EMOJIS = ['🍔', '🍕', '☕', '🛒', '🌱', '🐶', '👶', '📦', '🧹', '⚽', '🎸', '💻', '🚲', '🏊', '💼'];
 
let db = load();
 
function emptyDb() { return { version: 1, employers: [], shifts: [], payments: [] }; }
 
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyDb();
    const d = JSON.parse(raw);
    return { ...emptyDb(), ...d };
  } catch (e) {
    return emptyDb();
  }
}
 
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('⚠️ Impossible d\'enregistrer : ' + e.message);
  }
}
 
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const empById = (id) => db.employers.find((e) => e.id === id);
 
// =====================================================================
// Formats (fr-BE)
// =====================================================================
const moneyFmt = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });
const money = (v) => moneyFmt.format(v || 0);
const dec = (v, d = 2) => (v || 0).toLocaleString('fr-BE', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
const pad = (n) => String(n).padStart(2, '0');
const duration = (min) => `${Math.floor(min / 60)}h${pad(min % 60)}`;
const chrono = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const timeStr = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dateStr = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dayShort = (d) => cap(d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' }));
const dayLong = (d) => cap(d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' }));
const monthLabel = (y, m) => cap(new Date(y, m, 1).toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' }));
const monthShort = (y, m) => cap(new Date(y, m, 1).toLocaleDateString('fr-BE', { month: 'short' })).replace('.', '');
const parseDec = (s) => { const v = parseFloat(String(s).trim().replace(',', '.')); return Number.isFinite(v) ? v : null; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
 
// =====================================================================
// Calcul de la paie
// =====================================================================
function rateFor(emp, key) {
  const rates = [...(emp.rates || [])].sort((a, b) => (a.from < b.from ? -1 : 1));
  let found = null;
  for (const r of rates) if (r.from <= key) found = r;
  return (found || rates[0])?.rate ?? 0;
}
const currentRate = (emp) => rateFor(emp, dayKey(new Date()));
 
/** Calcule la paie d'un shift (aussi pour un aperçu non enregistré). */
function pay(shift, now = Date.now()) {
  const end = shift.end ?? now;
  const runningPause = shift.pauseStart ? Math.max(0, end - shift.pauseStart) : 0;
  const worked = Math.max(0, end - shift.start - (shift.breakMin || 0) * 60000 - runningPause);
  const minutes = Math.floor(worked / 60000);
  const emp = empById(shift.employerId);
  if (!emp) return { worked, minutes, rate: 0, base: 0, bonus: 0, total: 0 };
 
  const sd = new Date(shift.start);
  const rate = rateFor(emp, dayKey(sd));
  const base = (worked / 3600000) * rate;
  let bonus = 0;
  // Bonus dimanche : uniquement sur les heures prestées un dimanche (ex. samedi 22h → dimanche 2h = 2 h bonus)
  if (emp.weekendPct > 0) {
    let sundayMs = 0;
    for (let i = 0; i < 2; i++) {
      const d0 = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + i);
      if (d0.getDay() !== 0) continue;
      const from = Math.max(shift.start, d0.getTime());
      const to = Math.min(end, new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1).getTime());
      if (to > from) sundayMs += to - from;
    }
    bonus += (Math.min(sundayMs, worked) / 3600000) * rate * (emp.weekendPct / 100);
  }
  if (emp.eveningPct > 0) {
    const h = Math.min(23, Math.max(0, emp.eveningHour ?? 20));
    const eveStart = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), h).getTime();
    const eveEnd = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate() + 1, 6).getTime();
    const from = Math.max(shift.start, eveStart);
    const to = Math.min(end, eveEnd);
    if (to > from) bonus += (Math.min(to - from, worked) / 3600000) * rate * (emp.eveningPct / 100);
  }
  return { worked, minutes, rate, base, bonus, total: base + bonus };
}
 
const completed = () => db.shifts.filter((s) => s.end != null).sort((a, b) => b.start - a.start);
const running = () => db.shifts.find((s) => s.end == null);
 
/** Shifts terminés entre deux dates (incluses), triés chronologiquement. */
function shiftsIn(from, to, employerId = null) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
  return db.shifts
    .filter((s) => s.end != null && s.start >= a && s.start < b && (!employerId || s.employerId === employerId))
    .sort((x, y) => x.start - y.start);
}
const sumPay = (list) => list.reduce((t, s) => t + pay(s).total, 0);
const sumMin = (list) => list.reduce((t, s) => t + pay(s).minutes, 0);
const earned = (empId) => sumPay(db.shifts.filter((s) => s.end != null && s.employerId === empId));
const received = (empId) => db.payments.filter((p) => p.employerId === empId).reduce((t, p) => t + p.amount, 0);
const balance = (empId) => earned(empId) - received(empId);
const totalToReceive = () => db.employers.reduce((t, e) => t + Math.max(0, balance(e.id)), 0);
const monthRange = (y, m) => [new Date(y, m, 1), new Date(y, m + 1, 0)];
 
// =====================================================================
// Petits composants HTML
// =====================================================================
const avatar = (emp, size = 44) =>
  `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${size / 2}px;background:${alpha(emp?.color || '#9E9E9E', 0.18)}">${esc(emp?.emoji || '❓')}</span>`;
 
const kv = (label, value, cls = '') => `<div class="kv"><span>${esc(label)}</span><span class="${cls}">${esc(value)}</span></div>`;
 
function shiftRow(s) {
  const e = empById(s.employerId);
  const p = pay(s);
  const hours = s.end != null ? `${timeStr(s.start)} – ${timeStr(s.end)}` : `${timeStr(s.start)} – en cours ⏱`;
  return `<button class="shift" data-action="edit-shift" data-id="${s.id}">
    <span class="bar" style="background:${e?.color || '#999'}"></span>
    ${avatar(e, 40)}
    <span class="grow">
      <div class="bold ellipsis">${esc(e?.name || 'Employeur supprimé')}</div>
      <div class="small muted">${dayShort(new Date(s.start))} · ${hours}</div>
      ${s.note ? `<div class="small muted ellipsis">${esc(s.note)}</div>` : ''}
    </span>
    <span class="right"><div class="bold">${money(p.total)}</div><div class="small muted">${duration(p.minutes)}</div></span>
  </button>`;
}
 
function chart() {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  const data = months.map((m) => {
    const [a, b] = monthRange(m.getFullYear(), m.getMonth());
    const list = shiftsIn(a, b);
    const parts = db.employers.map((e) => ({ color: e.color, v: sumPay(list.filter((s) => s.employerId === e.id)) })).filter((p) => p.v > 0);
    return { m, parts, total: parts.reduce((t, p) => t + p.v, 0) };
  });
  const max = Math.max(1, ...data.map((d) => d.total));
  return `<div class="chart">${data.map((d, i) => `
    <div class="col">
      <span class="lbl">${d.total > 0 ? Math.round(d.total) + '€' : ''}</span>
      <div class="stack" style="height:${Math.max(4, (d.total / max) * 120)}px">
        ${d.parts.map((p) => `<i style="display:block;background:${p.color};height:${(p.v / d.total) * 100}%"></i>`).join('')}
      </div>
      <span class="lbl" style="${i === 5 ? 'font-weight:700;color:var(--text)' : ''}">${monthShort(d.m.getFullYear(), d.m.getMonth())}</span>
    </div>`).join('')}</div>`;
}
 
// =====================================================================
// État de l'interface
// =====================================================================
const ui = {
  tab: 'home',
  chosenEmployer: null,
  calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calSelected: dayKey(new Date()),
  exportPeriod: 'month',
  exportMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  exportYear: new Date().getFullYear(),
  exportEmployer: '',
};
 
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
 
// =====================================================================
// Écrans
// =====================================================================
function viewHome() {
  const now = new Date();
  const [a, b] = monthRange(now.getFullYear(), now.getMonth());
  const monthShifts = shiftsIn(a, b);
  const h = now.getHours();
  const hello = h >= 5 && h < 12 ? 'Salut, bien dormi ? ☀️' : h >= 12 && h < 18 ? 'Hello ! 👋' : 'Bonsoir ! 🌙';
  const recent = completed().slice(0, 5);
 
  let html = `
    <div><h1>${hello}</h1><div class="muted">Voyons ce que tu as gagné.</div></div>
    ${!isStandalone() ? `<div class="install">📲 <b>Installe Taf' sur ton iPhone :</b> touche le bouton <b>Partager</b> de Safari puis <b>« Sur l'écran d'accueil »</b>. L'appli s'ouvrira alors en plein écran, comme une vraie app.</div>` : ''}
    <div class="hero">
      <div style="opacity:.85">Gagné en ${monthLabel(now.getFullYear(), now.getMonth())}</div>
      <div class="amount">${money(sumPay(monthShifts))}</div>
      <div class="stats">
        <div><span>⏱ Heures</span><b>${duration(sumMin(monthShifts))}</b></div>
        <div><span>📋 Shifts</span><b>${monthShifts.length}</b></div>
        <div><span>💶 À recevoir</span><b>${money(totalToReceive())}</b></div>
      </div>
    </div>
    <div class="card big" id="chrono-card">${chronoCard()}</div>`;
 
  if (completed().length) html += `<div class="card"><h3>Mes 6 derniers mois</h3>${chart()}</div>`;
 
  const byEmp = db.employers.map((e) => ({ e, list: monthShifts.filter((s) => s.employerId === e.id) })).filter((x) => x.list.length);
  if (byEmp.length) {
    html += `<div class="card"><h3>Ce mois-ci par employeur</h3>${byEmp.map(({ e, list }) => `
      <div class="row" style="padding:6px 0">
        ${avatar(e, 36)}
        <div class="grow"><div class="bold">${esc(e.name)}</div><div class="small muted">${list.length} shift(s) · ${duration(sumMin(list))}</div></div>
        <div class="bold" style="color:${e.color}">${money(sumPay(list))}</div>
      </div>`).join('')}</div>`;
  }
 
  if (recent.length) {
    html += `<div class="row"><h2 class="grow">Derniers shifts</h2><button class="btn ghost" data-action="tab" data-tab="calendar">Tout voir</button></div>
      ${recent.map(shiftRow).join('')}`;
  }
  return html;
}
 
function chronoCard() {
  if (!db.employers.length) {
    return `<h2>Bienvenue dans Taf' 🎉</h2>
      <p class="muted">Commence par ajouter ton premier employeur et son taux horaire.</p>
      <button class="btn" data-action="new-employer">Ajouter un employeur</button>`;
  }
  const r = running();
  if (r) {
    const e = empById(r.employerId);
    const paused = !!r.pauseStart;
    const p = pay(r);
    return `<div class="row">
        ${avatar(e)}
        <div class="grow"><div class="bold">${paused ? 'En pause ☕' : 'En service chez ' + esc(e?.name || '?')}</div>
        <div class="small muted">Depuis ${timeStr(r.start)}</div></div>
        <span class="dot" style="background:${paused ? '#F5B700' : '#27AE60'}"></span>
      </div>
      <div class="timer" id="timer">${chrono(p.worked)}</div>
      <div class="live" id="live">+ ${money(p.total)}</div>
      <div class="btns">
        <button class="btn light" data-action="pause">${paused ? '▶️ Reprendre' : '⏸ Pause'}</button>
        <button class="btn danger" data-action="stop">⏹ Je termine</button>
      </div>`;
  }
  const lastUsed = completed()[0]?.employerId;
  const sel = [ui.chosenEmployer, lastUsed].find((id) => id && empById(id)) || db.employers[0].id;
  ui.chosenEmployer = sel;
  return `<div class="bold" style="margin-bottom:10px">Pour qui tu bosses ?</div>
    <div class="chips" style="margin-bottom:14px">
      ${db.employers.map((e) => `<button class="chip ${e.id === sel ? 'on' : ''}" style="--c:${e.color}" data-action="choose" data-id="${e.id}">${esc(e.emoji)} ${esc(e.name)}</button>`).join('')}
    </div>
    <button class="btn xl" data-action="start">▶︎ Je commence</button>
    <div class="small muted center" style="margin-top:8px">Taux actuel : ${money(currentRate(empById(sel)))}/h</div>`;
}
 
function viewCalendar() {
  const y = ui.calMonth.getFullYear();
  const m = ui.calMonth.getMonth();
  const [a, b] = monthRange(y, m);
  const monthShifts = shiftsIn(a, b);
  const offset = (a.getDay() + 6) % 7; // lundi = 0
  const days = b.getDate();
  const today = dayKey(new Date());
 
  // Couleurs des employeurs par jour
  const colors = {};
  db.shifts.forEach((s) => {
    const k = dayKey(new Date(s.start));
    const e = empById(s.employerId);
    if (!e) return;
    colors[k] = colors[k] || [];
    if (!colors[k].includes(e.color)) colors[k].push(e.color);
  });
 
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const k = dayKey(new Date(y, m, d));
    const cls = ['day', k === today ? 'today' : '', k === ui.calSelected ? 'sel' : ''].join(' ');
    cells += `<button class="${cls}" data-action="select-day" data-key="${k}">
      <span>${d}</span><span class="dots">${(colors[k] || []).slice(0, 3).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
    </button>`;
  }
 
  const sel = keyToDate(ui.calSelected);
  const dayShifts = db.shifts.filter((s) => dayKey(new Date(s.start)) === ui.calSelected).sort((x, z) => x.start - z.start);
  const dayTotal = sumPay(dayShifts.filter((s) => s.end != null));
  const last = completed()[0];
 
  return `
    <div class="row">
      <button class="iconbtn" data-action="cal-prev" aria-label="Mois précédent">‹</button>
      <div class="grow center"><h2>${monthLabel(y, m)}</h2>
        <div class="accent small bold">${money(sumPay(monthShifts))} · ${duration(sumMin(monthShifts))}</div></div>
      <button class="iconbtn" data-action="cal-next" aria-label="Mois suivant">›</button>
    </div>
    <div class="card">
      <div class="cal-head"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
      <div class="cal">${cells}</div>
    </div>
    <div class="row"><h2 class="grow">${dayLong(sel)}</h2>${dayTotal > 0 ? `<span class="bold accent">${money(dayTotal)}</span>` : ''}</div>
    ${dayShifts.length ? dayShifts.map(shiftRow).join('') : '<div class="muted">Rien ce jour-là. Profite ! 😎</div>'}
    <button class="btn" data-action="new-shift" ${db.employers.length ? '' : 'disabled'}>＋ Ajouter un shift</button>
    ${last ? `<button class="btn light" data-action="copy-last">📋 Copier le dernier shift ici (${esc(empById(last.employerId)?.emoji || '')} ${timeStr(last.start)}–${timeStr(last.end)})</button>` : ''}`;
}
 
function viewEmployers() {
  const now = new Date();
  const [a, b] = monthRange(now.getFullYear(), now.getMonth());
  const list = db.employers.map((e) => {
    const ms = shiftsIn(a, b, e.id);
    const bonus = [e.weekendPct > 0 ? `dimanche +${e.weekendPct}%` : '', e.eveningPct > 0 ? `soir +${e.eveningPct}%` : ''].filter(Boolean).join(' · ');
    return `<button class="shift" style="background:${alpha(e.color, 0.12)};padding:16px;border-radius:24px" data-action="edit-employer" data-id="${e.id}">
      ${avatar(e, 52)}
      <span class="grow">
        <div class="bold" style="font-size:17px">${esc(e.name)}</div>
        <div>${money(currentRate(e))}/h${bonus ? ' · ' + bonus : ''}</div>
        <div class="small muted">Ce mois : ${duration(sumMin(ms))} · ${money(sumPay(ms))}</div>
      </span>
      <span class="muted">›</span>
    </button>`;
  });
  return `<h1>Mes employeurs</h1>
    ${list.length ? list.join('') : '<div class="muted">Aucun employeur pour l\'instant. Ajoute le premier 👇</div>'}
    <button class="btn" data-action="new-employer">＋ Ajouter un employeur</button>`;
}
 
function viewPay() {
  const cards = db.employers.map((e) => {
    const ea = earned(e.id);
    const re = received(e.id);
    const bal = ea - re;
    const pct = ea > 0 ? Math.min(100, Math.max(0, (re / ea) * 100)) : 0;
    const status = bal > 0.005 ? kv('Reste à recevoir', money(bal), 'red bold')
      : bal < -0.005 ? kv('Payé en plus', money(-bal), 'green bold')
        : kv('Statut', 'Tout est payé ✅', 'green bold');
    return `<div class="card">
      <div class="row">${avatar(e, 40)}<h3 style="margin:0">${esc(e.name)}</h3></div>
      <div class="progress"><i style="width:${pct}%;background:${e.color}"></i></div>
      ${kv('Gagné (total)', money(ea))}${kv('Reçu', money(re))}${status}
    </div>`;
  });
  const pays = [...db.payments].sort((x, y) => (x.date < y.date ? 1 : -1)).map((p) => {
    const e = empById(p.employerId);
    return `<div class="row card" style="padding:12px">
      ${avatar(e, 36)}
      <div class="grow"><div class="bold">${esc(e?.name || '?')}</div>
        <div class="small muted">${dateStr(keyToDate(p.date))}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
      <span class="bold green">+ ${money(p.amount)}</span>
      <button class="iconbtn" data-action="delete-payment" data-id="${p.id}" aria-label="Supprimer">🗑</button>
    </div>`;
  });
  return `<div><h1>Ma paie</h1><div class="accent bold" style="font-size:18px">Encore à recevoir : ${money(totalToReceive())}</div></div>
    ${db.employers.length ? '<button class="btn" data-action="new-payment">💶 J\'ai été payé</button>' : ''}
    ${cards.join('')}
    ${pays.length ? '<h2>Paiements reçus</h2>' + pays.join('') : ''}`;
}
 
function exportSelection() {
  let from, to, label, tag;
  if (ui.exportPeriod === 'month') {
    const y = ui.exportMonth.getFullYear(), m = ui.exportMonth.getMonth();
    [from, to] = monthRange(y, m);
    label = monthLabel(y, m);
    tag = `${y}-${pad(m + 1)}`;
  } else if (ui.exportPeriod === 'year') {
    from = new Date(ui.exportYear, 0, 1); to = new Date(ui.exportYear, 11, 31);
    label = `Année ${ui.exportYear}`; tag = String(ui.exportYear);
  } else {
    from = new Date(2000, 0, 1); to = new Date(2100, 11, 31);
    label = 'Tout l\'historique'; tag = 'tout';
  }
  const emp = ui.exportEmployer ? empById(ui.exportEmployer) : null;
  const shifts = shiftsIn(from, to, emp?.id || null);
  const base = ('Taf_' + tag + (emp ? '_' + emp.name : '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_');
  return { shifts, label, emp, base };
}
 
function viewExport() {
  const { shifts, label } = exportSelection();
  return `<h1>Exporter</h1>
    <div class="seg">
      ${[['month', 'Mois'], ['year', 'Année'], ['all', 'Tout']].map(([k, l]) => `<button class="${ui.exportPeriod === k ? 'on' : ''}" data-action="period" data-p="${k}">${l}</button>`).join('')}
    </div>
    ${ui.exportPeriod !== 'all' ? `<div class="row">
      <button class="iconbtn" data-action="exp-prev">‹</button>
      <h2 class="grow center">${label}</h2>
      <button class="iconbtn" data-action="exp-next">›</button></div>` : ''}
    <div class="field" style="margin:0">
      <label>Employeur</label>
      <select id="exp-emp">
        <option value="">Tous les employeurs</option>
        ${db.employers.map((e) => `<option value="${e.id}" ${ui.exportEmployer === e.id ? 'selected' : ''}>${esc(e.emoji)} ${esc(e.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card"><h3>Résumé</h3>
      ${kv('Période', label)}${kv('Shifts', String(shifts.length))}${kv('Heures', duration(sumMin(shifts)))}${kv('Total', money(sumPay(shifts)), 'accent bold')}
    </div>
    <button class="btn" data-action="export-pdf">📄 Relevé PDF (pour l'employeur)</button>
    <button class="btn light" data-action="export-csv">📊 Fichier Excel (CSV)</button>
    <div class="small muted">Le fichier s'ouvre dans le menu de partage : WhatsApp, Mail, Fichiers…</div>
 
    <div class="card" style="margin-top:12px">
      <h3>💾 Sauvegarde</h3>
      <div class="small muted" style="margin-bottom:12px">Tes données sont uniquement sur ce téléphone. Fais une sauvegarde de temps en temps (dans Fichiers ou iCloud Drive), surtout avant de changer de téléphone.</div>
      <div class="btns">
        <button class="btn light" data-action="backup">Sauvegarder</button>
        <button class="btn light" data-action="restore">Restaurer</button>
      </div>
      <input type="file" id="restore-file" accept="application/json,.json" hidden>
    </div>`;
}
 
// =====================================================================
// Rendu
// =====================================================================
const VIEWS = { home: viewHome, calendar: viewCalendar, employers: viewEmployers, pay: viewPay, export: viewExport };
 
function render() {
  document.getElementById('view').innerHTML = VIEWS[ui.tab]();
  document.querySelectorAll('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
}
 
function setTab(tab) {
  ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}
 
// Rafraîchit le chrono chaque seconde, sans tout redessiner
setInterval(() => {
  const r = running();
  if (!r || ui.tab !== 'home') return;
  const t = document.getElementById('timer');
  const l = document.getElementById('live');
  if (!t || !l) return;
  const p = pay(r);
  t.textContent = chrono(p.worked);
  l.textContent = '+ ' + money(p.total);
}, 1000);
 
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
 
// =====================================================================
// Feuilles (formulaires)
// =====================================================================
function openSheet(title, bodyHtml, onMount) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-backdrop" id="sheet-bg">
    <div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="grab"></div>
      <div class="sheet-top"><button class="btn ghost" data-close>Annuler</button><h2>${esc(title)}</h2><span style="width:70px"></span></div>
      ${bodyHtml}
    </div></div>`;
  const bg = document.getElementById('sheet-bg');
  bg.addEventListener('click', (ev) => { if (ev.target === bg || ev.target.closest('[data-close]')) closeSheet(); });
  onMount?.(bg.querySelector('.sheet'));
}
function closeSheet() { document.getElementById('sheet-root').innerHTML = ''; }
 
// ---------- Shift ----------
function shiftSheet(shift, initialKey) {
  if (!db.employers.length) { toast('Ajoute d\'abord un employeur 💼'); return; }
  const tpl = shift || completed()[0];
  const isRun = shift && shift.end == null;
  const empId = shift?.employerId || tpl?.employerId || db.employers[0].id;
  const key = shift ? dayKey(new Date(shift.start)) : (initialKey || dayKey(new Date()));
  const st = tpl ? timeStr(tpl.start) : '09:00';
  const en = shift?.end ? timeStr(shift.end) : (tpl?.end ? timeStr(tpl.end) : '13:00');
 
  openSheet(shift ? 'Modifier le shift' : 'Nouveau shift', `
    <div class="field"><label>Employeur</label>
      <select id="f-emp">${db.employers.map((e) => `<option value="${e.id}" ${e.id === empId ? 'selected' : ''}>${esc(e.emoji)} ${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Date</label><input type="date" id="f-date" value="${key}"></div>
    <div class="fields2">
      <div class="field"><label>Début</label><input type="time" id="f-start" value="${st}"></div>
      <div class="field"><label>Fin</label>${isRun
        ? `<button class="btn light" id="f-finish" style="min-height:50px">En cours ⏱ · Terminer</button><input type="time" id="f-end" value="${timeStr(Date.now())}" hidden>`
        : `<input type="time" id="f-end" value="${en}">`}</div>
    </div>
    <div class="field"><label>Pause (minutes)</label><input type="number" inputmode="numeric" min="0" id="f-break" value="${shift?.breakMin || 0}"></div>
    <div class="field"><label>Note (facultatif)</label><input type="text" id="f-note" value="${esc(shift?.note || '')}"></div>
    <div class="card" id="f-preview" style="margin-bottom:12px"></div>
    <div class="error" id="f-error" hidden></div>
    <button class="btn" id="f-save">Enregistrer</button>
    ${shift ? '<button class="btn ghost" id="f-delete" style="width:100%;color:var(--red);margin-top:8px">Supprimer ce shift</button>' : ''}
  `, (el) => {
    let running = isRun;
    const $ = (id) => el.querySelector('#' + id);
 
    const build = () => {
      const k = $('f-date').value || key;
      const d = keyToDate(k);
      const [sh, sm] = ($('f-start').value || '00:00').split(':').map(Number);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sh, sm).getTime();
      let end = null;
      let overnight = false;
      if (!running) {
        const [eh, em] = ($('f-end').value || '00:00').split(':').map(Number);
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em).getTime();
        if (end <= start) { end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, eh, em).getTime(); overnight = true; }
      }
      return {
        id: shift?.id || uid(),
        employerId: $('f-emp').value,
        start, end,
        breakMin: Math.max(0, parseInt($('f-break').value, 10) || 0),
        pauseStart: running ? (shift?.pauseStart || null) : null,
        note: $('f-note').value.trim(),
        overnight,
      };
    };
 
    const refresh = () => {
      const s = build();
      const p = pay(s);
      $('f-preview').innerHTML = `<h3>Aperçu</h3>${kv('Temps travaillé', duration(p.minutes))}${kv('Taux', money(p.rate) + '/h')}${p.bonus > 0 ? kv('Majorations', money(p.bonus)) : ''}${kv('Total', money(p.total), 'accent bold')}${s.overnight ? '<div class="small muted" style="margin-top:6px">ℹ️ La fin est avant le début : le shift se termine le lendemain.</div>' : ''}`;
    };
    el.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', refresh));
    refresh();
 
    $('f-finish')?.addEventListener('click', () => {
      running = false;
      $('f-finish').remove();
      $('f-end').hidden = false;
      refresh();
    });
 
    $('f-save').addEventListener('click', () => {
      const s = build();
      const err = $('f-error');
      if (s.end != null && s.end - s.start <= s.breakMin * 60000) { err.textContent = 'La pause est plus longue que le shift 🤔'; err.hidden = false; return; }
      if (s.end != null && s.end - s.start > 24 * 3600000) { err.textContent = 'Un shift de plus de 24 h ? Vérifie les heures.'; err.hidden = false; return; }
      delete s.overnight;
      const i = db.shifts.findIndex((x) => x.id === s.id);
      if (i >= 0) db.shifts[i] = s; else db.shifts.push(s);
      save(); closeSheet(); render();
    });
 
    $('f-delete')?.addEventListener('click', () => {
      if (!confirm('Supprimer ce shift ? Cette action est définitive.')) return;
      db.shifts = db.shifts.filter((x) => x.id !== shift.id);
      save(); closeSheet(); render();
    });
  });
}
 
// ---------- Employeur ----------
function employerSheet(emp) {
  let emoji = emp?.emoji || '💼';
  let color = emp?.color || PALETTE[db.employers.length % PALETTE.length];
  const cur = emp ? currentRate(emp) : null;
  const history = emp ? [...emp.rates].sort((a, b) => (a.from < b.from ? 1 : -1)) : [];
 
  openSheet(emp ? 'Modifier' : 'Nouvel employeur', `
    <div class="row" style="margin-bottom:14px"><span id="e-avatar"></span><h2 id="e-title" class="grow ellipsis"></h2></div>
    <div class="field"><label>Nom</label><input type="text" id="e-name" placeholder="Snack du coin, Mme Dupont…" value="${esc(emp?.name || '')}"></div>
    <div class="field"><label>Emoji</label><div class="pick" id="e-emojis">${EMOJIS.map((x) => `<button data-v="${x}">${x}</button>`).join('')}</div></div>
    <div class="field"><label>Couleur</label><div class="pick" id="e-colors">${PALETTE.map((c) => `<button class="color" data-v="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <div class="field"><label>Taux horaire (€/h)</label><input type="text" inputmode="decimal" id="e-rate" placeholder="12,50" value="${cur != null ? dec(cur) : ''}"></div>
    <div class="field" id="e-from-wrap" hidden><label>Nouveau taux appliqué à partir du</label><input type="date" id="e-from" value="${dayKey(new Date())}">
      <div class="small muted">Les shifts avant cette date gardent l'ancien taux 👍</div></div>
    <div class="fields3">
      <div class="field"><label>Bonus dim. %</label><input type="number" inputmode="numeric" id="e-we" value="${emp?.weekendPct || ''}" placeholder="0"></div>
      <div class="field"><label>Bonus soir %</label><input type="number" inputmode="numeric" id="e-ev" value="${emp?.eveningPct || ''}" placeholder="0"></div>
      <div class="field"><label>Soir dès (h)</label><input type="number" inputmode="numeric" id="e-evh" value="${emp?.eveningHour ?? 20}"></div>
    </div>
    <div class="small muted" style="margin:-4px 0 14px">Facultatif. Bonus dim. = heures prestées le dimanche. Soir = heures après l'heure choisie (jusqu'à 6 h).</div>
    ${history.length > 1 ? `<div class="card" style="margin-bottom:14px"><h3>Historique des taux</h3>${history.map((r) => `
      <div class="row" style="padding:4px 0"><span class="grow">${r.from === SINCE_FOREVER ? 'Depuis le début' : 'À partir du ' + dateStr(keyToDate(r.from))}</span>
      <b>${money(r.rate)}/h</b>${r.from !== SINCE_FOREVER ? `<button class="iconbtn" data-del-rate="${r.from}" aria-label="Supprimer">✕</button>` : '<span style="width:40px"></span>'}</div>`).join('')}</div>` : ''}
    <div class="error" id="e-error" hidden></div>
    <button class="btn" id="e-save">Enregistrer</button>
    ${emp ? '<button class="btn ghost" id="e-delete" style="width:100%;color:var(--red);margin-top:8px">Supprimer cet employeur</button>' : ''}
  `, (el) => {
    const $ = (id) => el.querySelector('#' + id);
    const paint = () => {
      $('e-avatar').innerHTML = avatar({ emoji, color }, 56);
      $('e-title').textContent = $('e-name').value.trim() || 'Nom de l\'employeur';
      $('e-title').style.color = color;
      el.querySelectorAll('#e-emojis button').forEach((b) => b.classList.toggle('on', b.dataset.v === emoji));
      el.querySelectorAll('#e-colors button').forEach((b) => b.classList.toggle('on', b.dataset.v === color));
      const r = parseDec($('e-rate').value);
      $('e-from-wrap').hidden = !(emp && r != null && Math.abs(r - cur) > 0.0001);
    };
    $('e-emojis').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { emoji = b.dataset.v; paint(); } });
    $('e-colors').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { color = b.dataset.v; paint(); } });
    $('e-name').addEventListener('input', paint);
    $('e-rate').addEventListener('input', paint);
    paint();
 
    el.querySelectorAll('[data-del-rate]').forEach((b) => b.addEventListener('click', () => {
      emp.rates = emp.rates.filter((r) => r.from !== b.dataset.delRate);
      save(); closeSheet(); render(); employerSheet(emp);
    }));
 
    $('e-save').addEventListener('click', () => {
      const err = $('e-error');
      const name = $('e-name').value.trim();
      const rate = parseDec($('e-rate').value);
      const hour = parseInt($('e-evh').value, 10);
      if (!name) { err.textContent = 'Donne un nom à ton employeur.'; err.hidden = false; return; }
      if (rate == null || rate <= 0) { err.textContent = 'Indique un taux horaire valide (ex. 12,50).'; err.hidden = false; return; }
      if (!(hour >= 0 && hour <= 23)) { err.textContent = 'L\'heure du soir doit être entre 0 et 23.'; err.hidden = false; return; }
      const fields = {
        name, emoji, color,
        weekendPct: Math.max(0, parseDec($('e-we').value) || 0),
        eveningPct: Math.max(0, parseDec($('e-ev').value) || 0),
        eveningHour: hour,
      };
      if (emp) {
        Object.assign(emp, fields);
        if (Math.abs(rate - cur) > 0.0001) {
          const from = $('e-from').value || dayKey(new Date());
          const same = emp.rates.find((r) => r.from === from);
          if (same) same.rate = rate; else emp.rates.push({ from, rate });
        }
      } else {
        db.employers.push({ id: uid(), ...fields, rates: [{ from: SINCE_FOREVER, rate }] });
      }
      db.employers.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      save(); closeSheet(); render();
    });
 
    $('e-delete')?.addEventListener('click', () => {
      if (!confirm(`Supprimer ${emp.name} ?\n\n⚠️ Tous ses shifts et paiements seront aussi supprimés. Pense à faire un export avant !`)) return;
      db.employers = db.employers.filter((e) => e.id !== emp.id);
      db.shifts = db.shifts.filter((s) => s.employerId !== emp.id);
      db.payments = db.payments.filter((p) => p.employerId !== emp.id);
      save(); closeSheet(); render();
    });
  });
}
 
// ---------- Paiement ----------
function paymentSheet() {
  const best = [...db.employers].sort((a, b) => balance(b.id) - balance(a.id))[0];
  const amountFor = (id) => { const b = balance(id); return b > 0 ? dec(b) : ''; };
  openSheet('Paiement reçu 💶', `
    <div class="field"><label>Employeur</label>
      <select id="p-emp">${db.employers.map((e) => `<option value="${e.id}" ${e.id === best?.id ? 'selected' : ''}>${esc(e.emoji)} ${esc(e.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Montant (€)</label><input type="text" inputmode="decimal" id="p-amount" value="${best ? amountFor(best.id) : ''}" placeholder="0,00"></div>
    <div class="field"><label>Date</label><input type="date" id="p-date" value="${dayKey(new Date())}"></div>
    <div class="field"><label>Note (facultatif)</label><input type="text" id="p-note" placeholder="Paie d'octobre"></div>
    <div class="error" id="p-error" hidden></div>
    <button class="btn" id="p-save">Enregistrer</button>
  `, (el) => {
    const $ = (id) => el.querySelector('#' + id);
    $('p-emp').addEventListener('change', () => { $('p-amount').value = amountFor($('p-emp').value); });
    $('p-save').addEventListener('click', () => {
      const amount = parseDec($('p-amount').value);
      if (amount == null || amount <= 0) { $('p-error').textContent = 'Indique un montant valide.'; $('p-error').hidden = false; return; }
      db.payments.push({ id: uid(), employerId: $('p-emp').value, date: $('p-date').value || dayKey(new Date()), amount, note: $('p-note').value.trim() });
      save(); closeSheet(); render();
      toast('Paiement enregistré 💰');
    });
  });
}
 
// =====================================================================
// Export (CSV, PDF, sauvegarde)
// =====================================================================
async function shareFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  // Repli : téléchargement classique
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
 
function exportRows(shifts) {
  return shifts.map((s) => {
    const p = pay(s);
    return {
      date: new Date(s.start), employer: empById(s.employerId)?.name || '?',
      start: timeStr(s.start), end: timeStr(s.end), breakMin: s.breakMin || 0,
      minutes: p.minutes, rate: p.rate, bonus: p.bonus, total: p.total, note: s.note || '',
    };
  });
}
 
function exportCsv() {
  const { shifts, base } = exportSelection();
  if (!shifts.length) { toast('Aucun shift sur cette période.'); return; }
  const rows = exportRows(shifts);
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  let out = '﻿Date;Employeur;Début;Fin;Pause (min);Heures;Heures (décimal);Taux (€/h);Majoration (€);Total (€);Note\r\n';
  rows.forEach((r) => {
    out += [dateStr(r.date), q(r.employer), r.start, r.end, r.breakMin, duration(r.minutes), dec(r.minutes / 60), dec(r.rate), dec(r.bonus), dec(r.total), q(r.note)].join(';') + '\r\n';
  });
  const tm = rows.reduce((t, r) => t + r.minutes, 0);
  out += `TOTAL;;;;;${duration(tm)};${dec(tm / 60)};;${dec(rows.reduce((t, r) => t + r.bonus, 0))};${dec(rows.reduce((t, r) => t + r.total, 0))};\r\n`;
  shareFile(new Blob([out], { type: 'text/csv' }), base + '.csv');
}
 
function exportPdf() {
  const { shifts, label, emp, base } = exportSelection();
  if (!shifts.length) { toast('Aucun shift sur cette période.'); return; }
  if (!window.jspdf) { toast('Module PDF indisponible.'); return; }
  const rows = exportRows(shifts);
  // Les polices PDF standard ne connaissent pas les espaces fines : on les remplace
  const m = (v) => money(v).replace(/[  ]/g, ' ');
 
  const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
  const W = 595, H = 842, M = 40, RH = 18;
  const cols = [['Date', 62, 0], ['Employeur', 128, 0], ['Début', 42, 0], ['Fin', 42, 0], ['Pause', 40, 1], ['Heures', 48, 1], ['Taux', 60, 1], ['Total', 93, 1]];
  let y = M, page = 0;
 
  const fit = (t, w) => { let s = String(t); if (doc.getTextWidth(s) <= w) return s; while (s && doc.getTextWidth(s + '...') > w) s = s.slice(0, -1); return s + '...'; };
  const cells = (vals) => {
    let x = M;
    vals.forEach((v, i) => {
      const [, w, right] = cols[i];
      const t = fit(v, w - 8);
      if (right) doc.text(t, x + w - 4, y + RH - 5, { align: 'right' }); else doc.text(t, x + 4, y + RH - 5);
      x += w;
    });
  };
  const newPage = () => {
    if (page > 0) doc.addPage();
    page++;
    y = M;
    if (page === 1) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(108, 76, 241);
      doc.text('Relevé d\'heures' + (emp ? ' - ' + emp.name : ''), M, y + 16);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90);
      doc.text(label, M, y + 34);
      y += 50;
    }
    doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal');
    doc.text(`Généré avec Taf' le ${dateStr(new Date())} - page ${page}`, M, H - 20);
    doc.setFillColor(108, 76, 241); doc.rect(M, y, W - 2 * M, RH, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    cells(cols.map((c) => c[0]));
    y += RH;
    doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
  };
 
  newPage();
  rows.forEach((r, i) => {
    if (y + RH > H - M - 20) newPage();
    if (i % 2 === 1) { doc.setFillColor(244, 241, 255); doc.rect(M, y, W - 2 * M, RH, 'F'); }
    doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    cells([dateStr(r.date), r.employer, r.start, r.end, r.breakMin ? r.breakMin + ' min' : '', duration(r.minutes), m(r.rate), m(r.total)]);
    y += RH;
  });
 
  if (y + RH * 4 > H - M - 20) newPage();
  y += 8;
  const tm = rows.reduce((t, r) => t + r.minutes, 0);
  const tt = rows.reduce((t, r) => t + r.total, 0);
  const tb = rows.reduce((t, r) => t + r.bonus, 0);
  doc.setFillColor(230, 224, 255); doc.rect(M, y, W - 2 * M, RH + 4, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text(`${rows.length} shift(s)`, M + 4, y + RH - 3);
  doc.text(`Total : ${duration(tm)}  -  ${m(tt)}`, W - M - 4, y + RH - 3, { align: 'right' });
  y += RH + 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90);
  if (tb > 0.005) { doc.text(`Dont majorations (dimanche / soir) : ${m(tb)}`, M, y); y += 16; }
  const names = [...new Set(rows.map((r) => r.employer))].sort();
  if (names.length > 1) {
    names.forEach((n) => {
      if (y + 16 > H - M - 20) return;
      const l = rows.filter((r) => r.employer === n);
      doc.text(`${n} : ${duration(l.reduce((t, r) => t + r.minutes, 0))} - ${m(l.reduce((t, r) => t + r.total, 0))}`, M, y);
      y += 16;
    });
  }
  shareFile(doc.output('blob'), base + '.pdf');
}
 
function backup() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  shareFile(blob, `Taf_sauvegarde_${dayKey(new Date())}.json`);
}
 
function restore(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!Array.isArray(d.employers) || !Array.isArray(d.shifts) || !Array.isArray(d.payments)) throw new Error('format');
      if (!confirm(`Restaurer cette sauvegarde ?\n${d.employers.length} employeur(s), ${d.shifts.length} shift(s), ${d.payments.length} paiement(s).\n\n⚠️ Les données actuelles seront remplacées.`)) return;
      db = { ...emptyDb(), ...d };
      save(); render();
      toast('Sauvegarde restaurée ✅');
    } catch (e) {
      toast('Ce fichier n\'est pas une sauvegarde Taf\' valide.');
    }
  };
  reader.readAsText(file);
}
 
// =====================================================================
// Actions (délégation d'événements)
// =====================================================================
document.addEventListener('click', (ev) => {
  const tabBtn = ev.target.closest('#tabbar button');
  if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
 
  const el = ev.target.closest('[data-action]');
  if (!el || el.closest('#sheet-root')) return;
  const id = el.dataset.id;
 
  switch (el.dataset.action) {
    case 'tab': setTab(el.dataset.tab); break;
    case 'new-employer': employerSheet(null); break;
    case 'edit-employer': employerSheet(empById(id)); break;
    case 'choose': ui.chosenEmployer = id; render(); break;
    case 'start':
      if (!running()) {
        db.shifts.push({ id: uid(), employerId: ui.chosenEmployer, start: Date.now(), end: null, breakMin: 0, pauseStart: null, note: '' });
        save(); render();
        toast('C\'est parti ! 💪');
      }
      break;
    case 'pause': {
      const r = running();
      if (!r) break;
      if (r.pauseStart) { r.breakMin += Math.round((Date.now() - r.pauseStart) / 60000); r.pauseStart = null; }
      else r.pauseStart = Date.now();
      save(); render();
      break;
    }
    case 'stop': {
      const r = running();
      if (!r) break;
      const now = Date.now();
      if (r.pauseStart) { r.breakMin += Math.round((now - r.pauseStart) / 60000); r.pauseStart = null; }
      r.end = now;
      save(); render();
      toast(`Bien joué ! 💪 +${money(pay(r).total)}`);
      break;
    }
    case 'edit-shift': shiftSheet(db.shifts.find((s) => s.id === id)); break;
    case 'new-shift': shiftSheet(null, ui.calSelected); break;
    case 'select-day': ui.calSelected = el.dataset.key; render(); break;
    case 'cal-prev': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() - 1, 1); render(); break;
    case 'cal-next': ui.calMonth = new Date(ui.calMonth.getFullYear(), ui.calMonth.getMonth() + 1, 1); render(); break;
    case 'copy-last': {
      const last = completed()[0];
      if (!last) break;
      const src = new Date(last.start);
      const target = keyToDate(ui.calSelected);
      const shiftDays = Math.round((new Date(target.getFullYear(), target.getMonth(), target.getDate()) - new Date(src.getFullYear(), src.getMonth(), src.getDate())) / 86400000);
      const move = (ms) => { const d = new Date(ms); d.setDate(d.getDate() + shiftDays); return d.getTime(); };
      db.shifts.push({ ...last, id: uid(), start: move(last.start), end: move(last.end), pauseStart: null });
      save(); render();
      toast('Shift copié 📋');
      break;
    }
    case 'new-payment': paymentSheet(); break;
    case 'delete-payment':
      if (confirm('Supprimer ce paiement ?')) { db.payments = db.payments.filter((p) => p.id !== id); save(); render(); }
      break;
    case 'period': ui.exportPeriod = el.dataset.p; render(); break;
    case 'exp-prev':
    case 'exp-next': {
      const d = el.dataset.action === 'exp-prev' ? -1 : 1;
      if (ui.exportPeriod === 'month') ui.exportMonth = new Date(ui.exportMonth.getFullYear(), ui.exportMonth.getMonth() + d, 1);
      else ui.exportYear += d;
      render();
      break;
    }
    case 'export-pdf': exportPdf(); break;
    case 'export-csv': exportCsv(); break;
    case 'backup': backup(); break;
    case 'restore': document.getElementById('restore-file').click(); break;
  }
});
 
document.addEventListener('change', (ev) => {
  if (ev.target.id === 'exp-emp') { ui.exportEmployer = ev.target.value; render(); }
  if (ev.target.id === 'restore-file' && ev.target.files[0]) { restore(ev.target.files[0]); ev.target.value = ''; }
});
 
// Revenir sur l'app (après l'avoir quittée) : on redessine pour un chrono à jour
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
 
// =====================================================================
// Démarrage
// =====================================================================
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
navigator.storage?.persist?.().catch(() => {});
