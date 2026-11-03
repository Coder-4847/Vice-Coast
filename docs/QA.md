# QA checklist

Run on desktop (Chrome + Firefox), a gamepad (Xbox and PlayStation layouts) and a touch device/emulation.
Append `?debug` to inspect `window.__vice`.

## Phase 1 — Foundation

### Startup
- [ ] Loads with **zero console errors** (a `KHR_parallel_shader_compile` warning appears on software GL only).
- [ ] Loading bar → title screen with slow aerial camera and a *"Press any key / button / Tap to start"* prompt matching the device.
- [ ] No WebGL 2 → readable "WebGL 2 unavailable" screen instead of a blank page.

### Input — keyboard + mouse
- [ ] Any key / click starts; the mouse is captured; `W A S D` + mouse look fly the camera.
- [ ] `Esc` / losing capture opens the menu; `Esc` again resumes. Clicking the canvas re-captures.
- [ ] Rebinding: click a slot → "Press a key…" → key assigned, saved across reload; stealing a key reports *"… is now unbound"*; `Esc` cancels **without** resuming; `Backspace` clears.
- [ ] Sprint/Crouch/Aim hold vs toggle modes behave as set.

### Input — gamepad
- [ ] Connect shows a toast; glyphs show Xbox (A/B/X/Y) or PlayStation (✕/○/□/△) names.
- [ ] Left stick moves, right stick looks, inside the dead zone nothing moves; dead zone/sensitivity sliders work.
- [ ] `Start` opens the menu; D-pad/left stick navigates; `A` activates; `B`/`Start` resumes; sliders adjust with left/right.
- [ ] Vibration toggle rumbles once when enabled.
- [ ] Pressing a key afterwards switches glyphs back to keyboard.

### Input — touch
- [ ] Tap starts; floating left stick moves; dragging the right side looks; both work simultaneously.
- [ ] Buttons respond to multi-touch; Sprint/Crouch latch (hold mode) and a very short tap still registers.
- [ ] *Menu → Touch → Edit layout*: buttons drag, positions persist, *Reset* restores defaults.
- [ ] Gyro aim (needs a physical device; sign conventions are **unverified on hardware**).

### Settings & quality
- [ ] Preset switching applies live (shadows, draw distance, building count); AA note appears when it needs a reload.
- [ ] Resolution scale, dynamic resolution, FOV, FPS counter apply immediately and persist after reload.
- [ ] Reduce motion removes UI animation; text size scales the UI; colour-blind accent swaps the accent colour.
- [ ] Input test tab shows live sticks, buttons, keys, touch pointers.

### Robustness
- [ ] Tab hidden while playing → pauses. Window resize keeps aspect and the canvas sharp.
- [ ] WebGL context lost → overlay → restores (Chrome: `chrome://gpu` or the `WEBGL_lose_context` extension).

### Performance (hardware pass — still to do)
- [ ] Medium preset holds 60 FPS on an integrated GPU; note FPS / 1% low in `docs/PERFORMANCE.md`.

## Phase 2 — Core look

Use **Esc → Environment** (or `?time=…&weather=…&speed=0`) and test at least *Medium* and *High*.

### Sky and time of day
- [ ] 18:40 shows a golden-hour sunset over the sea: orange horizon band, lit clouds, sun disc/glare, long shadows.
- [ ] Scrubbing the time slider 0 → 24 moves sun and moon smoothly; no pops in lighting, fog colour or shadows.
- [ ] Night: stars + Milky Way, a lit moon with a phase, lit windows and streetlights with light pools, blue moonlight shadows.
- [ ] Dawn (~06:00) mirrors dusk. Distant terrain fades into the *sky's* colour at every hour (no grey/white fog band).
- [ ] *Normal* speed: a full day takes ~48 minutes; *Paused* freezes time.

