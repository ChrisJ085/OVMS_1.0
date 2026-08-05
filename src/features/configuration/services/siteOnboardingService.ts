import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { createAuditLog } from '../../administration/services/settingsService';

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

const COLLECTION = 'siteOnboarding';

export const getSiteOnboarding = async (tenantId: string, siteId: string): Promise<SiteOnboarding | null> => {
  if (!tenantId || !siteId) return null;
  try {
    const docRef = doc(db, COLLECTION, `${tenantId}_${siteId}`);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as SiteOnboarding;
    }
    return null;
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
  const docId = `${tenantId}_${siteId}`;
  const docRef = doc(db, COLLECTION, docId);
  const data: SiteOnboarding = {
    tenantId,
    siteId,
    status: 'NOT_STARTED',
    currentStep: 0,
    completedSteps: [],
    skippedOptionalSteps: [],
    startedBy: userId,
    startedAt: new Date(),
    lastUpdatedBy: userId,
    lastUpdatedAt: new Date()
  };
  await setDoc(docRef, data);
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
  const docId = `${tenantId}_${siteId}`;
  const docRef = doc(db, COLLECTION, docId);
  await updateDoc(docRef, {
    currentStep,
    completedSteps,
    skippedOptionalSteps,
    status,
    lastUpdatedBy: userId,
    lastUpdatedAt: serverTimestamp()
  });
};

export const dismissOnboardingModal = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  const docId = `${tenantId}_${siteId}`;
  const docRef = doc(db, COLLECTION, docId);
  await updateDoc(docRef, {
    dismissedAt: serverTimestamp(),
    lastUpdatedBy: userId,
    lastUpdatedAt: serverTimestamp()
  });
};

export const completeSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  const docId = `${tenantId}_${siteId}`;
  
  // 1. Update siteOnboarding record to COMPLETED
  const onboardingRef = doc(db, COLLECTION, docId);
  await updateDoc(onboardingRef, {
    status: 'COMPLETED',
    completedBy: userId,
    completedAt: serverTimestamp(),
    lastUpdatedBy: userId,
    lastUpdatedAt: serverTimestamp()
  });

  // 2. Mark the site document itself as operationally ready / onboardingComplete
  const siteRef = doc(db, 'sites', siteId);
  await updateDoc(siteRef, {
    onboardingComplete: true,
    operationalStatus: 'READY'
  });

  // 3. Log Audit Event
  await createAuditLog({
    tenantId,
    siteId,
    eventType: 'ONBOARDING_COMPLETED',
    entityType: 'SiteOnboarding',
    entityId: docId,
    summary: `Guided site onboarding completed for site ${siteId}`,
    previousValue: { status: 'IN_PROGRESS' },
    newValue: { status: 'COMPLETED' },
    performedBy: userId,
    timestamp: serverTimestamp()
  });
};

export const reopenSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  const docId = `${tenantId}_${siteId}`;

  // 1. Update onboarding status
  const onboardingRef = doc(db, COLLECTION, docId);
  await updateDoc(onboardingRef, {
    status: 'IN_PROGRESS',
    reopenedAt: serverTimestamp(),
    lastUpdatedBy: userId,
    lastUpdatedAt: serverTimestamp()
  });

  // 2. Reopen the site document onboardingComplete
  const siteRef = doc(db, 'sites', siteId);
  await updateDoc(siteRef, {
    onboardingComplete: false,
    operationalStatus: 'ONBOARDING'
  });

  // 3. Log Audit Event
  await createAuditLog({
    tenantId,
    siteId,
    eventType: 'ONBOARDING_REOPENED',
    entityType: 'SiteOnboarding',
    entityId: docId,
    summary: `Onboarding reopened for site ${siteId}`,
    previousValue: { status: 'COMPLETED' },
    newValue: { status: 'IN_PROGRESS' },
    performedBy: userId,
    timestamp: serverTimestamp()
  });
};

export const resetSiteOnboarding = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<void> => {
  const docId = `${tenantId}_${siteId}`;

  // 1. Reset siteOnboarding progress
  const onboardingRef = doc(db, COLLECTION, docId);
  await setDoc(onboardingRef, {
    tenantId,
    siteId,
    status: 'NOT_STARTED',
    currentStep: 0,
    completedSteps: [],
    skippedOptionalSteps: [],
    startedBy: userId,
    startedAt: serverTimestamp(),
    lastUpdatedBy: userId,
    lastUpdatedAt: serverTimestamp()
  });

  // 2. Reopen site document
  const siteRef = doc(db, 'sites', siteId);
  await updateDoc(siteRef, {
    onboardingComplete: false,
    operationalStatus: 'ONBOARDING'
  });

  // 3. Log Audit Event
  await createAuditLog({
    tenantId,
    siteId,
    eventType: 'ONBOARDING_RESET',
    entityType: 'SiteOnboarding',
    entityId: docId,
    summary: `Onboarding progress completely reset for site ${siteId}`,
    previousValue: null,
    newValue: { status: 'NOT_STARTED' },
    performedBy: userId,
    timestamp: serverTimestamp()
  });
};

