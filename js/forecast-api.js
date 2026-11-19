// Chiamate a Open-Meteo (gratuito, senza chiavi): coordinate della città e previsioni dei modelli.
// L'ultima previsione di ogni città viene salvata, così l'agente funziona anche offline.

import { loadJSON, saveJSON } from './storage.js';
import { normalizeText } from './text.js';
import { getComuni } from './comuni.js';
import { forecastModels, FORECAST_DAYS } from './weather.js';

const FRESH_MS = 30 * 60 * 1000; // entro 30 minuti la previsione non si riscarica
const SAVED_PLACES = 3; // quante città tenere salvate per l'uso offline

function fetchJSON(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  return fetch(url, { signal: controller.signal })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}

// Città -> coordinate. Il risultato si salva, così la ricerca si fa una volta sola per città.
export async function geocodeCity(city) {
  const cache = loadJSON('geoCache', {});
  if (cache[city]) return cache[city];

  const search = async name => {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?' +
      new URLSearchParams({ name, count: '5', language: 'it', countryCode: 'IT', format: 'json' });
    const data = await fetchJSON(url);
    const results = data.results || [];
    return results.find(r => (r.feature_code || '').startsWith('PPL')) || results[0];
  };

  let place = await search(city);

  // "laquila" o "forli" non vengono trovati: si riprova con il nome ufficiale ISTAT
  if (!place) {
    const comuni = await getComuni();
    const key = normalizeText(city).replace(/\s+/g, ' ');
    const official = comuni.find(c => c.key === key || c.key.replace(/\s+/g, '') === key.replace(/\s+/g, ''));
    if (official) place = await search(official.name);
  }

  if (!place) return null;

  const result = {
    lat: place.latitude,
    lon: place.longitude,
    label: place.admin2 && place.admin2 !== place.name ? `${place.name} (${place.admin2})` : place.name
  };
  cache[city] = result;
  saveJSON('geoCache', cache);
  return result;
}

const memoryCache = new Map(); // chiave: lat,lon -> { time, data }

function storageKey(key) {
  return `forecast:${key}`;
}

function persist(key, entry) {
  // Tiene solo le ultime città consultate, per non riempire la memoria del telefono
  const keys = loadJSON('forecastKeys', []).filter(k => k !== key);
  keys.unshift(key);
  keys.slice(SAVED_PLACES).forEach(k => { try { localStorage.removeItem(storageKey(k)); } catch (e) { } });
  saveJSON('forecastKeys', keys.slice(0, SAVED_PLACES));
  saveJSON(storageKey(key), entry);
}

// Restituisce { data, time, offline }: offline è true quando si usano dati salvati perché la rete manca
export async function fetchModelForecast(place) {
  const key = `${place.lat},${place.lon}`;
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.time < FRESH_MS) return { ...cached, offline: false };

  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m',
    models: forecastModels.map(m => m.id).join(','),
    timezone: 'Europe/Rome',
    forecast_days: String(FORECAST_DAYS)
  });

  try {
    const data = await fetchJSON(url);
    const entry = { time: Date.now(), data };
    memoryCache.set(key, entry);
    persist(key, entry);
    return { ...entry, offline: false };
  } catch (error) {
    const saved = loadJSON(storageKey(key), null);
    if (saved && saved.data && saved.data.hourly) return { ...saved, offline: true };
    throw error;
  }
}
