import test from 'node:test';
import assert from 'node:assert/strict';

import { Engine } from '../js/engine.js';
import { makeCard } from '../js/cards.js';
import { handValues, DECK_KEYS, BOSSES } from '../js/data.js';
import { JOKERS, JOKER_KEYS } from '../js/jokers.js';
import { CONSUMABLES } from '../js/consumables.js';
import { simulate } from './bot.js';

function freshRun(opts = {}) {
  const e = new Engine();
  e.newRun({ seed: opts.seed || 'TESTSEED', deck: opts.deck || 'red' });
  return e;
}

// Put the engine into a scoring-ready state without going through the UI.
function startBlind(e) {
  e.selectBlind();
  return e;
}

function score(e, cards) {
  const evaluated = e.evaluate(cards);
  const ctx = e.buildContext(evaluated);
  return e.runScoring(ctx);
}

test('a new run starts with sane defaults', () => {
  const e = freshRun();
  assert.equal(e.ante, 1);
  assert.equal(e.money, 4);
  assert.equal(e.fullDeck.length, 52);
  assert.equal(e.maxHands, 4);
  assert.equal(e.maxDiscards, 4); // Red Deck grants +1
  assert.equal(e.handSize, 8);
  assert.equal(e.jokerSlots, 5);
});

test('blind requirements scale with the ante', () => {
  const e = freshRun();
  assert.equal(e.blindChips('small'), 300);
  assert.equal(e.blindChips('big'), 450);
  e.ante = 2;
  assert.equal(e.blindChips('small'), 800);
});

test('base scoring is chips times mult', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  const cards = [makeCard(10, 'S'), makeCard(10, 'H')];
  const result = score(e, cards);
  const base = handValues('pair', 1); // 10 chips, 2 mult
  assert.equal(result.chips, base.chips + 10 + 10);
  assert.equal(result.mult, base.mult);
  assert.equal(result.score, (10 + 20) * 2);
});

test('an ace is worth eleven chips', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  const result = score(e, [makeCard(14, 'S')]);
  assert.equal(result.chips, 5 + 11);
  assert.equal(result.score, 16);
});

test('enhancements and editions modify the scoring card', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  const bonus = makeCard(2, 'S', { enhancement: 'bonus' });
  assert.equal(score(e, [bonus]).chips, 5 + 2 + 30);

  const mult = makeCard(2, 'S', { enhancement: 'mult' });
  assert.equal(score(e, [mult]).mult, 1 + 4);

  const glass = makeCard(2, 'S', { enhancement: 'glass' });
  assert.equal(score(e, [glass]).mult, 2);

  const foil = makeCard(2, 'S', { edition: 'foil' });
  assert.equal(score(e, [foil]).chips, 5 + 2 + 50);

  const holo = makeCard(2, 'S', { edition: 'holo' });
  assert.equal(score(e, [holo]).mult, 1 + 10);

  const poly = makeCard(2, 'S', { edition: 'poly' });
  assert.equal(score(e, [poly]).mult, 1.5);
});

test('steel cards only pay out while held in hand', () => {
  const e = startBlind(freshRun());
  const steel = makeCard(5, 'H', { enhancement: 'steel' });
  e.hand = [steel];
  const played = [makeCard(2, 'S')];
  assert.equal(score(e, played).mult, 1.5);
});

test('a red seal retriggers the card', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  const sealed = makeCard(10, 'S', { seal: 'red' });
  // 5 base + 10 + 10 from the two triggers.
  assert.equal(score(e, [sealed]).chips, 25);
});

test('debuffed cards contribute nothing', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  const card = makeCard(10, 'S');
  card.debuffed = true;
  assert.equal(score(e, [card]).chips, 5);
});

