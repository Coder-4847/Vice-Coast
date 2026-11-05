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


## Phase 4 — Vehicles

### Getting in and out
- [ ] Vehicle lot at ~(168, 0) on the beach holds Pico, Marlow, Barrage, Veloce, Ridgeback and the Sparrow bike.
- [ ] Walking within ~3.4 m of a vehicle's driver door shows "Enter <name>" with the right glyph for the active device.
- [ ] Pressing interact: you turn to the door, the door swings open, you slide in, the camera glides to the chase view with no hard cut (and the hands leave the screen).
- [ ] Exit below ~40 km/h: door opens, you step out beside it, the camera glides back into your eyes. Above that: "Slow down to get out".
- [ ] A vehicle you leave holds still on its handbrake; other vehicles are silent and parked.

### Driving feel
- [ ] Every car accelerates, brakes and steers with a believable weight shift (nose dips under braking, squat on throttle, body roll in corners).
- [ ] RWD cars (Marlow, Barrage, Veloce) power-slide when you stab the throttle in a corner; Pico understeers gently; Ridgeback (AWD) is planted.
- [ ] Handbrake + steering starts a drift; counter-steer assist keeps it controllable; releasing grips up again.
- [ ] Veloce is fast (~325 km/h) and stays pinned thanks to downforce; the bike leans into corners and is steady straight.
- [ ] Gears shift automatically with a short torque cut; hitting the limiter is audible; reversing works by holding the brake when stopped.
- [ ] Running into things bumps the body and plays an impact thud; driving off a kerb or small jump lands softly (no spinning, no launch).

### Camera
- [ ] Chase camera follows with smooth lag, swings toward velocity in drifts, widens FOV with speed, shakes slightly at top speed, and never clips into terrain/buildings.
- [ ] `V` cycles chase → close → hood → cinematic; look-behind (`C`) flips the view; moving the mouse / right stick orbits and then recentres.
- [ ] Hands rest on the steering wheel and turn with it; the bike rider leans with the bike.

### Audio, HUD, input
- [ ] Engine pitch follows RPM, with shift blips; tyres squeal while sliding; wind rises with speed; horn on `H`; sound stops when you get out.
- [ ] Speedometer shows km/h, gear, RPM bar and vehicle name.
- [ ] Gamepad: triggers are analogue throttle/brake; rumble on impact. Touch: driving layout (gas, brake, drift, exit, cam, look back, horn, lights) replaces the foot buttons while in a vehicle.


## Phase 5 — Port Valeria, streaming and maps

### The city
- [ ] From the beach the skyline shows downtown towers over a low seaside strip; walking east, buildings gain detail with no visible pop-in at the edge of the streaming radius.
- [ ] Streets have lane paint (double yellow on avenues, dashed on streets), zebra crossings at every junction, kerbs and sidewalks; markings fade out with distance (no shimmer).
- [ ] Districts read differently: glass towers + plazas (Valeria Core), brick/stone mid-rise (Midtown), pastel hotels + neon + palms (Seaside), yards and trees (Orchard Row), warehouses, containers, tanks and chimneys (Rustwater).
- [ ] Landmarks: Valeria Arena (stadium with floodlights), St. Aurelia Medical Center (red cross, helipad), Valeria PD HQ (blue strip, mast), Galleria Costa (mall + car park), Seaside Pier + Sunwheel Ferris wheel (turns, lit at night), Crestview Hills villas on a spiral road.
- [ ] At night windows, shopfronts, neon, streetlights (with light pools) and traffic signals (cycling red/amber/green) are lit; rain darkens and glosses the roads.
- [ ] Buildings, lamp posts and tree trunks are solid for the player and vehicles; bullets spark on concrete and glass differently.

### Streaming
- [ ] Driving the length of Valeria Avenue at speed shows no hitch when chunks load (FPS panel: draws, tris, 1 % low stay flat); loading is one chunk per frame, colliders trickle in over a few frames.
- [ ] Far buildings beyond the radius still show as a simple skyline and are swapped for detailed ones as you approach.
- [ ] Changing the quality preset rebuilds the city without a reload.

### Map and minimap
- [ ] Minimap rotates with the heading, N marker stays north, zooms out when driving fast; district and street names update as you move.
- [ ] `M` opens the full map (mouse released, game paused); `M`/`Esc`/Close returns to the game; clicking sets a waypoint with a route and a light beam in the world; right-click clears; arriving clears it with a toast.
- [ ] Gamepad: `Back` opens, sticks pan, triggers zoom, `A` sets, `X` clears, `B` closes. Touch: Map button opens, drag pans, pinch zooms, tap sets.


