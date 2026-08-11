// Tarot, Planet and Spectral cards.
//
// `select` describes how many cards must be highlighted in hand before the
// card can be used. `use(engine, cards)` performs the effect.

import { HAND_BASE } from './data.js';
import { SUITS, cloneCard, makeCard } from './cards.js';

const suitTarot = (key, name, suit, emoji) => ({
  key, name, kind: 'tarot', emoji, cost: 3, select: [1, 3],
  desc: () => `Converts up to <b>3</b> selected cards to <b>${SUITS[suit].name}</b>`,
  use: (e, cards) => { for (const c of cards) { if (c.enhancement !== 'stone') c.suit = suit; } },
});

const enhanceTarot = (key, name, enhancement, count, emoji, label) => ({
  key, name, kind: 'tarot', emoji, cost: 3, select: [1, count],
  desc: () => `Enhances <b>${count}</b> selected card${count > 1 ? 's' : ''} into <b>${label}</b>`,
  use: (e, cards) => { for (const c of cards) c.enhancement = enhancement; },
});

const TAROT_LIST = [
  {
    key: 'fool', name: 'The Fool', kind: 'tarot', emoji: '🤡', cost: 3, select: [0, 0],
    desc: (e) => {
      const last = e && e.lastConsumableUsed;
      return `Creates the last <b>Tarot</b> or <b>Planet</b> card used during this run <span class="muted">(${last ? CONSUMABLES[last].name : 'none'})</span>`;
    },
    canUse: (e) => !!e.lastConsumableUsed,
    use: (e) => { e.addConsumable(e.makeConsumable(e.lastConsumableUsed)); },
  },
  enhanceTarot('magician', 'The Magician', 'lucky', 2, '🎩', 'Lucky Cards'),
  {
    key: 'high_priestess', name: 'The High Priestess', kind: 'tarot', emoji: '🌙', cost: 3, select: [0, 0],
    desc: () => 'Creates up to <b>2</b> random <b>Planet</b> cards',
    use: (e) => { e.createConsumable('planet', 'The High Priestess'); e.createConsumable('planet', 'The High Priestess'); },
  },
  enhanceTarot('empress', 'The Empress', 'mult', 2, '👸', 'Mult Cards'),
  {
    key: 'emperor', name: 'The Emperor', kind: 'tarot', emoji: '🤴', cost: 3, select: [0, 0],
    desc: () => 'Creates up to <b>2</b> random <b>Tarot</b> cards',
    use: (e) => { e.createConsumable('tarot', 'The Emperor'); e.createConsumable('tarot', 'The Emperor'); },
  },
  enhanceTarot('hierophant', 'The Hierophant', 'bonus', 2, '⛪', 'Bonus Cards'),
  enhanceTarot('lovers', 'The Lovers', 'wild', 1, '💑', 'a Wild Card'),
  enhanceTarot('chariot', 'The Chariot', 'steel', 1, '🏇', 'a Steel Card'),
  enhanceTarot('justice', 'Justice', 'glass', 1, '⚖', 'a Glass Card'),
  {
    key: 'hermit', name: 'The Hermit', kind: 'tarot', emoji: '🕯', cost: 3, select: [0, 0],
    desc: () => 'Doubles money <span class="muted">(max of $20)</span>',
    use: (e) => { e.addMoney(Math.min(20, Math.max(0, e.money)), 'The Hermit'); },
  },
  {
    key: 'wheel_of_fortune', name: 'Wheel of Fortune', kind: 'tarot', emoji: '🎡', cost: 3, select: [0, 0],
    desc: () => '<b>1 in 4</b> chance to add Foil, Holographic or Polychrome to a random Joker',
    canUse: (e) => e.jokers.some((j) => !j.edition),
    use: (e) => {
      const plain = e.jokers.filter((j) => !j.edition);
      if (!plain.length) return;
      if (e.chance(1, 4)) {
        const target = e.rng.pick(plain);
        target.edition = e.rng.weighted(['foil', 'holo', 'poly'], (k) => ({ foil: 5, holo: 3, poly: 1 }[k]));
        e.toast(`${e.jokerName(target)} is now ${target.edition}!`);
      } else {
        e.toast('Nope!');
      }
    },
  },
  {
    key: 'strength', name: 'Strength', kind: 'tarot', emoji: '💪', cost: 3, select: [1, 2],
    desc: () => 'Increases the rank of up to <b>2</b> selected cards by <b>1</b>',
    use: (e, cards) => {
      for (const c of cards) {
        if (c.enhancement === 'stone') continue;
        c.rank = c.rank >= 14 ? 2 : c.rank + 1;
      }
    },
  },
  {
    key: 'hanged_man', name: 'The Hanged Man', kind: 'tarot', emoji: '🙃', cost: 3, select: [1, 2],
    desc: () => '<b>Destroys</b> up to <b>2</b> selected cards',
    use: (e, cards) => { for (const c of cards.slice()) e.destroyCard(c, 'The Hanged Man'); },
  },
  {
    key: 'death', name: 'Death', kind: 'tarot', emoji: '💀', cost: 3, select: [2, 2],
    desc: () => 'Select <b>2</b> cards, converts the <b>left</b> card into the <b>right</b> card',
    use: (e, cards) => {
      const [left, right] = cards;
      left.rank = right.rank;
      left.suit = right.suit;
      left.enhancement = right.enhancement;
      left.edition = right.edition;
      left.seal = right.seal;
    },
  },
  {
    key: 'temperance', name: 'Temperance', kind: 'tarot', emoji: '🍷', cost: 3, select: [0, 0],
    desc: (e) => `Gives the total <b>sell value</b> of all current Jokers <span class="muted">(max $50, currently $${e ? Math.min(50, e.totalSellValue()) : 0})</span>`,
    use: (e) => { e.addMoney(Math.min(50, e.totalSellValue()), 'Temperance'); },
  },
  enhanceTarot('devil', 'The Devil', 'gold', 1, '😈', 'a Gold Card'),
  enhanceTarot('tower', 'The Tower', 'stone', 1, '🗼', 'a Stone Card'),
  suitTarot('star', 'The Star', 'D', '⭐'),
  suitTarot('moon', 'The Moon', 'C', '🌛'),
  suitTarot('sun', 'The Sun', 'H', '☀'),
  {
    key: 'judgement', name: 'Judgement', kind: 'tarot', emoji: '📯', cost: 3, select: [0, 0],
    desc: () => 'Creates a random <b>Joker</b> card',
    canUse: (e) => e.hasJokerSpace(),
    use: (e) => { e.createJokers(1, null, 'Judgement'); },
  },
  suitTarot('world', 'The World', 'S', '🌍'),
];

