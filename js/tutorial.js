// The opening tutorial: a coached first run, the way Balatro teaches you.
//
// Steps spotlight a piece of the interface and wait for the player to do the
// thing, rather than dumping a wall of rules up front. Everything here is
// advisory — the tutorial never owns game state, it only watches the engine
// and points at the DOM. If a step's anchor is missing the step waits, and
// every step can be dismissed, so a coaching bug can never trap a run.

const DONE_KEY = 'balatro.tutorial.v1';
const $ = (id) => document.getElementById(id);

function seen() {
  try { return localStorage.getItem(DONE_KEY) === 'done'; } catch (err) { return false; }
}

export function markTutorialSeen() {
  try { localStorage.setItem(DONE_KEY, 'done'); } catch (err) { /* private mode */ }
}

export function clearTutorialSeen() {
  try { localStorage.removeItem(DONE_KEY); } catch (err) { /* private mode */ }
}

export function tutorialSeen() { return seen(); }

// Each step: where to point, what to say, and what finishes it.
//
//   anchor   () => Element | null   what to spotlight; null centres the card
//   body     () => string           the copy
//   done     'event' | () => bool   advances on an engine event or a poll
//   next     string                 label for the dismiss button, if any
//   when     () => bool             the run state this step belongs to
//   gate     boolean                block taps outside the spotlight
//
// `when` drives both waiting and catching up: a step whose state has not
// arrived yet hides the layer until it does, and one the run has already
// moved past is jumped over as soon as a later step's state matches.
const STEPS = [
  {
    id: 'welcome',
    body: () => 'Welcome to <b>Balatro</b>.<br>Beat each <b>Blind</b> by building poker hands worth enough chips.',
    next: "Let's play",
  },
  {
    id: 'blind',
    anchor: () => document.querySelector('.blind-col.current'),
    body: (e) => `This is the <b>Small Blind</b>. You need <b class="v-blue">${e.blindInfo('small').chips.toLocaleString()}</b> chips to beat it, and four hands to get there.`,
    next: 'Got it',
    when: (e) => e.gameState === 'blind_select',
  },
  {
    id: 'select',
    anchor: () => document.querySelector('.blind-col.current .bc-state.select'),
    body: () => 'Tap <b>Select</b> to take it on.',
    done: 'blind_started',
    gate: true,
    when: (e) => e.gameState === 'blind_select',
  },
  {
    id: 'hand',
    anchor: () => $('hand-zone'),
    body: () => 'These are your cards. Tap up to <b>5</b> of them to pick the hand you want to play.',
    done: (e, ui) => ui.selected.size > 0,
    gate: true,
    when: (e) => e.gameState === 'playing',
  },
  {
    id: 'readout',
    anchor: () => document.querySelector('.sb-handzone'),
    body: () => 'Your selection makes a poker hand. It scores <b class="v-blue">Chips</b> <b>×</b> <b class="v-red">Mult</b> — better hands start higher, and each card adds its own chips.',
    next: 'Got it',
    when: (e) => e.gameState === 'playing',
  },
  {
    id: 'play',
    anchor: () => $('btn-play'),
    body: () => 'Now tap <b>Play Hand</b> and watch it score.',
    done: 'hand_scored',
    gate: true,
    when: (e) => e.gameState === 'playing',
  },
  {
    id: 'discard',
    anchor: () => $('btn-discard'),
    body: () => 'Dealt junk? <b>Discard</b> up to 5 cards and draw replacements. Discards are limited too, so spend them well.',
    next: 'Got it',
    when: (e) => e.gameState === 'playing',
  },
  {
    id: 'counters',
    anchor: () => document.querySelector('.sb-col-right'),
    body: () => 'Hands and discards left, your money, and how far through the run you are. Run out of hands before you beat the Blind and the run ends.',
    next: 'Got it',
    when: (e) => e.gameState === 'playing',
  },
  {
    id: 'cashout',
    // The whole sheet, not just the button: the scrim would otherwise dim the
    // very payout breakdown this step is talking about.
    anchor: () => document.querySelector('.overlay .sheet'),
    body: () => 'Blind beaten. You keep the reward, plus <b class="v-gold">$1</b> interest for every <b class="v-gold">$5</b> you have saved — so it pays not to spend everything.',
    done: 'shop_opened',
    gate: true,
    when: (e) => e.gameState === 'round_won',
  },
  {
    id: 'shop',
    anchor: () => document.querySelector('.shop-top .shop-rack'),
    body: () => 'The shop. <b>Jokers</b> live here — they change how your hands score and they are how runs are won. Tap one to read what it does.',
    next: 'Got it',
    when: (e) => e.gameState === 'shop',
  },
  {
    id: 'packs',
    anchor: () => document.querySelector('.shop-bottom'),
    body: () => 'Below: a <b>Voucher</b> for a permanent upgrade, and <b>Booster Packs</b> holding Tarots, Planets and cards to improve your deck.',
    next: 'Got it',
    when: (e) => e.gameState === 'shop',
  },
  {
    id: 'nextround',
    anchor: () => document.querySelector('.shop-btn-red'),
    body: () => 'Buy what you can afford, then move on. Beat <b>Ante 8</b> to win the run.<br>Good luck.',
    next: 'Finish',
    when: (e) => e.gameState === 'shop',
  },
];

