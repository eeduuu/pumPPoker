import test from 'node:test';import assert from 'node:assert/strict';
import {createDeck} from '../src/poker/deck.ts';
import {dealInitialHand} from '../src/poker/initialHand.ts';
import {continuingHand,refillEmptyStacks} from '../src/poker/nextHand.ts';
import {createPreflop,act,toCall,startPostflop} from '../src/poker/preflop.ts';
import {nextBlindLevel,levelTime,breakDue} from '../src/poker/levels.ts';
import {sampleClock} from '../src/poker/clock.ts';
test('Descansos solo al acabar cada N niveles de torneo, no en cada mano',()=>{
 for(let n=1;n<=50;n++)for(let level=1;level<=100;level++){
  assert.equal(breakDue('tournament',true,n,level,level+1),level%n===0);
  assert.equal(breakDue('tournament',true,n,level,level),false);
  assert.equal(breakDue('normal',true,n,level,level+1),false);
  assert.equal(breakDue('tournament',false,n,level,level+1),false);
 }
 assert.equal(breakDue('tournament',true,0,1,2),false);
});
test('Niveles solo al comenzar la mano siguiente y sin cambiar saldos',()=>{
 const level={number:1,small:25,big:50};
 assert.equal(nextBlindLevel(level,59999,60000,true),level);
 assert.equal(nextBlindLevel(level,999999,60000,false),level);
 const next=nextBlindLevel(level,60000,60000,true);
 assert.deepEqual(next,{number:2,small:50,big:100});assert.deepEqual(level,{number:1,small:25,big:50});
 assert.equal(nextBlindLevel(level,999999,60000,true).number,2);
 const hand=dealInitialHand([1000,1000],25,50,0,createDeck());
 const dealt=continuingHand(hand,[1000,1000],next.small,next.big,createDeck());
 assert.equal(dealt.pot,150);assert.equal(dealt.players.reduce((a,p)=>a+p.stack,0)+dealt.pot,2000);assert.equal(hand.pot,75);
});
test('Tiempo visible redondeado y niveles sin desbordamiento numérico',()=>{
 assert.equal(levelTime(60000),'1:00');assert.equal(levelTime(59999),'1:00');assert.equal(levelTime(1),'0:01');assert.equal(levelTime(0),'0:00');
 assert.throws(()=>nextBlindLevel({number:1,small:1,big:Number.MAX_SAFE_INTEGER},60000,60000,true));
});
test('El reloj excluye todo el tiempo oculto y continúa al volver',()=>{
 let clock={elapsed:0,last:0,wasVisible:true};
 clock=sampleClock(clock,1000,true,60000);assert.equal(clock.elapsed,1000);
 clock=sampleClock(clock,2000,false,60000);assert.equal(clock.elapsed,2000);
 clock=sampleClock(clock,32000,false,60000);assert.equal(clock.elapsed,2000);
 clock=sampleClock(clock,33000,true,60000);assert.equal(clock.elapsed,2000);
 clock=sampleClock(clock,34000,true,60000);assert.equal(clock.elapsed,3000);
 clock=sampleClock(clock,99999,true,60000);assert.equal(clock.elapsed,60000);
});
test('Un torneo admite descansos consecutivos tras cada nivel',()=>{
 let level={number:1,small:25,big:50};let rests=0;
 for(let expected=2;expected<=6;expected++){
  const previous=level;level=nextBlindLevel(level,60000,60000,true);
  assert.equal(level.number,expected);assert.equal(breakDue('tournament',true,1,previous.number,level.number),true);rests++;
 }
 assert.equal(rests,5);assert.deepEqual(level,{number:6,small:800,big:1600});
});
test('Rotación y baraja completa nueva en manos consecutivas',()=>{
 for(let n=2;n<=9;n++){const stacks=Array(n).fill(1000);let h=dealInitialHand(stacks,25,50,0,createDeck());
 for(let k=1;k<=n;k++){const prior=h;h=continuingHand(prior,stacks,25,50);assert.equal(h.dealer,k%n);assert.equal(h.deck.length,52);assert.equal(new Set(h.deck.map(c=>c.id)).size,52);assert.notEqual(h.deck,prior.deck);assert.notEqual(h.deck[0],prior.deck[0]);assert.equal(h.players.reduce((a,p)=>a+p.stack,0)+h.pot,n*1000);}}
});
test('Eliminados conservan asiento y no reciben cartas, ciegas ni turno',()=>{
 const h=dealInitialHand([1000,1000,1000,1000],25,50,0,createDeck());
 const next=continuingHand(h,[1200,0,1300,1500],25,50,createDeck());
 assert.deepEqual(next.players.map(p=>p.seat),[0,1,2,3]);assert.equal(next.dealer,2);assert.deepEqual(next.players[1].cards,[]);assert.equal(next.players[1].committed,0);
 assert.deepEqual(next.dealOrder,[3,0,2,3,0,2]);assert.equal(next.cursor,6);assert.equal(createPreflop(next,50).players[1].folded,true);
});
test('Paso a heads-up evita repetir ciega grande, también con asientos vacíos',()=>{
 const h=dealInitialHand([1000,1000,1000,1000],25,50,0,createDeck());
 const next=continuingHand(h,[2000,0,2000,0],25,50,createDeck());assert.equal(next.bigBlind,0);assert.equal(next.dealer,2);assert.equal(next.smallBlind,2);assert.equal(next.firstPreflop,2);assert.equal(next.firstPostflop,0);
 assert.deepEqual(next.dealOrder,[0,2,0,2]);
});
test('No inicia una mesa con un solo jugador ni fichas inválidas',()=>{
 const h=dealInitialHand([1000,1000],25,50,0,createDeck());
 assert.throws(()=>continuingHand(h,[2000,0],25,50,createDeck()));
 assert.throws(()=>continuingHand(h,[1000,-1],25,50,createDeck()));
});
test('Partida normal repone solo saldos vacíos antes de la siguiente mano',()=>{
 const stacks=[0,725,0,1400],before=[...stacks];
 const refilled=refillEmptyStacks(stacks,1000);
 assert.deepEqual(refilled,[1000,725,1000,1400]);assert.deepEqual(stacks,before);
 const previous=dealInitialHand([1000,1000,1000,1000],25,50,0,createDeck());
 const next=continuingHand(previous,refilled,25,50,createDeck());
 assert.ok(next.players.every(player=>player.cards.length===2));
 assert.equal(next.players.reduce((sum,player)=>sum+player.stack,0)+next.pot,4125);
 assert.throws(()=>refillEmptyStacks(stacks,0));assert.throws(()=>refillEmptyStacks([100,-1],1000));
});
test('Todas las combinaciones de eliminados quedan fuera del reparto y los turnos',()=>{
 for(let n=2;n<=9;n++)for(let mask=1;mask<(1<<n);mask++){
  const stacks=Array.from({length:n},(_,seat)=>mask&(1<<seat)?1000:0);
  const live=stacks.flatMap((s,i)=>s?[i]:[]);if(live.length<2)continue;
  for(let dealer=0;dealer<n;dealer++){
   const previous=dealInitialHand(Array(n).fill(1000),25,50,dealer,createDeck());
   const next=continuingHand(previous,stacks,25,50,createDeck());
   const betting=createPreflop(next,50);
   assert.ok(live.includes(next.dealer));assert.ok(live.includes(next.smallBlind));assert.ok(live.includes(next.bigBlind));
   assert.equal(next.dealOrder.length,live.length*2);
   assert.ok(next.dealOrder.every(s=>live.includes(s)));
   assert.ok(betting.pending.every(s=>live.includes(s)));
   assert.ok(betting.actor===null||live.includes(betting.actor));
   for(const p of next.players){assert.equal(p.cards.length,stacks[p.seat]?2:0);if(!stacks[p.seat])assert.equal(p.committed,0);}
   assert.equal(next.players.reduce((sum,p)=>sum+p.stack,0)+next.pot,live.length*1000);
  }
 }
});
