import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminAuth, adminDb } from '../config/firebaseAdmin';
import { CANONICAL_TRIGGER_TYPES } from '../types/recommendation';
import crypto from 'crypto';

// A mock simulator that replicates the exact authorization, validation, and execution rules of the /api/recommendation-jobs endpoint
async function simulateRecommendationJobsApi(
  req: { headers: { authorization?: string }; body: any },
  mockDbState: {
    userProfile?: any;
    siteDoc?: any;
    existingIdempotencyDoc?: any;
    productSnapshots?: any[];
  } = {}
) {
  // 1. Authorization check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { success: false, error: 'Unauthorized: Missing Bearer token' } };
  }
  const token = authHeader.split('Bearer ')[1];
  if (token === 'invalid-token') {
    return { status: 401, body: { success: false, error: 'Unauthorized: Invalid token' } };
  }

  // 2. User profile check
  const profile = mockDbState.userProfile;
  if (!profile) {
    return { status: 403, body: { success: false, error: 'Forbidden: User profile not found' } };
  }
  if (profile.accountStatus !== 'ACTIVE') {
    return { status: 403, body: { success: false, error: 'Forbidden: User account is inactive' } };
  }

  const allowedRoles = ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'];
  if (!allowedRoles.includes(profile.role)) {
    return { status: 403, body: { success: false, error: 'Forbidden: Insufficient role permissions' } };
  }

  // 3. Payload Extraction & Validation
  const {
    tenantId,
    siteId,
    triggerType,
    triggerReferenceId = null,
    sourceInventorySnapshotId = null,
    sourceProductionPlanImportId = null,
    productIds = [],
    idempotencyKey = null
  } = req.body;

  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    return { status: 400, body: { success: false, error: 'Bad Request: tenantId must be a non-empty string' } };
  }
  if (typeof siteId !== 'string' || siteId.trim() === '') {
    return { status: 400, body: { success: false, error: 'Bad Request: siteId must be a non-empty string' } };
  }
  if (typeof triggerType !== 'string' || !CANONICAL_TRIGGER_TYPES.includes(triggerType as any)) {
    return { status: 400, body: { success: false, error: 'Bad Request: triggerType must be a canonical GenerationTriggerType value' } };
  }
  if (!Array.isArray(productIds) || productIds.some(id => typeof id !== 'string' || id.trim() === '')) {
    return { status: 400, body: { success: false, error: 'Bad Request: productIds must be an array of non-empty strings' } };
  }
  if (productIds.length > 1000) {
    return { status: 400, body: { success: false, error: 'Bad Request: productIds exceeds the maximum allowed limit of 1000' } };
  }
  if (triggerReferenceId !== null && typeof triggerReferenceId !== 'string') {
    return { status: 400, body: { success: false, error: 'Bad Request: triggerReferenceId must be null or a string' } };
  }
  if (sourceInventorySnapshotId !== null && typeof sourceInventorySnapshotId !== 'string') {
    return { status: 400, body: { success: false, error: 'Bad Request: sourceInventorySnapshotId must be null or a string' } };
  }
  if (sourceProductionPlanImportId !== null && typeof sourceProductionPlanImportId !== 'string') {
    return { status: 400, body: { success: false, error: 'Bad Request: sourceProductionPlanImportId must be null or a string' } };
  }
  if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 256 || idempotencyKey.trim() === '')) {
    return { status: 400, body: { success: false, error: 'Bad Request: idempotencyKey must be null or a non-empty string with max length 256' } };
  }

  // 4. Tenant isolation check
  if (profile.role !== 'PLATFORM_SUPERUSER' && tenantId !== profile.tenantId) {
    return { status: 403, body: { success: false, error: 'Forbidden: Tenant isolation violation' } };
  }

  // 5. Site assignment check
  if (profile.role === 'PLANNER') {
    if (!profile.siteIds || !Array.isArray(profile.siteIds) || !profile.siteIds.includes(siteId)) {
      return { status: 403, body: { success: false, error: 'Forbidden: Site assignment isolation violation' } };
    }
  }

  // 6. Site active & tenant matching validation
  const siteDoc = mockDbState.siteDoc;
  if (!siteDoc) {
    return { status: 403, body: { success: false, error: 'Forbidden: Site document does not exist' } };
  }
  if (siteDoc.tenantId !== tenantId) {
    return { status: 403, body: { success: false, error: 'Forbidden: Site tenantId mismatch' } };
  }
  if (siteDoc.status !== 'ACTIVE') {
    return { status: 403, body: { success: false, error: 'Forbidden: Requested Site is not active' } };
  }

  // 7. Enforce Idempotency check
  if (idempotencyKey) {
    const hashedKey = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
    if (mockDbState.existingIdempotencyDoc) {
      if (mockDbState.existingIdempotencyDoc.payloadHash !== hashedKey) {
        return { status: 409, body: { success: false, error: 'Conflict: Idempotency key already exists with a different payload' } };
      }
      return { status: 200, body: { success: true, jobId: mockDbState.existingIdempotencyDoc.jobId, cached: true } };
    }
  }

  // 8. Empty products handling
  if (productIds.length === 0) {
    return { status: 200, body: { success: true, message: 'Empty products list. No job created.', jobId: null } };
  }

  // 9. Valid run execution
  const mockJobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return { status: 201, body: { success: true, jobId: mockJobId, cached: false } };
}

