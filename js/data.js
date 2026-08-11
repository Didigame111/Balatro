// Static run data: hand levels, blind requirements, boss blinds, vouchers,
// tags, booster packs and starting decks.

// ---------------------------------------------------------------------------
// Poker hand levels
// ---------------------------------------------------------------------------

export const HAND_BASE = {
  high_card:      { chips: 5,   mult: 1,  chipStep: 10, multStep: 1, planet: 'pluto' },
  pair:           { chips: 10,  mult: 2,  chipStep: 15, multStep: 1, planet: 'mercury' },
  two_pair:       { chips: 20,  mult: 2,  chipStep: 20, multStep: 1, planet: 'uranus' },
  three_of_a_kind:{ chips: 30,  mult: 3,  chipStep: 20, multStep: 2, planet: 'venus' },
  straight:       { chips: 30,  mult: 4,  chipStep: 30, multStep: 3, planet: 'saturn' },
  flush:          { chips: 35,  mult: 4,  chipStep: 15, multStep: 2, planet: 'jupiter' },
  full_house:     { chips: 40,  mult: 4,  chipStep: 25, multStep: 2, planet: 'earth' },
  four_of_a_kind: { chips: 60,  mult: 7,  chipStep: 30, multStep: 3, planet: 'mars' },
  straight_flush: { chips: 100, mult: 8,  chipStep: 40, multStep: 4, planet: 'neptune' },
  five_of_a_kind: { chips: 120, mult: 12, chipStep: 35, multStep: 3, planet: 'planetx' },
  flush_house:    { chips: 140, mult: 14, chipStep: 40, multStep: 4, planet: 'ceres' },
  flush_five:     { chips: 160, mult: 16, chipStep: 50, multStep: 3, planet: 'eris' },
};

export function handValues(key, level) {
  const base = HAND_BASE[key];
  const steps = Math.max(0, level - 1);
  return {
    chips: base.chips + base.chipStep * steps,
    mult: base.mult + base.multStep * steps,
  };
}

// ---------------------------------------------------------------------------
// Antes and blinds
// ---------------------------------------------------------------------------

const ANTE_BASE = [100, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000, 110000, 560000, 7200000, 300000000];

export function anteBase(ante) {
  if (ante < ANTE_BASE.length) return ANTE_BASE[Math.max(0, ante)];
  // Beyond the table the requirement keeps accelerating.
  let value = ANTE_BASE[ANTE_BASE.length - 1];
  for (let i = ANTE_BASE.length; i <= ante; i++) value *= 40;
  return value;
}

export const BLIND_TYPES = {
  small: { key: 'small', name: 'Small Blind', mult: 1, reward: 3, skippable: true },
  big: { key: 'big', name: 'Big Blind', mult: 1.5, reward: 4, skippable: true },
  boss: { key: 'boss', name: 'Boss Blind', mult: 2, reward: 5, skippable: false },
};

// ---------------------------------------------------------------------------
// Boss blinds
// ---------------------------------------------------------------------------
// `debuff(card, engine)`   marks a card as scoring nothing
// `chipMult`               overrides the boss requirement multiplier
// Behavioural hooks are handled by key inside the engine.

