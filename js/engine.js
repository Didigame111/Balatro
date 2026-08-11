// Run engine: state, scoring pipeline, blinds, shop and progression.

import { RNG, randomSeed } from './rng.js';
import {
  makeCard, cloneCard, standardDeck, cardChips, isFaceCard, hasSuit,
  SUIT_KEYS, RANKS, resetCardSerial, cardSerialValue,
} from './cards.js';
import { evaluateHand, HAND_NAMES, HAND_ORDER } from './poker.js';
import {
  HAND_BASE, handValues, anteBase, BLIND_TYPES, BOSSES, REGULAR_BOSS_KEYS, FINISHER_KEYS,
  VOUCHERS, TAGS, TAG_KEYS, PACKS, PACK_BY_KEY, DECKS, BASE_CONFIG,
} from './data.js';
import { JOKERS, jokersByRarity } from './jokers.js';
import { CONSUMABLES, COMMON_SPECTRAL_KEYS, PLANET_BY_HAND, keysOfKind } from './consumables.js';

const ENHANCEMENT_POOL = ['bonus', 'mult', 'wild', 'glass', 'steel', 'stone', 'gold', 'lucky'];

export class Engine {
  constructor() {
    this.listeners = {};
    this.uidCounter = 1000;
  }

  // -- events --------------------------------------------------------------
  on(event, cb) {
    (this.listeners[event] = this.listeners[event] || []).push(cb);
    return this;
  }

  emit(event, payload) {
    for (const cb of this.listeners[event] || []) cb(payload);
    if (event !== '*') this.emit('*', { event, payload });
  }

  toast(text, kind = 'info') { this.emit('toast', { text, kind }); }
  nextUid() { return ++this.uidCounter; }

  // -- run setup -----------------------------------------------------------
  newRun({ seed = randomSeed(), deck = 'red' } = {}) {
    resetCardSerial(0);
    this.seed = seed;
    this.rng = new RNG(seed);
    this.deckKey = deck;
    const deckDef = DECKS[deck] || DECKS.red;

    this.ante = 1;
    this.round = 0;
    this.money = BASE_CONFIG.money + (deckDef.money || 0);
    this.handLevels = {};
    this.handPlays = {};
    for (const key of Object.keys(HAND_BASE)) { this.handLevels[key] = 1; this.handPlays[key] = 0; }
    this.discovered = new Set(['high_card', 'pair', 'two_pair', 'three_of_a_kind', 'straight', 'flush', 'full_house', 'four_of_a_kind', 'straight_flush']);

    this.fullDeck = this.buildDeck(deckDef);
    this.startingDeckSize = this.fullDeck.length;
    this.drawPile = [];
    this.hand = [];
    this.discardPile = [];
    this.playedPile = [];
    this.playedThisAnte = new Set();

    this.jokers = [];
    this.consumables = [];
    this.vouchers = new Set();
    this.tags = [];
    this.modifiers = { hands: 0, discards: 0, handSize: 0, jokerSlots: 0, consumableSlots: 0 };
    this.flags = {};
    this.pending = {};              // one-shot shop / round modifiers from tags
    this.stats = {
      tarotsUsed: 0, planetsUsed: 0, uniquePlanets: [], skips: 0,
      handsPlayed: 0, discardsUsed: 0, cardsDiscarded: 0, bestHand: 0, rerolls: 0,
      unusedDiscards: 0,
    };
    this.lastConsumableUsed = null;
    this.bossRerollsThisAnte = 0;

    this.applyDeckStart(deckDef);

    this.gameState = 'blind_select';
    this.blind = null;
    this.rollAnteBosses();
    this.emit('run_started');
    this.emit('state');
  }

  buildDeck(deckDef) {
    let cards;
    if (deckDef.key === 'abandoned') {
      cards = [];
      for (const suit of SUIT_KEYS) for (const rank of RANKS) if (rank < 11) cards.push(makeCard(rank, suit));
    } else if (deckDef.key === 'checkered') {
      cards = [];
      for (const suit of ['S', 'H']) for (const rank of RANKS) for (let i = 0; i < 2; i++) cards.push(makeCard(rank, suit));
    } else if (deckDef.key === 'erratic') {
      cards = [];
      for (let i = 0; i < 52; i++) cards.push(makeCard(this.rng.pick(RANKS), this.rng.pick(SUIT_KEYS)));
    } else {
      cards = standardDeck();
    }
    return cards;
  }

  applyDeckStart(deckDef) {
    switch (deckDef.key) {
      case 'magic':
        this.vouchers.add('crystal_ball');
        this.addConsumable(this.makeConsumable('fool'), true);
        this.addConsumable(this.makeConsumable('fool'), true);
        break;
      case 'nebula':
        this.vouchers.add('telescope');
        this.modifiers.consumableSlots -= 1;
        break;
      case 'ghost':
        this.addConsumable(this.makeConsumable('hex'), true);
        break;
      case 'zodiac':
        this.vouchers.add('tarot_merchant');
        this.vouchers.add('planet_merchant');
        this.vouchers.add('overstock');
        break;
      default:
        break;
    }
  }

  get deckDef() { return DECKS[this.deckKey] || DECKS.red; }

  // -- derived values ------------------------------------------------------
  hasVoucher(key) { return this.vouchers.has(key); }

  hasJoker(key) {
    return this.jokers.some((j) => j.key === key || this.copyTargetKey(j) === key);
  }

  copyTargetKey(j) {
    const def = JOKERS[j.key];
    if (!def || !def.copies) return null;
    const target = def.copies(this, j);
    return target ? target.key : null;
  }

  countJoker(key) {
    return this.jokers.filter((j) => j.key === key || this.copyTargetKey(j) === key).length;
  }

  get maxHands() {
    let n = BASE_CONFIG.hands + (this.deckDef.hands || 0) + this.modifiers.hands;
    if (this.hasVoucher('grabber')) n += 1;
    if (this.hasVoucher('nacho_tong')) n += 1;
    if (this.hasVoucher('hieroglyph')) n -= 1;
    for (const j of this.jokers) { const d = JOKERS[j.key]; if (d && d.hands) n += d.hands; }
    return Math.max(1, n);
  }

  get maxDiscards() {
    let n = BASE_CONFIG.discards + (this.deckDef.discards || 0) + this.modifiers.discards;
    if (this.hasVoucher('wasteful')) n += 1;
    if (this.hasVoucher('recyclomancy')) n += 1;
    if (this.hasVoucher('petroglyph')) n -= 1;
    for (const j of this.jokers) { const d = JOKERS[j.key]; if (d && d.discards) n += d.discards; }
    return Math.max(0, n);
  }

  get handSize() {
    let n = BASE_CONFIG.handSize + (this.deckDef.handSize || 0) + this.modifiers.handSize;
    if (this.hasVoucher('paint_brush')) n += 1;
    if (this.hasVoucher('palette')) n += 1;
    for (const j of this.jokers) {
      const d = JOKERS[j.key];
      if (!d) continue;
      if (d.handSize) n += d.handSize;
      if (d.handSizeOf) n += d.handSizeOf(j);
    }
    if (this.pending.juggle) n += 3;
    if (this.bossActive('manacle')) n -= 1;
    return Math.max(1, n);
  }

  get jokerSlots() {
    let n = BASE_CONFIG.jokerSlots + (this.deckDef.jokerSlots || 0) + this.modifiers.jokerSlots;
    if (this.hasVoucher('antimatter')) n += 1;
    n += this.jokers.filter((j) => j.edition === 'negative').length;
    return n;
  }

  get consumableSlots() {
    let n = BASE_CONFIG.consumableSlots + this.modifiers.consumableSlots;
    if (this.hasVoucher('crystal_ball')) n += 1;
    n += this.consumables.filter((c) => c.negative).length;
    return n;
  }

