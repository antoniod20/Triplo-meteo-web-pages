const frames = [
  {el: document.getElementById('frame1'), url: 'https://www.3bmeteo.com/meteo/{city}'},
  {el: document.getElementById('frame2'), url: 'https://www.google.com/search?q=meteo+{city}&sca_esv=07cdbffa48f41bdb&igu=1'},
  {el: document.getElementById('frame3'), url: 'https://www.ilmeteo.it/meteo/{city}'}
];

// Gestione dati
let savedCity = localStorage.getItem('city') || 'barletta';
let favorites = JSON.parse(localStorage.getItem('favorites')) || ['bari', 'roma', 'napoli'];

function updateFrames(city){
  frames.forEach(f => {
    if(f.el) f.el.src = f.url.replace('{city}', encodeURIComponent(city));
  });
}

function renderFavorites() {
  const container = document.getElementById('favoritesContainer');
  if (!container) return;
  container.innerHTML = '';
  
  favorites.forEach(fav => {
    const btn = document.createElement('button');
    btn.textContent = fav.charAt(0).toUpperCase() + fav.slice(1);
    btn.className = 'fav-btn'; // <--- AGGIUNGI QUESTA RIGA
    btn.onclick = () => {
      document.getElementById('cityInput').value = fav;
      saveAction();
    };
    container.appendChild(btn);
  });
}

function saveAction() {
  const city = document.getElementById('cityInput').value.trim().toLowerCase();
  if (!city) return;

  // Aggiunge ai preferiti se non c'è
  if (!favorites.includes(city)) {
    favorites.push(city);
    if (favorites.length > 3) favorites.shift();
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }

  localStorage.setItem('city', city);
  updateFrames(city);
  document.getElementById('modal').style.display = 'none';
}

// Avvio
updateFrames(savedCity);
document.getElementById('cityInput').value = savedCity;

// Eventi
document.getElementById('settings').addEventListener('click', () => {
  renderFavorites();
  document.getElementById('modal').style.display = 'flex';
});

document.getElementById('saveCity').addEventListener('click', saveAction);

document.getElementById('modal').addEventListener('click', e => {
  if (e.target.id === 'modal') document.getElementById('modal').style.display = 'none';
});

document.getElementById('cityInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveAction();
});

// --- LOGICA TAB BAR (Mantenuta uguale alla tua) ---
const tabs = document.querySelectorAll('.tab-bar button');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const index = parseInt(tab.dataset.index);
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    frames.forEach((f, i) => f.el.style.display = (i === index) ? 'block' : 'none');
  });
});

function showIframeResponsive() {
  const isMobile = window.innerWidth <= 768;
  const activeTab = document.querySelector('.tab-bar button.active');
  const activeIndex = activeTab ? parseInt(activeTab.dataset.index) : 0;
  frames.forEach((f, i) => {
    f.el.style.display = (isMobile ? (i === activeIndex) : true) ? 'block' : 'none';
  });
}
window.addEventListener('resize', showIframeResponsive);
showIframeResponsive();

function checkBirthday() {
  const today = new Date();
  const isBirthday = today.getDate() === 13 && 
                     (today.getMonth() + 1) === 1 && 
                     today.getFullYear() === 2026;

  if (isBirthday) {
    const bdayModal = document.getElementById('birthdayModal');
    bdayModal.style.display = 'flex';

    const duration = 15 * 1000; // Aumentata a 15 secondi (o finché non clicchi)
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10001 };

    // Salviamo l'intervallo in una variabile per poterlo fermare
    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } });
    }, 250);

    // Gestione chiusura e stop coriandoli
    document.getElementById('closeBirthday').onclick = () => {
      // 1. Ferma la generazione di nuovi coriandoli
      clearInterval(interval);
      
      // 2. Rimuove i coriandoli ancora presenti a schermo
      if (typeof confetti.reset === 'function') {
        confetti.reset();
      }

      // 3. Nasconde la modale
      bdayModal.style.display = 'none';
    };
  }
}

// Avvia il controllo all'apertura
checkBirthday();