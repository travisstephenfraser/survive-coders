# Survive Coders: playtest fixes and share-a-run are live on production (master `d41e89b`); follow-ups are small

_Last updated: 2026-09-30 20:35 PDT on laptop (`Travis's MacBook Pro`). Supersedes: `feed/HANDOFF-2026-09-29.md`.
Audience: Travis's next session. Pick-up notes._

## Pick up here

- **First action:** `git -C ~/Developer/survive-coders fetch origin && git -C ~/Developer/survive-coders log --oneline -1 origin/master`: expect `d41e89b README: 70 tests, and the share tests' canonical redirect`.
- **Resume prompt** (paste into a fresh session):
  > Read `feed/HANDOFF-2026-09-30-ship.md`. Then clear the deferred minors in Next steps 3 on one branch off master, each fix test-first (unit test or a check in `feed/shots/playtest.js`), and stop for Travis's go before master. Fetch and check the behind count as its own step immediately before every push. Never commit `feed/HANDOFF-2026-09-30.md` (a private note in a public repo).
- **Human-only steps:** post a ranked production run and open its `/r/` link; LinkedIn Post Inspector on one `/s/` link; a second playtester for the controls.
- **Session rules:** master is production (Vercel deploys each push in about 30 s): push only on Travis's go, each after its own fetch and behind check. Stage explicit paths (`feed/` carries unrelated edits). The repo is public: no playtester names, no emails, god mode stays undocumented. Multi-part plans get a red-team pass and an explicit "go" before code.

## What this is

A 16-bit Phaser browser game (static Vite build on Vercel, iframed on travisfraser.com) with two functions: `/api/scores` (leaderboard on Neon) and `/api/share` (share-a-run pages and cards, no database). This session turned one playtester's notes into ten fixes, red-teamed the plan, built it and shipped it with the share work. **Scope:** leaderboard setup history lives in `feed/HANDOFF-2026-09-29.md`; the design-polish brief in `feed/HANDOFF-2026-09-27-design-flow.md`.

## Status

- **Git:** checkout on `claude/title-screen-credit-vqfi4n` at `d41e89b`, which equals `origin/master` and local `master` (0 ahead, 0 behind). PR #2 (`claude/playtest-fixes`) shows merged (`7cf2c80`). Uncommitted, no app code: `docs/superpowers/` (plan, spec), `feed/HANDOFF-2026-09-2{6,7}.md` (pre-existing edits), untracked `feed/HANDOFF-2026-09-{27-design-flow,29,30}.md` (`-30` is an unrelated private note: never commit it), and this file.
- **This file:** untracked in a tracked `feed/`, so the devbox won't see it until it's committed and pushed, and once pushed it is public.
- **Tests:** `npm test` 70/70, `npm run stars` 382, `npm run build` clean, all on the merged tree 2026-09-30 about 15:30 PDT. Fifteen scripted browser checks passed on the final playtest code (dev-only, see Run).
- **Live surface:** https://survive-coders.vercel.app serving `d41e89b` (bundle `assets/index-B5CTu4cb.js`). Health: `curl -sI https://survive-coders.vercel.app/ | head -1` gives `HTTP/2 200`.
- **Environment:** laptop, repo `~/Developer/survive-coders` (devbox root: vault `wiki-vault/_meta/machine-parity.md`), Node v26.4.0, `node_modules` present. No servers running. Secrets: `.env` (names in `.env.example`), Vercel env vars (Sensitive). No data outside git and Neon.

## Verify on pick-up

```bash
cd ~/Developer/survive-coders
git fetch origin && git log --oneline -1 origin/master      # expect: d41e89b ...
npm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E 'ℹ (pass|fail)'   # expect: pass 70, fail 0
npm run -s stars | tail -1                                   # expect: total 382 (independent recount)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://survive-coders.vercel.app/s/1-a-3x-ky/card.png?x=1'
# expect: 308 https://survive-coders.vercel.app/s/1-a-3x-ky/card.png
curl -s 'https://survive-coders.vercel.app/api/share?kind=s&key=1-a-3x-ky&as=json'
# known answer (the code is the run itself): {"kind":"s","placeKey":"tower61","where":"died on the Ohana Floor","stars":141,"timeMs":754000}
```

