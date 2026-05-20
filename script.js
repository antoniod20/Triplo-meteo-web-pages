const availableProviders = {
  '3bmeteo': { name: '3BMeteo', url: 'https://www.3bmeteo.com/meteo/{city}' },
  'google': { name: 'Google', url: 'https://www.google.com/search?q=meteo+{city}&sca_esv=07cdbffa48f41bdb&igu=1' },
  'ilmeteo': { name: 'IlMeteo', url: 'https://www.ilmeteo.it/meteo/{city}' },
  'meteoeradar': { name: 'Meteo & Radar', url: 'https://www.meteoeradar.it/pagina-meteo/{city}' },
  'meteogiuliacci': { name: 'Giuliacci', url: 'https://www.meteogiuliacci.it/meteo/{city}' },
  'meteoam': { name: 'MeteoAM', url: 'https://www.meteoam.it/it/meteo-citta/{city}' }
};

let userProviders = JSON.parse(localStorage.getItem('userProviders')) || ['3bmeteo', 'google', 'ilmeteo'];

const frames = [
  { id: 'frame1', iframe: document.getElementById('frame1'), url: availableProviders[userProviders[0]]?.url || availableProviders['3bmeteo'].url },
  { id: 'frame2', iframe: document.getElementById('frame2'), url: availableProviders[userProviders[1]]?.url || availableProviders['google'].url },
  { id: 'frame3', iframe: document.getElementById('frame3'), url: availableProviders[userProviders[2]]?.url || availableProviders['ilmeteo'].url }
];

// Add wrapper reference dynamically
frames.forEach(f => {
  if (f.iframe) {
    f.wrapper = f.iframe.closest('.frame-wrapper') || f.iframe.parentElement;
  }
});

// --- GESTIONE DATI ---
let savedCity = localStorage.getItem('city') || 'barletta';
let favorites = JSON.parse(localStorage.getItem('favorites')) || ['bari', 'roma', 'napoli'];
// Votes structure: { frame1: { count: 0, lastDate: '2023-10-27' }, ... }
let votes = JSON.parse(localStorage.getItem('votes')) || {
  frame1: { count: 0, lastDate: null },
  frame2: { count: 0, lastDate: null },
  frame3: { count: 0, lastDate: null }
};

let votingEnabled = localStorage.getItem('votingEnabled') !== 'false'; // Default true



// --- FUNZIONI CORE ---

function updateFrames(city) {
  frames.forEach(f => {
    if (f.iframe) f.iframe.src = f.url.replace('{city}', encodeURIComponent(city));
  });
}

function renderFavorites() {
  const container = document.getElementById('favoritesContainer');
  if (!container) return;
  container.innerHTML = '';

  favorites.forEach(fav => {
    const btn = document.createElement('button');
    btn.textContent = fav.charAt(0).toUpperCase() + fav.slice(1);
    btn.className = 'fav-btn';
    btn.onclick = () => {
      document.getElementById('cityInput').value = fav;
      saveAction();
    };
    container.appendChild(btn);
  });
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

    div.innerHTML = `
      <span>${medal} <strong>${names[item.id]}</strong></span>
      <span>${item.count} ⭐</span>
    `;
    container.appendChild(div);
  });
}

function saveAction() {
  const city = document.getElementById('cityInput').value.trim().toLowerCase();
  if (!city) return;

  if (!favorites.includes(city)) {
    favorites.push(city);
    if (favorites.length > 3) favorites.shift();
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }

  localStorage.setItem('city', city);
  updateFrames(city);
  document.getElementById('modal').style.display = 'none';
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
    btnElement.classList.remove('voted');
    btnElement.textContent = '⭐';
  } else {
    // Add vote
    frameData.count++;
    frameData.lastDate = today;
    votes[frameId] = frameData;
    localStorage.setItem('votes', JSON.stringify(votes));

    // Visual feedback (vote)
    btnElement.classList.add('voted');
    btnElement.textContent = '🌟';

    // Animation effect
    const rect = btnElement.getBoundingClientRect();
    createFloatingHeart(rect.left + rect.width / 2, rect.top, '⭐');
  }
}

let valentineInterval;

