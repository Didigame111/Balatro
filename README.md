# Balatro

A poker roguelike deck-builder, rebuilt from scratch as an installable web app for
iPhone. Play a poker hand, watch chips and multipliers explode, buy Jokers that
break the rules, and try to survive eight Antes.

**Plays in landscape** — sidebar on the left, felt table on the right, laid out
to match the original's screen.

A personal project: everything here is written from scratch. There is no build
step, no framework and no network dependency — just plain ES modules, one
stylesheet, a service worker, and music, sound effects and icons that are all
generated in code rather than shipped as files.

<p align="center">
  <img src="icons/icon-192.png" width="96" alt="App icon">
</p>

## Install on an iPhone

1. Deploy it (see **Deploying to Vercel**) or serve it locally over `localhost`.
2. Open the URL in **Safari** on the phone — it must be Safari, Chrome on iOS
   cannot add to the Home Screen.
3. Tap the Share button → **Add to Home Screen**.
4. Launch it from the Home Screen icon and **turn the phone sideways**.

Installed, it runs full-screen with no browser chrome, respects the notch and
home-indicator safe areas, and works with no connection at all. The layout is
tuned for the iPhone 13's 844 × 390 pt landscape viewport; cards, type and the
sidebar all scale from the viewport, so smaller phones and iPads get the same
proportions. Held in portrait it shows a rotate prompt — if nothing happens when
you turn the phone, switch off Rotation Lock in Control Centre.

Progress autosaves to `localStorage` after every action, so quitting mid-run and
relaunching later picks up exactly where you left off.

## Deploying to Vercel

The repo is a static site with a `vercel.json` already committed, so there is
nothing to configure. Pick either route.

### Option A — the dashboard (easiest)

