import { DecisionConfiguration } from '../../../types/decision';
import { getDocument, getDocuments, createDocument, setDocument } from '../../../services/dbService';

export const saveDecisionConfiguration = async (
  tenantId: string,
  siteId: string,
  configData: Partial<DecisionConfiguration>
): Promise<{ success: boolean; error?: string }> => {
  if (!tenantId || !siteId) return { success: false, error: 'Tenant ID and Site ID required' };
  try {
    await setDocument('decisionConfigurations', `${tenantId}_${siteId}`, {
      ...configData,
      tenantId,
      siteId,
      updatedAt: new Date().toISOString()
    });
    return { success: true };
  } catch (err: any) {
    console.error('Error saving decision configuration:', err);
    return { success: false, error: err?.message || 'Failed to save configuration' };
  }
};

export const ensureDefaultDecisionConfiguration = async (
  tenantId: string,
  siteId: string
): Promise<DecisionConfiguration | null> => {
  if (!tenantId || !siteId) return null;

  try {
    // 1. Fetch actionTypes for tenant
    const actionDocs = await getDocuments<any>('actionTypes', [{ field: 'tenantId', op: '==', value: tenantId }]);

    const getOrAddAction = async (code: string, label: string, colourToken: string, iconKey: string) => {
      let found = actionDocs.find(a => a.code === code || a.id === code || a.label?.toUpperCase() === code);
      if (!found) {
        const newId = await createDocument<any>('actionTypes', {
          tenantId,
          code,
          label,
          meaning: `${label} action`,
          colourToken,
          iconKey,
          status: 'active',
          createdDate: new Date().toISOString()
        });
        found = { id: newId, code, label, status: 'active' };
        actionDocs.push(found);
      }
      return found.id;
    };

    const holdActionId = await getOrAddAction('HOLD', 'Hold', 'hold', 'Clock');
    const reviewActionId = await getOrAddAction('REVIEW', 'Review', 'review', 'Eye');
    const releaseActionId = await getOrAddAction('RELEASE', 'Release', 'release', 'Send');

    // 2. Fetch priorityLevels for tenant
    const priorityDocs = await getDocuments<any>('priorityLevels', [{ field: 'tenantId', op: '==', value: tenantId }]);

    const getOrAddPriority = async (code: string, label: string, level: number) => {
      let found = priorityDocs.find(p => p.code === code || p.id === code || p.label?.toUpperCase() === code);
      if (!found) {
        const newId = await createDocument<any>('priorityLevels', {
          tenantId,
          code,
          label,
          level,
          status: 'active',
          createdDate: new Date().toISOString()
        });
        found = { id: newId, code, label, status: 'active' };
        priorityDocs.push(found);
      }
      return found.id;
    };

    const urgentPriorityId = await getOrAddPriority('URGENT', 'Urgent', 1);
    const normalPriorityId = await getOrAddPriority('NORMAL', 'Normal', 2);
    const lowPriorityId = await getOrAddPriority('LOW', 'Low', 3);

    // 3. Save default configuration
    const defaultConfig: Partial<DecisionConfiguration> = {
      configurationVersion: 'v1.0.0',
      holdActionId,
      reviewActionId,
      releaseActionId,
      urgentPriorityId,
      normalPriorityId,
      lowPriorityId,
      defaultDestinationRules: {
        defaultDestinationId: null,
        allowFallbackDestination: true
      },
      inventoryStalenessHoursThreshold: 24,
      productionStalenessHoursThreshold: 24,
      nearProductionDaysWindow: 7,
      capacityWarningThresholdPercentage: 100
    };

    await saveDecisionConfiguration(tenantId, siteId, defaultConfig);
    return getDecisionConfiguration(tenantId, siteId, false);
  } catch (err) {
    console.error('Error ensuring default decision configuration:', err);
    return null;
  }
};

/**
 * Loads the site-specific DecisionConfiguration from Firestore and validates
 * that all referenced actions, priorities, and destinations exist, belong to
 * the active tenant/site, are active, and are the expected type.
 * 
 * If the configuration is missing, incomplete, or contains invalid references,
 * attempts auto-initialization once if allowAutoInit is true.
 */