export class Tutorial {
  constructor(ui) {
    this.ui = ui;
    this.index = -1;
    this.active = false;
    this.layer = null;
    this.onResize = () => this.sync();
  }

  // Loading a save swaps the engine out from under the UI, so read it live
  // rather than holding a reference that can go stale.
  get engine() { return this.ui.e; }

  static shouldAutoStart(profile) {
    return !seen() && !(profile && profile.runs > 0);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.index = -1;
    this.buildLayer();
    window.addEventListener('resize', this.onResize);
    this.advance();
  }

  stop(complete) {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('resize', this.onResize);
    if (this.layer) { this.layer.remove(); this.layer = null; }
    if (complete) markTutorialSeen();
  }

  // The engine forwards everything; only the current step's trigger matters.
  handleEvent(name) {
    if (!this.active) return;
    // Losing the run mid-coaching leaves nothing left to point at.
    if (name === 'game_over') { this.stop(true); return; }
    const at = this.index;
    const step = STEPS[at];
    if (step && step.done === name) {
      // Let the scoring animation land before pointing somewhere new, and
      // only advance if a render has not already moved us on.
      setTimeout(() => { if (this.index === at) this.advance(); }, name === 'hand_scored' ? 900 : 260);
    }
  }

  ready(i) {
    const step = STEPS[i];
    return !!step && (!step.when || step.when(this.engine, this.ui));
  }

  advance() {
    this.index += 1;
    if (this.index >= STEPS.length) { this.stop(true); return; }
    this.render();
    this.sync();
  }

  // Called after every UI render: the stage is rebuilt from scratch, so the
  // anchor element the step is pointing at is a different node each time.
  sync() {
    if (!this.active || !this.layer) return;
    if (this.engine.gameState === 'shop') this.sawShop = true;

    if (!this.ready(this.index)) {
      // A later step matching the current state means the run has moved past
      // this one; otherwise its moment simply has not come round yet.
      const ahead = STEPS.findIndex((s, i) => i > this.index && this.ready(i));
      if (ahead < 0) {
        // The coached round ends when the shop does. Anything still queued at
        // that point has missed its moment for good, and waiting on a state
        // that will not come back would leave the tutorial unfinished for ever.
        const inShop = this.engine.gameState === 'shop' || this.engine.gameState === 'pack';
        if (this.sawShop && !inShop) { this.stop(true); return; }
        this.layer.classList.add('waiting');
        this.setBlockers(null);
        return;
      }
      this.index = ahead;
      this.render();
    }

    const step = STEPS[this.index];
    if (!step) return;
    this.layer.classList.remove('waiting');
    if (typeof step.done === 'function' && step.done(this.engine, this.ui)) { this.advance(); return; }
    this.position(step);
  }

