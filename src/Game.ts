import * as THREE from 'three';
import { easeInOutCubic } from './core/math';
import { GameLoop } from './core/GameLoop';
import { GameRenderer } from './core/GameRenderer';
import { detectPreset, PRESETS, type GpuInfo, type PresetName, type QualityPreset } from './core/Quality';
import { Settings } from './core/Settings';
import { InputManager } from './input/InputManager';
import { TouchControls } from './input/TouchControls';
import { UI } from './ui/UI';
import { MapUI } from './ui/MapUI';
import { AudioEngine } from './audio/AudioEngine';
import { Physics } from './physics/Physics';
import { Player } from './player/Player';
import { Viewmodel } from './player/Viewmodel';
import { WeaponSystem } from './player/WeaponSystem';
import { Effects } from './world/Effects';
import { VehicleManager } from './vehicles/VehicleManager';
import { Vehicle } from './vehicles/Vehicle';
import { Driving } from './vehicles/Driving';
import { Npcs } from './npc/Npcs';
import { Combat } from './combat/Combat';
import { Police } from './combat/Police';
import { Wanted } from './combat/Wanted';
import { Heli } from './combat/Aircraft';
import { CombatHud } from './ui/CombatHud';
import { World } from './world/World';
import { WEATHER_TYPES, type WeatherType } from './world/Weather';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'map';

const TITLE_FOV = 50;

/** Phase 1 application shell: owns the systems and the title → play → pause state machine. */
export class Game {
  state: GameState = 'loading';

  readonly settings = new Settings();
  readonly input: InputManager;
  readonly gfx: GameRenderer;
  readonly world: World;
  readonly ui: UI;
  readonly touch: TouchControls;
  map!: MapUI;
  readonly loop: GameLoop;

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.PerspectiveCamera;
  physics: Physics | null = null;
  readonly audio = new AudioEngine();
  player: Player | null = null;
  weapon: WeaponSystem | null = null;
  viewmodel: Viewmodel | null = null;
  effects: Effects | null = null;
  vehicles: VehicleManager | null = null;
  driving: Driving | null = null;
  npcs: Npcs | null = null;
  combat: Combat | null = null;
  wanted: Wanted | null = null;
  police: Police | null = null;
  combatHud: CombatHud | null = null;
  private carSound: ReturnType<AudioEngine['createVehicleSound']> = null;
  private baseFov = 75;
  /** 0 → 1 camera swoop from the title shot into the player's eyes. */
  private intro = 1;
  private readonly introFromPos = new THREE.Vector3();
  private readonly introFromQuat = new THREE.Quaternion();
  private readonly introTmpQuat = new THREE.Quaternion();
  private readonly autoPreset: PresetName;
  private titleT = 0;
  private fovFrom = TITLE_FOV;
  private fovT = 1;
  private editingTouch = false;
  private timeFrozen = false;
  private readonly mapFwd = new THREE.Vector3();
  private lastDt = 1 / 60;

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