test('joker effects apply in board order', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  e.jokers = [e.makeJoker('joker')]; // +4 Mult
  assert.equal(score(e, [makeCard(2, 'S')]).mult, 1 + 4);

  // +4 Mult then X3 Mult reads differently than the reverse order.
  e.jokers = [e.makeJoker('joker'), e.makeJoker('order')];
  const straight = [makeCard(5, 'S'), makeCard(6, 'H'), makeCard(7, 'D'), makeCard(8, 'C'), makeCard(9, 'S')];
  const forward = score(e, straight);
  e.jokers = [e.makeJoker('order'), e.makeJoker('joker')];
  const reversed = score(e, straight);
  assert.equal(forward.mult, (4 + 4) * 3);
  assert.equal(reversed.mult, 4 * 3 + 4);
});

test('blueprint copies the joker to its right', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  e.jokers = [e.makeJoker('blueprint'), e.makeJoker('joker')];
  assert.equal(score(e, [makeCard(2, 'S')]).mult, 1 + 4 + 4);
});

test('brainstorm copies the leftmost joker', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  e.jokers = [e.makeJoker('joker'), e.makeJoker('brainstorm')];
  assert.equal(score(e, [makeCard(2, 'S')]).mult, 1 + 4 + 4);
});

test('joker editions add on top of the joker ability', () => {
  const e = startBlind(freshRun());
  e.hand = [];
  e.jokers = [e.makeJoker('joker', 'holo')];
  assert.equal(score(e, [makeCard(2, 'S')]).mult, 1 + 4 + 10);
});

test('levelling a hand raises its chips and mult', () => {
  const e = freshRun();
  e.levelUpHand('pair', 1, 'test');
  assert.equal(e.handLevels.pair, 2);
  const v = handValues('pair', 2);
  assert.equal(v.chips, 25);
  assert.equal(v.mult, 3);
});

test('the flint halves the base values', () => {
  const e = freshRun();
  e.bossKey = 'flint';
  e.round = 2;
  startBlind(e);
  e.hand = [];
  const result = score(e, [makeCard(2, 'S')]);
  assert.equal(result.chips, Math.ceil(5 / 2) + 2);
  assert.equal(result.mult, 1);
});

test('suit-debuffing bosses knock out their suit', () => {
  const e = freshRun();
  e.bossKey = 'club';
  e.round = 2;
  startBlind(e);
  assert.ok(e.fullDeck.filter((c) => c.suit === 'C').every((c) => c.debuffed));
  assert.ok(e.fullDeck.filter((c) => c.suit === 'S').every((c) => !c.debuffed));
});

test('chicot switches the boss ability off', () => {
  const e = freshRun();
  e.jokers = [e.makeJoker('chicot')];
  e.bossKey = 'club';
  e.round = 2;
  startBlind(e);
  assert.equal(e.blind.disabled, true);
  assert.ok(e.fullDeck.every((c) => !c.debuffed));
});

test('the psychic blind demands five cards', () => {
  const e = freshRun();
  e.bossKey = 'psychic';
  e.round = 2;
  startBlind(e);
  assert.equal(e.canPlay(e.hand.slice(0, 2)).ok, false);
  assert.equal(e.canPlay(e.hand.slice(0, 5)).ok, true);
});

test('beating a blind pays out and advances the round', () => {
  const e = startBlind(freshRun());
  e.score = e.blind.chips;
  const moneyBefore = e.money;
  e.winRound({});
  assert.equal(e.gameState, 'round_won');
  assert.ok(e.money > moneyBefore);
  assert.equal(e.round, 1);
});

test('mr. bones saves a run that got at least a quarter of the way', () => {
  const e = startBlind(freshRun());
  e.jokers = [e.makeJoker('mr_bones')];
  e.score = Math.ceil(e.blind.chips * 0.3);
  e.handsLeft = 0;
  e.loseRound();
  assert.equal(e.gameState, 'round_won');
  assert.equal(e.jokers.length, 0);
});

test('running out of hands without mr. bones ends the run', () => {
  const e = startBlind(freshRun());
  e.score = 1;
  e.handsLeft = 0;
  e.loseRound();
  assert.equal(e.gameState, 'game_over');
});

