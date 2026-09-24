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

test('Configuración de bots y reloj viaja en la sala, sin convertirse en partida simulada', async () => {
  const env = environment();
  const response = await call(env, '/api/rooms', 'POST', { name: 'Mixta', maxPlayers: 3, botCount: 2, turnSeconds: 6, playerName: 'Ana' });
  assert.equal(response.status, 201);
  const { room } = await response.json();
  assert.equal(room.botCount, 2);
  assert.equal(room.turnSeconds, 6);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].isBot, false);
  const invalid = await call(env, '/api/rooms', 'POST', { maxPlayers: 8, botCount: 2, turnSeconds: 6, playerName: 'Ana' });
  assert.equal(invalid.status, 400);
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
