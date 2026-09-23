import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { act, addBot, availableActions, chooseInsurance, createGame, createShoe, nextRound, startRound, total } from '../src/blackjack/engine.ts';

function rig(...cards) {
  const shoe = createShoe();
  cards.forEach(([rank, suit], index) => {
    const from = shoe.findIndex((card, position) => position >= index && card.rank === rank && card.suit === suit);
    assert.ok(from >= index);
    [shoe[index], shoe[from]] = [shoe[from], shoe[index]];
  });
  return shoe;
}

test('El zapato común contiene seis barajas completas sin repetir una carta física', () => {
  const shoe = createShoe();
  assert.equal(shoe.length, 312);
  assert.equal(new Set(shoe.map(card => card.id)).size, 312);
  for (let deck = 0; deck < 6; deck++) assert.equal(shoe.filter(card => card.id.startsWith(`${deck}-`)).length, 52);
});

test('Los ases valen 1 u 11 y el crupier se planta también en 17 suave', () => {
  assert.deepEqual(total([{ rank: 14 }, { rank: 6 }]), { value: 17, soft: true });
  assert.deepEqual(total([{ rank: 14 }, { rank: 14 }, { rank: 9 }]), { value: 21, soft: true });
  assert.deepEqual(total([{ rank: 14 }, { rank: 9 }, { rank: 5 }]), { value: 15, soft: false });
});

test('Una mano suave muestra ambas opciones solo hasta que se planta', async () => {
  const game = startRound(createGame('Tú', 100, 0, rig([14, 'hearts'], [8, 'spades'], [9, 'hearts'], [7, 'clubs'], [5, 'diamonds'])), 10);
  assert.deepEqual(total(game.seats[0].hands[0].cards), { value: 20, soft: true });
  assert.equal(game.seats[0].hands[0].done, false);
  const stood = act(game, 'stand');
  assert.equal(stood.presentation[0].title, 'Te plantas');
  assert.equal(stood.presentation[0].seats[0].hands[0].done, true);
  assert.deepEqual(total(stood.presentation[0].seats[0].hands[0].cards), { value: 20, soft: true });
  const source = await readFile(new URL('../src/BlackjackSoloHub.tsx', import.meta.url), 'utf8');
  assert.match(source, /!done && score\.soft && score\.value < 21/);
  assert.match(source, /scoreLabel\(hand\.cards, hand\.done\)/);
});

test('Pedir carta continúa el mismo turno y no repite su vibración', async () => {
  const game = startRound(createGame('Tú', 100, 0, rig([5, 'clubs'], [8, 'spades'], [6, 'diamonds'], [7, 'hearts'], [2, 'clubs'])), 10);
  const afterHit = act(game, 'hit');
  assert.equal(afterHit.round, game.round);
  assert.equal(afterHit.presentation.at(-1).title, 'Tu turno');
  const source = await readFile(new URL('../src/BlackjackSoloHub.tsx', import.meta.url), 'utf8');
  assert.match(source, /lastVibratedRound\.current !== game\.round/);
  assert.match(source, /lastVibratedRound\.current = game\.round;\s*haptic\('TURN_START'\)/);
  assert.match(source, /lastVibratedRound\.current = 0;/);
  assert.doesNotMatch(source, /haptic\('(GAME_START|WIN|RAISE)'\)/);
  assert.match(source, /if \(eliminatingSeat === 'human'\) haptic\('ELIMINATED'\)/);
});

test('Blackjack natural paga 3:2, incluido medio punto de ficha', () => {
  const game = startRound(createGame('Tú', 100, 0, rig([14, 'spades'], [9, 'clubs'], [13, 'hearts'], [7, 'diamonds'])), 5);
  assert.equal(game.phase, 'result');
  assert.equal(game.seats[0].hands[0].outcome, 'blackjack');
  assert.equal(game.seats[0].bankroll, 107.5);
});

test('Dos blackjack naturales empatan; seguro contra as devuelve 2:1 de beneficio', () => {
  const cards = rig([14, 'spades'], [14, 'clubs'], [13, 'hearts'], [10, 'diamonds']);
  const pending = startRound(createGame('Tú', 100, 0, cards), 10);
  assert.equal(pending.phase, 'insurance');
  const result = chooseInsurance(pending, true);
  assert.equal(result.seats[0].hands[0].outcome, 'push');
  assert.equal(result.seats[0].bankroll, 110);
});

