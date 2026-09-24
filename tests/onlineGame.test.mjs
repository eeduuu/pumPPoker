import test from 'node:test';
import assert from 'node:assert/strict';
import { beginHand, canBegin, applyPlayerAction, forfeitPlayer, advanceExpiredTurn, publicGame, voteRematch, resolveRematch, REMATCH_WAIT_MS, BUY_IN } from '../server/game.mjs';
import { revealedEquityPercentages } from '../src/poker/equity.ts';

const player = (seat, id) => ({ seat, id, name: id, token: id });
const room = (humans, bots = 0, maxPlayers = 2) => ({
  id: 'test', name: 'Prueba', code: '1234567890', maxPlayers, botCount: bots, turnSeconds: 15,
  isPrivate: false, status: 'waiting', players: humans, botProfiles: Array.from({ length: bots }, () => 2),
});

test('Una persona y dos bots inician mano real con baraja legal y cartas privadas', () => {
  const table = room([player(0, 'host')], 2, 3);
  assert.equal(canBegin(table), true);
  beginHand(table);
  assert.equal(table.status, 'playing');
  assert.equal(table.game.hand.players.filter(seat => seat.cards.length === 2).length, 3);
  const ids = table.game.hand.players.flatMap(seat => seat.cards.map(card => card.id));
  assert.equal(new Set(ids).size, 6);
  const host = publicGame(table, 'host');
  assert.equal(host.seats.find(seat => seat.id === 'host').cards.length, 2);
  assert.equal(host.seats.filter(seat => seat.isBot).every(seat => seat.cards === null), true);
  assert.equal(JSON.stringify(host).includes('deck'), false);
});

test('Dos personas empiezan al entrar la segunda; el servidor no filtra cartas ajenas ni acepta acciones fuera de turno', () => {
  const table = room([player(0, 'host')]);
  assert.equal(canBegin(table), false);
  table.players.push(player(1, 'guest'));
  beginHand(table);
  const host = publicGame(table, 'host');
  const guest = publicGame(table, 'guest');
  assert.equal(host.toCall, Math.max(0, table.game.betting.bet - table.game.betting.players[0].committed));
  assert.equal(guest.toCall, Math.max(0, table.game.betting.bet - table.game.betting.players[1].committed));
  assert.equal(host.seats.find(seat => seat.id === 'guest').cards, null);
  assert.equal(guest.seats.find(seat => seat.id === 'host').cards, null);
  const actorId = table.players.find(person => person.seat === table.game.betting.actor).id;
  const otherId = actorId === 'host' ? 'guest' : 'host';
  assert.throws(() => applyPlayerAction(table, otherId, 'fold'), /No es tu turno/);
  assert.throws(() => applyPlayerAction(table, actorId, 'raise', 999_999), /Subida ilegal/);
  assert.equal(table.game.phase, 'playing');
});

test('Bots y temporizadores completan la mano, conservan fichas y preparan otra', () => {
  const table = room([player(0, 'host')], 2, 2);
  beginHand(table);
  let ticks = 0;
  while (table.game.phase !== 'result' && ticks++ < 100) {
    if (table.game.betting.actor === 0) {
      const action = publicGame(table, 'host').toCall ? 'call' : 'check';
      applyPlayerAction(table, 'host', action);
    } else advanceExpiredTurn(table, Number.MAX_SAFE_INTEGER);
    if (table.game.phase === 'playing') assert.equal(table.game.betting.players.reduce((sum, seat) => sum + seat.stack, 0) + table.game.betting.pot, 3 * BUY_IN);
  }
  assert.equal(table.game.phase, 'result');
  assert.equal(table.game.betting.players.reduce((sum, seat) => sum + seat.stack, 0), 3 * BUY_IN);
  assert.ok(table.game.result.payouts.some(amount => amount > 0));
  const oldNumber = table.game.number;
  advanceExpiredTurn(table, Number.MAX_SAFE_INTEGER);
  assert.equal(table.game.number, oldNumber + 1);
  assert.equal(table.game.hand.deck.length, 52);
});

