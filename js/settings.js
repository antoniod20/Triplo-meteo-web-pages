// Pagina principale e pannello impostazioni: fonti, città, preferiti, voti, condivisione, vista completa.

import { $, el, svgIcon, openModal, closeModal, closeOnBackdrop } from './dom.js';
import { loadJSON, saveJSON } from './storage.js';
import { normalizeText, prettyCity } from './text.js';
import { availableProviders, providerUrl, sanitizeProviders } from './providers.js';
import { getComuni } from './comuni.js';
import { state } from './state.js';

const emptyVotes = () => ({
  frame1: { count: 0, lastDate: null },
  frame2: { count: 0, lastDate: null },
  frame3: { count: 0, lastDate: null }
});

const userProviders = sanitizeProviders(loadJSON('userProviders', null));

const frames = userProviders.map((key, i) => {
  const iframe = $(`frame${i + 1}`);
  const wrapper = iframe.closest('.frame-wrapper') || iframe.parentElement;
  const provider = availableProviders[key];
  iframe.title = provider.name;
  return { id: `frame${i + 1}`, iframe, wrapper, provider, openLink: wrapper.querySelector('.open-btn') };
});

let favorites = loadJSON('favorites', ['bari', 'roma', 'napoli']);
if (!Array.isArray(favorites)) favorites = ['bari', 'roma', 'napoli'];
favorites = favorites.filter(f => typeof f === 'string');

// Struttura: { frame1: { count: 0, lastDate: '2026-10-27' }, ... }
let votes = loadJSON('votes', emptyVotes());
if (typeof votes !== 'object' || Array.isArray(votes)) votes = emptyVotes();

let votingEnabled = loadJSON('votingEnabled', true) !== false;

const todayIso = () => new Date().toISOString().split('T')[0];

// --- IFRAME ---

