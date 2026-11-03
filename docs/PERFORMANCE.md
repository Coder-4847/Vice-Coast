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

## Measured (Phase 1, headless Chromium + SwiftShader software GL — not representative of real GPUs)

| Preset | Draw calls | Triangles |
| --- | --- | --- |
| Low (400 buildings, no shadows) | 3 | ~7 k |

**Not yet verified:** the 60 FPS target on real integrated/discrete GPUs. That needs a hardware test pass; run the
game with the FPS counter on and note the numbers here.

## Rules for new content

- Prefer instancing/batching; budget draw calls per district.
- No allocation in per-frame code (pool vectors, bullets, particles, pedestrians, cars).
- Compile shaders during loading (`renderer.compileAsync`), never on first use.
- Texture memory: KTX2/Basis; geometry: Meshopt/Draco; initial download target ≲ 60 MB.
