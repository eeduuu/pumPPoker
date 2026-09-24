import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { layouts, mobileLayouts, mobileSeatLeft } from './seats';
import { BrandLogo } from './BrandLogo';
import { AudioPreferences, useFeedback } from './feedback';
import { EliminationAnimation, EliminationMark } from './EliminationAnimation';
import { Confetti } from './Confetti';
import { SeatReveal } from './SeatReveal';
import { formatBB, raiseStepAt, raiseStepCount } from './poker/units';
import { levelTime } from './poker/levels';
import { revealedEquityPercentages } from './poker/equity';
import type { OnlineCard, OnlineSeat, RoomSession, RoomSnapshot } from './multiplayer/client';
import './online-table.css';

const symbols = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const rank = (value: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[value] || value;
const streetNames = ['PREFLOP', 'FLOP', 'TURN', 'RIVER'];
const cardFace = (card: OnlineCard, className: string) => <span key={card.id} className={`${className} ${card.suit}`} aria-label={`${rank(card.rank)} de ${card.suit}`}>{rank(card.rank)}{symbols[card.suit]}</span>;

type ChatEntry = { playerId: string; name: string; text: string; sentAt: number };
type QueuedAction = { kind: 'fold' | 'continue'; hand: number; street: number; action?: 'check' | 'call'; due?: number };
type Props = { session: RoomSession; room: RoomSnapshot; connection: string; busy: boolean; error: string;
  onAction: (action: 'fold' | 'check' | 'call' | 'raise', amount?: number) => void; onLeave: () => void;
  chatMessages: ChatEntry[]; chatText: string; setChatText: (value: string) => void; onSendChat: (event: FormEvent) => void;
  chatNotice: string; onShare: () => void; socketReady: boolean; onRematch: () => void };

export function TexasOnlineTable({ session, room, connection, busy, error, onAction, onLeave,
  chatMessages, chatText, setChatText, onSendChat, chatNotice, onShare, socketReady, onRematch }: Props) {
  const game = room.game!;
  const { feedback, haptic } = useFeedback();
  const [processedResult, setProcessedResult] = useState('');
  const [winnerReady, setWinnerReady] = useState('');
  const [eliminationQueue, setEliminationQueue] = useState<number[]>([]);
  const [blasted, setBlasted] = useState<number[]>([]);
  const [portrait, setPortrait] = useState(() => window.matchMedia('(max-width:600px)').matches);
  const [now, setNow] = useState(Date.now());
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [queued, setQueued] = useState<QueuedAction | null>(null);
  useEffect(() => { const media = window.matchMedia('(max-width:600px)'); const sync = () => setPortrait(media.matches); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  useEffect(() => { setRaiseOpen(false); }, [game.number, game.actor, game.street]);
  const resultKey = `${room.tournamentId || 1}:${game.number}`;
  useEffect(() => {
    if (game.phase !== 'result') return;
    setBlasted([]);
    setEliminationQueue([]);
    const eliminated = game.newlyEliminated || [];
    const timer = window.setTimeout(() => {
      setEliminationQueue(eliminated);
      setProcessedResult(resultKey);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [game.phase, resultKey]);
  useEffect(() => {
    if (room.status !== 'finished' || processedResult !== resultKey || eliminationQueue.length) return;
    const timer = window.setTimeout(() => setWinnerReady(resultKey), 900);
    return () => window.clearTimeout(timer);
  }, [room.status, processedResult, resultKey, eliminationQueue.length]);
  const hasEliminationMark = (seat: OnlineSeat) => seat.eliminated && (!game.newlyEliminated.includes(seat.seat) || blasted.includes(seat.seat));
  const mine = game.seats.find(seat => seat.id === session.playerId);
  const others = game.seats.filter(seat => seat.id !== session.playerId)
    .sort((a, b) => ((a.seat - (mine?.seat || 0) + 9) % 9) - ((b.seat - (mine?.seat || 0) + 9) % 9));
  const opponentCount = Math.max(1, Math.min(8, others.length));
  const active = game.phase === 'playing' && mine?.active && !mine.folded && game.actor === mine.seat && connection === 'Conectado';
  const due = game.toCall;
  const canQueue = game.phase === 'playing' && !!mine?.active && !mine.folded && mine.stack > 0 && !active && connection === 'Conectado';
  const queuedValid = queued && queued.hand === game.number && game.street >= queued.street && mine?.active && !mine.folded &&
    (queued.kind === 'fold' || (queued.action === (due ? 'call' : 'check') && queued.due === due));
  useEffect(() => {
    if (queued && !queuedValid) setQueued(null);
    else if (queued && queuedValid && active && !busy) {
      setQueued(null);
      onAction(queued.kind === 'fold' ? 'fold' : queued.action!);
    }
  }, [queued, queuedValid, active, busy, onAction]);
  const toggleQueued = (kind: QueuedAction['kind']) => setQueued(current => current?.kind === kind ? null :
    { kind, hand: game.number, street: game.street, ...(kind === 'continue' ? { action: due ? 'call' as const : 'check' as const, due } : {}) });
  const revealed = game.phase === 'result' || game.runout ? game.seats.filter(seat => !seat.folded && seat.cards?.length === 2) : [];
  const equity = useMemo(() => {
    if (revealed.length < 2 || ![0, 3, 4, 5].includes(game.board.length)) return new Map<number, number>();
    const percentages = revealedEquityPercentages(revealed.map(seat => seat.cards!), game.board);
    return new Map(revealed.map((seat, index) => [seat.seat, percentages[index]]));
  }, [game]);
  const equityClass = (value: number) => value >= 70 ? 'equity-ahead' : value <= 30 ? 'equity-behind' : 'equity-close';
  const remaining = Math.max(0, Math.ceil((game.deadline - now) / 1000));
  const big = game.bigAmount || 100;
  const small = game.smallAmount || 50;
  const clock = game.clock;
  const clockElapsed = clock?.enabled ? Math.min(clock.elapsed + (clock.startedAt ? Math.max(0, now - clock.startedAt) : 0), clock.breakLimit ?? Infinity) : 0;
  const clockLevel = clock?.enabled ? Math.floor(clockElapsed / clock.duration) + 1 : 1;
  const clockLabel = clock?.breakUntil ? `Descanso · ${levelTime(clock.breakUntil - now)}` : clock?.enabled ? `N${clockLevel} · ${clock.breakLimit !== null && clockElapsed >= clock.breakLimit ? 'Descanso pendiente' : levelTime(clock.duration - clockElapsed % clock.duration)}` : 'Ciegas fijas';
  const acting = game.seats.find(seat => seat.seat === game.actor);
  const winners = game.seats.filter(seat => seat.payout > 0);
  const message = room.status === 'finished' && winnerReady === resultKey ? `Gana ${room.winnerName || 'el último jugador'}` : clock?.breakUntil ? 'Descanso de la mesa' : game.phase === 'result' ? winners.length ? `${winners.map(seat => seat.name).join(' + ')} cobra ${formatBB(winners.reduce((sum, seat) => sum + seat.payout, 0), big)}` : 'Mano terminada' :
    acting ? `Turno de ${acting.name}` : 'Preparando siguiente calle…';
  const minRaise = mine ? Math.min(mine.stack, Math.max(due + 1, game.bet + game.minRaise - mine.committed)) : 0;
  const maxRaise = mine?.stack || 0;
  const raiseStep = big;
  const raiseOptionCount = raiseStepCount(minRaise, maxRaise, raiseStep);
  const raiseAt = (index: number) => raiseStepAt(minRaise, maxRaise, raiseStep, index);
  const openRaise = () => { setRaiseAmount(0); setRaiseOpen(true); };
  const role = (seat: number) => <>{seat === game.dealer && <span className="dealer-chip" title="Dealer">D</span>}{seat === game.smallBlind && <span className="blind-chip" title="Ciega pequeña">CP</span>}{seat === game.bigBlind && <span className="blind-chip" title="Ciega grande">CG</span>}</>;
  const bb = (chips: number) => formatBB(chips, big);
  return <main className={`game-shell online-game-shell${game.phase === 'result' ? ' reveal-active' : ''}`} data-human-hand-status={mine?.folded ? 'folded' : undefined}>
    <header className="game-header"><div className="brand"><BrandLogo/></div><div className="game-header-actions"><button className="games-back" type="button" onClick={onLeave}>← Salir</button><AudioPreferences onLeave={onLeave}/></div></header>
    <div className="game-meta"><span>{room.mode === 'tournament' ? 'TORNEO' : 'MULTIJUGADOR'} · {game.seats.filter(seat => seat.active).length} JUGADORES · MANO {game.number}</span><span>Ciegas {bb(small)} / 1 BB</span></div>
    <div className="level-clock online-room-tools"><span className="online-room-summary">{clockLabel} · {room.isPrivate ? '🔒' : 'Pública'} <i className={`online-self-connection${connection === 'Conectado' ? ' connected' : connection.startsWith('Reconectando') || connection.startsWith('Conectando') ? ' reconnecting' : ' disconnected'}`} role="status" aria-label={`Conexión: ${connection}`} title={connection}/></span><button className="online-chat-button" type="button" aria-label={`Abrir chat de mesa${chatMessages.length ? `, ${chatMessages.length} mensajes` : ''}`} onClick={() => setChatOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.2-.7L4 20l1.7-4.4A7.5 7.5 0 1 1 20 11.5Z"/></svg>{chatMessages.length > 0 && <span>{chatMessages.length}</span>}</button><button type="button" onClick={onShare}>{room.isPrivate ? `Código ${room.code}` : 'Compartir'}</button></div>
    <div className="table-surface"><section className={`table-stage seat-count-${opponentCount}${opponentCount >= 5 ? ' dense-table' : ''}${opponentCount >= 7 ? ' crowded-table' : ''}`} aria-label="Mesa de póker multijugador"><div className="felt" aria-hidden="true"/>
      {others.map((seat, index) => {
        const [x, y] = portrait ? mobileLayouts[opponentCount][index] : layouts[opponentCount][index];
        const besideBoard = portrait && opponentCount >= 3 && opponentCount <= 6 && y >= 65 && y <= 80;
        const position = { left: portrait ? mobileSeatLeft(opponentCount, index) : `${x}%`,
          top: besideBoard ? `max(${y}%, calc(var(--online-board-card-center) + var(--online-board-card-half) + var(--online-seat-half) + 8px))` : `${y}%` };
        const presence = seat.isBot ? null : room.players.find(player => player.id === seat.id)?.connection || 'disconnected';
        const eliminated = hasEliminationMark(seat);
        return <article key={seat.id} data-seat={seat.seat} className={`bot-seat${game.actor === seat.seat ? ' receiving' : ''}${seat.folded ? ' folded' : ''}${seat.payout ? ' winner-seat' : ''}${game.phase === 'result' && seat.cards ? ' reveal-showing' : ''}${eliminated ? ' eliminated' : ''}`} data-hand-status={seat.folded ? 'folded' : seat.active ? 'active' : undefined} style={position} aria-label={`${seat.name}, ${eliminated ? 'eliminado del torneo' : seat.isBot ? 'bot' : `persona ${presence}`}, ${bb(seat.stack)}`}>
          {presence && <span className={`online-connection-dot ${presence}`} aria-hidden="true" title={presence === 'connected' ? 'Conectado' : presence === 'reconnecting' ? 'Reconectando' : 'Desconectado'}/>}
          <div className="seat-heading"><strong>{seat.name}{eliminated ? ' · Fuera' : ''}</strong><span className="seat-roles">{role(seat.seat)}</span>{!eliminated && equity.has(seat.seat) && <output className={`seat-reveal-equity ${equityClass(equity.get(seat.seat)!)}`} aria-label={`Probabilidad de ganar: ${equity.get(seat.seat)}%`}>{equity.get(seat.seat)}%</output>}</div>
          {game.phase === 'result' && seat.cards && !eliminated ? <SeatReveal cards={seat.cards} name={seat.name} amount={bb(seat.contributed)} allIn={seat.stack === 0} payout={seat.payout ? bb(seat.payout) : null}/> : <><div className="seat-balance"><span className="seat-stack">{bb(seat.stack)}</span></div><div className="seat-foot"><span className="hidden-cards">{eliminated ? 'Eliminado' : seat.active ? seat.cards ? seat.cards.map(card => cardFace(card, 'revealed-card')) : <><span className="dealt-back">▧</span><span className="dealt-back">▧</span></> : 'Próxima mano'}</span>{seat.committed > 0 && !eliminated && <span className="seat-wager">{bb(seat.committed)}</span>}</div></>}
          {eliminated && <EliminationMark/>}
          {game.actor === seat.seat && game.phase === 'playing' && <span className="online-turn-timer" aria-label={`Tiempo restante: ${remaining} segundos`}>{remaining}s</span>}
        </article>;
      })}
      <div className="board"><h1>{message}</h1><p className="pot">BOTE <strong>{bb(game.pot)}</strong></p><div className="community-slots" aria-label="Cartas comunitarias">{Array.from({ length: 5 }, (_, index) => game.board[index] ? <span key={game.board[index].id} className={`board-card ${game.board[index].suit}`}><span className="board-rank">{rank(game.board[index].rank)}</span><span className="board-suit">{symbols[game.board[index].suit]}</span></span> : <span key={index} aria-hidden="true">·</span>)}</div><span className="not-dealt">{streetNames[game.street]}</span></div>
    </section>
    <section className={`player-dock${active ? ' human-turn' : ''}${mine?.payout ? ' human-winner' : ''}${mine && hasEliminationMark(mine) ? ' eliminated' : ''}`} aria-label={mine && hasEliminationMark(mine) ? 'Tu asiento, eliminado del torneo' : 'Tu asiento'}><div className="player-row"><div className="private-slots">{mine?.cards?.map(card => cardFace(card, 'playing-card')) || (mine?.eliminated ? null : <><span>?</span><span>?</span></>)}</div><div><strong>{mine?.name || 'Tú'}{mine && hasEliminationMark(mine) ? ' · Fuera' : ''} <span className="seat-roles human-roles">{mine && role(mine.seat)}</span>{mine && !hasEliminationMark(mine) && equity.has(mine.seat) && <output className={`equity-badge human-equity ${equityClass(equity.get(mine.seat)!)}`} aria-label={`Probabilidad de ganar: ${equity.get(mine.seat)}%`}>{equity.get(mine.seat)}%</output>}</strong><p>{bb(mine?.stack ?? 0)} <span>· Apuesta {bb(mine?.committed || 0)}</span></p>{mine?.payout ? <span className="human-state payout-state">COBRAS {bb(mine.payout)}</span> : null}</div><span className="you-badge">{active ? <span className="online-own-timer" aria-label={`Tiempo restante: ${remaining} segundos`}>{remaining}s</span> : 'TU ASIENTO'}</span></div>
      {mine && hasEliminationMark(mine) && <EliminationMark/>}
      <p className="preview-status" role="status">{room.status === 'finished' ? 'Torneo terminado' : mine?.eliminated ? 'Modo espectador · El torneo continúa.' : clock?.breakUntil ? `Descanso · ${levelTime(clock.breakUntil - now)}` : game.phase === 'result' ? 'Siguiente mano en unos segundos…' : !mine?.active ? 'Te incorporas en la siguiente mano.' : mine.folded ? 'Esperando la siguiente mano…' : active ? null : connection}</p>
      {raiseOpen && active ? <div className="raise-panel" role="group" aria-label="Configurar subida"><div className="raise-row"><input aria-label="BB de subida" aria-valuetext={`Subida de ${bb(raiseAt(raiseAmount) - due)}${raiseAt(raiseAmount) === maxRaise ? ', all-in' : ''}`} type="range" min="0" max={raiseOptionCount - 1} step="1" value={raiseAmount} onChange={event => setRaiseAmount(Number(event.target.value))}/><output>+{bb(raiseAt(raiseAmount) - due)}{raiseAt(raiseAmount) === maxRaise ? ' · All-in' : ''}</output></div><p className="raise-cost">{due ? `Igualar ${bb(due)} · ` : ''}Se descuentan {bb(raiseAt(raiseAmount))}</p><div className="raise-controls"><button type="button" onClick={() => setRaiseOpen(false)}>Cancelar</button><button type="button" disabled={busy} onClick={() => onAction('raise', raiseAt(raiseAmount))}>Aceptar</button></div></div> : <div className="game-actions"><div className="action-slot"><button className="action-main action-fold" type="button" disabled={!active || busy} onClick={() => onAction('fold')}>Retirarse</button><button className="preselect-toggle" type="button" disabled={!canQueue} aria-label="Retirarse automáticamente cuando llegue mi turno" aria-pressed={!!queuedValid && queued?.kind === 'fold'} onClick={() => toggleQueued('fold')}><span aria-hidden="true">{queuedValid && queued?.kind === 'fold' ? '✓' : ''}</span></button></div><div className="action-slot"><button className="action-main action-continue" type="button" disabled={!active || busy} onClick={() => onAction(due ? 'call' : 'check')}>{due ? `Igualar ${bb(Math.min(due, mine?.stack || 0))}` : 'Pasar'}</button><button className="preselect-toggle" type="button" disabled={!canQueue} aria-label={`${due ? `Igualar ${bb(Math.min(due, mine?.stack || 0))}` : 'Pasar'} automáticamente cuando llegue mi turno`} aria-pressed={!!queuedValid && queued?.kind === 'continue'} onClick={() => toggleQueued('continue')}><span aria-hidden="true">{queuedValid && queued?.kind === 'continue' ? '✓' : ''}</span></button></div><button className="action-raise" type="button" disabled={!active || busy || !game.canRaise} onClick={openRaise}>Subir</button></div>}
    </section></div>
    {error && <p className="multiplayer-error" role="alert">{error}</p>}
    {chatNotice && !chatOpen && <p className="online-chat-notice" role="status">{chatNotice}</p>}
    {chatOpen && <div className="multiplayer-chat-backdrop" onClick={() => setChatOpen(false)}><section className="multiplayer-chat" role="dialog" aria-modal="true" aria-label="Chat de la mesa" onClick={event => event.stopPropagation()}><header><strong>Chat de la mesa</strong>{active && <span className="online-chat-turn">Tu turno · {remaining}s</span>}<button type="button" aria-label="Cerrar chat" onClick={() => setChatOpen(false)}>×</button></header><div className="multiplayer-chat-messages" aria-live="polite">{chatMessages.length === 0 ? <p>Sin mensajes todavía.</p> : chatMessages.map((entry, index) => <p key={`${entry.sentAt}-${index}`}><strong>{entry.name}</strong> {entry.text}</p>)}</div>{chatNotice && <p className="multiplayer-chat-notice" role="status">{chatNotice}</p>}<form onSubmit={onSendChat}><input aria-label="Mensaje" type="text" maxLength={200} value={chatText} onChange={event => setChatText(event.target.value)} placeholder="Escribe un mensaje…"/><button type="submit" disabled={!chatText.trim() || !socketReady}>Enviar</button></form></section></div>}
    <Confetti active={room.status === 'finished' && winnerReady === resultKey} winner={room.winnerName || 'Último jugador'} onLeave={onLeave} onRestart={onRematch} restartLabel={room.rematch?.accepted.includes(session.playerId) ? 'Esperando jugadores…' : 'Empezar de nuevo'} restartDisabled={busy || !!room.rematch?.accepted.includes(session.playerId)} details={<p className="online-rematch-countdown" role="status">{room.rematch?.insufficient ? 'Se necesitan al menos dos participantes para repetir.' : room.rematch ? `Nueva partida en ${Math.max(0, Math.ceil((room.rematch.deadline - now) / 1000))} s · ${room.rematch.accepted.length}/${room.players.length} personas listas` : 'Pulsa empezar de nuevo para abrir la votación de 15 segundos.'}</p>}/>
    {eliminationQueue.length > 0 && <EliminationAnimation key={`${resultKey}:${eliminationQueue[0]}`} seat={eliminationQueue[0]} name={game.seats.find(seat => seat.seat === eliminationQueue[0])?.name || 'Jugador'} targetSelector={eliminationQueue[0] === mine?.seat ? '.player-dock .private-slots' : `[data-seat="${eliminationQueue[0]}"]`} onBlast={() => { setBlasted(current => [...current, eliminationQueue[0]]); if (eliminationQueue[0] === mine?.seat) haptic('ELIMINATED'); }} onComplete={() => setEliminationQueue(current => current.slice(1))} feedback={feedback}/>}
  </main>;
}
