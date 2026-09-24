import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import './table.css';
import './app-shell.css';
import { Table } from './Table';
import { BrandLogo } from './BrandLogo';
import { AudioPreferences, FeedbackProvider, useFeedback } from './feedback';
import { GameHub } from './GameHub';
import { TexasModeHub } from './TexasModeHub';
import { TexasMultiplayerHub } from './TexasMultiplayerHub';
import { BlackjackModeHub } from './BlackjackModeHub';
import { BlackjackSoloHub } from './BlackjackSoloHub';
import { displayPlayerName, readPlayerName, savePlayerName } from './playerProfile';
import { createInitialHand } from './poker/initialHand';
import type { InitialHand } from './poker/initialHand';
import { validStartingBlinds } from './poker/levels';

type Config = { mode: 'normal' | 'tournament'; bots: number; chips: number; small: number; big: number; minutes: number; growing: boolean; breaks: boolean; every: number; rest: number };
const initial: Config = { mode: 'normal', bots: 3, chips: 5000, small: 25, big: 50, minutes: 10, growing: false, breaks: true, every: 3, rest: 5 };
const titles = ['Tu partida, tus reglas.', '¿Quién se sienta?', 'Marca el ritmo.', 'Todo listo para empezar.'];
function App() {
 const [screen,setScreen]=useState<'hub'|'texas-mode'|'texas-multiplayer'|'texas'|'blackjack-mode'|'blackjack-solo'>(() => new URLSearchParams(window.location.search).has('texasRoom') ? 'texas-multiplayer' : 'hub');
 const [playerName,setPlayerName]=useState(readPlayerName);
 useEffect(()=>savePlayerName(playerName),[playerName]);
 const displayedName=displayPlayerName(playerName);
 const {feedback,haptic}=useFeedback();
 const [step, setStep] = useState(0); const [c, setC] = useState(initial); const [tableHand, setTableHand] = useState<InitialHand | null>(null);
 const blindsValid=validStartingBlinds(c.small,c.big);
 const [tableSession,setTableSession]=useState(0);
 const opening = useRef(false);
 const [tableError, setTableError] = useState('');
 const enterTable = () => {
  if (opening.current) return;
  opening.current = true;
  try { const hand = createInitialHand(c); feedback('start'); haptic('GAME_START'); setTableHand(hand); setTableSession(value=>value+1); setTableError(''); }
  catch { opening.current = false; setTableError('No se pudo crear el reparto seguro. Vuelve a intentarlo.'); }
 };
 const restartTable=()=>{
  try{opening.current=true;const hand=createInitialHand(c);feedback('start');haptic('GAME_START');setTableHand(hand);setTableSession(value=>value+1);setTableError('');}
  catch{opening.current=false;setTableHand(null);setStep(3);setTableError('No se pudo crear el reparto seguro. Vuelve a intentarlo.');}
 };
 const set = <K extends keyof Config>(key: K, value: Config[K]) => { setC(old => ({ ...old, [key]: value })); };
 const numeric = (key: 'chips' | 'small' | 'big' | 'minutes' | 'every' | 'rest', label: string, min: number, max: number) => <label>{label}<input type="number" inputMode="numeric" required min={min} max={max} step="1" value={c[key] || ''} onChange={e => set(key, Number(e.target.value))}/></label>;
 const move = (value: number) => { setStep(value); };
 if(screen==='hub')return <GameHub onTexas={()=>setScreen('texas-mode')} onBlackjack={()=>setScreen('blackjack-mode')} playerName={playerName} onPlayerNameChange={setPlayerName}/>;
 if(screen==='texas-mode')return <TexasModeHub onSolo={()=>setScreen('texas')} onMultiplayer={()=>setScreen('texas-multiplayer')} onBack={()=>setScreen('hub')}/>;
 if(screen==='texas-multiplayer')return <TexasMultiplayerHub playerName={displayedName} onBack={()=>setScreen('texas-mode')}/>;
 if(screen==='blackjack-mode')return <BlackjackModeHub onSolo={()=>setScreen('blackjack-solo')} onBack={()=>setScreen('hub')}/>;
 if(screen==='blackjack-solo')return <BlackjackSoloHub playerName={displayedName} onBack={()=>setScreen('blackjack-mode')} onLobby={()=>setScreen('hub')}/>;
 if (tableHand) return <Table key={tableSession} config={c} hand={tableHand} playerName={displayedName} onRestart={restartTable} onLeave={() => { opening.current = false; setTableHand(null); setStep(0); }}/ >;
 return <main className="shell"><header><div className="brand"><BrandLogo/></div><div className="header-controls"><button className="games-back" type="button" onClick={()=>{feedback('navigate');setStep(0);setScreen('texas-mode');}}>← Modos</button><AudioPreferences/></div></header>
 <section className="wizard" aria-label="Crear partida"><div className="eyebrow">TEXAS HOLD’EM <span>•</span> {displayedName.toLocaleUpperCase('es')} CONTRA LOS BOTS</div><nav aria-label="Progreso"><ol>{['Partida', 'Jugadores', 'Ritmo', 'Resumen'].map((name, i) => <li key={name} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? '✓' : i + 1}</span><small>{name}</small></li>)}</ol></nav>
 <form onSubmit={e => { e.preventDefault(); if(step===2&&!blindsValid)return; if (step < 3) move(step + 1); else enterTable(); }}><div className="heading"><p>PASO {step + 1} DE 4</p><h1>{titles[step]}</h1><div>{['Elige cómo quieres jugar esta vez.', 'Una persona. Hasta ocho rivales. Cero presión.', 'Ajusta las ciegas y el tiempo a tu manera.', 'Revisa los ajustes de tu próxima partida.'][step]}</div></div>
 <div className="content">
 {step === 0 && <div className="modes">{([['normal', '♣', 'Partida normal', 'Juega a tu ritmo, con ciegas fijas o crecientes.'], ['tournament', '♠', 'Torneo', 'Sobrevive a las eliminaciones y sé el último.']] as const).map(([mode, icon, title, desc]) => <button type="button" key={mode} className={'mode ' + (c.mode === mode ? 'selected' : '')} aria-pressed={c.mode === mode} onClick={() => set('mode', mode)}><span className="mode-icon">{icon}</span><span><strong>{title}</strong><small>{desc}</small></span><span className="radio">{c.mode === mode ? '●' : '○'}</span></button>)}<div className="note">Solo fichas ficticias. Sin cuentas ni apuestas reales.</div></div>}
 {step === 1 && <><label htmlFor="bots">Rivales <span>{c.bots} {c.bots === 1 ? 'bot' : 'bots'} · {c.bots + 1} jugadores en total</span></label><input id="bots" type="range" min="1" max="8" value={c.bots} onChange={e => set('bots', +e.target.value)}/><div className="range-labels"><span>1 bot</span><span>8 bots</span></div><div className="fields">{numeric('chips', 'Fichas por jugador', 100, 1000000)}</div><div className="note">Cada bot recibirá un perfil aleatorio. No eliges su dificultad.</div></>}
 {step === 2 && <><div className="fields">{numeric('small', 'Ciega pequeña', 1, Math.min(c.chips, c.big - 1))}{numeric('big', 'Ciega grande', c.small + 1, c.chips)}</div>{c.small>0&&c.big>0&&!blindsValid&&<p className="note blind-ratio-error" role="alert">La ciega pequeña debe estar entre un tercio y dos tercios de la grande.</p>}{c.mode === 'normal' && <label className="check"><input type="checkbox" checked={c.growing} onChange={e => set('growing', e.target.checked)}/> Aumentar ciegas por niveles</label>}{(c.mode === 'tournament' || c.growing) && <div className="fields">{numeric('minutes', 'Minutos por nivel', 1, 120)}{c.mode === 'tournament' && <label className="check"><input type="checkbox" checked={c.breaks} onChange={e => set('breaks', e.target.checked)}/> Descansos</label>}</div>}{c.mode === 'tournament' && c.breaks && <div className="fields">{numeric('every', 'Descanso cada … niveles', 1, 50)}{numeric('rest', 'Minutos de descanso', 1, 60)}</div>}<div className="note">{c.mode === 'normal' && !c.growing ? 'Las ciegas se mantienen durante toda la partida.' : 'Las ciegas suben gradualmente al comenzar una mano nueva. El reloj continúa durante la mano y se pausa en los descansos.'}</div></>}
 {step === 3 && <><dl><div><dt>Modalidad</dt><dd>{c.mode === 'normal' ? 'Partida normal' : 'Torneo'}</dd></div><div><dt>Jugadores</dt><dd>{displayedName} + {c.bots} {c.bots === 1 ? 'bot' : 'bots'}</dd></div><div><dt>Fichas iniciales</dt><dd>{c.chips.toLocaleString('es-ES')} por jugador</dd></div><div><dt>Ciegas</dt><dd>{c.small} / {c.big} · {c.mode === 'normal' && !c.growing ? 'Fijas' : `${c.minutes} min/nivel`}</dd></div><div><dt>Ritmo</dt><dd>Rápido · acciones visibles paso a paso</dd></div>{c.mode === 'tournament' && <div><dt>Descansos</dt><dd>{c.breaks ? `${c.rest} min cada ${c.every} niveles` : 'Desactivados'}</dd></div>}</dl><p className="note">Al crear la mesa se reparten tus cartas automáticamente. Ritmo rápido, sin saltarse el reparto ni los turnos.</p></>}
 </div>{tableError && <p className="note" role="alert">{tableError}</p>}<footer><button className="back" type="button" disabled={step === 0} onClick={() => move(step - 1)}>← Atrás</button><button className="next" type="submit" disabled={step===2&&!blindsValid}>{step === 3 ? 'Crear mesa' : 'Siguiente'} <span>→</span></button></footer></form></section><div className="bottom">HECHO PARA JUGAR, NO PARA APOSTAR.<span>CONFIGURA TU PARTIDA</span></div></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><FeedbackProvider><App/></FeedbackProvider></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
 window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>undefined));
}
