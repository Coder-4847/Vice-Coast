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

## Deferred from the master prompt (not silently dropped)

- **Temporal anti-aliasing** and **motion blur** need a velocity buffer; both are still pending — vehicles now exist, so they move to Phase 14
  polish (a velocity buffer is the prerequisite). MSAA ×4 (High/Ultra) and SMAA (Medium/Ultra) cover AA until then.
- **Screen-space reflections** on wet roads / car paint: wet roads currently reflect the live sky via image-based lighting.
  SSR waits for Phase 4–5, when there are cars and neon to reflect.
- **Depth of field** belongs to cutscenes and photo mode (Phases 11 and 14). **God rays** and **heat haze** come with the
  mountain and desert biomes (Phase 8). **Windshield rain and wipers** come with vehicles (Phase 4).

## Rules for new content

- Prefer instancing/batching; budget draw calls per district.
- No allocation in per-frame code (pool vectors, bullets, particles, pedestrians, cars).
- Compile shaders during loading (`renderer.compileAsync`), never on first use.
- Texture memory: KTX2/Basis; geometry: Meshopt/Draco; initial download target ≲ 60 MB.
