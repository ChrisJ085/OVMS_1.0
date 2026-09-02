import { describe, it, expect } from 'vitest';
import { calculateFreshnessStatus, formatFreshnessTimestamp } from './dataFreshnessService';

describe('dataFreshnessService', () => {
  describe('calculateFreshnessStatus', () => {
    const thresholds = {
      freshMinutes: 60,
      agingMinutes: 240,
      staleMinutes: 720
    };

    it('returns MISSING if age is null', () => {
      const res = calculateFreshnessStatus(null, thresholds);
      expect(res.status).toBe('MISSING');
      expect(res.statusLabel).toBe('No Data');
    });

    it('returns FRESH when age <= freshMinutes', () => {
      const res = calculateFreshnessStatus(30, thresholds);
      expect(res.status).toBe('FRESH');
      expect(res.statusLabel).toBe('Fresh');
    });

    it('returns AGING when age is between freshMinutes and agingMinutes', () => {
      const res = calculateFreshnessStatus(120, thresholds);
      expect(res.status).toBe('AGING');
      expect(res.statusLabel).toBe('Aging');
    });

    it('returns STALE when age exceeds agingMinutes', () => {
      const res = calculateFreshnessStatus(300, thresholds);
      expect(res.status).toBe('STALE');
      expect(res.statusLabel).toBe('Stale');
    });
  });

  describe('formatFreshnessTimestamp', () => {
    it('returns fallback text for null', () => {
      expect(formatFreshnessTimestamp(null)).toBe('No data recorded');
    });

    it('formats valid epoch timestamp into readable string', () => {
      const d = new Date(2026, 8, 2, 9, 15);
      const str = formatFreshnessTimestamp(d.getTime());
      expect(str).toContain('2026');
      expect(str).toContain('09:15');
    });
  });
});
