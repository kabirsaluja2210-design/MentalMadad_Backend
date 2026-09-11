import { seededRandom } from '@/lib/media-encode';
import { titleCase, topicPhrase } from './text';

/**
 * Keeps a leading article when the phrase is used inside a sentence.
 * topicPhrase() strips it, which reads fine after "Imagine …" but produces
 * "For decades, lighthouse on the coast worked …" everywhere else.
 */
function subjectPhrase(topic: string): string {
  const cleaned = topic.replace(/[.?!]+$/, '').trim().toLowerCase();
  if (/^(a|an|the)\s+/i.test(cleaned)) return cleaned;
  const bare = topicPhrase(topic);
  // Only add an article to a bare noun phrase, not to something already
  // determined by a possessive or a plural-sounding head word.
  return /^(his|her|their|its|my|our|your)\b/.test(bare) ? bare : `the ${bare}`;
}

/**
 * Narrative arc builder.
 *
 * The original planners drew from a fixed pool of lines, so a 60-second
 * request silently produced whatever that pool happened to contain — about
 * half the asked-for length. This builds an arc of a *requested* length
 * instead: the beat count is derived from the duration, and the extra beats go
 * into the middle of the story, where development belongs, rather than padding
 * the ending.
 *
 * Frames are grouped by narrative function and drawn without repetition, so a
 * long piece keeps moving instead of restating itself.
 */

export type Beatfunction =
  | 'hook' | 'premise' | 'context' | 'development' | 'turn'
  | 'consequence' | 'resolution' | 'close';

export interface ArcBeat {
  text: string;
  function: Beatfunction;
  /** 0..1 position in the arc, used to steer the visual. */
  position: number;
}

type FrameSet = Record<Beatfunction, ((phrase: string) => string)[]>;

/** Documentary register: explanatory, measured, third person. */
const DOCUMENTARY: FrameSet = {
  hook: [
    (p) => `Everything about ${p} rests on one detail almost nobody looks at.`,
    (p) => `For decades, ${p} worked exactly as intended. Then it did not.`,
    (p) => `There is a version of ${p} that never made it into the record.`,
  ],
  premise: [
    (p) => `To understand why, you have to start with what ${p} was built to do.`,
    (p) => `The story of ${p} begins with a problem nobody thought was urgent.`,
  ],
  context: [
    (p) => `At the time, the assumptions behind it were entirely reasonable.`,
    (p) => `Everyone involved was working from the same incomplete picture.`,
    (p) => `The conditions that made it possible had taken years to assemble.`,
    (p) => `What looked like a single decision was really dozens of smaller ones.`,
  ],
  development: [
    () => `The first sign was small enough to be filed away and forgotten.`,
    () => `A second report arrived, and it contradicted the first.`,
    () => `Rather than resolve the contradiction, the process routed around it.`,
    () => `Each correction made the system harder to see clearly.`,
    () => `The people closest to it noticed. The people deciding did not.`,
    () => `By the time the pattern was obvious, it was also expensive to admit.`,
    () => `Two separate teams reached the same conclusion independently.`,
    () => `The warning was specific, dated, and filed in the right place.`,
    () => `What followed was not a failure of information. It was a failure of attention.`,
    () => `The margin that everything depended on had been quietly spent.`,
    () => `Small compromises had accumulated into a structural one.`,
    () => `Nobody had lied. Everybody had rounded in the same direction.`,
    () => `The schedule absorbed the risk that the design had refused.`,
    () => `And still, for a while, it held.`,
    () => `A review was commissioned, and its scope was quietly narrowed.`,
    () => `The metric everyone trusted had stopped measuring the thing that mattered.`,
    () => `Responsibility had been divided until no single person held it.`,
    () => `An earlier version of the same problem had been solved and forgotten.`,
    () => `The cheapest moment to fix it had already passed unnoticed.`,
    () => `Confidence kept rising while the evidence for it thinned.`,
    () => `What had been a temporary measure was now load-bearing.`,
    () => `Each success made the next warning easier to discount.`,
    () => `The exception had been granted so often it was effectively the rule.`,
    () => `Documentation described a system that no longer existed.`,
  ],
  turn: [
    () => `Then the conditions everyone had assumed were fixed began to move.`,
    () => `The moment it broke, it broke in the one place nobody had instrumented.`,
    () => `What changed was not the system. It was the question being asked of it.`,
  ],
  consequence: [
    () => `The consequences did not stay contained for long.`,
    () => `Everything built on the old assumption had to be rebuilt or abandoned.`,
    () => `The cost was paid by people who had never been consulted.`,
    () => `Recovery took longer than the original construction had.`,
  ],
  resolution: [
    (p) => `What survives of ${p} today is mostly the correction, not the original.`,
    () => `The fix, when it came, was unglamorous and almost entirely procedural.`,
    () => `The lesson was written down. Whether it was learned is a separate question.`,
  ],
  close: [
    () => `Which is the part worth remembering.`,
    () => `It is a mechanism, not an accident — and mechanisms repeat.`,
    () => `That is how something obvious stays invisible for years.`,
  ],
};

