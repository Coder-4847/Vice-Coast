# VICE COAST

A cinematic open-world crime game for the browser, set in the fictional state of **San Verano**.
Everything — name, world, characters, brands, music, art — is original.

**Live:** https://coder-4847.github.io/Vice-Coast/

> Status: **Phase 7 — Combat and police.** Health and armour, four weapons (VC-9 pistol, WASP-9 SMG, HAMMER-12 shotgun,
> FALCON AR-7 rifle) on a weapon wheel, explosions and burning cars, Wasted and Busted respawns, and a six-star wanted
> system whose response escalates from patrol cars to tanks, APCs, attack helicopters and jet strikes. Built on the living
> city (Phase 6), the streamed Port Valeria (Phase 5) and the driving model (Phase 4). See the [roadmap](#roadmap).

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

### Map and navigation

The minimap (top right) rotates with your heading and zooms out as you speed up; it shows the district, the street
you are on, and the road distance to your waypoint. Press `M` for the full map: click (or `A` on a pad, tap on touch)
to set a waypoint, drag / left stick to pan, scroll / triggers / pinch to zoom, right-click or `X` to clear, `C` / `Y`
to centre. The route follows the road grid and a light beam marks the waypoint in the world.

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

## Project layout

```
src/
  core/    game loop (fixed timestep + interpolation), renderer + HDR post pipeline, quality presets, settings
  input/   action map, keyboard/mouse + gamepad + touch, glyphs, rebinding
  ui/      design system (style.css), loading/title/HUD, settings menu, menu navigation
  world/   atmosphere (sky, time of day, weather), lighting rig, terrain, ocean, props, effects, landmarks
  world/city/  Port Valeria: plan (roads, blocks, districts, buildings), road/zone textures, routing
  combat/  vitals, explosions, wanted level, police director, aircraft
  npc/     signal clock, lane network + traffic AI, pedestrians (sidewalk graph, archetypes, reactions), ambient events
  physics/ Rapier world: terrain heightfield, building colliders, material-aware ray queries, 120 Hz substeps
  vehicles/ specs, tyre/suspension/drivetrain model, car + bike models, enter/exit + chase camera
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
7. **Combat and police** ✅ (this build) — weapons, health and armour, 1–6 star wanted levels
8. Remaining biomes
9. Aircraft, boats, military vehicles
10. Economy, properties, garage, phone
11. Mission framework and story
12. Robberies and crew
13. Side activities, radio, collectibles
14. Polish

See [CREDITS.md](CREDITS.md) for third-party software and assets.