## Shipped (2026-09-30, production)

- **Readable text:** kill lines and barks hold 450 ms before the 900 ms fade; a kill's "+N★" holds with its line. Cutscene lines and Slack cards get reading time (Waymo intro 11.9 s to 16.7 s, gondola 9.2 s to 10.8 s, ride's last card 2.4 s). Elevator untouched.
- **Controls:** the bar's idle line `$ powers: 1 2 3, or hold M and say one`; the SPACE and refactor tips stay until done; the pause screen lists controls and powers (desktop and touch).
- **Intros own the controls:** no moves, shots or powers; a SPACE skip no longer fires; nothing pressed carries past.
- **Hydra ramp:** flood alone, gaslight at 5 s, notifications at 10 s with both skulls, on pausable timers from the card; sleeping heads invulnerable, auto-aim skips them; a death wakes the rest.
- **Camera:** holds its height in Level 1, the park and the tower (the skyline no longer rides up on jumps).
- **H100:** a 2 px heat hop and steam puff about once a second; hitbox unmoved.
- **Share (your branch, shipped with this):** share cards and links; extra query parameters now get a cached 308 to the plain link instead of a fresh render; README notes that rotating `IP_HASH_SECRET` breaks `/r/` links.

## Findings of record

| Finding | Value |
|---|---|
| Max stars per run (carried) | 382 = 98/74/34/40/29/0/12/95 (L1/park/59/60/61/chute/landing/boss) |
| Hydra overflow start (new) | 24,008 ms after the Hydra is created, identical before and after the ramp (retry path) |
| Reading rule (new) | on screen at least chars/17 s (typing counts), and at least 1.2 s after the last letter |
| Camera range (new) | every platform map is 192 px tall in a 180 px view: 12 px of vertical travel |
| Top-platform jump (new) | from Level 1 row 4 the sprite top reaches y -2 against a view top of 12: feet only for about 0.35 s |
| Production smoke (new) | new bundle live ~30 s after push; `/`, `/api/scores`, `/s/` page and 1200x630 card 200; `?x=1`, `?utm_source=` 308; `/r/abc.def` 404 (secret present); LinkedInBot gets full og tags |
| Run clock vs stopwatch (carried) | 20.131 s play read 20.131 s; with a real 20.4 s pause: -6 ms |
| Neon (carried) | free 100 CU-h/month; 15-min edge cache keeps it near 61; console branches auto-delete after 1 day |

## Architecture (what this work touched)

- `src/pacing.js` owns every reading-time number (tested); `src/util.js` splits `floatText` (status) from `jokeText` (held); `PlayScene.addStars(n, x, y, hold)` is matched by pattern in `scripts/count-stars.mjs`.
- Input: `PlayScene.inputLocked` + `voice.gate` + `Player.swallowEdges()/holdStill()/fireLatched`; BossHQ adds `introLock`. Hydra: `dormantUntil = Infinity` until the card's tween completes, then `startFight()` schedules `wake()`s.
- Camera: `startFollow(..., this.parallax ? 0 : 0.06)` in `PlayScene.buildWorld`. Share: `api/_lib/share.js` 308s extra params.

## Key decisions (do not relitigate)

- Reading pace counts typing time at 17 chars/s: the literal "15 chars/s after typing" nearly doubled the Waymo intro.
- A kill's reward holds with its line: holding only the line made "+N★" cross it on six enemy types.
- Sleeping heads are invulnerable (Travis): "a hit wakes it" let floor auto-aim wake the lowest head at once, erasing the ramp.
- Wakes, lock and fight start run on scene timers and tween completion: `time.now` is wall clock and runs through pauses.
- Notifications head backfills both skulls on waking (Travis): otherwise 10-15 s ran easier than before.
- Camera holds height instead of vertical parallax (Travis): parallax left 45-100% of the slide.
- Shipped share and playtest together after fixing the share card's query-string render path (Travis): stacking avoided a `Title.js` conflict.

## Dead ends (do not retry)

