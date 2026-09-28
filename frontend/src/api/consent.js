// Minimal cookie/ads consent store. Consent gates whether the Google AdSense
// script is allowed to load, so ads never load before the user agrees.
//
// This is a good-faith baseline. For large-scale EEA/UK traffic, Google
// requires a certified Consent Management Platform (CMP); see docs/SECURITY.md
// and the deployment guide.

const KEY = 'ironhold_consent'; // 'granted' | 'denied' | null (undecided)

export function getConsent() {
  try {
    return localStorage.getItem(KEY);
  } catch (_) {
    return null;
  }
}

export function setConsent(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch (_) {
    /* storage unavailable; consent simply won't persist */
  }
  // Let Ad slots react without a full reload.
  window.dispatchEvent(new CustomEvent('ironhold-consent', { detail: value }));
}

export function hasAdConsent() {
  return getConsent() === 'granted';
}
