import { DisplayPriority } from '../../../types/priority';
import { InventoryBalance } from '../../../types/inventory';
import { Product } from '../../../types/product';
import { ActionType, Destination } from '../../../types/configuration';
import { areProductCodesEqual, normalizeProductCode } from '../../../utils/productCodeNormalizer';
import { getActionTypeLabel, getDestinationLabel } from './priorityFormatters';

export interface ForecastStockSummary {
  productId?: string | null;
  productCode: string;
  activeRequiredPallets: number;
  totalForecastCases: number;
  surplusPallets: number;
  onHandCases?: number;
  onHandPallets?: number;
}

export interface InventoryStockLookup {
  byId: Map<string, number>;
  byCode: Map<string, number>;
}

export const buildInventoryStockLookup = (
  balances: InventoryBalance[],
  products: Product[] = []
): InventoryStockLookup => {
  const byId = new Map<string, number>();
  const byCode = new Map<string, number>();

  const prodCodeById = new Map<string, string>();
  products.forEach(p => {
    const code = (p as any).code || p.productCode;
    if (p.id && code) {
      prodCodeById.set(p.id, code);
    }
  });

  balances.forEach(b => {
    const qty = Number(b.quantity) || 0;
    if (b.productId) {
      byId.set(b.productId, (byId.get(b.productId) || 0) + qty);
    }
    const resolvedCode = b.productCodeSnapshot || (b.productId ? prodCodeById.get(b.productId) : undefined);
    if (resolvedCode) {
      const codeUpper = resolvedCode.trim().toUpperCase();
      byCode.set(codeUpper, (byCode.get(codeUpper) || 0) + qty);
      const normCode = normalizeProductCode(resolvedCode);
      if (normCode && normCode !== codeUpper) {
        byCode.set(normCode, (byCode.get(normCode) || 0) + qty);
      }
    }
  });

  return { byId, byCode };
};

export const lookupOnHandCases = (
  priority: Pick<DisplayPriority, 'productId' | 'productCodeSnapshot'> & { priorityCode?: string },
  inventoryStockMap: InventoryStockLookup,
  matchedProduct?: Product | null
): { found: boolean; onHandCases: number } => {
  if (priority.productId && inventoryStockMap.byId.has(priority.productId)) {
    return { found: true, onHandCases: Math.max(0, inventoryStockMap.byId.get(priority.productId)!) };
  }
  if (matchedProduct?.id && inventoryStockMap.byId.has(matchedProduct.id)) {
    return { found: true, onHandCases: Math.max(0, inventoryStockMap.byId.get(matchedProduct.id)!) };
  }

  const candidateCodes = [
    priority.productCodeSnapshot,
    matchedProduct?.productCode,
    (matchedProduct as any)?.code,
    priority.priorityCode
  ];

  for (const candidate of candidateCodes) {
    const rawCode = candidate?.trim() || '';
    if (!rawCode) continue;
    const upper = rawCode.toUpperCase();
    if (inventoryStockMap.byCode.has(upper)) {
      return { found: true, onHandCases: Math.max(0, inventoryStockMap.byCode.get(upper)!) };
    }
    const norm = normalizeProductCode(rawCode);
    if (norm && inventoryStockMap.byCode.has(norm)) {
      return { found: true, onHandCases: Math.max(0, inventoryStockMap.byCode.get(norm)!) };
    }
  }
  return { found: false, onHandCases: 0 };
};

const getPriorityTimestampMs = (p: DisplayPriority): number => {
  const raw = p.modifiedDate || p.createdDate || p.startAt;
  if (!raw) return 0;
  const ms = new Date(raw as any).getTime();
  return isNaN(ms) ? 0 : ms;
};

/**
 * Deduplicates display priorities by canonical priority identity (sourcePriorityId || id)
 * and prevents multiple active rows for the exact same SKU + action + destination from
 * accumulating if stale projections remained from earlier runs.
 */
