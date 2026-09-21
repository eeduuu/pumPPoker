import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/poker/deck.ts';
import { positions, nextDealer, dealInitialHand, createInitialHand } from '../src/poker/initialHand.ts';
test('Posiciones y reparto para 2–9 jugadores y todos los dealers',()=>{
 for(let n=2;n<=9;n++) for(let d=0;d<n;d++) {
  const deck=createDeck(),h=dealInitialHand(Array(n).fill(5000),25,50,d,deck);
  assert.equal(h.smallBlind,n===2?d:(d+1)%n);assert.equal(h.bigBlind,(h.smallBlind+1)%n);
  assert.equal(h.firstPreflop,n===2?d:(h.bigBlind+1)%n);assert.equal(h.firstPostflop,(d+1)%n);
  const order=Array.from({length:n},(_,i)=>(d+1+i)%n);assert.deepEqual(h.dealOrder,[...order,...order]);
  for(let i=0;i<n;i++) assert.deepEqual(h.players[order[i]].cards,[deck[i],deck[n+i]]);
  assert.equal(h.cursor,2*n);assert.equal(new Set(h.players.flatMap(p=>p.cards.map(c=>c.id))).size,2*n);
  assert.equal(h.pot,75);assert.equal(h.players.reduce((s,p)=>s+p.stack,0)+h.pot,n*5000);
 }
});
test('Heads-up: dealer es pequeña y recibe la última carta',()=>{
 const h=dealInitialHand([1000,1000],10,20,0,createDeck());assert.deepEqual(h.dealOrder,[1,0,1,0]);
 assert.equal(h.players[0].committed,10);assert.equal(h.players[1].committed,20);assert.equal(h.firstPreflop,0);
});
test('Ciegas cortas conservan fichas sin saldos negativos',()=>{
 const h=dealInitialHand([100,7,12],25,50,0,createDeck());assert.equal(h.pot,19);assert.deepEqual(h.players.map(p=>p.stack),[100,0,0]);
});
test('Rotación con plantilla intacta completa una vuelta',()=>{
 for(let n=2;n<=9;n++){let d=0;for(let i=1;i<=n;i++){d=nextDealer(n,d);assert.equal(d,i%n);}}
});
test('Entradas intactas y rechazo de datos inválidos',()=>{
 const deck=createDeck(),stacks=[100,100];dealInitialHand(stacks,5,10,1,deck);assert.deepEqual(stacks,[100,100]);assert.deepEqual(deck,createDeck());
 assert.throws(()=>dealInitialHand(stacks,5,10,1,[...deck.slice(1),deck[1]]));assert.throws(()=>positions(1,0));
});
test('Creación real usa dealer válido y baraja nueva',()=>{
 const a=createInitialHand({bots:8,chips:5000,small:25,big:50}),b=createInitialHand({bots:8,chips:5000,small:25,big:50});
 assert.ok(a.dealer>=0&&a.dealer<9);assert.equal(a.deck.length,52);assert.notEqual(a.deck,b.deck);
});
