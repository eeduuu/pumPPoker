import test from 'node:test';
import assert from 'node:assert/strict';
import { onlineSoundEvent } from '../src/multiplayer/soundEvents.ts';

const room = () => ({
  id: 'mesa-1', tournamentId: 1,
  game: { number: 1, phase: 'playing', street: 0, board: [], actor: 0, bet: 50,
    seats: [
      { seat: 0, stack: 950, committed: 50, folded: false },
      { seat: 1, stack: 1000, committed: 0, folded: false },
    ] },
});

test('Los sonidos online siguen acciones y reparto, no el reloj ni mensajes repetidos', () => {
  const before = room();
  assert.equal(onlineSoundEvent(null, before), null, 'entrar a media mano no reproduce un reparto antiguo');
  assert.equal(onlineSoundEvent(before, structuredClone(before)), null);
  const clockTick = structuredClone(before);
  clockTick.game.deadline = 12345;
  assert.equal(onlineSoundEvent(before, clockTick), null, 'un cambio de reloj no es una acción');

  const acted = structuredClone(before);
  acted.game.actor = 1;
  assert.equal(onlineSoundEvent(before, acted), 'action');
  const folded = structuredClone(before);
  folded.game.seats[0].folded = true;
  assert.equal(onlineSoundEvent(before, folded), 'action');

  const flop = structuredClone(before);
  flop.game.street = 1;
  flop.game.board = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.equal(onlineSoundEvent(before, flop), 'deal');
  const result = structuredClone(before);
  result.game.phase = 'result';
  assert.equal(onlineSoundEvent(before, result), 'action');
});

test('El inicio y la siguiente mano suenan una vez; cambiar de mesa no', () => {
  const started = room();
  assert.equal(onlineSoundEvent({ ...started, game: null }, started), 'deal');
  assert.equal(onlineSoundEvent(started, { ...started, id: 'otra-mesa' }), null);
  const next = structuredClone(started);
  next.game.number = 2;
  assert.equal(onlineSoundEvent(started, next), 'deal');
  assert.equal(onlineSoundEvent(next, started), null, 'una respuesta atrasada no repite el reparto');
  const rematch = structuredClone(started);
  rematch.tournamentId = 2;
  assert.equal(onlineSoundEvent(started, rematch), 'deal');
});
