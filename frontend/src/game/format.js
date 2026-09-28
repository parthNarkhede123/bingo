// Small formatting helpers shared across the game UI.

// "1h 12m", "4m 30s", "12s", or "ready" for a future timestamp vs now.
export function countdown(target, now = Date.now()) {
  const ms = new Date(target).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return 'ready';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Compact "3d", "5h", "12m ago"-style age for reports/pacts.
export function ago(ts, now = Date.now()) {
  const ms = now - new Date(ts).getTime();
  if (!Number.isFinite(ms)) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const num = (n) => Math.round(n || 0).toLocaleString();
