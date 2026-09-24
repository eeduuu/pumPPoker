import type { InitialHand } from './initialHand.ts';
export type Action = 'fold'|'check'|'call'|'raise';
export type Betting = {players:{seat:number;stack:number;committed:number;folded:boolean}[];contributed:number[];pot:number;bet:number;minRaise:number;actedAt:(number|null)[];pending:number[];actor:number|null;status:'playing'|'preflop-complete'|'uncontested'|'settled';winner:number|null;last:{seat:number;action:Action;amount:number;raise:number}|null};
function finish(s:Betting,after:number):Betting {
 const live=s.players.filter(p=>!p.folded);
 if(live.length===1){s.winner=live[0].seat;live[0].stack+=s.pot;s.pot=0;s.actor=null;s.pending=[];s.status='uncontested';return s;}
 s.pending=s.pending.filter(i=>!s.players[i].folded&&s.players[i].stack>0);
 const actionable=live.filter(p=>p.stack>0);
 if(actionable.length===1 && actionable[0].committed>=Math.max(...live.filter(p=>p!==actionable[0]).map(p=>p.committed)))s.pending=[];
 if(!s.pending.length){s.actor=null;s.status='preflop-complete';return s;}
 for(let k=1;k<=s.players.length;k++){const i=(after+k)%s.players.length;if(s.pending.includes(i)){s.actor=i;break;}}
 return s;
}
export function createPreflop(hand:InitialHand,big:number):Betting {
 const players=hand.players.map(p=>({seat:p.seat,stack:p.stack,committed:p.committed,folded:p.cards.length===0}));
 return finish({players,contributed:players.map(p=>p.committed),pot:hand.pot,bet:big,minRaise:big,actedAt:players.map(()=>null),pending:players.filter(p=>p.stack>0).map(p=>p.seat),actor:null,status:'playing',winner:null,last:null},(hand.firstPreflop+players.length-1)%players.length);
}
export function toCall(s:Betting,seat:number){return Math.max(0,s.bet-s.players[seat].committed);}
export function isAllInRunout(s:Betting){
 if(s.status!=='preflop-complete')return false;
 const live=s.players.filter(p=>!p.folded);
 return live.length>1&&live.filter(p=>p.stack>0).length<=1;
}
export function startPostflop(s:Betting,dealer:number,big:number):Betting {
 if(s.status!=='preflop-complete')throw new Error('La ronda no ha terminado');
 const players=s.players.map(p=>({...p,committed:0}));
 const pending=players.filter(p=>!p.folded&&p.stack>0).map(p=>p.seat);
 return finish({...s,players,bet:0,minRaise:big,actedAt:players.map(()=>null),pending:pending.length>1?pending:[],actor:null,status:'playing',last:null},dealer);
}
export function raiseBreakdown(s:Betting,seat:number,additional:number){
 const call=toCall(s,seat);
 return {call,raise:Math.max(0,additional-call),additional,total:s.players[seat].committed+additional};
}
export function act(s:Betting,seat:number,action:Action,additional=0):Betting {
 if(s.status!=='playing'||s.actor!==seat)throw new Error('No es su turno');
 if(!['fold','check','call','raise'].includes(action))throw new Error('Acción no implementada');
 const due=toCall(s,seat);if(action==='check'&&due>0)throw new Error('No se puede pasar debiendo fichas');
 if(action==='call'&&due===0)throw new Error('Debe pasar, no igualar');
 if(action==='raise'){
  const p=s.players[seat],target=p.committed+additional,delta=target-s.bet;
  if(!canRaise(s,seat)||!Number.isSafeInteger(additional)||additional<=due||additional>p.stack||(delta<s.minRaise&&additional!==p.stack))throw new Error('Subida ilegal');
 }
 const next:Betting={...s,contributed:[...s.contributed],actedAt:[...s.actedAt],players:s.players.map(p=>({...p})),pending:s.pending.filter(i=>i!==seat)};
 const p=next.players[seat],amount=action==='raise'?additional:action==='call'?Math.min(due,p.stack):0;
 const pureRaise=action==='raise'?Math.max(0,p.committed+amount-s.bet):0;
 if(action==='fold')p.folded=true;
 p.stack-=amount;p.committed+=amount;next.pot+=amount;next.contributed[seat]+=amount;next.last={seat,action,amount,raise:pureRaise};
 if(action==='raise'){
  const delta=p.committed-s.bet;next.bet=p.committed;if(delta>=s.minRaise)next.minRaise=delta;
  next.pending=next.players.filter(q=>q.seat!==seat&&!q.folded&&q.stack>0&&q.committed<next.bet).map(q=>q.seat);
 }
 next.actedAt[seat]=next.bet;
 return finish(next,seat);
}
// A player who leaves a live online hand forfeits without waiting for their turn.
export function forfeitSeat(s:Betting,seat:number):Betting {
 if(s.status!=='playing'||s.players[seat]?.folded)return s;
 if(s.actor===seat)return act(s,seat,'fold');
 const next:Betting={...s,players:s.players.map(p=>({...p})),pending:s.pending.filter(i=>i!==seat),actedAt:[...s.actedAt],contributed:[...s.contributed]};
 next.players[seat].folded=true;
 return finish(next,s.actor===null?seat:(s.actor+s.players.length-1)%s.players.length);
}
export function canRaise(s:Betting,seat:number){const p=s.players[seat];return s.status==='playing'&&s.actor===seat&&p.stack>toCall(s,seat)&&(s.actedAt[seat]===null||s.bet-s.actedAt[seat]!>=s.minRaise)&&s.players.some(q=>q.seat!==seat&&!q.folded&&q.stack>0);}
export function raiseOptions(s:Betting,seat:number,big:number){
 if(!canRaise(s,seat))return [];
 const max=s.players[seat].stack,min=Math.min(max,s.bet+s.minRaise-s.players[seat].committed);
 const options=[];for(let value=min;value<=max;value+=big)options.push(value);
 if(options.at(-1)!==max)options.push(max);return options;
}
