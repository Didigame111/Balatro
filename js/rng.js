// Seeded pseudo-random number generation.
// A run is fully determined by its seed, so runs can be shared and replayed.

function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.seed = typeof seed === 'string' ? seed : String(seed);
    this.state = hashString(this.seed) || 0x9e3779b9;
    this.calls = 0;
  }

  // mulberry32
  next() {
    this.calls++;
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive) {
    return Math.floor(this.next() * maxExclusive);
  }

  range(minInclusive, maxInclusive) {
    return minInclusive + this.int(maxInclusive - minInclusive + 1);
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  // Weighted pick. `weightOf` maps an entry to a positive number.
  weighted(arr, weightOf) {
    let total = 0;
    for (const item of arr) total += weightOf(item);
    if (total <= 0) return null;
    let roll = this.next() * total;
    for (const item of arr) {
      roll -= weightOf(item);
      if (roll <= 0) return item;
    }
    return arr[arr.length - 1];
  }

  // "1 in n" check.
  chance(numerator, denominator) {
    return this.next() * denominator < numerator;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  save() {
    return { seed: this.seed, state: this.state, calls: this.calls };
  }

  static load(data) {
    const rng = new RNG(data.seed);
    rng.state = data.state;
    rng.calls = data.calls;
    return rng;
  }
}

const SEED_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789';

export function randomSeed() {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)];
  }
  return out;
}
