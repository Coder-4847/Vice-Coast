# VICE COAST

A cinematic open-world crime game for the browser, set in the fictional state of **San Verano**.
Everything — name, world, characters, brands, music, art — is original.

**Live:** https://coder-4847.github.io/Vice-Coast/

> Status: **1.0 — complete.** Start from the main menu, play the snowbound prologue *Pinecrest, 2011*, then three switchable
> protagonists, 38 story missions with six heists and a three-ending finale, 15 races, jobs, casino and bar games, a 107-piece
> collectible hunt, six synthesized radio stations and a photo mode, across a 6 × 8 km state. See the [roadmap](#roadmap).

### Starting out

* **Main menu**: *Continue* loads your most recent save; *New Game* asks for one of three slots; *Load Game*, *Settings*,
  *How to Play* and *Credits* are there too. Keyboard, mouse and controller are supported; phones and tablets are not (there are no on-screen touch controls).
* **Prologue**: a new game opens nine years earlier in the snow at the Pinecrest sawmill. It teaches walking, shooting and
  driving and ends outside Mack's flat on the Seaside boardwalk. You can abandon it from the failure screen and lose nothing.
* **Pause menu** (`Esc` / Start): Resume, Map, Progress, Save Game, **Photo Mode**, Settings, Quit to Main Menu.
* **Photo mode**: the world freezes; fly the camera with `WASD`, mouse, `Space` / `C`, `Shift`; set field of view, roll,
  time of day and a filter (Natural, Vivid, Vintage, Cool, Noir); `H` hides the panel; *Take photo* saves a PNG.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Needs a browser with WebGL 2 (current Chrome, Edge, Firefox or Safari). Append `?debug` to the URL to
expose the game object as `window.__vice` in a production build (always on in `npm run dev`).

Look-dev URL parameters: `?time=18.7` (hour 0–24), `?weather=rain` (`clear cloudy overcast rain storm fog dust snow`),
`?speed=0` (freeze time; default 30 = one game minute per two real seconds). The same controls live in **Esc → Environment**.

## Controls

All bindings are rebindable in **Esc → Controls / Gamepad**, and prompts switch glyphs automatically when you change device.
Click the game to capture the mouse. You spawn on a beach shooting range facing the city at golden hour.

| Action | Keyboard + mouse | Gamepad |
| --- | --- | --- |
| Move | `W A S D` / arrows | Left stick |
| Look | Mouse | Right stick |
| Fire / aim | `LMB` / `RMB` | `RT` / `LT` |
| Reload | `R` | `X` (□) |
| Jump · **vault · climb** | `Space` (prompt appears at a ledge) | `A` (✕) |
| Sprint (stamina) · crouch | `Shift` · `C` | `L3` · `R3` |
| Draw / holster · inspect | `1` · `G` | D-pad ↓ · — |
| Weapon wheel (hold, point, release) · quick select | `Tab` · `2`–`5` (pistol, SMG, shotgun, rifle) | `LB` + right stick |
| Swim | walk into the sea; `C` dives, `Space` surfaces | same |
| Switch character (wheel) · special ability | `Z` · `X` | D-pad ← · `RB` |
| Crew commands (hold / follow / attack / breach) | `B` | D-pad → |
| Radio: next station (in a vehicle; `Shift`+`Q` goes back) | `Q` | `LB` |
| Map (full-screen, set waypoint) | `M` | `Back` (View) |
| Menu | `Esc` or `P` | `Start` (Options) |
| Noclip (debug) | `F9` | — |

### Combat, police and the wanted level

Walk over the glowing crates beside the spawn point for the SMG, shotgun and rifle, body armour and a medkit (they come back after
75 s). Armour soaks 70 % of each hit; health regenerates up to 60 % after a few quiet seconds. Shooting people, killing officers,
running people down and blowing things up add *heat*; it only counts in full if somebody saw it. Each star brings a bigger response:

| ★ | Response |
| --- | --- |
| 1 | Patrol cars chase you and officers get out with pistols |
| 2 | More cars, roadblocks, spike strips (they burst your tyres), some shotguns |
| 3 | SWAT vans, a police helicopter with a searchlight, rifles |
| 4 | Heavy SWAT, an armoured truck that rams, snipers on rooftops (watch for the red laser), ramming cars |
| 5 | Federal agents, a gunship strafing you, heavy roadblocks |
| 6 | Tanks, APCs, attack helicopters with missiles, and fighter-jet strikes; a very long cool-down |

Break line of sight and the stars flash while the search timer runs down (water halves it). Officers who reach you while you stand
still arrest you (up to 3 stars) — **Busted** costs most of your spare ammo and drops you at police HQ; dying is **Wasted** and sends
you to St. Aurelia Medical Center. The beach shooting range is a safe place to practise.

### The world

| Place | What is there |
| --- | --- |
| **Port Valeria** (centre) | The big city: downtown, boardwalk and pier, luxury hills, industrial district, stadium, hospital, police HQ |
| **Dusk Harbor** (south) | A working port: basin with finger piers, five quay cranes, a block-stacked container yard with a rail spur, a moored container ship, tank farm, warehouses |
| **Costa Merida** (far south) | A pastel resort town a quarter of Port Valeria's size: canals with a bridge at every crossing, seafront promenade and beach clubs, market square, cathedral, the Gran Casino |
| **Pinecrest Bay** (north-west) | A quiet logging and fishing town on a bay: bank, general store, diner, sheriff's station, church, town square, marina, sawmill, a lighthouse on the headland |
| **Mount Kestrel** (north-east) | A 950 m peak with snow above ~550 m: a switchback road to the summit, a cable car, a radio tower and observation deck, a lake with a camp, a boulder cave with a hidden shrine, a downhill / skydive launch ramp |
| **Cinder Flats** (east) | Desert plateau with mesas and cacti: a strip town (diner, motel, saloon, gas station, biker bar), a trailer park, a "moonshine and scrap" yard, an abandoned airstrip with hangar and derelict plane, a dried salt pan with a stranded hull, wind turbines, dirt-bike trails with jumps |

Roads: the **Coastway** (Port Valeria → Dusk Harbor → Costa Merida), the **Pinecrest Highway**, the **Cinder Highway** (through the
Valeria Range pass), county roads and dirt tracks. The **Coast Line** railway runs beside the Coastway with a train shuttling
between Port Valeria and Costa Merida (scenery for now — not rideable). Weather follows the land: snow high on Kestrel, dust gusts
on the desert plateau (until you pick a weather in **Esc → Environment**).

### Map and navigation

The minimap (top right) rotates with your heading and zooms out as you speed up; it shows the district or region, the street
you are on, and the road distance to your waypoint. Press `M` for the full map of the whole state (roads, rail, biomes, landmarks
and region names): click (or `A` on a pad) to set a waypoint, drag / left stick to pan, scroll / triggers to
zoom, right-click or `X` to clear, `C` / `Y` to centre. The route follows highways and streets across the whole state (dirt
tracks only when nothing else connects), and a light beam marks the waypoint in the world.

### Vehicles

Walk to a car in the lot (east of the range, ~170 m along the beach) and press the interact key.

| Action | Keyboard + mouse | Gamepad |
| --- | --- | --- |
| Enter / exit | `E` (exit below ~40 km/h) | `Y` (△) |
| Throttle · brake / reverse | `W` · `S` | `RT` · `LT` |
| Steer | `A` `D` | Left stick |
| Handbrake (drift) | `Space` | `A` (✕) |
| Camera mode (chase / close / hood / cinematic) | `V` | D-pad → |
| Look behind · free look | `C` · mouse | `R3` · right stick |
| Horn · headlights | `H` · `L` | `L3` · — |


### Money, properties, shops and the phone

You start with $5,000 in cash and $2,500 in the bank. Coloured beams mark things you can use: **gold** = a property for sale
(**green** once it is yours), **blue** = a shop, **orange** = a vehicle shop, **green pillars** = ATMs. Walk up and press `E`.

| Where | What it does |
| --- | --- |
| ATMs (beach, downtown, mall, harbor, Costa Merida, Pinecrest, airport, …) | Deposit and withdraw. Cash is lost when you are Wasted (10%) or Busted (25%); the bank is safe and pays property upkeep |
| Properties (9, from a $6,500 desert trailer to the $2.4 M Isla Rojo estate) | Buy; then **save**, **sleep** until 06:00 (heals, starts a new day), **wardrobe**, **garage**, set as home (respawn there), sell for 70%. Upkeep is billed daily; three unpaid days and it is repossessed |
| Valeria Motors (showroom) | Browse the six cars in an orbit view, pick a paint, **buy** (delivered to a garage with space, or parked outside) or **test drive** for two minutes |
| Redline Customs | Drive a car in and press `E`: register it to you (25% of its price) or sell it to the back room (30%). Owned cars get paint (18 colours, 5 finishes incl. pearlescent and chrome), trim, rims, glass tint, spoilers, underglow, plates, engine / brakes / suspension / turbo, run-flat tyres and bulletproof plating, previewed live |
| Threadline, Costa Rags, The Clip Joint, Pinecrest Barbers | Jackets, gloves, sunglasses, hair style and colour (the figure preview updates as you choose; you see sleeves and gloves in first person and the whole figure in a car) |
| Brass & Barrel, Cinder Surplus | Weapons, ammo, extended magazines, suppressors, optics, finishes, medkits and armour |
| Burger and taco joints | Food heals |
| **Phone** (`T` · D-pad up) | Messages, contacts (ring the cab, your mechanic, the insurer), maps, bank, **cab** to your waypoint, **garage** (mechanic brings any of your cars to you for $150), **online car dealer**, realty listings, insurance claims for written-off cars, and a **camera** that saves a PNG |

Money comes from wallets dropped by people you take down, cars sold at the back room, and property sales; steadier income arrives
with missions and heists in later phases.

**Saving:** three slots in browser storage, chosen on the title screen. The game autosaves every four minutes (when nobody is after
you) and whenever you buy, sleep or leave a shop. **Menu → Saves** lets you save, load, delete, **export** a slot to a file and **import** one.

### Story, three protagonists and heists

**Marcus "Mack" Delgado** (driver), **Imani Cole** (pilot) and **Teddy Vance** (stuntman) are playable and switchable. New games start with
Mack; Imani and Teddy join as the story unlocks them (each arrives with a free home: Boardwalk Studio, Hangar 3, the Cinder Flats trailer).
Press `Z` (D-pad ←) for the switch wheel: the camera pulls up, drops onto the other character and the one you left stands where you left them.
Each has a special ability on `X` (`RB`) that recharges: **Slipstream** (Mack: time slows while driving, perfect drift control),
**Overwatch** (Imani: time slows and aim locks in; aircraft take much less damage), **Rampage** (Teddy: a fraction of the damage, harder blasts).

Missions start from lettered beams on the map and minimap (M, I, T, ★ for everyone): walk or drive up and press `E`. In this build the
campaign has **Act I, 12 missions** (Valet, Old Debts, Slipstream, Charter, Overwatch, Dead Drop, Followers, Stash House, Dust Up, Three Roads,
Switch, Dead Ringers) and **two heists**: *The Gilded Counter* (jeweller) and *Valeria Savings* (bank). The full plan, 38 missions and 6 heists, is in
[docs/STORY.md](docs/STORY.md).

* Every stage start is a **checkpoint**. Failing offers *Retry from checkpoint*, *Restart* or *Quit*, and **Skip** after three failures.
* Each mission has three **gold objectives** (time, accuracy, flawless, never wanted…): all three in one clean run is a gold medal.
  Finished missions can be **replayed** from the phone's *Missions* app (they pay half and do not change the story).
* **Cutscenes** are real-time in the engine, letterboxed and subtitled; `Enter` skips. Subtitles and optional spoken dialogue
  (browser text-to-speech, a different voice per character) are in *Settings → Accessibility*.
* **Heist board** (in Mack's flat, a blue beam): choose an approach (**loud**, **quiet** or **smart**), a crew (Benny, Dex, Silas: each takes a cut and
  changes the job) and finish the prep missions; then do the job inside a purpose-built interior and get away. The split is paid by performance.

### Robberies and crew

**Instant robberies.** Little service kiosks (gas stations *Petrolia* and friends, groceries, liquor stores, two jewelry counters, marked `¢` on the
map) have a clerk behind the counter. Draw a gun, walk up and aim at them: press `E` to **hold them up**, then keep them covered while the bag fills
(10–20 seconds). The longer you stay the faster the police respond (one star after a moment, two, then three). A third of clerks trip a silent
alarm, some have a hidden gun and reach for it if you stop covering them, and a clerk you shoot is a crime. With a gun out, ATMs can be **smashed open**
(hold `E`). Stores and ATMs cool down for a day or two.

**Crew.** Twelve specialists in six roles (driver, gunman, hacker, lockpicker, pilot, demolitions) with skill, cut, loyalty and a fee. Benny, Dex,
Silas and Pilar join through the story; the rest are recruited from the **Crew** app on the phone or at the heist board. Each role changes the job
(cameras, vault and lock times, wanted stars). **Gunmen come into the building with you** and answer the command wheel (`B`): follow, hold, attack, or breach.
Enemies shoot at them too. After a job people can be **hurt** (out for a few days) or **killed** (for good), loyalty moves with how things went, you can
pay bonuses, and a disloyal crew skims extra before walking away. People learn and improve every few jobs.

**Heists** now number five: the jeweller, the bank, **The Long Haul** (an armored truck and two escort cars on the East Highway: ram it, spike it or
spoof its tracker), **Lucky Seven** (the Costa Merida casino vault) and **Night Freight** (a freight train on the Cinder siding). The museum and the
yacht are still to come.

### Radio, side activities and collectibles

**Radio.** Six stations, synthesized live: rock, hip-hop, electronic, latin, jazz/lounge and talk, with DJs, adverts and news as subtitles (and optional spoken lines).
Press `Q` in any vehicle or aircraft; click a card on the strip to jump to a station. **Radio volume** is in Settings → Audio.

**Side activities** start from flag markers (⚑) that appear within a kilometre: **street, circuit, rally and downhill races** against AI rivals, **bike, boat and air races**
against the clock, **taxi, courier, bounty, repo and vigilante jobs**, **flight school and a stunt course**. They pay in full every time and can be replayed.
Walk up to the **Lucky Seven casino** (blackjack, roulette, slots) or the **Iron Hound bar** (darts, pool); the phone's **Toolkit** has lock-picking, hacking and safe-cracking.

**Collectibles.** 40 hidden packages, 24 graffiti walls to spray, 16 murals to photograph, 12 stunt jumps and 15 license-plate trophies in hard places. Finding half
of a kind marks the rest on the map. **Esc → Progress** (and the phone's *Progress* app) shows the completion percentage across story, heists, robberies, activities and
collectibles, with cash milestones at 10 / 25 / 50 / 75 / 100 %. Details: [docs/ACTIVITIES.md](docs/ACTIVITIES.md).

### Boats, aircraft and armour

Walk (or swim) up to one and press the interact key. Boats are moored at the piers and marinas, helicopters and planes wait at
**Valeria International** (about a kilometre south of the city), the Cinder Airstrip, the Mount Kestrel summit and **Isla Rojo**
(the private island out in the Pacific, with its own airstrip and dock). **Fort Halloran** (the fenced army base on the desert
plateau) keeps tanks, APCs and army helicopters in its motor pool — but it is **restricted**: cross the boundary and a countdown
starts, the compound itself (or stealing armour) brings the heavy response straight away.

| Craft | Controls |
| --- | --- |
| Boats (Zephyr jet ski, Marlin speedboat, Gull fishing boat, Aurelia yacht) | `W` `S` throttle / reverse · `A` `D` steer · `E` leave (anywhere on the water) |
| Helicopters (Sparrow, Newsbird) | `W` `S` fly forward / back · `A` `D` turn · `Space` climb · `C` descend · `E` land and exit — or bail out above ~30 m |
| Planes (Skylark prop, Rook stunt, Meridian jet) | `Space` / `C` throttle up / down · `W` `S` nose down / up · `A` `D` bank (the Rook rolls) · `G` landing gear · `RMB` brake · `E` exit (bail out above ~30 m) |
| Tank (Bulwark) and APC (Warden) | `W` `S` drive · `A` `D` turn (pivots in place) · mouse aims the turret · `LMB` cannon (APC: autocannon) · `RMB` machine gun · `Space` brake · `E` exit |

`V` switches between chase and cockpit cameras. Planes need a run-up (the airport runway is 840 m; the Skylark leaves the ground
at ~90 km/h) and the stick is forgiving: release it and the wings level and the nose settles. **Skydiving:** bail out of an
aircraft (or jump off Mount Kestrel) and you fall at ~190 km/h — steer with `WASD`, press `Space` to open the parachute (it opens
by itself ~40 m above the ground), steer it, and land on your feet.

## Project layout

```
src/
  core/    game loop (fixed timestep + interpolation), renderer + HDR post pipeline, quality presets, settings
  input/   action map, keyboard/mouse + gamepad, glyphs, rebinding
  ui/      design system (style.css), loading/title/HUD, settings menu, menu navigation
  world/   atmosphere (sky, time of day, weather), lighting rig, ocean, props, effects, landmarks
  world/heightfield.ts, TerrainData, terrainBake, bake.worker, Terrain   the state's shape → baked 4 m heightmap → clipmap renderer
  world/roads.ts, RoadMeshes, towns/   highways, rail and town streets (carved into the terrain), authored settlements
  world/Wilderness, vegGeometry, Animated   forests / desert plants, turbines / cable car / train / beacons
  world/city/  Port Valeria: plan (roads, blocks, districts, buildings), road/zone textures, routing
  combat/  vitals, explosions, wanted level, police director, aircraft
  npc/     signal clock, lane network + traffic AI, pedestrians (sidewalk graph, archetypes, reactions), ambient events
  physics/ Rapier world: terrain heightfield, building colliders, material-aware ray queries, 120 Hz substeps
  vehicles/ specs, tyre/suspension/drivetrain model, car + bike models, enter/exit + chase camera
  economy/ money, save slots, properties, shops, garage and customisation screens, interaction points
  crew/    roster, loyalty / injuries / effects, field allies with a command wheel, crew pages
  crime/   robbery kiosks, clerks and the hold-up / ATM flows, shared police-call helper
  story/   mission engine (generator scripts, checkpoints, medals), cutscene director, protagonists + abilities, gunmen and scripted drivers, heists and their interiors, content/ (missions, cutscenes, heists)
  craft/   boats, helicopters, planes, tanks: specs, arcade force models, procedural models, piloting (camera, HUD, weapons), skydive
  player/  controller, first-person viewmodel (arms, hands, pistol, animation), weapon logic
  audio/   procedural Web Audio engine (no sample files)
docs/      PERFORMANCE.md, QA.md, STORY.md, WORLD.md
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → GitHub Pages.
Vite uses a relative `base`, so asset URLs work under `/Vice-Coast/` and locally.

## Roadmap

1. **Foundation** ✅
2. **Core look** ✅ — sky, day/night, lighting, post-processing, terrain, weather
3. **Player on foot** ✅ — first-person hands, movement, vault/climb, pistol
4. **Vehicles** ✅ — 5 cars + 1 bike, chase camera, enter/exit
5. **World streaming and Port Valeria** ✅ — city, chunk streaming, minimap and map (airport, studio lot, metro and the full amusement park are still to come)
6. **NPCs and traffic** ✅ — traffic AI and signals, crowds, reactions, ambient events
7. **Combat and police** ✅ — weapons, health and armour, 1–6 star wanted levels
8. **Remaining land biomes** ✅ — Cinder Flats, Dusk Harbor, Pinecrest Bay, Mount Kestrel, Costa Merida, highways and rail (Fort Halloran and the islands arrive with Phase 9's boats and aircraft)
9. **Aircraft, boats and military vehicles** ✅ — 4 boats, 2 helicopters, 3 planes, a tank and an APC, skydiving, Valeria International, Isla Rojo and Fort Halloran (airliner, cargo plane, wingsuit, simulation flight and diving are deferred)
10. **Economy, properties, garage, clothing, shops, phone** ✅ — saving, 9 properties, car dealer and tuning shop, clothes and weapons shops, ATMs and a phone (stock market, tattoos, chop-shop minigame, business fronts, nitro, hidden compartments, aircraft / boat customisation and the Snapstream feed are deferred)
11. **Mission framework and story** ✅ — mission engine, cutscenes, three switchable protagonists, 12 missions, 2 heists (the other 26 missions and 4 heists are outlined in docs/STORY.md; crew injuries and the full crew system arrive in Phase 12)
12. **Robberies and crew** ✅ — 14 robbery kiosks plus ATMs, a 12-person crew that fights, gets hurt and has loyalty, and three more heists (museum and yacht heists, and the full 38-mission campaign, are still to come)
13. **Side activities, radio, collectibles** ✅ (this build) — 6 synthesized radio stations, 15 races, 5 job types, flight school and stunt course, casino / darts / pool / toolkit mini-games, 107 collectibles and a completion tracker (the long tail of sports, fishing, hunting, diving and similar activities is deferred, see docs/ACTIVITIES.md)
14. **Campaign: Act II** ✅ — missions 13–27, *Crown of Glass*, with 18 new cutscenes (Act III, the Aurelia heist and the three-ending finale are next)
15. **Campaign: Act III and the finale** ✅ — missions 28–36, the Aurelia yacht heist, and the three-ending finale with free roam
16. **Polish** ✅ — main menu, pause menu and photo mode, the prologue, spawn in the city, see-through gun and viewmodel shadow fixes, long-gun support-hand pose, queued saves, a UI restyle

17. **Pastimes, accessibility and the living city** ✅ — golf, tennis, bowling, hoops and arm wrestling; fishing, hunting and scuba diving; a mixer with music/effects/dialogue/menu buses, ducking, mono and night mode; HUD size, high contrast, readable font, camera-shake and flash controls, aim assist, hold-to-mash and on-screen sound cues; denser traffic and crowds; sun shafts, sharpening and a new grade; police vision cones, search zones and Spray Shacks; a stock market (see docs/ACTIVITIES.md). Still not built: triathlon, base-jumping courses, a treasure hunt, in-game TV and a social feed.
18. **Desktop only** ✅ (this build) — touch controls and gyro aim removed; keyboard + mouse and controller remain, and phones get a notice

See [CREDITS.md](CREDITS.md) for third-party software and assets.
