import {createShuffledDeck} from './deck.ts';
import type {Card} from './deck.ts';
import {dealInitialHand} from './initialHand.ts';
import type {InitialHand} from './initialHand.ts';
export function refillEmptyStacks(stacks:readonly number[],buyIn:number){
 if(!Number.isSafeInteger(buyIn)||buyIn<1||stacks.some(stack=>!Number.isSafeInteger(stack)||stack<0))throw new RangeError('Fichas inválidas');
 return stacks.map(stack=>stack===0?buyIn:stack);
}
export function continuingHand(previous:InitialHand,stacks:readonly number[],small:number,big:number,deck:readonly Card[]=createShuffledDeck()){
 const live=stacks.map((stack,seat)=>({stack,seat})).filter(p=>p.stack>0).map(p=>p.seat);
 if(stacks.length!==previous.players.length||live.length<2)throw new Error('No quedan suficientes jugadores');
 const next=(after:number)=>{for(let k=1;k<=stacks.length;k++){const seat=(after+k)%stacks.length;if(live.includes(seat))return seat;}throw new Error('Sin asiento');};
 // Heads-up: advance the big blind first so nobody pays it twice on transition.
 const dealer=live.length===2?next(next(previous.bigBlind)):next(previous.dealer);
 return dealInitialHand(stacks,small,big,dealer,deck);
}
