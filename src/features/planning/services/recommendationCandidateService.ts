import { Product } from '../../../types/product';
import { NorthfleetStoRequirement } from '../../../types/production';
import { Snp87PlanningRow } from '../../../types/snp87';
import { Priority } from '../../../types/priority';
import { areProductCodesEqual } from '../../../utils/productCodeNormalizer';
import { toCalendarDateString, addCalendarDays } from './snp87PlanningContextService';

/**
 * Checks if a date value represents today (calendar day comparison against evaluationDate).
 */
export const isDateDueToday = (dateVal: any, evalDate: Date = new Date()): boolean => {
  if (!dateVal) return false;
  const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(d.getTime())) return false;

  // Compare local calendar day
  const dLocal = new Date(d);
  dLocal.setHours(0, 0, 0, 0);
  const targetLocal = new Date(evalDate);
  targetLocal.setHours(0, 0, 0, 0);
  if (dLocal.getTime() === targetLocal.getTime()) return true;

  // Compare UTC calendar day
  const dUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const targetUTC = new Date(Date.UTC(targetLocal.getUTCFullYear(), targetLocal.getUTCMonth(), targetLocal.getUTCDate(), 0, 0, 0, 0));
  return dUTC.getTime() === targetUTC.getTime();
};

export interface CandidateFilterInput {
  activeProducts: Product[];
  inventoryTotalsByProductId: Map<string, number>;
  stoRequirements: NorthfleetStoRequirement[];
  snp87Rows: Snp87PlanningRow[];
  activeRecommendations: any[];
  activePriorities: Priority[];
  evaluationDate?: Date | string;
}

export interface RecommendationCandidatesResult {
  candidateProducts: Product[];
  candidateProductIds: Set<string>;
  positiveInventoryCandidates: Set<string>;
  stoDueTodayCandidates: Set<string>;
  snp87ForecastCandidates: Set<string>;
  snp87ProductionCandidates: Set<string>;
  existingSystemRecCandidates: Set<string>;
  totalCandidates: number;
  diagnosticLog: string;
}

/**
 * Stage 6: Update Recommendation Candidate Filtering for SNP87.
 *
 * Candidate sources include active products with:
 * 1. Positive inventory
 * 2. Northfleet STO due for collection today
 * 3. SNP87 Forecast within the active planning horizon (7 calendar days: Day 0 through Day 6)
 * 4. SNP87 Confirmed Production within the active planning horizon (7 calendar days: Day 0 through Day 6)
 * 5. Existing active system recommendation
 * 6. Existing active system recommendation-driven priority
 *
 * Deduplicates union and filters strictly to active products.
 */
