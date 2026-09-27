> Status and next steps superseded by HANDOFF-2026-09-26.md; the rest is kept as the trail.

# Survive Coders: recommendations and Opus 5.5 handoff

_Last updated: September 26, 2026. Prepared for a Claude hackathon._

## Objective

Improve the existing game for a short, memorable hackathon demo. Preserve the Context Rot Hydra's design: chat-bubble heads, orange branching necks, growing context, sarcastic dialogue, and the Anthropic office with Furbies. Travis specifically likes the final boss.

Start with reliable progression, fast boss retries, and clearer combat feedback. New levels and enemy types can follow once those changes work.

## Current status and review limits

- Phaser 3 game with Vite, plain JavaScript, a 960x540 canvas, and a world camera zoomed 3x.
- Existing flow: title, SF platforming level, HQ boss, victory or defeat screen.
- Controls: arrows or A/D to move; Up/W/Z to jump; Space/X/J to shoot; 1/2/3 for powers; hold M for spoken commands.
- The source, original design notes, opening scene, and boss scene were reviewed. Refactor was exercised in the browser. This was not a complete playthrough, audio evaluation, or difficulty test.
- `npm run build` passed during review. Vite reported a large JavaScript chunk warning. No test script is configured.
- No gameplay changes were made as part of this review.
- Git at handoff: branch `master`, HEAD `fd9b850`. Untracked screenshots exist under `docs/review/screens/`; preserve them. No Git remote is configured: this checkout is local-only, not backed up through Git.
- No deployed URL was verified. The local preview used port 5173. Confirm the current server state before starting another instance.

Recent commits, newest first:

```text
fd9b850 Exit to HQ on crossing the door x (jumping over it no longer skips it); favicon
a292d3b Anthropic HQ interior (fluted ANTHROPIC wall, SF window, furniture), Furbies in Dario's office, SF trolleys
9456f2e Dev voice hook, keep raw packs out of Vercel uploads
6f91af1 Pixel font everywhere, pixel HUD, hold-M push-to-talk, wood HQ interior tiles, layered parallax
414d2e3 Survive Coders: playable vertical slice
```

## First implementation pass

### 1. Fix progression on repeated runs

**Code finding:** `Level1.exit()` sets `this.leaving = true`, but `create()` never resets it. Phaser reuses the scene instance. After reaching HQ once, another run can reach the door without transitioning.

**Change:** Reset transient level state when the scene starts. Preserve the existing exit behavior that works when the player jumps over the door.

**Files:** `src/scenes/Level1.js`.

**Acceptance:** Reach HQ, restart a full run, and reach HQ again without reloading the page. Repeat once more. Both walking and jumping across the exit must work.

### 2. Make the final hit resolve victory safely

**Code finding:** `Hydra.collapse()` starts a 2.2-second victory sequence but leaves existing hazards and boss-body contact damage active. Queued image-flood callbacks can still spawn hazards. A player can potentially die after defeating the last head, leaving competing victory and defeat transitions.

**Change:** Add a single encounter outcome state. Once victory begins, stop damage, clear hazards, cancel or guard queued attacks, and prevent duplicate end transitions. Preserve the collapse animation, stars, and win sound. Ensure an earlier player defeat cannot be overwritten by a late victory callback.

**Files:** `src/entities/Hydra.js`, `src/scenes/BossHQ.js`, and the outcome hooks in `src/scenes/PlayScene.js`.

**Acceptance:** With one health remaining, defeat the final head while hazards are active and near the body. Victory must occur exactly once. Also test player death during an active flood and leaving/restarting the scene while callbacks are pending.

### 3. Add immediate HQ retry

**Current behavior:** Entering HQ heals the player, but losing sends them through the end screen and title back to the opening level. There is no boss retry option.

**Change:** On boss defeat, make Enter retry HQ directly. Keep a visible option to restart the full game. Restore full health, clear reversed controls and cooldowns, and reset the encounter. Save the star total at initial HQ entry and restore it on retry so repeated attempts cannot farm stars from minions or dead heads.

**Files:** `src/scenes/End.js`, `src/scenes/BossHQ.js`, `src/scenes/PlayScene.js`; reuse `voice.resetCooldowns()`.

**Acceptance:** Three consecutive boss retries work without duplicate music, input listeners, enemies, or timers. A full restart still begins in Daly City. Stars return to the checkpoint total on each HQ retry.

### 4. Add readable boss attack warnings

Keep the current head shapes and palette. Add a small identifying symbol and a short wind-up to each role:

| Head | Warning | Player response |
| --- | --- | --- |
| Image flood | Image icon; mark the selected drop lanes before spawning tiles | Move into an unmarked space |
| Gaslight | Reversed-arrow icon; visible charge before the purple orb | Dodge the orb |
| Spawn | Notification icon; opening-mouth or pulse animation | Prepare to clear minions |

Start testing warnings around 500-700 ms; this is a tuning proposal, not a measured optimum. Select flood positions before displaying their markers and use those same positions for the actual attack. Preserve at least one reasonable escape route.

**Files:** `src/entities/Hydra.js`, `src/sprites.js`.

**Acceptance:** A new player can identify an incoming attack before it deals damage. Warnings stay readable during dialogue and growth. They disappear on attack cancellation, boss death, and retry.

### 5. Explain context growth and refactor

**Current behavior:** Every eight seconds, surviving heads grow, gain health, reach farther, and attack faster, up to three growth steps. Refactor resets growth and caps current head health at the base maximum. The title screen only describes clearing enemies.

**Change:** Keep the health bar. Add a compact, separately labeled context indicator showing growth and time to the next growth event. On refactor, visibly shrink the heads and show `context compacted`. Update instructions to explain its boss effect.

