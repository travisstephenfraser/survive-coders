# Plan: Salesforce Park, Salesforce Tower, and the free-fall parachute

Approved 2026-09-27 in a brainstorm with Travis. Status and the pick-up order live in
`feed/HANDOFF-2026-09-27.md`; this file is the design and spec.

## Run order

Title → Level 1 (Daly City → SoMa, ends at the Salesforce Transit Center) → **Park** →
**Tower F59 → F60 → F61 Ohana** → **Chute** (free fall, typing) → Waymo ride → BossHQ (Hydra) →
End.

Phase status: **1 Park, 4 art pass, 2 Tower: shipped on the branch** · 3 Chute: specced below,
next.

## Decisions from the brainstorm (Travis's picks)

- The new levels go between Level 1 and HQ, and the parachute is how you arrive at HQ.
- The parachute is typed while you're already falling, with an altimeter counting down.
- Names are thin parody: "Agentfarce", "Dreamfarce", "Marc B.". The building and park keep their
  real names because they're landmarks.
- There's no tower boss; the fall is the climax, and the Hydra stays the one real boss.
- **Founders:** demo-trap grab, pitch-deck throws, follow-up spam. Not "pivot on hit".
- **Tech bros:** 1-year cliff armor, Zone 2 joggers. Not the oat-milk puddles or the advice
  bubbles.
- **Park set pieces:** the bus fountain jets, the gondola entrance, and a pitch-competition
  amphitheater. Not the cracked beam.
- **Tower:** sales-funnel floors with an elevator pitch between each.
- **CRM agents:** contract lock and chatbot popups. Not upsell splitting or seat spawning.
- **Chute prompt:** Claude keeps getting it wrong, three lines.
- **Mobile:** every tap types the next character ("mash to vibe"), plus voice.
- **Landing:** on a Waymo roof. The Waymo says "Rider detected on roof. Adjusting route." and
  drives you to HQ.
- **The Park follows the real map, walking west from the gondola** (picked 2026-09-27 from
  `feed/sfpark/layout.webp`): gondola, Oculus, Main Plaza, play area, Central Lawn, bus
  fountain, West Skylight, restaurant, amphitheater. The one liberty is the tower lobby after
  the amphitheater; the real tower stands mid-park. ("Layouts to help with logo design" meant
  level design.)

## Phase 1: Park (shipped)

The implementation is `src/scenes/Park.js`, the enemies in `src/entities/enemies.js` (Founder,
FollowUp, VestedBro, Jogger) and the art in `src/parkArt.js`. See the handoff for its numbers.

## Phase 2: Tower (shipped)

Built as specced in `src/scenes/Tower.js`, `src/scenes/Elevator.js`, `src/towerArt.js`, and the
CRM agent, chatbot and popup in `src/entities/enemies.js`. Where it differs from the spec below:

- Popups use two slots at most, so a fight never hides behind three windows.
- The leap lands at `BossHQ` until the Chute exists (`AFTER_LEAP` in `Tower.js`); the camera
  follows the player out past the glass.
- The finale's closing sales team only bumps and talks; it doesn't throw contracts.
- The agent in the elevator is "CHAD, AE", after the leaderboard.

Scene `Tower` (a PlayScene) with `create(data)`:

- `floor = data?.floor ?? registry.towerFloor ?? 59`. Store `registry.towerFloor = floor`, so
  `End`'s retry, which passes no data, restarts the same floor.
- Each floor calls `this.checkpoint()` (heal, save stars and tokens).
- `Title` resets `towerFloor: null` and `lockTaught: false`.
- Add `?tower=59|60|61` next to `?park` and `?boss`.
- `End`'s `RETRY` gets `Tower: 'retry this floor'`.

