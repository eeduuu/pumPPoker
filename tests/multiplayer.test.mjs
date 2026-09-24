import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, firstFreeSeat, passwordDigest, publicRoom, publicSnapshot, sameDigest, validateRoomInput } from '../server/room-core.mjs';

test('El servidor limita asientos y valida contraseñas privadas', () => {
  assert.deepEqual(validateRoomInput({ name: '  Mesa   de Ana  ', maxPlayers: 4, isPrivate: true, password: 'secreto1' }), {
    name: 'Mesa de Ana', maxPlayers: 4, botCount: 0, turnSeconds: 15, isPrivate: true, password: 'secreto1',
  });
  assert.throws(() => validateRoomInput({ maxPlayers: 1 }), /entre 2 y 9/);
  assert.throws(() => validateRoomInput({ maxPlayers: 10 }), /entre 2 y 9/);
  assert.throws(() => validateRoomInput({ maxPlayers: 3, isPrivate: true, password: '123' }), /contraseña/);
  assert.throws(() => validateRoomInput({ maxPlayers: 4, botCount: 6 }), /9 asientos/);
  assert.throws(() => validateRoomInput({ maxPlayers: 3, turnSeconds: 10 }), /6, 15 o 30/);
  assert.equal(validateRoomInput({ maxPlayers: 3, botCount: 2, turnSeconds: 30 }).botCount, 2);
  assert.equal(validateRoomInput({ maxPlayers: 2, password: 'ignorar' }).password, '');
  assert.equal(cleanName('   ', 'Jugador'), 'Jugador');
});

test('Los asientos vacíos se reutilizan sin desplazar a los demás', () => {
  assert.equal(firstFreeSeat([{ seat: 0 }, { seat: 2 }], 4), 1);
  assert.equal(firstFreeSeat([{ seat: 0 }, { seat: 1 }], 2), -1);
});

test('Las vistas públicas nunca incluyen contraseñas ni tokens', () => {
  const room = { id: 'room', code: 'ABCD123456', name: 'Mesa', maxPlayers: 4, botCount: 2, turnSeconds: 6, isPrivate: true, status: 'waiting', updatedAt: 1,
    hostId: 'a', passwordHash: 'hash', passwordSalt: 'salt', players: [{ id: 'a', name: 'Ana', seat: 0, token: 'secret' }] };
  assert.deepEqual(publicRoom(room), { id: 'room', code: 'ABCD123456', name: 'Mesa', maxPlayers: 4, botCount: 2, turnSeconds: 6, playerCount: 1, isPrivate: true, status: 'waiting', updatedAt: 1 });
  const snapshot = publicSnapshot(room);
  assert.deepEqual(snapshot.players, [{ id: 'a', name: 'Ana', seat: 0, isBot: false }]);
  assert.equal(JSON.stringify(snapshot).includes('secret'), false);
  assert.equal(JSON.stringify(snapshot).includes('hash'), false);
});

test('La contraseña se deriva con sal y se compara sin salida anticipada', async () => {
  const saltA = 'ab'.repeat(32);
  const saltB = 'cd'.repeat(32);
  const a = await passwordDigest('clave-segura', saltA);
  assert.equal(a.length, 64);
  assert.equal(sameDigest(a, await passwordDigest('clave-segura', saltA)), true);
  assert.equal(sameDigest(a, await passwordDigest('clave-segura', saltB)), false);
  assert.equal(sameDigest(a, await passwordDigest('otra-clave', saltA)), false);
});
