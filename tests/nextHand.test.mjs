import test from 'node:test';import assert from 'node:assert/strict';
import {createDeck} from '../src/poker/deck.ts';
import {dealInitialHand} from '../src/poker/initialHand.ts';
import {continuingHand,refillEmptyStacks} from '../src/poker/nextHand.ts';
import {createPreflop,act,toCall,startPostflop} from '../src/poker/preflop.ts';
import {scheduledBlindLevel,timeToNextLevel,levelTime,breakDue,nextBreakElapsedMs,clockLevelNumber,validStartingBlinds} from '../src/poker/levels.ts';
import {sampleClock} from '../src/poker/clock.ts';
test('Descansos solo al acabar cada N niveles de torneo, no en cada mano',()=>{
 for(let n=1;n<=50;n++)for(let level=1;level<=100;level++){
  assert.equal(breakDue('tournament',true,n,level,level+1),level%n===0);
  assert.equal(breakDue('tournament',true,n,level,level),false);
  assert.equal(breakDue('normal',true,n,level,level+1),false);
  assert.equal(breakDue('tournament',false,n,level,level+1),false);
 }
 assert.equal(breakDue('tournament',true,0,1,2),false);
 assert.equal(breakDue('tournament',true,2,1,3),true,'Un salto de varios niveles no se salta el descanso');
 assert.equal(breakDue('tournament',true,3,1,3),false);
});
test('Niveles solo al comenzar la mano siguiente y sin cambiar saldos',()=>{
 const level={number:1,small:25,big:50};
 assert.equal(scheduledBlindLevel(level,59999,60000,true),level);
 assert.equal(scheduledBlindLevel(level,999999,60000,false),level);
 const next=scheduledBlindLevel(level,60000,60000,true);
 assert.deepEqual(next,{number:2,small:25,big:75});assert.deepEqual(level,{number:1,small:25,big:50});
 const hand=dealInitialHand([1000,1000],25,50,0,createDeck());
 const dealt=continuingHand(hand,[1000,1000],next.small,next.big,createDeck());
 assert.equal(dealt.pot,100);assert.equal(dealt.players.reduce((a,p)=>a+p.stack,0)+dealt.pot,2000);assert.equal(hand.pot,75);
});
test('El calendario de ciegas conserva los segundos sobrantes y alcanza el nivel correspondiente entre manos',()=>{
 const initial={number:1,small:25,big:50};
 assert.equal(scheduledBlindLevel(initial,59999,60000,true),initial);
 assert.deepEqual(scheduledBlindLevel(initial,60000,60000,true),{number:2,small:25,big:75});
 assert.deepEqual(scheduledBlindLevel(initial,65000,60000,true),{number:2,small:25,big:75});
 assert.deepEqual(scheduledBlindLevel(initial,120000,60000,true),{number:3,small:50,big:100});
 assert.deepEqual(scheduledBlindLevel(initial,180000,60000,true),{number:4,small:75,big:150});
 assert.deepEqual(scheduledBlindLevel(initial,300000,60000,true),{number:6,small:150,big:300});
 assert.deepEqual(scheduledBlindLevel(initial,420000,60000,true),{number:8,small:250,big:500});
 assert.equal(scheduledBlindLevel(initial,180000,60000,false),initial);
 assert.throws(()=>scheduledBlindLevel(initial,120000,0,true));
 assert.deepEqual(scheduledBlindLevel(initial,180000000,60000,true,1000),{number:3001,small:500,big:1000},'Una vuelta muy larga no desborda las ciegas');
 assert.equal(timeToNextLevel(0,60000),60000);
 assert.equal(timeToNextLevel(59999,60000),1);
 assert.equal(timeToNextLevel(60000,60000),60000,'Al vencer un nivel comienza la cuenta del siguiente');
 assert.equal(timeToNextLevel(65000,60000),55000,'Los cinco segundos sobrantes no se pierden al repartir');
});
test('Tiempo visible redondeado y niveles sin desbordamiento numérico',()=>{
 assert.equal(levelTime(60000),'1:00');assert.equal(levelTime(59999),'1:00');assert.equal(levelTime(1),'0:01');assert.equal(levelTime(0),'0:00');
 assert.throws(()=>scheduledBlindLevel({number:Number.MAX_SAFE_INTEGER,small:25,big:50},60000,60000,true));
});
test('La pareja inicial es libre dentro de una proporción jugable',()=>{
 assert.equal(validStartingBlinds(25,50),true);
 assert.equal(validStartingBlinds(40,85),true);
 assert.equal(validStartingBlinds(5,85),false);
 assert.equal(validStartingBlinds(70,85),false);
 assert.equal(validStartingBlinds(1,3),true);
 assert.equal(validStartingBlinds(2,3),true);
 assert.equal(validStartingBlinds(0,85),false);
 assert.equal(validStartingBlinds(40.5,85),false);
 assert.deepEqual(scheduledBlindLevel({number:1,small:40,big:85},60000,60000,true),{number:2,small:43,big:128});
 assert.deepEqual(scheduledBlindLevel({number:1,small:40,big:85},120000,60000,true),{number:3,small:80,big:170});
 assert.deepEqual(scheduledBlindLevel({number:1,small:1,big:3},120000,60000,true,4),{number:3,small:2,big:4});
});
test('Las ciegas personalizadas crecen sin perder la proporción, incluso al alcanzar el máximo',()=>{
 for(let big=2;big<=100;big++)for(let small=1;small<big;small++){
  if(!validStartingBlinds(small,big))continue;
  const initial={number:1,small,big},cap=big*9;
  let previous=initial;
  for(let passed=1;passed<=20;passed++){
   const current=scheduledBlindLevel(initial,passed*60000,60000,true,cap);
   assert.equal(current.number,passed+1);
   assert.ok(current.small>=previous.small&&current.big>=previous.big,`${small}/${big}, nivel ${passed+1}`);
   assert.ok(validStartingBlinds(current.small,current.big),`${small}/${big}, nivel ${passed+1}: ${current.small}/${current.big}`);
   assert.ok(current.big<=cap);
   previous=current;
  }
 }
});
test('El reloj sigue durante la mano y al ocultar la página; solo descuenta la pausa explícita',()=>{
 let clock={elapsed:0,last:0};
 clock=sampleClock(clock,1000);assert.equal(clock.elapsed,1000);
 clock=sampleClock(clock,32000);assert.equal(clock.elapsed,32000,'El tiempo oculto también transcurre');
 clock=sampleClock(clock,65000);assert.equal(clock.elapsed,65000,'No se congela al llegar al límite del nivel');
 clock={elapsed:clock.elapsed,last:365000};
 clock=sampleClock(clock,366000);assert.equal(clock.elapsed,66000,'Un descanso conserva el tiempo de juego previo');
});
test('El reloj espera en cero al llegar a un descanso y reanuda el nivel siguiente completo',()=>{
 const duration=60000,initial={number:1,small:25,big:50};
 const limit=nextBreakElapsedMs('tournament',true,true,2,1,duration);
 assert.equal(limit,120000);
 assert.equal(nextBreakElapsedMs('tournament',true,true,2,2,duration),limit);
 let clock=sampleClock({elapsed:0,last:0},180000,limit);
 assert.equal(clock.elapsed,limit,'La mano larga no consume niveles posteriores al descanso');
 assert.equal(levelTime(limit-clock.elapsed),'0:00');
 clock=sampleClock(clock,360000,limit);
 assert.equal(clock.elapsed,limit,'El reloj queda en cero mientras termina la mano');
 const upcoming=scheduledBlindLevel(initial,clock.elapsed,duration,true);
 assert.equal(upcoming.number,3);
 assert.equal(breakDue('tournament',true,2,1,upcoming.number),true);
 const nextLimit=nextBreakElapsedMs('tournament',true,true,2,upcoming.number,duration);
 assert.equal(nextLimit,240000);
 clock=sampleClock({elapsed:clock.elapsed,last:600000},630000,nextLimit);
 assert.equal(clock.elapsed,150000,'El descanso no consume tiempo del nuevo nivel');
 assert.equal(timeToNextLevel(clock.elapsed,duration),30000);
 assert.equal(nextBreakElapsedMs('normal',true,true,2,1,duration),Infinity);
 assert.equal(nextBreakElapsedMs('tournament',true,false,2,1,duration),Infinity);
});
test('El rótulo sigue el nivel del contador sin adelantar el descanso',()=>{
 const duration=60000,breakLimit=120000;
 assert.equal(clockLevelNumber(59999,duration,breakLimit),1);
 assert.equal(clockLevelNumber(60000,duration,breakLimit),2,'El segundo nivel aparece durante la mano anterior');
 assert.equal(clockLevelNumber(72000,duration,breakLimit),2);
 assert.equal(clockLevelNumber(breakLimit,duration,breakLimit),2,'En cero espera el descanso del nivel dos');
 assert.equal(clockLevelNumber(150000,duration,240000),3,'Tras descansar continúa el nivel tres');
 assert.equal(clockLevelNumber(120000,duration),3,'Sin descansos el reloj no se detiene');
});
test('Un torneo admite descansos consecutivos tras cada nivel',()=>{
 const initial={number:1,small:25,big:50};let level=initial,rests=0;
 for(let expected=2;expected<=6;expected++){
  const previous=level;level=scheduledBlindLevel(initial,(expected-1)*60000,60000,true);
  assert.equal(level.number,expected);assert.equal(breakDue('tournament',true,1,previous.number,level.number),true);rests++;
 }
 assert.equal(rests,5);assert.deepEqual(level,{number:6,small:150,big:300});
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
