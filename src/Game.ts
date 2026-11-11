import * as THREE from 'three';
import { easeInOutCubic } from './core/math';
import { GameLoop } from './core/GameLoop';
import { TerrainData } from './world/TerrainData';
import { CraftManager } from './craft/CraftManager';
import { Piloting } from './craft/Piloting';
import { Skydive } from './craft/Skydive';
import { Restricted } from './combat/Restricted';
import { Commerce } from './economy/Commerce';
import { mountSlots } from './economy/screens';
import { Phone } from './ui/Phone';
import { Story } from './story/Story';
import { RadioControl } from './radio/RadioControl';
import { MainMenu } from './ui/MainMenu';
import { PauseHome, type PauseStatus } from './ui/PauseHome';
import { PhotoMode, type PhotoFilter } from './ui/PhotoMode';
import { CHARS } from './story/chars';
import { money } from './economy/Economy';
import { regionAt } from './ui/mapData';
import { craftMaterials } from './craft/models';
import { CraftHud } from './ui/CraftHud';
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
import { spawnCrafts } from './craft/spawns';
import { Driving } from './vehicles/Driving';
import { Npcs } from './npc/Npcs';
import { Combat } from './combat/Combat';
import { Police } from './combat/Police';
import { Wanted } from './combat/Wanted';
import { Heli } from './combat/Aircraft';
import { Pickups } from './world/Pickups';
import { WeaponWheel } from './ui/WeaponWheel';
import { WEAPON_ORDER } from './player/Weapons';
import { CombatHud } from './ui/CombatHud';
import { World } from './world/World';
import { WEATHER_TYPES, type WeatherType } from './world/Weather';