test('Doblar descuenta otra apuesta y entrega una sola carta', () => {
  const game = startRound(createGame('Tú', 100, 0, rig([5, 'clubs'], [9, 'spades'], [6, 'hearts'], [7, 'diamonds'], [10, 'clubs'], [2, 'clubs'])), 10);
  assert.ok(availableActions(game).includes('double'));
  const result = act(game, 'double');
  assert.equal(result.phase, 'result');
  assert.equal(result.seats[0].hands[0].cards.length, 3);
  assert.equal(result.seats[0].hands[0].bet, 20);
  assert.equal(result.seats[0].bankroll, 120);
});

test('Separar crea dos manos y obliga a pagar la segunda apuesta', () => {
  const game = startRound(createGame('Tú', 100, 0, rig([8, 'clubs'], [6, 'spades'], [8, 'hearts'], [10, 'diamonds'], [3, 'clubs'], [2, 'hearts'])), 10);
  const split = act(game, 'split');
  assert.equal(split.phase, 'playing');
  assert.equal(split.seats[0].bankroll, 80);
  assert.equal(split.seats[0].hands.length, 2);
  assert.equal(split.seats[0].hands[0].cards.length, 2);
  assert.equal(split.seats[0].hands[1].cards.length, 2);
  assert.ok(!availableActions(split).includes('split'));
});

test('Las acciones disponibles mantienen las cuatro decisiones de la mesa', () => {
  const game = startRound(createGame('Tú', 100, 0, rig([10, 'clubs'], [9, 'spades'], [6, 'hearts'], [7, 'diamonds'])), 10);
  assert.deepEqual(availableActions(game), ['hit', 'stand', 'double']);
  assert.throws(() => act(game, 'surrender'));
});

test('Los bots usan el mismo zapato y cada carta entregada conserva un identificador único', () => {
  let game = startRound(createGame('Tú', 250, 2), 10);
  while (game.phase === 'playing') game = act(game, 'stand');
  if (game.phase === 'insurance') game = chooseInsurance(game, false);
  while (game.phase === 'playing') game = act(game, 'stand');
  const dealt = [...game.dealer, ...game.seats.flatMap(seat => seat.hands.flatMap(hand => hand.cards))];
  assert.equal(new Set(dealt.map(card => card.id)).size, dealt.length);
  assert.equal(game.cursor, dealt.length);
});

test('El crupier no pide con 17 suave y la segunda mano separada no cobra blackjack natural', () => {
  const soft = startRound(createGame('Tú', 100, 0, rig([10, 'clubs'], [14, 'spades'], [8, 'hearts'], [6, 'diamonds'])), 10);
  const softResult = chooseInsurance(soft, false);
  const afterStand = act(softResult, 'stand');
  assert.equal(afterStand.dealer.length, 2);
  assert.equal(afterStand.seats[0].hands[0].outcome, 'win');

  const pair = startRound(createGame('Tú', 100, 0, rig([14, 'clubs'], [6, 'spades'], [14, 'hearts'], [9, 'diamonds'], [9, 'clubs'], [10, 'hearts'])), 10);
  const split = act(pair, 'split');
  assert.equal(split.seats[0].hands.length, 2);
  assert.equal(split.seats[0].hands[0].done, true);
  assert.equal(split.seats[0].hands[1].done, true);
  assert.notEqual(split.seats[0].hands[1].outcome, 'blackjack');
});

test('Los asientos solo cambian entre manos y un bot nuevo entra con las fichas iniciales', () => {
  const base = createGame('Tú', 250, 1);
  const inPlay = startRound(base, 10);
  assert.throws(() => addBot(inPlay));
  const added = addBot(base);
  assert.equal(added.seats.length, 3);
  assert.equal(added.seats[1].name, 'Bot 2');
  assert.equal(added.seats[1].bankroll, 250);
  assert.equal(added.seats[2].name, 'Bot 1');
  assert.equal(startRound(added, 10).presentation[0].title, 'Carta para Bot 1');
  const finished = structuredClone(added);
  finished.phase = 'result';
  finished.seats[2].bankroll = 0;
  const next = nextRound(finished);
  assert.equal(next.seats.length, 2);
  assert.equal(next.seats[1].name, 'Bot 2');
});

