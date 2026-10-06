import type { RoomSnapshot } from './client';

type SoundSnapshot = Pick<RoomSnapshot, 'id' | 'tournamentId' | 'game'>;

function actionState(game: NonNullable<RoomSnapshot['game']>) {
  return game.seats.map(seat => `${seat.seat}:${seat.stack}:${seat.committed}:${seat.folded}`).join('|');
}

export function onlineSoundEvent(previous: SoundSnapshot | null, current: SoundSnapshot | null): 'deal' | 'action' | null {
  if (!previous || !current || previous.id !== current.id || !current.game) return null;
  const before = previous.game;
  const after = current.game;
  if (!before || current.tournamentId !== previous.tournamentId || after.number > before.number) return 'deal';
  if (after.number < before.number) return null;
  if (after.board.length > before.board.length || after.street > before.street) return 'deal';
  if (before.phase === 'playing' && (before.actor !== after.actor || before.bet !== after.bet ||
    actionState(before) !== actionState(after) || after.phase === 'result')) return 'action';
  return null;
}
