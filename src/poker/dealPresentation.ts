import type { InitialHand } from './initialHand.ts';
export function dealFrame(hand: InitialHand, step: number) {
 const end=4+hand.dealOrder.length,current=Math.max(0,Math.min(end,Math.floor(step)));
 const dealt=hand.dealOrder.slice(0,Math.max(0,current-4));
 const counts=hand.players.map(p=>dealt.filter(s=>s===p.seat).length);
 const paid=(seat:number)=>(seat===hand.smallBlind&&current>=2)||(seat===hand.bigBlind&&current>=3);
 return {end,done:current===end,counts,stacks:hand.players.map(p=>p.stack+(paid(p.seat)?0:p.committed)),pot:hand.players.reduce((s,p)=>s+(paid(p.seat)?p.committed:0),0),flyingSeat:current>=4&&current<end?hand.dealOrder[current-4]:null};
}
export function dealDelay(speed:string,step:number){const t=speed==='Rápida'?[450,400,300,300,180]:speed==='Pausada'?[800,650,550,550,400]:[600,500,400,400,260];return t[Math.min(Math.max(0,step),4)];}
