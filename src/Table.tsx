import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layouts, mobileLayouts, mobileSeatLeft } from './seats';
import type { CSSProperties } from 'react';
import { dealFrame, dealDelay } from './poker/dealPresentation';
import type { InitialHand } from './poker/initialHand';
import { createPreflop, act, toCall, raiseOptions, raiseBreakdown, startPostflop, isAllInRunout } from './poker/preflop';
import type { Action } from './poker/preflop';
import { preselectedAction, validPreselection } from './poker/preselectedAction';
import type { PreselectedAction } from './poker/preselectedAction';
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
import { scheduledBlindLevel,timeToNextLevel,levelTime,breakDue,nextBreakElapsedMs,clockLevelNumber } from './poker/levels';
import type { BlindLevel } from './poker/levels';
import { useLevelClock } from './useLevelClock';
import { revealedEquityPercentages } from './poker/equity';
import { resultHeadline } from './resultHeadline';
import { BrandLogo } from './BrandLogo';
import { handSeatStatus, tournamentSeatEliminated, newlyEliminatedSeats } from './seatStatus';
import { AudioPreferences, useFeedback } from './feedback';
import { CELEBRATION_MS, Confetti } from './Confetti';
import { SeatReveal } from './SeatReveal';
import { EliminationAnimation } from './EliminationAnimation';
import { fitBoardCenter } from './boardPlacement';
import bombBody from './assets/bomb-body-transparent.png';
const symbols = { clubs:'♣', diamonds:'♦', hearts:'♥', spades:'♠' };
// Same clockwise seat IDs, with room for each player's cards at showdown.
const revealLayouts: typeof layouts = {
 1:[[50,12]],
 2:[[25,12],[75,12]],
 3:[[17,12],[50,12],[83,12]],
 4:[[23,74],[25,12],[75,12],[77,74]],
 5:[[23,88],[23,65],[50,12],[77,65],[77,88]],
 6:[[23,88],[23,65],[25,12],[75,12],[77,65],[77,88]],
 7:[[23,88],[23,65],[17,12],[50,12],[83,12],[77,65],[77,88]],
 8:[[23,90],[23,73],[23,56],[25,12],[75,12],[77,56],[77,73],[77,90]],
};

function EliminationMark() {
 return <span className="elimination-mark" aria-hidden="true">
  <img src={bombBody} alt=""/>
  <svg viewBox="0 0 64 64" focusable="false"><path d="m26 18 9 11-7 8 10 12m-7-18 8 2 6-7M20 43l8-6"/></svg>
 </span>;
}

type TableConfig = { mode: 'normal' | 'tournament'; bots: number; chips: number; small: number; big: number; minutes:number; growing:boolean; breaks:boolean;every:number;rest:number };

