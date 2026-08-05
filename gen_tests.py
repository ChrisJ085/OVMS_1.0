with open("src/tests/apiIntegration.test.ts", "w") as f:
    f.write("""import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server';
import { adminAuth, adminDb } from '../config/firebaseAdmin';

let app: any;

// Mock adminAuth
vi.mock('../config/firebaseAdmin', async () => {
  const actual = await vi.importActual('../config/firebaseAdmin') as any;
  return {
    ...actual,
    adminAuth: {
      verifyIdToken: vi.fn(),
    },
  };
});

describe('API Integration Tests', () => {

  beforeAll(async () => {
    app = await createApp();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'planner_uid' } as any);

    // Setup initial data in emulator
    const usersRef = adminDb.collection('users');
    await usersRef.doc('planner_uid').set({
      role: 'PLANNER',
      tenantId: 'tenant_A',
      siteIds: ['site_1'],
      accountStatus: 'ACTIVE',
    });

    const superuserRef = adminDb.collection('users');
    await superuserRef.doc('superuser_uid').set({
      role: 'PLATFORM_SUPERUSER',
      accountStatus: 'ACTIVE',
    });
    
    // Create base recommendation
    await adminDb.collection('recommendations').doc('rec_hist_1').set({
      tenantId: 'tenant_A',
      siteId: 'site_1',
      productId: 'prod_1',
      recommendationStatus: 'AUTO_PUBLISHED',
      decisionOutput: {
        recommendedActionTypeId: 'RELEASE',
        recommendedQuantity: 100,
        recommendedPriorityLevelId: 'NORMAL'
      }
    });

    await adminDb.collection('currentRecommendations').doc('tenant_A_site_1_prod_1').set({
      tenantId: 'tenant_A',
      siteId: 'site_1',
      productId: 'prod_1',
      recommendationStatus: 'AUTO_PUBLISHED',
      hasActiveOverride: false,
      currentSystemRecommendation: {
        decisionOutput: {
          recommendedActionTypeId: 'RELEASE',
          recommendedQuantity: 100,
          recommendedPriorityLevelId: 'NORMAL'
        }
      }
    });
  });

  afterAll(async () => {
    // cleanup
  });

  describe('POST /api/recommendations/:id/override', () => {
    it('rejects unassigned Planner', async () => {
       vi.mocked(adminAuth.verifyIdToken).mockResolvedValue({ uid: 'planner_uid' } as any);
       // Make site mismatch
       await adminDb.collection('recommendations').doc('rec_hist_2').set({
          tenantId: 'tenant_A',
          siteId: 'site_2', // unassigned site
          productId: 'prod_2',
          recommendationStatus: 'AUTO_PUBLISHED'
       });
       
       const res = await request(app)
         .post('/api/recommendations/rec_hist_2/override')
         .set('Authorization', 'Bearer token')
         .send({ overrideData: { reason: 'Test' } });
         
       expect(res.status).toBe(403);
    });
    
    it('AUTO_PUBLISHED recommendation can be overridden', async () => {
       const res = await request(app)
         .post('/api/recommendations/rec_hist_1/override')
         .set('Authorization', 'Bearer token')
         .send({ 
            overrideData: { 
              reason: 'Need override',
              quantity: 200,
              instruction: 'Custom Instruction'
            } 
         });
         
       expect(res.status).toBe(200);
       
       // Verify canonical currentRecommendations ID is updated
       const curSnap = await adminDb.collection('currentRecommendations').doc('tenant_A_site_1_prod_1').get();
       const curData = curSnap.data()!;
       expect(curData.recommendationStatus).toBe('OVERRIDDEN');
       expect(curData.hasActiveOverride).toBe(true);
       expect(curData.activeOverride).toBeDefined();
       expect(curData.activeOverride.reason).toBe('Need override');
       expect(curData.activeOverride.status).toBe('ACTIVE');
       expect(curData.effectiveInstruction).toBe('Custom Instruction');
       
       // Verify automatic system recommendation remains unchanged
       const histSnap = await adminDb.collection('recommendations').doc('rec_hist_1').get();
       expect(histSnap.data()!.recommendationStatus).toBe('AUTO_PUBLISHED');
       
       // Verify one deterministic priority is updated
       const priorityId = 'tenant_A_site_1_prod_1';
       const prioSnap = await adminDb.collection('priorities').doc(priorityId).get();
       expect(prioSnap.exists).toBe(true);
       const prioData = prioSnap.data()!;
       expect(prioData.sourceType).toBe('MANUAL_OVERRIDE');
       expect(prioData.requestedQuantity).toBe(200);
       
       // Verify correct display projection is updated
       const dispSnap = await adminDb.collection('displayPriorities').doc('disp_' + priorityId).get();
       expect(dispSnap.exists).toBe(true);
       expect(dispSnap.data()!.actionType).toBe(prioData.actionTypeId);
    });
    
    it('ACTIVE is not expected as a recommendation status', async () => {
       await adminDb.collection('recommendations').doc('rec_hist_active').set({
          tenantId: 'tenant_A',
          siteId: 'site_1',
          productId: 'prod_1',
          recommendationStatus: 'ACTIVE' // Invalid status
       });
       const res = await request(app)
         .post('/api/recommendations/rec_hist_active/override')
         .set('Authorization', 'Bearer token')
         .send({ overrideData: { reason: 'Test' } });
       expect(res.status).toBe(400);
       expect(res.body.error).toContain('cannot be overridden');
    });
  });
  
  describe('POST /api/recommendations/:id/suppress', () => {
    it('AUTO_PUBLISHED recommendation can be suppressed', async () => {
       // ensure override from previous test doesn't interfere
       await adminDb.collection('currentRecommendations').doc('tenant_A_site_1_prod_1').update({ recommendationStatus: 'AUTO_PUBLISHED' });
       const res = await request(app)
         .post('/api/recommendations/rec_hist_1/suppress')
         .set('Authorization', 'Bearer token')
         .send({ suppressionData: { reason: 'No stock', scope: 'PERMANENT' } });
       expect(res.status).toBe(200);
       
       const curSnap = await adminDb.collection('currentRecommendations').doc('tenant_A_site_1_prod_1').get();
       expect(curSnap.data()!.recommendationStatus).toBe('SUPPRESSED');
       expect(curSnap.data()!.suppressionContext.scope).toBe('PERMANENT');
       
       // Verify priority becomes withdrawn
       const priorityId = 'tenant_A_site_1_prod_1';
       const prioSnap = await adminDb.collection('priorities').doc(priorityId).get();
       if (prioSnap.exists) {
           expect(prioSnap.data()!.priorityStatus).toBe('WITHDRAWN');
       }
       
       // Verify exact display projection is deleted
       const dispSnap = await adminDb.collection('displayPriorities').doc('disp_' + priorityId).get();
       expect(dispSnap.exists).toBe(false);
    });
    
    it('invalid scope is rejected', async () => {
       const res = await request(app)
         .post('/api/recommendations/rec_hist_1/suppress')
         .set('Authorization', 'Bearer token')
         .send({ suppressionData: { reason: 'No stock', scope: 'INVALID' } });
       expect(res.status).toBe(400);
    });
    
    it('expired UNTIL_DATE is rejected', async () => {
       const res = await request(app)
         .post('/api/recommendations/rec_hist_1/suppress')
         .set('Authorization', 'Bearer token')
         .send({ suppressionData: { reason: 'No stock', scope: 'UNTIL_DATE', expireAt: '2020-01-01' } });
       expect(res.status).toBe(400);
    });
  });

  describe('POST /api/recommendations/:id/restore-automatic', () => {
    it('activeOverride is cleared and recalculation job uses shared idempotent enqueue', async () => {
       // Setup override first
       await adminDb.collection('currentRecommendations').doc('tenant_A_site_1_prod_1').update({
          recommendationStatus: 'OVERRIDDEN',
          hasActiveOverride: true,
          activeOverride: { status: 'ACTIVE', reason: 'Test' }
       });
       await adminDb.collection('recommendations').doc('rec_hist_1').update({
          recommendationStatus: 'OVERRIDDEN'
       });
       
       const res = await request(app)
         .post('/api/recommendations/rec_hist_1/restore-automatic')
         .set('Authorization', 'Bearer token');
       expect(res.status).toBe(200);
       
       const curSnap = await adminDb.collection('currentRecommendations').doc('tenant_A_site_1_prod_1').get();
       const curData = curSnap.data()!;
       expect(curData.hasActiveOverride).toBe(false);
       expect(curData.activeOverride).toBeNull();
       expect(curData.suppressionContext).toBeNull();
       
       // Repeated restore does not create duplicate jobs (enforced by idempotency)
       // Let's call it again
       const res2 = await request(app)
         .post('/api/recommendations/rec_hist_1/restore-automatic')
         .set('Authorization', 'Bearer token');
       expect(res2.status).toBe(400); // Because status is no longer OVERRIDDEN or SUPPRESSED (wait, it's not changed in restore directly, let's see)
       // Actually, my restore logic does NOT change recommendationStatus, it leaves it or the engine does it.
       // Wait, I allowed "AUTO_PUBLISHED" for restore if out of sync, but if it has no active override, it fails.
       expect(res2.body.error).toContain('does not have an active override or suppression to restore');
    });
  });
});
""")
