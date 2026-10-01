# Playtest fixes: design

_2026-09-30. Design agreed in chat with Travis; source is one playtester's notes (kept in
`feed/feedback/`, which git ignores). Plan: `docs/superpowers/plans/2026-09-30-playtest-fixes.md`._

## What the playtest found, and what the code says

| Finding | Cause in the code |
|---|---|
| Text disappears before it can be read | `floatText` (`src/util.js:42`) fades from its first frame and is gone at 900 ms. Cutscene lines are cleared on fixed timers: the founder's "pre-revenue but post-vibes" sits fully typed for 0.47 s (`Park.js:298`). |
| Didn't learn the controls; took SPACE for "ship it" | The SPACE tip lasts 4.2 s right as the intro hands over (`Level1.js:79`), while the terminal bar's idle line reads `$ hold M: "ship it"` all game (`HUD.js:313`). |
| The Hydra spikes the difficulty and feels spammy | All three heads attack from the first second; nothing ramps. |
| The background moves up with the player | Every parallax layer is pinned to the camera (`setScrollFactor(0)`, `backdrops.js:582`) and pans only on x, so a jump drops the ground while the skyline stays. |
| Enemies like the H100 could stand out more | The H100 is a flat card with a thin orange shimmer. |
| (Travis) Controls work during the boss entrance | The entrance never locks input; shots land on the dormant heads. |
| (Travis) Kill lines vanish too fast | Same `floatText` 900 ms. |

## Decisions

Held fixed: the Hydra's peak difficulty, every joke's text, the 382-star ceiling, the elevator's
timing (the ding cutting Chad off is the joke).

1. **Joke pop-ups.** Kill lines and enemy barks hold still for 450 ms, then run today's 900 ms rise
   and fade (1350 ms, 1.5x). Status pops (`+1★`, `GONG!`, `DING`, `context +25%`) keep 900 ms.
2. **Cutscene dialogue.** Every line and Slack card stays up long enough to read. Beats hang off
   the lines so the choreography holds. Enter still skips.
3. **Controls.** The bar's idle line teaches the key map instead of `"ship it"`. The first SPACE
   tip and the refactor tip stay until you do the thing (the refactor tip also clears once you're
   past the swarm). The pause screen lists the controls and powers, on desktop and touch.
4. **Hydra ramp.** Image flood fights alone, gaslight joins at 5 s, and notifications at 10 s, counted
   from when the title card clears, on scene timers that pause with the game. A sleeping head is
   dimmed, neither attacks nor lies, and can't be hurt (auto-aim skips it). Heads still grow on
   today's clock, so the full context window lands when it always has. A head's death wakes the
   rest. The notifications head releases both skulls as it wakes, 1 s apart. The waking head
   flashes and names itself. Same on retries.
5. **Intro lock.** No moving, firing, or powers during the boss entrance and its title card (a flag
   cleared when the card clears, so a pause can't run it out). Powers are held during every
   cutscene. Nothing pressed during an intro carries past it: a SPACE skip doesn't fire, a held
   jump doesn't fire, and fire needs a fresh press. A push-to-talk hold that touches a lock is
   dropped.
6. **Background.** The camera holds its height in the three skyline levels (Level 1, the park, the
   tower floors), which are only 12 px taller than the view. The background and the street stop
   moving vertically. Accepted cost: a jump from one of the few highest platforms carries the
   player mostly off the top for a moment.
7. **H100.** A heat hop about once a second, out of step between units, with a steam puff per hop
   and a thicker plume. Drawn only: the hitbox never moves.

## Two corrections to what was said in chat (flagged to Travis with the plan)

- **Reading pace.** Chat said "each line holds ~15 chars/s after it finishes typing, intros +3-5 s".
  Taken literally that nearly doubles the Waymo intro (11.9 s to ~22 s). The plan uses the
  subtitle standard instead: typing counts toward reading time, 17 characters a second, and at
  least 1.2 s after the last letter. Waymo intro 11.9 s to 16.7 s; gondola 9.2 s to 10.8 s. One
  constant (`READ_CPS` in `src/pacing.js`) moves it.
- **Hydra wake clock.** Chat said "gaslight wakes on turn 2 (8 s), spawn on turn 3 (16 s)". The
  turn timer starts when the scene loads, not when the fight starts, so on a first attempt turn 2
  lands 1.6 s into the fight and there'd be no ramp. The plan wakes heads on the fight's own clock
  (from the end of the Hydra's dormancy): flood at once, gaslight at 5 s, notifications at 10 s.
  Growth and the overflow keep today's clock exactly.

## Red-team changes (2026-09-30)

Seven independent verifiers checked the first plan. Verdict: reshape, with no fix dropped. What changed:

- **Hydra:** the first draft let a hit wake a sleeping head. Auto-aim reaches only the lowest head
  from the floor, so the first shot anyone fired woke it and erased the ramp. Travis chose
  invulnerable sleep instead. The wake times also used the wall clock, so a pause could skip
  the ramp or start attacks under the dimmed entrance (the second is a bug today); the fight now
  starts when the card clears, on pausable timers. The later skulls eased the fight from 10 to
  15 s, so the notifications head now backfills them (Travis's call).
- **Input:** a SPACE skip fired a prompt, a held jump fired as an intro ended, a pause ran the boss
  lock out, and a late voice result could fire after a lock. All four are closed (decision 5).
- **Text:** a kill's "+N★" crossed its held line on six enemy types, so rewards from kills now
  hold with their line. The closers' line timer was also their shove timer, so shoving got its
  own. The longer gondola intro slid the player into a founder, so the player now stops on landing.
- **Background:** vertical parallax would have left 45-100% of the slide. Travis chose to hold the
  camera still (decision 6).
- **Checks:** three sub-assertions could never fail, and were rebuilt so they can.
- **Share branch (outside this plan, before the stack merges):** hit `/s/` and `/r/` once on real
  Vercel, refuse extra query strings on the card route (each one forces an uncached render), and
  note in the README that rotating `IP_HASH_SECRET` breaks every `/r/` link.
- **Still unresolved:** whether the bar and tip changes cure "thought SPACE was ship it". Only a
  second playtester can say.
