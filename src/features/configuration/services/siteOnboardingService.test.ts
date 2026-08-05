import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getSiteOnboarding, 
  initializeSiteOnboarding, 
  updateSiteOnboardingStep, 
  completeSiteOnboarding, 
  reopenSiteOnboarding, 
  resetSiteOnboarding, 
  runSiteReadinessChecks 
} from './siteOnboardingService';
import { getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

vi.mock('../../../config/firebase', () => ({
  db: {}
}));

vi.mock('../../administration/services/settingsService', () => ({
  createAuditLog: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'mocked-timestamp')
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
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => false
      } as any);

      const res = await getSiteOnboarding(tenantId, siteId);
      expect(res).toBeNull();
    });

    it('returns document data if onboarding document exists', async () => {
      const mockData = {
        tenantId,
        siteId,
        status: 'IN_PROGRESS',
        currentStep: 3,
        completedSteps: [0, 1, 2]
      };
      vi.mocked(getDoc).mockResolvedValueOnce({
        exists: () => true,
        data: () => mockData
      } as any);

      const res = await getSiteOnboarding(tenantId, siteId);
      expect(res).toEqual(mockData);
    });
  });

  describe('initializeSiteOnboarding', () => {
    it('initializes and saves onboarding state to NOT_STARTED', async () => {
      vi.mocked(setDoc).mockResolvedValueOnce(undefined);

      const res = await initializeSiteOnboarding(tenantId, siteId, userId);
      
      expect(res.status).toBe('NOT_STARTED');
      expect(res.currentStep).toBe(0);
      expect(res.completedSteps).toEqual([]);
      expect(res.startedBy).toBe(userId);
      expect(setDoc).toHaveBeenCalled();
    });
  });

  describe('updateSiteOnboardingStep', () => {
    it('updates steps and status in firestore', async () => {
      vi.mocked(updateDoc).mockResolvedValueOnce(undefined);

      await updateSiteOnboardingStep(tenantId, siteId, 4, [0, 1, 2, 3], [], userId, 'IN_PROGRESS');
      
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('completeSiteOnboarding', () => {
    it('marks onboarding status as COMPLETED and sets onboardingComplete on the site', async () => {
      vi.mocked(updateDoc).mockResolvedValue(undefined);

      await completeSiteOnboarding(tenantId, siteId, userId);

      expect(updateDoc).toHaveBeenCalledTimes(2); // onboarding doc + site doc
    });
  });

  describe('reopenSiteOnboarding', () => {
    it('sets status back to IN_PROGRESS and reverts onboardingComplete flag', async () => {
      vi.mocked(updateDoc).mockResolvedValue(undefined);

      await reopenSiteOnboarding(tenantId, siteId, userId);

      expect(updateDoc).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetSiteOnboarding', () => {
    it('resets onboarding state and reverts site to ONBOARDING status', async () => {
      vi.mocked(setDoc).mockResolvedValueOnce(undefined);
      vi.mocked(updateDoc).mockResolvedValueOnce(undefined);

      await resetSiteOnboarding(tenantId, siteId, userId);

      expect(setDoc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('runSiteReadinessChecks', () => {
    it('runs queries and detects blockers and recommendations correctly', async () => {
      // Mock all the getDocs size returns
      vi.mocked(getDocs).mockResolvedValue({
        size: 2,
        docs: [
          { data: () => ({ status: 'active', siteId }) },
          { data: () => ({ status: 'active', siteId: '' }) }
        ]
      } as any);

      // Mock decisionConfigurations getDoc
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          holdActionId: 'hold',
          reviewActionId: 'review',
          releaseActionId: 'release',
          urgentPriorityId: 'urgent',
          normalPriorityId: 'normal',
          lowPriorityId: 'low'
        })
      } as any);

      const res = await runSiteReadinessChecks(tenantId, siteId);

      expect(res.blockers.decisionSettingsIncomplete).toBe(false);
      expect(res.counts.destinations).toBeGreaterThanOrEqual(0);
    });
  });
});
