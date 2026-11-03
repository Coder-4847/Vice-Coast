# VICE COAST

A cinematic open-world crime game for the browser, set in the fictional state of **San Verano**.
Everything — name, world, characters, brands, music, art — is original.

**Live:** https://coder-4847.github.io/Vice-Coast/

> Status: **Phase 2 — Core look.** A physically-based sky with a day/night cycle, weather, cascaded-shadow
> lighting, a cinematic post-processing pipeline, procedural terrain + ocean and a placeholder city.
> The player, vehicles and real districts come in later phases. See the [roadmap](#roadmap).

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

## Controls (Phase 1 test camera)

The player/vehicle controls arrive in later phases; for now a free-fly camera exercises every input device.
All bindings are rebindable in **Esc → Controls / Gamepad**, and prompts switch glyphs automatically when you
change device.

| Action | Keyboard + mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | `W A S D` / arrows | Left stick | Left thumb (floating stick) |
| Look | Mouse (click to capture) | Right stick | Drag the right side · optional gyro |
| Up / down | `Space` / `C` | `A` (✕) / `R3` | Jump / Crouch buttons |
| Sprint | `Shift` | `L3` | Sprint button (latches) |
| Menu | `Esc` or `P` | `Start` (Options) | Menu button |
| Menu navigation | Arrows / Tab / Enter | D-pad or left stick · `A` select · `B` back | Tap |

Touch buttons can be dragged anywhere: **Menu → Touch → Edit layout**.

## Project layout

```
src/
  core/    game loop (fixed timestep + interpolation), renderer + HDR post pipeline, quality presets, settings
  input/   action map, keyboard/mouse + gamepad + touch, glyphs, rebinding
  ui/      design system (style.css), loading/title/HUD, settings menu, menu navigation
  world/   atmosphere (sky, time of day, weather), lighting rig, terrain, ocean, placeholder city, fly camera
docs/      PERFORMANCE.md, QA.md
```

## Deployment

Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → `npm run build` → GitHub Pages.
Vite uses a relative `base`, so asset URLs work under `/Vice-Coast/` and locally.

## Roadmap

1. **Foundation** ✅
2. **Core look** ✅ (this build) — sky, day/night, lighting, post-processing, terrain, weather
3. Player on foot — first-person hands, weapons
4. Vehicles
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