export const BOSSES = {
  hook:    { key: 'hook',    name: 'The Hook',    emoji: '🪝', desc: 'Discards 2 random cards per hand played', minAnte: 1 },
  ox:      { key: 'ox',      name: 'The Ox',      emoji: '🐂', desc: 'Playing your most played hand sets money to $0', minAnte: 6 },
  house:   { key: 'house',   name: 'The House',   emoji: '🏠', desc: 'First hand is drawn face down', minAnte: 2 },
  wall:    { key: 'wall',    name: 'The Wall',    emoji: '🧱', desc: 'Extra large blind', minAnte: 2, chipMult: 4 },
  wheel:   { key: 'wheel',   name: 'The Wheel',   emoji: '🎡', desc: '1 in 7 cards get drawn face down', minAnte: 2 },
  arm:     { key: 'arm',     name: 'The Arm',     emoji: '💪', desc: 'Decrease level of played poker hand', minAnte: 2 },
  club:    { key: 'club',    name: 'The Club',    emoji: '♣',  desc: 'All Club cards are debuffed', minAnte: 1,
             debuff: (c) => c.suit === 'C' },
  fish:    { key: 'fish',    name: 'The Fish',    emoji: '🐟', desc: 'Cards drawn face down after each hand played', minAnte: 2 },
  psychic: { key: 'psychic', name: 'The Psychic', emoji: '🔮', desc: 'Must play 5 cards', minAnte: 1 },
  goad:    { key: 'goad',    name: 'The Goad',    emoji: '🐐', desc: 'All Spade cards are debuffed', minAnte: 1,
             debuff: (c) => c.suit === 'S' },
  water:   { key: 'water',   name: 'The Water',   emoji: '💧', desc: 'Start with 0 discards', minAnte: 2 },
  window:  { key: 'window',  name: 'The Window',  emoji: '🪟', desc: 'All Diamond cards are debuffed', minAnte: 1,
             debuff: (c) => c.suit === 'D' },
  manacle: { key: 'manacle', name: 'The Manacle', emoji: '⛓',  desc: '-1 hand size', minAnte: 1 },
  eye:     { key: 'eye',     name: 'The Eye',     emoji: '👁',  desc: 'No repeat hand types this round', minAnte: 3 },
  mouth:   { key: 'mouth',   name: 'The Mouth',   emoji: '👄', desc: 'Play only 1 hand type this round', minAnte: 2 },
  plant:   { key: 'plant',   name: 'The Plant',   emoji: '🌱', desc: 'All face cards are debuffed', minAnte: 4,
             debuff: (c, e) => e.hasJoker('pareidolia') || (c.rank >= 11 && c.rank <= 13 && c.enhancement !== 'stone') },
  serpent: { key: 'serpent', name: 'The Serpent', emoji: '🐍', desc: 'After Play or Discard, always draw 3 cards', minAnte: 5 },
  pillar:  { key: 'pillar',  name: 'The Pillar',  emoji: '🏛', desc: 'Cards played this Ante are debuffed', minAnte: 4 },
  needle:  { key: 'needle',  name: 'The Needle',  emoji: '🪡', desc: 'Play only 1 hand', minAnte: 2 },
  head:    { key: 'head',    name: 'The Head',    emoji: '🗿', desc: 'All Heart cards are debuffed', minAnte: 1,
             debuff: (c) => c.suit === 'H' },
  tooth:   { key: 'tooth',   name: 'The Tooth',   emoji: '🦷', desc: 'Lose $1 per card played', minAnte: 3 },
  flint:   { key: 'flint',   name: 'The Flint',   emoji: '🪨', desc: 'Base Chips and Mult are halved', minAnte: 2 },
  mark:    { key: 'mark',    name: 'The Mark',    emoji: '✒',  desc: 'All face cards are drawn face down', minAnte: 2 },
  // Finishers only appear on antes that are a multiple of 8.
  acorn:   { key: 'acorn',   name: 'Amber Acorn', emoji: '🌰', desc: 'Flips and shuffles all Jokers', finisher: true },
  leaf:    { key: 'leaf',    name: 'Verdant Leaf', emoji: '🍃', desc: 'All cards debuffed until 1 Joker is sold', finisher: true },
  vessel:  { key: 'vessel',  name: 'Violet Vessel', emoji: '🏺', desc: 'Very large blind', finisher: true, chipMult: 6 },
  heart:   { key: 'heart',   name: 'Crimson Heart', emoji: '❤', desc: 'One random Joker disabled every hand', finisher: true },
  bell:    { key: 'bell',    name: 'Cerulean Bell', emoji: '🔔', desc: 'Forces 1 card to always be selected', finisher: true },
};

export const FINISHER_KEYS = Object.values(BOSSES).filter((b) => b.finisher).map((b) => b.key);
export const REGULAR_BOSS_KEYS = Object.values(BOSSES).filter((b) => !b.finisher).map((b) => b.key);

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

