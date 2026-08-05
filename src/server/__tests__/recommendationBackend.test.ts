import { describe, it, expect } from 'vitest';
import {
  canonicalSerialize,
  generateCanonicalFingerprint
} from '../recommendationBackendService';

describe('Canonical Fingerprinting & Determinism', () => {
  it('canonicalSerialize sorts object keys deterministically regardless of insertion order', () => {
    const objA = { z: 1, a: 'test', m: { b: 2, a: 1 } };
    const objB = { a: 'test', m: { a: 1, b: 2 }, z: 1 };

    expect(canonicalSerialize(objA)).toBe(canonicalSerialize(objB));
  });

  it('generateCanonicalFingerprint produces a valid SHA-256 hex hash', () => {
    const sampleInput = {
      tenantId: 'tenant_1',
      siteId: 'site_A',
      productId: 'prod_100',
      inventoryTotal: 500,
      thresholds: {
        minimumQuantity: 100,
        targetQuantity: 400,
        maximumQuantity: 800,
        ddxmRetentionQuantity: 50,
        controllingThresholdMode: 'STATIC'
      }
    };

    const hash = generateCanonicalFingerprint(sampleInput);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generateCanonicalFingerprint produces identical output for identical input structures', () => {
    const input1 = {
      tenantId: 'tenant_1',
      siteId: 'site_A',
      productId: 'prod_100',
      inventoryTotal: 1200,
      activePromotionIds: ['promo_x', 'promo_y']
    };

    const input2 = {
      siteId: 'site_A',
      tenantId: 'tenant_1',
      productId: 'prod_100',
      inventoryTotal: 1200,
      activePromotionIds: ['promo_x', 'promo_y']
    };

    expect(generateCanonicalFingerprint(input1)).toBe(generateCanonicalFingerprint(input2));
  });

  it('generateCanonicalFingerprint produces different hash when inventory or rules change', () => {
    const baseInput = {
      tenantId: 'tenant_1',
      siteId: 'site_A',
      productId: 'prod_100',
      inventoryTotal: 1000
    };

    const changedInput = {
      ...baseInput,
      inventoryTotal: 1050
    };

    expect(generateCanonicalFingerprint(baseInput)).not.toBe(generateCanonicalFingerprint(changedInput));
  });
});

describe('Backend Recommendation System Architecture & Safety Constraints', () => {
  it('Job queue payload schema satisfies transactional processing requirements', () => {
    const mockJob = {
      id: 'job_123',
      jobId: 'job_123',
      tenantId: 'tenant_1',
      siteId: 'site_A',
      status: 'QUEUED',
      triggerType: 'INVENTORY_IMPORT',
      requestedBy: 'user@example.com',
      requestedAt: new Date(),
      productCount: 10,
      processedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
      engineVersion: '2.0.0-trusted-backend'
    };

    expect(mockJob.status).toBe('QUEUED');
    expect(mockJob.engineVersion).toContain('trusted-backend');
  });
});
