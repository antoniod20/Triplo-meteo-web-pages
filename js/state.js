// Stato condiviso tra impostazioni e agente.

// Un link condiviso (?citta=...) ha la precedenza sulla città salvata, senza sovrascriverla
const sharedCity = new URLSearchParams(location.search).get('citta');

function savedCity() {
  try {
    return localStorage.getItem('city');
  } catch (e) {
    return null;
  }
}

export const state = {
  currentCity: (sharedCity && sharedCity.trim().toLowerCase()) || savedCity() || 'barletta'
};
