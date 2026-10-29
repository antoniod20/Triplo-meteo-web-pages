// Ogni fonte vuole il nome della città in un formato diverso:
// - sep: carattere che unisce le parole ("la spezia" -> "la+spezia" o "la-spezia")
// - apos: true se l'apostrofo separa le parole ("l'aquila" -> "l-aquila"), false se va tolto ("laquila")
// - query: la città va in una ricerca testuale, quindi basta codificarla
const availableProviders = {
  '3bmeteo': { name: '3BMeteo', url: 'https://www.3bmeteo.com/meteo/{city}', slug: { sep: '+', apos: false } },
  'google': { name: 'Google', url: 'https://www.google.com/search?q=meteo+{city}&sca_esv=07cdbffa48f41bdb&igu=1', slug: { query: true } },
  'ilmeteo': { name: 'IlMeteo', url: 'https://www.ilmeteo.it/meteo/{city}', slug: { sep: '+', apos: false } },
  'meteoeradar': { name: 'Meteo & Radar', url: 'https://www.meteoeradar.it/pagina-meteo/{city}', slug: { sep: '-', apos: true } },
  'meteogiuliacci': { name: 'Giuliacci', url: 'https://www.meteogiuliacci.it/meteo/{city}', slug: { sep: '-', apos: false } },
  'meteoam': { name: 'MeteoAM', url: 'https://www.meteoam.it/it/meteo-citta/{city}', slug: { sep: '-', apos: true } }
};

const defaultProviders = ['3bmeteo', 'google', 'ilmeteo'];

// Legge un valore JSON dal localStorage senza bloccare la pagina se è corrotto
function loadJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (e) {
    return fallback;
  }
}

let userProviders = loadJSON('userProviders', defaultProviders);
if (!Array.isArray(userProviders)) userProviders = defaultProviders;
userProviders = defaultProviders.map((def, i) => availableProviders[userProviders[i]] ? userProviders[i] : def);

const frames = userProviders.map((key, i) => ({
  id: `frame${i + 1}`,
  iframe: document.getElementById(`frame${i + 1}`),
  provider: availableProviders[key]
}));

// Add wrapper reference dynamically
frames.forEach(f => {
  if (f.iframe) {
    f.wrapper = f.iframe.closest('.frame-wrapper') || f.iframe.parentElement;
    f.openLink = f.wrapper.querySelector('.open-btn');
    f.iframe.title = f.provider.name;
  }
});

// --- GESTIONE DATI ---
// Un link condiviso (?citta=...) ha la precedenza sulla città salvata, senza sovrascriverla
const sharedCity = new URLSearchParams(location.search).get('citta');
let currentCity = (sharedCity && sharedCity.trim().toLowerCase()) || localStorage.getItem('city') || 'barletta';
let favorites = loadJSON('favorites', ['bari', 'roma', 'napoli']);
if (!Array.isArray(favorites)) favorites = ['bari', 'roma', 'napoli'];
favorites = favorites.filter(f => typeof f === 'string');
// Votes structure: { frame1: { count: 0, lastDate: '2023-10-27' }, ... }
let votes = loadJSON('votes', {
  frame1: { count: 0, lastDate: null },
  frame2: { count: 0, lastDate: null },
  frame3: { count: 0, lastDate: null }
});
if (typeof votes !== 'object' || Array.isArray(votes)) {
  votes = {
    frame1: { count: 0, lastDate: null },
    frame2: { count: 0, lastDate: null },
    frame3: { count: 0, lastDate: null }
  };
}

let votingEnabled = localStorage.getItem('votingEnabled') !== 'false'; // Default true



// --- FUNZIONI CORE ---

