import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';
import { EliminationAnimation } from './EliminationAnimation';
import bombBody from './assets/bomb-body-transparent.png';
import type { Card } from './poker/deck.ts';
import { act, addBot, availableActions, chooseInsurance, createGame, nextRound, removeBot, startRound, total } from './blackjack/engine.ts';
import type { BlackjackAction, BlackjackGame, Hand, PresentationStep, Seat } from './blackjack/engine.ts';
import './blackjack.css';

const suitSymbol: Record<Card['suit'], string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const rankLabel = (rank: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] || String(rank);
const chips = (value: number) => `${value.toLocaleString('es-ES', { maximumFractionDigits: 1 })} fichas`;
const scoreLabel = (cards: readonly Card[]) => {
  const score = total(cards);
  return score.soft && score.value < 21 ? `${score.value - 10}/${score.value}` : String(score.value);
};
const resultLabel: Record<string, string> = { win: 'Ganó', lose: 'Perdió', push: 'Empate', blackjack: 'Blackjack · 3:2', bust: 'Se pasó' };

function PlayingCard({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  return <span className={'bj-card' + (hidden || !card ? ' bj-card-back' : card.suit === 'diamonds' || card.suit === 'hearts' ? ' bj-card-red' : '')} aria-label={hidden || !card ? 'Carta tapada' : `${rankLabel(card.rank)} de ${card.suit}`}>
    {hidden || !card ? <span aria-hidden="true">♠</span> : <><b>{rankLabel(card.rank)}</b><i>{suitSymbol[card.suit]}</i></>}
  </span>;
}

function HandView({ hand, compact = false }: { hand: Hand; compact?: boolean }) {
  if (!hand.cards.length) return <div className="bj-hand bj-hand-waiting"><small>Esperando carta</small></div>;
  return <div className={'bj-hand' + (compact ? ' bj-hand-compact' : '')}>
    <div className="bj-cards">{hand.cards.map(card => <PlayingCard card={card} key={card.id}/>)}</div>
    <div className="bj-hand-meta"><strong>{scoreLabel(hand.cards)}</strong><span>· apuesta {chips(hand.bet)}</span></div>
    {hand.outcome && <div className={'bj-hand-result bj-' + hand.outcome}>{resultLabel[hand.outcome]}{!compact && hand.paid ? ` · ${hand.outcome === 'push' ? 'recuperas' : 'cobras'} ${chips(hand.paid)}` : ''}</div>}
  </div>;
}

function BotSeat({ seat, active, marked }: { seat: Seat; active: boolean; marked: boolean }) {
  return <div data-bj-seat={seat.id} className={'bj-bot-seat' + (active ? ' bj-active' : '') + (seat.bankroll < 5 ? ' bj-out' : '')}>
    <strong>{seat.name}</strong><span>{chips(seat.bankroll)}</span>
    {seat.hands.length ? seat.hands.map((hand, i) => <HandView hand={hand} compact key={i}/>) : <small>{seat.bankroll < 5 ? 'Sin fichas' : 'Esperando apuesta'}</small>}
    {marked && <img className="bj-bot-elimination-mark" src={bombBody} alt=""/>}
  </div>;
}

function ActionIcon({ action }: { action: 'hit' | 'stand' | 'double' | 'split' }) {
  if (action === 'double') return <span className="bj-action-icon bj-action-double" aria-hidden="true">2×</span>;
  if (action === 'stand') return <svg className="bj-action-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M7 15V9a2 2 0 0 1 4 0v4-7a2 2 0 0 1 4 0v7-6a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-3c-3 0-5-1-7-4l-3-4a2 2 0 0 1 3-2l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (action === 'split') return <svg className="bj-action-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="2.5" y="6" width="9" height="15" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="16.5" y="6" width="9" height="15" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M13 13.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
  return <svg className="bj-action-icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="5" y="5" width="14" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.8"/><path d="M22 12v9m-4.5-4.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

export function BlackjackSoloHub({ onBack, onLobby, playerName }: { onBack: () => void; onLobby: () => void; playerName: string }) {
  const { feedback, haptic } = useFeedback();
  const [buyIn, setBuyIn] = useState(250);
  const [botCount, setBotCount] = useState(2);
  const [game, setGame] = useState<BlackjackGame | null>(null);
  const [wager, setWager] = useState(10);
  const [repeatBet, setRepeatBet] = useState(false);
  const [repeatNotice, setRepeatNotice] = useState('');
  const [betOpen, setBetOpen] = useState(false);
  const [error, setError] = useState('');
  const [eliminatingSeat, setEliminatingSeat] = useState<string | null>(null);
  const [eliminationMarks, setEliminationMarks] = useState<string[]>([]);
  const [playback, setPlayback] = useState<{ id: number; steps: PresentationStep[]; index: number } | null>(null);
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  const presentationId = useRef(0);
  const lastPlayedStep = useRef('');
  const eliminationQueue = useRef<string[]>([]);
  const announcedEliminations = useRef(new Set<string>());
  const bombFeedback = useCallback((kind: 'ignite' | 'blast') => feedback(kind), [feedback]);
  const showTransition = useCallback((next: BlackjackGame) => {
    setGame(next);
    setPlayback(next.presentation.length ? { id: ++presentationId.current, steps: next.presentation, index: 0 } : null);
  }, []);
  const repeatCurrentBet = useCallback((finished: BlackjackGame) => {
    if (wager > finished.seats[0].bankroll || wager < finished.minBet) {
      setRepeatBet(false);
      setRepeatNotice('Saldo insuficiente para repetir.');
      return false;
    }
    try {
      showTransition(startRound(nextRound(finished), wager));
      setRepeatNotice('');
      setError('');
      return true;
    } catch {
      setRepeatBet(false);
      setRepeatNotice('No se pudo repetir. Continúa manualmente.');
      return false;
    }
  }, [wager, showTransition]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (!playback || !pageVisible) return;
    const { id, index, steps } = playback;
    const step = steps[index];
    const timer = window.setTimeout(() => setPlayback(current => {
      if (!current || current.id !== id || current.index !== index) return current;
      return index + 1 < steps.length ? { ...current, index: index + 1 } : null;
    }), step.duration);
    return () => window.clearTimeout(timer);
  }, [playback, pageVisible]);

  useEffect(() => {
    if (!playback || !pageVisible) return;
    const key = `${playback.id}:${playback.index}`;
    if (lastPlayedStep.current === key) return;
    lastPlayedStep.current = key;
    const step = playback.steps[playback.index];
    if (step.kind === 'deal') feedback('deal');
    else if (step.kind === 'action' || step.kind === 'reveal') feedback('action');
    else if (step.kind === 'turn' && step.actor === 0 && step.title === 'Tu turno') { feedback('turn'); haptic('TURN_START'); }
    else if (step.kind === 'result' && step.seats[0].hands.some(hand => (hand.paid || 0) > hand.bet)) { feedback('win'); haptic('WIN'); }
  }, [playback, pageVisible, feedback, haptic]);

  useEffect(() => {
    if (playback || game?.phase !== 'result') return;
    for (const seat of game.seats) if (seat.hands.length && seat.bankroll < game.minBet && !announcedEliminations.current.has(seat.id)) {
      announcedEliminations.current.add(seat.id);
      eliminationQueue.current.push(seat.id);
    }
    if (!eliminatingSeat && eliminationQueue.current.length) setEliminatingSeat(eliminationQueue.current.shift()!);
  }, [game, playback, eliminatingSeat]);

  useEffect(() => {
    if (!repeatBet || !game || game.phase !== 'result' || playback || eliminatingSeat || !pageVisible) return;
    if (game.seats.some(seat => seat.hands.length && seat.bankroll < game.minBet && !announcedEliminations.current.has(seat.id)) || eliminationQueue.current.length) return;
    const timer = window.setTimeout(() => repeatCurrentBet(game), 1000);
    return () => window.clearTimeout(timer);
  }, [repeatBet, game, playback, eliminatingSeat, pageVisible, repeatCurrentBet]);

  const leave = () => { feedback('navigate'); onBack(); };
  const leaveToLobby = () => { feedback('navigate'); onLobby(); };
  const createTable = () => {
    try {
      const next = createGame(playerName, buyIn, botCount);
      setGame(next); setPlayback(null); setWager(10); setRepeatBet(false); setRepeatNotice(''); setBetOpen(false); setError('');
      setEliminatingSeat(null); setEliminationMarks([]); eliminationQueue.current = []; announcedEliminations.current.clear();
      haptic('GAME_START');
    } catch { setError('No se pudo preparar el zapato de cartas seguro. Inténtalo otra vez.'); }
  };
  const continueToNextHand = () => {
    if (!game || game.phase !== 'result') return;
    if (repeatBet && repeatCurrentBet(game)) return;
    setGame(nextRound(game));
    setWager(Math.min(10, Math.floor(game.seats[0].bankroll / 5) * 5));
    feedback('navigate');
  };
  const placeBet = () => {
    if (!game) return;
    try {
      const next = startRound(game, wager);
      showTransition(next); setBetOpen(false); setRepeatNotice(''); setError('');
    } catch { setError('No se pudo repartir la mano. La apuesta no se ha aplicado.'); }
  };
  const insure = (yes: boolean) => {
    if (!game) return;
    try {
      const next = chooseInsurance(game, yes);
      showTransition(next); setError('');
    } catch { setError('No tienes fichas suficientes para el seguro.'); }
  };
  const takeAction = (action: BlackjackAction) => {
    if (!game) return;
    try {
      const next = act(game, action);
      showTransition(next); setError('');
      if (action === 'double') haptic('RAISE');
    } catch { setError('Esa acción ya no está disponible.'); }
  };

  if (!game) return <main className="shell hub-shell bj-setup-shell">
    <header><div className="brand"><BrandLogo/></div><div className="header-controls"><button className="games-back" type="button" onClick={leave}>← Modos</button><AudioPreferences/></div></header>
    <section className="bj-setup" aria-labelledby="bj-setup-title"><p className="bj-kicker">BLACKJACK · 1 JUGADOR</p><h1 id="bj-setup-title">Tu mesa, tus fichas.</h1><p>Juega contra el crupier. Los bots comparten zapato contigo, pero cada asiento decide por sí mismo.</p>
      <label>Fichas de entrada<select value={buyIn} onChange={event => setBuyIn(Number(event.target.value))}><option value="100">100 fichas</option><option value="250">250 fichas</option><option value="500">500 fichas</option><option value="1000">1.000 fichas</option></select></label>
      <label>Otros asientos<select value={botCount} onChange={event => setBotCount(Number(event.target.value))}><option value="0">Solo yo y el crupier</option><option value="1">1 bot y yo</option><option value="2">2 bots y yo</option></select></label>
      <div className="bj-rule-note">6 barajas · Crupier se planta en 17 · Blackjack paga 3:2 · Apuesta mínima: 5 fichas. Sin dinero real.</div>
      {error && <p role="alert" className="bj-error">{error}</p>}
      <button className="bj-primary bj-create" type="button" onClick={createTable}>Entrar a la mesa <span aria-hidden="true">→</span></button>
    </section>
  </main>;

  const currentStep = playback?.steps[playback.index];
  const shown = currentStep ? { ...game, ...currentStep, message: currentStep.title } : game;
  const player = shown.seats[0];
  const bots = shown.seats.filter(seat => seat.bot);
  const controls = playback ? [] : availableActions(game);
  const maxBet = Math.floor(game.seats[0].bankroll / 5) * 5;
  const dealerShown = shown.revealDealer ? scoreLabel(shown.dealer) : shown.dealer[0]?.rank === 14 ? '11' : String(Math.min(shown.dealer[0]?.rank || 0, 10));
  const bustOut = player.bankroll < shown.minBet && shown.phase === 'result';
  const outcomes = player.hands.map(hand => hand.outcome);
  const resultTitle = outcomes.some(outcome => outcome === 'win' || outcome === 'blackjack') ? 'Ganaste' : outcomes.some(outcome => outcome === 'push') ? 'Empate' : outcomes.length ? 'Perdiste' : 'Mano terminada';
  const statusTitle = currentStep?.kind === 'result' || shown.phase === 'result' ? resultTitle : currentStep?.title || (shown.phase === 'betting' ? 'Prepara tu apuesta' : shown.phase === 'insurance' ? 'Seguro disponible' : shown.actor === 0 ? 'Tu turno' : `Turno de ${shown.seats[shown.actor].name}`);
  const statusDetail = repeatNotice && shown.phase === 'result' && !currentStep ? repeatNotice : currentStep ? currentStep.kind === 'result' ? game.message : '' : shown.phase === 'betting' || shown.phase === 'playing' && shown.actor === 0 ? '' : shown.message;
  return <main className="bj-shell">
    <header className="bj-header"><div className="brand"><BrandLogo/></div><AudioPreferences onLeave={leave}/></header>
    <div className="bj-subhead"><span>BLACKJACK · {game.seats.length} {game.seats.length === 1 ? 'JUGADOR' : 'JUGADORES'} · MANO {game.round + (game.phase === 'betting' ? 1 : 0)}</span><span>MÍN. 5 FICHAS</span></div>
    <section className={'bj-table bj-phase-' + game.phase + (bots.length ? '' : ' bj-no-bots') + (player.hands.length > 1 ? ' bj-split' : '')} aria-label="Mesa de blackjack">
      <div className="bj-dealer">
        <span className="bj-zone-label">CRUPIER</span>
        <div className="bj-cards">{shown.dealer.length ? shown.dealer.map((card, i) => <PlayingCard key={card.id} card={card} hidden={!shown.revealDealer && i === 1}/>) : <><PlayingCard/><PlayingCard/></>}</div>
        <span className="bj-dealer-total">{shown.dealer.length ? `${dealerShown}${shown.revealDealer ? '' : ' + ?'}` : 'Esperando mano'}</span>
      </div>
      <div className="bj-message" role="status"><span className="bj-status-dot" aria-hidden="true"/><div><strong>{statusTitle}</strong>{statusDetail && <small>{statusDetail}</small>}</div></div>
      <div className="bj-bots">{bots.map(seat => <BotSeat key={seat.id} seat={seat} active={shown.phase === 'playing' && shown.seats[shown.actor]?.id === seat.id} marked={eliminationMarks.includes(seat.id)}/>)}</div>
      <div data-bj-seat="human" className={'bj-player-seat' + (shown.phase === 'playing' && shown.actor === 0 ? ' bj-active' : '') + (bustOut ? ' bj-out' : '')}>
        <div className="bj-player-identity"><span>TU MANO</span><strong>{player.name}{bustOut ? ' · Fuera' : ''}</strong><small>Saldo <b>{chips(player.bankroll)}</b></small></div>
        {shown.seats[0].hands.length ? <div className="bj-player-hands">{shown.seats[0].hands.map((hand, i) => <HandView hand={hand} key={i}/>)}</div> : <div className="bj-player-placeholder"><PlayingCard/><PlayingCard/></div>}
        {eliminationMarks.includes('human') && <img className="bj-elimination-mark" src={bombBody} alt=""/>}
      </div>
    </section>
    <div className="bj-bottom-panel">
      {error && <p role="alert" className="bj-error">{error}</p>}
      <label className="bj-repeat-option"><input type="checkbox" checked={repeatBet} disabled={bustOut} onChange={event => { setRepeatBet(event.target.checked); setRepeatNotice(''); }}/><span>Repetir apuesta y continuar</span>{repeatBet && <em>ACTIVO</em>}</label>
      {!playback && game.phase === 'betting' && <>
        <div className="bj-bet-summary"><span>Apuesta</span><strong>{chips(Math.min(wager, maxBet))}</strong><button type="button" onClick={() => setBetOpen(true)}>Cambiar</button><details className="bj-roster-menu"><summary>Asientos</summary><div className="bj-roster">{bots.length < 2 && <button type="button" onClick={() => { const next = addBot(game); setGame(next); setBotCount(next.seats.filter(seat => seat.bot).length); }}>+ Añadir bot</button>}{bots.map(seat => <button type="button" key={seat.id} onClick={() => { const next = removeBot(game, seat.id); setGame(next); setBotCount(next.seats.filter(player => player.bot).length); }}>Quitar {seat.name}</button>)}</div></details></div>
        {player.bankroll >= game.minBet ? <button className="bj-primary" type="button" onClick={placeBet}>Apostar y repartir</button> : <div className="bj-end-actions"><button type="button" onClick={leaveToLobby}>Volver al lobby</button><button type="button" onClick={createTable}>Repetir mesa</button></div>}
      </>}
      {!playback && game.phase === 'insurance' && <div className="bj-insurance"><strong>Seguro: {chips(player.hands[0].bet / 2)}</strong><span>Solo paga si el crupier tiene blackjack.</span><div><button type="button" onClick={() => insure(false)}>Sin seguro</button><button type="button" disabled={player.bankroll < player.hands[0].bet / 2} onClick={() => insure(true)}>Tomar seguro</button></div></div>}
      {!playback && game.phase === 'playing' && <div className="bj-actions">
        <button className="bj-hit" type="button" disabled={!controls.includes('hit')} onClick={() => takeAction('hit')}><ActionIcon action="hit"/>Pedir</button>
        <button className="bj-stand" type="button" disabled={!controls.includes('stand')} onClick={() => takeAction('stand')}><ActionIcon action="stand"/>Plantarse</button>
        <button className="bj-double" type="button" disabled={!controls.includes('double')} onClick={() => takeAction('double')}><ActionIcon action="double"/>Doblar</button>
        <button className="bj-split" type="button" disabled={!controls.includes('split')} onClick={() => takeAction('split')}><ActionIcon action="split"/>Separar</button>
      </div>}
      {!playback && game.phase === 'result' && !eliminatingSeat && !eliminationQueue.current.length && <div className="bj-result-actions"><div>{bustOut ? <><button type="button" onClick={leaveToLobby}>Volver al lobby</button><button className="bj-primary" type="button" onClick={createTable}>Repetir mesa</button></> : <button className="bj-primary" type="button" onClick={continueToNextHand}>Siguiente mano</button>}</div></div>}
    </div>
    {betOpen && game.phase === 'betting' && <div className="bj-sheet-backdrop" role="presentation" onClick={() => setBetOpen(false)}><div className="bj-bet-sheet" role="dialog" aria-modal="true" aria-label="Cambiar apuesta" onClick={event => event.stopPropagation()}><div className="bj-sheet-handle"/><div className="bj-sheet-heading"><strong>Apuesta</strong><button type="button" aria-label="Cerrar" onClick={() => setBetOpen(false)}>×</button></div><small>Saldo: {chips(player.bankroll)}</small><strong className="bj-sheet-amount">{chips(Math.min(wager, maxBet))}</strong><input type="range" min="5" max={Math.max(5, maxBet)} step="5" value={Math.min(wager, maxBet)} aria-label="Apuesta en fichas" onChange={event => setWager(Number(event.target.value))}/><div className="bj-chip-choices">{[5, 10, 25, 50].map(amount => <button type="button" key={amount} disabled={amount > maxBet} className={wager === amount ? 'selected' : ''} onClick={() => setWager(amount)}>{amount}</button>)}</div><button className="bj-primary" type="button" onClick={() => setBetOpen(false)}>Confirmar</button></div></div>}
    {eliminatingSeat && <EliminationAnimation key={eliminatingSeat} seat={0} targetSelector={`[data-bj-seat="${eliminatingSeat}"]`} name={game.seats.find(seat => seat.id === eliminatingSeat)?.name || player.name} feedback={bombFeedback} onBlast={() => { setEliminationMarks(previous => [...previous, eliminatingSeat]); if (eliminatingSeat === 'human') haptic('ELIMINATED'); }} onComplete={() => setEliminatingSeat(null)}/>}
  </main>;
}
