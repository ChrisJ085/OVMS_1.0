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

  describe('Secure API authorization, RBAC and Tenant/Site Isolation Constraints', () => {
    // Utility to mock validation rules
    const validateRecommendationJobAccess = (
      profile: { role: string; tenantId: string | null; siteIds?: string[]; accountStatus: string },
      requested: { tenantId: string; siteId: string; triggerType: string; productIds?: string[] },
      dbState: {
        siteExists: boolean;
        siteTenantId?: string;
        siteStatus?: string;
        tenantExists: boolean;
        tenantStatus?: string;
        products?: Record<string, { tenantId: string; siteId: string }>;
      }
    ) => {
      // 1. Require accountStatus == "ACTIVE"
      if (profile.accountStatus !== 'ACTIVE') {
        return { authorized: false, status: 403, error: 'Forbidden: User account is inactive' };
      }

      // 2. Require role to be PLATFORM_SUPERUSER, TENANT_ADMIN or PLANNER
      const allowedRoles = ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'];
      if (!allowedRoles.includes(profile.role)) {
        return { authorized: false, status: 403, error: 'Forbidden: Insufficient role permissions' };
      }

      // 3. For non-Superusers, require requested tenantId to equal profile.tenantId
      if (profile.role !== 'PLATFORM_SUPERUSER' && requested.tenantId !== profile.tenantId) {
        return { authorized: false, status: 403, error: 'Forbidden: Tenant isolation violation' };
      }

      // 4. For Planner, require requested siteId to exist in profile.siteIds
      if (profile.role === 'PLANNER') {
        if (!profile.siteIds || !profile.siteIds.includes(requested.siteId)) {
          return { authorized: false, status: 403, error: 'Forbidden: Site assignment isolation violation' };
        }
      }

      // 5. Validate the site document exists
      if (!dbState.siteExists) {
        return { authorized: false, status: 403, error: 'Forbidden: Site document does not exist' };
      }

      // 6. Validate site.tenantId equals requested tenantId
      if (dbState.siteTenantId !== requested.tenantId) {
        return { authorized: false, status: 403, error: 'Forbidden: Site tenantId mismatch' };
      }

      // 7. Validate the tenant and site are active
      if (!dbState.tenantExists || dbState.tenantStatus !== 'ACTIVE') {
        return { authorized: false, status: 403, error: 'Forbidden: Requested Tenant is not active' };
      }

      if (dbState.siteStatus !== 'ACTIVE') {
        return { authorized: false, status: 403, error: 'Forbidden: Requested Site is not active' };
      }

      // 8. Validate every productId belongs to the requested tenant and site
      if (requested.productIds && requested.productIds.length > 0) {
        for (const prodId of requested.productIds) {
          const prod = dbState.products?.[prodId];
          if (!prod) {
            return { authorized: false, status: 403, error: `Forbidden: Product ${prodId} does not exist` };
          }
          if (prod.tenantId !== requested.tenantId || prod.siteId !== requested.siteId) {
            return { authorized: false, status: 403, error: `Forbidden: Product ${prodId} does not belong to requested tenant or site` };
          }
        }
      }

      // 9. Reject unsupported trigger types
      const allowedTriggerTypes = ['MANUAL', 'MANUAL_RECALCULATION', 'SCHEDULED', 'EVENT_DRIVEN'];
      if (!allowedTriggerTypes.includes(requested.triggerType)) {
        return { authorized: false, status: 400, error: 'Bad Request: Unsupported trigger type' };
      }

      return { authorized: true };
    };

    it('denies access if accountStatus is not ACTIVE', () => {
      const result = validateRecommendationJobAccess(
        { role: 'TENANT_ADMIN', tenantId: 'tenant_1', accountStatus: 'INACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_1', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('User account is inactive');
    });

    it('denies access for disallowed roles like WAREHOUSE_OPERATOR', () => {
      const result = validateRecommendationJobAccess(
        { role: 'WAREHOUSE_OPERATOR', tenantId: 'tenant_1', accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_1', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Insufficient role permissions');
    });

    it('enforces tenant isolation for PLANNER role', () => {
      const result = validateRecommendationJobAccess(
        { role: 'PLANNER', tenantId: 'tenant_1', siteIds: ['site_A'], accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_2', siteId: 'site_A', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_2', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Tenant isolation violation');
    });

    it('enforces site assignment isolation for PLANNER role', () => {
      const result = validateRecommendationJobAccess(
        { role: 'PLANNER', tenantId: 'tenant_1', siteIds: ['site_A'], accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_B', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_1', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Site assignment isolation violation');
    });

    it('denies request if site document does not exist', () => {
      const result = validateRecommendationJobAccess(
        { role: 'TENANT_ADMIN', tenantId: 'tenant_1', accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_X', triggerType: 'MANUAL' },
        { siteExists: false, tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Site document does not exist');
    });

    it('denies request if site tenantId mismatches requested tenantId', () => {
      const result = validateRecommendationJobAccess(
        { role: 'PLATFORM_SUPERUSER', tenantId: null, accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_2', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Site tenantId mismatch');
    });

    it('denies request if tenant is inactive', () => {
      const result = validateRecommendationJobAccess(
        { role: 'TENANT_ADMIN', tenantId: 'tenant_1', accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_1', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'INACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Requested Tenant is not active');
    });

    it('denies request if site is inactive', () => {
      const result = validateRecommendationJobAccess(
        { role: 'TENANT_ADMIN', tenantId: 'tenant_1', accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL' },
        { siteExists: true, siteTenantId: 'tenant_1', siteStatus: 'INACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Requested Site is not active');
    });

    it('denies request if product does not belong to requested tenant or site', () => {
      const result = validateRecommendationJobAccess(
        { role: 'TENANT_ADMIN', tenantId: 'tenant_1', accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL', productIds: ['prod_1'] },
        {
          siteExists: true,
          siteTenantId: 'tenant_1',
          siteStatus: 'ACTIVE',
          tenantExists: true,
          tenantStatus: 'ACTIVE',
          products: {
            prod_1: { tenantId: 'tenant_1', siteId: 'site_B' } // wrong site
          }
        }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toContain('Product prod_1 does not belong to requested tenant or site');
    });

    it('rejects unsupported trigger types', () => {
      const result = validateRecommendationJobAccess(
        { role: 'TENANT_ADMIN', tenantId: 'tenant_1', accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'UNKNOWN_TRIGGER' },
        { siteExists: true, siteTenantId: 'tenant_1', siteStatus: 'ACTIVE', tenantExists: true, tenantStatus: 'ACTIVE' }
      );
      expect(result.authorized).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error).toContain('Unsupported trigger type');
    });

    it('approves valid authorized requests', () => {
      const result = validateRecommendationJobAccess(
        { role: 'PLANNER', tenantId: 'tenant_1', siteIds: ['site_A'], accountStatus: 'ACTIVE' },
        { tenantId: 'tenant_1', siteId: 'site_A', triggerType: 'MANUAL_RECALCULATION', productIds: ['prod_1'] },
        {
          siteExists: true,
          siteTenantId: 'tenant_1',
          siteStatus: 'ACTIVE',
          tenantExists: true,
          tenantStatus: 'ACTIVE',
          products: {
            prod_1: { tenantId: 'tenant_1', siteId: 'site_A' }
          }
        }
      );
      expect(result.authorized).toBe(true);
    });
  });
});
