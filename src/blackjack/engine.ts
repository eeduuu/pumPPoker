import { createDeck, shuffle } from '../poker/deck.ts';
import type { Card } from '../poker/deck.ts';

export type BlackjackAction = 'hit' | 'stand' | 'double' | 'split' | 'surrender';
export type BlackjackPhase = 'betting' | 'insurance' | 'playing' | 'result';
export type HandOutcome = 'win' | 'lose' | 'push' | 'blackjack' | 'bust' | 'surrender';
export type Hand = { cards: Card[]; bet: number; done: boolean; split: boolean; splitAces: boolean; surrendered: boolean; outcome?: HandOutcome; paid?: number };
export type Seat = { id: string; name: string; bot: boolean; style: 'prudente' | 'atrevido' | null; bankroll: number; hands: Hand[]; insurance: number };
export type PresentationStep = { seats: Seat[]; dealer: Card[]; revealDealer: boolean; phase: BlackjackPhase; actor: number; handIndex: number; title: string; kind: 'deal' | 'action' | 'turn' | 'reveal' | 'result'; duration: number };
export type BlackjackGame = { seats: Seat[]; dealer: Card[]; shoe: Card[]; cursor: number; round: number; phase: BlackjackPhase; actor: number; handIndex: number; minBet: number; buyIn: number; message: string; revealDealer: boolean; presentation: PresentationStep[] };

function capture(game: BlackjackGame, title: string, kind: PresentationStep['kind'], duration: number) {
  // Display snapshots omit shoe order. The UI keeps the dealer's second card
  // face down until revealDealer becomes true.
  game.presentation.push({ seats: structuredClone(game.seats), dealer: [...game.dealer], revealDealer: game.revealDealer, phase: game.phase, actor: game.actor, handIndex: game.handIndex, title, kind, duration });
}

export function createShoe(): Card[] {
  return shuffle(Array.from({ length: 6 }, (_, deck) => createDeck().map(card => ({ ...card, id: `${deck}-${card.id}` }))).flat());
}

export function total(cards: readonly Card[]): { value: number; soft: boolean } {
  let value = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === 14) { aces++; value++; }
    else value += Math.min(card.rank, 10);
  }
  let soft = false;
  if (aces && value + 10 <= 21) { value += 10; soft = true; }
  return { value, soft };
}

export function isNatural(hand: Hand): boolean {
  return !hand.split && hand.cards.length === 2 && total(hand.cards).value === 21;
}

export function createGame(name: string, buyIn: number, botCount: number, shoe = createShoe()): BlackjackGame {
  if (!Number.isInteger(buyIn) || buyIn < 50 || buyIn > 5000 || !Number.isInteger(botCount) || botCount < 0 || botCount > 2) throw new RangeError('Configuración de blackjack inválida.');
  const seats: Seat[] = [{ id: 'human', name, bot: false, style: null, bankroll: buyIn, hands: [], insurance: 0 }];
  for (let i = 1; i <= botCount; i++) seats.push({ id: `bot-${i}`, name: `Bot ${i}`, bot: true, style: i % 2 ? 'prudente' : 'atrevido', bankroll: buyIn, hands: [], insurance: 0 });
  return { seats, dealer: [], shoe, cursor: 0, round: 0, phase: 'betting', actor: 0, handIndex: 0, minBet: 5, buyIn, message: 'Elige tu apuesta para empezar.', revealDealer: false, presentation: [] };
}

function draw(game: BlackjackGame): Card {
  const card = game.shoe[game.cursor++];
  if (!card) throw new Error('El zapato se ha agotado; no se reparten cartas repetidas.');
  return card;
}

function freshShoe(game: BlackjackGame) {
  // Only between rounds. The discard pile never re-enters a hand.
  if (game.shoe.length - game.cursor < 90) { game.shoe = createShoe(); game.cursor = 0; }
}

function emptyHand(bet: number): Hand { return { cards: [], bet, done: false, split: false, splitAces: false, surrendered: false }; }

// From the player's view, first base is on the right. The human seat stays
// centered visually and at index 0 in state; only the table order changes.
function tableOrder(game: BlackjackGame): number[] {
  const bots = game.seats.flatMap((seat, index) => seat.bot ? [index] : []);
  return bots.length === 2 ? [bots[1], 0, bots[0]] : bots.length === 1 ? [bots[0], 0] : [0];
}

