import { isAllInRunout, toCall } from './preflop.ts';
import type { Betting } from './preflop.ts';

export type PreselectedAction =
  | { kind: 'fold'; street: number }
  | { kind: 'continue'; street: number; action: 'check' | 'call'; due: number };

export function preselectedAction(kind: PreselectedAction['kind'], betting: Betting, street: number): PreselectedAction | null {
  const player = betting.players[0];
  if ((betting.status !== 'playing' && betting.status !== 'preflop-complete') || isAllInRunout(betting) || !player || player.folded || player.stack <= 0) return null;
  if (kind === 'fold') return { kind, street };
  const due = toCall(betting, 0);
  return { kind, street, action: due > 0 ? 'call' : 'check', due };
}

// A queued call is consent to one exact price, not to a later raise. A check
// likewise never becomes a call without another tap from the player.
export function validPreselection(selection: PreselectedAction | null, betting: Betting, street: number): PreselectedAction | null {
  // A check may be queued after acting and remain valid on the next street.
  // HandTable remounts for every new hand, so a selection never crosses hands.
  if (!selection || street < selection.street) return null;
  const current = preselectedAction(selection.kind, betting, street);
  if (!current || current.kind !== selection.kind) return null;
  if (selection.kind === 'continue' && current.kind === 'continue') {
    if (selection.action !== current.action || selection.due !== current.due) return null;
  }
  return selection;
}