export type GameState = 'loading' | 'title' | 'playing' | 'paused' | 'map' | 'modal' | 'phone' | 'photo';

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
  readonly camera: THREE.PerspectiveCamera;
  physics: Physics | null = null;
  readonly audio = new AudioEngine();
  player: Player | null = null;
  weapon: WeaponSystem | null = null;
  viewmodel: Viewmodel | null = null;
  private vmHidden = false;
  mainMenu!: MainMenu;
  pauseHome!: PauseHome;
  photoMode!: PhotoMode;
  /** Which pause screen is up: the landing page or the settings tabs. */
  private pauseView: 'home' | 'settings' = 'home';
  /** The settings tabs were opened from the main menu. */
  private titleSettings = false;
  effects: Effects | null = null;
  vehicles: VehicleManager | null = null;
  driving: Driving | null = null;
  crafts: CraftManager | null = null;
  piloting: Piloting | null = null;
  skydive: Skydive | null = null;
  restricted: Restricted | null = null;
  commerce: Commerce | null = null;
  phone: Phone | null = null;
  story: Story | null = null;
  radio: RadioControl | null = null;
  /** Suppresses the "Waypoint set" toast for story-driven waypoints. */
  silentWp = false;
  npcs: Npcs | null = null;
  combat: Combat | null = null;
  wanted: Wanted | null = null;
  police: Police | null = null;
  pickups: Pickups | null = null;
  wheel: WeaponWheel | null = null;
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

    this.camera = new THREE.PerspectiveCamera(TITLE_FOV, window.innerWidth / window.innerHeight, 0.25, 9500);
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
      mountSaves: (host) => (this.commerce ? this.commerce.mountSaves(host) : () => undefined),
      mountProgress: (host) => {
        const draw = (): void => { if (this.story) this.story.completion.render(host, { onMark: (k) => this.markNearest(k) }); else host.textContent = 'Start a game to see your progress.'; };
        draw();
        return draw;
      },
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
    this.mainMenu = new MainMenu(root, {
      slots: () => (this.commerce ? this.commerce.slots() : Promise.resolve([])),
      read: (slot) => (this.commerce ? this.commerce.store.read(slot) : Promise.resolve(null)),
      remove: async (slot) => { await this.commerce?.store.remove(slot); },
      start: (slot, data) => {
        if (!this.commerce || this.state !== 'title') return;
        this.mainMenu.hide();
        this.commerce.begin(slot, data);
        this.startPlaying();
      },
      settings: () => this.openTitleSettings(),
      manage: () => this.openSlotPicker(),
      blip: (k) => this.audio.uiBlip(k),
    });
    this.pauseHome = new PauseHome(root, {
      resume: () => this.resume(),
      map: () => { this.resume(); this.openMap(); },
      progress: () => this.openPauseSettings('Progress'),
      settings: () => this.openPauseSettings(),
      save: () => this.openPauseSettings('Saves'),
      photo: () => this.enterPhoto(),
      quit: () => { location.href = location.pathname + location.search.replace(/[?&]debug\b[^&]*/, ''); },
      blip: (k) => this.audio.uiBlip(k),
    });
    this.photoMode = new PhotoMode(root, {
      camera: this.camera,
      look: (o) => this.input.consumeLook(o),
      move: () => ({ x: this.input.move.x, y: this.input.move.y, up: (this.input.down('jump') ? 1 : 0) - (this.input.down('crouch') ? 1 : 0), fast: this.input.down('sprint') }),
      ground: (x, z) => this.world.heightAt(x, z),
      hour: () => this.world.tod.hour,
      setHour: (hr) => this.world.setHour(hr),
      setFilter: (f) => {
        const P = this.world.pipeline;
        const L: Record<PhotoFilter, [number, number, number, number, number]> = {
          none: [1, 1, 1, 1, 0], vivid: [1.4, 1.02, 1, 0.98, 0.15], vintage: [0.62, 1.12, 1, 0.82, 0.35], cool: [0.85, 0.88, 0.98, 1.15, 0.2], noir: [0, 1, 1, 1, 0.45],
        };
        const [sat, r, g, b, c] = L[f];
        P.filterSat = sat; P.filterTint.setRGB(r, g, b); P.filterContrast = c;
      },
      setHud: (on) => document.documentElement.classList.toggle('photo-clean', !on),
      shoot: () => this.commerce?.photo(),
      exit: () => this.exitPhoto(),
    });

    this.map.onWaypoint = (wp) => {
      if (wp) this.world.beacon.set(wp.x, wp.z);
      else this.world.beacon.clear();
      if (!this.silentWp) this.ui.toast(wp ? 'Waypoint set' : 'Waypoint cleared');
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
    const bake = TerrainData.bake((f) => this.ui.setProgress(0.1 + 0.1 * f));
    this.physics = await Physics.create();
    this.world.attachTerrain(await bake);
    this.map.bakeTerrain();
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
      this.combat.crafts = this.crafts;
      this.combat.piloting = this.piloting;
      this.wanted = new Wanted();
      this.police = new Police({
        world: this.world, physics: this.physics, audio: this.audio, effects: this.effects, player: this.player,
        driving: this.driving, vehicles: this.vehicles, npcs: this.npcs, combat: this.combat, wanted: this.wanted,
        hud: this.combatHud, camera: this.camera,
      });
      const pol = this.police;
      if (this.piloting) this.restricted = new Restricted({ wanted: this.wanted, player: this.player, piloting: this.piloting, hud: this.combatHud, hudRoot: this.ui.hudRoot, toast: (m) => this.ui.toast(m) });
      // weapon crates, armour and medkits next to the spawn point
      const px = 112;
      this.pickups = new Pickups([
        { kind: 'smg', x: px, z: -7 }, { kind: 'shotgun', x: px, z: -3.5 }, { kind: 'rifle', x: px, z: 0 },
        { kind: 'armour', x: px, z: 3.5 }, { kind: 'medkit', x: px, z: 7 },
      ]);
      for (const m of this.pickups.materials) this.world.rig.register(m);
      this.world.scene.add(this.pickups.group);
      const weapon = this.weapon;
      this.pickups.onPick = (kind) => {
        if (kind === 'armour') this.combat?.vitals.addArmour(100);
        else if (kind === 'medkit') this.combat?.vitals.heal(100);
        else {
          const fresh = weapon.give(kind, kind === 'shotgun' ? 24 : 90);
          if (fresh && weapon.isDrawn) weapon.select(kind);
        }
        this.audio.mech('magIn');
        this.ui.toast(`Picked up: ${Pickups.label(kind)}`);
      };
      this.wheel = new WeaponWheel(document.getElementById('ui')!, () => {
        weapon.inv[weapon.def.id].ammo = weapon.ammo;
        weapon.inv[weapon.def.id].reserve = weapon.reserve;
        return weapon.inv;
      }, (id) => weapon.select(id));
      this.npcs.extraRay = (ox, oy, oz, dx, dy, dz, max) => { const h = pol.rayHit(ox, oy, oz, dx, dy, dz, max); return h ? { t: h.t, target: h.heli } : null; };
      this.npcs.extraHurt = (t, dmg) => {
        if (t instanceof Heli) { pol.hurtHeli(t, dmg); return true; }
        return false;
      };
      // the beach shooting range is a safe place to practise: gunfire there is not a crime
      this.npcs.onGunshot = (x, z) => {
        if (x > 90 && x < 205 && z > -45 && z < 125) return;
        this.combat?.crime?.(2.5, x, z);
      };
    }
    if (this.player && this.vehicles && this.combat) {
      const cm = new Commerce(this);
      this.commerce = cm;
      cm.init();
      cm.onModalOpen = () => this.enterModal();
      cm.onModalClose = () => this.leaveModal();
      this.phone = new Phone(document.getElementById('ui')!, cm);
      this.phone.onClose = () => this.closePhone();
      this.story = new Story(this);
      this.radio = new RadioControl(this);
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
    void this.mainMenu.show();
    this.mainMenu.setDevice(this.input.activeDevice);
    this.pauseHome.setDevice(this.input.activeDevice);
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
    this.setupCrafts();
  }

  /** Boats, helicopters and planes: manager, spawns, the piloting controller and instruments. */
  private setupCrafts(): void {
    const crafts = new CraftManager(this.physics!);
    this.crafts = crafts;
    this.world.scene.add(crafts.group);
    for (const m of [craftMaterials.body, craftMaterials.glass, craftMaterials.burnt]) this.world.rig.register(m);
    const hud = new CraftHud(this.ui.hudRoot);
    this.piloting = new Piloting({
      input: this.input, player: this.player!, crafts, driving: this.driving!, audio: this.audio,
      weapon: this.weapon!, viewmodel: this.viewmodel!, camera: this.camera, hud,
      baseFov: () => this.baseFov, toast: (m) => this.ui.toast(m),
      physics: this.physics!, effects: this.effects!, combat: () => this.combat, npcs: () => this.npcs,
      bail: (vx, vy, vz) => this.onBail(vx, vy, vz),
    });
    const canopy = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    this.world.rig.register(canopy);
    this.skydive = new Skydive({ input: this.input, player: this.player!, driving: this.driving!, piloting: this.piloting, audio: this.audio, hudRoot: this.ui.hudRoot, material: canopy, toast: (m) => this.ui.toast(m) });
    this.world.scene.add(this.skydive.group);
    spawnCrafts(crafts);
  }

  /** The player jumped out of an aircraft: free-fall (the parachute arrives with the skydive step). */
  private onBail(vx: number, vy: number, vz: number): void {
    const p = this.player;
    if (!p) return;
    p.vel.set(vx * 0.8, Math.min(vy, 0) - 2, vz * 0.8);
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

  /** Weapon wheel (hold), touch cycling, and pickup collection. */
  private updateWheel(dt: number, weapon: WeaponSystem): void {
    const wheel = this.wheel;
    const input = this.input;
    const p = this.player;
    if (!wheel || !p) return;
    const dead = !!this.combat?.flow;
    if (this.pickups) this.pickups.update(dt, p.pos.x, p.pos.y, p.pos.z, !dead && this.driving?.mode === 'foot' && !this.piloting?.busy);
    if (dead) { wheel.finish(); return; }
    if (input.activeDevice === 'touch') {
      // touch: the Arms button cycles through the weapons you own
      if (input.pressed('weaponWheel')) {
        const owned = WEAPON_ORDER.filter((id) => weapon.inv[id].owned || id === weapon.def.id);
        const next = owned[(owned.indexOf(weapon.def.id) + 1) % owned.length];
        if (next && next !== weapon.def.id) weapon.select(next);
        else weapon.toggleHolster();
      }
      return;
    }
    if (input.down('weaponWheel') && weapon.state !== 'reloading') wheel.open();
    if (wheel.isOpen) {
      wheel.tick();
      p.lookScale = 0;
      if (!input.down('weaponWheel')) wheel.finish();
    }
  }

  private updateCombat(dt: number): void {
    const c = this.combat;
    if (!c || !this.combatHud) return;
    c.update(dt);
    if (this.police && !c.flow) this.police.update(dt);
    if (this.restricted && !c.flow) this.restricted.update(dt);
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
    if ((this.state !== 'playing' && this.state !== 'phone') || !this.physics || !this.player) return;
    Vehicle.wetness = this.world.weather.wetness;
    this.story?.fixedUpdate(dt);
    this.driving?.fixedUpdate(dt);
    this.piloting?.fixedUpdate();
    this.skydive?.fixedUpdate(dt);
    this.vehicles?.fixedUpdate(dt);
    if (this.crafts) this.crafts.fixedUpdate(dt, this.player.pos.x, this.player.pos.z, 0.4 + this.world.weather.current.wind / 13);
    this.player.fixedUpdate(dt);
    this.syncNpcs();
    this.npcs?.fixedUpdate(dt);
    this.physics.step();
    this.world.props?.fixedUpdate();
  }

  private update(dt: number, alpha: number): void {
    const input = this.input;
    // the first-person arms belong to the game, not to the title or loading screens
    if (this.viewmodel) {
      if (this.state === 'title' || this.state === 'loading') { this.viewmodel.group.visible = false; this.vmHidden = true; }
      else if (this.vmHidden) { this.viewmodel.group.visible = true; this.vmHidden = false; }
    }

    switch (this.state) {
      case 'loading':
      case 'title':
        this.titleT += dt;
        this.placeTitleCamera(this.titleT);
        if (this.state === 'title') this.updateTitleInput();
        break;
      case 'photo':
        this.photoMode.update(dt);
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
      case 'modal':
        this.updateModalState(dt);
        break;
      case 'phone':
        this.updatePlaying(dt, alpha);
        this.updatePhoneState();
        break;
    }
    if (this.state === 'title' && this.commerce?.modal.active) this.padNavModal();
    if (this.state === 'photo') this.ui.setCaptureHint(this.input.activeDevice === 'kbm' && !this.input.pointerLocked);
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

  private updatePhoneState(): void {
    const ph = this.phone;
    if (!ph?.isOpen) return;
    ph.tick();
    const n = this.input.nav;
    if (n.x || n.y) ph.navigate(n.x, n.y);
    if (n.confirm) ph.confirm();
    if (n.back) ph.pop();
  }

  private padNavModal(): void {
    const cm = this.commerce;
    if (!cm?.modal.active) return;
    const n = this.input.nav;
    if (n.x || n.y) cm.modal.navigate(n.x, n.y);
    if (n.confirm) cm.modal.confirm();
    if (n.back && this.state === 'modal') cm.modal.back();
  }

  private updateModalState(dt: number): void {
    const cm = this.commerce;
    if (!cm) return;
    this.padNavModal();
    cm.updateModal(dt);
    this.vehicles?.update(1);
    this.crafts?.update(1, this.camera);
    this.audio.setListener(this.camera);
  }

  /** Render a frame right now (the phone camera). */
  renderNow(): void {
    this.renderFrame();
  }

  private renderFrame(): void {
    this.gfx.renderer.info.reset();
    this.world.render(this.lastDt);
  }

  /** Gamepad / keyboard navigation of the pause menu. */
  private updateMenuInput(): void {
    if (this.editingTouch) return;
    const n = this.input.nav;
    if (this.input.capturing) return;
    if (this.pauseView === 'home') {
      if (n.x || n.y) this.pauseHome.navigate(n.x, n.y);
      if (n.confirm) this.pauseHome.confirm();
      if (n.back || n.start) this.resume();
      return;
    }
    const menu = this.ui.menu;
    if (n.x || n.y) menu.nav.move(n.x, n.y);
    if (n.confirm) menu.nav.confirm();
    if (n.back) this.backToPauseHome();
    else if (n.start) this.resume();
  }

  /** Gamepad on the main menu (the keyboard and mouse talk to the DOM directly). */
  private updateTitleInput(): void {
    if (this.commerce?.modal.active) return;
    const n = this.input.nav;
    if (this.titleSettings) {
      this.ui.menu.tick();
      if (this.input.capturing || this.editingTouch) return;
      if (n.x || n.y) this.ui.menu.nav.move(n.x, n.y);
      if (n.confirm) this.ui.menu.nav.confirm();
      if (n.back || n.start) this.closeTitleSettings();
      return;
    }
    if (!this.mainMenu.isOpen) return;
    if (n.x || n.y) this.mainMenu.navigate(n.x, n.y);
    if (n.confirm) this.mainMenu.confirm();
    if (n.back) this.mainMenu.back();
  }

  private openTitleSettings(): void {
    this.titleSettings = true;
    this.mainMenu.hide();
    this.ui.menu.open();
  }

  private closeTitleSettings(): void {
    if (!this.titleSettings) return;
    this.titleSettings = false;
    this.ui.menu.close();
    void this.mainMenu.show();
  }

  private openPauseSettings(tab?: string): void {
    this.pauseView = 'settings';
    this.pauseHome.close();
    this.ui.menu.open();
    if (tab) this.ui.menu.openTab(tab);
  }

  private backToPauseHome(): void {
    if (this.state !== 'paused') return;
    this.audio.uiBlip('back');
    this.ui.menu.close();
    this.pauseView = 'home';
    this.pauseHome.open(this.pauseStatus(), this.canSaveNow());
  }

  private canSaveNow(): boolean {
    return !!this.commerce && !this.story?.mission && (this.wanted?.stars ?? 0) === 0 && !this.combat?.flow;
  }

  private pauseStatus(): PauseStatus {
    const st = this.story, eco = this.commerce?.eco;
    const c = CHARS[st?.active ?? 'mack'];
    const p = this.player?.pos;
    return {
      who: c.name, color: c.color, role: c.role,
      cash: money(eco?.cash ?? 0), bank: money(eco?.bank ?? 0),
      place: (p && regionAt(p.x, p.z)) ?? 'San Verano', clock: this.world.tod.clock, day: eco?.p.day ?? 1,
      completion: st?.completion.percent() ?? 0,
      mission: st?.mission ? st.mission.def.title : null,
    };
  }

  /** Photo mode: from the pause menu, the world stays frozen and the camera flies free. */
  private enterPhoto(): void {
    if (this.state !== 'paused') return;
    this.pauseHome.close();
    this.ui.menu.close();
    this.state = 'photo';
    this.audio.resume();
    this.input.gameplayEnabled = true;
    this.photoMode.enter();
    if (this.viewmodel) this.viewmodel.group.visible = false;
    this.ui.toast('Photo mode: click to look around · H hides the panel · Esc exits');
  }

  private exitPhoto(): void {
    if (this.state !== 'photo') return;
    this.photoMode.exit();
    const onFoot = this.driving?.mode === 'foot' && !this.piloting?.busy;
    if (this.viewmodel) this.viewmodel.group.visible = onFoot;
    if (document.pointerLockElement) document.exitPointerLock();
    this.state = 'paused';
    this.input.gameplayEnabled = false;
    this.audio.suspend();
    this.pauseView = 'home';
    this.pauseHome.open(this.pauseStatus(), this.canSaveNow());
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
    const piloting = this.piloting;
    const inCar = driving?.mode === 'driving' || !!piloting?.active;
    if (!inCar) player.update(dt, alpha, this.camera);
    if (this.crafts) { this.crafts.night = this.world.tod.look.night; this.crafts.update(alpha, this.camera); }
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
        this.updateWheel(dt, weapon);
        // zoom in a little when aiming, out a little when sprinting
        this.camera.fov = this.baseFov * (1 - (weapon.scoped[weapon.def.id] ? 0.45 : 0.2) * weapon.ads) + 6 * player.sprintBlend;
        this.camera.updateProjectionMatrix();
        vm.update(dt, player, weapon, this.camera, this.camera.aspect);
      }
      this.effects.update(dt);
    }
    this.commerce?.update(dt);
    this.story?.update(dt);
    this.radio?.update(dt);
    if (this.state === 'playing' && this.input.pressed('phone') && !this.story?.sceneBlocksInput()) this.openPhone();
    // vehicle sequencing and the chase camera run after the first-person pose is on the camera
    driving?.update(dt);
    piloting?.update(dt);
    this.skydive?.update(dt, this.camera);
    this.npcs?.update(dt, alpha);
    this.updateCombat(dt);
    this.updateVehicleAudio(driving);
    this.touch.setMode((driving && driving.mode !== 'foot') || piloting?.busy ? 'vehicle' : 'foot');
    if (this.effects) this.effects.setViewport(this.gfx.renderer.domElement.height, this.camera.fov);
    if (this.intro < 1) {
      // Blend from the title camera into the player's eyes over ~2.4 s, then hand over control.
      this.intro = Math.min(1, this.intro + dt / 2.4);
      const k = easeInOutCubic(this.intro);
      this.camera.position.lerpVectors(this.introFromPos, this.camera.position, k);
      this.introTmpQuat.copy(this.camera.quaternion);
      this.camera.quaternion.slerpQuaternions(this.introFromQuat, this.introTmpQuat, k);
      if (this.intro >= 1 && !this.story?.sceneBlocksInput()) this.input.gameplayEnabled = true;
    }
    this.story?.applyCamera(this.camera, dt);
    this.audio.setListener(this.camera);
    if (weapon) {
      const v = driving?.mode === 'driving' || driving?.mode === 'exiting' ? driving.vehicle : null;
      this.ui.updateHud(dt, {
        weaponName: weapon.name,
        ammo: weapon.ammo,
        reserve: weapon.reserve,
        spread: weapon.spread,
        ads: weapon.ads,
        drawn: weapon.isDrawn && !inCar && driving?.mode !== 'entering' && !piloting?.busy,
        reloading: weapon.state === 'reloading',
        lowAmmo: weapon.ammo <= 3,
        hitMarker: weapon.hitMarker,
        stamina: player.stamina,
        prompt: player.ledgeHint && !player.mantle ? { action: 'jump', label: player.ledgeHint.kind === 'vault' ? 'Vault' : 'Climb' } : null,
        fovDeg: this.camera.fov,
        viewportH: this.gfx.renderer.domElement.clientHeight,
        vehicle: v && inCar ? { name: v.spec.name, speedKmh: v.speedKmh, gear: v.gear, reversing: v.reversing, rpmFrac: v.rpm / v.spec.engine.redlineRpm, headlights: v.headlights, health: v.health } : null,
        enter: this.commerce?.prompt ? this.commerce.prompt : this.story?.prompt ? this.story.prompt : driving?.hint ? `Enter ${driving.hint.spec.name}` : piloting?.hint ? `${piloting.hint.spec.kind === 'boat' ? 'Board' : 'Enter'} ${piloting.hint.spec.name}` : null,
      });
    }
  }

  /** Slow golden-hour dolly over the city toward the sunset coast. */
  private placeTitleCamera(t: number): void {
    // a slow drift along the shore, out over the water, with the skyline across the beach
    const s = Math.sin(t * 0.028);
    this.camera.position.set(-170 + Math.sin(t * 0.017) * 40, 34 + Math.sin(t * 0.07) * 5, 420 * s - 30);
    this.camera.lookAt(980, 95, 260 * Math.sin(t * 0.028 + 0.35) - 20);
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
    this.mainMenu.hide();
    this.ui.showHud();
    this.touch.setActive(true);
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  /** Waypoint to the nearest collectible of a kind (from the Progress tab). */
  private markNearest(kind: string): void {
    const p = this.player;
    const it = p && this.story?.collect.nearest(kind as import('./collect/defs').CKind, p.pos.x, p.pos.z);
    if (!it) { this.ui.toast('Nothing left of that kind'); return; }
    this.map.setWaypoint({ x: it.x, z: it.z });
    this.ui.toast(`Waypoint set: nearest ${kind}`);
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
    this.pauseView = 'home';
    this.pauseHome.open(this.pauseStatus(), this.canSaveNow());
  }

  resume(): void {
    if (this.state === 'title') { this.closeTitleSettings(); return; }
    if (this.state !== 'paused') return;
    if (this.editingTouch) return;
    this.state = 'playing';
    this.ui.menu.close();
    this.pauseHome.close();
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

  /** A shop / bank / garage screen opens over the world: the sim pauses and the pointer is released. */
  enterModal(): void {
    if (this.state === 'title') return;
    if (this.state !== 'playing') return;
    this.state = 'modal';
    this.ui.hudRoot.classList.add('dim');
    this.input.gameplayEnabled = false;
    this.loop.paused = true;
    this.touch.setActive(false);
    this.ui.setCaptureHint(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  leaveModal(): void {
    if (this.state !== 'modal') return;
    this.state = 'playing';
    this.ui.hudRoot.classList.remove('dim');
    this.loop.paused = false;
    this.input.gameplayEnabled = true;
    this.touch.setActive(true);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  openPhone(): void {
    if (this.state !== 'playing' || !this.phone || this.piloting?.busy || this.skydive?.active) return;
    this.state = 'phone';
    this.input.gameplayEnabled = false;
    this.touch.setActive(false);
    this.ui.setCaptureHint(false);
    if (this.weapon?.isDrawn) this.weapon.toggleHolster();
    if (document.pointerLockElement) document.exitPointerLock();
    this.phone.open();
  }

  closePhone(): void {
    if (this.state !== 'phone') return;
    this.state = 'playing';
    this.input.gameplayEnabled = true;
    this.touch.setActive(true);
    if (this.input.activeDevice === 'kbm') void this.lockPointer();
  }

  /** Title screen → the three save slots. */
  private openSlotPicker(): void {
    const cm = this.commerce;
    if (!cm || cm.modal.active) return;
    let started = false;
    this.mainMenu.hide();
    cm.modal.open({
      onClose: () => { if (!started && this.state === 'title') void this.mainMenu.show(); },
      title: 'Vice Coast',
      kicker: 'Choose a save slot',
      hideMoney: true,
      hints: 'Pick a slot to continue or start fresh · Import loads a save file',
      render: (host) => {
        mountSlots(cm, host.body, (slot, data) => {
          started = true;
          cm.modal.close();
          cm.begin(slot, data);
          this.startPlaying();
        });
      },
    });
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
      if (this.state !== 'title') return;
      // ?debug and automation boot straight into a fresh, unsaved game; everyone else picks a slot first
      const q = new URLSearchParams(location.search);
      if (!this.commerce || (q.has('debug') && !q.has('slots'))) {
        this.commerce?.begin(null, null);
        this.startPlaying();
      }
    });
    this.input.on('device', (d) => { this.mainMenu.setDevice(d); this.pauseHome.setDevice(d); });
    this.input.on('device', () => this.ui.refreshPrompts());
    this.input.on('gamepad', () => this.ui.refreshPrompts());

    window.addEventListener('keydown', (e) => {
      if (this.state === 'phone' && !e.repeat && !this.input.capturing && this.input.binding('phone').kbm.includes(e.code)) {
        this.phone?.close();
        e.preventDefault();
      }
      if (e.code === 'F9' && this.player && this.state === 'playing') {
        this.player.noclip = !this.player.noclip;
        this.ui.toast(this.player.noclip ? 'Noclip on' : 'Noclip off');
        e.preventDefault();
      }
      if (e.code !== 'Escape' || e.repeat) return;
      if (this.input.capturing) return;
      if (this.story?.cutscenes.active || this.story?.protagonists.wheelOpen) return;
      if (this.state === 'title') { if (this.titleSettings) this.closeTitleSettings(); return; }
      if (this.state === 'photo') { this.exitPhoto(); return; }
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') { if (this.pauseView === 'settings') this.backToPauseHome(); else this.resume(); }
      else if (this.state === 'map') this.closeMap();
      else if (this.state === 'modal') this.commerce?.modal.back();
      else if (this.state === 'phone') this.phone?.pop();
    });

    // The browser releases the pointer on Esc; treat any loss of capture while playing as "pause".
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && this.input.activeDevice === 'kbm' && !this.story?.cutscenes.active && !this.story?.protagonists.wheelOpen) this.pause();
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && (this.state === 'playing' || this.state === 'photo') && !document.pointerLockElement) void this.lockPointer();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }
}