test('planet cards level up their hand', () => {
  const e = freshRun();
  const card = e.makeConsumable('mercury');
  e.consumables = [card];
  e.useConsumable(card, []);
  assert.equal(e.handLevels.pair, 2);
  assert.equal(e.stats.planetsUsed, 1);
});

test('tarot cards transform the selected cards', () => {
  const e = startBlind(freshRun());
  const card = e.makeConsumable('sun'); // three cards become Hearts
  e.consumables = [card];
  const targets = e.hand.slice(0, 3);
  e.useConsumable(card, targets);
  assert.ok(targets.every((c) => c.suit === 'H'));
  assert.equal(e.consumables.length, 0);
});

test('the hanged man destroys cards for good', () => {
  const e = startBlind(freshRun());
  const before = e.fullDeck.length;
  const card = e.makeConsumable('hanged_man');
  e.consumables = [card];
  e.useConsumable(card, e.hand.slice(0, 2));
  assert.equal(e.fullDeck.length, before - 2);
});

test('black hole levels every hand', () => {
  const e = freshRun();
  const card = e.makeConsumable('black_hole');
  e.consumables = [card];
  e.useConsumable(card, []);
  assert.ok(Object.values(e.handLevels).every((l) => l === 2));
});

test('the shop respects joker and money limits', () => {
  const e = freshRun();
  e.openShop();
  assert.ok(e.shop.items.length >= 2);
  const pricey = { kind: 'joker', key: 'joker', cost: 999, edition: null, uid: 1 };
  assert.equal(e.buyShopItem(pricey), false);
});

test('vouchers change the run permanently', () => {
  const e = freshRun();
  e.money = 50;
  e.openShop();
  e.buyShopItem({ kind: 'voucher', key: 'grabber', cost: 10, uid: 1 });
  assert.equal(e.maxHands, 5);
  e.vouchers.add('paint_brush');
  assert.equal(e.handSize, 9);
});

test('negative editions grant an extra slot', () => {
  const e = freshRun();
  assert.equal(e.jokerSlots, 5);
  e.jokers.push(e.makeJoker('joker', 'negative'));
  assert.equal(e.jokerSlots, 6);
});

test('every deck builds and starts', () => {
  for (const key of DECK_KEYS) {
    const e = freshRun({ deck: key, seed: `DECK${key}` });
    assert.ok(e.fullDeck.length > 0, `${key} produced an empty deck`);
    e.selectBlind();
    assert.ok(e.hand.length > 0, `${key} dealt no cards`);
  }
});

test('every joker can be created and scored with', () => {
  for (const key of JOKER_KEYS) {
    const e = startBlind(freshRun({ seed: `J${key}` }));
    e.jokers = [e.makeJoker(key)];
    const cards = e.hand.slice(0, 5);
    e.hand = e.hand.slice(5);
    assert.doesNotThrow(() => score(e, cards), `joker ${key} threw while scoring`);
    assert.doesNotThrow(() => {
      const def = JOKERS[key];
      const evaluated = e.evaluate(cards);
      const ctx = e.buildContext(evaluated);
      for (const hook of ['onBlindSelected', 'onRoundStart', 'onRoundEnd', 'onBossDefeated', 'onReroll', 'onSkip', 'onPackOpened', 'onShopExit']) {
        if (def[hook]) def[hook](e, e.jokers[0], ctx);
      }
      if (def.onHandPlayed) def.onHandPlayed(e, e.jokers[0] || { state: {} }, ctx);
      if (def.onDiscard) def.onDiscard(e, e.jokers[0] || { state: {} }, cards);
    }, `joker ${key} threw in a lifecycle hook`);
  }
});