export const getDecisionConfiguration = async (
  tenantId: string,
  siteId: string,
  allowAutoInit = false
): Promise<DecisionConfiguration | null> => {
  if (!tenantId || !siteId) return null;

  try {
    const configData = await getDocument<any>('decisionConfigurations', `${tenantId}_${siteId}`);
    if (!configData) {
      if (allowAutoInit) {
        return await ensureDefaultDecisionConfiguration(tenantId, siteId);
      }
      return null;
    }

    // Fetch all actionTypes, priorityLevels, and destinations for this tenant
    const actionTypes = await getDocuments<any>('actionTypes', [{ field: 'tenantId', op: '==', value: tenantId }]);
    const priorityLevels = await getDocuments<any>('priorityLevels', [{ field: 'tenantId', op: '==', value: tenantId }]);
    const destinations = await getDocuments<any>('destinations', [{ field: 'tenantId', op: '==', value: tenantId }]);

    const activeActionTypes = actionTypes
      .filter(d => d.status === 'active')
      .flatMap(d => [d.id, d.code].filter(Boolean));
    const inactiveActionTypes = actionTypes
      .filter(d => d.status === 'inactive')
      .flatMap(d => [d.id, d.code].filter(Boolean));

    const activePriorityLevels = priorityLevels
      .filter(d => d.status === 'active')
      .flatMap(d => [d.id, d.code].filter(Boolean));
    const inactivePriorityLevels = priorityLevels
      .filter(d => d.status === 'inactive')
      .flatMap(d => [d.id, d.code].filter(Boolean));

    const activeDestinations = destinations
      .filter(d => {
        const matchesStatus = d.status === 'active';
        const matchesSite = !d.siteId || d.siteId === siteId;
        return matchesStatus && matchesSite;
      })
      .flatMap(d => [d.id, d.destinationCode, d.code].filter(Boolean));
    const inactiveDestinations = destinations
      .filter(d => {
        const matchesStatus = d.status === 'inactive';
        const matchesSite = !d.siteId || d.siteId === siteId;
        return matchesStatus || !matchesSite;
      })
      .flatMap(d => [d.id, d.destinationCode, d.code].filter(Boolean));

    // Validate required referenced records exist and are active
    const requiredActionIds = [
      configData.holdActionId,
      configData.reviewActionId,
      configData.releaseActionId
    ];
    let hasMissingAction = false;
    for (const actionId of requiredActionIds) {
      if (!actionId || !activeActionTypes.includes(actionId)) {
        hasMissingAction = true;
        break;
      }
    }

    const requiredPriorityIds = [
      configData.urgentPriorityId,
      configData.normalPriorityId,
      configData.lowPriorityId
    ];
    let hasMissingPriority = false;
    for (const priorityId of requiredPriorityIds) {
      if (!priorityId || !activePriorityLevels.includes(priorityId)) {
        hasMissingPriority = true;
        break;
      }
    }

    if ((hasMissingAction || hasMissingPriority) && allowAutoInit) {
      // Attempt auto-repair/initialization
      return await ensureDefaultDecisionConfiguration(tenantId, siteId);
    } else if (hasMissingAction || hasMissingPriority) {
      return null;
    }

    // Default destination is optional, but if specified, must be active
    const defaultDestId = configData.defaultDestinationRules?.defaultDestinationId;
    if (defaultDestId && !activeDestinations.includes(defaultDestId)) {
      console.warn(`Decision configuration invalid: default destination reference "${defaultDestId}" is missing or inactive.`);
      return null;
    }

    const config: DecisionConfiguration = {
      configurationVersion: configData.configurationVersion || 'v1.0.0',
      holdActionId: configData.holdActionId || null,
      reviewActionId: configData.reviewActionId || null,
      releaseActionId: configData.releaseActionId || null,
      asPerScheduleActionId: configData.asPerScheduleActionId || null,
      urgentPriorityId: configData.urgentPriorityId || null,
      normalPriorityId: configData.normalPriorityId || null,
      lowPriorityId: configData.lowPriorityId || null,
      defaultDestinationRules: {
        defaultDestinationId: configData.defaultDestinationRules?.defaultDestinationId || null,
        allowFallbackDestination: configData.defaultDestinationRules?.allowFallbackDestination !== false
      },
      inventoryStalenessHoursThreshold: configData.inventoryStalenessHoursThreshold ?? 24,
      productionStalenessHoursThreshold: configData.productionStalenessHoursThreshold ?? 24,
      nearProductionDaysWindow: configData.nearProductionDaysWindow ?? 7,
      capacityWarningThresholdPercentage: configData.capacityWarningThresholdPercentage ?? 100,
      
      validActionIds: activeActionTypes,
      validPriorityIds: activePriorityLevels,
      validDestinationIds: activeDestinations,
      inactiveActionIds: inactiveActionTypes,
      inactivePriorityIds: inactivePriorityLevels,
      inactiveDestinationIds: inactiveDestinations
    };

    return config;
  } catch (error) {
    console.error('Error in getDecisionConfiguration:', error);
    return null;
  }
};

