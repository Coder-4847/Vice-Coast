import * as THREE from 'three';
import { easeInOutCubic } from './core/math';
import { GameLoop } from './core/GameLoop';
import { GameRenderer } from './core/GameRenderer';
import { detectPreset, PRESETS, type GpuInfo, type PresetName, type QualityPreset } from './core/Quality';
import { Settings } from './core/Settings';
import { InputManager } from './input/InputManager';
import { TouchControls } from './input/TouchControls';
import { UI } from './ui/UI';
import { FlyCamera } from './world/FlyCamera';
import { TestWorld } from './world/TestWorld';

export type GameState = 'loading' | 'title' | 'playing' | 'paused';

const TITLE_FOV = 50;

/** Phase 1 application shell: owns the systems and the title → play → pause state machine. */
export class Game {
  state: GameState = 'loading';

  readonly settings = new Settings();
  readonly input: InputManager;
  readonly gfx: GameRenderer;
  readonly world: TestWorld;
  readonly ui: UI;
  readonly touch: TouchControls;
  readonly loop: GameLoop;

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly fly = new FlyCamera();
  private readonly autoPreset: PresetName;
  private titleT = 0;
  private fovFrom = TITLE_FOV;
  private fovT = 1;
  private editingTouch = false;

  constructor(gpu: GpuInfo) {
    const root = document.getElementById('ui')!;
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.autoPreset = detectPreset(gpu);

    const preset = this.resolvePreset();
    this.gfx = new GameRenderer(this.canvas, preset, {
      onContextLost: () => this.ui.showOverlay('Graphics context lost', 'The browser reset the GPU. Restoring…', 'ctx'),
      onContextRestored: () => {
        this.ui.hideOverlay('ctx');
        this.ui.toast('Graphics restored');
      },
    });
    this.gfx.userScale = this.settings.data.graphics.resolutionScale;
    this.gfx.resize(true);

    this.camera = new THREE.PerspectiveCamera(TITLE_FOV, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.world = new TestWorld(preset);
    this.input = new InputManager(this.settings, this.canvas);
    this.touch = new TouchControls(root, this.input, this.settings);

    // Must be registered before the UI so menu widgets re-sync against the already-applied state.
    this.settings.on('change', () => this.applySettings());

    this.ui = new UI(root, this.settings, this.input, this.gfx, {
      resume: () => this.resume(),
      editTouchLayout: () => this.beginTouchEdit(),
      resetTouchLayout: () => this.touch.resetLayout(),
      finishTouchLayout: () => this.endTouchEdit(),
      setGyro: (on) => this.touch.setGyro(on),
      autoPreset: () => this.autoPreset,
    });

    this.loop = new GameLoop({
      begin: (dt) => this.input.beginFrame(dt),
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt, alpha) => this.update(dt, alpha),
      render: () => this.gfx.render(this.world.scene, this.camera),
    });

    this.bindEvents();
  }

  /** Compile shaders behind the loading screen, then reveal the title. */
  async init(): Promise<void> {
    this.ui.setProgress(0.25);
    this.placeTitleCamera(0);
    this.world.update(this.camera);
    this.ui.setProgress(0.5);
    try {
      await this.gfx.renderer.compileAsync(this.world.scene, this.camera);
    } catch {
      /* compileAsync is an optimisation; first render will compile instead */
    }
    this.ui.setProgress(0.85);
    this.gfx.render(this.world.scene, this.camera); // warm GPU state before the reveal
    this.ui.setProgress(1);
    this.loop.start();
    await new Promise((r) => setTimeout(r, 350));
    this.state = 'title';
    this.ui.hideLoading();
    this.ui.showTitle();
  }

  // ------------------------------------------------------------------ loop

  private fixedUpdate(dt: number): void {
    if (this.state === 'playing') this.fly.fixedUpdate(dt, this.input);
  }

  private update(dt: number, alpha: number): void {
    const input = this.input;

    switch (this.state) {
      case 'loading':
      case 'title':
        this.titleT += dt;
        this.placeTitleCamera(this.titleT);
        break;
      case 'playing':
        this.fly.update(alpha, input, this.camera);
        if (input.pressed('pause')) this.pause();
        this.ui.setCaptureHint(input.activeDevice === 'kbm' && !input.pointerLocked && !this.editingTouch);
        break;
      case 'paused':
        this.updateMenuInput();
        this.ui.menu.tick();
        break;
    }

    this.updateFov(dt);
    this.world.update(this.camera);
    this.gfx.govern(
      this.loop.recentAverage(60), dt,
      this.settings.data.graphics.dynamicResolution && !document.hidden,
      this.loop.sampleCount,
    );
    this.ui.updateStats(dt, this.loop.stats, this.gfx, this.gfx.renderer.info.render);
  }

