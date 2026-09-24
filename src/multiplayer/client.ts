export type RoomListing = {
  id: string;
  code: string;
  name: string;
  maxPlayers: number;
  botCount: number;
  turnSeconds: 6 | 15 | 30;
  mode: 'normal' | 'tournament'; chips: number; small: number; big: number; minutes: number;
  growing: boolean; breaks: boolean; every: number; rest: number;
  playerCount: number;
  isPrivate: boolean;
  status: 'waiting' | 'playing' | 'finished' | 'closed';
  joinLocked: boolean;
  updatedAt: number;
};

export type RoomSnapshot = RoomListing & {
  hostId: string;
  tournamentId: number;
  winnerName: string | null;
  rematch: { deadline: number; accepted: string[]; insufficient: boolean } | null;
  players: { id: string; name: string; seat: number; isBot: false; online: boolean; connection: 'connected' | 'reconnecting' | 'disconnected' }[];
  game: OnlineGame | null;
};

export type OnlineCard = { id: string; suit: 'clubs' | 'diamonds' | 'hearts' | 'spades'; rank: number };
export type OnlineSeat = { seat: number; id: string; name: string; isBot: boolean; active: boolean; folded: boolean; eliminated: boolean; stack: number; committed: number; contributed: number; cards: OnlineCard[] | null; payout: number };
export type OnlineGame = { number: number; phase: 'playing' | 'result'; runout: boolean; newlyEliminated: number[]; street: number; board: OnlineCard[]; pot: number; actor: number | null; deadline: number; dealer: number; smallBlind: number; bigBlind: number; smallAmount: number; bigAmount: number; clock: { enabled: boolean; duration: number; elapsed: number; startedAt: number | null; breakLimit: number | null; breakUntil: number | null }; bet: number; minRaise: number; toCall: number; canRaise: boolean; result: { pot: number; payouts: number[]; pots: { amount: number; winners: number[]; refund: boolean }[]; hands: (string | null)[] } | null; seats: OnlineSeat[] };

export type RoomSession = { room: RoomSnapshot; playerId: string; token: string };

const configured = import.meta.env.VITE_MULTIPLAYER_API_URL?.trim();
const local = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
export const multiplayerApiUrl = configured || (local ? 'http://127.0.0.1:8787' : '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!multiplayerApiUrl) throw new Error('El servidor multijugador aún no está publicado.');
  let response: Response;
  try {
    response = await fetch(`${multiplayerApiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
  } catch { throw new Error('No se pudo conectar con el servidor multijugador.'); }
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}

export const listRooms = () => request<RoomListing[]>('/api/rooms');
export const createRoom = (input: { name: string; maxPlayers: number; botCount: number; turnSeconds: 6 | 15 | 30; mode: 'normal' | 'tournament'; chips: number; small: number; big: number; minutes: number; growing: boolean; breaks: boolean; every: number; rest: number; isPrivate: boolean; password: string; playerName: string }) =>
  request<RoomSession>('/api/rooms', { method: 'POST', body: JSON.stringify(input) });
export const joinRoom = (id: string, playerName: string, password: string) =>
  request<RoomSession>(`/api/rooms/${encodeURIComponent(id)}/join`, { method: 'POST', body: JSON.stringify({ playerName, password }) });
export const leaveRoom = (session: RoomSession) =>
  request<{ ok: true }>(`/api/rooms/${encodeURIComponent(session.room.id)}/leave`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
export const actRoom = (session: RoomSession, action: 'fold' | 'check' | 'call' | 'raise', amount = 0) =>
  request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(session.room.id)}/action`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ action, amount }) });
export const voteRoomRematch = (session: RoomSession) =>
  request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(session.room.id)}/rematch`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` }, body: '{}' });
export const roomSocketUrl = (session: RoomSession) =>
  `${multiplayerApiUrl.replace(/^http/, 'ws')}/api/rooms/${encodeURIComponent(session.room.id)}/socket?token=${encodeURIComponent(session.token)}`;
