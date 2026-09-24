import { DurableObject } from 'cloudflare:workers';
import { ROOM_TTL_MS, firstFreeSeat, passwordDigest, publicRoom, publicSnapshot, registrationClosed, requiredPlayerName, sameDigest, validateRoomInput } from './room-core.mjs';
import { beginHand, canBegin, applyPlayerAction, forfeitPlayer, advanceExpiredTurn, publicGame, voteRematch, resolveRematch } from './game.mjs';
import { randomInt } from '../src/poker/deck.ts';
import { BOT_PROFILES } from '../src/poker/botProfiles.ts';

const DIRECTORY_ID = 'texas-rooms-v1';
const ROOM_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const RECONNECT_MS = 5 * 60 * 1000;
const MAX_SPECTATORS = 24;

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const error = (message, status = 400) => json({ error: message }, status);
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
const inviteCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), byte => byte.toString(32).toUpperCase().padStart(2, '0')).join('');
const directory = env => env.TEXAS_DIRECTORY.get(env.TEXAS_DIRECTORY.idFromName(DIRECTORY_ID));
const roomStub = (env, id) => env.TEXAS_ROOMS.get(env.TEXAS_ROOMS.idFromName(id));

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > 2048) throw new Error('Solicitud demasiado grande.');
  try { return JSON.parse(raw); } catch { throw new Error('Datos JSON inválidos.'); }
}

async function internalFetch(stub, path, method = 'GET', value) {
  return stub.fetch(new Request(`https://internal${path}`, {
    method,
    headers: value === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: value === undefined ? undefined : JSON.stringify(value),
  }));
}

export class TexasDirectory extends DurableObject {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/list' && request.method === 'GET') {
      const rooms = (await this.ctx.storage.get('rooms')) || {};
      return json(Object.values(rooms).filter(room => ['waiting', 'playing'].includes(room.status) && Date.now() - room.updatedAt < ROOM_TTL_MS)
        .sort((left, right) => right.updatedAt - left.updatedAt));
    }
    if (path === '/create' && request.method === 'POST') {
      try {
        const input = await readBody(request);
        const config = validateRoomInput(input);
        const playerName = requiredPlayerName(input.playerName);
        return await this.ctx.blockConcurrencyWhile(async () => {
          const rooms = (await this.ctx.storage.get('rooms')) || {};
          for (const [id, room] of Object.entries(rooms)) {
            if (!['waiting', 'playing'].includes(room.status) || Date.now() - room.updatedAt >= ROOM_TTL_MS) delete rooms[id];
          }
          const active = Object.values(rooms);
          if (active.length >= 500) return error('Hay demasiadas mesas activas. Inténtalo más tarde.', 503);
          const id = crypto.randomUUID();
          let code = inviteCode();
          while (Object.values(rooms).some(room => room.code === code)) code = inviteCode();
          const response = await internalFetch(roomStub(this.env, id), '/init', 'POST', { id, code, ...config, playerName });
          if (!response.ok) return response;
          const created = await response.json();
          rooms[id] = publicRoom(created.room);
          await this.ctx.storage.put('rooms', rooms);
          return json(created, 201);
        });
      } catch (cause) { return error(cause.message); }
    }
    if (path === '/update' && request.method === 'POST') {
      const value = await readBody(request);
      if (!ROOM_ID.test(value?.id)) return error('Mesa inválida.');
      const rooms = (await this.ctx.storage.get('rooms')) || {};
      if (value.status === 'closed') delete rooms[value.id];
      else if (rooms[value.id]) rooms[value.id] = value;
      await this.ctx.storage.put('rooms', rooms);
      return json({ ok: true });
    }
    return error('Ruta no encontrada.', 404);
  }
}

export class TexasRoom extends DurableObject {
  async load() { return this.ctx.storage.get('room'); }

  snapshot(room, viewerId = null) {
    const online = new Set(this.ctx.getWebSockets().map(socket => socket.deserializeAttachment()?.playerId));
    const presence = member => online.has(member.id) ? 'connected' : member.connectedOnce ? 'reconnecting' : 'disconnected';
    return { ...publicSnapshot(room), game: publicGame(room, viewerId), players: room.players.map(player => ({ id: player.id, name: player.name, seat: player.seat, isBot: false, online: online.has(player.id), connection: presence(player) })), spectators: (room.spectators || []).map(member => ({ id: member.id, name: member.name, connection: presence(member) })) };
  }