  buildLayer() {
    const layer = document.createElement('div');
    layer.className = 'tut-layer';
    layer.innerHTML = `
      <div class="tut-hole"></div>
      <div class="tut-block tut-block-t"></div>
      <div class="tut-block tut-block-b"></div>
      <div class="tut-block tut-block-l"></div>
      <div class="tut-block tut-block-r"></div>
      <div class="tut-card">
        <p class="tut-body"></p>
        <div class="tut-row">
          <button class="tut-skip" type="button">Skip tutorial</button>
          <button class="tut-next" type="button">Got it</button>
        </div>
      </div>`;
    document.getElementById('app').appendChild(layer);
    layer.querySelector('.tut-skip').addEventListener('click', () => this.stop(true));
    layer.querySelector('.tut-next').addEventListener('click', () => this.advance());
    this.layer = layer;
  }

  render() {
    const step = STEPS[this.index];
    const l = this.layer;
    l.querySelector('.tut-body').innerHTML = step.body(this.engine, this.ui);
    const next = l.querySelector('.tut-next');
    next.textContent = step.next || 'Got it';
    next.classList.toggle('hidden', !step.next);
  }

  position(step) {
    const l = this.layer;
    const hole = l.querySelector('.tut-hole');
    const card = l.querySelector('.tut-card');
    const el = step.anchor ? step.anchor() : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (!el) {
      // Nothing to point at: centre the card and dim everything evenly.
      l.classList.add('no-anchor');
      this.setBlockers(step.gate ? { top: 0, left: 0, width: 0, height: 0 } : null);
      hole.style.opacity = '0';
      card.style.left = `${vw / 2 - card.offsetWidth / 2}px`;
      card.style.top = `${vh / 2 - card.offsetHeight / 2}px`;
      return;
    }

    l.classList.remove('no-anchor');
    const r = el.getBoundingClientRect();
    const pad = 6;
    const box = {
      top: Math.max(0, r.top - pad),
      left: Math.max(0, r.left - pad),
      width: Math.min(vw, r.width + pad * 2),
      height: Math.min(vh, r.height + pad * 2),
    };
    hole.style.opacity = '1';
    hole.style.top = `${box.top}px`;
    hole.style.left = `${box.left}px`;
    hole.style.width = `${box.width}px`;
    hole.style.height = `${box.height}px`;
    // The gate opening is deliberately looser than the spotlight: cards fan
    // past their container and thumbs are imprecise, so a near miss should
    // still reach the control the step is asking for.
    this.setBlockers(step.gate ? {
      top: Math.max(0, box.top - 12),
      left: Math.max(0, box.left - 12),
      width: box.width + 24,
      height: box.height + 24,
    } : null);

    // Put the card wherever there is the most room around the spotlight.
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 10;
    const room = {
      below: vh - (box.top + box.height),
      above: box.top,
      right: vw - (box.left + box.width),
      left: box.left,
    };
    let top;
    let left;
    if (room.below >= ch + gap || room.below >= room.above) {
      top = Math.min(vh - ch - 4, box.top + box.height + gap);
    } else {
      top = Math.max(4, box.top - ch - gap);
    }
    if (room.right >= cw + gap && room.right >= room.left) {
      left = Math.min(vw - cw - 4, box.left + box.width / 2 - cw / 2);
    } else {
      left = Math.max(4, box.left + box.width / 2 - cw / 2);
    }
    left = Math.max(4, Math.min(vw - cw - 4, left));
    top = Math.max(4, Math.min(vh - ch - 4, top));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  // Four panes around the spotlight. Taps land on them instead of the game,
  // which keeps a gated step on the one control it is asking for.
  setBlockers(box) {
    const l = this.layer;
    const on = !!box;
    l.classList.toggle('gated', on);
    if (!on) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const set = (sel, css) => Object.assign(l.querySelector(sel).style, css);
    set('.tut-block-t', { top: '0px', left: '0px', width: `${vw}px`, height: `${box.top}px` });
    set('.tut-block-b', { top: `${box.top + box.height}px`, left: '0px', width: `${vw}px`, height: `${Math.max(0, vh - box.top - box.height)}px` });
    set('.tut-block-l', { top: `${box.top}px`, left: '0px', width: `${box.left}px`, height: `${box.height}px` });
    set('.tut-block-r', { top: `${box.top}px`, left: `${box.left + box.width}px`, width: `${Math.max(0, vw - box.left - box.width)}px`, height: `${box.height}px` });
  }
}
