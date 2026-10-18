// The mountain, drawn on a canvas in the alpine-cartoon style: chunky ink outlines that "boil", squash and
// stretch, a follow-cam with parallax. The scene only animates what it's told (src/director.ts reads the
// book and calls these beats); it never decides anything about a round.
import type { Window } from './book';
import { play } from './sound';

export const TOP = 25;
// Step size. Portrait screens get narrower, taller steps so the ridge climbs up the screen instead of
// leaving it mostly sky; the odds never depend on how the ridge is drawn.
let SW = 104, SH = 46;
let PORTRAIT = false;
const CAP = 30;
const edgeX = () => (TOP + 1) * SW;
const stepTop = (i: number) => -Math.max(0, Math.min(i, TOP)) * SH;
/** Where Ueli stands on step i: toward its back, leaving room to walk to the edge before the next hop. */
const stand = (i: number) => (i > TOP ? { x: edgeX() + 50, y: stepTop(TOP) } : { x: i * SW + SW * 0.35, y: stepTop(i) });
/** Phones: narrow steps so the whole ridge fits between rounds, twice as wide once the camera zooms in on the climb. */
const PORTRAIT_SW = { overview: 58, climb: 116 };
/** The cloud wipe's timing (ms): sweep in, hold while the ridge and camera swap, sweep out. */
const WIPE = { cover: 380, hold: 120, reveal: 420 };
/** What's underfoot on a step, for footstep sounds: 0 grass, 1 rock, 2 snow (matching the caps). */
const groundAt = (i: number) => (i <= 9 ? 0 : i <= 19 ? 1 : 2);
const topAtX = (x: number) => stepTop(Math.max(0, Math.min(TOP, Math.floor(x / SW))));
/** The whole ridge, flags included, for the overview camera. */
const ridge = () =>
  PORTRAIT ? { x0: -90, x1: edgeX() + 110, y0: stepTop(TOP) - 160, y1: 40 } : { x0: -260, x1: edgeX() + 220, y0: stepTop(TOP) - 170, y1: 60 };

const C = {
  ink: '#24152E', grass: '#6CCB57', grassD: '#3F9446', rock: '#B3A3D2', rockD: '#8676A8', snow: '#FFFFFF', snowD: '#C6CFF2',
  mass: '#5C4B80', massD: '#47396A', gold: '#FFC93C', red: '#E2383F', skin: '#F7C8A0', nose: '#EE8F78', mous: '#7A4325',
  hat: '#2F7D4F', wood: '#C98B4B', woodD: '#8E5A2C', vest: '#E2383F', breeches: '#F4B740', boot: '#3A2416', goat: '#F5EEE2',
  dog: '#B9652F', cream: '#FFF4DF',
};
export type Weather = 'sun' | 'fog' | 'storm';
const SKY: Record<Weather, { sky: string[]; far: string; farSnow: string; mid: string; midSnow: string; cloud: string }> = {
  sun: { sky: ['#1F5E99', '#59A3D2', '#FFC98B', '#FF9A6A'], far: '#E5949F', farSnow: '#FFEDEF', mid: '#7A68A8', midSnow: '#F1ECFF', cloud: '#FFF3E6' },
  fog: { sky: ['#7F91A6', '#A9B7C5', '#D3D9DB', '#E2E0DA'], far: '#9CA8B7', farSnow: '#EEF1F4', mid: '#7A8597', midSnow: '#E6EAF0', cloud: '#F2F4F4' },
  storm: { sky: ['#141933', '#2A315E', '#4C4879', '#685884'], far: '#4A4E7D', farSnow: '#B7BCE0', mid: '#383A64', midSnow: '#A6ABD6', cloud: '#767BA2' },
};
const FD = '"Luckiest Guy", "Arial Black", Impact, sans-serif';
const FU = '"Baloo 2", "Trebuchet MS", sans-serif';

const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const backOut = (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);

const DECO = Array.from({ length: TOP + 1 }, (_, i) => ({ tufts: [hash(i) * 0.8 + 0.1, hash(i + 40) * 0.8 + 0.1], rock: hash(i + 90) > 0.55, rockX: hash(i + 120) * 0.6 + 0.2 }));
const range = (seed: number, n: number, amp: number) =>
  Array.from({ length: n }, (_, k) => {
    const x = k * 40;
    return -amp * (0.55 + 0.45 * Math.sin(x * 0.0042 + seed) * Math.cos(x * 0.0011 + seed * 2) + 0.25 * Math.sin(x * 0.019 + seed * 3) + 0.08 * Math.sin(x * 0.07));
  });
const FAR = range(1.3, 101, 190), MID = range(4.1, 101, 140);
const CLOUDS = Array.from({ length: 7 }, (_, k) => ({ x: k * 620 + hash(k) * 300, y: 70 + hash(k + 7) * 120, s: 0.7 + hash(k + 3) * 0.6 }));

type Face = 'happy' | 'scared' | 'dizzy' | 'yodel' | 'plain';
type Pose = 'idle' | 'hop' | 'teeter';
interface Ueli { x: number; y: number; step: number; rot: number; sq: number; lean: number; ring: number; swing: number; face: Face; horn: number; walk: number; dir: number; pose: Pose }
interface Particle { type: string; x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; size: number; rot: number; vr: number; color?: string }
interface Pop { x: number; y: number; text: string; color: string; size: number; t: number; life: number }
interface Card { text: string; sub: string; color: string; t: number; dur: number; big: boolean; y: number; size: number }
interface Goat { step: number; say: string; sayT: number; hop: number }
interface Gondola { A: { x: number; y: number }; B: { x: number; y: number }; x: number; y: number }
interface Ball { x0: number; r: number; x: number; y: number; rot: number }
interface Dog { x: number; y: number; dir: number; running: boolean }
interface Ring { x: number; y: number; r: number; a: number; k: number }
interface Task { t: number; ms: number; fn: (p: number) => void; ease: (p: number) => number; res: () => void }
type FlyerKind = 'paraglider' | 'eagle' | 'birds' | 'balloon' | 'helicopter' | 'plane';
interface Flyer { kind: FlyerKind; x: number; y: number; vx: number; vy: number; s: number; t: number; hue: number }

/** Where along the ridge (0..1) the cave and the waterfall sit in the cliff. */
const CAVE_AT = 0.52, FALL_AT = 0.27;

const freshUeli = (): Ueli => ({ x: stand(0).x, y: 0, step: 0, rot: 0, sq: 0, lean: 0, ring: 0, swing: 0, face: 'happy', horn: 0, walk: 0, dir: 1, pose: 'idle' });

export class Scene {
  private ctx: CanvasRenderingContext2D;
  /** Logical size: the short side is fixed, the long side follows the viewport. */
  private W = 960;
  private H = 540;
  /** Screen space the HTML controls cover, in logical units, so the camera frames the ridge above them. */
  private inset = { top: 0, bottom: 0 };
  private reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private tasks: Task[] = [];
  private last = 0;

  clock = 0;
  /** Turbo multiplies the game clock; slow motion (tension) divides it. */
  speed = 1;
  private scale = 1;
  private scaleTarget = 1;
  private tension = 0;
  private tensionTarget = 0;
  private lastBeat = 0;
  private cam = { x: 0, y: 0, z: 0.3 };
  mode: 'overview' | 'follow' | 'fall' = 'overview';
  private shake = 0;
  private flash = 0;
  private nextBolt = 4000;
  weather: Weather = 'sun';
  busy = false;
  private window: Window | null = null;
  private u = freshUeli();
  private parts: Particle[] = [];
  private sparts: Particle[] = [];
  private pops: Pop[] = [];
  private cards: Card[] = [];
  /** Blooms picked this round (hidden ones never show until he reaches them). */
  picked: { step: number; golden: boolean }[] = [];
  private goats: Goat[] = [{ step: 6, say: '', sayT: 0, hop: 0 }, { step: 15, say: '', sayT: 0, hop: 0 }, { step: 21, say: '', sayT: 0, hop: 0 }];
  private cabin: Gondola | null = null;
  private balls: Ball[] = [];
  private dog: Dog | null = null;
  private rope = false;
  private rings: Ring[] = [];
  private wind = 0;
  private windDir = 1;
  private marmot: { x: number; y: number; up: number } | null = null;
  private win: { text: string; sub: string; amount: number; shown: number; format: (v: number) => string } | null = null;
  private flyers: Flyer[] = [];
  /** The step counter: spins to a climb's step count, then counts down as he walks. */
  private reel: { climb: number | 'echo'; pos: number; target: number; remaining: number | null; alpha: number; drop: number; dock: number; swing: number; note: string } | null = null;
  private wipe: { t: number; swapped: boolean; swap: () => void; done: () => void } | null = null;
  private nextFlyer = 1500;