  broadcast(room) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify({ type: 'room', room: this.snapshot(room, socket.deserializeAttachment()?.playerId) })); }
      catch { /* A disconnected socket will be removed by Cloudflare. */ }
    }
  }

  closeExcludedPlayers(room) {
    if (!room.joinLocked || room.status !== 'playing') return;
    const accepted = new Set([...room.players, ...(room.spectators || [])].map(player => player.id));
    for (const socket of this.ctx.getWebSockets()) {
      if (!accepted.has(socket.deserializeAttachment()?.playerId)) socket.close(1008, 'Nueva partida sin tu participación');
    }
  }

  async publish(room) {
    await this.ctx.storage.put('room', room);
    this.closeExcludedPlayers(room);
    try {
      const response = await internalFetch(directory(this.env), '/update', 'POST', publicRoom(room));
      if (!response.ok) throw new Error('No se pudo actualizar el listado.');
    } catch {
      // A directory outage must not make an already-persisted join look unsuccessful.
      await this.ctx.storage.setAlarm(Date.now() + 10_000);
    }
    const expiries = (room.spectators || []).filter(member => member.disconnectedAt).map(member => member.disconnectedAt + RECONNECT_MS);
    if (room.status === 'waiting') expiries.push(...room.players.filter(member => member.disconnectedAt).map(member => member.disconnectedAt + RECONNECT_MS));
    const nextAlarm = Math.min(...[room.rematch?.deadline, room.game?.deadline, ...expiries].filter(value => value > 0));
    if (Number.isFinite(nextAlarm)) await this.ctx.storage.setAlarm(Math.max(Date.now() + 100, nextAlarm));
    this.broadcast(room);
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === '/init' && request.method === 'POST') {
      return this.ctx.blockConcurrencyWhile(async () => {
        if (await this.load()) return error('La mesa ya existe.', 409);
        const input = await readBody(request);
        const config = validateRoomInput(input);
        const id = input.id;
        if (!ROOM_ID.test(id)) return error('Identificador inválido.');
        if (!/^[0-9A-V]{10}$/.test(input.code)) return error('Código de mesa inválido.');
        const player = { id: crypto.randomUUID(), token: secret(), name: requiredPlayerName(input.playerName), seat: 0 };
        const salt = config.isPrivate ? secret() : '';
        const room = {
          id, code: input.code, name: config.name, maxPlayers: config.maxPlayers, botCount: config.botCount, turnSeconds: config.turnSeconds, isPrivate: config.isPrivate,
          mode: config.mode, chips: config.chips, small: config.small, big: config.big, minutes: config.minutes,
          growing: config.growing, breaks: config.breaks, every: config.every, rest: config.rest,
          passwordSalt: salt, passwordHash: config.isPrivate ? await passwordDigest(config.password, salt) : '',
          hostId: player.id, players: [player], spectators: [], status: 'waiting', tournamentId: 1, updatedAt: Date.now(),
          botProfiles: Array.from({ length: config.botCount }, () => randomInt(BOT_PROFILES.length)),
        };
        if (room.mode !== 'tournament' && canBegin(room)) beginHand(room);
        await this.ctx.storage.put('room', room);
        await this.ctx.storage.setAlarm(room.game?.deadline || Date.now() + RECONNECT_MS);
        return json({ room: this.snapshot(room, player.id), playerId: player.id, token: player.token }, 201);
      });
    }

    if (path === '/join' && request.method === 'POST') {
      try {
        const input = await readBody(request);
        return await this.ctx.blockConcurrencyWhile(async () => {
          const room = await this.load();
          if (!room || room.joinLocked || registrationClosed(room) || !['waiting', 'playing'].includes(room.status) || Date.now() - room.updatedAt >= ROOM_TTL_MS) return error('La inscripción está cerrada. Puedes entrar como espectador.', 409);
          if (room.isPrivate) {
            const digest = await passwordDigest(typeof input.password === 'string' ? input.password : '', room.passwordSalt);
            if (!sameDigest(digest, room.passwordHash)) return error('Contraseña incorrecta.', 403);
          }
          const seat = firstFreeSeat(room.players, room.maxPlayers);
          if (seat < 0) return error('La mesa está llena.', 409);
          const name = requiredPlayerName(input.playerName);
          const player = { id: crypto.randomUUID(), token: secret(), name, seat, pendingHand: !!room.game };
          room.players.push(player);
          room.updatedAt = Date.now();
          if (room.mode !== 'tournament' && !room.game && canBegin(room)) beginHand(room);
          await this.publish(room);
          return json({ room: this.snapshot(room, player.id), playerId: player.id, token: player.token });
        });
      } catch (cause) { return error(cause.message); }
    }

    if (path === '/spectate' && request.method === 'POST') {
      try {
        const input = await readBody(request);
        return await this.ctx.blockConcurrencyWhile(async () => {
          const room = await this.load();
          if (!room || !['waiting', 'playing', 'finished'].includes(room.status)) return error('Mesa no disponible.', 404);
          if (room.isPrivate) {
            const digest = await passwordDigest(typeof input.password === 'string' ? input.password : '', room.passwordSalt);
            if (!sameDigest(digest, room.passwordHash)) return error('Contraseña incorrecta.', 403);
          }
          const name = requiredPlayerName(input.playerName);
          room.spectators ||= [];
          if (room.spectators.length >= MAX_SPECTATORS) return error('La zona de espectadores está llena.', 409);
          const spectator = { id: crypto.randomUUID(), token: secret(), name };
          room.spectators.push(spectator);
          room.updatedAt = Date.now();
          await this.publish(room);
          return json({ room: this.snapshot(room, spectator.id), playerId: spectator.id, token: spectator.token, role: 'spectator' });
        });
      } catch (cause) { return error(cause.message); }
    }

    const room = await this.load();
    if (!room || !['waiting', 'playing', 'finished'].includes(room.status)) return error('Mesa no disponible.', 404);
    const token = path === '/socket' ? new URL(request.url).searchParams.get('token') : request.headers.get('Authorization')?.replace(/^Bearer /, '');
    const player = room.players.find(entry => entry.token === token);
    const spectator = (room.spectators || []).find(entry => entry.token === token);
    const member = player || spectator;
    if (!member) return error('Acceso a la mesa no autorizado.', 401);

    if (path === '/snapshot' && request.method === 'GET') return json(this.snapshot(room, member.id));
    if (path === '/start' && request.method === 'POST') {
      if (!player || room.hostId !== player.id) return error('Solo quien creó la mesa puede iniciar el torneo.', 403);
      return this.ctx.blockConcurrencyWhile(async () => {
        const current = await this.load();
        if (current.hostId !== player.id) return error('Solo quien creó la mesa puede iniciar el torneo.', 403);
        if (current.mode !== 'tournament' || registrationClosed(current) || !canBegin(current)) return error('El torneo no se puede iniciar todavía.', 409);
        current.tournamentStartedAt = Date.now();
        beginHand(current);
        current.updatedAt = Date.now();
        await this.publish(current);
        return json(this.snapshot(current, player.id));
      });
    }
    if (path === '/rematch' && request.method === 'POST') {
      if (!player) return error('Los espectadores no votan para repetir.', 403);
      try {
        return await this.ctx.blockConcurrencyWhile(async () => {
          const current = await this.load();
          voteRematch(current, player.id);
          current.updatedAt = Date.now();
          await this.publish(current);
          return json(this.snapshot(current, player.id));
        });
      } catch (cause) { return error(cause.message); }
    }
    if (path === '/action' && request.method === 'POST') {
      if (!player) return error('Los espectadores no pueden actuar.', 403);
      try {
        const input = await readBody(request);
        return await this.ctx.blockConcurrencyWhile(async () => {
          const current = await this.load();
          applyPlayerAction(current, player.id, input?.action, input?.amount || 0);
          current.updatedAt = Date.now();
          await this.publish(current);
          return json(this.snapshot(current, player.id));
        });
      } catch (cause) { return error(cause.message); }
    }
    if (path === '/leave' && request.method === 'DELETE') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const current = await this.load();
        if (!player) {
          current.spectators = (current.spectators || []).filter(entry => entry.id !== spectator.id);
          for (const socket of this.ctx.getWebSockets()) if (socket.deserializeAttachment()?.playerId === spectator.id) socket.close(1000, 'Salió de la mesa');
          await this.publish(current);
          return json({ ok: true });
        }
        const index = current.players.findIndex(entry => entry.id === player.id);
        if (index < 0) return error('Jugador no encontrado.', 404);
        forfeitPlayer(current, player.seat);
        current.players.splice(index, 1);
        current.hostId = current.players.some(entry => entry.id === current.hostId) ? current.hostId : current.players[0]?.id || null;
        current.status = current.players.length ? current.status === 'finished' ? 'finished' : current.game ? 'playing' : 'waiting' : 'closed';
        if (!current.players.length) current.game = null;
        current.updatedAt = Date.now();
        for (const socket of this.ctx.getWebSockets()) if (socket.deserializeAttachment()?.playerId === player.id) socket.close(1000, 'Salió de la mesa');
        await this.publish(current);
        return json({ ok: true });
      });
    }
    if (path === '/socket' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      for (const socket of this.ctx.getWebSockets()) if (socket.deserializeAttachment()?.playerId === member.id) socket.close(1000, 'Nueva conexión');
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId: member.id });
      member.connectedOnce = true;
      member.disconnectedAt = null;
      if (room.mode !== 'tournament' && !room.game && canBegin(room)) beginHand(room);
      await this.publish(room);
      server.send(JSON.stringify({ type: 'room', room: this.snapshot(room, member.id) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return error('Ruta no encontrada.', 404);
  }

  async webSocketMessage(socket, message) {
    if (message === 'ping') { socket.send('pong'); return; }
    if (typeof message !== 'string' || message.length > 1024) { socket.send(JSON.stringify({ type: 'error', error: 'Mensaje demasiado grande.' })); return; }
    let data;
    try { data = JSON.parse(message); } catch { socket.send(JSON.stringify({ type: 'error', error: 'Mensaje inválido.' })); return; }
    if (data?.type !== 'chat' || typeof data.text !== 'string') { socket.send(JSON.stringify({ type: 'error', error: 'Acción no disponible.' })); return; }
    const text = data.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!text || text.length > 200) { socket.send(JSON.stringify({ type: 'error', error: 'El mensaje debe tener entre 1 y 200 caracteres.' })); return; }
    const attachment = socket.deserializeAttachment();
    if (!attachment?.playerId || Date.now() - (attachment.lastChatAt || 0) < 750) { socket.send(JSON.stringify({ type: 'error', error: 'Espera un momento antes de enviar otro mensaje.' })); return; }
    socket.serializeAttachment({ ...attachment, lastChatAt: Date.now() });
    const room = await this.load();
    const player = [...(room?.players || []), ...(room?.spectators || [])].find(entry => entry.id === attachment.playerId);
    if (!player) return;
    const payload = JSON.stringify({ type: 'chat', playerId: player.id, name: player.name, text, sentAt: Date.now() });
    for (const peer of this.ctx.getWebSockets()) { try { peer.send(payload); } catch { /* Disconnected peer. */ } }
  }

  async webSocketClose(socket) {
    socket.close(1000, 'Conexión cerrada');
    const room = await this.load();
    if (room && room.status !== 'closed') {
      const id = socket.deserializeAttachment()?.playerId;
      const member = [...room.players, ...(room.spectators || [])].find(entry => entry.id === id);
      if (member && !this.ctx.getWebSockets().some(peer => peer !== socket && peer.deserializeAttachment()?.playerId === id)) {
        member.disconnectedAt = Date.now();
        await this.publish(room);
      } else this.broadcast(room);
    }
  }

  async webSocketError(socket) { socket.close(1011, 'Error de conexión'); }

  async alarm() {
    const room = await this.load();
    if (!room) return;
    if (room.status === 'closed') {
      await internalFetch(directory(this.env), '/update', 'POST', publicRoom(room));
      return;
    }
    const online = new Set(this.ctx.getWebSockets().map(socket => socket.deserializeAttachment()?.playerId));
    const now = Date.now();
    room.spectators = (room.spectators || []).filter(member => online.has(member.id) || !member.disconnectedAt || now - member.disconnectedAt < RECONNECT_MS);
    if (room.status === 'waiting') {
      room.players = room.players.filter(member => online.has(member.id) || !member.disconnectedAt || now - member.disconnectedAt < RECONNECT_MS);
      room.hostId = room.players.some(member => member.id === room.hostId) ? room.hostId : room.players[0]?.id || null;
      if (!room.players.length) room.status = 'closed';
    }
    if (room.status === 'finished' && room.rematch?.deadline && Date.now() >= room.rematch.deadline) {
      resolveRematch(room);
      room.updatedAt = Date.now();
      await this.publish(room);
      return;
    }
    if (advanceExpiredTurn(room)) {
      room.updatedAt = Date.now();
      await this.publish(room);
      return;
    }
    room.updatedAt = Date.now();
    await this.publish(room);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return error('Origen no permitido.', 403);
    const cors = response => {
      const result = new Response(response.body, response);
      if (origin) {
        result.headers.set('Access-Control-Allow-Origin', origin);
        result.headers.set('Vary', 'Origin');
      }
      return result;
    };
    if (request.method === 'OPTIONS') return cors(new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600' },
    }));
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') return cors(json({ ok: true, service: 'texas-multiplayer' }));
      if (url.pathname === '/api/rooms' && request.method === 'GET') return cors(await internalFetch(directory(env), '/list'));
      if (url.pathname === '/api/rooms' && request.method === 'POST') return cors(await directory(env).fetch(new Request('https://internal/create', request)));
      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|spectate|start|snapshot|leave|socket|action|rematch)$/);
      if (!match || !ROOM_ID.test(match[1])) return cors(error('Ruta no encontrada.', 404));
      const [, id, action] = match;
      if (action === 'socket') {
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return cors(error('Conexión WebSocket requerida.', 426));
        return roomStub(env, id).fetch(new Request(`https://internal/socket${url.search}`, request));
      }
      const method = ['join', 'spectate', 'start', 'action', 'rematch'].includes(action) ? 'POST' : action === 'leave' ? 'DELETE' : 'GET';
      if (request.method !== method) return cors(error('Método no permitido.', 405));
      const response = await roomStub(env, id).fetch(new Request(`https://internal/${action}`, request));
      return cors(response);
    } catch { return cors(error('No se pudo contactar con la mesa. Vuelve a intentarlo.', 503)); }
  },
};
