# Performance budgets

Target: **60 FPS on a mid-range laptop (integrated or entry-level GPU) at the Medium preset**, scaling up to Ultra.
Optimise for consistent frame time, not just a high average: watch **1% low** and **worst frame** in the FPS panel
(Settings → Graphics → FPS counter).

## Frame budget (16.6 ms at 60 Hz)

| Slice | Budget |
| --- | --- |
| Simulation (fixed 60 Hz step, may run 0–5×/frame) | ≤ 3 ms |
| Input, UI, audio | ≤ 1 ms |
| CPU render submission (draw calls, culling) | ≤ 4 ms |
| GPU (shadow + main + post) | ≤ 10 ms |

Later phases add per-system budgets here as they land (streaming, AI, traffic, physics).

## Mechanisms already in place (Phase 1)

- **Fixed timestep + render interpolation** — simulation is identical at 30/60/120/144 Hz; backlog is dropped after
  5 steps instead of spiralling.
- **Dynamic resolution** — `GameRenderer.govern()` lowers the render scale (down to 55%) when the 60-frame average
  exceeds 19.5 ms and creeps back up with exponential back-off, so it does not oscillate. Disabled below ~25 FPS
  (treated as a throttled/hidden tab, not a GPU limit) and via the settings toggle.
- **Quality presets** (`core/Quality.ts`): pixel-ratio cap, MSAA, shadows + map size, draw distance, instance budget.
  *Auto* picks from the GPU string, core count and device memory; software renderers and most integrated/mobile GPUs
  start on Low/Medium.
- **Instancing** — the placeholder city is one `InstancedMesh` (one draw call for every building).
- **Texel-snapped shadow frustum** — no shimmering and no per-frame shadow-map reallocation.
- **No per-frame allocation in input** — vectors are reused; look deltas are consumed into a caller-owned object.
- **UI motion is `transform`/`opacity` only**, and honours *Reduce motion*.

## Phase 2 additions

| Feature | Cost model | Per-preset scaling |
| --- | --- | --- |
| HDR scene target (RGBA16F) | 8 B/px read + write | resolution scale, dynamic resolution |
| MSAA on the scene target | ×4 colour/depth memory | High, Ultra |
| GTAO (+ normal/depth pre-pass) | scene drawn twice + 2 full-screen passes | High, Ultra |
| Bloom | mip chain at ½-res and below | Medium+ |
| SMAA | 3 full-screen passes on LDR | Medium, Ultra |
| Cascaded shadow maps | one extra scene draw **per cascade** | Low 0 · Medium 2 · High 3 · Ultra 4; 260–760 m |
| Sky dome (clouds, stars, moon) | fbm per sky pixel | 3–6 cloud octaves |
| Aerial-perspective fog | `skyRadiance()` per fragment on every world material | not scalable yet — see risk below |
| Environment (IBL) capture | PMREM from the live sky, every 1.2–4 s | 64–256 px cube |
| Weather particles | 100 % GPU-animated (no CPU per frame) | 1.8 k–14 k rain streaks |
| Procedural terrain | one draw call, 160–400 segments | segments |

Draw calls in the Phase 2 world: terrain 1, ocean 1, city 1 (instanced buildings) + 4 (lamp poles, heads, pools), sky 1,
weather ≤ 3, plus the shadow cascades and post passes. The FPS panel now reports the whole frame
(`renderer.info.autoReset = false`, reset once per frame).

### Known risks (no real-GPU data yet)

- **Per-fragment sky in the fog.** Every world material evaluates the Preetham sky function (an `acos`, 4 `pow`, a few `exp`)
  to colour its fog. That is what gives correct aerial perspective at all times of day, but it is the first thing to
  optimise if an integrated GPU misses budget: evaluate it per-vertex for the terrain, or bake a small sky-colour
  lookup (azimuth × elevation) once per frame into a texture.
- **GTAO and CSM both re-render the scene.** Fine for one instanced city; with Port Valeria's draw-call count they need
  a budget (shadow casters limited to the first cascades, AO pre-pass on a simplified layer).
- **Temporal anti-aliasing is not implemented** (see Deferred). MSAA + SMAA are used instead.

## Phase 3 additions

