// Bootstrap: menu wiring, autosave, service worker.

import { Engine } from './engine.js';
import { UI } from './ui.js';
import { DECKS, DECK_KEYS } from './data.js';
import { randomSeed } from './rng.js';
import { audio } from './audio.js';

const SAVE_KEY = 'balatro.save.v2';
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.engine = new Engine();
    this.ui = new UI(this.engine, this);
    this.selectedDeck = 'red';

    this.engine.on('state', () => this.save());
    this.buildMenu();
    this.refreshContinue();
  }

  // ── menu ────────────────────────────────────────────────────────────
  buildMenu() {
    const list = $('deck-list');
    for (const key of DECK_KEYS) {
      const deck = DECKS[key];
      const node = document.createElement('div');
      node.className = 'deck-item' + (key === this.selectedDeck ? ' selected' : '');
      node.innerHTML = `<b style="color:${deck.color}">${deck.name}</b><span>${deck.desc}</span>`;
      node.addEventListener('click', () => {
        this.selectedDeck = key;
        [...list.children].forEach((c) => c.classList.remove('selected'));
        node.classList.add('selected');
      });
      list.appendChild(node);
    }

    $('btn-new-run').addEventListener('click', () => {
      $('run-setup').classList.remove('hidden');
      $('run-setup').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('btn-cancel-setup').addEventListener('click', () => $('run-setup').classList.add('hidden'));
    $('btn-start').addEventListener('click', () => this.startRun());
    $('btn-continue').addEventListener('click', () => this.continueRun());
    $('btn-how').addEventListener('click', () => this.showHowTo());
    $('btn-audio').addEventListener('click', () => this.ui.showAudioSettings());
    $('btn-collection').addEventListener('click', () => this.showCollection());
  }

  refreshContinue() {
    $('btn-continue').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
  }

  startRun() {
    const raw = $('seed-input').value.trim().toUpperCase();
    const seed = raw || randomSeed();
    this.engine.newRun({ seed, deck: this.selectedDeck });
    $('run-setup').classList.add('hidden');
    this.ui.selected.clear();
    this.ui.showRunScreen();
  }

  continueRun() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const restored = Engine.deserialize(JSON.parse(raw));
      // Carry the live listeners over to the restored engine.
      restored.listeners = this.engine.listeners;
      this.engine = restored;
      this.ui.e = restored;
      this.ui.selected.clear();
      this.ui.showRunScreen();
      if (restored.gameState === 'round_won' && restored.roundSummary) this.ui.showCashOut(restored.roundSummary);
    } catch (err) {
      console.error('Could not load save', err);
      localStorage.removeItem(SAVE_KEY);
      this.refreshContinue();
    }
  }

  save() {
    const e = this.engine;
    if (!e.seed || e.gameState === 'game_over') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(e.serialize()));
    } catch (err) {
      console.warn('Save failed', err);
    }
  }

  saveAndQuit() {
    this.save();
    this.refreshContinue();
    audio.setMood('menu');
    this.ui.showMenuScreen();
  }

  endRun() {
    localStorage.removeItem(SAVE_KEY);
    this.refreshContinue();
    audio.setMood('menu');
    this.ui.showMenuScreen();
  }

  showHowTo() {
    const node = document.createElement('div');
    node.innerHTML = `
      <h2>How to Play</h2>
      <p>Beat each <b>Blind</b> by scoring at least the required number of chips before you run out of hands.</p>
      <h3>Scoring</h3>
      <p>Score = <b style="color:var(--chips)">Chips</b> × <b style="color:var(--mult)">Mult</b>. Your poker hand sets the base values, each scoring card adds its own chips, and your Jokers pile on top.</p>
      <h3>The Loop</h3>
      <p>Small Blind → Big Blind → Boss Blind, then the Ante goes up. Beat Ante 8 to win. Between blinds you visit the shop to buy Jokers, consumables, vouchers and booster packs.</p>
      <h3>Controls</h3>
      <p>Tap cards to select up to 5. <b>Long-press</b> any card for details. Tap a Joker to inspect, reorder or sell it — Joker order matters, they trigger left to right.</p>
      <h3>Skipping</h3>
      <p>Skip a Small or Big Blind to claim a <b>Tag</b> instead of the cash reward. Risky, but tags are powerful.</p>
    `;
    const close = document.createElement('button');
    close.className = 'btn btn-ghost';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.ui.closeOverlay());
    node.appendChild(close);
    this.ui.openOverlay(node);
  }

  async showCollection() {
    const { JOKERS, JOKER_KEYS, RARITY } = await import('./jokers.js');
    const { CONSUMABLES, TAROT_KEYS, PLANET_KEYS, SPECTRAL_KEYS } = await import('./consumables.js');
    const node = document.createElement('div');
    node.innerHTML = '<h2>Collection</h2>';

    const section = (title, keys, source) => {
      node.insertAdjacentHTML('beforeend', `<h3>${title} <span class="muted">(${keys.length})</span></h3>`);
      const grid = document.createElement('div');
      grid.className = 'shop-grid';
      for (const key of keys) {
        const def = source[key];
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML =
          `<div class="si-emoji">${def.emoji}</div><div class="si-name">${def.name}</div>` +
          (def.rarity ? `<span class="si-rarity" style="background:${RARITY[def.rarity].color}"></span>` : '');
        item.addEventListener('click', () => {
          this.ui.openOverlay(this.ui.infoSheet({
            emoji: def.emoji,
            title: def.name,
            subtitle: def.rarity ? RARITY[def.rarity].name : (def.kind || '').toUpperCase(),
            subtitleColor: def.rarity ? RARITY[def.rarity].color : null,
            desc: typeof def.desc === 'function'
              ? def.desc(def.rarity ? { key, state: {} } : null, null) || ''
              : def.desc || '',
            actions: [{ label: 'Back', onClick: () => this.showCollection() }],
          }));
        });
        grid.appendChild(item);
      }
      node.appendChild(grid);
    };

    try { section('Jokers', JOKER_KEYS, JOKERS); } catch (e) { /* description probes are best effort */ }
    section('Tarots', TAROT_KEYS, CONSUMABLES);
    section('Planets', PLANET_KEYS, CONSUMABLES);
    section('Spectrals', SPECTRAL_KEYS, CONSUMABLES);

    const close = document.createElement('button');
    close.className = 'btn btn-ghost';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.ui.closeOverlay());
    node.appendChild(close);
    this.ui.openOverlay(node);
  }
}

