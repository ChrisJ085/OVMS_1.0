import { createAuditLog } from '../../administration/services/settingsService';
import { supabase } from '../../../config/supabase';
import { toCamelCase, toSnakeCase } from '../../../utils/caseTransformers';

export interface SiteOnboarding {
  tenantId: string;
  siteId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'READY_FOR_REVIEW' | 'COMPLETED';
  currentStep: number;
  completedSteps: number[];
  skippedOptionalSteps: number[];
  startedBy?: string;
  startedAt?: any;
  lastUpdatedBy?: string;
  lastUpdatedAt?: any;
  completedBy?: string;
  completedAt?: any;
  configurationVersion?: string;
  dismissedAt?: any;
  reopenedAt?: any;
}

export interface ReadinessCheckResult {
  blockers: {
    noActiveDestination: boolean;
    decisionSettingsIncomplete: boolean;
    noProducts: boolean;
    siteInactive: boolean;
  };
  recommendations: {
    noDisplayAccount: boolean;
    noWarehouseOperator: boolean;
    noPromotions: boolean;
    noMppsImports: boolean;
    noPlanningRules: boolean;
  };
  counts: {
    productionLines: number;
    destinations: number;
    actionTypes: number;
    priorityLevels: number;
    products: number;
    planningRules: number;
    promotions: number;
    mppsImports: number;
  };
}

export const getSiteOnboarding = async (tenantId: string, siteId: string): Promise<SiteOnboarding | null> => {
  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') return null;
  try {
    const { data, error } = await supabase
      .from('site_onboarding')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching site onboarding:', error);
      return null;
    }
    if (!data) return null;
    return toCamelCase<SiteOnboarding>(data);
  } catch (err) {
    console.error('Error fetching site onboarding:', err);
    return null;
  }
};

export const initializeSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<SiteOnboarding> => {
  const data: SiteOnboarding = {
    tenantId,
    siteId,
    status: 'NOT_STARTED',
    currentStep: 0,
    completedSteps: [],
    skippedOptionalSteps: [],
    startedBy: userId,
    startedAt: new Date().toISOString() as any,
    lastUpdatedBy: userId,
    lastUpdatedAt: new Date().toISOString() as any
  };

  const { error } = await supabase
    .from('site_onboarding')
    .insert(toSnakeCase(data));

  if (error) {
    console.error('Failed to initialize onboarding record:', error);
    throw error;
  }
  return data;
};

export const updateSiteOnboardingStep = async (
  tenantId: string,
  siteId: string,
  currentStep: number,
  completedSteps: number[],
  skippedOptionalSteps: number[],
  userId: string,
  status: SiteOnboarding['status'] = 'IN_PROGRESS'
): Promise<void> => {
  const payload = {
    current_step: currentStep,
    completed_steps: completedSteps,
    skipped_optional_steps: skippedOptionalSteps,
    status,
    last_updated_by: userId,
    last_updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('site_onboarding')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);

  if (error) throw error;
};

export const dismissOnboardingModal = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  const { error } = await supabase
    .from('site_onboarding')
    .update({
      dismissed_at: new Date().toISOString(),
      last_updated_by: userId,
      last_updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);

  if (error) throw error;
};

export const completeSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  // 1. Update siteOnboarding record to COMPLETED
  const { error: onboardingErr } = await supabase
    .from('site_onboarding')
    .update({
      status: 'COMPLETED',
      completed_by: userId,
      completed_at: new Date().toISOString(),
      last_updated_by: userId,
      last_updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);

  if (onboardingErr) throw onboardingErr;

  // 2. Mark the site document itself as operationally ready / onboardingComplete
  const { error: siteErr } = await supabase
    .from('sites')
    .update({
      onboarding_complete: true,
      operational_status: 'READY'
    })
    .eq('id', siteId);

  if (siteErr) {
    console.warn('Failed to update sites onboarding status:', siteErr.message);
  }

  // 3. Log Audit Event
  await createAuditLog({
    tenantId,
    siteId,
    eventType: 'ONBOARDING_COMPLETED',
    entityType: 'SiteOnboarding',
    entityId: `${tenantId}_${siteId}`,
    summary: `Guided site onboarding completed for site ${siteId}`,
    previousValue: { status: 'IN_PROGRESS' },
    newValue: { status: 'COMPLETED' },
    performedBy: userId,
    timestamp: new Date()
  });
};

export const reopenSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  // 1. Update onboarding status
  const { error: onboardingErr } = await supabase
    .from('site_onboarding')
    .update({
      status: 'IN_PROGRESS',
      reopened_at: new Date().toISOString(),
      last_updated_by: userId,
      last_updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);

  if (onboardingErr) throw onboardingErr;

  // 2. Reopen the site document onboardingComplete
  const { error: siteErr } = await supabase
    .from('sites')
    .update({
      onboarding_complete: false,
      operational_status: 'ONBOARDING'
    })
    .eq('id', siteId);

  if (siteErr) {
    console.warn('Failed to update sites onboarding status:', siteErr.message);
  }

  // 3. Log Audit Event
  await createAuditLog({
    tenantId,
    siteId,
    eventType: 'ONBOARDING_REOPENED',
    entityType: 'SiteOnboarding',
    entityId: `${tenantId}_${siteId}`,
    summary: `Onboarding reopened for site ${siteId}`,
    previousValue: { status: 'COMPLETED' },
    newValue: { status: 'IN_PROGRESS' },
    performedBy: userId,
    timestamp: new Date()
  });
};

