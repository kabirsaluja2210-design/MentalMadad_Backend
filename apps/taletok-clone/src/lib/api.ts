import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { UnauthorizedError } from './auth';
import { InsufficientCreditsError } from './credits';

/**
 * Shared API plumbing: consistent JSON error shapes and one place where
 * domain errors are mapped onto status codes.
 */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) return fail('Not signed in', 401);

  if (error instanceof InsufficientCreditsError) {
    return fail(error.message, 402, { needed: error.needed, available: error.available });
  }

  if (error instanceof ZodError) {
    return fail('Invalid request', 422, {
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const message = error instanceof Error ? error.message : 'Unexpected error';

  // Prisma's "record not found" for update/delete on a missing row.
  if (message.includes('Record to update not found') || message.includes('No record was found')) {
    return fail('Not found', 404);
  }

  console.error('[api]', error);
  return fail(message, 500);
}

/**
 * Parses and validates a JSON body, throwing ZodError on mismatch.
 * Typed on the schema's *output* so `.default()` fields come back required.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ZodError([
      { code: 'custom', path: [], message: 'Body must be valid JSON' },
    ]);
  }
  return schema.parse(raw);
}
