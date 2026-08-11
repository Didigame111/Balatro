// Rendering and touch interaction for the landscape table layout.

import { SUITS, rankLabel, cardName, shortCardName, ENHANCEMENTS, EDITIONS, SEALS, cardChips } from './cards.js';
import { HAND_ORDER, HAND_NAMES } from './poker.js';
import { JOKERS, RARITY, jokerDesc } from './jokers.js';
import { CONSUMABLES, consumableDesc, TAROT_KEYS } from './consumables.js';
import { DECKS, VOUCHERS, PACK_BY_KEY, TAGS, handValues, BASE_CONFIG } from './data.js';
import { RNG } from './rng.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { jokerArt, consumableArt, packArt, voucherArt, tagArt } from './art.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function h(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

// Traditional pip positions as percentages of the card face. The columns sit
// inboard of the corner indices and the rows start below them, so nothing
// collides at phone sizes. Pips past the halfway line are drawn upside down.
const PIP_LAYOUT = {
  2: [[50, 20], [50, 80]],
  3: [[50, 20], [50, 50], [50, 80]],
  4: [[30, 20], [70, 20], [30, 80], [70, 80]],
  5: [[30, 20], [70, 20], [50, 50], [30, 80], [70, 80]],
  6: [[30, 20], [70, 20], [30, 50], [70, 50], [30, 80], [70, 80]],
  7: [[30, 20], [70, 20], [50, 35], [30, 50], [70, 50], [30, 80], [70, 80]],
  8: [[30, 20], [70, 20], [50, 35], [30, 50], [70, 50], [50, 65], [30, 80], [70, 80]],
  9: [[30, 20], [70, 20], [30, 40], [70, 40], [50, 50], [30, 60], [70, 60], [30, 80], [70, 80]],
  10: [[30, 20], [70, 20], [30, 40], [70, 40], [50, 30], [50, 70], [30, 60], [70, 60], [30, 80], [70, 80]],
};

// How long the scoring animation takes, as a multiplier.
const SPEED_KEY = 'balatro.speed.v1';
const SPEEDS = { slow: 1.7, normal: 1, fast: 0.55 };
const COLOUR_KEY = 'balatro.deckcolour.v1';

const HAND_WORDS = new Set(Object.values(HAND_NAMES).map((n) => n.toLowerCase()));
const NOUN_WORDS = new Set(['blind', 'joker', 'jokers', 'tarot', 'planet', 'spectral',
  'booster pack', 'card', 'cards', 'hand', 'hands', 'discard', 'discards', 'ante', 'round',
  'boss blind', 'small blind', 'big blind', 'consumable', 'voucher', 'seal', 'edition']);

const NOUN_RE = new RegExp(
  `\\b(${[...HAND_WORDS, ...NOUN_WORDS].sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

// Colour the game's nouns wherever they appear in running text, not just
// inside the <b> runs. Done over text nodes so no markup can be mangled.
function highlightNouns(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement.closest('.kw')) continue;
    if (NOUN_RE.test(node.nodeValue)) targets.push(node);
    NOUN_RE.lastIndex = 0;
  }
  for (const text of targets) {
    const span = document.createElement('span');
    span.innerHTML = text.nodeValue.replace(NOUN_RE, '<span class="kw-noun">$1</span>');
    text.parentNode.replaceChild(span, text);
  }
}

// Wrap the <b> runs a description already carries in a coloured chip chosen by
// what the text is about: chips blue, mult red, money gold, nouns orange.
function styleDesc(html) {
  return String(html || '').replace(/<b>(.*?)<\/b>/g, (_, inner) => {
    const text = inner.replace(/<[^>]+>/g, '').trim();
    const lower = text.toLowerCase();
    let cls = 'kw-plain';
    if (/mult/i.test(text)) cls = 'kw-mult';
    else if (/chips?/i.test(text)) cls = 'kw-chips';
    else if (/^-?\$/.test(text)) cls = 'kw-money';
    else if (/^[X×]\d/i.test(text)) cls = 'kw-mult';
    else if (/^\+?\d+$/.test(text)) cls = 'kw-plain';
    else if (HAND_WORDS.has(lower) || NOUN_WORDS.has(lower)) cls = 'kw-noun';
    else if (/\b(in)\b/.test(lower) && /\d/.test(text)) cls = 'kw-noun';
    return `<span class="kw ${cls}">${inner}</span>`;
  });
}

// Art for anything that can sit in a card slot.
function artFor(item) {
  if (item.kind === 'joker') return jokerArt(item.key, (JOKERS[item.key] || {}).rarity);
  if (item.kind === 'pack') return packArt(PACK_BY_KEY[item.packKey].kind);
  if (item.kind === 'voucher') return voucherArt();
  if (item.kind === 'playing') return null;
  return consumableArt({ kind: item.kind, key: item.key }, TAROT_KEYS.indexOf(item.key));
}

export class UI {
  constructor(engine, app) {
    this.e = engine;
    this.app = app;
    this.selected = new Set();
    this.animating = false;
    this.longPressTimer = null;
    this.runInfoTab = 'hands';
    this.lastRenderedUids = new Set();
    this.speed = 'normal';
    this.deckColour = 'four';
    try {
      const saved = localStorage.getItem(SPEED_KEY);
      if (saved && SPEEDS[saved]) this.speed = saved;
      const colour = localStorage.getItem(COLOUR_KEY);
      if (colour === 'two' || colour === 'four') this.deckColour = colour;
    } catch (err) { /* defaults are fine */ }
    document.body.classList.toggle('two-colour', this.deckColour === 'two');

    this.bindStaticControls();
    engine.on('state', () => { if (!this.animating) this.render(); });
    engine.on('toast', ({ text, kind }) => this.toast(text, kind));
    // End-of-round overlays wait until the scoring animation has finished.
    engine.on('round_won', (s) => this.later(() => { audio.sfx('win'); haptics.success(); this.showCashOut(s); }));
    engine.on('game_over', (info) => this.later(() => { audio.sfx('lose'); haptics.fail(); this.showGameOver(info); }));
    engine.on('won', () => this.later(() => { audio.sfx('win'); this.showVictory(); }));
    engine.on('pack_opened', () => { audio.sfx('pack'); haptics.bump(); });
    engine.on('tag_gained', ({ tag }) => { audio.sfx('tag'); haptics.bump(); this.toast(`${tag.emoji} ${tag.name}`, 'good'); });
    engine.on('card_destroyed', () => audio.sfx('destroy'));
    engine.on('blind_started', () => audio.setMood(engine.blind.type === 'boss' && !engine.blind.disabled ? 'boss' : 'play'));
    engine.on('shop_opened', () => audio.setMood('shop'));
    engine.on('cards_discarded', () => audio.sfx('discard'));
    engine.on('created', ({ kind, key, source }) => {
      const name = kind === 'joker' ? (JOKERS[key] || {}).name : (CONSUMABLES[key] || {}).name;
      if (name) this.toast(`${source}: ${name}`, 'good');
    });
    engine.on('hand_leveled', ({ key, level, amount, source }) => {
      // A single upgrade gets the full sidebar animation; bulk upgrades (Black
      // Hole levels all twelve hands) fall back to a toast so it stays brisk.
      if (this.animating || this.levellingUp) {
        this.toast(`${source}: ${HAND_NAMES[key]} → lvl ${level}`, amount > 0 ? 'good' : 'warn');
        if (amount > 0) audio.sfx('levelup');
        return;
      }
      this.playLevelUp(key, level, amount, source);
    });

    window.addEventListener('resize', () => { if (!this.animating) this.render(); });
  }

  bindStaticControls() {
    $('btn-play').addEventListener('click', () => { haptics.tap(); this.onPlay(); });
    $('btn-discard').addEventListener('click', () => { haptics.tap(); this.onDiscard(); });
    $('btn-sort-rank').addEventListener('click', () => { haptics.tap(); this.setSort('rank'); });
    $('btn-sort-suit').addEventListener('click', () => { haptics.tap(); this.setSort('suit'); });
    $('btn-runinfo').addEventListener('click', () => { haptics.tap(); this.showRunInfo(); });
    $('btn-options').addEventListener('click', () => { haptics.tap(); this.showOptionsMenu(); });
    $('deck-pile').addEventListener('click', () => { haptics.tap(); this.showDeckView(); });
    haptics.attach($('haptic-tick'));
  }

  later(fn) {
    if (!this.animating) fn();
    else this.deferred = fn;
  }

  flushDeferred() {
    const fn = this.deferred;
    this.deferred = null;
    if (fn) fn();
  }

  setSort(mode) {
    this.e.setSortMode(mode);
    $('btn-sort-rank').classList.toggle('active', mode === 'rank');
    $('btn-sort-suit').classList.toggle('active', mode === 'suit');
  }

  // ── screens ─────────────────────────────────────────────────────────
  showRunScreen() {
    $('screen-menu').classList.add('hidden');
    $('screen-run').classList.remove('hidden');
    this.render();
  }

  showMenuScreen() {
    $('screen-run').classList.add('hidden');
    $('screen-menu').classList.remove('hidden');
    this.closeOverlay();
  }

  // ── master render ───────────────────────────────────────────────────
  render() {
    const e = this.e;
    if (!e.seed) return;
    const playing = e.gameState === 'playing';

    $('screen-run').classList.toggle('playing', playing);
    $('play-area').classList.toggle('hidden', !playing);
    $('hand-zone').classList.toggle('hidden', !playing);
    $('action-row').classList.toggle('hidden', !playing);

    this.renderSidebar();
    this.renderTrays();
    this.renderStage();
    if (playing) {
      this.renderHand();
      this.updateActionButtons();
      if (!this.animating) this.previewHand();
    }
    this.syncMood();
  }

  // ── sidebar ─────────────────────────────────────────────────────────
  renderSidebar() {
    const e = this.e;
    const choosing = e.gameState === 'blind_select';
    const shopping = e.gameState === 'shop' || e.gameState === 'pack';

    $('sb-choose').classList.toggle('hidden', !choosing);
    $('sb-shop-panel').classList.toggle('hidden', !shopping);
    $('sb-blind-panel').classList.toggle('hidden', choosing || shopping);

    if (!choosing && !shopping && e.blind) {
      const info = e.blindInfo(e.blind.type);
      const panel = $('sb-blind-panel');
      panel.classList.toggle('big', e.blind.type === 'big');
      panel.classList.toggle('boss', e.blind.type === 'boss');
      $('sb-blind-title').textContent = info.name;
      $('sb-blind-req').textContent = fmt(e.blind.chips);
      $('sb-blind-reward').textContent = '$'.repeat(info.reward);
      $('sb-blind-desc').textContent = e.blind.type === 'boss'
        ? (e.blind.disabled ? 'Effect disabled' : info.desc)
        : '';
      const chip = $('sb-blind-chip');
      chip.className = `blind-chip ${e.blind.type === 'big' ? 'big' : ''} ${e.blind.type === 'boss' ? 'boss' : ''}`;
      chip.innerHTML = e.blind.type === 'boss' ? info.emoji : (e.blind.type === 'big' ? 'BIG<br>BLIND' : 'SMALL<br>BLIND');
    }

    $('sb-score').textContent = fmt(e.score || 0);
    $('ct-hands').textContent = e.handsLeft != null && e.gameState === 'playing' ? e.handsLeft : e.maxHands;
    $('ct-discards').textContent = e.discardsLeft != null && e.gameState === 'playing' ? e.discardsLeft : e.maxDiscards;
    $('ct-money').textContent = `$${e.money}`;
    $('ct-ante').textContent = e.ante;
    $('ct-round').textContent = choosing ? e.round : e.round + 1;
    // Outside a blind the deck has not been dealt from yet.
    const remaining = e.gameState === 'playing' ? e.drawPile.length : e.fullDeck.length;
    $('ct-deck').textContent = `${remaining}/${e.fullDeck.length}`;
  }

  // The hand readout: what you are about to play and what it is worth.
  previewHand() {
    const e = this.e;
    const selected = e.hand.filter((c) => this.selected.has(c.uid));
    const nameEl = $('sb-hand-name');
    const levelEl = $('sb-hand-level');
    if (!selected.length) {
      nameEl.textContent = '';
      levelEl.classList.add('hidden');
      $('sb-chips').textContent = '0';
      $('sb-mult').textContent = '0';
      return;
    }
    const ev = e.evaluate(selected);
    const level = e.handLevels[ev.key] || 1;
    const v = handValues(ev.key, level);
    nameEl.textContent = ev.name;
    levelEl.textContent = `lvl.${level}`;
    levelEl.classList.remove('hidden');
    $('sb-chips').textContent = fmt(v.chips);
    $('sb-mult').textContent = fmt(v.mult);
  }

  updateActionButtons() {
    const e = this.e;
    if (e.gameState !== 'playing') return;
    const selected = this.selectedCards();
    $('btn-play').classList.toggle('ready', e.canPlay(selected).ok);
    $('btn-discard').classList.toggle('ready', e.canDiscard(selected).ok);
  }

  // ── hand ────────────────────────────────────────────────────────────
  renderHand(explicit) {
    const row = $('hand-row');
    row.innerHTML = '';
    const e = this.e;
    const cards = explicit || e.hand;
    $('ct-handsize').textContent = `${cards.length}/${e.handSize}`;

    // Anything that was not on screen last time gets dealt in.
    const previous = this.lastRenderedUids;
    let dealt = 0;
    cards.forEach((card) => {
      const node = this.cardEl(card);
      if (this.selected.has(card.uid)) node.classList.add('selected');
      if (e.bossActive('bell') && e.forcedCard === card) node.dataset.forced = '1';
      if (!previous.has(card.uid)) {
        node.classList.add('dealt');
        node.style.animationDelay = `${dealt * 45}ms`;
        dealt += 1;
      }
      this.attachCardHandlers(node, card);
      row.appendChild(node);
    });
    this.lastRenderedUids = new Set(cards.map((c) => c.uid));

    this.layoutHand();
  }

  // Fan the hand into Balatro's shallow arc, squeezing it if it overflows.
  layoutHand() {
    const row = $('hand-row');
    const nodes = [...row.children];
    const n = nodes.length;
    if (!n) return;

    const cardW = nodes[0].offsetWidth || 46;
    const gap = 3;
    // clientWidth still counts the padding that keeps the fan clear of the
    // deck pile, so measure the content box or a big hand spills off the left
    // edge and slides under the sidebar.
    const pad = getComputedStyle(row);
    const available = row.clientWidth
      - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) - 6;
    const natural = n * cardW + (n - 1) * gap;
    const squeeze = natural > available && n > 1 ? (natural - available) / (n - 1) : 0;

    nodes.forEach((node, i) => {
      const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0;
      const angle = t * 6.5;
      const dip = t * t * cardW * 0.22;
      const lift = node.classList.contains('selected') ? -cardW * 0.34 : 0;
      node.style.marginLeft = i === 0 ? '0' : `${gap - squeeze}px`;
      node.style.transform = `translateY(${dip + lift}px) rotate(${angle}deg)`;
      node.style.zIndex = String(i + 1);
    });
  }

  cardEl(card) {
    const node = h('div', `pcard suit-${card.suit}`);
    node.dataset.uid = card.uid;
    if (card.enhancement) node.classList.add(`enh-${card.enhancement}`);
    if (card.edition) node.classList.add(`ed-${card.edition}`);
    if (card.debuffed && !card.faceDown) node.classList.add('debuffed');
    if (card.faceDown) node.classList.add('facedown');

    const corner = (cls) =>
      `<span class="pc-corner ${cls}"><span class="pc-rank">${rankLabel(card.rank)}</span>` +
      `<span class="pc-suit pip-shape"></span></span>`;

    let middle;
    if (card.rank === 14) {
      middle = '<span class="pc-center pip-shape"></span>';
    } else if (card.rank >= 11) {
      middle = `<span class="pc-face">${rankLabel(card.rank)}</span>`;
    } else {
      const pips = (PIP_LAYOUT[card.rank] || [])
        .map(([x, y]) => `<span class="pc-pip pip-shape${y > 50 ? ' flip' : ''}" style="left:${x}%;top:${y}%"></span>`)
        .join('');
      middle = `<span class="pc-pips">${pips}</span>`;
    }

    node.innerHTML =
      corner('') + corner('pc-corner-b') + middle +
      (card.edition ? '<span class="pc-edition"></span>' : '') +
      (card.seal ? `<span class="pc-seal seal-${card.seal}"></span>` : '');
    return node;
  }

  attachCardHandlers(node, card) {
    const start = () => {
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        this.showCardInfo(card);
      }, 420);
    };
    const cancel = () => { if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; } };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchend', () => { if (this.longPressTimer) { cancel(); this.toggleCard(card); } });
    node.addEventListener('touchmove', cancel, { passive: true });
    node.addEventListener('touchcancel', cancel);
    node.addEventListener('click', () => { if (!('ontouchstart' in window)) this.toggleCard(card); });
    node.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.showCardInfo(card); });
  }

  toggleCard(card) {
    if (this.animating) return;
    if (this.selected.has(card.uid)) { this.selected.delete(card.uid); audio.sfx('deselect'); haptics.soft(); }
    else {
      if (this.selected.size >= 5) { this.toast('Maximum 5 cards', 'warn'); haptics.fail(); return; }
      this.selected.add(card.uid);
      audio.sfx('select');
      haptics.select();
    }
    const node = $('hand-row').querySelector(`[data-uid="${card.uid}"]`);
    if (node) node.classList.toggle('selected', this.selected.has(card.uid));
    this.layoutHand();
    this.previewHand();
    this.updateActionButtons();
  }

  selectedCards() { return this.e.hand.filter((c) => this.selected.has(c.uid)); }

  // ── trays ───────────────────────────────────────────────────────────
  renderTrays() {
    const e = this.e;
    const jokers = $('jokers-row');
    jokers.innerHTML = '';
    $('jokers-count').textContent = `${e.jokers.length}/${e.jokerSlots}`;
    if (!e.jokers.length) jokers.appendChild(h('div', 'tray-empty', 'Jokers'));
    for (const joker of e.jokers) {
      const def = JOKERS[joker.key] || {};
      const node = h('div', `jtile rarity-${def.rarity || 'common'}`);
      node.dataset.jokerUid = joker.uid;
      if (joker.edition) node.classList.add(`edition-${joker.edition}`);
      if (joker === e.disabledJoker) node.classList.add('disabled');
      if (joker.flipped) node.classList.add('flipped');
      node.innerHTML = jokerArt(joker.key, def.rarity) +
        (joker.edition === 'negative' ? '<span class="neg-badge">NEG</span>' : '');
      node.title = def.name || joker.key;
      node.addEventListener('click', () => { haptics.tap(); this.showJokerInfo(joker); });
      jokers.appendChild(node);
    }

    const cons = $('consumables-row');
    cons.innerHTML = '';
    $('cons-count').textContent = `${e.consumables.length}/${e.consumableSlots}`;
    if (!e.consumables.length) cons.appendChild(h('div', 'tray-empty', 'Consumables'));
    for (const card of e.consumables) {
      const def = CONSUMABLES[card.key] || {};
      const node = h('div', `ctile kind-${def.kind || 'tarot'}`);
      if (card.negative) node.classList.add('edition-negative');
      node.innerHTML = consumableArt(card, TAROT_KEYS.indexOf(card.key));
      node.title = def.name || card.key;
      node.addEventListener('click', () => { haptics.tap(); this.showConsumableInfo(card); });
      cons.appendChild(node);
    }
  }

  // ── stage: blind select / shop ──────────────────────────────────────
  renderStage() {
    const stage = $('stage');
    const e = this.e;
    stage.innerHTML = '';
    if (e.gameState === 'blind_select') this.renderBlindSelect(stage);
    else if (e.gameState === 'shop') this.renderShop(stage);
    else if (e.gameState === 'pack') this.renderPack(stage);
    $('table').dataset.pack = e.gameState === 'pack' && e.pack ? e.pack.def.kind : '';
  }

  renderBlindSelect(stage) {
    const e = this.e;
    const wrap = h('div', 'blind-columns');
    const order = e.blindOrder();
    const currentIndex = e.round % 3;

    order.forEach((type, i) => {
      wrap.appendChild(this.blindColumn(type, i, currentIndex, true));
    });
    stage.appendChild(wrap);
  }

  blindColumn(type, index, currentIndex, interactive) {
    const e = this.e;
    const info = e.blindInfo(type);
    const isCurrent = index === currentIndex;
    const col = h('div', `blind-col type-${type} ${isCurrent ? 'current' : ''} ${index < currentIndex ? 'beaten' : ''} ${index === currentIndex + 1 ? 'next' : ''}`);

    if (isCurrent && interactive) {
      const select = h('button', 'bc-state select', 'Select');
      select.addEventListener('click', () => { haptics.tap(); this.selected.clear(); e.selectBlind(); });
      col.appendChild(select);
    } else {
      col.appendChild(h('div', 'bc-state', index < currentIndex ? 'Defeated' : 'Upcoming'));
    }

    col.appendChild(h('div', 'bc-name', info.name));

    const chip = h('div', `blind-chip ${type === 'big' ? 'big' : ''} ${type === 'boss' ? 'boss' : ''}`);
    chip.innerHTML = type === 'boss' ? info.emoji : (type === 'big' ? 'BIG<br>BLIND' : 'SMALL<br>BLIND');
    col.appendChild(chip);

    if (type === 'boss') col.appendChild(h('div', 'bc-effect', info.desc));

    col.appendChild(h('div', 'bc-req', 'Score at least'));
    col.appendChild(h('div', 'bc-req-value', `<i class="chip"></i>${fmt(info.chips)}`));
    col.appendChild(h('div', 'bc-reward', `Reward: <b>${'$'.repeat(info.reward)}+</b>`));

    if (info.skippable && interactive) {
      col.appendChild(h('div', 'bc-or', 'or'));
      const tag = TAGS[e.tagFor(type)] || null;
      const skipRow = h('div', 'bc-skip');
      const tagBadge = h('div', 'bc-tag');
      tagBadge.innerHTML = tagArt(tag ? tag.emoji : '🎟');
      if (tag) tagBadge.title = `${tag.name} — ${tag.desc}`;
      tagBadge.addEventListener('click', () => {
        if (!tag) return;
        haptics.tap();
        this.openOverlay(this.infoSheet({
          art: tagArt(tag.emoji), title: tag.name, subtitle: 'Skip Tag', desc: tag.desc,
        }), { narrow: true });
      });
      skipRow.appendChild(tagBadge);
      const skip = h('button', 'bc-skip-btn', 'Skip Blind');
      skip.disabled = !isCurrent;
      skip.addEventListener('click', () => { haptics.tap(); e.skipBlind(); });
      skipRow.appendChild(skip);
      col.appendChild(skipRow);
    } else if (type === 'boss') {
      const note = h('div', 'bc-ante');
      note.innerHTML = `<b>Up the Ante</b><span>Raise all Blinds<br>Refresh Blinds</span>`;
      col.appendChild(note);
      if (interactive && (e.hasVoucher('directors_cut') || e.hasVoucher('retcon'))) {
        const canReroll = e.hasVoucher('retcon') || e.bossRerollsThisAnte < 1;
        const reroll = h('button', 'bc-skip-btn', 'Reroll $10');
        reroll.disabled = !canReroll;
        reroll.addEventListener('click', () => e.rerollBoss());
        col.appendChild(reroll);
      }
    }
    return col;
  }

  renderShop(stage) {
    const e = this.e;
    const shop = e.shop;
    if (!shop) return;

    const panel = h('div', 'shop-panel');

    const top = h('div', 'shop-top');
    const controls = h('div', 'shop-controls');
    const next = h('button', 'shop-btn shop-btn-red', 'Next<br>Round');
    next.addEventListener('click', () => { haptics.tap(); e.exitShop(); });
    const rerollCost = shop.freeRerolls > 0 ? 0 : shop.rerollCost;
    const reroll = h('button', 'shop-btn shop-btn-green', `Reroll<br><b>$${rerollCost}</b>`);
    reroll.addEventListener('click', () => { haptics.tap(); e.rerollShop(); });
    controls.appendChild(next);
    controls.appendChild(reroll);
    top.appendChild(controls);

    const rack = h('div', 'shop-rack');
    for (const item of shop.items) rack.appendChild(this.shopItemEl(item));
    if (!shop.items.length) rack.appendChild(h('div', 'tray-empty', 'Sold out'));
    top.appendChild(rack);
    panel.appendChild(top);

    const bottom = h('div', 'shop-bottom');
    const voucherBay = h('div', 'shop-bay shop-bay-voucher');
    voucherBay.appendChild(h('div', 'bay-label', `Ante ${e.ante} Voucher`));
    const voucherRack = h('div', 'shop-rack');
    if (shop.voucher) voucherRack.appendChild(this.shopItemEl(shop.voucher));
    else voucherRack.appendChild(h('div', 'tray-empty', 'Redeemed'));
    voucherBay.appendChild(voucherRack);
    bottom.appendChild(voucherBay);

    const packBay = h('div', 'shop-bay');
    const packRack = h('div', 'shop-rack');
    for (const pack of shop.packs) packRack.appendChild(this.shopItemEl(pack));
    if (!shop.packs.length) packRack.appendChild(h('div', 'tray-empty', 'No packs'));
    packBay.appendChild(packRack);
    bottom.appendChild(packBay);

    panel.appendChild(bottom);
    stage.appendChild(panel);
  }

  shopItemEl(item) {
    const node = h('div', 'shop-item');
    const view = this.describeItem(item);
    const art = artFor(item);
    const slot = h('div', 'shop-card');
    if (art) slot.innerHTML = art;
    else slot.appendChild(this.cardEl(item.card));
    node.appendChild(slot);
    node.appendChild(h('div', `price-tag ${item.cost === 0 ? 'free' : ''}`, item.cost === 0 ? 'FREE' : `$${item.cost}`));
    node.appendChild(h('div', 'shop-name', view.name));
    if (view.rarityColor) {
      // On the card itself, not the slot — the slot's foot is the name.
      const dot = h('span', 'si-rarity');
      dot.style.background = view.rarityColor;
      slot.appendChild(dot);
    }
    node.title = view.name;
    node.addEventListener('click', () => { haptics.tap(); this.showShopItemInfo(item); });
    return node;
  }

  describeItem(item) {
    if (item.kind === 'joker') {
      const def = JOKERS[item.key];
      return { emoji: def.emoji, name: def.name, rarityColor: RARITY[def.rarity].color, def };
    }
    if (item.kind === 'voucher') return { emoji: '🎟', name: VOUCHERS[item.key].name };
    if (item.kind === 'pack') {
      const p = PACK_BY_KEY[item.packKey];
      const emoji = { tarot: '🔮', planet: '🪐', playing: '🎴', joker: '🤡', spectral: '👻' }[p.kind];
      return { emoji, name: p.name };
    }
    if (item.kind === 'playing') return { emoji: '🎴', name: shortCardName(item.card) };
    const def = CONSUMABLES[item.key];
    return { emoji: def.emoji, name: def.name };
  }

  // ── overlays ────────────────────────────────────────────────────────
  openOverlay(node, opts = {}) {
    const overlay = $('overlay');
    overlay.innerHTML = '';
    const sheet = h('div', `sheet ${opts.narrow ? 'narrow' : ''}`);
    sheet.appendChild(node);
    overlay.appendChild(sheet);
    overlay.classList.remove('hidden');
    overlay.onclick = (ev) => { if (ev.target === overlay && !opts.sticky) this.closeOverlay(); };
  }

  closeOverlay() {
    $('overlay').classList.add('hidden');
    $('overlay').innerHTML = '';
  }

  infoSheet({ emoji, art, title, subtitle, subtitleColor, desc, badge, badgeClass, actions = [], onClose }) {
    const node = h('div');
    node.innerHTML =
      `<div class="info-head">
         <div class="${art ? 'info-art' : 'info-emoji'}">${art || emoji}</div>
         <div class="info-title"><b>${title}</b><span style="color:${subtitleColor || 'var(--ink-dim)'}">${subtitle || ''}</span></div>
       </div>
       <div class="info-desc">${styleDesc(desc)}</div>` +
      (badge ? `<div class="rarity-badge ${badgeClass || ''}">${badge}</div>` : '');
    highlightNouns(node.querySelector('.info-desc'));
    const bar = h('div', 'info-actions');
    for (const a of actions) {
      const btn = h('button', `btn ${a.cls || 'btn-ghost'}`, a.label);
      if (a.disabled) btn.disabled = true;
      btn.addEventListener('click', () => { this.closeOverlay(); a.onClick(); });
      bar.appendChild(btn);
    }
    const close = h('button', 'btn btn-ghost', onClose ? 'Back' : 'Close');
    close.addEventListener('click', () => { this.closeOverlay(); if (onClose) onClose(); });
    bar.appendChild(close);
    node.appendChild(bar);
    return node;
  }

  showCardInfo(card) {
    const parts = [`<b>+${cardChips(card)} Chips</b> when scored`];
    if (card.enhancement) parts.push(`<b>${ENHANCEMENTS[card.enhancement].name}</b> — ${ENHANCEMENTS[card.enhancement].desc}`);
    if (card.edition) parts.push(`<b>${EDITIONS[card.edition].name}</b> — ${EDITIONS[card.edition].desc}`);
    if (card.seal) parts.push(`<b>${SEALS[card.seal].name}</b> — ${SEALS[card.seal].desc}`);
    if (card.debuffed) parts.push('<b style="color:var(--mult)">Debuffed</b> — scores nothing this round');
    this.openOverlay(this.infoSheet({
      emoji: SUITS[card.suit].symbol,
      title: cardName(card),
      subtitle: 'Playing card',
      desc: parts.join('<br>'),
    }), { narrow: true });
  }

  showJokerInfo(joker) {
    const e = this.e;
    const def = JOKERS[joker.key] || {};
    const index = e.jokers.indexOf(joker);
    const actions = [{ label: `Sell $${e.sellValue(joker)}`, cls: 'btn-gold', onClick: () => e.sellJoker(joker) }];
    if (index > 0) actions.push({ label: '◀', onClick: () => e.moveJoker(index, index - 1) });
    if (index < e.jokers.length - 1) actions.push({ label: '▶', onClick: () => e.moveJoker(index, index + 1) });
    this.openOverlay(this.infoSheet({
      art: jokerArt(joker.key, def.rarity),
      title: def.name || joker.key,
      subtitle: joker.edition ? EDITIONS[joker.edition].name : '',
      subtitleColor: RARITY[def.rarity] ? RARITY[def.rarity].color : null,
      desc: jokerDesc(joker, e) + (joker.edition ? `<br><span class="muted">${EDITIONS[joker.edition].desc}</span>` : ''),
      badge: RARITY[def.rarity] ? RARITY[def.rarity].name : null,
      badgeClass: `rarity-${def.rarity}`,
      actions,
    }), { narrow: true });
  }

  showConsumableInfo(card) {
    const e = this.e;
    const def = CONSUMABLES[card.key] || {};
    const selected = this.selectedCards();
    const check = e.canUseConsumable(card, selected);
    const [min, max] = e.consumableRequirement(card);
    const hint = min > 0 ? `<br><span class="muted">Select ${min === max ? min : `${min}–${max}`} card(s) in your hand first.</span>` : '';
    const usableNow = e.gameState === 'playing' || min === 0;
    const sellFor = Math.max(1, Math.floor((def.cost || 3) / 2));
    this.openOverlay(this.infoSheet({
      art: consumableArt(card, TAROT_KEYS.indexOf(card.key)),
      title: def.name || card.key,
      subtitle: '',
      badge: (def.kind || '').toUpperCase(),
      badgeClass: `kind-${def.kind}`,
      desc: consumableDesc(card, e) + hint + (check.ok ? '' : `<br><span style="color:var(--gold)">${check.reason}</span>`),
      actions: [
        {
          label: 'Use', cls: 'btn-green', disabled: !check.ok || !usableNow,
          onClick: () => { if (e.useConsumable(card, selected)) { this.selected.clear(); this.render(); } },
        },
        {
          label: `Sell $${sellFor}`, cls: 'btn-gold',
          onClick: () => {
            const i = e.consumables.indexOf(card);
            if (i >= 0) e.consumables.splice(i, 1);
            e.addMoney(sellFor, 'Sold');
            e.emit('state');
          },
        },
      ],
    }), { narrow: true });
  }

  showShopItemInfo(item) {
    const e = this.e;
    const view = this.describeItem(item);
    let desc = '';
    let subtitle = '';
    let badge = null;
    let badgeClass = '';
    if (item.kind === 'joker') {
      desc = jokerDesc({ key: item.key, state: makeProbeState(item.key) }, e);
      subtitle = item.edition ? EDITIONS[item.edition].name : '';
      badge = RARITY[view.def.rarity].name;
      badgeClass = `rarity-${view.def.rarity}`;
      if (item.edition) desc += `<br><span class="muted">${EDITIONS[item.edition].desc}</span>`;
    } else if (item.kind === 'voucher') {
      desc = VOUCHERS[item.key].desc;
      subtitle = 'Voucher — permanent';
    } else if (item.kind === 'pack') {
      const p = PACK_BY_KEY[item.packKey];
      const kindName = { tarot: 'Tarot', planet: 'Planet', playing: 'playing', joker: 'Joker', spectral: 'Spectral' }[p.kind];
      desc = `Choose <b>${p.choose}</b> of <b>${p.size}</b> ${kindName} cards.`;
      subtitle = 'Booster Pack';
    } else if (item.kind === 'playing') {
      desc = `Adds this card permanently to your deck.<br><b>+${cardChips(item.card)} Chips</b> when scored`;
      if (item.card.enhancement) desc += `<br><b>${ENHANCEMENTS[item.card.enhancement].name}</b> — ${ENHANCEMENTS[item.card.enhancement].desc}`;
      if (item.card.seal) desc += `<br><b>${SEALS[item.card.seal].name}</b> — ${SEALS[item.card.seal].desc}`;
      subtitle = 'Playing card';
    } else {
      desc = consumableDesc({ key: item.key }, e);
      badge = item.kind.toUpperCase();
      badgeClass = `kind-${item.kind}`;
    }
    const affordable = e.canAfford(item.cost);
    this.openOverlay(this.infoSheet({
      art: artFor(item),
      emoji: view.emoji,
      title: view.name,
      subtitle,
      subtitleColor: view.rarityColor,
      desc,
      badge,
      badgeClass,
      actions: [{
        label: item.kind === 'pack' ? `Open $${item.cost}` : `Buy $${item.cost}`,
        cls: affordable ? 'btn-green' : 'btn-ghost',
        disabled: !affordable,
        onClick: () => {
          if (item.kind === 'pack') e.buyPack(item);
          else if (e.buyShopItem(item)) audio.sfx('buy');
        },
      }],
    }), { narrow: true });
  }

  // ── pack opening ────────────────────────────────────────────────────
  renderPack(stage) {
    const e = this.e;
    const pack = e.pack;
    if (!pack) return;

    const wrap = h('div', 'pack-stage');
    const row = h('div', 'pack-row');
    pack.options.forEach((option, i) => {
      const node = h('div', 'pack-option');
      node.style.animationDelay = `${i * 70}ms`;
      if (option.kind === 'playing') node.appendChild(this.cardEl(option.card));
      else node.innerHTML = artFor(option);
      node.addEventListener('click', () => { haptics.tap(); this.showPackOptionInfo(option); });
      row.appendChild(node);
    });
    wrap.appendChild(row);

    const bar = h('div', 'pack-bar');
    const label = h('div', 'pack-label');
    label.innerHTML = `<b>${pack.def.name}</b><span>Choose ${pack.remaining}</span>`;
    bar.appendChild(label);
    const skip = h('button', 'pack-skip', 'Skip');
    skip.addEventListener('click', () => { haptics.tap(); e.skipPack(); });
    bar.appendChild(skip);
    wrap.appendChild(bar);

    stage.appendChild(wrap);
  }

  showPackOptionInfo(option) {
    const e = this.e;
    let emoji = '🎴';
    let art = option.kind === 'playing' ? null : artFor(option);
    let title = '';
    let desc = '';
    let subtitle = '';
    let badge = null;
    let badgeClass = '';
    if (option.kind === 'joker') {
      const d = JOKERS[option.key];
      emoji = d.emoji; title = d.name;
      subtitle = option.edition ? EDITIONS[option.edition].name : '';
      badge = RARITY[d.rarity].name;
      badgeClass = `rarity-${d.rarity}`;
      desc = jokerDesc({ key: option.key, state: makeProbeState(option.key) }, e);
    } else if (option.kind === 'playing') {
      emoji = SUITS[option.card.suit].symbol; title = cardName(option.card);
      desc = `<b>+${cardChips(option.card)} Chips</b> when scored`;
      if (option.card.enhancement) desc += `<br><b>${ENHANCEMENTS[option.card.enhancement].name}</b> — ${ENHANCEMENTS[option.card.enhancement].desc}`;
      if (option.card.edition) desc += `<br><b>${EDITIONS[option.card.edition].name}</b> — ${EDITIONS[option.card.edition].desc}`;
      if (option.card.seal) desc += `<br><b>${SEALS[option.card.seal].name}</b> — ${SEALS[option.card.seal].desc}`;
    } else {
      const d = CONSUMABLES[option.key];
      emoji = d.emoji; title = d.name;
      badge = d.kind.toUpperCase();
      badgeClass = `kind-${d.kind}`;
      desc = consumableDesc({ key: option.key }, e);
    }
    this.openOverlay(this.infoSheet({
      emoji, art, title, subtitle, desc, badge, badgeClass,
      actions: [{
        label: 'Take', cls: 'btn-green',
        onClick: () => { e.takePackOption(option); },
      }],
    }), { narrow: true });
  }

  // ── end of round ────────────────────────────────────────────────────
  showCashOut(summary) {
    const e = this.e;
    const node = h('div', 'cashout');
    node.appendChild(h('h2', null, 'Blind Defeated'));
    node.appendChild(h('div', 'cashout-total', `$${summary.payout}`));
    const list = h('div');
    for (const line of summary.details) list.appendChild(h('div', 'cash-line', `<span>${line.label}</span><b>+$${line.amount}</b>`));
    list.appendChild(h('div', 'cash-line', `<span>Score</span><b>${fmt(summary.score)} / ${fmt(summary.required)}</b>`));
    node.appendChild(list);
    const btn = h('button', 'btn btn-green btn-big', 'Cash Out');
    btn.addEventListener('click', () => { this.closeOverlay(); this.selected.clear(); e.proceedAfterRound(); });
    node.appendChild(btn);
    this.openOverlay(node, { sticky: true, narrow: true });
  }

  showGameOver(info) {
    const e = this.e;
    const node = h('div', 'cashout');
    node.appendChild(h('h2', null, 'Game Over'));
    node.appendChild(h('p', null, `You scored ${fmt(info.score)} of the required ${fmt(info.required)}.`));
    node.appendChild(h('div', 'cashout-total', `Ante ${info.ante}`));
    const stats = h('div');
    stats.appendChild(h('div', 'cash-line', `<span>Best hand</span><b>${fmt(e.stats.bestHand)}</b>`));
    stats.appendChild(h('div', 'cash-line', `<span>Hands played</span><b>${e.stats.handsPlayed}</b>`));
    stats.appendChild(h('div', 'cash-line', `<span>Seed</span><b>${e.seed}</b>`));
    node.appendChild(stats);
    const again = h('button', 'btn btn-red btn-big', 'Main Menu');
    again.addEventListener('click', () => { this.closeOverlay(); this.app.endRun(); });
    node.appendChild(again);
    this.openOverlay(node, { sticky: true, narrow: true });
  }

  showVictory() {
    const e = this.e;
    const node = h('div', 'cashout');
    node.appendChild(h('h2', null, '🏆 You Win!'));
    node.appendChild(h('p', null, `You beat Ante ${BASE_CONFIG.winAnte}. Keep going into endless mode, or bank the win.`));
    const endless = h('button', 'btn btn-blue btn-big', 'Endless Mode');
    endless.addEventListener('click', () => {
      this.closeOverlay();
      e.gameState = 'blind_select';
      e.rollAnteBosses();
      e.openShop();
    });
    const done = h('button', 'btn btn-ghost btn-big', 'Main Menu');
    done.addEventListener('click', () => { this.closeOverlay(); this.app.endRun(); });
    node.appendChild(endless);
    node.appendChild(done);
    this.openOverlay(node, { sticky: true, narrow: true });
  }

  // ── options menu ────────────────────────────────────────────────────
  showOptionsMenu() {
    const node = h('div', 'menu-stack');
    const add = (label, cls, fn) => {
      const b = h('button', `btn ${cls}`, label);
      b.addEventListener('click', fn);
      node.appendChild(b);
    };
    add('Settings', 'btn-red', () => this.showAudioSettings(() => this.showOptionsMenu()));
    add('New Run', 'btn-red', () => this.confirmNewRun());
    add('Main Menu', 'btn-red', () => this.app.saveAndQuit());
    add('Stats', 'btn-red', () => this.showStats());
    add('Collection', 'btn-red', () => this.app.showCollection());
    add('Customize Deck', 'btn-red', () => this.showDeckView());
    add('Back', 'btn-gold', () => this.closeOverlay());
    this.openOverlay(node, { narrow: true });
  }

  confirmNewRun() {
    const node = h('div');
    node.appendChild(h('h2', null, 'Start a new run?'));
    node.appendChild(h('p', null, 'This abandons the current run. It cannot be undone.'));
    const yes = h('button', 'btn btn-red', 'Abandon and start over');
    yes.addEventListener('click', () => { this.closeOverlay(); this.app.endRun(); });
    const no = h('button', 'btn btn-ghost', 'Keep playing');
    no.addEventListener('click', () => this.showOptionsMenu());
    node.appendChild(yes);
    node.appendChild(no);
    this.openOverlay(node, { narrow: true });
  }

  showAudioSettings(onBack) {
    const node = h('div');
    node.appendChild(h('h2', null, 'Settings'));
    node.appendChild(h('p', null, 'Music and effects are generated live in the browser — nothing is downloaded.'));

    const toggleRow = (label, key) => {
      const row = h('div', 'opt-row');
      row.appendChild(h('span', null, label));
      const btn = h('button', `btn btn-tiny ${audio.settings[key] ? 'btn-gold' : 'btn-ghost'}`, audio.settings[key] ? 'ON' : 'OFF');
      btn.addEventListener('click', () => {
        audio.unlock();
        audio.set(key, !audio.settings[key]);
        btn.className = `btn btn-tiny ${audio.settings[key] ? 'btn-gold' : 'btn-ghost'}`;
        btn.textContent = audio.settings[key] ? 'ON' : 'OFF';
        if (key === 'sfx' && audio.settings.sfx) audio.sfx('select');
      });
      row.appendChild(btn);
      node.appendChild(row);
    };
    toggleRow('Music', 'music');
    toggleRow('Sound Effects', 'sfx');

    const hapticRow = h('div', 'opt-row');
    hapticRow.appendChild(h('span', null, 'Vibration'));
    const hapticBtn = h('button', `btn btn-tiny ${haptics.enabled ? 'btn-gold' : 'btn-ghost'}`, haptics.enabled ? 'ON' : 'OFF');
    hapticBtn.addEventListener('click', () => {
      haptics.set(!haptics.enabled);
      hapticBtn.className = `btn btn-tiny ${haptics.enabled ? 'btn-gold' : 'btn-ghost'}`;
      hapticBtn.textContent = haptics.enabled ? 'ON' : 'OFF';
    });
    hapticRow.appendChild(hapticBtn);
    node.appendChild(hapticRow);

    const volRow = h('div', 'opt-row');
    volRow.appendChild(h('span', null, 'Volume'));
    const slider = h('input', 'slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(audio.settings.volume * 100));
    slider.addEventListener('input', () => audio.set('volume', Number(slider.value) / 100));
    slider.addEventListener('change', () => audio.sfx('select'));
    volRow.appendChild(slider);
    node.appendChild(volRow);

    const colourRow = h('div', 'opt-row');
    colourRow.appendChild(h('span', null, 'Deck colours'));
    const colourBtns = h('div', 'seg');
    for (const [key, label] of [['four', '4 colour'], ['two', '2 colour']]) {
      const btn = h('button', `btn btn-tiny ${this.deckColour === key ? 'btn-gold' : 'btn-ghost'}`, label);
      btn.addEventListener('click', () => {
        this.setDeckColour(key);
        [...colourBtns.children].forEach((b, i) => {
          b.className = `btn btn-tiny ${['four', 'two'][i] === key ? 'btn-gold' : 'btn-ghost'}`;
        });
        audio.sfx('select');
        haptics.tap();
      });
      colourBtns.appendChild(btn);
    }
    colourRow.appendChild(colourBtns);
    node.appendChild(colourRow);

    const speedRow = h('div', 'opt-row');
    speedRow.appendChild(h('span', null, 'Scoring speed'));
    const speedBtns = h('div', 'seg');
    for (const key of ['slow', 'normal', 'fast']) {
      const btn = h('button', `btn btn-tiny ${this.speed === key ? 'btn-gold' : 'btn-ghost'}`, key[0].toUpperCase() + key.slice(1));
      btn.addEventListener('click', () => {
        this.speed = key;
        try { localStorage.setItem(SPEED_KEY, key); } catch (err) { /* ignore */ }
        [...speedBtns.children].forEach((b, i) => {
          b.className = `btn btn-tiny ${['slow', 'normal', 'fast'][i] === key ? 'btn-gold' : 'btn-ghost'}`;
        });
        audio.sfx('select');
      });
      speedBtns.appendChild(btn);
    }
    speedRow.appendChild(speedBtns);
    node.appendChild(speedRow);

    node.appendChild(h('p', null, '<span class="muted">On iPhone the ring/silent switch mutes web audio — flip it to ring if you hear nothing.</span>'));

    const back = h('button', 'btn btn-gold', onBack ? 'Back' : 'Close');
    back.addEventListener('click', () => { this.closeOverlay(); if (onBack) onBack(); });
    node.appendChild(back);
    this.openOverlay(node, { narrow: true });
  }

  // ── run info (tabbed) ───────────────────────────────────────────────
  showRunInfo(tab) {
    if (tab) this.runInfoTab = tab;
    const node = h('div');
    const tabs = h('div', 'tabs');
    for (const [key, label] of [['hands', 'Poker Hands'], ['blinds', 'Blinds'], ['vouchers', 'Vouchers']]) {
      const btn = h('button', `tab ${this.runInfoTab === key ? 'active' : ''}`, label);
      btn.addEventListener('click', () => this.showRunInfo(key));
      tabs.appendChild(btn);
    }
    node.appendChild(tabs);

    const body = h('div', 'tab-body');
    if (this.runInfoTab === 'hands') this.buildHandsTab(body);
    else if (this.runInfoTab === 'blinds') this.buildBlindsTab(body);
    else this.buildVouchersTab(body);
    node.appendChild(body);

    const back = h('button', 'btn btn-gold', 'Back');
    back.addEventListener('click', () => this.closeOverlay());
    node.appendChild(back);
    this.openOverlay(node);
  }

  buildHandsTab(body) {
    const e = this.e;
    const rows = h('div', 'hand-rows');
    // Best hands first. Secret hands stay hidden until they are discovered.
    let hidden = 0;
    for (const key of HAND_ORDER) {
      if (!e.discovered.has(key)) { hidden += 1; continue; }
      const level = e.handLevels[key] || 1;
      const v = handValues(key, level);
      const line = h('div', 'hand-line');
      line.innerHTML =
        `<span class="hl-lvl">lvl.${level}</span>` +
        `<span class="hl-name">${HAND_NAMES[key]}</span>` +
        `<span class="hl-vals"><span class="hl-chips">${v.chips}</span><span class="hl-x">X</span><span class="hl-mult">${v.mult}</span></span>` +
        `<span class="hl-plays">#${e.handPlays[key] || 0}</span>`;
      rows.appendChild(line);
    }
    body.appendChild(rows);
    if (hidden) body.appendChild(h('p', null, `${hidden} secret hand${hidden > 1 ? 's' : ''} still undiscovered.`));
  }

  buildBlindsTab(body) {
    const e = this.e;
    const wrap = h('div', 'blind-columns');
    const currentIndex = e.gameState === 'playing' ? e.round % 3 : e.round % 3;
    e.blindOrder().forEach((type, i) => {
      const col = this.blindColumn(type, i, currentIndex, false);
      const state = col.querySelector('.bc-state');
      if (state) state.textContent = i < currentIndex ? 'Defeated' : i === currentIndex ? 'Current' : 'Upcoming';
      wrap.appendChild(col);
    });
    body.appendChild(wrap);
  }

  buildVouchersTab(body) {
    const e = this.e;
    if (!e.vouchers.size) {
      body.appendChild(h('div', 'empty-note', 'No vouchers redeemed this run'));
      return;
    }
    const list = h('div', 'voucher-list');
    for (const key of e.vouchers) {
      list.appendChild(h('div', 'voucher-row', `<b>${VOUCHERS[key].name}</b><span>${VOUCHERS[key].desc}</span>`));
    }
    body.appendChild(list);
  }

  showStats() {
    const e = this.e;
    const node = h('div');
    node.appendChild(h('h2', null, 'Stats'));
    node.appendChild(h('div', 'shop-section-label', `Seed ${e.seed} · ${DECKS[e.deckKey].name}`));
    const stats = h('div');
    const rows = [
      ['Best hand', fmt(e.stats.bestHand)],
      ['Hands played', e.stats.handsPlayed],
      ['Cards discarded', e.stats.cardsDiscarded],
      ['Blinds skipped', e.stats.skips],
      ['Tarots used', e.stats.tarotsUsed],
      ['Planets used', e.stats.planetsUsed],
      ['Shop rerolls', e.stats.rerolls],
      ['Most played hand', HAND_NAMES[e.mostPlayedHand()] || '—'],
    ];
    for (const [label, value] of rows) stats.appendChild(h('div', 'cash-line', `<span>${label}</span><b>${value}</b>`));
    node.appendChild(stats);

    const p = this.app.profile;
    if (p && p.runs) {
      node.appendChild(h('h3', null, 'Career'));
      const career = h('div');
      for (const [label, value] of [
        ['Runs', p.runs], ['Wins', p.wins],
        ['Furthest ante', p.bestAnte], ['Best hand ever', fmt(p.bestScore)],
        ['Hands played', p.handsPlayed],
      ]) career.appendChild(h('div', 'cash-line', `<span>${label}</span><b>${value}</b>`));
      node.appendChild(career);
    }

    const back = h('button', 'btn btn-gold', 'Back');
    back.addEventListener('click', () => this.showOptionsMenu());
    node.appendChild(back);
    this.openOverlay(node, { narrow: true });
  }

  showDeckView() {
    const e = this.e;
    const node = h('div');
    node.appendChild(h('h2', null, `${DECKS[e.deckKey].name} — ${e.fullDeck.length} cards`));
    const suits = { S: 0, H: 0, D: 0, C: 0 };
    let faces = 0; let aces = 0; let enhanced = 0;
    for (const c of e.fullDeck) {
      if (c.enhancement !== 'stone') suits[c.suit] += 1;
      if (c.rank >= 11 && c.rank <= 13) faces += 1;
      if (c.rank === 14) aces += 1;
      if (c.enhancement) enhanced += 1;
    }
    const stats = h('div', 'deck-stats');
    stats.innerHTML =
      `<div class="deck-stat"><b>${faces}</b><small>Faces</small></div>` +
      `<div class="deck-stat"><b>${aces}</b><small>Aces</small></div>` +
      `<div class="deck-stat"><b>${enhanced}</b><small>Enhanced</small></div>` +
      `<div class="deck-stat"><b>♠ ${suits.S} ♥ ${suits.H}</b><small>♦ ${suits.D} ♣ ${suits.C}</small></div>`;
    node.appendChild(stats);

    const grid = h('div', 'deck-grid sheet-scroll');
    const sorted = e.fullDeck.slice().sort((a, b) => 'SHDC'.indexOf(a.suit) - 'SHDC'.indexOf(b.suit) || b.rank - a.rank);
    for (const card of sorted) {
      const el = this.cardEl(card);
      el.classList.remove('debuffed');
      el.addEventListener('click', () => this.showCardInfo(card));
      grid.appendChild(el);
    }
    node.appendChild(grid);
    const back = h('button', 'btn btn-gold', 'Back');
    back.addEventListener('click', () => this.closeOverlay());
    node.appendChild(back);
    this.openOverlay(node);
  }

  // ── actions ─────────────────────────────────────────────────────────
  async onPlay() {
    if (this.animating) return;
    const e = this.e;
    const selected = this.selectedCards();
    const check = e.canPlay(selected);
    if (!check.ok) { this.toast(check.reason, 'warn'); return; }

    this.animating = true;
    audio.sfx('play');
    audio.resetChips();
    const played = selected.slice();
    this.selected.clear();

    // The engine refills the hand the moment the hand is played, so hold the
    // display at the cards that stayed behind until the scoring is over.
    // Nothing is tappable while the hand resolves, so stop advertising it.
    $('btn-play').classList.remove('ready');
    $('btn-discard').classList.remove('ready');

    const kept = e.hand.filter((c) => !played.includes(c));
    const scoreBefore = e.score;
    this.renderHand(kept);
    this.showPlayed(played);
    await wait(220 * this.speedMult);

    const result = e.playHand(played);
    if (!result) { this.animating = false; this.render(); return; }

    // Hands and deck tick over immediately; the round score waits for the
    // total so the reveal is not spoiled.
    $('ct-hands').textContent = e.handsLeft;
    $('ct-discards').textContent = e.discardsLeft;
    $('ct-deck').textContent = `${e.drawPile.length}/${e.fullDeck.length}`;
    $('sb-score').textContent = fmt(scoreBefore);

    await this.animateScore(result);
    await this.clearPlayArea();

    this.animating = false;
    this.render();
    this.flushDeferred();
  }

  get speedMult() { return SPEEDS[this.speed] || 1; }

  setDeckColour(mode) {
    this.deckColour = mode;
    try { localStorage.setItem(COLOUR_KEY, mode); } catch (err) { /* ignore */ }
    document.body.classList.toggle('two-colour', mode === 'two');
  }

  // Sweep the played cards off the felt before the new hand is dealt in.
  async clearPlayArea() {
    const area = $('play-area');
    if (!area.children.length) return;
    for (const node of area.children) node.classList.add('leaving');
    await wait(300 * this.speedMult);
    area.innerHTML = '';
  }

  onDiscard() {
    if (this.animating) return;
    const selected = this.selectedCards();
    const check = this.e.canDiscard(selected);
    if (!check.ok) { this.toast(check.reason, 'warn'); return; }
    this.selected.clear();
    this.e.discard(selected);
  }

  showPlayed(cards) {
    const area = $('play-area');
    area.innerHTML = '';
    cards.forEach((card, i) => {
      const node = this.cardEl(card);
      node.dataset.playedUid = card.uid;
      node.style.animationDelay = `${i * 55}ms`;
      area.appendChild(node);
    });
  }

  // Balatro's planet-card flourish: the hand name appears, the level ticks
  // over, then the chip and mult gains land one after the other.
  async playLevelUp(key, level, amount, source) {
    const e = this.e;
    const from = Math.max(1, level - amount);
    const before = handValues(key, from);
    const after = handValues(key, level);
    const nameEl = $('sb-hand-name');
    const levelEl = $('sb-hand-level');
    const chipsEl = $('sb-chips');
    const multEl = $('sb-mult');
    const unit = 300 * this.speedMult;

    this.levellingUp = true;
    const down = amount < 0;

    nameEl.textContent = HAND_NAMES[key];
    nameEl.classList.add('pulse');
    levelEl.textContent = `lvl.${from}`;
    levelEl.classList.remove('hidden');
    chipsEl.textContent = fmt(before.chips);
    multEl.textContent = fmt(before.mult);
    audio.sfx('select');
    haptics.select();
    await wait(unit);

    levelEl.textContent = `lvl.${level}`;
    levelEl.classList.add('bump');
    audio.sfx('levelup');
    haptics.levelUp();
    await wait(unit * 0.9);
    levelEl.classList.remove('bump');

    const chipGain = after.chips - before.chips;
    if (chipGain) {
      chipsEl.textContent = fmt(after.chips);
      chipsEl.classList.add('gain');
      this.floatAt(chipsEl, `${down ? '' : '+'}${chipGain}`, 'chips');
      audio.sfx('chip');
      haptics.bump();
      await wait(unit * 0.8);
      chipsEl.classList.remove('gain');
    }

    const multGain = after.mult - before.mult;
    if (multGain) {
      multEl.textContent = fmt(after.mult);
      multEl.classList.add('gain');
      this.floatAt(multEl, `${down ? '' : '+'}${multGain}`, 'mult');
      audio.sfx('mult');
      haptics.bump();
      await wait(unit * 0.8);
      multEl.classList.remove('gain');
    }

    await wait(unit * 0.7);
    nameEl.classList.remove('pulse');
    this.levellingUp = false;
    if (this.e === e) {
      if (e.gameState === 'playing') this.previewHand();
      else { nameEl.textContent = ''; levelEl.classList.add('hidden'); chipsEl.textContent = '0'; multEl.textContent = '0'; }
    }
  }

  async animateScore(result) {
    const steps = result.steps;
    // Pace off the number of things that actually change a number, so a plain
    // hand is unhurried and a 30-trigger board still finishes in a few seconds.
    const beats = steps.filter((s) => s.type === 'effect').length;
    const unit = Math.max(95, Math.min(215, Math.round(2900 / Math.max(1, beats)))) * this.speedMult;

    const chipsEl = $('sb-chips');
    const multEl = $('sb-mult');
    $('sb-hand-name').textContent = HAND_NAMES[result.handKey];
    $('sb-hand-level').textContent = `lvl.${result.level}`;
    $('sb-hand-level').classList.remove('hidden');

    for (const step of steps) {
      if (step.type === 'base') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(step.mult);
        this.bump();
        await wait(unit * 2.2);
      } else if (step.type === 'card_trigger') {
        const node = this.playedNode(step.card);
        if (node) { node.classList.remove('scoring'); void node.offsetWidth; node.classList.add('scoring'); }
        audio.sfx('chip');
        haptics.soft();
        await wait(unit * 0.8);
      } else if (step.type === 'card_debuffed') {
        const node = this.playedNode(step.card);
        if (node) { node.classList.add('debuffed'); this.floatAt(node, 'debuffed', 'mult'); }
        await wait(unit);
      } else if (step.type === 'effect') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(round2(step.mult));
        this.bump();
        const anchor = step.card
          ? this.playedNode(step.card) || this.handNode(step.card)
          : this.jokerNodeByName(step.source);
        for (const part of step.parts) this.floatAt(anchor, partText(part), part.kind);
        this.sfxForEffect(step);
        haptics.bump();
        await wait(unit);
      } else if (step.type === 'balance') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(step.mult);
        this.bump();
        await wait(unit * 1.4);
      } else if (step.type === 'total') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(round2(step.mult));
        await wait(unit * 2.4);
        audio.sfx('levelup');
        haptics.heavy();
        this.floatAt($('sb-score'), `+${fmt(step.score)}`, 'money');
        $('sb-score').textContent = fmt(this.e.score);
        // Let the result sit long enough to actually read it.
        await wait(unit * 3);
      }
    }
  }

  playedNode(card) { return $('play-area').querySelector(`[data-played-uid="${card.uid}"]`); }

  sfxForEffect(step) {
    const kinds = step.parts.map((p) => p.kind);
    if (kinds.includes('xmult')) audio.sfx('xmult');
    else if (kinds.includes('money')) audio.sfx('money');
    else if (kinds.includes('mult')) audio.sfx('mult');
    else if (kinds.includes('chips') && !step.card) audio.sfx('joker');
  }

  bump() {
    const row = document.querySelector('.sb-calc');
    if (!row) return;
    row.classList.remove('bump');
    void row.offsetWidth;
    row.classList.add('bump');
  }

  handNode(card) { return $('hand-row').querySelector(`[data-uid="${card.uid}"]`); }

  jokerNodeByName(name) {
    if (!name) return null;
    const base = String(name).split(' (')[0];
    const joker = this.e.jokers.find((j) => this.e.jokerName(j) === base);
    if (!joker) return null;
    const node = $('jokers-row').querySelector(`[data-joker-uid="${joker.uid}"]`);
    if (node) { node.classList.remove('trigger'); void node.offsetWidth; node.classList.add('trigger'); }
    return node;
  }

  floatAt(anchor, text, kind) {
    const fx = $('fx');
    const node = h('div', `float ${kind}`, text);
    const rect = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0 };
    node.style.left = `${rect.left + rect.width / 2}px`;
    node.style.top = `${rect.top - 6}px`;
    fx.appendChild(node);
    setTimeout(() => node.remove(), 1100);
  }

  toast(text, kind = 'info') {
    const node = h('div', `toast ${kind}`, text);
    $('toasts').appendChild(node);
    setTimeout(() => node.remove(), 1900);
  }

  syncMood() {
    const e = this.e;
    if (e.gameState === 'shop' || e.gameState === 'pack') audio.setMood('shop');
    else if (e.gameState === 'playing') audio.setMood(e.blind.type === 'boss' && !e.blind.disabled ? 'boss' : 'play');
    else if (e.gameState === 'blind_select' || e.gameState === 'round_won') audio.setMood('play');
  }
}

function partText(part) {
  if (part.kind === 'chips') return `+${part.value}`;
  if (part.kind === 'mult') return `+${part.value} Mult`;
  if (part.kind === 'xmult') return `×${round2(part.value)}`;
  if (part.kind === 'money') return `+$${part.value}`;
  return '';
}

function round2(n) { return Math.round(n * 100) / 100; }

function fmt(n) {
  if (n == null) return '0';
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Shop previews need a plausible state object for jokers whose text shows live
// values. A throwaway RNG keeps these probes from consuming the run's seed.
const probeEngine = {
  rng: new RNG('preview'),
  randomHandKey: () => 'pair',
  handName: (key) => HAND_NAMES[key] || key,
};

function makeProbeState(key) {
  const def = JOKERS[key];
  const probe = { key, state: {} };
  try { if (def && def.init) def.init(probe, probeEngine); } catch (err) { /* preview only */ }
  return probe.state;
}
