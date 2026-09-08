export interface TimestampLike {
  toMillis?: () => number;
  toDate?: () => Date;
  seconds?: number;
}

/**
 * Normalizes any timestamp/date/epoch value to milliseconds since UNIX epoch.
 */
export function toEpochMillis(val: Date | TimestampLike | number | string | null | undefined): number | null {
  if (!val) return null;
  if (typeof val === 'number') {
    return val < 1e11 ? val * 1000 : val;
  }
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? null : parsed;
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.getTime();
  }
  if (typeof (val as any).toMillis === 'function') {
    return (val as any).toMillis();
  }
  if (typeof (val as any).toDate === 'function') {
    return (val as any).toDate().getTime();
  }
  if (typeof (val as any).seconds === 'number') {
    return (val as any).seconds * 1000;
  }
  return null;
}

/**
 * Returns human-friendly relative time string (e.g. "just now", "5 mins ago", "2 hrs ago", "3 days ago").
 */
export function formatRelativeTime(
  dateOrTimestamp: Date | TimestampLike | number | string | null | undefined,
  nowMs: number = Date.now()
): string {
  const targetMs = toEpochMillis(dateOrTimestamp);
  if (!targetMs) return 'Unknown';

  const diffMs = Math.max(0, nowMs - targetMs);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) {
    return 'just now';
  }
  if (diffMin < 2) {
    return '1 min ago';
  }
  if (diffMin < 60) {
    return `${diffMin} mins ago`;
  }
  if (diffHours < 2) {
    return '1 hr ago';
  }
  if (diffHours < 24) {
    return `${diffHours} hrs ago`;
  }
  if (diffDays === 1) {
    return '1 day ago';
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  const weeks = Math.floor(diffDays / 7);
  if (weeks === 1) {
    return '1 wk ago';
  }
  return `${weeks} wks ago`;
}

/**
 * Formats standard recommendation generation status text:
 */
export function formatRecLastGenerated(
  completedAt: Date | TimestampLike | number | string | null | undefined,
  completedByName?: string | null,
  nowMs: number = Date.now()
): string {
  if (!completedAt) {
    return 'Not yet generated';
  }

  const relative = formatRelativeTime(completedAt, nowMs);
  const name = completedByName?.trim();

  if (name) {
    return `Rec generated ${relative} by ${name}`;
  }
  return `Rec generated ${relative}`;
}
