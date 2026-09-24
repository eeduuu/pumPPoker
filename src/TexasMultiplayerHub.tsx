import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AudioPreferences, useFeedback } from './feedback';
import { BrandLogo } from './BrandLogo';
import { createRoom, joinRoom, leaveRoom, listRooms, multiplayerApiUrl, roomSocketUrl } from './multiplayer/client';
import type { RoomListing, RoomSession, RoomSnapshot } from './multiplayer/client';

type Choice = 'create' | 'browse' | 'room' | null;
type ChatMessage = { playerId: string; name: string; text: string; sentAt: number };
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Ha ocurrido un error. Vuelve a intentarlo.';

export function TexasMultiplayerHub({ onBack, playerName }: { onBack: () => void; playerName: string }) {
  const [choice, setChoice] = useState<Choice>(() => new URLSearchParams(window.location.search).has('texasRoom') ? 'browse' : null);
  const [rooms, setRooms] = useState<RoomListing[]>([]);
  const [session, setSession] = useState<RoomSession | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [botCount, setBotCount] = useState(0);
  const [turnSeconds, setTurnSeconds] = useState<6 | 15 | 30>(15);
  const [isPrivate, setPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatNotice, setChatNotice] = useState('');
  const [roomSocket, setRoomSocket] = useState<WebSocket | null>(null);
  const [inviteCode, setInviteCode] = useState(() => new URLSearchParams(window.location.search).get('texasRoom')?.toUpperCase() || '');
  const { feedback } = useFeedback();

  const select = (next: Choice) => { feedback('navigate'); setError(''); setChoice(next); };
  const refresh = async () => {
    setBusy(true); setError('');
    try { setRooms(await listRooms()); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (choice !== 'browse') return;
    let active = true;
    setBusy(true);
    listRooms().then(value => { if (active) { setRooms(value); setError(''); const invited = value.find(room => room.code === inviteCode); if (invited) setJoiningId(invited.id); } })
      .catch(cause => { if (active) setError(message(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [choice]);

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let connectedSince = 0;
    const connect = () => {
      setConnection(failures ? 'Reconectando…' : 'Conectando…');
      socket = new WebSocket(roomSocketUrl(session));
      setRoomSocket(socket);
      socket.onopen = () => { connectedSince = Date.now(); setConnection('Conectado'); };
      socket.onmessage = event => {
        if (typeof event.data !== 'string' || event.data === 'pong') return;
        try {
          const data = JSON.parse(event.data) as { type: string; room?: RoomSnapshot; playerId?: string; name?: string; text?: string; sentAt?: number; error?: string };
          if (data.type === 'room' && data.room) setSnapshot(data.room);
          if (data.type === 'chat' && data.playerId && data.name && data.text && data.sentAt) setChatMessages(current => [...current.slice(-49), { playerId: data.playerId!, name: data.name!, text: data.text!, sentAt: data.sentAt! }]);
          if (data.type === 'error' && data.error) setChatNotice(data.error);
        } catch { /* Ignore malformed network messages. */ }
      };
      socket.onerror = () => setConnection('Conexión interrumpida');
      socket.onclose = () => {
        if (disposed) return;
        if (connectedSince && Date.now() - connectedSince > 5000) failures = 0;
        failures++;
        if (failures <= 5) retry = setTimeout(connect, Math.min(1000 * 2 ** failures, 10000));
        else setConnection('Sin conexión. Sal y vuelve a entrar para intentarlo de nuevo.');
      };
    };
    connect();
    return () => { disposed = true; if (retry) clearTimeout(retry); socket?.close(); setRoomSocket(null); };
  }, [session]);

  const enter = (next: RoomSession) => { setSession(next); setSnapshot(next.room); setError(''); setChoice('room'); };
  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { enter(await createRoom({ name, maxPlayers, botCount, turnSeconds, isPrivate, password, playerName })); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const submitJoin = async (room: RoomListing) => {
    if (busy) return;
    setBusy(true); setError('');
    try { enter(await joinRoom(room.id, playerName, joinPassword)); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  const exitRoom = async () => {
    if (!session || busy) return;
    setBusy(true); setError('');
    try { await leaveRoom(session); }
    catch { /* Closing the socket still releases the seat after the reconnect grace period. */ }
    finally { setSession(null); setSnapshot(null); setChoice(null); setConnection(''); setChatMessages([]); setChatOpen(false); setBusy(false); }
  };

  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text || roomSocket?.readyState !== WebSocket.OPEN) return;
    roomSocket.send(JSON.stringify({ type: 'chat', text }));
    setChatText(''); setChatNotice('');
  };
  const shareRoom = async () => {
    if (!snapshot) return;
    const url = new URL(window.location.href);
    url.searchParams.set('texasRoom', snapshot.code);
    try { await navigator.clipboard.writeText(url.toString()); setChatNotice('Enlace de invitación copiado.'); }
    catch { setChatNotice(`Código de mesa: ${snapshot.code}`); }
  };

  return <main className="shell hub-shell">
    <header><div className="brand"><BrandLogo/></div><div className="header-controls"><button className="games-back" type="button" disabled={busy && choice === 'room'} onClick={() => { if (choice === 'room') void exitRoom(); else if (choice) select(null); else { feedback('navigate'); onBack(); } }}>← {choice === 'room' ? 'Salir' : choice ? 'Multijugador' : 'Modos'}</button><AudioPreferences/></div></header>
    <section className="game-hub multiplayer-hub" aria-labelledby="texas-multiplayer-title">
      <div className="hub-heading"><p>TEXAS HOLD’EM · MULTIJUGADOR</p><h1 id="texas-multiplayer-title">{choice === 'create' ? 'Crear mesa' : choice === 'browse' ? 'Buscar mesa' : choice === 'room' ? snapshot?.name || 'Tu mesa' : 'Elige cómo jugar'}</h1></div>
      {choice === null && <div className="game-choices">
        <button className="game-choice" type="button" onClick={() => select('create')}><span className="game-choice-icon" aria-hidden="true">+</span><span><strong>Crear mesa</strong><small>Prepara una mesa para jugar con otras personas</small></span><i aria-hidden="true">→</i></button>
        <button className="game-choice" type="button" onClick={() => select('browse')}><span className="game-choice-icon" aria-hidden="true">⌕</span><span><strong>Buscar mesa</strong><small>Encuentra una mesa pública o privada</small></span><i aria-hidden="true">→</i></button>
      </div>}

      {choice === 'create' && <form className="multiplayer-panel" onSubmit={submitCreate}>
        <label>Nombre de la mesa<input type="text" maxLength={24} value={name} placeholder="Mesa de Texas" onChange={event => setName(event.target.value)}/></label>
        <label>Asientos para personas<select value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))}>{Array.from({ length: 8 - botCount }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count} jugadores</option>)}</select></label>
        <label>Bots previstos<select value={botCount} onChange={event => { const count = Number(event.target.value); setBotCount(count); setMaxPlayers(current => Math.min(current, 9 - count)); }}>{Array.from({ length: 8 }, (_, count) => <option key={count} value={count}>{count} {count === 1 ? 'bot' : 'bots'}</option>)}</select></label>
        <p className="note">Hasta 9 asientos entre personas y bots. Los bots empezarán a jugar cuando esté disponible la partida multijugador.</p>
        <fieldset className="multiplayer-speed"><legend>Tiempo por turno</legend>{([6, 15, 30] as const).map(seconds => <label key={seconds}><input type="radio" name="turnSeconds" checked={turnSeconds === seconds} onChange={() => setTurnSeconds(seconds)}/>{seconds} s · {seconds === 6 ? 'rápida' : seconds === 15 ? 'normal' : 'lenta'}</label>)}</fieldset>
        <label className="check"><input type="checkbox" checked={isPrivate} onChange={event => setPrivate(event.target.checked)}/> Mesa privada con contraseña</label>
        {isPrivate && <label>Contraseña<input type="password" minLength={6} maxLength={64} required value={password} onChange={event => setPassword(event.target.value)}/></label>}
        <p className="note">Sala, invitaciones y chat requieren el servidor multijugador. Las manos y acciones entre jugadores todavía no están habilitadas.</p>
        <button className="multiplayer-primary" type="submit" disabled={busy || !multiplayerApiUrl}>{busy ? 'Creando…' : 'Crear mesa'}</button>
      </form>}

      {choice === 'browse' && <div className="multiplayer-panel">
        <div className="multiplayer-list-heading"><p>Mesas disponibles</p><button className="games-back" type="button" disabled={busy} onClick={() => void refresh()}>Actualizar</button></div>
        <label>Código de invitación<input type="text" maxLength={10} autoCapitalize="characters" value={inviteCode} placeholder="Escribe el código" onChange={event => setInviteCode(event.target.value.toUpperCase().replace(/[^0-9A-V]/g, ''))}/></label>
        {inviteCode && !busy && !error && !rooms.some(room => room.code === inviteCode) && <p className="note">No hay ninguna mesa abierta con ese código.</p>}
        {!busy && !error && rooms.length === 0 && <p className="note">Todavía no hay mesas abiertas.</p>}
        <div className="multiplayer-room-list">{rooms.filter(room => !inviteCode || room.code.includes(inviteCode)).map(room => <div className="multiplayer-room" key={room.id}>
          <div><strong>{room.name}</strong><small>{room.isPrivate ? '🔒 Privada' : 'Pública'} · {room.playerCount}/{room.maxPlayers} personas · {room.botCount} bots · {room.turnSeconds} s/turno</small></div>
          {joiningId === room.id && room.isPrivate && <label>Contraseña<input type="password" value={joinPassword} onChange={event => setJoinPassword(event.target.value)}/></label>}
          <button className="games-back" type="button" disabled={busy || room.playerCount >= room.maxPlayers} onClick={() => { if (room.isPrivate && joiningId !== room.id) { setJoiningId(room.id); setJoinPassword(''); return; } void submitJoin(room); }}>{room.playerCount >= room.maxPlayers ? 'Completa' : joiningId === room.id || !room.isPrivate ? 'Entrar' : 'Contraseña'}</button>
        </div>)}</div>
      </div>}

      {choice === 'room' && snapshot && <div className="multiplayer-panel">
        <div className="multiplayer-list-heading"><p>{snapshot.isPrivate ? '🔒 Mesa privada' : 'Mesa pública'} · {snapshot.players.length}/{snapshot.maxPlayers} personas</p><small>{connection}</small></div>
        <div className="multiplayer-invite"><span>Código <strong>{snapshot.code}</strong></span><button className="games-back" type="button" onClick={() => void shareRoom()}>Compartir invitación</button></div>
        <p className="note">{snapshot.botCount} {snapshot.botCount === 1 ? 'bot previsto' : 'bots previstos'} · {snapshot.turnSeconds} s por turno</p>
        <ol className="multiplayer-players">{snapshot.players.map(player => <li key={player.id}><span aria-hidden="true">♙</span><strong>{player.name}{player.id === session?.playerId ? ' (tú)' : ''}</strong><small className={'connection-'+player.connection}>{player.connection === 'connected' ? '● Conectado' : player.connection === 'reconnecting' ? '● Reconectando' : '● Desconectado'}</small></li>)}{Array.from({ length: snapshot.botCount }, (_, index) => <li className="multiplayer-bot" key={`bot-${index}`}><span aria-hidden="true">♟</span><strong>Bot {index + 1}</strong><small>Pendiente de partida</small></li>)}</ol>
        <button className="games-back multiplayer-chat-trigger" type="button" onClick={() => setChatOpen(true)}>Chat de mesa{chatMessages.length ? ` · ${chatMessages.length}` : ''}</button>
        <p className="note">Sala en espera. Las cartas, apuestas y turnos multijugador aún no están habilitados.</p>
        <button className="games-back multiplayer-leave" type="button" disabled={busy} onClick={() => void exitRoom()}>Salir de la mesa</button>
      </div>}
      {choice === 'room' && chatNotice && !chatOpen && <p className="note" role="status">{chatNotice}</p>}
      {choice === 'room' && chatOpen && <div className="multiplayer-chat-backdrop" onClick={() => setChatOpen(false)}><section className="multiplayer-chat" role="dialog" aria-modal="true" aria-label="Chat de la mesa" onClick={event => event.stopPropagation()}><header><strong>Chat de la mesa</strong><button type="button" aria-label="Cerrar chat" onClick={() => setChatOpen(false)}>×</button></header><div className="multiplayer-chat-messages" aria-live="polite">{chatMessages.length === 0 ? <p>Sin mensajes todavía.</p> : chatMessages.map((entry, index) => <p key={`${entry.sentAt}-${index}`}><strong>{entry.name}</strong> {entry.text}</p>)}</div>{chatNotice && <p className="multiplayer-chat-notice" role="status">{chatNotice}</p>}<form onSubmit={sendChat}><input aria-label="Mensaje" type="text" maxLength={200} value={chatText} onChange={event => setChatText(event.target.value)} placeholder="Escribe un mensaje…"/><button type="submit" disabled={!chatText.trim() || roomSocket?.readyState !== WebSocket.OPEN}>Enviar</button></form></section></div>}
      {error && <p className="multiplayer-error" role="alert">{error}</p>}
      {!multiplayerApiUrl && choice !== null && <p className="note">El servidor multijugador todavía no está publicado.</p>}
    </section>
    <div className="bottom">FICHAS FICTICIAS. SIN APUESTAS REALES.<span>TEXAS HOLD’EM</span></div>
  </main>;
}
