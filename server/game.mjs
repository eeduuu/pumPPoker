import { createShuffledDeck, randomInt } from '../src/poker/deck.ts';
import { dealInitialHand } from '../src/poker/initialHand.ts';
import { createPreflop, act, forfeitSeat, startPostflop, toCall, canRaise, isAllInRunout } from '../src/poker/preflop.ts';
import { nextCommunity } from '../src/poker/streets.ts';
import { settle } from '../src/poker/showdown.ts';
import { botView, decideBot } from '../src/poker/basicBot.ts';
import { BOT_PROFILES } from '../src/poker/botProfiles.ts';
import { continuingHand } from '../src/poker/nextHand.ts';
import { breakDue, nextBreakElapsedMs, scheduledBlindLevel } from '../src/poker/levels.ts';

export const SMALL_BLIND = 50;
export const BIG_BLIND = 100;
export const BUY_IN = 10_000;
const BOT_DELAY_MS = 850;
const STREET_REVEAL_DELAY_MS = 900;
const RESULT_DELAY_MS = 4_500;
const RESULT_REVEAL_PAUSE_MS = 900;
const ELIMINATION_DELAY_MS = 3_100;
export const REMATCH_WAIT_MS = 15_000;
const chipsFor = room => room.chips ?? BUY_IN;
const initialLevel = room => ({ number: 1, small: room.small ?? SMALL_BLIND, big: room.big ?? BIG_BLIND });
const levelDuration = room => (room.minutes ?? 10) * 60_000;
const growing = room => room.mode === 'tournament' || room.growing === true;
const elapsedClock = (room, now = Date.now()) => (room.clockElapsed || 0) + (room.clockStartedAt == null ? 0 : Math.max(0, now - room.clockStartedAt));
function nextLevel(room, elapsed) {
  return scheduledBlindLevel(initialLevel(room), elapsed, levelDuration(room), growing(room), chipsFor(room) * (room.maxPlayers + room.botCount));
}

const botSeat = (room, seat) => seat >= room.maxPlayers && seat < room.maxPlayers + room.botCount;
const occupiedSeats = room => new Set([
  ...room.players.map(player => player.seat),
  ...Array.from({ length: room.botCount }, (_, index) => room.maxPlayers + index),
]);

export function canBegin(room) { return occupiedSeats(room).size >= 2; }

function stacksForNextHand(room) {
  const occupied = occupiedSeats(room);
  return Array.from({ length: room.maxPlayers + room.botCount }, (_, seat) =>
    occupied.has(seat) && !(room.mode === 'tournament' && room.eliminated?.includes(seat)) ? room.players.find(player => player.seat === seat)?.pendingHand ? chipsFor(room) : room.stacks?.[seat] || chipsFor(room) : 0);
}

function deadlineFor(room) {
  const game = room.game;
  if (game.phase === 'result') return Date.now() + Math.max(RESULT_DELAY_MS, RESULT_REVEAL_PAUSE_MS + (game.newlyEliminated?.length || 0) * ELIMINATION_DELAY_MS + 500);
  if (game.betting.actor === null) return Date.now() + BOT_DELAY_MS;
  return Date.now() + (botSeat(room, game.betting.actor) ? BOT_DELAY_MS : room.turnSeconds * 1000);
}

function complete(room) {
  const game = room.game;
  if (game.betting.status === 'preflop-complete') {
    // Each street gets its own broadcast. Otherwise an all-in can jump from
    // two private cards straight to the payout and elimination in one frame.
    game.pendingStreet = true;
    game.deadline = Date.now() + STREET_REVEAL_DELAY_MS;
    return;
  }
  if (game.betting.status === 'uncontested') {
    game.result = { pot: game.lastPot, payouts: game.betting.players.map(player => player.seat === game.betting.winner ? game.lastPot : 0), pots: [], hands: [] };
    game.phase = 'result';
  }
  if (game.phase === 'result') {
    room.stacks = game.betting.players.map(player => player.stack);
    if (room.mode === 'tournament') {
      const previous = new Set(room.eliminated || []);
      game.newlyEliminated = game.hand.players.filter(player => player.cards.length === 2 && room.stacks[player.seat] === 0 && !previous.has(player.seat)).map(player => player.seat);
      room.eliminated = [...previous, ...game.newlyEliminated];
      // A person who joined during this hand has no cards yet, but still has
      // their full buy-in waiting for the next hand.
      const nextStacks = stacksForNextHand(room);
      const survivors = [...occupiedSeats(room)].filter(seat => nextStacks[seat] > 0);
      if (survivors.length === 1) {
        room.winnerSeat = survivors[0];
        room.winnerName = room.players.find(player => player.seat === room.winnerSeat)?.name || `Bot ${room.winnerSeat - room.maxPlayers + 1}`;
        room.status = 'finished';
        room.finishedAt = Date.now();
      }
    }
  }
  game.deadline = room.status === 'finished' ? 0 : deadlineFor(room);
}