const PLANET_LIST = [
  { key: 'pluto', name: 'Pluto', hand: 'high_card', emoji: '🪐' },
  { key: 'mercury', name: 'Mercury', hand: 'pair', emoji: '☿' },
  { key: 'uranus', name: 'Uranus', hand: 'two_pair', emoji: '🌑' },
  { key: 'venus', name: 'Venus', hand: 'three_of_a_kind', emoji: '♀' },
  { key: 'saturn', name: 'Saturn', hand: 'straight', emoji: '🪐' },
  { key: 'jupiter', name: 'Jupiter', hand: 'flush', emoji: '🟠' },
  { key: 'earth', name: 'Earth', hand: 'full_house', emoji: '🌍' },
  { key: 'mars', name: 'Mars', hand: 'four_of_a_kind', emoji: '🔴' },
  { key: 'neptune', name: 'Neptune', hand: 'straight_flush', emoji: '🔵' },
  { key: 'planetx', name: 'Planet X', hand: 'five_of_a_kind', emoji: '🛸' },
  { key: 'ceres', name: 'Ceres', hand: 'flush_house', emoji: '☄' },
  { key: 'eris', name: 'Eris', hand: 'flush_five', emoji: '🌌' },
].map((p) => ({
  key: p.key,
  name: p.name,
  kind: 'planet',
  emoji: p.emoji,
  cost: 3,
  hand: p.hand,
  select: [0, 0],
  desc: (e) => {
    const base = HAND_BASE[p.hand];
    const level = e ? e.handLevels[p.hand] : 1;
    return `Level up <b>${e ? e.handName(p.hand) : p.hand}</b><br><span class="muted">lvl ${level} → ${level + 1} &nbsp; +${base.multStep} Mult, +${base.chipStep} Chips</span>`;
  },
  use: (e) => { e.levelUpHand(p.hand, 1, p.name); e.notePlanet(p.key); },
}));