  get interestCap() {
    if (this.hasVoucher('money_tree')) return 20;
    if (this.hasVoucher('seed_money')) return 10;
    return BASE_CONFIG.interestCap;
  }

  get debtLimit() { return this.hasJoker('credit_card') ? 20 : 0; }

  hasJokerSpace() { return this.jokers.length < this.jokerSlots; }
  hasConsumableSpace() { return this.consumables.length < this.consumableSlots; }

  handName(key) { return HAND_NAMES[key] || key; }

  randomHandKey() {
    const pool = HAND_ORDER.filter((k) => this.discovered.has(k));
    return this.rng.pick(pool.length ? pool : ['pair']);
  }

  mostPlayedHand() {
    let best = null;
    let bestCount = -1;
    for (const key of HAND_ORDER) {
      const n = this.handPlays[key] || 0;
      if (n > bestCount) { bestCount = n; best = key; }
    }
    return best;
  }

  countEnhancement(enh) { return this.fullDeck.filter((c) => c.enhancement === enh).length; }
  countEnhanced() { return this.fullDeck.filter((c) => c.enhancement).length; }
  countRank(rank) { return this.fullDeck.filter((c) => c.rank === rank && c.enhancement !== 'stone').length; }

  sellValue(joker) {
    const def = JOKERS[joker.key];
    const base = def ? def.cost : 3;
    return Math.max(1, Math.floor(base / 2)) + (joker.extraValue || 0);
  }

  totalSellValue() { return this.jokers.reduce((sum, j) => sum + this.sellValue(j), 0); }
  otherSellValue(self) { return this.jokers.reduce((sum, j) => (j === self ? sum : sum + this.sellValue(j)), 0); }
  jokerName(j) { return JOKERS[j.key] ? JOKERS[j.key].name : j.key; }

  // -- probability & card helpers ------------------------------------------
  chance(numerator, denominator) {
    const oops = this.countJoker('oops_all_6s');
    const num = numerator * Math.pow(2, oops);
    return this.rng.chance(Math.min(num, denominator), denominator);
  }

  isFace(card) { return isFaceCard(card, this.hasJoker('pareidolia')); }

  cardHasSuit(card, suit) {
    if (card.debuffed) return false;
    return hasSuit(card, suit, this.hasJoker('smeared_joker'));
  }

  evaluate(cards) {
    return evaluateHand(cards, {
      fourFingers: this.hasJoker('four_fingers'),
      shortcut: this.hasJoker('shortcut'),
      smeared: this.hasJoker('smeared_joker'),
      splash: this.hasJoker('splash'),
    });
  }

  randomEnhancement() { return this.rng.pick(ENHANCEMENT_POOL); }

  // -- blinds --------------------------------------------------------------
  rollAnteBosses() {
    const finisher = this.ante % 8 === 0;
    const pool = finisher
      ? FINISHER_KEYS
      : REGULAR_BOSS_KEYS.filter((k) => (BOSSES[k].minAnte || 1) <= this.ante);
    this.bossKey = this.rng.pick(pool.length ? pool : REGULAR_BOSS_KEYS);
    this.bossRerollsThisAnte = 0;
  }

  blindOrder() { return ['small', 'big', 'boss']; }

  get currentBlindType() { return this.blindOrder()[this.round % 3]; }

  blindChips(type) {
    const base = anteBase(this.ante) * (this.deckKey === 'plasma' ? 2 : 1);
    let mult = BLIND_TYPES[type].mult;
    if (type === 'boss') {
      const boss = BOSSES[this.bossKey];
      if (boss && boss.chipMult) mult = boss.chipMult;
    }
    return Math.max(1, Math.round(base * mult));
  }

  blindInfo(type) {
    const boss = type === 'boss' ? BOSSES[this.bossKey] : null;
    return {
      type,
      name: boss ? boss.name : BLIND_TYPES[type].name,
      emoji: boss ? boss.emoji : type === 'small' ? '🔹' : '🔷',
      desc: boss ? boss.desc : type === 'small' ? 'No special effect' : 'No special effect',
      chips: this.blindChips(type),
      reward: BLIND_TYPES[type].reward,
      skippable: BLIND_TYPES[type].skippable,
      bossKey: boss ? boss.key : null,
    };
  }

  bossActive(key) {
    return this.blind && this.blind.type === 'boss' && this.bossKey === key && !this.blind.disabled;
  }

  get activeBoss() {
    if (!this.blind || this.blind.type !== 'boss' || this.blind.disabled) return null;
    return BOSSES[this.bossKey];
  }

  rerollBoss() {
    const cost = 10;
    if (!this.hasVoucher('directors_cut') && !this.hasVoucher('retcon')) return;
    if (!this.hasVoucher('retcon') && this.bossRerollsThisAnte >= 1) return;
    if (this.money < cost - this.debtLimit) { this.toast('Not enough money'); return; }
    this.addMoney(-cost, 'Boss reroll');
    this.bossRerollsThisAnte += 1;
    const pool = (this.ante % 8 === 0 ? FINISHER_KEYS : REGULAR_BOSS_KEYS.filter((k) => (BOSSES[k].minAnte || 1) <= this.ante))
      .filter((k) => k !== this.bossKey);
    if (pool.length) this.bossKey = this.rng.pick(pool);
    this.emit('state');
  }

  selectBlind() {
    const type = this.currentBlindType;
    const info = this.blindInfo(type);
    this.blind = { type, bossKey: info.bossKey, chips: info.chips, reward: info.reward, disabled: false };
    this.gameState = 'playing';
    this.score = 0;
    this.handsLeft = this.maxHands;
    this.discardsLeft = this.maxDiscards;
    this.handsPlayedThisRound = 0;
    this.discardsUsedThisRound = 0;
    this.handsThisRound = [];
    this.roundMoneyEarned = 0;
    this.bossTriggeredThisHand = false;
    this.disabledJoker = null;
    this.forcedCard = null;
    this.leafLocked = false;

    // Return every card to the draw pile and shuffle.
    this.drawPile = this.rng.shuffle(this.fullDeck.slice());
    this.hand = [];
    this.discardPile = [];
    this.playedPile = [];
    for (const card of this.fullDeck) { card.debuffed = false; card.faceDown = false; }

    // Joker "blind selected" hooks fire before the first draw.
    this.forEachJoker('onBlindSelected');

    // Boss set-up.
    if (this.blind.type === 'boss' && !this.blind.disabled) {
      const boss = BOSSES[this.bossKey];
      if (boss.key === 'water') this.discardsLeft = 0;
      if (boss.key === 'needle') this.handsLeft = 1;
      if (boss.key === 'acorn') {
        this.rng.shuffle(this.jokers);
        for (const j of this.jokers) j.flipped = true;
      }
      if (boss.key === 'leaf') this.leafLocked = true;
      if (boss.key === 'heart') this.rerollDisabledJoker();
    }

    this.forEachJoker('onRoundStart');
    this.applyCardDebuffs();
    this.drawCards(this.handSize, this.bossActive('house'));
    this.emit('blind_started', this.blind);
    this.emit('state');
  }

  skipBlind() {
    const type = this.currentBlindType;
    if (!BLIND_TYPES[type].skippable) return;
    const tagKey = this.rollTag();
    this.stats.skips += 1;
    this.round += 1;
    this.gainTag(tagKey, 'Skipped Blind');
    this.forEachJoker('onSkip');
    this.emit('blind_skipped', { type, tag: tagKey });
    this.emit('state');
  }

  rollTag() {
    const pool = TAG_KEYS.filter((k) => {
      if (k === 'boss' && this.currentBlindType === 'boss') return false;
      return true;
    });
    return this.rng.pick(pool);
  }

