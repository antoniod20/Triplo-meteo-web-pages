// Logica dell'agente: dai dati orari dei modelli al verdetto per fascia, giorno e settimana.
// Nessuna dipendenza dalla pagina, quindi è coperta dai test in tests/.

import { joinList } from './text.js';

export const forecastModels = [
  { id: 'ecmwf_ifs025', name: 'ECMWF', origin: 'Centro europeo' },
  { id: 'icon_seamless', name: 'ICON', origin: 'Germania' },
  { id: 'gfs_seamless', name: 'GFS', origin: 'Stati Uniti' },
  { id: 'meteofrance_seamless', name: 'Météo-France', origin: 'Francia' },
  { id: 'italia_meteo_arpae_icon_2i', name: 'ItaliaMeteo', origin: 'Italia' }
];

// La notte è quella che segue la sera del giorno scelto: da mezzanotte alle 6 del giorno dopo
export const daySlots = [
  { name: 'Mattina', from: 6, to: 12, dayOffset: 0, hint: 'dalle 6 alle 12' },
  { name: 'Pomeriggio', from: 12, to: 18, dayOffset: 0, hint: 'dalle 12 alle 18' },
  { name: 'Sera', from: 18, to: 24, dayOffset: 0, night: true, hint: 'dalle 18 a mezzanotte' },
  { name: 'Notte', from: 0, to: 6, dayOffset: 1, night: true, hint: 'da mezzanotte alle 6' }
];

export const AGENT_DAYS = 7; // oggi + 6 giorni
export const FORECAST_DAYS = AGENT_DAYS + 1; // un giorno in più per la notte dell'ultimo giorno
export const RAIN_THRESHOLD = 0.2; // mm in una fascia: sotto questa soglia è "asciutto"

// Categorie dai codici WMO, in ordine di importanza
export const weatherCategories = {
  sereno: { order: 0, label: 'sereno', icon: '☀️', night: '🌙' },
  nuvoloso: { order: 1, label: 'poco nuvoloso', icon: '🌤️', night: '☁️' },
  coperto: { order: 2, label: 'nuvoloso', icon: '☁️', night: '☁️' },
  nebbia: { order: 3, label: 'nebbioso', icon: '🌫️', night: '🌫️' },
  pioggia: { order: 4, label: 'pioggia', icon: '🌧️', night: '🌧️', wet: true },
  neve: { order: 5, label: 'neve', icon: '❄️', night: '❄️', wet: true },
  temporale: { order: 6, label: 'temporali', icon: '⛈️', night: '⛈️', wet: true }
};

export function codeCategory(code) {
  if (code >= 95) return 'temporale';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neve';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'pioggia';
  if (code === 45 || code === 48) return 'nebbia';
  if (code === 3) return 'coperto';
  if (code === 2) return 'nuvoloso';
  return 'sereno';
}

// Livelli del vento medio a 10 m, come nei bollettini italiani
export const windLevels = [
  { max: 20, label: 'Vento debole', cls: 'wind-light', key: 'debole' },
  { max: 40, label: 'Vento moderato', cls: 'wind-moderate', key: 'moderato' },
  { max: 62, label: 'Vento forte', cls: 'wind-strong', key: 'forte' },
  { max: Infinity, label: 'Burrasca', cls: 'wind-gale', key: 'burrasca' }
];

export function windLevel(speed) {
  return windLevels.find(l => speed < l.max);
}

export const verdictBadges = {
  dry: { label: 'Asciutto', cls: 'badge-dry' },
  mostlydry: { label: 'Probabilmente asciutto', cls: 'badge-dry' },
  uncertain: { label: 'Incerto', cls: 'badge-uncertain' },
  likely: { label: 'Pioggia probabile', cls: 'badge-wet' },
  wet: { label: 'Pioggia quasi certa', cls: 'badge-wet' },
  nodata: { label: 'Nessun dato', cls: 'badge-nodata' }
};

// Dal più al meno "bagnato": serve per scegliere il verdetto peggiore della giornata
const verdictSeverity = { wet: 5, likely: 4, uncertain: 3, mostlydry: 2, dry: 1, nodata: 0 };

// "2026-11-19" + 1 -> "2026-11-20", senza problemi di fuso orario o ora legale
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

