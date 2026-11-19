// Agente: previsione combinata dei modelli, per giorno (con swipe) o per tutta la settimana.
// I siti negli iframe non si possono leggere dal browser, quindi l'agente confronta
// i modelli meteo da cui partono anche loro, tramite Open-Meteo.

import { $, el, svgIcon, openModal, closeModal, closeOnBackdrop } from './dom.js';
import { prettyCity, capitalize } from './text.js';
import { state } from './state.js';
import { geocodeCity, fetchModelForecast } from './forecast-api.js';
import {
  forecastModels, weatherCategories, verdictBadges, AGENT_DAYS,
  combineDay, daySummary, dayOverview, formatMm
} from './weather.js';

let selectedDate = null;
let view = 'day'; // 'day' oppure 'week'
let agentRun = 0;

const TZ = 'Europe/Rome';

function localDateString(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: TZ }); // formato YYYY-MM-DD
}

function currentHour() {
  return parseInt(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', hour12: false, timeZone: TZ }), 10);
}

// I 7 giorni mostrati: valore, etichetta breve (chip) ed etichetta lunga (riassunto)
function agentDays() {
  const today = new Date();
  return Array.from({ length: AGENT_DAYS }, (_, i) => {
    const d = new Date(today.getTime() + i * 86400000);
    const short = i === 0 ? 'Oggi' : i === 1 ? 'Domani'
      : capitalize(d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: TZ }));
    const long = i === 0 ? 'Oggi' : i === 1 ? 'Domani'
      : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
    return { date: localDateString(d), short, long };
  });
}

function setAgentCity(text) {
  const p = $('agentCity');
  p.innerHTML = '';
  p.append(svgIcon('i-place', 16), text);
}

// "Aggiornato alle 10:32", oppure l'avviso che si stanno usando dati salvati
function setUpdated(time, offline) {
  const p = $('agentUpdated');
  if (!time) { p.textContent = ''; p.classList.remove('offline'); return; }
  const when = new Date(time);
  const hhmm = when.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const sameDay = localDateString(when) === localDateString(new Date());
  const day = sameDay ? 'oggi' : `il ${when.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: TZ })}`;
  p.textContent = offline
    ? `Sei offline: dati salvati ${day} alle ${hhmm}`
    : `Aggiornato ${sameDay ? '' : `${day} `}alle ${hhmm}`;
  p.classList.toggle('offline', offline);
}

function renderAgentDays() {
  const container = $('agentDays');
  container.innerHTML = '';
  agentDays().forEach((d, i) => {
    const btn = el('button', 'day-chip', d.short);
    btn.type = 'button';
    btn.dataset.date = d.date;
    btn.dataset.label = d.long;
    btn.setAttribute('aria-pressed', String(d.date === selectedDate));
    btn.addEventListener('click', () => selectDay(i));
    container.appendChild(btn);
  });
}

function chipIndex() {
  return [...document.querySelectorAll('.day-chip')].findIndex(b => b.dataset.date === selectedDate);
}

// Cambia giorno (da chip, swipe o frecce) con un'animazione nella direzione giusta
function selectDay(index) {
  const chips = [...document.querySelectorAll('.day-chip')];
  const current = chipIndex();
  const target = Math.max(0, Math.min(chips.length - 1, index));
  if (target === current && view === 'day') return false;

  selectedDate = chips[target].dataset.date;
  chips.forEach((b, i) => b.setAttribute('aria-pressed', String(i === target)));
  chips[target].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  if (view !== 'day') {
    setView('day');
  } else {
    const result = $('agentResult');
    result.classList.remove('slide-from-right', 'slide-from-left');
    void result.offsetWidth; // fa ripartire l'animazione
    result.classList.add(target > current ? 'slide-from-right' : 'slide-from-left');
  }
  runAgent();
  return true;
}

