// Every sound in the game is synthesized here with WebAudio: no audio files to load. Everything, the
// ambient wind and distant bells included, runs through one master gain, so the sound toggle mutes it all
// (review item [107]). A short generated reverb gives the mountain some air; a compressor keeps the loud
// moments (avalanche, fanfare) from clipping.

type Sfx =
  | 'bell' | 'hop' | 'step' | 'land' | 'heart' | 'rumble' | 'wind' | 'whistle' | 'chime' | 'yodel' | 'horn'
  | 'fanfare' | 'bark' | 'goat' | 'whoosh' | 'stamp' | 'thunder' | 'cable' | 'sad' | 'tick' | 'clunk';

const KEY = 'edelweiss.sound';
const VOLUME = 0.55;

let ac: AudioContext | null = null;
let master: GainNode | null = null;
/** What each sound connects to: dry to the master, plus a send into the reverb. */
let bus: GainNode | null = null;
let on = readSetting();
let ambientStarted = false;

function readSetting(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Browsers only start audio after a tap or key press, so the first Climb (or the toggle) calls this. */
export function unlockSound() {
  if (!ac) {
    try {
      ac = new AudioContext();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 4;
      comp.connect(ac.destination);
      master = ac.createGain();
      master.gain.value = on ? VOLUME : 0;
      master.connect(comp);
      bus = ac.createGain();
      bus.connect(master);
      const verb = ac.createConvolver();
      verb.buffer = impulse(ac, 2.4);
      const send = ac.createGain();
      send.gain.value = 0.22;
      bus.connect(send);
      send.connect(verb);
      verb.connect(master);
      // A hidden tab shouldn't keep the wind blowing
      document.addEventListener('visibilitychange', () => {
        if (!ac) return;
        if (document.hidden) void ac.suspend().catch(() => {});
        else void ac.resume().catch(() => {});
      });
    } catch {
      ac = null;
    }
  }
  if (ac?.state === 'suspended') void ac.resume().catch(() => {});
  if (ac && !ambientStarted) { ambientStarted = true; startAmbient(ac); }
}

export const soundOn = () => on;
export function setSound(value: boolean) {
  on = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    /* the setting just won't persist */
  }
  if (value) unlockSound();
  if (ac && master) master.gain.setTargetAtTime(value ? VOLUME : 0, ac.currentTime, 0.05);
}

export function play(name: Sfx, arg?: number) {
  if (!on || !ac || !bus || ac.state !== 'running') return;
  try {
    SFX[name](ac, bus, ac.currentTime + 0.01, arg);
  } catch (e) {
    // Sound is never worth breaking a round over, but say so while developing
    if (import.meta.env.DEV) console.warn(`sound ${name} failed`, e);
  }
}

// ---------- building blocks ----------
type Play = (ac: AudioContext, out: AudioNode, t: number, arg?: number) => void;

/** A decaying burst of noise, the reverb's impulse response: a big, soft valley. */
function impulse(ac: AudioContext, seconds: number) {
  const len = Math.ceil(ac.sampleRate * seconds), b = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return b;
}
function env(ac: AudioContext, out: AudioNode, node: AudioNode, t0: number, attack: number, decay: number, peak: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  g.connect(out);
  return g;
}
function osc(ac: AudioContext, type: OscillatorType, f: number, t0: number, dur: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}
let noiseBuf: AudioBuffer | null = null;
function noise(ac: AudioContext, t0: number, dur: number) {
  if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.start(t0);
  s.stop(t0 + dur + 0.05);
  return s;
}
function filter(ac: AudioContext, type: BiquadFilterType, f: number, q = 1) {
  const n = ac.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}
const through = (src: AudioNode, ...fs: AudioNode[]) => fs.reduce((a, b) => (a.connect(b), b), src);
function vibrato(ac: AudioContext, target: AudioParam, t: number, dur: number, rate: number, depth: number) {
  const lfo = osc(ac, 'sine', rate, t, dur);
  const g = ac.createGain();
  g.gain.value = depth;
  lfo.connect(g);
  g.connect(target);
}
/** A voice-like tone: a buzzy source through two vowel formants (roughly "oh", "ee" or "ah"). */
function voice(ac: AudioContext, src: AudioNode, vowel: 'o' | 'i' | 'a') {
  const [f1, f2] = { o: [450, 800], i: [300, 2300], a: [750, 1150] }[vowel];
  const mix = ac.createGain();
  const a = filter(ac, 'bandpass', f1, 6), b = filter(ac, 'bandpass', f2, 8);
  src.connect(a); src.connect(b);
  const gb = ac.createGain(); gb.gain.value = 0.6;
  a.connect(mix); b.connect(gb); gb.connect(mix);
  return { node: mix, a, b };
}


