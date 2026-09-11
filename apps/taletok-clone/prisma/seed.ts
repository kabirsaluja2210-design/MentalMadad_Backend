import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { STUB_VOICES } from '../src/providers/tts/stub';
import { nextRunFor } from '../src/worker/scheduler';

const db = new PrismaClient();

/**
 * Seeds a demo workspace so a fresh clone is usable immediately:
 * one signed-in-able account, the voice roster, a couple of connected
 * channels, a running series, and a discovery feed.
 */

const DEMO_EMAIL = 'demo@reelforge.local';
const DEMO_PASSWORD = 'demo1234';

const IDEAS = [
  { title: 'The maintenance job nobody wanted turned out to be the only one that mattered', subreddit: 'r/tales', score: 48210, comments: 3120, mode: 'reddit-story' },
  { title: 'What happens if every clock on earth stops at once', subreddit: 'trending', score: 31980, comments: 1840, mode: 'cinematic-short' },
  { title: 'Cities at night, 1890 to today', subreddit: 'trending', score: 27440, comments: 910, mode: 'timelapse' },
  { title: 'Seven everyday objects that were invented by accident', subreddit: 'r/facts', score: 22300, comments: 1520, mode: 'listicle' },
  { title: 'Can you name five countries from their outlines alone?', subreddit: 'r/geography', score: 19870, comments: 4410, mode: 'quiz' },
  { title: 'She texted the wrong number for three months before anyone noticed', subreddit: 'r/tales', score: 41200, comments: 2760, mode: 'text-message-story' },
  { title: 'Why the boring version of the plan usually wins', subreddit: 'trending', score: 15600, comments: 880, mode: 'motivational' },
  { title: 'The full story of the bridge that took ninety years to finish', subreddit: 'r/history', score: 18990, comments: 1230, mode: 'long-form-story' },
  { title: 'How sourdough actually works, in ninety seconds', subreddit: 'r/food', score: 12400, comments: 640, mode: 'ai-short' },
];

async function main() {
  console.log('Seeding…');

  // ------------------------------------------------------------- voices
  for (const voice of STUB_VOICES) {
    await db.voice.upsert({
      where: { id: voice.externalId },
      update: {},
      create: {
        id: voice.externalId,
        name: voice.name,
        provider: 'stub',
        externalId: voice.externalId,
        gender: voice.gender,
        accent: voice.accent,
        style: voice.style,
        premium: voice.premium,
      },
    });
  }
  console.log(`  ${STUB_VOICES.length} voices`);

  // --------------------------------------------------------------- user
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log('  demo user already exists — skipping workspace seed');
  } else {
    const user = await db.user.create({
      data: {
        email: DEMO_EMAIL,
        passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10),
        name: 'Demo Creator',
        role: 'ADMIN',
      },
    });

    const workspace = await db.workspace.create({
      data: { name: 'Demo Studio', slug: 'demo-studio', plan: 'STUDIO', credits: 1500 },
    });

    await db.membership.create({
      data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' },
    });

    await db.brandKit.create({
      data: {
        workspaceId: workspace.id,
        watermarkText: '@demostudio',
        watermarkPos: 'bottom-right',
        captionStyle: 'karaoke',
        primaryColor: '#6d5cf6',
      },
    });

    const accounts = await Promise.all(
      [
        { platform: 'tiktok', handle: '@demostudio', displayName: 'Demo Studio' },
        { platform: 'youtube', handle: '@demostudio', displayName: 'Demo Studio Shorts' },
        { platform: 'instagram', handle: '@demo.studio', displayName: 'Demo Studio' },
      ].map((a) => db.socialAccount.create({ data: { ...a, workspaceId: workspace.id } })),
    );
    console.log(`  workspace + ${accounts.length} channels`);

    await db.series.create({
      data: {
        workspaceId: workspace.id,
        name: 'Daily Story Drop',
        mode: 'reddit-story',
        topic: 'workplace stories with an unexpected turn',
        voiceId: 'nova-f-us',
        cadence: 'daily',
        postTime: '17:00',
        autoPublish: false,
        targetsJson: JSON.stringify([accounts[0].id]),
        nextRunAt: nextRunFor('daily', '17:00'),
      },
    });

    await db.creditEntry.create({
      data: { workspaceId: workspace.id, delta: 1500, reason: 'Studio plan — initial grant', balanceAfter: 1500 },
    });
    console.log('  1 series');
  }

  // -------------------------------------------------------------- ideas
  for (const idea of IDEAS) {
    await db.storyIdea.upsert({
      where: { externalId: `seed-${idea.title.slice(0, 40)}` },
      update: {},
      create: {
        externalId: `seed-${idea.title.slice(0, 40)}`,
        source: idea.subreddit.startsWith('r/') ? 'reddit' : 'trending',
        sourceRef: idea.subreddit,
        title: idea.title,
        body: '',
        author: 'community',
        score: idea.score,
        comments: idea.comments,
        viralScore: Math.min(99, Math.round(idea.score / 500)),
        suggestedMode: idea.mode,
      },
    });
  }
  console.log(`  ${IDEAS.length} story ideas`);

  console.log(`\nDone. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
