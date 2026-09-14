import type { InitialHand } from './initialHand.ts';
import type { Card } from './deck.ts';
export type Community = { street:number; cards:Card[]; cursor:number };
export function nextCommunity(hand:InitialHand,current:Community):Community {
 if(current.street>=3)throw new Error('El river ya está repartido');
 const count=current.street===0?3:1,start=current.cursor+1;
 if(start+count>hand.deck.length)throw new Error('Baraja insuficiente');
 return {street:current.street+1,cards:[...current.cards,...hand.deck.slice(start,start+count)],cursor:start+count};
}
