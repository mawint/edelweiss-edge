// Stages one book on the scene, event by event. The book decides everything that matters (where Ueli goes,
// which blooms he picks, what the round pays); the director only picks the camera beats. Cosmetic choices
// (weather, a false-alarm rumble) are seeded from the book's id, so a replay looks the same every time.
import { TOP, planRound, type Book, type BookEvent, type ClimbPlan } from './book';
import { type Scene, type Weather } from './scene';

const WEATHER_LABEL: Record<Weather, string> = { sun: 'Sunny', fog: 'Foggy', storm: 'Stormy' };

/** A small seeded generator (mulberry32): the same book always gets the same weather and teases. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StageOptions {
  /** Money as the player's currency shows it. */
  format: (v: number) => string;
  bet: number;
  /** Social-casino wording for the result text. */
  social: boolean;
  /** Skip the animation and show where the round ended (a resumed round, or QA). */
  instant?: boolean;
  /** A line for screen readers as each beat happens. */
  announce?: (text: string) => void;
}

export async function stageRound(book: Book, scene: Scene, o: StageOptions): Promise<ClimbPlan> {
  const plan = planRound(book);
  const rng = seeded(book.id);
  const weather: Weather = rng() < 0.55 ? 'sun' : rng() < 0.5 ? 'fog' : 'storm';
  const say = o.announce ?? (() => {});
  scene.reset(weather);
  scene.setWindow(plan.window);

  if (o.instant) {
    scene.placeAt(plan.step);
    for (const b of plan.blooms) scene.picked.push(b);
    return plan;
  }

  scene.busy = true;
  try {
    const events = book.events;
    const hidden = events.filter((e) => e.type === 'bloom').length;
    say(`${WEATHER_LABEL[weather]} on the ridge.${hidden ? ` ${hidden} edelweiss hidden.` : ''}`);
    await scene.intro(hidden, WEATHER_LABEL[weather]);

    let at = 0;
    const lastClimb = events.reduce((last, e, i) => (e.type === 'climb' ? i : last), -1);
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      // The blooms a move reaches come right after it in the book; burst each one as he steps onto it
      const queue: Extract<BookEvent, { type: 'bloom' }>[] = [];
      for (let j = i + 1; j < events.length && events[j].type === 'bloom'; j++) queue.push(events[j] as Extract<BookEvent, { type: 'bloom' }>);
      const reach = (step: number) => {
        while (queue.length && queue[0].step <= step) {
          const b = queue.shift()!;
          scene.bloom(b.step, b.golden, b.multiplier / 100);
          say(`${b.golden ? 'Golden edelweiss' : 'Edelweiss'}! Multiplier ×${b.multiplier / 100}.`);
        }
      };
      reach(at);

      switch (e.type) {
        case 'climb': {
          if (e.n > 1 && rng() < 0.2) await scene.tease();
          await scene.climbLabel(e.n);
          if (e.steps === 0) { say(`Climb ${e.n} of 3: he stops to yodel.`); await scene.yodel(); break; }
          say(`Climb ${e.n} of 3: ${e.steps} step${e.steps > 1 ? 's' : ''}.`);
          await scene.walk(Math.min(e.to, TOP), { count: true, final: i === lastClimb, onLand: reach });
          break;
        }
        case 'feature': {
          const to = Math.min(e.to, TOP);
          if (e.kind === 'gondola') { say('Gondola! A free ride up.'); await scene.gondola(to, reach); }
          else if (e.kind === 'avalanche') { say('Avalanche! He tumbles back.'); await scene.avalanche(to); }
          else if (e.kind === 'echo') { say('The alphorn echoes. The last climb plays again.'); await scene.echo(e.to, reach); }
          else if (e.kind === 'foehn') { say('Föhn wind! He drifts.'); await scene.foehn(e.to, reach); }
          else { say("Barry the St. Bernard pulls him back up!"); await scene.rescue(); }
          break;
        }
        case 'fall':
          say("He's over the edge!");
          await scene.fall();
          break;
        default:
          break;
      }
      if (e.type === 'climb' || e.type === 'feature' || e.type === 'fall') at = Math.min(e.type === 'fall' ? TOP : e.to, TOP);
      reach(at);
      // (the blooms just staged are skipped by the loop: nothing to do for them)
    }

    if (plan.win > 0) {
      const edge = plan.window === 'edge';
      const sub = `${plan.pay}× ${plan.multiplier > 1 ? `× ${plan.multiplier} edelweiss` : ''}`.trim();
      say(`${edge ? 'He went over. You called it.' : 'He stopped in your window!'} Win ${o.format(plan.win * o.bet)}.`);
      await scene.won('WIN', sub, plan.win * o.bet, o.format);
    } else {
      const sub = plan.window === 'edge'
        ? book.events.some((e) => e.type === 'feature' && e.kind === 'rescue') ? 'Barry saved him. Not your call.' : 'He stayed on the mountain'
        : 'Outside your window';
      say(`${sub}. No win this time.`);
      await scene.lost(sub);
    }
    return plan;
  } finally {
    scene.busy = false;
    scene.idle();
  }
}
