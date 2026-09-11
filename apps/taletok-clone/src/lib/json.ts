/**
 * JSON payloads are stored as TEXT so the schema stays portable between
 * SQLite (dev) and Postgres (prod). These helpers keep the parsing in one
 * place and never throw on malformed rows.
 */

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return (value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
