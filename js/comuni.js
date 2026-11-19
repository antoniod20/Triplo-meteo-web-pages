// Elenco ufficiale ISTAT dei comuni, caricato una volta sola e condiviso da suggerimenti e agente.

import { normalizeText } from './text.js';

let comuniPromise = null;

export function getComuni() {
  if (!comuniPromise) {
    comuniPromise = fetch('comuni.json')
      .then(res => res.ok ? res.json() : [])
      .then(list => list.map(([name, sigla]) => ({ name, sigla, key: normalizeText(name) })))
      .catch(() => {
        comuniPromise = null; // si riprova alla prossima richiesta
        return [];
      });
  }
  return comuniPromise;
}