const sealSpectral = (key, name, seal, emoji, label) => ({
  key, name, kind: 'spectral', emoji, cost: 4, select: [1, 1],
  desc: () => `Adds a <b>${label}</b> to <b>1</b> selected card`,
  use: (e, cards) => { cards[0].seal = seal; },
});

const SPECTRAL_LIST = [
  {
    key: 'familiar', name: 'Familiar', kind: 'spectral', emoji: '🦇', cost: 4, select: [0, 0],
    desc: () => 'Destroy <b>1</b> random card in your hand, add <b>3</b> random Enhanced face cards to your deck',
    canUse: (e) => e.hand.length > 0,
    use: (e) => {
      e.destroyCard(e.rng.pick(e.hand), 'Familiar');
      for (let i = 0; i < 3; i++) {
        e.addRandomCardToDeck({ rank: e.rng.range(11, 13), enhancement: e.randomEnhancement() }, 'Familiar');
      }
    },
  },
  {
    key: 'grim', name: 'Grim', kind: 'spectral', emoji: '⚰', cost: 4, select: [0, 0],
    desc: () => 'Destroy <b>1</b> random card in your hand, add <b>2</b> random Enhanced Aces to your deck',
    canUse: (e) => e.hand.length > 0,
    use: (e) => {
      e.destroyCard(e.rng.pick(e.hand), 'Grim');
      for (let i = 0; i < 2; i++) e.addRandomCardToDeck({ rank: 14, enhancement: e.randomEnhancement() }, 'Grim');
    },
  },
  {
    key: 'incantation', name: 'Incantation', kind: 'spectral', emoji: '📖', cost: 4, select: [0, 0],
    desc: () => 'Destroy <b>1</b> random card in your hand, add <b>4</b> random Enhanced numbered cards to your deck',
    canUse: (e) => e.hand.length > 0,
    use: (e) => {
      e.destroyCard(e.rng.pick(e.hand), 'Incantation');
      for (let i = 0; i < 4; i++) {
        e.addRandomCardToDeck({ rank: e.rng.range(2, 10), enhancement: e.randomEnhancement() }, 'Incantation');
      }
    },
  },
  sealSpectral('talisman', 'Talisman', 'gold', '🪙', 'Gold Seal'),
  {
    key: 'aura', name: 'Aura', kind: 'spectral', emoji: '🌟', cost: 4, select: [1, 1],
    desc: () => 'Add <b>Foil</b>, <b>Holographic</b> or <b>Polychrome</b> effect to <b>1</b> selected card in hand',
    use: (e, cards) => {
      cards[0].edition = e.rng.weighted(['foil', 'holo', 'poly'], (k) => ({ foil: 5, holo: 3, poly: 1 }[k]));
    },
  },
  {
    key: 'wraith', name: 'Wraith', kind: 'spectral', emoji: '👻', cost: 4, select: [0, 0],
    desc: () => 'Creates a random <b>Rare</b> Joker, sets money to <b>$0</b>',
    canUse: (e) => e.hasJokerSpace(),
    use: (e) => { e.createJokers(1, 'rare', 'Wraith'); e.setMoney(0, 'Wraith'); },
  },
  {
    key: 'sigil', name: 'Sigil', kind: 'spectral', emoji: '🔯', cost: 4, select: [0, 0],
    desc: () => 'Converts all cards in hand to a single random <b>suit</b>',
    canUse: (e) => e.hand.length > 0,
    use: (e) => {
      const suit = e.rng.pick(['S', 'H', 'D', 'C']);
      for (const c of e.hand) if (c.enhancement !== 'stone') c.suit = suit;
    },
  },
  {
    key: 'ouija', name: 'Ouija', kind: 'spectral', emoji: '🪬', cost: 4, select: [0, 0],
    desc: () => 'Converts all cards in hand to a single random <b>rank</b>, <b>-1</b> hand size',
    canUse: (e) => e.hand.length > 0,
    use: (e) => {
      const rank = e.rng.range(2, 14);
      for (const c of e.hand) if (c.enhancement !== 'stone') c.rank = rank;
      e.modifiers.handSize -= 1;
    },
  },
  {
    key: 'ectoplasm', name: 'Ectoplasm', kind: 'spectral', emoji: '🫧', cost: 4, select: [0, 0],
    desc: () => 'Add <b>Negative</b> to a random Joker, <b>-1</b> hand size',
    canUse: (e) => e.jokers.some((j) => !j.edition),
    use: (e) => {
      const plain = e.jokers.filter((j) => !j.edition);
      if (plain.length) e.rng.pick(plain).edition = 'negative';
      e.modifiers.handSize -= 1;
    },
  },
  {
    key: 'immolate', name: 'Immolate', kind: 'spectral', emoji: '🔥', cost: 4, select: [0, 0],
    desc: () => 'Destroys <b>5</b> random cards in hand, gain <b>$20</b>',
    canUse: (e) => e.hand.length > 0,
    use: (e) => {
      const victims = e.rng.shuffle(e.hand.slice()).slice(0, 5);
      for (const c of victims) e.destroyCard(c, 'Immolate');
      e.addMoney(20, 'Immolate');
    },
  },
  {
    key: 'ankh', name: 'Ankh', kind: 'spectral', emoji: '☥', cost: 4, select: [0, 0],
    desc: () => 'Create a <b>copy</b> of a random Joker, destroy all other Jokers',
    canUse: (e) => e.jokers.length > 0,
    use: (e) => {
      const keep = e.rng.pick(e.jokers);
      for (const j of e.jokers.slice()) if (j !== keep) e.destroyJoker(j, 'Ankh');
      e.duplicateJoker(keep);
    },
  },
  sealSpectral('deja_vu', 'Déjà Vu', 'red', '🔁', 'Red Seal'),
  {
    key: 'hex', name: 'Hex', kind: 'spectral', emoji: '🕸', cost: 4, select: [0, 0],
    desc: () => 'Add <b>Polychrome</b> to a random Joker, destroy all other Jokers',
    canUse: (e) => e.jokers.length > 0,
    use: (e) => {
      const keep = e.rng.pick(e.jokers);
      for (const j of e.jokers.slice()) if (j !== keep) e.destroyJoker(j, 'Hex');
      keep.edition = 'poly';
    },
  },
  sealSpectral('trance', 'Trance', 'blue', '💫', 'Blue Seal'),
  sealSpectral('medium', 'Medium', 'purple', '🔮', 'Purple Seal'),
  {
    key: 'cryptid', name: 'Cryptid', kind: 'spectral', emoji: '🦕', cost: 4, select: [1, 1],
    desc: () => 'Create <b>2</b> copies of <b>1</b> selected card in your hand',
    use: (e, cards) => {
      for (let i = 0; i < 2; i++) e.addCardToDeck(cloneCard(cards[0]), 'Cryptid', true);
    },
  },
  {
    key: 'soul', name: 'The Soul', kind: 'spectral', emoji: '💠', cost: 4, select: [0, 0], rare: true,
    desc: () => 'Creates a <b>Legendary</b> Joker',
    canUse: (e) => e.hasJokerSpace(),
    use: (e) => { e.createJokers(1, 'legendary', 'The Soul'); },
  },
  {
    key: 'black_hole', name: 'Black Hole', kind: 'spectral', emoji: '⚫', cost: 4, select: [0, 0], rare: true,
    desc: () => 'Upgrade <b>every</b> poker hand by <b>1</b> level',
    use: (e) => { for (const key of Object.keys(HAND_BASE)) e.levelUpHand(key, 1, 'Black Hole'); },
  },
];

const ALL = [...TAROT_LIST, ...PLANET_LIST, ...SPECTRAL_LIST];

export const CONSUMABLES = Object.fromEntries(ALL.map((c) => [c.key, c]));
export const TAROT_KEYS = TAROT_LIST.map((c) => c.key);
export const PLANET_KEYS = PLANET_LIST.map((c) => c.key);
export const SPECTRAL_KEYS = SPECTRAL_LIST.map((c) => c.key);
// The Soul and Black Hole only show up through packs, never in the shop.
export const COMMON_SPECTRAL_KEYS = SPECTRAL_LIST.filter((c) => !c.rare).map((c) => c.key);
export const PLANET_BY_HAND = Object.fromEntries(PLANET_LIST.map((p) => [p.hand, p.key]));

export function consumableDesc(card, engine) {
  const def = CONSUMABLES[card.key];
  if (!def) return '';
  return typeof def.desc === 'function' ? def.desc(engine, card) : def.desc || '';
}

export function keysOfKind(kind) {
  if (kind === 'tarot') return TAROT_KEYS;
  if (kind === 'planet') return PLANET_KEYS;
  if (kind === 'spectral') return COMMON_SPECTRAL_KEYS;
  return [];
}

export { makeCard };
