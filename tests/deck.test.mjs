import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, createShuffledDeck, randomInt, shuffle, SUITS } from '../src/poker/deck.ts';
import { layouts } from '../src/seats.ts';

test('Baraja estándar: 52 cartas únicas, 13 por palo, valores 2 a as', () => {
 const deck = createDeck();
 assert.equal(deck.length, 52);
 assert.equal(new Set(deck.map(c => c.id)).size, 52);
 for (const suit of SUITS) assert.deepEqual(deck.filter(c => c.suit === suit).map(c => c.rank), Array.from({ length: 13 }, (_, i) => i + 2));
});

test('Cada una de 100 barajas nuevas conserva las 52 cartas sin duplicados', () => {
 const expected = createDeck().map(c => c.id).sort();
 for (let i = 0; i < 100; i++) {
  const hand = createShuffledDeck();
  assert.equal(new Set(hand.map(c => c.id)).size, 52);
  assert.deepEqual(hand.map(c => c.id).sort(), expected);
 }
});

test('Consumir una baraja no afecta a la siguiente ni reutiliza objetos de carta', () => {
 const previous = createShuffledDeck();
 const oldCard = previous[0];
 previous.splice(0, 51);
 const next = createShuffledDeck();
 assert.equal(next.length, 52);
 assert.notEqual(next.find(c => c.id === oldCard.id), oldCard);
 assert.equal(previous.length, 1);
});

test('Fisher-Yates solicita exactamente los límites 52..2 y no modifica la entrada', () => {
 const deck = createDeck();
 const original = [...deck];
 const limits = [];
 const shuffled = shuffle(deck, n => { limits.push(n); return n - 1; });
 assert.deepEqual(limits, Array.from({length:51}, (_, i) => 52 - i));
 assert.deepEqual(deck, original);
 assert.notEqual(shuffled, deck);
 assert.deepEqual(shuffled, deck);
 assert.deepEqual(shuffle([0, 1, 2, 3], () => 0), [1, 2, 3, 0]);
});

test('Muestreo por rechazo descarta la cola antes de aplicar el módulo', () => {
 const words = [4294967295, 4294967290, 4294967289];
 let calls = 0;
 assert.equal(randomInt(10, () => words[calls++]), 9);
 assert.equal(calls, 3);
 assert.equal(randomInt(1, () => 4294967295), 0);
 assert.equal(randomInt(4294967296, () => 4294967295), 4294967295);
});

test('Límites y fuentes inválidos se rechazan', () => {
 for (const n of [0, -1, 1.5, NaN, Infinity, 4294967297]) assert.throws(() => randomInt(n), RangeError);
 assert.throws(() => randomInt(10, () => -1), RangeError);
 assert.throws(() => shuffle([1, 2], () => 2), RangeError);
});

test('Números de bot siguen sentido horario tras el humano en todas las mesas', () => {
 for (let count = 1; count <= 8; count++) {
  assert.equal(layouts[count].length, count);
  const angles = layouts[count].map(([x,y]) => (Math.atan2(y - 50, x - 50) - Math.PI / 2 + Math.PI * 2) % (Math.PI * 2));
  for (let i = 1; i < angles.length; i++) assert.ok(angles[i] > angles[i - 1], `Orden incorrecto con ${count} bots`);
 }
});
