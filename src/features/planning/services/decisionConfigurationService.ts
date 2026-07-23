import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { DecisionConfiguration } from '../../../types/decision';

/**
 * Loads the site-specific DecisionConfiguration from Firestore and validates
 * that all referenced actions, priorities, and destinations exist, belong to
 * the active tenant/site, are active, and are the expected type.
 * 
 * If the configuration is missing, incomplete, or contains invalid references,
 * returns null (which will trigger CONFIGURATION_MISSING in the engine).
 */
export const getDecisionConfiguration = async (
  tenantId: string,
  siteId: string
): Promise<DecisionConfiguration | null> => {
  if (!tenantId || !siteId) return null;

  try {
    const configDocRef = doc(db, 'decisionConfigurations', `${tenantId}_${siteId}`);
    const configSnap = await getDoc(configDocRef);
    if (!configSnap.exists()) {
      return null;
    }

    const configData = configSnap.data();
    
    // Fetch all actionTypes, priorityLevels, and destinations for this tenant
    const actionTypesSnap = await getDocs(
      query(collection(db, 'actionTypes'), where('tenantId', '==', tenantId))
    );
    const priorityLevelsSnap = await getDocs(
      query(collection(db, 'priorityLevels'), where('tenantId', '==', tenantId))
    );
    const destinationsSnap = await getDocs(
      query(collection(db, 'destinations'), where('tenantId', '==', tenantId))
    );

    const activeActionTypes = actionTypesSnap.docs
      .filter(d => d.data().status === 'active')
      .map(d => d.id);
    const inactiveActionTypes = actionTypesSnap.docs
      .filter(d => d.data().status === 'inactive')
      .map(d => d.id);

    const activePriorityLevels = priorityLevelsSnap.docs
      .filter(d => d.data().status === 'active')
      .map(d => d.id);
    const inactivePriorityLevels = priorityLevelsSnap.docs
      .filter(d => d.data().status === 'inactive')
      .map(d => d.id);

    const activeDestinations = destinationsSnap.docs
      .filter(d => {
        const data = d.data();
        const matchesStatus = data.status === 'active';
        const matchesSite = !data.siteId || data.siteId === siteId;
        return matchesStatus && matchesSite;
      })
      .map(d => d.id);
    const inactiveDestinations = destinationsSnap.docs
      .filter(d => {
        const data = d.data();
        const matchesStatus = data.status === 'inactive';
        const matchesSite = !data.siteId || data.siteId === siteId;
        return matchesStatus || !matchesSite;
      })
      .map(d => d.id);

    // Validate that required referenced records exist and are active
    const requiredActionIds = [
      configData.holdActionId,
      configData.reviewActionId,
      configData.releaseActionId
    ];
    for (const actionId of requiredActionIds) {
      if (!actionId || !activeActionTypes.includes(actionId)) {
        console.warn(`Decision configuration invalid: action reference "${actionId}" is missing or inactive.`);
        return null;
      }
    }

    const requiredPriorityIds = [
      configData.urgentPriorityId,
      configData.normalPriorityId,
      configData.lowPriorityId
    ];
    for (const priorityId of requiredPriorityIds) {
      if (!priorityId || !activePriorityLevels.includes(priorityId)) {
        console.warn(`Decision configuration invalid: priority reference "${priorityId}" is missing or inactive.`);
        return null;
      }
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
      
      // Inject lists of valid/inactive IDs for downstream validation
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
