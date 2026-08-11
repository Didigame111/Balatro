import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateHand } from '../js/poker.js';
import { makeCard } from '../js/cards.js';

// "AS" -> Ace of Spades, "TD" -> Ten of Diamonds
function hand(...codes) {
  const ranks = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
  return codes.map((code) => {
    const rankPart = code.slice(0, code.length - 1);
    const suit = code[code.length - 1];
    const rank = ranks[rankPart] || Number(rankPart);
    return makeCard(rank, suit);
  });
}

const keyOf = (cards, opts) => evaluateHand(cards, opts).key;

test('detects the basic hand types', () => {
  assert.equal(keyOf(hand('AS')), 'high_card');
  assert.equal(keyOf(hand('AS', 'AH')), 'pair');
  assert.equal(keyOf(hand('AS', 'AH', 'KD', 'KC')), 'two_pair');
  assert.equal(keyOf(hand('9S', '9H', '9D')), 'three_of_a_kind');
  assert.equal(keyOf(hand('5S', '6H', '7D', '8C', '9S')), 'straight');
  assert.equal(keyOf(hand('2H', '5H', '9H', 'JH', 'KH')), 'flush');
  assert.equal(keyOf(hand('4S', '4H', '4D', '7C', '7S')), 'full_house');
  assert.equal(keyOf(hand('QS', 'QH', 'QD', 'QC', '2S')), 'four_of_a_kind');
  assert.equal(keyOf(hand('5H', '6H', '7H', '8H', '9H')), 'straight_flush');
});

test('aces play high and low in straights', () => {
  assert.equal(keyOf(hand('AS', '2H', '3D', '4C', '5S')), 'straight');
  assert.equal(keyOf(hand('TS', 'JH', 'QD', 'KC', 'AS')), 'straight');
  assert.equal(keyOf(hand('AS', '2H', '3D', '4C', '6S')), 'high_card');
});

test('five of a kind and its flush variants', () => {
  assert.equal(keyOf(hand('7S', '7H', '7D', '7C', '7S')), 'five_of_a_kind');
  assert.equal(keyOf(hand('7H', '7H', '7H', '7H', '7H')), 'flush_five');
  assert.equal(keyOf(hand('7H', '7H', '7H', '3H', '3H')), 'flush_house');
});

test('four fingers allows four-card straights and flushes', () => {
  assert.equal(keyOf(hand('5S', '6H', '7D', '8C', 'KS')), 'high_card');
  assert.equal(keyOf(hand('5S', '6H', '7D', '8C', 'KS'), { fourFingers: true }), 'straight');
  assert.equal(keyOf(hand('2H', '5H', '9H', 'JH', 'KS'), { fourFingers: true }), 'flush');
});

test('shortcut allows straights with gaps of one rank', () => {
  assert.equal(keyOf(hand('3S', '5H', '7D', '9C', 'JS')), 'high_card');
  assert.equal(keyOf(hand('3S', '5H', '7D', '9C', 'JS'), { shortcut: true }), 'straight');
});

test('smeared jokers merge the suit colours', () => {
  assert.equal(keyOf(hand('2H', '5D', '9H', 'JD', 'KH')), 'high_card');
  assert.equal(keyOf(hand('2H', '5D', '9H', 'JD', 'KH'), { smeared: true }), 'flush');
});

test('wild cards fill in for any suit', () => {
  const cards = hand('2H', '5H', '9H', 'JH', 'KS');
  cards[4].enhancement = 'wild';
  assert.equal(keyOf(cards), 'flush');
});

test('only the cards forming the hand score', () => {
  const cards = hand('AS', 'AH', 'KD', '3C', '2S');
  const result = evaluateHand(cards);
  assert.equal(result.key, 'pair');
  assert.deepEqual(result.scoring.map((c) => c.rank), [14, 14]);
});

test('stone cards always score but never form the hand', () => {
  const cards = hand('AS', 'KH', 'QD', '3C', '2S');
  cards[4].enhancement = 'stone';
  const result = evaluateHand(cards);
  assert.equal(result.key, 'high_card');
  assert.equal(result.scoring.length, 2);
  assert.ok(result.scoring.some((c) => c.enhancement === 'stone'));
});

test('splash makes every played card score', () => {
  const cards = hand('AS', 'AH', 'KD', '3C', '2S');
  const result = evaluateHand(cards, { splash: true });
  assert.equal(result.scoring.length, 5);
});

test('scoring cards keep the order they were played in', () => {
  const cards = hand('KD', 'AS', '3C', 'AH', '2S');
  const result = evaluateHand(cards);
  assert.deepEqual(result.scoring.map((c) => cards.indexOf(c)), [1, 3]);
});
