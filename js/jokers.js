// Joker definitions.
//
// Scoring hooks return an effect object; any subset of these keys is allowed:
//   { chips, mult, xmult, money, msg }
//
//   indep(ctx)                 -> effect applied once, after every card
//   scored(ctx, card)          -> effect applied per scoring card
//   held(ctx, card)            -> effect applied per card held in hand
//   retriggerScored(ctx, card) -> number of *extra* triggers
//   retriggerHeld(ctx, card)   -> number of *extra* triggers
//
// Lifecycle hooks mutate run state directly and receive (engine, joker).

import { SUITS, rankLabel, rankName } from './cards.js';

export const RARITY = {
  common: { key: 'common', name: 'Common', color: '#4a90d9', weight: 70 },
  uncommon: { key: 'uncommon', name: 'Uncommon', color: '#3aa76d', weight: 25 },
  rare: { key: 'rare', name: 'Rare', color: '#d9534f', weight: 5 },
  legendary: { key: 'legendary', name: 'Legendary', color: '#a35fd6', weight: 0 },
};

const SUIT_JOKER = (key, name, suit, emoji, cost) => ({
  key, name, rarity: 'common', cost, emoji,
  desc: () => `Played cards with <b>${SUITS[suit].name}</b> suit give <b>+3 Mult</b> when scored`,
  scored: (ctx, card) => (ctx.engine.cardHasSuit(card, suit) ? { mult: 3 } : null),
});

const CONTAINS_MULT = (key, name, need, mult, emoji, cost) => ({
  key, name, rarity: 'common', cost, emoji,
  desc: () => `<b>+${mult} Mult</b> if played hand contains a <b>${need.label}</b>`,
  indep: (ctx) => (ctx.contains[need.flag] ? { mult } : null),
});

const CONTAINS_CHIPS = (key, name, need, chips, emoji, cost) => ({
  key, name, rarity: 'common', cost, emoji,
  desc: () => `<b>+${chips} Chips</b> if played hand contains a <b>${need.label}</b>`,
  indep: (ctx) => (ctx.contains[need.flag] ? { chips } : null),
});

const NEED = {
  pair: { flag: 'pair', label: 'Pair' },
  twoPair: { flag: 'twoPair', label: 'Two Pair' },
  three: { flag: 'three', label: 'Three of a Kind' },
  straight: { flag: 'straight', label: 'Straight' },
  flush: { flag: 'flush', label: 'Flush' },
  four: { flag: 'four', label: 'Four of a Kind' },
};

