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

const tabs = document.querySelectorAll('.tab-bar button');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const index = parseInt(tab.dataset.index);
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Hide all wrappers, show only selected one (Mobile logic mostly)
    // Note: On desktop flex handles it, but we can toggle display for mobile logic compatibility
    updateResponsiveLayout();
  });
});

function updateResponsiveLayout() {
  const isMobile = window.innerWidth <= 768;
  const activeTab = document.querySelector('.tab-bar button.active');
  const activeIndex = activeTab ? parseInt(activeTab.dataset.index) : 0;

  frames.forEach((f, i) => {
    if (!f.wrapper) return; // Safety check

    if (isMobile) {
      // Mobile: Show only active frame
      f.wrapper.style.display = (i === activeIndex) ? 'block' : 'none';
      f.wrapper.classList.toggle('active', i === activeIndex);
    } else {
      // Desktop: Let CSS handle it (remove inline styles)
      f.wrapper.style.display = '';
      f.wrapper.classList.remove('active');
    }
  });
}

window.addEventListener('resize', updateResponsiveLayout);


// --- SAN VALENTINO & BIRTHDAY ---

function createFloatingHeart(x, y, char = '❤️') {
  const heart = document.createElement('div');
  heart.className = 'heart';
  heart.textContent = char;
  heart.style.left = x + 'px';
  heart.style.top = y + 'px';
  heart.style.fontSize = (Math.random() * 20 + 20) + 'px';
  document.body.appendChild(heart);

  setTimeout(() => heart.remove(), 4000);
}



function checkSpecialHeader() {
  const today = new Date();
  const d = today.getDate();
  const m = today.getMonth() + 1; // 1-12

  // San Valentino (14 Febbraio)
  // Per test: abilitare sempre o decommentare riga sotto
  const isValentine = (d === 14 && m === 2);
  // const isValentine = true; // ABILITATO PER DEMO

  if (isValentine) {
    const vModal = document.getElementById('valentineModal');
    // Check if already shown today? Maybe not requested, assume show on load
    vModal.style.display = 'flex';

    startValentineHearts();

    document.getElementById('closeValentine').onclick = () => {
      vModal.style.display = 'none';
      if (valentineInterval) clearInterval(valentineInterval);
      document.querySelectorAll('.heart').forEach(h => h.remove());
    };
  }

  // Compleanno (13 Gennaio)
  const isBirthday = (d === 13 && m === 1 && today.getFullYear() === 2026);
  if (isBirthday) {
    const bdayModal = document.getElementById('birthdayModal');
    bdayModal.style.display = 'flex';
    // ... (Existing confetti logic calls) ...
    const duration = 15 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10001 };
    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } });
    }, 250);

    document.getElementById('closeBirthday').onclick = () => {
      clearInterval(interval);
      if (typeof confetti.reset === 'function') confetti.reset();
      bdayModal.style.display = 'none';
    };
  }
}

// --- INIT ---

// Fix wrapper references in array if DOM wasn't ready (not needed if script at end of body)
// frames array defined at top is fine.

updateFrames(savedCity);
document.getElementById('cityInput').value = savedCity;
updateVoteButtons();
updateResponsiveLayout();

// Event Listeners
document.getElementById('settings').addEventListener('click', () => {
  renderFavorites();
  renderRanking();
  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal').style.display = 'flex';
});

document.getElementById('resetRanking').addEventListener('click', resetVotes);

document.getElementById('saveCity').addEventListener('click', saveAction);

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
