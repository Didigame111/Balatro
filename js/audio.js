// Procedural audio: a small lounge-jazz band and a set of synthesised sound
// effects, all generated with the Web Audio API. No audio files, so the game
// stays a handful of text files and still works offline.
//
// iOS will not let a page make noise until the user has touched it, so the
// AudioContext is created lazily inside the first gesture (see unlock()).

const A4 = 440;
export const midiToFreq = (midi) => A4 * Math.pow(2, (midi - 69) / 12);

// Chord shapes as semitone offsets from the root.
export const CHORD_TYPES = {
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
  dom7b9: [0, 4, 7, 10, 13],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  m7b5: [0, 3, 6, 10],
};

// Scales used to pick melody notes that sit inside the current chord.
export const CHORD_SCALES = {
  min7: [0, 2, 3, 5, 7, 9, 10],
  min9: [0, 2, 3, 5, 7, 9, 10],
  dom7: [0, 2, 4, 5, 7, 9, 10],
  dom9: [0, 2, 4, 5, 7, 9, 10],
  // Half-whole diminished: keeps the natural 5th the voicing plays.
  dom7b9: [0, 1, 3, 4, 6, 7, 9, 10],
  maj7: [0, 2, 4, 5, 7, 9, 11],
  maj9: [0, 2, 4, 5, 7, 9, 11],
  m7b5: [0, 1, 3, 5, 6, 8, 10],
};

// One chord per bar. Root is a MIDI pitch class in the 0-11 range plus 60.
export const PROGRESSIONS = {
  // Relaxed minor turnaround — the default backing for the title and a blind.
  jazz: [
    [69, 'min9'], [62, 'min7'], [67, 'dom9'], [60, 'maj9'],
    [65, 'maj7'], [71, 'm7b5'], [64, 'dom7b9'], [69, 'min9'],
  ],
  // Boss blinds: darker, sits on the minor and leans on the altered dominant.
  dark: [
    [62, 'min9'], [62, 'min9'], [58, 'maj7'], [57, 'dom7b9'],
    [62, 'min9'], [55, 'min7'], [57, 'dom7b9'], [62, 'min9'],
  ],
  // Shop: brighter and lighter on its feet.
  bright: [
    [60, 'maj9'], [69, 'min7'], [62, 'min9'], [67, 'dom9'],
    [64, 'min7'], [69, 'min7'], [62, 'min7'], [67, 'dom7'],
  ],
};

export const MELODY_RHYTHMS = [
  [1, 0, 0, 1, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 1, 0, 0, 1, 0],
  [0, 0, 1, 0, 0, 1, 0, 0],
];

export const COMP_RHYTHMS = [
  [0, 0, 1, 0, 0, 1, 0, 0],
  [0, 1, 0, 0, 1, 0, 0, 0],
  [1, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 1, 0, 0, 0, 1, 0],
];

export const MOODS = {
  menu: { tempo: 82, prog: 'jazz', drums: 'none', bass: 'half', melody: 0.4, gain: 0.9 },
  play: { tempo: 96, prog: 'jazz', drums: 'full', bass: 'walk', melody: 0.32, gain: 1 },
  boss: { tempo: 104, prog: 'dark', drums: 'full', bass: 'drive', melody: 0.24, gain: 1.05 },
  shop: { tempo: 90, prog: 'bright', drums: 'light', bass: 'half', melody: 0.45, gain: 0.9 },
};

const SWING = 0.24;             // how far off-beat 8ths are pushed
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.18;    // seconds of notes queued in advance

