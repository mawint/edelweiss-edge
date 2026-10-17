// Every sound in the game is synthesized here with WebAudio: no audio files to load. All of it goes through
// one master gain, so the sound toggle mutes everything (review item [107]).

type Sfx =
  | 'bell' | 'hop' | 'land' | 'heart' | 'rumble' | 'wind' | 'whistle' | 'chime' | 'yodel' | 'horn'
  | 'fanfare' | 'bark' | 'goat' | 'whoosh' | 'stamp' | 'thunder' | 'cable' | 'sad';

const KEY = 'edelweiss.sound';

let ac: AudioContext | null = null;
let master: GainNode | null = null;
let on = readSetting();

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
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    } catch {
      ac = null;
    }
  }
  if (ac?.state === 'suspended') void ac.resume().catch(() => {});
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
}

export function play(name: Sfx, arg?: number) {
  if (!on || !ac || !master || ac.state !== 'running') return;
  try {
    SFX[name](ac, master, ac.currentTime + 0.01, arg);
  } catch {
    /* sound is never worth breaking a round over */
  }
}

// ---------- the synth ----------
type Play = (ac: AudioContext, out: AudioNode, t: number, arg?: number) => void;

function env(ac: AudioContext, out: AudioNode, node: AudioNode, t0: number, attack: number, decay: number, peak: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g);
  g.connect(out);
}
function osc(ac: AudioContext, type: OscillatorType, f: number, t0: number, dur: number) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
  return o;
}
function noise(ac: AudioContext, t0: number, dur: number) {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource();
  s.buffer = b;
  s.start(t0);
  return s;
}
function filter(ac: AudioContext, type: BiquadFilterType, f: number, q = 1) {
  const n = ac.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}
const through = (src: AudioNode, f: BiquadFilterNode) => (src.connect(f), f);
const vibrato = (ac: AudioContext, target: OscillatorNode, t: number, dur: number, rate: number, depth: number) => {
  const lfo = osc(ac, 'sine', rate, t, dur);
  const g = ac.createGain();
  g.gain.value = depth;
  lfo.connect(g);
  g.connect(target.frequency);
};

const hornNotes = (ac: AudioContext, out: AudioNode, t: number, notes: number[]) =>
  notes.forEach((f, i) => env(ac, out, through(osc(ac, 'sawtooth', f, t + i * 0.32, 0.5), filter(ac, 'lowpass', 900)), t + i * 0.32, 0.05, 0.42, 0.2));
const chime: Play = (ac, out, t) =>
  [1320, 1760, 2640].forEach((f, i) => env(ac, out, osc(ac, 'sine', f, t + i * 0.06, 0.8), t + i * 0.06, 0.005, 0.7, 0.14));

const SFX: Record<Sfx, Play> = {
  /** The cowbell: two detuned squares through a band-pass. `arg` raises the pitch as the count climbs. */
  bell(ac, out, t, r = 1) {
    const bp = filter(ac, 'bandpass', 2400 * r, 1.2);
    osc(ac, 'square', 540 * r, t, 0.6).connect(bp);
    osc(ac, 'square', 800 * r, t, 0.6).connect(bp);
    env(ac, out, bp, t, 0.002, 0.5, 0.32);
  },
  hop(ac, out, t) {
    const o = osc(ac, 'sine', 300, t, 0.12);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.1);
    env(ac, out, o, t, 0.005, 0.1, 0.06);
  },
  land: (ac, out, t) => env(ac, out, through(noise(ac, t, 0.15), filter(ac, 'lowpass', 500)), t, 0.003, 0.12, 0.18),
  heart(ac, out, t) {
    [0, 0.17].forEach((d, i) => {
      const o = osc(ac, 'sine', 58, t + d, 0.25);
      o.frequency.exponentialRampToValueAtTime(38, t + d + 0.2);
      env(ac, out, o, t + d, 0.005, 0.2, i ? 0.35 : 0.55);
    });
  },
  rumble: (ac, out, t) => env(ac, out, through(noise(ac, t, 2), filter(ac, 'lowpass', 160)), t, 0.2, 1.7, 0.9),
  wind(ac, out, t) {
    const f = filter(ac, 'bandpass', 400, 0.8);
    f.frequency.exponentialRampToValueAtTime(1500, t + 1.2);
    env(ac, out, through(noise(ac, t, 1.6), f), t, 0.3, 1.2, 0.35);
  },
  whistle(ac, out, t) {
    [0, 0.3].forEach((d) => {
      const o = osc(ac, 'sine', 2500, t + d, 0.2);
      o.frequency.linearRampToValueAtTime(2900, t + d + 0.15);
      env(ac, out, o, t + d, 0.01, 0.18, 0.18);
    });
  },
  chime,
  yodel(ac, out, t) {
    const o = osc(ac, 'triangle', 392, t, 1.3);
    [392, 587, 494, 784, 587, 880, 659, 392].forEach((f, i) => o.frequency.setValueAtTime(f, t + i * 0.15));
    vibrato(ac, o, t, 1.3, 6, 9);
    env(ac, out, o, t, 0.03, 1.2, 0.22);
  },
  horn: (ac, out, t) => hornNotes(ac, out, t, [174, 261, 348, 261]),
  fanfare(ac, out, t) {
    hornNotes(ac, out, t, [174, 261, 348, 435, 522, 696]);
    chime(ac, out, t + 1.7);
  },
  bark(ac, out, t) {
    [0, 0.2].forEach((d) => {
      const o = osc(ac, 'square', 460, t + d, 0.12);
      o.frequency.exponentialRampToValueAtTime(170, t + d + 0.1);
      env(ac, out, through(o, filter(ac, 'lowpass', 1400)), t + d, 0.005, 0.1, 0.22);
    });
  },
  goat(ac, out, t) {
    const o = osc(ac, 'sawtooth', 330, t, 0.6);
    vibrato(ac, o, t, 0.6, 11, 30);
    env(ac, out, through(o, filter(ac, 'lowpass', 1600)), t, 0.02, 0.5, 0.12);
  },
  whoosh(ac, out, t) {
    const f = filter(ac, 'bandpass', 600, 1);
    f.frequency.exponentialRampToValueAtTime(2000, t + 0.35);
    env(ac, out, through(noise(ac, t, 0.5), f), t, 0.02, 0.4, 0.3);
  },
  stamp(ac, out, t) {
    env(ac, out, through(noise(ac, t, 0.3), filter(ac, 'lowpass', 300)), t, 0.002, 0.25, 0.7);
    env(ac, out, osc(ac, 'sine', 70, t, 0.3), t, 0.002, 0.28, 0.6);
  },
  thunder: (ac, out, t) => env(ac, out, through(noise(ac, t, 2.4), filter(ac, 'lowpass', 120)), t, 0.05, 2.2, 0.7),
  cable: (ac, out, t) => env(ac, out, through(osc(ac, 'sawtooth', 98, t, 1.6), filter(ac, 'lowpass', 260)), t, 0.2, 1.3, 0.1),
  sad: (ac, out, t) =>
    [392, 349, 311, 262].forEach((f, i) => env(ac, out, through(osc(ac, 'sawtooth', f, t + i * 0.22, 0.3), filter(ac, 'lowpass', 800)), t + i * 0.22, 0.02, 0.25, 0.12)),
};