  gainTag(tagKey, source) {
    // Double Tag duplicates the *next* tag gained.
    let copies = 1;
    if (tagKey !== 'double' && this.pending.doubleTags > 0) {
      copies += this.pending.doubleTags;
      this.pending.doubleTags = 0;
    }
    for (let i = 0; i < copies; i++) this.applyTag(tagKey, source);
    this.emit('state');
  }

  applyTag(tagKey, source) {
    const tag = TAGS[tagKey];
    this.emit('tag_gained', { tag, source });
    switch (tagKey) {
      case 'double': this.pending.doubleTags = (this.pending.doubleTags || 0) + 1; break;
      case 'investment': this.pending.investment = (this.pending.investment || 0) + 1; break;
      case 'juggle': this.pending.juggle = true; break;
      case 'd6': this.pending.freeRerolls = true; break;
      case 'coupon': this.pending.coupon = true; break;
      case 'voucher': this.pending.extraVoucher = (this.pending.extraVoucher || 0) + 1; break;
      case 'uncommon': this.pending.freeJoker = 'uncommon'; break;
      case 'rare': this.pending.freeJoker = 'rare'; break;
      case 'foil': case 'holo': case 'poly': case 'negative':
        this.pending.editionJoker = tagKey === 'negative' ? 'negative' : tagKey; break;
      case 'boss': this.rerollBossFree(); break;
      case 'handy': this.addMoney(this.stats.handsPlayed, 'Handy Tag'); break;
      case 'garbage': this.addMoney(this.stats.unusedDiscards || 0, 'Garbage Tag'); break;
      case 'speed': this.addMoney(5 * this.stats.skips, 'Speed Tag'); break;
      case 'economy': this.addMoney(Math.min(40, Math.max(0, this.money)), 'Economy Tag'); break;
      case 'orbital': this.levelUpHand(this.randomHandKey(), 3, 'Orbital Tag'); break;
      case 'topup': this.createJokers(2, 'common', 'Top-up Tag'); break;
      case 'standard': this.queueFreePack('standard_mega'); break;
      case 'charm': this.queueFreePack('arcana_mega'); break;
      case 'meteor': this.queueFreePack('celestial_mega'); break;
      case 'buffoon': this.queueFreePack('buffoon_mega'); break;
      case 'ethereal': this.queueFreePack('spectral'); break;
      default: break;
    }
  }

  rerollBossFree() {
    const pool = (this.ante % 8 === 0 ? FINISHER_KEYS : REGULAR_BOSS_KEYS.filter((k) => (BOSSES[k].minAnte || 1) <= this.ante))
      .filter((k) => k !== this.bossKey);
    if (pool.length) this.bossKey = this.rng.pick(pool);
  }

  queueFreePack(packKey) {
    this.pending.freePacks = this.pending.freePacks || [];
    this.pending.freePacks.push(packKey);
  }

  rerollDisabledJoker() {
    this.disabledJoker = this.jokers.length ? this.rng.pick(this.jokers) : null;
  }

  applyCardDebuffs() {
    const boss = this.activeBoss;
    // Face-down cards stay debuffed no matter what else changes.
    for (const card of this.fullDeck) card.debuffed = !!card.faceDown;
    if (this.leafLocked) { for (const card of this.fullDeck) card.debuffed = true; return; }
    if (!boss) return;
    if (boss.debuff) {
      for (const card of this.fullDeck) if (boss.debuff(card, this)) card.debuffed = true;
    }
    if (boss.key === 'pillar') {
      for (const card of this.fullDeck) if (this.playedThisAnte.has(card.uid)) card.debuffed = true;
    }
  }

