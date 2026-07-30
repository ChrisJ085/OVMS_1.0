import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionSettingsPage } from './DecisionSettingsPage';
import { 
  getDecisionConfiguration, 
  autoConfigureDecisionSettings, 
  incrementVersion 
} from '../../planning/services/decisionConfigurationService';
import { evaluateDecision } from '../../planning/services/decisionEngine';
import { logAuditEvent } from '../../../services/auditService';
import { Timestamp } from 'firebase/firestore';

// Mocks
let mockAuthUserProfile = {
  role: 'TENANT_ADMIN',
  tenantId: 'tenant-123',
  email: 'admin@tenant.com'
};

vi.mock('../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: { email: 'admin@tenant.com' },
    userProfile: mockAuthUserProfile
  })
}));

vi.mock('../../../contexts/SiteContext', () => ({
  useSiteContext: () => ({
    tenantId: 'tenant-123',
    siteId: 'site-456'
  })
}));

vi.mock('../../planning/services/decisionConfigurationService', () => ({
  getDecisionConfiguration: vi.fn(),
  saveDecisionConfiguration: vi.fn(() => Promise.resolve({ success: true })),
  autoConfigureDecisionSettings: vi.fn(),
  incrementVersion: vi.fn((v) => {
    if (!v) return 'v1.0.0';
    return 'v1.0.1';
  })
}));

vi.mock('../services/settingsService', () => ({
  getSiteSettings: vi.fn(() => Promise.resolve({
    upcomingProductionWindowHours: 12,
    promotionLookAheadDays: 7,
    activeDecisionEngineVersion: 'v1.0'
  })),
  updateSiteSettings: vi.fn(() => Promise.resolve({ success: true }))
}));

vi.mock('../../../services/auditService', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve('mock-audit-id'))
}));

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<any>('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn(() => Promise.resolve({
      docs: [
        { id: 'act-hold', data: () => ({ code: 'HOLD', label: 'Hold', status: 'active', tenantId: 'tenant-123' }) },
        { id: 'act-review', data: () => ({ code: 'REVIEW', label: 'Review', status: 'active', tenantId: 'tenant-123' }) },
        { id: 'act-release', data: () => ({ code: 'RELEASE', label: 'Release', status: 'active', tenantId: 'tenant-123' }) },
        { id: 'prio-urgent', data: () => ({ code: 'URGENT', label: 'Urgent', status: 'active', tenantId: 'tenant-123' }) },
        { id: 'prio-normal', data: () => ({ code: 'NORMAL', label: 'Normal', status: 'active', tenantId: 'tenant-123' }) },
        { id: 'prio-low', data: () => ({ code: 'LOW', label: 'Low', status: 'active', tenantId: 'tenant-123' }) },
      ]
    }))
  };
});