| Feature | Cost model |
| --- | --- |
| Rapier physics | separate 1.7 MB (gzip) chunk loaded behind the loading screen; one fixed step per frame; ~620 static box colliders + one 475×450 heightfield (≈1 s to sample at load); ~40 dynamic props |
| Viewmodel pass | a second scene render of only the viewmodel layer (≈25 small meshes) with a cleared depth buffer |
| Shadow maps | now rendered **once per frame** (`shadowMap.autoUpdate = false`, requested by the pipeline) and reused by the viewmodel pass and GTAO pre-pass; this also removed a hidden duplicate cascade render |
| Effects | preallocated pools: 320 particles (one `Points`), 5 decal `InstancedMesh`es × 48, 10 tracers, 32 brass; no allocation per frame except one `Vector3` per shot |
| Audio | all synthesis is on-demand `OscillatorNode`/`BufferSource` graphs per sound (a few nodes per shot) |
| Raycasts | bullets: 1 ray; ledge probe: ≤ 8 rays per fixed step while grounded; gunshot reverb probe: 9 rays per shot |



Headless Chromium on SwiftShader (CPU software GL) runs this world at only a few FPS. That is expected and says nothing about
real GPUs; use it only for correctness. **The 60 FPS target on integrated and discrete GPUs is still unverified** — run
the game with the FPS counter on (Esc → Graphics) and record numbers here:

| Hardware | Preset | FPS | 1 % low | Notes |
| --- | --- | --- | --- | --- |
| _to do_ | Medium | | | |

## Phase 4 cost notes

- Physics steps at 120 Hz (two substeps per 60 Hz tick). Each vehicle casts 4 wheel rays per substep (bike 2), only against
  world colliders. Only vehicles inside the driven vehicle's neighbourhood need to simulate — until Phase 6 traffic exists,
  all six lot vehicles step every tick (cheap, but a sleeping/LOD scheme is planned for streaming in Phase 5).
- Cars are ~25 draw calls each (body, glass, wheels, lights, interior). Phase 6 traffic will need instancing/LOD for distant cars.
- Vehicle audio is one oscillator-based voice (3 oscillators + 4 filtered noise sources); only the driven vehicle is audible.

## Phase 5 cost notes

- **Roads cost no geometry.** Two 4096×2 half-float textures (road distance fields along x and z) and one 1024² RGBA8 zone
  mask are sampled by the terrain shader, which paints asphalt, kerbs, sidewalks, lane paint, zebra crossings, parks, plazas,
  car parks and boardwalk planks. Paint fades out beyond ~260 m to avoid shimmer.
