import type { Card } from './deck.ts';
import type { Betting } from './preflop.ts';
import type { InitialHand } from './initialHand.ts';
const names=['Carta alta','Pareja','Doble pareja','Trío','Escalera','Color','Full','Póker','Escalera de color'];
function five(cards:readonly Card[]){
 const ranks=cards.map(c=>c.rank).sort((a,b)=>b-a),unique=[...new Set(ranks)];
 const flush=cards.every(c=>c.suit===cards[0].suit);
 const straight=unique.length===5?(unique[0]-unique[4]===4?unique[0]:unique.join(',')==='14,5,4,3,2'?5:0):0;
 const groups=unique.map(r=>({r,n:ranks.filter(x=>x===r).length})).sort((a,b)=>b.n-a.n||b.r-a.r);
 let score:number[];
 if(flush&&straight)score=[8,straight];
 else if(groups[0].n===4)score=[7,groups[0].r,groups[1].r];
 else if(groups[0].n===3&&groups[1].n===2)score=[6,groups[0].r,groups[1].r];
 else if(flush)score=[5,...ranks];
 else if(straight)score=[4,straight];
 else if(groups[0].n===3)score=[3,...groups.map(g=>g.r)];
 else if(groups[0].n===2&&groups[1].n===2)score=[2,...groups.map(g=>g.r)];
 else if(groups[0].n===2)score=[1,...groups.map(g=>g.r)];
 else score=[0,...ranks];
 const value=Array.from({length:6},(_,i)=>score[i]??0).reduce((a,n)=>a*15+n,0);
 return {value,name:score[0]===8&&straight===14?'Escalera real':names[score[0]],cards:[...cards]};
}
export function evaluate(cards:readonly Card[]){
 if(cards.length<5||cards.length>7||new Set(cards.map(c=>c.id)).size!==cards.length)throw new Error('Cartas inválidas');
 let best:ReturnType<typeof five>|undefined;
 for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
  const candidate=five([cards[a],cards[b],cards[c],cards[d],cards[e]]);
  if(!best||candidate.value>best.value)best=candidate;
 }
 return best!;
}
export type PotLayer={amount:number;eligible:number[];refund:boolean};
export function potStructure(s:Betting):PotLayer[]{
 const levels=[...new Set(s.contributed.filter(n=>n>0))].sort((a,b)=>a-b);
 let prior=0;
 return levels.map(level=>{
  const contributors=s.players.filter(p=>s.contributed[p.seat]>=level);
  const amount=(level-prior)*contributors.length;prior=level;
  const eligible=contributors.filter(p=>!p.folded).map(p=>p.seat);
  if(!eligible.length)throw new Error('Bote sin jugador elegible');
  return {amount,eligible,refund:contributors.length===1};
 });
}
export function settle(hand:InitialHand,s:Betting,board:readonly Card[]){
 if(s.status!=='preflop-complete'||board.length!==5)throw new Error('Showdown no disponible');
 if(s.contributed.reduce((a,b)=>a+b,0)!==s.pot)throw new Error('Bote inconsistente');
 const ranks=s.players.map(p=>p.folded?null:evaluate([...hand.players[p.seat].cards,...board]));
 const payouts=s.players.map(()=>0),pots:{amount:number;winners:number[];refund:boolean}[]=[];
 for(const {amount,eligible,refund} of potStructure(s)){
  const best=Math.max(...eligible.map(seat=>ranks[seat]!.value));
  const winners=eligible.filter(seat=>refund||ranks[seat]!.value===best)
   .sort((a,b)=>(a-hand.dealer-1+s.players.length)%s.players.length-(b-hand.dealer-1+s.players.length)%s.players.length);
  const share=Math.floor(amount/winners.length),odd=amount%winners.length;
  winners.forEach((seat,i)=>payouts[seat]+=share+(i<odd?1:0));pots.push({amount,winners,refund});
 }
 const betting:Betting={...s,status:'settled',pot:0,actor:null,pending:[],last:null,players:s.players.map(p=>({...p,committed:0,stack:p.stack+payouts[p.seat]}))};
 return {betting,payouts,pots,ranks};
}
export type Settlement=ReturnType<typeof settle>;