export function startRound(previous: BlackjackGame, wager: number): BlackjackGame {
  if (previous.phase !== 'betting') throw new Error('La ronda anterior no ha terminado.');
  if (!Number.isInteger(wager) || wager < previous.minBet || wager > previous.seats[0].bankroll) throw new RangeError('Apuesta fuera de límites.');
  const game = structuredClone(previous);
  game.presentation = [];
  freshShoe(game);
  game.round++;
  game.dealer = [];
  game.revealDealer = false;
  game.seats.forEach((seat, index) => {
    const bet = index === 0 ? wager : Math.min(seat.bankroll, seat.style === 'atrevido' ? 10 : 5);
    seat.hands = bet >= game.minBet ? [emptyHand(bet)] : [];
    seat.insurance = 0;
    if (seat.hands.length) seat.bankroll -= bet;
  });
  // First base (right), center, left, then dealer; repeated from one shoe.
  for (let pass = 0; pass < 2; pass++) {
    for (const index of tableOrder(game)) {
      const seat = game.seats[index];
      if (!seat.hands.length) continue;
      seat.hands[0].cards.push(draw(game));
      capture(game, `Carta para ${seat.name}`, 'deal', 310);
    }
    game.dealer.push(draw(game));
    capture(game, 'Carta para el crupier', 'deal', 360);
  }
  for (const seat of game.seats) if (seat.hands.length && isNatural(seat.hands[0])) seat.hands[0].done = true;
  game.actor = tableOrder(game)[0];
  game.handIndex = 0;
  if (game.dealer[0].rank === 14) {
    game.phase = 'insurance';
    game.message = 'El crupier muestra un as. ¿Quieres seguro?';
    capture(game, 'Seguro disponible', 'turn', 280);
  } else if (total(game.dealer).value === 21) {
    settle(game);
  } else {
    game.phase = 'playing';
    advance(game);
  }
  return game;
}

export function chooseInsurance(previous: BlackjackGame, insured: boolean): BlackjackGame {
  if (previous.phase !== 'insurance') throw new Error('El seguro no está disponible.');
  const game = structuredClone(previous);
  game.presentation = [];
  const player = game.seats[0];
  const premium = player.hands[0].bet / 2;
  if (insured) {
    if (player.bankroll < premium) throw new RangeError('No hay fichas suficientes para el seguro.');
    player.bankroll -= premium;
    player.insurance = premium;
  }
  capture(game, insured ? 'Seguro tomado' : 'Sin seguro', 'action', 340);
  if (total(game.dealer).value === 21) settle(game);
  else { game.phase = 'playing'; advance(game); }
  return game;
}

export function availableActions(game: BlackjackGame): BlackjackAction[] {
  if (game.phase !== 'playing' || game.actor !== 0) return [];
  const seat = game.seats[0];
  const hand = seat.hands[game.handIndex];
  if (!hand || hand.done) return [];
  const actions: BlackjackAction[] = ['hit', 'stand'];
  if (hand.cards.length === 2 && !hand.splitAces) {
    if (seat.bankroll >= hand.bet) actions.push('double');
    if (!hand.split && seat.hands.length === 1 && seat.bankroll >= hand.bet && Math.min(hand.cards[0].rank, 10) === Math.min(hand.cards[1].rank, 10)) actions.push('split');
    if (!hand.split) actions.push('surrender');
  }
  return actions;
}

function applyAction(game: BlackjackGame, action: BlackjackAction) {
  const seat = game.seats[game.actor];
  const hand = seat.hands[game.handIndex];
  if (action === 'stand') hand.done = true;
  if (action === 'hit') {
    hand.cards.push(draw(game));
    if (total(hand.cards).value >= 21) hand.done = true;
  }
  if (action === 'double') {
    seat.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.cards.push(draw(game));
    hand.done = true;
  }
  if (action === 'surrender') { hand.surrendered = true; hand.done = true; }
  if (action === 'split') {
    seat.bankroll -= hand.bet;
    const second = emptyHand(hand.bet);
    second.split = true;
    second.splitAces = hand.cards[0].rank === 14;
    second.cards = [hand.cards.pop()!];
    hand.split = true;
    hand.splitAces = second.splitAces;
    hand.cards.push(draw(game));
    second.cards.push(draw(game));
    if (hand.splitAces || total(hand.cards).value === 21) hand.done = true;
    if (second.splitAces || total(second.cards).value === 21) second.done = true;
    seat.hands.push(second);
  }
}

function botAction(hand: Hand, upcard: Card, bankroll: number, style: Seat['style']): BlackjackAction {
  // Only the public upcard and this bot's own hand are passed in. The hole card
  // and shoe order are intentionally inaccessible to the strategy.
  const points = total(hand.cards).value;
  const dealerStrong = upcard.rank >= 7 || upcard.rank === 14;
  if (hand.cards.length === 2 && bankroll >= hand.bet && points === 11) return 'double';
  if (points >= (style === 'atrevido' ? 18 : 17)) return 'stand';
  if (points <= 11) return 'hit';
  if (points <= 16 && dealerStrong) return 'hit';
  return 'stand';
}