function startValentineHearts() {
  if (valentineInterval) clearInterval(valentineInterval);

  valentineInterval = setInterval(() => {
    if (document.getElementById('valentineModal').style.display === 'flex') {
      createFloatingHeart(Math.random() * window.innerWidth, window.innerHeight);
    }
  }, 300);
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



function updateVoteButtons() {
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('.vote-btn').forEach(btn => {
    const fid = btn.dataset.frame;
    if (votes[fid] && votes[fid].lastDate === today) {
      btn.classList.add('voted');
      btn.textContent = '🌟';
    } else {
      btn.classList.remove('voted');
      btn.textContent = '⭐';
    }
  });
}


function updateVotingModeInternal() {
  const toggle = document.getElementById('voteToggle');
  const rankingSection = document.getElementById('rankingSection');
  const voteBtns = document.querySelectorAll('.vote-btn');

  if (toggle) toggle.checked = votingEnabled;

  if (votingEnabled) {
    if (rankingSection) rankingSection.style.display = 'block';
    voteBtns.forEach(btn => btn.style.display = 'flex');
  } else {
    if (rankingSection) rankingSection.style.display = 'none';
    voteBtns.forEach(btn => btn.style.display = 'none');
  }
}

// --- TAB BAR & RESPONSIVE ---

// --- TAB BAR & RESPONSIVE ---

function renderTabButtons() {
  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return;
  tabBar.innerHTML = '';

  userProviders.forEach((provKey, index) => {
    const btn = document.createElement('button');
    btn.dataset.index = index;
    if (index === 0) btn.classList.add('active');
    btn.textContent = availableProviders[provKey]?.name || 'Meteo';

    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-bar button').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
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
  // Optional: Manipulate viewport if needed, or just let CSS do it.
  // The user wants to see all frames side-by-side. 
  // Let's use the viewport trick again as it was the only way to fit them on mobile.

  const viewportMeta = document.querySelector('meta[name="viewport"]');
  if (isFull) {
    if (viewportMeta) viewportMeta.content = "width=1200";
    document.getElementById('modal').style.display = 'none';
    document.getElementById('closeFullViewBtn').style.display = 'block';
  } else {
    if (viewportMeta) viewportMeta.content = "width=device-width, initial-scale=1.0";
    document.getElementById('closeFullViewBtn').style.display = 'none';
  }
  updateResponsiveLayout();
}

// --- INIT ---

document.addEventListener('DOMContentLoaded', () => {
  // Ensure wrappers are found if not already
  frames.forEach(f => {
    if (f.iframe && !f.wrapper) {
      f.wrapper = f.iframe.closest('.frame-wrapper') || f.iframe.parentElement;
    }
  });

  updateFrames(savedCity);
  document.getElementById('cityInput').value = savedCity;
  updateVoteButtons();
  updateVotingModeInternal();
  updateResponsiveLayout();
});

// Double check layout after full load (fixes potential mobile viewport issues)
window.addEventListener('load', updateResponsiveLayout);

window.addEventListener('resize', updateResponsiveLayout);

// ... (Rest of code)

// Event Listeners

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
  document.getElementById('modal').style.display = 'none'; // Close settings modal
  document.getElementById('providersModal').style.display = 'flex';
});

document.getElementById('closeProvidersModalBtn').addEventListener('click', () => {
  document.getElementById('providersModal').style.display = 'none';
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
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal').style.display = 'flex';
  // Re-sync switch state when opening modal
  const toggle = document.getElementById('voteToggle');
  if (toggle) toggle.checked = votingEnabled;
});

document.getElementById('voteToggle').addEventListener('change', (e) => {
  votingEnabled = e.target.checked;
  localStorage.setItem('votingEnabled', votingEnabled);
  updateVotingModeInternal();
});

document.getElementById('resetRanking').addEventListener('click', resetVotes);

document.getElementById('saveCity').addEventListener('click', saveAction);

document.getElementById('fullViewBtn').addEventListener('click', toggleFullView);
document.getElementById('closeFullViewBtn').addEventListener('click', toggleFullView);

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') document.getElementById('modal').style.display = 'none';
});

document.getElementById('cityInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveAction();
});

// Vote buttons
document.querySelectorAll('.vote-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent propagation if any
    const fid = btn.dataset.frame;
    handleVote(fid, btn);
  });
});


