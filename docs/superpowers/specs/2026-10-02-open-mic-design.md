# Shoutr Flow, an open mic recognised on the device: design

_2026-10-02. From playtest feedback: players use the keys because push-to-talk is unreliable and
hard to set up. This is the second version. The first was red-teamed the same day (verdict:
Reshape, `redteam-open-mic-2026-10-02.html`) and Travis chose to recognise speech on the device.
The numbers are from two probe runs of his. No plan yet._

## What was asked, and what the code says

| Complaint | The code today |
|---|---|
| "It doesn't work unless you let go of the key a little late" | The recognizer is stopped the moment the key comes up (`release()` in `src/voice.js:140`), which cuts the audio. |
| Inconsistent even when held properly | The recognizer is only started when the key goes down (`press()`, `src/voice.js:124`), so it is not yet listening when the first syllable is spoken. |
| "Some people say it doesn't work at all" | Setup is optional, behind `V` on the title (`src/scenes/Title.js:64`). A mic that hears silence reports nothing: `no-speech` errors are dropped (`src/voice.js:99`). Other errors are one small grey line in the HUD corner. |
| The talk key clashes with other software | The key is the only way in. |
| "People don't understand the mic" | The title says `voice: HOLD M, say a command, let go`; nothing proves it works before a fight. |

## What was measured

One person, one microphone (a Logitech C920 webcam), one room, Chrome 154 on a Mac. Raw files:
`feed/mic-probe-20261002T161557731Z.json` (round 1) and
`feed/mic-probe-r2-20261002T173220674Z.json` (round 2). Probe: `feed/shots/mic-probe/`.

| Setup | Heard | Timing and behaviour |
|---|---|---|
| **Today's hold-to-talk** (cloud) | 4 of 9 | Recognizer listening 190 to 227 ms after key down; speech had already begun in 9 of 9. Let go before the end of the word: 1 of 5 fired. Let go late: 3 of 4. |
| Cloud, recognizer kept on, open mic | 19 of 24 | Median 751 ms from the start of speech. Misses were mishearings: "chip it", "reflect it", "throwback". |
| Cloud, wake word ("Claude, ...") | 5 of 9 | Median 1107 ms. Not built. |
| **On-device, no phrases favoured, open mic** | **24 of 24** | Median 735 ms from the start of speech (90th percentile 849), 414 ms after the end of it. |
| On-device, the three commands favoured (boost 5 of 10) | 21 of 24 | One of the three misses was a line the mic picked up no voice on. The recognizer wrote "ship it" 34 times over in one unsettled result. |
| On-device, favoured at full boost | 19 of 24 | 5 fired the wrong command; whole results were one command repeated. |
| On-device, hold SPACE (phrases at 5) | 9 of 9 | Every one fired after letting go, 61 to 270 ms after. |
| On-device, fed from a mic stream, after 9 to 20 s of quiet (phrases at 5) | 5 of 6 | No session ended on its own; the longest ran 449 s. |
| On-device, Chrome's default mic path, the same (phrases at 5) | 6 of 6 | 5 sessions ended in 2.5 minutes (two after 8 s with no speech, three after a silence); deaf for 181 to 216 ms at each restart. |
| On-device, phrases at 5, two minutes of narration with no commands | 4 false fires | In 150 words. All four were in unsettled results the recognizer then rewrote. |
| On-device, phrases at 5, two minutes of a podcast playing | 1 false fire | In 230 words. |

What this supports:

- **The diagnosis.** Today's mode fails more than half the time, in the way reported.
- **On-device hears these commands at least as well as the cloud, and as fast.** 24 of 24 against
  19 of 24, with small counts on one voice.
- **Favouring phrases makes it worse.** It lowered the hit rate, made the recognizer write
  commands nobody said, and at full boost made it write little else.
- **A mic stream keeps the session up through silence;** the default mic path does not.
- **The speech pack is small in practice:** it downloaded in 3.2 s on this connection.