- Waking a sleeping head on hit (see above). Vertical parallax for the skyline. Wall-clock timestamps for the boss lock or wakes. Resizing the chrome-devtools window (it is maximized; the checks use game coordinates anyway). Editing `feed/shots/playtest.js` while a check runs: Vite reloads the page and kills it.

## Next steps

1. Fetch and confirm master at `d41e89b` (First action). Done when it matches.
2. Human: play a ranked run to the end on production and post it; open its `/r/` link. Done when the card shows the posted rank. Then LinkedIn Post Inspector on one `/s/` link.
3. Deferred minors, one branch off master, test-first each: `src/scenes/Ride.js:24` comment overstates the last card's time; `Hydra.wake()` ignores `scene.outcome` (wake pop during the death fade); a voice hold spanning a whole lock still fires (`PlayScene.update`: mark `voice.heldLocked` while `inputLocked && voice.listening`); a dropped voice hold leaves `heard "ship it"` with no "ran" (`src/voice.js` release path); a founder or CRM pitch (y-16) can overlap its death line for 0.8 s (keep the bark, destroy it in `die()`); `h100Hop` check samples only on-floor frames; README "street levels" should read "skyline levels". Done when each has a failing-first test and `npm test` is green.
4. Pre-existing pause bugs: attacks due during a pause fire on resume without a wind-up (`Hydra.js` `Head.nextAttack` is wall clock: shift by the pause length on resume); powers fire while paused (fold `sys.isPaused()` into `voice.gate`). Done when a paused-then-resumed boss shows every wind-up.
5. Carried from 09-29: iframe checks on travisfraser.com (arrows, fullscreen, profile link); leaderboard minors (phone first tap on a linked row; typeof in `api/_lib/scores.js` `shaped`).
6. Parked: move the browser checks from gitignored `feed/shots/` to a tracked path so the devbox can rerun them; offline cheat audit over stored splits.

## Open questions

- Commit `docs/superpowers/` (plan and spec) to the public repo, or keep them local?
- Delete the merged branches `claude/playtest-fixes` and `claude/title-screen-credit-vqfi4n`?
- The readable intro (16.7 s) gives back some of design-brief item 1's earlier shortening: keep it, or trim beats rather than reading time?

## Related records

- Previous: `feed/HANDOFF-2026-09-29.md` (leaderboard; setup done, `/api/scores` answers 200). Design brief: `feed/HANDOFF-2026-09-27-design-flow.md` (items 1 and 3-5 shipped earlier, item 2's pause reference here; item 6 is left).
- Plan and spec (untracked): `docs/superpowers/plans/2026-09-30-playtest-fixes.md`, `docs/superpowers/specs/2026-09-30-playtest-fixes-design.md` (includes the red-team changes).
- PR #2: https://github.com/travisstephenfraser/survive-coders/pull/2 (body lists deferred minors and the test plan).
- Memory: `~/.claude/projects/-Users-travis-Developer-survive-coders/memory/{red-team-before-build,survive-coders-playtest-fixes}.md`.
- Vault: `projects/survive-coders/survive-coders.md` (synced 2026-09-30 20:30), plus `skills/red-team-validation.md`, `skills/guards-that-do-not-guard.md` (round 19), `entities/vercel.md`, `skills/link-previews-open-graph.md`.
- Not this project: `feed/HANDOFF-2026-09-30.md` is an unrelated private note; never commit it here.

## Run / test / deploy

```bash
npm run dev -- --port 5199           # game at http://localhost:5199 (?boss, ?park, ?tower=61, ?debug, ?touch, ?fx=off)
npm test && npm run -s stars | tail -1 && npm run build
# browser checks, in the dev page: import('/feed/shots/playtest.js?v='+Date.now()).then(t => t.start('batch', [['hydraWake']]))
# then read window.__check. Names: jokeHold, dialogue <scene>, introSkip, pauseHelp, tips, introLock, skipInput, hydraWake, hydraSleep, hydraPause, cameraLock, h100Hop
git fetch origin && git rev-list --count HEAD..origin/master   # before any push, as its own step: expect 0
```

## Changelog

- 2026-09-30 20:35: corrected which design-brief items had shipped (the vault hub recorded 1 and 3-5 as shipped earlier); vault synced.
