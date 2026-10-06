import test from 'node:test';
import assert from 'node:assert/strict';
import { onlineResultHeadline } from '../src/multiplayer/resultText.ts';

const seats = [
  { seat: 0, id: 'ana', name: 'Ana', payout: 150 },
  { seat: 1, id: 'luis', name: 'Luis', payout: 0 },
  { seat: 2, id: 'eva', name: 'Eva', payout: 0 },
];
const pot = (winners, amount = 150, refund = false) => ({ winners, amount, refund });

test('El resultado online explica mano, empate y bote principal', () => {
  assert.equal(onlineResultHeadline({ pots: [pot([0])], hands: ['Full', 'Pareja', null] }, seats, 'luis'), 'Gana Ana · full');
  assert.equal(onlineResultHeadline({ pots: [pot([0, 1])], hands: ['Escalera', 'Escalera', null] }, seats, 'eva'), 'Empate: Ana + Luis · escalera');
  assert.equal(onlineResultHeadline({ pots: [pot([0]), pot([1], 30)], hands: ['Trío', 'Pareja', null] }, seats, 'eva'), 'Principal: Ana · trío');
});

test('Una retirada se explica sin inventar mano ni revelar cartas', () => {
  const result = { pots: [], hands: [] };
  assert.equal(onlineResultHeadline(result, seats, 'ana'), 'Ganas por retirada');
  assert.equal(onlineResultHeadline(result, seats, 'luis'), 'Ana gana por retirada');
  assert.equal(onlineResultHeadline({ pots: [pot([0], 50, true)], hands: [] }, seats, 'luis'), 'Bote devuelto');
});
