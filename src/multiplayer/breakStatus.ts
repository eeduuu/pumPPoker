import { levelTime } from '../poker/levels.ts';

type BreakClock = { enabled: boolean; duration: number; elapsed: number; startedAt: number | null;
  breakLimit: number | null; breakUntil: number | null; waitingForBreak?: boolean };

export function serverAlignedTime(serverNow: number, receivedAt: number, localNow: number) {
  return serverNow + Math.max(0, localNow - receivedAt);
}

export function onlineBreakMessage(clock: BreakClock | null | undefined, now: number) {
  if (!clock) return null;
  if (clock.breakUntil) return `Descanso · ${levelTime(clock.breakUntil - now)}`;
  if (!clock.waitingForBreak || clock.breakLimit === null) return null;
  const elapsed = clock.elapsed + (clock.startedAt === null ? 0 : Math.max(0, now - clock.startedAt));
  return `Descanso en ${levelTime(clock.breakLimit - elapsed)}`;
}