  /** Gamepad / keyboard navigation of the pause menu. */
  private updateMenuInput(): void {
    if (this.editingTouch) return;
    const n = this.input.nav;
    const menu = this.ui.menu;
    if (this.input.capturing) return;
    if (n.x || n.y) menu.nav.move(n.x, n.y);
    if (n.confirm) menu.nav.confirm();
    if (n.back || n.start) this.resume();
  }

  private placeTitleCamera(t: number): void {
    const a = 0.7 + t * 0.045;
    const r = 430;
    this.camera.position.set(Math.cos(a) * r, 150 + Math.sin(t * 0.12) * 10, Math.sin(a) * r);
    this.camera.lookAt(0, 55, 0);
    this.camera.updateMatrixWorld();
  }

  private updateFov(dt: number): void {
    const target = this.state === 'title' || this.state === 'loading' ? TITLE_FOV : this.settings.data.graphics.fov;
    if (this.fovT < 1) {
      this.fovT = Math.min(1, this.fovT + dt / (this.settings.data.accessibility.reduceMotion ? 0.01 : 1.6));
      this.camera.fov = this.fovFrom + (target - this.fovFrom) * easeInOutCubic(this.fovT);
    } else {
      this.camera.fov = target;
    }
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- state changes

  startPlaying(): void {
    if (this.state !== 'title') return;
    // The fly camera adopts the title shot's exact pose: the hand-off is a continuous move, not a cut.
    this.fly.setFromCamera(this.camera);
    this.fovFrom = this.camera.fov;
    this.fovT = 0;
    this.state = 'playing';
    this.input.gameplayEnabled = true;
    this.ui.hideTitle();
    this.ui.showHud();
    this.touch.setActive(true);
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.gameplayEnabled = false;
    this.loop.paused = true;
    this.touch.setActive(false);
    this.ui.setCaptureHint(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.menu.open();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (this.editingTouch) return;
    this.state = 'playing';
    this.ui.menu.close();
    this.loop.paused = false;
    this.input.gameplayEnabled = true;
    this.touch.setActive(true);
    this.ui.dismissHints();
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  private beginTouchEdit(): void {
    this.editingTouch = true;
    this.ui.menu.close();
    this.touch.setEditing(true);
    this.ui.setEditBar(true);
  }

  private endTouchEdit(): void {
    this.editingTouch = false;
    this.touch.setEditing(false);
    this.ui.setEditBar(false);
    this.ui.menu.open();
  }

  private async lockPointer(): Promise<void> {
    if (document.pointerLockElement === this.canvas) return;
    try {
      // Raw (unadjusted) movement avoids OS mouse acceleration; fall back where unsupported.
      await (this.canvas.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | void);
    } catch {
      try {
        await (this.canvas.requestPointerLock() as Promise<void> | void);
      } catch {
        /* user must click the canvas; the capture hint explains this */
      }
    }
  }

  // ---------------------------------------------------------------- settings

  private resolvePreset(): QualityPreset {
    const p = this.settings.data.graphics.preset;
    return PRESETS[p === 'auto' ? this.autoPreset : p];
  }

  private applySettings(): void {
    const preset = this.resolvePreset();
    if (preset.name !== this.gfx.preset.name) {
      this.gfx.applyQuality(preset);
      this.world.applyQuality(preset);
    }
    if (this.gfx.userScale !== this.settings.data.graphics.resolutionScale) {
      this.gfx.userScale = this.settings.data.graphics.resolutionScale;
      this.gfx.resize();
    }
    if (this.state !== 'title' && this.state !== 'loading') {
      this.fovFrom = this.camera.fov;
      this.fovT = 1;
    }
    const wantGyro = this.settings.data.controls.gyro;
    if (this.touch.gyroActive !== wantGyro) void this.touch.setGyro(wantGyro);
  }

  // ------------------------------------------------------------------ events

  private bindEvents(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    // "Press any key" on the title screen, from any device.
    this.input.on('anyinput', () => {
      if (this.state === 'title') this.startPlaying();
    });
    this.input.on('device', () => this.ui.refreshPrompts());
    this.input.on('gamepad', () => this.ui.refreshPrompts());

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || e.repeat) return;
      if (this.input.capturing) return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });

    // The browser releases the pointer on Esc; treat any loss of capture while playing as "pause".
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && this.input.activeDevice === 'kbm') this.pause();
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && this.state === 'playing' && !document.pointerLockElement) void this.lockPointer();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }
}