What it does not support: anything about other people's voices, microphones or machines; loud
rooms; phones. Not yet measured for the setup this design ships (on-device, no phrases): false
fires in narration and room talk, and commands after a long quiet. Those are steps 10 to 13 of
the round 2 probe.

## What the red-team changed

Seven claims, each tested by a verifier that saw only the claim. Three were contradicted:

- **"The API has no on-device mode and no phrase favouring."** Chrome shipped both in 2025. This
  design is the result.
- **"Counting a command per result fires it exactly once."** Chrome reuses result positions, and
  the cloud can split a sentence across two of them, so a command could fire twice and then
  swallow the next one. Commands are now counted over the whole transcript (decision 5).
- **"One sentence of disclosure is enough for an always-on mic whose audio goes to Google."** Not
  if the GDPR applies, and unverified for other people in the room under California law.
  On-device recognition removes the transmission those questions attach to.

Also corrected from it: a missing microphone reports `not-allowed`, the same as a refusal, so
the two are told apart by the mic request's own error (decision 11). Confirmed by it: the
sound-alike phrases are rare in speech (3 to 11 per million words; 10 to 12 in developer
podcasts). Not verifiable from any published source: whether a mic check in front of the first
level costs players. It is built so that it costs no run time (decision 9).

## Decisions

### How the mic listens

1. **Three modes, one setting:** `open` (say it, no key), `hold` (the talk key), `off`. The
   default is `open`, on a keyboard, where on-device recognition is available.
2. **On the device, or not at all.** The recognizer runs with `processLocally` set: nothing the
   player says leaves the computer. There is no cloud recognizer on a keyboard. Where on-device
   recognition is missing (Edge, Firefox, Safari, Brave, ChromeOS, a download that was declined
   or failed), the game is played with the keys and says so. Travis's call: not worth building
   a second path for.
3. **No phrases are favoured.** Measured worse in every way.
4. **Fed from a mic stream the game opens,** so a session does not end in the quiet between
   commands. The same stream gives the level for the light (decision 14). It runs from the
   start of a run to the title, the end screen, the leaderboard or settings, and stops while
   the game is paused or the tab is hidden; starting again took 52 to 216 ms in the probe. If a
   session ends anyway it is started again at once. Three in a row that fail to start, or end
   in `not-allowed`, `service-not-allowed`, `audio-capture` or `language-not-supported`, stop
   the retries and put the reason in the HUD in red, with the keys named.
5. **A command fires the moment it is heard,** on unsettled results, counted over the whole
   session's transcript in order. A rise in a command's count fires it; the count follows the
   text down as well as up, so a command the recognizer takes back never blocks the next real
   one. A repeat of the same command inside 1.5 seconds is one command: the recognizer was seen
   writing a phrase many times over in one result. A command heard while it cannot fire (an
   intro, a pause, between levels) is counted and dropped, never held for later.
6. **Matching is the whole phrase and a list of sound-alikes,** after lower-casing and dropping
   punctuation (on-device writes "Ship it." where the cloud wrote "ship it"). Travis's call: in
   a game about saying three commands, whatever the recognizer writes for one should fire it.
   - **The list:** `ship it`: chip it, sheep it, cheap it, ship at, shop it. `rollback`: roll
     back, throwback, throw back, role back, roll bag, row back, rule back, troll back.
     `refactor`: re-factor, refector, reflector, reflect it, refractor, reactor, refract it,
     reflect her.
   - **What goes on it:** real words and pairs (a recognizer only writes real words) that sound
     like the command and never appear in 677,000 words of Travis's own notes. Everything a
     recognizer has actually written for a command goes on.
   - **Never on it,** by count in those notes: shipped (486), react (242), ship (201), fallback
     (98), factor (69), shipping (68), shipped it (4), callback, feedback, come back.
   - **Not a distance threshold at run time.** A net wide enough for "throwback" fired 4.07
     times per 1,000 words of those notes, on "shipped", "react" and "fallback"; the list fired
     0. "Callback" is closer to "rollback" than "throwback" is, so no radius separates them.
