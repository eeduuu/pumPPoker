import { DurableObject } from 'cloudflare:workers';
import { ROOM_TTL_MS, cleanName, firstFreeSeat, passwordDigest, publicRoom, publicSnapshot, sameDigest, validateRoomInput } from './room-core.mjs';

const DIRECTORY_ID = 'texas-rooms-v1';
const ROOM_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const RECONNECT_MS = 5 * 60 * 1000;

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
      return json(Object.values(rooms).filter(room => room.status === 'waiting' && Date.now() - room.updatedAt < ROOM_TTL_MS)
        .sort((left, right) => right.updatedAt - left.updatedAt));
    }
    if (path === '/create' && request.method === 'POST') {
      try {
        const input = await readBody(request);
        const config = validateRoomInput(input);
        const playerName = cleanName(input.playerName, 'Jugador', 12);
        return await this.ctx.blockConcurrencyWhile(async () => {
          const rooms = (await this.ctx.storage.get('rooms')) || {};
          for (const [id, room] of Object.entries(rooms)) {
            if (room.status !== 'waiting' || Date.now() - room.updatedAt >= ROOM_TTL_MS) delete rooms[id];
          }
          const active = Object.values(rooms);
          if (active.length >= 500) return error('Hay demasiadas mesas activas. Inténtalo más tarde.', 503);
          const id = crypto.randomUUID();
          let code = inviteCode();
          while (Object.values(rooms).some(room => room.code === code)) code = inviteCode();
          const response = await internalFetch(roomStub(this.env, id), '/init', 'POST', { id, code, ...config, playerName });
          if (!response.ok) return response;
          const created = await response.json();
          rooms[id] = created.room;
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

  snapshot(room) {
    const online = new Set(this.ctx.getWebSockets().map(socket => socket.deserializeAttachment()?.playerId));
    return { ...publicSnapshot(room), players: room.players.map(player => ({ id: player.id, name: player.name, seat: player.seat, isBot: false, online: online.has(player.id), connection: online.has(player.id) ? 'connected' : player.connectedOnce ? 'reconnecting' : 'disconnected' })) };
  }

  broadcast(room) {
    const message = JSON.stringify({ type: 'room', room: this.snapshot(room) });
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(message); } catch { /* A disconnected socket will be removed by Cloudflare. */ }
    }
  }

  async publish(room) {
    await this.ctx.storage.put('room', room);
    try {
      const response = await internalFetch(directory(this.env), '/update', 'POST', publicRoom(room));
      if (!response.ok) throw new Error('No se pudo actualizar el listado.');
    } catch {
      // A directory outage must not make an already-persisted join look unsuccessful.
      await this.ctx.storage.setAlarm(Date.now() + 10_000);
    }
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
        const player = { id: crypto.randomUUID(), token: secret(), name: cleanName(input.playerName, 'Jugador', 12), seat: 0 };
        const salt = config.isPrivate ? secret() : '';
        const room = {
          id, code: input.code, name: config.name, maxPlayers: config.maxPlayers, botCount: config.botCount, turnSeconds: config.turnSeconds, isPrivate: config.isPrivate,
          passwordSalt: salt, passwordHash: config.isPrivate ? await passwordDigest(config.password, salt) : '',
          hostId: player.id, players: [player], status: 'waiting', updatedAt: Date.now(),
        };
        await this.ctx.storage.put('room', room);
        await this.ctx.storage.setAlarm(Date.now() + RECONNECT_MS);
        return json({ room: this.snapshot(room), playerId: player.id, token: player.token }, 201);
      });
    }

    if (path === '/join' && request.method === 'POST') {
      try {
        const input = await readBody(request);
        return await this.ctx.blockConcurrencyWhile(async () => {
          const room = await this.load();
          if (!room || room.status !== 'waiting' || Date.now() - room.updatedAt >= ROOM_TTL_MS) return error('La mesa ya no está disponible.', 404);
          if (room.isPrivate) {
            const digest = await passwordDigest(typeof input.password === 'string' ? input.password : '', room.passwordSalt);
            if (!sameDigest(digest, room.passwordHash)) return error('Contraseña incorrecta.', 403);
          }
          const seat = firstFreeSeat(room.players, room.maxPlayers);
          if (seat < 0) return error('La mesa está llena.', 409);
          const player = { id: crypto.randomUUID(), token: secret(), name: cleanName(input.playerName, 'Jugador', 12), seat };
          room.players.push(player);
          room.updatedAt = Date.now();
          await this.publish(room);
          return json({ room: this.snapshot(room), playerId: player.id, token: player.token });
        });
      } catch (cause) { return error(cause.message); }
    }

    const room = await this.load();
    if (!room || room.status !== 'waiting') return error('Mesa no disponible.', 404);
    const token = path === '/socket' ? new URL(request.url).searchParams.get('token') : request.headers.get('Authorization')?.replace(/^Bearer /, '');
    const player = room.players.find(entry => entry.token === token);
    if (!player) return error('Acceso a la mesa no autorizado.', 401);

    if (path === '/snapshot' && request.method === 'GET') return json(this.snapshot(room));
    if (path === '/leave' && request.method === 'DELETE') {
      return this.ctx.blockConcurrencyWhile(async () => {
        const current = await this.load();
        const index = current.players.findIndex(entry => entry.id === player.id);
        if (index < 0) return error('Jugador no encontrado.', 404);
        current.players.splice(index, 1);
        current.hostId = current.players.some(entry => entry.id === current.hostId) ? current.hostId : current.players[0]?.id || null;
        current.status = current.players.length ? 'waiting' : 'closed';
        current.updatedAt = Date.now();
        for (const socket of this.ctx.getWebSockets()) if (socket.deserializeAttachment()?.playerId === player.id) socket.close(1000, 'Salió de la mesa');
        await this.publish(current);
        return json({ ok: true });
      });
    }
    if (path === '/socket' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      for (const socket of this.ctx.getWebSockets()) if (socket.deserializeAttachment()?.playerId === player.id) socket.close(1000, 'Nueva conexión');
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ playerId: player.id });
      player.connectedOnce = true;
      await this.ctx.storage.put('room', room);
      server.send(JSON.stringify({ type: 'room', room: this.snapshot(room) }));
      this.broadcast(room);
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
    const player = room?.players.find(entry => entry.id === attachment.playerId);
    if (!player) return;
    const payload = JSON.stringify({ type: 'chat', playerId: player.id, name: player.name, text, sentAt: Date.now() });
    for (const peer of this.ctx.getWebSockets()) { try { peer.send(payload); } catch { /* Disconnected peer. */ } }
  }

  async webSocketClose(socket) {
    socket.close(1000, 'Conexión cerrada');
    const room = await this.load();
    if (room?.status === 'waiting') {
      this.broadcast(room);
      await this.ctx.storage.setAlarm(Date.now() + RECONNECT_MS);
    }
  }

  async webSocketError(socket) { socket.close(1011, 'Error de conexión'); }

  async alarm() {
    const room = await this.load();
    if (!room) return;
    if (room.status !== 'waiting') {
      await internalFetch(directory(this.env), '/update', 'POST', publicRoom(room));
      return;
    }
    const online = new Set(this.ctx.getWebSockets().map(socket => socket.deserializeAttachment()?.playerId));
    const before = room.players.length;
    room.players = room.players.filter(player => online.has(player.id));
    if (room.players.length === before) {
      await internalFetch(directory(this.env), '/update', 'POST', publicRoom(room));
      return;
    }
    room.hostId = room.players.some(player => player.id === room.hostId) ? room.hostId : room.players[0]?.id || null;
    room.status = room.players.length ? 'waiting' : 'closed';
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
      const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|snapshot|leave|socket)$/);
      if (!match || !ROOM_ID.test(match[1])) return cors(error('Ruta no encontrada.', 404));
      const [, id, action] = match;
      if (action === 'socket') {
        if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return cors(error('Conexión WebSocket requerida.', 426));
        return roomStub(env, id).fetch(new Request(`https://internal/socket${url.search}`, request));
      }
      const method = action === 'join' ? 'POST' : action === 'leave' ? 'DELETE' : 'GET';
      if (request.method !== method) return cors(error('Método no permitido.', 405));
      const response = await roomStub(env, id).fetch(new Request(`https://internal/${action}`, request));
      return cors(response);
    } catch { return cors(error('No se pudo contactar con la mesa. Vuelve a intentarlo.', 503)); }
  },
};
