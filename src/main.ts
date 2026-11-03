import * as THREE from 'three';
import { GameLoop } from './core/GameLoop';
import { Settings } from './core/Settings';
import { DynamicResolution, PRESETS, detectQuality, type QualityPreset } from './core/Quality';
import { InputManager, type Device } from './input/InputManager';
import { TestWorld } from './world/TestWorld';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function fatal(msg: string): void {
  const el = $('fatal');
  el.innerHTML = `<h2>Vice Coast</h2><div>${msg}</div>`;
  el.hidden = false;
}

function boot(): void {
  const canvas = $<HTMLCanvasElement>('game');
  const settings = new Settings();

  // Probe WebGL2 first so unsupported browsers get a clear message.
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    fatal('This game needs WebGL2. Please use a recent version of Chrome, Edge, Firefox or Safari.');
    return;
  }
  const detected = detectQuality(probe);

  let preset: QualityPreset = PRESETS[settings.data.quality === 'auto' ? detected : settings.data.quality];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: preset.antialias, powerPreference: 'high-performance' });
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const world = new TestWorld();
  const input = new InputManager(canvas, $('touch'));
  const dynRes = new DynamicResolution();

  // ---- sizing -------------------------------------------------------------
  const resize = (): void => {
    const pr = Math.min(devicePixelRatio, preset.maxPixelRatio) * settings.data.resolutionScale * dynRes.scale;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    world.resize(innerWidth / innerHeight);
  };
  addEventListener('resize', resize);

  const applyPreset = (): void => {
    preset = PRESETS[settings.data.quality === 'auto' ? detected : settings.data.quality];
    renderer.shadowMap.enabled = preset.shadows;
    world.applyQuality(preset.shadows, preset.shadowMapSize, preset.viewDistance);
    resize();
  };
  applyPreset();

  // ---- context loss -------------------------------------------------------
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    loop.stop();
    fatal('The graphics context was lost. It will try to recover automatically.');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    $('fatal').hidden = true;
    applyPreset();
    loop.start();
  });

  // ---- HUD ----------------------------------------------------------------
  const fpsEl = $('fps');
  const deviceEl = $('device');
  const hintEl = $('hint');
  const HINTS: Record<Device, string> = {
    keyboard: 'WASD move · Mouse look · Shift sprint · Space jump · Esc settings',
    gamepad: 'Left stick move · Right stick look · L3 sprint · A jump · Start settings',
    touch: 'Left stick move · Right stick look',
  };
  const showDevice = (d: Device): void => {
    deviceEl.textContent = d === 'keyboard' ? 'Keyboard + mouse' : d === 'gamepad' ? 'Controller' : 'Touch';
    hintEl.textContent = HINTS[d];
    document.body.dataset.device = d;
  };
  input.onDeviceChange = showDevice;
  showDevice(input.device);

  fpsEl.hidden = !settings.data.showFps;
  settings.onChange((s) => {
    fpsEl.hidden = !s.showFps;
    applyPreset();
  });

  // ---- settings panel -----------------------------------------------------
  const panel = $('settings');
  const q = $<HTMLSelectElement>('set-quality');
  const sc = $<HTMLInputElement>('set-scale');
  const se = $<HTMLInputElement>('set-sens');
  const fp = $<HTMLInputElement>('set-fps');
  const rm = $<HTMLInputElement>('set-reduce');
  q.value = settings.data.quality;
  sc.value = String(settings.data.resolutionScale);
  se.value = String(settings.data.mouseSensitivity);
  fp.checked = settings.data.showFps;
  rm.checked = settings.data.reduceMotion;
  const syncLabels = (): void => {
    $('set-scale-val').textContent = `${Math.round(settings.data.resolutionScale * 100)}%`;
    $('set-sens-val').textContent = settings.data.mouseSensitivity.toFixed(1);
  };
  syncLabels();
  q.onchange = () => settings.set('quality', q.value as typeof settings.data.quality);
  sc.oninput = () => { settings.set('resolutionScale', Number(sc.value)); syncLabels(); };
  se.oninput = () => { settings.set('mouseSensitivity', Number(se.value)); syncLabels(); };
  fp.onchange = () => settings.set('showFps', fp.checked);
  rm.onchange = () => settings.set('reduceMotion', rm.checked);
  const toggleSettings = (open: boolean): void => {
    panel.hidden = !open;
    if (open && document.pointerLockElement) document.exitPointerLock();
  };
  $('set-close').onclick = () => toggleSettings(false);
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') toggleSettings(panel.hidden === true);
    if (e.code === 'F3') { e.preventDefault(); fp.checked = !fp.checked; settings.set('showFps', fp.checked); }
  });

  // ---- main loop ----------------------------------------------------------
  let fpsAcc = 0;
  let fpsFrames = 0;
  let startPressed = false;

  const loop = new GameLoop(
    (step) => {
      if (!panel.hidden) return;
      world.update(step, input.state, settings.data.mouseSensitivity);
    },
    (alpha, frameDt) => {
      const st = input.poll(frameDt);
      // Gamepad Start toggles settings.
      const pad = Array.from(navigator.getGamepads()).find((p): p is Gamepad => !!p);
      const start = !!pad?.buttons[9]?.pressed;
      if (start && !startPressed) toggleSettings(panel.hidden === true);
      startPressed = start;
      void st;

      world.render(alpha);
      renderer.render(world.scene, world.camera);

      fpsAcc += frameDt;
      fpsFrames++;
      if (fpsAcc >= 0.5) {
        if (!fpsEl.hidden) fpsEl.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${preset.name} · ${Math.round(dynRes.scale * 100)}%`;
        fpsAcc = 0;
        fpsFrames = 0;
      }
      if (dynRes.update(frameDt * 1000)) resize();
    },
  );
  loop.start();

  // Test hook for automated checks.
  (window as unknown as { __vc: unknown }).__vc = { input, settings, get preset() { return preset; }, renderer };
}

try {
  boot();
} catch (err) {
  console.error(err);
  fatal('Something went wrong while starting the game. Check the console for details.');
}