Floors: 12-row grids, 64–72 columns (61 is a ~44-column arena), no pits (you're indoors).

| Floor | Theme | Enemies | Dressing |
|---|---|---|---|
| 59 SDR Bullpen | cold-call hell | CRM agents ×4, standing desks | a gong that rings on every contract lock, the leaderboard "1. CHAD 2. CHAD 3. YOU?", the poster "ALWAYS BE CLOSING (TICKETS)" |
| 60 Demo Center | Dreamfarce expo | chatbots ×3, agents ×2-3 | booths (AGENTFARCE, FREE TOTES, CUSTOMER 360) |
| 61 Ohana Floor | glass walls, bay view | two waves, then the finale | "OHANA MEANS FAMILY (& MULTI-YEAR CONTRACTS)" |

**Plumbing:**

- `PlayScene.buildExit(facadeKey, next, { data, panel = 'hq_door', panelAlpha = 0.6 })`.
- `exit()` calls `scene.start(next, data)`.
- The Park exit becomes `buildExit('tower_lobby', 'Tower', { data: { floor: 59 } })`; today it's
  `'BossHQ'`.
- Floors 59 and 60 end at an `elevator_bank` facade (144x160, door at x = 88 like `FACADE`) with
  steel `elev_door` panels. It exits to the `Elevator` scene with `{ floor }`.

**Elevator scene** (not a PlayScene, about 6 s, skippable with ENTER or a tap):

- Stop the HUD and launch `Cine`. Show the car's interior at 3x zoom: player left, agent right,
  an amber floor display ticking 59 → 60.
- Cut the agent off mid-sentence at the ding, fade out, then start `Tower { floor: floor + 1 }`.
- 59 → 60: "While I have you... have you considered Agentfarce?" / "It's agentic AND agentful." /
  "I'll let you get back to your day. Actually, one more th-"
- 60 → 61: "Quick question: how are you managing customer relationships today?" /
  "Spreadsheets? Oh no. Oh no no no." / "Let me loop in my manager, he's on 61. We could ri-"

**CrmAgent (`A`)**, sprites `agent0` and `agent1` (anim `agent_walk`, already committed):

- 3 HP, reward 5. Patrols; once it sees you (|dx| < 160) it keeps a sales distance of 56–110 px,
  so give `Enemy.groundAhead` a `dir` argument for backing up.
- Every 2 s it throws a `contract` hazard (vx 120). Pitch lines: "per seat, per month",
  "agentic AND agentful", "can I get 15 min?".
- **Contract lock:**
  - Hazards get a `harmless` flag: the contract does no damage.
  - On hit, `Player.lock(3000)`: firing is disabled and a red "LOCKED IN" chip shows with the
    fine print "*auto-renews annually". Powers still work.
  - A 1 s grace after each lock, so locks can't chain forever.
  - "refactor" unlocks, with "contract voided: loophole!" (in `PlayScene.usePower`).
  - `scene.onLocked()` teaches this once per run with the toast
    'Locked in? "refactor" voids the contract (or 3)', and rings the floor-59 gong.
- Death lines: "Trailhead badge unlocked: Being Sold To", "I'll send a calendar invite",
  "let me loop in my manager".

**ChatbotAgent (`C`)**, sprite `chatbot` (already committed):

- 2 HP, reward 4. It flies (no gravity, `ghost`) and hovers above and beside you.
- Every ~5 s it opens one **Popup**: an Enemy with 1 HP and no reward that does no contact damage.
  - It sits at a fixed offset from the camera's centre, so it stays on screen until shot.
  - Texture `popup` is 112x32: a blue title bar reading "Agent", a red close box, a white body.
    The two lines of text are worldText overlays. Line sets:
    - "Hi! I'm your Agent." / "How can I help?"
    - "Hi again!" / "Still here to help!"
    - "I noticed you're busy!" / "Want a demo?"
  - Shooting a popup opens a smaller `popup_small` (88x24) reading "Was this helpful?" / "Y / N",
    once.
- "refactor" clears chatbots and popups, with no follow-up popup.

**Ohana finale (floor 61):**

1. Two waves: `[A, C]`, then `[A, A, C]`.
2. The toast "No exit. Only one thing left to do."
3. The sales team walks in from the left: 5 agents with `closing = true`.
   - They're invulnerable ("we're flexible on pricing") and move at 24 px/s.
   - Contact bumps you, no damage, with the line "let's circle back on pricing".
4. The right-hand glass wall cracks.
5. Reaching x > worldW − 28 plays the leap: a jump arc, glass shards, a flash, then a fade to
   `Chute`.

**Interior art:**

- A world-anchored `tileSprite` wall (96x192) with transparent window cutouts, so the
  camera-pinned skyline (`TOWER_VIEW`) shows through.
- `TOWER_VIEW` is the Level 1 layers shifted down 40–70 px, so the city sits below the horizon
  from 900 ft up.
- A new tile theme `tower`: charcoal carpet, a slab fill, and standing-desk platforms.
- The Ohana wall is floor-to-ceiling glass. **Match the reference photos in `feed/SF Ohana/`.**

## Phase 3: Chute (the parachute)

A standalone scene, not a PlayScene, with no HUD.

**The fall:**

- The tower facade scrolls up past you; it must be the real silhouette (see `feed/SF Tower/`).
- An altimeter counts down from 1,070 ft over about 20–25 s on desktop, while the player sprite
  tumbles.
- A `terminalWindow` overlay takes the typed input.

**The three lines** (Claude keeps getting it wrong):

1. `build me a parachute` → a CRM dashboard shaped like a canopy. Claude says: "Here's your
   parachute! I also connected it to your CRM."
2. `no, a real one` → a real chute behind a paywall: "Parachute Pro: $150/seat/month. Deploy
   requires Enterprise tier."
3. `ship it` → the chute opens and the music drops.

**Input:**

- Matching is case-insensitive and whitespace-tolerant, small typos are accepted, and Backspace
  works.
- Tab autocompletes the line, with a toast: "that's vibe coding".
- Add `voice.keysSuspended` so typing m, 1, 2 or 3 doesn't trigger push-to-talk or powers.
- Touch: every tap types the next character. Hold talk and speak the line as an alternative, via
  a fuzzy match on `voice.transcript`.

**Failure:** at 0 ft you splat onto the Transit Center roof: "404: parachute not found". The
retry restarts the fall. God mode slows the altimeter.

**Landing:**

- Steer left and right over SoMa rooftops to collect stars.
- Land on the Waymo, which drives to the HQ facade. The walk-in moves here from Level 1: use
  `buildExit('hq_facade', 'BossHQ')`, or tween it the same way.

## Verification (every phase)

- `npm run build`.
- `npm run dev -- --port 5199 --strictPort`, then use `?park`, `?tower=61` and `?touch` (the
  touch controls on a desktop).
- Take headless Playwright or chrome-devtools screenshots of each new section.
- Script the flows:
  - Level 1 exit → Park, and Park exit → the next scene.
  - Death → End → "retry …" restarts the same level with full health and no repeat of the intro.
- Typing in Chute never fires powers.
