// Test della logica pura del sito. Si lanciano con:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeText, prettyCity, joinList } from '../js/text.js';
import { availableProviders, formatCity, providerUrl, sanitizeProviders } from '../js/providers.js';
import {
  forecastModels, daySlots, codeCategory, windLevel, addDays,
  summarizeModelSlot, combineSlot, combineDay, daySummary, dayOverview
} from '../js/weather.js';

// --- Testi ---

test('normalizeText toglie accenti e apostrofi', () => {
  assert.equal(normalizeText("L'Aquila"), 'laquila');
  assert.equal(normalizeText('Forlì'), 'forli');
  assert.equal(normalizeText('  San Severo '), 'san severo');
});

test('prettyCity mette le iniziali maiuscole', () => {
  assert.equal(prettyCity("reggio nell'emilia"), "Reggio Nell'Emilia");
  assert.equal(prettyCity('la spezia'), 'La Spezia');
});

test('joinList unisce in italiano', () => {
  assert.equal(joinList(['mattina']), 'mattina');
  assert.equal(joinList(['mattina', 'sera']), 'mattina e sera');
  assert.equal(joinList(['mattina', 'pomeriggio', 'notte']), 'mattina, pomeriggio e notte');
});

// --- Formato delle città per ogni sito (verificato sui siti reali) ---

test('formatCity: ogni fonte riceve il formato che si aspetta', () => {
  const p = availableProviders;
  assert.equal(formatCity('la spezia', p['3bmeteo'].slug), 'la+spezia');
  assert.equal(formatCity("l'aquila", p['3bmeteo'].slug), 'laquila');
  assert.equal(formatCity('forlì', p.ilmeteo.slug), 'forli');
  assert.equal(formatCity("l'aquila", p.meteoam.slug), 'l-aquila');
  assert.equal(formatCity("l'aquila", p.meteogiuliacci.slug), 'laquila');
  assert.equal(formatCity('san severo', p.meteoeradar.slug), 'san-severo');
  assert.equal(formatCity('la spezia', p.google.slug), 'la%20spezia');
});

test('formatCity non lascia passare caratteri pericolosi negli URL', () => {
  const slug = availableProviders['3bmeteo'].slug;
  assert.equal(formatCity('../../admin?x=<script>', slug), 'admin+x+script');
  assert.equal(providerUrl(availableProviders.google, 'a&b=c'), 'https://www.google.com/search?q=meteo+a%26b%3Dc&sca_esv=07cdbffa48f41bdb&igu=1');
});

test('sanitizeProviders sostituisce valori mancanti o non validi', () => {
  assert.deepEqual(sanitizeProviders(null), ['3bmeteo', 'google', 'ilmeteo']);
  assert.deepEqual(sanitizeProviders(['meteoam', 'xxx']), ['meteoam', 'google', 'ilmeteo']);
});

// --- Codici meteo, vento e date ---

test('codeCategory interpreta i codici WMO', () => {
  assert.equal(codeCategory(0), 'sereno');
  assert.equal(codeCategory(2), 'nuvoloso');
  assert.equal(codeCategory(3), 'coperto');
  assert.equal(codeCategory(45), 'nebbia');
  assert.equal(codeCategory(61), 'pioggia');
  assert.equal(codeCategory(81), 'pioggia');
  assert.equal(codeCategory(73), 'neve');
  assert.equal(codeCategory(95), 'temporale');
});

test('windLevel usa le soglie dei bollettini italiani', () => {
  assert.equal(windLevel(19.9).key, 'debole');
  assert.equal(windLevel(20).key, 'moderato');
  assert.equal(windLevel(39.9).key, 'moderato');
  assert.equal(windLevel(40).key, 'forte');
  assert.equal(windLevel(62).key, 'burrasca');
});

