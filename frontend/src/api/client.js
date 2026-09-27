// Thin REST client for the backend API. Reads the base URL from Vite env and
// attaches the stored JWT to authenticated requests.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function authHeaders() {
  const token = localStorage.getItem('bingo_token');
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

export const api = {
  register: (username, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, email, password } }),
  login: (identifier, password) =>
    request('/api/auth/login', { method: 'POST', body: { identifier, password } }),
  me: () => request('/api/auth/me', { auth: true }),
  leaderboard: (limit = 50) => request(`/api/leaderboard?limit=${limit}`),
  player: (username) => request(`/api/leaderboard/player/${encodeURIComponent(username)}`),
};

export { API_URL };
