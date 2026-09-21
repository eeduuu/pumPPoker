import { createDeck, randomInt } from './deck.ts';
import type { Card } from './deck.ts';
import { evaluate } from './showdown.ts';

// Independent hypothetical deals against uniformly random opponents. Never accepts
// the game's deck, other players' hole cards, burn cards or future community cards.
export function estimateEquity(cards:readonly Card[],board:readonly Card[],opponents:number,samples=32,choose:(limit:number)=>number=randomInt){
 const known=[...cards,...board],deck=createDeck(),ids=new Set(known.map(c=>c.id));
 if(cards.length!==2||![3,4,5].includes(board.length)||ids.size!==known.length||
  !Number.isInteger(opponents)||opponents<1||opponents>8||!Number.isInteger(samples)||samples<1||samples>256||
  known.some(c=>!deck.some(d=>d.id===c.id&&d.rank===c.rank&&d.suit===c.suit)))throw new Error('Simulación inválida');
 const unknown=deck.filter(c=>!ids.has(c.id)),missing=5-board.length;
 let shares=0,wins=0,ties=0;
 for(let sample=0;sample<samples;sample++){
  const pool=[...unknown],drawn:Card[]=[];
  // Partial Fisher–Yates: only draw the cards needed by this hypothetical deal.
  for(let i=0;i<missing+opponents*2;i++){
   const offset=choose(pool.length-i);
   if(!Number.isInteger(offset)||offset<0||offset>=pool.length-i)throw new Error('Azar inválido');
   const j=i+offset;[pool[i],pool[j]]=[pool[j],pool[i]];drawn.push(pool[i]);
  }
  const community=[...board,...drawn.slice(0,missing)];
  const own=evaluate([...cards,...community]).value;
  let equals=0,beaten=false;
  for(let p=0;p<opponents;p++){
   const start=missing+p*2;
   const other=evaluate([drawn[start],drawn[start+1],...community]).value;
   if(other>own){beaten=true;break;}if(other===own)equals++;
  }
  if(!beaten){shares+=1/(equals+1);if(equals)ties++;else wins++;}
 }
 return {share:shares/samples,win:wins/samples,tie:ties/samples,samples};
}

function combinationCount(total:number,take:number){
 let result=1;
 for(let i=1;i<=take;i++)result=result*(total-take+i)/i;
 return result;
}
function stableSeed(cards:readonly Card[]){
 let seed=2166136261;
 for(const card of cards)for(const character of card.id){seed^=character.charCodeAt(0);seed=Math.imul(seed,16777619);}
 return seed>>>0;
}
function percentages(shares:readonly number[],deals:number){
 const raw=shares.map(share=>share*100/deals),values=raw.map(Math.floor);
 let left=100-values.reduce((sum,value)=>sum+value,0);
 const order=raw.map((value,index)=>({index,remainder:value-values[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
 for(let i=0;i<left;i++)values[order[i%order.length].index]++;
 return values;
}

// Equity between already revealed hands. It deliberately receives neither the
// shuffled game deck nor burn cards, so a future card can never leak early.
export function revealedEquityPercentages(hands:readonly (readonly Card[])[],board:readonly Card[],samples=2000){
 const standard=createDeck(),known=[...hands.flat(),...board],ids=new Set(known.map(card=>card.id));
 if(hands.length<2||hands.length>9||hands.some(hand=>hand.length!==2)||![0,3,4,5].includes(board.length)||
  ids.size!==known.length||!Number.isInteger(samples)||samples<100||samples>10000||
  known.some(card=>!standard.some(valid=>valid.id===card.id&&valid.rank===card.rank&&valid.suit===card.suit)))throw new Error('Equity revelada inválida');
 const pool=standard.filter(card=>!ids.has(card.id)),missing=5-board.length,total=combinationCount(pool.length,missing);
 const shares=hands.map(()=>0);let deals=0;
 const score=(extra:readonly Card[])=>{
  const community=[...board,...extra],values=hands.map(hand=>evaluate([...hand,...community]).value),best=Math.max(...values);
  const winners=values.flatMap((value,index)=>value===best?[index]:[]);
  for(const winner of winners)shares[winner]+=1/winners.length;
  deals++;
 };
 if(total<=5000){
  const chosen:Card[]=[];
  const visit=(start:number)=>{if(chosen.length===missing){score(chosen);return;}for(let i=start;i<=pool.length-(missing-chosen.length);i++){chosen.push(pool[i]);visit(i+1);chosen.pop();}};
  visit(0);
 }else{
  let seed=stableSeed(known);
  const choose=(limit:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%limit;};
  for(let sample=0;sample<samples;sample++){
   const available=[...pool],chosen:Card[]=[];
   for(let draw=0;draw<missing;draw++){const index=choose(available.length);chosen.push(available[index]);available.splice(index,1);}
   score(chosen);
  }
 }
 return percentages(shares,deals);
}
