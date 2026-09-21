export const PLAYER_NAME_LIMIT = 12;
const STORAGE_KEY = 'pumpoker-player-name';

export function normalizePlayerName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, PLAYER_NAME_LIMIT);
}

export function displayPlayerName(value: unknown): string {
  return normalizePlayerName(value) || 'Tú';
}

export function readPlayerName(): string {
  try { return normalizePlayerName(window.localStorage.getItem(STORAGE_KEY)); }
  catch { return ''; }
}

export function savePlayerName(value: string): void {
  try {
    const name = normalizePlayerName(value);
    if (name) window.localStorage.setItem(STORAGE_KEY, name);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* Storage may be unavailable; the current session still keeps the name. */ }
}
