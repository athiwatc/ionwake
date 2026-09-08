import { AudioSynth } from "./audio";
import { Input } from "./input";
import { qualifies, submitScore } from "./save";
import { useHud, type Phase } from "./store";

const STEP = 1 / 60;
const MAX_ACC = 0.1;
const SHEET = 256;
const CELL = 128;

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys?: (codes: string[]) => void;
      setSteer?: (v: number) => void;
    };
  }
}

type Kind = "scout" | "fighter" | "heavy";
type PickupKind = "multi" | "shield" | "speed" | "life";

type Bullet = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  friendly: boolean;
};
type Enemy = {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  r: number;
  fire: number;
  flash: number;
  frame: number;
};
type Pickup = {
  alive: boolean;
  kind: PickupKind;
  x: number;
  y: number;
  t: number;
};
type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};
type Flash = {
  alive: boolean;
  x: number;
  y: number;
  ang: number;
  t: number;
  max: number;
};
type Floater = {
  alive: boolean;
  x: number;
  y: number;
  t: number;
  text: string;
};
type Star = { x: number; y: number; z: number; s: number };

type Sheet = { img: HTMLImageElement; ready: boolean };

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function lerpExp(cur: number, target: number, k: number, dt: number) {
  return cur + (target - cur) * (1 - Math.exp(-k * dt));
}
function hit(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy < r * r;
}
function pool<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, make);
}
function take<T extends { alive: boolean }>(items: T[], init: (it: T) => void): T | null {
  for (const it of items) {
    if (!it.alive) {
      init(it);
      it.alive = true;
      return it;
    }
  }
  return null;
}

