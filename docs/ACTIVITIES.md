# Side activities, radio, collectibles and completion (Phase 13)

Everything here is data-driven and saved in `profile.story` (`collect`, `acts`, `claimed`), so a save written before
Phase 13 loads with empty records.

## Radio (`src/radio/`)

Six stations, all synthesized live with Web Audio (no audio files):

| Station | Genre | Notes |
|---|---|---|
| Valeria Rock 101.3 | rock | power chords, driving drums |
| Coast FM 94.7 | hip-hop | 808 bass, swung hats, rhodes chords |
| Neon Pulse 128.0 | electronic | four-on-the-floor, arpeggios |
| Radio Merida 88.1 | latin | clave, congas, tumbao bass |
| Velvet Lounge 99.2 | jazz / lounge | swing ride, walking bass, comping |
| Valeria Talk 880 AM | talk / news | speech only, with call-ins |

`Radio.ts` is the player: a look-ahead scheduler (0.28 s on the audio clock) turns a per-station pattern into notes,
changes "songs" every 36–56 bars (new title/artist, new chord loop), and schedules DJ links, adverts and news between
them. The music ducks under the voice. Every spoken line is also a subtitle (and optional text-to-speech, same
`Speech` the cutscenes use). `RadioControl.ts` connects it to the game: it plays only while you are in a vehicle or
aircraft, the **Radio** button (Q / pad LB, `Sprint`+Q goes back) cycles Off → six stations, and a station strip at the
bottom lets you click one. The last station is remembered in `localStorage`. **Settings → Audio → Radio volume**.

## Collectibles (`src/collect/`)

| Kind | Count | How | Pays | Set bonus |
|---|---|---|---|---|
| Hidden packages | 40 | glowing crate, run or drive through | $250 | $10,000 |
| Graffiti spots | 24 | stand at a blank wall, hold the prompt ~2.6 s | $300 | $8,000 |
| Street art | 16 | get close, "Photograph the mural" | $350 | $6,000 |
| Stunt jumps | 12 | launch off the ramp, clear 20 m, 0.7 s of air | $600 | $12,000 |
| License-plate trophies | 15 | plates on posts at lighthouses, summits, islands | $800 | $20,000 |

Positions come from fixed seeds (`defs.ts`) so every game has the same layout, and are snapped onto open ground a
few frames after the game starts (`Collectibles.resolve`). Only items within 280 m have meshes; graffiti and murals
get a small physics slab; ramps are built and removed as you approach. Map: an uncollected item shows on the map when
you are within 240 m, and finding **half** of a kind shows the rest. The **Progress** tab (pause menu) and the phone's
**Progress** app list every kind and can set a waypoint to the nearest one left.

## Completion tracker (`src/collect/Completion.ts`)

| Category | Weight |
|---|---|
| Story missions (Act I vertical slice) | 30 |
| Gold medals | 5 |
| Heists | 15 |
| Robberies (12 counts as full) | 5 |
| Side activities (goals below) | 25 |
| Collectibles | 20 |

Milestones pay once: 10 % $5,000 · 25 % $15,000 · 50 % $40,000 · 75 % $100,000 · 100 % $250,000.

## Activities on the mission engine (`src/activities/`)

A side activity is an ordinary `MissionDef` with `activity: '<id>'`. The difference from story missions: it is always
available, pays in full on every play (the prize comes from `stats.extra.payout`), records into `StoryState.acts`
instead of "done", never offers skip, and its start marker only shows when you are within 900 m.

### Races (`Race.ts`, `courses.ts`)

* **Street** (3), **circuit** (2, two laps), **rally** (2), **downhill** (2): cars against 2–3 AI rivals. Checkpoints
  are generated from the road network (`WorldRouter`, which includes dirt tracks) every ~110 m between the `via`
  points; rivals follow the same route with the pure-pursuit driver and are rubber-banded so the pack stays close.
  Prize: 100 / 50 / 30 / 15 % by finishing place, +25 % under par.
* **Bike** (2), **boat** (2), **air** (2): timed against par (no AI rivals for two wheels, boats or aircraft).
* Gold: win, finish under par, no police attention.

### Jobs (`jobs.ts`)

* **Taxi** — three fares in a Marlow cab, random pick-ups and drop-offs, a timer, tips for speed, passenger chatter.
* **Courier** — three rush deliveries, any vehicle.
* **Bounty** (2) — a skip and their crew at the Cinder Flats stash house / Dead Man's Gap.
* **Repo** — steal a Barrage GT on Marlowe Row and deliver it to Redline Customs with the police on you.
* **Vigilante** — three crimes in progress on the scanner (escalating gangs).
* **Flight school** (5 lessons) and **stunt course** (3 courses): gate courses at Valeria International.

### Mini-games (`src/minigames/`)

* **Lucky Seven Casino** (walk up to the Gran Casino marker in Costa Merida): blackjack (3:2, double down), roulette
  (single zero, outside bets and straight-up numbers), slots (≈94 % return).
* **Iron Hound bar** (Cinder Flats): darts (301 against the house) and pool (clear the table in 20 shots).
* **Toolkit** (phone app): lock-picking, hacking and safe-cracking on three difficulty levels.

### Tracker goals

| Activity | Goal |
|---|---|
| Street / circuit / rally / downhill / bike / boat / air | 3 / 2 / 2 / 2 / 2 / 2 / 2 courses won |
| Taxi / courier / bounty / repo / vigilante | 10 fares / 6 deliveries / 4 / 4 / 6 |
| Flight school / stunt course | 5 lessons / 3 courses |
| Blackjack / roulette / slots / darts / pool | 10 / 5 / 3 / 3 / 3 wins |
| Lockpick / hack / safe | 6 / 6 / 4 |

## Not built yet

Tennis, golf, basketball, boxing/MMA, bowling, arm-wrestling and stadium events; underground racing tournament,
hunting, fishing, scuba and shipwreck diving, treasure hunt, hiking, rock climbing, triathlon, base jumping, horse
racing, aircraft/jet combat training, crop-dusting, air-taxi and smuggling runs, in-game TV and the Snapstream feed.
The mini-games (lock-pick, hack, safe) are practice rigs in the phone's Toolkit; they are not yet wired into heists.