function revealNextStreet(room) {
  const game = room.game;
  game.pendingStreet = false;
  if (game.community.street < 3) {
    game.community = nextCommunity(game.hand, game.community);
    game.betting = startPostflop(game.betting, game.hand.dealer, game.bigAmount ?? BIG_BLIND);
  } else {
    const pot = game.betting.pot;
    const result = settle(game.hand, game.betting, game.community.cards);
    game.betting = result.betting;
    game.result = { pot, payouts: result.payouts, pots: result.pots,
      hands: result.ranks.map(rank => rank?.name || null) };
    game.phase = 'result';
  }
  complete(room);
}

export function beginHand(room, now = Date.now()) {
  if (room.status === 'finished') return;
  if (!canBegin(room)) { room.game = null; room.status = 'waiting'; return; }
  if (room.breakUntil && now < room.breakUntil) return;
  const resumedFromBreak = !!room.breakUntil;
  if (resumedFromBreak) { room.breakUntil = 0; room.clockStartedAt = now; }
  if (room.clockStartedAt == null) { room.clockElapsed = room.clockElapsed || 0; room.clockStartedAt = now; }
  const duration = levelDuration(room);
  const limit = nextBreakElapsedMs(room.mode ?? 'normal', growing(room), room.breaks === true, room.every ?? 3, room.level?.number || 1, duration);
  const elapsed = Math.min(elapsedClock(room, now), limit);
  const level = nextLevel(room, elapsed);
  if (!resumedFromBreak && room.game?.phase === 'result' && breakDue(room.mode ?? 'normal', room.breaks === true, room.every ?? 3, room.level?.number || 1, level.number)) {
    room.clockElapsed = limit; room.clockStartedAt = null;
    room.breakUntil = now + (room.rest ?? 5) * 60_000;
    room.game.deadline = room.breakUntil;
    return;
  }
  room.level = level;
  const stacks = stacksForNextHand(room);
  room.players.forEach(player => { player.pendingHand = false; });
  const previous = room.game?.hand;
  const live = [...stacks.keys()].filter(seat => stacks[seat] > 0);
  if (live.length < 2) { room.game = null; room.status = 'waiting'; return; }
  const hand = previous ? continuingHand(previous, stacks, level.small, level.big) :
    dealInitialHand(stacks, level.small, level.big, live[randomInt(live.length)], createShuffledDeck());
  room.game = { number: (room.game?.number || 0) + 1, phase: 'playing', hand,
    smallAmount: level.small, bigAmount: level.big, betting: createPreflop(hand, level.big), community: { street: 0, cards: [], cursor: hand.cursor },
    deadline: 0, lastPot: hand.pot, result: null };
  room.status = 'playing';
  complete(room);
}

export function applyPlayerAction(room, playerId, action, amount = 0) {
  const player = room.players.find(entry => entry.id === playerId);
  const game = room.game;
  if (!player || !game || game.phase !== 'playing' || game.betting.actor !== player.seat) throw new Error('No es tu turno.');
  if (Date.now() >= game.deadline) throw new Error('El tiempo del turno ha terminado.');
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Cantidad inválida.');
  game.lastPot = game.betting.pot;
  game.betting = act(game.betting, player.seat, action, amount);
  complete(room);
}

export function forfeitPlayer(room, seat) {
  const game = room.game;
  if (!game || game.phase !== 'playing' || game.betting.players[seat]?.folded) return;
  game.lastPot = game.betting.pot;
  game.betting = forfeitSeat(game.betting, seat);
  complete(room);
}

export function advanceExpiredTurn(room, now = Date.now()) {
  const game = room.game;
  if (!game || room.status === 'finished' || now < game.deadline) return false;
  if (game.phase === 'result') { beginHand(room, now); return true; }
  if (game.pendingStreet) { revealNextStreet(room); return true; }
  const seat = game.betting.actor;
  if (seat === null) { complete(room); return true; }
  let action;
  if (botSeat(room, seat)) {
    const profile = BOT_PROFILES[room.botProfiles?.[seat - room.maxPlayers] ?? (seat % BOT_PROFILES.length)];
    action = decideBot(botView(game.hand, game.betting, seat, game.community.cards, game.bigAmount ?? BIG_BLIND), profile);
  } else action = { action: 'fold', amount: 0 };
  game.lastPot = game.betting.pot;
  game.betting = act(game.betting, seat, action.action, action.amount);
  complete(room);
  return true;
}

