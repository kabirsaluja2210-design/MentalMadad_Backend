import type { ScriptBeat, ScriptRequest } from '../types';
import { getMode } from '@/pipeline/modes';
import {
  chunkIntoBeats, countWords, splitSentences, titleCase, topicPhrase, trimTo, wordsForDuration,
} from './text';
import { seededRandom, hashString } from '@/lib/media-encode';
import { arcTitle, buildArc, type Register } from './narrative';
import { estimateTiming } from '@/providers/tts/timing';

/**
 * Offline beat planners — one per video mode.
 *
 * These are deterministic template engines, not a language model: given the
 * same topic and seed they always produce the same script. That makes renders
 * reproducible and the test suite meaningful. When an LLM provider is
 * configured the registry routes around this file entirely.
 */

export interface PlannerContext {
  req: ScriptRequest;
  options: Record<string, string | number | boolean>;
  rand: () => number;
  /** Word budget for the whole narration at the requested duration. */
  wordBudget: number;
}

type Planner = (ctx: PlannerContext) => { beats: ScriptBeat[]; hook: string; cta: string; title: string };

// ---------------------------------------------------------------- helpers

function visualFor(topic: string, beatText: string, style: string, index: number): string {
  const subject = trimTo(beatText.replace(/["'“”]/g, ''), 12);
  const styleHint: Record<string, string> = {
    'background-loop': 'looping abstract motion background, soft focus, muted colours',
    'cinematic-3d': 'cinematic wide shot, dramatic rim lighting, shallow depth of field, volumetric haze',
    illustrated: 'clean editorial illustration, bold shapes, high contrast',
    'timelapse-frames': 'wide establishing shot, consistent framing across eras',
    'graphic-card': 'bold graphic card, flat colour, large centred type',
    'chat-thread': 'phone screen mockup, messaging interface',
    typography: 'full-bleed typography over textured gradient',
  };
  return `${subject} — ${styleHint[style] ?? 'high quality still'} (scene ${index + 1}, ${topic})`;
}

function beatsFromText(
  text: string, wordsPerBeat: number, topic: string, style: string,
): ScriptBeat[] {
  const chunks = chunkIntoBeats(splitSentences(text), wordsPerBeat);
  return chunks.map((chunk, i) => ({
    text: chunk,
    visualPrompt: visualFor(topic, chunk, style, i),
  }));
}

/** Pads or trims a beat list so total narration lands near the word budget. */
function fitToBudget(beats: ScriptBeat[], budget: number): ScriptBeat[] {
  let total = beats.reduce((sum, b) => sum + countWords(b.text), 0);
  const out = [...beats];
  while (out.length > 1 && total - countWords(out[out.length - 1].text) > budget) {
    total -= countWords(out[out.length - 1].text);
    out.pop();
  }
  return out;
}

// ---------------------------------------------------------------- planners

const redditStory: Planner = ({ req, options, wordBudget }) => {
  const mode = getMode('reddit-story');
  const wordsPerBeat = Math.round((mode.secondsPerBeat / 60) * 155);
  const community = String(options.subreddit || 'r/stories');

  // With real source material we narrate it directly; otherwise we build a
  // story frame around the topic.
  const body = req.sourceText?.trim()
    ? req.sourceText.trim()
    : buildStoryBody(req.topic, wordBudget);

  const hook = `${community} — ${trimTo(req.topic, 14)}`;
  const beats = fitToBudget(beatsFromText(body, wordsPerBeat, req.topic, mode.visualStyle), wordBudget);

  const cta = options.cliffhanger
    ? 'Part two is on the profile.'
    : 'Follow for more stories like this.';

  return { beats, hook, cta, title: titleCase(trimTo(req.topic, 10)) };
};

function buildStoryBody(topic: string, budget: number): string {
  const phrase = topicPhrase(topic);
  const frames = [
    `This happened last spring, and I still think about it.`,
    `For context: ${phrase}.`,
    `At first it seemed like nothing worth mentioning.`,
    `Then the details stopped adding up.`,
    `I asked around, and everyone gave me a different answer.`,
    `That was the moment I realised how far it had gone.`,
    `I spent the next week trying to work out what to do.`,
    `When I finally said something out loud, the room went quiet.`,
    `Nobody had expected me to bring it up.`,
    `The explanation I got made less sense than the silence had.`,
    `I decided I was done waiting for it to resolve itself.`,
    `So I did the one thing nobody thought I would.`,
    `The fallout was immediate.`,
    `Some people took my side. Most did not.`,
    `Looking back, I would do exactly the same thing again.`,
  ];
  const out: string[] = [];
  let words = 0;
  for (const line of frames) {
    if (words >= budget) break;
    out.push(line);
    words += countWords(line);
  }
  return out.join(' ');
}

/**
 * Builds an arc-driven planner.
 *
 * The beat count is fitted to the *measured* narration length rather than
 * assumed from a words-per-minute constant: the speech timing model and the
 * planner disagreed by about 15%, which compounded with length and left a
 * 120-second request at 82% of its target. Measuring and correcting keeps
 * every duration within a few percent.
 */
function arcPlanner(modeId: string, defaultRegister: Register): Planner {
  return ({ req, options }) => {
    const mode = getMode(modeId);
    const register = (options.register as Register) || defaultRegister;
    const pace =
      options.narrationPace === 'slow' ? 0.92 : options.narrationPace === 'fast' ? 1.15 : 1;
    const targetMs = req.targetDurationSec * 1000;
    const seed = hashString(`${modeId}:${req.topic}`);

    let beatCount = Math.max(4, Math.round(req.targetDurationSec / mode.secondsPerBeat));
    let arc = buildArc(req.topic, beatCount, register, seed);

    // Converge on the requested length; a handful of passes is plenty.
    for (let attempt = 0; attempt < 6; attempt++) {
      const spokenMs = estimateTiming(arc.map((b) => b.text).join(' '), pace).durationMs;
      if (Math.abs(spokenMs - targetMs) / targetMs < 0.04) break;

      const scaled = Math.round(beatCount * (targetMs / Math.max(1, spokenMs)));
      // Move at least one beat, or a stable-but-wrong count would never budge.
      const next = scaled === beatCount ? beatCount + (spokenMs < targetMs ? 1 : -1) : scaled;
      const clamped = Math.max(4, Math.min(120, next));
      if (clamped === beatCount) break;

      beatCount = clamped;
      arc = buildArc(req.topic, beatCount, register, seed);
    }

    const phrase = topicPhrase(req.topic);
    // An explicit subject forces the 3D set; the scene picker matches on the
    // visual prompt, so naming it there is all the wiring it needs.
    const subject = options.subject && options.subject !== 'auto' ? `${options.subject} ` : '';

    const beats: ScriptBeat[] = arc.map((beat, i) => ({
      text: beat.text,
      shot: beat.function,
      // The visual prompt carries the topic plus the beat's narrative role, so
      // the 3D scene picker has something concrete to match on.
      visualPrompt: `${subject}${phrase} — ${beat.function} beat: ${trimTo(beat.text, 12)}`,
      motion: mode.motions[i % mode.motions.length],
    }));

    return {
      // The hook stays in the beat list: it is metadata *and* the opening line
      // of narration. Slicing it out left the video silently missing the most
      // important sentence in it, and running a beat short of its target.
      beats,
      hook: beats[0].text,
      cta: register === 'documentary' ? 'Follow for the next one.' : 'Part two soon.',
      title: arcTitle(req.topic, register),
    };
  };
}

const shortDocumentary = arcPlanner('short-documentary', 'documentary');
const mechanismExplainer = arcPlanner('mechanism-explainer', 'mechanism');
const cinematicShort = arcPlanner('cinematic-short', 'documentary');

const aiShort: Planner = ({ req, options, wordBudget }) => {
  const mode = getMode('ai-short');
  const phrase = topicPhrase(req.topic);
  const wordsPerBeat = Math.round((mode.secondsPerBeat / 60) * 155);

  if (options.useOwnScript && req.sourceText?.trim()) {
    const beats = fitToBudget(
      beatsFromText(req.sourceText.trim(), wordsPerBeat, req.topic, mode.visualStyle),
      wordBudget,
    );
    return {
      beats,
      hook: trimTo(splitSentences(req.sourceText)[0] ?? req.topic, 14),
      cta: '',
      title: titleCase(trimTo(req.topic, 10)),
    };
  }

  const hooks: Record<string, string> = {
    question: `Why does ${phrase} work the way it does?`,
    'bold-claim': `Almost everything you have heard about ${phrase} is backwards.`,
    stat: `Nine out of ten people get ${phrase} wrong on the first try.`,
    story: `The first time I dealt with ${phrase}, I got it completely wrong.`,
  };
  const hook = hooks[String(options.hookStyle)] ?? hooks.question;

  const body = [
    `Here is the part that actually matters.`,
    `${titleCase(phrase)} is usually explained as a single step, but it is really three.`,
    `The first step sets the constraint everything else has to live inside.`,
    `The second step is where almost every mistake gets made.`,
    `The third step is the only one most people ever see.`,
    `Once you can name which step you are in, the rest stops being confusing.`,
    `Try it on the next example you run into.`,
  ];

  const beats = fitToBudget(
    beatsFromText(body.join(' '), wordsPerBeat, req.topic, mode.visualStyle),
    wordBudget,
  );

  return { beats, hook, cta: 'Follow for more.', title: titleCase(trimTo(req.topic, 10)) };
};

const timelapse: Planner = ({ req, options }) => {
  const mode = getMode('timelapse');
  const steps = Math.max(3, Math.min(20, Number(options.steps) || 10));
  const start = String(options.startLabel || '1900');
  const end = String(options.endLabel || '2025');
  const phrase = topicPhrase(req.topic);

  // Interpolate numeric era labels when both ends parse as numbers.
  const startNum = Number(start.replace(/\D/g, ''));
  const endNum = Number(end.replace(/\D/g, ''));
  const numeric = Number.isFinite(startNum) && Number.isFinite(endNum) && endNum !== startNum;

  const beats: ScriptBeat[] = [];
  for (let i = 0; i < steps; i++) {
    const label = numeric
      ? String(Math.round(startNum + ((endNum - startNum) * i) / (steps - 1)))
      : `Step ${i + 1}`;
    const text =
      i === 0
        ? `${label}. This is where ${phrase} begins.`
        : i === steps - 1
          ? `${label}. And this is where it stands today.`
          : `${label}. The shape of it changes again.`;
    beats.push({
      text,
      visualPrompt: `${phrase} in ${label} — ${visualFor(req.topic, text, mode.visualStyle, i)}`,
      motion: 'kenburns-in',
    });
  }

  return {
    beats,
    hook: `${titleCase(phrase)}, from ${start} to ${end}.`,
    cta: 'Follow for more timelapses.',
    title: titleCase(`${trimTo(phrase, 6)} ${start}-${end}`),
  };
};

const longFormStory: Planner = ({ req, options, wordBudget }) => {
  const mode = getMode('long-form-story');
  const chapterCount = Math.max(2, Math.min(12, Number(options.chapters) || 5));
  const wordsPerBeat = Math.round((mode.secondsPerBeat / 60) * 155);
  const phrase = topicPhrase(req.topic);

  const source = req.sourceText?.trim() || buildStoryBody(req.topic, wordBudget);
  const sentences = splitSentences(source);
  const perChapter = Math.max(1, Math.ceil(sentences.length / chapterCount));

  const beats: ScriptBeat[] = [];
  for (let c = 0; c < chapterCount; c++) {
    const slice = sentences.slice(c * perChapter, (c + 1) * perChapter);
    if (!slice.length) break;
    if (options.showChapterCards) {
      beats.push({
        text: `Chapter ${c + 1}.`,
        visualPrompt: `Chapter ${c + 1} title card for ${phrase}`,
        motion: 'static',
      });
    }
    for (const chunk of chunkIntoBeats(slice, wordsPerBeat)) {
      beats.push({
        text: chunk,
        visualPrompt: visualFor(req.topic, chunk, mode.visualStyle, beats.length),
      });
    }
  }

  return {
    beats,
    hook: `The full story of ${phrase}.`,
    cta: 'Subscribe for the next full story.',
    title: titleCase(`The Story of ${trimTo(phrase, 8)}`),
  };
};

const quiz: Planner = ({ req, options, rand }) => {
  const count = Math.max(1, Math.min(15, Number(options.questionCount) || 5));
  const phrase = topicPhrase(req.topic);
  const difficulty = String(options.difficulty || 'mixed');

  const beats: ScriptBeat[] = [];
  for (let i = 0; i < count; i++) {
    const n = i + 1;
    beats.push({
      text: `Question ${n}. ${titleCase(phrase)} — can you get this one?`,
      visualPrompt: `Quiz question card ${n} about ${phrase}, bold centred type, flat colour`,
      motion: 'static',
    });
    beats.push({
      text: `Answer ${n}. Here it is.`,
      visualPrompt: `Answer reveal card ${n} for ${phrase}, contrasting colour, large type`,
      motion: 'zoom-pulse',
    });
  }

  return {
    beats,
    hook: `Only ${Math.round(4 + rand() * 12)}% get all ${count} of these ${difficulty === 'hard' ? 'hard ' : ''}questions right.`,
    cta: 'Comment your score.',
    title: titleCase(`${phrase} quiz`),
  };
};

const listicle: Planner = ({ req, options }) => {
  const mode = getMode('listicle');
  const count = Math.max(3, Math.min(20, Number(options.itemCount) || 7));
  const down = String(options.countDirection || 'down') === 'down';
  const phrase = topicPhrase(req.topic);

  const beats: ScriptBeat[] = [];
  for (let i = 0; i < count; i++) {
    const n = down ? count - i : i + 1;
    const last = i === count - 1;
    beats.push({
      text: last
        ? `Number ${n}. And this is the one nobody expects.`
        : `Number ${n}. This one changes how you think about ${phrase}.`,
      visualPrompt: `Item ${n} of a ranked list about ${phrase} — ${visualFor(req.topic, phrase, mode.visualStyle, i)}`,
      motion: mode.motions[i % mode.motions.length],
    });
  }

  return {
    beats,
    hook: `${count} things about ${phrase} that are worth knowing.`,
    cta: 'Which one surprised you?',
    title: titleCase(`${count} ${trimTo(phrase, 8)}`),
  };
};

const textMessageStory: Planner = ({ req, options, wordBudget }) => {
  const left = String(options.leftName || 'Sam');
  const right = String(options.rightName || 'Alex');
  const phrase = topicPhrase(req.topic);

  const exchange = [
    [right, `hey — are you free to talk?`],
    [left, `yeah what's up`],
    [right, `it's about ${phrase}`],
    [left, `okay you're scaring me`],
    [right, `i wasn't going to say anything`],
    [right, `but you'd find out anyway`],
    [left, `just tell me`],
    [right, `i've been covering for it for three weeks`],
    [left, `three weeks??`],
    [right, `i didn't know how to bring it up`],
    [left, `who else knows`],
    [right, `everyone except you`],
    [left, `...`],
    [right, `i'm sorry`],
  ];

  const beats: ScriptBeat[] = [];
  let words = 0;
  for (let i = 0; i < exchange.length && words < wordBudget; i++) {
    const [speaker, line] = exchange[i];
    beats.push({
      text: line,
      visualPrompt: `chat bubble from ${speaker}, ${options.theme === 'light' ? 'light' : 'dark'} messaging theme, ${speaker === right ? 'right' : 'left'} aligned`,
      motion: 'static',
    });
    words += countWords(line);
  }

  return {
    beats,
    hook: `${right} should not have sent this.`,
    cta: 'Part two?',
    title: titleCase(`${right} & ${left}: ${trimTo(phrase, 6)}`),
  };
};

const motivational: Planner = ({ req, options, wordBudget }) => {
  const mode = getMode('motivational');
  const phrase = topicPhrase(req.topic);

  const lines = [
    `Nobody is coming to do this for you.`,
    `${titleCase(phrase)} is not a talent. It is a schedule.`,
    `The version of you that you keep describing does the boring part first.`,
    `You do not need more motivation. You need a smaller first step.`,
    `Start it badly. Start it today.`,
    `In six months the only thing that will matter is that you began.`,
  ];

  const beats: ScriptBeat[] = [];
  let words = 0;
  for (let i = 0; i < lines.length && words < wordBudget; i++) {
    beats.push({
      text: lines[i],
      visualPrompt: visualFor(req.topic, lines[i], mode.visualStyle, i),
      motion: mode.motions[i % mode.motions.length],
    });
    words += countWords(lines[i]);
  }

  const signOff = String(options.signOff || '').trim();
  if (signOff) {
    beats.push({ text: signOff, visualPrompt: `closing card: ${signOff}`, motion: 'zoom-pulse' });
  }

  return {
    beats,
    hook: `Nobody is coming to do this for you.`,
    cta: signOff || 'Save this.',
    title: titleCase(trimTo(phrase, 8)),
  };
};

const PLANNERS: Record<string, Planner> = {
  'reddit-story': redditStory,
  'cinematic-short': cinematicShort,
  'short-documentary': shortDocumentary,
  'mechanism-explainer': mechanismExplainer,
  'ai-short': aiShort,
  timelapse,
  'long-form-story': longFormStory,
  quiz,
  listicle,
  'text-message-story': textMessageStory,
  motivational,
};

export function planBeats(req: ScriptRequest, options: Record<string, string | number | boolean>) {
  const planner = PLANNERS[req.mode] ?? aiShort;
  const pace =
    options.narrationPace === 'slow' ? 'slow' : options.narrationPace === 'fast' ? 'fast' : 'normal';

  return planner({
    req,
    options,
    rand: seededRandom(hashString(`${req.mode}:${req.topic}`)),
    wordBudget: wordsForDuration(req.targetDurationSec, pace),
  });
}
