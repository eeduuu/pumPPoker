import type { Card } from './deck.ts';
import type { InitialHand } from './initialHand.ts';
import type { Betting,Action } from './preflop.ts';
import { canRaise } from './preflop.ts';
import { randomInt } from './deck.ts';
import { evaluate } from './showdown.ts';
import { estimateEquity } from './equity.ts';
import type { BotProfile } from './botProfiles.ts';
export type BotView={cards:readonly Card[];public:{seat:number;pot:number;bet:number;big:number;board:readonly Card[];raise:{min:number;max:number}|null;players:{seat:number;stack:number;committed:number;folded:boolean}[]}};
const copyCard=(c:Card):Card=>({id:c.id,rank:c.rank,suit:c.suit});
export function botView(hand:InitialHand,s:Betting,seat:number,board:readonly Card[]=[],big=50):BotView {
 const p=s.players[seat];
 return {cards:hand.players[seat].cards.map(copyCard),public:{seat,pot:s.pot,bet:s.bet,big,board:board.map(copyCard),raise:canRaise(s,seat)?{min:Math.min(p.stack,s.bet+s.minRaise-p.committed),max:p.stack}:null,players:s.players.map(p=>({seat:p.seat,stack:p.stack,committed:p.committed,folded:p.folded}))}};
}
// Preflop stays heuristic; postflop estimates expected pot share against random hands.
function strength(view:BotView,profile:BotProfile,choose:(limit:number)=>number){
 const [a,b]=view.cards,board=view.public.board;
 if(!a||!b)throw new Error('El bot necesita sus dos cartas');
 if(!board.length){
  if(a.rank===b.rank)return 0.5+a.rank/35;
  return Math.min(0.8,(a.rank+b.rank-4)/38+(a.suit===b.suit?0.1:0)+(Math.abs(a.rank-b.rank)<=2?0.07:0));
 }
 const opponents=view.public.players.filter(p=>p.seat!==view.public.seat&&!p.folded).length;
 if(!opponents)return 1;
 const samples=profile.id==='caller'||profile.id==='loose'?16:profile.id==='selective'||profile.id==='balanced'?48:32;
 return estimateEquity(view.cards,board,opponents,samples,choose).share;
}
export function decideBot(view:BotView,profile:BotProfile,choose:(limit:number)=>number=randomInt):{action:Action;amount:number}{
 const pub=view.public,p=pub.players[pub.seat],due=Math.max(0,pub.bet-p.committed);
 const score=strength(view,profile,choose),roll=choose(10000)/10000;
 const price=Math.min(due,p.stack)/Math.max(1,pub.pot+Math.min(due,p.stack));
 const pressure=due/Math.max(1,p.stack+ p.committed);
 const postflop=pub.board.length>0;
 const affordable=postflop?score+profile.looseness*0.25>=price+0.03+pressure*0.03:score+profile.looseness>=0.28+price*0.6+pressure*0.25;
 if(due>0&&!affordable&&roll>profile.bluff)
  return {action:'fold',amount:0};
 const sharedRoyal=pub.board.length===5&&evaluate(pub.board).name==='Escalera real';
 if(pub.raise&&!sharedRoyal&&((score>(postflop?0.55:0.68)&&roll<profile.aggression)||roll<profile.bluff)){
  const target=Math.max(profile.size*pub.big,Math.ceil(pub.pot*0.5/pub.big)*pub.big);
  const amount=Math.min(pub.raise.max,Math.max(pub.raise.min,due+target));
  return {action:'raise',amount};
 }
 return {action:due?'call':'check',amount:0};
}
