// Rendering and touch interaction.

import { SUITS, rankLabel, cardName, shortCardName, ENHANCEMENTS, EDITIONS, SEALS, cardChips } from './cards.js';
import { HAND_ORDER, HAND_NAMES } from './poker.js';
import { JOKERS, RARITY, jokerDesc } from './jokers.js';
import { CONSUMABLES, consumableDesc } from './consumables.js';
import { DECKS, VOUCHERS, PACK_BY_KEY, handValues, BASE_CONFIG } from './data.js';
import { RNG } from './rng.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function h(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export class UI {
  constructor(engine, app) {
    this.e = engine;
    this.app = app;
    this.selected = new Set();      // uids of selected hand cards
    this.animating = false;
    this.longPressTimer = null;

    this.bindStaticControls();
    engine.on('state', () => { if (!this.animating) this.render(); });
    engine.on('toast', ({ text, kind }) => this.toast(text, kind));
    // End-of-round overlays wait until the scoring animation has finished.
    engine.on('round_won', (s) => this.later(() => this.showCashOut(s)));
    engine.on('game_over', (info) => this.later(() => this.showGameOver(info)));
    engine.on('won', () => this.later(() => this.showVictory()));
    engine.on('pack_opened', () => this.showPack());
    engine.on('pack_closed', () => this.closeOverlay());
    engine.on('tag_gained', ({ tag }) => this.toast(`${tag.emoji} ${tag.name}`, 'good'));
    engine.on('created', ({ kind, key, source }) => {
      const name = kind === 'joker' ? (JOKERS[key] || {}).name : (CONSUMABLES[key] || {}).name;
      if (name) this.toast(`${source}: ${name}`, 'good');
    });
    engine.on('hand_leveled', ({ key, level, amount, source }) => {
      if (amount > 0) this.toast(`${source}: ${HAND_NAMES[key]} → lvl ${level}`, 'good');
      else this.toast(`${source}: ${HAND_NAMES[key]} → lvl ${level}`, 'warn');
    });
  }

  // ── static controls ─────────────────────────────────────────────────
  bindStaticControls() {
    $('btn-play').addEventListener('click', () => this.onPlay());
    $('btn-discard').addEventListener('click', () => this.onDiscard());
    $('btn-sort-rank').addEventListener('click', () => this.setSort('rank'));
    $('btn-sort-suit').addEventListener('click', () => this.setSort('suit'));
    $('hud-menu').addEventListener('click', () => this.showRunMenu());
    $('hud-deck').addEventListener('click', () => this.showDeckView());
  }

  // Defer a UI action until any running animation has finished.
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

    $('hud-ante').innerHTML = `${e.ante}<span class="hud-sub">/${BASE_CONFIG.winAnte}</span>`;
    $('hud-round').textContent = e.round + 1;
    $('hud-money').textContent = `$${e.money}`;

    // While a blind is in progress the stage collapses so the felt gets the
    // leftover vertical space instead of leaving a hole in the middle.
    $('screen-run').classList.toggle('playing', playing);
    $('blind-banner').classList.toggle('hidden', !playing);
    $('score-bar').classList.toggle('hidden', !playing);
    $('calc-row').classList.toggle('hidden', !playing);
    $('play-area').classList.toggle('hidden', !playing);
    $('hand-dock').classList.toggle('hidden', !playing);

    if (playing) this.renderPlaying();
    this.renderJokers();
    this.renderConsumables();
    this.renderStage();
  }

  renderPlaying() {
    const e = this.e;
    const info = e.blindInfo(e.blind.type);
    const banner = $('blind-banner');
    banner.classList.toggle('boss', e.blind.type === 'boss');
    $('bb-icon').textContent = info.emoji;
    $('bb-name').textContent = info.name + (e.blind.disabled ? ' (disabled)' : '');
    $('bb-desc').textContent = e.blind.type === 'boss' ? info.desc : `Reward $${info.reward}`;
    $('bb-req').textContent = fmt(e.blind.chips);

    $('sb-score').textContent = fmt(e.score);
    $('sb-fill').style.width = `${Math.min(100, (e.score / e.blind.chips) * 100)}%`;

    if (!this.animating) this.previewHand();

    $('ct-hands').textContent = e.handsLeft;
    $('ct-discards').textContent = e.discardsLeft;
    $('ct-deck').textContent = `${e.drawPile.length}/${e.fullDeck.length}`;

    this.updateActionButtons();
    this.renderHand();
  }

  // Dim rather than disable, so tapping still explains why it is not allowed.
  updateActionButtons() {
    const e = this.e;
    if (e.gameState !== 'playing') return;
    const selected = this.selectedCards();
    $('btn-play').classList.toggle('dim', !e.canPlay(selected).ok);
    $('btn-discard').classList.toggle('dim', !e.canDiscard(selected).ok);
  }

  previewHand() {
    const e = this.e;
    const selected = e.hand.filter((c) => this.selected.has(c.uid));
    if (!selected.length) {
      $('calc-chips').textContent = '0';
      $('calc-mult').textContent = '0';
      $('calc-hand').textContent = '';
      return;
    }
    const ev = e.evaluate(selected);
    const level = e.handLevels[ev.key] || 1;
    const v = handValues(ev.key, level);
    $('calc-chips').textContent = fmt(v.chips);
    $('calc-mult').textContent = fmt(v.mult);
    $('calc-hand').textContent = `${ev.name}  lvl ${level}`;
  }

  // ── hand ────────────────────────────────────────────────────────────
  renderHand() {
    const row = $('hand-row');
    row.innerHTML = '';
    const e = this.e;
    const count = e.hand.length;
    // Squeeze cards together when the hand grows past what fits.
    const overlap = count > 8 ? Math.min(18, (count - 8) * 4 + 2) : 0;
    e.hand.forEach((card, i) => {
      const node = this.cardEl(card);
      if (i > 0 && overlap) node.style.marginLeft = `-${overlap}px`;
      if (this.selected.has(card.uid)) node.classList.add('selected');
      if (e.bossActive('bell') && e.forcedCard === card) node.style.boxShadow = '0 2px 0 rgba(0,0,0,.4), 0 0 0 2px #9b5de5';
      this.attachCardHandlers(node, card);
      row.appendChild(node);
    });
  }

  cardEl(card) {
    const red = card.suit === 'H' || card.suit === 'D';
    const node = h('div', 'pcard');
    node.dataset.uid = card.uid;
    if (red) node.classList.add('red');
    if (card.enhancement) node.classList.add(`enh-${card.enhancement}`);
    if (card.edition) node.classList.add(`ed-${card.edition}`);
    if (card.debuffed && !card.faceDown) node.classList.add('debuffed');
    if (card.faceDown) node.classList.add('facedown');
    node.innerHTML =
      `<span class="pc-rank">${rankLabel(card.rank)}</span>` +
      `<span class="pc-suit-sm">${SUITS[card.suit].symbol}</span>` +
      `<span class="pc-suit-big">${SUITS[card.suit].symbol}</span>` +
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
    // Mouse fallback for desktop testing.
    node.addEventListener('click', (ev) => {
      if (ev.pointerType === 'touch') return;
      if ('ontouchstart' in window) return;
      this.toggleCard(card);
    });
    node.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.showCardInfo(card); });
  }

  toggleCard(card) {
    if (this.animating) return;
    if (this.selected.has(card.uid)) this.selected.delete(card.uid);
    else {
      if (this.selected.size >= 5) { this.toast('Maximum 5 cards', 'warn'); return; }
      this.selected.add(card.uid);
    }
    // Toggle in place rather than re-rendering, so the raise animation plays.
    const node = $('hand-row').querySelector(`[data-uid="${card.uid}"]`);
    if (node) node.classList.toggle('selected', this.selected.has(card.uid));
    else this.renderHand();
    this.previewHand();
    this.updateActionButtons();
  }

  selectedCards() { return this.e.hand.filter((c) => this.selected.has(c.uid)); }

  // ── jokers & consumables ────────────────────────────────────────────
  renderJokers() {
    const e = this.e;
    const row = $('jokers-row');
    row.innerHTML = '';
    $('jokers-count').textContent = `${e.jokers.length}/${e.jokerSlots}`;
    $('jokers-strip').classList.toggle('empty', !e.jokers.length);
    if (!e.jokers.length) { row.appendChild(h('div', 'strip-empty', 'No Jokers yet — buy some in the shop')); return; }
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
      row.appendChild(node);
    }
  }

  renderConsumables() {
    const e = this.e;
    const row = $('consumables-row');
    row.innerHTML = '';
    $('cons-count').textContent = `${e.consumables.length}/${e.consumableSlots}`;
    $('consumables-strip').classList.toggle('empty', !e.consumables.length);
    if (!e.consumables.length) { row.appendChild(h('div', 'strip-empty', 'No consumables')); return; }
    for (const card of e.consumables) {
      const def = CONSUMABLES[card.key] || {};
      const node = h('div', `ctile kind-${def.kind || 'tarot'}`);
      if (card.negative) node.classList.add('edition-negative');
      node.innerHTML = `<span class="jt-emoji">${def.emoji || '🎴'}</span>`;
      node.addEventListener('click', () => this.showConsumableInfo(card));
      row.appendChild(node);
    }
  }

  // ── stage ───────────────────────────────────────────────────────────
  renderStage() {
    const stage = $('stage');
    const e = this.e;
    stage.innerHTML = '';
    if (e.gameState === 'blind_select') this.renderBlindSelect(stage);
    else if (e.gameState === 'shop') this.renderShop(stage);
  }

  renderBlindSelect(stage) {
    const e = this.e;
    const wrap = h('div', 'blind-choices');
    const order = e.blindOrder();
    const currentIndex = e.round % 3;

    order.forEach((type, i) => {
      const info = e.blindInfo(type);
      const card = h('div', `blind-card ${type === 'boss' ? 'boss' : ''} ${i === currentIndex ? 'current' : ''} ${i < currentIndex ? 'done' : ''}`);
      card.innerHTML =
        `<div class="bc-top">
           <div class="bc-emoji">${info.emoji}</div>
           <div class="bc-title"><b>${info.name}</b><span>${info.desc}</span></div>
           <div class="bc-reward">${'$'.repeat(info.reward)}</div>
         </div>
         <div class="bc-score">
           <span class="bc-score-lbl">Score at least</span>
           <span class="bc-score-val">${fmt(info.chips)}</span>
         </div>`;
      if (i === currentIndex) {
        const actions = h('div', 'bc-actions');
        const play = h('button', 'btn btn-blue', 'Play Blind');
        play.addEventListener('click', () => { this.selected.clear(); e.selectBlind(); });
        actions.appendChild(play);
        if (info.skippable) {
          const skip = h('button', 'btn btn-ghost', 'Skip for Tag');
          skip.addEventListener('click', () => e.skipBlind());
          actions.appendChild(skip);
        }
        if (type === 'boss' && (e.hasVoucher('directors_cut') || e.hasVoucher('retcon'))) {
          const canReroll = e.hasVoucher('retcon') || e.bossRerollsThisAnte < 1;
          const reroll = h('button', 'btn btn-ghost', 'Reroll $10');
          reroll.disabled = !canReroll;
          reroll.addEventListener('click', () => e.rerollBoss());
          actions.appendChild(reroll);
        }
        card.appendChild(actions);
      }
      wrap.appendChild(card);
    });
    stage.appendChild(wrap);

    const tips = h('div', 'panel');
    tips.innerHTML = `<h2 class="panel-title">Run</h2>
      <div class="deck-stats">
        <div class="deck-stat"><b>${DECKS[e.deckKey].name.replace(' Deck', '')}</b><small>Deck</small></div>
        <div class="deck-stat"><b>${e.maxHands}</b><small>Hands</small></div>
        <div class="deck-stat"><b>${e.maxDiscards}</b><small>Discards</small></div>
        <div class="deck-stat"><b>${e.handSize}</b><small>Hand size</small></div>
      </div>`;
    const btn = h('button', 'btn btn-ghost btn-small', 'Run Info');
    btn.addEventListener('click', () => this.showRunInfo());
    tips.appendChild(btn);
    stage.appendChild(tips);
  }

  // ── shop ────────────────────────────────────────────────────────────
  renderShop(stage) {
    const e = this.e;
    const shop = e.shop;
    if (!shop) return;

    const head = h('div', 'shop-head', '<h2>Shop</h2>');
    stage.appendChild(head);

    const grid = h('div', 'shop-grid');
    for (const item of shop.items) grid.appendChild(this.shopItemEl(item));
    if (!shop.items.length) grid.appendChild(h('div', 'strip-empty', 'Sold out — reroll for more'));
    stage.appendChild(grid);

    if (shop.voucher) {
      stage.appendChild(h('div', 'shop-section-label', 'Voucher'));
      const vgrid = h('div', 'shop-grid');
      vgrid.appendChild(this.shopItemEl(shop.voucher));
      stage.appendChild(vgrid);
    }

    if (shop.packs.length) {
      stage.appendChild(h('div', 'shop-section-label', 'Booster Packs'));
      const pgrid = h('div', 'shop-grid');
      for (const pack of shop.packs) pgrid.appendChild(this.shopItemEl(pack));
      stage.appendChild(pgrid);
    }

    const foot = h('div', 'shop-foot');
    const rerollCost = shop.freeRerolls > 0 ? 0 : shop.rerollCost;
    const reroll = h('button', 'btn btn-red', `Reroll $${rerollCost}`);
    reroll.addEventListener('click', () => e.rerollShop());
    const next = h('button', 'btn btn-green', 'Next Round →');
    next.addEventListener('click', () => e.exitShop());
    foot.appendChild(reroll);
    foot.appendChild(next);
    stage.appendChild(foot);
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
      node.querySelector('.si-emoji').innerHTML = '';
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
    if (item.kind === 'voucher') {
      const v = VOUCHERS[item.key];
      return { emoji: '🎟', name: v.name };
    }
    if (item.kind === 'pack') {
      const p = PACK_BY_KEY[item.packKey];
      const emoji = { tarot: '🔮', planet: '🪐', playing: '🎴', joker: '🤡', spectral: '👻' }[p.kind];
      return { emoji, name: p.name };
    }
    if (item.kind === 'playing') {
      return { emoji: '🎴', name: shortCardName(item.card) };
    }
    const def = CONSUMABLES[item.key];
    return { emoji: def.emoji, name: def.name };
  }

  // ── overlays ────────────────────────────────────────────────────────
  openOverlay(node, opts = {}) {
    const overlay = $('overlay');
    overlay.innerHTML = '';
    const sheet = h('div', 'sheet');
    sheet.appendChild(node);
    overlay.appendChild(sheet);
    overlay.classList.remove('hidden');
    overlay.onclick = (ev) => { if (ev.target === overlay && !opts.sticky) this.closeOverlay(); };
  }

  closeOverlay() {
    const overlay = $('overlay');
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
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
    const parts = [];
    parts.push(`<b>+${cardChips(card)} Chips</b> when scored`);
    if (card.enhancement) parts.push(`<b>${ENHANCEMENTS[card.enhancement].name}</b> — ${ENHANCEMENTS[card.enhancement].desc}`);
    if (card.edition) parts.push(`<b>${EDITIONS[card.edition].name}</b> — ${EDITIONS[card.edition].desc}`);
    if (card.seal) parts.push(`<b>${SEALS[card.seal].name}</b> — ${SEALS[card.seal].desc}`);
    if (card.debuffed) parts.push('<b style="color:var(--mult)">Debuffed</b> — scores nothing this round');
    this.openOverlay(this.infoSheet({
      emoji: SUITS[card.suit].symbol,
      title: cardName(card),
      subtitle: 'Playing card',
      desc: parts.join('<br>'),
    }));
  }

  showJokerInfo(joker) {
    const e = this.e;
    const def = JOKERS[joker.key] || {};
    const actions = [];
    const index = e.jokers.indexOf(joker);
    actions.push({
      label: `Sell $${e.sellValue(joker)}`, cls: 'btn-gold',
      onClick: () => e.sellJoker(joker),
    });
    if (index > 0) actions.push({ label: '◀ Move', onClick: () => { e.moveJoker(index, index - 1); } });
    if (index < e.jokers.length - 1) actions.push({ label: 'Move ▶', onClick: () => { e.moveJoker(index, index + 1); } });
    this.openOverlay(this.infoSheet({
      emoji: def.emoji || '🃏',
      title: def.name || joker.key,
      subtitle: `${RARITY[def.rarity] ? RARITY[def.rarity].name : ''}${joker.edition ? ` · ${EDITIONS[joker.edition].name}` : ''}`,
      subtitleColor: RARITY[def.rarity] ? RARITY[def.rarity].color : null,
      desc: jokerDesc(joker, e) + (joker.edition ? `<br><span class="muted">${EDITIONS[joker.edition].desc}</span>` : ''),
      actions,
    }));
  }

  showConsumableInfo(card) {
    const e = this.e;
    const def = CONSUMABLES[card.key] || {};
    const selected = this.selectedCards();
    const check = e.canUseConsumable(card, selected);
    const [min, max] = e.consumableRequirement(card);
    const hint = min > 0 ? `<br><span class="muted">Select ${min === max ? min : `${min}–${max}`} card(s) in your hand first.</span>` : '';
    const usableNow = e.gameState === 'playing' || min === 0;
    this.openOverlay(this.infoSheet({
      emoji: def.emoji || '🎴',
      title: def.name || card.key,
      subtitle: def.kind ? def.kind.toUpperCase() : '',
      desc: consumableDesc(card, e) + hint + (check.ok ? '' : `<br><span style="color:var(--gold)">${check.reason}</span>`),
      actions: [
        {
          label: 'Use', cls: 'btn-green', disabled: !check.ok || !usableNow,
          onClick: () => { if (e.useConsumable(card, selected)) { this.selected.clear(); this.render(); } },
        },
        { label: `Sell $${Math.max(1, Math.floor((def.cost || 3) / 2))}`, cls: 'btn-gold', onClick: () => {
          const i = e.consumables.indexOf(card);
          if (i >= 0) e.consumables.splice(i, 1);
          e.addMoney(Math.max(1, Math.floor((def.cost || 3) / 2)), 'Sold');
          e.emit('state');
        } },
      ],
    }));
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
      desc = `Choose <b>${p.choose}</b> of <b>${p.size}</b> ${{ tarot: 'Tarot', planet: 'Planet', playing: 'playing', joker: 'Joker', spectral: 'Spectral' }[p.kind]} cards.`;
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
        onClick: () => { if (item.kind === 'pack') e.buyPack(item); else e.buyShopItem(item); },
      }],
    }));
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
      item.addEventListener('click', () => {
        this.showPackOptionInfo(option);
      });
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
        onClick: () => { const taken = e.takePackOption(option); if (e.pack) this.showPack(); else if (!taken) this.showPack(); },
      }],
      onClose: () => { if (e.pack) this.showPack(); },
    }), { sticky: true });
  }

  // ── cash out / end states ───────────────────────────────────────────
  showCashOut(summary) {
    const e = this.e;
    const node = h('div', 'cashout');
    node.appendChild(h('h2', null, 'Blind Defeated'));
    node.appendChild(h('div', 'cashout-total', `$${summary.payout}`));
    const list = h('div');
    for (const line of summary.details) {
      list.appendChild(h('div', 'cash-line', `<span>${line.label}</span><b>+$${line.amount}</b>`));
    }
    list.appendChild(h('div', 'cash-line', `<span>Score</span><b>${fmt(summary.score)} / ${fmt(summary.required)}</b>`));
    node.appendChild(list);
    const btn = h('button', 'btn btn-green btn-big', 'Cash Out');
    btn.addEventListener('click', () => { this.closeOverlay(); this.selected.clear(); e.proceedAfterRound(); });
    node.appendChild(btn);
    this.openOverlay(node, { sticky: true });
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
    this.openOverlay(node, { sticky: true });
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
    this.openOverlay(node, { sticky: true });
  }

  // ── info panels ─────────────────────────────────────────────────────
  showRunMenu() {
    const node = h('div');
    node.appendChild(h('h2', null, 'Menu'));
    const add = (label, cls, fn) => {
      const b = h('button', `btn ${cls}`, label);
      b.addEventListener('click', fn);
      node.appendChild(b);
    };
    add('Run Info', 'btn-blue', () => this.showRunInfo());
    add('Poker Hands', 'btn-blue', () => this.showHandLevels());
    add('View Deck', 'btn-blue', () => this.showDeckView());
    add('Save & Quit to Menu', 'btn-gold', () => { this.closeOverlay(); this.app.saveAndQuit(); });
    add('Abandon Run', 'btn-red', () => { this.closeOverlay(); this.app.endRun(); });
    add('Close', 'btn-ghost', () => this.closeOverlay());
    this.openOverlay(node);
  }

  showHandLevels() {
    const e = this.e;
    const node = h('div');
    node.appendChild(h('h2', null, 'Poker Hands'));
    const table = h('table', 'hand-table');
    for (const key of HAND_ORDER) {
      if (!e.discovered.has(key)) continue;
      const level = e.handLevels[key] || 1;
      const v = handValues(key, level);
      const row = h('tr');
      row.innerHTML =
        `<td class="ht-lvl">${level}</td>` +
        `<td>${HAND_NAMES[key]}</td>` +
        `<td class="ht-chips">${v.chips}</td>` +
        `<td class="ht-mult">×${v.mult}</td>` +
        `<td class="ht-plays">${e.handPlays[key] || 0}</td>`;
      table.appendChild(row);
    }
    node.appendChild(table);
    const hidden = HAND_ORDER.filter((k) => !e.discovered.has(k));
    if (hidden.length) node.appendChild(h('p', null, `${hidden.length} secret hand${hidden.length > 1 ? 's' : ''} still undiscovered.`));
    const close = h('button', 'btn btn-ghost', 'Close');
    close.addEventListener('click', () => this.closeOverlay());
    node.appendChild(close);
    this.openOverlay(node);
  }

  showDeckView() {
    const e = this.e;
    const node = h('div');
    node.appendChild(h('h2', null, `${DECKS[e.deckKey].name} — ${e.fullDeck.length} cards`));
    const stats = h('div', 'deck-stats');
    const suits = { S: 0, H: 0, D: 0, C: 0 };
    let faces = 0; let aces = 0; let enhanced = 0;
    for (const c of e.fullDeck) {
      if (c.enhancement !== 'stone') suits[c.suit] += 1;
      if (c.rank >= 11 && c.rank <= 13) faces += 1;
      if (c.rank === 14) aces += 1;
      if (c.enhancement) enhanced += 1;
    }
    stats.innerHTML =
      `<div class="deck-stat"><b>${faces}</b><small>Faces</small></div>` +
      `<div class="deck-stat"><b>${aces}</b><small>Aces</small></div>` +
      `<div class="deck-stat"><b>${enhanced}</b><small>Enhanced</small></div>` +
      `<div class="deck-stat"><b>${e.drawPile.length}</b><small>In deck</small></div>`;
    node.appendChild(stats);
    node.appendChild(h('div', 'shop-section-label',
      `♠ ${suits.S} &nbsp; ♥ ${suits.H} &nbsp; ♦ ${suits.D} &nbsp; ♣ ${suits.C}`));

    const grid = h('div', 'deck-grid sheet-scroll');
    const sorted = e.fullDeck.slice().sort((a, b) => 'SHDC'.indexOf(a.suit) - 'SHDC'.indexOf(b.suit) || b.rank - a.rank);
    for (const card of sorted) {
      const el = this.cardEl(card);
      el.classList.remove('debuffed');
      el.addEventListener('click', () => this.showCardInfo(card));
      grid.appendChild(el);
    }
    node.appendChild(grid);
    const close = h('button', 'btn btn-ghost', 'Close');
    close.addEventListener('click', () => this.closeOverlay());
    node.appendChild(close);
    this.openOverlay(node);
  }

  showRunInfo() {
    const e = this.e;
    const node = h('div');
    node.appendChild(h('h2', null, 'Run Info'));
    node.appendChild(h('div', 'shop-section-label', `Seed ${e.seed} · ${DECKS[e.deckKey].name}`));

    node.appendChild(h('h3', null, 'Vouchers'));
    if (e.vouchers.size) {
      const list = h('div', 'voucher-list');
      for (const key of e.vouchers) {
        list.appendChild(h('div', 'voucher-row', `<b>${VOUCHERS[key].name}</b><span>${VOUCHERS[key].desc}</span>`));
      }
      node.appendChild(list);
    } else node.appendChild(h('p', null, 'None redeemed yet.'));

    node.appendChild(h('h3', null, 'Stats'));
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

    const close = h('button', 'btn btn-ghost', 'Close');
    close.addEventListener('click', () => this.closeOverlay());
    node.appendChild(close);
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
    const played = selected.slice();
    this.selected.clear();

    const result = e.playHand(played);
    if (!result) { this.animating = false; this.render(); return; }

    this.renderHand();
    this.showPlayed(played);
    await this.animateScore(result, played);
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

  async animateScore(result, played) {
    const steps = result.steps;
    const delay = Math.max(40, Math.min(130, Math.round(1600 / Math.max(1, steps.length))));
    let chips = 0;
    let mult = 0;
    const chipsEl = $('calc-chips');
    const multEl = $('calc-mult');
    $('calc-hand').textContent = `${HAND_NAMES[result.handKey]}  lvl ${result.level}`;

    for (const step of steps) {
      if (step.type === 'base') {
        chips = step.chips; mult = step.mult;
        chipsEl.textContent = fmt(chips);
        multEl.textContent = fmt(mult);
        this.bump();
        await wait(delay * 2);
      } else if (step.type === 'card_trigger') {
        const node = $('play-area').querySelector(`[data-played-uid="${step.card.uid}"]`);
        if (node) { node.classList.remove('scoring'); void node.offsetWidth; node.classList.add('scoring'); }
        await wait(delay * 0.6);
      } else if (step.type === 'card_debuffed') {
        const node = $('play-area').querySelector(`[data-played-uid="${step.card.uid}"]`);
        if (node) this.floatAt(node, 'debuffed', 'mult');
        await wait(delay);
      } else if (step.type === 'effect') {
        chips = step.chips; mult = step.mult;
        chipsEl.textContent = fmt(chips);
        multEl.textContent = fmt(round2(mult));
        this.bump();
        const anchor = step.card
          ? $('play-area').querySelector(`[data-played-uid="${step.card.uid}"]`) || this.handNode(step.card)
          : this.jokerNodeByName(step.source);
        for (const part of step.parts) this.floatAt(anchor, partText(part), part.kind);
        await wait(delay);
      } else if (step.type === 'balance') {
        chips = step.chips; mult = step.mult;
        chipsEl.textContent = fmt(chips);
        multEl.textContent = fmt(mult);
        this.bump();
        await wait(delay);
      } else if (step.type === 'total') {
        chipsEl.textContent = fmt(step.chips);
        multEl.textContent = fmt(round2(step.mult));
        await wait(delay * 2);
        this.floatAt($('score-bar'), `+${fmt(step.score)}`, 'money');
      }
    }
    await wait(200);
  }

  bump() {
    const row = $('calc-row');
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
    const rect = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2 - 20, top: window.innerHeight / 2 };
    node.style.left = `${rect.left + (anchor ? anchor.offsetWidth / 2 : 0)}px`;
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