The minimum change should display the existing eight-second schedule accurately. If refactor is later changed to restart that schedule, update both the actual timer and its display together; do not animate a reset that does not happen.

**Files:** `src/entities/Hydra.js`, `src/scenes/HUD.js`, `src/scenes/Title.js`.

**Acceptance:** Health, growth, and the next growth event are distinguishable. The display remains truthful at maximum growth, after a head dies, and immediately after refactor. HUD elements do not overlap at smaller window sizes.

## Next improvements, in order

1. **Teach powers during play.** Introduce a blob that demonstrates splitting, an enemy cluster suited to ship it, and a safe opportunity to try rollback. Add a short refactor hint before the boss. Keep keyboard alternatives visible.
2. **Improve combat contrast.** Give the player and dangerous projectiles stronger outlines. Reduce background contrast where it competes with enemies. Add a reduced-effects option for CRT distortion, flashes, and shake. Evaluate screenshots after fades finish.
3. **Clarify voice feedback.** Distinguish recognized speech from a power actually firing. Show a brief cooldown message when a recognized command cannot activate. Keep 1/2/3 available throughout. Prefer an explicit voice-enable action so microphone setup does not interrupt a new run.
4. **Stage the boss entrance.** Briefly quiet the office, print `make one small change`, then let the heads answer. Make repeat attempts skip or shorten the introduction.
5. **Give neighborhoods distinct encounters.** Use the existing SF art for a cable-car platform, a hill climb, or an optional star route. Add one encounter at a time and test it before extending the map.
6. **Use unused enemy concepts.** The original monster sheet includes a Pixel Nudger and Breach Wraith. The Nudger could visibly move platforms before jumps. The Wraith could leak key icons and briefly expose a weak point. These are new design proposals, not existing behaviors.

Defer new progression systems, additional boss fights, multiplayer, and a full visual overhaul during the hackathon.

## Assets available now

The raw packs are already present locally under `feed/` but ignored by Git. Inspect them before downloading more art. Copy only selected runtime files into `public/assets/` and register them in `src/scenes/Boot.js`.

| Local source | Suggested use |
| --- | --- |
| `feed/Ninja Adventure - Asset Pack/Ui/Input/Keyboard/` | Existing key icons, including M, Space, and arrows, for contextual hints |
| `feed/Ninja Adventure - Asset Pack/FX/` | Preview attack, magic, smoke, and particle sheets for refactor and impact effects |
| `feed/Ninja Adventure - Asset Pack/Actor/Monster/` | Candidate sprites for new enemies; inspect side-view suitability before use |
| `feed/Ninja Adventure - Asset Pack/Audio/Sounds/` | Audition distinct confirmation and ready sounds |
| `feed/anthropic-hq/` | Existing reference material for the office; preserve the current art direction |

The local Ninja Adventure `LICENSE.txt` states CC0. Its [publisher page](https://pixel-boy.itch.io/ninja-adventure-asset-pack) also lists visual effects, monsters, UI, and audio. Retain the existing credit.

Optional external sources, verified during review:

- [Kenney Input Prompts Pixel](https://kenney.nl/assets/input-prompts-pixel): CC0, 16x16 keyboard and controller icons if the local set lacks what is needed.
- [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds): CC0 interface audio for activation and cooldown feedback.

The local Sci-Fi Starter Pack is another candidate, but its license was not reviewed. The repository's `.gitignore` specifically notes a restriction on redistributing its raw files. Check the included terms before selecting assets; do not commit the whole pack.

For custom art, prioritize head wind-up frames, a refactor compression effect, and a boss entrance pose. Keep their pixel density and colors consistent with the existing Hydra.

## Code map

| File | Responsibility |
| --- | --- |
| `src/main.js` | Phaser setup and scene registration |
| `src/scenes/PlayScene.js` | Shared world, collisions, powers, and player-death handling |
| `src/entities/Player.js` | Movement, health, rollback, reversed controls |
| `src/entities/Hydra.js` | Heads, growth, attacks, dialogue, collapse |
| `src/scenes/BossHQ.js` | Arena, office decoration, encounter setup, victory transition |
| `src/scenes/Level1.js` | SF map, signs, parallax, exit |
| `src/scenes/HUD.js` | Health, score, boss information, powers, voice status |
| `src/voice.js` | Push-to-talk, recognition, cooldowns, keyboard powers |
| `src/sprites.js`, `src/hqArt.js`, `src/backdrops.js` | Procedural sprites and environment art |

## Run and verify

From the repository root:

```bash
npm run dev -- --host 127.0.0.1
npm run build
```

Use the port printed by Vite. At the review's default port:

- Full game: `http://127.0.0.1:5173/`
- Existing boss shortcut: `http://127.0.0.1:5173/?boss` (press Enter on the title screen)
- Physics inspection: `http://127.0.0.1:5173/?boss&debug`

Run the acceptance checks above, then one full run and repeated boss retries. Verify keyboard-only play when speech recognition is unavailable. Test actual spoken commands in a supported browser if microphone access is available; otherwise report that test as unperformed. A successful build alone does not establish gameplay correctness.

No deployment command or live destination was verified. Keep deployment separate from this implementation pass.

## Prompt to give Opus 5.5

```text
Read feed/HANDOFF-2026-09-26.md and inspect the current repository.

Implement the five items in "First implementation pass" in order. Preserve
the final boss's appearance, chat-bubble heads, orange necks, office, Furbies,
and humor. Use the smallest changes that meet each acceptance check.

Reproduce the progression and victory issues before fixing them. Preserve
existing work and screenshots. Prefer the asset packs already in feed/;
copy only selected assets into public/assets and check their licenses.

Keep later improvements out of this pass. After implementation, run the
build, verify the listed gameplay scenarios, and report what changed,
what was tested, and anything still unverified. Do not deploy or push.
```