function advance(game: BlackjackGame) {
  let steps = 0;
  const order = tableOrder(game);
  while (game.phase === 'playing') {
    if (++steps > 250) throw new Error('Demasiadas acciones en una sola mano.');
    const seat = game.seats[game.actor];
    const hand = seat?.hands[game.handIndex];
    if (hand && !hand.done) {
      if (!seat.bot) { game.message = `Turno de ${seat.name}`; capture(game, 'Tu turno', 'turn', 260); return; }
      capture(game, `Turno de ${seat.name}`, 'turn', 440);
      const decision = botAction(hand, game.dealer[0], seat.bankroll, seat.style);
      applyAction(game, decision);
      capture(game, `${seat.name} ${decision === 'hit' ? 'pide carta' : decision === 'stand' ? 'se planta' : decision === 'double' ? 'dobla' : decision === 'split' ? 'separa' : 'se rinde'}`, decision === 'hit' || decision === 'double' || decision === 'split' ? 'deal' : 'action', 560);
      if (!hand.done) continue;
    }
    game.handIndex++;
    if (game.handIndex >= (seat?.hands.length || 0)) {
      const next = order[order.indexOf(game.actor) + 1];
      if (next === undefined) { settle(game); return; }
      game.actor = next;
      game.handIndex = 0;
    }
  }
}

export function act(previous: BlackjackGame, action: BlackjackAction): BlackjackGame {
  if (!availableActions(previous).includes(action)) throw new Error('Acción no disponible.');
  const game = structuredClone(previous);
  game.presentation = [];
  applyAction(game, action);
  capture(game, action === 'hit' ? 'Pides carta' : action === 'stand' ? 'Te plantas' : action === 'double' ? 'Doblas' : action === 'split' ? 'Separas la mano' : 'Te rindes', action === 'hit' || action === 'double' || action === 'split' ? 'deal' : 'action', 460);
  advance(game);
  return game;
}

function settle(game: BlackjackGame) {
  game.revealDealer = true;
  capture(game, 'El crupier descubre su carta', 'reveal', 600);
  const dealerNatural = game.dealer.length === 2 && total(game.dealer).value === 21;
  const contenders = game.seats.some(seat => seat.hands.some(hand => !hand.surrendered && total(hand.cards).value <= 21 && !isNatural(hand)));
  if (!dealerNatural && contenders) {
    while (total(game.dealer).value < 17) {
      game.dealer.push(draw(game));
      capture(game, 'El crupier pide carta', 'deal', 540);
    }
    // Stand on every 17, including soft 17.
  }
  const dealerPoints = total(game.dealer).value;
  for (const seat of game.seats) {
    if (seat.insurance && dealerNatural) seat.bankroll += seat.insurance * 3;
    for (const hand of seat.hands) {
      const points = total(hand.cards).value;
      let paid = 0;
      let outcome: HandOutcome;
      if (hand.surrendered) { outcome = 'surrender'; paid = hand.bet / 2; }
      else if (points > 21) outcome = 'bust';
      else if (isNatural(hand) && !dealerNatural) { outcome = 'blackjack'; paid = hand.bet * 2.5; }
      else if (dealerNatural && isNatural(hand)) { outcome = 'push'; paid = hand.bet; }
      else if (dealerNatural) outcome = 'lose';
      else if (dealerPoints > 21 || points > dealerPoints) { outcome = 'win'; paid = hand.bet * 2; }
      else if (points === dealerPoints) { outcome = 'push'; paid = hand.bet; }
      else outcome = 'lose';
      seat.bankroll += paid;
      hand.outcome = outcome;
      hand.paid = paid;
      hand.done = true;
    }
  }
  game.phase = 'result';
  game.message = dealerNatural ? 'Blackjack del crupier' : dealerPoints > 21 ? 'El crupier se pasa de 21' : `Crupier: ${dealerPoints}`;
  capture(game, 'Mano terminada', 'result', 380);
}

export function nextRound(previous: BlackjackGame): BlackjackGame {
  if (previous.phase !== 'result') throw new Error('Aún se está jugando.');
  const game = structuredClone(previous);
  game.presentation = [];
  game.phase = 'betting';
  game.message = game.seats[0].bankroll < game.minBet ? 'Te has quedado sin fichas.' : 'Elige tu apuesta para la siguiente mano.';
  game.seats.forEach(seat => { seat.hands = []; seat.insurance = 0; });
  game.seats = game.seats.filter(seat => !seat.bot || seat.bankroll >= game.minBet);
  game.dealer = [];
  game.revealDealer = false;
  return game;
}

export function addBot(previous: BlackjackGame): BlackjackGame {
  if (previous.phase !== 'betting') throw new Error('Solo puedes cambiar los asientos entre manos.');
  const game = structuredClone(previous);
  if (game.seats.filter(seat => seat.bot && seat.bankroll >= game.minBet).length >= 2) return game;
  const number = Math.max(0, ...game.seats.filter(seat => seat.bot).map(seat => Number(seat.id.slice(4)))) + 1;
  // A lone bot occupies first base on the right. Adding another fills the
  // vacant left seat so the existing bot does not visibly switch sides.
  game.seats.splice(1, 0, { id: `bot-${number}`, name: `Bot ${number}`, bot: true, style: number % 2 ? 'prudente' : 'atrevido', bankroll: game.buyIn, hands: [], insurance: 0 });
  return game;
}

export function removeBot(previous: BlackjackGame, id: string): BlackjackGame {
  if (previous.phase !== 'betting') throw new Error('Solo puedes cambiar los asientos entre manos.');
  const game = structuredClone(previous);
  game.seats = game.seats.filter(seat => !seat.bot || seat.id !== id);
  return game;
}