type TableProps={config:TableConfig;hand:InitialHand;playerName:string;onLeave:()=>void;onRestart:()=>void};
export function Table(props:TableProps){
 const [profiles]=useState(()=>assignBotProfiles(props.config.bots));
 const [level,setLevel]=useState({number:1,small:props.config.small,big:props.config.big});
 const [stopped,setStopped]=useState(false);
 const [intermission,setIntermission]=useState<{stacks:number[];upcoming:BlindLevel}|null>(null);
 const enabled=props.config.mode==='tournament'||props.config.growing,duration=props.config.minutes*60000;
 const breakLimit=nextBreakElapsedMs(props.config.mode,enabled,props.config.breaks,props.config.every,level.number,duration);
 const {elapsedMs,readElapsed}=useLevelClock(duration,enabled,stopped||!!intermission,breakLimit);
 const {remaining:breakRemaining,reset:resetBreak}=useLevelClock(props.config.rest*60000,!!intermission,stopped);
 const [hand,setHand]=useState(props.hand),[number,setNumber]=useState(1),[error,setError]=useState('');
 const startNext=useCallback((stacks:number[],upcoming:BlindLevel)=>{
  const next=continuingHand(hand,stacks,upcoming.small,upcoming.big);
  if(upcoming.number!==level.number)setLevel(upcoming);
  setHand(next);setNumber(n=>n+1);setIntermission(null);
 },[hand,level]);
 const advance=useCallback((stacks:number[])=>{
  if(intermission)return;
  try{const upcoming=scheduledBlindLevel({number:1,small:props.config.small,big:props.config.big},readElapsed(),duration,enabled,props.config.chips*(props.config.bots+1));
   const nextStacks=props.config.mode==='normal'?refillEmptyStacks(stacks,props.config.chips):[...stacks];
   if(breakDue(props.config.mode,props.config.breaks,props.config.every,level.number,upcoming.number)){resetBreak();setIntermission({stacks:nextStacks,upcoming});}
   else startNext(nextStacks,upcoming);
  }
  catch{setError('No se pudo preparar la siguiente mano. Abandona la mesa para volver a intentarlo.');}
 },[intermission,level,readElapsed,duration,enabled,props.config.mode,props.config.small,props.config.big,props.config.chips,props.config.bots,props.config.breaks,props.config.every,resetBreak,startNext]);
 useEffect(()=>{
  if(!intermission||breakRemaining>0||error)return;
  try{startNext(intermission.stacks,intermission.upcoming);}
  catch{setError('No se pudo reanudar la mesa. Abandona la mesa para volver a intentarlo.');}
 },[intermission,breakRemaining,error,startNext]);
 const breakLabel=intermission?`Descanso · ${levelTime(breakRemaining)}`:'';
 const breakPending=elapsedMs>=breakLimit;
 const nextLevelTime=enabled?levelTime(breakPending?0:timeToNextLevel(elapsedMs,duration)):'';
 const clockLevel=enabled?clockLevelNumber(elapsedMs,duration,breakLimit):level.number;
 const levelLabel=breakLabel||(enabled?`Nivel ${stopped?level.number:clockLevel} · ${stopped?'Finalizado':breakPending?`Descanso pendiente · ${nextLevelTime}`:nextLevelTime}`:'Ciegas fijas');
 return <HandTable key={number} {...props} breakLabel={breakLabel} config={{...props.config,small:level.small,big:level.big}} levelLabel={levelLabel} onTerminal={setStopped} profiles={profiles} hand={hand} number={number} onAdvance={advance} advanceError={error}/>;
}
function HandTable({ config, hand, playerName, onLeave,onRestart,number,onAdvance,advanceError,profiles,levelLabel,onTerminal,breakLabel }: TableProps&{number:number;onAdvance:(stacks:number[])=>void;advanceError:string;profiles:BotProfile[];levelLabel:string;onTerminal:(value:boolean)=>void;breakLabel:string}) {
 const {feedback,haptic}=useFeedback();
 const [portrait,setPortrait]=useState(()=>window.matchMedia('(max-width:600px)').matches);
 useEffect(()=>{const media=window.matchMedia('(max-width:600px)');const sync=()=>setPortrait(media.matches);media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 const bb=(amount:number)=>formatBB(amount,config.big);
 const [raiseOpen,setRaiseOpen]=useState(false);
 const [raiseIndex,setRaiseIndex]=useState(0);
 const slider=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(raiseOpen)slider.current?.focus();},[raiseOpen]);
 const heading = useRef<HTMLHeadingElement>(null);
 const stageRef = useRef<HTMLElement>(null);
 const boardRef = useRef<HTMLDivElement>(null);
 useEffect(() => { heading.current?.focus(); }, []);
 useLayoutEffect(()=>{
  if(!portrait)return;
  const stage=stageRef.current,board=boardRef.current;
  const cards=board?.querySelector<HTMLElement>('.community-slots');
  if(!stage||!board||!cards)return;
  const seats=Array.from(stage.querySelectorAll<HTMLElement>('.bot-seat'));
  const place=()=>{
   const stageRect=stage.getBoundingClientRect();
   const cardHeight=cards.getBoundingClientRect().height;
   const bounds=seats.map(seat=>seat.getBoundingClientRect());
   const short=window.matchMedia('(max-height:620px)').matches;
   const ideal=stageRect.top+stageRect.height*(short?.48:.49)+28;
   const center=fitBoardCenter(ideal,cardHeight,bounds,stageRect.top+stageRect.height/2)-stageRect.top;
   const previous=Number.parseFloat(board.style.getPropertyValue('--board-card-center'));
   if(!Number.isFinite(previous)||Math.abs(previous-center)>.5)board.style.setProperty('--board-card-center',center+'px');
  };
  const observer=new ResizeObserver(place);
  observer.observe(stage);observer.observe(cards);
  seats.forEach(seat=>observer.observe(seat));
  window.addEventListener('resize',place);
  place();
  return()=>{observer.disconnect();window.removeEventListener('resize',place);};
 },[portrait,config.bots]);
 const [step,setStep]=useState(0);
 const frame=dealFrame(hand,step),delay=dealDelay('Rápida',step);
 const soundedDealStep=useRef(-1);
 useEffect(()=>{
  if(step>=4&&step!==soundedDealStep.current){soundedDealStep.current=step;feedback('deal');}
 },[step,feedback]);
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
 const [queuedAction,setQueuedAction]=useState<PreselectedAction|null>(null);
 const busy=useRef(false);
 const takeAction=useCallback((seat:number,action:Action,amount=0)=>{
  if(busy.current)return;
  busy.current=true;
  feedback('action');
  const next=act(betting,seat,action,amount);
  if(seat===0){
   setQueuedAction(null);
  }
  setBetting(next);
  setShowingDecision(true);
  setRaiseOpen(false);
 },[betting,feedback]);
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
 },[frame.done,showingDecision,betting,hand,dealingBoard,community.cards,config.big,profiles,takeAction]);
 useEffect(()=>{
  if(!frame.done||showingDecision)return;
  if(!dealingBoard&&(betting.status!=='preflop-complete'||community.street>=3))return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{
   if(timer!==undefined)clearTimeout(timer);
   if(document.hidden)return;
   timer=setTimeout(()=>{
    if(dealingBoard)setDealingBoard(false);
    else {feedback('deal');setCommunity(nextCommunity(hand,community));setBetting(startPostflop(betting,hand.dealer,config.big));setDealingBoard(true);setRaiseOpen(false);}
   },dealingBoard?650:600);
  };
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[frame.done,showingDecision,dealingBoard,betting,community,hand,config.big,feedback]);
 useEffect(()=>{
  if(community.street!==3||dealingBoard||showingDecision||betting.status!=='preflop-complete')return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{if(timer!==undefined)clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>{const result=settle(hand,betting,community.cards);setSettlement(result);setBetting(result.betting);},1000);};
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
 },[community,dealingBoard,showingDecision,betting,hand]);
  const outcome=matchOutcome(betting,config.mode),ended=outcome.ended;
  const eliminationSeats=newlyEliminatedSeats(config.mode,betting.status,hand.players,betting.players);
  const [eliminationIndex,setEliminationIndex]=useState(0);
  const [explodedIndex,setExplodedIndex]=useState(-1);
  const eliminating=eliminationIndex<eliminationSeats.length;
  const eliminationSeat=eliminating?eliminationSeats[eliminationIndex]:null;
  const showEliminationMark=(seat:number)=>{
   const index=eliminationSeats.indexOf(seat);
   return index<0||index<eliminationIndex||index===explodedIndex;
  };
  const showEliminatedStatus=(seat:number)=>{
   const index=eliminationSeats.indexOf(seat);
   return index<0||index<eliminationIndex;
  };
 const terminalWinner=outcome.terminal?(betting.players.find(player=>player.stack>0)?.seat??null):null;
 const winnerName=terminalWinner===0?playerName:terminalWinner===null?'':`Bot ${terminalWinner}`;
 const [celebrating,setCelebrating]=useState(false);
 const [celebrationPaused,setCelebrationPaused]=useState(false);
 const celebrationAnnounced=useRef(false);
 const celebrationCompleted=useRef(false);
 useEffect(()=>{
  if(config.mode!=='tournament'||terminalWinner===null||eliminating||celebrationCompleted.current)return;
  let remaining=CELEBRATION_MS;
  let startedAt=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const resume=()=>{
   if(document.hidden||celebrationCompleted.current||timer!==undefined)return;
   if(!celebrationAnnounced.current){celebrationAnnounced.current=true;feedback('win');if(terminalWinner===0)haptic('TOURNAMENT_WIN');}
   setCelebrating(true);
   setCelebrationPaused(false);
   startedAt=performance.now();
   timer=setTimeout(()=>{timer=undefined;celebrationCompleted.current=true;},remaining);
  };
  const onVisibility=()=>{
   if(celebrationCompleted.current)return;
   if(document.hidden){
    if(timer!==undefined){remaining=Math.max(0,remaining-(performance.now()-startedAt));clearTimeout(timer);timer=undefined;}
    setCelebrationPaused(true);
   }else resume();
  };
  document.addEventListener('visibilitychange',onVisibility);
  resume();
  return()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',onVisibility);};
 },[config.mode,terminalWinner,eliminating,feedback,haptic]);
 const localHandWon=(settlement?.payouts[0]??0)>0||(betting.status==='uncontested'&&betting.winner===0);
 const handWinAnnounced=useRef(false);
 useEffect(()=>{
  if(localHandWon&&!outcome.terminal&&!handWinAnnounced.current){handWinAnnounced.current=true;haptic('WIN');}
 },[localHandWon,outcome.terminal,haptic]);
 const allInRunout=isAllInRunout(betting);
 const revealActiveCards=!!settlement||allInRunout;
 const activeSeats=betting.players.filter(player=>!player.folded&&hand.players[player.seat].cards.length===2).map(player=>player.seat);
 const compareHands=revealActiveCards&&activeSeats.length>=2;
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
   if(!outcome.canContinue||showingDecision||advanceError||breakLabel||eliminating)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
   const schedule=()=>{if(timer!==undefined)clearTimeout(timer);if(!document.hidden)timer=setTimeout(()=>onAdvance(betting.players.map(p=>p.stack)),eliminationSeats.length?350:5000);};
  schedule();document.addEventListener('visibilitychange',schedule);
  return ()=>{if(timer!==undefined)clearTimeout(timer);document.removeEventListener('visibilitychange',schedule);};
  },[outcome.canContinue,showingDecision,advanceError,betting,onAdvance,!!breakLabel,eliminating,eliminationSeats.length]);
 const canAct=frame.done&&!dealingBoard&&!showingDecision&&betting.actor===0;
 const wasHumanTurn=useRef(false);
 useEffect(()=>{
  if(canAct&&!wasHumanTurn.current){feedback('turn');haptic('TURN_START');}
  wasHumanTurn.current=canAct;
 },[canAct,feedback]);
 const options=raiseOptions(betting,0,config.big);
 const added=options[raiseIndex]??options[0]??0;
 const committed=(seat:number)=>frame.done?(ended?0:betting.players[seat].committed):hand.players[seat].stack+hand.players[seat].committed-frame.stacks[seat];
 const humanDue=toCall(betting,0);
 const validQueuedAction=validPreselection(queuedAction,betting,community.street);
 const canQueueAction=frame.done&&!ended&&!allInRunout&&(betting.status==='playing'||(betting.status==='preflop-complete'&&community.street<3))&&!betting.players[0].folded&&betting.players[0].stack>0;
 const toggleQueuedAction=(kind:PreselectedAction['kind'])=>{
  if(!canQueueAction)return;
  const next=preselectedAction(kind,betting,community.street);
  if(!next)return;
  setQueuedAction(current=>validPreselection(current,betting,community.street)?.kind===kind?null:next);
 };
 useEffect(()=>{if(queuedAction&&(!validQueuedAction||!canQueueAction))setQueuedAction(null);},[queuedAction,validQueuedAction,canQueueAction]);
 useEffect(()=>{
  if(!canAct||!validQueuedAction||busy.current)return;
  takeAction(0,validQueuedAction.kind==='fold'?'fold':validQueuedAction.action);
 },[canAct,validQueuedAction,takeAction]);
 const quote=raiseBreakdown(betting,0,added);
 const name=(s:number)=>s===0?playerName:'Bot '+s;
 const equityClass=(percentage:number)=>percentage>=70?'equity-ahead':percentage<=30?'equity-behind':'equity-close';
 const active=dealingBoard?null:frame.done?(showingDecision?(betting.last?.seat===0?null:betting.last?.seat):betting.actor):step===1?hand.dealer:step===2?hand.smallBlind:step===3?hand.bigBlind:frame.flyingSeat;
 const deciding=frame.done&&!dealingBoard&&!showingDecision&&betting.status==='playing'?betting.actor:null;
  const uncontestedMessage=betting.winner===0?'Ganas por retirada':name(betting.winner!)+' gana por retirada';
  const message=settlement?resultHeadline(settlement,name):step===0?'Preparando la mesa':step===1?'Dealer: '+name(hand.dealer):step===2?name(hand.smallBlind)+' pone '+bb(hand.players[hand.smallBlind].committed)+' · CP':step===3?name(hand.bigBlind)+' pone '+bb(hand.players[hand.bigBlind].committed)+' · CG':!frame.done?'Carta '+(Math.floor((step-4)/(hand.dealOrder.length/2))+1)+'/2 → '+name(frame.flyingSeat!):dealingBoard?'Repartiendo '+streetName.toLowerCase():showingDecision&&betting.last?name(betting.last.seat)+' · '+(betting.last.action==='fold'?'Se retira':betting.last.action==='check'?'Pasa':betting.last.action==='raise'?'Sube +'+bb(betting.last.raise):'Iguala '+bb(betting.last.amount)):betting.status==='uncontested'?uncontestedMessage:betting.status==='preflop-complete'?(community.street===3?'River completado':streetName+' completado'):'Turno de '+name(betting.actor!);
  const terminalCategory=settlement&&terminalWinner!=null?settlement.ranks[terminalWinner]?.name.toLocaleLowerCase('es'):betting.status==='uncontested'?'por retirada':null;
 const destination=frame.flyingSeat===null?null:frame.flyingSeat===0?portrait?[50,97]:[50,98]:(portrait?mobileLayouts:layouts)[config.bots][frame.flyingSeat-1];
 const destinationLeft=destination===null?null:portrait&&frame.flyingSeat!==null&&frame.flyingSeat>0?mobileSeatLeft(config.bots,frame.flyingSeat-1):destination[0]+'%';
 const stack=(seat:number)=>bb(frame.done?betting.players[seat].stack:frame.stacks[seat]);
 const role = (seat: number) => !hand ? '' : [seat===hand.dealer&&step>=1?'D':'',seat===hand.smallBlind&&step>=2?'CP':'',seat===hand.bigBlind&&step>=3?'CG':''].filter(Boolean).join(' · ');
 const roleBadges=(seat:number)=><>{seat===hand.dealer&&step>=1&&<span className="dealer-chip" aria-label={'Dealer: '+name(seat)} title={'Dealer: '+name(seat)}>D</span>}{seat===hand.smallBlind&&step>=2&&<span className="blind-chip" title="Ciega pequeña">CP</span>}{seat===hand.bigBlind&&step>=3&&<span className="blind-chip" title="Ciega grande">CG</span>}</>;
 const humanStatus=handSeatStatus(ended,frame.counts[0],betting.players[0].folded);
 const humanEliminated=tournamentSeatEliminated(config.mode,betting.players[0].stack,hand.players[0].cards.length>0,ended)&&showEliminatedStatus(0);
 const dockStatus=outcome.terminal?'':spectating?(ended?endNotice:'Modo espectador · El torneo continúa.'):ended?endNotice:frame.done&&betting.status!=='playing'?(betting.status==='uncontested'?'Siguiente mano en unos segundos…':community.street===3?'Repartiendo el bote…':'Preparando '+['flop','turn','river'][community.street]+'…'):'';
  return <main className={'game-shell'+(compareHands?' reveal-active':'')} data-hand-number={number} data-deal-step={step} data-street={streetName.toLowerCase()} data-human-hand-status={humanStatus??undefined}>
  <header className="game-header"><div className="brand"><BrandLogo/></div><div className="game-header-actions"><AudioPreferences onLeave={onLeave}/></div></header>
  <div className="game-meta"><span>{config.mode === 'tournament' ? 'TORNEO' : 'PARTIDA NORMAL'} · {hand.players.filter(p=>p.cards.length>0).length} JUGADORES · MANO {number}</span><span>Ciegas {bb(config.small)} / 1 BB</span></div>
  <div className="level-clock" aria-label="Nivel de ciegas">{levelLabel}</div>
  <div className="table-surface">
  <section ref={stageRef} className={"table-stage seat-count-"+config.bots+(config.bots>=5?" dense-table":"")+(config.bots>=7?" crowded-table":"")} aria-label="Mesa de póker"><div className="felt" aria-hidden="true"/>
   {layouts[config.bots].map((position, i) => {
    const [x,y]=portrait?mobileLayouts[config.bots][i]:compareHands?revealLayouts[config.bots][i]:position;
    const isTop=!portrait&&position[1]===9;
    const seat=i+1,player=betting.players[seat],reveal=revealActiveCards&&!player.folded,equity=equityBySeat.get(seat);
    const seatStatus=handSeatStatus(ended,frame.counts[seat],player.folded);
    const eliminated=tournamentSeatEliminated(config.mode,player.stack,hand.players[seat].cards.length>0,ended)&&showEliminatedStatus(seat);
    const payout=settlement?.payouts[seat]??0;
    const allIn=frame.done&&!ended&&!player.folded&&player.stack===0&&hand.players[seat].cards.length===2;
    const amount=betting.status==='uncontested'?0:committed(seat);
    const blind=community.street>0?'':seat===hand.smallBlind&&step>=2?'CP':seat===hand.bigBlind&&step>=3?'CG':'';
    return <article className={"bot-seat"+(active===seat?" receiving":"")+(deciding===seat?" deciding":"")+(payout>0?" winner-seat":"")+(eliminated?" eliminated":"")+(compareHands&&reveal?" reveal-showing":"")+(compareHands&&reveal&&isTop?" reveal-top":"")+(compareHands&&reveal&&isTop&&(config.bots===3||config.bots===7)?" reveal-top-three":"")} data-hand-status={seatStatus??undefined} data-seat={seat} key={i} style={{ left: portrait?mobileSeatLeft(config.bots,i):`${x}%`, top: `${y}%` }} aria-label={`Bot ${seat}, ${stack(seat)}${eliminated?', eliminado del torneo':seatStatus==='active'?', activo en la mano':seatStatus==='folded'?', retirado de esta mano':''}${allIn?', all-in':''}${payout>0?', cobra '+bb(payout):''}`}>
     <div className="seat-heading"><strong>Bot {seat}{eliminated?' · Fuera':''}</strong><span className="seat-roles" aria-label={role(seat)||undefined}>{roleBadges(seat)}</span>{compareHands&&reveal&&<output className={'seat-reveal-equity '+equityClass(equity??0)} aria-label={'Probabilidad de ganar: '+(equity??0)+'%'}>{equity??0}%</output>}</div>
     {compareHands&&reveal?<SeatReveal cards={hand.players[seat].cards} name={name(seat)} amount={bb(betting.contributed[seat])} allIn={allIn} payout={payout>0?bb(payout):null}/>:<><div className="seat-balance">{allIn?<span className="seat-state all-in-state">ALL-IN {bb(betting.contributed[seat])}</span>:payout>0?<span className="seat-state payout-state">COBRA {bb(payout)}</span>:equity!==undefined?<output className={'equity-badge '+equityClass(equity)} aria-label={'Probabilidad de ganar: '+equity+'%'}>{equity}%</output>:<span className="seat-stack">{stack(seat)}</span>}</div><div className="seat-foot"><span className="hidden-cards" aria-label={reveal?'Cartas de Bot '+seat:frame.counts[seat]+' cartas privadas ocultas'}>{reveal?hand.players[seat].cards.map(c=><span key={c.id} className={'revealed-card '+c.suit}>{({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[c.rank]||c.rank}{symbols[c.suit]}</span>):Array.from({length:frame.counts[seat]},(_,j)=><span key={j} className="dealt-back">▧ </span>)}{equity!==undefined&&(allIn||payout>0)&&<output className={'equity-badge '+equityClass(equity)} aria-label={'Probabilidad de ganar: '+equity+'%'}>{equity}%</output>}</span>{amount>0&&<span className="seat-wager" aria-label={name(seat)+' · '+(blind==='CP'?'Ciega pequeña · ':blind==='CG'?'Ciega grande · ':'')+'Apuesta '+bb(amount)}>{bb(amount)}</span>}</div></>}
      {eliminated&&showEliminationMark(seat)&&<EliminationMark/>}
    </article>;
   })}
    <div ref={boardRef} className="board"><span className="board-brand" aria-hidden="true">pumꟼPoker</span><h1 ref={heading} tabIndex={-1}>{breakLabel?'Descanso del torneo':outcome.terminal&&!showingDecision?outcome.title+(terminalCategory?' · '+terminalCategory:''):message}</h1><p className="pot">BOTE <strong>{bb(displayedPot)}</strong></p><div className="community-slots" aria-label={community.cards.length?streetName+': '+community.cards.length+' cartas comunitarias':'Cinco espacios de cartas comunitarias, sin repartir'}>{Array.from({length:5}, (_, i) => {const c=community.cards[i];return c?<span key={c.id} className={'board-card '+c.suit} aria-label={c.rank+' de '+c.suit}><span className="board-rank">{({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[c.rank]||c.rank}</span><span className="board-suit" aria-hidden="true">{symbols[c.suit]}</span></span>:<span key={i} aria-hidden="true">·</span>;})}</div>
    {pendingPots.length>1&&<div className="pot-breakdown" aria-label="Desglose provisional de botes">{pendingPots.map((pot,i)=><span key={i}>{pot.refund?'DEV.':i===0?'PRINCIPAL':'SEC. '+i} <strong>{bb(pot.amount)}</strong></span>)}</div>}
    {settlement&&<div className="pot-results" aria-label="Reparto del bote">{settlement.pots.map((p,i)=><p key={i}><span>{p.refund?'DEVOLUCIÓN':i===0?'BOTE PRINCIPAL':'BOTE SECUNDARIO '+i} · {bb(p.amount)}</span><strong>{p.refund?'Vuelve a ':'Cobra '}{p.winners.map(seat=>name(seat)).join(' + ')}</strong>{!p.refund&&<small>{settlement.ranks[p.winners[0]]!.name}</small>}</p>)}</div>}<span className="not-dealt">{frame.done ? streetName.toUpperCase() : 'REPARTIENDO'}</span></div>
   {compareHands&&(settlement||pendingPots.length>1)&&<details className="reveal-pot-details"><summary>{settlement?'Resultado':'Botes'} ▾</summary><div className="reveal-pot-list" aria-label={settlement?'Reparto del bote':'Desglose provisional de botes'}>{settlement?settlement.pots.map((pot,i)=><p key={i}><strong>{pot.refund?'Devolución':i===0?'Principal':`Secundario ${i}`} · {bb(pot.amount)}</strong><span>{pot.refund?'Vuelve a ':'Cobra '}{pot.winners.map(name).join(' + ')}</span>{!pot.refund&&<small>{settlement.ranks[pot.winners[0]]!.name}</small>}</p>):pendingPots.map((pot,i)=><p key={i}><strong>{pot.refund?'Devolución':i===0?'Principal':`Secundario ${i}`} · {bb(pot.amount)}</strong></p>)}</div></details>}
   {destination && <span key={step} className="flying-card" aria-hidden="true" style={{'--target-x':destinationLeft,'--target-y':destination[1]+'%','--flight-time':delay+'ms'} as CSSProperties}>♠</span>}
  </section>
   <section className={"player-dock"+(active===0?" human-turn":"")+(deciding===0?" deciding":"")+(humanPayout>0?" human-winner":"")+(humanEliminated?" eliminated":"")} aria-label={humanEliminated?'Tu asiento, eliminado del torneo':'Tu asiento'}><div className="player-row"><div className="private-slots" aria-label={hand ? 'Tus cartas' : 'Tus dos cartas, aún sin repartir'}>{hand ? hand.players[0].cards.map((card,index) => index < frame.counts[0] ? <span className={'playing-card '+card.suit} key={card.id}>{({11:'J',12:'Q',13:'K',14:'A'} as Record<number,string>)[card.rank] || card.rank}{symbols[card.suit]}</span> : <span className="empty-card" aria-label="Carta pendiente" key={card.id}/>) : <><span>?</span><span>?</span></>}</div><div><strong><span className="human-name">{playerName}</span>{humanEliminated?' · Fuera':''} <span className="seat-roles human-roles" aria-label={role(0)||undefined}>{roleBadges(0)}</span>{equityBySeat.has(0)&&<output className={'equity-badge human-equity '+equityClass(equityBySeat.get(0)!)} aria-label={'Probabilidad de ganar: '+equityBySeat.get(0)+'%'}>{equityBySeat.get(0)}%</output>}</strong><p>{stack(0)} <span> · Apuesta {bb(committed(0))}</span></p>{humanAllIn&&<span className="human-state all-in-state">ALL-IN · {bb(betting.contributed[0])}</span>}{humanPayout>0&&<span className="human-state payout-state">COBRAS {bb(humanPayout)}</span>}</div><span className="you-badge">TU ASIENTO</span></div>{humanEliminated&&showEliminationMark(0)&&<EliminationMark/>}{dockStatus&&<p className="preview-status" role="status">{dockStatus}</p>}{(spectating||(outcome.terminal&&config.mode!=='tournament'))&&!eliminating&&!celebrating?<div className="terminal-actions" aria-label={outcome.terminal?'El torneo ha terminado':'Opciones del espectador'}><button onClick={onLeave}>Volver al lobby</button><button onClick={onRestart}>Nuevo torneo</button></div>:!ended&&(humanStatus==='folded'?<p className="folded-wait" role="status">Esperando la siguiente mano…</p>:raiseOpen && canAct ? <div className="raise-panel" role="group" aria-label="Configurar subida" onKeyDown={e=>{if(e.key==='Escape')setRaiseOpen(false);}}><div className="raise-row"><input ref={slider} type="range" aria-label="BB de subida" aria-describedby="raise-cost" min="0" max={Math.max(0,options.length-1)} step="1" value={raiseIndex} aria-valuetext={'Subida de '+bb(quote.raise)} onChange={e=>setRaiseIndex(Number(e.target.value))}/><output aria-live="polite">+{bb(quote.raise)}{added===betting.players[0].stack?' · All-in':''}</output></div><p className="raise-cost" id="raise-cost">{quote.call>0?<>Igualar {bb(quote.call)} · </>:null}Se descuentan {bb(quote.additional)}</p><div className="raise-controls"><button onClick={()=>setRaiseOpen(false)}>Cancelar</button><button onClick={()=>takeAction(0,'raise',added)} disabled={!options.length}>Aceptar</button></div></div> : <div className="game-actions" aria-label="Acciones disponibles cuando exista una mano"><div className="action-slot"><button className="action-main action-fold" disabled={!canAct} onClick={()=>takeAction(0,'fold')}>Retirarse</button><button className="preselect-toggle" type="button" disabled={!canQueueAction} aria-label="Retirarse automáticamente cuando llegue mi turno" aria-pressed={validQueuedAction?.kind==='fold'} onClick={()=>toggleQueuedAction('fold')}><span aria-hidden="true">{validQueuedAction?.kind==='fold'?'✓':''}</span></button></div><div className="action-slot"><button className="action-main action-continue" disabled={!canAct} onClick={()=>takeAction(0,humanDue?'call':'check')}>{humanDue?'Igualar '+bb(Math.min(humanDue,betting.players[0].stack)):'Pasar'}</button><button className="preselect-toggle" type="button" disabled={!canQueueAction} aria-label={(humanDue?'Igualar '+bb(Math.min(humanDue,betting.players[0].stack)):'Pasar')+' automáticamente cuando llegue mi turno'} aria-pressed={validQueuedAction?.kind==='continue'} onClick={()=>toggleQueuedAction('continue')}><span aria-hidden="true">{validQueuedAction?.kind==='continue'?'✓':''}</span></button></div><button className="action-raise" disabled={!canAct||!options.length} onClick={()=>{setRaiseIndex(0);setRaiseOpen(true);}}>Subir</button></div>)}</section>
  </div>
  <Confetti active={celebrating} winner={winnerName} paused={celebrationPaused} onLeave={onLeave} onRestart={onRestart}/>
  {eliminationSeat!==null&&<EliminationAnimation key={eliminationSeat} seat={eliminationSeat} name={name(eliminationSeat)} onBlast={()=>{setExplodedIndex(eliminationIndex);if(eliminationSeat===0)haptic('ELIMINATED');}} onComplete={()=>setEliminationIndex(index=>index+1)} feedback={feedback}/>}
 </main>;
}
