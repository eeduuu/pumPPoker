import test from 'node:test';import assert from 'node:assert/strict';
import {createDeck} from '../src/poker/deck.ts';import {dealInitialHand} from '../src/poker/initialHand.ts';
import {createPreflop,act,canRaise,raiseOptions,raiseBreakdown} from '../src/poker/preflop.ts';import {formatBB} from '../src/poker/units.ts';
const start=(stacks=[1000,1000,1000,1000])=>createPreflop(dealInitialHand(stacks,25,50,0,createDeck()),50);
test('El selector separa igualar y subir: mínimo 1 BB desde cualquier asiento',()=>{
 let s=start();
 for(const seat of [3,0,1,2]){
  const options=raiseOptions(s,seat,50),before=JSON.stringify(s);
  const quote=raiseBreakdown(s,seat,options[0]);
  assert.equal(quote.raise,50);assert.equal(quote.total,100);
  assert.equal(quote.call+quote.raise,quote.additional);
  assert.equal(raiseBreakdown(s,seat,options[1]).raise,100);
  assert.equal(JSON.stringify(s),before);
   const next=act(s,seat,'raise',quote.additional);
   assert.equal(next.players[seat].committed,quote.total);
   assert.equal(next.pot-s.pot,quote.additional);
   assert.deepEqual(next.last,{seat,action:'raise',amount:quote.additional,raise:quote.raise});
  s=act(s,seat,seat===2?'check':'call');
 }
});
test('Subida pura respeta mínimos mayores y all-in fraccionario',()=>{
 let s=start();s=act(s,3,'raise',150);
 assert.equal(raiseBreakdown(s,0,raiseOptions(s,0,50)[0]).raise,100);
 s=start([1000,60,1000,1000]);s=act(s,3,'call');s=act(s,0,'call');
 const quote=raiseBreakdown(s,1,raiseOptions(s,1,50)[0]);
 assert.deepEqual(quote,{call:25,raise:10,additional:35,total:60});
 assert.equal(act(s,1,'raise',quote.additional).players[1].stack,0);
});
test('BB: mil fichas con grande 10 son 100 BB',()=>{assert.equal(formatBB(1000,10),'100 BB');assert.equal(formatBB(25,50),'0,5 BB');});
test('Con 1 BB puesta, añadir 1 BB produce 2 BB',()=>{let s=start();s=act(s,3,'call');s=act(s,0,'call');s=act(s,1,'call');assert.equal(s.actor,2);assert.equal(raiseOptions(s,2,50)[0],50);s=act(s,2,'raise',50);assert.equal(s.players[2].committed,100);assert.equal(s.players[2].stack,900);assert.equal(s.bet,100);assert.deepEqual(s.pending,[0,1,3]);assert.equal(s.actor,3);});
test('El mínimo adicional incluye lo pendiente: CP añade 1,5 BB',()=>{let s=start();s=act(s,3,'call');s=act(s,0,'call');assert.equal(raiseOptions(s,1,50)[0],75);assert.throws(()=>act(s,1,'raise',50));assert.throws(()=>act(s,1,'raise',99999));});
test('Una subida completa reabre, all-in corto no reabre a quien actuó',()=>{let s=start([1000,1000,125,1000]);s=act(s,3,'raise',100);s=act(s,0,'call');s=act(s,1,'call');s=act(s,2,'raise',75);assert.equal(s.bet,125);assert.equal(s.minRaise,50);assert.equal(s.actor,3);assert.equal(canRaise(s,3),false);assert.throws(()=>act(s,3,'raise',75));s=act(s,3,'call');assert.equal(s.players.reduce((a,p)=>a+p.stack,0)+s.pot,3125);});
test('Subidas sucesivas conservan fichas y actualizan el mínimo',()=>{let s=start();s=act(s,3,'raise',150);assert.equal(s.minRaise,100);assert.equal(raiseOptions(s,0,50)[0],250);s=act(s,0,'raise',250);assert.equal(s.bet,250);assert.equal(s.players.reduce((a,p)=>a+p.stack,0)+s.pot,4000);});
