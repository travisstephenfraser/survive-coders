# Key remapping and quit to title: design

_2026-10-01. Asked for by Travis for players who are optimising their runs. Short design agreed
in chat; this is the written version for review. Plan:
`docs/superpowers/plans/2026-10-01-key-remap-restart.md`._

## What was asked, and what the code says

| Ask | The code today |
|---|---|
| Remap the keys, in settings | Keys are hard-coded where they are read: move, jump and fire in `src/entities/Player.js:65`, steering in `src/scenes/Landing.js:82`, the powers and push-to-talk in `src/voice.js:29`, pause, mute and restart in `src/scenes/HUD.js:126`, mute again in four between-level scenes. About twenty on-screen hints name those keys as text. |
| Back to the title from the pause menu | The pause screen has resume, mute and restart level (`R`). The only way to the title mid-run is to die and press `T`, or reload the page. |
| Back to the title from the end screen, after entering the leaderboard | The end screen has `ENTER` play again and `T` title, but the leaderboard form holds the keyboard: every key stops at it (`isolate` in `src/scoreForm.js`). After posting, it takes `ESC` and then `T`. |

## Decided after the first read (2026-10-01)

Travis asked for the new-run key, kept `T` for quit to title, and skipped a red-team pass.

- **New run is `G`**, the thirteenth action. No default uses it, it is not next to `R`, and it
  only acts on the pause screen: a reset is `P`, `G`, with no title screen and no intro replay.
- **A mapping for speed**, as advice in the README, not a preset: `A` and `D` to move, `SPACE`
  to jump (the thumb), `J` to fire (held), and the powers on `K` (ship it), `L` (refactor) and
  `;` (rollback). Nothing needs a reach: the default `1 2 3` pull a hand off moving or firing.
  From the defaults that is four rebinds.

## Decisions

### Key remapping

1. **Thirteen actions can be remapped:** move left, move right, jump, fire, ship it, rollback,
   refactor, talk (hold), pause, mute, restart level, new run, quit to title.
2. **These stay fixed:** `ESC` always pauses, whatever the map says. The menu keys (arrows,
   `W A S D`, `ENTER`, `SPACE`, `ESC`), the intro skip (`ENTER`, `SPACE`, `ESC`), the fall's
   typing, the title's `V`, and the end screen's `ENTER`, `R`, `S` and `T` do not change.
   Touch controls are not affected.
3. **The defaults are today's keys**, alternates included (← and A, ↑ W Z, SPACE X J), so a
   player who never opens the screen sees no change. One addition: the powers also default to
   the number pad's 1, 2 and 3. Today the powers match the character typed, which the number
   pad also types; matching by key code (decision 4) would otherwise drop it.
4. **A key is its key code**, the number Phaser's keyboard already goes by (`event.keyCode`).
   A letter follows the letter printed on the key, on any layout, as today. One visible
   effect: a power's key now fires with SHIFT held (it matched the character before, and
   SHIFT changes the character), which a player with fire on SHIFT needs.
5. **Bindable keys are the ones the game's font can name:** A to Z, 0 to 9, the number pad's
   digits, the arrows, SPACE, SHIFT, and eleven punctuation keys. Not bindable: `ESC`, `ENTER`
   (the menu's and the capture's own), `TAB` (moves the browser's focus), `BACKSPACE` and
   `DELETE` (they reset a row), Ctrl, Alt and Meta (with fire on Ctrl and jump on W, a jump
   closes the tab), CapsLock and the F-keys.
6. **One key, one action.** Binding a key takes it from the action that had it. That action
   keeps its other keys; if it had none, it is unbound, shown in red on the controls screen
   and as `?` in the hints. Nothing can lock a player out: `ESC` pauses, the pause screen's
   buttons take a click, and the menus don't use the map.
7. **Rebinding sets the action to the one key pressed.** The alternates exist only in the
   defaults. `BACKSPACE` on a row puts that action's defaults back (taking them from any
   action that holds one); a RESET ALL row puts every default back.