test('La mesa reparte y decide de derecha a izquierda, sin poner siempre primero al usuario', () => {
  const shoe = rig(
    [5, 'clubs'], [10, 'clubs'], [9, 'clubs'], [6, 'clubs'],
    [8, 'hearts'], [7, 'hearts'], [8, 'diamonds'], [10, 'diamonds'],
    [5, 'spades'],
  );
  const first = startRound(createGame('Tú', 250, 2, shoe), 10);
  const deal = first.presentation.filter(step => step.kind === 'deal');
  assert.equal(deal.length, 8);
  assert.deepEqual(deal.map(step => step.title), [
    'Carta para Bot 2', 'Carta para Tú', 'Carta para Bot 1', 'Carta para el crupier',
    'Carta para Bot 2', 'Carta para Tú', 'Carta para Bot 1', 'Carta para el crupier',
  ]);
  assert.deepEqual(deal.map(step => step.seats.reduce((count, seat) => count + seat.hands.reduce((n, hand) => n + hand.cards.length, 0), 0) + step.dealer.length), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(deal.every(step => !step.revealDealer));
  assert.deepEqual(first.presentation.slice(8).map(step => step.title), ['Turno de Bot 2', 'Bot 2 se planta', 'Tu turno']);
  assert.equal(first.presentation.at(-1).title, 'Tu turno');

  const finished = act(first, 'stand');
  const titles = finished.presentation.map(step => step.title);
  assert.deepEqual(titles.slice(0, 3), ['Te plantas', 'Turno de Bot 1', 'Bot 1 se planta']);
  assert.ok(titles.indexOf('El crupier descubre su carta') > titles.indexOf('Bot 1 se planta'));
  assert.ok(titles.includes('El crupier pide carta'));
  assert.equal(finished.presentation.at(-1).kind, 'result');
  assert.deepEqual(finished.presentation.at(-1).seats, finished.seats);
  assert.deepEqual(finished.presentation.at(-1).dealer, finished.dealer);
});

test('Con un bot, ese asiento recibe y juega antes que el usuario; sin bots empieza el usuario', () => {
  const withBot = startRound(createGame('Tú', 100, 1, rig(
    [10, 'clubs'], [6, 'clubs'], [9, 'clubs'], [7, 'hearts'], [8, 'hearts'], [6, 'hearts'],
  )), 10);
  assert.deepEqual(withBot.presentation.slice(0, 3).map(step => step.title), ['Carta para Bot 1', 'Carta para Tú', 'Carta para el crupier']);
  assert.deepEqual(withBot.presentation.slice(6).map(step => step.title), ['Turno de Bot 1', 'Bot 1 se planta', 'Tu turno']);
  const solo = startRound(createGame('Tú', 100, 0, rig([6, 'clubs'], [9, 'clubs'], [8, 'hearts'], [6, 'hearts'])), 10);
  assert.equal(solo.presentation[0].title, 'Carta para Tú');
  assert.equal(solo.presentation.at(-1).title, 'Tu turno');
});

test('La apuesta repetida usa el mismo reparto al esperar o pulsar Siguiente mano', async () => {
  const source = await readFile(new URL('../src/BlackjackSoloHub.tsx', import.meta.url), 'utf8');
  assert.match(source, /const repeatCurrentBet = useCallback/);
  assert.match(source, /showTransition\(startRound\(nextRound\(finished\), wager\)\)/);
  assert.match(source, /window\.setTimeout\(\(\) => repeatCurrentBet\(game\), 1000\)/);
  assert.match(source, /if \(repeatBet && repeatCurrentBet\(game\)\) return;/);
  assert.match(source, /onClick=\{continueToNextHand\}>Siguiente mano/);
});

test('Al quedarse sin fichas se puede repetir la misma mesa o volver al lobby real', async () => {
  const [solo, app] = await Promise.all([
    readFile(new URL('../src/BlackjackSoloHub.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(solo, /const next = createGame\(playerName, buyIn, botCount\)/);
  assert.match(solo, /onClick=\{createTable\}>Repetir mesa/);
  assert.match(solo, /onClick=\{leaveToLobby\}>Volver al lobby/);
  assert.match(app, /onLobby=\{\(\)=>setScreen\('hub'\)\}/);
});

test('El logo conserva la imagen de marca y elimina su fondo negro', async () => {
  const logo = await readFile(new URL('../src/BrandLogo.tsx', import.meta.url), 'utf8');
  assert.match(logo, /<svg className="brand-logo"/);
  assert.match(logo, /<feColorMatrix in="SourceGraphic"/);
  assert.match(logo, /filter="url\(#brand-transparent-background\)"/);
});