/** Story register: first person, scene-driven, closer in. */
const STORY: FrameSet = {
  hook: [
    (p) => `I still have not told anyone the whole truth about ${p}.`,
    (p) => `The night everything changed, ${p} was the last thing on my mind.`,
    () => `It started with something so small I almost did not mention it.`,
  ],
  premise: [
    (p) => `You need to know what ${p} meant to us before any of this makes sense.`,
    () => `We had been doing it the same way for years, and it had always worked.`,
  ],
  context: [
    () => `There were four of us, and none of us were paying proper attention.`,
    () => `Looking back, the warning signs were not subtle at all.`,
    () => `I had been told exactly once, in passing, and I had not listened.`,
    () => `Everyone assumed somebody else had checked.`,
  ],
  development: [
    () => `The first thing that went wrong was easy to explain away.`,
    () => `The second thing was harder.`,
    () => `I asked about it and got an answer that raised more questions.`,
    () => `That night I went back and read everything again from the start.`,
    () => `The dates did not line up. Not by a little — by months.`,
    () => `I brought it to the one person I thought would take it seriously.`,
    () => `They went very quiet, and then they asked me who else knew.`,
    () => `We agreed to say nothing until we were certain.`,
    () => `Being certain took another three weeks.`,
    () => `In that time, two more things happened that should not have.`,
    () => `I started keeping my own record, because I no longer trusted theirs.`,
    () => `Someone noticed I was keeping it.`,
    () => `After that, the conversations stopped happening in front of me.`,
    () => `I understood then that I was going to have to decide alone.`,
    () => `I went looking for the original paperwork and could not find it.`,
    () => `The version I was shown had been edited, and not carefully.`,
    () => `Someone had been covering for this for a lot longer than I thought.`,
    () => `I checked the dates against my own calendar, twice.`,
    () => `The explanation I got made less sense than the silence had.`,
    () => `They offered me a way out that would have made me complicit.`,
    () => `I said I would think about it. I had already decided.`,
    () => `That week I barely slept, and I read everything twice more.`,
    () => `A colleague told me, carefully, to let it go.`,
    () => `That was the moment I knew I could not.`,
  ],
  turn: [
    () => `So I said it out loud, in a room where I could not take it back.`,
    () => `And then the one person I had not suspected told me the rest.`,
    () => `That was the moment it stopped being a misunderstanding.`,
  ],
  consequence: [
    () => `The fallout was immediate, and it did not land where I expected.`,
    () => `Some people took my side. Fewer than I had counted on.`,
    () => `Two of them have not spoken to me since.`,
    () => `It cost me things I had not thought were on the table.`,
  ],
  resolution: [
    () => `It took most of a year to settle into whatever this is now.`,
    () => `In the end, the thing I was most afraid of was not what happened.`,
    () => `We fixed it. Quietly, and much later than we should have.`,
  ],
  close: [
    () => `I would do it again. I would just do it sooner.`,
    () => `That is the part I keep coming back to.`,
    () => `Make of that what you will.`,
  ],
};

export const REGISTERS = { documentary: DOCUMENTARY, story: STORY } as const;
export type Register = keyof typeof REGISTERS;

/**
 * Distributes `beatCount` beats across the arc.
 * The fixed sections take one beat each; everything left over goes to
 * development, which is the only section that should grow with length.
 */
export function arcShape(beatCount: number): Beatfunction[] {
  const target = Math.max(4, beatCount);
  const shape: Beatfunction[] = ['hook'];

  // Sections in the order they are added back as the piece gets longer.
  const optional: Beatfunction[] = ['premise', 'context', 'turn', 'consequence', 'resolution', 'close'];
  const included: Beatfunction[] = [];
  for (const section of optional) {
    if (shape.length + included.length + 1 < target) included.push(section);
  }

  const developmentCount = Math.max(1, target - 1 - included.length);
  const before: Beatfunction[] = [];
  const after: Beatfunction[] = [];
  for (const section of included) {
    if (section === 'premise' || section === 'context') before.push(section);
    else after.push(section);
  }

  return [
    ...shape,
    ...before,
    ...Array<Beatfunction>(developmentCount).fill('development'),
    ...after,
  ];
}

/**
 * Builds an arc of the requested length.
 * Frames are consumed without repetition per section; if a section runs dry
 * its frames are reused in a different order rather than repeating verbatim.
 */
export function buildArc(
  topic: string, beatCount: number, register: Register, seed: number,
): ArcBeat[] {
  const frames = REGISTERS[register];
  const phrase = subjectPhrase(topic) || 'this';
  const rand = seededRandom(seed);

  const pools: Partial<Record<Beatfunction, ((phrase: string) => string)[]>> = {};
  const shape = arcShape(beatCount);

  return shape.map((fn, index) => {
    if (!pools[fn] || pools[fn]!.length === 0) {
      // Shuffle a fresh copy so repeat passes differ from the first.
      pools[fn] = shuffle(frames[fn].slice(), rand);
    }
    const frame = pools[fn]!.shift()!;
    return {
      text: frame(phrase),
      function: fn,
      position: shape.length > 1 ? index / (shape.length - 1) : 0,
    };
  });
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** A title derived from the topic, in the register's voice. */
export function arcTitle(topic: string, register: Register): string {
  const phrase = topicPhrase(topic);
  return register === 'documentary'
    ? titleCase(`The ${phrase.split(/\s+/).slice(0, 6).join(' ')} Story`)
    : titleCase(phrase.split(/\s+/).slice(0, 8).join(' '));
}
