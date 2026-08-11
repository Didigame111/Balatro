import test from 'node:test';
import assert from 'node:assert/strict';

import { jokerArt, consumableArt, packArt, voucherArt, tagArt, JOKER_ART } from '../js/art.js';
import { JOKER_KEYS, JOKERS } from '../js/jokers.js';
import { TAROT_KEYS, PLANET_KEYS, SPECTRAL_KEYS } from '../js/consumables.js';
import { PACKS } from '../js/data.js';

// The art is generated, so the guard rails are structural: every card must get
// a drawing, ids must not collide, and nothing may fall through to a blank.

function assertSvg(svg, label) {
  assert.ok(svg.startsWith('<svg'), `${label}: not an svg`);
  assert.ok(svg.endsWith('</svg>'), `${label}: unterminated svg`);
  assert.ok(!/undefined|NaN|\[object/.test(svg), `${label}: unresolved value in markup`);
  // A bare frame with no shapes on it would mean the motif silently vanished.
  const shapes = (svg.match(/<(path|circle|rect|ellipse|text|g)\b/g) || []).length;
  assert.ok(shapes >= 3, `${label}: only ${shapes} shapes drawn`);
}

test('every joker gets drawn art', () => {
  for (const key of JOKER_KEYS) assertSvg(jokerArt(key), key);
});

test('no joker art entry points at a motif that does not exist', () => {
  // A bad motif name would quietly fall back to a jester, which is easy to
  // miss by eye across 143 cards.
  for (const [key, spec] of Object.entries(JOKER_ART)) {
    assert.ok(JOKERS[key], `art defined for unknown joker "${key}"`);
    if (!spec.motif) continue;
    const svg = jokerArt(key);
    // Jesters always draw the collar ellipse at cy="112"; motifs never do.
    assert.ok(!svg.includes('cy="112"'), `${key}: motif "${spec.motif}" fell back to a jester`);
  }
});

test('every consumable gets drawn art', () => {
  for (const key of TAROT_KEYS) assertSvg(consumableArt({ kind: 'tarot', key }, TAROT_KEYS.indexOf(key)), key);
  for (const key of PLANET_KEYS) assertSvg(consumableArt({ kind: 'planet', key }), key);
  for (const key of SPECTRAL_KEYS) assertSvg(consumableArt({ kind: 'spectral', key }), key);
});

test('packs, vouchers and tags all draw', () => {
  for (const pack of PACKS) assertSvg(packArt(pack.kind), pack.key);
  assertSvg(voucherArt(), 'voucher');
  assertSvg(tagArt('💰'), 'tag');
});

test('element ids are unique across every kind of card on screen at once', () => {
  // Gradients and clip paths are referenced by id, so a duplicate anywhere
  // makes one card bleed into another.
  const svg = [
    ...JOKER_KEYS.map((k) => jokerArt(k)),
    ...TAROT_KEYS.map((k) => consumableArt({ kind: 'tarot', key: k }, TAROT_KEYS.indexOf(k))),
    ...PLANET_KEYS.map((k) => consumableArt({ kind: 'planet', key: k })),
    ...SPECTRAL_KEYS.map((k) => consumableArt({ kind: 'spectral', key: k })),
    ...PACKS.map((p) => packArt(p.kind)),
    voucherArt(), tagArt('💰'),
  ].join('');
  const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id would cross-contaminate cards');
});

test('art is stable for a given key', () => {
  // Same key, same drawing — otherwise a joker would change look on re-render.
  const strip = (s) => s.replace(/a[0-9a-z]+/g, 'ID');
  for (const key of ['joker', 'baron', 'mr_bones', 'blueprint']) {
    assert.equal(strip(jokerArt(key)), strip(jokerArt(key)), key);
  }
});