const SPRITES = [
  "player",
  "scout",
  "fighter",
  "heavy",
  "bolt-player",
  "bolt-enemy",
  "muzzle",
  "explode",
  "pickups",
  "shield",
] as const;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  input = new Input();
  audio = new AudioSynth();
  sheets = new Map<string, Sheet>();
  w = 800;
  h = 1200;
  running = false;
  raf = 0;
  acc = 0;
  last = 0;
  phase: Phase = "title";
  score = 0;
  lives = 3;
  wave = 1;
  banner = "";
  bannerT = 0;
  spawnX = 400;
  player = {
    x: 400,
    y: 900,
    vx: 0,
    vy: 0,
    aim: -Math.PI / 2,
    r: 16,
    fire: 0,
    invuln: 0,
    shield: 0,
    multi: 0,
    speed: 0,
    blink: 0,
    alive: true,
  };
  bullets: Bullet[] = pool(160, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    r: 6,
    friendly: true,
  }));
  enemies: Enemy[] = pool(80, () => ({
    alive: false,
    kind: "scout" as Kind,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    r: 14,
    fire: 0,
    flash: 0,
    frame: 0,
  }));
  pickups: Pickup[] = pool(12, () => ({
    alive: false,
    kind: "multi" as PickupKind,
    x: 0,
    y: 0,
    t: 0,
  }));
  particles: Particle[] = pool(260, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    max: 1,
    size: 2,
    color: "#6ee7f0",
  }));
  flashes: Flash[] = pool(24, () => ({
    alive: false,
    x: 0,
    y: 0,
    ang: 0,
    t: 0,
    max: 0.12,
  }));
  booms: Flash[] = pool(24, () => ({
    alive: false,
    x: 0,
    y: 0,
    ang: 0,
    t: 0,
    max: 0.35,
  }));
  floaters: Floater[] = pool(24, () => ({
    alive: false,
    x: 0,
    y: 0,
    t: 0,
    text: "",
  }));
  stars: Star[] = [];
  waveQ: { kind: Kind; wait: number }[] = [];
  waveWait = 0;
  remaining = 0;
  trauma = 0;
  hitstop = 0;
  time = 0;
  hudClock = 0;
  reduced = false;
  destroyed = false;
  private onResize = () => this.fit();
  private onVis = () => {
    this.audio.resume();
    if (document.hidden && this.phase === "playing") this.setPhase("paused");
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.input.attach(canvas);
    this.loadSheets();
    this.seedStars();
    this.fit();
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVis);
    this.installProbe();
    this.resetShip(true);
    this.syncHud(true);
  }

  destroy() {
    this.destroyed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVis);
  }

  startLoop() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running || this.destroyed) return;
      const dt = Math.min(MAX_ACC, (now - this.last) / 1000);
      this.last = now;
      this.acc += dt;
      while (this.acc >= STEP) {
        this.step(STEP);
        this.acc -= STEP;
      }
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  begin() {
    this.audio.unlock();
    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.trauma = 0;
    this.hitstop = 0;
    this.clearWorld();
    this.resetShip(true);
    this.startWave(1);
    this.setPhase("playing");
    useHud.getState().resetRun();
    this.syncHud(true);
  }

  togglePause() {
    if (this.phase === "playing") this.setPhase("paused");
    else if (this.phase === "paused") {
      this.audio.unlock();
      this.setPhase("playing");
    }
  }

  resume() {
    if (this.phase === "paused") {
      this.audio.unlock();
      this.setPhase("playing");
    }
  }

  toTitle() {
    this.clearWorld();
    this.resetShip(true);
    this.setPhase("title");
    this.banner = "";
    this.syncHud(true);
  }

  toScores() {
    this.setPhase("scores");
  }

  submitName(name: string) {
    const scores = submitScore({
      name: (name || "ACE").slice(0, 3).toUpperCase(),
      score: this.score,
      wave: this.wave,
    });
    useHud.getState().patch({ highScores: scores, pendingName: false, phase: "scores" });
    this.phase = "scores";
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    useHud.getState().patch({ phase });
  }

  private loadSheets() {
    for (const name of SPRITES) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const sheet: Sheet = { img, ready: false };
      img.onload = () => {
        sheet.ready = true;
      };
      img.src = `/sprites/${name}.png`;
      this.sheets.set(name, sheet);
    }
  }

  private fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.spawnX = this.w * 0.5;
    if (this.phase !== "playing") {
      this.player.x = this.w * 0.5;
      this.player.y = this.h * 0.72;
    }
  }

  private seedStars() {
    this.stars = [];
    for (let i = 0; i < 160; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        z: i % 3,
        s: i % 3 === 2 ? 2.2 : i % 3 === 1 ? 1.4 : 0.9,
      });
    }
  }

  private installProbe() {
    window.__controlsTest = {
      getYaw: () => (this.spawnX - this.player.x) * 0.008,
      getSpeed: () => Math.hypot(this.player.vx, this.player.vy),
      setKeys: (codes) => this.input.setKeys(codes),
    };
  }

  private resetShip(center: boolean) {
    const p = this.player;
    if (center) {
      p.x = this.w * 0.5;
      p.y = this.h * 0.72;
    }
    p.vx = 0;
    p.vy = 0;
    p.aim = -Math.PI / 2;
    p.fire = 0;
    p.invuln = center ? 0 : 1.8;
    p.shield = 0;
    p.multi = 0;
    p.speed = 0;
    p.blink = 0;
    p.alive = true;
    this.spawnX = p.x;
  }

  private clearWorld() {
    for (const a of [this.bullets, this.enemies, this.pickups, this.particles, this.flashes, this.booms, this.floaters]) {
      for (const it of a) it.alive = false;
    }
    this.waveQ = [];
    this.remaining = 0;
  }

  private startWave(n: number) {
    this.wave = n;
    this.waveQ = [];
    const scouts = 5 + n * 2;
    const fighters = Math.max(0, n - 1);
    const heavies = n % 5 === 0 ? 1 + Math.floor(n / 10) : n > 7 && n % 3 === 0 ? 1 : 0;
    let t = 0.2;
    for (let i = 0; i < scouts; i++) {
      this.waveQ.push({ kind: "scout", wait: t });
      t += 0.28;
    }
    for (let i = 0; i < fighters; i++) {
      this.waveQ.push({ kind: "fighter", wait: t });
      t += 0.55;
    }
    for (let i = 0; i < heavies; i++) {
      this.waveQ.push({ kind: "heavy", wait: t });
      t += 0.9;
    }
    this.remaining = this.waveQ.length;
    this.waveWait = 0;
    this.banner = `WAVE ${String(n).padStart(2, "0")}`;
    this.bannerT = 1.8;
    this.audio.wave();
  }

  private step(dt: number) {
    this.time += dt;
    const hud = useHud.getState();
    const actions = this.input.sample(this.player.x, this.player.y);

    if (this.phase === "playing" && actions.pausePressed) this.togglePause();
    else if (this.phase === "paused" && actions.pausePressed) this.resume();

    if (this.phase === "title" || this.phase === "scores" || this.phase === "over") {
      this.idleMenu(dt);
      this.syncHud();
      return;
    }
    if (this.phase === "paused") {
      this.syncHud();
      return;
    }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.advanceFx(dt * 0.35);
      this.syncHud();
      return;
    }

    this.steerPlayer(dt, actions);
    this.firePlayer(dt);
    this.driveWave(dt);
    this.stepEnemies(dt);
    this.stepBullets(dt);
    this.stepPickups(dt);
    this.advanceFx(dt);
    this.collide();
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.bannerT > 0) this.bannerT -= dt;
    else this.banner = "";
    this.syncHud();
  }

  private idleMenu(dt: number) {
    this.player.aim = -Math.PI / 2 + Math.sin(this.time * 0.7) * 0.12;
    this.advanceFx(dt);
    this.trauma = Math.max(0, this.trauma - dt);
  }

  private steerPlayer(dt: number, actions: ReturnType<Input["sample"]>) {
    const p = this.player;
    const boosted = p.speed > 0;
    const speed = (boosted ? 430 : 290) * (this.w / 900);
    let mx = actions.moveX;
    let my = actions.moveY;
    if (actions.pointerDown && !this.input.stickActive) {
      const dx = actions.aimX - p.x;
      const dy = actions.aimY - p.y;
      const m = Math.hypot(dx, dy);
      if (m > 18) {
        mx += dx / m;
        my += dy / m;
      }
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const tx = mx * speed;
    const ty = my * speed;
    p.vx = lerpExp(p.vx, tx, 12, dt);
    p.vy = lerpExp(p.vy, ty, 12, dt);
    p.x = clamp(p.x + p.vx * dt, p.r + 8, this.w - p.r - 8);
    p.y = clamp(p.y + p.vy * dt, p.r + 8, this.h - p.r - 8);

    let ax = actions.aimX - p.x;
    let ay = actions.aimY - p.y;
    if (!actions.hasAim) {
      const near = this.nearestEnemy();
      if (near) {
        ax = near.x - p.x;
        ay = near.y - p.y;
      } else {
        ax = 0;
        ay = -1;
      }
    }
    p.aim = Math.atan2(ay, ax);

    p.invuln = Math.max(0, p.invuln - dt);
    p.shield = Math.max(0, p.shield - dt);
    p.multi = Math.max(0, p.multi - dt);
    p.speed = Math.max(0, p.speed - dt);
    p.blink += dt;
    p.fire = Math.max(0, p.fire - dt);

    if (mag > 0.2) {
      this.trail(p.x - Math.cos(p.aim) * 14, p.y - Math.sin(p.aim) * 14, p.aim);
    }
  }

  private firePlayer(dt: number) {
    const p = this.player;
    if (!p.alive) return;
    if (p.fire > 0) return;
    const rate = p.speed > 0 ? 0.11 : 0.15;
    p.fire = rate;
    const shots = p.multi > 6 ? 5 : p.multi > 0 ? 3 : 1;
    const spread = shots === 1 ? 0 : shots === 3 ? 0.18 : 0.28;
    const speed = 760 * (this.w / 900);
    for (let i = 0; i < shots; i++) {
      const t = shots === 1 ? 0 : (i / (shots - 1) - 0.5) * 2 * spread;
      const ang = p.aim + t;
      this.spawnBullet(p.x + Math.cos(ang) * 22, p.y + Math.sin(ang) * 22, Math.cos(ang) * speed, Math.sin(ang) * speed, true);
    }
    take(this.flashes, (f) => {
      f.x = p.x + Math.cos(p.aim) * 24;
      f.y = p.y + Math.sin(p.aim) * 24;
      f.ang = p.aim;
      f.t = 0;
      f.max = 0.1;
    });
    this.audio.shoot();
    void dt;
  }

  private spawnBullet(x: number, y: number, vx: number, vy: number, friendly: boolean) {
    take(this.bullets, (b) => {
      b.x = x;
      b.y = y;
      b.vx = vx;
      b.vy = vy;
      b.life = friendly ? 1.1 : 2.4;
      b.r = friendly ? 5 : 6;
      b.friendly = friendly;
    });
  }

  private driveWave(dt: number) {
    this.waveWait += dt;
    while (this.waveQ.length && this.waveWait >= this.waveQ[0]!.wait) {
      const next = this.waveQ.shift()!;
      this.spawnEnemy(next.kind);
    }
    if (this.waveQ.length === 0 && this.remaining <= 0) {
      this.score += 500 * this.wave;
      this.floater(this.player.x, this.player.y - 40, `+${500 * this.wave}`);
      this.startWave(this.wave + 1);
    }
  }

  private spawnEnemy(kind: Kind) {
    const edge = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (edge === 0) {
      x = -30;
      y = Math.random() * this.h;
    } else if (edge === 1) {
      x = this.w + 30;
      y = Math.random() * this.h;
    } else if (edge === 2) {
      x = Math.random() * this.w;
      y = -30;
    } else {
      x = Math.random() * this.w;
      y = this.h + 30;
    }
    const stats =
      kind === "scout"
        ? { hp: 1, r: 14 }
        : kind === "fighter"
          ? { hp: 3 + Math.floor(this.wave / 4), r: 18 }
          : { hp: 12 + this.wave, r: 26 };
    const spawned = take(this.enemies, (e) => {
      e.kind = kind;
      e.x = x;
      e.y = y;
      e.vx = 0;
      e.vy = 0;
      e.hp = stats.hp;
      e.r = stats.r;
      e.fire = 0.4 + Math.random();
      e.flash = 0;
      e.frame = Math.random() * 4;
    });
    if (!spawned) this.remaining = Math.max(0, this.remaining - 1);
  }

  private stepEnemies(dt: number) {
    const p = this.player;
    const scale = this.w / 900;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.frame += dt * 6;
      e.flash = Math.max(0, e.flash - dt);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      let sepX = 0;
      let sepY = 0;
      for (const o of this.enemies) {
        if (!o.alive || o === e) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const d2 = ox * ox + oy * oy;
        if (d2 < 70 * 70 && d2 > 1) {
          sepX += ox / d2;
          sepY += oy / d2;
        }
      }
      const spd = (e.kind === "scout" ? 170 : e.kind === "fighter" ? 120 : 70) * scale;
      let wantX = ux;
      let wantY = uy;
      if (e.kind === "fighter" && dist < 220) {
        wantX = -uy;
        wantY = ux;
      }
      e.vx = lerpExp(e.vx, wantX * spd + sepX * 1400, 4, dt);
      e.vy = lerpExp(e.vy, wantY * spd + sepY * 1400, 4, dt);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.fire -= dt;
      if (e.kind !== "scout" && e.fire <= 0 && dist < 620) {
        e.fire = e.kind === "heavy" ? 1.6 - Math.min(0.5, this.wave * 0.04) : 1.1 - Math.min(0.4, this.wave * 0.03);
        const bspd = 240 * scale;
        if (e.kind === "heavy") {
          for (const t of [-0.28, 0, 0.28]) {
            const a = Math.atan2(uy, ux) + t;
            this.spawnBullet(e.x, e.y, Math.cos(a) * bspd, Math.sin(a) * bspd, false);
          }
        } else {
          this.spawnBullet(e.x, e.y, ux * bspd * 1.15, uy * bspd * 1.15, false);
        }
      }
    }
  }

  private stepBullets(dt: number) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -40 || b.y < -40 || b.x > this.w + 40 || b.y > this.h + 40) b.alive = false;
    }
  }

  private stepPickups(dt: number) {
    const p = this.player;
    for (const u of this.pickups) {
      if (!u.alive) continue;
      u.t += dt;
      u.y += Math.sin(u.t * 3) * 8 * dt;
      if (u.t > 12) u.alive = false;
      if (hit(u.x, u.y, 16, p.x, p.y, p.r)) {
        u.alive = false;
        this.grant(u.kind);
      }
    }
  }

  private grant(kind: PickupKind) {
    const p = this.player;
    if (kind === "multi") p.multi = Math.min(14, p.multi + 8);
    if (kind === "shield") p.shield = Math.max(p.shield, 8);
    if (kind === "speed") p.speed = Math.max(p.speed, 9);
    if (kind === "life") this.lives = Math.min(6, this.lives + 1);
    this.audio.pickup();
    this.floater(p.x, p.y - 28, kind.toUpperCase());
  }

  private advanceFx(dt: number) {
    for (const s of this.stars) {
      const speed = (s.z === 0 ? 18 : s.z === 1 ? 42 : 78) + this.player.vy * 0.04 * (s.z + 1);
      s.y = (s.y * this.h + speed * dt) / this.h;
      s.x -= (this.player.vx * 0.00004 * (s.z + 1) * dt * 60);
      if (s.y > 1) s.y -= 1;
      if (s.y < 0) s.y += 1;
      if (s.x > 1) s.x -= 1;
      if (s.x < 0) s.x += 1;
    }
    for (const pt of this.particles) {
      if (!pt.alive) continue;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) pt.alive = false;
    }
    for (const f of this.flashes) {
      if (!f.alive) continue;
      f.t += dt;
      if (f.t >= f.max) f.alive = false;
    }
    for (const f of this.booms) {
      if (!f.alive) continue;
      f.t += dt;
      if (f.t >= f.max) f.alive = false;
    }
    for (const f of this.floaters) {
      if (!f.alive) continue;
      f.y -= 28 * dt;
      f.t -= dt;
      if (f.t <= 0) f.alive = false;
    }
  }

  private collide() {
    const p = this.player;
    for (const b of this.bullets) {
      if (!b.alive || !b.friendly) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (hit(b.x, b.y, b.r, e.x, e.y, e.r)) {
          b.alive = false;
          this.hurtEnemy(e, 1);
          break;
        }
      }
    }
    if (!p.alive) return;
    const vulnerable = p.invuln <= 0;
    for (const b of this.bullets) {
      if (!b.alive || b.friendly) continue;
      if (hit(b.x, b.y, b.r, p.x, p.y, p.r)) {
        b.alive = false;
        if (vulnerable) this.hurtPlayer();
      }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (hit(e.x, e.y, e.r * 0.8, p.x, p.y, p.r) && vulnerable) this.hurtPlayer();
    }
  }

  private hurtEnemy(e: Enemy, dmg: number) {
    e.hp -= dmg;
    e.flash = 0.08;
    this.hitstop = Math.max(this.hitstop, 0.03);
    this.spark(e.x, e.y, "#f4f4f5", 4);
    if (e.hp <= 0) {
      e.alive = false;
      this.remaining = Math.max(0, this.remaining - 1);
      const pts = e.kind === "scout" ? 100 : e.kind === "fighter" ? 250 : 800;
      this.score += pts;
      this.floater(e.x, e.y, `+${pts}`);
      this.explode(e.x, e.y, e.kind === "heavy" ? 1 : 0.7);
      this.maybeDrop(e.x, e.y);
    }
  }

  private hurtPlayer() {
    const p = this.player;
    if (p.shield > 0) {
      p.shield = 0;
      p.invuln = 0.8;
      this.audio.shieldBreak();
      this.addTrauma(0.35);
      this.spark(p.x, p.y, "#6ee7f0", 10);
      return;
    }
    this.lives -= 1;
    p.invuln = 1.8;
    this.addTrauma(0.7);
    this.hitstop = 0.08;
    this.audio.hit();
    this.explode(p.x, p.y, 0.85);
    if (this.lives <= 0) this.gameOver();
  }

  private gameOver() {
    this.audio.death();
    this.player.alive = false;
    this.banner = "SIGNAL LOST";
    this.bannerT = 2;
    const pending = qualifies(this.score);
    this.phase = "over";
    useHud.getState().patch({
      phase: "over",
      lastScore: this.score,
      lastWave: this.wave,
      pendingName: pending,
      lives: 0,
    });
  }

  private maybeDrop(x: number, y: number) {
    if (Math.random() > 0.16) return;
    const roll = Math.random();
    const kind: PickupKind = roll < 0.34 ? "multi" : roll < 0.62 ? "shield" : roll < 0.9 ? "speed" : "life";
    take(this.pickups, (u) => {
      u.kind = kind;
      u.x = x;
      u.y = y;
      u.t = 0;
    });
  }

  private explode(x: number, y: number, power: number) {
    take(this.booms, (f) => {
      f.x = x;
      f.y = y;
      f.ang = Math.random() * Math.PI;
      f.t = 0;
      f.max = 0.32 * power + 0.12;
    });
    this.spark(x, y, "#e25a4a", 10 + power * 8);
    this.spark(x, y, "#f4e2c0", 6);
    this.addTrauma(0.28 * power);
    this.audio.explode();
  }

  private spark(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 180;
      take(this.particles, (pt) => {
        pt.x = x;
        pt.y = y;
        pt.vx = Math.cos(a) * s;
        pt.vy = Math.sin(a) * s;
        pt.life = 0.25 + Math.random() * 0.4;
        pt.max = pt.life;
        pt.size = 1.5 + Math.random() * 2.5;
        pt.color = color;
      });
    }
  }

  private trail(x: number, y: number, aim: number) {
    take(this.particles, (pt) => {
      pt.x = x + (Math.random() - 0.5) * 6;
      pt.y = y + (Math.random() - 0.5) * 6;
      pt.vx = -Math.cos(aim) * 40;
      pt.vy = -Math.sin(aim) * 40;
      pt.life = 0.18;
      pt.max = 0.18;
      pt.size = 2;
      pt.color = "#6ee7f0";
    });
  }

  private floater(x: number, y: number, text: string) {
    take(this.floaters, (f) => {
      f.x = x;
      f.y = y;
      f.t = 0.7;
      f.text = text;
    });
  }

  private addTrauma(v: number) {
    if (this.reduced || !useHud.getState().shake) return;
    this.trauma = clamp(this.trauma + v, 0, 1);
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let d = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dd = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (dd < d) {
        d = dd;
        best = e;
      }
    }
    return best;
  }

  private syncHud(force = false) {
    this.hudClock += force ? 99 : STEP;
    if (this.hudClock < 0.08 && !force) return;
    this.hudClock = 0;
    useHud.getState().patch({
      score: this.score,
      lives: this.lives,
      wave: this.wave,
      banner: this.bannerT > 0 ? this.banner : "",
      shield: this.player.shield,
      multi: this.player.multi,
      speed: this.player.speed,
    });
  }

  private draw() {
    const { ctx, w, h } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#07070a";
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    g.addColorStop(0, "#12141c");
    g.addColorStop(1, "#07070a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const shake = this.trauma * this.trauma;
    const ox = shake ? (Math.random() * 2 - 1) * 14 * shake : 0;
    const oy = shake ? (Math.random() * 2 - 1) * 14 * shake : 0;
    ctx.save();
    ctx.translate(ox, oy);

    this.drawStars();
    for (const u of this.pickups) if (u.alive) this.drawPickup(u);
    for (const b of this.bullets) if (b.alive && !b.friendly) this.drawBolt(b, "bolt-enemy", 22);
    for (const e of this.enemies) if (e.alive) this.drawEnemy(e);
    for (const b of this.bullets) if (b.alive && b.friendly) this.drawBolt(b, "bolt-player", 20);
    if (this.player.alive) this.drawPlayer();
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.flashes) if (f.alive) this.drawSheet("muzzle", Math.min(3, Math.floor((f.t / f.max) * 4)), f.x, f.y, f.ang + Math.PI / 2, 36);
    for (const f of this.booms) if (f.alive) this.drawSheet("explode", Math.min(3, Math.floor((f.t / f.max) * 4)), f.x, f.y, f.ang, 28 + 70 * (f.t / f.max));
    for (const pt of this.particles) if (pt.alive) {
      ctx.globalAlpha = pt.life / pt.max;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `${Math.round(13 * (w / 900))}px Oxanium, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#eceef2";
    for (const f of this.floaters) if (f.alive) {
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawStars() {
    const { ctx, w, h } = this;
    for (const s of this.stars) {
      const a = s.z === 0 ? 0.28 : s.z === 1 ? 0.5 : 0.85;
      ctx.fillStyle = `rgba(236,238,242,${a})`;
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
  }

  private drawPlayer() {
    const p = this.player;
    if (p.invuln > 0 && Math.floor(p.blink * 16) % 2 === 0) {
      /* blink */
    } else {
      this.drawSheet("player", Math.floor(this.time * 8) % 4, p.x, p.y, p.aim + Math.PI / 2, 46);
    }
    if (p.shield > 0) {
      const pulse = 58 + Math.sin(this.time * 8) * 3;
      this.drawSheet("shield", Math.floor(this.time * 6) % 4, p.x, p.y, 0, pulse);
    }
  }

  private drawEnemy(e: Enemy) {
    const name = e.kind;
    const size = e.kind === "scout" ? 36 : e.kind === "fighter" ? 48 : 64;
    const ang = Math.atan2(e.vy, e.vx) + Math.PI / 2;
    if (e.flash > 0) {
      this.ctx.save();
      this.ctx.filter = "brightness(2.4)";
      this.drawSheet(name, Math.floor(e.frame) % 4, e.x, e.y, ang, size);
      this.ctx.restore();
    } else {
      this.drawSheet(name, Math.floor(e.frame) % 4, e.x, e.y, ang, size);
    }
  }

  private drawBolt(b: Bullet, sheet: string, size: number) {
    const ang = Math.atan2(b.vy, b.vx) + Math.PI / 2;
    this.drawSheet(sheet, Math.floor(this.time * 16) % 4, b.x, b.y, ang, size);
  }

  private drawPickup(u: Pickup) {
    const idx = u.kind === "multi" ? 0 : u.kind === "shield" ? 1 : u.kind === "speed" ? 2 : 3;
    this.drawSheet("pickups", idx, u.x, u.y, Math.sin(u.t * 2) * 0.2, 34);
  }

  private drawSheet(name: string, frame: number, x: number, y: number, rot: number, size: number) {
    const sheet = this.sheets.get(name);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (sheet?.ready) {
      const col = frame % 2;
      const row = Math.floor(frame / 2) % 2;
      ctx.drawImage(sheet.img, col * CELL, row * CELL, CELL, CELL, -size / 2, -size / 2, size, size);
    } else {
      ctx.fillStyle = name.includes("bolt") ? "#6ee7f0" : "#c5ccd6";
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 3, size / 2);
      ctx.lineTo(-size / 3, size / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    void SHEET;
  }
}
