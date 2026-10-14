# DON'T LOSE YOUR HEAD — Cinemacity Halloween 2026

Steady-hand web game for the mystery screening campaign. Inhaus Digital × Cinemacity.
Built against `01-BRIEF/Dont-Lose-Your-Head_Game-Concept.pdf` (the brief wins over the deck prototype).

## Folder map

```
01-BRIEF/        brief PDF, campaign deck, poster style reference, scare reference
02-GENERATED/    raw Higgsfield outputs (full-res PNG + MP3) — keep for re-cuts
03-GAME/         the deployable game (upload this folder as-is)
  index.html     all screens (landing, how-to, level card, game, scare, lose, win, form, thanks, rotate)
  css/style.css  look & feel: charcoal / ivory / blood, Fraunces + IBM Plex Mono, film grain
  js/config.js   campaign settings: API base, close date, Turnstile key, copy lists, scare rotation
  js/game.js     engine: input, geometry collision, hazards, scare, counter, form, share card
  levels/levels.js  five level layouts as data (points, widths, hazards, timers)
  assets/        compressed scares (JPEG), hazard sprites (PNG alpha), audio (MP3), share plate
  tools/serve.js local static server for QA:  node tools/serve.js  →  http://localhost:8765
```

## Run locally

```bash
node "03-GAME/tools/serve.js"
```
Open http://localhost:8765 (a server is required: audio is fetched + decoded, which `file://` blocks).

## QA switches (query string)

| Param        | Effect                                                  |
|--------------|---------------------------------------------------------|
| `?level=4`   | Start at level 4 (1–5). For screen recordings per level. |
| `?scare=off` | Skip the jump scare overlay (QA only, never ship linked). |

## Levels (reduced to three on client request, 2026-10-13)

| # | Name               | Width | Hazard                                                          | Timer |
|---|--------------------|-------|-----------------------------------------------------------------|-------|
| 1 | The Bedroom Door   | 8%    | door on the straight run opens/closes every 4.8s; pass when open | 60s   |
| 2 | The Crawl          | 5.5%  | seven-row switchback, walls breathe ±15% / 2s, creak on corners  | 60s   |
| 3 | The Lights Go Down | 4%    | tight snake; corridor blacks out for 0.7s every 3.8s; a door at 42%; walls breathe; whisper | 60s |

Earlier rounds: 60s timers on every level; draw only on a win; trail behind the dot; scarier landing; share sheet; cinematic ambience; magical clear sting; desktop 16:9 asset set in `assets/desktop/`.
Brand palette applied 2026-10-13 from the campaign KVs in `01-BRIEF/campaign-kv/`: green #0C3E30 field, ivory #EDE6D6 type, accent #FD4334 (cursor, end dot, primary buttons). Generated monochrome plates and scares are graded green with CSS blend layers rather than regenerated; the share card is graded on canvas.
Cursor start: while a level is idle the system cursor is visible, the red dot sits on the start light with a START HERE label, and the custom cursor only takes over once the level is armed.

Round 6: subtle per-level plates behind the board (`assets/levels/`, wide versions in `assets/desktop/`; bedroom door, staircase, auditorium) at 28% with a green colour blend and vignette. Mobile: timer is a boxed 22px readout top-right that blinks under 5s; the cursor floats 16mm above the fingertip and a dotted tether with a ring shows exactly where the finger is; the how-to screen explains it on touch devices.

Round 7 (2026-10-14): ambience bed lowered to 0.2 (from 0.32), normalised to 0.5 and run through a −5 dB low-shelf under 140 Hz, about a quarter of the previous loudness so the sub-bass no longer dominates.

Round 8 (2026-10-14): iOS audio. Unlock now listens on touchend/click (Safari ignores touchstart/pointerdown for audio activation), ambience waits for the context's statechange→running before starting, and a near-silent looping <audio> element is played on the first gesture so the iOS audio session switches to playback and Web Audio is heard even with the ringer switch on silent.

