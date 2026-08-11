// Bootstrap: menu wiring, autosave, service worker.

import { Engine } from './engine.js';
import { UI } from './ui.js';
import { DECKS, DECK_KEYS } from './data.js';
import { randomSeed } from './rng.js';
import { audio } from './audio.js';
import { Tutorial, clearTutorialSeen } from './tutorial.js';

const SAVE_KEY = 'balatro.save.v2';
const PROFILE_KEY = 'balatro.profile.v1';
const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.engine = new Engine();
    this.ui = new UI(this.engine, this);
    this.selectedDeck = 'red';
    this.wantTutorial = false;

    this.profile = this.loadProfile();
    this.engine.on('state', () => this.save());
    this.engine.on('game_over', () => this.recordRun(false));
    this.engine.on('won', () => this.recordRun(true));
    this.buildMenu();
    this.refreshContinue();
  }

  // ── profile: what carries across runs ───────────────────────────────
  loadProfile() {
    const blank = { runs: 0, wins: 0, bestScore: 0, bestAnte: 0, handsPlayed: 0, decksWon: {} };
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return raw ? Object.assign(blank, JSON.parse(raw)) : blank;
    } catch (err) { return blank; }
  }

  saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile)); } catch (err) { /* ignore */ }
  }

  recordRun(won) {
    const e = this.engine;
    const p = this.profile;
    p.runs += 1;
    if (won) {
      p.wins += 1;
      p.decksWon[e.deckKey] = (p.decksWon[e.deckKey] || 0) + 1;
    }
    p.bestScore = Math.max(p.bestScore, e.stats.bestHand || 0);
    p.bestAnte = Math.max(p.bestAnte, e.ante || 0);
    p.handsPlayed += e.stats.handsPlayed || 0;
    this.saveProfile();
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

    $('btn-new-run').addEventListener('click', () => this.showDeckChooser(true));
    $('btn-cancel-setup').addEventListener('click', () => this.showDeckChooser(false));
    $('btn-start').addEventListener('click', () => this.startRun());
    $('btn-continue').addEventListener('click', () => this.continueRun());
    $('btn-how').addEventListener('click', () => this.showHowTo());
    $('btn-audio').addEventListener('click', () => this.ui.showAudioSettings());
    $('btn-collection').addEventListener('click', () => this.showCollection());
  }

  showDeckChooser(on) {
    $('run-setup').classList.toggle('hidden', !on);
    $('screen-menu').classList.toggle('choosing', on);
  }

  refreshContinue() {
    $('btn-continue').classList.toggle('hidden', !localStorage.getItem(SAVE_KEY));
    const p = this.profile;
    const line = $('menu-profile');
    if (!line) return;
    if (!p.runs) { line.classList.add('hidden'); return; }
    line.classList.remove('hidden');
    line.innerHTML =
      `<b>${p.wins}</b> win${p.wins === 1 ? '' : 's'} in <b>${p.runs}</b> run${p.runs === 1 ? '' : 's'}` +
      ` &middot; best ante <b>${p.bestAnte}</b> &middot; best hand <b>${p.bestScore.toLocaleString()}</b>`;
  }

  startRun() {
    const raw = $('seed-input').value.trim().toUpperCase();
    const seed = raw || randomSeed();
    this.engine.newRun({ seed, deck: this.selectedDeck });
    this.showDeckChooser(false);
    this.ui.selected.clear();
    this.ui.showRunScreen();
    // Coach the very first run, and any run started from "Replay Tutorial".
    if (this.wantTutorial || Tutorial.shouldAutoStart(this.profile)) {
      this.wantTutorial = false;
      this.ui.tutorial.start();
    }
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
    const row = document.createElement('div');
    row.className = 'row-buttons';
    const replay = document.createElement('button');
    replay.className = 'btn btn-gold';
    replay.textContent = 'Replay Tutorial';
    replay.addEventListener('click', () => this.replayTutorial());
    row.appendChild(replay);
    const close = document.createElement('button');
    close.className = 'btn btn-ghost';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.ui.closeOverlay());
    row.appendChild(close);
    node.appendChild(row);
    this.ui.openOverlay(node);
  }

  // Mid-run there is nothing sensible to coach through, so the tutorial is
  // armed for the next new run instead of interrupting this one.
  replayTutorial() {
    clearTutorialSeen();
    this.wantTutorial = true;
    this.ui.closeOverlay();
    if (this.engine.seed && !$('screen-run').classList.contains('hidden')) {
      this.ui.toast('Tutorial will run on your next new run', 'good');
    } else {
      this.showDeckChooser(true);
    }
  }

  async showCollection() {
    const { JOKERS, JOKER_KEYS, RARITY } = await import('./jokers.js');
    const { CONSUMABLES, TAROT_KEYS, PLANET_KEYS, SPECTRAL_KEYS } = await import('./consumables.js');
    const { jokerArt, consumableArt } = await import('./art.js');
    const { haptics } = await import('./haptics.js');

    const node = document.createElement('div');
    node.innerHTML = '<h2>Collection</h2>';

    const section = (title, keys, source, artOf) => {
      node.insertAdjacentHTML('beforeend', `<h3>${title} <span class="muted">(${keys.length})</span></h3>`);
      const grid = document.createElement('div');
      grid.className = 'collection-grid';
      for (const key of keys) {
        const def = source[key];
        const item = document.createElement('div');
        item.className = 'collection-item';
        item.innerHTML = artOf(key, def);
        item.title = def.name;
        if (def.rarity) {
          const dot = document.createElement('span');
          dot.className = 'si-rarity';
          dot.style.background = RARITY[def.rarity].color;
          item.appendChild(dot);
        }
        item.addEventListener('click', () => {
          haptics.tap();
          this.ui.openOverlay(this.ui.infoSheet({
            art: artOf(key, def),
            title: def.name,
            subtitle: def.rarity ? RARITY[def.rarity].name : (def.kind || '').toUpperCase(),
            subtitleColor: def.rarity ? RARITY[def.rarity].color : null,
            desc: describe(def, key),
            actions: [{ label: 'Back', onClick: () => this.showCollection() }],
          }), { narrow: true });
        });
        grid.appendChild(item);
      }
      node.appendChild(grid);
    };

    const describe = (def, key) => {
      try {
        return typeof def.desc === 'function'
          ? def.desc(def.rarity ? { key, state: {} } : null, null) || ''
          : def.desc || '';
      } catch (err) {
        return def.rarity ? 'Buy this Joker to see it in action.' : '';
      }
    };

    section('Jokers', JOKER_KEYS, JOKERS, (key, def) => jokerArt(key, def.rarity));
    section('Tarots', TAROT_KEYS, CONSUMABLES, (key) => consumableArt({ kind: 'tarot', key }, TAROT_KEYS.indexOf(key)));
    section('Planets', PLANET_KEYS, CONSUMABLES, (key) => consumableArt({ kind: 'planet', key }));
    section('Spectrals', SPECTRAL_KEYS, CONSUMABLES, (key) => consumableArt({ kind: 'spectral', key }));

    const close = document.createElement('button');
    close.className = 'btn btn-gold';
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
