// Playing-card model: ranks, suits, enhancements, editions and seals.

export const SUITS = {
  S: { key: 'S', name: 'Spades', symbol: '♠', color: 'dark' },
  H: { key: 'H', name: 'Hearts', symbol: '♥', color: 'red' },
  D: { key: 'D', name: 'Diamonds', symbol: '♦', color: 'red' },
  C: { key: 'C', name: 'Clubs', symbol: '♣', color: 'dark' },
};

export const SUIT_KEYS = ['S', 'H', 'D', 'C'];

// Rank 11..13 are face cards, 14 is the Ace.
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_LABELS = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const RANK_NAMES = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

export function rankLabel(rank) { return RANK_LABELS[rank] || String(rank); }
export function rankName(rank) { return RANK_NAMES[rank] || String(rank); }

export const ENHANCEMENTS = {
  bonus: { key: 'bonus', name: 'Bonus Card', desc: '+30 extra chips' },
  mult: { key: 'mult', name: 'Mult Card', desc: '+4 Mult' },
  wild: { key: 'wild', name: 'Wild Card', desc: 'Counts as every suit' },
  glass: { key: 'glass', name: 'Glass Card', desc: 'X2 Mult, 1 in 4 chance to destroy after scoring' },
  steel: { key: 'steel', name: 'Steel Card', desc: 'X1.5 Mult while this card stays in hand' },
  stone: { key: 'stone', name: 'Stone Card', desc: '+50 chips, no rank or suit' },
  gold: { key: 'gold', name: 'Gold Card', desc: '$3 if this card is held in hand at end of round' },
  lucky: { key: 'lucky', name: 'Lucky Card', desc: '1 in 5 for +20 Mult, 1 in 15 for $20' },
};

export const EDITIONS = {
  foil: { key: 'foil', name: 'Foil', desc: '+50 chips', cost: 2 },
  holo: { key: 'holo', name: 'Holographic', desc: '+10 Mult', cost: 3 },
  poly: { key: 'poly', name: 'Polychrome', desc: 'X1.5 Mult', cost: 5 },
  negative: { key: 'negative', name: 'Negative', desc: '+1 Joker slot', cost: 5 },
};

export const SEALS = {
  gold: { key: 'gold', name: 'Gold Seal', desc: 'Earn $3 when this card scores' },
  red: { key: 'red', name: 'Red Seal', desc: 'Retrigger this card once' },
  blue: { key: 'blue', name: 'Blue Seal', desc: 'Creates the Planet card for the played hand' },
  purple: { key: 'purple', name: 'Purple Seal', desc: 'Creates a Tarot card when discarded' },
};

let cardSerial = 0;
export function resetCardSerial(value = 0) { cardSerial = value; }
export function cardSerialValue() { return cardSerial; }

export function makeCard(rank, suit, opts = {}) {
  return {
    uid: ++cardSerial,
    rank,
    suit,
    enhancement: opts.enhancement || null,
    edition: opts.edition || null,
    seal: opts.seal || null,
    bonusChips: opts.bonusChips || 0, // permanent chips added by jokers such as Hiker
    // Per-round runtime flags, reset by the engine.
    debuffed: false,
    faceDown: false,
  };
}

export function cloneCard(card) {
  const copy = Object.assign({}, card);
  copy.uid = ++cardSerial;
  return copy;
}

// Base chip value contributed by a card's rank.
export function baseChips(card) {
  if (card.enhancement === 'stone') return 50;
  if (card.rank === 14) return 11;
  if (card.rank >= 11) return 10;
  return card.rank;
}

export function cardChips(card) {
  let chips = baseChips(card) + (card.bonusChips || 0);
  if (card.enhancement === 'bonus') chips += 30;
  if (card.edition === 'foil') chips += 50;
  return chips;
}

export function isFaceCard(card, pareidolia = false) {
  if (card.enhancement === 'stone') return false;
  if (pareidolia) return true;
  return card.rank >= 11 && card.rank <= 13;
}

export function hasSuit(card, suit, smeared = false) {
  if (card.enhancement === 'stone') return false;
  if (card.enhancement === 'wild') return true;
  if (card.suit === suit) return true;
  if (smeared) {
    const red = suit === 'H' || suit === 'D';
    const cardRed = card.suit === 'H' || card.suit === 'D';
    return red === cardRed;
  }
  return false;
}

export function cardName(card) {
  if (card.enhancement === 'stone') return 'Stone Card';
  return `${rankName(card.rank)} of ${SUITS[card.suit].name}`;
}

export function shortCardName(card) {
  if (card.enhancement === 'stone') return 'Stone';
  return `${rankLabel(card.rank)}${SUITS[card.suit].symbol}`;
}

// A standard 52-card deck.
export function standardDeck() {
  const cards = [];
  for (const suit of SUIT_KEYS) {
    for (const rank of RANKS) cards.push(makeCard(rank, suit));
  }
  return cards;
}

// Sorting helpers used by the hand's sort toggle.
export function sortByRank(cards) {
  return cards.slice().sort((a, b) => b.rank - a.rank || SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit));
}

export function sortBySuit(cards) {
  return cards.slice().sort((a, b) => SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit) || b.rank - a.rank);
}
