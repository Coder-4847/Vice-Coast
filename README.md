# VICE COAST

A cinematic open-world crime game for the browser, set in the fictional state of **San Verano**.
Everything — name, world, characters, brands, music, art — is original.

**Live:** https://coder-4847.github.io/Vice-Coast/

> Status: **Phase 8 — the rest of the land.** The state of San Verano is now a 6 × 8 km world: Port Valeria plus **Cinder Flats**
> (desert strip town, trailer park, biker bar, scrap yard, salt pan, airstrip, wind turbines), **Dusk Harbor** (container port),
> **Pinecrest Bay** (logging town, marina, lighthouse), **Mount Kestrel** (switchback road, cable car, summit tower, lake, cave) and
> **Costa Merida** (canal resort city with a casino), joined by highways, a coast railway and a state map. Built on combat and
> police (Phase 7), the living city (Phase 6) and the driving model (Phase 4). See the [roadmap](#roadmap) and [docs/WORLD.md](docs/WORLD.md).

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

| Action | Keyboard + mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | `W A S D` / arrows | Left stick | Left thumb (floating stick) |
| Look | Mouse | Right stick | Drag the right side · optional gyro |
| Fire / aim | `LMB` / `RMB` | `RT` / `LT` | Fire / Aim buttons |
| Reload | `R` | `X` (□) | Reload |
| Jump · **vault · climb** | `Space` (prompt appears at a ledge) | `A` (✕) | Jump |
| Sprint (stamina) · crouch | `Shift` · `C` | `L3` · `R3` | Sprint · Crouch (latching) |
| Draw / holster · inspect | `1` · `G` | D-pad ↓ · — | Arms (cycles weapons) |
| Weapon wheel (hold, point, release) · quick select | `Tab` · `2`–`5` (pistol, SMG, shotgun, rifle) | `LB` + right stick | Arms |
| Swim | walk into the sea; `C` dives, `Space` surfaces | same | same |
| Map (full-screen, set waypoint) | `M` | `Back` (View) | Map |
| Menu | `Esc` or `P` | `Start` (Options) | Menu |
| Noclip (debug) | `F9` | — | — |

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
and region names): click (or `A` on a pad, tap on touch) to set a waypoint, drag / left stick to pan, scroll / triggers / pinch to
zoom, right-click or `X` to clear, `C` / `Y` to centre. The route follows highways and streets across the whole state (dirt
tracks only when nothing else connects), and a light beam marks the waypoint in the world.

### Vehicles

Walk to a car in the lot (east of the range, ~170 m along the beach) and press the interact key.

| Action | Keyboard + mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Enter / exit | `E` (exit below ~40 km/h) | `Y` (△) | Use / Exit |
| Throttle · brake / reverse | `W` · `S` | `RT` · `LT` | Gas · Brake |
| Steer | `A` `D` | Left stick | Left thumb |
| Handbrake (drift) | `Space` | `A` (✕) | Drift |
| Camera mode (chase / close / hood / cinematic) | `V` | D-pad → | Cam |
| Look behind · free look | `C` · mouse | `R3` · right stick | Look back · drag |
| Horn · headlights | `H` · `L` | `L3` · — | Horn · Lights |

Touch buttons can be dragged anywhere: **Menu → Touch → Edit layout**.

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
  input/   action map, keyboard/mouse + gamepad + touch, glyphs, rebinding
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
  craft/   boats, helicopters, planes, tanks: specs, arcade force models, procedural models, piloting (camera, HUD, weapons), skydive
  player/  controller, first-person viewmodel (arms, hands, pistol, animation), weapon logic
  audio/   procedural Web Audio engine (no sample files)
docs/      PERFORMANCE.md, QA.md
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
9. **Aircraft, boats and military vehicles** ✅ (this build) — 4 boats, 2 helicopters, 3 planes, a tank and an APC, skydiving, Valeria International, Isla Rojo and Fort Halloran (airliner, cargo plane, wingsuit, simulation flight and diving are deferred)
10. Economy, properties, garage, phone
11. Mission framework and story
12. Robberies and crew
13. Side activities, radio, collectibles
14. Polish

See [CREDITS.md](CREDITS.md) for third-party software and assets.
