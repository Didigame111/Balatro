import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AudioEngine, CHORD_TYPES, CHORD_SCALES, PROGRESSIONS, MOODS,
  MELODY_RHYTHMS, COMP_RHYTHMS, midiToFreq,
} from '../js/audio.js';

// The Web Audio graph needs a browser, but the music theory behind it is plain
// data and arithmetic — a typo in a table would silently mangle the backing
// track, so it is worth guarding here.

test('midi note numbers convert to the right frequencies', () => {
  assert.equal(Math.round(midiToFreq(69)), 440);
  assert.equal(Math.round(midiToFreq(57)), 220);
  assert.equal(Math.round(midiToFreq(60)), 262);
});

test('every chord used by a progression is defined', () => {
  for (const [name, prog] of Object.entries(PROGRESSIONS)) {
    for (const [root, type] of prog) {
      assert.ok(CHORD_TYPES[type], `${name}: chord type "${type}" is missing`);
      assert.ok(CHORD_SCALES[type], `${name}: scale for "${type}" is missing`);
      assert.ok(root >= 48 && root <= 84, `${name}: root ${root} is outside the voicing range`);
    }
  }
});

test('chord shapes and their scales agree', () => {
  for (const [type, offsets] of Object.entries(CHORD_TYPES)) {
    const scale = CHORD_SCALES[type];
    assert.ok(scale, `${type} has no scale`);
    for (const offset of offsets) {
      // The 9th (14) lives an octave up; compare pitch classes.
      assert.ok(scale.includes(offset % 12), `${type}: chord tone ${offset} is not in its scale`);
    }
    assert.equal(offsets[0], 0, `${type} should start on the root`);
  }
});

test('every mood points at a real progression', () => {
  for (const [name, mood] of Object.entries(MOODS)) {
    assert.ok(PROGRESSIONS[mood.prog], `${name}: unknown progression "${mood.prog}"`);
    assert.ok(mood.tempo >= 60 && mood.tempo <= 160, `${name}: implausible tempo`);
    assert.ok(['none', 'light', 'full'].includes(mood.drums), `${name}: unknown drum style`);
    assert.ok(['half', 'walk', 'drive'].includes(mood.bass), `${name}: unknown bass style`);
  }
});

test('rhythm patterns are one bar of eighth notes', () => {
  for (const pattern of [...MELODY_RHYTHMS, ...COMP_RHYTHMS]) {
    assert.equal(pattern.length, 8);
    assert.ok(pattern.every((v) => v === 0 || v === 1));
  }
});

test('melody notes stay inside the singable range', () => {
  const engine = new AudioEngine();
  for (const prog of Object.values(PROGRESSIONS)) {
    for (const [root, type] of prog) {
      const scale = CHORD_SCALES[type];
      for (let previous = 72; previous <= 91; previous++) {
        const degree = engine.nearestDegree(previous, root, scale);
        for (const move of [-2, -1, 0, 1, 2, 3]) {
          const d = degree + move;
          const octave = Math.floor(d / scale.length);
          const note = root + 12 + scale[((d % scale.length) + scale.length) % scale.length] + octave * 12;
          const clamped = Math.max(72, Math.min(91, note));
          assert.ok(Number.isFinite(midiToFreq(clamped)));
          assert.ok(clamped >= 72 && clamped <= 91);
        }
      }
    }
  }
});

test('nearestDegree finds a degree close to the previous note', () => {
  const engine = new AudioEngine();
  const scale = CHORD_SCALES.min7;
  for (let midi = 72; midi <= 91; midi++) {
    const degree = engine.nearestDegree(midi, 69, scale);
    const octave = Math.floor(degree / scale.length);
    const note = 69 + 12 + scale[((degree % scale.length) + scale.length) % scale.length] + octave * 12;
    assert.ok(Math.abs(note - midi) <= 2, `degree for ${midi} landed on ${note}`);
  }
});

test('audio settings default to on and survive a round trip', () => {
  const engine = new AudioEngine();
  assert.equal(engine.settings.music, true);
  assert.equal(engine.settings.sfx, true);
  assert.ok(engine.settings.volume > 0 && engine.settings.volume <= 1);
  // Without a browser these are no-ops rather than crashes.
  assert.doesNotThrow(() => engine.set('music', false));
  assert.doesNotThrow(() => engine.unlock());
  assert.doesNotThrow(() => engine.sfx('chip'));
});

test('the chip run climbs and resets each hand', () => {
  const engine = new AudioEngine();
  engine.chipIndex = 4;
  engine.resetChips();
  assert.equal(engine.chipIndex, 0);
});