test('Una persona que abandona se retira de su mano sin bloquear turnos ni conservar cartas', () => {
  const table = room([player(0, 'host'), player(1, 'guest')]);
  beginHand(table);
  forfeitPlayer(table, 1);
  assert.equal(table.game.phase, 'result');
  assert.equal(table.game.betting.players[1].folded, true);
  table.players.splice(1, 1);
  assert.equal(publicGame(table, 'host').seats.some(seat => seat.id === 'guest'), false);
});

test('La sala aplica fichas, ciegas y subida gradual al comenzar la mano siguiente', () => {
  const table = { ...room([player(0, 'host')], 1), chips: 5000, small: 25, big: 50, mode: 'normal', growing: true, minutes: 1 };
  beginHand(table);
  assert.equal(table.game.hand.players[0].stack + table.game.hand.players[0].committed, 5000);
  assert.equal(table.game.bigAmount, 50);
  table.game.phase = 'result';
  table.game.deadline = Date.now() - 1;
  table.clockStartedAt = Date.now() - 61_000;
  advanceExpiredTurn(table);
  assert.equal(table.game.number, 2);
  assert.equal(table.game.bigAmount, 75);
  assert.equal(table.game.smallAmount, 25);
  assert.equal(publicGame(table, 'host').clock.enabled, true);
});

test('El descanso espera al final de la mano y detiene el reloj antes del próximo reparto', () => {
  const table = { ...room([player(0, 'host')], 1), mode: 'tournament', growing: true, breaks: true, minutes: 1, every: 1, rest: 1 };
  beginHand(table);
  table.game.phase = 'result';
  table.game.deadline = Date.now() - 1;
  table.clockStartedAt = Date.now() - 61_000;
  advanceExpiredTurn(table);
  assert.equal(table.game.number, 1);
  assert.ok(table.breakUntil > Date.now());
  assert.equal(table.clockStartedAt, null);
  advanceExpiredTurn(table, table.breakUntil + 1);
  assert.equal(table.game.number, 2);
  assert.equal(table.game.bigAmount, 150);
  assert.equal(table.breakUntil, 0);
});

test('El tiempo agotado retira a la persona incluso cuando podía pasar gratis', () => {
  const table = { ...room([player(0, 'host'), player(1, 'guest')]), mode: 'tournament' };
  beginHand(table);
  const seat = table.game.betting.actor;
  const id = table.players.find(person => person.seat === seat).id;
  // Simulate a street where the acting player owes nothing.
  table.game.betting.players[seat].committed = table.game.betting.bet;
  assert.equal(publicGame(table, id).toCall, 0);
  advanceExpiredTurn(table, Number.MAX_SAFE_INTEGER);
  assert.equal(table.game.betting.players[seat].folded, true);
});

