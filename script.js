const frames = [
  {el: document.getElementById('frame1'), url: 'https://www.3bmeteo.com/meteo/{city}'},
  {el: document.getElementById('frame2'), url: 'https://www.google.com/search?q=meteo+{city}&sca_esv=07cdbffa48f41bdb&igu=1'},
  {el: document.getElementById('frame3'), url: 'https://www.ilmeteo.it/meteo/{city}'}
];

function updateFrames(city){
  frames.forEach(f => f.el.src = f.url.replace('{city}', encodeURIComponent(city)));
}

const savedCity = localStorage.getItem('city') || 'barletta';
updateFrames(savedCity);
document.getElementById('cityInput').value = savedCity;

// MODALE
const modal = document.getElementById('modal');
const cityInput = document.getElementById('cityInput');

document.getElementById('settings').addEventListener('click', () => modal.style.display='flex');
document.getElementById('saveCity').addEventListener('click', () => {
  const city = cityInput.value.trim().toLowerCase();
  if (!city) return;
  localStorage.setItem('city', city);
  updateFrames(city);
  modal.style.display='none';
});
modal.addEventListener('click', e => {
  if (e.target === modal) modal.style.display = 'none';
});
cityInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('saveCity').click();
});

// TAB BAR MOBILE
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

  if (isMobile) {
    // Mostra solo l'iframe del tab attivo
    frames.forEach((f, i) => f.el.style.display = (i === activeIndex) ? 'block' : 'none');
  } else {
    // Mostra tutti gli iframe su desktop
    frames.forEach(f => f.el.style.display = 'block');
  }
}

window.addEventListener('resize', showIframeResponsive);
showIframeResponsive();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js');
}