const MUSIC_GAIN = 0.72;
const SETTINGS_KEY = 'balatro.audio.v1';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.mood = 'menu';
    this.moodQueued = null;
    this.timer = null;

    this.settings = { music: true, sfx: true, volume: 0.75 };
    this.load();

    // Per-hand state for the ascending "chip" arpeggio.
    this.chipIndex = 0;

    this.step = 0;
    this.bar = 0;
    this.nextNoteTime = 0;
    this.lastMelodyNote = 79;
  }

  // ── settings ────────────────────────────────────────────────────────
  load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.settings, JSON.parse(raw));
    } catch (err) { /* defaults are fine */ }
  }

  save() {
    if (typeof localStorage === 'undefined') return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (err) { /* ignore */ }
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(this.settings.volume, this.ctx.currentTime, 0.02);
    if (key === 'music') {
      if (value) this.startMusic();
      else this.stopMusic();
    }
  }

  // ── graph ───────────────────────────────────────────────────────────
  // Must be called from inside a user gesture the first time.
  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;
    this.limiter.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.settings.volume;
    this.master.connect(this.limiter);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = MUSIC_GAIN;
    this.musicBus.connect(this.master);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 1;
    this.sfxBus.connect(this.master);

    // A generated impulse response gives the band a bit of room to sit in.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.5, 2.6);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.5;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0.3;
    this.reverbSend.connect(this.reverb);

    this.noise = this.makeNoise(2);
    this.ready = true;

    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.settings.music) this.startMusic();
  }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ── small synth helpers ─────────────────────────────────────────────
  env(gainNode, time, peak, attack, decay, sustain = 0, hold = 0) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, time);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), time + attack);
    if (sustain > 0) {
      g.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), time + attack + decay * 0.4);
      g.setValueAtTime(Math.max(0.0001, peak * sustain), time + attack + decay * 0.4 + hold);
      g.exponentialRampToValueAtTime(0.0001, time + attack + decay + hold);
    } else {
      g.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    }
  }

  tone(dest, { type = 'sine', freq, time, dur, peak = 0.2, attack = 0.005, detune = 0, glideTo = null, send = 0 }) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), time + dur);
    if (detune) osc.detune.setValueAtTime(detune, time);
    osc.connect(gain);
    gain.connect(dest);
    if (send > 0) {
      const sendGain = this.ctx.createGain();
      sendGain.gain.value = send;
      gain.connect(sendGain);
      sendGain.connect(this.reverbSend);
    }
    this.env(gain, time, peak, attack, dur);
    osc.start(time);
    osc.stop(time + dur + 0.05);
    return osc;
  }

  noiseHit(dest, { time, dur, peak = 0.2, type = 'highpass', freq = 6000, q = 1, sweepTo = null, send = 0 }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, time);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), time + dur);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    if (send > 0) {
      const sendGain = this.ctx.createGain();
      sendGain.gain.value = send;
      gain.connect(sendGain);
      sendGain.connect(this.reverbSend);
    }
    this.env(gain, time, peak, 0.004, dur);
    src.start(time);
    src.stop(time + dur + 0.05);
  }

  // ── band voices ─────────────────────────────────────────────────────
  kick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.11);
    osc.connect(gain);
    gain.connect(this.musicBus);
    this.env(gain, time, 0.5, 0.004, 0.17);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  brush(time, accent) {
    // Brushed snare: a soft band of noise rather than a crack.
    this.noiseHit(this.musicBus, {
      time, dur: accent ? 0.16 : 0.1, peak: accent ? 0.13 : 0.07,
      type: 'bandpass', freq: 2100, q: 0.7, send: 0.25,
    });
  }

  hat(time, accent) {
    this.noiseHit(this.musicBus, {
      time, dur: accent ? 0.05 : 0.032, peak: accent ? 0.055 : 0.03,
      type: 'highpass', freq: 8200, send: 0.1,
    });
  }

  bassNote(time, midi, dur) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);
    filter.type = 'lowpass';
    filter.frequency.value = 460;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    this.env(gain, time, 0.34, 0.012, dur, 0.55, dur * 0.3);
    osc.start(time);
    osc.stop(time + dur + 0.1);
  }

  compChord(time, root, type, dur) {
    // Rootless-ish voicing: skip the root, the bass already has it.
    const offsets = CHORD_TYPES[type] || CHORD_TYPES.min7;
    const notes = offsets.slice(1).map((o) => root + o);
    for (const midi of notes) {
      const pitch = midi > 79 ? midi - 12 : midi;
      for (const detune of [-6, 6]) {
        this.tone(this.musicBus, {
          type: 'triangle', freq: midiToFreq(pitch), time, dur,
          peak: 0.05, attack: 0.02, detune, send: 0.5,
        });
      }
    }
  }

  vibe(time, midi, dur) {
    // Vibraphone-ish: sine plus a quiet octave, with a slow tremolo.
    const gain = this.ctx.createGain();
    gain.connect(this.musicBus);
    const send = this.ctx.createGain();
    send.gain.value = 0.6;
    gain.connect(send);
    send.connect(this.reverbSend);
    this.env(gain, time, 0.14, 0.006, dur);

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start(time);
    lfo.stop(time + dur + 0.05);

    for (const [mult, level] of [[1, 1], [2, 0.28], [4, 0.06]]) {
      const osc = this.ctx.createOscillator();
      const partial = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(midi) * mult;
      partial.gain.value = level;
      osc.connect(partial);
      partial.connect(gain);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }
  }

  // ── sequencer ───────────────────────────────────────────────────────
  startMusic() {
    if (!this.ready || !this.settings.music || this.timer) return;
    this.step = 0;
    this.bar = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.pickBarPatterns();
    this.applyMoodGain();
    this.timer = setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }

  stopMusic() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  setMood(mood) {
    if (!MOODS[mood] || mood === this.mood) return;
    // Switch at the top of the next bar so the change lands musically.
    this.moodQueued = mood;
    if (!this.timer && this.ready && this.settings.music) {
      this.mood = mood;
      this.moodQueued = null;
      this.startMusic();
    }
  }

  get moodDef() { return MOODS[this.mood] || MOODS.menu; }

  pickBarPatterns() {
    this.melodyPattern = MELODY_RHYTHMS[Math.floor(Math.random() * MELODY_RHYTHMS.length)];
    this.compPattern = COMP_RHYTHMS[Math.floor(Math.random() * COMP_RHYTHMS.length)];
  }

  scheduler() {
    if (!this.ready) return;
    const spb = 60 / this.moodDef.tempo;
    const eighth = spb / 2;
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      // Swing: push the off-beat 8ths later.
      const swing = this.step % 2 === 1 ? eighth * SWING : 0;
      this.scheduleStep(this.nextNoteTime + swing, eighth);
      this.step += 1;
      if (this.step >= 8) {
        this.step = 0;
        this.bar += 1;
        this.pickBarPatterns();
        if (this.moodQueued) { this.mood = this.moodQueued; this.moodQueued = null; this.applyMoodGain(); }
      }
      this.nextNoteTime += eighth;
    }
  }

  scheduleStep(time, eighth) {
    const mood = this.moodDef;
    const prog = PROGRESSIONS[mood.prog];
    const [root, type] = prog[this.bar % prog.length];
    const step = this.step;

    // Drums
    if (mood.drums === 'full') {
      if (step === 0 || step === 5) this.kick(time);
      if (step === 2 || step === 6) this.brush(time, step === 6);
      this.hat(time, step % 2 === 0);
    } else if (mood.drums === 'light') {
      if (step === 2 || step === 6) this.brush(time, false);
      if (step % 2 === 0) this.hat(time, false);
    }

    // Bass
    const bassRoot = root - 24;
    if (mood.bass === 'half') {
      if (step === 0) this.bassNote(time, bassRoot, eighth * 3.4);
      if (step === 4) this.bassNote(time, bassRoot + 7, eighth * 3.4);
    } else if (mood.bass === 'walk') {
      if (step % 2 === 0) {
        const walk = [0, 3, 7, 10][step / 2] || 0;
        const offsets = CHORD_TYPES[type] || CHORD_TYPES.min7;
        const note = bassRoot + (offsets.includes(walk) ? walk : offsets[(step / 2) % offsets.length]);
        this.bassNote(time, note, eighth * 1.7);
      }
    } else if (mood.bass === 'drive') {
      if ([0, 1, 3, 4, 6].includes(step)) {
        this.bassNote(time, bassRoot + (step === 3 || step === 6 ? 12 : 0), eighth * 0.9);
      }
    }

    // Comping chords
    if (this.compPattern[step]) this.compChord(time, root, type, eighth * 2.1);

    // Melody
    if (this.melodyPattern[step] && Math.random() < mood.melody + 0.35) {
      const scale = CHORD_SCALES[type] || CHORD_SCALES.min7;
      // Step up or down a little from the previous note so the line flows.
      const prevDegree = this.nearestDegree(this.lastMelodyNote, root, scale);
      const move = [-2, -1, -1, 0, 1, 1, 2, 3][Math.floor(Math.random() * 8)];
      const degree = prevDegree + move;
      const octave = Math.floor(degree / scale.length);
      const note = root + 12 + scale[((degree % scale.length) + scale.length) % scale.length] + octave * 12;
      const clamped = Math.max(72, Math.min(91, note));
      this.lastMelodyNote = clamped;
      this.vibe(time, clamped, eighth * (Math.random() < 0.3 ? 3.2 : 1.8));
    }
  }

  applyMoodGain() {
    if (!this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(MUSIC_GAIN * this.moodDef.gain, this.ctx.currentTime, 0.4);
  }

  nearestDegree(midi, root, scale) {
    let best = 0;
    let bestDist = Infinity;
    for (let d = -7; d < 14; d++) {
      const octave = Math.floor(d / scale.length);
      const note = root + 12 + scale[((d % scale.length) + scale.length) % scale.length] + octave * 12;
      const dist = Math.abs(note - midi);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  // ── sound effects ───────────────────────────────────────────────────
  resetChips() { this.chipIndex = 0; }

  sfx(name, opts = {}) {
    if (!this.ready || !this.settings.sfx) return;
    const t = this.ctx.currentTime + 0.005;
    const bus = this.sfxBus;
    switch (name) {
      case 'select':
        this.tone(bus, { type: 'triangle', freq: 620, glideTo: 880, time: t, dur: 0.07, peak: 0.16 });
        break;
      case 'deselect':
        this.tone(bus, { type: 'triangle', freq: 760, glideTo: 520, time: t, dur: 0.07, peak: 0.12 });
        break;
      case 'button':
        this.tone(bus, { type: 'square', freq: 340, glideTo: 260, time: t, dur: 0.055, peak: 0.14 });
        break;
      case 'play':
        this.noiseHit(bus, { time: t, dur: 0.22, peak: 0.16, type: 'bandpass', freq: 500, q: 0.8, sweepTo: 3400, send: 0.2 });
        this.tone(bus, { type: 'sine', freq: 300, glideTo: 620, time: t, dur: 0.2, peak: 0.09 });
        break;
      case 'discard':
        this.noiseHit(bus, { time: t, dur: 0.24, peak: 0.15, type: 'bandpass', freq: 2600, q: 0.8, sweepTo: 380 });
        break;
      case 'chip': {
        // The signature ascending run: each scoring card is a step up a
        // major pentatonic, rolling into the next octave.
        const scale = [0, 2, 4, 7, 9];
        const i = this.chipIndex++;
        const midi = 74 + scale[i % scale.length] + 12 * Math.floor(i / scale.length);
        const freq = midiToFreq(Math.min(midi, 103));
        this.tone(bus, { type: 'sine', freq, time: t, dur: 0.2, peak: 0.2, attack: 0.003, send: 0.35 });
        this.tone(bus, { type: 'sine', freq: freq * 2, time: t, dur: 0.12, peak: 0.06, attack: 0.003 });
        this.tone(bus, { type: 'triangle', freq: freq * 0.5, time: t, dur: 0.09, peak: 0.05 });
        break;
      }
      case 'mult':
        this.tone(bus, { type: 'sawtooth', freq: 196, glideTo: 150, time: t, dur: 0.17, peak: 0.13, send: 0.2 });
        this.tone(bus, { type: 'square', freq: 392, time: t, dur: 0.1, peak: 0.05 });
        break;
      case 'xmult':
        for (const [d, delay] of [[-9, 0], [0, 0.005], [9, 0.01]]) {
          this.tone(bus, { type: 'sawtooth', freq: 220, glideTo: 330, time: t + delay, dur: 0.32, peak: 0.1, detune: d, send: 0.4 });
        }
        this.tone(bus, { type: 'sine', freq: 880, glideTo: 1320, time: t, dur: 0.3, peak: 0.07 });
        break;
      case 'money':
        this.tone(bus, { type: 'square', freq: 1046, time: t, dur: 0.09, peak: 0.09 });
        this.tone(bus, { type: 'square', freq: 1568, time: t + 0.06, dur: 0.16, peak: 0.08, send: 0.3 });
        this.noiseHit(bus, { time: t, dur: 0.07, peak: 0.05, type: 'highpass', freq: 5200 });
        break;
      case 'joker':
        this.tone(bus, { type: 'sine', freq: 420, glideTo: 980, time: t, dur: 0.09, peak: 0.13 });
        break;
      case 'levelup':
        [0, 4, 7, 12].forEach((semi, i) => {
          this.tone(bus, { type: 'triangle', freq: midiToFreq(72 + semi), time: t + i * 0.06, dur: 0.24, peak: 0.11, send: 0.4 });
        });
        break;
      case 'buy':
        this.tone(bus, { type: 'square', freq: 784, time: t, dur: 0.07, peak: 0.09 });
        this.tone(bus, { type: 'square', freq: 1175, time: t + 0.05, dur: 0.14, peak: 0.08, send: 0.3 });
        break;
      case 'pack':
        this.noiseHit(bus, { time: t, dur: 0.3, peak: 0.16, type: 'highpass', freq: 900, sweepTo: 5200 });
        this.tone(bus, { type: 'triangle', freq: 523, time: t + 0.12, dur: 0.3, peak: 0.09, send: 0.5 });
        break;
      case 'tag':
        this.tone(bus, { type: 'sine', freq: 1318, time: t, dur: 0.5, peak: 0.1, send: 0.6 });
        this.tone(bus, { type: 'sine', freq: 1976, time: t, dur: 0.35, peak: 0.05, send: 0.6 });
        break;
      case 'win':
        [69, 73, 76, 81].forEach((midi, i) => {
          this.tone(bus, { type: 'triangle', freq: midiToFreq(midi), time: t + i * 0.09, dur: 0.55, peak: 0.13, send: 0.5 });
          this.tone(bus, { type: 'sine', freq: midiToFreq(midi + 12), time: t + i * 0.09, dur: 0.4, peak: 0.05 });
        });
        break;
      case 'lose':
        [65, 61, 58, 53].forEach((midi, i) => {
          this.tone(bus, { type: 'sawtooth', freq: midiToFreq(midi), time: t + i * 0.16, dur: 0.5, peak: 0.1, send: 0.4 });
        });
        break;
      case 'destroy':
        this.noiseHit(bus, { time: t, dur: 0.26, peak: 0.16, type: 'lowpass', freq: 3600, sweepTo: 260 });
        break;
      case 'shuffle':
        for (let i = 0; i < 6; i++) {
          this.noiseHit(bus, { time: t + i * 0.035, dur: 0.06, peak: 0.16, type: 'bandpass', freq: 1400 + i * 260, q: 1.2 });
        }
        break;
      default:
        break;
    }
  }

  // Pause the band when the app is backgrounded.
  handleVisibility(hidden) {
    if (!this.ready) return;
    if (hidden) this.ctx.suspend();
    else if (this.settings.music || this.settings.sfx) this.ctx.resume();
  }
}

export const audio = new AudioEngine();
