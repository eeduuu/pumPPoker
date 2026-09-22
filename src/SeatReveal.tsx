import type { Card } from './poker/deck';
import './seat-reveal.css';

const symbols = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const suitNames = { clubs: 'tréboles', diamonds: 'diamantes', hearts: 'corazones', spades: 'picas' };
const rank = (value: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[value] || value;

type SeatRevealProps = {
 cards: readonly Card[];
 name: string;
 amount: string;
 allIn: boolean;
 payout: string | null;
};

export function SeatReveal({ cards, name, amount, allIn, payout }: SeatRevealProps) {
 const displayedAmount = payout || amount;
 return <div className="seat-reveal-window" aria-label={`Cartas ampliadas de ${name}`}>
  <div className="seat-reveal-cards">{cards.map(card => <span key={card.id} className={'seat-reveal-card '+card.suit} aria-label={`${rank(card.rank)} de ${suitNames[card.suit]}`}>{rank(card.rank)}{symbols[card.suit]}</span>)}</div>
  <span className={'seat-reveal-detail'+(payout ? ' paid' : '')+(displayedAmount.length > 9 ? ' long-amount' : '')}><strong>{displayedAmount}</strong><small>{payout ? 'COBRA' : allIn ? 'ALL-IN' : 'APUESTA'}</small></span>
 </div>;
}