8. **Stored on its own**, under `sc_keys` as `{ v: 1, keys: { action: [codes] } }`, so nobody's
   saved settings are touched and `src/settings.js` does not change. On load each action is
   checked by itself (an array of at most four bindable codes, else that action's defaults),
   then one key, one action is enforced: saved actions claim their keys first, in list order,
   and a defaulted action takes its defaults minus any key already claimed. Blocked storage
   means the map lasts the session.
9. **The screen.** Settings gets a `controls` row, on keyboards only, which opens a second
   terminal page built from the same menu pieces. `ENTER` or a click on an action starts a
   capture (`press a key_`); `ESC` cancels it; a bindable key binds, and the status line says
   which action it was taken from; a key that can't be bound says so and the capture stays
   open. The capture listens on the window in the capture phase and stops the event, so the
   key pressed never reaches the menu, Phaser, or the voice keys (binding `M` must not start
   the microphone).
10. **Every hint follows the map.** Each on-screen key name comes from the map: the title's
    control lines and command table, the HUD's power slots, strip and status line, the pause
    screen, the level tips in the city, the park and the tower, the rollback and MAX tips, the
    founder's `MASH` chip, the canopy's steer hint, and the microphone's status. With the
    defaults every hint reads as it does today. Measured in the game's font, the longest
    names (SHIFT, SPACE, the number pad's) fit the power slots and the pause buttons; the one
    place they don't is the HUD's bottom row, where the controls hint shortens (down to the
    pause key alone) so it never runs under the status line beside it.
11. **Where the map is read.** Phaser key objects are made from it when a level starts
    (Player, Landing). The voice keys and the HUD's keys check it at each keydown. The map can
    only change on the controls screen, which is reached from the title with no run in
    progress, so nothing has to re-bind mid-run.

### New run and quit to title

12. **The pause screen gets new run and quit to title:** each a key (`G` and `T` by default)
    and a button beside restart level, on every device. New run stops the level and starts
    the first one with fresh stats and a fresh clock (`beginRun`), keeping the intros already
    seen skipped. Quit to title is as follows. It works only while paused, the same guard
    restart level has. It stops the level and the HUD and starts the title, which resets the
    run clock. No confirmation: restart level has none, the pause is already deliberate, and
    the button names its key. `T` sits next to `R` on a keyboard, which is the argument for a
    different default; `T` matches the end screen, and it can be rebound.
13. **The pause screen's buttons carry their keys.** Restart level, new run and quit to title
    sit side by side where the one button is now, each reading its key and its name. The headline
    shortens to resume and mute.
14. **After a post, `R` and `T` work through the form.** Once the run is posted the form's
    inputs are disabled, so no letter is being typed: `R` starts a new run and `T` goes to the
    title without closing the form first, and the form's hint says so. Before the post nothing
    changes (both are letters of a name). `ENTER` still presses the focused button and `ESC`
    still closes.
15. **`R` plays again anywhere on the end screen**, as `ENTER` does, so the key means one thing
    on that screen. The prompt line is unchanged.

## What this does not do

- **No second key from the screen.** An action rebound by a player has one key. The defaults'
  alternates come back only with a reset.
- **No gamepad, and no remapping of touch controls or menu keys.**
- **It does not move between browsers or devices.** The map lives in this browser's storage,
  like the settings.
- **It does not stop the browser's own shortcuts while SHIFT is held.** Phaser only takes a
  key from the browser when no modifier is down, so with fire on SHIFT, SHIFT and SPACE
  together scroll a page that can scroll. Windows offers Sticky Keys after five SHIFT presses.
- **A key bound once stays taken from the browser until the page reloads**, even after it is
  rebound (Phaser keeps its captures). Typing in the leaderboard form is not affected: keys
  typed there never reach Phaser.
- **No confirmation on new run or quit to title.** A mis-press ends the run.
- **It changes nothing about the leaderboard.** Scores, the run clock and the time floors are
  as they were.

## How it fits together

```
src/keymap.js          the map: actions, defaults, names, load and save, bind, reset
   (no Phaser, no window: runs under node --test)
        │
        ├─ src/util.js           actionKeys(scene, action)  Phaser keys for an action
        │                        held(keys)                 any of them down
        │                        onAction(scene, action, fn) an action's keydown in a scene
        │      ├─ src/entities/Player.js    move, jump, fire
        │      ├─ src/scenes/Landing.js     steer; mute
        │      ├─ src/scenes/HUD.js         pause, mute, restart level, new run, quit to title
        │      └─ Ride, Arrival, Elevator   mute
        ├─ src/voice.js          powers and talk, checked at each keydown; status names the key
        ├─ hints                 Title, HUD, Level1, Park, Tower, PlayScene, Player, Landing
        └─ src/scenes/Controls.js   the screen (new), opened from src/scenes/Settings.js
```

- `src/keymap.js`: `ACTIONS`, `LABELS`, `DEFAULTS`, `keyName(code) → string | null`, and
  `keymap`: `codes(action)`, `has(action, code)`, `name(action)` (the first key, `?` when
  unbound), `names(action, sep)`, `pair(a, b)` (two keys in one hint: `←→`, or `A D`),
  `bind(action, code) → { from } | null`, `reset(action?)`, `isDefault()`.
- `src/scenes/HUD.js`: `newRun()`, `toTitle()`, their buttons, and the keyed labels.
- `src/scoreForm.js`: `again` and `title` callbacks, live once the post is in.
  `src/scenes/End.js` passes them and adds `R`.

## Testing

- **The map** (`test/keymap.test.js`, under node): the defaults; a bind that replaces,
  persists and steals; an action left unbound; a key that can't be bound; both resets; a saved
  map that is partly bad, has one key on two actions, is another version, or can't be read;
  storage that throws.
- **Two checks that the map is not agreeing with itself.** The default codes are compared
  with Phaser's own key-code table by the names today's code uses (`UP`, `W`, `Z`, `SPACE`…),
  a fact from outside this module. And the defaults must give every action a key and no key
  to two actions, so a later edit to the table can't ship a collision.
- **In the browser** (the dev server, scripted or by hand), with the defaults and with a
  custom map (jump on SPACE, fire on SHIFT, powers on Q, E, F, talk on K): a level played;
  every hint read against the map; the longest names (SHIFT, SPACE, NUM1) in each slot;
  capture cancelled with `ESC`, refused for `ENTER`, and pressing `M` not starting the
  microphone; an unbound action; a reload keeping the map; pause, quit to title, and a new
  run after it with a fresh clock; a posted run then `R`, and then `T`; a name with `r` and
  `t` in it typed before the post.
- **Already checked while writing the plan** (2026-10-01): the map module and its thirteen
  tests pass under node, and three of them fail when the one-key-one-action rule is taken
  out of binding or of loading; the text widths the layouts rest on were measured in the running
  game; and the recipe for reaching the posted form on a dev build, with the post answered
  locally, was run against master.
- `npm test`, `npm run build` and `npm run stars` stay clean.

Not testable under node: anything that draws or reads a real keyboard event. Those are the
browser checks above, and they are not in CI.

## Rollout

One deploy, front end only: no API, database or environment change. Rolling back is safe: an
older build ignores `sc_keys` and plays with the built-in keys. The other open branch,
`claude/hold-for-review`, also edits the posted state in `src/scoreForm.js`; whichever lands
second takes a small merge there.
