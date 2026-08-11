// Poker hand detection.
//
// Returns both the hand type and the subset of played cards that actually
// scores, which is what the scoring engine iterates over.

import { SUIT_KEYS, hasSuit } from './cards.js';

export const HAND_ORDER = [
  'flush_five',
  'flush_house',
  'five_of_a_kind',
  'straight_flush',
  'four_of_a_kind',
  'full_house',
  'flush',
  'straight',
  'three_of_a_kind',
  'two_pair',
  'pair',
  'high_card',
];

export const HAND_NAMES = {
  flush_five: 'Flush Five',
  flush_house: 'Flush House',
  five_of_a_kind: 'Five of a Kind',
  straight_flush: 'Straight Flush',
  four_of_a_kind: 'Four of a Kind',
  full_house: 'Full House',
  flush: 'Flush',
  straight: 'Straight',
  three_of_a_kind: 'Three of a Kind',
  two_pair: 'Two Pair',
  pair: 'Pair',
  high_card: 'High Card',
};

// Hands considered "secret" — they only appear in the run info once discovered.
export const SECRET_HANDS = ['flush_five', 'flush_house', 'five_of_a_kind'];

function combinations(arr, size) {
  const out = [];
  const combo = [];
  (function walk(start) {
    if (combo.length === size) { out.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      walk(i + 1);
      combo.pop();
    }
  })(0);
  return out;
}

function isRun(ranks, shortcut) {
  const sorted = ranks.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff === 1) continue;
    if (shortcut && diff === 2) continue;
    return false;
  }
  return true;
}

function findStraight(cards, need, shortcut) {
  if (cards.length < need) return null;
  for (const combo of combinations(cards, need)) {
    const ranks = combo.map((c) => c.rank);
    if (new Set(ranks).size !== ranks.length) continue;
    if (isRun(ranks, shortcut)) return combo;
    // Ace can also act as the low card of a wheel straight.
    if (ranks.includes(14)) {
      const low = ranks.map((r) => (r === 14 ? 1 : r));
      if (new Set(low).size === low.length && isRun(low, shortcut)) return combo;
    }
  }
  return null;
}

function findFlush(cards, need, smeared) {
  if (cards.length < need) return null;
  let best = null;
  for (const suit of SUIT_KEYS) {
    const matching = cards.filter((c) => hasSuit(c, suit, smeared));
    if (matching.length >= need && (!best || matching.length > best.length)) best = matching;
  }
  return best;
}

function rankGroups(cards) {
  const map = new Map();
  for (const card of cards) {
    if (!map.has(card.rank)) map.set(card.rank, []);
    map.get(card.rank).push(card);
  }
  // Biggest group first, then highest rank.
  return [...map.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
}

/**
 * @param {Array} played  cards the player submitted (1-5)
 * @param {Object} opts   { fourFingers, shortcut, smeared, splash }
 * @returns {{ key, name, scoring: Array, played: Array }}
 */
export function evaluateHand(played, opts = {}) {
  const { fourFingers = false, shortcut = false, smeared = false, splash = false } = opts;
  const stones = played.filter((c) => c.enhancement === 'stone');
  const cards = played.filter((c) => c.enhancement !== 'stone');

  const straight =
    findStraight(cards, 5, shortcut) || (fourFingers ? findStraight(cards, 4, shortcut) : null);
  const flush =
    findFlush(cards, 5, smeared) || (fourFingers ? findFlush(cards, 4, smeared) : null);

  const groups = rankGroups(cards);
  const biggest = groups.length ? groups[0] : [];
  const second = groups.length > 1 ? groups[1] : [];

  const five = biggest.length >= 5 ? biggest.slice(0, 5) : null;
  const four = biggest.length >= 4 ? biggest.slice(0, 4) : null;
  const three = biggest.length >= 3 ? biggest.slice(0, 3) : null;
  const fullHouse = three && second.length >= 2 ? three.concat(second.slice(0, 2)) : null;
  const pair = biggest.length >= 2 ? biggest.slice(0, 2) : null;
  const twoPair = pair && second.length >= 2 ? pair.concat(second.slice(0, 2)) : null;

  let key;
  let scoring;

  if (five && flush) {
    key = 'flush_five';
    scoring = cards;
  } else if (fullHouse && flush) {
    key = 'flush_house';
    scoring = cards;
  } else if (five) {
    key = 'five_of_a_kind';
    scoring = five;
  } else if (straight && flush) {
    key = 'straight_flush';
    scoring = union(straight, flush);
  } else if (four) {
    key = 'four_of_a_kind';
    scoring = four;
  } else if (fullHouse) {
    key = 'full_house';
    scoring = fullHouse;
  } else if (flush) {
    key = 'flush';
    scoring = flush;
  } else if (straight) {
    key = 'straight';
    scoring = straight;
  } else if (three) {
    key = 'three_of_a_kind';
    scoring = three;
  } else if (twoPair) {
    key = 'two_pair';
    scoring = twoPair;
  } else if (pair) {
    key = 'pair';
    scoring = pair;
  } else {
    key = 'high_card';
    const high = cards.slice().sort((a, b) => b.rank - a.rank)[0];
    scoring = high ? [high] : [];
  }

  // Stone cards never help form a hand but they always score.
  let scoringSet = new Set(scoring.concat(stones));
  if (splash) scoringSet = new Set(played);

  return {
    key,
    name: HAND_NAMES[key],
    // Keep the player's left-to-right order: scoring resolves in that order.
    scoring: played.filter((c) => scoringSet.has(c)),
    played,
  };
}

function union(a, b) {
  const set = new Set(a);
  for (const item of b) set.add(item);
  return [...set];
}

// Used by "The Eye"/"The Mouth" boss blinds and by run statistics.
export function handKeyOf(played, opts) {
  return evaluateHand(played, opts).key;
}