export const filterRecommendationCandidates = (
  input: CandidateFilterInput
): RecommendationCandidatesResult => {
  const {
    activeProducts,
    inventoryTotalsByProductId,
    stoRequirements,
    snp87Rows,
    activeRecommendations,
    activePriorities,
    evaluationDate
  } = input;

  const evalDate = evaluationDate instanceof Date ? evaluationDate : (evaluationDate ? new Date(evaluationDate) : new Date());
  const evalDateStr = toCalendarDateString(evalDate);
  const horizonStartDate = evalDateStr;
  const horizonEndDate = addCalendarDays(evalDateStr, 6);

  // Fast lookups for active products only
  const activeProductsMap = new Map<string, Product>();
  const activeProductsByCode = new Map<string, Product>();

  for (const prod of activeProducts) {
    // Ensure product is active
    if (prod.status === 'active') {
      activeProductsMap.set(prod.id, prod);
      const code = (prod as any).code || prod.productCode;
      if (code) {
        activeProductsByCode.set(code.trim().toUpperCase(), prod);
      }
    }
  }

  const findActiveProduct = (
    productId?: string | null,
    productNumber?: string | null,
    orderSku?: string | null,
    productCodeSnapshot?: string | null
  ): Product | null => {
    if (productId && activeProductsMap.has(productId)) {
      return activeProductsMap.get(productId)!;
    }
    const candidates = [productNumber, orderSku, productCodeSnapshot].filter(Boolean) as string[];
    for (const code of candidates) {
      const trimmed = code.trim().toUpperCase();
      if (activeProductsByCode.has(trimmed)) {
        return activeProductsByCode.get(trimmed)!;
      }
      // Fallback: check areProductCodesEqual
      for (const prod of activeProductsMap.values()) {
        const prodCode = (prod as any).code || prod.productCode;
        if (prodCode && areProductCodesEqual(prodCode, code)) {
          return prod;
        }
      }
    }
    return null;
  };

  const positiveInventoryCandidates = new Set<string>();
  const stoDueTodayCandidates = new Set<string>();
  const snp87ForecastCandidates = new Set<string>();
  const snp87ProductionCandidates = new Set<string>();
  const existingSystemRecCandidates = new Set<string>();

  // 1. Positive Inventory
  for (const [prodId, prod] of activeProductsMap.entries()) {
    const totalQty = inventoryTotalsByProductId.get(prodId) || 0;
    if (totalQty > 0) {
      positiveInventoryCandidates.add(prodId);
    }
  }

  // 2. Northfleet STO Due for Collection Today
  for (const sto of stoRequirements) {
    if (sto.status !== 'CANCELLED' && isDateDueToday(sto.barrowCollectionDate, evalDate)) {
      const matched = findActiveProduct(sto.productId, (sto as any).productCode, (sto as any).sku);
      if (matched) {
        stoDueTodayCandidates.add(matched.id);
      }
    }
  }

  // 3 & 4. SNP87 Planning Rows within active planning horizon
  for (const row of snp87Rows) {
    const rowDate = row.planningDate || toCalendarDateString(row.startDate);
    const isWithinHorizon = rowDate >= horizonStartDate && rowDate <= horizonEndDate;

    if (!isWithinHorizon) {
      continue;
    }

    if (row.planningType === 'FORECAST') {
      const forecastQty = row.forecastQuantity ?? row.quantity ?? 0;
      if (forecastQty > 0) {
        const matched = findActiveProduct(row.productId, row.productNumber, row.orderSku, row.productCodeSnapshot);
        if (matched) {
          snp87ForecastCandidates.add(matched.id);
        }
      }
    } else if (row.planningType === 'CONFIRMED_PRODUCTION') {
      const prodQty = row.confirmedProductionQuantity ?? row.quantity ?? 0;
      if (prodQty > 0) {
        const matched = findActiveProduct(row.productId, row.productNumber, row.orderSku, row.productCodeSnapshot);
        if (matched) {
          snp87ProductionCandidates.add(matched.id);
        }
      }
    }
  }

  // 5. Existing Active System Recommendations
  for (const rec of activeRecommendations) {
    if (rec.productId && ['AWAITING_REVIEW', 'AUTO_PUBLISHED', 'APPROVED'].includes(rec.recommendationStatus)) {
      if (activeProductsMap.has(rec.productId)) {
        existingSystemRecCandidates.add(rec.productId);
      }
    }
  }

  // 6. Existing Active System Recommendation-Driven Priorities
  for (const prio of activePriorities) {
    if (
      prio.productId &&
      prio.sourceType === 'RECOMMENDATION' &&
      ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(prio.priorityStatus)
    ) {
      if (activeProductsMap.has(prio.productId)) {
        existingSystemRecCandidates.add(prio.productId);
      }
    }
  }

  // Deduplicated candidate union
  const candidateProductIds = new Set<string>([
    ...positiveInventoryCandidates,
    ...stoDueTodayCandidates,
    ...snp87ForecastCandidates,
    ...snp87ProductionCandidates,
    ...existingSystemRecCandidates
  ]);

  // Strictly filter to active products
  const candidateProducts = activeProducts.filter(
    p => p.status === 'active' && candidateProductIds.has(p.id)
  );
  const totalCandidates = candidateProducts.length;

  const diagnosticLog =
    `Recommendation refresh:\n` +
    `Active products: ${activeProductsMap.size}\n` +
    `Positive inventory: ${positiveInventoryCandidates.size}\n` +
    `STO due today: ${stoDueTodayCandidates.size}\n` +
    `SNP87 forecast candidates: ${snp87ForecastCandidates.size}\n` +
    `SNP87 production candidates: ${snp87ProductionCandidates.size}\n` +
    `Existing system recommendations: ${existingSystemRecCandidates.size}\n` +
    `Unique candidates: ${totalCandidates}`;

  return {
    candidateProducts,
    candidateProductIds,
    positiveInventoryCandidates,
    stoDueTodayCandidates,
    snp87ForecastCandidates,
    snp87ProductionCandidates,
    existingSystemRecCandidates,
    totalCandidates,
    diagnosticLog
  };
};