1. Push this branch to GitHub (already done).
2. Go to [vercel.com/new](https://vercel.com/new) and **Import** the repository.
3. When asked for a Framework Preset choose **Other**. Leave Build Command,
   Output Directory and Install Command on their defaults — `vercel.json`
   already sets them.
4. Set **Production Branch** to `claude/balatro-iphone-web-app-ot7l30` under
   *Settings → Git*, or merge the branch into `main` first.
5. Click **Deploy**. You get a `https://<project>.vercel.app` URL in about
   twenty seconds.

Every later push to the production branch redeploys automatically.

### Option B — the CLI

```bash
npm i -g vercel
vercel login
vercel          # first run: answers get saved to .vercel/, creates a preview
vercel --prod   # promote to the production URL
```

Answer the setup prompts with: link to existing project **no**, project name
**balatro**, directory **./**, override settings **no**.

### After deploying

Open the production URL in Safari on the iPhone and Add to Home Screen. Vercel
serves everything over HTTPS, which is what the service worker needs, so the
game will keep working with the phone in airplane mode once it has loaded once.

### Notes

- `vercel.json` marks `sw.js`, `index.html`, the JS and the CSS as
  `must-revalidate` so a new deploy is picked up rather than being served from
  a stale edge cache. Icons are cached for a week.
- The service worker itself is cache-first. After deploying an update, the new
  version is fetched in the background and applied on the *next* launch. To see
  a change immediately, bump `CACHE_VERSION` in `sw.js`.
- There is no server component and nothing to configure — no environment
  variables, no database. Saves live in the browser's `localStorage` on the
  device, so clearing Safari's website data wipes an in-progress run.

## Running locally

```bash
python3 -m http.server 8080   # or: npm run serve
open http://localhost:8080
```

Any static file server works. To reach it from a phone on the same network, use
your machine's LAN address — note that iOS only registers a service worker over
HTTPS or `localhost`, so offline mode needs one of those.

## How it plays

Beat each **Blind** by scoring at least the required chips before running out of
hands.

**Score = Chips × Mult.** Your poker hand sets the base values, each scoring card
adds its own chips, and your Jokers pile on from there. Jokers trigger strictly
left to right, so ordering `+Mult` before `×Mult` is a real decision.

Each Ante is Small Blind → Big Blind → Boss Blind. Small and Big blinds can be
skipped to claim a **Tag** instead of the cash reward. Between blinds you shop
for Jokers, consumables, vouchers and booster packs. Clear Ante 8 to win, then
continue into endless mode if you want to see how far the numbers go.

### Controls

| Action | Gesture |
| --- | --- |
| Select a card (up to 5) | Tap |
| Inspect a card | Long-press |
| Inspect / sell / reorder a Joker | Tap it |
| Use a consumable | Select cards in hand first, then tap the consumable |
| Poker hand levels, blinds, vouchers | **Run Info** in the sidebar |
| Settings, stats, collection, deck, quit | **Options** in the sidebar |
| View the full deck | Tap the deck pile |

As soon as you select cards, the sidebar names the hand you are holding, shows
its current level, and fills in the base Chips × Mult it will score with — so you
can compare two possible hands before committing one.

## What is in it

- **12 poker hands**, including the three secret ones, each with its own level
  track that Planet cards upgrade.
- **143 Jokers** across Common, Uncommon, Rare and Legendary, with real effects —
  retriggers, scaling multipliers, economy engines, and Blueprint/Brainstorm,
  which copy another Joker's ability.
- **22 Tarots, 12 Planets and 18 Spectrals**, including The Soul and Black Hole.
- **32 Vouchers** in eight upgrade chains.
- **28 Boss Blinds** with distinct rules, including five Ante-8 finishers.
- **24 skip Tags**, **15 booster pack** variants and **15 starting decks**.
- Card **enhancements** (Bonus, Mult, Wild, Glass, Steel, Stone, Gold, Lucky),
  **editions** (Foil, Holographic, Polychrome, Negative) and **seals**
  (Gold, Red, Blue, Purple).
- Seeded runs — enter a seed on the setup screen and the whole run, shop rolls
  included, is reproducible.

## Layout

The screen splits the way the original does.

**Left sidebar** — the blind you are fighting and its target score, the round
score so far, the hand readout (name, level, and the running Chips × Mult during
scoring), then Run Info / Options and the hands, discards, money, ante and round
counters.

**Table** — Joker and consumable trays across the top with their slot counts,
the felt where played cards resolve, your hand fanned in an arc along the
bottom, the Play / Sort / Discard controls, and the draw pile in the corner.

Cards are drawn in CSS with real pip layouts — a nine shows nine pips in the
traditional arrangement, aces get a single large pip, court cards a framed
index — plus corner indices at both ends. Enhancements tint the face, editions
wash it with a gradient, and seals show as a coloured dot.

## Sound

There are no audio files. `js/audio.js` is a small Web Audio synthesiser that
plays a live lounge-jazz trio and every sound effect from scratch.

**The band.** A sequencer runs an eight-bar chord progression with swung
eighth notes, and four synthesised voices play over it: a filtered triangle
upright bass, a rootless comping chord voicing, a vibraphone that improvises a
melody line, and brushed drums built from filtered noise. The melody is picked
fresh every bar — it walks by step through the scale that fits the current
chord, so it stays in key but never repeats exactly. Everything runs through a
generated reverb impulse and a master limiter.

The music follows the game:

| Screen | Feel |
| --- | --- |
| Title, blind select | 82–96 BPM minor turnaround, brushes only |
| Playing a blind | Full trio, walking bass |
| Boss Blind | 104 BPM, darker progression, driving bass |
| Shop | Brighter major progression, lighter drums |

Mood changes are queued to the top of the next bar so they land musically
instead of cutting off mid-phrase.

**Effects.** Eighteen synthesised cues. The signature one is the scoring run:
each card that scores plays the next step up a major pentatonic, rolling into
the next octave, so a five-card hand with retriggers climbs. Multipliers,
X-multipliers and money each get their own timbre, and only the flashiest part
of an effect makes a sound so the mix stays readable.

Audio is off until you touch the screen — browsers require that — and Music,
Sound Effects and Volume are all in the **Sound** menu. On iPhone the hardware
ring/silent switch mutes web audio, so flip it to ring if the game is silent.

## Project layout

```
index.html               markup shell: HUD, trays, hand dock, overlay host
vercel.json              static-hosting config: cache headers, no build step
css/style.css            the entire visual design, tuned for a 390pt viewport
js/rng.js                seeded mulberry32 PRNG; makes runs reproducible
js/cards.js              card model: ranks, suits, enhancements, editions, seals
js/poker.js              hand detection and which cards actually score
js/data.js               hand levels, blinds, bosses, vouchers, tags, packs, decks
js/jokers.js             every Joker definition and its hooks
js/consumables.js        Tarot / Planet / Spectral definitions
js/audio.js              Web Audio synth: the band, the sequencer and the SFX
js/engine.js             run state, scoring pipeline, shop, progression, saves
js/ui.js                 rendering, touch handling, scoring animation
js/main.js               menu wiring, autosave, service worker registration
sw.js                    cache-first offline shell
scripts/gen_icons.py     renders the PNG icons with no dependencies
test/                    node:test suite plus an autoplaying bot
```

The engine has no DOM dependencies: it exposes state plus an event emitter, and
scoring returns an ordered list of steps that the UI replays as an animation.
That split is what lets the test suite play thousands of hands headlessly.

### Scoring order

1. Base chips and mult from the played hand's current level.
2. Each scoring card, left to right: its chips, then enhancement, edition, seal,
   then every Joker's `scored` hook — repeated for each retrigger.
3. Each card held in hand (Steel cards, Baron, Shoot the Moon, …).
4. Each Joker's independent effect, left to right.
5. Deck-wide rules such as the Plasma Deck balancing chips against mult.

## Development

```bash
npm test              # 57 tests: poker rules, scoring, audio theory, full runs
npm run icons         # regenerate icons/*.png
```

The suite covers hand detection, exact scoring arithmetic, joker ordering,
boss-blind behaviour, save/load round-trips and seed determinism. It also runs an
autoplaying bot through complete runs on every deck, which is what catches
crashes in rarely-hit combinations — every Joker, consumable and boss is
instantiated and exercised at least once.

The Web Audio graph needs a browser, but the music theory behind it is plain
data, so the chord tables, scales and progressions are checked in Node — that is
what caught a ♭9 chord whose melody scale disagreed with its own voicing.

## Notes

Built for personal use. All code and art here are written from scratch — the
cards and UI are drawn with CSS, the music and effects are synthesised at
runtime, the icons are generated by `scripts/gen_icons.py`, and no sprite, sound
or data file from the commercial game is included. Not affiliated with or endorsed by LocalThunk or Playstack.