export const VOUCHERS = {
  overstock:      { key: 'overstock', name: 'Overstock', cost: 10, desc: '+1 card slot available in shop' },
  overstock_plus: { key: 'overstock_plus', name: 'Overstock Plus', cost: 10, requires: 'overstock', desc: '+1 card slot available in shop' },
  clearance:      { key: 'clearance', name: 'Clearance Sale', cost: 10, desc: 'All cards and packs in shop are 25% off' },
  liquidation:    { key: 'liquidation', name: 'Liquidation', cost: 10, requires: 'clearance', desc: 'All cards and packs in shop are 50% off' },
  hone:           { key: 'hone', name: 'Hone', cost: 10, desc: 'Foil, Holographic and Polychrome cards appear 2X more often' },
  glow_up:        { key: 'glow_up', name: 'Glow Up', cost: 20, requires: 'hone', desc: 'Foil, Holographic and Polychrome cards appear 4X more often' },
  reroll_surplus: { key: 'reroll_surplus', name: 'Reroll Surplus', cost: 10, desc: 'Rerolls cost $2 less' },
  reroll_glut:    { key: 'reroll_glut', name: 'Reroll Glut', cost: 10, requires: 'reroll_surplus', desc: 'Rerolls cost $2 less' },
  crystal_ball:   { key: 'crystal_ball', name: 'Crystal Ball', cost: 10, desc: '+1 consumable slot' },
  omen_globe:     { key: 'omen_globe', name: 'Omen Globe', cost: 20, requires: 'crystal_ball', desc: 'Spectral cards may appear in any Arcana Pack' },
  telescope:      { key: 'telescope', name: 'Telescope', cost: 10, desc: 'Celestial Packs always contain the Planet card for your most played hand' },
  observatory:    { key: 'observatory', name: 'Observatory', cost: 20, requires: 'telescope', desc: 'Planet cards in your consumable area give X1.5 Mult for their hand' },
  grabber:        { key: 'grabber', name: 'Grabber', cost: 10, desc: 'Permanently gain +1 hand per round' },
  nacho_tong:     { key: 'nacho_tong', name: 'Nacho Tong', cost: 20, requires: 'grabber', desc: 'Permanently gain +1 hand per round' },
  wasteful:       { key: 'wasteful', name: 'Wasteful', cost: 10, desc: 'Permanently gain +1 discard per round' },
  recyclomancy:   { key: 'recyclomancy', name: 'Recyclomancy', cost: 20, requires: 'wasteful', desc: 'Permanently gain +1 discard per round' },
  tarot_merchant: { key: 'tarot_merchant', name: 'Tarot Merchant', cost: 10, desc: 'Tarot cards appear 2X more frequently in the shop' },
  tarot_tycoon:   { key: 'tarot_tycoon', name: 'Tarot Tycoon', cost: 20, requires: 'tarot_merchant', desc: 'Tarot cards appear 4X more frequently in the shop' },
  planet_merchant:{ key: 'planet_merchant', name: 'Planet Merchant', cost: 10, desc: 'Planet cards appear 2X more frequently in the shop' },
  planet_tycoon:  { key: 'planet_tycoon', name: 'Planet Tycoon', cost: 20, requires: 'planet_merchant', desc: 'Planet cards appear 4X more frequently in the shop' },
  seed_money:     { key: 'seed_money', name: 'Seed Money', cost: 10, desc: 'Raise the cap on interest earned per round to $10' },
  money_tree:     { key: 'money_tree', name: 'Money Tree', cost: 20, requires: 'seed_money', desc: 'Raise the cap on interest earned per round to $20' },
  blank:          { key: 'blank', name: 'Blank', cost: 10, desc: 'Does nothing?' },
  antimatter:     { key: 'antimatter', name: 'Antimatter', cost: 20, requires: 'blank', desc: '+1 Joker slot' },
  magic_trick:    { key: 'magic_trick', name: 'Magic Trick', cost: 20, desc: 'Playing cards can be purchased from the shop' },
  illusion:       { key: 'illusion', name: 'Illusion', cost: 20, requires: 'magic_trick', desc: 'Playing cards in shop may have an Enhancement, Edition or Seal' },
  hieroglyph:     { key: 'hieroglyph', name: 'Hieroglyph', cost: 20, desc: '-1 Ante, -1 hand per round' },
  petroglyph:     { key: 'petroglyph', name: 'Petroglyph', cost: 20, requires: 'hieroglyph', desc: '-1 Ante, -1 discard per round' },
  directors_cut:  { key: 'directors_cut', name: "Director's Cut", cost: 20, desc: 'Reroll Boss Blind once per Ante, $10 per roll' },
  retcon:         { key: 'retcon', name: 'Retcon', cost: 20, requires: 'directors_cut', desc: 'Reroll Boss Blind unlimited times, $10 per roll' },
  paint_brush:    { key: 'paint_brush', name: 'Paint Brush', cost: 10, desc: '+1 hand size' },
  palette:        { key: 'palette', name: 'Palette', cost: 20, requires: 'paint_brush', desc: '+1 hand size' },
};

export const VOUCHER_KEYS = Object.keys(VOUCHERS);

// ---------------------------------------------------------------------------
// Skip tags
// ---------------------------------------------------------------------------

