import { bakeBand } from './terrainBake';

self.onmessage = (e: MessageEvent<{ r0: number; r1: number }>) => {
  const band = bakeBand(e.data.r0, e.data.r1);
  (self as unknown as Worker).postMessage(band, [band.heights.buffer, band.normals.buffer, band.surf.buffer]);
};
