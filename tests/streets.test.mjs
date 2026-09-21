import test from 'node:test';import assert from 'node:assert/strict';
import {createDeck} from '../src/poker/deck.ts';
import {dealInitialHand} from '../src/poker/initialHand.ts';
import {createPreflop,act,toCall,startPostflop} from '../src/poker/preflop.ts';
import {nextCommunity} from '../src/poker/streets.ts';
const close=s=>{while(s.status==='playing')s=act(s,s.actor,toCall(s,s.actor)?'call':'check');return s;};
test('Flop, turn y river consumen la misma baraja con tres quemadas',()=>{
 for(let n=2;n<=9;n++){const h=dealInitialHand(Array(n).fill(1000),25,50,0,createDeck());let c={street:0,cards:[],cursor:h.cursor};
 for(const count of [3,4,5]){const before=JSON.stringify(c);const next=nextCommunity(h,c);assert.equal(next.cards.length,count);assert.equal(JSON.stringify(c),before);c=next;}
 assert.equal(c.cursor,h.cursor+8);assert.equal(new Set([...h.players.flatMap(p=>p.cards),...c.cards].map(c=>c.id)).size,n*2+5);assert.throws(()=>nextCommunity(h,c));}
});
test('Tres rondas conservan bote, aportaciones y orden postflop, incluido heads-up',()=>{
 for(let n=2;n<=9;n++)for(let dealer=0;dealer<n;dealer++){
 const h=dealInitialHand(Array(n).fill(1000),25,50,dealer,createDeck());let s=close(createPreflop(h,50));
 for(let street=1;street<=3;street++){const before=JSON.stringify(s),pot=s.pot;const next=startPostflop(s,dealer,50);assert.equal(JSON.stringify(s),before);s=next;
 assert.equal(s.actor,(dealer+1)%n);assert.equal(s.pot,pot);assert.ok(s.players.every(p=>p.committed===0));assert.equal(s.minRaise,50);
 s=act(s,s.actor,'raise',50);s=close(s);assert.equal(s.pot,pot+n*50);assert.equal(s.contributed.reduce((a,b)=>a+b,0),s.pot);assert.equal(s.players.reduce((a,p)=>a+p.stack,0)+s.pot,n*1000);}
 }
});
test('Postflop omite retirados y no obliga a apostar contra jugadores all-in',()=>{
 let s=createPreflop(dealInitialHand([1000,1000,1000],25,50,0,createDeck()),50);s=act(s,0,'fold');s=close(s);s=startPostflop(s,0,50);assert.equal(s.actor,1);assert.equal(s.players[0].folded,true);
 s=createPreflop(dealInitialHand([50,1000],25,50,0,createDeck()),50);s=close(s);s=startPostflop(s,0,50);assert.equal(s.actor,null);assert.equal(s.status,'preflop-complete');
 assert.throws(()=>startPostflop(createPreflop(dealInitialHand([1000,1000],25,50,0,createDeck()),50),0,50));
});