  /** Dragging the window on the mountain: called with the step under the pointer. */
  onDrag: ((step: number) => void) | null = null;
  /** Tapping the sign's ◀ ▶ arrows: -1 or +1. */
  onNudge: ((dir: number) => void) | null = null;
  dragEnabled = true;
  private dragging = false;
  /** What the window pays and how often it wins, for the sign above it. */
  private info: { pay: string; odds: string } | null = null;
  /** Where the sign was last drawn (logical screen units), for tapping its arrows. */
  private sign: { x: number; y: number; w: number; h: number; arrows: boolean } | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.cam = { ...this.overview() };
    this.wireDrag();
    requestAnimationFrame((t) => { this.last = t; requestAnimationFrame(this.frame); });
  }

  // ---------- layout ----------
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    const aspect = r.width / Math.max(1, r.height);
    if (aspect >= 1) { this.H = 540; this.W = 540 * aspect; } else { this.W = 600; this.H = 600 / aspect; }
    const portrait = aspect < 0.8;
    if (portrait !== PORTRAIT) {
      PORTRAIT = portrait;
      [SW, SH] = portrait ? [this.mode === 'overview' ? PORTRAIT_SW.overview : PORTRAIT_SW.climb, 84] : [104, 46];
      // (between rounds Ueli just moves with his step; mid-round the next hop catches up)
      if (this.u) this.placeAt(this.u.step);
    }
  }
  /** How much of the canvas the HTML controls cover, in CSS pixels. */
  setInsets(topPx: number, bottomPx: number) {
    const r = this.canvas.getBoundingClientRect();
    const k = this.H / Math.max(1, r.height);
    this.inset = { top: topPx * k, bottom: bottomPx * k };
  }
  private overview() {
    const viewH = this.H - this.inset.top - this.inset.bottom - 30;
    const R = ridge();
    const z = Math.min(this.W / (R.x1 - R.x0), viewH / (R.y1 - R.y0));
    return { x: (R.x0 + R.x1) / 2, y: (R.y0 + R.y1) / 2 + ((this.inset.bottom - this.inset.top) / 2) / z, z };
  }

  // ---------- dragging the window in frame ----------
  private wireDrag() {
    const c = this.canvas;
    const local = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * this.W, y: ((e.clientY - r.top) / r.height) * this.H };
    };
    const stepAt = (e: PointerEvent) => Math.floor(((local(e).x - this.W / 2) / this.cam.z + this.cam.x) / SW);
    const can = () => this.dragEnabled && !this.busy && this.mode === 'overview' && this.window !== 'edge';
    /** -1 or +1 when the point is on one of the sign's arrows, else 0. */
    const arrowAt = (p: { x: number; y: number }) => {
      const g = this.sign;
      if (!g?.arrows || p.y < g.y || p.y > g.y + g.h) return 0;
      if (p.x >= g.x && p.x <= g.x + g.h) return -1;
      if (p.x <= g.x + g.w && p.x >= g.x + g.w - g.h) return 1;
      return 0;
    };
    c.addEventListener('pointerdown', (e) => {
      if (!can()) return;
      const dir = arrowAt(local(e));
      if (dir) { this.onNudge?.(dir); return; }
      this.dragging = true;
      c.setPointerCapture(e.pointerId);
      this.onDrag?.(stepAt(e));
    });
    c.addEventListener('pointermove', (e) => {
      c.style.cursor = !can() ? 'default' : arrowAt(local(e)) ? 'pointer' : this.dragging ? 'grabbing' : 'grab';
      if (this.dragging && can()) this.onDrag?.(stepAt(e));
    });
    const stop = () => { this.dragging = false; };
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);
  }

  setWindow(w: Window | null, info: { pay: string; odds: string } | null = null) {
    const changed = JSON.stringify(w) !== JSON.stringify(this.window);
    this.window = w;
    this.info = info;
    if (changed && this.dragging) play('tick');
  }

  // ---------- tweens on the game clock ----------
  tween(ms: number, fn: (p: number) => void, ease: (p: number) => number = (x) => x): Promise<void> {
    return new Promise((res) => { this.tasks.push({ t: 0, ms: Math.max(1, ms), fn, ease, res }); fn(ease(0)); });
  }
  sleep = (ms: number) => this.tween(ms, () => {});
  private runTasks(dt: number) {
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const k = this.tasks[i];
      k.t += dt;
      const p = Math.min(1, k.t / k.ms);
      k.fn(k.ease(p));
      if (p >= 1) { this.tasks.splice(i, 1); k.res(); }
    }
  }

  // ---------- frame loop ----------
  private frame = (now: number) => {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    const sdt = dt * this.scale * this.speed;
    this.clock += sdt;
    this.runTasks(sdt);
    this.update(sdt, dt);
    this.render();
    requestAnimationFrame(this.frame);
  };

  private update(sdt: number, dt: number) {
    this.scale += (this.scaleTarget - this.scale) * Math.min(1, dt * 0.006);
    this.tension += (this.tensionTarget - this.tension) * Math.min(1, dt * 0.005);
    const u = this.u;
    if (this.wipe) {
      this.wipe.t += dt;
      if (!this.wipe.swapped && this.wipe.t >= WIPE.cover) { this.wipe.swapped = true; this.wipe.swap(); }
      if (this.wipe.t >= WIPE.cover + WIPE.hold + WIPE.reveal) { this.wipe.done(); this.wipe = null; }
    }
    const t = this.camTarget();
    // Follow tighter than the overview swoop, so fast moves (gondola, echo) never leave him off screen
    const stiff = this.mode === 'overview' ? 0.0045 : 0.009;
    const k = 1 - Math.exp(-dt * stiff * this.speed), kz = 1 - Math.exp(-dt * 0.0032 * this.speed);
    this.cam.x = lerp(this.cam.x, t.x, k); this.cam.y = lerp(this.cam.y, t.y, k); this.cam.z = lerp(this.cam.z, t.z, kz);
    u.sq *= Math.exp(-sdt * 0.012);
    u.ring = Math.max(0, u.ring - sdt / 380);
    u.swing = Math.sin(this.clock / 70) * u.ring;
    if (this.tension > 0.5 && performance.now() - this.lastBeat > 820) { this.lastBeat = performance.now(); play('heart'); }
    const move = (list: Particle[], d: number) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= d;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vy += (p.g * d) / 1000; p.x += (p.vx * d) / 1000; p.y += (p.vy * d) / 1000; p.rot += (p.vr * d) / 1000;
      }
    };
    move(this.parts, sdt);
    move(this.sparts, dt);
    this.pops = this.pops.filter((p) => (p.t += sdt) < p.life);
    this.cards = this.cards.filter((c) => (c.t += dt * this.speed) < c.dur);
    this.goats.forEach((g) => { g.sayT = Math.max(0, g.sayT - sdt); g.hop = Math.max(0, g.hop - sdt / 400); });
    this.shake = Math.max(0, this.shake - dt / 600);
    this.flash = Math.max(0, this.flash - dt / 350);
    if (this.weather === 'storm') {
      if (Math.random() < dt / 60) this.sparts.push({ type: 'snow', x: Math.random() * this.W, y: -10, vx: -60 - Math.random() * 60, vy: 90 + Math.random() * 60, g: 0, life: 7000, max: 7000, size: 2 + Math.random() * 3, rot: 0, vr: 0 });
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.flash = this.reduce ? 0 : 0.7; this.nextBolt = 5000 + Math.random() * 6000; if (this.busy) play('thunder'); }
    }
    if (this.wind > 0.05 && Math.random() < dt / 25) this.sparts.push({ type: 'wind', x: this.windDir > 0 ? -60 : this.W + 60, y: 60 + Math.random() * (this.H - 120), vx: 1100 * this.windDir, vy: 0, g: 0, life: 1200, max: 1200, size: 40 + Math.random() * 80, rot: 0, vr: 0 });
    if (!this.busy && Math.random() < dt / 9000) this.goatSay(Math.floor(Math.random() * 3), ['Mäh!', 'Go on then!', 'Hopp Schwiiz!', 'Mäh-mäh!'][Math.floor(Math.random() * 4)], false);
    if (this.win) this.win.shown = lerp(this.win.shown, this.win.amount, 1 - Math.exp(-dt * 0.004));
    this.nextFlyer -= dt;
    if (this.nextFlyer <= 0 && this.flyers.length < 2) { this.spawnFlyer(); this.nextFlyer = 5000 + Math.random() * 8000; }
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt; f.x += (f.vx * dt) / 1000; f.y += (f.vy * dt) / 1000;
      if (f.x < -300 || f.x > this.W + 300) this.flyers.splice(i, 1);
    }
  }

  /** Where the camera wants to be for the current mode. */
  private camTarget() {
    const u = this.u;
    if (this.mode === 'overview') return this.overview();
    if (this.mode === 'fall') return { x: u.x - 40, y: u.y - 90, z: 0.85 };
    const z = lerp(1.05, 1.45, this.tension) * (PORTRAIT ? 1 : Math.min(1, this.W / 700));
    // Look ahead, up the ridge: sideways in landscape, upward in portrait where the ridge climbs the screen
    const ahead = PORTRAIT ? { x: 60, y: (this.H - this.inset.top - this.inset.bottom) * 0.2 } : { x: 120, y: 100 };
    return { x: u.x + ahead.x / z, y: u.y - ahead.y / z + ((this.inset.bottom - this.inset.top) / 2) / z, z };
  }

  /**
   * Change camera mode. On phones the climb uses wider steps than the overview; stretching the ridge in view
   * made the whole mountain slide, so the swap happens under a cartoon cloud wipe instead, with the camera
   * cut to its new spot while the screen is covered.
   */
  async switchView(mode: 'overview' | 'follow' | 'fall') {
    const want = !PORTRAIT ? SW : mode === 'overview' ? PORTRAIT_SW.overview : PORTRAIT_SW.climb;
    if (want === SW) { this.mode = mode; return; }
    const swap = () => {
      this.mode = mode;
      SW = want;
      const u = this.u;
      if (u.step <= TOP) { const p = stand(u.step); u.x = p.x; u.y = p.y; } else u.x = edgeX() + 90;
      this.cam = { ...this.camTarget() };
    };
    if (this.reduce) { swap(); return; }
    play('whoosh');
    await new Promise<void>((done) => { this.wipe = { t: 0, swapped: false, swap, done }; });
  }
  /** Start fully covered by the cloud bank and sweep it away: the reveal after the loader. */
  revealWipe(): Promise<void> {
    if (this.reduce) return Promise.resolve();
    return new Promise((done) => { this.wipe = { t: WIPE.cover, swapped: true, swap: () => {}, done }; });
  }
  private drawWipe() {
    const w = this.wipe;
    if (!w) return;
    const c = this.ctx, { W, H } = this;
    // Covering: the cloud bank's edge sweeps left to right; revealing: its trailing edge follows it off
    const inP = Math.min(1, w.t / WIPE.cover), outP = Math.max(0, (w.t - WIPE.cover - WIPE.hold) / WIPE.reveal);
    const lead = lerp(-120, W + 120, easeInOut(inP)), trail = lerp(-120, W + 120, easeInOut(outP));
    if (lead <= trail) return;
    const R = 70;
    c.fillStyle = C.cream; c.fillRect(trail, -10, lead - trail, H + 20);
    for (const [x, dir] of [[lead, 1], [trail, -1]] as const) {
      if (x <= -100 || x >= W + 100) continue;
      for (let y = -R; y < H + R; y += R * 1.1) {
        const bx = x + dir * (Math.sin(y * 0.05) * 16), by = y;
        this.ellipse(bx, by, R, R * 0.9); c.lineWidth = 8; c.strokeStyle = C.ink; c.stroke();
      }
      for (let y = -R; y < H + R; y += R * 1.1) { this.ellipse(x + dir * (Math.sin(y * 0.05) * 16), y, R, R * 0.9); c.fillStyle = C.cream; c.fill(); }
    }
    c.fillStyle = C.cream; c.fillRect(Math.max(trail, trail + R * 0.6), -10, Math.max(0, lead - trail - R * 1.2), H + 20);
  }

  // ---------- drawing helpers ----------
  private jit(k: number, amt = 1.6) { return this.reduce ? 0 : (hash(k * 13.7 + Math.floor(this.clock / 120) * 3.1) - 0.5) * amt * 2; }
  private ink(w = 4) { const c = this.ctx; c.lineWidth = w; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
  private fillInk(fill: string, w = 4) { this.ctx.fillStyle = fill; this.ctx.fill(); this.ink(w); }
  private ellipse(x: number, y: number, rx: number, ry: number, rot = 0) { this.ctx.beginPath(); this.ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
  private rrect(x: number, y: number, w: number, h: number, r: number) { this.ctx.beginPath(); this.ctx.roundRect(x, y, w, h, r); }
  private text(s: string, x: number, y: number, font: string, fill: string, lw = 8, align: CanvasTextAlign = 'center') {
    const c = this.ctx;
    c.font = font; c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
    if (lw) { c.lineWidth = lw; c.strokeStyle = C.ink; c.strokeText(s, x, y); }
    c.fillStyle = fill; c.fillText(s, x, y);
  }

  // ---------- backdrop ----------
  private drawSky() {
    const c = this.ctx, P = SKY[this.weather], { W, H } = this;
    const g = c.createLinearGradient(0, 0, 0, H);
    P.sky.forEach((col, i) => g.addColorStop(i / (P.sky.length - 1), col));
    c.fillStyle = g; c.fillRect(-40, -40, W + 80, H + 80);
    if (this.weather === 'storm') return;
    const sx = W * 0.79 - this.cam.x * 0.015, sy = H * 0.56 + -this.cam.y * 0.04;
    const gl = c.createRadialGradient(sx, sy, 20, sx, sy, 190);
    gl.addColorStop(0, 'rgba(255,240,200,.75)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = gl; c.fillRect(sx - 200, sy - 200, 400, 400);
    this.ellipse(sx, sy, 62, 62); this.fillInk(this.weather === 'fog' ? '#F4F1E8' : '#FFE6A6', 4);
  }
  private drawRange(pts: number[], factor: number, base: number, fill: string, snow: string, lw: number) {
    const c = this.ctx, span = (pts.length - 1) * 40;
    const ox = -(((this.cam.x * factor) % span) + span) % span;
    const oy = base + -this.cam.y * factor * 0.35;
    for (let off = ox; off < this.W; off += span) {
      c.beginPath(); c.moveTo(off, this.H + 40);
      pts.forEach((y, i) => c.lineTo(off + i * 40, oy + y + this.jit(i + factor * 100, 1)));
      c.lineTo(off + span, this.H + 40); c.closePath();
      c.fillStyle = fill; c.fill();
      c.save(); c.clip();
      c.beginPath(); c.moveTo(off, oy - 400);
      pts.forEach((_, i) => c.lineTo(off + i * 40, oy - (lw > 3 ? 150 : 135) + (i % 2 ? 14 : -6)));
      c.lineTo(off + span, oy - 400); c.closePath(); c.fillStyle = snow; c.fill();
      c.restore();
      c.beginPath(); pts.forEach((y, i) => (i ? c.lineTo(off + i * 40, oy + y + this.jit(i + factor * 100, 1)) : c.moveTo(off, oy + y))); this.ink(lw);
    }
  }
  private drawClouds(fill: string) {
    const c = this.ctx;
    CLOUDS.forEach((cl, i) => {
      const span = 4400;
      const x = ((((cl.x - this.cam.x * 0.1 + this.clock * 0.008 * (1 + (i % 3))) % span) + span) % span) - 400;
      const y = cl.y + -this.cam.y * 0.05;
      c.save(); c.translate(x, y); c.scale(cl.s, cl.s);
      const blobs = [[0, 0, 34], [36, -14, 40], [78, 0, 30], [40, 10, 34]];
      blobs.forEach(([bx, by, r]) => { this.ellipse(bx, by, r, r * 0.8); c.lineWidth = 8; c.strokeStyle = C.ink; c.stroke(); });
      blobs.forEach(([bx, by, r]) => { this.ellipse(bx, by, r, r * 0.8); c.fillStyle = fill; c.fill(); });
      c.restore();
    });
  }
  private drawFog() {
    if (this.weather !== 'fog') return;
    const c = this.ctx;
    for (let k = 0; k < 3; k++) {
      const y = this.H * 0.44 + k * 90 + Math.sin(this.clock / 2000 + k) * 10;
      const g = c.createLinearGradient(0, y - 40, 0, y + 40);
      g.addColorStop(0, 'rgba(240,242,242,0)'); g.addColorStop(0.5, 'rgba(240,242,242,.55)'); g.addColorStop(1, 'rgba(240,242,242,0)');
      c.fillStyle = g; c.fillRect(-40, y - 40, this.W + 80, 80);
    }
  }

  // ---------- things in the sky ----------
  private spawnFlyer() {
    const kinds: FlyerKind[] = this.weather === 'storm' ? ['eagle', 'birds', 'helicopter'] : ['paraglider', 'eagle', 'birds', 'balloon', 'helicopter', 'plane'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const dir = Math.random() < 0.5 ? 1 : -1;
    const speed = { paraglider: 45, eagle: 70, birds: 60, balloon: 18, helicopter: 160, plane: 110 }[kind];
    const skyH = (this.H - this.inset.bottom) * 0.45;
    this.flyers.push({
      kind, x: dir > 0 ? -200 : this.W + 200, y: this.inset.top + 70 + Math.random() * skyH, vx: dir * speed * (0.8 + Math.random() * 0.4),
      vy: kind === 'balloon' ? -6 : kind === 'paraglider' ? 4 : 0, s: kind === 'balloon' ? 0.9 : 0.75 + Math.random() * 0.3, t: 0, hue: Math.floor(Math.random() * 4),
    });
  }
  private drawFlyers() {
    const c = this.ctx;
    const canopy = ['#E2383F', '#FFC93C', '#3FA7D6', '#6CCB57'];
    for (const f of this.flyers) {
      const dir = Math.sign(f.vx) || 1, t = f.t / 1000;
      c.save(); c.translate(f.x, f.y + Math.sin(t * 1.3) * 6); c.scale(f.s * dir, f.s);
      if (f.kind === 'paraglider') {
        c.beginPath(); c.moveTo(-50, 0); c.quadraticCurveTo(0, -34, 50, 0); c.quadraticCurveTo(0, -18, -50, 0); this.fillInk(canopy[f.hue], 3.5);
        c.beginPath(); for (const x of [-30, -10, 10, 30]) { c.moveTo(x, -10); c.lineTo(0, 46); } c.lineWidth = 1.5; c.strokeStyle = C.ink; c.stroke();
        this.ellipse(0, 52, 6, 6); this.fillInk(C.skin, 2.5);
        this.rrect(-6, 56, 12, 14, 4); this.fillInk(canopy[(f.hue + 1) % 4], 2.5);
      } else if (f.kind === 'eagle') {
        const flap = Math.sin(t * 5) * 0.5;
        for (const side of [-1, 1]) { c.save(); c.scale(side, 1); c.rotate(-flap * 0.4); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(22, -16 - flap * 14, 50, -6 - flap * 20); c.quadraticCurveTo(28, 2, 0, 6); this.fillInk('#6B4226', 3); c.restore(); }
        this.ellipse(0, 4, 10, 7); this.fillInk('#6B4226', 3);
        this.ellipse(12, 0, 6, 5); this.fillInk('#fff', 2.5);
        c.beginPath(); c.moveTo(17, 0); c.lineTo(23, 3); c.lineTo(17, 4); this.fillInk(C.gold, 2);
      } else if (f.kind === 'birds') {
        for (let k = 0; k < 5; k++) {
          const bx = -k * 26, by = Math.abs(k - 2) * 12 - k * 2, w = Math.sin(t * 9 + k) * 5;
          c.beginPath(); c.moveTo(bx - 10, by - 4 - w); c.quadraticCurveTo(bx - 4, by - 6, bx, by); c.quadraticCurveTo(bx + 4, by - 6, bx + 10, by - 4 - w); this.ink(3);
        }
      } else if (f.kind === 'balloon') {
        c.beginPath(); c.moveTo(0, 60); c.bezierCurveTo(-50, 20, -56, -60, 0, -64); c.bezierCurveTo(56, -60, 50, 20, 0, 60); c.closePath();
        c.save(); c.clip();
        for (let k = -3; k <= 3; k++) { c.fillStyle = (k + 3) % 2 ? canopy[f.hue] : '#fff'; c.fillRect(k * 16 - 8, -70, 16, 140); }
        c.restore();
        c.beginPath(); c.moveTo(0, 60); c.bezierCurveTo(-50, 20, -56, -60, 0, -64); c.bezierCurveTo(56, -60, 50, 20, 0, 60); this.ink(3.5);
        c.beginPath(); c.moveTo(-8, 58); c.lineTo(-10, 76); c.moveTo(8, 58); c.lineTo(10, 76); this.ink(2);
        this.rrect(-12, 74, 24, 16, 3); this.fillInk('#A8743E', 3);
      } else if (f.kind === 'helicopter') {
        this.ellipse(0, 0, 30, 16); this.fillInk(C.red, 3.5);
        c.beginPath(); c.moveTo(-26, -2); c.lineTo(-70, -6); c.lineTo(-70, 4); c.lineTo(-26, 6); this.fillInk(C.red, 3);
        this.ellipse(14, -4, 11, 8); this.fillInk('#BFE4F7', 2.5);
        c.beginPath(); c.moveTo(-18, 22); c.lineTo(22, 22); c.moveTo(-10, 16); c.lineTo(-12, 22); c.moveTo(12, 16); c.lineTo(14, 22); this.ink(3);
        const blade = Math.abs(Math.sin(t * 40)) * 46 + 8;
        c.beginPath(); c.moveTo(-blade, -20); c.lineTo(blade, -20); this.ink(4);
        c.beginPath(); c.moveTo(0, -16); c.lineTo(0, -20); this.ink(4);
        const tail = Math.abs(Math.sin(t * 50)) * 10 + 3;
        c.beginPath(); c.moveTo(-70, -1 - tail); c.lineTo(-70, -1 + tail); this.ink(3);
      } else {
        // A little plane towing a banner
        c.beginPath(); c.moveTo(-60, 0); c.lineTo(-130, 0); this.ink(2);
        c.save(); c.scale(dir, 1);
        this.rrect(dir > 0 ? -300 : 130, -16, 170, 32, 4); this.fillInk('#fff', 3);
        this.text('HOPP SCHWIIZ!', dir > 0 ? -215 : 215, 1, `20px ${FD}`, C.red, 0);
        c.restore();
        this.ellipse(0, 0, 30, 10); this.fillInk(C.gold, 3.5);
        c.beginPath(); c.moveTo(-6, -2); c.lineTo(-14, -22); c.lineTo(6, -22); c.lineTo(10, -2); this.fillInk(C.gold, 3);
        c.beginPath(); c.moveTo(-28, -2); c.lineTo(-38, -16); c.lineTo(-30, -16); c.lineTo(-20, -2); this.fillInk(C.gold, 3);
        this.ellipse(10, -4, 7, 5); this.fillInk('#BFE4F7', 2.5);
        const prop = Math.abs(Math.sin(t * 40)) * 14 + 2;
        c.beginPath(); c.moveTo(32, -prop); c.lineTo(32, prop); this.ink(3);
      }
      c.restore();
    }
  }

  // ---------- the rock face: a cliff of chunky cartoon stone blocks ----------
  /** The part of the world on screen, so the cliff only draws the blocks you can see. */
  private view = { x0: 0, x1: 0, y0: 0, y1: 0 };
  /** Block size: bigger on a portrait phone, where the overview camera is much further out. */
  private blockSize() { return PORTRAIT ? 118 : 84; }

  private drawFace() {
    const c = this.ctx, R = this.blockSize(), span = edgeX(), v = this.view;
    // The dark between the stones
    c.fillStyle = '#2B2145'; c.fillRect(v.x0 - 10, v.y0 - 10, v.x1 - v.x0 + 20, v.y1 - v.y0 + 20);
    const top = stepTop(TOP) - R, gap = PORTRAIT ? 7 : 5;
    const rows = Math.ceil((Math.min(v.y1, 2400) - top) / R);
    const shades = ['#6A5890', '#615087', '#58487D', '#6F5D97', '#5D4C83'];
    for (let r = Math.max(0, Math.floor((v.y0 - top) / R)); r <= rows; r++) {
      const y = top + r * R;
      // Brick-style offset per row, block widths varied but fixed for each spot
      let x = -3200 - hash(r * 7.3) * R;
      for (let j = 0; x < span + R; j++) {
        const seed = r * 131 + j * 17;
        const w = R * (1.1 + hash(seed) * 1.3);
        const bx = x, bw = w - gap;
        x += w;
        if (bx > v.x1 || bx + bw < v.x0) continue;
        const h = R - gap + (hash(seed + 5) - 0.5) * R * 0.18;
        const by = y + (hash(seed + 6) - 0.5) * R * 0.12;
        // Deeper below the ridge line, darker stone
        const depth = Math.max(0, by - (CAP - ((bx + bw / 2) / SW) * SH)) / (R * 6);
        c.globalAlpha = 1;
        this.rrect(bx, by, bw, h, R * 0.28);
        c.fillStyle = shades[Math.floor(hash(seed + 1) * shades.length)]; c.fill();
        c.fillStyle = `rgba(30,20,50,${Math.min(0.55, depth * 0.55)})`; c.fill();
        this.ink(PORTRAIT ? 4 : 3);
        // Lit top edge
        c.beginPath(); c.moveTo(bx + R * 0.2, by + 5); c.lineTo(bx + bw - R * 0.25, by + 5);
        c.lineWidth = PORTRAIT ? 6 : 4; c.strokeStyle = 'rgba(190,175,230,.45)'; c.stroke();
        // Altitude by height, not by how far along: snow only high up, moss only low down
        const alt = -by / (TOP * SH), hh = hash(seed + 9);
        if (alt < 0.4 && hh > 0.62) this.moss(bx + bw * 0.25, by, bw * 0.5, R);
        else if (alt > 0.7 && hh > 0.4) this.snowCap(bx, by, bw, R);
        else if (hh < 0.1) { c.beginPath(); c.moveTo(bx + bw * 0.5, by + h * 0.2); c.lineTo(bx + bw * 0.42, by + h * 0.5); c.lineTo(bx + bw * 0.56, by + h * 0.75); this.ink(PORTRAIT ? 4 : 3); }
        if (alt < 0.35 && alt > -0.3 && hh > 0.93) this.pine(bx + bw * 0.55, by, R / 84);
      }
    }
    this.drawCave(span * CAVE_AT, R);
    this.drawFall(span * FALL_AT, R);
  }
  private moss(x: number, y: number, w: number, R: number) {
    const c = this.ctx, n = 3, r = R * 0.1;
    c.beginPath(); c.moveTo(x, y + r);
    for (let k = 0; k < n; k++) c.arc(x + (w / n) * (k + 0.5), y + r * 0.6, w / n / 2, Math.PI, 0);
    c.lineTo(x + w, y + r * 1.4); c.lineTo(x, y + r * 1.4); c.closePath();
    this.fillInk(C.grass, PORTRAIT ? 3.5 : 2.5);
  }
  private snowCap(x: number, y: number, w: number, R: number) {
    const c = this.ctx, d = R * 0.16;
    c.beginPath(); c.moveTo(x + R * 0.15, y - 2); c.lineTo(x + w - R * 0.15, y - 2);
    c.quadraticCurveTo(x + w - R * 0.1, y + d, x + w - R * 0.3, y + d * 0.9);
    c.quadraticCurveTo(x + w * 0.55, y + d * 1.6, x + w * 0.45, y + d);
    c.quadraticCurveTo(x + w * 0.3, y + d * 1.4, x + R * 0.2, y + d);
    c.closePath(); this.fillInk('#fff', PORTRAIT ? 3.5 : 2.5);
  }
  private pine(x: number, y: number, k: number) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.scale(k * 1.6, k * 1.6);
    c.fillStyle = C.ink; c.fillRect(-2, -6, 4, 6);
    for (let t = 0; t < 3; t++) { c.beginPath(); c.moveTo(-13 + t * 3, -4 - t * 11); c.lineTo(0, -20 - t * 11); c.lineTo(13 - t * 3, -4 - t * 11); c.closePath(); this.fillInk(C.grassD, 3); }
    c.restore();
  }
  /** A cave mouth cut into the cliff, with eyes that blink now and then. */
  private drawCave(x: number, R: number) {
    const c = this.ctx, y = CAP - (x / SW) * SH + R * 2.6, s = R / 84;
    c.save(); c.translate(x, y); c.scale(s * 1.4, s * 1.4);
    c.beginPath(); c.moveTo(-34, 6); c.quadraticCurveTo(-36, -50, 0, -52); c.quadraticCurveTo(36, -50, 34, 6); c.closePath(); this.fillInk('#140E22', 5);
    c.beginPath(); c.moveTo(-40, 6); c.lineTo(40, 6); this.ink(6);
    if (Math.floor(this.clock / 2600) % 3 !== 0 && this.clock % 2600 > 180) { this.ellipse(-8, -22, 4, 4.5); this.ellipse(8, -22, 4, 4.5); c.fillStyle = C.gold; c.fill(); }
    c.restore();
  }
  /** A waterfall spilling from the ridge's lip down the stones into a splash pool. */
  private drawFall(x: number, R: number) {
    const c = this.ctx, s = R / 84;
    const top = stepTop(Math.floor(x / SW)) + CAP * 0.6, bottom = top + R * 3.2, w = 9 * s;
    c.beginPath(); c.moveTo(x - w, top); c.lineTo(x + w, top); c.lineTo(x + w * 1.5, bottom); c.lineTo(x - w * 1.5, bottom); c.closePath(); this.fillInk('#BFE4F7', 3);
    c.save(); c.clip(); c.strokeStyle = '#fff'; c.lineWidth = 2 + s * 2;
    const len = bottom - top;
    for (let d = 0; d < 6; d++) { const yy = top + ((this.clock * 0.12 + (d * len) / 6) % len); c.beginPath(); c.moveTo(x - w * 0.4, yy); c.lineTo(x - w * 0.4, yy + 14 * s); c.moveTo(x + w * 0.5, yy + 7 * s); c.lineTo(x + w * 0.5, yy + 20 * s); c.stroke(); }
    c.restore();
    this.ellipse(x, bottom, 26 * s, 9 * s); this.fillInk('#E5F6FF', 3);
    this.ellipse(x - 18 * s, bottom - 8 * s, 6 * s, 6 * s); this.ellipse(x + 20 * s, bottom - 10 * s, 5 * s, 5 * s); c.fillStyle = '#fff'; c.fill();
  }

  // ---------- the ridge ----------
  private drawRidge() {
    const c = this.ctx;
    const stair = () => {
      c.beginPath(); c.moveTo(-3200, 0);
      for (let i = 0; i <= TOP; i++) { c.lineTo(i * SW + this.jit(i), stepTop(i) + this.jit(i + 50)); c.lineTo((i + 1) * SW, stepTop(i) + this.jit(i + 99)); }
      c.lineTo(edgeX() + this.jit(7), 2400);
    };
    stair(); c.lineTo(-3200, 2400); c.closePath();
    c.fillStyle = C.mass; c.fill();
    c.save(); c.clip();
    this.drawFace();
    c.restore();
    const cap = (x0: number, x1: number, top: number, i: number) => {
      const [fill, dark] = i <= 9 ? [C.grass, C.grassD] : i <= 19 ? [C.rock, C.rockD] : [C.snow, C.snowD];
      c.beginPath(); c.moveTo(x0, top); c.lineTo(x1, top); c.lineTo(x1, top + CAP * 0.6);
      const n = Math.max(2, Math.round((x1 - x0) / 34));
      for (let k = n; k > 0; k--) {
        const xa = x0 + ((x1 - x0) * k) / n, xb = x0 + ((x1 - x0) * (k - 1)) / n;
        c.quadraticCurveTo((xa + xb) / 2, top + CAP * (0.9 + hash(i * 7 + k) * 0.7), xb, top + CAP * 0.6);
      }
      c.closePath(); c.fillStyle = fill; c.fill(); this.ink(3);
      c.fillStyle = dark; c.fillRect(x0 + 3, top + CAP * 0.45, x1 - x0 - 6, 4);
    };
    cap(-3200, SW, 0, 0);
    for (let i = 1; i <= TOP; i++) cap(i * SW, (i + 1) * SW, stepTop(i), i);
    stair(); this.ink(6);
    for (let i = 0; i <= TOP; i++) {
      const top = stepTop(i), d = DECO[i];
      if (i <= 9) d.tufts.forEach((f) => {
        const x = i * SW + f * SW;
        c.beginPath(); c.moveTo(x - 7, top); c.lineTo(x - 4, top - 10); c.lineTo(x, top - 2); c.lineTo(x + 4, top - 12); c.lineTo(x + 7, top);
        c.fillStyle = C.grassD; c.fill(); this.ink(2.5);
      });
      if (i > 9 && i <= 19 && d.rock) { this.ellipse(i * SW + d.rockX * SW, top - 6, 11, 8); this.fillInk('#D4C8EA', 3); }
      if (i > 19 && hash(i + Math.floor(this.clock / 400)) > 0.7) { const x = i * SW + d.rockX * SW; c.fillStyle = '#fff'; c.fillRect(x - 1, top - 14, 2, 8); c.fillRect(x - 4, top - 11, 8, 2); }
    }
    c.save(); c.translate(-220, 0);
    c.beginPath(); c.moveTo(-60, 0); c.lineTo(0, -80); c.lineTo(60, 0); c.closePath(); this.fillInk(C.red, 5);
    c.beginPath(); c.moveTo(-14, 0); c.lineTo(0, -40); c.lineTo(14, 0); c.closePath(); this.fillInk('#5A2030', 4);
    c.restore();
    c.save(); c.translate(edgeX() - 14, stepTop(TOP));
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -70); this.ink(7); c.strokeStyle = '#8C6A4A'; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(0, -110 + Math.sin(this.clock / 300) * 2); c.lineTo(30, -66); c.lineTo(-30, -66); c.closePath(); this.fillInk(C.gold, 4);
    this.text('!', 0, -80, `30px ${FD}`, C.ink, 0);
    c.restore();
  }

  private drawWindow() {
    const c = this.ctx, w = this.window;
    if (!w) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock / 260);
    if (w === 'edge') {
      const top = stepTop(TOP);
      const g = c.createLinearGradient(edgeX(), 0, edgeX() + 500, 0);
      g.addColorStop(0, `rgba(226,56,63,${0.35 + 0.15 * pulse})`); g.addColorStop(1, 'rgba(226,56,63,0)');
      c.fillStyle = g; c.fillRect(edgeX(), top, 500, 1400);
      this.flag(edgeX() + 40, top + 120, 'EDGE', C.red, -1);
      return;
    }
    for (let i = w.from; i <= w.to; i++) {
      const top = stepTop(i);
      c.fillStyle = `rgba(255,214,80,${0.25 + 0.2 * pulse})`; c.fillRect(i * SW, top - 26, SW, 26);
      c.fillStyle = C.gold; c.fillRect(i * SW + 2, top - 1, SW - 4, 9);
    }
    this.flag(w.from * SW + 6, stepTop(w.from), String(w.from), C.red, 1);
    this.flag((w.to + 1) * SW - 6, stepTop(w.to), String(w.to), C.red, -1);
  }

  /** The sign above the window, in screen space so it stays readable and tappable at any zoom. */
  private drawSign() {
    this.sign = null;
    const w = this.window, info = this.info;
    if (!w || !info || this.busy || this.mode !== 'overview') return;
    const c = this.ctx, edge = w === 'edge';
    const wx = edge ? edgeX() + 70 : ((w.from + w.to + 1) / 2) * SW;
    const wy = edge ? stepTop(TOP) + 40 : stepTop(w.to) - 130;
    const h = 58, arrows = !edge && this.dragEnabled;
    c.font = `40px ${FD}`;
    const payW = c.measureText(info.pay).width;
    c.font = `700 15px ${FU}`;
    const textW = Math.max(payW, c.measureText(info.odds).width) + 24;
    const width = textW + (arrows ? h * 2 : 0);
    let x = (wx - this.cam.x) * this.cam.z + this.W / 2 - width / 2;
    let y = (wy - this.cam.y) * this.cam.z + this.H / 2 - h;
    x = Math.max(8, Math.min(this.W - width - 8, x));
    y = Math.max(this.inset.top + 54, Math.min(this.H - this.inset.bottom - h - 8, y));
    const bob = this.reduce ? 0 : Math.sin(this.clock / 300) * 2;
    y += bob;
    this.rrect(x, y, width, h, 16); this.fillInk(C.cream, 4);
    if (arrows) {
      // Drawn triangles, not ◀ ▶ characters: the font doesn't centre those glyphs. Each triangle is placed by
      // its centroid, which is where it looks centred in the circle.
      ([[x + h / 2, -1], [x + width - h / 2, 1]] as const).forEach(([ax, dir]) => {
        const ay = y + h / 2, r = h / 2 - 7;
        this.ellipse(ax, ay, r, r); this.fillInk(C.gold, 3.5);
        const tw = r * 0.52, th = r * 0.58;
        c.beginPath();
        c.moveTo(ax + dir * (tw * 2 / 3), ay);
        c.lineTo(ax - dir * (tw / 3), ay - th);
        c.lineTo(ax - dir * (tw / 3), ay + th);
        c.closePath();
        c.fillStyle = C.ink; c.fill(); c.lineJoin = 'round'; c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke();
      });
    }
    const mid = x + width / 2;
    this.text(info.pay, mid, y + 23, `36px ${FD}`, edge ? C.red : C.red, 0);
    this.text(info.odds, mid, y + 46, `700 14px ${FU}`, C.ink, 0);
    this.sign = { x, y: y - bob, w: width, h, arrows };
  }
  private flag(x: number, y: number, label: string, color: string, dir: number) {
    const c = this.ctx;
    c.save(); c.translate(x, y);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -120); this.ink(7); c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke();
    const w = (k: number) => Math.sin(this.clock / 180 + k) * 6;
    c.beginPath(); c.moveTo(0, -120); c.quadraticCurveTo(dir * 35, -128 + w(0), dir * 70, -112 + w(1)); c.quadraticCurveTo(dir * 35, -96 + w(2), 0, -86); c.closePath();
    this.fillInk(color, 4);
    this.text(label, dir * 28, -104 + w(1) / 2, `22px ${FD}`, '#fff', 5);
    c.restore();
  }

  // ---------- creatures ----------
  private drawBloom(x: number, y: number, golden: boolean, s = 1) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.scale(s, s); c.rotate(Math.sin(this.clock / 500) * 0.15);
    for (let k = 0; k < 8; k++) { c.save(); c.rotate((k * Math.PI) / 4); this.ellipse(0, -11, 5, 11); this.fillInk(golden ? C.gold : '#FFFFFF', 2.5); c.restore(); }
    this.ellipse(0, 0, 6, 6); this.fillInk(golden ? C.red : '#F7D774', 2.5);
    c.restore();
  }
  private drawGoat(g: Goat) {
    const c = this.ctx;
    const x = g.step * SW + SW - 26, y = stepTop(g.step) - Math.sin(g.hop * Math.PI) * 14;
    c.save(); c.translate(x, y); c.scale(-1, 1);
    [-12, -5, 8, 14].forEach((lx) => { c.beginPath(); c.moveTo(lx, -14); c.lineTo(lx + 1, 0); this.ink(4); });
    this.ellipse(0, -22, 21, 12); this.fillInk(C.goat, 3.5);
    c.beginPath(); c.moveTo(-20, -26); c.lineTo(-27, -34); this.ink(3);
    this.ellipse(22, -36, 10, 8, 0.3); this.fillInk(C.goat, 3.5);
    c.beginPath(); c.moveTo(18, -43); c.quadraticCurveTo(10, -60, 2, -50); this.ink(4);
    c.beginPath(); c.moveTo(26, -29); c.lineTo(28, -20); c.lineTo(31, -29); this.fillInk('#D9CDB8', 2);
    this.ellipse(25, -38, 1.8, 2.4); c.fillStyle = C.ink; c.fill();
    c.restore();
    if (g.sayT > 0) this.bubble(x, y - 78, g.say);
  }
  private bubble(x: number, y: number, s: string, size = 22) {
    const c = this.ctx;
    c.font = `700 ${size}px ${FU}`;
    const w = c.measureText(s).width + size * 1.1, h = size * 1.8;
    this.rrect(x - w / 2, y - h / 2, w, h, 14); this.fillInk('#fff', 3.5);
    c.beginPath(); c.moveTo(x - 8, y + h / 2 - 2); c.lineTo(x, y + h / 2 + 12); c.lineTo(x + 8, y + h / 2 - 2); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.moveTo(x - 8, y + h / 2 - 1); c.lineTo(x, y + h / 2 + 12); c.lineTo(x + 8, y + h / 2 - 1); this.ink(3.5);
    c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, y);
  }
  private drawMarmot(m: { x: number; y: number; up: number }) {
    const c = this.ctx, y = m.y - m.up * 34;
    c.save(); c.beginPath(); c.rect(m.x - 40, m.y - 80, 80, 80); c.clip();
    this.ellipse(m.x, y + 10, 14, 22); this.fillInk('#A86F3D', 3.5);
    this.ellipse(m.x - 6, y - 4, 2, 3); this.ellipse(m.x + 6, y - 4, 2, 3); c.fillStyle = C.ink; c.fill();
    this.ellipse(m.x, y + 3, 4, 3); this.fillInk('#5A2E1A', 2);
    c.restore();
    this.ellipse(m.x, m.y, 20, 5); c.fillStyle = C.ink; c.fill();
    if (m.up > 0.8) this.text('!', m.x + 22, y - 30, `34px ${FD}`, C.red, 6);
  }
  private drawBell(x: number, y: number, rot: number, s = 1) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.lineTo(10, 18); c.lineTo(-10, 18); c.closePath(); this.fillInk(C.gold, 3);
    this.ellipse(0, 20, 3.5, 3.5); this.fillInk('#8E5A2C', 2);
    c.beginPath(); c.moveTo(-4, -6); c.quadraticCurveTo(0, -12, 4, -6); this.ink(3);
    c.restore();
  }
  private drawHorn(L: number) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-L * 0.5, 7, -L, 0); c.lineWidth = 13; c.strokeStyle = C.ink; c.lineCap = 'round'; c.stroke();
    c.lineWidth = 7; c.strokeStyle = C.wood; c.stroke();
    [0.3, 0.55, 0.8].forEach((f) => { c.beginPath(); c.moveTo(-L * f, -4 + f * 3); c.lineTo(-L * f, 8 - f * 3); c.lineWidth = 3; c.strokeStyle = C.woodD; c.stroke(); });
    this.ellipse(-L - 6, -8, 14, 10, -0.7); this.fillInk(C.wood, 4);
    this.ellipse(-L - 8, -10, 7, 5, -0.7); c.fillStyle = C.woodD; c.fill();
  }
  private drawUeli() {
    const c = this.ctx, u = this.u;
    const t = this.clock / 1000, breathe = u.pose === 'idle' ? Math.sin(t * 3) * 1.5 : 0;
    c.save(); c.translate(u.x, u.y); c.rotate(u.rot); c.scale(u.dir, 1);
    c.scale(1 + u.sq * 0.55, 1 - u.sq); c.rotate(u.lean);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save();
    // Carried over the shoulder, bell up behind him (slanting down to the ground read as dragging a log);
    // swung out in front, bell down, when he plays it
    if (u.horn > 0.5) { c.translate(16, -76); c.scale(-1, 1); c.rotate(-0.55); this.drawHorn(150); }
    else { c.translate(8, -66); c.rotate(0.62 + Math.sin(u.walk) * 0.04); this.drawHorn(118); }
    c.restore();
    const ph = u.walk;
    ([[-6, Math.sin(ph) * 9], [6, -Math.sin(ph) * 9]] as const).forEach(([hx, sw]) => {
      c.beginPath(); c.moveTo(hx, -34); c.lineTo(hx + sw, -2); c.lineWidth = 10; c.strokeStyle = C.ink; c.stroke(); c.lineWidth = 5; c.strokeStyle = '#fff'; c.stroke();
      this.ellipse(hx + sw + 4, -2, 10, 5.5); this.fillInk(C.boot, 3);
    });
    this.rrect(-13, -48, 26, 17, 6); this.fillInk(C.breeches, 3.5);
    const arm = (sx: number, sy: number, hx: number, hy: number) => {
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy); c.lineWidth = 10; c.strokeStyle = C.ink; c.stroke(); c.lineWidth = 6; c.strokeStyle = '#fff'; c.stroke();
      this.ellipse(hx, hy, 5, 5); this.fillInk(C.skin, 2.5);
    };
    const spin = u.pose === 'teeter' ? t * 14 : 0;
    if (u.pose === 'teeter') arm(-8, -66, -8 + Math.cos(spin + 2) * 24, -66 + Math.sin(spin + 2) * 24);
    else arm(-8, -66, -17, -47);
    this.rrect(-15, -76 + breathe, 30, 32, 10); this.fillInk('#fff', 3.5);
    c.beginPath(); c.moveTo(-13, -73 + breathe); c.lineTo(-3, -73 + breathe); c.lineTo(0, -62 + breathe); c.lineTo(3, -73 + breathe); c.lineTo(13, -73 + breathe);
    c.lineTo(13, -46); c.lineTo(-13, -46); c.closePath(); this.fillInk(C.vest, 3);
    [-58, -52].forEach((by) => { this.ellipse(5, by + breathe, 2, 2); c.fillStyle = C.gold; c.fill(); });
    const hy = -90 + breathe;
    this.ellipse(2, hy, 15, 15); this.fillInk(C.skin, 3.5);
    this.ellipse(16, hy + 1, 8, 7); this.fillInk(C.nose, 3);
    c.fillStyle = C.ink;
    if (u.face === 'scared') { this.ellipse(7, hy - 6, 5, 6); this.fillInk('#fff', 2.5); this.ellipse(8, hy - 6, 1.8, 1.8); c.fillStyle = C.ink; c.fill(); c.beginPath(); c.moveTo(1, hy - 15); c.lineTo(12, hy - 17); this.ink(3); }
    else if (u.face === 'dizzy') { c.beginPath(); for (let a = 0; a < 12; a += 0.4) c.lineTo(7 + Math.cos(a + t * 8) * a * 0.45, hy - 6 + Math.sin(a + t * 8) * a * 0.45); this.ink(2); }
    else if (u.face === 'happy' || u.face === 'yodel') { c.beginPath(); c.arc(7, hy - 4, 4, Math.PI * 1.1, Math.PI * 1.9); this.ink(3); }
    else { this.ellipse(7, hy - 5, 2.6, 3.8); c.fill(); }
    if (u.face === 'yodel' || u.face === 'scared') { this.ellipse(12, hy + 12, 4.5, u.face === 'yodel' ? 6 + Math.sin(t * 30) * 2 : 4); this.fillInk('#7A1F2B', 2.5); }
    c.beginPath(); c.moveTo(2, hy + 7); c.quadraticCurveTo(8, hy + 2, 14, hy + 7); c.quadraticCurveTo(20, hy + 2, 26, hy + 8);
    c.quadraticCurveTo(29, hy + 14, 24, hy + 13); c.quadraticCurveTo(14, hy + 12, 4, hy + 13); c.quadraticCurveTo(-1, hy + 13, 2, hy + 7); this.fillInk(C.mous, 2.5);
    const hb = hy - 12;
    c.beginPath(); c.moveTo(-34, hb - 40); c.quadraticCurveTo(-20, hb - 30, -6, hb - 20); c.lineWidth = 7; c.strokeStyle = C.ink; c.stroke(); c.lineWidth = 3.5; c.strokeStyle = '#fff'; c.stroke();
    c.beginPath(); c.moveTo(-12, hb); c.lineTo(-9, hb - 28); c.quadraticCurveTo(3, hb - 36, 15, hb - 28); c.lineTo(18, hb); c.closePath(); this.fillInk(C.hat, 3.5);
    c.fillStyle = C.red; c.fillRect(-11, hb - 8, 28, 6);
    this.ellipse(3, hb, 28, 6.5); this.fillInk(C.hat, 3.5);
    this.drawBloom(12, hb - 6, false, 0.32);
    if (u.pose === 'teeter') arm(8, -66, 8 + Math.cos(spin) * 24, -66 + Math.sin(spin) * 24);
    else if (u.ring > 0) { arm(8, -66, 22, -98 - u.ring * 6); this.drawBell(22, -96 - u.ring * 6, u.swing * 0.9 + 0.2); }
    else { arm(8, -66, 17, -46); this.drawBell(17, -44, Math.sin(t * 2) * 0.1, 0.9); }
    c.restore();
  }
  private drawGondola(g: Gondola) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(g.A.x, g.A.y); c.lineTo(g.B.x, g.B.y); this.ink(4);
    c.save(); c.translate(g.x, g.y);
    this.ellipse(0, 0, 10, 10); this.fillInk('#9AA0B8', 3);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 44); this.ink(5);
    this.rrect(-52, 44, 104, 86, 14); this.fillInk(C.red, 5);
    this.rrect(-42, 54, 84, 38, 8); this.fillInk('#BFE4F7', 3.5);
    c.fillStyle = '#fff'; c.fillRect(-48, 100, 96, 6);
    c.restore();
  }
  private drawDog(d: Dog) {
    const c = this.ctx;
    c.save(); c.translate(d.x, d.y); c.scale(d.dir, 1);
    const run = Math.sin(this.clock / 60) * (d.running ? 8 : 0);
    ([[-18, run], [-8, -run], [12, run], [20, -run]] as const).forEach(([lx, s]) => { c.beginPath(); c.moveTo(lx, -18); c.lineTo(lx + s, 0); this.ink(6); c.strokeStyle = C.dog; c.lineWidth = 2; c.stroke(); });
    this.ellipse(0, -28, 30, 16); this.fillInk(C.dog, 4);
    this.ellipse(-6, -32, 16, 10); c.fillStyle = '#fff'; c.fill();
    c.beginPath(); c.moveTo(-28, -32); c.quadraticCurveTo(-44, -44 + Math.sin(this.clock / 80) * 8, -40, -54); this.ink(6);
    this.ellipse(30, -44, 16, 14); this.fillInk(C.dog, 4);
    this.ellipse(42, -40, 9, 7); this.fillInk('#fff', 3);
    this.ellipse(48, -42, 3.5, 3); c.fillStyle = C.ink; c.fill();
    this.ellipse(27, -50, 3, 3); c.fill();
    this.ellipse(22, -40, 7, 12, 0.3); this.fillInk('#7A3F1D', 3);
    this.rrect(-4, -22, 22, 16, 5); this.fillInk('#A8743E', 3);
    c.restore();
  }
  private drawWorldFx() {
    const c = this.ctx;
    this.rings.forEach((r) => { c.beginPath(); c.arc(r.x, r.y, r.r, -0.9, 0.9); c.lineWidth = 8; c.strokeStyle = `rgba(255,201,60,${r.a})`; c.stroke(); });
    this.balls.forEach((b) => {
      c.save(); c.translate(b.x, b.y); c.rotate(b.rot);
      this.ellipse(0, 0, b.r, b.r); this.fillInk('#fff', 5);
      c.beginPath(); c.arc(0, 0, b.r * 0.6, 0.3, 1.6); c.strokeStyle = C.snowD; c.lineWidth = 4; c.stroke();
      c.restore();
    });
    const d = this.dog;
    if (d) {
      if (this.rope) { c.beginPath(); c.moveTo(d.x + 30 * d.dir, d.y - 40); c.quadraticCurveTo((d.x + this.u.x) / 2, Math.max(d.y, this.u.y) + 20, this.u.x, this.u.y - 60); c.lineWidth = 4; c.strokeStyle = '#C9A46A'; c.stroke(); }
      this.drawDog(d);
    }
  }
  private drawParticles(list: Particle[]) {
    const c = this.ctx;
    list.forEach((p) => {
      c.save(); c.globalAlpha = Math.min(1, p.life / (p.max * 0.4)); c.translate(p.x, p.y); c.rotate(p.rot);
      if (p.type === 'dust') { this.ellipse(0, 0, p.size, p.size); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke(); }
      else if (p.type === 'snow') { this.ellipse(0, 0, p.size, p.size); c.fillStyle = '#fff'; c.fill(); }
      else if (p.type === 'pebble') { c.fillStyle = '#8E80AE'; c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); c.lineWidth = 2; c.strokeStyle = C.ink; c.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size); }
      else if (p.type === 'petal') { this.ellipse(0, 0, p.size * 0.5, p.size); c.fillStyle = p.color ?? '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = C.ink; c.stroke(); }
      else if (p.type === 'star') { c.fillStyle = C.gold; c.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? p.size * 0.45 : p.size; c.lineTo(Math.cos((k * Math.PI) / 5) * r, Math.sin((k * Math.PI) / 5) * r); } c.closePath(); c.fill(); c.lineWidth = 2; c.strokeStyle = C.ink; c.stroke(); }
      else if (p.type === 'note') { c.rotate(-p.rot); this.text('♪', 0, 0, `${p.size * 4}px ${FU}`, C.gold, 4); }
      else if (p.type === 'wind') { c.rotate(-p.rot); c.beginPath(); c.moveTo(0, 0); c.lineTo(p.size, 0); c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke(); }
      c.restore();
    });
  }
  private drawPops() {
    const c = this.ctx;
    this.pops.forEach((p) => {
      const k = p.t / p.life, s = k < 0.2 ? backOut(k / 0.2) : 1;
      c.save(); c.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      c.translate(p.x, p.y - k * 60); c.scale(s, s);
      this.text(p.text, 0, 0, `${p.size}px ${FD}`, p.color, 9);
      c.restore();
    });
  }
  private drawCards() {
    const c = this.ctx, mid = this.inset.top + (this.H - this.inset.top - this.inset.bottom) * 0.32;
    const fit = Math.min(1, this.W / 760);
    this.cards.forEach((cd) => {
      const pIn = Math.min(1, cd.t / 260), out = cd.t > cd.dur - 260 ? (cd.dur - cd.t) / 260 : 1;
      const s = (this.reduce ? 1 : 1 + (1 - backOut(pIn)) * 0.6) * (0.85 + 0.15 * out) * fit;
      const y = cd.y < 0 ? this.inset.top + 70 : mid;
      c.save(); c.globalAlpha = Math.max(0, out); c.translate(this.W / 2, y); c.rotate(-0.05); c.scale(s, s);
      if (cd.big) {
        c.save(); c.rotate(cd.t / 2000);
        for (let k = 0; k < 16; k++) { c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 230, (k * Math.PI) / 8, ((k + 0.5) * Math.PI) / 8); c.closePath(); c.fillStyle = k % 2 ? 'rgba(255,255,255,.22)' : 'rgba(255,201,60,.28)'; c.fill(); }
        c.restore();
      }
      this.text(cd.text, 0, 0, `${cd.size}px ${FD}`, cd.color, cd.size > 50 ? 14 : 8);
      if (cd.sub) this.text(cd.sub, 0, cd.size * 0.62, `800 ${Math.round(cd.size * 0.26 + 4)}px ${FU}`, C.cream, 7);
      c.restore();
    });
  }
  private drawMinimap() {
    // (narrower than the screen by enough to clear its labels and the corner sound button)
    const c = this.ctx, w = Math.min(640, this.W - 320), x0 = (this.W - w) / 2, y = this.inset.top + 14, h = 24, seg = w / 27;
    this.rrect(x0 - 6, y - 4, w + 12, h + 8, 12); this.fillInk('rgba(255,244,223,.92)', 3.5);
    const win = this.window;
    if (win === 'edge') { c.fillStyle = C.red; c.fillRect(x0 + 26 * seg, y, seg, h); }
    else if (win) { c.fillStyle = C.gold; c.fillRect(x0 + win.from * seg, y, (win.to - win.from + 1) * seg, h); }
    for (let i = 0; i <= 26; i++) { c.fillStyle = i === 26 ? 'rgba(226,56,63,.35)' : i % 5 === 0 ? C.ink : 'rgba(36,21,46,.35)'; c.fillRect(x0 + i * seg + seg / 2 - 1, y + h - (i % 5 === 0 ? 10 : 6), 2, i % 5 === 0 ? 10 : 6); }
    this.picked.forEach((b) => { this.ellipse(x0 + b.step * seg + seg / 2, y + 7, 4, 4); this.fillInk(b.golden ? C.gold : '#fff', 2); });
    const ux = x0 + Math.max(0, Math.min(26.5, this.u.x / SW)) * seg;
    this.ellipse(ux, y + h / 2, 8, 8); this.fillInk(C.red, 3);
    this.text('2’200 m', x0 - 12, y + h / 2, `800 14px ${FU}`, C.cream, 5, 'right');
    this.text('3’000 m', x0 + w + 12, y + h / 2, `800 14px ${FU}`, C.cream, 5, 'left');
  }
  private drawVignette() {
    if (this.tension < 0.02) return;
    const c = this.ctx, pulse = 0.85 + 0.15 * Math.sin(performance.now() / 130);
    const g = c.createRadialGradient(this.W / 2, this.H / 2, 160, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.6);
    g.addColorStop(0, 'rgba(40,0,20,0)'); g.addColorStop(1, `rgba(60,0,25,${0.6 * this.tension * pulse})`);
    c.fillStyle = g; c.fillRect(0, 0, this.W, this.H);
  }
  private drawWin() {
    const w = this.win;
    if (!w) return;
    const y = this.inset.top + (this.H - this.inset.top - this.inset.bottom) * 0.58, fit = Math.min(1, this.W / 760);
    this.ctx.save(); this.ctx.translate(this.W / 2, y); this.ctx.scale(fit, fit);
    // Count up at the final amount's precision (2 decimals unless the win itself needs more), landing exactly on it
    let d = 2;
    while (d < 6 && Math.abs(Math.round(w.amount * 10 ** d) - w.amount * 10 ** d) > 1e-6) d++;
    const near = Math.abs(w.amount - w.shown) < w.amount * 0.002;
    const shown = near ? w.amount : Math.round(w.shown * 10 ** d) / 10 ** d;
    this.text(`${w.text} ${w.format(shown)}`, 0, 0, `54px ${FD}`, C.gold, 12);
    this.text(w.sub, 0, 52, `800 26px ${FU}`, C.cream, 7);
    this.ctx.restore();
  }

  private render() {
    const c = this.ctx, P = SKY[this.weather];
    c.setTransform(this.canvas.width / this.W, 0, 0, this.canvas.height / this.H, 0, 0);
    const shx = this.reduce ? 0 : (Math.random() - 0.5) * this.shake * 22, shy = this.reduce ? 0 : (Math.random() - 0.5) * this.shake * 22;
    c.save(); c.translate(shx, shy);
    this.drawSky();
    this.drawRange(FAR, 0.05, this.H * 0.61, P.far, P.farSnow, 3);
    this.drawClouds(P.cloud);
    this.drawFlyers();
    this.drawRange(MID, 0.14, this.H * 0.8, P.mid, P.midSnow, 4);
    this.drawFog();
    c.save(); c.translate(this.W / 2, this.H / 2); c.scale(this.cam.z, this.cam.z); c.translate(-this.cam.x, -this.cam.y);
    const hw = this.W / 2 / this.cam.z + 60, hh = this.H / 2 / this.cam.z + 60;
    this.view = { x0: this.cam.x - hw, x1: this.cam.x + hw, y0: this.cam.y - hh, y1: this.cam.y + hh };
    this.drawRidge();
    this.drawWindow();
    this.goats.forEach((g) => this.drawGoat(g));
    if (this.marmot) this.drawMarmot(this.marmot);
    if (this.cabin) this.drawGondola(this.cabin);
    this.drawUeli();
    this.drawWorldFx();
    this.drawParticles(this.parts);
    this.drawPops();
    c.restore();
    this.drawParticles(this.sparts);
    this.drawVignette();
    this.drawSign();
    this.drawMinimap();
    this.drawCounter();
    this.drawCards();
    this.drawWin();
    this.drawWipe();
    c.restore();
    if (this.flash > 0) { c.fillStyle = `rgba(255,255,255,${this.flash * 0.8})`; c.fillRect(0, 0, this.W, this.H); }
  }

  // ================= Beats: the director calls these =================
  private burst(x: number, y: number, n: number, type: string, o: { angle?: number; spread?: number; speed?: number; g?: number; life?: number; size?: number; color?: string } = {}) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (o.spread ?? Math.PI);
      const sp = (o.speed ?? 200) * (0.5 + Math.random());
      this.parts.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g ?? 600, life: o.life ?? 700, max: o.life ?? 700, size: (o.size ?? 6) * (0.6 + Math.random() * 0.8), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, color: o.color });
    }
  }
  private pop(x: number, y: number, text: string, color = C.gold, size = 40) { this.pops.push({ x, y, text, color, size, t: 0, life: 1100 }); }
  card(text: string, sub = '', color = C.gold, o: { dur?: number; big?: boolean; top?: boolean; size?: number } = {}) {
    this.cards.push({ text, sub, color, t: 0, dur: o.dur ?? 1500, big: o.big ?? true, y: o.top ? -1 : 0, size: o.size ?? 92 });
  }
  goatSay(i: number, text: string, sound = true) {
    const g = this.goats[i];
    g.say = text; g.sayT = 1400; g.hop = 1;
    if (sound) play('goat');
  }
  private nearestGoat() {
    let best = 0;
    this.goats.forEach((g, i) => { if (Math.abs(g.step - this.u.step) < Math.abs(this.goats[best].step - this.u.step)) best = i; });
    return best;
  }
  private tense(on: boolean) { this.tensionTarget = on ? 1 : 0; this.scaleTarget = on && !this.reduce ? 0.45 : 1; }
  private inWindow(s: number) { const w = this.window; return !!w && w !== 'edge' && s >= w.from && s <= w.to; }

  /** A new round: Ueli back at base camp, the ridge cleared. */
  reset(weather: Weather) {
    this.u = freshUeli();
    this.weather = weather;
    this.picked = [];
    this.win = null;
    this.reel = null;
    this.cabin = null; this.balls = []; this.dog = null; this.rope = false; this.rings = []; this.wind = 0; this.marmot = null;
    this.tense(false);
    this.mode = 'overview';
    if (PORTRAIT) SW = PORTRAIT_SW.overview;
    const p = stand(0); this.u.x = p.x; this.u.y = p.y;
  }
  /** Skip straight to where a round ended (resuming after a reload). */
  placeAt(step: number) { const p = stand(Math.min(step, TOP)); Object.assign(this.u, { x: p.x, y: p.y, step: Math.min(step, TOP), rot: 0 }); }

  async intro(hidden: number, label: string) {
    this.card(label.toUpperCase(), hidden ? `${hidden} edelweiss hidden on the ridge` : 'Climb clean', C.cream, { size: 64, big: false, dur: 1400 });
    await this.sleep(1300);
    await this.switchView('follow');
    await this.sleep(900);
  }

  /** A bloom he just reached: petals, a chime, and the running multiplier. */
  bloom(step: number, golden: boolean, multiplier: number) {
    this.picked.push({ step, golden });
    const p = { x: stand(step).x + 26, y: stepTop(step) - 22 };
    this.burst(p.x, p.y, 22, 'petal', { speed: 320, size: 9, color: golden ? C.gold : '#fff', life: 1100, spread: Math.PI * 2 });
    play('chime');
    if (golden) { this.card('GOLD!', `Golden edelweiss · ×${multiplier}`, C.gold, { size: 96 }); this.flash = this.reduce ? 0 : 0.6; this.shake = 0.5; }
    else this.pop(p.x, p.y - 30, `×${multiplier}`, '#fff', 44);
  }

  private async hop(target: number, o: { dur?: number; height?: number; ring?: number; onLand?: (step: number) => void } = {}) {
    const u = this.u, a = { x: u.x, y: u.y }, b = stand(target);
    u.dir = b.x >= a.x ? 1 : -1;
    // (no sound per step: a clank on every step got grating; the counter shows the count)
    if (o.ring) { u.ring = 1; this.pop(u.x + 30 * u.dir, u.y - 150, String(o.ring), C.gold, 52); }
    u.sq = -0.22; u.pose = 'hop';
    const h = o.height ?? 36, dur = o.dur ?? 300;
    // On a wide step he walks a couple of strides to the edge first, then hops up
    if (target === u.step + 1 && SW >= 90) {
      const edge = { x: (u.step + 1) * SW - 16, y: a.y };
      let strides = 0;
      await this.tween(dur * 0.6, (p) => {
        u.x = lerp(a.x, edge.x, p); u.y = a.y - Math.abs(Math.sin(p * Math.PI * 2)) * 4; u.walk = p * Math.PI * 4;
        // a quiet footstep each time a boot comes down, sounding like the ground he's on
        if (strides < 2 && p >= (strides + 0.5) / 2) { strides++; play('step', groundAt(u.step)); }
      });
      a.x = edge.x; a.y = edge.y;
    }
    await this.tween(dur, (p) => { u.x = lerp(a.x, b.x, p); u.y = lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * h; u.walk = p * Math.PI * 2; });
    u.step = target; u.sq = 0.3; u.walk = 0; u.pose = 'idle';
    play('step', groundAt(target));
    this.burst(u.x, u.y, 5, 'dust', { speed: 90, size: 7, g: -40, life: 450, spread: Math.PI * 0.9 });
    o.onLand?.(target);
  }

  /** Step by step to `to`, ringing the bell if `count`. `final`: the round's last climb, so slow down near the window edges. */
  async walk(to: number, o: { count?: boolean; final?: boolean; onLand?: (step: number) => void; dur?: number }) {
    const dir = Math.sign(to - this.u.step);
    let k = 0;
    while (this.u.step !== to) {
      const target = this.u.step + dir;
      const tense = !!o.final && (this.inWindow(target) !== this.inWindow(this.u.step) || target >= TOP - 1 || (this.window === 'edge' && target >= TOP - 2));
      this.tense(tense);
      if (o.count) this.countStep();
      await this.hop(target, { ring: o.count ? ++k : 0, dur: tense ? 420 : o.dur ?? 280, height: dir < 0 ? 22 : 36, onLand: o.onLand });
      if (target >= TOP - 1) this.burst(this.u.x + 40, this.u.y, 4, 'pebble', { speed: 120, angle: 0.3, spread: 1, size: 7, life: 1200 });
      await this.sleep(tense ? 220 : 90);
    }
    this.tense(false);
  }

  /**
   * Spin the step counter and stop it on `steps`: a cowbell drops in on its strap, the reel on its face runs
   * a few loops through 0-9, slows and locks on, and the bell swings. Then it counts down as he walks (walk()).
   * `climb` is which climb this is (1-3), or 'echo' for the Alphorn Echo's replay.
   */
  async spinCounter(climb: number | 'echo', steps: number) {
    const r = { climb, pos: 0, target: steps, remaining: null as number | null, alpha: 1, drop: 0, dock: 0, swing: 0, note: '' };
    this.reel = r;
    await this.tween(this.reduce ? 1 : 260, (p) => { r.drop = p; }, backOut);
    if (this.reduce) { r.pos = steps; } else {
      const loops = this.speed > 1 ? 10 : 20, dist = loops + steps;
      let last = -1;
      await this.tween(this.speed > 1 ? 700 : 1500, (p) => {
        r.pos = dist * (1 - Math.pow(1 - p, 3));
        const d = Math.floor(r.pos);
        if (d !== last) { last = d; play('tick'); }
      });
      r.pos = dist;
    }
    // (the reel's ticks are the counter's only sound)
    r.swing = this.reduce ? 0 : 1;
    r.remaining = steps;
    r.note = steps === 0 ? 'Yodel break!' : steps === 1 ? 'step to go' : 'steps to go';
    await this.sleep(500);
    // Number known: tuck the bell into the top-left corner (sky behind him, whichever way the ridge runs)
    // so it keeps counting without covering the climb; he sets off while it moves
    void this.tween(this.reduce ? 1 : 450, (p) => { r.dock = p; }, easeInOut);
  }
  /** The bell rises back out of view once the climb is done. */
  async hideCounter() {
    const r = this.reel;
    if (!r) return;
    await this.tween(260, (p) => { r.drop = 1 - p; });
    if (this.reel === r) this.reel = null;
  }
  /** One step counted off: the number drops and the bell gives a small wobble. */
  private countStep() {
    const r = this.reel;
    if (!r?.remaining) return;
    r.remaining--;
    r.swing = this.reduce ? 0 : 1;
    if (r.remaining === 0) r.note = 'here we go…';
    else r.note = r.remaining === 1 ? 'step to go' : 'steps to go';
  }

  /**
   * The step counter: just the number, rolling in place, and three little mountains under it for the three
   * climbs (gold once reached, grey still to come; ECHO for the echo). Centre stage while it spins, then
   * tucked into the top-left corner at half size while it counts down.
   */
  private drawCounter() {
    const r = this.reel;
    if (!r || r.drop <= 0) return;
    const c = this.ctx;
    r.swing *= 0.9;
    const pulse = 1 + r.swing * 0.08;
    const cx = lerp(this.W / 2, 64, r.dock), cy = lerp(this.inset.top + 62, this.inset.top + 58, r.dock), sc = lerp(1, 0.55, r.dock) * pulse;
    c.save();
    c.globalAlpha = r.dock > 0.5 ? r.drop : Math.min(1, r.drop * 1.5);
    c.translate(cx, cy - 40 * (1 - r.drop) * (1 - r.dock)); c.scale(sc, sc);
    const h = 148;
    // Just the number, rolling in place: digits scroll up through an invisible slot and fade at its edges
    const wy = 6, wh = 104, mid = wy + wh / 2 + 6, base0 = c.globalAlpha;
    c.save(); c.beginPath(); c.rect(-70, wy, 140, wh); c.clip();
    const pos = r.remaining ?? r.pos;
    const base = Math.floor(pos), frac = r.remaining === null ? pos - base : 0;
    for (let k = -1; k <= 2; k++) {
      const digit = (((base + k) % 10) + 10) % 10;
      const off = (k - frac) * 84;
      c.globalAlpha = base0 * Math.max(0, 1 - Math.abs(off) / 70);
      this.text(String(digit), 0, mid + off, `88px ${FD}`, r.remaining === 0 && k === 0 ? C.red : C.gold, 12);
    }
    c.restore();
    c.globalAlpha = base0;
    // Which climb: three little mountains, the current one in gold
    if (r.climb === 'echo') this.text('ECHO', 0, wy + wh + 21, `22px ${FD}`, C.red, 0);
    else for (let i = 1; i <= 3; i++) this.climbIcon((i - 2) * 34, wy + wh + 30, i <= r.climb);
    // The label sits under the panel once the number is known
    if (r.note && r.remaining !== null) {
      const size = lerp(17, 24, r.dock);
      c.font = `800 ${size}px ${FU}`;
      const lw = c.measureText(r.note).width + size * 1.4, lh = size * 1.75, ly = h + 8 + lh / 2;
      this.rrect(-lw / 2, ly - lh / 2, lw, lh, lh / 2); this.fillInk(C.ink, 0);
      this.text(r.note, 0, ly + 1, `800 ${size}px ${FU}`, C.cream, 0);
    }
    c.restore();
  }
  /** A little mountain for one of the three climbs: gold once reached (done or current), grey still to come. */
  private climbIcon(x: number, base: number, current: boolean) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(x - 14, base); c.lineTo(x, base - 22); c.lineTo(x + 14, base); c.closePath();
    this.fillInk(current ? C.gold : '#CFC6D8', current ? 3 : 2.5);
    c.beginPath(); c.moveTo(x - 5, base - 13); c.lineTo(x, base - 22); c.lineTo(x + 5, base - 13); c.quadraticCurveTo(x, base - 10, x - 5, base - 13);
    c.fillStyle = current ? '#fff' : '#ECE8F0'; c.fill();
  }



  async yodel() {
    const u = this.u;
    u.face = 'yodel'; play('yodel');
    for (let k = 0; k < 6; k++) this.burst(u.x + 20, u.y - 90, 1, 'note', { speed: 120, angle: -1.2, spread: 0.8, g: -60, size: 7, life: 1200 });
    this.pop(u.x + 40, u.y - 150, 'HOL-DRI-O!', '#fff', 34);
    await this.sleep(1400);
    u.face = 'happy';
    this.goatSay(this.nearestGoat(), 'Get on with it!');
    await this.sleep(500);
  }

  async tease() {
    const u = this.u;
    this.shake = 0.35; play('rumble'); u.face = 'scared';
    for (let k = 0; k < 8; k++) this.parts.push({ type: 'snow', x: u.x + 60 + Math.random() * 200, y: u.y - 300, vx: -40, vy: 80, g: 200, life: 1400, max: 1400, size: 4, rot: 0, vr: 0 });
    await this.sleep(1100);
    u.face = 'happy';
    this.goatSay(this.nearestGoat(), 'Phew!');
    await this.sleep(600);
  }

  async gondola(to: number, onLand: (step: number) => void) {
    this.card('GONDOLA!', 'Free ride up the mountain', C.red);
    play('cable');
    const u = this.u, a = stand(u.step), b = stand(to);
    const P1 = { x: a.x, y: a.y - 170 }, P2 = { x: b.x, y: b.y - 170 };
    const len = Math.hypot(P2.x - P1.x, P2.y - P1.y) || 1, d = { x: (P2.x - P1.x) / len, y: (P2.y - P1.y) / len };
    const g: Gondola = { A: { x: P1.x - d.x * 1400, y: P1.y - d.y * 1400 }, B: { x: P2.x + d.x * 1400, y: P2.y + d.y * 1400 }, x: P1.x - d.x * 700, y: P1.y - d.y * 700 };
    this.cabin = g;
    const s = { x: g.x, y: g.y };
    await this.tween(1100, (p) => { g.x = lerp(s.x, P1.x, p); g.y = lerp(s.y, P1.y, p); }, easeOut);
    const u0 = { x: u.x, y: u.y };
    play('hop');
    await this.tween(320, (p) => { u.x = lerp(u0.x, P1.x, p); u.y = lerp(u0.y, P1.y + 124, p) - Math.sin(p * Math.PI) * 40; });
    await this.tween(1500, (p) => { g.x = lerp(P1.x, P2.x, p); g.y = lerp(P1.y, P2.y, p); u.x = g.x; u.y = g.y + 124; u.lean = Math.sin(p * Math.PI * 4) * 0.06; }, easeInOut);
    u.lean = 0;
    await this.tween(320, (p) => { u.x = lerp(P2.x, b.x, p); u.y = lerp(P2.y + 124, b.y, p) - Math.sin(p * Math.PI) * 30; });
    u.step = to; u.sq = 0.3; play('land'); onLand(to);
    const g0 = { x: g.x, y: g.y };
    void this.tween(900, (p) => { g.x = lerp(g0.x, g0.x + d.x * 900, p); g.y = lerp(g0.y, g0.y + d.y * 900, p); }).then(() => { this.cabin = null; });
    await this.sleep(500);
  }

  async avalanche(to: number) {
    const u = this.u, ms = Math.min(TOP, u.step + 2);
    const m = { x: stand(ms).x + 10, y: stepTop(ms), up: 0 };
    this.marmot = m;
    await this.tween(250, (p) => { m.up = p; }, backOut);
    play('whistle');
    u.face = 'scared';
    await this.sleep(700);
    void this.tween(200, (p) => { m.up = 1 - p; }).then(() => { this.marmot = null; });
    this.card('AVALANCHE!', `Knocked back ${u.step - to} steps`, '#fff');
    play('rumble'); this.shake = 1;
    const balls: Ball[] = Array.from({ length: 6 }, (_, k) => ({ x0: stand(Math.min(TOP, u.step + 5)).x + k * 70, r: 26 + (k % 3) * 10, x: 0, y: 0, rot: 0 }));
    this.balls = balls;
    const endX = stand(to).x - 300;
    const roll = this.tween(1500, (p) => balls.forEach((b, k) => { b.x = lerp(b.x0, endX - k * 40, p); b.y = topAtX(b.x) - b.r - Math.abs(Math.sin(p * 18 + k)) * 10; b.rot = -p * 14; }));
    await this.sleep(450);
    while (u.step > to) {
      const tgt = u.step - 1, a = { x: u.x, y: u.y }, b = stand(tgt);
      await this.tween(130, (p) => { u.x = lerp(a.x, b.x, p); u.y = lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * 18; u.rot -= 0.35; });
      u.step = tgt;
      this.burst(u.x, u.y, 4, 'snow', { speed: 160, size: 5, life: 600 });
    }
    u.rot = 0; u.face = 'dizzy'; u.sq = 0.35; u.dir = 1;
    for (let k = 0; k < 5; k++) this.parts.push({ type: 'star', x: u.x, y: u.y - 120, vx: Math.cos(k * 1.26) * 60, vy: -40 + Math.sin(k * 1.26) * 30, g: 40, life: 1300, max: 1300, size: 8, rot: 0, vr: 3 });
    await roll;
    this.balls = [];
    await this.sleep(700);
    u.face = 'happy';
    this.goatSay(this.nearestGoat(), 'Mäh-hä!');
  }

  async echo(to: number, onLand: (step: number) => void) {
    this.card('ECHO!', 'The last climb plays again', C.gold);
    const u = this.u;
    u.horn = 1; u.face = 'yodel';
    play('horn');
    const o = { x: u.x + 160, y: u.y - 30 };
    const rings: Ring[] = Array.from({ length: 4 }, (_, k) => ({ x: o.x, y: o.y, r: 10, a: 1, k }));
    this.rings = rings;
    await this.tween(1300, (p) => rings.forEach((r) => { const q = Math.max(0, p * 1.4 - r.k * 0.12); r.r = 10 + q * 700; r.a = Math.max(0, 1 - q); }));
    this.rings = [];
    u.horn = 0; u.face = 'happy';
    await this.spinCounter('echo', to - u.step);
    await this.walk(Math.min(to, TOP), { count: true, final: true, onLand });
    await this.hideCounter();
  }

  async foehn(to: number, onLand: (step: number) => void) {
    const dir = to >= this.u.step ? 1 : -1;
    this.card('FÖHN!', dir > 0 ? 'A warm gust pushes him up' : 'A warm gust pushes him back', '#9FE0FF');
    play('wind');
    this.windDir = dir;
    await this.tween(300, (p) => { this.wind = p; });
    this.u.lean = dir * 0.25;
    await this.walk(Math.min(to, TOP), { final: true, onLand, dur: 380 });
    this.u.lean = 0; this.u.dir = 1;
    await this.tween(400, (p) => { this.wind = 1 - p; });
  }

  async fall() {
    const u = this.u;
    u.pose = 'teeter'; u.face = 'scared'; this.tense(true);
    for (let k = 0; k < 3; k++) { this.burst(u.x + 50, u.y, 3, 'pebble', { speed: 140, angle: 0.4, spread: 0.8, size: 7, life: 1400 }); await this.sleep(380); }
    this.tense(false); u.pose = 'hop'; this.mode = 'fall';
    play('whoosh');
    this.card('WHOOPS!', 'Over the edge', C.red);
    const a = { x: u.x, y: u.y };
    await this.tween(900, (p) => { u.x = a.x + 90 * p; u.y = a.y + 560 * p * p; u.rot = p * 5; });
    u.step = TOP + 1;
    await this.sleep(400);
  }

  async rescue() {
    this.card('BARRY!', 'The St. Bernard grabs the rope', C.gold);
    play('bark');
    const top = stand(TOP);
    const dog: Dog = { x: stand(TOP - 4).x, y: stepTop(TOP - 4), dir: 1, running: true };
    this.dog = dog;
    for (let s = TOP - 3; s <= TOP; s++) {
      const a = { x: dog.x, y: dog.y }, b = { x: stand(s).x - 30, y: stepTop(s) };
      await this.tween(170, (p) => { dog.x = lerp(a.x, b.x, p); dog.y = lerp(a.y, b.y, p) - Math.sin(p * Math.PI) * 16; });
    }
    dog.running = false; this.rope = true; play('bark');
    await this.sleep(400);
    const u = this.u, a = { x: u.x, y: u.y }, r0 = u.rot;
    this.mode = 'follow';
    await this.tween(900, (p) => { u.x = lerp(a.x, top.x + 10, p); u.y = lerp(a.y, top.y, easeOut(p)) - Math.sin(p * Math.PI) * 80; u.rot = lerp(r0, 0, p); }, easeInOut);
    u.rot = 0; u.step = TOP; u.sq = 0.4; u.face = 'dizzy'; u.pose = 'idle'; this.rope = false;
    play('land');
    await this.sleep(800);
    u.face = 'happy';
    void this.tween(700, (p) => { dog.x = lerp(stand(TOP).x - 30, stand(TOP - 6).x, p); dog.y = topAtX(dog.x); dog.dir = -1; dog.running = true; }).then(() => { this.dog = null; });
    await this.sleep(300);
  }

  async won(title: string, sub: string, amount: number, format: (v: number) => string) {
    this.tense(false);
    await this.switchView('overview');
    await this.sleep(1100);
    this.win = { text: title, sub, amount, shown: 0, format };
    this.card('JUHUI!', '', C.gold, { dur: 3200 });
    play('stamp'); play('fanfare'); this.shake = this.reduce ? 0 : 0.8;
    for (let k = 0; k < 80; k++) this.sparts.push({ type: 'petal', x: Math.random() * this.W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 120, g: 40, life: 4000, max: 4000, size: 10, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8, color: k % 7 ? '#fff' : C.gold });
    this.goats.forEach((_, i) => setTimeout(() => this.goatSay(i, 'Juhui!'), i * 250));
    await this.sleep(3000);
  }

  async lost(sub: string) {
    this.tense(false);
    await this.switchView('overview');
    await this.sleep(1100);
    this.card('OH NEI…', sub, C.cream, { size: 72, big: false, dur: 2000 });
    play('sad');
    setTimeout(() => this.goatSay(this.nearestGoat(), 'Mäh-hä-hä!'), 400);
    await this.sleep(1900);
  }

  /** Back to the overview between rounds; the last win stays up until the next climb. */
  idle() {
    this.tense(false); this.u.face = 'happy'; this.u.pose = 'idle';
    if (this.mode !== 'overview') void this.switchView('overview');
  }
}