function setView(next) {
  view = next;
  $('agentModal').classList.toggle('week-view', view === 'week');
  $('agentViewDay').setAttribute('aria-pressed', String(view === 'day'));
  $('agentViewWeek').setAttribute('aria-pressed', String(view === 'week'));
}

// --- VISTA GIORNO ---

function slotIcon(category, night) {
  const cat = category ? weatherCategories[category] : null;
  if (!cat) return '❔';
  return night ? cat.night : cat.icon;
}

function windChip(wind, compact) {
  const chip = el('span', `badge badge-wind ${wind.level.cls}`);
  let label = compact ? wind.level.label : `${wind.level.label} · ${Math.round(wind.speed)} km/h`;
  if (!compact && wind.gust != null && wind.gust >= 40) label += `, raffiche ${Math.round(wind.gust)}`;
  chip.append(svgIcon('i-air'), label);
  chip.title = 'Vento massimo medio della fascia secondo i modelli';
  return chip;
}

function renderHourlyTable(hours) {
  const table = el('table', 'hourly');
  const head = el('tr');
  ['Ora', '', 'Temp.', 'Pioggia', 'Prob.', 'Vento'].forEach(h => head.appendChild(el('th', null, h)));
  table.appendChild(head);

  hours.forEach(h => {
    const row = el('tr');
    const cat = h.category ? weatherCategories[h.category] : null;
    const iconCell = el('td', 'hourly-icon', cat ? slotIcon(h.category, h.hour >= 19 || h.hour < 7) : '—');
    if (cat) iconCell.title = cat.label;
    const gust = h.gust != null && h.gust >= 40 ? ` (${Math.round(h.gust)})` : '';
    row.append(
      el('td', 'hourly-time', `${String(h.hour).padStart(2, '0')}:00`),
      iconCell,
      el('td', null, h.temp == null ? '—' : `${Math.round(h.temp)}°`),
      el('td', h.rain > 0 ? 'hourly-rain' : null, h.rain > 0 ? formatMm(h.rain) : '—'),
      el('td', null, h.prob == null ? '—' : `${h.prob}%`),
      el('td', null, h.wind == null ? '—' : `${Math.round(h.wind)}${gust} km/h`)
    );
    table.appendChild(row);
  });
  return table;
}

function renderModelList(c) {
  const details = el('details', 'slot-details');
  details.appendChild(el('summary', null, 'Cosa dice ogni modello'));

  const list = el('div', 'model-list');
  const head = el('div', 'model-row model-head');
  ['Modello', '', 'Temp.', 'Pioggia', 'Prob.', ''].forEach(h => head.appendChild(el('span', null, h)));
  list.appendChild(head);

  c.results.forEach((r, i) => {
    const model = forecastModels[i];
    const name = el('span', 'model-name');
    name.append(el('strong', null, model.name), el('small', null, model.origin));

    if (!r) {
      const row = el('div', 'model-row model-empty');
      row.append(name, el('span', 'muted', 'nessun dato per questa fascia'));
      list.appendChild(row);
      return;
    }

    // Ogni modello si espande per mostrare la fascia ora per ora
    const item = el('details', 'model-item');
    const row = el('summary', 'model-row');
    const chevron = el('span', 'model-chevron');
    chevron.appendChild(svgIcon('i-expand'));
    row.append(
      name,
      el('span', 'model-icon', slotIcon(r.category, c.slot.night)),
      el('span', null, `${Math.round(r.temp)}°`),
      el('span', null, r.wet ? formatMm(r.rain) : '—'),
      el('span', null, r.prob == null ? '—' : `${r.prob}%`),
      chevron
    );
    row.setAttribute('aria-label', `${model.name}: mostra il dettaglio ora per ora`);
    item.append(row, renderHourlyTable(r.hours));
    list.appendChild(item);
  });

  details.appendChild(list);
  return details;
}