test('Un all-in revela flop, turn y river por separado antes del cobro y la eliminación', () => {
  const table = { ...room([player(0, 'host'), player(1, 'guest')]), mode: 'tournament', chips: 100, small: 5, big: 10 };
  beginHand(table);
  let actor = table.game.betting.actor;
  applyPlayerAction(table, table.players[actor].id, 'raise', table.game.betting.players[actor].stack);
  actor = table.game.betting.actor;
  applyPlayerAction(table, table.players[actor].id, 'call');
  assert.equal(table.game.phase, 'playing');
  assert.equal(table.game.pendingStreet, true);
  let view = publicGame(table, 'host');
  assert.equal(view.board.length, 0);
  assert.equal(view.runout, true);
  assert.equal(view.seats.find(seat => seat.id === 'guest').cards.length, 2);
  assert.equal(revealedEquityPercentages(view.seats.map(seat => seat.cards), view.board, 100).reduce((sum, value) => sum + value), 100);
  assert.deepEqual(table.eliminated || [], []);
  for (const count of [3, 4, 5]) {
    advanceExpiredTurn(table, Number.MAX_SAFE_INTEGER);
    assert.equal(table.game.phase, 'playing');
    view = publicGame(table, 'host');
    assert.equal(view.board.length, count);
    assert.equal(view.seats.find(seat => seat.id === 'guest').cards.length, 2);
    assert.equal(revealedEquityPercentages(view.seats.map(seat => seat.cards), view.board, 100).reduce((sum, value) => sum + value), 100);
    assert.equal(table.game.pendingStreet, true);
    assert.deepEqual(table.eliminated || [], []);
  }
  advanceExpiredTurn(table, Number.MAX_SAFE_INTEGER);
  assert.equal(table.game.phase, 'result');
  assert.equal(table.game.pendingStreet, false);
  assert.equal(table.game.result.payouts.reduce((sum, payout) => sum + payout, 0), 200);
  assert.equal(table.eliminated?.length || 0, table.game.result.payouts.filter(payout => payout === 0).length);
});

test('Los eliminados conservan cero fichas y su estado visible para el espectador', () => {
  const table = { ...room([player(0, 'host')], 3, 2), mode: 'tournament', eliminated: [0, 2], stacks: [0, 0, 0, 10000, 10000] };
  beginHand(table);
  const view = publicGame(table, 'host');
  assert.equal(view.seats.find(seat => seat.id === 'host').stack, 0);
  assert.equal(view.seats.find(seat => seat.id === 'host').eliminated, true);
  assert.equal(view.seats.find(seat => seat.id === 'bot-1').stack, 0);
  assert.equal(view.seats.find(seat => seat.id === 'bot-1').eliminated, true);
});

test('Al aceptar todas las personas, la revancha comienza ya y reinicia fichas y niveles', () => {
  const table = { ...room([player(0, 'host'), player(1, 'guest')], 1), mode: 'tournament', status: 'finished', tournamentId: 1,
    winnerName: 'host', eliminated: [1, 2], stacks: [30000, 0, 0], clockElapsed: 120000 };
  assert.equal(voteRematch(table, 'host', 1000), false);
  assert.equal(table.rematch.deadline, 1000 + REMATCH_WAIT_MS);
  assert.deepEqual(table.rematch.accepted, ['host']);
  assert.equal(voteRematch(table, 'guest', 2000), true);
  assert.equal(table.status, 'playing');
  assert.equal(table.tournamentId, 2);
  assert.equal(table.rematch, null);
  assert.equal(table.clockElapsed, 0);
  assert.equal(table.game.number, 1);
  assert.equal(table.players.length, 2);
  assert.equal(table.joinLocked, true);
});

test('Tras 15 segundos solo siguen quienes aceptaron, más los bots previstos', () => {
  const table = { ...room([player(0, 'host'), player(1, 'guest'), player(2, 'third')], 1, 3), mode: 'tournament', status: 'finished', tournamentId: 1 };
  voteRematch(table, 'host', 1000);
  voteRematch(table, 'guest', 2000);
  assert.equal(resolveRematch(table, 1000 + REMATCH_WAIT_MS - 1), false);
  assert.equal(resolveRematch(table, 1000 + REMATCH_WAIT_MS), true);
  assert.deepEqual(table.players.map(person => person.id), ['host', 'guest']);
  assert.equal(table.status, 'playing');
  assert.equal(table.game.hand.players.filter(seat => seat.cards.length === 2).length, 3);
});

test('Sin dos participantes no arranca una revancha fantasma', () => {
  const table = { ...room([player(0, 'host'), player(1, 'guest')]), mode: 'tournament', status: 'finished' };
  voteRematch(table, 'host', 1000);
  assert.equal(resolveRematch(table, 1000 + REMATCH_WAIT_MS), false);
  assert.equal(table.status, 'finished');
  assert.equal(table.rematch.insufficient, true);
});
