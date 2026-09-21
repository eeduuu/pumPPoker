import test from 'node:test';import assert from 'node:assert/strict';
import {createDeck} from '../src/poker/deck.ts';import {dealInitialHand} from '../src/poker/initialHand.ts';
import {createPreflop,act,toCall,isAllInRunout} from '../src/poker/preflop.ts';import {botView} from '../src/poker/basicBot.ts';
const hand=(n=4,d=0)=>dealInitialHand(Array(n).fill(1000),25,50,d,createDeck());
test('Orden horario y opción de pasar de la grande para todas las mesas',()=>{for(let n=2;n<=9;n++)for(let d=0;d<n;d++){const h=hand(n,d);let s=createPreflop(h,50);const seen=[];while(s.status==='playing'){const seat=s.actor;seen.push(seat);s=act(s,seat,toCall(s,seat)?'call':'check');assert.equal(s.players.reduce((a,p)=>a+p.stack,0)+s.pot,n*1000);}assert.equal(seen[0],h.firstPreflop);assert.equal(seen.at(-1),h.bigBlind);assert.equal(s.pot,n*50);assert.equal(s.status,'preflop-complete');}});
test('Rechaza turno ajeno y pasar debiendo; no muta el estado',()=>{const s=createPreflop(hand(),50),copy=JSON.stringify(s);assert.throws(()=>act(s,0,'call'));assert.throws(()=>act(s,s.actor,'check'));act(s,s.actor,'call');assert.equal(JSON.stringify(s),copy);});
test('Retiradas entregan el bote y conservan su importe para presentar el resultado',()=>{let s=createPreflop(hand(2),50);const played=s.pot;s=act(s,s.actor,'fold');assert.equal(s.status,'uncontested');assert.equal(s.winner,1);assert.equal(s.pot,0);assert.equal(s.contributed.reduce((a,n)=>a+n,0),played);assert.equal(s.players.reduce((a,p)=>a+p.stack,0),2000);});
test('Igualar con pocas fichas hace all-in sin saldo negativo',()=>{const h=dealInitialHand([100,20,100],5,10,0,createDeck());let s=createPreflop(h,50);s=act(s,0,'call');s=act(s,1,'call');assert.equal(s.players[1].stack,0);assert.equal(s.players[1].committed,20);assert.equal(s.players.reduce((a,p)=>a+p.stack,0)+s.pot,220);});
test('El runout all-in solo revela cuando ya no queda ninguna decisión',()=>{
 const short=dealInitialHand([100,100],50,100,0,createDeck());let allIn=createPreflop(short,100);
 assert.equal(isAllInRunout(allIn),false);allIn=act(allIn,allIn.actor,'call');
 assert.equal(allIn.status,'preflop-complete');assert.equal(isAllInRunout(allIn),true);
 let regular=createPreflop(hand(2),50);while(regular.status==='playing')regular=act(regular,regular.actor,toCall(regular,regular.actor)?'call':'check');
 assert.equal(isAllInRunout(regular),false);
 let folded=createPreflop(hand(2),50);folded=act(folded,folded.actor,'fold');assert.equal(isAllInRunout(folded),false);
});
test('El bot recibe únicamente sus cartas y datos públicos sin baraja ni cartas ajenas',()=>{const h=hand(),s=createPreflop(h,50),view=botView(h,s,2);assert.deepEqual(Object.keys(view).sort(),['cards','public']);assert.deepEqual(view.cards,h.players[2].cards);assert.equal(JSON.stringify(view).includes('deck'),false);for(const p of view.public.players)assert.deepEqual(Object.keys(p).sort(),['committed','folded','seat','stack']);for(const p of h.players.filter(p=>p.seat!==2))for(const c of p.cards)assert.equal(JSON.stringify(view).includes(c.id),false);view.public.players[0].stack=0;assert.equal(s.players[0].stack,1000);});