export const resetSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  // 1. Reset siteOnboarding progress
  const data: SiteOnboarding = {
    tenantId,
    siteId,
    status: 'NOT_STARTED',
    currentStep: 0,
    completedSteps: [],
    skippedOptionalSteps: [],
    startedBy: userId,
    startedAt: new Date().toISOString() as any,
    lastUpdatedBy: userId,
    lastUpdatedAt: new Date().toISOString() as any
  };

  const { error: onboardingErr } = await supabase
    .from('site_onboarding')
    .upsert(toSnakeCase(data), { onConflict: 'tenant_id,site_id' });

  if (onboardingErr) throw onboardingErr;

  // 2. Reopen site document
  const { error: siteErr } = await supabase
    .from('sites')
    .update({
      onboarding_complete: false,
      operational_status: 'ONBOARDING'
    })
    .eq('id', siteId);

  if (siteErr) {
    console.warn('Failed to update sites onboarding status:', siteErr.message);
  }

  // 3. Log Audit Event
  await createAuditLog({
    tenantId,
    siteId,
    eventType: 'ONBOARDING_RESET',
    entityType: 'SiteOnboarding',
    entityId: `${tenantId}_${siteId}`,
    summary: `Onboarding progress completely reset for site ${siteId}`,
    previousValue: null,
    newValue: { status: 'NOT_STARTED' },
    performedBy: userId,
    timestamp: new Date()
  });
};

export const runSiteReadinessChecks = async (
  tenantId: string,
  siteId: string
): Promise<ReadinessCheckResult> => {
  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') {
    return {
      blockers: {
        noActiveDestination: false,
        decisionSettingsIncomplete: false,
        noProducts: false,
        siteInactive: false
      },
      recommendations: {
        noDisplayAccount: false,
        noWarehouseOperator: false,
        noPromotions: false,
        noMppsImports: false,
        noPlanningRules: false
      },
      counts: {
        productionLines: 0,
        destinations: 0,
        actionTypes: 0,
        priorityLevels: 0,
        products: 0,
        planningRules: 0,
        promotions: 0,
        mppsImports: 0
      }
    };
  }

  // 1. Production lines count
  const { count: productionLinesCount } = await supabase
    .from('production_lines')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId)
    .eq('status', 'active');

  // 2. Destinations count
  const { data: dests } = await supabase
    .from('destinations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  const destinationsCount = (dests || []).filter((d: any) => !d.site_id || d.site_id === siteId).length;

  // 3. Action types count
  const { count: actionTypesCount } = await supabase
    .from('action_types')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // 4. Priority levels count
  const { count: priorityLevelsCount } = await supabase
    .from('priority_levels')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // 5. Decision Settings check
  let decisionSettingsIncomplete = true;
  const { data: decisionDoc } = await supabase
    .from('decision_configurations')
    .select('*')
    .eq('id', `${tenantId}_${siteId}`)
    .maybeSingle();

  if (decisionDoc) {
    const data = toCamelCase<any>(decisionDoc);
    if (
      data.holdActionId &&
      data.reviewActionId &&
      data.releaseActionId &&
      data.urgentPriorityId &&
      data.normalPriorityId &&
      data.lowPriorityId
    ) {
      decisionSettingsIncomplete = false;
    }
  }

  // 6. Products count
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');
  const productsCount = (products || []).filter((p: any) => !p.site_id || p.site_id === siteId).length;

  // 7. Planning Rules count
  const { count: planningRulesCount } = await supabase
    .from('planning_rules')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);

  // 8. Site Inactive check
  let siteInactive = true;
  const { data: siteDoc } = await supabase
    .from('sites')
    .select('*')
    .eq('id', siteId)
    .maybeSingle();

  if (siteDoc) {
    const isActive = siteDoc.active === true || siteDoc.status === 'ACTIVE' || siteDoc.status === 'active' || siteDoc.status == null;
    if (isActive) {
      siteInactive = false;
    }
  }

  // Recommendations: Display account check
  const { count: displayUsersCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'DISPLAY');
  const noDisplayAccount = (displayUsersCount || 0) === 0;

  // Recommendations: Warehouse Operator check
  const { count: whUsersCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'WAREHOUSE_OPERATOR');
  const noWarehouseOperator = (whUsersCount || 0) === 0;

  // Recommendations: Promotions count
  const { count: promotionsCount } = await supabase
    .from('promotions')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);
  const noPromotions = (promotionsCount || 0) === 0;

  // Recommendations: MPPS imports count
  const { count: mppsImportsCount } = await supabase
    .from('production_plan_imports')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId);
  const noMppsImports = (mppsImportsCount || 0) === 0;

  return {
    blockers: {
      noActiveDestination: destinationsCount === 0,
      decisionSettingsIncomplete,
      noProducts: productsCount === 0,
      siteInactive
    },
    recommendations: {
      noDisplayAccount,
      noWarehouseOperator,
      noPromotions,
      noMppsImports,
      noPlanningRules: (planningRulesCount || 0) === 0
    },
    counts: {
      productionLines: productionLinesCount || 0,
      destinations: destinationsCount,
      actionTypes: actionTypesCount || 0,
      priorityLevels: priorityLevelsCount || 0,
      products: productsCount,
      planningRules: planningRulesCount || 0,
      promotions: promotionsCount || 0,
      mppsImports: mppsImportsCount || 0
    }
  };
};
