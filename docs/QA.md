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
