export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
import { validStartingBlinds } from '../src/poker/levels.ts';

export function cleanName(value, fallback, max = 24) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return (name || fallback).slice(0, max);
}

export function requiredPlayerName(value) {
  const name = cleanName(value, '', 12).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (name.length < 2) throw new Error('Escribe un nombre de al menos 2 caracteres para entrar.');
  if (/^bot(?:\s|$)/i.test(name)) throw new Error('El nombre «Bot» está reservado para los bots.');
  return name;
}

export function registrationClosed(room) {
  return room.mode === 'tournament' && (room.tournamentStartedAt > 0 || !!room.game || room.status !== 'waiting');
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
  const mode = value.mode === undefined ? 'normal' : value.mode;
  if (!['normal', 'tournament'].includes(mode)) throw new Error('Modalidad inválida.');
  const chips = value.chips === undefined ? 10_000 : Number(value.chips);
  const small = value.small === undefined ? 50 : Number(value.small);
  const big = value.big === undefined ? 100 : Number(value.big);
  const minutes = value.minutes === undefined ? 10 : Number(value.minutes);
  const growing = mode === 'tournament' || value.growing === true;
  const breaks = mode === 'tournament' && value.breaks === true;
  const every = value.every === undefined ? 3 : Number(value.every);
  const rest = value.rest === undefined ? 5 : Number(value.rest);
  if (!Number.isSafeInteger(chips) || chips < 100 || chips > 1_000_000) throw new Error('Las fichas iniciales deben estar entre 100 y 1.000.000.');
  if (!validStartingBlinds(small, big) || big > chips) throw new Error('Las ciegas deben guardar la proporción correcta y no superar las fichas iniciales.');
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 120) throw new Error('Los minutos por nivel deben estar entre 1 y 120.');
  if (!Number.isSafeInteger(every) || every < 1 || every > 50 || !Number.isSafeInteger(rest) || rest < 1 || rest > 60) throw new Error('Configuración de descansos inválida.');
  const isPrivate = value.isPrivate === true;
  const password = typeof value.password === 'string' ? value.password : '';
  if (isPrivate && (password.length < 6 || password.length > 64)) throw new Error('La contraseña debe tener entre 6 y 64 caracteres.');
  return { name, maxPlayers, botCount, turnSeconds, mode, chips, small, big, minutes, growing, breaks, every, rest, isPrivate, password: isPrivate ? password : '' };
}

export function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    maxPlayers: room.maxPlayers,
    botCount: room.botCount ?? 0,
    turnSeconds: room.turnSeconds ?? 15,
    mode: room.mode ?? 'normal', chips: room.chips ?? 10_000, small: room.small ?? 50, big: room.big ?? 100,
    minutes: room.minutes ?? 10, growing: room.growing ?? false, breaks: room.breaks ?? false,
    every: room.every ?? 3, rest: room.rest ?? 5,
    playerCount: room.players.length,
    spectatorCount: (room.spectators || []).length,
    isPrivate: room.isPrivate,
    status: room.status,
    joinLocked: room.joinLocked === true,
    registrationClosed: registrationClosed(room),
    updatedAt: room.updatedAt,
  };
}

export function publicSnapshot(room) {
  return {
    ...publicRoom(room),
    hostId: room.hostId,
    tournamentId: room.tournamentId || 1,
    winnerName: room.winnerName || null,
    rematch: room.rematch ? { deadline: room.rematch.deadline, accepted: [...room.rematch.accepted], insufficient: room.rematch.insufficient === true } : null,
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