export const TAGS = {
  uncommon:  { key: 'uncommon', name: 'Uncommon Tag', emoji: '🎴', desc: 'Shop has a free Uncommon Joker' },
  rare:      { key: 'rare', name: 'Rare Tag', emoji: '🃏', desc: 'Shop has a free Rare Joker' },
  negative:  { key: 'negative', name: 'Negative Tag', emoji: '🌑', desc: 'Next base edition shop Joker is free and Negative' },
  foil:      { key: 'foil', name: 'Foil Tag', emoji: '🥈', desc: 'Next base edition shop Joker is free and Foil' },
  holo:      { key: 'holo', name: 'Holographic Tag', emoji: '🌈', desc: 'Next base edition shop Joker is free and Holographic' },
  poly:      { key: 'poly', name: 'Polychrome Tag', emoji: '✨', desc: 'Next base edition shop Joker is free and Polychrome' },
  investment:{ key: 'investment', name: 'Investment Tag', emoji: '💹', desc: 'After defeating the Boss Blind, gain $25' },
  voucher:   { key: 'voucher', name: 'Voucher Tag', emoji: '🎟', desc: 'Adds one Voucher to the next shop' },
  boss:      { key: 'boss', name: 'Boss Tag', emoji: '👹', desc: 'Rerolls the Boss Blind' },
  standard:  { key: 'standard', name: 'Standard Tag', emoji: '📦', desc: 'Gives a free Mega Standard Pack' },
  charm:     { key: 'charm', name: 'Charm Tag', emoji: '🔮', desc: 'Gives a free Mega Arcana Pack' },
  meteor:    { key: 'meteor', name: 'Meteor Tag', emoji: '☄', desc: 'Gives a free Mega Celestial Pack' },
  buffoon:   { key: 'buffoon', name: 'Buffoon Tag', emoji: '🤡', desc: 'Gives a free Mega Buffoon Pack' },
  ethereal:  { key: 'ethereal', name: 'Ethereal Tag', emoji: '👻', desc: 'Gives a free Spectral Pack' },
  handy:     { key: 'handy', name: 'Handy Tag', emoji: '✋', desc: 'Gives $1 per played hand this run' },
  garbage:   { key: 'garbage', name: 'Garbage Tag', emoji: '🗑', desc: 'Gives $1 per unused discard this run' },
  coupon:    { key: 'coupon', name: 'Coupon Tag', emoji: '🏷', desc: 'Initial cards and booster packs in next shop are free' },
  double:    { key: 'double', name: 'Double Tag', emoji: '⧉', desc: 'Gives a copy of the next selected Tag' },
  juggle:    { key: 'juggle', name: 'Juggle Tag', emoji: '🤹', desc: '+3 hand size next round' },
  d6:        { key: 'd6', name: 'D6 Tag', emoji: '🎲', desc: 'Rerolls in next shop start at $0' },
  topup:     { key: 'topup', name: 'Top-up Tag', emoji: '🔝', desc: 'Create up to 2 Common Jokers' },
  speed:     { key: 'speed', name: 'Speed Tag', emoji: '🏃', desc: 'Gives $5 per skipped Blind this run' },
  orbital:   { key: 'orbital', name: 'Orbital Tag', emoji: '🛰', desc: 'Upgrade a random poker hand by 3 levels' },
  economy:   { key: 'economy', name: 'Economy Tag', emoji: '💰', desc: 'Doubles your money (max of $40)' },
};

export const TAG_KEYS = Object.keys(TAGS);

// ---------------------------------------------------------------------------
// Booster packs
// ---------------------------------------------------------------------------