export function publicGame(room, viewerId) {
  const game = room.game;
  if (!game) return null;
  const runout = game.phase === 'playing' && isAllInRunout(game.betting);
  const viewer = room.players.find(player => player.id === viewerId && !player.pendingHand);
  const humanBySeat = new Map(room.players.filter(player => !player.pendingHand).map(player => [player.seat, player]));
  const seats = game.betting.players.map((bet, seat) => {
    const human = humanBySeat.get(seat);
    const active = game.hand.players[seat].cards.length === 2;
    const showCards = active && (viewer?.seat === seat || ((game.phase === 'result' || runout) && !bet.folded));
    return { seat, id: human?.id || (botSeat(room, seat) ? `bot-${seat - room.maxPlayers + 1}` : null),
      name: human?.name || (botSeat(room, seat) ? `Bot ${seat - room.maxPlayers + 1}` : ''),
      isBot: botSeat(room, seat), active, folded: bet.folded, eliminated: room.mode === 'tournament' && (room.eliminated || []).includes(seat),
      stack: !active && human ? room.eliminated?.includes(seat) ? 0 : room.stacks?.[seat] || chipsFor(room) : bet.stack,
      committed: bet.committed, contributed: game.betting.contributed[seat],
      cards: showCards ? game.hand.players[seat].cards : null,
      payout: game.result?.payouts[seat] || 0 };
  }).filter(seat => seat.id);
  const duration = levelDuration(room);
  const breakLimit = nextBreakElapsedMs(room.mode ?? 'normal', growing(room), room.breaks === true, room.every ?? 3, room.level?.number || 1, duration);
  return { number: game.number, phase: game.phase, runout, street: game.community.street, newlyEliminated: game.newlyEliminated || [],
    smallAmount: game.smallAmount ?? SMALL_BLIND, bigAmount: game.bigAmount ?? BIG_BLIND,
    clock: { enabled: growing(room), duration, elapsed: room.clockElapsed || 0, startedAt: room.clockStartedAt || null,
      breakLimit: Number.isFinite(breakLimit) ? breakLimit : null, breakUntil: room.breakUntil || null },
    board: game.community.cards, pot: game.phase === 'result' ? game.result?.pot || 0 : game.betting.pot,
    actor: game.betting.actor, deadline: game.deadline, dealer: game.hand.dealer,
    smallBlind: game.hand.smallBlind, bigBlind: game.hand.bigBlind,
    bet: game.betting.bet, minRaise: game.betting.minRaise,
    toCall: viewer && game.betting.players[viewer.seat] && !game.betting.players[viewer.seat].folded ? toCall(game.betting, viewer.seat) : 0,
    canRaise: viewer ? canRaise(game.betting, viewer.seat) : false,
    result: game.result, seats };
}

export function voteRematch(room, playerId, now = Date.now()) {
  if (room.status !== 'finished' || !room.players.some(player => player.id === playerId)) throw new Error('La repetición solo se puede pedir al terminar el torneo.');
  if (!room.rematch || room.rematch.insufficient) room.rematch = { deadline: now + REMATCH_WAIT_MS, accepted: [] };
  if (!room.rematch.accepted.includes(playerId)) room.rematch.accepted.push(playerId);
  return resolveRematch(room, now);
}

export function resolveRematch(room, now = Date.now()) {
  if (room.status !== 'finished' || !room.rematch || room.rematch.insufficient) return false;
  const allAccepted = room.players.every(player => room.rematch.accepted.includes(player.id));
  if (!allAccepted && now < room.rematch.deadline) return false;
  const accepted = new Set(room.rematch.accepted);
  if (accepted.size + room.botCount < 2) {
    room.rematch = { deadline: 0, accepted: [...accepted], insufficient: true };
    return false;
  }
  room.players = room.players.filter(player => accepted.has(player.id));
  room.hostId = room.players.some(player => player.id === room.hostId) ? room.hostId : room.players[0]?.id || null;
  room.stacks = undefined; room.eliminated = []; room.clockElapsed = 0; room.clockStartedAt = null;
  room.breakUntil = 0; room.level = undefined; room.game = null; room.rematch = null;
  room.winnerSeat = null; room.winnerName = null; room.finishedAt = null;
  room.joinLocked = true;
  room.tournamentId = (room.tournamentId || 1) + 1;
  room.status = 'waiting';
  beginHand(room, now);
  return true;
}