## Phase 6 — NPCs and traffic

### Traffic
- [ ] Cars drive in their lanes (right-hand traffic), queue behind each other, and stop at red lights; heads on the signal poles match what the cars obey (green → amber → red cycle ≈ 32 s with an all-red gap).
- [ ] Cars turn left and right at junctions; left turns wait for oncoming traffic; nobody drives through you — they stop, then honk if you block a lane.
- [ ] Driving into a car wrecks it (it tumbles, hazard lights blink, it stays for ~2.5 min); a gentle tap just bumps you. Wrecks block their lane and traffic queues behind them.
- [ ] Rush hour (~08:00, ~17:30) is busier than the small hours; at night cars have headlight glow ahead of them and red tail lights.
- [ ] Sirens (police wail/yelp, ambulance hi-lo) are audible with a Doppler shift; traffic ahead of a siren pulls to the right and stops.
- [ ] Quality presets scale the traffic: Low 22 / Medium 36 / High 52 / Ultra 70 cars at peak.

### Pedestrians
- [ ] Crowds walk the sidewalks (peak around lunch and the evening commute, thin before dawn), wait at kerbs for the walk phase, cross on the zebras; cars stop for people in the crossing.
- [ ] Variety: commuters in suits downtown at rush hour, joggers on the seafront, hi-vis workers in Rustwater, tourists and kids at the beach, partygoers and the odd stumbling drunk downtown / Seaside at night.
- [ ] Gunshots make nearby people run and scream; farther away some stop and film you on their phones.
- [ ] A car hitting someone knocks them down (no gore) and alarms the others; three pistol hits put a pedestrian down; they disappear after ~45 s. There is no police response yet (Phase 7).
- [ ] People step aside when you walk into them and sprint out of the way of a car coming fast.

### Ambient events
- [ ] Every few minutes a crash happens somewhere out of sight (two wrecks, onlookers filming); police and an ambulance race there with sirens, park with lights flashing and leave later.
- [ ] A street musician plays (spatial guitar) to a small audience; a protest march with signs walks up and down a downtown sidewalk by day; on the beach there are sunbathers, strollers and joggers and seagulls wheel over the water with the odd cry.
- [ ] A city ambience bed (traffic rumble, crowd murmur) follows what is near you; the beach is quieter.


## Phase 7 — Combat and police

### Weapons and health
- [ ] Crates beside the spawn give the WASP-9, HAMMER-12 and FALCON AR-7 (+ammo), armour and a medkit; they reappear after ~75 s. A toast names each pickup.
- [ ] Hold `Tab` (pad: `LB`): the wheel opens, moving the mouse / right stick highlights a weapon, releasing equips it (holster → draw animation). `2`–`5` pick directly; on touch the Arms button cycles.
- [ ] SMG and rifle fire full-auto while held; pistol and shotgun are semi-auto; the shotgun fires 8 pellets and pumps after each shot; each gun has its own sound, recoil and reload. Headshots do ~2.6× damage.
- [ ] Armour bar (blue) drains before the health bar; health regenerates to 60 % after ~5 s without being hit; the screen flashes red when hurt; falls from a few metres hurt.
- [ ] Shooting a car damages it; at low health it smokes, then burns and explodes ~5 s after reaching zero (damaging anything nearby, including you if you are inside or close).
- [ ] Dying shows **WASTED** (grayscale, camera drops) then respawns you at the hospital with your cars restored; being arrested shows **BUSTED** and respawns you at police HQ with most reserve ammo gone.

### Wanted level
- [ ] Firing a gun near pedestrians, killing someone, running someone over or blowing something up raises a star only if it was witnessed (a nearby pedestrian or officer); out of sight it barely registers. The shooting range is exempt.
- [ ] Stars flash and a search bar runs down when no officer can see you; getting spotted resets it; at zero stars the units stand down, aircraft fly away, dispatch says the suspect was lost.
- [ ] Escalation matches the table in the README: 1★ patrol cars and pistol officers; 2★ roadblocks, spike strips (tyres burst: much less grip), shotguns; 3★ SWAT van + police helicopter with a searchlight; 4★ armoured truck, snipers with red laser, ramming; 5★ federal agents + strafing gunship; 6★ tanks (shells explode near you), APCs, attack helicopters with missiles, jet strikes, 4 helicopters at once.
- [ ] Standing still next to officers (≤ 3 stars) arrests you; at 4★+ they shoot to kill. Cars on the road ahead stop for officers; helicopters can be shot down (big wanted jump).
- [ ] Dispatch lines appear as subtitles (and are spoken where the browser supports speech synthesis) with a radio squelch.
