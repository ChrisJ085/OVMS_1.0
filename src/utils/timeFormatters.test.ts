import { describe, it, expect } from 'vitest';
import { formatRelativeTime, formatRecLastGenerated, toEpochMillis } from './timeFormatters';
import { Timestamp } from 'firebase/firestore';

describe('timeFormatters', () => {
  const baseNow = 1700000000000; // Fixed timestamp in ms

  describe('toEpochMillis', () => {
    it('handles null and undefined', () => {
      expect(toEpochMillis(null)).toBeNull();
      expect(toEpochMillis(undefined)).toBeNull();
    });

    it('handles number epoch milliseconds', () => {
      expect(toEpochMillis(1700000000000)).toBe(1700000000000);
    });

    it('handles Date instances', () => {
      const d = new Date(1700000000000);
      expect(toEpochMillis(d)).toBe(1700000000000);
    });

    it('handles Firestore Timestamp like objects', () => {
      const ts = {
        toMillis: () => 1700000000000,
        toDate: () => new Date(1700000000000)
      } as unknown as Timestamp;
      expect(toEpochMillis(ts)).toBe(1700000000000);
    });
  });

  describe('formatRelativeTime', () => {
    it('returns "just now" for differences under 45 seconds', () => {
      expect(formatRelativeTime(baseNow - 10000, baseNow)).toBe('just now');
      expect(formatRelativeTime(baseNow - 30000, baseNow)).toBe('just now');
    });

    it('returns "1 min ago" for 1-2 minutes', () => {
      expect(formatRelativeTime(baseNow - 60000, baseNow)).toBe('1 min ago');
      expect(formatRelativeTime(baseNow - 110000, baseNow)).toBe('1 min ago');
    });

    it('returns minutes format for under 1 hour', () => {
      expect(formatRelativeTime(baseNow - 5 * 60 * 1000, baseNow)).toBe('5 mins ago');
      expect(formatRelativeTime(baseNow - 28 * 60 * 1000, baseNow)).toBe('28 mins ago');
    });

    it('returns "1 hr ago" for 1-2 hours', () => {
      expect(formatRelativeTime(baseNow - 60 * 60 * 1000, baseNow)).toBe('1 hr ago');
      expect(formatRelativeTime(baseNow - 110 * 60 * 1000, baseNow)).toBe('1 hr ago');
    });

    it('returns hours format for 2-23 hours', () => {
      expect(formatRelativeTime(baseNow - 2 * 60 * 60 * 1000, baseNow)).toBe('2 hrs ago');
      expect(formatRelativeTime(baseNow - 5 * 60 * 60 * 1000, baseNow)).toBe('5 hrs ago');
    });

    it('returns days format', () => {
      expect(formatRelativeTime(baseNow - 24 * 60 * 60 * 1000, baseNow)).toBe('1 day ago');
      expect(formatRelativeTime(baseNow - 3 * 24 * 60 * 60 * 1000, baseNow)).toBe('3 days ago');
    });
  });

  describe('formatRecLastGenerated', () => {
    it('returns "Not yet generated" when no timestamp is provided', () => {
      expect(formatRecLastGenerated(null)).toBe('Not yet generated');
      expect(formatRecLastGenerated(undefined)).toBe('Not yet generated');
    });

    it('formats string with user attribution', () => {
      const twoHoursAgo = baseNow - 2 * 60 * 60 * 1000;
      expect(formatRecLastGenerated(twoHoursAgo, 'Amelia Hart', baseNow)).toBe('Rec generated 2 hrs ago by Amelia Hart');
    });

    it('formats string with 5 mins ago', () => {
      const fiveMinsAgo = baseNow - 5 * 60 * 1000;
      expect(formatRecLastGenerated(fiveMinsAgo, 'Amelia Hart', baseNow)).toBe('Rec generated 5 mins ago by Amelia Hart');
    });

    it('formats string without user attribution if name is omitted', () => {
      const twoHoursAgo = baseNow - 2 * 60 * 60 * 1000;
      expect(formatRecLastGenerated(twoHoursAgo, null, baseNow)).toBe('Rec generated 2 hrs ago');
      expect(formatRecLastGenerated(twoHoursAgo, '', baseNow)).toBe('Rec generated 2 hrs ago');
    });
  });
});
