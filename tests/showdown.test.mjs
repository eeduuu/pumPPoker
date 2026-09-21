import test from 'node:test';import assert from 'node:assert/strict';
import {evaluate,potStructure,settle} from '../src/poker/showdown.ts';
import {matchOutcome} from '../src/poker/matchOutcome.ts';
import {resultHeadline} from '../src/resultHeadline.ts';
const cards=s=>s.split(' ').map(t=>{const rank='23456789TJQKA'.indexOf(t[0])+2,suit={c:'clubs',d:'diamonds',h:'hearts',s:'spades'}[t[1]];return {rank,suit,id:suit+'-'+rank};});
test('Todas las categorías ordenadas y escaleras con as bajo',()=>{
 const examples=['Ac Kd 9h 7s 3c','Ac Ad 9h 7s 3c','Ac Ad 9h 9s 3c','Ac Ad Ah 7s 3c','2c 3d 4h 5s 6c','Ac Jc 9c 7c 3c','Ac Ad Ah 7s 7c','Ac Ad Ah As 3c','9c Tc Jc Qc Kc'];
 const values=examples.map(s=>evaluate(cards(s)).value);for(let i=1;i<values.length;i++)assert.ok(values[i]>values[i-1]);
 assert.ok(evaluate(cards('Ac 2d 3h 4s 5c')).value<evaluate(cards(examples[4])).value);
 assert.equal(evaluate(cards('Tc Jc Qc Kc Ac')).name,'Escalera real');
});
test('Mejores cinco entre siete: dos tríos, color, kickers y mesa compartida',()=>{
 assert.equal(evaluate(cards('Ac Ad Ah Kc Kd Kh 2s')).value,evaluate(cards('Ac Ad Ah Kc Kd')).value);
 assert.equal(evaluate(cards('Ac Jc 9c 7c 3c 2c Kd')).value,evaluate(cards('Ac Jc 9c 7c 3c')).value);
 assert.ok(evaluate(cards('Ac Ad Kh Qs 9c')).value>evaluate(cards('Ah As Kd Qc 8h')).value);
 assert.equal(evaluate(cards('Tc Jc Qc Kc Ac 2d 3h')).value,evaluate(cards('Tc Jc Qc Kc Ac 8d 9h')).value);
 assert.throws(()=>evaluate(cards('Ac Ac 3h 4s 5c')));
});
function setup(amounts,holes,folded=[]){
 const players=amounts.map((n,seat)=>({seat,stack:0,committed:0,folded:folded.includes(seat)}));
 return {hand:{dealer:0,players:holes.map(s=>({cards:cards(s)}))},state:{status:'preflop-complete',players,contributed:amounts,pot:amounts.reduce((a,b)=>a+b,0),bet:0,minRaise:50,actedAt:players.map(()=>null),pending:[],actor:null,winner:null,last:null}};
}
test('Victoria del usuario y parada definitiva tras cobrar el bote',()=>{
 const {hand,state}=setup([100,100,100],['Ac Ad','Kc Kd','Qc Qd']);
 assert.equal(matchOutcome(state).terminal,false);
 const result=settle(hand,state,cards('2c 3d 7h 9s Jc'));
 assert.deepEqual(result.payouts,[300,0,0]);
 assert.deepEqual(matchOutcome(result.betting),{ended:true,terminal:true,canContinue:false,title:'Has ganado la partida'});
});
test('Eliminación del usuario con dos bots vivos continúa como espectador',()=>{
 const {hand,state}=setup([100,200,300],['Qc Qd','Ac Ad','Kc Kd']);
 const result=settle(hand,state,cards('2c 3d 7h 9s Jc'));
 assert.deepEqual(result.payouts,[0,500,100]);
 assert.deepEqual(matchOutcome(result.betting),{ended:true,terminal:false,canContinue:true,title:'Te has quedado sin BB'});
 assert.deepEqual(matchOutcome(result.betting,'normal'),{ended:true,terminal:false,canContinue:true,title:''});
});
test('All-in pendiente no es eliminación y empate permite continuar',()=>{
 const {hand,state}=setup([100,100],['2d 3h','4d 5h']);
 for(const status of ['playing','preflop-complete'])assert.deepEqual(matchOutcome({...state,status}),{ended:false,terminal:false,canContinue:false,title:''});
 const result=settle(hand,state,cards('Tc Jc Qc Kc Ac'));
 assert.deepEqual(result.payouts,[100,100]);
 assert.deepEqual(matchOutcome(result.betting),{ended:true,terminal:false,canContinue:true,title:''});
});
test('Victoria de un bot y resultado por retirada usan el mismo cierre',()=>{
 const {state}=setup([100,100],['Ac Ad','Kc Kd']);
 const players=state.players.map((p,i)=>({...p,stack:i===1?200:0}));
 for(const status of ['settled','uncontested']){
  const finished={...state,players,pot:0,status};
  assert.deepEqual(matchOutcome(finished),{ended:true,terminal:true,canContinue:false,title:'Bot 1 gana la partida'});
  assert.deepEqual(matchOutcome(finished,'normal'),{ended:true,terminal:false,canContinue:true,title:''});
 }
});
test('All-in distintos: principal, secundario y exceso no igualado',()=>{
 const {hand,state}=setup([100,200,300],['Ac Ad','Kc Kd','Qc Qd']);const before=JSON.stringify(state);
 assert.deepEqual(potStructure(state),[
  {amount:300,eligible:[0,1,2],refund:false},
  {amount:200,eligible:[1,2],refund:false},
  {amount:100,eligible:[2],refund:true}
 ]);
 const r=settle(hand,state,cards('2c 3d 7h 9s Jc'));assert.deepEqual(r.payouts,[300,200,100]);
 assert.deepEqual(r.pots.map(p=>p.amount),[300,200,100]);assert.equal(r.pots[2].refund,true);
 assert.equal(r.betting.pot,0);assert.equal(r.betting.players.reduce((a,p)=>a+p.stack,0),600);assert.equal(JSON.stringify(state),before);
 assert.throws(()=>settle(hand,r.betting,cards('2c 3d 7h 9s Jc')));
});
test('Empates por bote, fichas impares a la izquierda del botón y retirados excluidos',()=>{
 const {hand,state}=setup([5,5,3],['2d 3h','4d 5h','6d 7h'],[2]);
 const r=settle(hand,state,cards('Tc Jc Qc Kc Ac'));assert.deepEqual(r.payouts,[6,7,0]);assert.equal(r.payouts.reduce((a,b)=>a+b,0),13);
 const other=setup([100,100,100],['Ac Ad','Kc Kd','Qc Qd'],[0]);
 assert.deepEqual(settle(other.hand,other.state,cards('2c 3d 7h 9s Jc')).payouts,[0,300,0]);
});
test('El titular explica victoria, empate y bote principal sin llamar victoria a una devolución',()=>{
 const name=seat=>seat===0?'Tú':`Bot ${seat}`;
 const solo=setup([100,100],['Ac Ad','Kc Kd']);
 assert.equal(resultHeadline(settle(solo.hand,solo.state,cards('2c 3d 7h 9s Jc')),name),'Gana Tú · pareja');
 const tied=setup([100,100],['2d 3h','4d 5h']);
 assert.equal(resultHeadline(settle(tied.hand,tied.state,cards('Tc Jc Qc Kc Ac')),name),'Empate: Bot 1 + Tú · escalera real');
 const five=setup([100,100,100,100,100],['2c 3d','4c 5d','6c 7d','8c 9d','2h 3s']);
 assert.equal(resultHeadline(settle(five.hand,five.state,cards('Tc Jc Qc Kc Ac')),name),'Empate: 5 jugadores · escalera real');
 const layered=setup([100,200,300],['Ac Ad','Kc Kd','Qc Qd']);
 assert.equal(resultHeadline(settle(layered.hand,layered.state,cards('2c 3d 7h 9s Jc')),name),'Principal: Tú · pareja');
});