Round 9 (2026-10-14): run clock + leaderboard + challenge share. The run time is the sum of the three levels' play time (from arming to the end dot; the cards in between don't count). The win screen shows it big; "Join the leaderboard" asks for a name and saves the time. Without a backend the board lives in this device's `localStorage` (`dlyh_scores`, best 50) and says so on screen; with `apiBase` set it calls `GET /scores?limit=10` and `POST /scores {name, ms}`. The share message is now a block-grid challenge, e.g.
```
DON'T LOSE YOUR HEAD 🔪
I kept my head in 0:27.02 · #1 on the leaderboard
🟩🟩🟩 3/3 levels
Beat my time if your hands are steady enough.
<link>
```
(losses show 🟩🟥⬛ with the level reached and the scare number). Share copies message + link and pre-fills WhatsApp / Telegram / X / email.
Also fixed: the hint strip under the board now has a fixed height; it used to reflow when the level armed, which nudged the board a few pixels and killed the player on their first move.

Round 10 (2026-10-14): link preview thumbnail (`assets/og-image.jpg`, 1200×630, Open Graph + Twitter tags in `index.html` — the og:image URL is absolute and currently points at `https://dcallen92.github.io/dont-lose-your-head/`; change it if the repo name or domain differs, WhatsApp will not show a thumbnail otherwise). Ambience bed replaced with a strings version that has more mid-range, and the engine now high-passes it at 80 Hz, shelves 160 Hz down 4 dB and lifts 600 Hz by 7 dB, so phone speakers (which cannot reproduce sub-bass) actually carry it; touch devices get a 1.6× level boost. Wall contact now counts at the edge of the red dot (radius 2.5 units) instead of its centre, so visibly touching a wall always loses, including while the walls breathe.

Rebalance by editing `levels/levels.js` only (points, `widthPct`, hazard timings).

## Scare system (brief §05)

* Fires synchronously on loss: overlay + scream + vibrate in the same frame.
* 70ms white flash → lunge (60%→140% in 150ms) → 1.1s shake → hard cut to black at 1.4s → lose screen.
* 5 original monochrome artworks, intensity 1–5. A level can draw intensity ≤ level+1; never the same twice in a row.
* 4 scream stings, normalised to −1 dBFS peak at decode. Preloaded before "I'm in". If the AudioContext is still suspended when a scare fires, an HTMLAudio fallback plays the scream; a synth scream is the last resort.
* One flash per scare (≤3/s rule). No strobing.

## Backend hooks (not included, see `js/config.js`)

* `POST {apiBase}/scare` → `{count}` atomic global counter. Without a backend the counter runs locally from `counterSeed`.
* `GET {apiBase}/scores?limit=10` → `[{name, ms}]` fastest first; `POST {apiBase}/scores` `{name, ms}`. Local fallback in `localStorage`.
* `POST {apiBase}/entries` JSON; return 409 for a duplicate email. Without a backend entries are stored in `localStorage` under `dlyh_entries` (QA only).
* Cloudflare Turnstile: set `turnstileSiteKey`; the token is posted as `turnstile`.
* Analytics: every event is pushed to `dataLayer`, and to `gtag` / `fbq` when present:
  `game_start, level_start_n, level_clear_n, scare_n, win, entry_submit, share, play_again`. UTMs are captured and attached to entries.

## Publishing to GitHub

Drag-and-drop route: `04-DELIVERY/dont-lose-your-head/` is a plain copy of the game (no `.git`, no zip). On github.com create an empty repo, choose "uploading an existing file", and drag the *contents* of that folder (all files and sub-folders) into the page, then commit. Chrome and Safari upload nested folders correctly when you drag them in.

Command-line route: `03-GAME/` is already a git repository with the whole game committed on `main`. This Mac has no GitHub credentials (no `gh`, no SSH key, no stored token), so the push is a one-time manual step:

1. Create an empty repo on github.com (suggested name `dont-lose-your-head`, private until Cinemacity signs off).
2. Then, in a terminal:

```bash
cd "/Users/inhaus/Documents/CLAUDE CODE PROJECTS/CINEMACITY GAME/03-GAME"
git remote add origin https://github.com/<your-user>/dont-lose-your-head.git
git push -u origin main
```

GitHub will ask you to sign in in the browser. For GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/ (root)`; the game is static and needs no build step. Set `shareUrl` in `js/config.js` to the final URL afterwards.

## Still open

* Hosting domain + backend (counter, entries DB, CSV export) to confirm with Cinemacity.
* T&Cs and privacy notice URLs (`termsUrl`, `privacyUrl`).
* Real-device QA pass (iOS Safari silent switch, Android fullscreen, haptics).
* Google Fonts are loaded from the CDN; self-host Fraunces + IBM Plex Mono if the campaign domain must be CDN-free.
