# VICE COAST

A cinematic open-world crime game for the browser, set in the fictional state of **San Verano**.
Everything — name, world, characters, brands, music, art — is original.

**Live:** https://coder-4847.github.io/Vice-Coast/

> Status: **Phase 4 — Vehicles.** Five cars and a sport bike on a custom tyre/suspension model, a chase camera,
> seamless first ↔ third person enter/exit, procedural engine audio, and a vehicle lot on the beach next to the shooting
> range. Built on Phase 3 (first-person hands, pistol, physics) and Phase 2 (physical sky, weather, cinematic post).
> Real districts come next. See the [roadmap](#roadmap).

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
| Draw / holster · inspect | `1` · `G` | D-pad ↓ · — | Arms |
| Swim | walk into the sea; `C` dives, `Space` surfaces | same | same |
| Menu | `Esc` or `P` | `Start` (Options) | Menu |
| Noclip (debug) | `F9` | — | — |

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
  world/   atmosphere (sky, time of day, weather), lighting rig, terrain, ocean, placeholder city, props, effects
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
4. **Vehicles** ✅ (this build) — 5 cars + 1 bike, chase camera, enter/exit
5. World streaming and Port Valeria
6. NPCs and traffic
7. Combat and police
8. Remaining biomes
9. Aircraft, boats, military vehicles
10. Economy, properties, garage, phone
11. Mission framework and story
12. Robberies and crew
13. Side activities, radio, collectibles
14. Polish

See [CREDITS.md](CREDITS.md) for third-party software and assets.