function renderSlotCard(c, isToday) {
  const card = el('section', 'slot-card');
  const past = isToday && !c.slot.dayOffset && currentHour() >= c.slot.to;
  if (past) card.classList.add('slot-past');

  const head = el('div', 'slot-head');
  const title = el('h4', null, c.slot.name);
  title.appendChild(el('small', null, c.slot.hint));
  head.append(el('span', 'slot-icon', slotIcon(c.category, c.slot.night)), title);
  if (c.n) head.append(el('span', 'slot-temp', `${Math.round(c.avgTemp)}°`));
  card.appendChild(head);

  const chips = el('div', 'slot-chips');
  const badge = verdictBadges[c.verdict];
  chips.appendChild(el('span', `badge ${badge.cls}`, badge.label));
  if (c.wind) chips.appendChild(windChip(c.wind, false));
  if (past) chips.appendChild(el('span', 'badge badge-nodata', 'già passata'));
  card.appendChild(chips);

  card.appendChild(el('p', 'slot-text', c.text));
  if (c.n) card.appendChild(renderModelList(c));
  return card;
}

function agentAvatar() {
  const span = el('span', 'agent-avatar');
  span.appendChild(svgIcon('i-agent'));
  return span;
}

function renderDayView(result, hourly) {
  const combined = combineDay(hourly, selectedDate);
  const chip = document.querySelector(`.day-chip[data-date="${selectedDate}"]`);
  const dayLabel = capitalize(chip ? chip.dataset.label : selectedDate);
  const isToday = selectedDate === localDateString(new Date());

  const summary = el('div', 'agent-summary');
  summary.append(agentAvatar(), el('p', null, daySummary(combined, dayLabel, prettyCity(state.currentCity))));
  result.appendChild(summary);
  combined.forEach(c => result.appendChild(renderSlotCard(c, isToday)));
}

// --- VISTA SETTIMANA ---

function renderWeekView(result, hourly) {
  const list = el('div', 'week-list');
  agentDays().forEach((d, i) => {
    const o = dayOverview(hourly, d.date);
    const row = el('button', 'week-row');
    row.type = 'button';
    row.setAttribute('aria-label', `${d.long}: apri il dettaglio del giorno`);

    const day = el('span', 'week-day', d.short);
    // Giorno incerto: sole e pioggia insieme, per non far sembrare certa la pioggia
    const iconText = !o.n ? '❔' : o.verdict === 'uncertain' ? '🌦️' : slotIcon(o.category, false);
    const icon = el('span', 'week-icon', iconText);
    const chips = el('span', 'week-chips');
    const badge = verdictBadges[o.verdict];
    chips.appendChild(el('span', `badge ${badge.cls}`, badge.label));
    // Il vento si segnala solo quando conta, per non affollare la riga
    if (o.wind && o.wind.level.key !== 'debole') chips.appendChild(windChip(o.wind, true));

    const temps = el('span', 'week-temps');
    if (o.temps) {
      temps.append(el('strong', null, `${Math.round(o.temps.max)}°`), el('span', null, ` ${Math.round(o.temps.min)}°`));
    }

    row.append(day, icon, chips, temps);
    row.addEventListener('click', () => selectDay(i));
    list.appendChild(row);
  });
  result.appendChild(list);
  result.appendChild(el('p', 'week-note', 'Tocca un giorno per vedere mattina, pomeriggio, sera e notte.'));
}

// --- CARICAMENTO ---

