import test from 'node:test';import assert from 'node:assert/strict';
import {BOT_PROFILES,assignBotProfiles} from '../src/poker/botProfiles.ts';
import {botView,decideBot} from '../src/poker/basicBot.ts';
import {createInitialHand} from '../src/poker/initialHand.ts';
import {createPreflop,act,startPostflop} from '../src/poker/preflop.ts';
import {nextCommunity} from '../src/poker/streets.ts';
import {settle} from '../src/poker/showdown.ts';
import {estimateEquity,revealedEquityPercentages} from '../src/poker/equity.ts';
const cards=s=>s.split(' ').map(t=>{const rank='23456789TJQKA'.indexOf(t[0])+2,suit={c:'clubs',d:'diamonds',h:'hearts',s:'spades'}[t[1]];return {rank,suit,id:suit+'-'+rank};});
const seeded=()=>{let value=17;return max=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value%max;};};
test('Equity: nuts propios ganan y nuts comunitarios se reparten entre todos',()=>{
 assert.equal(estimateEquity(cards('Ac Kc'),cards('Qc Jc Tc 2h 3d'),8,24,seeded()).share,1);
 const tie=estimateEquity(cards('2d 3h'),cards('Tc Jc Qc Kc Ac'),3,24,seeded());
 assert.equal(tie.win,0);assert.equal(tie.tie,1);assert.equal(tie.share,0.25);
});
test('Proyectos mejoran al completarse; pareja comunitaria no equivale a mano propia fuerte',()=>{
 const draw=estimateEquity(cards('Ac Kc'),cards('Qc Jc 2h'),1,128,seeded()).share;
 const made=estimateEquity(cards('Ac Kc'),cards('Qc Jc 2h Tc'),1,128,seeded()).share;
 assert.ok(made>draw);assert.equal(made,1);
 const weak=estimateEquity(cards('2d 3h'),cards('Qc Qd 7h 9s Jc'),2,128,seeded()).share;
 const strong=estimateEquity(cards('Qh Qs'),cards('Qc Qd 7h 9s Jc'),2,128,seeded()).share;
 assert.ok(strong>weak+0.5);
});
test('Simulación no muta cartas, rechaza duplicados y depende solo de información visible',()=>{
 const own=cards('Ac Kc'),board=cards('Qc Jc 2h'),before=JSON.stringify([own,board]);
 assert.deepEqual(estimateEquity(own,board,2,32,seeded()),estimateEquity(own,board,2,32,seeded()));
 assert.equal(JSON.stringify([own,board]),before);
 assert.throws(()=>estimateEquity(own,cards('Ac 2h 3d'),1));
 assert.throws(()=>estimateEquity(own,board,9));
 assert.throws(()=>estimateEquity(own,board,1,0));
 assert.throws(()=>estimateEquity(own,board,1,1,limit=>limit));
});
test('Porcentajes revelados cambian por calles y terminan en 100/0 o empate',()=>{
 const hands=[cards('Ac Ad'),cards('Kc Kd')],before=JSON.stringify(hands);
 const preflop=revealedEquityPercentages(hands,[],600),flop=revealedEquityPercentages(hands,cards('2c 3d 7h'),600);
 assert.equal(preflop.reduce((a,b)=>a+b,0),100);assert.equal(flop.reduce((a,b)=>a+b,0),100);assert.notDeepEqual(preflop,flop);
 assert.deepEqual(revealedEquityPercentages(hands,cards('2c 3d 7h 9s Jc')),[100,0]);
 assert.deepEqual(revealedEquityPercentages([cards('2d 3h'),cards('4d 5h')],cards('Tc Jc Qc Kc Ac')),[50,50]);
 assert.equal(JSON.stringify(hands),before);
 assert.deepEqual(revealedEquityPercentages(hands,[],600),preflop);
 assert.throws(()=>revealedEquityPercentages([cards('Ac Ad'),cards('Ac Kd')],[]));
 assert.throws(()=>revealedEquityPercentages(hands,cards('2c 3d')));
});
test('De uno a ocho perfiles distintos, sin modificar el catálogo',()=>{
 const original=JSON.stringify(BOT_PROFILES);
 for(let n=1;n<=8;n++){const profiles=assignBotProfiles(n);assert.equal(profiles.length,n);assert.equal(new Set(profiles.map(p=>p.id)).size,n);}
 assert.equal(JSON.stringify(BOT_PROFILES),original);assert.throws(()=>assignBotProfiles(9));
});
test('La decisión no cambia al cambiar cartas ajenas o el futuro de la baraja',()=>{
 const h=createInitialHand({bots:3,chips:1000,small:25,big:50}),s=createPreflop(h,50),seat=s.actor;
 const before=botView(h,s,seat,[],50);
 const other={...h,deck:[],players:h.players.map(p=>p.seat===seat?p:{...p,cards:[]})};
 const after=botView(other,s,seat,[],50);
 assert.deepEqual(before,after);
 assert.deepEqual(Object.keys(before.public).sort(),['bet','big','board','players','pot','raise','seat']);
 for(const profile of BOT_PROFILES)assert.deepEqual(decideBot(before,profile,()=>1234),decideBot(after,profile,()=>1234));
 const board=h.deck.slice(h.cursor+1,h.cursor+4);
 for(const profile of BOT_PROFILES)assert.deepEqual(decideBot(botView(h,s,seat,board,50),profile,seeded()),decideBot(botView(other,s,seat,board,50),profile,seeded()));
 before.cards[0].rank=before.cards[0].rank===2?3:2;assert.notDeepEqual(before.cards,h.players[seat].cards);
});
test('Estilos diferentes pueden retirarse, pagar, pasar y subir legalmente',()=>{
 const card=(rank,suit)=>({rank,suit,id:suit+'-'+rank});
 const view={cards:[card(2,'clubs'),card(7,'diamonds')],public:{seat:0,pot:200,bet:100,big:50,board:[],raise:{min:200,max:1000},players:[{seat:0,stack:1000,committed:0,folded:false},{seat:1,stack:900,committed:100,folded:false}]}};
 assert.equal(decideBot(view,BOT_PROFILES[0],()=>5000).action,'fold');
 assert.equal(decideBot(view,BOT_PROFILES[5],()=>5000).action,'call');
 assert.equal(decideBot({...view,public:{...view.public,bet:0}},BOT_PROFILES[0],()=>5000).action,'check');
 const strong={...view,cards:[card(14,'clubs'),card(14,'diamonds')]};
 assert.deepEqual(decideBot(strong,BOT_PROFILES[3],()=>5000),{action:'raise',amount:250});
 assert.equal(decideBot({...strong,public:{...strong.public,raise:null}},BOT_PROFILES[3],()=>0).action,'call');
});
test('Partidas completas con todos los perfiles: acciones válidas y saldos conservados',()=>{
 for(const bots of [1,3,8])for(let trial=0;trial<12;trial++){
  const h=createInitialHand({bots,chips:1000,small:25,big:50});let s=createPreflop(h,50),board={street:0,cards:[],cursor:h.cursor},steps=0;
  while(s.status!=='settled'&&s.status!=='uncontested'){
   assert.ok(++steps<500,'La mano debe terminar');
   if(s.status==='playing'){
    const seat=s.actor,decision=decideBot(botView(h,s,seat,board.cards,50),BOT_PROFILES[(seat+trial)%8]);
    s=act(s,seat,decision.action,decision.amount);
   }else if(board.street<3){board=nextCommunity(h,board);s=startPostflop(s,h.dealer,50);}
   else s=settle(h,s,board.cards).betting;
   assert.equal(s.players.reduce((a,p)=>a+p.stack,0)+s.pot,(bots+1)*1000);
   assert.ok(s.players.every(p=>p.stack>=0));
  }
 }
});