7. **Hold mode** also takes today's wider patterns (bare "ship", "shipping", "reactor"), since
   the key is the guard. A command counts if it is heard between key down and 600 ms after key
   up (latest measured: 270 ms on-device, 433 ms on the cloud), and it fires when heard, not on
   release. What was heard before key down is dropped.
8. **A cooldown still refuses a command,** and the HUD still says so, as today.

### Proving it works before the run

9. **A mic check screen, once per browser.** PLAY NOW goes to it when on-device recognition is
   possible here, the mode is not `off`, and this browser has not passed it. It has two rows:
   `SET UP SHOUTR FLOW` and `PLAY WITH THE KEYS`. Setting up, in order: the speech pack if it is
   not here yet (about 60 MB, once; the press that chose the row is the gesture Chrome requires
   for it), the browser's microphone prompt, then **say SHIP IT** with a level meter and what was
   heard, live. Hearing a command passes it, remembers that, and starts the run. Choosing the
   keys is not remembered, so the check is offered again next time; one line says it can be
   turned off in settings. A browser that has passed never sees it again: PLAY NOW starts the
   run. The one exception is a browser whose speech pack has since gone: only the check can
   fetch it, so it is offered again.
   **It costs no run time** (Travis: "make sure it does not cost time"). The check sits before
   `beginRun`, where the run clock starts (`src/run.js`), so nothing on it is timed. Only the
   title's PLAY NOW can lead to it: a new run from the pause screen, a restart, a retry and
   play again all go straight to the level, as today. Passing starts the run at once, with no
   extra key press. During a run the recognizer starts in the background and the game never
   waits on it.
10. **What it tells the player:** your voice is recognised on this computer; nothing you say is
    sent anywhere.
11. **A failed check names the reason:**

    | What happened | What it says |
    |---|---|
    | The pack would not download | Couldn't get the speech pack. Try again, or play with the keys. |
    | The mic request was refused (`NotAllowedError`) | The microphone is blocked: allow it from the address bar. |
    | The mic request found no device (`NotFoundError`) | No microphone found. |
    | Level stays flat for 4 s | No sound is reaching the mic: check the input device in your system's sound settings. |
    | Sound, but no words for 6 s | Heard sound but no words. Move closer, or check which microphone is selected. |
    | Words, but not the phrase, three times | Heard "(what it heard)". Voice may be unreliable on this mic; the keys always work. |

    Every one of them leaves `PLAY WITH THE KEYS`.
12. **`V` on the title opens the check** at any time, and settings gets a `test microphone`
    row. The title's mic line states the mode and whether the check has passed. Where on-device
    recognition is not possible, the line says voice needs Chrome on a computer.

### Phones

13. **Not changed by this work** (Travis: hold-to-talk stays on phones). The talk slot and the
    fall's spoken lines (`src/scenes/Terminal.js`) keep today's hold-to-talk, which uses the
    browser's cloud recognizer: Android has no on-device mode.

### What the player sees

14. **The Shoutr Flow light.** Voice in this game has been "Wispr Flow" in a code comment only;
    it now has a name the player sees (the light's label, the check's title, the settings row).
    Travis's pick: it reads as Wispr Flow and tells the player to speak up. It is Shoutr Flow
    everywhere; there is no "Overflow" variant for the Hydra. The light is drawn
    by the game, so it shows in fullscreen where the browser's own indicator does not. It is
    lit only while a session is really running, hollow when it is not, and pulses within a
    frame or two of the voice starting, from the mic's level: with about 735 ms to a result,
    that is what stops a player repeating themselves.
15. **The hints follow the mode.** Open: `powers: 1 2 3, or just say one`, `Swarmed? Say
    "refactor" (or press 3)`. Hold: today's wording. Off, or no on-device recognition: the keys
    only. The title screen, the pause screen's help, the Hydra's `CONTEXT FULL` line and the
    level 1 tips all read from the mode.
16. **Errors are red and stay** until the mic works again or the mode is changed.
17. **A sound-alike that fires says so:** `heard "throwback" → rollback. close enough.`

## Parts

