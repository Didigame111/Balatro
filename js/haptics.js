// Touch feedback.
//
// The Vibration API covers Android and desktop Chrome. iOS Safari does not
// implement it at all, but since 17.4 a `<input type="checkbox" switch>` emits
// a real haptic tick when it is toggled inside a user gesture — so that is used
// as a best-effort fallback. Both paths are no-ops where unsupported.

const SETTINGS_KEY = 'balatro.haptics.v1';

class Haptics {
  constructor() {
    this.enabled = true;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw != null) this.enabled = raw === '1';
    } catch (err) { /* default on */ }
    this.switchEl = null;
    this.supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  attach(el) { this.switchEl = el; }

  set(enabled) {
    this.enabled = enabled;
    try { localStorage.setItem(SETTINGS_KEY, enabled ? '1' : '0'); } catch (err) { /* ignore */ }
    if (enabled) this.tap();
  }

  fire(pattern) {
    if (!this.enabled) return;
    if (this.supported) {
      try { navigator.vibrate(pattern); } catch (err) { /* ignore */ }
    }
    // iOS fallback: toggling a switch control ticks the Taptic Engine.
    if (this.switchEl) {
      try { this.switchEl.checked = !this.switchEl.checked; } catch (err) { /* ignore */ }
    }
  }

  tap() { this.fire(8); }               // a button or a card
  select() { this.fire(6); }            // picking a card up
  soft() { this.fire(4); }              // each chip in the scoring run
  bump() { this.fire(14); }             // a joker or multiplier landing
  heavy() { this.fire(26); }            // the score total
  success() { this.fire([14, 50, 26]); }
  levelUp() { this.fire([10, 40, 10, 40, 22]); }
  fail() { this.fire([40, 60, 40, 60, 90]); }
}

export const haptics = new Haptics();
