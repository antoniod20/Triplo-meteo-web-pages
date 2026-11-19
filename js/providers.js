// I siti meteo mostrati negli iframe e il formato che ognuno vuole per il nome della città.
// - sep: carattere che unisce le parole ("la spezia" -> "la+spezia" o "la-spezia")
// - apos: true se l'apostrofo separa le parole ("l'aquila" -> "l-aquila"), false se va tolto ("laquila")
// - query: la città va in una ricerca testuale, quindi basta codificarla
export const availableProviders = {
  '3bmeteo': { name: '3BMeteo', url: 'https://www.3bmeteo.com/meteo/{city}', slug: { sep: '+', apos: false } },
  'google': { name: 'Google', url: 'https://www.google.com/search?q=meteo+{city}&sca_esv=07cdbffa48f41bdb&igu=1', slug: { query: true } },
  'ilmeteo': { name: 'IlMeteo', url: 'https://www.ilmeteo.it/meteo/{city}', slug: { sep: '+', apos: false } },
  'meteoeradar': { name: 'Meteo & Radar', url: 'https://www.meteoeradar.it/pagina-meteo/{city}', slug: { sep: '-', apos: true } },
  'meteogiuliacci': { name: 'Giuliacci', url: 'https://www.meteogiuliacci.it/meteo/{city}', slug: { sep: '-', apos: false } },
  'meteoam': { name: 'MeteoAM', url: 'https://www.meteoam.it/it/meteo-citta/{city}', slug: { sep: '-', apos: true } }
};

export const defaultProviders = ['3bmeteo', 'google', 'ilmeteo'];

// Trasforma il nome della città nel formato che la fonte si aspetta nell'URL
export function formatCity(city, slug) {
  if (slug.query) return encodeURIComponent(city);

  return city
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // via gli accenti: forlì -> forli
    .toLowerCase()
    .replace(/['’`]/g, slug.apos ? ' ' : '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .join(slug.sep);
}

export function providerUrl(provider, city) {
  return provider.url.replace('{city}', formatCity(city, provider.slug));
}

// Le tre fonti scelte dall'utente, con le predefinite al posto di valori mancanti o non validi
export function sanitizeProviders(saved) {
  const list = Array.isArray(saved) ? saved : [];
  return defaultProviders.map((def, i) => availableProviders[list[i]] ? list[i] : def);
}