### Weather
- [ ] Each of the 8 types blends in over ~14 s (instant with `?weather=`): sky, fog, light, saturation all change together.
- [ ] Rain: streaks follow the camera, roads darken and gain puddles/reflections, sea gets rougher. Storm adds lightning (flash + bolt; *Strike* button fires one).
- [ ] Snow and dust particles are visible and readable; fog limits visibility but the sky stays continuous.
- [ ] Returning to *Clear* dries the roads gradually.

### Rendering and quality
- [ ] Low: no post chain except the final grade; Medium adds 2 cascades, bloom, SMAA; High adds MSAA ×4, GTAO, 3 cascades; Ultra 4 cascades.
- [ ] Switching presets live rebuilds shadows/post without errors or a black frame.
- [ ] Shadow acne / peter-panning is not visible on facades or terrain.
- [ ] GTAO does not darken the sky, sea or particles.
- [ ] Film grain is subtle and never leaves black or white speckles (regression: HDR luma bug).
- [ ] Lens flare appears only when the sun is on screen and unobstructed; fades behind buildings, hills and thick cloud.
- [ ] Dynamic resolution resizes the HDR targets without flicker.

### Hardware pass (still to do)
- [ ] Medium holds 60 FPS on an integrated GPU with `?weather=rain` at night (worst case).

## Phase 3 — Player on foot

### Movement
- [ ] Spawn on the beach range grounded (no fall/jump from the "press any key" press). Camera swoops in from the title shot with no hard cut.
- [ ] Walk ≈ 4.2 m/s, sprint ≈ 7 m/s draining stamina (bar under the crosshair), exhausted until it recovers; crouch ≈ 1.9 m/s and can't stand under a low ceiling.
- [ ] Jump has coyote time and a buffered press; landing dips the camera and plays a thud.
- [ ] Walls and buildings stop you at the capsule radius; slopes and small steps are climbed smoothly.
- [ ] Vault a ≤ 1.3 m thin obstacle (crate pyramid / table) and climb a ≤ 2.3 m ledge; prompt "Vault"/"Climb" shows with the right glyph; > 2.4 m shows nothing.
- [ ] Walk into the sea: you float at the surface, `C` dives, `Space` surfaces, no weapon use while swimming.
- [ ] Very short key taps (< 1 frame) still register on keyboard and touch.

### First-person body and weapon
- [ ] Both hands and sleeved arms are visible; hands sit correctly on the pistol grip (strong hand on the grip, support hand cupping it).
- [ ] Draw and holster are smooth; holstered hands rest low at the bottom of the screen.
- [ ] Hip → ADS blends smoothly; sights line up; FOV narrows slightly; look sensitivity drops while aiming.
- [ ] Sprint lowers the gun and you can't fire until it is raised; reload / inspect play the full hand choreography (mag out, drop, grab, insert, slide release).
- [ ] Climbing and vaulting show the hands reaching for the ledge.
- [ ] Gun is lit by the sun/moon and sits in shadow when you stand in shadow.

### Shooting
- [ ] 13 rounds (12 + 1 chambered); tactical reload tops up to 13, empty reload to 12; dry-fire clicks then starts a reload; slide locks back when empty.
- [ ] Recoil climbs with a slight sideways drift and partly recovers; crosshair gap widens with movement / bloom and closes when aimed.
- [ ] Impacts differ by material: concrete (dust + sparks), glass (crack decal + shards), wood (splinters), metal (sparks + ping), dirt/sand (puff + scorch), water (splash).
- [ ] Crates, barrels and cans react physically; steel plates swing on their hinges and ring; hit marker flashes on props.
- [ ] Brass ejects and bounces with a tinkle; the dropped magazine falls to the ground.
- [ ] Gunshot reverb is airy in the open and tighter between buildings.

### Audio and settings
- [ ] Sound starts after the first key press/click (browser autoplay rule); Esc pauses audio; Audio tab master volume works.
- [ ] Gamepad: rumble on shots; menu navigation unchanged. Touch: Arms button draws/holsters.