export const runSiteReadinessChecks = async (
  tenantId: string,
  siteId: string
): Promise<ReadinessCheckResult> => {
  // Production lines count
  const linesSnap = await getDocs(
    query(collection(db, 'productionLines'), where('tenantId', '==', tenantId), where('siteId', '==', siteId), where('status', '==', 'active'))
  );
  const productionLinesCount = linesSnap.size;

  // Destinations count
  const destsSnap = await getDocs(
    query(collection(db, 'destinations'), where('tenantId', '==', tenantId))
  );
  // Filter active and (siteId === siteId or siteId === '')
  const activeDests = destsSnap.docs.filter(d => {
    const data = d.data();
    return data.status === 'active' && (!data.siteId || data.siteId === siteId);
  });
  const destinationsCount = activeDests.length;

  // Action types count
  const actionsSnap = await getDocs(
    query(collection(db, 'actionTypes'), where('tenantId', '==', tenantId))
  );
  const actionTypesCount = actionsSnap.docs.filter(d => d.data().status === 'active').length;

  // Priority levels count
  const prioritiesSnap = await getDocs(
    query(collection(db, 'priorityLevels'), where('tenantId', '==', tenantId))
  );
  const priorityLevelsCount = prioritiesSnap.docs.filter(d => d.data().status === 'active').length;

  // Decision Settings check
  let decisionSettingsIncomplete = true;
  const decisionDoc = await getDoc(doc(db, 'decisionConfigurations', `${tenantId}_${siteId}`));
  if (decisionDoc.exists()) {
    const data = decisionDoc.data();
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

  // Products count
  const productsSnap = await getDocs(
    query(collection(db, 'products'), where('tenantId', '==', tenantId))
  );
  // Filter for matching siteId or global
  const activeProducts = productsSnap.docs.filter(d => {
    const data = d.data();
    return !data.siteId || data.siteId === siteId;
  });
  const productsCount = activeProducts.length;

  // Planning Rules count
  const rulesSnap = await getDocs(
    query(collection(db, 'planningRules'), where('tenantId', '==', tenantId), where('siteId', '==', siteId))
  );
  const planningRulesCount = rulesSnap.size;

  // Site Inactive check
  let siteInactive = true;
  const siteDoc = await getDoc(doc(db, 'sites', siteId));
  if (siteDoc.exists()) {
    const data = siteDoc.data();
    const isActive = data.active === true || data.status === 'ACTIVE' || data.status === 'active' || data.status == null;
    if (isActive) {
      siteInactive = false;
    }
  }

  // Recommendations: Display account check
  let noDisplayAccount = true;
  const displayUsersSnap = await getDocs(
    query(collection(db, 'users'), where('tenantId', '==', tenantId), where('role', '==', 'DISPLAY'))
  );
  if (displayUsersSnap.size > 0) {
    noDisplayAccount = false;
  }

  // Recommendations: Warehouse Operator check
  let noWarehouseOperator = true;
  const whUsersSnap = await getDocs(
    query(collection(db, 'users'), where('tenantId', '==', tenantId), where('role', '==', 'WAREHOUSE_OPERATOR'))
  );
  if (whUsersSnap.size > 0) {
    noWarehouseOperator = false;
  }

  // Recommendations: Promotions count
  const promoSnap = await getDocs(
    query(collection(db, 'promotions'), where('tenantId', '==', tenantId), where('siteId', '==', siteId))
  );
  const promotionsCount = promoSnap.size;
  const noPromotions = promotionsCount === 0;

  // Recommendations: MPPS imports count
  const importsSnap = await getDocs(
    query(collection(db, 'productionPlanImports'), where('tenantId', '==', tenantId), where('siteId', '==', siteId))
  );
  const mppsImportsCount = importsSnap.size;
  const noMppsImports = mppsImportsCount === 0;

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
      noPlanningRules: planningRulesCount === 0
    },
    counts: {
      productionLines: productionLinesCount,
      destinations: destinationsCount,
      actionTypes: actionTypesCount,
      priorityLevels: priorityLevelsCount,
      products: productsCount,
      planningRules: planningRulesCount,
      promotions: promotionsCount,
      mppsImports: mppsImportsCount
    }
  };
};
