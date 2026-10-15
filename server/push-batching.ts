/**
 * Push-notification batching limits.
 *
 * Expo's push endpoint accepts at most 100 messages per request, so a send must be split into
 * pages. The device-token table is unbounded in principle, so the read is paginated too. These
 * values live here — pure and dependency-free — so they are shared rather than repeated as magic
 * numbers, and so the paging arithmetic is unit-testable without a database.
 */

/** Expo rejects a request carrying more than this many messages. */
export const EXPO_PUSH_BATCH_SIZE = 100;

/** Safety bound on how many pages a single notification will page through. */
export const MAX_PUSH_PAGES = 1_000;

/** Upper bound on how many tokens one page may read. */
export const PUSH_TOKEN_PAGE_LIMIT_MAX = 1_000;

/** Default page size for a token read. */
export const PUSH_TOKEN_PAGE_LIMIT_DEFAULT = 500;

/** Clamp a limit: a missing or unparseable value falls back; an out-of-range one is bounded. */
function clampLimit(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return PUSH_TOKEN_PAGE_LIMIT_DEFAULT;
  if (value === Number.POSITIVE_INFINITY) return PUSH_TOKEN_PAGE_LIMIT_MAX;
  if (value === Number.NEGATIVE_INFINITY) return 1;
  return Math.min(PUSH_TOKEN_PAGE_LIMIT_MAX, Math.max(1, Math.floor(value)));
}

/** Clamp an offset: never negative, never non-finite (both fall back to the first page). */
function clampOffset(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/** Clamp caller-supplied paging into a safe range (never zero, never negative, never unbounded). */
export function normalizePushTokenPage(options: { limit?: number; offset?: number } = {}): { limit: number; offset: number } {
  return { limit: clampLimit(options.limit), offset: clampOffset(options.offset) };
}

/** The offset for a given page index (0-based). */
export function pageOffset(page: number, pageSize = EXPO_PUSH_BATCH_SIZE): number {
  const safePage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  return safePage * pageSize;
}