// Riassume le ore di una fascia per un singolo modello
export function summarizeModelSlot(hourly, model, slot, date) {
  const pick = name => hourly[`${name}_${model.id}`] || [];
  const temps = pick('temperature_2m');
  const rains = pick('precipitation');
  const probs = pick('precipitation_probability');
  const codes = pick('weather_code');
  const winds = pick('wind_speed_10m');
  const gusts = pick('wind_gusts_10m');
  const slotDate = addDays(date, slot.dayOffset || 0);

  const idx = hourly.time
    .map((t, i) => ({ d: t.slice(0, 10), h: parseInt(t.slice(11, 13), 10), i }))
    .filter(x => x.d === slotDate && x.h >= slot.from && x.h < slot.to && temps[x.i] != null)
    .map(x => x.i);
  if (idx.length < 3) return null; // modello senza dati per questa fascia (es. oltre il suo orizzonte)

  const temp = mean(idx.map(i => temps[i]));
  const rain = idx.reduce((s, i) => s + (rains[i] || 0), 0);
  const probValues = idx.map(i => probs[i]).filter(v => v != null);
  const prob = probValues.length ? Math.max(...probValues) : null;

  // Categoria: la più frequente; quelle "bagnate" contano solo se piove davvero
  const counts = {};
  idx.forEach(i => {
    if (codes[i] == null) return;
    const cat = codeCategory(codes[i]);
    counts[cat] = (counts[cat] || 0) + 1;
  });
  const wet = rain >= RAIN_THRESHOLD;
  let candidates = Object.keys(counts).filter(c => Boolean(weatherCategories[c].wet) === wet);
  if (!candidates.length) candidates = wet ? ['pioggia'] : ['coperto'];
  const category = wet
    ? candidates.sort((a, b) => weatherCategories[b].order - weatherCategories[a].order)[0]
    : candidates.sort((a, b) => (counts[b] - counts[a]) || (weatherCategories[b].order - weatherCategories[a].order))[0];

  // Vento: il massimo della fascia, perché è quello che si "sente"
  const windValues = idx.map(i => winds[i]).filter(v => v != null);
  const gustValues = idx.map(i => gusts[i]).filter(v => v != null);
  const windMax = windValues.length ? Math.max(...windValues) : null;
  const gustMax = gustValues.length ? Math.max(...gustValues) : null;

  // Dettaglio ora per ora, per chi vuole controllare un orario preciso
  const hours = idx.map(i => ({
    hour: parseInt(hourly.time[i].slice(11, 13), 10),
    temp: temps[i],
    rain: rains[i],
    prob: probs[i],
    wind: winds[i],
    gust: gusts[i],
    category: codes[i] == null ? null : codeCategory(codes[i])
  }));

  return { model, temp, rain, prob, category, wet, hours, windMax, gustMax };
}

export function rainIntensity(mm) {
  if (mm < 1) return 'debole';
  if (mm < 5) return 'moderata';
  return 'forte';
}

export function wetPhrase(category, mm) {
  if (category === 'temporale') return 'temporali';
  if (category === 'neve') return 'neve';
  return `pioggia ${rainIntensity(mm)}`;
}

export function formatMm(mm) {
  return `${mm.toFixed(1).replace('.', ',')} mm`;
}

export function combineWind(valid) {
  const speed = mean(valid.map(v => v.windMax).filter(v => v != null));
  if (speed == null) return null;
  const gust = mean(valid.map(v => v.gustMax).filter(v => v != null));
  return { speed, gust, level: windLevel(speed) };
}

// Mette insieme i modelli di una fascia e scrive il verdetto
export function combineSlot(results) {
  const valid = results.filter(Boolean);
  const n = valid.length;
  if (!n) return { n: 0, verdict: 'nodata', text: 'Nessun modello ha ancora dati per questa fascia.' };

  const wetModels = valid.filter(r => r.wet);
  const r = wetModels.length;
  const ratio = r / n;
  const temps = valid.map(v => v.temp);
  const avgTemp = mean(temps);
  const avgRainWet = r ? wetModels.reduce((s, v) => s + v.rain, 0) / r : 0;

  // Categoria più votata tra i modelli che sono d'accordo con la maggioranza
  const pool = ratio >= 0.5 ? wetModels : valid.filter(v => !v.wet);
  const votes = {};
  pool.forEach(v => { votes[v.category] = (votes[v.category] || 0) + 1; });
  const category = Object.keys(votes)
    .sort((a, b) => (votes[b] - votes[a]) || (weatherCategories[b].order - weatherCategories[a].order))[0];
  const catLabel = weatherCategories[category].label;
  const wetText = r ? wetPhrase(wetModels.map(v => v.category)
    .sort((a, b) => weatherCategories[b].order - weatherCategories[a].order)[0], avgRainWet) : '';

  let verdict, text;
  if (r === 0) {
    verdict = 'dry';
    text = n === 1
      ? `L'unico modello disponibile prevede tempo asciutto, cielo ${catLabel}.`
      : `Tutti e ${n} i modelli concordano: niente pioggia, cielo ${catLabel}.`;
  } else if (r === n) {
    verdict = 'wet';
    text = n === 1
      ? `L'unico modello disponibile prevede ${wetText} (circa ${formatMm(avgRainWet)}).`
      : `Tutti e ${n} i modelli prevedono ${wetText}, in media ${formatMm(avgRainWet)}.`;
  } else if (ratio >= 0.6) {
    verdict = 'likely';
    text = `${r} modelli su ${n} prevedono ${wetText} (in media ${formatMm(avgRainWet)}): è probabile che piova.`;
  } else if (ratio > 0.4) {
    verdict = 'uncertain';
    text = `Modelli divisi: ${r} su ${n} prevedono ${wetText}, gli altri tempo asciutto. Meglio avere l'ombrello a portata di mano.`;
  } else {
    verdict = 'mostlydry';
    text = `Solo ${r === 1 ? 'un modello' : `${r} modelli`} su ${n} ${r === 1 ? 'prevede' : 'prevedono'} ${wetText}: probabilmente asciutto, cielo ${catLabel}.`;
  }

  return {
    n, r, verdict, text, category, avgTemp,
    wind: combineWind(valid),
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps)
  };
}