- **Buildings are instanced boxes** (plus cylinders for tanks, silos and the stadium's masts) in a few pooled `InstancedMesh`
  objects: one draw call per pool regardless of how many chunks are loaded. A building is 2–6 boxes (podium, tower, crown,
  roof clutter, neon sign). Facade windows, shopfronts, neon and stadium seating are all procedural in one fragment patch.
- **Streaming**: 256 m chunks, one load and one unload per frame, nearest first, 1 chunk of hysteresis. Radius by preset:
  Low 520 m, Medium 760 m, High 1000 m, Ultra 1300 m. Each frame does at most one heavy streaming step (a chunk load, an unload, or a
  slice of collider removal); colliders (≈ 250 per chunk: buildings, lamp posts, tree trunks) are created ≤ 120 per frame
  (≤ 40 on a frame that loaded a chunk). Measured on a slow CPU-only test box, driving the full length of Valeria Avenue
  (1.6 km in 30 s, up to 272 km/h, ~15 chunk loads): update cost avg 3.4 ms, p95 8.5 ms, p99 14.6 ms, worst chunk load 3.8 ms
  (it was 10 ms before the one-step-per-frame change). Real-GPU frame times are still unmeasured.
- **Far skyline**: every building outside the radius is kept in a separate pool (≈ 1–2 k boxes, no shadows), with tower tiers
  stretched to the ground so there are no gaps under podium roofs. It is swapped for the detailed version as a chunk loads.
- Typical loaded counts around downtown on Medium: ~2.3 k building boxes, ~4 k colliders, ~35–45 chunks. Streetlight pools
  are additive quads (night only). Tree crowns and props do not cast shadows.
- Not yet done: terrain is still one mesh with one heightfield collider (fine at 3.8 × 3.6 km; it must be chunked with LOD when
  the world grows to 10 × 10 km in Phase 8), and there is no occlusion culling.

## Phase 6 cost notes

- **Traffic**: up to 96 cars simulated at 60 Hz with an intelligent-driver-model controller over a lane graph (≈ 1.6 k lane
  segments). Cost is per-car O(neighbours): a sorted car list per lane, obstacle scans (player vehicles, wrecks, pedestrians
  on the road). Only cars within ~60 m of the player get a kinematic Rapier body (≈ 2–25 bodies); a hard hit converts the car to
  a dynamic wreck. Rendering is five instanced meshes (body, cabin, wheels, hubs, lights) + one for night headlight glow, all
  filled each frame: about 10 instances per car, **6 draw calls total** for all traffic regardless of count.
- **Pedestrians**: up to 170 simulated, each drawn as seven instanced parts (head, hair, torso, arms, legs, shoes,
  accessories): **7 draw calls total**, ≈ 11 matrices per person per frame written on the CPU. They follow a ~2.7 k-edge
  sidewalk graph (four corners per junction); no per-ped pathfinding beyond picking the next edge at a corner.
- **Presets** (peak, scaled by time of day): Low 22 cars / 45 peds, Medium 36 / 80, High 52 / 120, Ultra 70 / 160.
- Spawning happens out of sight (outside the view frustum, or beyond 130–240 m) at one car every 0.35 s and one pedestrian every
  0.12 s; despawn beyond ~235 m (peds) / ~380 m (cars). No allocation in the per-frame paths except small temporaries in the
  renderers (to be pooled in the polish phase).
- **Draw calls (Medium, downtown, all passes incl. 2 shadow cascades): ≈ 1.46 k, 635 k triangles.** Measured by hiding
  groups: traffic adds ~9, pedestrians ~22, gulls 0 (only near the coast), the whole city group ~37 and ~370 k triangles. The
  other ~1.4 k come from earlier phases' content (the six hero vehicle models, the shooting-range props, weather and post
  passes) drawn once per shadow cascade. This is the main FPS risk for integrated GPUs and is queued for Phase 14: merge each
  hero vehicle's meshes, stop casting shadows from distant props, and cull per cascade.
- Not done: LOD for distant pedestrians (all parts are drawn at any distance), skinned animation (limbs are rigid boxes
  rotated about hip/shoulder), and web-worker simulation.

## Phase 7 cost notes

- **Police units reuse existing systems**: patrol/SWAT/federal/armoured/APC/tank vehicles are traffic cars in pursuit mode (same
  six instanced draw calls, tanks and APCs add turret boxes), officers on foot are pedestrians with a combat AI (same seven draw
  calls; pool raised to 210), helicopters (≤ 4) and jets (≤ 2) are small plain meshes of a handful of boxes each, roadblocks are
  static kinematic cars, snipers' lasers one thin additive box each.
- **Per-frame cost** is dominated by line-of-sight rays: each officer re-checks every 0.22–0.4 s, plus a combined “is anybody
  seeing the player” pass every 0.3 s; a 6-star scene (≈ 15 unit vehicles, 13 officers, 4 helicopters) adds ~60 raycasts per
  second — negligible against the physics step.
- **Explosions** are ≈ 100 particles in the shared particle system; burning cars emit two puffs per 0.13 s.
- Weapons add three small procedural meshes (≈ 12 meshes each, hidden when not held) to the viewmodel pass.

## Phase 8 cost notes

- **Terrain** is now one instanced draw of at most ~60 visible 32×32-cell patches (frustum-culled each frame, six LOD rings),
  displaced in the vertex shader from a baked 1551 × 1951 R32F height texture (12 MB) with a mip-mapped normal texture (12 MB) and an
  8 m biome texture (3 MB). Triangle count is ≈ 0.12 M for the terrain at any camera position — comparable to the old 224-segment
  mesh but with 4 m detail near you and 8 km reach. The fragment shader gained a few noise taps; the desert, salt and cinder
  branches only run where those biomes are.
