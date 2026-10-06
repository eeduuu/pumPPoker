import type { OnlineGame, OnlineSeat } from './client';

export function onlineResultHeadline(result: OnlineGame['result'], seats: OnlineSeat[], viewerId: string): string {
  if (!result) return 'Mano terminada';
  const name = (seat: number) => seats.find(player => player.seat === seat)?.name || `Jugador ${seat + 1}`;
  const contested = result.pots.filter(pot => !pot.refund);
  const main = contested[0];
  if (!main) {
    if (result.pots.length) return 'Bote devuelto';
    const winner = seats.find(seat => seat.payout > 0);
    return winner ? winner.id === viewerId ? 'Ganas por retirada' : `${winner.name} gana por retirada` : 'Mano terminada';
  }
  const category = result.hands[main.winners[0]]?.toLocaleLowerCase('es') || 'mejor mano';
  const prefix = contested.length > 1 ? 'Principal: ' : '';
  if (main.winners.length > 1) {
    const winners = main.winners.length === 2 ? main.winners.map(name).join(' + ') : `${main.winners.length} jugadores`;
    return `${prefix}Empate: ${winners} · ${category}`;
  }
  return `${prefix || 'Gana '}${name(main.winners[0])} · ${category}`;
}
