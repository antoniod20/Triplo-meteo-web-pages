// Utility sui testi: nessuna dipendenza dalla pagina, quindi testabili con Node.

// Toglie accenti e apostrofi e mette in minuscolo: "L'Aquila" -> "laquila", "Forlì" -> "forli"
export function normalizeText(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '').trim();
}

// Iniziali maiuscole: "reggio nell'emilia" -> "Reggio Nell'Emilia"
export function prettyCity(city) {
  return city.replace(/(^|[\s'’-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

export function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Unisce un elenco in italiano: ["mattina", "sera"] -> "mattina e sera"
export function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}