// Trasforma il nome della città nel formato che la fonte si aspetta nell'URL
function formatCity(city, slug) {
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

function prettyCity(city) {
  return city.replace(/(^|[\s'’-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
}

function updateFrames(city) {
  currentCity = city;
  frames.forEach(f => {
    if (!f.iframe) return;
    const url = f.provider.url.replace('{city}', formatCity(city, f.provider.slug));
    f.iframe.src = url;
    if (f.openLink) {
      f.openLink.href = url;
      f.openLink.setAttribute('aria-label', `Apri ${f.provider.name} in una nuova scheda`);
    }
  });

  // L'indirizzo nella barra del browser è sempre un link condivisibile
  const pageUrl = new URL(location.href);
  pageUrl.searchParams.set('citta', city);
  history.replaceState(null, '', pageUrl);
}

function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify(favorites));
}

function renderFavorites() {
  const container = document.getElementById('favoritesContainer');
  if (!container) return;
  container.innerHTML = '';

  favorites.forEach(fav => {
    const chip = document.createElement('span');
    chip.className = 'fav-chip';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = prettyCity(fav);
    btn.className = 'fav-btn';
    btn.onclick = () => {
      document.getElementById('cityInput').value = fav;
      saveAction();
    };

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'fav-del';
    del.appendChild(svgIcon('i-close'));
    del.setAttribute('aria-label', `Rimuovi ${prettyCity(fav)} dai preferiti`);
    del.onclick = () => {
      favorites = favorites.filter(f => f !== fav);
      saveFavorites();
      renderFavorites();
      const next = container.querySelector('.fav-btn') || document.getElementById('cityInput');
      next.focus();
    };

    chip.append(btn, del);
    container.appendChild(chip);
  });

  if (favorites.length === 0) {
    const empty = document.createElement('span');
    empty.className = 'fav-empty';
    empty.textContent = 'Nessun preferito: cerca una città qui sotto.';
    container.appendChild(empty);
  }
}

function renderRanking() {
  const container = document.getElementById('rankingContainer');
  if (!container) return;
  container.innerHTML = '';

  // Convert votes object to array and sort
  const ranking = Object.entries(votes)
    .map(([key, data]) => ({ id: key, count: data.count }))
    .sort((a, b) => b.count - a.count);

  ranking.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'ranking-item';
    // Mapping IDs to friendly names based on user selection
    const names = {
      frame1: availableProviders[userProviders[0]]?.name || 'Meteo 1',
      frame2: availableProviders[userProviders[1]]?.name || 'Meteo 2',
      frame3: availableProviders[userProviders[2]]?.name || 'Meteo 3'
    };
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';

    const nameSpan = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = names[item.id] || item.id;
    nameSpan.append(medal ? medal + ' ' : '', strong);

    const countSpan = document.createElement('span');
    countSpan.textContent = `${Number(item.count) || 0} ⭐`;

    div.append(nameSpan, countSpan);
    container.appendChild(div);
  });
}

function saveAction() {
  const city = document.getElementById('cityInput').value.trim().toLowerCase();
  if (!city) return;

  if (!favorites.includes(city)) {
    favorites.push(city);
    if (favorites.length > 3) favorites.shift();
    saveFavorites();
  }

  localStorage.setItem('city', city);
  updateFrames(city);
  closeModal(document.getElementById('modal'));
}

// Suggerimenti città: elenco ufficiale ISTAT dei comuni, caricato solo alla prima apertura.
// La lista è disegnata da noi perché il <datalist> nativo non funziona su molti browser mobili.
let comuni = [];
let comuniLoading = false;
let suggestionIndex = -1;

