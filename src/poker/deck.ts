export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = typeof SUITS[number];
export type Card = Readonly<{ id: string; suit: Suit; rank: number }>;
type Uint32Source = () => number;
const UINT32_RANGE = 0x100000000;

function cryptoUint32(): number {
 const word = new Uint32Array(1);
 globalThis.crypto.getRandomValues(word);
 return word[0];
}

// The injectable source is solely for deterministic tests. Production uses Web Crypto.
export function randomInt(maxExclusive: number, source: Uint32Source = cryptoUint32): number {
 if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
  throw new RangeError('El límite debe ser un entero entre 1 y 2^32.');
 }
 const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
 let value: number;
 do {
  value = source();
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) throw new RangeError('Fuente aleatoria inválida.');
 } while (value >= limit);
 return value % maxExclusive;
}

export function createDeck(): Card[] {
 return SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => Object.freeze({ id: `${suit}-${i + 2}`, suit, rank: i + 2 })));
}

export function shuffle<T>(items: readonly T[], choose: (limit: number) => number = randomInt): T[] {
 const deck = [...items];
 for (let i = deck.length - 1; i > 0; i--) {
  const j = choose(i + 1);
  if (!Number.isInteger(j) || j < 0 || j > i) throw new RangeError('Índice de barajado inválido.');
  [deck[i], deck[j]] = [deck[j], deck[i]];
 }
 return deck;
}

// Each invocation starts from all 52 cards. No previous hand state is retained.
// This order belongs only to the future engine, never to bot decision inputs.
export function createShuffledDeck(): Card[] {
 return shuffle(createDeck());
}