/**
 * A hammered-metal bell, the kind cows wear: a cluster of inharmonic sine partials, each with its own
 * decay (the high ones die first), detuned pairs that beat for that shimmering ring, and a clapper strike.
 * Square waves sounded like an 8-bit game; this is what makes it read as a real bell in the Alps.
 */
function metalBell(ac: AudioContext, out: AudioNode, t: number, f: number, peak: number, ring: number) {
  const partials: [number, number, number][] = [
    // [ratio, level, decay as a share of `ring`]
    [1, 1, 1], [1.51, 0.7, 0.8], [2.02, 0.55, 0.62], [2.66, 0.42, 0.45], [3.41, 0.3, 0.32], [4.53, 0.18, 0.22], [5.9, 0.1, 0.15],
  ];
  for (const [r, lvl, d] of partials) {
    for (const detune of [1, 1.0035]) {
      const o = osc(ac, 'sine', f * r * detune, t, ring * d + 0.1);
      env(ac, out, o, t, 0.002, ring * d, peak * lvl * 0.5);
    }
  }
  // The clapper: a short, bright metallic tick
  env(ac, out, through(noise(ac, t, 0.05), filter(ac, 'bandpass', f * 6, 1.5)), t, 0.001, 0.035, peak * 0.6);
}

/** The alphorn: a warm, breathy natural-horn tone with a slow swell and a little vibrato. */
function hornNote(ac: AudioContext, out: AudioNode, t: number, f: number, dur: number, peak = 0.16) {
  const o1 = osc(ac, 'sawtooth', f, t, dur), o2 = osc(ac, 'sawtooth', f * 1.004, t, dur);
  vibrato(ac, o1.frequency, t, dur, 5, f * 0.006);
  const lp = filter(ac, 'lowpass', 500, 0.5);
  lp.frequency.setValueAtTime(320, t);
  lp.frequency.linearRampToValueAtTime(950, t + 0.22);
  lp.frequency.linearRampToValueAtTime(600, t + dur);
  const mix = ac.createGain();
  mix.gain.value = 0.6;
  o1.connect(lp); o2.connect(mix); mix.connect(lp);
  env(ac, out, lp, t, 0.12, dur, peak);
  env(ac, out, through(noise(ac, t, 0.25), filter(ac, 'bandpass', f * 2, 2)), t, 0.04, 0.2, 0.02);
}
function hornCall(ac: AudioContext, out: AudioNode, t: number, notes: [number, number][]) {
  let at = t;
  for (const [f, d] of notes) { hornNote(ac, out, at, f, d); at += d * 0.85; }
}
const chime: Play = (ac, out, t) =>
  [1568, 2093, 2637].forEach((f, i) => env(ac, out, osc(ac, 'sine', f, t + i * 0.07, 1.2), t + i * 0.07, 0.004, 1.1, 0.1));