function normalizeText(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’`]/g, '').trim();
}

function loadComuni() {
  if (comuni.length || comuniLoading) return;
  comuniLoading = true;

  fetch('comuni.json')
    .then(res => res.ok ? res.json() : [])
    .then(list => {
      comuni = list.map(([name, sigla]) => ({ name, sigla, key: normalizeText(name) }));
    })
    .catch(() => { })
    .finally(() => { comuniLoading = false; });
}

function hideSuggestions() {
  const list = document.getElementById('citySuggestions');
  list.hidden = true;
  list.innerHTML = '';
  suggestionIndex = -1;
  const input = document.getElementById('cityInput');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function showSuggestions() {
  const input = document.getElementById('cityInput');
  const list = document.getElementById('citySuggestions');
  const query = normalizeText(input.value);
  if (query.length < 2 || !comuni.length) return hideSuggestions();

  // Prima i comuni che iniziano con il testo scritto, poi quelli che lo contengono
  const starts = comuni.filter(c => c.key.startsWith(query));
  const contains = comuni.filter(c => !c.key.startsWith(query) && c.key.includes(query));
  const matches = starts.concat(contains).slice(0, 8);
  if (!matches.length) return hideSuggestions();

  list.innerHTML = '';
  suggestionIndex = -1;
  matches.forEach((c, i) => {
    const li = document.createElement('li');
    li.id = `suggestion-${i}`;
    li.setAttribute('role', 'option');
    li.dataset.name = c.name;

    const name = document.createElement('span');
    name.textContent = c.name;
    const sigla = document.createElement('span');
    sigla.className = 'sigla';
    sigla.textContent = c.sigla;
    li.append(name, sigla);

    // pointerdown invece di click: arriva prima che l'input perda il focus
    li.addEventListener('pointerdown', e => {
      e.preventDefault();
      chooseSuggestion(c.name);
    });
    list.appendChild(li);
  });

  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function highlightSuggestion(index) {
  const items = document.querySelectorAll('#citySuggestions li');
  if (!items.length) return;
  suggestionIndex = (index + items.length) % items.length;
  items.forEach((li, i) => li.setAttribute('aria-selected', String(i === suggestionIndex)));
  items[suggestionIndex].scrollIntoView({ block: 'nearest' });
  document.getElementById('cityInput').setAttribute('aria-activedescendant', items[suggestionIndex].id);
}

function chooseSuggestion(name) {
  document.getElementById('cityInput').value = name;
  hideSuggestions();
  saveAction();
}

function handleVote(frameId, btnElement) {
  const today = new Date().toISOString().split('T')[0];
  const frameData = votes[frameId] || { count: 0, lastDate: null };

  // Toggle vote logic
  if (frameData.lastDate === today) {
    // Remove vote
    frameData.count--;
    frameData.lastDate = null; // Clear date so they can vote again (or just remove vote)

    // Check for negative count?
    if (frameData.count < 0) frameData.count = 0;

    votes[frameId] = frameData;
    localStorage.setItem('votes', JSON.stringify(votes));

    // Visual feedback (unvote)
    setVoteButtonState(btnElement, false);
  } else {
    // Add vote
    frameData.count++;
    frameData.lastDate = today;
    votes[frameId] = frameData;
    localStorage.setItem('votes', JSON.stringify(votes));

    // Visual feedback (vote)
    setVoteButtonState(btnElement, true);

    // Animation effect
    const rect = btnElement.getBoundingClientRect();
    createFloatingHeart(rect.left + rect.width / 2, rect.top, '⭐');
  }
}

// Piccola animazione della stellina che sale dal pulsante di voto
function createFloatingHeart(x, y, symbol = '⭐') {
  const el = document.createElement('span');
  el.className = 'heart star';
  el.textContent = symbol;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

function resetVotes() {
  if (!confirm('Sei sicuro di voler azzerare la classifica?')) return;

  votes = {
    frame1: { count: 0, lastDate: null },
    frame2: { count: 0, lastDate: null },
    frame3: { count: 0, lastDate: null }
  };
  localStorage.setItem('votes', JSON.stringify(votes));

  renderRanking();
  updateVoteButtons();
}

function setVoteButtonState(btn, voted) {
  const frame = frames.find(f => f.id === btn.dataset.frame);
  const name = frame ? frame.provider.name : 'questa fonte';
  btn.classList.toggle('voted', voted);
  btn.setAttribute('aria-pressed', String(voted));
  btn.setAttribute('aria-label', voted ? `Togli il voto di oggi a ${name}` : `Vota ${name} per oggi`);
}

function updateVoteButtons() {
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const fid = btn.dataset.frame;
    setVoteButtonState(btn, Boolean(votes[fid] && votes[fid].lastDate === today));
  });
}


function updateVotingModeInternal() {
  const toggle = document.getElementById('voteToggle');
  const rankingSection = document.getElementById('rankingSection');

  if (toggle) toggle.checked = votingEnabled;
  if (rankingSection) rankingSection.style.display = votingEnabled ? 'block' : 'none';
  document.body.classList.toggle('voting-off', !votingEnabled);
}

// --- FINESTRE MODALI ---

let lastFocused = null;

function openModal(modal) {
  lastFocused = document.activeElement;
  modal.style.display = 'flex';
  const first = modal.querySelector('button, input, select, a[href]');
  if (first) first.focus();
}

function closeModal(modal) {
  if (modal.style.display !== 'flex') return;
  modal.style.display = 'none';
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = ['agentModal', 'providersModal', 'modal']
    .map(id => document.getElementById(id))
    .find(m => m.style.display === 'flex');
  if (open) {
    closeModal(open);
  } else if (document.body.classList.contains('full-view')) {
    toggleFullView();
  }
});

// --- TAB BAR & RESPONSIVE ---

function renderTabButtons() {
  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return;
  tabBar.innerHTML = '';

  userProviders.forEach((provKey, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.index = index;
    if (index === 0) btn.classList.add('active');
    btn.setAttribute('aria-pressed', String(index === 0));
    btn.textContent = availableProviders[provKey]?.name || 'Meteo';

    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-bar button').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      updateResponsiveLayout();
    });

    tabBar.appendChild(btn);
  });
}

// Initial render
renderTabButtons();

function updateResponsiveLayout() {
  const isMobile = window.innerWidth <= 768;
  const isFullView = document.body.classList.contains('full-view');

  const activeTab = document.querySelector('.tab-bar button.active');
  const activeIndex = activeTab ? parseInt(activeTab.dataset.index) : 0;

  frames.forEach((f, i) => {
    if (!f.wrapper) return;

    // Show all if Desktop OR Full View
    if (!isMobile || isFullView) {
      f.wrapper.style.display = 'block';
      f.wrapper.classList.remove('active');
    } else {
      // Mobile: Show only active
      f.wrapper.style.display = (i === activeIndex) ? 'block' : 'none';
      f.wrapper.classList.toggle('active', i === activeIndex);
    }
  });
}

function toggleFullView() {
  document.body.classList.toggle('full-view');
  const isFull = document.body.classList.contains('full-view');
  // Il viewport largo è l'unico modo per far stare le tre fonti affiancate su mobile

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (isFull) {
    if (viewportMeta) viewportMeta.content = "width=1200";
    closeModal(document.getElementById('modal'));
    document.getElementById('closeFullViewBtn').style.display = 'block';
  } else {
    if (viewportMeta) viewportMeta.content = "width=device-width, initial-scale=1.0";
    document.getElementById('closeFullViewBtn').style.display = 'none';
  }
  updateResponsiveLayout();
}

// --- CONDIVIDI ---

async function shareCity() {
  const feedback = document.getElementById('shareFeedback');
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('citta', currentCity);
  const link = url.toString();

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Tripolemme', text: `Meteo di ${prettyCity(currentCity)}`, url: link });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // l'utente ha annullato
    }
  }

  try {
    await navigator.clipboard.writeText(link);
    feedback.textContent = 'Link copiato! 📋';
  } catch (e) {
    feedback.textContent = link;
  }
}

// --- INIT ---

document.addEventListener('DOMContentLoaded', () => {
  updateFrames(currentCity);
  document.getElementById('cityInput').value = currentCity;
  updateVoteButtons();
  updateVotingModeInternal();
  updateResponsiveLayout();
});

// Double check layout after full load (fixes potential mobile viewport issues)
window.addEventListener('load', updateResponsiveLayout);

window.addEventListener('resize', updateResponsiveLayout);

// --- MANAGE PROVIDERS LOGIC ---

function populateProvidersModal() {
  const selects = [document.getElementById('slot1'), document.getElementById('slot2'), document.getElementById('slot3')];

  selects.forEach((select, i) => {
    select.innerHTML = '';
    Object.keys(availableProviders).forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = availableProviders[key].name;
      if (userProviders[i] === key) option.selected = true;
      select.appendChild(option);
    });
  });
}

document.getElementById('manageProvidersBtn').addEventListener('click', () => {
  populateProvidersModal();
  closeModal(document.getElementById('modal')); // Close settings modal
  openModal(document.getElementById('providersModal'));
});

document.getElementById('closeProvidersModalBtn').addEventListener('click', () => {
  closeModal(document.getElementById('providersModal'));
});

document.getElementById('providersModal').addEventListener('click', e => {
  if (e.target.id === 'providersModal') closeModal(e.target);
});

document.getElementById('saveProvidersSetupBtn').addEventListener('click', () => {
  const newProviders = [
    document.getElementById('slot1').value,
    document.getElementById('slot2').value,
    document.getElementById('slot3').value
  ];

  // Prevent duplicates (optional but good for UX)
  if (new Set(newProviders).size !== newProviders.length) {
    alert("Attenzione: Hai selezionato lo stesso meteo più volte. Scegli fonti diverse per ogni slot!");
    return;
  }

  localStorage.setItem('userProviders', JSON.stringify(newProviders));

  // Reset votes because sources changed
  const resetVotesObj = {
    frame1: { count: 0, lastDate: null },
    frame2: { count: 0, lastDate: null },
    frame3: { count: 0, lastDate: null }
  };
  localStorage.setItem('votes', JSON.stringify(resetVotesObj));

  // Reload page to apply changes cleanly
  window.location.reload();
});

document.getElementById('settings').addEventListener('click', () => {
  renderFavorites();
  renderRanking();
  loadComuni();
  document.getElementById('shareFeedback').textContent = '';
  document.getElementById('cityInput').value = currentCity;
  // Re-sync switch state when opening modal
  const toggle = document.getElementById('voteToggle');
  if (toggle) toggle.checked = votingEnabled;
  openModal(document.getElementById('modal'));
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => {
  closeModal(document.getElementById('modal'));
});

document.getElementById('voteToggle').addEventListener('change', (e) => {
  votingEnabled = e.target.checked;
  localStorage.setItem('votingEnabled', votingEnabled);
  updateVotingModeInternal();
});

document.getElementById('resetRanking').addEventListener('click', resetVotes);

document.getElementById('saveCity').addEventListener('click', saveAction);

document.getElementById('shareBtn').addEventListener('click', shareCity);

document.getElementById('fullViewBtn').addEventListener('click', toggleFullView);
document.getElementById('closeFullViewBtn').addEventListener('click', toggleFullView);

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal(e.target);
});

const cityInput = document.getElementById('cityInput');

cityInput.addEventListener('input', showSuggestions);

// Toccando il campo si seleziona la città attuale, così si scrive subito quella nuova
cityInput.addEventListener('focus', () => cityInput.select());

cityInput.addEventListener('blur', hideSuggestions);

cityInput.addEventListener('keydown', e => {
  const listOpen = !document.getElementById('citySuggestions').hidden;

  if (e.key === 'ArrowDown' && listOpen) {
    e.preventDefault();
    highlightSuggestion(suggestionIndex + 1);
  } else if (e.key === 'ArrowUp' && listOpen) {
    e.preventDefault();
    highlightSuggestion(suggestionIndex - 1);
  } else if (e.key === 'Escape' && listOpen) {
    e.stopPropagation(); // chiude solo la lista, non la finestra
    hideSuggestions();
  } else if (e.key === 'Enter') {
    const selected = document.querySelector('#citySuggestions li[aria-selected="true"]');
    if (listOpen && selected) {
      chooseSuggestion(selected.dataset.name);
    } else {
      hideSuggestions();
      saveAction();
    }
  }
});

// Vote buttons
document.querySelectorAll('.vote-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent propagation if any
    const fid = btn.dataset.frame;
    handleVote(fid, btn);
  });
});

// --- AGENTE: PREVISIONE COMBINATA DEI MODELLI ---
// I siti negli iframe non si possono leggere dal browser, quindi l'agente confronta
// i modelli meteo da cui partono anche loro, tramite Open-Meteo (gratuito, senza chiavi).

const forecastModels = [
  { id: 'ecmwf_ifs025', name: 'ECMWF', origin: 'Centro europeo' },
  { id: 'icon_seamless', name: 'ICON', origin: 'Germania' },
  { id: 'gfs_seamless', name: 'GFS', origin: 'Stati Uniti' },
  { id: 'meteofrance_seamless', name: 'Météo-France', origin: 'Francia' },
  { id: 'italia_meteo_arpae_icon_2i', name: 'ItaliaMeteo', origin: 'Italia' }
];

const daySlots = [
  { name: 'Mattina', icon: '🌅', from: 6, to: 12 },
  { name: 'Pomeriggio', icon: '🏙️', from: 12, to: 18 },
  { name: 'Sera', icon: '🌙', from: 18, to: 24 }
];

const AGENT_DAYS = 7; // oggi + 6 giorni
const RAIN_THRESHOLD = 0.2; // mm in una fascia: sotto questa soglia è "asciutto"

// Categorie dai codici WMO, in ordine di importanza
const weatherCategories = {
  sereno: { order: 0, label: 'sereno', icon: '☀️', night: '🌙' },
  nuvoloso: { order: 1, label: 'poco nuvoloso', icon: '🌤️', night: '☁️' },
  coperto: { order: 2, label: 'nuvoloso', icon: '☁️', night: '☁️' },
  nebbia: { order: 3, label: 'nebbioso', icon: '🌫️', night: '🌫️' },
  pioggia: { order: 4, label: 'pioggia', icon: '🌧️', night: '🌧️', wet: true },
  neve: { order: 5, label: 'neve', icon: '❄️', night: '❄️', wet: true },
  temporale: { order: 6, label: 'temporali', icon: '⛈️', night: '⛈️', wet: true }
};

function codeCategory(code) {
  if (code >= 95) return 'temporale';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neve';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'pioggia';
  if (code === 45 || code === 48) return 'nebbia';
  if (code === 3) return 'coperto';
  if (code === 2) return 'nuvoloso';
  return 'sereno';
}

function localDateString(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); // formato YYYY-MM-DD
}

function svgIcon(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

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
async function geocodeCity(city) {
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
    if (!comuni.length) {
      const list = await fetchJSON('comuni.json').catch(() => []);
      comuni = list.map(([name, sigla]) => ({ name, sigla, key: normalizeText(name) }));
    }
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
  try { localStorage.setItem('geoCache', JSON.stringify(cache)); } catch (e) { }
  return result;
}

const forecastCache = new Map(); // chiave: lat,lon -> { time, data } con tutti i giorni

async function fetchModelForecast(place) {
  const key = `${place.lat},${place.lon}`;
  const cached = forecastCache.get(key);
  if (cached && Date.now() - cached.time < 30 * 60 * 1000) return cached.data;

  const url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    hourly: 'temperature_2m,precipitation,precipitation_probability,weather_code',
    models: forecastModels.map(m => m.id).join(','),
    timezone: 'Europe/Rome',
    forecast_days: String(AGENT_DAYS)
  });
  const data = await fetchJSON(url);
  forecastCache.set(key, { time: Date.now(), data });
  return data;
}

// Riassume le ore di una fascia per un singolo modello
function summarizeModelSlot(hourly, model, slot, date) {
  const pick = name => hourly[`${name}_${model.id}`] || [];
  const temps = pick('temperature_2m');
  const rains = pick('precipitation');
  const probs = pick('precipitation_probability');
  const codes = pick('weather_code');

  const idx = hourly.time
    .map((t, i) => ({ d: t.slice(0, 10), h: parseInt(t.slice(11, 13), 10), i }))
    .filter(x => x.d === date && x.h >= slot.from && x.h < slot.to && temps[x.i] != null)
    .map(x => x.i);
  if (idx.length < 3) return null; // modello senza dati per questa fascia (es. oltre il suo orizzonte)

  const temp = idx.reduce((s, i) => s + temps[i], 0) / idx.length;
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

  return { model, temp, rain, prob, category, wet };
}

function rainIntensity(mm) {
  if (mm < 1) return 'debole';
  if (mm < 5) return 'moderata';
  return 'forte';
}

function wetPhrase(category, mm) {
  if (category === 'temporale') return 'temporali';
  if (category === 'neve') return 'neve';
  return `pioggia ${rainIntensity(mm)}`;
}

function formatMm(mm) {
  return `${mm.toFixed(1).replace('.', ',')} mm`;
}

// Mette insieme i modelli di una fascia e scrive il verdetto
function combineSlot(results) {
  const valid = results.filter(Boolean);
  const n = valid.length;
  if (!n) return { n: 0, verdict: 'nodata', text: 'Nessun modello ha ancora dati per questa fascia.' };

  const wetModels = valid.filter(r => r.wet);
  const r = wetModels.length;
  const ratio = r / n;
  const temps = valid.map(v => v.temp);
  const avgTemp = temps.reduce((a, b) => a + b, 0) / n;
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
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps)
  };
}

const verdictBadges = {
  dry: { label: 'Asciutto', cls: 'badge-dry' },
  mostlydry: { label: 'Probabilmente asciutto', cls: 'badge-dry' },
  uncertain: { label: 'Incerto', cls: 'badge-uncertain' },
  likely: { label: 'Pioggia probabile', cls: 'badge-wet' },
  wet: { label: 'Pioggia quasi certa', cls: 'badge-wet' },
  nodata: { label: 'Nessun dato', cls: 'badge-nodata' }
};

function daySummary(combined, dayLabel, placeName) {
  const wetSlots = combined.filter(c => c.verdict === 'wet' || c.verdict === 'likely').map(c => c.slot.name.toLowerCase());
  const doubtSlots = combined.filter(c => c.verdict === 'uncertain').map(c => c.slot.name.toLowerCase());
  const list = names => names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0];
  const withData = combined.filter(c => c.n);
  if (!withData.length) return `Per ${dayLabel.toLowerCase()} i modelli non hanno ancora dati.`;

  let text;
  if (wetSlots.length === withData.length) text = 'pioggia probabile per tutta la giornata';
  else if (wetSlots.length) text = `pioggia probabile di ${list(wetSlots)}`;
  else if (doubtSlots.length) text = `giornata in gran parte asciutta, ma incerta di ${list(doubtSlots)}`;
  else text = 'giornata asciutta';

  if (wetSlots.length && doubtSlots.length) text += `, incerto di ${list(doubtSlots)}`;

  const temps = withData.map(c => c.avgTemp);
  return `${dayLabel} a ${placeName}: ${text}. Temperature tra ${Math.round(Math.min(...temps))}° e ${Math.round(Math.max(...temps))}°.`;
}

let agentSelectedDate = null;

function renderAgentDays() {
  const container = document.getElementById('agentDays');
  container.innerHTML = '';
  const today = new Date();

  for (let i = 0; i < AGENT_DAYS; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    const value = localDateString(d);
    const label = i === 0 ? 'Oggi' : i === 1 ? 'Domani'
      : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Rome' });

    const btn = el('button', 'day-chip', label.charAt(0).toUpperCase() + label.slice(1));
    btn.type = 'button';
    btn.dataset.date = value;
    btn.dataset.label = i === 0 ? 'Oggi' : i === 1 ? 'Domani'
      : d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
    btn.setAttribute('aria-pressed', String(value === agentSelectedDate));
    btn.addEventListener('click', () => selectAgentDay(i));
    container.appendChild(btn);
  }
}

// Cambia giorno (da chip, swipe o frecce) con un'animazione nella direzione giusta
function selectAgentDay(index) {
  const chips = [...document.querySelectorAll('.day-chip')];
  const current = chips.findIndex(b => b.dataset.date === agentSelectedDate);
  const target = Math.max(0, Math.min(chips.length - 1, index));
  if (target === current) return false;

  agentSelectedDate = chips[target].dataset.date;
  chips.forEach((b, i) => b.setAttribute('aria-pressed', String(i === target)));
  chips[target].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

  const result = document.getElementById('agentResult');
  result.classList.remove('slide-from-right', 'slide-from-left');
  void result.offsetWidth; // fa ripartire l'animazione
  result.classList.add(target > current ? 'slide-from-right' : 'slide-from-left');
  runAgent();
  return true;
}

function setAgentCity(text) {
  const p = document.getElementById('agentCity');
  p.innerHTML = '';
  const icon = svgIcon('i-place');
  icon.style.width = '16px';
  icon.style.height = '16px';
  p.append(icon, text);
}

function slotTitle(slot) {
  const h = el('h4', null, slot.name);
  h.appendChild(el('small', null, `dalle ${slot.from} alle ${slot.to}`));
  return h;
}

function renderSlotCard(c, isToday) {
  const card = el('section', 'slot-card');
  const nowHour = parseInt(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', hour12: false, timeZone: 'Europe/Rome' }), 10);
  if (isToday && nowHour >= c.slot.to) card.classList.add('slot-past');

  const head = el('div', 'slot-head');
  const cat = c.category ? weatherCategories[c.category] : null;
  const icon = cat ? (c.slot.name === 'Sera' ? cat.night : cat.icon) : '❔';
  head.append(el('span', 'slot-icon', icon), slotTitle(c.slot));
  if (c.n) head.append(el('span', 'slot-temp', `${Math.round(c.avgTemp)}°`));
  card.appendChild(head);

  const badge = verdictBadges[c.verdict];
  card.appendChild(el('span', `badge ${badge.cls}`, badge.label));
  if (isToday && nowHour >= c.slot.to) card.appendChild(el('span', 'badge badge-nodata', 'già passata'));
  card.appendChild(el('p', 'slot-text', c.text));

  if (c.n) {
    const details = el('details', 'slot-details');
    details.appendChild(el('summary', null, 'Cosa dice ogni modello'));
    const table = el('table');
    const thead = el('tr');
    ['Modello', '', 'Temp.', 'Pioggia', 'Prob.'].forEach(h => thead.appendChild(el('th', null, h)));
    table.appendChild(thead);

    c.results.forEach((r, i) => {
      const row = el('tr');
      const model = forecastModels[i];
      const nameCell = el('td');
      nameCell.append(el('strong', null, model.name), el('small', null, model.origin));
      row.appendChild(nameCell);
      if (!r) {
        const cell = el('td', 'muted', 'nessun dato per questo giorno');
        cell.colSpan = 4;
        row.appendChild(cell);
      } else {
        const rc = weatherCategories[r.category];
        row.append(
          el('td', null, c.slot.name === 'Sera' ? rc.night : rc.icon),
          el('td', null, `${Math.round(r.temp)}°`),
          el('td', null, r.wet ? formatMm(r.rain) : '—'),
          el('td', null, r.prob == null ? '—' : `${r.prob}%`)
        );
      }
      table.appendChild(row);
    });
    details.appendChild(table);
    card.appendChild(details);
  }

  return card;
}

function agentAvatar() {
  const span = el('span', 'agent-avatar');
  span.appendChild(svgIcon('i-agent'));
  return span;
}

let agentRun = 0;

async function runAgent() {
  const result = document.getElementById('agentResult');
  const runId = ++agentRun;
  // Il messaggio di attesa compare solo se serve davvero (i giorni successivi sono già in memoria)
  const loadingTimer = setTimeout(() => {
    if (runId !== agentRun) return;
    result.innerHTML = '';
    result.appendChild(el('p', 'agent-loading', 'Sto confrontando i modelli meteo…'));
  }, 150);

  try {
    const place = await geocodeCity(currentCity);
    if (runId !== agentRun) return;
    clearTimeout(loadingTimer);
    if (!place) {
      result.innerHTML = '';
      result.appendChild(el('p', 'agent-error', `Non trovo "${prettyCity(currentCity)}". Prova a scrivere il nome ufficiale del comune nelle impostazioni ⚙️.`));
      return;
    }
    setAgentCity(place.label);

    const data = await fetchModelForecast(place);
    if (runId !== agentRun) return;
    clearTimeout(loadingTimer);

    const combined = daySlots.map(slot => {
      const results = forecastModels.map(m => summarizeModelSlot(data.hourly, m, slot, agentSelectedDate));
      return { slot, results, ...combineSlot(results) };
    });

    const chip = document.querySelector(`.day-chip[data-date="${agentSelectedDate}"]`);
    const dayLabel = chip ? chip.dataset.label : agentSelectedDate;
    const isToday = agentSelectedDate === localDateString(new Date());

    result.innerHTML = '';
    const summary = el('div', 'agent-summary');
    summary.append(agentAvatar(), el('p', null, daySummary(combined, dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), prettyCity(currentCity))));
    result.appendChild(summary);
    combined.forEach(c => result.appendChild(renderSlotCard(c, isToday)));
  } catch (e) {
    clearTimeout(loadingTimer);
    if (runId !== agentRun) return;
    result.innerHTML = '';
    result.appendChild(el('p', 'agent-error', navigator.onLine === false
      ? 'Sei offline: per la previsione combinata serve la connessione.'
      : 'Non riesco a contattare il servizio meteo. Riprova tra qualche istante.'));
  }
}

document.getElementById('agentBtn').addEventListener('click', () => {
  const todayStr = localDateString(new Date());
  const lastAllowed = localDateString(new Date(Date.now() + (AGENT_DAYS - 1) * 86400000));
  if (!agentSelectedDate || agentSelectedDate < todayStr || agentSelectedDate > lastAllowed) {
    agentSelectedDate = localDateString(new Date(Date.now() + 86400000)); // di default: domani
  }
  setAgentCity(prettyCity(currentCity));
  document.getElementById('agentResult').innerHTML = '';
  renderAgentDays();
  openModal(document.getElementById('agentModal'));
  runAgent();
});

// --- SWIPE TRA I GIORNI ---
// Trascinando il contenuto a sinistra si va al giorno dopo, a destra al giorno prima.
(function setupAgentSwipe() {
  const area = document.getElementById('agentSwipeArea');
  const result = document.getElementById('agentResult');
  let startX = 0, startY = 0, dx = 0, axis = null, tracking = false;

  const chipIndex = () => [...document.querySelectorAll('.day-chip')].findIndex(b => b.dataset.date === agentSelectedDate);

  area.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('table')) return;
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
      selectAgentDay(chipIndex() + (dx < 0 ? 1 : -1));
    }
  };
  area.addEventListener('touchend', end);
  area.addEventListener('touchcancel', end);

  // Da tastiera: frecce sinistra e destra
  document.getElementById('agentModal').addEventListener('keydown', e => {
    if (e.target.matches('input, select')) return;
    if (e.key === 'ArrowRight') selectAgentDay(chipIndex() + 1);
    if (e.key === 'ArrowLeft') selectAgentDay(chipIndex() - 1);
  });
})();

document.getElementById('closeAgentBtn').addEventListener('click', () => {
  closeModal(document.getElementById('agentModal'));
});

document.getElementById('agentModal').addEventListener('click', e => {
  if (e.target.id === 'agentModal') closeModal(e.target);
});

// --- PWA / OFFLINE ---

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => { });
  });
}
