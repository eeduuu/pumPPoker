import type { Betting } from './preflop.ts';

// An all-in balance of zero is not elimination until the pot has been awarded.
export function matchOutcome(betting: Betting, mode: 'normal' | 'tournament' = 'tournament') {
 if (betting.status !== 'settled' && betting.status !== 'uncontested')
  return { ended: false, terminal: false, canContinue: false, title: '' };
 // A normal table never eliminates players: empty stacks are replenished
 // immediately before the next hand. Only leaving the table ends the session.
 if (mode === 'normal')
  return { ended: true, terminal: false, canContinue: true, title: '' };
 const funded = betting.players.filter(p => p.stack > 0);
 const winner = funded.length === 1 ? funded[0].seat : null;
 const eliminated = betting.players.find(p => p.seat === 0)?.stack === 0;
 const title = winner === 0 ? 'Has ganado la partida' : winner !== null
  ? `Bot ${winner} gana la partida` : eliminated ? 'Te has quedado sin BB' : '';
 // Losing the human seat changes the view to spectator mode, but the bots keep
 // playing until the tournament has one actual winner.
 return { ended: true, terminal: winner !== null,
  canContinue: funded.length > 1, title };
}
