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
  freshnessThresholdHours?: number; // Default: 168 hours (7 days) for weekly report cycle
  fallbackUom?: string;
}

/**
 * Builds a ProductPlanningContext for a single product from an SNP87 Planning Snapshot.
 * 
 * Rules:
 * - 7-day forecast is a dynamic planning requirement calculated for Day 0 through Day 6.
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
  freshnessThresholdHours = 168, // 7 days
  fallbackUom = 'CS'
}: BuildProductPlanningContextOptions): ProductPlanningContext => {
  const effectiveEvalDate = evaluationDate || 
    activeSnapshot?.importPeriod?.startDate || 
    snapshotRows[0]?.horizonDate || 
    snapshotRows[0]?.planningDate || 
    snapshotRows[0]?.startDate;
  const evalDateStr = toCalendarDateString(effectiveEvalDate);
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
  let forecastCasesNext7Days = 0;
  let totalForecastCasesInSnapshot = 0;
  const forecastByDate: Record<string, number> = {};

  forecastRows.forEach(row => {
    const rowDate = row.planningDate || toCalendarDateString(row.startDate);
    const qty = row.forecastQuantity ?? row.quantity ?? 0;

    totalForecastCasesInSnapshot += qty;
    forecastByDate[rowDate] = (forecastByDate[rowDate] || 0) + qty;

    if (rowDate === evalDateStr) {
      forecastCasesToday += qty;
    }

    if (rowDate >= sevenDayStartDate && rowDate <= sevenDayEndDate) {
      forecastCasesNext7Days += qty;
    }
  });

  // If calendar window missed rows but snapshot has valid forecast for this product, preserve total
  if (forecastCasesNext7Days === 0 && totalForecastCasesInSnapshot > 0) {
    forecastCasesNext7Days = totalForecastCasesInSnapshot;
  }

  // 2. Confirmed Production Calculations
  let confirmedProductionCasesToday = 0;
  let confirmedProductionCasesNext7Days = 0;
  let totalConfirmedInSnapshot = 0;
  const confirmedProductionByDate: Record<string, number> = {};

  confirmedRows.forEach(row => {
    const rowDate = row.planningDate || toCalendarDateString(row.startDate);
    const qty = row.confirmedProductionQuantity ?? row.quantity ?? 0;

    totalConfirmedInSnapshot += qty;
    confirmedProductionByDate[rowDate] = (confirmedProductionByDate[rowDate] || 0) + qty;

    if (rowDate === evalDateStr) {
      confirmedProductionCasesToday += qty;
    }

    if (rowDate >= sevenDayStartDate && rowDate <= sevenDayEndDate) {
      confirmedProductionCasesNext7Days += qty;
    }
  });

  if (confirmedProductionCasesNext7Days === 0 && totalConfirmedInSnapshot > 0) {
    confirmedProductionCasesNext7Days = totalConfirmedInSnapshot;
  }

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
    forecastByDate,
    forecastSourceImportId: sourceImportId,
    forecastSourceUpdatedAt: sourceUpdatedAt,
    confirmedProductionCasesToday: roundQty(confirmedProductionCasesToday),
    confirmedProductionCasesNext7Days: roundQty(confirmedProductionCasesNext7Days),
    confirmedProductionByDate,
    productionSourceImportId: sourceImportId,
    productionSourceUpdatedAt: sourceUpdatedAt,
    dataFreshnessStatus,
    sourceStatus,
    sourceImportId,
    sourceReportName,
    hasMissingPlanningData,
    evaluationDate: evalDateStr,
    sevenDayWindow: {
      startDate: sevenDayStartDate,
      endDate: sevenDayEndDate
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
  freshnessThresholdHours: number = 168
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
  total7DayForecast: number;
  total7DayConfirmedProduction: number;
}

/**
 * Stage 5 Requirement:
 * Calculates dynamic retail demand using a rolling 7-calendar-day horizon (Day 0 through Day 6)
 * with date-aware chronological evaluation of demand and confirmed production.
 *
 * Demand on Day t cannot be satisfied by future production on Day t+1.
 * Net required initial inventory at Barrow = max(0, max_k=0..6(CumulativeForecast_k - CumulativeProduction_k)).
 */
export const calculateSnp87ChronologicalRequirement = (
  planningContext: ProductPlanningContext | null | undefined,
  evaluationDate?: Date | string
): Snp87ChronologicalRequirementResult => {
  if (!planningContext) {
    return {
      retailDemandRequirement: 0,
      chronologicalDeficitByDate: {},
      peakDeficitDate: null,
      total7DayForecast: 0,
      total7DayConfirmedProduction: 0
    };
  }

  const evalDateStr = toCalendarDateString(evaluationDate || planningContext.evaluationDate || new Date());
  
  let cumForecast = 0;
  let cumProduction = 0;
  let maxDeficit = 0;
  let peakDeficitDate: string | null = null;
  const chronologicalDeficitByDate: Record<string, number> = {};

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const dateStr = addCalendarDays(evalDateStr, dayOffset);
    const dayForecast = planningContext.forecastByDate?.[dateStr] || 0;
    const dayProduction = planningContext.confirmedProductionByDate?.[dateStr] || 0;

    cumForecast += dayForecast;
    cumProduction += dayProduction;

    const netDeficit = cumForecast - cumProduction;
    chronologicalDeficitByDate[dateStr] = netDeficit;

    if (netDeficit > maxDeficit) {
      maxDeficit = netDeficit;
      peakDeficitDate = dateStr;
    }
  }

  return {
    retailDemandRequirement: Math.max(0, maxDeficit),
    chronologicalDeficitByDate,
    peakDeficitDate,
    total7DayForecast: planningContext.forecastCasesNext7Days || 0,
    total7DayConfirmedProduction: planningContext.confirmedProductionCasesNext7Days || 0
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