// Tutte le fasce di un giorno, già combinate tra i modelli
export function combineDay(hourly, date) {
  return daySlots.map(slot => {
    const results = forecastModels.map(m => summarizeModelSlot(hourly, m, slot, date));
    return { slot, results, ...combineSlot(results) };
  });
}

export function daySummary(combined, dayLabel, placeName) {
  const name = c => c.slot.name.toLowerCase();
  const wetSlots = combined.filter(c => c.verdict === 'wet' || c.verdict === 'likely').map(name);
  const doubtSlots = combined.filter(c => c.verdict === 'uncertain').map(name);
  const withData = combined.filter(c => c.n);
  if (!withData.length) return `Per ${dayLabel.toLowerCase()} i modelli non hanno ancora dati.`;

  let text;
  if (wetSlots.length === withData.length) text = 'pioggia probabile per tutta la giornata';
  else if (wetSlots.length) text = `pioggia probabile di ${joinList(wetSlots)}`;
  else if (doubtSlots.length) text = `giornata in gran parte asciutta, ma incerta di ${joinList(doubtSlots)}`;
  else text = 'giornata asciutta';

  if (wetSlots.length && doubtSlots.length) text += `, incerto di ${joinList(doubtSlots)}`;

  let windText = '';
  const windy = withData.filter(c => c.wind && (c.wind.level.key === 'forte' || c.wind.level.key === 'burrasca'));
  if (windy.length) {
    const worst = windy.some(c => c.wind.level.key === 'burrasca') ? 'vento di burrasca' : 'vento forte';
    windText = windy.length === withData.length
      ? ` Attenzione: ${worst} per tutta la giornata.`
      : ` Attenzione: ${worst} di ${joinList(windy.map(name))}.`;
  }

  const temps = withData.map(c => c.avgTemp);
  const tMin = Math.round(Math.min(...temps));
  const tMax = Math.round(Math.max(...temps));
  const tempText = tMin === tMax ? `Temperature intorno ai ${tMin}°` : `Temperature tra ${tMin}° e ${tMax}°`;
  return `${dayLabel} a ${placeName}: ${text}. ${tempText}.${windText}`;
}

// Minima e massima del giorno: per ogni ora la media dei modelli, poi gli estremi
export function dayTempRange(hourly, date) {
  const hourlyMeans = [];
  hourly.time.forEach((t, i) => {
    if (t.slice(0, 10) !== date) return;
    const values = forecastModels.map(m => (hourly[`temperature_2m_${m.id}`] || [])[i]).filter(v => v != null);
    if (values.length) hourlyMeans.push(mean(values));
  });
  if (!hourlyMeans.length) return null;
  return { min: Math.min(...hourlyMeans), max: Math.max(...hourlyMeans) };
}

// Una riga della vista settimana: il verdetto peggiore delle stesse fasce del dettaglio
// (mattina, pomeriggio, sera e la notte che segue), così riga e dettaglio dicono la stessa cosa
export function dayOverview(hourly, date) {
  const combined = combineDay(hourly, date);
  const withData = combined.filter(c => c.n);
  if (!withData.length) return { date, n: 0, verdict: 'nodata' };

  const worst = withData.reduce((a, b) => verdictSeverity[b.verdict] > verdictSeverity[a.verdict] ? b : a);
  const afternoon = withData.find(c => c.slot.name === 'Pomeriggio') || withData[0];
  const shown = (worst.verdict === 'wet' || worst.verdict === 'likely') ? worst : afternoon;

  const winds = withData.filter(c => c.wind);
  const windiest = winds.length ? winds.reduce((a, b) => b.wind.speed > a.wind.speed ? b : a).wind : null;

  return {
    date,
    n: Math.max(...withData.map(c => c.n)),
    verdict: worst.verdict,
    category: shown.category,
    temps: dayTempRange(hourly, date),
    wind: windiest
  };
}
