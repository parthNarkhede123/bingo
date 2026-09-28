// Thin REST client for the Ironhold backend. Reads the base URL from Vite env
// and attaches the stored JWT to authenticated requests.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('ironhold_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? authHeaders() : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }
  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

const enc = encodeURIComponent;

export const api = {
  // --- auth ---
  register: (username, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, email, password } }),
  login: (identifier, password) =>
    request('/api/auth/login', { method: 'POST', body: { identifier, password } }),
  me: () => request('/api/auth/me', { auth: true }),
  forgotPassword: (identifier) =>
    request('/api/auth/forgot-password', { method: 'POST', body: { identifier } }),
  resetPassword: (token, password) =>
    request('/api/auth/reset-password', { method: 'POST', body: { token, password } }),

  // --- leaderboard / profiles ---
  leaderboard: (limit = 50) => request(`/api/leaderboard?limit=${limit}`),
  player: (username) => request(`/api/leaderboard/player/${enc(username)}`),

  // --- hold (your Keep) ---
  getHold: () => request('/api/hold', { auth: true }),
  harvest: () => request('/api/hold/harvest', { method: 'POST', auth: true }),
  setStance: (stance) => request('/api/hold/loadout', { method: 'POST', auth: true, body: { stance } }),
  setAutoLoadout: (enabled) => request('/api/hold/auto-loadout', { method: 'POST', auth: true, body: { enabled } }),
  spendSkill: (skill) => request('/api/hold/skill', { method: 'POST', auth: true, body: { skill } }),
  upgrade: () => request('/api/hold/upgrade', { method: 'POST', auth: true }),

  // --- gear / chests / crafting ---
  openChest: (grade) => request(`/api/chests/${enc(grade)}/open`, { method: 'POST', auth: true }),
  equipGear: (id) => request(`/api/gear/${enc(id)}/equip`, { method: 'POST', auth: true }),
  salvageGear: (id) => request(`/api/gear/${enc(id)}/salvage`, { method: 'POST', auth: true }),
  craft: (tier, stance) => request('/api/craft', { method: 'POST', auth: true, body: { tier, stance } }),

  // --- marches (attack / mine / scout) + reports ---
  march: ({ intent, target, troops }) =>
    request('/api/march', { method: 'POST', auth: true, body: { intent, target, troops } }),
  scout: (target) => request('/api/scout', { method: 'POST', auth: true, body: { target } }),
  reports: () => request('/api/reports', { auth: true }),

  // --- trade: offers + pacts ---
  offers: (limit = 50) => request(`/api/trade/offers?limit=${limit}`, { auth: true }),
  createOffer: (body) => request('/api/trade/offers', { method: 'POST', auth: true, body }),
  cancelOffer: (id) => request(`/api/trade/offers/${enc(id)}/cancel`, { method: 'POST', auth: true }),
  acceptOffer: (id) => request(`/api/trade/offers/${enc(id)}/accept`, { method: 'POST', auth: true }),
  pacts: () => request('/api/trade/pacts', { auth: true }),
  createPact: (targetUsername) => request('/api/trade/pacts', { method: 'POST', auth: true, body: { targetUsername } }),
  breakPact: (id) => request(`/api/trade/pacts/${enc(id)}/break`, { method: 'POST', auth: true }),

  // --- economy: commanders, ads, quests, map ---
  recruit: (name) => request(`/api/commanders/${enc(name)}/recruit`, { method: 'POST', auth: true }),
  adReward: () => request('/api/ads/reward', { method: 'POST', auth: true }),
  quests: () => request('/api/quests', { auth: true }),
  claimQuest: (id) => request(`/api/quests/${enc(id)}/claim`, { method: 'POST', auth: true }),
  map: (radius = 40) => request(`/api/map?radius=${radius}`, { auth: true }),
};

export { API_URL };
