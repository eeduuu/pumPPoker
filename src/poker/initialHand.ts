import { createDeck, createShuffledDeck, randomInt } from './deck.ts';
import type { Card } from './deck.ts';
import { validStartingBlinds } from './levels.ts';
export function positions(count: number, dealer: number) {
 if (!Number.isInteger(count) || count < 2 || count > 9 || !Number.isInteger(dealer) || dealer < 0 || dealer >= count) throw new RangeError('Asientos inválidos');
 const smallBlind = count === 2 ? dealer : (dealer + 1) % count;
 const bigBlind = (smallBlind + 1) % count;
 return { dealer, smallBlind, bigBlind, firstPreflop: count === 2 ? dealer : (bigBlind + 1) % count, firstPostflop: (dealer + 1) % count };
}
// Rotation for an unchanged roster only; elimination transitions are not implemented.
export function nextDealer(count: number, dealer: number) { positions(count, dealer); return (dealer + 1) % count; }
export function dealInitialHand(stacks: readonly number[], small: number, big: number, dealer: number, deck: readonly Card[]) {
 positions(stacks.length,dealer);
 const live=stacks.map((stack,seat)=>({stack,seat})).filter(p=>p.stack>0).map(p=>p.seat);
 if(live.length<2||!live.includes(dealer))throw new Error('Asientos activos inválidos');
 const next=(seat:number)=>live[(live.indexOf(seat)+1)%live.length];
 const smallBlind=live.length===2?dealer:next(dealer),bigBlind=next(smallBlind);
 const pos={dealer,smallBlind,bigBlind,firstPreflop:live.length===2?dealer:next(bigBlind),firstPostflop:next(dealer)};
 if (stacks.some(s => !Number.isSafeInteger(s) || s < 0) || !Number.isSafeInteger(small) || !Number.isSafeInteger(big) || small < 1 || big <= small) throw new RangeError('Fichas o ciegas inválidas');
 const valid = new Map(createDeck().map(c => [c.id, c]));
 if (deck.length !== 52 || new Set(deck.map(c => c.id)).size !== 52 || deck.some(c => {const e=valid.get(c.id);return !e || c.suit !== e.suit || c.rank !== e.rank;})) throw new Error('Baraja inválida');
 const players = stacks.map((stack, seat) => ({ seat, stack, committed: 0, cards: [] as Card[] }));
 for (const [seat, amount] of [[pos.smallBlind, small], [pos.bigBlind, big]]) {
  const paid = Math.min(players[seat].stack, amount); players[seat].stack -= paid; players[seat].committed = paid;
 }
 let cursor = 0; const dealOrder: number[] = [];
 for (let round=0;round<2;round++) for(let offset=1;offset<=players.length;offset++) {
  const seat=(dealer+offset)%players.length; if(stacks[seat]===0)continue; players[seat].cards.push(deck[cursor++]); dealOrder.push(seat);
 }
 return { ...pos, players, pot: players.reduce((sum,p)=>sum+p.committed,0), cursor, dealOrder, deck:[...deck] };
}
export type InitialHand = ReturnType<typeof dealInitialHand>;
export function createInitialHand(config: {bots:number;chips:number;small:number;big:number}): InitialHand {
 if(!validStartingBlinds(config.small,config.big))throw new RangeError('Proporción de ciegas inválida');
 const count=config.bots+1;
 return dealInitialHand(Array.from({length:count},()=>config.chips),config.small,config.big,randomInt(count),createShuffledDeck());
}
