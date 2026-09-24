export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export function cleanName(value, fallback, max = 24) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return (name || fallback).slice(0, max);
}

export function validateRoomInput(value) {
  if (!value || typeof value !== 'object') throw new Error('Configuración de mesa inválida.');
  const name = cleanName(value.name, 'Mesa de Texas');
  const maxPlayers = Number(value.maxPlayers);
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 9) throw new Error('La mesa admite entre 2 y 9 jugadores.');
  const botCount = value.botCount === undefined ? 0 : Number(value.botCount);
  if (!Number.isInteger(botCount) || botCount < 0 || botCount > 7 || maxPlayers + botCount > 9) throw new Error('Entre personas y bots no puede haber más de 9 asientos.');
  const turnSeconds = value.turnSeconds === undefined ? 15 : Number(value.turnSeconds);
  if (![6, 15, 30].includes(turnSeconds)) throw new Error('El tiempo por turno debe ser 6, 15 o 30 segundos.');
  const isPrivate = value.isPrivate === true;
  const password = typeof value.password === 'string' ? value.password : '';
  if (isPrivate && (password.length < 6 || password.length > 64)) throw new Error('La contraseña debe tener entre 6 y 64 caracteres.');
  return { name, maxPlayers, botCount, turnSeconds, isPrivate, password: isPrivate ? password : '' };
}

export function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    maxPlayers: room.maxPlayers,
    botCount: room.botCount ?? 0,
    turnSeconds: room.turnSeconds ?? 15,
    playerCount: room.players.length,
    isPrivate: room.isPrivate,
    status: room.status,
    updatedAt: room.updatedAt,
  };
}

export function publicSnapshot(room) {
  return {
    ...publicRoom(room),
    hostId: room.hostId,
    players: room.players.map(({ id, name, seat }) => ({ id, name, seat, isBot: false })),
  };
}

export function firstFreeSeat(players, maxPlayers) {
  for (let seat = 0; seat < maxPlayers; seat++) if (!players.some(player => player.seat === seat)) return seat;
  return -1;
}

export async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from(salt.match(/../g) || [], pair => Number.parseInt(pair, 16));
  const bytes = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function sameDigest(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