| File | Change |
|---|---|
| `src/voiceMatch.js` (new) | The patterns for each mode, the transcript's clean-up, the whole-transcript counter with its 1.5 s repeat rule, and the hold window's test. No Phaser, no `window`: runs under node, like `src/keymap.js`. |
| `src/micStream.js` (new) | Opens the mic once and hands out its track (for the recognizer) and its level (`level`, `speaking`, for the light and the check). Names why it could not open. |
| `src/voice.js` | `VoiceControl` keeps its interface (`press`, `release`, `trigger`, `heard`, `listening`, `status`, `gate`, the `power` event). On a keyboard it gains the modes, the on-device session and its restart and three-strikes logic, and `available()` / `install()` for the pack. On touch it behaves exactly as today. `prime()` goes; the check replaces it. |
| `src/scenes/MicCheck.js` (new) | The check screen, its steps and its failure states. |
| `src/settings.js` | `mic: 'open'`, checked against the three values on load. A separate flag, `sc_mic_ok`, records a passed check. |
| `src/scenes/Settings.js` | A `Shoutr Flow` row (hidden on touch) and a `test microphone` row. |
| `src/scenes/Title.js` | PLAY NOW routes through the check when due; `V` opens it; the voice line and mic line follow the mode. |
| `src/scenes/HUD.js` | The power and `CONTEXT FULL` lines (98, 99), the pause help (148), the mic line (402): the hints by mode, the light, red errors, the `close enough` line. |
| `src/scenes/Level1.js`, `src/scenes/PlayScene.js` | The three tips that say `HOLD M` (Level1 84 and 86, PlayScene 221) read from the mode. |
| `src/scenes/Chute.js`, `src/scenes/Ride.js` | Each ends a hold carried in from the scene before (`voice.release()`); they keep doing so. |
| `src/run.js` or `PlayScene` | Start and stop the session with the run, the pause and the hidden tab. |
| `README.md` | The voice sections, the controls table, the design-decision section (it now says audio goes to Google; it will not), the limits, and the verification log. |

## How it is checked

- **`test/voiceMatch.test.js`**, under `npm test`: a result that grows fires once; two commands
  in one result fire in order; a command taken back and said again fires again; the same
  command 34 times in one result fires once; "Ship it." with its capital and full stop fires; a
  command before key down is dropped; one at 599 ms after key up counts and one at 601 ms does
  not.
- **A replay of the real recognizer events.** Round 2 logged every recognizer event (1,663).
  A fixture of those, with the command each line was an attempt at, must give 24 of 24 for the
  no-phrases run and one fire for the sentence where "ship it" was written 34 times. Beside it,
  ordinary sentences using the words kept off the list ("we shipped it late", "the fallback",
  "any feedback", "a React callback") must fire nothing. The test fails if every line fires or
  none does: a matcher that says yes to everything would otherwise pass.
- **In the dev page, with a stand-in recognizer:** the session starts with the run and stops at
  the title, on pause and on a hidden tab; an ended session restarts; three hard errors stop it
  and the HUD says why; each row of decision 11 shows its message; choosing the keys starts the
  run with the keys working; a browser with no on-device recognition never shows the check.
- **Not measured, and not going to be before the build:** false fires in narration and room
  talk, and commands after a long quiet, on the setup this design ships (on-device, no
  phrases). Those numbers exist only with phrases favoured. Travis closed the probing on
  2026-10-02. The default stays `open`, as he chose; `hold` and `off` are one setting away, and
  the first real playthroughs are the test. Automation cannot speak, so no check here covers a
  real voice.

## Not in this

- A cloud recognizer on a keyboard, for browsers without on-device recognition.
- A wake word, and favouring phrases: both measured worse.
- Any change to voice on phones.
- Other voices and microphones. Every number here is one person on one webcam mic.

## Settled on 2026-10-02

Travis closed the open questions: hold-to-talk stays on phones as it is; the mic check must not
cost time (decision 9) and nothing is added to count its drop-off; the name is Shoutr Flow with
no Overflow variant. He asked for the implementation plan next.