// ── iOS niceties ───────────────────────────────────────────────────────
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
const SCROLLERS = '#stage, .sheet, .sheet-scroll, .card-row, .deck-list, .deck-grid';
window.addEventListener('touchmove', (e) => {
  // Sliders and text fields need their own drags.
  if (e.target.closest && e.target.closest('input, textarea')) return;
  // Block rubber-banding the page itself, but let real scroll containers work.
  const node = e.target.closest ? e.target.closest(SCROLLERS) : null;
  if (node && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) return;
  e.preventDefault();
}, { passive: false });

// Browsers refuse to make noise until the user has interacted with the page,
// so the audio graph is built inside the very first gesture.
function unlockAudio() {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('touchend', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
}
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('touchend', unlockAudio);
window.addEventListener('keydown', unlockAudio);

// A soft click on anything button-like. Cards and the play/discard buttons
// have their own, more specific cues.
document.addEventListener('click', (e) => {
  const target = e.target.closest && e.target.closest('.btn, .sb-btn, .sort-btn, .tab, .bc-state, .bc-skip-btn, .deck-pile, .shop-item, .deck-item, .jtile, .ctile');
  if (!target || target.id === 'btn-play' || target.id === 'btn-discard') return;
  audio.sfx('button');
});

document.addEventListener('visibilitychange', () => audio.handleVisibility(document.hidden));

window.app = new App();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  });
}