export const PACKS = [
  { key: 'arcana', name: 'Arcana Pack', kind: 'tarot', size: 3, choose: 1, cost: 4, weight: 4 },
  { key: 'arcana_jumbo', name: 'Jumbo Arcana Pack', kind: 'tarot', size: 5, choose: 1, cost: 6, weight: 2 },
  { key: 'arcana_mega', name: 'Mega Arcana Pack', kind: 'tarot', size: 5, choose: 2, cost: 8, weight: 0.5 },
  { key: 'celestial', name: 'Celestial Pack', kind: 'planet', size: 3, choose: 1, cost: 4, weight: 4 },
  { key: 'celestial_jumbo', name: 'Jumbo Celestial Pack', kind: 'planet', size: 5, choose: 1, cost: 6, weight: 2 },
  { key: 'celestial_mega', name: 'Mega Celestial Pack', kind: 'planet', size: 5, choose: 2, cost: 8, weight: 0.5 },
  { key: 'standard', name: 'Standard Pack', kind: 'playing', size: 3, choose: 1, cost: 4, weight: 4 },
  { key: 'standard_jumbo', name: 'Jumbo Standard Pack', kind: 'playing', size: 5, choose: 1, cost: 6, weight: 2 },
  { key: 'standard_mega', name: 'Mega Standard Pack', kind: 'playing', size: 5, choose: 2, cost: 8, weight: 0.5 },
  { key: 'buffoon', name: 'Buffoon Pack', kind: 'joker', size: 2, choose: 1, cost: 4, weight: 1.2 },
  { key: 'buffoon_jumbo', name: 'Jumbo Buffoon Pack', kind: 'joker', size: 4, choose: 1, cost: 6, weight: 0.6 },
  { key: 'buffoon_mega', name: 'Mega Buffoon Pack', kind: 'joker', size: 4, choose: 2, cost: 8, weight: 0.3 },
  { key: 'spectral', name: 'Spectral Pack', kind: 'spectral', size: 2, choose: 1, cost: 4, weight: 0.6 },
  { key: 'spectral_jumbo', name: 'Jumbo Spectral Pack', kind: 'spectral', size: 4, choose: 1, cost: 6, weight: 0.3 },
  { key: 'spectral_mega', name: 'Mega Spectral Pack', kind: 'spectral', size: 4, choose: 2, cost: 8, weight: 0.15 },
];

export const PACK_BY_KEY = Object.fromEntries(PACKS.map((p) => [p.key, p]));

// ---------------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------------

export const DECKS = {
  red: { key: 'red', name: 'Red Deck', color: '#c0392b', desc: '+1 discard every round', discards: 1 },
  blue: { key: 'blue', name: 'Blue Deck', color: '#2b6cb0', desc: '+1 hand every round', hands: 1 },
  yellow: { key: 'yellow', name: 'Yellow Deck', color: '#d4a017', desc: 'Start with an extra $10', money: 10 },
  green: { key: 'green', name: 'Green Deck', color: '#2f855a', desc: 'At end of each Round: $2 per remaining Hand, $1 per remaining Discard. Earn no interest.' },
  black: { key: 'black', name: 'Black Deck', color: '#3c3c46', desc: '+1 Joker slot, -1 hand every round', jokerSlots: 1, hands: -1 },
  magic: { key: 'magic', name: 'Magic Deck', color: '#7c4bbd', desc: 'Start with the Crystal Ball voucher and 2 copies of The Fool' },
  nebula: { key: 'nebula', name: 'Nebula Deck', color: '#2c5282', desc: 'Start with the Telescope voucher, -1 consumable slot' },
  ghost: { key: 'ghost', name: 'Ghost Deck', color: '#5a6b7d', desc: 'Spectral cards may appear in the shop, start with a Hex card' },
  abandoned: { key: 'abandoned', name: 'Abandoned Deck', color: '#8b5a2b', desc: 'Start with a deck with no Face Cards' },
  checkered: { key: 'checkered', name: 'Checkered Deck', color: '#b8860b', desc: 'Start with 26 Spades and 26 Hearts in deck' },
  zodiac: { key: 'zodiac', name: 'Zodiac Deck', color: '#4a5568', desc: 'Start with Tarot Merchant, Planet Merchant and Overstock' },
  painted: { key: 'painted', name: 'Painted Deck', color: '#c05621', desc: '+2 hand size, -1 Joker slot', handSize: 2, jokerSlots: -1 },
  anaglyph: { key: 'anaglyph', name: 'Anaglyph Deck', color: '#a02c2c', desc: 'After defeating each Boss Blind, gain a Double Tag' },
  plasma: { key: 'plasma', name: 'Plasma Deck', color: '#c53030', desc: 'Balance Chips and Mult when calculating score, X2 base Blind size' },
  erratic: { key: 'erratic', name: 'Erratic Deck', color: '#6b46c1', desc: 'All Ranks and Suits in deck are randomized' },
};

export const DECK_KEYS = Object.keys(DECKS);

// ---------------------------------------------------------------------------
// Base run configuration
// ---------------------------------------------------------------------------

export const BASE_CONFIG = {
  hands: 4,
  discards: 3,
  handSize: 8,
  jokerSlots: 5,
  consumableSlots: 2,
  money: 4,
  interestRate: 5,   // $1 per $5 held
  interestCap: 5,    // capped at $5 by default
  shopSlots: 2,
  rerollBase: 5,
  winAnte: 8,
};