test('addDays attraversa mesi, anni e ora legale', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26'); // cambio dell'ora
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

// --- Combinazione dei modelli ---

// Crea dati orari finti nel formato di Open-Meteo: per ogni modello una funzione (data, ora) -> valori
function fakeHourly(days, perModel) {
  const hourly = { time: [] };
  days.forEach(d => { for (let h = 0; h < 24; h++) hourly.time.push(`${d}T${String(h).padStart(2, '0')}:00`); });
  forecastModels.forEach((m, mi) => {
    const fields = ['temperature_2m', 'precipitation', 'precipitation_probability', 'weather_code', 'wind_speed_10m', 'wind_gusts_10m'];
    fields.forEach(f => { hourly[`${f}_${m.id}`] = []; });
    hourly.time.forEach(t => {
      const v = perModel(mi, t.slice(0, 10), parseInt(t.slice(11, 13), 10));
      hourly[`temperature_2m_${m.id}`].push(v.temp ?? 15);
      hourly[`precipitation_${m.id}`].push(v.rain ?? 0);
      hourly[`precipitation_probability_${m.id}`].push(v.prob ?? 0);
      hourly[`weather_code_${m.id}`].push(v.code ?? 1);
      hourly[`wind_speed_10m_${m.id}`].push(v.wind ?? 10);
      hourly[`wind_gusts_10m_${m.id}`].push(v.gust ?? 20);
    });
  });
  return hourly;
}

const D1 = '2026-11-20';
const D2 = '2026-11-21';
const slot = name => daySlots.find(s => s.name === name);

test('combineSlot: tutti asciutti -> verdetto asciutto', () => {
  const hourly = fakeHourly([D1], () => ({}));
  const results = forecastModels.map(m => summarizeModelSlot(hourly, m, slot('Pomeriggio'), D1));
  const c = combineSlot(results);
  assert.equal(c.n, 5);
  assert.equal(c.verdict, 'dry');
  assert.match(c.text, /Tutti e 5 i modelli concordano/);
});

test('combineSlot: 3 modelli su 5 con pioggia -> pioggia probabile', () => {
  const hourly = fakeHourly([D1], mi => (mi < 3 ? { rain: 0.5, code: 61 } : {}));
  const results = forecastModels.map(m => summarizeModelSlot(hourly, m, slot('Pomeriggio'), D1));
  const c = combineSlot(results);
  assert.equal(c.r, 3);
  assert.equal(c.verdict, 'likely');
  assert.match(c.text, /3 modelli su 5 prevedono pioggia moderata/);
});

test('combineSlot: modelli divisi -> incerto; un solo modello -> probabilmente asciutto', () => {
  const split = fakeHourly([D1], mi => (mi < 2 ? { rain: 0.5, code: 61 } : {}));
  const resultsSplit = forecastModels.slice(0, 4).map(m => summarizeModelSlot(split, m, slot('Mattina'), D1));
  assert.equal(combineSlot(resultsSplit).verdict, 'uncertain'); // 2 su 4

  const one = fakeHourly([D1], mi => (mi === 0 ? { rain: 0.5, code: 61 } : {}));
  const resultsOne = forecastModels.map(m => summarizeModelSlot(one, m, slot('Mattina'), D1));
  assert.equal(combineSlot(resultsOne).verdict, 'mostlydry');
});

test('summarizeModelSlot: pioggia sotto la soglia conta come asciutto', () => {
  const hourly = fakeHourly([D1], () => ({ rain: 0.01, code: 51 }));
  const r = summarizeModelSlot(hourly, forecastModels[0], slot('Mattina'), D1);
  assert.equal(r.wet, false);
  assert.equal(r.hours.length, 6);
});

test('la notte usa le ore 0-6 del giorno dopo', () => {
  const hourly = fakeHourly([D1, D2], (mi, d, h) => (d === D2 && h < 6 ? { rain: 1, code: 63 } : {}));
  const day = combineDay(hourly, D1);
  const notte = day.find(c => c.slot.name === 'Notte');
  const mattina = day.find(c => c.slot.name === 'Mattina');
  assert.equal(notte.verdict, 'wet');
  assert.equal(mattina.verdict, 'dry');
  assert.match(daySummary(day, 'Domani', 'Barletta'), /pioggia probabile di notte/);
});

test("la notte dell'ultimo giorno senza dati -> nessun dato, senza errori", () => {
  const hourly = fakeHourly([D1], () => ({}));
  const notte = combineDay(hourly, D1).find(c => c.slot.name === 'Notte');
  assert.equal(notte.verdict, 'nodata');
});

test('daySummary segnala il vento forte e le temperature uguali', () => {
  const hourly = fakeHourly([D1, D2], (mi, d, h) => (h >= 12 && h < 18 ? { wind: 45, gust: 70 } : {}));
  const text = daySummary(combineDay(hourly, D1), 'Domani', 'Barletta');
  assert.match(text, /Attenzione: vento forte di pomeriggio/);
  assert.match(text, /Temperature intorno ai 15°/);
});

test('dayOverview: verdetto peggiore del giorno, minima e massima', () => {
  const hourly = fakeHourly([D1, D2], (mi, d, h) => ({
    temp: 10 + h / 2,
    ...(d === D1 && h >= 18 ? { rain: 2, code: 63 } : {})
  }));
  const o = dayOverview(hourly, D1);
  assert.equal(o.verdict, 'wet');
  assert.equal(o.category, 'pioggia');
  assert.equal(o.temps.min, 10);
  assert.equal(o.temps.max, 21.5);
});

test('dayOverview include la notte, come il dettaglio del giorno', () => {
  const hourly = fakeHourly([D1, D2], (mi, d, h) => (d === D2 && h < 6 ? { wind: 50, gust: 80 } : {}));
  const o = dayOverview(hourly, D1);
  assert.equal(o.wind.level.key, 'forte');
});
