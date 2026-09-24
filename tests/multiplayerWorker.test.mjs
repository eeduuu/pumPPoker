import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const mockBase = 'data:text/javascript,' + encodeURIComponent('export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: mockBase, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const { TexasDirectory, TexasRoom, default: worker } = await import('../server/index.mjs');
const { beginHand } = await import('../server/game.mjs');

function context() {
  const values = new Map();
  return {
    storage: { get: async key => values.get(key), put: async (key, value) => { values.set(key, value); }, setAlarm: async () => {} },
    blockConcurrencyWhile: callback => callback(),
    getWebSockets: () => [],
  };
}

function environment() {
  const env = { ALLOWED_ORIGINS: 'https://eeduuu.github.io' };
  const rooms = new Map();
  env.previewRooms = rooms;
  const directory = new TexasDirectory(context(), env);
  env.TEXAS_DIRECTORY = { idFromName: value => value, get: () => ({ fetch: request => directory.fetch(request) }) };
  env.TEXAS_ROOMS = { idFromName: value => value, get: id => ({ fetch: request => {
    if (!rooms.has(id)) rooms.set(id, new TexasRoom(context(), env));
    return rooms.get(id).fetch(request);
  } }) };
  return env;
}

const call = (env, path, method = 'GET', body, token) => worker.fetch(new Request(`https://example.workers.dev${path}`, {
  method,
  headers: { Origin: 'https://eeduuu.github.io', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env);

test('El Worker crea, lista, protege, llena y vacía mesas privadas', async () => {
  const env = environment();
  const created = await call(env, '/api/rooms', 'POST', { name: 'Amigos', maxPlayers: 2, isPrivate: true, password: 'clave-segura', playerName: 'Ana' });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('Access-Control-Allow-Origin'), 'https://eeduuu.github.io');
  const host = await created.json();
  assert.equal(host.room.players.length, 1);
  assert.match(host.room.code, /^[0-9A-V]{10}$/);
  assert.equal(host.room.turnSeconds, 15);
  assert.equal(JSON.stringify(host.room).includes('clave-segura'), false);

  const listed = await (await call(env, '/api/rooms')).json();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].isPrivate, true);
  assert.equal(listed[0].code, host.room.code);
  assert.equal(listed[0].playerCount, 1);
  assert.equal(JSON.stringify(listed).includes('password'), false);

  const id = host.room.id;
  assert.equal((await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Beto', password: 'mal' })).status, 403);
  const joined = await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Beto', password: 'clave-segura' });
  assert.equal(joined.status, 200);
  const guest = await joined.json();
  assert.equal(guest.room.players[1].seat, 1);
  assert.equal((await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Cris', password: 'clave-segura' })).status, 409);
  assert.equal((await call(env, `/api/rooms/${id}/snapshot`)).status, 401);
  assert.equal((await call(env, `/api/rooms/${id}/snapshot`, 'GET', undefined, guest.token)).status, 200);

  assert.equal((await call(env, `/api/rooms/${id}/leave`, 'DELETE', undefined, guest.token)).status, 200);
  assert.equal((await (await call(env, '/api/rooms')).json())[0].playerCount, 1);
  assert.equal((await call(env, `/api/rooms/${id}/leave`, 'DELETE', undefined, host.token)).status, 200);
  assert.deepEqual(await (await call(env, '/api/rooms')).json(), []);
});

test('Una mesa con bots comienza de verdad y continúa visible para personas que quieran entrar', async () => {
  const env = environment();
  const response = await call(env, '/api/rooms', 'POST', { name: 'Mixta', maxPlayers: 3, botCount: 2, turnSeconds: 6, playerName: 'Ana' });
  assert.equal(response.status, 201);
  const { room } = await response.json();
  assert.equal(room.botCount, 2);
  assert.equal(room.turnSeconds, 6);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].isBot, false);
  assert.equal(room.status, 'playing');
  assert.equal(room.game.phase, 'playing');
  assert.equal(room.game.seats.filter(seat => seat.active).length, 3);
  assert.equal(room.game.seats.find(seat => seat.id === room.players[0].id).cards.length, 2);
  assert.equal(room.game.seats.filter(seat => seat.isBot).every(seat => seat.cards === null), true);
  const listed = await (await call(env, '/api/rooms')).json();
  assert.equal(listed[0].status, 'playing');
  assert.equal(JSON.stringify(listed).includes('cards'), false);
  const joined = await call(env, `/api/rooms/${room.id}/join`, 'POST', { playerName: 'Beto' });
  assert.equal(joined.status, 200);
  const guest = await joined.json();
  assert.equal(guest.room.game.seats.find(seat => seat.id === room.players[0].id).cards, null);
  assert.equal(guest.room.game.seats.find(seat => seat.id === guest.playerId), undefined, 'El invitado espera a la siguiente mano sin heredar el asiento anterior.');
  const invalid = await call(env, '/api/rooms', 'POST', { maxPlayers: 8, botCount: 2, turnSeconds: 6, playerName: 'Ana' });
  assert.equal(invalid.status, 400);
});

test('La votación de revancha se publica por el Worker y espera a todas las personas', async () => {
  const env = environment();
  const created = await (await call(env, '/api/rooms', 'POST', { name: 'Torneo', maxPlayers: 2, mode: 'tournament', playerName: 'Ana' })).json();
  const guest = await (await call(env, `/api/rooms/${created.room.id}/join`, 'POST', { playerName: 'Beto' })).json();
  assert.equal((await call(env, `/api/rooms/${created.room.id}/start`, 'POST', {}, created.token)).status, 200);
  const instance = env.previewRooms.get(created.room.id);
  const current = await instance.load();
  current.status = 'finished'; current.game.phase = 'result'; current.game.deadline = 0; current.winnerName = 'Ana';
  await instance.ctx.storage.put('room', current);
  const first = await (await call(env, `/api/rooms/${created.room.id}/rematch`, 'POST', {}, created.token)).json();
  assert.equal(first.status, 'finished');
  assert.equal(first.rematch.accepted.length, 1);
  assert.equal(first.rematch.deadline > Date.now(), true);
  const second = await (await call(env, `/api/rooms/${created.room.id}/rematch`, 'POST', {}, guest.token)).json();
  assert.equal(second.status, 'playing');
  assert.equal(second.tournamentId, 2);
  assert.equal(second.game.number, 1);
  assert.equal(second.joinLocked, true);
  assert.equal(second.rematch, null);
  assert.equal(JSON.stringify(second).includes(created.token), false);
});

test('El torneo exige inicio del creador y solo admite espectadores después', async () => {
  const env = environment();
  assert.equal((await call(env, '/api/rooms', 'POST', { mode: 'tournament', maxPlayers: 2, botCount: 1, playerName: '' })).status, 400);
  assert.equal((await call(env, '/api/rooms', 'POST', { mode: 'tournament', maxPlayers: 2, botCount: 1, playerName: 'Bot 1' })).status, 400);
  const host = await (await call(env, '/api/rooms', 'POST', { mode: 'tournament', maxPlayers: 2, botCount: 1, playerName: 'Ana' })).json();
  const id = host.room.id;
  assert.equal(host.room.status, 'waiting');
  assert.equal(host.room.game, null);
  assert.equal(host.room.registrationClosed, false);
  assert.equal((await call(env, `/api/rooms/${id}/start`, 'POST', {}, 'wrong')).status, 401);
  const started = await (await call(env, `/api/rooms/${id}/start`, 'POST', {}, host.token)).json();
  assert.equal(started.status, 'playing');
  assert.equal(started.registrationClosed, true);
  assert.equal((await call(env, `/api/rooms/${id}/start`, 'POST', {}, host.token)).status, 409);
  assert.equal((await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Beto' })).status, 409);
  const watcher = await (await call(env, `/api/rooms/${id}/spectate`, 'POST', { playerName: 'Beto' })).json();
  assert.equal(watcher.role, 'spectator');
  assert.equal(watcher.room.spectators.length, 1);
  assert.equal(watcher.room.game.seats.find(seat => seat.id === host.playerId).cards, null);
  assert.equal((await call(env, `/api/rooms/${id}/action`, 'POST', { action: 'fold' }, watcher.token)).status, 403);
  assert.equal((await call(env, `/api/rooms/${id}/rematch`, 'POST', {}, watcher.token)).status, 403);
  assert.equal((await call(env, `/api/rooms/${id}/snapshot`, 'GET', undefined, watcher.token)).status, 200);
  assert.equal((await call(env, `/api/rooms/${id}/leave`, 'DELETE', undefined, watcher.token)).status, 200);
  assert.equal((await (await call(env, `/api/rooms/${id}/snapshot`, 'GET', undefined, host.token)).json()).spectators.length, 0);
});

test('Un invitado a partida normal no hereda cartas ni fichas de un asiento abandonado', async () => {
  const env = environment();
  const host = await (await call(env, '/api/rooms', 'POST', { maxPlayers: 2, playerName: 'Ana' })).json();
  const id = host.room.id;
  const guest = await (await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Beto' })).json();
  await call(env, `/api/rooms/${id}/leave`, 'DELETE', undefined, host.token);
  const newcomer = await (await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Cris' })).json();
  assert.equal(newcomer.room.players.some(player => player.id === newcomer.playerId), true);
  assert.equal(newcomer.room.game.seats.find(seat => seat.id === newcomer.playerId), undefined);
  assert.equal((await env.previewRooms.get(id).load()).players.find(player => player.id === newcomer.playerId).pendingHand, true);
  const instance = env.previewRooms.get(id);
  const current = await instance.load();
  beginHand(current);
  const next = instance.snapshot(current, newcomer.playerId);
  const seat = next.game.seats.find(entry => entry.id === newcomer.playerId);
  assert.equal(seat.cards.length, 2);
  assert.equal(seat.stack + seat.committed, 10_000);
});

test('Una sala privada también exige contraseña para mirar y el chat del espectador es efímero', async () => {
  const env = environment();
  const host = await (await call(env, '/api/rooms', 'POST', { mode: 'tournament', maxPlayers: 2, botCount: 1, isPrivate: true, password: 'secreto7', playerName: 'Ana' })).json();
  const id = host.room.id;
  assert.equal((await call(env, `/api/rooms/${id}/spectate`, 'POST', { playerName: 'Beto', password: 'mal' })).status, 403);
  const spectator = await (await call(env, `/api/rooms/${id}/spectate`, 'POST', { playerName: 'Beto', password: 'secreto7' })).json();
  const sameName = await (await call(env, `/api/rooms/${id}/join`, 'POST', { playerName: 'Beto', password: 'secreto7' })).json();
  assert.notEqual(sameName.playerId, spectator.playerId, 'Las sesiones se identifican por token, no por el nombre visible.');
  const room = env.previewRooms.get(id);
  const messages = [];
  let attachment = { playerId: spectator.playerId };
  const socket = { deserializeAttachment: () => attachment, serializeAttachment: value => { attachment = value; }, send: value => messages.push(JSON.parse(value)) };
  room.ctx.getWebSockets = () => [socket];
  await room.webSocketMessage(socket, JSON.stringify({ type: 'chat', text: 'Vamos' }));
  assert.equal(messages[0].name, 'Beto');
  assert.equal((await room.load()).chat, undefined);
});

test('Las acciones HTTP solo las acepta del jugador activo y actualizan la misma mano', async () => {
  const env = environment();
  const created = await call(env, '/api/rooms', 'POST', { name: 'Turnos', maxPlayers: 2, botCount: 1, playerName: 'Ana' });
  const host = await created.json();
  const guest = await (await call(env, `/api/rooms/${host.room.id}/join`, 'POST', { playerName: 'Beto' })).json();
  const actorSeat = host.room.game.actor;
  const actor = actorSeat === 0 ? host : actorSeat === 1 ? guest : null;
  const nonActor = actor === host ? guest : host;
  const path = `/api/rooms/${host.room.id}/action`;
  assert.equal((await call(env, path, 'POST', { action: 'fold' }, nonActor.token)).status, 400);
  assert.equal((await call(env, path, 'POST', { action: 'check' }, 'not-a-token')).status, 401);
  if (actor) {
    const snapshot = actor.room.game;
    const action = snapshot.toCall ? 'call' : 'check';
    const result = await call(env, path, 'POST', { action }, actor.token);
    assert.equal(result.status, 200);
    const updated = await result.json();
    assert.equal(updated.game.number, 1);
    assert.equal(updated.game.seats.find(seat => seat.id === actor.playerId).cards.length, 2);
    assert.equal(updated.game.seats.find(seat => seat.id === nonActor.playerId)?.cards ?? null, null);
  }
});

test('Dos conexiones reciben la misma mesa, pero nunca las cartas privadas del otro', async () => {
  const ctx = context();
  const room = new TexasRoom(ctx, environment());
  const id = '22222222-2222-4222-8222-222222222222';
  const created = await room.fetch(new Request('https://internal/init', { method: 'POST', body: JSON.stringify({ id, code: 'ABCDE12345', name: 'Dos móviles', maxPlayers: 2, playerName: 'Ana' }) }));
  const host = await created.json();
  const joined = await room.fetch(new Request('https://internal/join', { method: 'POST', body: JSON.stringify({ playerName: 'Beto' }) }));
  const guest = await joined.json();
  assert.equal(guest.room.status, 'playing');
  const messagesA = [], messagesB = [];
  ctx.getWebSockets = () => [
    { deserializeAttachment: () => ({ playerId: host.playerId }), send: text => messagesA.push(JSON.parse(text)) },
    { deserializeAttachment: () => ({ playerId: guest.playerId }), send: text => messagesB.push(JSON.parse(text)) },
  ];
  room.broadcast(await room.load());
  const a = messagesA.at(-1).room.game, b = messagesB.at(-1).room.game;
  assert.deepEqual(a.board, b.board);
  assert.equal(a.actor, b.actor);
  assert.equal(a.seats.find(seat => seat.id === host.playerId).cards.length, 2);
  assert.equal(a.seats.find(seat => seat.id === guest.playerId).cards, null);
  assert.equal(b.seats.find(seat => seat.id === guest.playerId).cards.length, 2);
  assert.equal(b.seats.find(seat => seat.id === host.playerId).cards, null);
});

test('Chat limitado y efímero: se transmite sin guardarse en el estado de la mesa', async () => {
  const ctx = context();
  const env = environment();
  const room = new TexasRoom(ctx, env);
  const id = '11111111-1111-4111-8111-111111111111';
  const created = await room.fetch(new Request('https://internal/init', { method: 'POST', body: JSON.stringify({ id, code: 'ABCD123456', name: 'Chat', maxPlayers: 2, playerName: 'Ana' }) }));
  const { playerId } = await created.json();
  const messages = [];
  let attachment = { playerId };
  const socket = { deserializeAttachment: () => attachment, serializeAttachment: next => { attachment = next; }, send: text => messages.push(JSON.parse(text)) };
  ctx.getWebSockets = () => [socket];
  await room.webSocketMessage(socket, JSON.stringify({ type: 'chat', text: 'Hola mesa' }));
  assert.equal(messages[0].text, 'Hola mesa');
  assert.equal((await room.load()).chat, undefined);
  await room.webSocketMessage(socket, JSON.stringify({ type: 'chat', text: 'Otro' }));
  assert.match(messages[1].error, /Espera/);
  assert.equal((await room.load()).chat, undefined);
});

test('El Worker rechaza orígenes no permitidos antes de crear una mesa', async () => {
  const env = environment();
  const response = await worker.fetch(new Request('https://example.workers.dev/api/rooms', {
    method: 'POST', headers: { Origin: 'https://malicioso.example' }, body: '{}',
  }), env);
  assert.equal(response.status, 403);
  assert.deepEqual(await (await call(env, '/api/rooms')).json(), []);
});

test('El endpoint de salud permite comprobar un despliegue sin crear mesas', async () => {
  const env = environment();
  const response = await call(env, '/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://eeduuu.github.io');
  assert.deepEqual(await response.json(), { ok: true, service: 'texas-multiplayer' });
  assert.deepEqual(await (await call(env, '/api/rooms')).json(), []);
});