// ---------- the sounds ----------
const SFX: Record<Sfx, Play> = {
  /**
   * The cowbell. Every step rings the same clank (a rising tune per step was too much), with a hair of
   * variation so it doesn't sound mechanical; `n` 0 is the counter's own, lower bell.
   */
  bell(ac, out, t, n = 0) {
    // The counter's own bell is the big one: deep, long ring. A smaller bell otherwise.
    if (n === 0) metalBell(ac, out, t, 262, 0.3, 2.2);
    else metalBell(ac, out, t, 520 * (0.985 + Math.random() * 0.03), 0.22, 1.1);
  },
  /** A light hop off the step: a short airy whoosh. */
  hop(ac, out, t) {
    const f = filter(ac, 'bandpass', 900, 1.5);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    env(ac, out, through(noise(ac, t, 0.15), f), t, 0.01, 0.12, 0.05);
  },
  /** A boot on rock or grass. */
  step(ac, out, t) {
    env(ac, out, through(noise(ac, t, 0.08), filter(ac, 'lowpass', 700 + Math.random() * 300)), t, 0.002, 0.06, 0.12);
  },
  /** Landing on the next step: a soft thump with some weight. */
  land(ac, out, t) {
    env(ac, out, through(noise(ac, t, 0.15), filter(ac, 'lowpass', 400)), t, 0.002, 0.12, 0.22);
    const o = osc(ac, 'sine', 120, t, 0.15);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    env(ac, out, o, t, 0.002, 0.12, 0.25);
  },
  heart(ac, out, t) {
    [0, 0.17].forEach((d, i) => {
      const o = osc(ac, 'sine', 58, t + d, 0.25);
      o.frequency.exponentialRampToValueAtTime(38, t + d + 0.2);
      env(ac, out, o, t + d, 0.005, 0.2, i ? 0.35 : 0.55);
    });
  },
  rumble(ac, out, t) {
    const lp = filter(ac, 'lowpass', 120);
    lp.frequency.linearRampToValueAtTime(260, t + 0.6);
    lp.frequency.linearRampToValueAtTime(90, t + 2);
    env(ac, out, through(noise(ac, t, 2.2), lp), t, 0.25, 1.9, 0.9);
    env(ac, out, osc(ac, 'sine', 42, t, 2), t, 0.3, 1.6, 0.4);
  },
  wind(ac, out, t) {
    const f = filter(ac, 'bandpass', 350, 1.2);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.9);
    f.frequency.exponentialRampToValueAtTime(500, t + 1.8);
    env(ac, out, through(noise(ac, t, 2), f), t, 0.35, 1.5, 0.4);
  },
  /** A marmot's alarm whistle: two sharp chirps. */
  whistle(ac, out, t) {
    [0, 0.28].forEach((d) => {
      const o = osc(ac, 'sine', 2300, t + d, 0.2);
      o.frequency.linearRampToValueAtTime(3100, t + d + 0.05);
      o.frequency.linearRampToValueAtTime(2600, t + d + 0.16);
      env(ac, out, o, t + d, 0.005, 0.16, 0.16);
    });
  },
  chime,
  /** A yodel: a vowel-shaped voice flipping between chest and head register (the yodel "break"). */
  yodel(ac, out, t) {
    const src = osc(ac, 'sawtooth', 294, t, 1.7);
    const notes: [number, 'o' | 'i'][] = [[294, 'o'], [587, 'i'], [494, 'i'], [294, 'o'], [392, 'o'], [784, 'i'], [659, 'i'], [392, 'o']];
    vibrato(ac, src.frequency, t, 1.7, 5.5, 6);
    const v = voice(ac, src, 'o');
    notes.forEach(([f, vow], i) => {
      const at = t + i * 0.19;
      src.frequency.setTargetAtTime(f, at, 0.015);
      const [f1, f2] = vow === 'o' ? [450, 800] : [300, 2300];
      v.a.frequency.setTargetAtTime(f1, at, 0.02);
      v.b.frequency.setTargetAtTime(f2, at, 0.02);
    });
    env(ac, out, v.node, t, 0.05, 1.55, 0.5);
  },
  /** The alphorn call he plays for the echo. */
  horn: (ac, out, t) => hornCall(ac, out, t, [[175, 0.5], [262, 0.4], [349, 0.7], [262, 0.9]]),
  /** A win: the alphorn's big call, then the chime. */
  fanfare(ac, out, t) {
    hornCall(ac, out, t, [[175, 0.35], [262, 0.35], [349, 0.35], [440, 0.45], [523, 0.9]]);
    chime(ac, out, t + 1.6);
  },
  bark(ac, out, t) {
    [0, 0.22].forEach((d) => {
      const src = osc(ac, 'sawtooth', 260, t + d, 0.16);
      src.frequency.exponentialRampToValueAtTime(140, t + d + 0.13);
      const v = voice(ac, src, 'a');
      env(ac, out, through(v.node, filter(ac, 'lowpass', 1600)), t + d, 0.006, 0.12, 0.5);
      env(ac, out, through(noise(ac, t + d, 0.12), filter(ac, 'bandpass', 900, 1.2)), t + d, 0.004, 0.1, 0.15);
    });
  },
  /** A goat: a nasal, wobbling "mehh". */
  goat(ac, out, t) {
    const src = osc(ac, 'sawtooth', 310, t, 0.7);
    vibrato(ac, src.frequency, t, 0.7, 13, 28);
    src.frequency.linearRampToValueAtTime(260, t + 0.6);
    const v = voice(ac, src, 'a');
    v.b.frequency.value = 1700;
    env(ac, out, through(v.node, filter(ac, 'lowpass', 2200)), t, 0.03, 0.6, 0.3);
    env(ac, out, through(noise(ac, t, 0.6), filter(ac, 'bandpass', 1500, 2)), t, 0.03, 0.5, 0.04);
  },
  whoosh(ac, out, t) {
    const f = filter(ac, 'bandpass', 500, 1.2);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.3);
    env(ac, out, through(noise(ac, t, 0.5), f), t, 0.05, 0.35, 0.25);
  },
  stamp(ac, out, t) {
    env(ac, out, through(noise(ac, t, 0.3), filter(ac, 'lowpass', 500)), t, 0.002, 0.25, 0.6);
    const o = osc(ac, 'sine', 90, t, 0.4);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    env(ac, out, o, t, 0.002, 0.35, 0.7);
  },
  thunder(ac, out, t) {
    env(ac, out, through(noise(ac, t, 0.3), filter(ac, 'lowpass', 2500)), t, 0.002, 0.2, 0.25);
    env(ac, out, through(noise(ac, t, 3), filter(ac, 'lowpass', 140)), t + 0.05, 0.1, 2.8, 0.7);
  },
  /** The gondola's cable: a low hum and a rattle of pulleys. */
  cable(ac, out, t) {
    const o = osc(ac, 'sawtooth', 82, t, 2);
    vibrato(ac, o.frequency, t, 2, 7, 2);
    env(ac, out, through(o, filter(ac, 'lowpass', 240)), t, 0.3, 1.6, 0.14);
    for (let k = 0; k < 6; k++) env(ac, out, through(noise(ac, t + k * 0.22, 0.03), filter(ac, 'bandpass', 2500, 3)), t + k * 0.22, 0.001, 0.03, 0.05);
  },
  /** A loss: the sad trombone, wah-wah-wah-waaah. */
  sad(ac, out, t) {
    ([[311, 0.3], [294, 0.3], [277, 0.3], [262, 1.0]] as const).forEach(([f, d], i) => {
      const at = t + i * 0.32;
      const o = osc(ac, 'sawtooth', f, at, d);
      if (i === 3) vibrato(ac, o.frequency, at, d, 6, 5);
      const lp = filter(ac, 'lowpass', 500, 3);
      lp.frequency.setValueAtTime(400, at);
      lp.frequency.linearRampToValueAtTime(1200, at + 0.1);
      lp.frequency.linearRampToValueAtTime(500, at + d);
      env(ac, out, through(o, lp), at, 0.03, d, 0.14);
    });
  },
  /** The counter's reel passing a digit: a small wooden click. */
  tick: (ac, out, t) => env(ac, out, through(noise(ac, t, 0.02), filter(ac, 'bandpass', 2600, 4)), t, 0.001, 0.018, 0.22),
  /** The reel locking onto its number. */
  clunk(ac, out, t) {
    env(ac, out, through(noise(ac, t, 0.1), filter(ac, 'bandpass', 700, 3)), t, 0.001, 0.08, 0.5);
    env(ac, out, osc(ac, 'sine', 180, t, 0.15), t, 0.001, 0.12, 0.25);
  },
};