    this.camera = new THREE.PerspectiveCamera(TITLE_FOV, window.innerWidth / window.innerHeight, 0.25, 6000);
    this.world = new World(this.gfx, this.camera, preset);
    this.applyUrlParams();
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
      env: {
        hour: () => this.world.tod.hour,
        setHour: (h) => this.world.setHour(h),
        clock: () => this.world.tod.clock,
        speed: () => (this.world.tod.paused ? 0 : this.world.tod.speed),
        setSpeed: (v) => {
          this.timeFrozen = v === 0;
          if (v > 0) this.world.tod.speed = v;
        },
        weather: () => this.world.weather.type,
        setWeather: (t) => this.world.setWeather(t),
        strike: () => this.world.weather.strike(this.camera),
      },
    });

    this.map = new MapUI(root, this.ui.hudRoot, this.world.city.plan, {
      toast: (m) => this.ui.toast(m),
      device: () => this.input.activeDevice,
      close: () => this.closeMap(),
    });
    this.map.onWaypoint = (wp) => {
      if (wp) this.world.beacon.set(wp.x, wp.z);
      else this.world.beacon.clear();
      this.ui.toast(wp ? 'Waypoint set' : 'Waypoint cleared');
    };

    this.loop = new GameLoop({
      begin: (dt) => this.input.beginFrame(dt),
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt, alpha) => this.update(dt, alpha),
      render: () => this.renderFrame(),
    });

    this.audio.volume = this.settings.data.audio.master;
    this.bindEvents();
  }

  /** Compile shaders behind the loading screen, then reveal the title. */
  async init(): Promise<void> {
    this.ui.setProgress(0.1);
    this.physics = await Physics.create();
    this.world.attachPhysics(this.physics);
    this.player = new Player(this.physics, this.input, this.audio);
    this.player.teleport(100, 0, -Math.PI / 2);
    this.setupWeapon();
    this.setupVehicles();
    this.npcs = new Npcs(this.world, this.physics, this.audio, this.resolvePreset());
    if (this.weapon) this.weapon.npc = this.npcs;
    this.combatHud = new CombatHud(document.getElementById('ui')!, this.ui.hudRoot);
    if (this.weapon && this.effects && this.driving && this.vehicles && this.player) {
      this.combat = new Combat({
        world: this.world, physics: this.physics, audio: this.audio, effects: this.effects, player: this.player,
        driving: this.driving, vehicles: this.vehicles, npcs: this.npcs, weapon: this.weapon, hud: this.combatHud,
        canvas: this.canvas, camera: this.camera, toast: (m) => this.ui.toast(m),
      });
      this.weapon.onColliderHit = (h, d) => this.combat!.hitCollider(h, d);
      this.wanted = new Wanted();
      this.police = new Police({
        world: this.world, physics: this.physics, audio: this.audio, effects: this.effects, player: this.player,
        driving: this.driving, vehicles: this.vehicles, npcs: this.npcs, combat: this.combat, wanted: this.wanted,
        hud: this.combatHud, camera: this.camera,
      });
      const pol = this.police;
      this.npcs.extraRay = (ox, oy, oz, dx, dy, dz, max) => { const h = pol.rayHit(ox, oy, oz, dx, dy, dz, max); return h ? { t: h.t, target: h.heli } : null; };
      this.npcs.extraHurt = (t, dmg) => {
        if (t instanceof Heli) { pol.hurtHeli(t, dmg); return true; }
        return false;
      };
      this.npcs.onGunshot = (x, z) => this.combat?.crime?.(2.5, x, z);
    }
    this.ui.setProgress(0.2);
    this.placeTitleCamera(0);
    this.world.update(0, false);
    this.ui.setProgress(0.4);
    try {
      await this.gfx.renderer.compileAsync(this.world.scene, this.camera);
    } catch {
      /* compileAsync is an optimisation; first render will compile instead */
    }
    this.ui.setProgress(0.65);
    // Warm every pipeline stage (sky, shadows, AO, bloom, grade) behind the loading screen.
    for (let i = 0; i < 3; i++) {
      this.world.update(1 / 60, false);
      this.world.render(1 / 60);
      await new Promise((r) => requestAnimationFrame(r));
      this.ui.setProgress(0.65 + 0.1 * (i + 1));
    }
    this.ui.setProgress(1);
    this.loop.start();
    await new Promise((r) => setTimeout(r, 300));
    this.state = 'title';
    this.ui.hideLoading();
    this.ui.showTitle();
  }

  private setupVehicles(): void {
    const mgr = new VehicleManager(this.physics!);
    this.vehicles = mgr;
    this.world.scene.add(mgr.group);
    // every lit vehicle material gets cascaded shadows + sky fog like the rest of the world
    mgr.onVisual = (visual) => {
      const seen = new Set<THREE.Material>();
      visual.group.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          if (!seen.has(m) && (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial)) { seen.add(m); this.world.rig.register(m); }
        }
      });
    };
    // A showroom row on the beach lot, facing the city: five cars and a bike.
    const row: [string, number][] = [['pico', -34], ['marlow', -22], ['barrage', -10], ['veloce', 2], ['ridgeback', 14], ['sparrow', 24]];
    for (const [id, z] of row) mgr.spawn(id, 168, z, -Math.PI / 2);
    this.driving = new Driving({
      input: this.input, player: this.player!, vehicles: mgr, physics: this.physics!, audio: this.audio,
      weapon: this.weapon!, viewmodel: this.viewmodel!, camera: this.camera,
      baseFov: () => this.baseFov, night: () => this.world.tod.look.night, toast: (m) => this.ui.toast(m),
    });
  }

  private setupWeapon(): void {
    const world = this.world;
    const player = this.player!;
    this.effects = new Effects(this.audio);
    this.viewmodel = new Viewmodel();
    world.scene.add(this.effects.group, this.viewmodel.group);
    for (const m of this.viewmodel.materials) world.rig.register(m);
    world.pipeline.overlayCamera = this.viewmodel.camera;
    world.pipeline.hideForAO.push(this.effects.group);
    this.weapon = new WeaponSystem(this.input, player, this.physics!, this.audio, this.effects, () => world.props);
    const vm = this.viewmodel;
    this.weapon.onFire = (k) => vm.kick(k);
    this.weapon.onDraw = () => vm.bump(0.5);
    vm.onMagDrop = (pos, vel) => this.effects!.dropMagazine(pos, vel);
    player.onLand = (speed) => vm.bump(Math.min(5, speed * 0.35));
    player.onMantleEnd = () => vm.bump(1.5);
  }

  /** `?time=18.6&weather=rain&speed=0` — handy for look-dev and QA. */
  private applyUrlParams(): void {
    const q = new URLSearchParams(location.search);
    const t = q.get('time');
    if (t !== null && Number.isFinite(Number(t))) this.world.setHour(Number(t));
    const wx = q.get('weather') as WeatherType | null;
    if (wx && WEATHER_TYPES.some((w) => w.id === wx)) this.world.setWeather(wx, true);
    const sp = q.get('speed');
    if (sp !== null && Number.isFinite(Number(sp))) {
      const v = Number(sp);
      this.timeFrozen = v === 0;
      if (v > 0) this.world.tod.speed = v;
    }
  }

  // ------------------------------------------------------------------ loop

  private updateCombat(dt: number): void {
    const c = this.combat;
    if (!c || !this.combatHud) return;
    c.update(dt);
    if (this.police && !c.flow) this.police.update(dt);
    const w = this.wanted;
    const arrest = this.police ? this.police.arresting : 0;
    this.combatHud.update(dt, {
      health: c.vitals.health, armour: c.vitals.armour, hurt: c.vitals.hurtFlash,
      stars: w ? w.stars : 0, seen: !!w && w.seen, search: w ? w.searchFrac : 0,
      status: arrest > 0.15 ? 'Arresting…' : w && w.stars > 0 ? (w.seen ? 'Wanted' : w.response > 0 ? 'Dispatching' : 'Searching') : '',
    });
    c.cameraEffect(this.camera);
  }

  /** Hand the NPC systems this tick's view of the player and vehicles. */
  private syncNpcs(): void {
    const n = this.npcs;
    if (!n || !this.player || !this.vehicles) return;
    const d = this.driving;
    n.ctx = {
      pos: this.player.pos,
      driving: d && d.mode === 'driving' ? d.vehicle : null,
      vehicles: this.vehicles.vehicles,
      camera: this.camera,
    };
  }

  private fixedUpdate(dt: number): void {
    if (this.state !== 'playing' || !this.physics || !this.player) return;
    Vehicle.wetness = this.world.weather.wetness;
    this.driving?.fixedUpdate(dt);
    this.vehicles?.fixedUpdate(dt);
    this.player.fixedUpdate(dt);
    this.syncNpcs();
    this.npcs?.fixedUpdate(dt);
    this.physics.step();
    this.world.props?.fixedUpdate();
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
        this.updatePlaying(dt, alpha);
        if (input.pressed('pause')) this.pause();
        else if (input.pressed('map')) this.openMap();
        this.ui.setCaptureHint(input.activeDevice === 'kbm' && !input.pointerLocked && !this.editingTouch);
        break;
      case 'paused':
        this.updateMenuInput();
        this.ui.menu.tick();
        break;
      case 'map':
        this.map.tick(dt);
        break;
    }
    this.updateMapHud(dt);

    this.updateFov(dt);
    this.lastDt = dt;
    this.world.update(dt, this.state === 'playing' && !this.timeFrozen, this.state === 'playing');
    this.gfx.govern(
      this.loop.recentAverage(60), dt,
      this.settings.data.graphics.dynamicResolution && !document.hidden,
      this.loop.sampleCount,
    );
    this.ui.updateStats(dt, this.loop.stats, this.gfx, this.gfx.renderer.info.render);
  }

  private renderFrame(): void {
    this.gfx.renderer.info.reset();
    this.world.render(this.lastDt);
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

  /** Engine/tyre/wind sound for the vehicle being driven (created lazily on first entry, silent on foot). */
  private updateVehicleAudio(driving: Driving | null): void {
    const v = driving && driving.mode !== 'foot' ? driving.vehicle : null;
    if (!this.carSound) {
      if (!v) return;
      this.carSound = this.audio.createVehicleSound();
      this.carSound?.start();
    }
    const snd = this.carSound;
    if (!snd) return;
    if (!v) {
      snd.update({ rpm: 0, idleRpm: 1, redlineRpm: 2, load: 0, cylinders: 4, turbo: false, speedKmh: 0, skid: 0, airborne: false, braking: false, shifted: false, impact: 0, horn: false, active: false });
      return;
    }
    const e = v.spec.engine;
    snd.update({
      rpm: v.rpm, idleRpm: e.idleRpm, redlineRpm: e.redlineRpm, load: v.load, cylinders: e.cylinders, turbo: !!e.turbo,
      speedKmh: v.speedKmh, skid: v.skid, airborne: v.wheels.every((w) => !w.onGround), braking: v.braking,
      shifted: v.shifted, impact: v.impact, horn: !!driving?.hornOn, active: v.occupied,
    });
  }

  private updatePlaying(dt: number, alpha: number): void {
    const player = this.player;
    if (!player) return;
    const driving = this.driving;
    const inCar = driving?.mode === 'driving';
    if (!inCar) player.update(dt, alpha, this.camera);
    this.world.props?.update(alpha);
    if (this.vehicles) {
      this.vehicles.night = this.world.tod.look.night;
      this.vehicles.update(alpha);
    }
    const weapon = this.weapon;
    const vm = this.viewmodel;
    if (weapon && vm && this.effects) {
      if (!inCar) {
        if (!this.combat?.flow) weapon.update(dt);
        // zoom in a little when aiming, out a little when sprinting
        this.camera.fov = this.baseFov * (1 - 0.2 * weapon.ads) + 6 * player.sprintBlend;
        this.camera.updateProjectionMatrix();
        vm.update(dt, player, weapon, this.camera, this.camera.aspect);
      }
      this.effects.update(dt);
    }
    // vehicle sequencing and the chase camera run after the first-person pose is on the camera
    driving?.update(dt);
    this.npcs?.update(dt, alpha);
    this.updateCombat(dt);
    this.updateVehicleAudio(driving);
    this.touch.setMode(driving && driving.mode !== 'foot' ? 'vehicle' : 'foot');
    if (this.effects) this.effects.setViewport(this.gfx.renderer.domElement.height, this.camera.fov);
    if (this.intro < 1) {
      // Blend from the title camera into the player's eyes over ~2.4 s, then hand over control.
      this.intro = Math.min(1, this.intro + dt / 2.4);
      const k = easeInOutCubic(this.intro);
      this.camera.position.lerpVectors(this.introFromPos, this.camera.position, k);
      this.introTmpQuat.copy(this.camera.quaternion);
      this.camera.quaternion.slerpQuaternions(this.introFromQuat, this.introTmpQuat, k);
      if (this.intro >= 1) this.input.gameplayEnabled = true;
    }
    this.audio.setListener(this.camera);
    if (weapon) {
      const v = driving?.mode === 'driving' || driving?.mode === 'exiting' ? driving.vehicle : null;
      this.ui.updateHud(dt, {
        weaponName: weapon.name,
        ammo: weapon.ammo,
        reserve: weapon.reserve,
        spread: weapon.spread,
        ads: weapon.ads,
        drawn: weapon.isDrawn && !inCar && driving?.mode !== 'entering',
        reloading: weapon.state === 'reloading',
        lowAmmo: weapon.ammo <= 3,
        hitMarker: weapon.hitMarker,
        stamina: player.stamina,
        prompt: player.ledgeHint && !player.mantle ? { action: 'jump', label: player.ledgeHint.kind === 'vault' ? 'Vault' : 'Climb' } : null,
        fovDeg: this.camera.fov,
        viewportH: this.gfx.renderer.domElement.clientHeight,
        vehicle: v && inCar ? { name: v.spec.name, speedKmh: v.speedKmh, gear: v.gear, reversing: v.reversing, rpmFrac: v.rpm / v.spec.engine.redlineRpm, headlights: v.headlights, health: v.health } : null,
        enter: driving?.hint ? `Enter ${driving.hint.spec.name}` : null,
      });
    }
  }

  /** Slow golden-hour dolly over the city toward the sunset coast. */
  private placeTitleCamera(t: number): void {
    const s = Math.sin(t * 0.045);
    this.camera.position.set(1230 + Math.sin(t * 0.03) * 70, 150 + Math.sin(t * 0.11) * 9, 330 * s - 40);
    this.camera.lookAt(120, 36, 170 * Math.sin(t * 0.045 + 0.8));
    this.camera.updateMatrixWorld();
  }

  private updateFov(dt: number): void {
    const target = this.state === 'title' || this.state === 'loading' ? TITLE_FOV : this.settings.data.graphics.fov;
    let fov = target;
    if (this.fovT < 1) {
      this.fovT = Math.min(1, this.fovT + dt / (this.settings.data.accessibility.reduceMotion ? 0.01 : 1.6));
      fov = this.fovFrom + (target - this.fovFrom) * easeInOutCubic(this.fovT);
    }
    if (this.state === 'playing' && this.weapon) {
      this.baseFov = fov; // the weapon code applies aim zoom / sprint FOV on top
    } else {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------- state changes

  startPlaying(): void {
    if (this.state !== 'title') return;
    // The camera swoops from the title shot into the player's eyes: a continuous move, never a cut.
    this.introFromPos.copy(this.camera.position);
    this.introFromQuat.copy(this.camera.quaternion);
    this.intro = this.settings.data.accessibility.reduceMotion ? 1 : 0;
    this.fovFrom = this.camera.fov;
    this.fovT = 0;
    this.state = 'playing';
    this.audio.unlock();
    this.input.gameplayEnabled = this.intro >= 1;
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
    this.audio.suspend();
    this.ui.menu.open();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    if (this.editingTouch) return;
    this.state = 'playing';
    this.ui.menu.close();
    this.audio.resume();
    this.loop.paused = false;
    this.input.gameplayEnabled = true;
    this.touch.setActive(true);
    this.ui.dismissHints();
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  openMap(): void {
    if (this.state !== 'playing') return;
    this.state = 'map';
    this.input.gameplayEnabled = false;
    this.loop.paused = true;
    this.touch.setActive(false);
    this.ui.setCaptureHint(false);
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.suspend();
    this.map.open();
  }

  closeMap(): void {
    if (this.state !== 'map') return;
    this.map.close();
    this.state = 'playing';
    this.audio.resume();
    this.loop.paused = false;
    this.input.gameplayEnabled = true;
    this.touch.setActive(true);
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  /** Feed the minimap with the player's (or driven vehicle's) position and heading. */
  private updateMapHud(dt: number): void {
    if (this.state !== 'playing' && this.state !== 'map') {
      this.map.setHudVisible(false);
      return;
    }
    this.map.setHudVisible(this.state === 'playing');
    const driving = this.driving;
    const v = driving && driving.mode !== 'foot' ? driving.vehicle : null;
    const cam = this.camera;
    let yaw: number;
    let x: number, z: number;
    if (v) {
      x = v.position.x; z = v.position.z;
      const f = this.mapFwd.set(0, 0, -1).applyQuaternion(v.quaternion);
      yaw = Math.atan2(-f.x, -f.z);
    } else {
      const p = this.player ? this.player.pos : cam.position;
      x = p.x; z = p.z;
      const f = this.mapFwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      yaw = Math.atan2(-f.x, -f.z);
    }
    this.map.update(dt, {
      x, z, yaw, speedKmh: v ? v.speedKmh : 0,
      vehicles: this.vehicles ? this.vehicles.vehicles.map((c) => ({ x: c.position.x, z: c.position.z })) : [],
    });
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
    this.audio.setVolume(this.settings.data.audio.master);
    const preset = this.resolvePreset();
    if (preset.name !== this.gfx.preset.name) {
      this.gfx.applyQuality(preset);
      this.world.applyQuality(preset);
      this.npcs?.setQuality(preset);
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
      this.world.rig.onResize();
    });

    // "Press any key" on the title screen, from any device.
    this.input.on('anyinput', () => {
      this.audio.unlock();
      if (this.state === 'title') this.startPlaying();
    });
    this.input.on('device', () => this.ui.refreshPrompts());
    this.input.on('gamepad', () => this.ui.refreshPrompts());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F9' && this.player && this.state === 'playing') {
        this.player.noclip = !this.player.noclip;
        this.ui.toast(this.player.noclip ? 'Noclip on' : 'Noclip off');
        e.preventDefault();
      }
      if (e.code !== 'Escape' || e.repeat) return;
      if (this.input.capturing) return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'map') this.closeMap();
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
