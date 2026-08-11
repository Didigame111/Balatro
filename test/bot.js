// A crude autoplayer used by the tests to exercise the whole engine.

import { handValues } from '../js/data.js';
import { cardChips } from '../js/cards.js';
import { CONSUMABLES } from '../js/consumables.js';

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

// Rough "what would this score" estimate, ignoring jokers.
function estimate(engine, cards) {
  const ev = engine.evaluate(cards);
  const base = handValues(ev.key, engine.handLevels[ev.key] || 1);
  const chips = base.chips + ev.scoring.reduce((sum, c) => sum + (c.debuffed ? 0 : cardChips(c)), 0);
  return chips * base.mult;
}

export function bestPlay(engine) {
  let best = null;
  let bestScore = -1;
  for (let size = 1; size <= Math.min(5, engine.hand.length); size++) {
    for (const combo of combinations(engine.hand, size)) {
      if (!engine.canPlay(combo).ok) continue;
      const score = estimate(engine, combo);
      if (score > bestScore) { bestScore = score; best = combo; }
    }
  }
  return best;
}

// Throw away the lowest cards that are not part of the best hand.
export function worstDiscard(engine) {
  const keep = new Set(bestPlay(engine) || []);
  const rest = engine.hand.filter((c) => !keep.has(c)).sort((a, b) => a.rank - b.rank);
  return rest.slice(0, Math.min(5, rest.length));
}

export function simulate(engine, { maxSteps = 4000, spend = true, useConsumables = true } = {}) {
  let steps = 0;
  while (steps++ < maxSteps) {
    const state = engine.gameState;

    if (state === 'game_over' || state === 'won') return { outcome: state, steps, ante: engine.ante };

    if (state === 'blind_select') {
      if (engine.currentBlindType !== 'boss' && engine.rng.chance(1, 8)) engine.skipBlind();
      else engine.selectBlind();
      continue;
    }

    if (state === 'playing') {
      if (useConsumables && engine.consumables.length && engine.rng.chance(1, 3)) {
        const card = engine.consumables[0];
        const [min, max] = engine.consumableRequirement(card);
        const selection = min > 0 ? engine.hand.slice(0, Math.min(max, engine.hand.length)) : [];
        if (engine.canUseConsumable(card, selection).ok) { engine.useConsumable(card, selection); continue; }
      }
      const play = bestPlay(engine);
      const needMore = play && estimate(engine, play) < (engine.blind.chips - engine.score) / Math.max(1, engine.handsLeft);
      if (engine.discardsLeft > 0 && needMore) {
        const toss = worstDiscard(engine);
        if (toss.length && engine.canDiscard(toss).ok) { engine.discard(toss); continue; }
      }
      if (!play) {
        // Nothing legal to play: burn a discard, or accept the loss.
        const toss = engine.hand.slice(0, 1);
        if (engine.discardsLeft > 0 && engine.canDiscard(toss).ok) engine.discard(toss);
        else engine.handsLeft = 0, engine.loseRound();
        continue;
      }
      engine.playHand(play);
      continue;
    }

    if (state === 'round_won') { engine.proceedAfterRound(); continue; }

    if (state === 'pack') {
      const option = engine.pack.options[0];
      if (!option || !engine.takePackOption(option)) engine.skipPack();
      continue;
    }

    if (state === 'shop') {
      if (spend) {
        let bought = true;
        while (bought) {
          bought = false;
          for (const item of engine.shop.items.slice()) {
            if (item.cost <= engine.money - 2 && engine.buyShopItem(item)) { bought = true; break; }
          }
          if (engine.shop && engine.shop.voucher && engine.shop.voucher.cost <= engine.money - 4) {
            engine.buyShopItem(engine.shop.voucher);
            bought = true;
          }
          if (engine.gameState !== 'shop') break;
        }
        if (engine.gameState === 'shop' && engine.shop.packs.length && engine.rng.chance(1, 2)) {
          const pack = engine.shop.packs[0];
          if (pack.cost <= engine.money - 2) { engine.buyPack(pack); continue; }
        }
      }
      if (engine.gameState === 'shop') engine.exitShop();
      continue;
    }

    throw new Error(`bot got stuck in state "${state}"`);
  }
  return { outcome: 'timeout', steps, ante: engine.ante };
}

export function consumableCount() { return Object.keys(CONSUMABLES).length; }