const LIST = [
  // -- Common -------------------------------------------------------------
  {
    key: 'joker', name: 'Joker', rarity: 'common', cost: 2, emoji: '🃏',
    desc: () => '<b>+4 Mult</b>',
    indep: () => ({ mult: 4 }),
  },
  SUIT_JOKER('greedy_joker', 'Greedy Joker', 'D', '💎', 5),
  SUIT_JOKER('lusty_joker', 'Lusty Joker', 'H', '❤', 5),
  SUIT_JOKER('wrathful_joker', 'Wrathful Joker', 'S', '🗡', 5),
  SUIT_JOKER('gluttonous_joker', 'Gluttonous Joker', 'C', '🍗', 5),
  CONTAINS_MULT('jolly', 'Jolly Joker', NEED.pair, 8, '😀', 3),
  CONTAINS_MULT('zany', 'Zany Joker', NEED.three, 12, '🤪', 4),
  CONTAINS_MULT('mad', 'Mad Joker', NEED.twoPair, 10, '😡', 4),
  CONTAINS_MULT('crazy', 'Crazy Joker', NEED.straight, 12, '🤯', 4),
  CONTAINS_MULT('droll', 'Droll Joker', NEED.flush, 10, '😏', 4),
  CONTAINS_CHIPS('sly', 'Sly Joker', NEED.pair, 50, '🕵', 3),
  CONTAINS_CHIPS('wily', 'Wily Joker', NEED.three, 100, '🦊', 4),
  CONTAINS_CHIPS('clever', 'Clever Joker', NEED.twoPair, 80, '🧠', 4),
  CONTAINS_CHIPS('devious', 'Devious Joker', NEED.straight, 100, '😈', 4),
  CONTAINS_CHIPS('crafty', 'Crafty Joker', NEED.flush, 80, '🔨', 4),
  {
    key: 'half', name: 'Half Joker', rarity: 'common', cost: 5, emoji: '◐',
    desc: () => '<b>+20 Mult</b> if played hand contains <b>3 or fewer</b> cards',
    indep: (ctx) => (ctx.played.length <= 3 ? { mult: 20 } : null),
  },
  {
    key: 'banner', name: 'Banner', rarity: 'common', cost: 5, emoji: '🚩',
    desc: () => '<b>+30 Chips</b> for each remaining <b>discard</b>',
    indep: (ctx) => ({ chips: 30 * ctx.engine.discardsLeft }),
  },
  {
    key: 'mystic_summit', name: 'Mystic Summit', rarity: 'common', cost: 5, emoji: '🏔',
    desc: () => '<b>+15 Mult</b> when <b>0 discards</b> remaining',
    indep: (ctx) => (ctx.engine.discardsLeft === 0 ? { mult: 15 } : null),
  },
  {
    key: 'misprint', name: 'Misprint', rarity: 'common', cost: 4, emoji: '🖨',
    desc: () => '<b>+0-23 Mult</b>',
    indep: (ctx) => ({ mult: ctx.engine.rng.range(0, 23) }),
  },
  {
    key: 'raised_fist', name: 'Raised Fist', rarity: 'common', cost: 5, emoji: '✊',
    desc: () => 'Adds <b>double</b> the rank of the lowest card held in hand to Mult',
    held: (ctx, card) => {
      const pool = ctx.held.filter((c) => c.enhancement !== 'stone' && !c.debuffed);
      if (!pool.length) return null;
      let lowest = pool[0];
      for (const c of pool) if (c.rank < lowest.rank) lowest = c;
      // Only the right-most copy of the lowest rank triggers.
      const last = pool.filter((c) => c.rank === lowest.rank).pop();
      if (card !== last) return null;
      const value = card.rank === 14 ? 11 : Math.min(card.rank, 10);
      return { mult: value * 2 };
    },
  },
  {
    key: 'scary_face', name: 'Scary Face', rarity: 'common', cost: 4, emoji: '😱',
    desc: () => 'Played <b>face cards</b> give <b>+30 Chips</b> when scored',
    scored: (ctx, card) => (ctx.engine.isFace(card) ? { chips: 30 } : null),
  },
  {
    key: 'abstract_joker', name: 'Abstract Joker', rarity: 'common', cost: 4, emoji: '🎨',
    desc: (j, e) => `<b>+3 Mult</b> for each Joker card <span class="muted">(currently +${e ? e.jokers.length * 3 : 0})</span>`,
    indep: (ctx) => ({ mult: 3 * ctx.engine.jokers.length }),
  },
  {
    key: 'gros_michel', name: 'Gros Michel', rarity: 'common', cost: 5, emoji: '🍌',
    desc: () => '<b>+15 Mult</b>. <b>1 in 6</b> chance this is destroyed at the end of round',
    indep: () => ({ mult: 15 }),
    onRoundEnd: (e, j) => {
      if (e.chance(1, 6)) {
        e.destroyJoker(j, 'Extinct!');
        e.flags.grosMichelGone = true;
      }
    },
  },
  {
    key: 'even_steven', name: 'Even Steven', rarity: 'common', cost: 4, emoji: '2️⃣',
    desc: () => 'Played cards with an <b>even</b> rank give <b>+4 Mult</b> when scored',
    scored: (ctx, card) => (card.enhancement !== 'stone' && card.rank <= 10 && card.rank % 2 === 0 ? { mult: 4 } : null),
  },
  {
    key: 'odd_todd', name: 'Odd Todd', rarity: 'common', cost: 4, emoji: '1️⃣',
    desc: () => 'Played cards with an <b>odd</b> rank give <b>+31 Chips</b> when scored',
    scored: (ctx, card) => {
      if (card.enhancement === 'stone') return null;
      const rank = card.rank === 14 ? 1 : card.rank;
      return rank <= 10 && rank % 2 === 1 ? { chips: 31 } : null;
    },
  },
  {
    key: 'scholar', name: 'Scholar', rarity: 'common', cost: 4, emoji: '📚',
    desc: () => 'Played <b>Aces</b> give <b>+20 Chips</b> and <b>+4 Mult</b> when scored',
    scored: (ctx, card) => (card.rank === 14 && card.enhancement !== 'stone' ? { chips: 20, mult: 4 } : null),
  },
  {
    key: 'business', name: 'Business Card', rarity: 'common', cost: 4, emoji: '💼',
    desc: () => 'Played <b>face cards</b> have a <b>1 in 2</b> chance to give <b>$2</b>',
    scored: (ctx, card) => (ctx.engine.isFace(card) && ctx.engine.chance(1, 2) ? { money: 2 } : null),
  },
  {
    key: 'supernova', name: 'Supernova', rarity: 'common', cost: 5, emoji: '💥',
    desc: () => 'Adds the number of times poker hand has been played this run to <b>Mult</b>',
    indep: (ctx) => ({ mult: ctx.engine.handPlays[ctx.handKey] || 0 }),
  },
  {
    key: 'ride_the_bus', name: 'Ride the Bus', rarity: 'common', cost: 6, emoji: '🚌',
    init: (j) => { j.state.mult = 0; },
    desc: (j) => `This Joker gains <b>+1 Mult</b> per consecutive hand played without a scoring face card <span class="muted">(currently +${j.state.mult})</span>`,
    indep: (ctx, j) => (j.state.mult ? { mult: j.state.mult } : null),
    onHandPlayed: (e, j, ctx) => {
      if (ctx.scoring.some((c) => e.isFace(c))) j.state.mult = 0;
      else j.state.mult += 1;
    },
  },
  {
    key: 'runner', name: 'Runner', rarity: 'common', cost: 5, emoji: '🏃',
    init: (j) => { j.state.chips = 0; },
    desc: (j) => `Gains <b>+15 Chips</b> if played hand contains a Straight <span class="muted">(currently +${j.state.chips})</span>`,
    indep: (ctx, j) => (j.state.chips ? { chips: j.state.chips } : null),
    onHandPlayed: (e, j, ctx) => { if (ctx.contains.straight) j.state.chips += 15; },
  },
  {
    key: 'ice_cream', name: 'Ice Cream', rarity: 'common', cost: 5, emoji: '🍦',
    init: (j) => { j.state.chips = 100; },
    desc: (j) => `<b>+${j.state.chips} Chips</b>, <b>-5 Chips</b> for every hand played`,
    indep: (ctx, j) => (j.state.chips > 0 ? { chips: j.state.chips } : null),
    onHandPlayed: (e, j) => {
      j.state.chips -= 5;
      if (j.state.chips <= 0) e.destroyJoker(j, 'Melted!');
    },
  },
  {
    key: 'splash', name: 'Splash', rarity: 'common', cost: 3, emoji: '💦',
    desc: () => 'Every <b>played card</b> counts in scoring',
  },
  {
    key: 'blue_joker', name: 'Blue Joker', rarity: 'common', cost: 5, emoji: '🔵',
    desc: (j, e) => `<b>+2 Chips</b> for each remaining card in your deck <span class="muted">(currently +${e ? e.drawPile.length * 2 : 0})</span>`,
    indep: (ctx) => ({ chips: 2 * ctx.engine.drawPile.length }),
  },
  {
    key: 'faceless', name: 'Faceless Joker', rarity: 'common', cost: 4, emoji: '🎭',
    desc: () => 'Earn <b>$5</b> if <b>3 or more</b> face cards are discarded at the same time',
    onDiscard: (e, j, cards) => {
      if (cards.filter((c) => e.isFace(c)).length >= 3) e.addMoney(5, 'Faceless Joker');
    },
  },
  {
    key: 'green_joker', name: 'Green Joker', rarity: 'common', cost: 4, emoji: '💚',
    init: (j) => { j.state.mult = 0; },
    desc: (j) => `<b>+1 Mult</b> per hand played, <b>-1 Mult</b> per discard <span class="muted">(currently +${j.state.mult})</span>`,
    indep: (ctx, j) => (j.state.mult ? { mult: j.state.mult } : null),
    onHandPlayed: (e, j) => { j.state.mult += 1; },
    onDiscard: (e, j) => { j.state.mult = Math.max(0, j.state.mult - 1); },
  },
  {
    key: 'superposition', name: 'Superposition', rarity: 'common', cost: 4, emoji: '⚛',
    desc: () => 'Create a <b>Tarot</b> card if poker hand contains an <b>Ace</b> and a <b>Straight</b>',
    onHandPlayed: (e, j, ctx) => {
      if (ctx.contains.straight && ctx.scoring.some((c) => c.rank === 14)) e.createConsumable('tarot', 'Superposition');
    },
  },
  {
    key: 'to_do_list', name: 'To Do List', rarity: 'common', cost: 4, emoji: '📝',
    init: (j, e) => { j.state.hand = e.randomHandKey(); },
    desc: (j, e) => `Earn <b>$4</b> if poker hand is a <b>${e ? e.handName(j.state.hand) : ''}</b>, changes at end of round`,
    onHandPlayed: (e, j, ctx) => { if (ctx.handKey === j.state.hand) e.addMoney(4, 'To Do List'); },
    onRoundEnd: (e, j) => { j.state.hand = e.randomHandKey(); },
  },
  {
    key: 'cavendish', name: 'Cavendish', rarity: 'common', cost: 4, emoji: '🍌',
    desc: () => '<b>X3 Mult</b>. <b>1 in 1000</b> chance this card is destroyed at the end of round',
    indep: () => ({ xmult: 3 }),
    onRoundEnd: (e, j) => { if (e.chance(1, 1000)) e.destroyJoker(j, 'Extinct!'); },
  },
  {
    key: 'square', name: 'Square Joker', rarity: 'common', cost: 4, emoji: '⬛',
    init: (j) => { j.state.chips = 0; },
    desc: (j) => `Gains <b>+4 Chips</b> if played hand has exactly <b>4</b> cards <span class="muted">(currently +${j.state.chips})</span>`,
    indep: (ctx, j) => (j.state.chips ? { chips: j.state.chips } : null),
    onHandPlayed: (e, j, ctx) => { if (ctx.played.length === 4) j.state.chips += 4; },
  },
  {
    key: 'riff_raff', name: 'Riff-Raff', rarity: 'common', cost: 6, emoji: '👥',
    desc: () => 'When <b>Blind</b> is selected, create <b>2</b> Common Jokers',
    onBlindSelected: (e, j) => { e.createJokers(2, 'common', 'Riff-Raff'); },
  },
  {
    key: 'photograph', name: 'Photograph', rarity: 'common', cost: 5, emoji: '📷',
    desc: () => 'First played <b>face card</b> gives <b>X2 Mult</b> when scored',
    scored: (ctx, card) => {
      if (!ctx.engine.isFace(card)) return null;
      const first = ctx.scoring.find((c) => ctx.engine.isFace(c));
      return card === first ? { xmult: 2 } : null;
    },
  },
  {
    key: 'reserved_parking', name: 'Reserved Parking', rarity: 'common', cost: 6, emoji: '🅿',
    desc: () => 'Each <b>face card</b> held in hand has a <b>1 in 2</b> chance to give <b>$1</b>',
    held: (ctx, card) => (ctx.engine.isFace(card) && ctx.engine.chance(1, 2) ? { money: 1 } : null),
  },
  {
    key: 'mail_in_rebate', name: 'Mail-In Rebate', rarity: 'common', cost: 4, emoji: '📮',
    init: (j, e) => { j.state.rank = e.rng.range(2, 14); },
    desc: (j) => `Earn <b>$5</b> for each discarded <b>${rankName(j.state.rank)}</b>, rank changes every round`,
    onDiscard: (e, j, cards) => {
      const hits = cards.filter((c) => c.rank === j.state.rank && c.enhancement !== 'stone').length;
      if (hits) e.addMoney(5 * hits, 'Mail-In Rebate');
    },
    onRoundEnd: (e, j) => { j.state.rank = e.rng.range(2, 14); },
  },
  {
    key: 'hallucination', name: 'Hallucination', rarity: 'common', cost: 4, emoji: '🌀',
    desc: () => '<b>1 in 2</b> chance to create a <b>Tarot</b> card when any Booster Pack is opened',
    onPackOpened: (e, j) => { if (e.chance(1, 2)) e.createConsumable('tarot', 'Hallucination'); },
  },
  {
    key: 'shoot_the_moon', name: 'Shoot the Moon', rarity: 'common', cost: 5, emoji: '🌙',
    desc: () => 'Each <b>Queen</b> held in hand gives <b>+13 Mult</b>',
    held: (ctx, card) => (card.rank === 12 && card.enhancement !== 'stone' ? { mult: 13 } : null),
  },
  {
    key: 'swashbuckler', name: 'Swashbuckler', rarity: 'common', cost: 4, emoji: '⚔',
    desc: (j, e) => `Adds the <b>sell value</b> of all your other owned Jokers to Mult <span class="muted">(currently +${e ? e.otherSellValue(j) : 0})</span>`,
    indep: (ctx, j) => ({ mult: ctx.engine.otherSellValue(j) }),
  },
  {
    key: 'chaos_clown', name: 'Chaos the Clown', rarity: 'common', cost: 4, emoji: '🤡',
    desc: () => '<b>1 free Reroll</b> per shop',
  },
  {
    key: 'delayed_gratification', name: 'Delayed Gratification', rarity: 'common', cost: 4, emoji: '⏳',
    desc: () => 'Earn <b>$2</b> per discard if no discards are used by the end of the round',
    onRoundEnd: (e, j) => {
      if (e.discardsUsedThisRound === 0) e.addMoney(2 * e.discardsLeft, 'Delayed Gratification');
    },
  },
  {
    key: 'egg', name: 'Egg', rarity: 'common', cost: 4, emoji: '🥚',
    desc: () => 'Gains <b>$3</b> of sell value at the end of each round',
    onRoundEnd: (e, j) => { j.extraValue = (j.extraValue || 0) + 3; },
  },
  {
    key: 'popcorn', name: 'Popcorn', rarity: 'common', cost: 5, emoji: '🍿',
    init: (j) => { j.state.mult = 20; },
    desc: (j) => `<b>+${j.state.mult} Mult</b>, <b>-4 Mult</b> per round played`,
    indep: (ctx, j) => (j.state.mult > 0 ? { mult: j.state.mult } : null),
    onRoundEnd: (e, j) => {
      j.state.mult -= 4;
      if (j.state.mult <= 0) e.destroyJoker(j, 'All gone!');
    },
  },
  {
    key: 'walkie_talkie', name: 'Walkie Talkie', rarity: 'common', cost: 4, emoji: '📻',
    desc: () => 'Each played <b>10</b> or <b>4</b> gives <b>+10 Chips</b> and <b>+4 Mult</b> when scored',
    scored: (ctx, card) => ((card.rank === 10 || card.rank === 4) && card.enhancement !== 'stone' ? { chips: 10, mult: 4 } : null),
  },
  {
    key: 'credit_card', name: 'Credit Card', rarity: 'common', cost: 1, emoji: '💳',
    desc: () => 'Go up to <b>-$20</b> in debt',
  },
  {
    key: 'golden', name: 'Golden Joker', rarity: 'common', cost: 6, emoji: '🥇',
    desc: () => 'Earn <b>$4</b> at end of round',
    onRoundEnd: (e) => { e.addMoney(4, 'Golden Joker'); },
  },
  {
    key: 'juggler', name: 'Juggler', rarity: 'common', cost: 4, emoji: '🤹',
    desc: () => '<b>+1</b> hand size',
    handSize: 1,
  },
  {
    key: 'drunkard', name: 'Drunkard', rarity: 'common', cost: 4, emoji: '🍺',
    desc: () => '<b>+1</b> discard each round',
    discards: 1,
  },
  {
    key: 'troubadour', name: 'Troubadour', rarity: 'uncommon', cost: 6, emoji: '🎻',
    desc: () => '<b>+2</b> hand size, <b>-1</b> hand each round',
    handSize: 2, hands: -1,
  },
  {
    key: 'merry_andy', name: 'Merry Andy', rarity: 'uncommon', cost: 7, emoji: '🎪',
    desc: () => '<b>+3</b> discards each round, <b>-1</b> hand size',
    discards: 3, handSize: -1,
  },
  {
    key: 'stuntman', name: 'Stuntman', rarity: 'rare', cost: 7, emoji: '🎬',
    desc: () => '<b>+250 Chips</b>, <b>-2</b> hand size',
    handSize: -2,
    indep: () => ({ chips: 250 }),
  },

  // -- Uncommon -----------------------------------------------------------
  {
    key: 'four_fingers', name: 'Four Fingers', rarity: 'uncommon', cost: 7, emoji: '🖐',
    desc: () => 'All <b>Flushes</b> and <b>Straights</b> can be made with <b>4</b> cards',
  },
  {
    key: 'shortcut', name: 'Shortcut', rarity: 'uncommon', cost: 7, emoji: '⤵',
    desc: () => 'Allows <b>Straights</b> to be made with gaps of <b>1</b> rank',
  },
  {
    key: 'mime', name: 'Mime', rarity: 'uncommon', cost: 5, emoji: '🤐',
    desc: () => '<b>Retrigger</b> all card <b>held in hand</b> abilities',
    retriggerHeld: () => 1,
  },
  {
    key: 'ceremonial_dagger', name: 'Ceremonial Dagger', rarity: 'uncommon', cost: 6, emoji: '🗡',
    init: (j) => { j.state.mult = 0; },
    desc: (j) => `When <b>Blind</b> is selected, destroy the Joker to the right and permanently add <b>double</b> its sell value to this Mult <span class="muted">(currently +${j.state.mult})</span>`,
    indep: (ctx, j) => (j.state.mult ? { mult: j.state.mult } : null),
    onBlindSelected: (e, j) => {
      const idx = e.jokers.indexOf(j);
      const victim = e.jokers[idx + 1];
      if (victim) {
        j.state.mult += e.sellValue(victim) * 2;
        e.destroyJoker(victim, 'Devoured!');
      }
    },
  },
  {
    key: 'marble', name: 'Marble Joker', rarity: 'uncommon', cost: 6, emoji: '🪨',
    desc: () => 'Adds one <b>Stone</b> card to the deck when Blind is selected',
    onBlindSelected: (e) => { e.addRandomCardToDeck({ enhancement: 'stone' }, 'Marble Joker'); },
  },
  {
    key: 'loyalty_card', name: 'Loyalty Card', rarity: 'uncommon', cost: 5, emoji: '🎫',
    init: (j) => { j.state.count = 0; },
    desc: (j) => `<b>X4 Mult</b> every <b>6</b> hands played <span class="muted">(${5 - (j.state.count % 6)} remaining)</span>`,
    indep: (ctx, j) => (j.state.count % 6 === 5 ? { xmult: 4 } : null),
    onHandPlayed: (e, j) => { j.state.count += 1; },
  },
  {
    key: 'eight_ball', name: '8 Ball', rarity: 'uncommon', cost: 5, emoji: '🎱',
    desc: () => '<b>1 in 4</b> chance for each played <b>8</b> to create a Tarot card when scored',
    scored: (ctx, card) => {
      if (card.rank === 8 && card.enhancement !== 'stone' && ctx.engine.chance(1, 4)) {
        ctx.engine.createConsumable('tarot', '8 Ball');
      }
      return null;
    },
  },
  {
    key: 'dusk', name: 'Dusk', rarity: 'uncommon', cost: 5, emoji: '🌇',
    desc: () => '<b>Retrigger</b> all played cards in the <b>final hand</b> of the round',
    retriggerScored: (ctx) => (ctx.engine.handsLeft === 0 ? 1 : 0),
  },
  {
    key: 'fortune_teller', name: 'Fortune Teller', rarity: 'uncommon', cost: 6, emoji: '🔮',
    desc: (j, e) => `<b>+1 Mult</b> per Tarot card used this run <span class="muted">(currently +${e ? e.stats.tarotsUsed : 0})</span>`,
    indep: (ctx) => ({ mult: ctx.engine.stats.tarotsUsed }),
  },
  {
    key: 'steel_joker', name: 'Steel Joker', rarity: 'uncommon', cost: 7, emoji: '⚙',
    desc: (j, e) => `<b>X0.2 Mult</b> for each <b>Steel Card</b> in your full deck <span class="muted">(currently X${e ? (1 + 0.2 * e.countEnhancement('steel')).toFixed(1) : '1.0'})</span>`,
    indep: (ctx) => {
      const n = ctx.engine.countEnhancement('steel');
      return n ? { xmult: 1 + 0.2 * n } : null;
    },
  },
  {
    key: 'hack', name: 'Hack', rarity: 'uncommon', cost: 6, emoji: '💻',
    desc: () => '<b>Retrigger</b> each played <b>2</b>, <b>3</b>, <b>4</b> or <b>5</b>',
    retriggerScored: (ctx, card) => (card.rank >= 2 && card.rank <= 5 && card.enhancement !== 'stone' ? 1 : 0),
  },
  {
    key: 'pareidolia', name: 'Pareidolia', rarity: 'uncommon', cost: 5, emoji: '👀',
    desc: () => 'All cards are considered <b>face cards</b>',
  },
  {
    key: 'space', name: 'Space Joker', rarity: 'uncommon', cost: 5, emoji: '🚀',
    desc: () => '<b>1 in 4</b> chance to upgrade the level of the played poker hand',
    onHandPlayed: (e, j, ctx) => {
      if (e.chance(1, 4)) e.levelUpHand(ctx.handKey, 1, 'Space Joker');
    },
  },
  {
    key: 'burglar', name: 'Burglar', rarity: 'uncommon', cost: 6, emoji: '🥷',
    desc: () => 'When <b>Blind</b> is selected, gain <b>+3 Hands</b> and lose all <b>discards</b>',
    onBlindSelected: (e) => { e.handsLeft += 3; e.discardsLeft = 0; },
  },
  {
    key: 'blackboard', name: 'Blackboard', rarity: 'uncommon', cost: 6, emoji: '🖤',
    desc: () => '<b>X3 Mult</b> if all cards held in hand are <b>Spades</b> or <b>Clubs</b>',
    indep: (ctx) => {
      const dark = ctx.held.every((c) => c.enhancement === 'wild' || c.suit === 'S' || c.suit === 'C' || c.enhancement === 'stone');
      return dark ? { xmult: 3 } : null;
    },
  },
  {
    key: 'sixth_sense', name: 'Sixth Sense', rarity: 'uncommon', cost: 6, emoji: '👁',
    desc: () => 'If the <b>first hand</b> of a round is a single <b>6</b>, destroy it and create a <b>Spectral</b> card',
    onHandPlayed: (e, j, ctx) => {
      if (e.handsPlayedThisRound === 1 && ctx.played.length === 1 && ctx.played[0].rank === 6) {
        e.destroyCard(ctx.played[0], 'Sixth Sense');
        e.createConsumable('spectral', 'Sixth Sense');
      }
    },
  },
  {
    key: 'constellation', name: 'Constellation', rarity: 'uncommon', cost: 6, emoji: '⭐',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.1 Mult</b> every time a <b>Planet</b> card is used <span class="muted">(currently X${j.state.x.toFixed(1)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onPlanetUsed: (e, j) => { j.state.x = +(j.state.x + 0.1).toFixed(2); },
  },
  {
    key: 'hiker', name: 'Hiker', rarity: 'uncommon', cost: 5, emoji: '🥾',
    desc: () => 'Every played card permanently gains <b>+5 Chips</b> when scored',
    scored: (ctx, card) => { card.bonusChips = (card.bonusChips || 0) + 5; return null; },
  },
  {
    key: 'card_sharp', name: 'Card Sharp', rarity: 'uncommon', cost: 6, emoji: '🎴',
    desc: () => '<b>X3 Mult</b> if the played poker hand has already been played this round',
    indep: (ctx) => (ctx.engine.handsThisRound.includes(ctx.handKey) ? { xmult: 3 } : null),
  },
  {
    key: 'madness', name: 'Madness', rarity: 'uncommon', cost: 7, emoji: '🌪',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `When <b>Small</b> or <b>Big Blind</b> is selected, gain <b>X0.5 Mult</b> and destroy a random Joker <span class="muted">(currently X${j.state.x.toFixed(1)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onBlindSelected: (e, j) => {
      if (e.blind.type === 'boss') return;
      j.state.x = +(j.state.x + 0.5).toFixed(2);
      const others = e.jokers.filter((x) => x !== j);
      if (others.length) e.destroyJoker(e.rng.pick(others), 'Madness!');
    },
  },
  {
    key: 'seance', name: 'Séance', rarity: 'uncommon', cost: 6, emoji: '🕯',
    desc: () => 'If the poker hand is a <b>Straight Flush</b>, create a random <b>Spectral</b> card',
    onHandPlayed: (e, j, ctx) => {
      if (ctx.handKey === 'straight_flush') e.createConsumable('spectral', 'Séance');
    },
  },
  {
    key: 'vampire', name: 'Vampire', rarity: 'uncommon', cost: 7, emoji: '🧛',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.1 Mult</b> per scoring <b>Enhanced</b> card played, removes the card's Enhancement <span class="muted">(currently X${j.state.x.toFixed(1)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    scored: (ctx, card, j) => {
      if (card.enhancement) {
        card.enhancement = null;
        j.state.x = +(j.state.x + 0.1).toFixed(2);
      }
      return null;
    },
  },
  {
    key: 'hologram', name: 'Hologram', rarity: 'uncommon', cost: 7, emoji: '📀',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.25 Mult</b> every time a playing card is added to your deck <span class="muted">(currently X${j.state.x.toFixed(2)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onCardAdded: (e, j) => { j.state.x = +(j.state.x + 0.25).toFixed(2); },
  },
  {
    key: 'vagabond', name: 'Vagabond', rarity: 'rare', cost: 8, emoji: '🎒',
    desc: () => 'Create a <b>Tarot</b> card if a hand is played with <b>$4 or less</b>',
    onHandPlayed: (e, j) => { if (e.money <= 4) e.createConsumable('tarot', 'Vagabond'); },
  },
  {
    key: 'baron', name: 'Baron', rarity: 'rare', cost: 8, emoji: '👑',
    desc: () => 'Each <b>King</b> held in hand gives <b>X1.5 Mult</b>',
    held: (ctx, card) => (card.rank === 13 && card.enhancement !== 'stone' ? { xmult: 1.5 } : null),
  },
  {
    key: 'cloud_9', name: 'Cloud 9', rarity: 'uncommon', cost: 7, emoji: '☁',
    desc: (j, e) => `Earn <b>$1</b> for each <b>9</b> in your full deck at end of round <span class="muted">(currently $${e ? e.countRank(9) : 0})</span>`,
    onRoundEnd: (e) => { const n = e.countRank(9); if (n) e.addMoney(n, 'Cloud 9'); },
  },
  {
    key: 'rocket', name: 'Rocket', rarity: 'uncommon', cost: 6, emoji: '🚀',
    init: (j) => { j.state.money = 1; },
    desc: (j) => `Earn <b>$${j.state.money}</b> at end of round. Payout increases by <b>$2</b> when a Boss Blind is defeated`,
    onRoundEnd: (e, j) => { e.addMoney(j.state.money, 'Rocket'); },
    onBossDefeated: (e, j) => { j.state.money += 2; },
  },
  {
    key: 'midas_mask', name: 'Midas Mask', rarity: 'uncommon', cost: 7, emoji: '🎭',
    desc: () => 'All played <b>face cards</b> become <b>Gold</b> cards when scored',
    scored: (ctx, card) => { if (ctx.engine.isFace(card)) card.enhancement = 'gold'; return null; },
  },
  {
    key: 'luchador', name: 'Luchador', rarity: 'uncommon', cost: 5, emoji: '🤼',
    desc: () => '<b>Sell</b> this card to disable the current Boss Blind',
    onSell: (e) => { e.disableBoss('Luchador'); },
  },
  {
    key: 'gift_card', name: 'Gift Card', rarity: 'uncommon', cost: 6, emoji: '🎁',
    desc: () => 'Add <b>$1</b> of sell value to every Joker at end of round',
    onRoundEnd: (e) => { for (const k of e.jokers) k.extraValue = (k.extraValue || 0) + 1; },
  },
  {
    key: 'turtle_bean', name: 'Turtle Bean', rarity: 'uncommon', cost: 6, emoji: '🫘',
    init: (j) => { j.state.size = 5; },
    desc: (j) => `<b>+${j.state.size}</b> hand size, reduces by <b>1</b> every round`,
    handSizeOf: (j) => j.state.size,
    onRoundEnd: (e, j) => {
      j.state.size -= 1;
      if (j.state.size <= 0) e.destroyJoker(j, 'Spoiled!');
    },
  },
  {
    key: 'erosion', name: 'Erosion', rarity: 'uncommon', cost: 6, emoji: '⛏',
    desc: (j, e) => `<b>+4 Mult</b> for each card below <b>${e ? e.startingDeckSize : 52}</b> in your full deck <span class="muted">(currently +${e ? Math.max(0, e.startingDeckSize - e.fullDeck.length) * 4 : 0})</span>`,
    indep: (ctx) => {
      const missing = Math.max(0, ctx.engine.startingDeckSize - ctx.engine.fullDeck.length);
      return missing ? { mult: 4 * missing } : null;
    },
  },
  {
    key: 'to_the_moon', name: 'To the Moon', rarity: 'uncommon', cost: 5, emoji: '🌕',
    desc: () => 'Earn an extra <b>$1</b> of interest for every <b>$5</b> you have at the end of round',
  },
  {
    key: 'stone_joker', name: 'Stone Joker', rarity: 'uncommon', cost: 6, emoji: '🗿',
    desc: (j, e) => `<b>+25 Chips</b> for each <b>Stone Card</b> in your full deck <span class="muted">(currently +${e ? e.countEnhancement('stone') * 25 : 0})</span>`,
    indep: (ctx) => ({ chips: 25 * ctx.engine.countEnhancement('stone') }),
  },
  {
    key: 'lucky_cat', name: 'Lucky Cat', rarity: 'uncommon', cost: 6, emoji: '🐱',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.25 Mult</b> every time a <b>Lucky</b> card successfully triggers <span class="muted">(currently X${j.state.x.toFixed(2)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onLucky: (e, j) => { j.state.x = +(j.state.x + 0.25).toFixed(2); },
  },
  {
    key: 'baseball', name: 'Baseball Card', rarity: 'rare', cost: 8, emoji: '⚾',
    desc: () => '<b>Uncommon</b> Jokers each give <b>X1.5 Mult</b>',
    indep: (ctx) => {
      const n = ctx.engine.jokers.filter((k) => JOKERS[k.key].rarity === 'uncommon').length;
      return n ? { xmult: Math.pow(1.5, n) } : null;
    },
  },
  {
    key: 'bull', name: 'Bull', rarity: 'uncommon', cost: 6, emoji: '🐃',
    desc: (j, e) => `<b>+2 Chips</b> for each <b>$1</b> you have <span class="muted">(currently +${e ? Math.max(0, e.money) * 2 : 0})</span>`,
    indep: (ctx) => ({ chips: 2 * Math.max(0, ctx.engine.money) }),
  },
  {
    key: 'diet_cola', name: 'Diet Cola', rarity: 'uncommon', cost: 6, emoji: '🥤',
    desc: () => '<b>Sell</b> this card to create a free <b>Double Tag</b>',
    onSell: (e) => { e.gainTag('double', 'Diet Cola'); },
  },
  {
    key: 'trading_card', name: 'Trading Card', rarity: 'uncommon', cost: 6, emoji: '🔁',
    desc: () => 'If the <b>first discard</b> of a round has only <b>1</b> card, destroy it and earn <b>$3</b>',
    onDiscard: (e, j, cards) => {
      if (e.discardsUsedThisRound === 1 && cards.length === 1) {
        e.destroyCard(cards[0], 'Trading Card');
        e.addMoney(3, 'Trading Card');
      }
    },
  },
  {
    key: 'flash_card', name: 'Flash Card', rarity: 'uncommon', cost: 5, emoji: '⚡',
    init: (j) => { j.state.mult = 0; },
    desc: (j) => `Gains <b>+2 Mult</b> per <b>reroll</b> in the shop <span class="muted">(currently +${j.state.mult})</span>`,
    indep: (ctx, j) => (j.state.mult ? { mult: j.state.mult } : null),
    onReroll: (e, j) => { j.state.mult += 2; },
  },
  {
    key: 'spare_trousers', name: 'Spare Trousers', rarity: 'uncommon', cost: 6, emoji: '👖',
    init: (j) => { j.state.mult = 0; },
    desc: (j) => `Gains <b>+2 Mult</b> if the played hand contains a <b>Two Pair</b> <span class="muted">(currently +${j.state.mult})</span>`,
    indep: (ctx, j) => (j.state.mult ? { mult: j.state.mult } : null),
    onHandPlayed: (e, j, ctx) => { if (ctx.contains.twoPair) j.state.mult += 2; },
  },
  {
    key: 'ramen', name: 'Ramen', rarity: 'uncommon', cost: 6, emoji: '🍜',
    init: (j) => { j.state.x = 2; },
    desc: (j) => `<b>X${j.state.x.toFixed(2)} Mult</b>, loses <b>X0.01 Mult</b> per discarded card`,
    indep: (ctx, j) => ({ xmult: j.state.x }),
    onDiscard: (e, j, cards) => {
      j.state.x = +(j.state.x - 0.01 * cards.length).toFixed(2);
      if (j.state.x <= 1) e.destroyJoker(j, 'Slurped!');
    },
  },
  {
    key: 'seltzer', name: 'Seltzer', rarity: 'uncommon', cost: 6, emoji: '🧋',
    init: (j) => { j.state.left = 10; },
    desc: (j) => `<b>Retrigger</b> all cards played for the next <b>${j.state.left}</b> hands`,
    retriggerScored: (ctx, card, j) => (j.state.left > 0 ? 1 : 0),
    onHandPlayed: (e, j) => {
      j.state.left -= 1;
      if (j.state.left <= 0) e.destroyJoker(j, 'Fizzled out!');
    },
  },
  {
    key: 'castle', name: 'Castle', rarity: 'uncommon', cost: 6, emoji: '🏰',
    init: (j, e) => { j.state.chips = 0; j.state.suit = e.rng.pick(['S', 'H', 'D', 'C']); },
    desc: (j) => `Gains <b>+3 Chips</b> per discarded <b>${SUITS[j.state.suit].name}</b> card, suit changes every round <span class="muted">(currently +${j.state.chips})</span>`,
    indep: (ctx, j) => (j.state.chips ? { chips: j.state.chips } : null),
    onDiscard: (e, j, cards) => {
      j.state.chips += 3 * cards.filter((c) => c.suit === j.state.suit && c.enhancement !== 'stone').length;
    },
    onRoundEnd: (e, j) => { j.state.suit = e.rng.pick(['S', 'H', 'D', 'C']); },
  },
  {
    key: 'mr_bones', name: 'Mr. Bones', rarity: 'uncommon', cost: 5, emoji: '💀',
    desc: () => 'Prevents <b>Death</b> if chips scored are at least <b>25%</b> of required chips. Self destructs',
  },
  {
    key: 'acrobat', name: 'Acrobat', rarity: 'uncommon', cost: 6, emoji: '🤸',
    desc: () => '<b>X3 Mult</b> on the <b>final hand</b> of the round',
    indep: (ctx) => (ctx.engine.handsLeft === 0 ? { xmult: 3 } : null),
  },
  {
    key: 'sock_and_buskin', name: 'Sock and Buskin', rarity: 'uncommon', cost: 6, emoji: '🎭',
    desc: () => '<b>Retrigger</b> all played <b>face cards</b>',
    retriggerScored: (ctx, card) => (ctx.engine.isFace(card) ? 1 : 0),
  },
  {
    key: 'certificate', name: 'Certificate', rarity: 'uncommon', cost: 6, emoji: '📜',
    desc: () => 'When the round begins, add a random playing card with a random <b>seal</b> to your hand',
    onRoundStart: (e) => { e.addSealedCardToHand(); },
  },
  {
    key: 'smeared_joker', name: 'Smeared Joker', rarity: 'uncommon', cost: 7, emoji: '🩸',
    desc: () => '<b>Hearts</b> and <b>Diamonds</b> count as the same suit, as do <b>Spades</b> and <b>Clubs</b>',
  },
  {
    key: 'throwback', name: 'Throwback', rarity: 'uncommon', cost: 6, emoji: '↩',
    desc: (j, e) => `<b>X0.25 Mult</b> for each Blind skipped this run <span class="muted">(currently X${e ? (1 + 0.25 * e.stats.skips).toFixed(2) : '1.00'})</span>`,
    indep: (ctx) => {
      const n = ctx.engine.stats.skips;
      return n ? { xmult: 1 + 0.25 * n } : null;
    },
  },
  {
    key: 'rough_gem', name: 'Rough Gem', rarity: 'uncommon', cost: 7, emoji: '💠',
    desc: () => 'Played cards with <b>Diamond</b> suit earn <b>$1</b> when scored',
    scored: (ctx, card) => (ctx.engine.cardHasSuit(card, 'D') ? { money: 1 } : null),
  },
  {
    key: 'bloodstone', name: 'Bloodstone', rarity: 'uncommon', cost: 7, emoji: '🩸',
    desc: () => '<b>1 in 2</b> chance for played cards with <b>Heart</b> suit to give <b>X1.5 Mult</b> when scored',
    scored: (ctx, card) => (ctx.engine.cardHasSuit(card, 'H') && ctx.engine.chance(1, 2) ? { xmult: 1.5 } : null),
  },
  {
    key: 'arrowhead', name: 'Arrowhead', rarity: 'uncommon', cost: 7, emoji: '🏹',
    desc: () => 'Played cards with <b>Spade</b> suit give <b>+50 Chips</b> when scored',
    scored: (ctx, card) => (ctx.engine.cardHasSuit(card, 'S') ? { chips: 50 } : null),
  },
  {
    key: 'onyx_agate', name: 'Onyx Agate', rarity: 'uncommon', cost: 7, emoji: '⚫',
    desc: () => 'Played cards with <b>Club</b> suit give <b>+7 Mult</b> when scored',
    scored: (ctx, card) => (ctx.engine.cardHasSuit(card, 'C') ? { mult: 7 } : null),
  },
  {
    key: 'glass_joker', name: 'Glass Joker', rarity: 'uncommon', cost: 6, emoji: '🪟',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.75 Mult</b> for every <b>Glass</b> card that is destroyed <span class="muted">(currently X${j.state.x.toFixed(2)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onGlassBroken: (e, j) => { j.state.x = +(j.state.x + 0.75).toFixed(2); },
  },
  {
    key: 'showman', name: 'Showman', rarity: 'uncommon', cost: 5, emoji: '🎩',
    desc: () => 'Joker, Tarot, Planet and Spectral cards may appear <b>multiple times</b>',
  },
  {
    key: 'flower_pot', name: 'Flower Pot', rarity: 'uncommon', cost: 6, emoji: '🪴',
    desc: () => '<b>X3 Mult</b> if the poker hand contains a <b>Diamond</b>, <b>Club</b>, <b>Heart</b> and <b>Spade</b> card',
    indep: (ctx) => {
      const need = ['S', 'H', 'D', 'C'];
      const used = new Set();
      // Wild cards fill whichever suit is still missing.
      const wilds = ctx.scoring.filter((c) => c.enhancement === 'wild').length;
      for (const suit of need) {
        if (ctx.scoring.some((c) => c.enhancement !== 'wild' && c.suit === suit && c.enhancement !== 'stone')) used.add(suit);
      }
      return used.size + wilds >= 4 ? { xmult: 3 } : null;
    },
  },
  {
    key: 'oops_all_6s', name: 'Oops! All 6s', rarity: 'uncommon', cost: 4, emoji: '6️⃣',
    desc: () => '<b>Doubles</b> all listed probabilities',
  },
  {
    key: 'the_idol', name: 'The Idol', rarity: 'uncommon', cost: 6, emoji: '🗿',
    init: (j, e) => { j.state.rank = e.rng.range(2, 14); j.state.suit = e.rng.pick(['S', 'H', 'D', 'C']); },
    desc: (j) => `Each played <b>${rankLabel(j.state.rank)}${SUITS[j.state.suit].symbol}</b> gives <b>X2 Mult</b> when scored. Changes every round`,
    scored: (ctx, card, j) =>
      (card.rank === j.state.rank && ctx.engine.cardHasSuit(card, j.state.suit) ? { xmult: 2 } : null),
    onRoundEnd: (e, j) => { j.state.rank = e.rng.range(2, 14); j.state.suit = e.rng.pick(['S', 'H', 'D', 'C']); },
  },
  {
    key: 'seeing_double', name: 'Seeing Double', rarity: 'uncommon', cost: 6, emoji: '👓',
    desc: () => '<b>X2 Mult</b> if the played hand has a scoring <b>Club</b> card and a scoring card of any other suit',
    indep: (ctx) => {
      const clubs = ctx.scoring.filter((c) => ctx.engine.cardHasSuit(c, 'C'));
      const others = ctx.scoring.filter((c) => c.enhancement !== 'stone' && ['S', 'H', 'D'].some((s) => ctx.engine.cardHasSuit(c, s)));
      if (!clubs.length || !others.length) return null;
      if (clubs.length === 1 && others.length === 1 && clubs[0] === others[0]) return null;
      return { xmult: 2 };
    },
  },
  {
    key: 'matador', name: 'Matador', rarity: 'uncommon', cost: 7, emoji: '🐂',
    desc: () => 'Earn <b>$8</b> if the played hand triggers the <b>Boss Blind</b> ability',
    onHandPlayed: (e) => { if (e.bossTriggeredThisHand) e.addMoney(8, 'Matador'); },
  },
  {
    key: 'hit_the_road', name: 'Hit the Road', rarity: 'rare', cost: 8, emoji: '🛣',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.5 Mult</b> for every <b>Jack</b> discarded this round <span class="muted">(currently X${j.state.x.toFixed(1)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onDiscard: (e, j, cards) => {
      const jacks = cards.filter((c) => c.rank === 11 && c.enhancement !== 'stone').length;
      j.state.x = +(j.state.x + 0.5 * jacks).toFixed(2);
    },
    onRoundStart: (e, j) => { j.state.x = 1; },
  },
  {
    key: 'duo', name: 'The Duo', rarity: 'rare', cost: 8, emoji: '2️⃣',
    desc: () => '<b>X2 Mult</b> if the played hand contains a <b>Pair</b>',
    indep: (ctx) => (ctx.contains.pair ? { xmult: 2 } : null),
  },
  {
    key: 'trio', name: 'The Trio', rarity: 'rare', cost: 8, emoji: '3️⃣',
    desc: () => '<b>X3 Mult</b> if the played hand contains a <b>Three of a Kind</b>',
    indep: (ctx) => (ctx.contains.three ? { xmult: 3 } : null),
  },
  {
    key: 'family', name: 'The Family', rarity: 'rare', cost: 8, emoji: '4️⃣',
    desc: () => '<b>X4 Mult</b> if the played hand contains a <b>Four of a Kind</b>',
    indep: (ctx) => (ctx.contains.four ? { xmult: 4 } : null),
  },
  {
    key: 'order', name: 'The Order', rarity: 'rare', cost: 8, emoji: '🔢',
    desc: () => '<b>X3 Mult</b> if the played hand contains a <b>Straight</b>',
    indep: (ctx) => (ctx.contains.straight ? { xmult: 3 } : null),
  },
  {
    key: 'tribe', name: 'The Tribe', rarity: 'rare', cost: 8, emoji: '🎏',
    desc: () => '<b>X2 Mult</b> if the played hand contains a <b>Flush</b>',
    indep: (ctx) => (ctx.contains.flush ? { xmult: 2 } : null),
  },

  // -- Rare ---------------------------------------------------------------
  {
    key: 'dna', name: 'DNA', rarity: 'rare', cost: 8, emoji: '🧬',
    desc: () => 'If the <b>first hand</b> of a round has only <b>1</b> card, add a permanent copy to your deck and draw it to hand',
    onHandPlayed: (e, j, ctx) => {
      if (e.handsPlayedThisRound === 1 && ctx.played.length === 1) e.duplicateCardToHand(ctx.played[0], 'DNA');
    },
  },
  {
    key: 'blueprint', name: 'Blueprint', rarity: 'rare', cost: 10, emoji: '📐',
    desc: () => 'Copies the ability of the Joker to the <b>right</b>',
    copies: (e, j) => e.jokers[e.jokers.indexOf(j) + 1] || null,
  },
  {
    key: 'brainstorm', name: 'Brainstorm', rarity: 'rare', cost: 10, emoji: '🧠',
    desc: () => 'Copies the ability of the <b>leftmost</b> Joker',
    copies: (e, j) => (e.jokers[0] && e.jokers[0] !== j ? e.jokers[0] : null),
  },
  {
    key: 'invisible_joker', name: 'Invisible Joker', rarity: 'rare', cost: 8, emoji: '👻',
    init: (j) => { j.state.rounds = 0; },
    desc: (j) => `After <b>${Math.max(0, 2 - j.state.rounds)}</b> more rounds, sell this card to <b>duplicate</b> a random Joker`,
    onRoundEnd: (e, j) => { j.state.rounds += 1; },
    onSell: (e, j) => {
      if (j.state.rounds >= 2) {
        const others = e.jokers.filter((x) => x !== j);
        if (others.length) e.duplicateJoker(e.rng.pick(others));
      }
    },
  },
  {
    key: 'drivers_license', name: "Driver's License", rarity: 'rare', cost: 7, emoji: '🚗',
    desc: (j, e) => `<b>X3 Mult</b> if you have at least <b>16</b> Enhanced cards in your full deck <span class="muted">(currently ${e ? e.countEnhanced() : 0})</span>`,
    indep: (ctx) => (ctx.engine.countEnhanced() >= 16 ? { xmult: 3 } : null),
  },
  {
    key: 'cartomancer', name: 'Cartomancer', rarity: 'rare', cost: 6, emoji: '🎴',
    desc: () => 'Create a <b>Tarot</b> card when a Blind is selected',
    onBlindSelected: (e) => { e.createConsumable('tarot', 'Cartomancer'); },
  },
  {
    key: 'astronomer', name: 'Astronomer', rarity: 'rare', cost: 8, emoji: '🔭',
    desc: () => 'All <b>Planet</b> cards and <b>Celestial Packs</b> in the shop are <b>free</b>',
  },
  {
    key: 'burnt_joker', name: 'Burnt Joker', rarity: 'rare', cost: 8, emoji: '🔥',
    desc: () => 'Upgrade the level of the <b>first discarded</b> poker hand each round',
    onDiscard: (e, j, cards) => {
      if (e.discardsUsedThisRound === 1 && cards.length) {
        e.levelUpHand(e.evaluate(cards).key, 1, 'Burnt Joker');
      }
    },
  },
  {
    key: 'bootstraps', name: 'Bootstraps', rarity: 'uncommon', cost: 7, emoji: '🥾',
    desc: (j, e) => `<b>+2 Mult</b> for every <b>$5</b> you have <span class="muted">(currently +${e ? Math.floor(Math.max(0, e.money) / 5) * 2 : 0})</span>`,
    indep: (ctx) => ({ mult: 2 * Math.floor(Math.max(0, ctx.engine.money) / 5) }),
  },
  {
    key: 'satellite', name: 'Satellite', rarity: 'uncommon', cost: 6, emoji: '🛰',
    desc: (j, e) => `Earn <b>$1</b> at end of round per unique <b>Planet</b> card used this run <span class="muted">(currently $${e ? e.stats.uniquePlanets.length : 0})</span>`,
    onRoundEnd: (e) => { const n = e.stats.uniquePlanets.length; if (n) e.addMoney(n, 'Satellite'); },
  },
  {
    key: 'obelisk', name: 'Obelisk', rarity: 'rare', cost: 8, emoji: '🗼',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X0.2 Mult</b> per consecutive hand played without playing your most played poker hand <span class="muted">(currently X${j.state.x.toFixed(1)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onHandPlayed: (e, j, ctx) => {
      if (ctx.handKey === e.mostPlayedHand()) j.state.x = 1;
      else j.state.x = +(j.state.x + 0.2).toFixed(2);
    },
  },
  {
    key: 'wee_joker', name: 'Wee Joker', rarity: 'rare', cost: 8, emoji: '🐜',
    init: (j) => { j.state.chips = 0; },
    desc: (j) => `Gains <b>+8 Chips</b> when each played <b>2</b> is scored <span class="muted">(currently +${j.state.chips})</span>`,
    indep: (ctx, j) => (j.state.chips ? { chips: j.state.chips } : null),
    scored: (ctx, card, j) => { if (card.rank === 2 && card.enhancement !== 'stone') j.state.chips += 8; return null; },
  },
  {
    key: 'the_duo_x', name: 'Sixth Gear', rarity: 'rare', cost: 8, emoji: '⚙',
    desc: () => '<b>X1.5 Mult</b> for each <b>Rare</b> Joker you own',
    indep: (ctx) => {
      const n = ctx.engine.jokers.filter((k) => JOKERS[k.key].rarity === 'rare').length;
      return n ? { xmult: Math.pow(1.5, n) } : null;
    },
  },

  // -- Legendary ----------------------------------------------------------
  {
    key: 'canio', name: 'Canio', rarity: 'legendary', cost: 20, emoji: '🎭',
    init: (j) => { j.state.x = 1; },
    desc: (j) => `Gains <b>X1 Mult</b> when a <b>face card</b> is destroyed <span class="muted">(currently X${j.state.x.toFixed(1)})</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onCardDestroyed: (e, j, card) => { if (e.isFace(card)) j.state.x += 1; },
  },
  {
    key: 'triboulet', name: 'Triboulet', rarity: 'legendary', cost: 20, emoji: '👑',
    desc: () => 'Played <b>Kings</b> and <b>Queens</b> each give <b>X2 Mult</b> when scored',
    scored: (ctx, card) => ((card.rank === 12 || card.rank === 13) && card.enhancement !== 'stone' ? { xmult: 2 } : null),
  },
  {
    key: 'yorick', name: 'Yorick', rarity: 'legendary', cost: 20, emoji: '💀',
    init: (j) => { j.state.x = 1; j.state.left = 23; },
    desc: (j) => `Gains <b>X1 Mult</b> every <b>23</b> cards discarded <span class="muted">(X${j.state.x.toFixed(1)}, ${j.state.left} remaining)</span>`,
    indep: (ctx, j) => (j.state.x > 1 ? { xmult: j.state.x } : null),
    onDiscard: (e, j, cards) => {
      j.state.left -= cards.length;
      while (j.state.left <= 0) { j.state.x += 1; j.state.left += 23; }
    },
  },
  {
    key: 'chicot', name: 'Chicot', rarity: 'legendary', cost: 20, emoji: '🃏',
    desc: () => 'Disables the effect of every <b>Boss Blind</b>',
    onBlindSelected: (e) => { if (e.blind.type === 'boss') e.disableBoss('Chicot'); },
  },
  {
    key: 'perkeo', name: 'Perkeo', rarity: 'legendary', cost: 20, emoji: '🍷',
    desc: () => 'Creates a <b>Negative</b> copy of one random consumable card in your possession at the end of the shop',
    onShopExit: (e) => {
      if (e.consumables.length) {
        const pick = e.rng.pick(e.consumables);
        e.addConsumable({ ...pick, uid: e.nextUid(), negative: true }, true);
      }
    },
  },
];

export const JOKERS = Object.fromEntries(LIST.map((j) => [j.key, j]));
export const JOKER_KEYS = LIST.map((j) => j.key);

export const BUYABLE_JOKER_KEYS = JOKER_KEYS.filter((k) => JOKERS[k].rarity !== 'legendary');

export function jokersByRarity(rarity) {
  return JOKER_KEYS.filter((k) => JOKERS[k].rarity === rarity);
}

export function jokerDesc(joker, engine) {
  const def = JOKERS[joker.key];
  if (!def) return '';
  return typeof def.desc === 'function' ? def.desc(joker, engine) : def.desc || '';
}