test('every consumable can be used', () => {
  for (const key of Object.keys(CONSUMABLES)) {
    const e = startBlind(freshRun({ seed: `C${key}` }));
    e.jokers = [e.makeJoker('joker'), e.makeJoker('sly')];
    e.lastConsumableUsed = 'mercury';
    const card = e.makeConsumable(key);
    e.consumables = [card];
    const [min, max] = e.consumableRequirement(card);
    const selection = min > 0 ? e.hand.slice(0, max) : [];
    assert.doesNotThrow(() => e.useConsumable(card, selection), `consumable ${key} threw`);
  }
});

test('every boss blind can start a round', () => {
  for (const key of Object.keys(BOSSES)) {
    const e = freshRun({ seed: `B${key}` });
    e.ante = BOSSES[key].finisher ? 8 : Math.max(1, BOSSES[key].minAnte || 1);
    e.round = 2;
    e.bossKey = key;
    e.jokers = [e.makeJoker('joker')];
    assert.doesNotThrow(() => e.selectBlind(), `boss ${key} threw on start`);
    const play = e.hand.slice(0, 5);
    if (e.canPlay(play).ok) {
      assert.doesNotThrow(() => e.playHand(play), `boss ${key} threw while scoring`);
    }
  }
});

test('a run survives being saved and restored mid-blind', () => {
  const e = startBlind(freshRun({ seed: 'SAVELOAD' }));
  e.jokers = [e.makeJoker('joker'), e.makeJoker('ride_the_bus')];
  e.consumables = [e.makeConsumable('mercury')];
  e.playHand(e.hand.slice(0, 2));

  const data = JSON.parse(JSON.stringify(e.serialize()));
  const restored = Engine.deserialize(data);

  assert.equal(restored.seed, e.seed);
  assert.equal(restored.score, e.score);
  assert.equal(restored.money, e.money);
  assert.equal(restored.hand.length, e.hand.length);
  assert.equal(restored.jokers.length, 2);
  assert.deepEqual(restored.handLevels, e.handLevels);
  // Restored cards must be the same objects the piles point at.
  assert.ok(restored.hand.every((c) => restored.fullDeck.includes(c)));
});

test('reloading during a booster pack falls back to the shop', () => {
  const e = freshRun({ seed: 'PACKSAVE' });
  e.openShop();
  e.money = 40;
  e.buyPack(e.shop.packs[0]);
  assert.equal(e.gameState, 'pack');
  const restored = Engine.deserialize(JSON.parse(JSON.stringify(e.serialize())));
  assert.equal(restored.gameState, 'shop');
  assert.equal(restored.pack, null);
});

test('a shop never offers the same card twice', () => {
  for (let i = 0; i < 40; i++) {
    const e = freshRun({ seed: `SHOP${i}` });
    e.vouchers.add('overstock');
    e.vouchers.add('overstock_plus');
    e.openShop();
    const keys = e.shop.items.map((it) => it.key).filter(Boolean);
    assert.equal(new Set(keys).size, keys.length, `duplicate in shop for seed SHOP${i}: ${keys}`);
  }
});

test('the same seed produces the same run', () => {
  const a = freshRun({ seed: 'REPEAT' });
  const b = freshRun({ seed: 'REPEAT' });
  a.selectBlind();
  b.selectBlind();
  assert.deepEqual(a.hand.map((c) => `${c.rank}${c.suit}`), b.hand.map((c) => `${c.rank}${c.suit}`));
  a.openShop();
  b.openShop();
  assert.deepEqual(a.shop.items.map((i) => i.key), b.shop.items.map((i) => i.key));
});

test('the autoplayer can grind through whole runs without crashing', () => {
  const seeds = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL'];
  for (const seed of seeds) {
    const e = freshRun({ seed });
    const result = simulate(e);
    assert.notEqual(result.outcome, 'timeout', `seed ${seed} never finished`);
    assert.ok(result.ante >= 1);
  }
});

test('the autoplayer survives every deck', () => {
  for (const deck of DECK_KEYS) {
    const e = freshRun({ deck, seed: `RUN${deck}` });
    const result = simulate(e, { maxSteps: 2000 });
    assert.notEqual(result.outcome, 'timeout', `deck ${deck} never finished`);
  }
});
