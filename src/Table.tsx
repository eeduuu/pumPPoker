import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { layouts } from './seats';
import type { CSSProperties } from 'react';
import { dealFrame, dealDelay } from './poker/dealPresentation';
import type { InitialHand } from './poker/initialHand';
import { createPreflop, act, toCall, raiseOptions, raiseBreakdown, startPostflop, isAllInRunout } from './poker/preflop';
import type { Action } from './poker/preflop';
import { botView, decideBot } from './poker/basicBot';
import { assignBotProfiles } from './poker/botProfiles';
import type { BotProfile } from './poker/botProfiles';
import { formatBB } from './poker/units';
import { nextCommunity } from './poker/streets';
import type { Community } from './poker/streets';
import { potStructure, settle } from './poker/showdown';
import type { Settlement } from './poker/showdown';
import { continuingHand, refillEmptyStacks } from './poker/nextHand';
import { matchOutcome } from './poker/matchOutcome';
import { nextBlindLevel,levelTime,breakDue } from './poker/levels';
import type { BlindLevel } from './poker/levels';
import { useLevelClock } from './useLevelClock';
import { revealedEquityPercentages } from './poker/equity';
import { BrandLogo } from './BrandLogo';
const symbols = { clubs:'♣', diamonds:'♦', hearts:'♥', spades:'♠' };

type TableConfig = { mode: 'normal' | 'tournament'; bots: number; chips: number; small: number; big: number; minutes:number; growing:boolean; breaks:boolean;every:number;rest:number };

