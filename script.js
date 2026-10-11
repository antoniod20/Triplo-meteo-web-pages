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
    del.textContent = '✕';
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
  btn.textContent = voted ? '🌟' : '⭐';
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
  const open = ['providersModal', 'modal']
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

// --- PWA / OFFLINE ---

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => { });
  });
}
