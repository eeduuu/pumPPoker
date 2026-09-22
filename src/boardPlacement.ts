type SeatBounds = { top: number; bottom: number };

// Keep the existing card position whenever it fits. Otherwise move the row
// only as far as necessary into the gap between the visible side seats.
export function fitBoardCenter(ideal: number, cardHeight: number, seats: SeatBounds[], stageMiddle: number): number {
  const upper = seats.filter(seat => (seat.top + seat.bottom) / 2 < stageMiddle);
  const lower = seats.filter(seat => (seat.top + seat.bottom) / 2 >= stageMiddle);
  if (!upper.length || !lower.length) return ideal;

  const upperBottom = Math.max(...upper.map(seat => seat.bottom));
  const lowerTop = Math.min(...lower.map(seat => seat.top));
  const room = lowerTop - upperBottom;
  const gap = Math.max(0, Math.min(8, (room - cardHeight) / 2));
  const earliest = upperBottom + cardHeight / 2 + gap;
  const latest = lowerTop - cardHeight / 2 - gap;
  return earliest <= latest
    ? Math.max(earliest, Math.min(ideal, latest))
    : (upperBottom + lowerTop) / 2;
}
