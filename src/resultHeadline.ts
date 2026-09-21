import type { Settlement } from './poker/showdown.ts';

// Explain the contested main pot; side pots keep their own result in the breakdown.
export function resultHeadline(result: Settlement, name: (seat: number) => string): string {
  const contested = result.pots.filter(pot => !pot.refund);
  const main = contested[0];
  if (!main) return 'Bote devuelto';
  const category = result.ranks[main.winners[0]]?.name.toLocaleLowerCase('es') ?? 'mejor mano';
  const prefix = contested.length > 1 ? 'Principal: ' : '';
  if (main.winners.length > 1) {
    const winners = main.winners.length === 2
      ? main.winners.map(name).join(' + ')
      : `${main.winners.length} jugadores`;
    return `${prefix}Empate: ${winners} · ${category}`;
  }
  return `${prefix || 'Gana '}${name(main.winners[0])} · ${category}`;
}
