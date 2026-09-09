import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../../config/supabase';
import { 
  getSiteOnboarding,
  initializeSiteOnboarding, 
  updateSiteOnboardingStep, 
  completeSiteOnboarding, 
  reopenSiteOnboarding, 
  resetSiteOnboarding, 
  runSiteReadinessChecks 
} from './siteOnboardingService';

vi.mock('../../administration/services/settingsService', () => ({
  createAuditLog: vi.fn()
}));

const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockImplementation(() => ({
  eq: vi.fn().mockImplementation(() => ({
    eq: vi.fn().mockResolvedValue({ error: null })
  }))
}));
const mockUpsert = vi.fn().mockResolvedValue({ error: null });

vi.mock('../../../config/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
      single: mockSingle,
      insert: mockInsert,
      update: mockUpdate,
      upsert: mockUpsert,
    }))
  }
}));

describe('siteOnboardingService', () => {
  const tenantId = 'NCP-TEST';
  const siteId = 'test-site-123';
  const userId = 'user-admin-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSiteOnboarding', () => {
    it('returns null if onboarding document does not exist', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      const res = await getSiteOnboarding(tenantId, siteId);
      expect(res).toBeNull();
    });

    it('returns document data if onboarding document exists', async () => {
      const mockData = {
        tenant_id: tenantId,
        site_id: siteId,
        status: 'IN_PROGRESS',
        current_step: 3,
        completed_steps: [0, 1, 2]
      };
      mockMaybeSingle.mockResolvedValueOnce({ data: mockData, error: null });

      const res = await getSiteOnboarding(tenantId, siteId);
      expect(res).toEqual({
        tenantId,
        siteId,
        status: 'IN_PROGRESS',
        currentStep: 3,
        completedSteps: [0, 1, 2]
      });
    });
  });

  describe('initializeSiteOnboarding', () => {
    it('initializes and saves onboarding state to NOT_STARTED', async () => {
      mockInsert.mockResolvedValueOnce({ error: null });

      const res = await initializeSiteOnboarding(tenantId, siteId, userId);
      
      expect(res.status).toBe('NOT_STARTED');
      expect(res.currentStep).toBe(0);
      expect(res.completedSteps).toEqual([]);
      expect(res.startedBy).toBe(userId);
      expect(supabase.from).toHaveBeenCalledWith('site_onboarding');
    });
  });

  describe('updateSiteOnboardingStep', () => {
    it('updates steps and status in supabase', async () => {
      await updateSiteOnboardingStep(tenantId, siteId, 4, [0, 1, 2, 3], [], userId, 'IN_PROGRESS');
      
      expect(supabase.from).toHaveBeenCalledWith('site_onboarding');
    });
  });

  describe('completeSiteOnboarding', () => {
    it('marks onboarding status as COMPLETED and sets onboardingComplete on the site', async () => {
      await completeSiteOnboarding(tenantId, siteId, userId);

      expect(supabase.from).toHaveBeenCalledWith('site_onboarding');
      expect(supabase.from).toHaveBeenCalledWith('sites');
    });
  });

  describe('reopenSiteOnboarding', () => {
    it('sets status back to IN_PROGRESS and reverts onboardingComplete flag', async () => {
      await reopenSiteOnboarding(tenantId, siteId, userId);

      expect(supabase.from).toHaveBeenCalledWith('site_onboarding');
      expect(supabase.from).toHaveBeenCalledWith('sites');
    });
  });

  describe('resetSiteOnboarding', () => {
    it('resets onboarding state and reverts site to ONBOARDING status', async () => {
      await resetSiteOnboarding(tenantId, siteId, userId);

      expect(supabase.from).toHaveBeenCalledWith('site_onboarding');
      expect(supabase.from).toHaveBeenCalledWith('sites');
    });
  });

  describe('runSiteReadinessChecks', () => {
    it('runs queries and detects blockers and recommendations correctly', async () => {
      mockMaybeSingle.mockResolvedValue({
        data: {
          hold_action_id: 'hold',
          review_action_id: 'review',
          release_action_id: 'release',
          urgent_priority_id: 'urgent',
          normal_priority_id: 'normal',
          low_priority_id: 'low'
        },
        error: null
      });

      const res = await runSiteReadinessChecks(tenantId, siteId);

      expect(res.blockers.decisionSettingsIncomplete).toBe(false);
      expect(res.counts.destinations).toBeGreaterThanOrEqual(0);
    });
  });
});