export const deduplicateDisplayPriorities = (items: DisplayPriority[]): DisplayPriority[] => {
  const bySourceId = new Map<string, DisplayPriority>();
  for (const item of items) {
    const key = item.sourcePriorityId || item.id;
    const existing = bySourceId.get(key);
    if (!existing || getPriorityTimestampMs(item) >= getPriorityTimestampMs(existing)) {
      bySourceId.set(key, item);
    }
  }

  const byLogicalKey = new Map<string, DisplayPriority>();
  for (const item of bySourceId.values()) {
    const skuKey = normalizeProductCode(item.productCodeSnapshot || '') || item.productId || item.id;
    const logicalKey = `${skuKey}::${item.actionTypeId || ''}::${item.destinationId || ''}`;
    const existing = byLogicalKey.get(logicalKey);
    if (!existing || getPriorityTimestampMs(item) >= getPriorityTimestampMs(existing)) {
      byLogicalKey.set(logicalKey, item);
    }
  }

  return Array.from(byLogicalKey.values());
};

export interface ReconciledTVPriorityView {
  shouldHide: boolean;
  isReleaseAction: boolean;
  hasForecastDemand: boolean;
  qtyValue: string;
  unitLabel: string;
  isCases: boolean;
  displayInstruction: string | null | undefined;
  wasCappedByStock: boolean;
  onHandCases: number | null;
}