type TableProps={config:TableConfig;hand:InitialHand;onLeave:()=>void;onRestart:()=>void};
export function Table(props:TableProps){
 const [profiles]=useState(()=>assignBotProfiles(props.config.bots));
 const [level,setLevel]=useState({number:1,small:props.config.small,big:props.config.big});
 const [stopped,setStopped]=useState(false);
 const [intermission,setIntermission]=useState<{stacks:number[];upcoming:BlindLevel}|null>(null);
 const enabled=props.config.mode==='tournament'||props.config.growing,duration=props.config.minutes*60000;
 const {elapsed,remaining,reset}=useLevelClock(duration,enabled,stopped||!!intermission);
 const {remaining:breakRemaining,reset:resetBreak}=useLevelClock(props.config.rest*60000,!!intermission,stopped);
 const [hand,setHand]=useState(props.hand),[number,setNumber]=useState(1),[error,setError]=useState('');
 const startNext=useCallback((stacks:number[],upcoming:BlindLevel)=>{
  const next=continuingHand(hand,stacks,upcoming.small,upcoming.big);
  if(upcoming!==level){setLevel(upcoming);reset();}
  setHand(next);setNumber(n=>n+1);setIntermission(null);
 },[hand,level,reset]);
 const advance=useCallback((stacks:number[])=>{
  if(intermission)return;
  try{const upcoming=nextBlindLevel(level,elapsed.current,duration,enabled);
   const nextStacks=props.config.mode==='normal'?refillEmptyStacks(stacks,props.config.chips):[...stacks];
   if(breakDue(props.config.mode,props.config.breaks,props.config.every,level.number,upcoming.number)){resetBreak();setIntermission({stacks:nextStacks,upcoming});}
   else startNext(nextStacks,upcoming);
  }
  catch{setError('No se pudo preparar la siguiente mano. Abandona la mesa para volver a intentarlo.');}
 },[intermission,level,elapsed,duration,enabled,props.config.mode,props.config.chips,props.config.breaks,props.config.every,resetBreak,startNext]);
 useEffect(()=>{
  if(!intermission||breakRemaining>0||error)return;
  try{startNext(intermission.stacks,intermission.upcoming);}
  catch{setError('No se pudo reanudar la mesa. Abandona la mesa para volver a intentarlo.');}
 },[intermission,breakRemaining,error,startNext]);
 const breakLabel=intermission?`Descanso · ${levelTime(breakRemaining)}`:'';
 const levelLabel=breakLabel||(enabled?`Nivel ${level.number} · ${stopped?'Finalizado':remaining===0?'Subida en próxima mano':levelTime(remaining)}`:'Ciegas fijas');
 return <HandTable key={number} {...props} breakLabel={breakLabel} config={{...props.config,small:level.small,big:level.big}} levelLabel={levelLabel} onTerminal={setStopped} profiles={profiles} hand={hand} number={number} onAdvance={advance} advanceError={error}/>;
}
function HandTable({ config, hand, onLeave,onRestart,number,onAdvance,advanceError,profiles,levelLabel,onTerminal,breakLabel }: TableProps&{number:number;onAdvance:(stacks:number[])=>void;advanceError:string;profiles:BotProfile[];levelLabel:string;onTerminal:(value:boolean)=>void;breakLabel:string}) {
 const bb=(amount:number)=>formatBB(amount,config.big);
 const [raiseOpen,setRaiseOpen]=useState(false);
 const [raiseIndex,setRaiseIndex]=useState(0);
 const slider=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(raiseOpen)slider.current?.focus();},[raiseOpen]);
 const heading = useRef<HTMLHeadingElement>(null);
 useEffect(() => { heading.current?.focus(); }, []);
 const [step,setStep]=useState(0);
 const frame=dealFrame(hand,step),delay=dealDelay('Rápida',step);
 useEffect(()=>{
  if(frame.done)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{if(timer!==undefined)clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>setStep(s=>s+1),delay);};
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[step,delay,frame.done]);
 const [betting,setBetting]=useState(()=>createPreflop(hand,config.big));
 const [settlement,setSettlement]=useState<Settlement|null>(null);
 const [community,setCommunity]=useState<Community>({street:0,cards:[],cursor:hand.cursor});
 const [dealingBoard,setDealingBoard]=useState(false);
 const streetName=['Preflop','Flop','Turn','River'][community.street];
 const [showingDecision,setShowingDecision]=useState(false);
 const busy=useRef(false);
 const takeAction=(seat:number,action:Action,amount=0)=>{
  if(busy.current)return;
  busy.current=true;
  setBetting(act(betting,seat,action,amount));
  setShowingDecision(true);
  setRaiseOpen(false);
 };
 useEffect(()=>{
  if(!frame.done||dealingBoard)return;
  const duration=500;
  if(!showingDecision&&(betting.actor===null||betting.actor===0))return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{
   if(timer!==undefined)clearTimeout(timer);
   if(document.hidden)return;
   timer=setTimeout(()=>{
    if(showingDecision){busy.current=false;setShowingDecision(false);}
    else if(betting.actor!==null){const decision=decideBot(botView(hand,betting,betting.actor,community.cards,config.big),profiles[betting.actor-1]);takeAction(betting.actor,decision.action,decision.amount);}
   },duration);
  };
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[frame.done,showingDecision,betting,hand,dealingBoard,community.cards,config.big,profiles]);
 useEffect(()=>{
  if(!frame.done||showingDecision)return;
  if(!dealingBoard&&(betting.status!=='preflop-complete'||community.street>=3))return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{
   if(timer!==undefined)clearTimeout(timer);
   if(document.hidden)return;
   timer=setTimeout(()=>{
    if(dealingBoard)setDealingBoard(false);
    else {setCommunity(nextCommunity(hand,community));setBetting(startPostflop(betting,hand.dealer,config.big));setDealingBoard(true);setRaiseOpen(false);}
   },dealingBoard?650:600);
  };
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[frame.done,showingDecision,dealingBoard,betting,community,hand,config.big]);
 useEffect(()=>{
  if(community.street!==3||dealingBoard||showingDecision||betting.status!=='preflop-complete')return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{if(timer!==undefined)clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>{const result=settle(hand,betting,community.cards);setSettlement(result);setBetting(result.betting);},1000);};
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[community,dealingBoard,showingDecision,betting,hand]);
 const outcome=matchOutcome(betting,config.mode),ended=outcome.ended;
 const allInRunout=isAllInRunout(betting);
 const revealActiveCards=!!settlement||allInRunout;
 const activeSeats=betting.players.filter(player=>!player.folded&&hand.players[player.seat].cards.length===2).map(player=>player.seat);
 const equityBySeat=useMemo(()=>{
  if(!revealActiveCards||activeSeats.length<2)return new Map<number,number>();
  const values=revealedEquityPercentages(activeSeats.map(seat=>hand.players[seat].cards),community.cards);
  return new Map(activeSeats.map((seat,index)=>[seat,values[index]]));
 },[revealActiveCards,betting.players,hand.players,community.cards]);
 const pendingPots=frame.done&&!settlement&&allInRunout?potStructure(betting):[];
 const displayedPot=settlement?settlement.pots.reduce((sum,pot)=>sum+pot.amount,0):frame.done?(betting.status==='uncontested'?betting.contributed.reduce((sum,amount)=>sum+amount,0):betting.pot):frame.pot;
 const humanPayout=settlement?.payouts[0]??0;
 const humanAllIn=frame.done&&!ended&&!betting.players[0].folded&&betting.players[0].stack===0&&hand.players[0].cards.length===2;
 const spectating=config.mode==='tournament'&&!outcome.terminal&&(hand.players[0].cards.length===0||(ended&&betting.players[0].stack===0));
 useEffect(()=>{if(outcome.terminal)onTerminal(true);},[outcome.terminal,onTerminal]);
 const endNotice=advanceError||(breakLabel?'La partida continúa automáticamente al terminar el descanso.':outcome.terminal?outcome.title+'.':spectating?'El torneo continúa automáticamente.':'Siguiente mano en unos segundos…');
 useEffect(()=>{
  if(!outcome.canContinue||showingDecision||advanceError||breakLabel)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{if(timer!==undefined)clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>onAdvance(betting.players.map(p=>p.stack)),5000);};
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[outcome.canContinue,showingDecision,advanceError,betting,onAdvance,!!breakLabel]);
 const canAct=frame.done&&!dealingBoard&&!showingDecision&&betting.actor===0;
 const options=raiseOptions(betting,0,config.big);
 const added=options[raiseIndex]??options[0]??0;
 const committed=(seat:number)=>frame.done?(ended?0:betting.players[seat].committed):hand.players[seat].stack+hand.players[seat].committed-frame.stacks[seat];
 const humanDue=toCall(betting,0);
 const quote=raiseBreakdown(betting,0,added);
 const name=(s:number)=>s===0?'Tú':'Bot '+s;
 const active=dealingBoard?null:frame.done?(showingDecision?betting.last?.seat:betting.actor):step===1?hand.dealer:step===2?hand.smallBlind:step===3?hand.bigBlind:frame.flyingSeat;
 const message=settlement?'Mano terminada':step===0?'Preparando la mesa':step===1?'Dealer: '+name(hand.dealer):step===2?name(hand.smallBlind)+' pone '+bb(hand.players[hand.smallBlind].committed)+' · CP':step===3?name(hand.bigBlind)+' pone '+bb(hand.players[hand.bigBlind].committed)+' · CG':!frame.done?'Carta '+(Math.floor((step-4)/(hand.dealOrder.length/2))+1)+'/2 → '+name(frame.flyingSeat!):dealingBoard?'Repartiendo '+streetName.toLowerCase():showingDecision&&betting.last?name(betting.last.seat)+' · '+(betting.last.action==='fold'?'Se retira':betting.last.action==='check'?'Pasa':betting.last.action==='raise'?'Sube +'+bb(betting.last.raise):'Iguala '+bb(betting.last.amount)):betting.status==='uncontested'?name(betting.winner!)+' gana por retirada':betting.status==='preflop-complete'?(community.street===3?'River completado':streetName+' completado'):betting.actor===0?'Tu turno':'Turno de '+name(betting.actor!);
 const destination=frame.flyingSeat===null?null:frame.flyingSeat===0?[50,98]:layouts[config.bots][frame.flyingSeat-1];
 const stack=(seat:number)=>bb(frame.done?betting.players[seat].stack:frame.stacks[seat]);
 const role = (seat: number) => !hand ? '' : [seat===hand.dealer&&step>=1?'D':'',seat===hand.smallBlind&&step>=2?'CP':'',seat===hand.bigBlind&&step>=3?'CG':''].filter(Boolean).join(' · ');
 const dockStatus=outcome.terminal?'':spectating?(ended?endNotice:'Modo espectador · El torneo continúa.'):ended?endNotice:frame.done&&betting.status!=='playing'?(betting.status==='uncontested'?'Siguiente mano en unos segundos…':community.street===3?'Repartiendo el bote…':'Preparando '+['flop','turn','river'][community.street]+'…'):'';
  return <main className="game-shell" data-hand-number={number} data-deal-step={step} data-street={streetName.toLowerCase()}>
  <header className="game-header"><div className="brand"><BrandLogo/></div><button className="leave" onClick={onLeave}>← Abandonar mesa</button></header>
  <div className="game-meta"><span>{config.mode === 'tournament' ? 'TORNEO' : 'PARTIDA NORMAL'} · {hand.players.filter(p=>p.cards.length>0).length} JUGADORES · MANO {number}</span><span>Ciegas {bb(config.small)} / 1 BB</span></div>
  <div className="level-clock" aria-label="Nivel de ciegas">{levelLabel}</div>
  <section className={"table-stage"+(config.bots>=5?" dense-table":"")+(config.bots>=7?" crowded-table":"")} aria-label="Mesa de póker"><div className="felt" aria-hidden="true"/>
   {layouts[config.bots].map(([x, y], i) => {
    const seat=i+1,player=betting.players[seat],reveal=revealActiveCards&&!player.folded,equity=equityBySeat.get(seat);
    const payout=settlement?.payouts[seat]??0;
    const allIn=frame.done&&!ended&&!player.folded&&player.stack===0&&hand.players[seat].cards.length===2;
    return <article className={"bot-seat"+(active===seat?" receiving":"")+(frame.done&&player.folded?" folded":"")+(payout>0?" winner-seat":"")} key={i} style={{ left: `${x}%`, top: `${y}%` }} aria-label={`Bot ${seat}, ${stack(seat)}${allIn?', all-in':''}${payout>0?', cobra '+bb(payout):''}`}>
     <span className="seat-number" aria-hidden="true">{String(seat).padStart(2, '0')}</span><strong>Bot {seat}{hand.players[seat].cards.length===0?' · Fuera':''}</strong><span className="seat-stack">{stack(seat)}</span>
     {allIn&&<span className="seat-state all-in-state">ALL-IN · {bb(betting.contributed[seat])}</span>}
     {payout>0&&<span className="seat-state payout-state">COBRA {bb(payout)}</span>}
     <span className="position-tag">{role(seat)}</span><span className="hidden-cards" aria-label={reveal?'Cartas de Bot '+seat:frame.counts[seat]+' cartas privadas ocultas'}>{reveal?hand.players[seat].cards.map(c=><span key={c.id} className={'revealed-card '+c.suit}>{({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[c.rank]||c.rank}{symbols[c.suit]}</span>):Array.from({length:frame.counts[seat]},(_,j)=><span key={j} className="dealt-back">▧ </span>)}{equity!==undefined&&<output className="equity-badge" aria-label={'Probabilidad de ganar: '+equity+'%'}>{equity}%</output>}</span>
    </article>;
   })}
   {hand.players.map(p=>{
    const [x,y]=p.seat===0?[50,97]:layouts[config.bots][p.seat-1];
    const location=p.seat===0?'human':y===9?'top':x<50?'left':'right';
    const blind=community.street>0?'':p.seat===hand.smallBlind&&step>=2?'CP':p.seat===hand.bigBlind&&step>=3?'CG':'';
    const amount=betting.status==='uncontested'?0:committed(p.seat);
    return <div key={p.seat} className={'table-markers markers-'+location} style={{left:x+'%',top:y+'%'}} aria-label={'Marcas de '+name(p.seat)}>
     {p.seat===hand.dealer&&step>=1&&<span className="dealer-chip" aria-label={'Dealer: '+name(p.seat)} title={'Dealer: '+name(p.seat)}>D</span>}
     {amount>0&&<div className="table-wager" aria-label={name(p.seat)+' · '+(blind==='CP'?'Ciega pequeña · ':blind==='CG'?'Ciega grande · ':'')+'Apuesta '+bb(amount)}><span className="wager-chip" aria-hidden="true"/><strong>{bb(amount)}</strong>{blind&&<small>{blind}</small>}</div>}
    </div>;
   })}
   <div className="board"><span className="board-brand" aria-hidden="true">pumꟼPoker</span><h1 ref={heading} tabIndex={-1}>{breakLabel?'Descanso del torneo':outcome.terminal&&!showingDecision?outcome.title:message}</h1><p className="pot">BOTE <strong>{bb(displayedPot)}</strong></p><div className="community-slots" aria-label={community.cards.length?streetName+': '+community.cards.length+' cartas comunitarias':'Cinco espacios de cartas comunitarias, sin repartir'}>{Array.from({length:5}, (_, i) => {const c=community.cards[i];return c?<span key={c.id} className={'board-card '+c.suit} aria-label={c.rank+' de '+c.suit}>{({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[c.rank]||c.rank}{symbols[c.suit]}</span>:<span key={i} aria-hidden="true">·</span>;})}</div>
    {pendingPots.length>1&&<div className="pot-breakdown" aria-label="Desglose provisional de botes">{pendingPots.map((pot,i)=><span key={i}>{pot.refund?'DEV.':i===0?'PRINCIPAL':'SEC. '+i} <strong>{bb(pot.amount)}</strong></span>)}</div>}
    {settlement&&<div className="pot-results" aria-label="Reparto del bote">{settlement.pots.map((p,i)=><p key={i}><span>{p.refund?'DEVOLUCIÓN':i===0?'BOTE PRINCIPAL':'BOTE SECUNDARIO '+i} · {bb(p.amount)}</span><strong>{p.refund?'Vuelve a ':'Cobra '}{p.winners.map(seat=>name(seat)).join(' + ')}</strong>{!p.refund&&<small>{settlement.ranks[p.winners[0]]!.name}</small>}</p>)}</div>}<span className="not-dealt">{frame.done ? streetName.toUpperCase() : 'REPARTIENDO'}</span></div>
   {destination && <span key={step} className="flying-card" aria-hidden="true" style={{'--target-x':destination[0]+'%','--target-y':destination[1]+'%','--flight-time':delay+'ms'} as CSSProperties}>♠</span>}
  </section>
   <section className={"player-dock"+(active===0?" human-turn":"")+(humanPayout>0?" human-winner":"")} aria-label="Tu asiento"><div className="player-row"><div className="private-slots" aria-label={hand ? 'Tus cartas' : 'Tus dos cartas, aún sin repartir'}>{hand ? hand.players[0].cards.map((card,index) => index < frame.counts[0] ? <span className={'playing-card '+card.suit} key={card.id}>{({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[card.rank] || card.rank}{symbols[card.suit]}</span> : <span className="empty-card" aria-label="Carta pendiente" key={card.id}/>) : <><span>?</span><span>?</span></>}</div><div><strong>Tú{spectating?' · Fuera':''} <span className="position-tag">{role(0)}</span>{equityBySeat.has(0)&&<output className="equity-badge human-equity" aria-label={'Probabilidad de ganar: '+equityBySeat.get(0)+'%'}>{equityBySeat.get(0)}%</output>}</strong><p>{stack(0)} <span> · Apuesta {bb(committed(0))}</span></p>{humanAllIn&&<span className="human-state all-in-state">ALL-IN · {bb(betting.contributed[0])}</span>}{humanPayout>0&&<span className="human-state payout-state">COBRAS {bb(humanPayout)}</span>}</div><span className="you-badge">TU ASIENTO</span></div>{dockStatus&&<p className="preview-status" role="status">{dockStatus}</p>}{outcome.terminal||spectating?<div className="terminal-actions" aria-label={outcome.terminal?'El torneo ha terminado':'Opciones del espectador'}><button onClick={onLeave}>Volver al lobby</button><button onClick={onRestart}>Nuevo torneo</button></div>:!ended&&(raiseOpen && canAct ? <div className="raise-panel" role="group" aria-label="Configurar subida" onKeyDown={e=>{if(e.key==='Escape')setRaiseOpen(false);}}><div className="raise-row"><input ref={slider} type="range" aria-label="BB de subida" aria-describedby="raise-cost" min="0" max={Math.max(0,options.length-1)} step="1" value={raiseIndex} aria-valuetext={'Subida de '+bb(quote.raise)} onChange={e=>setRaiseIndex(Number(e.target.value))}/><output aria-live="polite">+{bb(quote.raise)}{added===betting.players[0].stack?' · All-in':''}</output></div><p className="raise-cost" id="raise-cost">{quote.call>0?<>Igualar {bb(quote.call)} · </>:null}Se descuentan {bb(quote.additional)}</p><div className="raise-controls"><button onClick={()=>setRaiseOpen(false)}>Cancelar</button><button onClick={()=>takeAction(0,'raise',added)} disabled={!options.length}>Aceptar</button></div></div> : <div className="game-actions" aria-label="Acciones disponibles cuando exista una mano"><button disabled={!canAct} onClick={()=>takeAction(0,'fold')}>Retirarse</button><button disabled={!canAct} onClick={()=>takeAction(0,humanDue?'call':'check')}>{humanDue?'Igualar '+bb(Math.min(humanDue,betting.players[0].stack)):'Pasar'}</button><button disabled={!canAct||!options.length} onClick={()=>{setRaiseIndex(0);setRaiseOpen(true);}}>Subir</button></div>)}</section>
 </main>;
}
