// Rendering and touch interaction for the landscape table layout.

import { SUITS, rankLabel, cardName, shortCardName, ENHANCEMENTS, EDITIONS, SEALS, cardChips } from './cards.js';
import { HAND_ORDER, HAND_NAMES } from './poker.js';
import { JOKERS, RARITY, jokerDesc } from './jokers.js';
import { CONSUMABLES, consumableDesc } from './consumables.js';
import { DECKS, VOUCHERS, PACK_BY_KEY, handValues, BASE_CONFIG } from './data.js';
import { RNG } from './rng.js';
import { audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function h(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

// Traditional pip positions, as percentages inside the card's pip box.
// Anything below the halfway line is drawn upside down, like a real card.
const PIP_LAYOUT = {
  2: [[50, 6], [50, 94]],
  3: [[50, 6], [50, 50], [50, 94]],
  4: [[20, 6], [80, 6], [20, 94], [80, 94]],
  5: [[20, 6], [80, 6], [50, 50], [20, 94], [80, 94]],
  6: [[20, 6], [80, 6], [20, 50], [80, 50], [20, 94], [80, 94]],
  7: [[20, 6], [80, 6], [50, 28], [20, 50], [80, 50], [20, 94], [80, 94]],
  8: [[20, 6], [80, 6], [50, 28], [20, 50], [80, 50], [50, 72], [20, 94], [80, 94]],
  9: [[20, 6], [80, 6], [20, 35], [80, 35], [50, 50], [20, 65], [80, 65], [20, 94], [80, 94]],
  10: [[20, 6], [80, 6], [20, 35], [80, 35], [50, 20], [50, 80], [20, 65], [80, 65], [20, 94], [80, 94]],
};

export class UI {
  constructor(engine, app) {
    this.e = engine;
    this.app = app;
    this.selected = new Set();
    this.animating = false;
    this.longPressTimer = null;
    this.runInfoTab = 'hands';

    this.bindStaticControls();
    engine.on('state', () => { if (!this.animating) this.render(); });
    engine.on('toast', ({ text, kind }) => this.toast(text, kind));
    // End-of-round overlays wait until the scoring animation has finished.
    engine.on('round_won', (s) => this.later(() => { audio.sfx('win'); this.showCashOut(s); }));
    engine.on('game_over', (info) => this.later(() => { audio.sfx('lose'); this.showGameOver(info); }));
    engine.on('won', () => this.later(() => { audio.sfx('win'); this.showVictory(); }));
    engine.on('pack_opened', () => { audio.sfx('pack'); this.showPack(); });
    engine.on('pack_closed', () => this.closeOverlay());
    engine.on('tag_gained', ({ tag }) => { audio.sfx('tag'); this.toast(`${tag.emoji} ${tag.name}`, 'good'); });
    engine.on('card_destroyed', () => audio.sfx('destroy'));
    engine.on('blind_started', () => audio.setMood(engine.blind.type === 'boss' && !engine.blind.disabled ? 'boss' : 'play'));
    engine.on('shop_opened', () => audio.setMood('shop'));
    engine.on('cards_discarded', () => audio.sfx('discard'));
    engine.on('created', ({ kind, key, source }) => {
      const name = kind === 'joker' ? (JOKERS[key] || {}).name : (CONSUMABLES[key] || {}).name;
      if (name) this.toast(`${source}: ${name}`, 'good');
    });
    engine.on('hand_leveled', ({ key, level, amount, source }) => {
      if (amount > 0) audio.sfx('levelup');
      this.toast(`${source}: ${HAND_NAMES[key]} → lvl ${level}`, amount > 0 ? 'good' : 'warn');
    });

    window.addEventListener('resize', () => { if (!this.animating) this.render(); });
  }

  bindStaticControls() {
    $('btn-play').addEventListener('click', () => this.onPlay());
    $('btn-discard').addEventListener('click', () => this.onDiscard());
    $('btn-sort-rank').addEventListener('click', () => this.setSort('rank'));
    $('btn-sort-suit').addEventListener('click', () => this.setSort('suit'));
    $('btn-runinfo').addEventListener('click', () => this.showRunInfo());
    $('btn-options').addEventListener('click', () => this.showOptionsMenu());
    $('deck-pile').addEventListener('click', () => this.showDeckView());
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

    $('sb-choose').classList.toggle('hidden', !choosing);
    $('sb-blind-panel').classList.toggle('hidden', choosing);

    if (!choosing && e.blind) {
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
  renderHand() {
    const row = $('hand-row');
    row.innerHTML = '';
    const e = this.e;
    const cards = e.hand;
    $('ct-handsize').textContent = `${cards.length}/${e.handSize}`;

    cards.forEach((card) => {
      const node = this.cardEl(card);
      if (this.selected.has(card.uid)) node.classList.add('selected');
      if (e.bossActive('bell') && e.forcedCard === card) node.dataset.forced = '1';
      this.attachCardHandlers(node, card);
      row.appendChild(node);
    });

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
    const available = row.clientWidth - 6;
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
    const suit = SUITS[card.suit];
    const red = card.suit === 'H' || card.suit === 'D';
    const node = h('div', 'pcard');
    node.dataset.uid = card.uid;
    if (red) node.classList.add('red');
    if (card.enhancement) node.classList.add(`enh-${card.enhancement}`);
    if (card.edition) node.classList.add(`ed-${card.edition}`);
    if (card.debuffed && !card.faceDown) node.classList.add('debuffed');
    if (card.faceDown) node.classList.add('facedown');

    const corner = (cls) =>
      `<span class="pc-corner ${cls}"><span class="pc-rank">${rankLabel(card.rank)}</span><span class="pc-suit">${suit.symbol}</span></span>`;

    let middle;
    if (card.rank === 14) {
      middle = `<span class="pc-center">${suit.symbol}</span>`;
    } else if (card.rank >= 11) {
      middle = `<span class="pc-face">${rankLabel(card.rank)}</span>`;
    } else {
      const pips = (PIP_LAYOUT[card.rank] || [])
        .map(([x, y]) => `<span class="pc-pip${y > 50 ? ' flip' : ''}" style="left:${x}%;top:${y}%">${suit.symbol}</span>`)
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
    if (this.selected.has(card.uid)) { this.selected.delete(card.uid); audio.sfx('deselect'); }
    else {
      if (this.selected.size >= 5) { this.toast('Maximum 5 cards', 'warn'); return; }
      this.selected.add(card.uid);
      audio.sfx('select');
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
      node.innerHTML =
        `<span class="jt-emoji">${def.emoji || '🃏'}</span>` +
        `<span class="jt-name">${def.name || joker.key}</span>` +
        (joker.edition === 'negative' ? '<span class="neg-badge">NEG</span>' : '');
      node.addEventListener('click', () => this.showJokerInfo(joker));
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
      node.innerHTML = `<span class="jt-emoji">${def.emoji || '🎴'}</span>`;
      node.addEventListener('click', () => this.showConsumableInfo(card));
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
      select.addEventListener('click', () => { this.selected.clear(); e.selectBlind(); });
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
      const skipRow = h('div', 'bc-skip');
      skipRow.appendChild(h('div', 'bc-tag', '🎟'));
      const skip = h('button', 'bc-skip-btn', 'Skip Blind');
      skip.disabled = !isCurrent;
      skip.addEventListener('click', () => e.skipBlind());
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
    const wrap = h('div', 'shop-wrap');
    wrap.appendChild(h('div', 'shop-head', '<h2>Shop</h2>'));

    const grid = h('div', 'shop-grid');
    for (const item of shop.items) grid.appendChild(this.shopItemEl(item));
    if (shop.voucher) grid.appendChild(this.shopItemEl(shop.voucher));
    for (const pack of shop.packs) grid.appendChild(this.shopItemEl(pack));
    if (!grid.children.length) grid.appendChild(h('div', 'tray-empty', 'Sold out — reroll for more'));
    wrap.appendChild(grid);

    const foot = h('div', 'shop-foot');
    const rerollCost = shop.freeRerolls > 0 ? 0 : shop.rerollCost;
    const reroll = h('button', 'btn btn-red', `Reroll $${rerollCost}`);
    reroll.addEventListener('click', () => e.rerollShop());
    const next = h('button', 'btn btn-green', 'Next Round →');
    next.addEventListener('click', () => e.exitShop());
    foot.appendChild(reroll);
    foot.appendChild(next);
    wrap.appendChild(foot);
    stage.appendChild(wrap);
  }

  shopItemEl(item) {
    const node = h('div', 'shop-item');
    const view = this.describeItem(item);
    node.innerHTML =
      `<div class="si-emoji">${view.emoji}</div>` +
      `<div class="si-name">${view.name}</div>` +
      `<div class="si-cost ${item.cost === 0 ? 'free' : ''}">${item.cost === 0 ? 'FREE' : `$${item.cost}`}</div>` +
      (view.rarityColor ? `<span class="si-rarity" style="background:${view.rarityColor}"></span>` : '');
    if (item.kind === 'playing' && item.card) {
      const wrap = h('div', 'mini-card-wrap');
      wrap.appendChild(this.cardEl(item.card));
      node.replaceChild(wrap, node.querySelector('.si-emoji'));
    }
    node.addEventListener('click', () => this.showShopItemInfo(item));
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

  infoSheet({ emoji, title, subtitle, subtitleColor, desc, actions = [], onClose }) {
    const node = h('div');
    node.innerHTML =
      `<div class="info-head">
         <div class="info-emoji">${emoji}</div>
         <div class="info-title"><b>${title}</b><span style="color:${subtitleColor || 'var(--ink-dim)'}">${subtitle || ''}</span></div>
       </div>
       <div class="info-desc">${desc}</div>`;
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
      emoji: def.emoji || '🃏',
      title: def.name || joker.key,
      subtitle: `${RARITY[def.rarity] ? RARITY[def.rarity].name : ''}${joker.edition ? ` · ${EDITIONS[joker.edition].name}` : ''}`,
      subtitleColor: RARITY[def.rarity] ? RARITY[def.rarity].color : null,
      desc: jokerDesc(joker, e) + (joker.edition ? `<br><span class="muted">${EDITIONS[joker.edition].desc}</span>` : ''),
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
      emoji: def.emoji || '🎴',
      title: def.name || card.key,
      subtitle: (def.kind || '').toUpperCase(),
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
    if (item.kind === 'joker') {
      desc = jokerDesc({ key: item.key, state: makeProbeState(item.key) }, e);
      subtitle = RARITY[view.def.rarity].name + (item.edition ? ` · ${EDITIONS[item.edition].name}` : '');
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
      subtitle = item.kind.toUpperCase();
    }
    const affordable = e.canAfford(item.cost);
    this.openOverlay(this.infoSheet({
      emoji: view.emoji,
      title: view.name,
      subtitle,
      subtitleColor: view.rarityColor,
      desc,
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
  showPack() {
    const e = this.e;
    const pack = e.pack;
    if (!pack) return;
    const node = h('div');
    node.appendChild(h('h2', null, pack.def.name));
    node.appendChild(h('p', null, `Choose ${pack.remaining} of ${pack.options.length}`));
    const grid = h('div', 'pack-grid');
    for (const option of pack.options) {
      const item = h('div', 'shop-item');
      let emoji = '🎴';
      let name = '';
      if (option.kind === 'joker') { const d = JOKERS[option.key]; emoji = d.emoji; name = d.name; }
      else if (option.kind === 'playing') { emoji = ''; name = shortCardName(option.card); }
      else { const d = CONSUMABLES[option.key]; emoji = d.emoji; name = d.name; }
      item.innerHTML = `<div class="si-emoji">${emoji}</div><div class="si-name">${name}</div>`;
      if (option.kind === 'playing') {
        const wrap = h('div', 'mini-card-wrap');
        wrap.appendChild(this.cardEl(option.card));
        item.replaceChild(wrap, item.querySelector('.si-emoji'));
      }
      item.addEventListener('click', () => this.showPackOptionInfo(option));
      grid.appendChild(item);
    }
    node.appendChild(grid);
    const skip = h('button', 'btn btn-ghost', 'Skip Pack');
    skip.addEventListener('click', () => { e.skipPack(); this.closeOverlay(); });
    node.appendChild(skip);
    this.openOverlay(node, { sticky: true });
  }

  showPackOptionInfo(option) {
    const e = this.e;
    let emoji = '🎴';
    let title = '';
    let desc = '';
    let subtitle = '';
    if (option.kind === 'joker') {
      const d = JOKERS[option.key];
      emoji = d.emoji; title = d.name;
      subtitle = RARITY[d.rarity].name + (option.edition ? ` · ${EDITIONS[option.edition].name}` : '');
      desc = jokerDesc({ key: option.key, state: makeProbeState(option.key) }, e);
    } else if (option.kind === 'playing') {
      emoji = SUITS[option.card.suit].symbol; title = cardName(option.card);
      desc = `<b>+${cardChips(option.card)} Chips</b> when scored`;
      if (option.card.enhancement) desc += `<br><b>${ENHANCEMENTS[option.card.enhancement].name}</b> — ${ENHANCEMENTS[option.card.enhancement].desc}`;
      if (option.card.edition) desc += `<br><b>${EDITIONS[option.card.edition].name}</b> — ${EDITIONS[option.card.edition].desc}`;
      if (option.card.seal) desc += `<br><b>${SEALS[option.card.seal].name}</b> — ${SEALS[option.card.seal].desc}`;
    } else {
      const d = CONSUMABLES[option.key];
      emoji = d.emoji; title = d.name; subtitle = d.kind.toUpperCase();
      desc = consumableDesc({ key: option.key }, e);
    }
    this.openOverlay(this.infoSheet({
      emoji, title, subtitle, desc,
      actions: [{
        label: 'Take', cls: 'btn-green',
        onClick: () => { e.takePackOption(option); if (e.pack) this.showPack(); },
      }],
      onClose: () => { if (e.pack) this.showPack(); },
    }), { sticky: true, narrow: true });
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

    const result = e.playHand(played);
    if (!result) { this.animating = false; this.render(); return; }

    this.renderHand();
    this.showPlayed(played);
    await this.animateScore(result);
    this.animating = false;
    this.render();
    await wait(240);
    $('play-area').innerHTML = '';
    if (e.gameState === 'playing') this.render();
    this.flushDeferred();
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
    for (const card of cards) {
      const node = this.cardEl(card);
      node.dataset.playedUid = card.uid;
      area.appendChild(node);
    }
  }

  async animateScore(result) {
    const steps = result.steps;
    const delay = Math.max(40, Math.min(130, Math.round(1600 / Math.max(1, steps.length))));
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
        await wait(delay * 2);
      } else if (step.type === 'card_trigger') {
        const node = $('play-area').querySelector(`[data-played-uid="${step.card.uid}"]`);
        if (node) { node.classList.remove('scoring'); void node.offsetWidth; node.classList.add('scoring'); }
        audio.sfx('chip');
        await wait(delay * 0.6);
      } else if (step.type === 'card_debuffed') {
        const node = $('play-area').querySelector(`[data-played-uid="${step.card.uid}"]`);
        if (node) this.floatAt(node, 'debuffed', 'mult');
        await wait(delay);
      } else if (step.type === 'effect') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(round2(step.mult));
        this.bump();
        const anchor = step.card
          ? $('play-area').querySelector(`[data-played-uid="${step.card.uid}"]`) || this.handNode(step.card)
          : this.jokerNodeByName(step.source);
        for (const part of step.parts) this.floatAt(anchor, partText(part), part.kind);
        this.sfxForEffect(step);
        await wait(delay);
      } else if (step.type === 'balance') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(step.mult);
        this.bump();
        await wait(delay);
      } else if (step.type === 'total') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(round2(step.mult));
        await wait(delay * 2);
        audio.sfx('levelup');
        this.floatAt($('sb-score'), `+${fmt(step.score)}`, 'money');
      }
    }
    await wait(200);
  }

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
    node.style.transform = 'translateX(-50%)';
    fx.appendChild(node);
    setTimeout(() => node.remove(), 900);
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
