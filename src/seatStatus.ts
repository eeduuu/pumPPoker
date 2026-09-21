export type HandSeatStatus = 'active' | 'folded' | null;

// Only color seats with both cards visibly dealt while the current hand is live.
export function handSeatStatus(handEnded: boolean, visibleCards: number, folded: boolean): HandSeatStatus {
  if (handEnded || visibleCards !== 2) return null;
  return folded ? 'folded' : 'active';
}

// A zero stack is only an elimination after settlement, or on a later hand
// where this seat was not dealt cards. An unresolved all-in stays in play.
export function tournamentSeatEliminated(mode: 'normal' | 'tournament', stack: number, hasCards: boolean, handEnded: boolean): boolean {
  return mode === 'tournament' && stack === 0 && (handEnded || !hasCards);
}

// Only players dealt into this hand can be newly eliminated. A zero balance
// during an unresolved all-in is never enough to start the presentation.
export function newlyEliminatedSeats(
  mode: 'normal' | 'tournament',
  status: 'playing' | 'preflop-complete' | 'uncontested' | 'settled',
  dealt: readonly { seat: number; stack: number; committed: number; cards: readonly unknown[] }[],
  balances: readonly { stack: number }[],
): number[] {
  if (mode !== 'tournament' || (status !== 'settled' && status !== 'uncontested')) return [];
  return dealt
    .filter(player => player.cards.length === 2 && player.stack + player.committed > 0 && balances[player.seat]?.stack === 0)
    .map(player => player.seat);
}
