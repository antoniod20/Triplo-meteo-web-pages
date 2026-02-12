const frames = [
  {
    id: 'frame1',
    iframe: document.getElementById('frame1'),
    url: 'https://www.3bmeteo.com/meteo/{city}'
  },
  {
    id: 'frame2',
    iframe: document.getElementById('frame2'),
    url: 'https://www.google.com/search?q=meteo+{city}&sca_esv=07cdbffa48f41bdb&igu=1'
  },
  {
    id: 'frame3',
    iframe: document.getElementById('frame3'),
    url: 'https://www.ilmeteo.it/meteo/{city}'
  }
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
    // Mapping IDs to friendly names
    const names = { frame1: '3BMeteo', frame2: 'Google', frame3: 'IlMeteo' };
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

// --- TAB BAR & RESPONSIVE ---

// --- TAB BAR & RESPONSIVE ---

const tabs = document.querySelectorAll('.tab-bar button');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const index = parseInt(tab.dataset.index);
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    updateResponsiveLayout();
  });
});

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

window.addEventListener('resize', updateResponsiveLayout);

// ... (Rest of code)

// Event Listeners
document.getElementById('settings').addEventListener('click', () => {
  renderFavorites();
  renderRanking();
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal').style.display = 'flex';
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

checkSpecialHeader();