// ---------- ambience: soft wind and, now and then, a distant cowbell ----------
function startAmbient(ac: AudioContext) {
  if (!bus) return;
  const out = bus, t = ac.currentTime, forever = 60 * 60 * 24;
  const lp = filter(ac, 'lowpass', 420, 0.6);
  const g = ac.createGain();
  g.gain.value = 0.035;
  vibrato(ac, g.gain, t, forever, 0.11, 0.018);
  vibrato(ac, lp.frequency, t, forever, 0.07, 160);
  noise(ac, t, forever).connect(lp);
  lp.connect(g);
  g.connect(out);
  setInterval(() => {
    if (!on || ac.state !== 'running' || Math.random() > 0.45) return;
    const at = ac.currentTime + 0.05, f = 420 + Math.random() * 260;
    const far = filter(ac, 'lowpass', 1800);
    far.connect(out);
    metalBell(ac, far, at, f, 0.035, 0.9);
  }, 2600);
}

/** QA: render every sound into a silent offline context and return the names of any that throw. */
export async function checkSounds(): Promise<string[]> {
  const off = new OfflineAudioContext(2, 44100 * 4, 44100);
  const failed: string[] = [];
  for (const [name, fn] of Object.entries(SFX)) {
    try {
      fn(off as unknown as AudioContext, off.destination, 0.01, 3);
      fn(off as unknown as AudioContext, off.destination, 0.5, 0);
    } catch (e) {
      failed.push(`${name}: ${e}`);
    }
  }
  await off.startRendering();
  return failed;
}

/** QA: render a few sounds one after another into an offline buffer, to listen to outside the game. */
export async function renderSounds(names: Sfx[], gap = 1.4): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, Math.ceil(44100 * (names.length * gap + 2.5)), 44100);
  const comp = off.createDynamicsCompressor();
  comp.connect(off.destination);
  const m = off.createGain(); m.gain.value = VOLUME; m.connect(comp);
  const b = off.createGain(); b.connect(m);
  const verb = off.createConvolver(); verb.buffer = impulse(off as unknown as AudioContext, 2.4);
  const send = off.createGain(); send.gain.value = 0.22; b.connect(send); send.connect(verb); verb.connect(m);
  names.forEach((n, i) => SFX[n](off as unknown as AudioContext, b, 0.1 + i * gap, n === 'bell' && i === 0 ? 0 : 1));
  return off.startRendering();
}