async function runAgent() {
  const result = $('agentResult');
  const runId = ++agentRun;
  // Il messaggio di attesa compare solo se serve davvero (i dati di solito sono già in memoria)
  const loadingTimer = setTimeout(() => {
    if (runId !== agentRun) return;
    result.innerHTML = '';
    result.appendChild(el('p', 'agent-loading', 'Sto confrontando i modelli meteo…'));
  }, 150);

  try {
    const place = await geocodeCity(state.currentCity);
    if (runId !== agentRun) return;
    if (!place) {
      clearTimeout(loadingTimer);
      result.innerHTML = '';
      setUpdated(null);
      result.appendChild(el('p', 'agent-error', `Non trovo "${prettyCity(state.currentCity)}". Prova a scrivere il nome ufficiale del comune nelle impostazioni ⚙️.`));
      return;
    }
    setAgentCity(place.label);

    const forecast = await fetchModelForecast(place);
    if (runId !== agentRun) return;
    clearTimeout(loadingTimer);
    setUpdated(forecast.time, forecast.offline);

    result.innerHTML = '';
    if (view === 'week') renderWeekView(result, forecast.data.hourly);
    else renderDayView(result, forecast.data.hourly);
  } catch (e) {
    clearTimeout(loadingTimer);
    if (runId !== agentRun) return;
    result.innerHTML = '';
    setUpdated(null);
    result.appendChild(el('p', 'agent-error', navigator.onLine === false
      ? 'Sei offline e per questa città non ci sono previsioni salvate.'
      : 'Non riesco a contattare il servizio meteo. Riprova tra qualche istante.'));
  }
}

// --- SWIPE TRA I GIORNI ---
// Trascinando il contenuto a sinistra si va al giorno dopo, a destra al giorno prima.
function setupSwipe() {
  const area = $('agentSwipeArea');
  const result = $('agentResult');
  let startX = 0, startY = 0, dx = 0, axis = null, tracking = false;

  area.addEventListener('touchstart', e => {
    if (view !== 'day' || e.touches.length !== 1 || e.target.closest('table')) return;
    tracking = true;
    axis = null;
    dx = 0;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  area.addEventListener('touchmove', e => {
    if (!tracking) return;
    const x = e.touches[0].clientX - startX;
    const y = e.touches[0].clientY - startY;
    if (!axis && Math.hypot(x, y) > 10) axis = Math.abs(x) > Math.abs(y) * 1.2 ? 'x' : 'y';
    if (axis !== 'x') return;

    e.preventDefault();
    const index = chipIndex();
    const atEdge = (x > 0 && index === 0) || (x < 0 && index === AGENT_DAYS - 1);
    dx = atEdge ? x * 0.25 : x; // ai bordi oppone resistenza
    result.classList.remove('slide-from-right', 'slide-from-left');
    result.style.transition = 'none';
    result.style.transform = `translateX(${dx}px)`;
    result.style.opacity = String(1 - Math.min(Math.abs(dx) / 400, 0.5));
  }, { passive: false });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    result.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
    result.style.transform = '';
    result.style.opacity = '';
    if (axis === 'x' && Math.abs(dx) > 60) {
      result.style.transition = '';
      selectDay(chipIndex() + (dx < 0 ? 1 : -1));
    }
  };
  area.addEventListener('touchend', end);
  area.addEventListener('touchcancel', end);

  // Da tastiera: frecce sinistra e destra
  $('agentModal').addEventListener('keydown', e => {
    if (view !== 'day' || e.target.matches('input, select')) return;
    if (e.key === 'ArrowRight') selectDay(chipIndex() + 1);
    if (e.key === 'ArrowLeft') selectDay(chipIndex() - 1);
  });
}

// --- AVVIO ---

export function initAgent() {
  $('agentBtn').addEventListener('click', () => {
    const days = agentDays().map(d => d.date);
    if (!days.includes(selectedDate)) selectedDate = days[1]; // di default: domani
    setAgentCity(prettyCity(state.currentCity));
    setUpdated(null);
    $('agentResult').innerHTML = '';
    renderAgentDays();
    openModal($('agentModal'));
    runAgent();
  });

  $('agentViewDay').addEventListener('click', () => {
    if (view === 'day') return;
    setView('day');
    runAgent();
  });
  $('agentViewWeek').addEventListener('click', () => {
    if (view === 'week') return;
    setView('week');
    runAgent();
  });

  $('closeAgentBtn').addEventListener('click', () => closeModal($('agentModal')));
  closeOnBackdrop($('agentModal'));
  setupSwipe();
}