export function updateFrames(city) {
  state.currentCity = city;
  frames.forEach(f => {
    const url = providerUrl(f.provider, city);
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

// --- PREFERITI ---

function renderFavorites() {
  const container = $('favoritesContainer');
  container.innerHTML = '';

  favorites.forEach(fav => {
    const chip = el('span', 'fav-chip');

    const btn = el('button', 'fav-btn', prettyCity(fav));
    btn.type = 'button';
    btn.onclick = () => {
      $('cityInput').value = fav;
      saveAction();
    };

    const del = el('button', 'fav-del');
    del.type = 'button';
    del.appendChild(svgIcon('i-close'));
    del.setAttribute('aria-label', `Rimuovi ${prettyCity(fav)} dai preferiti`);
    del.onclick = () => {
      favorites = favorites.filter(f => f !== fav);
      saveJSON('favorites', favorites);
      renderFavorites();
      const next = container.querySelector('.fav-btn') || $('cityInput');
      next.focus();
    };

    chip.append(btn, del);
    container.appendChild(chip);
  });

  if (favorites.length === 0) {
    container.appendChild(el('span', 'fav-empty', 'Nessun preferito: cerca una città qui sopra.'));
  }
}

function saveAction() {
  const city = $('cityInput').value.trim().toLowerCase();
  if (!city) return;

  if (!favorites.includes(city)) {
    favorites.push(city);
    if (favorites.length > 3) favorites.shift();
    saveJSON('favorites', favorites);
  }

  try { localStorage.setItem('city', city); } catch (e) { }
  updateFrames(city);
  closeModal($('modal'));
}

// --- SUGGERIMENTI CITTÀ ---
// La lista è disegnata da noi perché il <datalist> nativo non funziona su molti browser mobili.

let comuni = [];
let suggestionIndex = -1;

function hideSuggestions() {
  const list = $('citySuggestions');
  list.hidden = true;
  list.innerHTML = '';
  suggestionIndex = -1;
  $('cityInput').setAttribute('aria-expanded', 'false');
  $('cityInput').removeAttribute('aria-activedescendant');
}

function showSuggestions() {
  const input = $('cityInput');
  const list = $('citySuggestions');
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
    const li = el('li');
    li.id = `suggestion-${i}`;
    li.setAttribute('role', 'option');
    li.dataset.name = c.name;
    li.append(el('span', null, c.name), el('span', 'sigla', c.sigla));

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
  $('cityInput').setAttribute('aria-activedescendant', items[suggestionIndex].id);
}

function chooseSuggestion(name) {
  $('cityInput').value = name;
  hideSuggestions();
  saveAction();
}

// --- VOTI ---

function setVoteButtonState(btn, voted) {
  const frame = frames.find(f => f.id === btn.dataset.frame);
  const name = frame ? frame.provider.name : 'questa fonte';
  btn.classList.toggle('voted', voted);
  btn.setAttribute('aria-pressed', String(voted));
  btn.setAttribute('aria-label', voted ? `Togli il voto di oggi a ${name}` : `Vota ${name} per oggi`);
}

function updateVoteButtons() {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const v = votes[btn.dataset.frame];
    setVoteButtonState(btn, Boolean(v && v.lastDate === todayIso()));
  });
}

// Piccola animazione della stellina che sale dal pulsante di voto
function floatingStar(x, y) {
  const star = el('span', 'heart star', '⭐');
  star.style.left = `${x}px`;
  star.style.top = `${y}px`;
  document.body.appendChild(star);
  star.addEventListener('animationend', () => star.remove());
}

function handleVote(frameId, btn) {
  const data = votes[frameId] || { count: 0, lastDate: null };

  if (data.lastDate === todayIso()) {
    // Toglie il voto di oggi
    data.count = Math.max(0, data.count - 1);
    data.lastDate = null;
    setVoteButtonState(btn, false);
  } else {
    data.count++;
    data.lastDate = todayIso();
    setVoteButtonState(btn, true);
    const rect = btn.getBoundingClientRect();
    floatingStar(rect.left + rect.width / 2, rect.top);
  }

  votes[frameId] = data;
  saveJSON('votes', votes);
}

function renderRanking() {
  const container = $('rankingContainer');
  container.innerHTML = '';

  const names = Object.fromEntries(frames.map(f => [f.id, f.provider.name]));
  const medals = ['🥇', '🥈', '🥉'];

  Object.entries(votes)
    .map(([id, data]) => ({ id, count: Number(data.count) || 0 }))
    .sort((a, b) => b.count - a.count)
    .forEach((item, index) => {
      const row = el('div', 'ranking-item');
      const nameSpan = el('span');
      nameSpan.append(medals[index] ? `${medals[index]} ` : '', el('strong', null, names[item.id] || item.id));
      row.append(nameSpan, el('span', null, `${item.count} ⭐`));
      container.appendChild(row);
    });
}

function resetVotes() {
  if (!confirm('Sei sicuro di voler azzerare la classifica?')) return;
  votes = emptyVotes();
  saveJSON('votes', votes);
  renderRanking();
  updateVoteButtons();
}

function updateVotingMode() {
  $('voteToggle').checked = votingEnabled;
  $('rankingSection').style.display = votingEnabled ? 'block' : 'none';
  document.body.classList.toggle('voting-off', !votingEnabled);
}

// --- TAB BAR E LAYOUT ---

function renderTabButtons() {
  const tabBar = document.querySelector('.tab-bar');
  tabBar.innerHTML = '';

  userProviders.forEach((key, index) => {
    const btn = el('button', index === 0 ? 'active' : '', availableProviders[key].name);
    btn.type = 'button';
    btn.dataset.index = index;
    btn.setAttribute('aria-pressed', String(index === 0));

    btn.addEventListener('click', () => {
      tabBar.querySelectorAll('button').forEach(t => {
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

function updateResponsiveLayout() {
  const isMobile = window.innerWidth <= 768;
  const activeTab = document.querySelector('.tab-bar button.active');
  const activeIndex = activeTab ? parseInt(activeTab.dataset.index, 10) : 0;

  frames.forEach((f, i) => {
    // Su desktop o in vista completa si vedono tutte; su mobile solo quella scelta
    const visible = !isMobile || isFullView() || i === activeIndex;
    f.wrapper.style.display = visible ? 'block' : 'none';
    f.wrapper.classList.toggle('active', isMobile && !isFullView() && i === activeIndex);
  });
}

export function isFullView() {
  return document.body.classList.contains('full-view');
}

// Il viewport largo è l'unico modo per far stare le tre fonti affiancate su mobile
export function toggleFullView() {
  document.body.classList.toggle('full-view');
  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (isFullView()) {
    viewportMeta.content = 'width=1200';
    closeModal($('modal'));
    $('closeFullViewBtn').style.display = 'block';
  } else {
    viewportMeta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    $('closeFullViewBtn').style.display = 'none';
  }
  updateResponsiveLayout();
}

// --- CONDIVIDI ---

async function shareCity() {
  const feedback = $('shareFeedback');
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('citta', state.currentCity);
  const link = url.toString();

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Tripolemme', text: `Meteo di ${prettyCity(state.currentCity)}`, url: link });
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

// --- PERSONALIZZA FONTI ---

function populateProvidersModal() {
  ['slot1', 'slot2', 'slot3'].forEach((id, i) => {
    const select = $(id);
    select.innerHTML = '';
    Object.entries(availableProviders).forEach(([key, provider]) => {
      const option = el('option', null, provider.name);
      option.value = key;
      option.selected = userProviders[i] === key;
      select.appendChild(option);
    });
  });
}

function saveProviders() {
  const chosen = ['slot1', 'slot2', 'slot3'].map(id => $(id).value);
  if (new Set(chosen).size !== chosen.length) {
    alert('Attenzione: hai selezionato lo stesso meteo più volte. Scegli fonti diverse per ogni posto!');
    return;
  }
  saveJSON('userProviders', chosen);
  saveJSON('votes', emptyVotes()); // la classifica riguarda le fonti precedenti
  location.reload();
}

// --- AVVIO ---

export function initSettings() {
  renderTabButtons();
  updateFrames(state.currentCity);
  $('cityInput').value = state.currentCity;
  updateVoteButtons();
  updateVotingMode();
  updateResponsiveLayout();

  window.addEventListener('load', updateResponsiveLayout);
  window.addEventListener('resize', updateResponsiveLayout);

  $('settings').addEventListener('click', () => {
    renderFavorites();
    renderRanking();
    getComuni().then(list => { comuni = list; });
    $('shareFeedback').textContent = '';
    $('cityInput').value = state.currentCity;
    $('voteToggle').checked = votingEnabled;
    openModal($('modal'));
  });
  $('closeSettingsBtn').addEventListener('click', () => closeModal($('modal')));
  closeOnBackdrop($('modal'));

  $('voteToggle').addEventListener('change', e => {
    votingEnabled = e.target.checked;
    saveJSON('votingEnabled', votingEnabled);
    updateVotingMode();
  });
  $('resetRanking').addEventListener('click', resetVotes);
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      handleVote(btn.dataset.frame, btn);
    });
  });

  $('saveCity').addEventListener('click', saveAction);
  $('shareBtn').addEventListener('click', shareCity);
  $('fullViewBtn').addEventListener('click', toggleFullView);
  $('closeFullViewBtn').addEventListener('click', toggleFullView);

  $('manageProvidersBtn').addEventListener('click', () => {
    populateProvidersModal();
    closeModal($('modal'));
    openModal($('providersModal'));
  });
  $('closeProvidersModalBtn').addEventListener('click', () => closeModal($('providersModal')));
  closeOnBackdrop($('providersModal'));
  $('saveProvidersSetupBtn').addEventListener('click', saveProviders);

  const cityInput = $('cityInput');
  cityInput.addEventListener('input', showSuggestions);
  // Toccando il campo si seleziona la città attuale, così si scrive subito quella nuova
  cityInput.addEventListener('focus', () => cityInput.select());
  cityInput.addEventListener('blur', hideSuggestions);
  cityInput.addEventListener('keydown', e => {
    const listOpen = !$('citySuggestions').hidden;

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
}