  // -- drawing -------------------------------------------------------------
  drawCards(count, allFaceDown = false) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (!this.drawPile.length) break;
      const card = this.drawPile.pop();
      card.faceDown = false;
      if (allFaceDown) card.faceDown = true;
      else if (this.bossActive('wheel') && this.chance(1, 7)) card.faceDown = true;
      else if (this.bossActive('mark') && this.isFace(card)) card.faceDown = true;
      if (card.faceDown) { card.debuffed = true; this.bossTriggeredThisHand = true; }
      this.hand.push(card);
      drawn.push(card);
    }
    this.sortHand();
    if (this.bossActive('bell')) this.pickForcedCard();
    this.emit('cards_drawn', drawn);
    return drawn;
  }

  pickForcedCard() {
    if (this.hand.length) this.forcedCard = this.rng.pick(this.hand);
  }

  refillHand(faceDown = false) {
    const missing = this.handSize - this.hand.length;
    if (missing > 0) this.drawCards(missing, faceDown);
  }

  sortHand() {
    const mode = this.sortMode || 'rank';
    if (mode === 'rank') {
      this.hand.sort((a, b) => b.rank - a.rank || SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit));
    } else {
      this.hand.sort((a, b) => SUIT_KEYS.indexOf(a.suit) - SUIT_KEYS.indexOf(b.suit) || b.rank - a.rank);
    }
  }

  setSortMode(mode) { this.sortMode = mode; this.sortHand(); this.emit('state'); }

  // -- play validation -----------------------------------------------------
  canPlay(selected) {
    if (!selected.length) return { ok: false, reason: 'Select cards to play' };
    if (selected.length > 5) return { ok: false, reason: 'Maximum 5 cards' };
    if (this.handsLeft <= 0) return { ok: false, reason: 'No hands left' };
    if (this.bossActive('psychic') && selected.length !== 5) return { ok: false, reason: 'The Psychic: must play 5 cards' };
    if (this.bossActive('bell') && this.forcedCard && this.hand.includes(this.forcedCard) && !selected.includes(this.forcedCard)) {
      return { ok: false, reason: 'Cerulean Bell: that card must be played' };
    }
    const key = this.evaluate(selected).key;
    if (this.bossActive('eye') && this.handsThisRound.includes(key)) {
      return { ok: false, reason: `The Eye: ${this.handName(key)} already played` };
    }
    if (this.bossActive('mouth') && this.handsThisRound.length && this.handsThisRound[0] !== key) {
      return { ok: false, reason: `The Mouth: only ${this.handName(this.handsThisRound[0])} allowed` };
    }
    return { ok: true, handKey: key };
  }

  canDiscard(selected) {
    if (!selected.length) return { ok: false, reason: 'Select cards to discard' };
    if (selected.length > 5) return { ok: false, reason: 'Maximum 5 cards' };
    if (this.discardsLeft <= 0) return { ok: false, reason: 'No discards left' };
    if (this.bossActive('bell') && this.forcedCard && this.hand.includes(this.forcedCard) && selected.includes(this.forcedCard)) {
      return { ok: false, reason: 'Cerulean Bell: that card cannot be discarded' };
    }
    return { ok: true };
  }

  // -- joker iteration -----------------------------------------------------
  // Blueprint / Brainstorm resolve to the ability of another joker while
  // keeping their own edition and position.
  resolve(joker, depth = 0) {
    const def = JOKERS[joker.key];
    if (!def) return null;
    if (def.copies && depth < 5) {
      const target = def.copies(this, joker);
      if (!target) return null;
      const inner = this.resolve(target, depth + 1);
      if (!inner) return null;
      return { def: inner.def, state: inner.state, host: joker };
    }
    return { def, state: joker, host: joker };
  }

  activeJokers() {
    return this.jokers.filter((j) => j !== this.disabledJoker);
  }

  forEachJoker(hook, ...args) {
    for (const joker of this.activeJokers().slice()) {
      const r = this.resolve(joker);
      if (!r || !r.def[hook]) continue;
      r.def[hook](this, r.state, ...args);
    }
  }

  // -- scoring -------------------------------------------------------------
  buildContext(evaluated) {
    const played = evaluated.played;
    const nonStone = played.filter((c) => c.enhancement !== 'stone');
    const counts = {};
    for (const c of nonStone) counts[c.rank] = (counts[c.rank] || 0) + 1;
    const sizes = Object.values(counts).sort((a, b) => b - a);
    const pairs = sizes.filter((n) => n >= 2).length;
    const key = evaluated.key;
    return {
      engine: this,
      handKey: key,
      handName: HAND_NAMES[key],
      played,
      scoring: evaluated.scoring,
      held: this.hand.filter((c) => !played.includes(c)),
      contains: {
        pair: sizes[0] >= 2,
        twoPair: pairs >= 2 || sizes[0] >= 4,
        three: sizes[0] >= 3,
        four: sizes[0] >= 4,
        straight: key === 'straight' || key === 'straight_flush',
        flush: key === 'flush' || key === 'straight_flush' || key === 'flush_house' || key === 'flush_five',
      },
    };
  }

  playHand(selected) {
    const check = this.canPlay(selected);
    if (!check.ok) { this.toast(check.reason, 'warn'); return null; }

    const played = this.hand.filter((c) => selected.includes(c));
    this.hand = this.hand.filter((c) => !selected.includes(c));
    this.handsLeft -= 1;
    this.handsPlayedThisRound += 1;
    this.stats.handsPlayed += 1;
    this.bossTriggeredThisHand = false;

    const evaluated = this.evaluate(played);
    const ctx = this.buildContext(evaluated);
    this.handPlays[evaluated.key] = (this.handPlays[evaluated.key] || 0) + 1;
    this.discovered.add(evaluated.key);

    const result = this.runScoring(ctx);

    this.score += result.score;
    this.stats.bestHand = Math.max(this.stats.bestHand, result.score);
    this.handsThisRound.push(evaluated.key);
    for (const c of played) this.playedThisAnte.add(c.uid);

    // Post-scoring joker hooks.
    this.forEachJoker('onHandPlayed', ctx);

    // Boss reactions.
    if (this.bossActive('arm')) {
      this.levelUpHand(evaluated.key, -1, 'The Arm');
      this.bossTriggeredThisHand = true;
    }
    if (this.bossActive('ox') && evaluated.key === this.mostPlayedHand()) {
      this.setMoney(0, 'The Ox');
      this.bossTriggeredThisHand = true;
    }
    if (this.bossActive('tooth')) {
      this.addMoney(-played.length, 'The Tooth');
      this.bossTriggeredThisHand = true;
    }
    if (this.bossActive('heart')) this.rerollDisabledJoker();

    this.playedPile.push(...played.filter((c) => this.fullDeck.includes(c)));

    this.emit('hand_scored', { ctx, result, played });

    // Refill, honouring boss draw effects.
    if (this.bossActive('hook')) {
      const victims = this.rng.shuffle(this.hand.slice()).slice(0, 2);
      for (const c of victims) {
        this.hand.splice(this.hand.indexOf(c), 1);
        this.discardPile.push(c);
      }
      if (victims.length) this.bossTriggeredThisHand = true;
    }

    const finished = this.score >= this.blind.chips;
    if (!finished && this.handsLeft > 0) {
      if (this.bossActive('serpent')) this.drawCards(3, this.bossActive('fish'));
      else this.refillHand(this.bossActive('fish'));
    }

    if (finished) this.winRound(result);
    else if (this.handsLeft <= 0) this.loseRound();
    else this.emit('state');

    return result;
  }

  runScoring(ctx) {
    const steps = [];
    const level = this.handLevels[ctx.handKey] || 1;
    const base = handValues(ctx.handKey, level);
    let chips = base.chips;
    let mult = base.mult;

    if (this.bossActive('flint')) {
      chips = Math.ceil(chips / 2);
      mult = Math.ceil(mult / 2);
      this.bossTriggeredThisHand = true;
    }

    steps.push({ type: 'base', handKey: ctx.handKey, level, chips, mult });

    const apply = (effect, source, card) => {
      if (!effect) return;
      const parts = [];
      if (effect.chips) { chips += effect.chips; parts.push({ kind: 'chips', value: effect.chips }); }
      if (effect.mult) { mult += effect.mult; parts.push({ kind: 'mult', value: effect.mult }); }
      if (effect.xmult && effect.xmult !== 1) { mult = +(mult * effect.xmult).toFixed(4); parts.push({ kind: 'xmult', value: effect.xmult }); }
      if (effect.money) { this.addMoney(effect.money, source); parts.push({ kind: 'money', value: effect.money }); }
      if (!parts.length && !effect.msg) return;
      steps.push({ type: 'effect', source, card, parts, msg: effect.msg, chips, mult });
    };

    // 1. Scoring cards, left to right.
    for (const card of ctx.scoring) {
      if (card.debuffed) { steps.push({ type: 'card_debuffed', card }); continue; }
      let triggers = 1;
      if (card.seal === 'red') triggers += 1;
      for (const joker of this.activeJokers()) {
        const r = this.resolve(joker);
        if (r && r.def.retriggerScored) triggers += r.def.retriggerScored(ctx, card, r.state) || 0;
      }
      for (let t = 0; t < triggers; t++) {
        steps.push({ type: 'card_trigger', card, index: t });
        apply({ chips: cardChips(card) }, 'card', card);
        this.applyCardEnhancement(card, apply, ctx);
        this.applyCardEdition(card, apply);
        if (card.seal === 'gold') apply({ money: 3 }, 'Gold Seal', card);
        for (const joker of this.activeJokers()) {
          const r = this.resolve(joker);
          if (!r || !r.def.scored) continue;
          const effect = r.def.scored(ctx, card, r.state);
          if (effect) {
            apply(effect, this.jokerName(joker), card);
            this.applyJokerEdition(joker, apply);
          }
        }
      }
      this.maybeBreakGlass(card, ctx);
    }

    // 2. Cards held in hand.
    for (const card of ctx.held) {
      if (card.debuffed) continue;
      let triggers = 1;
      if (card.seal === 'red') triggers += 1;
      for (const joker of this.activeJokers()) {
        const r = this.resolve(joker);
        if (r && r.def.retriggerHeld) triggers += r.def.retriggerHeld(ctx, card, r.state) || 0;
      }
      for (let t = 0; t < triggers; t++) {
        if (card.enhancement === 'steel') apply({ xmult: 1.5 }, 'Steel Card', card);
        for (const joker of this.activeJokers()) {
          const r = this.resolve(joker);
          if (!r || !r.def.held) continue;
          const effect = r.def.held(ctx, card, r.state);
          if (effect) {
            apply(effect, this.jokerName(joker), card);
            this.applyJokerEdition(joker, apply);
          }
        }
      }
    }

    // 3. Independent joker effects, left to right.
    for (const joker of this.activeJokers()) {
      const r = this.resolve(joker);
      if (!r) continue;
      let fired = false;
      if (r.def.indep) {
        const effect = r.def.indep(ctx, r.state);
        if (effect) { apply(effect, this.jokerName(joker), null); fired = true; }
      }
      // Editions always pay out, even for jokers with no independent ability.
      this.applyJokerEdition(joker, apply, !fired);
    }

    // 4. Observatory: planets sitting in the consumable area boost their hand.
    if (this.hasVoucher('observatory')) {
      for (const c of this.consumables) {
        const def = CONSUMABLES[c.key];
        if (def && def.kind === 'planet' && def.hand === ctx.handKey) apply({ xmult: 1.5 }, 'Observatory', null);
      }
    }

    // 5. Plasma Deck balances the two halves before multiplying.
    if (this.deckKey === 'plasma') {
      const total = chips + mult;
      chips = Math.floor(total / 2);
      mult = Math.floor(total / 2);
      steps.push({ type: 'balance', chips, mult });
    }

    const score = Math.round(chips * mult);
    steps.push({ type: 'total', chips, mult, score });
    return { steps, chips, mult, score, handKey: ctx.handKey, level };
  }

  applyCardEnhancement(card, apply, ctx) {
    switch (card.enhancement) {
      case 'mult': apply({ mult: 4 }, 'Mult Card', card); break;
      case 'glass': apply({ xmult: 2 }, 'Glass Card', card); break;
      case 'lucky': {
        if (this.chance(1, 5)) { apply({ mult: 20 }, 'Lucky Card', card); this.forEachJoker('onLucky'); }
        if (this.chance(1, 15)) { apply({ money: 20 }, 'Lucky Card', card); this.forEachJoker('onLucky'); }
        break;
      }
      default: break;
    }
  }

  applyCardEdition(card, apply) {
    if (card.edition === 'holo') apply({ mult: 10 }, 'Holographic', card);
    else if (card.edition === 'poly') apply({ xmult: 1.5 }, 'Polychrome', card);
    // Foil chips are folded into cardChips().
  }

  applyJokerEdition(joker, apply, onlyEdition = false) {
    if (!joker.edition) return;
    const name = this.jokerName(joker);
    if (joker.edition === 'foil') apply({ chips: 50 }, `${name} (Foil)`, null);
    else if (joker.edition === 'holo') apply({ mult: 10 }, `${name} (Holo)`, null);
    else if (joker.edition === 'poly') apply({ xmult: 1.5 }, `${name} (Poly)`, null);
  }

  maybeBreakGlass(card, ctx) {
    if (card.enhancement !== 'glass') return;
    if (!this.chance(1, 4)) return;
    this.destroyCard(card, 'Glass shattered');
    this.forEachJoker('onGlassBroken');
  }

  // -- round resolution ----------------------------------------------------
  winRound(result) {
    this.gameState = 'round_won';
    const blind = this.blind;

    // Blue seals on cards still held create their planet card.
    for (const card of this.hand) {
      if (card.seal === 'blue' && this.handsThisRound.length) {
        const planet = PLANET_BY_HAND[this.handsThisRound[this.handsThisRound.length - 1]];
        if (planet) this.addConsumable(this.makeConsumable(planet));
      }
      if (card.enhancement === 'gold') this.addMoney(3, 'Gold Card');
    }

    let payout = blind.reward;
    const details = [{ label: `${this.blindInfo(blind.type).name}`, amount: blind.reward }];

    if (this.deckKey === 'green') {
      const hands = this.handsLeft * 2;
      const discards = this.discardsLeft * 1;
      if (hands) details.push({ label: `${this.handsLeft} hands remaining`, amount: hands });
      if (discards) details.push({ label: `${this.discardsLeft} discards remaining`, amount: discards });
      payout += hands + discards;
    } else {
      const handBonus = this.handsLeft;
      if (handBonus) details.push({ label: `${this.handsLeft} hands remaining`, amount: handBonus });
      payout += handBonus;
      let interest = Math.min(this.interestCap, Math.floor(Math.max(0, this.money) / BASE_CONFIG.interestRate));
      if (this.hasJoker('to_the_moon')) interest *= 2;
      if (interest) details.push({ label: 'Interest', amount: interest });
      payout += interest;
    }

    this.stats.unusedDiscards = (this.stats.unusedDiscards || 0) + this.discardsLeft;

    this.addMoney(payout, 'Round payout');
    this.forEachJoker('onRoundEnd');

    if (blind.type === 'boss') {
      this.forEachJoker('onBossDefeated');
      if (this.pending.investment) {
        this.addMoney(25 * this.pending.investment, 'Investment Tag');
        this.pending.investment = 0;
      }
      if (this.deckKey === 'anaglyph') this.gainTag('double', 'Anaglyph Deck');
    }

    for (const j of this.jokers) j.flipped = false;
    this.pending.juggle = false;
    this.round += 1;

    this.roundSummary = { blind, payout, details, score: this.score, required: blind.chips };
    this.emit('round_won', this.roundSummary);
    this.emit('state');
  }

  loseRound() {
    const bones = this.jokers.find((j) => j.key === 'mr_bones');
    if (bones && this.score >= this.blind.chips * 0.25) {
      this.destroyJoker(bones, 'Mr. Bones saved you!');
      this.toast('Saved by Mr. Bones!', 'good');
      this.winRound({ score: this.score });
      return;
    }
    this.gameState = 'game_over';
    this.emit('game_over', { score: this.score, required: this.blind.chips, ante: this.ante });
    this.emit('state');
  }

  proceedAfterRound() {
    if (this.blind.type === 'boss') {
      this.ante += 1;
      this.playedThisAnte = new Set();
      if (this.ante > BASE_CONFIG.winAnte && !this.hasWon) {
        this.hasWon = true;
        this.gameState = 'won';
        this.emit('won', { ante: this.ante });
        this.emit('state');
        return;
      }
      this.rollAnteBosses();
    }
    this.openShop();
  }

  discard(selected) {
    const check = this.canDiscard(selected);
    if (!check.ok) { this.toast(check.reason, 'warn'); return; }
    const cards = this.hand.filter((c) => selected.includes(c));
    this.hand = this.hand.filter((c) => !selected.includes(c));
    this.discardsLeft -= 1;
    this.discardsUsedThisRound += 1;
    this.stats.discardsUsed += 1;
    this.stats.cardsDiscarded += cards.length;
    this.discardPile.push(...cards);

    for (const card of cards) {
      if (card.seal === 'purple') this.createConsumable('tarot', 'Purple Seal');
    }

    this.forEachJoker('onDiscard', cards);

    if (this.bossActive('serpent')) this.drawCards(3, this.bossActive('fish'));
    else this.refillHand();

    this.emit('cards_discarded', cards);
    this.emit('state');
  }

  // -- money ---------------------------------------------------------------
  addMoney(amount, source) {
    if (!amount) return;
    const floor = -this.debtLimit;
    this.money = Math.max(floor, this.money + amount);
    this.emit('money', { amount, source, total: this.money });
  }

  setMoney(value, source) {
    this.money = value;
    this.emit('money', { amount: 0, source, total: this.money });
  }

  // -- deck mutation -------------------------------------------------------
  addCardToDeck(card, source, toHand = false) {
    this.fullDeck.push(card);
    if (toHand) this.hand.push(card);
    else this.drawPile.push(card);
    this.forEachJoker('onCardAdded', card);
    this.emit('deck_changed', { added: card, source });
  }

  addRandomCardToDeck(opts = {}, source) {
    const card = makeCard(
      opts.rank || this.rng.pick(RANKS),
      opts.suit || this.rng.pick(SUIT_KEYS),
      { enhancement: opts.enhancement || null, edition: opts.edition || null, seal: opts.seal || null }
    );
    this.addCardToDeck(card, source);
    return card;
  }

  addSealedCardToHand() {
    const seal = this.rng.pick(['gold', 'red', 'blue', 'purple']);
    const card = makeCard(this.rng.pick(RANKS), this.rng.pick(SUIT_KEYS), { seal });
    this.fullDeck.push(card);
    this.hand.push(card);
    this.sortHand();
  }

  duplicateCardToHand(card, source) {
    const copy = cloneCard(card);
    copy.debuffed = false;
    copy.faceDown = false;
    this.fullDeck.push(copy);
    this.hand.push(copy);
    this.sortHand();
    this.forEachJoker('onCardAdded', copy);
    this.emit('deck_changed', { added: copy, source });
  }

  destroyCard(card, source) {
    const remove = (arr) => { const i = arr.indexOf(card); if (i >= 0) arr.splice(i, 1); };
    remove(this.fullDeck);
    remove(this.hand);
    remove(this.drawPile);
    remove(this.discardPile);
    remove(this.playedPile);
    this.forEachJoker('onCardDestroyed', card);
    this.emit('card_destroyed', { card, source });
  }

  // -- jokers --------------------------------------------------------------
  makeJoker(key, edition = null) {
    const def = JOKERS[key];
    const joker = { uid: this.nextUid(), key, edition, state: {}, extraValue: 0 };
    if (def && def.init) def.init(joker, this);
    return joker;
  }

  addJoker(joker) {
    if (!this.hasJokerSpace() && joker.edition !== 'negative') return false;
    this.jokers.push(joker);
    this.emit('joker_added', joker);
    this.emit('state');
    return true;
  }

  createJokers(count, rarity, source) {
    for (let i = 0; i < count; i++) {
      if (!this.hasJokerSpace()) break;
      const key = this.randomJokerKey(rarity);
      if (!key) break;
      this.addJoker(this.makeJoker(key));
      this.emit('created', { kind: 'joker', key, source });
    }
  }

  randomJokerKey(rarity = null) {
    let pool;
    if (rarity) pool = jokersByRarity(rarity);
    else {
      const roll = this.rng.next() * 100;
      const chosen = roll < 70 ? 'common' : roll < 95 ? 'uncommon' : 'rare';
      pool = jokersByRarity(chosen);
    }
    if (!this.hasJoker('showman')) {
      const owned = new Set(this.jokers.map((j) => j.key));
      if (this.shopRolled) for (const k of this.shopRolled) owned.add(k);
      const filtered = pool.filter((k) => !owned.has(k));
      if (filtered.length) pool = filtered;
    }
    return pool.length ? this.rng.pick(pool) : null;
  }

  duplicateJoker(joker) {
    if (!this.hasJokerSpace()) return;
    const copy = { uid: this.nextUid(), key: joker.key, edition: joker.edition, state: JSON.parse(JSON.stringify(joker.state || {})), extraValue: 0 };
    this.jokers.push(copy);
    this.emit('joker_added', copy);
  }

  destroyJoker(joker, message) {
    const i = this.jokers.indexOf(joker);
    if (i < 0) return;
    this.jokers.splice(i, 1);
    if (this.disabledJoker === joker) this.disabledJoker = null;
    if (message) this.toast(`${this.jokerName(joker)}: ${message}`);
    this.emit('joker_removed', joker);
    this.emit('state');
  }

  sellJoker(joker) {
    const value = this.sellValue(joker);
    const r = this.resolve(joker);
    if (r && r.def.onSell) r.def.onSell(this, r.state);
    const i = this.jokers.indexOf(joker);
    if (i >= 0) this.jokers.splice(i, 1);
    this.addMoney(value, 'Sold joker');
    if (this.leafLocked) {
      this.leafLocked = false;
      this.applyCardDebuffs();
      this.toast('Verdant Leaf broken!', 'good');
    }
    this.emit('joker_removed', joker);
    this.emit('state');
  }

  moveJoker(from, to) {
    if (from === to || from < 0 || to < 0 || from >= this.jokers.length || to >= this.jokers.length) return;
    const [j] = this.jokers.splice(from, 1);
    this.jokers.splice(to, 0, j);
    this.emit('state');
  }

  disableBoss(source) {
    if (!this.blind || this.blind.type !== 'boss') return;
    this.blind.disabled = true;
    this.leafLocked = false;
    this.applyCardDebuffs();
    this.toast(`${source} disabled the Boss Blind!`, 'good');
    this.emit('state');
  }

  // -- consumables ---------------------------------------------------------
  makeConsumable(key) {
    const def = CONSUMABLES[key];
    return { uid: this.nextUid(), key, kind: def ? def.kind : 'tarot', negative: false };
  }

  addConsumable(card, force = false) {
    if (!force && !card.negative && !this.hasConsumableSpace()) return false;
    this.consumables.push(card);
    this.emit('consumable_added', card);
    this.emit('state');
    return true;
  }

  createConsumable(kind, source) {
    if (!this.hasConsumableSpace()) return null;
    const key = this.randomConsumableKey(kind);
    if (!key) return null;
    const card = this.makeConsumable(key);
    this.addConsumable(card);
    this.emit('created', { kind, key, source });
    return card;
  }

  randomConsumableKey(kind) {
    let pool = keysOfKind(kind);
    if (!this.hasJoker('showman')) {
      const owned = new Set(this.consumables.map((c) => c.key));
      if (this.shopRolled) for (const k of this.shopRolled) owned.add(k);
      const filtered = pool.filter((k) => !owned.has(k));
      if (filtered.length) pool = filtered;
    }
    return pool.length ? this.rng.pick(pool) : null;
  }

  consumableRequirement(card) {
    const def = CONSUMABLES[card.key];
    return def && def.select ? def.select : [0, 0];
  }

  canUseConsumable(card, selected = []) {
    const def = CONSUMABLES[card.key];
    if (!def) return { ok: false, reason: 'Unknown card' };
    if (def.canUse && !def.canUse(this)) return { ok: false, reason: 'Cannot be used right now' };
    const [min, max] = this.consumableRequirement(card);
    if (min > 0 && (selected.length < min || selected.length > max)) {
      return { ok: false, reason: `Select ${min === max ? min : `${min}-${max}`} card${max > 1 ? 's' : ''} in hand` };
    }
    if (min === 0 && max === 0 && selected.length) return { ok: true };
    return { ok: true };
  }

  useConsumable(card, selected = []) {
    const def = CONSUMABLES[card.key];
    const check = this.canUseConsumable(card, selected);
    if (!check.ok) { this.toast(check.reason, 'warn'); return false; }
    const [, max] = this.consumableRequirement(card);
    const cards = max > 0 ? this.hand.filter((c) => selected.includes(c)).slice(0, max) : [];
    def.use(this, cards);

    if (def.kind === 'tarot') this.stats.tarotsUsed += 1;
    if (def.kind === 'planet') this.stats.planetsUsed += 1;
    if (def.kind !== 'spectral' && card.key !== 'fool') this.lastConsumableUsed = card.key;

    const i = this.consumables.indexOf(card);
    if (i >= 0) this.consumables.splice(i, 1);
    this.sortHand();
    this.emit('consumable_used', { card, cards });
    this.emit('state');
    return true;
  }

  notePlanet(key) {
    if (!this.stats.uniquePlanets.includes(key)) this.stats.uniquePlanets.push(key);
    this.forEachJoker('onPlanetUsed');
  }

  levelUpHand(key, amount, source) {
    if (!HAND_BASE[key]) return;
    this.handLevels[key] = Math.max(1, (this.handLevels[key] || 1) + amount);
    this.discovered.add(key);
    this.emit('hand_leveled', { key, level: this.handLevels[key], amount, source });
  }

  // -- shop ----------------------------------------------------------------
  get shopSlots() {
    let n = BASE_CONFIG.shopSlots;
    if (this.hasVoucher('overstock')) n += 1;
    if (this.hasVoucher('overstock_plus')) n += 1;
    return n;
  }

  priceMultiplier() {
    if (this.hasVoucher('liquidation')) return 0.5;
    if (this.hasVoucher('clearance')) return 0.75;
    return 1;
  }

  price(base) { return Math.max(1, Math.ceil(base * this.priceMultiplier())); }

  openShop() {
    this.gameState = 'shop';
    this.shop = {
      items: [],
      packs: [],
      voucher: null,
      rerollCost: this.baseRerollCost(),
      freeRerolls: this.pending.freeRerolls ? 1 : 0,
      chaosUsed: 0,
    };
    this.pending.freeRerolls = false;
    this.rollShopItems();
    this.rollShopPacks();
    this.rollShopVoucher();
    this.pending.coupon = false;
    this.emit('shop_opened');
    this.emit('state');
  }

  baseRerollCost() {
    let cost = BASE_CONFIG.rerollBase;
    if (this.hasVoucher('reroll_surplus')) cost -= 2;
    if (this.hasVoucher('reroll_glut')) cost -= 2;
    return Math.max(0, cost);
  }

  rollShopItems() {
    const items = [];
    const free = this.pending.coupon;
    // Without Showman the same card should not appear twice in one shop.
    this.shopRolled = new Set();
    for (let i = 0; i < this.shopSlots; i++) {
      items.push(this.rollShopItem(free));
    }
    this.shopRolled = null;
    // Tag-granted jokers replace the first slot.
    if (this.pending.freeJoker) {
      const key = this.randomJokerKey(this.pending.freeJoker);
      if (key) items[0] = { kind: 'joker', key, cost: 0, uid: this.nextUid(), edition: null };
      this.pending.freeJoker = null;
    }
    if (this.pending.editionJoker) {
      const target = items.find((it) => it.kind === 'joker' && !it.edition);
      if (target) { target.edition = this.pending.editionJoker; target.cost = 0; }
      this.pending.editionJoker = null;
    }
    this.shop.items = items;
  }

  rollShopItem(free = false) {
    const weights = [
      { kind: 'joker', weight: 20 },
      { kind: 'tarot', weight: 4 * (this.hasVoucher('tarot_tycoon') ? 4 : this.hasVoucher('tarot_merchant') ? 2 : 1) },
      { kind: 'planet', weight: 4 * (this.hasVoucher('planet_tycoon') ? 4 : this.hasVoucher('planet_merchant') ? 2 : 1) },
    ];
    if (this.deckKey === 'ghost') weights.push({ kind: 'spectral', weight: 0.6 });
    if (this.hasVoucher('magic_trick')) weights.push({ kind: 'playing', weight: 4 });

    const choice = this.rng.weighted(weights, (w) => w.weight).kind;

    if (choice === 'joker') {
      const key = this.randomJokerKey();
      if (!key) return this.rollShopItem(free);
      if (this.shopRolled) this.shopRolled.add(key);
      const def = JOKERS[key];
      const edition = this.rollEdition();
      let cost = def.cost + (edition ? { foil: 2, holo: 3, poly: 5, negative: 5 }[edition] : 0);
      return { kind: 'joker', key, edition, cost: free ? 0 : this.price(cost), uid: this.nextUid() };
    }
    if (choice === 'playing') {
      const card = makeCard(this.rng.pick(RANKS), this.rng.pick(SUIT_KEYS));
      if (this.hasVoucher('illusion')) {
        if (this.chance(1, 2)) card.enhancement = this.randomEnhancement();
        if (this.chance(1, 5)) card.seal = this.rng.pick(['gold', 'red', 'blue', 'purple']);
        card.edition = this.rollEdition();
      }
      return { kind: 'playing', card, cost: free ? 0 : this.price(4), uid: this.nextUid() };
    }
    const key = this.randomConsumableKey(choice);
    if (!key) return this.rollShopItem(free);
    if (this.shopRolled) this.shopRolled.add(key);
    const isFreePlanet = choice === 'planet' && this.hasJoker('astronomer');
    return { kind: choice, key, cost: free || isFreePlanet ? 0 : this.price(CONSUMABLES[key].cost), uid: this.nextUid() };
  }

  rollEdition() {
    const scale = this.hasVoucher('glow_up') ? 4 : this.hasVoucher('hone') ? 2 : 1;
    const roll = this.rng.next();
    if (roll < 0.003 * scale) return 'negative';
    if (roll < 0.006 * scale) return 'poly';
    if (roll < 0.02 * scale) return 'holo';
    if (roll < 0.05 * scale) return 'foil';
    return null;
  }

  rollShopPacks() {
    const packs = [];
    const free = this.pending.coupon;
    for (const key of this.pending.freePacks || []) {
      packs.push({ kind: 'pack', packKey: key, cost: 0, uid: this.nextUid() });
    }
    this.pending.freePacks = [];
    for (let i = packs.length; i < 2; i++) {
      const pack = this.rng.weighted(PACKS, (p) => p.weight);
      const isFree = free || (pack.kind === 'planet' && this.hasJoker('astronomer'));
      packs.push({ kind: 'pack', packKey: pack.key, cost: isFree ? 0 : this.price(pack.cost), uid: this.nextUid() });
    }
    this.shop.packs = packs;
  }

  rollShopVoucher() {
    const available = Object.keys(VOUCHERS).filter((k) => {
      if (this.vouchers.has(k)) return false;
      const v = VOUCHERS[k];
      if (v.requires && !this.vouchers.has(v.requires)) return false;
      return true;
    });
    if (!available.length) { this.shop.voucher = null; return; }
    const key = this.rng.pick(available);
    this.shop.voucher = { kind: 'voucher', key, cost: this.price(VOUCHERS[key].cost), uid: this.nextUid() };
    if (this.pending.extraVoucher) this.pending.extraVoucher -= 1;
  }

  canAfford(cost) { return this.money - cost >= -this.debtLimit; }

  buyShopItem(item) {
    if (!this.canAfford(item.cost)) { this.toast('Not enough money', 'warn'); return false; }
    if (item.kind === 'joker') {
      if (!this.hasJokerSpace() && item.edition !== 'negative') { this.toast('No Joker slots', 'warn'); return false; }
      this.addMoney(-item.cost, 'Purchase');
      const joker = this.makeJoker(item.key, item.edition);
      this.addJoker(joker);
      const r = this.resolve(joker);
      if (r && r.def.onBuy) r.def.onBuy(this, r.state);
    } else if (item.kind === 'playing') {
      this.addMoney(-item.cost, 'Purchase');
      this.addCardToDeck(item.card, 'Shop');
    } else if (item.kind === 'voucher') {
      this.addMoney(-item.cost, 'Purchase');
      this.vouchers.add(item.key);
      this.toast(`${VOUCHERS[item.key].name} redeemed`, 'good');
      if (item.key === 'hieroglyph' || item.key === 'petroglyph') {
        this.ante = Math.max(1, this.ante - 1);
        this.rollAnteBosses();
      }
      this.shop.voucher = null;
      this.emit('state');
      return true;
    } else {
      if (!this.hasConsumableSpace()) { this.toast('No consumable slots', 'warn'); return false; }
      this.addMoney(-item.cost, 'Purchase');
      this.addConsumable(this.makeConsumable(item.key));
    }
    this.shop.items = this.shop.items.filter((it) => it !== item);
    this.emit('state');
    return true;
  }

  rerollShop() {
    let cost = this.shop.rerollCost;
    if (this.shop.freeRerolls > 0) { cost = 0; this.shop.freeRerolls -= 1; }
    else if (this.hasJoker('chaos_clown') && this.shop.chaosUsed < this.countJoker('chaos_clown')) {
      cost = 0; this.shop.chaosUsed += 1;
    }
    if (!this.canAfford(cost)) { this.toast('Not enough money', 'warn'); return; }
    this.addMoney(-cost, 'Reroll');
    if (cost > 0) this.shop.rerollCost += 1;
    this.stats.rerolls += 1;
    this.rollShopItems();
    this.forEachJoker('onReroll');
    this.emit('state');
  }

  exitShop() {
    this.forEachJoker('onShopExit');
    this.gameState = 'blind_select';
    this.shop = null;
    this.emit('state');
  }

  // -- booster packs -------------------------------------------------------
  buyPack(entry) {
    if (!this.canAfford(entry.cost)) { this.toast('Not enough money', 'warn'); return; }
    this.addMoney(-entry.cost, 'Purchase');
    this.shop.packs = this.shop.packs.filter((p) => p !== entry);
    this.openPack(entry.packKey);
  }

  openPack(packKey) {
    const def = PACK_BY_KEY[packKey];
    const options = [];
    for (let i = 0; i < def.size; i++) options.push(this.rollPackOption(def));
    this.pack = { def, options, remaining: def.choose, taken: [] };
    this.gameState = 'pack';
    this.forEachJoker('onPackOpened');
    this.emit('pack_opened', this.pack);
    this.emit('state');
  }

  rollPackOption(def) {
    if (def.kind === 'joker') {
      const key = this.randomJokerKey();
      return { kind: 'joker', key, edition: this.rollEdition(), uid: this.nextUid() };
    }
    if (def.kind === 'playing') {
      const card = makeCard(this.rng.pick(RANKS), this.rng.pick(SUIT_KEYS));
      if (this.chance(1, 2)) card.enhancement = this.randomEnhancement();
      card.edition = this.rollEdition();
      if (this.chance(1, 6)) card.seal = this.rng.pick(['gold', 'red', 'blue', 'purple']);
      return { kind: 'playing', card, uid: this.nextUid() };
    }
    if (def.kind === 'planet') {
      let key;
      if (this.hasVoucher('telescope') && !this.packTelescopeUsed) {
        key = PLANET_BY_HAND[this.mostPlayedHand()] || this.randomConsumableKey('planet');
        this.packTelescopeUsed = true;
      } else key = this.randomConsumableKey('planet') || 'pluto';
      return { kind: 'planet', key, uid: this.nextUid() };
    }
    if (def.kind === 'spectral') {
      const pool = COMMON_SPECTRAL_KEYS.slice();
      if (this.chance(1, 40)) pool.push('soul');
      if (this.chance(1, 40)) pool.push('black_hole');
      return { kind: 'spectral', key: this.rng.pick(pool), uid: this.nextUid() };
    }
    // Arcana
    if (this.hasVoucher('omen_globe') && this.chance(1, 5)) {
      return { kind: 'spectral', key: this.rng.pick(COMMON_SPECTRAL_KEYS), uid: this.nextUid() };
    }
    let key = this.randomConsumableKey('tarot') || 'fool';
    if (this.chance(1, 60)) key = 'soul';
    return { kind: key === 'soul' ? 'spectral' : 'tarot', key, uid: this.nextUid() };
  }

  takePackOption(option) {
    if (!this.pack || this.pack.remaining <= 0) return false;
    if (option.kind === 'joker') {
      if (!this.hasJokerSpace() && option.edition !== 'negative') { this.toast('No Joker slots', 'warn'); return false; }
      this.addJoker(this.makeJoker(option.key, option.edition));
    } else if (option.kind === 'playing') {
      this.addCardToDeck(option.card, 'Booster Pack');
    } else {
      const def = CONSUMABLES[option.key];
      const needsSelection = def.select && def.select[1] > 0;
      if (needsSelection || (def.canUse && !def.canUse(this))) {
        if (!this.hasConsumableSpace()) { this.toast('No consumable slots', 'warn'); return false; }
        this.addConsumable(this.makeConsumable(option.key));
      } else if (this.hasConsumableSpace()) {
        this.addConsumable(this.makeConsumable(option.key));
      } else {
        // No room: use it immediately if that is legal.
        const temp = this.makeConsumable(option.key);
        this.consumables.push(temp);
        this.useConsumable(temp, []);
      }
    }
    this.pack.taken.push(option);
    this.pack.options = this.pack.options.filter((o) => o !== option);
    this.pack.remaining -= 1;
    if (this.pack.remaining <= 0) this.closePack();
    else this.emit('state');
    return true;
  }

  closePack() {
    this.pack = null;
    this.packTelescopeUsed = false;
    this.gameState = this.shop ? 'shop' : 'blind_select';
    this.emit('pack_closed');
    this.emit('state');
  }

  skipPack() {
    this.forEachJoker('onPackSkipped');
    this.closePack();
  }

  // -- persistence ---------------------------------------------------------
  serialize() {
    return {
      version: 2,
      seed: this.seed,
      rng: this.rng.save(),
      cardSerial: cardSerialValue(),
      uidCounter: this.uidCounter,
      deckKey: this.deckKey,
      ante: this.ante,
      round: this.round,
      money: this.money,
      handLevels: this.handLevels,
      handPlays: this.handPlays,
      discovered: [...this.discovered],
      fullDeck: this.fullDeck,
      startingDeckSize: this.startingDeckSize,
      drawPile: this.drawPile.map((c) => c.uid),
      hand: this.hand.map((c) => c.uid),
      discardPile: this.discardPile.map((c) => c.uid),
      playedPile: this.playedPile.map((c) => c.uid),
      playedThisAnte: [...this.playedThisAnte],
      jokers: this.jokers,
      consumables: this.consumables,
      vouchers: [...this.vouchers],
      modifiers: this.modifiers,
      flags: this.flags,
      pending: this.pending,
      stats: this.stats,
      lastConsumableUsed: this.lastConsumableUsed,
      bossKey: this.bossKey,
      bossRerollsThisAnte: this.bossRerollsThisAnte,
      gameState: this.gameState,
      blind: this.blind,
      score: this.score,
      handsLeft: this.handsLeft,
      discardsLeft: this.discardsLeft,
      handsPlayedThisRound: this.handsPlayedThisRound,
      discardsUsedThisRound: this.discardsUsedThisRound,
      handsThisRound: this.handsThisRound,
      leafLocked: this.leafLocked,
      shop: this.shop,
      sortMode: this.sortMode,
      hasWon: this.hasWon,
      roundSummary: this.roundSummary,
    };
  }

  static deserialize(data) {
    const e = new Engine();
    e.seed = data.seed;
    e.rng = RNG.load(data.rng);
    resetCardSerial(data.cardSerial || 0);
    e.uidCounter = data.uidCounter || 1000;
    e.deckKey = data.deckKey;
    e.ante = data.ante;
    e.round = data.round;
    e.money = data.money;
    e.handLevels = data.handLevels;
    e.handPlays = data.handPlays;
    e.discovered = new Set(data.discovered || []);
    e.fullDeck = data.fullDeck;
    e.startingDeckSize = data.startingDeckSize;
    const byUid = new Map(e.fullDeck.map((c) => [c.uid, c]));
    const resolveList = (ids) => (ids || []).map((id) => byUid.get(id)).filter(Boolean);
    e.drawPile = resolveList(data.drawPile);
    e.hand = resolveList(data.hand);
    e.discardPile = resolveList(data.discardPile);
    e.playedPile = resolveList(data.playedPile);
    e.playedThisAnte = new Set(data.playedThisAnte || []);
    e.jokers = data.jokers || [];
    e.consumables = data.consumables || [];
    e.vouchers = new Set(data.vouchers || []);
    e.modifiers = data.modifiers;
    e.flags = data.flags || {};
    e.pending = data.pending || {};
    e.stats = data.stats;
    e.lastConsumableUsed = data.lastConsumableUsed;
    e.bossKey = data.bossKey;
    e.bossRerollsThisAnte = data.bossRerollsThisAnte || 0;
    e.gameState = data.gameState;
    e.blind = data.blind;
    e.score = data.score || 0;
    e.handsLeft = data.handsLeft || 0;
    e.discardsLeft = data.discardsLeft || 0;
    e.handsPlayedThisRound = data.handsPlayedThisRound || 0;
    e.discardsUsedThisRound = data.discardsUsedThisRound || 0;
    e.handsThisRound = data.handsThisRound || [];
    e.leafLocked = data.leafLocked || false;
    e.shop = data.shop || null;
    e.sortMode = data.sortMode || 'rank';
    e.hasWon = data.hasWon || false;
    e.roundSummary = data.roundSummary || null;
    e.tags = [];
    e.disabledJoker = null;
    e.pack = null;
    // Booster packs are not part of the save, so drop back to the screen the
    // pack was opened from instead of restoring into an empty pack.
    if (e.gameState === 'pack') e.gameState = e.shop ? 'shop' : 'blind_select';
    return e;
  }
}