export const incrementVersion = (currentVersion?: string): string => {
  if (!currentVersion) return 'v1.0.0';
  const match = currentVersion.match(/^v(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (match) {
    const major = parseInt(match[1]);
    const minor = parseInt(match[2]);
    const patch = parseInt(match[3]);
    const suffix = match[4] || '';
    return `v${major}.${minor}.${patch + 1}${suffix}`;
  }
  const fallbackMatch = currentVersion.match(/(\d+)/);
  if (fallbackMatch) {
    const num = parseInt(fallbackMatch[1]);
    return currentVersion.replace(String(num), String(num + 1));
  }
  return 'v1.0.0';
};

export interface AutoConfigureResult {
  configuration: DecisionConfiguration;
  recordsCreated: string[];
  recordsReused: string[];
  version: string;
}

export const autoConfigureDecisionSettings = async (
  tenantId: string,
  siteId: string,
  options?: {
    overwriteExisting?: boolean;
  }
): Promise<AutoConfigureResult | null> => {
  if (!tenantId || !siteId) return null;

  try {
    const recordsCreated: string[] = [];
    const recordsReused: string[] = [];

    // 1. Fetch actionTypes
    const actionDocs = await getDocuments<any>('actionTypes', [{ field: 'tenantId', op: '==', value: tenantId }]);

    const getOrAddAction = async (code: string, label: string, colourToken: string, iconKey: string) => {
      let found = actionDocs.find(a => a.code === code || a.id === code || a.label?.toUpperCase() === code);
      if (!found) {
        const newId = await createDocument<any>('actionTypes', {
          tenantId,
          code,
          label,
          meaning: `${label} action`,
          colourToken,
          iconKey,
          status: 'active',
          createdDate: new Date().toISOString()
        });
        found = { id: newId, code, label, status: 'active' };
        actionDocs.push(found);
        recordsCreated.push(`Action Type: ${label} (${code})`);
      } else {
        recordsReused.push(`Action Type: ${found.label || found.code} (${found.code})`);
      }
      return found.id;
    };

    const holdActionId = await getOrAddAction('HOLD', 'Hold', 'hold', 'Clock');
    const reviewActionId = await getOrAddAction('REVIEW', 'Review', 'review', 'Eye');
    const releaseActionId = await getOrAddAction('RELEASE', 'Release', 'release', 'Send');

    // 2. Fetch priorityLevels
    const priorityDocs = await getDocuments<any>('priorityLevels', [{ field: 'tenantId', op: '==', value: tenantId }]);

    const getOrAddPriority = async (code: string, label: string, level: number) => {
      let found = priorityDocs.find(p => p.code === code || p.id === code || p.label?.toUpperCase() === code);
      if (!found) {
        const newId = await createDocument<any>('priorityLevels', {
          tenantId,
          code,
          label,
          level,
          status: 'active',
          createdDate: new Date().toISOString()
        });
        found = { id: newId, code, label, status: 'active' };
        priorityDocs.push(found);
        recordsCreated.push(`Priority Level: ${label} (${code})`);
      } else {
        recordsReused.push(`Priority Level: ${found.label || found.code} (${found.code})`);
      }
      return found.id;
    };

    const urgentPriorityId = await getOrAddPriority('URGENT', 'Urgent', 1);
    const normalPriorityId = await getOrAddPriority('NORMAL', 'Normal', 2);
    const lowPriorityId = await getOrAddPriority('LOW', 'Low', 3);

    // 3. Fetch destinations
    const destDocs = await getDocuments<any>('destinations', [{ field: 'tenantId', op: '==', value: tenantId }]);
    let defaultDestinationId: string | null = null;

    if (destDocs.length > 0) {
      const activeDest = destDocs.find(d => d.status === 'active');
      if (activeDest) {
        defaultDestinationId = activeDest.id;
        recordsReused.push(`Destination: ${activeDest.destinationName || activeDest.destinationCode}`);
      }
    }

    if (!defaultDestinationId) {
      const destId = await createDocument<any>('destinations', {
        tenantId,
        destinationCode: 'CH',
        destinationName: 'Chester Hub',
        status: 'active',
        createdDate: new Date().toISOString()
      });
      defaultDestinationId = destId;
      recordsCreated.push(`Destination: Chester Hub (CH)`);
    }

    // 4. Load existing configuration
    const existingConfigData = await getDocument<any>('decisionConfigurations', `${tenantId}_${siteId}`);

    let finalHoldActionId = holdActionId;
    let finalReviewActionId = reviewActionId;
    let finalReleaseActionId = releaseActionId;
    let finalUrgentPriorityId = urgentPriorityId;
    let finalNormalPriorityId = normalPriorityId;
    let finalLowPriorityId = lowPriorityId;
    let finalDefaultDestinationId = defaultDestinationId;
    let finalVersion = 'v1.0.0';

    if (existingConfigData) {
      if (options?.overwriteExisting) {
        finalVersion = incrementVersion(existingConfigData.configurationVersion || 'v1.0.0');
      } else {
        finalHoldActionId = existingConfigData.holdActionId || holdActionId;
        finalReviewActionId = existingConfigData.reviewActionId || reviewActionId;
        finalReleaseActionId = existingConfigData.releaseActionId || releaseActionId;
        finalUrgentPriorityId = existingConfigData.urgentPriorityId || urgentPriorityId;
        finalNormalPriorityId = existingConfigData.normalPriorityId || normalPriorityId;
        finalLowPriorityId = existingConfigData.lowPriorityId || lowPriorityId;
        finalDefaultDestinationId = existingConfigData.defaultDestinationRules?.defaultDestinationId || defaultDestinationId;
        finalVersion = existingConfigData.configurationVersion || 'v1.0.0';
      }
    }

    const newConfig: Partial<DecisionConfiguration> = {
      configurationVersion: finalVersion,
      holdActionId: finalHoldActionId,
      reviewActionId: finalReviewActionId,
      releaseActionId: finalReleaseActionId,
      urgentPriorityId: finalUrgentPriorityId,
      normalPriorityId: finalNormalPriorityId,
      lowPriorityId: finalLowPriorityId,
      defaultDestinationRules: {
        defaultDestinationId: finalDefaultDestinationId,
        allowFallbackDestination: existingConfigData?.defaultDestinationRules?.allowFallbackDestination !== false
      },
      inventoryStalenessHoursThreshold: existingConfigData?.inventoryStalenessHoursThreshold ?? 24,
      productionStalenessHoursThreshold: existingConfigData?.productionStalenessHoursThreshold ?? 24,
      nearProductionDaysWindow: existingConfigData?.nearProductionDaysWindow ?? 7,
      capacityWarningThresholdPercentage: existingConfigData?.capacityWarningThresholdPercentage ?? 100
    };

    await saveDecisionConfiguration(tenantId, siteId, newConfig);

    const fullConfig = await getDecisionConfiguration(tenantId, siteId, false);
    if (!fullConfig) {
      throw new Error("Failed to load configured settings after save.");
    }

    return {
      configuration: fullConfig,
      recordsCreated,
      recordsReused,
      version: finalVersion
    };
  } catch (err) {
    console.error('Error in autoConfigureDecisionSettings:', err);
    return null;
  }
};
