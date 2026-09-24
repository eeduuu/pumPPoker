export type RoomListing = {
  id: string;
  code: string;
  name: string;
  maxPlayers: number;
  botCount: number;
  turnSeconds: 6 | 15 | 30;
  playerCount: number;
  isPrivate: boolean;
  status: 'waiting' | 'closed';
  updatedAt: number;
};

export type RoomSnapshot = RoomListing & {
  hostId: string;
  players: { id: string; name: string; seat: number; isBot: false; online: boolean; connection: 'connected' | 'reconnecting' | 'disconnected' }[];
};

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
export const createRoom = (input: { name: string; maxPlayers: number; botCount: number; turnSeconds: 6 | 15 | 30; isPrivate: boolean; password: string; playerName: string }) =>
  request<RoomSession>('/api/rooms', { method: 'POST', body: JSON.stringify(input) });
export const joinRoom = (id: string, playerName: string, password: string) =>
  request<RoomSession>(`/api/rooms/${encodeURIComponent(id)}/join`, { method: 'POST', body: JSON.stringify({ playerName, password }) });
export const leaveRoom = (session: RoomSession) =>
  request<{ ok: true }>(`/api/rooms/${encodeURIComponent(session.room.id)}/leave`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
export const roomSocketUrl = (session: RoomSession) =>
  `${multiplayerApiUrl.replace(/^http/, 'ws')}/api/rooms/${encodeURIComponent(session.room.id)}/socket?token=${encodeURIComponent(session.token)}`;