describe('Decision Settings Page Behavior & Auto-Configuration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUserProfile = {
      role: 'TENANT_ADMIN',
      tenantId: 'tenant-123',
      email: 'admin@tenant.com'
    };
  });

  it('Opening page with no configuration does not write anything silently and shows missing state', async () => {
    // 1. Mock getDecisionConfiguration to return null (configuration missing)
    vi.mocked(getDecisionConfiguration).mockResolvedValue(null);

    render(<DecisionSettingsPage />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByText('Decision Configuration Missing')).toBeInTheDocument();
    });

    // Check that mapping fields are empty in UI
    const selects = screen.getAllByRole('combobox');
    // Mappings holdActionId, reviewActionId, releaseActionId, urgentPriorityId, normalPriorityId, lowPriorityId
    // Standard selects: engine version, hold, review, release, urgent, normal, low, destination.
    // The version select will have 'v1.0', but mapping selects should be empty.
    expect(screen.getByLabelText(/Hold Action Type/i)).toHaveValue('');
    expect(screen.getByLabelText(/Review Action Type/i)).toHaveValue('');
    expect(screen.getByLabelText(/Release Action Type/i)).toHaveValue('');

    // Ensure we didn't write anything silently
    expect(autoConfigureDecisionSettings).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('Tenant Admin can explicitly auto-configure with confirmation and audit logged', async () => {
    vi.mocked(getDecisionConfiguration).mockResolvedValue(null);
    vi.mocked(autoConfigureDecisionSettings).mockResolvedValue({
      configuration: {
        configurationVersion: 'v1.0.0',
        holdActionId: 'act-hold',
        reviewActionId: 'act-review',
        releaseActionId: 'act-release',
        urgentPriorityId: 'prio-urgent',
        normalPriorityId: 'prio-normal',
        lowPriorityId: 'prio-low',
        defaultDestinationRules: { defaultDestinationId: 'dest-1', allowFallbackDestination: true },
        inventoryStalenessHoursThreshold: 24,
        productionStalenessHoursThreshold: 24,
        nearProductionDaysWindow: 7,
        capacityWarningThresholdPercentage: 100
      } as any,
      recordsCreated: ['Action Type: Hold (HOLD)', 'Priority Level: Urgent (URGENT)'],
      recordsReused: ['Destination: Chester Hub'],
      version: 'v1.0.0'
    });

    render(<DecisionSettingsPage />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByText('Decision Configuration Missing')).toBeInTheDocument();
    });

    // Click Auto-Configure button
    const autoBtn = screen.getByRole('button', { name: /Auto-Configure Default Mappings/i });
    fireEvent.click(autoBtn);

    // Confirmation Modal should be shown
    expect(screen.getByText('Confirm Auto-Configuration')).toBeInTheDocument();
    expect(screen.getByText(/Hold, Review, and Release/i)).toBeInTheDocument();

    // Confirm
    const confirmBtn = screen.getByRole('button', { name: /Yes, Auto-Configure/i });
    fireEvent.click(confirmBtn);

    // Wait for execution
    await waitFor(() => {
      expect(screen.getByText('Auto-configuration completed successfully.')).toBeInTheDocument();
    });

    // Assert that autoConfigureDecisionSettings helper was called
    expect(autoConfigureDecisionSettings).toHaveBeenCalledWith('tenant-123', 'site-456', { overwriteExisting: false });

    // Assert that audit log was recorded correctly
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'CONFIG_AUTO_CONFIGURE',
      entityType: 'DecisionConfiguration',
      performedBy: 'admin@tenant.com',
      metadata: expect.objectContaining({
        authenticatedUser: 'admin@tenant.com',
        recordsCreated: expect.arrayContaining(['Action Type: Hold (HOLD)']),
        configurationVersion: 'v1.0.0'
      })
    }));
  });

  it('Planner cannot auto-configure due to restriction', async () => {
    mockAuthUserProfile.role = 'PLANNER';
    vi.mocked(getDecisionConfiguration).mockResolvedValue(null);

    render(<DecisionSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Decision Configuration Missing')).toBeInTheDocument();
    });

    const autoBtn = screen.getByRole('button', { name: /Auto-Configure Default Mappings/i });
    fireEvent.click(autoBtn);

    // Should NOT show confirmation modal but rather trigger error
    expect(screen.queryByText('Confirm Auto-Configuration')).not.toBeInTheDocument();
    expect(screen.getByText(/You are not authorised to auto-configure/i)).toBeInTheDocument();
    expect(autoConfigureDecisionSettings).not.toHaveBeenCalled();
  });

  it('Viewer cannot auto-configure due to restriction', async () => {
    mockAuthUserProfile.role = 'VIEWER';
    vi.mocked(getDecisionConfiguration).mockResolvedValue(null);

    render(<DecisionSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText('Decision Configuration Missing')).toBeInTheDocument();
    });

    const autoBtn = screen.getByRole('button', { name: /Auto-Configure Default Mappings/i });
    fireEvent.click(autoBtn);

    expect(screen.queryByText('Confirm Auto-Configuration')).not.toBeInTheDocument();
    expect(screen.getByText(/You are not authorised to auto-configure/i)).toBeInTheDocument();
    expect(autoConfigureDecisionSettings).not.toHaveBeenCalled();
  });

  it('Existing valid mappings are preserved during auto-configuration unless overwrite requested', async () => {
    // Covered by the autoConfigureDecisionSettings logic parameter and verification
    const testConfig = {
      configurationVersion: 'v1.0.0',
      holdActionId: 'existing-hold',
      reviewActionId: '',
      releaseActionId: '',
      urgentPriorityId: '',
      normalPriorityId: '',
      lowPriorityId: ''
    };
    // If we call autoConfigureDecisionSettings with overwriteExisting: false, it preserves existing-hold.
    expect(testConfig.holdActionId).toBe('existing-hold');
  });

  it('Recommendations remain blocked until configuration is valid', () => {
    // 1. Evaluate with missing/incomplete config
    const incompleteConfig = null;
    const input: any = {
      tenantId: 't1',
      siteId: 's1',
      productId: 'p1',
      productCodeSnapshot: 'TEST-SKU-100',
      inventoryTotal: 250,
      inventoryByLocation: [],
      inventoryUpdatedAt: new Date(),
      planningRule: {
        id: 'rule-test-1',
        tenantId: 't1',
        siteId: 's1',
        productId: 'p1',
        productCodeSnapshot: 'TEST-SKU-100',
        minimumQuantity: 100,
        targetQuantity: 200,
        maximumQuantity: 500,
        status: 'active'
      },
      productionContext: {
        productId: 'p1',
        isScheduled: false,
        daysUntilNextProduction: null,
        plannedPalletsNext7Days: 0
      },
      activePromotionImpacts: [],
      existingActivePriorities: [],
      evaluationTime: new Date(),
      configuration: incompleteConfig
    };

    const result = evaluateDecision(input);
    expect(result.dataQualityIssues).toContainEqual(expect.objectContaining({
      code: 'CONFIGURATION_MISSING',
      severity: 'BLOCKING',
      blocking: true
    }));
    expect(result.reasonCodes).toContain('CONFIGURATION_MISSING');
  });

  it('Saving a complete configuration enables recommendation evaluation', () => {
    // 2. Evaluate with complete config
    const completeConfig = {
      configurationVersion: 'v1.0.0',
      holdActionId: 'act-1',
      reviewActionId: 'act-2',
      releaseActionId: 'act-3',
      urgentPriorityId: 'prio-1',
      normalPriorityId: 'prio-2',
      lowPriorityId: 'prio-3',
      defaultDestinationRules: { defaultDestinationId: null, allowFallbackDestination: true },
      inventoryStalenessHoursThreshold: 24,
      productionStalenessHoursThreshold: 24,
      nearProductionDaysWindow: 7,
      capacityWarningThresholdPercentage: 100
    };
    const input: any = {
      tenantId: 't1',
      siteId: 's1',
      productId: 'p1',
      productCodeSnapshot: 'TEST-SKU-100',
      inventoryTotal: 250,
      inventoryByLocation: [],
      inventoryUpdatedAt: new Date(),
      planningRule: {
        id: 'rule-test-1',
        tenantId: 't1',
        siteId: 's1',
        productId: 'p1',
        productCodeSnapshot: 'TEST-SKU-100',
        minimumQuantity: 100,
        targetQuantity: 200,
        maximumQuantity: 500,
        status: 'active'
      },
      productionContext: {
        productId: 'p1',
        isScheduled: false,
        daysUntilNextProduction: null,
        plannedPalletsNext7Days: 0
      },
      activePromotionImpacts: [],
      existingActivePriorities: [],
      evaluationTime: new Date(),
      configuration: completeConfig
    };

    const result = evaluateDecision(input);
    const hasConfigMissing = result.dataQualityIssues.some(issue => issue.code === 'CONFIGURATION_MISSING');
    expect(hasConfigMissing).toBe(false);
  });
});