export const reconcileDisplayPriorityForTV = (params: {
  priority: DisplayPriority;
  inventoryStockMap: InventoryStockLookup;
  balancesLoaded: boolean;
  products: Product[];
  actionTypes: ActionType[];
  destinations: Destination[];
  forecastStockItems: ForecastStockSummary[];
  pluralUnitStyle?: 'long' | 'short';
}): ReconciledTVPriorityView => {
  const {
    priority: p,
    inventoryStockMap,
    balancesLoaded,
    products,
    actionTypes,
    destinations,
    forecastStockItems,
    pluralUnitStyle = 'long'
  } = params;

  const productMatch = products.find(prod =>
    (p.productId && prod.id === p.productId) ||
    (p.productCodeSnapshot && areProductCodesEqual(prod.productCode, p.productCodeSnapshot)) ||
    (p.priorityCode && areProductCodesEqual(prod.productCode, p.priorityCode))
  );
  const cpp =
    productMatch?.casesPerPallet ||
    productMatch?.configurations?.[0]?.casesPerPallet ||
    null;

  const forecastItem = forecastStockItems.find(f =>
    (p.productId && f.productId === p.productId) ||
    (productMatch?.id && f.productId === productMatch.id) ||
    (p.productCodeSnapshot && areProductCodesEqual(f.productCode, p.productCodeSnapshot))
  );

  const hasForecastDemand = Boolean(
    forecastItem &&
    (forecastItem.activeRequiredPallets > 0 || forecastItem.totalForecastCases > 0)
  );

  const rawActionLabel = getActionTypeLabel(p.actionTypeId, actionTypes, p.actionTypeLabel).toUpperCase();
  const isReleaseAction = rawActionLabel.includes('RELEASE');

  const stockLookup = lookupOnHandCases(p, inventoryStockMap, productMatch);
  const onHandCases = balancesLoaded ? stockLookup.onHandCases : null;

  const requestedCases = Math.max(0, Number(p.requestedQuantity) || 0);
  const palletUnit = (count: number) => {
    if (pluralUnitStyle === 'short') {
      return count === 1 ? 'PLT' : 'PLTS';
    }
    return count === 1 ? 'PALLET' : 'PALLETS';
  };

  let effectiveCases = requestedCases;
  let effectivePallets: number | null = cpp && cpp > 0 ? Math.round(requestedCases / cpp) : null;
  let wasCappedByStock = false;
  let shouldHide = false;

  if (isReleaseAction) {
    // 1. Protect active SNP87 forecast demand when present
    if (forecastItem && forecastItem.activeRequiredPallets > 0) {
      const surplusPallets = Math.max(0, forecastItem.surplusPallets);
      if (effectivePallets === null || surplusPallets < effectivePallets) {
        effectivePallets = surplusPallets;
        if (cpp && cpp > 0) {
          effectiveCases = surplusPallets * cpp;
        }
      }
    }

    // 2. Hard-cap any RELEASE action by physical On-Hand stock (QOH) once balances are loaded
    if (balancesLoaded && onHandCases !== null) {
      if (onHandCases < effectiveCases) {
        effectiveCases = Math.max(0, onHandCases);
        wasCappedByStock = true;
      }
      if (cpp && cpp > 0) {
        const physicalPallets = Math.floor(onHandCases / cpp);
        if (effectivePallets === null || physicalPallets < effectivePallets) {
          effectivePallets = physicalPallets;
          wasCappedByStock = wasCappedByStock || effectiveCases < requestedCases;
        }
      }
    }

    // Hide impossible zero-stock / zero-surplus RELEASE tiles
    if (
      (balancesLoaded && onHandCases !== null && onHandCases <= 0) ||
      (effectivePallets !== null && effectivePallets <= 0) ||
      effectiveCases <= 0
    ) {
      shouldHide = true;
    }
  }

  let qtyValue = '0';
  let unitLabel = palletUnit(0);
  let isCases = false;

  if (effectiveCases > 0) {
    if (cpp && cpp > 0 && effectivePallets !== null) {
      qtyValue = effectivePallets.toLocaleString();
      unitLabel = palletUnit(effectivePallets);
    } else {
      qtyValue = effectiveCases.toLocaleString();
      unitLabel = pluralUnitStyle === 'short' ? 'CS' : 'CASES';
      isCases = true;
    }
  }

  // Ensure displayed NOTE/instruction never contradicts capped stock/forecast quantities
  let displayInstruction = p.instruction;
  if (isReleaseAction && displayInstruction && (wasCappedByStock || (forecastItem && forecastItem.activeRequiredPallets > 0))) {
    const destFullName = p.destinationId
      ? getDestinationLabel(p.destinationId, destinations, p.destinationLabel)
      : 'configured destination';
    const isAutoReleaseNote = /^release\s+[\d,]+\s+cases/i.test(displayInstruction.trim());
    if (isAutoReleaseNote) {
      const displayPlts = effectivePallets ?? effectiveCases;
      displayInstruction = `Release ${effectiveCases.toLocaleString()} cases (${displayPlts.toLocaleString()} ${displayPlts === 1 ? 'Pallet' : 'Pallets'}) to ${destFullName}`;
    } else if (wasCappedByStock) {
      displayInstruction = `${displayInstruction} (Capped to ${effectiveCases.toLocaleString()} cases QOH)`;
    }
  }

  return {
    shouldHide,
    isReleaseAction,
    hasForecastDemand,
    qtyValue,
    unitLabel,
    isCases,
    displayInstruction,
    wasCappedByStock,
    onHandCases
  };
};

/**
 * Splits Flight Board rows into user-pinned and scrolling queues without duplicating items.
 * Only items explicitly pinned by a user (or flagged isPinned) appear in pinnedEntries,
 * and pinned items are excluded from unpinnedEntries.
 */
export const partitionFlightBoardEntries = <T extends { priority: DisplayPriority }>(
  entries: T[],
  userPinnedIds: ReadonlySet<string>
): { pinnedEntries: T[]; unpinnedEntries: T[] } => {
  const pinnedEntries: T[] = [];
  const unpinnedEntries: T[] = [];

  for (const entry of entries) {
    const p = entry.priority;
    const isPhysicallyPinned =
      userPinnedIds.has(p.id) ||
      Boolean(p.sourcePriorityId && userPinnedIds.has(p.sourcePriorityId)) ||
      (p as any).isPinned === true;

    if (isPhysicallyPinned) {
      pinnedEntries.push(entry);
    } else {
      unpinnedEntries.push(entry);
    }
  }

  return { pinnedEntries, unpinnedEntries };
};
