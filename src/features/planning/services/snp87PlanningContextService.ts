import { 
  Snp87PlanningImport, 
  Snp87PlanningRow, 
  ProductPlanningContext 
} from '../../../types/snp87';
import { ProductProductionContext, ProductionRiskStatus } from '../../../types/production';
import { Product } from '../../../types/product';
import { areProductCodesEqual } from '../../../utils/productCodeNormalizer';
import { getActiveSnp87Snapshot } from './snp87ImportService';

/**
 * Calendar Date Helpers - avoids timezone-dependent date shifts.
 */
export const toCalendarDateString = (dateVal?: Date | string | number | null): string => {
  if (!dateVal) {
    const now = new Date();
    return formatUtcCalendarDate(now);
  }

  if (typeof dateVal === 'string') {
    // If already in YYYY-MM-DD
    const isoMatch = dateVal.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

    // If YYYYMMDD
    const ymdMatch = dateVal.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
    if (ymdMatch) return `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
  }

  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) {
    return formatUtcCalendarDate(new Date());
  }
  return formatUtcCalendarDate(d);
};

const formatUtcCalendarDate = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const addCalendarDays = (calendarDateStr: string, days: number): string => {
  const parts = calendarDateStr.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const nextDate = new Date(Date.UTC(y, m - 1, d + days, 0, 0, 0, 0));
  return formatUtcCalendarDate(nextDate);
};

export interface BuildProductPlanningContextOptions {
  productId: string;
  productCode?: string;
  productDescription?: string;
  activeSnapshot: Snp87PlanningImport | null;
  snapshotRows: Snp87PlanningRow[];
  evaluationDate?: Date | string;
  planningHorizonDays?: number; // Default: 4 days (configurable)
  freshnessThresholdHours?: number; // Default: 168 hours (7 days) for weekly report cycle
  fallbackUom?: string;
}

/**
 * Builds a ProductPlanningContext for a single product from an SNP87 Planning Snapshot.
 * 
 * Rules:
 * - Rolling horizon is evaluated from Day 0 through Day (planningHorizonDays - 1), defaulting to 4 days.
 * - Past-due forecast dates (rowDate < evaluationDate) are ignored entirely.
 * - Confirmed production is future supply and is represented separately.
 * - Does NOT fabricate Resource ID / Production Line information.
 * - Uses the actual UOM from SNP87 rows.
 * - Evaluates source freshness (FRESH, STALE, MISSING).
 */
export const buildProductPlanningContext = ({
  productId,
  productCode,
  productDescription,
  activeSnapshot,
  snapshotRows,
  evaluationDate,
  planningHorizonDays = 4,
  freshnessThresholdHours = 168, // 7 days
  fallbackUom = 'CS'
}: BuildProductPlanningContextOptions): ProductPlanningContext => {
  const effectiveEvalDate = evaluationDate || 
    activeSnapshot?.importPeriod?.startDate || 
    snapshotRows[0]?.horizonDate || 
    snapshotRows[0]?.planningDate || 
    snapshotRows[0]?.startDate;
  const evalDateStr = toCalendarDateString(effectiveEvalDate);
  const horizonDays = planningHorizonDays && planningHorizonDays > 0 ? planningHorizonDays : 4;
  const horizonStartDate = evalDateStr; // Day 0
  const horizonEndDate = addCalendarDays(evalDateStr, horizonDays - 1);
  const sevenDayStartDate = evalDateStr; // Day 0
  const sevenDayEndDate = addCalendarDays(evalDateStr, 6); // Day 6 (total 7 calendar days)

  // Filter snapshot rows for this product
  const productRows = snapshotRows.filter(r => {
    if (r.productId && r.productId === productId) return true;
    if (productCode && (areProductCodesEqual(r.productNumber, productCode) || areProductCodesEqual(r.orderSku, productCode))) {
      return true;
    }
    return false;
  });

  // Partition by Planning Type
  const forecastRows = productRows.filter(r => r.planningType === 'FORECAST');
  const confirmedRows = productRows.filter(r => r.planningType === 'CONFIRMED_PRODUCTION');

  // 1. Forecast Calculations
  let forecastCasesToday = 0;
  let forecastCasesInHorizon = 0;
  let forecastCasesNext7Days = 0;
  let totalForecastCasesInSnapshot = 0;
  let pastDueForecastCasesIgnored = 0;
  const forecastByDate: Record<string, number> = {};

  forecastRows.forEach(row => {
    const rowDate = row.planningDate || toCalendarDateString(row.startDate);
    const qty = row.forecastQuantity ?? row.quantity ?? 0;

    // Filter out past-due forecast dates entirely relative to evaluation date
    if (rowDate < evalDateStr) {
      pastDueForecastCasesIgnored += qty;
      return;
    }

    totalForecastCasesInSnapshot += qty;
    forecastByDate[rowDate] = (forecastByDate[rowDate] || 0) + qty;

    if (rowDate === evalDateStr) {
      forecastCasesToday += qty;
    }

    if (rowDate >= horizonStartDate && rowDate <= horizonEndDate) {
      forecastCasesInHorizon += qty;
    }

    if (rowDate >= sevenDayStartDate && rowDate <= sevenDayEndDate) {
      forecastCasesNext7Days += qty;
    }
  });

  // 2. Confirmed Production Calculations
  let confirmedProductionCasesToday = 0;
  let confirmedProductionCasesInHorizon = 0;
  let confirmedProductionCasesNext7Days = 0;
  let totalConfirmedInSnapshot = 0;
  let pastDueProductionCasesIgnored = 0;
  const confirmedProductionByDate: Record<string, number> = {};

  confirmedRows.forEach(row => {
    const rowDate = row.planningDate || toCalendarDateString(row.startDate);
    const qty = row.confirmedProductionQuantity ?? row.quantity ?? 0;

    if (rowDate < evalDateStr) {
      pastDueProductionCasesIgnored += qty;
      return;
    }

    totalConfirmedInSnapshot += qty;
    confirmedProductionByDate[rowDate] = (confirmedProductionByDate[rowDate] || 0) + qty;

    if (rowDate === evalDateStr) {
      confirmedProductionCasesToday += qty;
    }

    if (rowDate >= horizonStartDate && rowDate <= horizonEndDate) {
      confirmedProductionCasesInHorizon += qty;
    }

    if (rowDate >= sevenDayStartDate && rowDate <= sevenDayEndDate) {
      confirmedProductionCasesNext7Days += qty;
    }
  });

  // 3. Base UOM preservation
  const resolvedUom = productRows[0]?.baseUnitOfMeasure || fallbackUom;

  // 4. Source Quality and Freshness
  let dataFreshnessStatus: 'FRESH' | 'STALE' | 'MISSING' = 'MISSING';
  let sourceStatus: 'CURRENT' | 'STALE' | 'SUPERSEDED' | 'MISSING' = 'MISSING';
  let sourceImportId: string | null = null;
  let sourceReportName: string | null = null;
  let sourceUpdatedAt: Date | null = null;
  let hasMissingPlanningData = false;

  if (!activeSnapshot || activeSnapshot.importStatus === 'FAILED' || activeSnapshot.importStatus === 'DRAFT') {
    dataFreshnessStatus = 'MISSING';
    sourceStatus = 'MISSING';
    hasMissingPlanningData = true;
  } else {
    sourceImportId = activeSnapshot.id;
    sourceReportName = activeSnapshot.sourceReportName;
    sourceUpdatedAt = activeSnapshot.importedAt ? new Date(activeSnapshot.importedAt) : null;

    if (activeSnapshot.importStatus === 'SUPERSEDED') {
      dataFreshnessStatus = 'STALE';
      sourceStatus = 'SUPERSEDED';
    } else {
      // Check import age against threshold
      if (sourceUpdatedAt && !isNaN(sourceUpdatedAt.getTime())) {
        const evalDateTimeMs = evaluationDate instanceof Date 
          ? evaluationDate.getTime() 
          : (typeof evaluationDate === 'string' && evaluationDate ? new Date(evaluationDate).getTime() : new Date().getTime());
        const ageHours = (evalDateTimeMs - sourceUpdatedAt.getTime()) / (1000 * 60 * 60);

        if (ageHours > freshnessThresholdHours) {
          dataFreshnessStatus = 'STALE';
          sourceStatus = 'STALE';
        } else {
          dataFreshnessStatus = 'FRESH';
          sourceStatus = 'CURRENT';
        }
      } else {
        dataFreshnessStatus = 'FRESH';
        sourceStatus = 'CURRENT';
      }
    }
  }

  // Round quantities to 3 decimal places to prevent float precision drift
  const roundQty = (val: number) => Math.round(val * 1000) / 1000;

  return {
    productId,
    productCode: productCode || productRows[0]?.productNumber || '',
    productDescription: productDescription || productRows[0]?.productDescription || '',
    baseUnitOfMeasure: resolvedUom,
    forecastCasesToday: roundQty(forecastCasesToday),
    forecastCasesNext7Days: roundQty(forecastCasesNext7Days),
    forecastCasesInHorizon: roundQty(forecastCasesInHorizon),
    pastDueForecastCasesIgnored: roundQty(pastDueForecastCasesIgnored),
    forecastByDate,
    forecastSourceImportId: sourceImportId,
    forecastSourceUpdatedAt: sourceUpdatedAt,
    confirmedProductionCasesToday: roundQty(confirmedProductionCasesToday),
    confirmedProductionCasesNext7Days: roundQty(confirmedProductionCasesNext7Days),
    confirmedProductionCasesInHorizon: roundQty(confirmedProductionCasesInHorizon),
    confirmedProductionByDate,
    productionSourceImportId: sourceImportId,
    productionSourceUpdatedAt: sourceUpdatedAt,
    dataFreshnessStatus,
    sourceStatus,
    sourceImportId,
    sourceReportName,
    hasMissingPlanningData,
    evaluationDate: evalDateStr,
    planningHorizonDays: horizonDays,
    sevenDayWindow: {
      startDate: sevenDayStartDate,
      endDate: sevenDayEndDate
    },
    horizonWindow: {
      startDate: horizonStartDate,
      endDate: horizonEndDate,
      days: horizonDays
    }
  };
};

/**
 * Builds planning contexts for all products in an efficient batch operation.
 */
export const buildAllProductPlanningContexts = (
  products: Product[],
  activeSnapshot: Snp87PlanningImport | null,
  snapshotRows: Snp87PlanningRow[],
  evaluationDate?: Date | string,
  freshnessThresholdHours: number = 168,
  planningHorizonDays: number = 4
): Map<string, ProductPlanningContext> => {
  const result = new Map<string, ProductPlanningContext>();

  for (const product of products) {
    const context = buildProductPlanningContext({
      productId: product.id!,
      productCode: product.productCode,
      productDescription: product.description,
      activeSnapshot,
      snapshotRows,
      evaluationDate,
      freshnessThresholdHours,
      planningHorizonDays,
      fallbackUom: product.unitOfMeasureId || 'CS'
    });
    result.set(product.id!, context);
  }

  return result;
};

/**
 * Backwards compatibility adapter:
 * Translates the clean ProductPlanningContext into the legacy ProductProductionContext
 * without fabricating Resource ID / Production Line data.
 */
export const adaptPlanningContextToLegacyProductionContext = (
  planningContext: ProductPlanningContext,
  product?: Product | null
): ProductProductionContext => {
  const casesPerPallet = product?.casesPerPallet || null;
  const plannedCasesToday = planningContext.confirmedProductionCasesToday || planningContext.forecastCasesToday;
  const plannedPalletsToday = (casesPerPallet && casesPerPallet > 0) ? Math.ceil(plannedCasesToday / casesPerPallet) : 0;

  const plannedCasesNext7Days = planningContext.forecastCasesNext7Days;
  const plannedPalletsNext7Days = (casesPerPallet && casesPerPallet > 0) ? Math.ceil(plannedCasesNext7Days / casesPerPallet) : 0;

  let productionRiskStatus: ProductionRiskStatus = 'NORMAL';
  if (planningContext.dataFreshnessStatus === 'MISSING') {
    productionRiskStatus = 'SOURCE_MISSING';
  } else if (planningContext.dataFreshnessStatus === 'STALE') {
    productionRiskStatus = 'SOURCE_STALE';
  }

  return {
    productId: planningContext.productId,
    isScheduled: planningContext.confirmedProductionCasesNext7Days > 0 || planningContext.forecastCasesNext7Days > 0,
    isCurrentlyInProduction: false,
    currentProductionLine: null, // Deliberately NOT fabricated
    currentProductionDate: null,
    plannedCasesToday,
    plannedPalletsToday,
    plannedCasesNext7Days,
    plannedPalletsNext7Days,
    nextProductionDate: null,
    daysUntilNextProduction: null,
    lastProductionDate: null,
    plannerProductionStatus: null,
    activeProductionNotes: [],
    hasDelay: false,
    hasShutdown: false,
    hasMaintenance: false,
    hasTrial: false,
    sourceImportId: planningContext.sourceImportId,
    sourceUpdatedAt: planningContext.productionSourceUpdatedAt,
    dataFreshnessStatus: planningContext.dataFreshnessStatus,
    productionRiskStatus,
    planningContext
  };
};

export interface Snp87ChronologicalRequirementResult {
  retailDemandRequirement: number;
  chronologicalDeficitByDate: Record<string, number>;
  peakDeficitDate: string | null;
  peakHorizonDeficitDate?: string | null;
  peakSnapshotDeficitDate?: string | null;
  totalHorizonForecast: number;
  totalHorizonConfirmedProduction: number;
  totalSnapshotForecast: number;
  totalSnapshotConfirmedProduction: number;
  total7DayForecast: number;
  total7DayConfirmedProduction: number;
  horizonRetailDemand: number;
  snapshotRetailDemand: number;
  unreplenishedFutureForecastCases: number;
  isFutureForecastProtected: boolean;
  isBalancedWithProduction: boolean;
  productionOffsetQuantity: number;
  planningHorizonDays: number;
}

/**
 * Calculates dynamic retail demand using date-aware chronological evaluation of demand and confirmed/scheduled production.
 *
 * Rules:
 * 1. Rolling Planning Horizon: Evaluates demand from Day 0 through Day (planningHorizonDays - 1), defaulting to 4 days.
 * 2. Chronological Precedence: Demand on Day t cannot be satisfied by future production on Day t+1.
 * 3. Future SNP87 Forecast Protection: Examines forward forecast demand across the entire SNP87 snapshot. If stock is
 *    on forecast later in the snapshot and IS NOT DUE for production (no scheduled production before that date), the net
 *    unreplenished demand is protected and retained so that the warehouse is NEVER recommended to send out stock needed later.
 * 4. Production Balancing: Scheduled production occurring prior to or on the date of forecast demand balances/offsets
 *    the holding requirement, preventing double-holding and avoiding unnecessary warehouse capacity congestion.
 */
export const calculateSnp87ChronologicalRequirement = (
  planningContext: ProductPlanningContext | null | undefined,
  evaluationDate?: Date | string,
  planningHorizonDays: number = 4,
  additionalProductionContext?: ProductProductionContext | null,
  protectUnreplenishedFutureForecast: boolean = true
): Snp87ChronologicalRequirementResult => {
  if (!planningContext) {
    return {
      retailDemandRequirement: 0,
      chronologicalDeficitByDate: {},
      peakDeficitDate: null,
      peakHorizonDeficitDate: null,
      peakSnapshotDeficitDate: null,
      totalHorizonForecast: 0,
      totalHorizonConfirmedProduction: 0,
      totalSnapshotForecast: 0,
      totalSnapshotConfirmedProduction: 0,
      total7DayForecast: 0,
      total7DayConfirmedProduction: 0,
      horizonRetailDemand: 0,
      snapshotRetailDemand: 0,
      unreplenishedFutureForecastCases: 0,
      isFutureForecastProtected: false,
      isBalancedWithProduction: false,
      productionOffsetQuantity: 0,
      planningHorizonDays: 4
    };
  }

  const evalDateStr = toCalendarDateString(evaluationDate || planningContext.evaluationDate || new Date());
  const horizonDays = planningHorizonDays && planningHorizonDays > 0 
    ? planningHorizonDays 
    : (planningContext.planningHorizonDays || 4);
  const horizonEndDate = addCalendarDays(evalDateStr, horizonDays - 1);

  // Collect all unique future dates in chronological order (including rolling horizon and full snapshot dates)
  const uniqueDatesSet = new Set<string>();
  for (let dayOffset = 0; dayOffset < horizonDays; dayOffset++) {
    uniqueDatesSet.add(addCalendarDays(evalDateStr, dayOffset));
  }
  if (planningContext.forecastByDate) {
    for (const d of Object.keys(planningContext.forecastByDate)) {
      if (d >= evalDateStr) uniqueDatesSet.add(d);
    }
  }
  if (planningContext.confirmedProductionByDate) {
    for (const d of Object.keys(planningContext.confirmedProductionByDate)) {
      if (d >= evalDateStr) uniqueDatesSet.add(d);
    }
  }
  if (additionalProductionContext?.nextProductionDate) {
    const nextProdDateStr = toCalendarDateString(additionalProductionContext.nextProductionDate);
    if (nextProdDateStr >= evalDateStr) uniqueDatesSet.add(nextProdDateStr);
  }

  const sortedDates = Array.from(uniqueDatesSet).sort((a, b) => a.localeCompare(b));

  let cumForecast = 0;
  let cumProduction = 0;
  let maxHorizonDeficit = 0;
  let peakHorizonDeficitDate: string | null = null;
  let maxSnapshotDeficit = 0;
  let peakSnapshotDeficitDate: string | null = null;

  let totalHorizonForecast = 0;
  let totalHorizonConfirmedProduction = 0;
  let totalSnapshotForecast = 0;
  let totalSnapshotConfirmedProduction = 0;
  const chronologicalDeficitByDate: Record<string, number> = {};

  for (const dateStr of sortedDates) {
    const dayForecast = planningContext.forecastByDate?.[dateStr] || 0;
    let dayProduction = planningContext.confirmedProductionByDate?.[dateStr] || 0;

    // Check additional scheduled production context if SNP87 row did not provide confirmed production for this date
    if (dayProduction === 0 && additionalProductionContext) {
      if (dateStr === evalDateStr && (additionalProductionContext.plannedCasesToday || 0) > 0) {
        dayProduction += additionalProductionContext.plannedCasesToday;
      }
      if (additionalProductionContext.nextProductionDate) {
        const nextProdDateStr = toCalendarDateString(additionalProductionContext.nextProductionDate);
        if (nextProdDateStr === dateStr) {
          const extraProd = additionalProductionContext.plannedCasesNext7Days || additionalProductionContext.plannedCasesToday || 0;
          if (extraProd > dayProduction) {
            dayProduction = extraProd;
          }
        }
      }
    }

    cumForecast += dayForecast;
    cumProduction += dayProduction;
    totalSnapshotForecast += dayForecast;
    totalSnapshotConfirmedProduction += dayProduction;

    const netDeficit = cumForecast - cumProduction;
    chronologicalDeficitByDate[dateStr] = netDeficit;

    // Track rolling horizon demand (Day 0 .. Day horizonDays-1)
    if (dateStr <= horizonEndDate) {
      totalHorizonForecast += dayForecast;
      totalHorizonConfirmedProduction += dayProduction;
      if (netDeficit > maxHorizonDeficit) {
        maxHorizonDeficit = netDeficit;
        peakHorizonDeficitDate = dateStr;
      }
    }

    // Track across the full snapshot to protect unreplenished future forecast
    if (netDeficit > maxSnapshotDeficit) {
      maxSnapshotDeficit = netDeficit;
      peakSnapshotDeficitDate = dateStr;
    }
  }

  const horizonRetailDemand = Math.max(0, maxHorizonDeficit);
  const snapshotRetailDemand = Math.max(0, maxSnapshotDeficit);

  // Protect full snapshot unreplenished forecast demand when future protection is enabled
  const retailDemandRequirement = protectUnreplenishedFutureForecast 
    ? snapshotRetailDemand 
    : horizonRetailDemand;

  const unreplenishedFutureForecastCases = Math.max(0, snapshotRetailDemand - horizonRetailDemand);
  const isFutureForecastProtected = protectUnreplenishedFutureForecast && unreplenishedFutureForecastCases > 0;

  const effectiveForecast = protectUnreplenishedFutureForecast ? totalSnapshotForecast : totalHorizonForecast;
  const effectiveProduction = protectUnreplenishedFutureForecast ? totalSnapshotConfirmedProduction : totalHorizonConfirmedProduction;
  const isBalancedWithProduction = (effectiveProduction > 0 && effectiveForecast > 0 && retailDemandRequirement < effectiveForecast);
  const productionOffsetQuantity = isBalancedWithProduction ? Math.min(effectiveForecast, effectiveProduction) : 0;

  const peakDeficitDate = (isFutureForecastProtected ? peakSnapshotDeficitDate : peakHorizonDeficitDate) || 
    peakSnapshotDeficitDate || 
    peakHorizonDeficitDate || 
    null;

  return {
    retailDemandRequirement,
    chronologicalDeficitByDate,
    peakDeficitDate,
    peakHorizonDeficitDate,
    peakSnapshotDeficitDate,
    totalHorizonForecast,
    totalHorizonConfirmedProduction,
    totalSnapshotForecast,
    totalSnapshotConfirmedProduction,
    total7DayForecast: planningContext.forecastCasesNext7Days || 0,
    total7DayConfirmedProduction: planningContext.confirmedProductionCasesNext7Days || 0,
    horizonRetailDemand,
    snapshotRetailDemand,
    unreplenishedFutureForecastCases,
    isFutureForecastProtected,
    isBalancedWithProduction,
    productionOffsetQuantity,
    planningHorizonDays: horizonDays
  };
};

/**
 * Retrieves the ProductPlanningContext for a specific product from the database or cache.
 */
export const getProductPlanningContext = async (
  tenantId: string,
  siteId: string,
  productId: string,
  productCode?: string,
  evaluationDate?: Date | string
): Promise<ProductPlanningContext> => {
  const snapshotRes = await getActiveSnp87Snapshot(tenantId, siteId);
  return buildProductPlanningContext({
    productId,
    productCode,
    activeSnapshot: snapshotRes.importSummary,
    snapshotRows: snapshotRes.rows,
    evaluationDate
  });
};