- **Bake**: ≈ 3 M height samples (+ normals, biomes) are computed by up to 4 workers during loading (a few seconds); the baked
  arrays are also the Rapier heightfield (12 MB) and the ground-query grid, so nothing is evaluated analytically at run time.
- **Streaming**: the same 256 m chunk pools as Port Valeria; towns add boxes/cylinders (Costa Merida ≈ 3 500 instances when fully
  loaded, Dusk Harbor ≈ 1 400), wilderness adds one merged-mesh pool per plant kind (pines 42 k, scrub 14 k, … ≈ 82 k capacity;
  about 8 draw calls). Dense pine forest at Medium (760 m streaming radius) is ≈ 25–35 k trees ≈ 0.8–1.0 M triangles; Low (520 m)
  roughly halves it. Trees only get colliders within 46 m of the player (≤ 28 created per update).
- **Draw calls** on Medium are ≈ 1.6 k in open country (the figure includes shadow cascades) versus ≈ 1.46 k in Port Valeria in
  Phase 7: +8 vegetation, +≈ 6 visible road meshes (the road network is split into ≈ 380 m sections and culled), +3 for animated
  things (blades, cabins, train, beacons share a few instanced meshes). The queued Phase 14 pass (merging static props, GPU culling of
  pools) is more important now.
- **Roads** are ribbon meshes (≈ 80 sections, ≈ 1.1 M vertices in total, culled), one material, no textures.
- **Traffic outside the city**: ≤ 16 highway cars at Medium using the same six instanced meshes as city traffic (cars carry their
  own ground height and pitch); police units that cannot reach the player over the city lanes come by road and then cross open
  ground, so there is a little extra AI cost only when wanted.
- **Audio**: one more noise bed (wind, rustle, surf) and a 4-oscillator cricket patch, only while outside the city.
- **Known risks**: no real-GPU measurements yet (all numbers are from headless SwiftShader runs); AO (High/Ultra) skips the terrain
  because its depth is displaced in the shader; very dense forests on Ultra (1 000 m radius) are the most likely frame-time spike.

## Deferred from the master prompt (not silently dropped)

- **Temporal anti-aliasing** and **motion blur** need a velocity buffer; both are still pending — vehicles now exist, so they move to Phase 14
  polish (a velocity buffer is the prerequisite). MSAA ×4 (High/Ultra) and SMAA (Medium/Ultra) cover AA until then.
- **Screen-space reflections** on wet roads / car paint: wet roads currently reflect the live sky via image-based lighting.
  SSR waits for Phase 4–5, when there are cars and neon to reflect.
- **Depth of field** belongs to cutscenes and photo mode (Phases 11 and 14). **God rays** and **heat haze** were planned for the
  mountain and desert biomes but are not in Phase 8 either; they join the Phase 14 post-processing pass. **Windshield rain and wipers** come with vehicles (Phase 4).

## Rules for new content

- Prefer instancing/batching; budget draw calls per district.
- No allocation in per-frame code (pool vectors, bullets, particles, pedestrians, cars).
- Compile shaders during loading (`renderer.compileAsync`), never on first use.
- Texture memory: KTX2/Basis; geometry: Meshopt/Draco; initial download target ≲ 60 MB.

## Phase 9 notes

- Each craft is two merged meshes (body + glass, plus a lights mesh where needed) and a handful of small animated meshes (rotor,
  tail rotor, propeller, gear, turret + gun). ~50 craft are spawned; only those within ~1.8 km are visible and only those within
  300 m of the player (or occupied) have an enabled physics body, so the cost is a few force models per frame.
- The airport, island and fort add three more streamed chunk sources and ~50 m² of runway/taxiway ribbon geometry; the fort and
  island are far from the other biomes so their chunks are only loaded when the player is nearby.
- The parachute is one 240-triangle mesh; free-fall has no extra geometry. The map's base texture is a little larger now that it
  covers the island (6300 × 7800 m at 8 m per pixel).
- Headless SwiftShader captures of large viewports (≥ 960 × 540) used for QA can run out of memory when thousands of updates are
  stepped in one task; the game itself is stable in a normal frame loop (checked for a minute outside the city).