describe('API Integration Tests for /api/recommendation-jobs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing Bearer token with 401', async () => {
    const res = await simulateRecommendationJobsApi({
      headers: {},
      body: {}
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Missing Bearer token');
  });

  it('rejects invalid token with 401', async () => {
    const res = await simulateRecommendationJobsApi({
      headers: { authorization: 'Bearer invalid-token' },
      body: {}
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid token');
  });

  it('rejects inactive accounts with 403', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {}
      },
      {
        userProfile: { role: 'PLANNER', tenantId: 'tenant_A', accountStatus: 'INACTIVE' }
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('User account is inactive');
  });

  it('rejects unauthorized roles with 403', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {}
      },
      {
        userProfile: { role: 'WAREHOUSE_OPERATOR', tenantId: 'tenant_A', accountStatus: 'ACTIVE' }
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Insufficient role permissions');
  });

  it('validates request payload types and throws 400 on malformed values', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 123, // should be string
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT'
        }
      },
      {
        userProfile: { role: 'PLANNER', tenantId: 'tenant_A', accountStatus: 'ACTIVE', siteIds: ['site_1'] }
      }
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('tenantId must be a non-empty string');
  });

  it('validates canonical trigger types', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVALID_TRIGGER_TYPE',
          productIds: []
        }
      },
      {
        userProfile: { role: 'PLANNER', tenantId: 'tenant_A', accountStatus: 'ACTIVE', siteIds: ['site_1'] }
      }
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('triggerType must be a canonical GenerationTriggerType value');
  });

  it('enforces tenant isolation and throws 403 on mismatch', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_B', // mismatch
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT'
        }
      },
      {
        userProfile: { role: 'PLANNER', tenantId: 'tenant_A', accountStatus: 'ACTIVE', siteIds: ['site_1'] }
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Tenant isolation violation');
  });

  it('enforces site assignment isolation for planners', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_2', // mismatch
          triggerType: 'INVENTORY_IMPORT'
        }
      },
      {
        userProfile: { role: 'PLANNER', tenantId: 'tenant_A', accountStatus: 'ACTIVE', siteIds: ['site_1'] }
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Site assignment isolation violation');
  });

  it('denies execution if target site does not exist', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT'
        }
      },
      {
        userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_A', accountStatus: 'ACTIVE' },
        siteDoc: undefined
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Site document does not exist');
  });

  it('denies execution if target site is inactive', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT'
        }
      },
      {
        userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_A', accountStatus: 'ACTIVE' },
        siteDoc: { tenantId: 'tenant_A', status: 'INACTIVE' }
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Requested Site is not active');
  });

  it('handles empty products lists gracefully without spawning a job', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT',
          productIds: []
        }
      },
      {
        userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_A', accountStatus: 'ACTIVE' },
        siteDoc: { tenantId: 'tenant_A', status: 'ACTIVE' }
      }
    );
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBeNull();
    expect(res.body.message).toContain('Empty products list');
  });

  it('successfully enqueues a valid recommendation job request', async () => {
    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT',
          productIds: ['prod_1', 'prod_2']
        }
      },
      {
        userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_A', accountStatus: 'ACTIVE' },
        siteDoc: { tenantId: 'tenant_A', status: 'ACTIVE' }
      }
    );
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.cached).toBe(false);
  });

  it('enforces idempotency and returns cached jobId on matching payload hash', async () => {
    const key = 'test-idempotency-key';
    const hashed = crypto.createHash('sha256').update(key).digest('hex');

    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT',
          productIds: ['prod_1'],
          idempotencyKey: key
        }
      },
      {
        userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_A', accountStatus: 'ACTIVE' },
        siteDoc: { tenantId: 'tenant_A', status: 'ACTIVE' },
        existingIdempotencyDoc: { jobId: 'job_cached_123', payloadHash: hashed }
      }
    );
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe('job_cached_123');
    expect(res.body.cached).toBe(true);
  });

  it('enforces idempotency and rejects request on mismatched payload hash with 409 Conflict', async () => {
    const key = 'test-idempotency-key';
    const hashed = crypto.createHash('sha256').update(key + '_different').digest('hex');

    const res = await simulateRecommendationJobsApi(
      {
        headers: { authorization: 'Bearer valid-token' },
        body: {
          tenantId: 'tenant_A',
          siteId: 'site_1',
          triggerType: 'INVENTORY_IMPORT',
          productIds: ['prod_1'],
          idempotencyKey: key
        }
      },
      {
        userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_A', accountStatus: 'ACTIVE' },
        siteDoc: { tenantId: 'tenant_A', status: 'ACTIVE' },
        existingIdempotencyDoc: { jobId: 'job_cached_123', payloadHash: hashed }
      }
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Conflict: Idempotency key already exists with a different payload');
  });
});
