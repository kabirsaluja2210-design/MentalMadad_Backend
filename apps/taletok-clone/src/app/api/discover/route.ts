import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getLlm } from '@/providers/registry';
import { handleError, ok, parseBody } from '@/lib/api';

/**
 * Story discovery.
 *
 * Serves the stored idea feed, and generates fresh ideas on demand through
 * the active LLM provider.
 */

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');
    const source = url.searchParams.get('source');

    const ideas = await db.storyIdea.findMany({
      where: { ...(mode ? { suggestedMode: mode } : {}), ...(source ? { source } : {}) },
      orderBy: [{ viralScore: 'desc' }, { capturedAt: 'desc' }],
      take: 60,
    });
    return ok({ ideas });
  } catch (error) {
    return handleError(error);
  }
}

const refreshSchema = z.object({
  topic: z.string().min(2).max(200),
  count: z.number().int().min(1).max(20).default(8),
});

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = await parseBody(request, refreshSchema);
    const suggestions = await getLlm().suggestIdeas(body.topic, body.count);

    const created = [];
    for (const suggestion of suggestions) {
      const externalId = `gen-${body.topic}-${suggestion.title}`.slice(0, 90);
      created.push(
        await db.storyIdea.upsert({
          where: { externalId },
          update: { viralScore: suggestion.viralScore },
          create: {
            externalId,
            source: 'manual',
            sourceRef: body.topic,
            title: suggestion.title,
            body: suggestion.body,
            suggestedMode: suggestion.suggestedMode,
            viralScore: suggestion.viralScore,
          },
        }),
      );
    }
    return ok({ ideas: created }, 201);
  } catch (error) {
    return handleError(error);
  }
}
