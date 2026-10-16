import { NorthfleetStoRequirement, NorthfleetStoImport, NorthfleetStoStatus } from '../../../types/production';
import { Product } from '../../../types/product';
import { ProductPlanningRule } from '../../../types/planning';
import { ServiceResult } from '../../../types/common';
import { logAuditEvent } from '../../../services/auditService';
import { generateRecommendationForProduct } from './recommendationService';
import { getDocument, getDocuments, where } from '../../../services/dbService';
import { supabase } from '../../../config/supabase';
import { toSnakeCase, toCamelCase } from '../../../utils/caseTransformers';
import { normalizeProductCode, padProductCode } from '../../../utils/productCodeNormalizer';

const STO_REQUIREMENTS_COLLECTION = 'northfleetStoRequirements';
const STO_IMPORTS_COLLECTION = 'northfleetStoImports';
const PRODUCTS_COLLECTION = 'products';
const DESTINATIONS_COLLECTION = 'destinations';

const getLocalDispatchControls = (): Record<string, { dispatchMode: 'AUTOMATIC' | 'MANUAL'; manualStatus?: 'PENDING' | 'DESPATCHED' | 'HOLD'; actualDespatchDate?: string | null }> => {
  try {
    const raw = localStorage.getItem('ovms_sto_dispatch_controls');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveLocalDispatchControl = (stoId: string, dispatchMode: 'AUTOMATIC' | 'MANUAL', manualStatus?: 'PENDING' | 'DESPATCHED' | 'HOLD', actualDespatchDate?: string | null) => {
  try {
    const controls = getLocalDispatchControls();
    controls[stoId] = { dispatchMode, manualStatus, actualDespatchDate };
    localStorage.setItem('ovms_sto_dispatch_controls', JSON.stringify(controls));
  } catch (err) {
    console.error('Failed to save local dispatch control:', err);
  }
};

export interface LocalStoSubstitution {
  originalProductId?: string | null;
  originalProductCode?: string | null;
  originalProductDescriptionSnapshot?: string | null;
  substitutedProductId?: string | null;
  substitutedProductCode?: string | null;
  substitutionDate?: string | null;
  isBacklogRetained?: boolean;
  cases?: number;
  casesPerPalletSnapshot?: number;
}

const getLocalSubstitutions = (): Record<string, LocalStoSubstitution> => {
  try {
    const raw = localStorage.getItem('ovms_sto_substitutions');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveLocalSubstitution = (stoId: string, sub: LocalStoSubstitution) => {
  try {
    const subs = getLocalSubstitutions();
    subs[stoId] = sub;
    localStorage.setItem('ovms_sto_substitutions', JSON.stringify(subs));
  } catch (err) {
    console.error('Failed to save local substitution:', err);
  }
};

export interface ParsedStoRow {
  rowIndex: number;
  rawText: string;
  deliveryDateStr: string;
  northfleetDeliveryDate: Date | null;
  barrowCollectionDate: Date | null;
  stoNumber: string;
  productCode: string;
  pallets: number;
  cases: number;
  casesPerPallet: number;
  parsedSuccessfully: boolean;
  parseErrorMessage?: string;
}

export type StoRowValidationStatus =
  | 'VALID'
  | 'WARNING'
  | 'UNKNOWN_PRODUCT'
  | 'DUPLICATE_STO'
  | 'EXISTING_STO_CHANGED'
  | 'INVALID_DATE'
  | 'INVALID_QUANTITY';

export interface ValidatedStoRow extends ParsedStoRow {
  validationStatus: StoRowValidationStatus;
  validationMessages: string[];
  matchedProductId: string | null;
  matchedProductDescription: string | null;
  matchedDestinationId: string | null;
  matchedDestinationCode: string | null;
  existingRequirementId?: string | null;
  previousProductId?: string | null;
  previousProductCode?: string | null;
  derivedStatus: NorthfleetStoStatus;
}

// Month lookup helper
const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11
};

/**
 * Parse raw paste text into ParsedStoRow objects.
 */
export const parseNorthfleetStoPaste = (
  pasteText: string,
  activePlanningYear: number = new Date().getFullYear()
): ParsedStoRow[] => {
  if (!pasteText || !pasteText.trim()) return [];

  const lines = pasteText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return [];

  // Detect header row
  let startIndex = 0;
  const firstLineLower = lines[0].toLowerCase();
  if (
    firstLineLower.includes('date') ||
    firstLineLower.includes('sto') ||
    firstLineLower.includes('code') ||
    firstLineLower.includes('pallet') ||
    firstLineLower.includes('case')
  ) {
    startIndex = 1;
  }

  const results: ParsedStoRow[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    // Split by tab, or comma if no tabs present
    let cols = rawLine.includes('\t') ? rawLine.split('\t') : rawLine.split(',');
    cols = cols.map(c => c.trim().replace(/^"|"$/g, ''));

    if (cols.length < 6) {
      results.push({
        rowIndex: i + 1,
        rawText: rawLine,
        deliveryDateStr: cols[0] || '',
        northfleetDeliveryDate: null,
        barrowCollectionDate: null,
        stoNumber: cols[1] || '',
        productCode: cols[2] || '',
        pallets: 0,
        cases: 0,
        casesPerPallet: 0,
        parsedSuccessfully: false,
        parseErrorMessage: `Expected 6 columns (Delivery Date, STO, Product Code, Pallets, Cases, Cases/Pallet), found ${cols.length}.`
      });
      continue;
    }

    const deliveryDateStr = cols[0];
    const stoNumber = cols[1];
    const productCode = cols[2];
    const pallets = parseFloat(cols[3].replace(/,/g, '')) || 0;
    const cases = parseFloat(cols[4].replace(/,/g, '')) || 0;
    const casesPerPallet = parseFloat(cols[5].replace(/,/g, '')) || 0;

    // Parse Delivery Date
    const deliveryDate = parseDeliveryDate(deliveryDateStr, activePlanningYear);
    let collectionDate: Date | null = null;
    if (deliveryDate) {
      collectionDate = new Date(deliveryDate.getTime() - 24 * 60 * 60 * 1000);
    }

    const isDateValid = deliveryDate !== null;
    const isQtyValid = pallets > 0 && cases > 0 && casesPerPallet > 0;
    const isStoValid = Boolean(stoNumber);
    const isProductValid = Boolean(productCode);

    const parsedSuccessfully = isDateValid && isQtyValid && isStoValid && isProductValid;
    let parseErrorMessage: string | undefined = undefined;
    if (!isDateValid) parseErrorMessage = `Invalid delivery date format: "${deliveryDateStr}"`;
    else if (!isStoValid) parseErrorMessage = 'Missing STO number';
    else if (!isProductValid) parseErrorMessage = 'Missing Product Code';
    else if (!isQtyValid) parseErrorMessage = 'Quantities (Pallets, Cases, Cases/Pallet) must be positive numbers';

    results.push({
      rowIndex: i + 1,
      rawText: rawLine,
      deliveryDateStr,
      northfleetDeliveryDate: deliveryDate,
      barrowCollectionDate: collectionDate,
      stoNumber,
      productCode,
      pallets,
      cases,
      casesPerPallet,
      parsedSuccessfully,
      parseErrorMessage
    });
  }

  return results;
};

/**
 * Parses date strings like "10-Aug", "10-Aug-2026", "10/08/2026", "2026-08-10"
 */
export const parseDeliveryDate = (dateStr: string, defaultYear: number): Date | null => {
  if (!dateStr || !dateStr.trim()) return null;

  const str = dateStr.trim();

  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const year = parseInt(ddmmyyyyMatch[3], 10);
    const d = new Date(year, month, day, 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // Try DD-MMM or DD-MMM-YYYY or DD MMM YYYY (e.g. 10-Aug or 10-Aug-2026)
  const ddMmmMatch = str.match(/^(\d{1,2})[\/\s\.-]([a-zA-Z]{3,9})(?:[\/\s\.-](\d{2,4}))?$/);
  if (ddMmmMatch) {
    const day = parseInt(ddMmmMatch[1], 10);
    const mStr = ddMmmMatch[2].toLowerCase();
    const month = MONTH_MAP[mStr];
    if (month === undefined) return null;

    let year = defaultYear;
    if (ddMmmMatch[3]) {
      let y = parseInt(ddMmmMatch[3], 10);
      if (y < 100) y += 2000;
      year = y;
    }

    const d = new Date(year, month, day, 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  // General fallback
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Derive requirement status based on Barrow Collection Date relative to today.
 */
export const deriveStoStatus = (barrowCollectionDate: Date): NorthfleetStoStatus => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const collDate = new Date(barrowCollectionDate);
  collDate.setHours(0, 0, 0, 0);

  if (collDate.getTime() > today.getTime()) {
    return 'UPCOMING';
  } else if (collDate.getTime() === today.getTime()) {
    return 'DUE_FOR_COLLECTION';
  } else {
    return 'ASSUMED_DISPATCHED';
  }
};

/**
 * Validate parsed STO rows against Product Master and existing Firestore database.
 */
export const validateNorthfleetStoRows = async (
  parsedRows: ParsedStoRow[],
  tenantId: string,
  siteId: string
): Promise<ValidatedStoRow[]> => {
  // 1. Fetch Products
  const prodDocs = await getDocuments<any>(
    PRODUCTS_COLLECTION,
    [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]
  );
  const productsByCode = new Map<string, { id: string; description: string; preferredDestinationId?: string }>();

  prodDocs.forEach(d => {
    const code = d.code || d.productCode || d.id;
    if (!code) return;
    const desc = d.description || d.productName || d.name || code;
    const info = {
      id: d.id,
      description: desc,
      preferredDestinationId: d.preferredDestinationId
    };

    // Add multiple forms of keys to Map for maximum lookup flexibility
    const rawCode = code.toString().trim().toUpperCase();
    const normalizedCode = normalizeProductCode(rawCode);
    const paddedCode8 = padProductCode(rawCode, 8);

    productsByCode.set(rawCode, info);
    productsByCode.set(normalizedCode, info);
    productsByCode.set(paddedCode8, info);
  });

  // 2. Fetch Northfleet destination if configured
  const destDocs = await getDocuments<any>(
    DESTINATIONS_COLLECTION,
    [where('tenantId', '==', tenantId)]
  );
  let northfleetDestId = 'DEST_NORTHFLEET';
  let northfleetDestCode = 'NORTHFLEET';

  destDocs.forEach(d => {
    if (d.destinationCode?.toUpperCase() === 'NORTHFLEET' || d.destinationName?.toLowerCase().includes('northfleet')) {
      northfleetDestId = d.id;
      northfleetDestCode = d.destinationCode || 'NORTHFLEET';
    }
  });

  // 3. Fetch existing STO requirements from DB
  const existingDocs = await getDocuments<NorthfleetStoRequirement>(
    STO_REQUIREMENTS_COLLECTION,
    [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]
  );
  const existingByStoNumber = new Map<string, NorthfleetStoRequirement>();

  existingDocs.forEach(d => {
    existingByStoNumber.set(d.stoNumber, d);
  });

  // Keep track of STO numbers seen in current paste batch
  const batchStoNumbers = new Set<string>();

  const validated: ValidatedStoRow[] = [];

  for (const row of parsedRows) {
    const messages: string[] = [];
    let status: StoRowValidationStatus = 'VALID';

    if (!row.parsedSuccessfully) {
      status = row.northfleetDeliveryDate ? 'INVALID_QUANTITY' : 'INVALID_DATE';
      messages.push(row.parseErrorMessage || 'Parse error');
      validated.push({
        ...row,
        validationStatus: status,
        validationMessages: messages,
        matchedProductId: null,
        matchedProductDescription: null,
        matchedDestinationId: northfleetDestId,
        matchedDestinationCode: northfleetDestCode,
        derivedStatus: 'UPCOMING'
      });
      continue;
    }

    // Product lookup
    const lookupCode = row.productCode ? row.productCode.toString().trim().toUpperCase() : '';
    const normalizedLookup = normalizeProductCode(lookupCode);
    const paddedLookup8 = padProductCode(lookupCode, 8);

    const prodInfo = productsByCode.get(lookupCode) || 
                     productsByCode.get(normalizedLookup) || 
                     productsByCode.get(paddedLookup8);

    if (!prodInfo) {
      status = 'UNKNOWN_PRODUCT';
      messages.push(`Product Code "${row.productCode}" does not exist in Product Master.`);
    }

    // Pallet * CasesPerPallet check
    const calculatedCases = row.pallets * row.casesPerPallet;
    if (Math.abs(calculatedCases - row.cases) > 0.01) {
      if (status === 'VALID') status = 'WARNING';
      messages.push(
        `Pallets (${row.pallets}) * Cases/Pallet (${row.casesPerPallet}) = ${calculatedCases} does not match Cases (${row.cases}). Supplied cases (${row.cases}) will be used as demand.`
      );
    }

    // Date / Derived status
    const derivedStatus = deriveStoStatus(row.barrowCollectionDate!);

    // Check duplicate or existing STO in DB
    const existing = existingByStoNumber.get(row.stoNumber);
    let existingReqId: string | null = null;

    if (existing) {
      existingReqId = existing.id;
      const existingDelDate = (existing.northfleetDeliveryDate as any)?.toDate
        ? (existing.northfleetDeliveryDate as any).toDate().toISOString().substring(0, 10)
        : new Date(existing.northfleetDeliveryDate as any).toISOString().substring(0, 10);
      const newDelDate = row.northfleetDeliveryDate!.toISOString().substring(0, 10);

      const isSameProduct = existing.productCode === row.productCode;
      const isSameDate = existingDelDate === newDelDate;
      const isSamePallets = Math.abs(existing.pallets - row.pallets) < 0.01;
      const isSameCases = Math.abs(existing.cases - row.cases) < 0.01;

      if (isSameProduct && isSameDate && isSamePallets && isSameCases) {
        if (status === 'VALID') status = 'DUPLICATE_STO';
        messages.push(`STO ${row.stoNumber} is already recorded with identical details.`);
      } else {
        if (status === 'VALID') status = 'EXISTING_STO_CHANGED';
        messages.push(`STO ${row.stoNumber} already exists in DB with different details and will be updated.`);
      }
    } else if (batchStoNumbers.has(row.stoNumber)) {
      if (status === 'VALID') status = 'DUPLICATE_STO';
      messages.push(`STO ${row.stoNumber} appears multiple times in the paste batch.`);
    }

    batchStoNumbers.add(row.stoNumber);

    validated.push({
      ...row,
      validationStatus: status,
      validationMessages: messages,
      matchedProductId: prodInfo ? prodInfo.id : null,
      matchedProductDescription: prodInfo ? prodInfo.description : null,
      matchedDestinationId: northfleetDestId,
      matchedDestinationCode: northfleetDestCode,
      existingRequirementId: existingReqId,
      previousProductId: existing?.productId || null,
      previousProductCode: existing?.productCode || null,
      derivedStatus
    });
  }

  return validated;
};

/**
 * Commit validated STO requirements to Firestore.
 */
export const commitNorthfleetStoRequirements = async (
  tenantId: string,
  siteId: string,
  validatedRows: ValidatedStoRow[],
  userId: string = 'planner-user',
  notes?: string
): Promise<ServiceResult<{ importId: string; committedCount: number; updatedCount: number }>> => {
  try {
    const validRowsToProcess = validatedRows.filter(
      r => r.validationStatus !== 'UNKNOWN_PRODUCT' && r.northfleetDeliveryDate !== null && r.matchedProductId !== null
    );

    if (validRowsToProcess.length === 0) {
      return { success: false, error: 'No valid rows to commit.' };
    }

    // 1. Create NorthfleetStoImport record
    const importId = crypto.randomUUID();

    const minDate = validRowsToProcess.reduce((min, r) => (!min || r.northfleetDeliveryDate! < min ? r.northfleetDeliveryDate! : min), null as Date | null);
    const maxDate = validRowsToProcess.reduce((max, r) => (!max || r.northfleetDeliveryDate! > max ? r.northfleetDeliveryDate! : max), null as Date | null);

    const importDoc = {
      id: importId,
      tenantId,
      siteId,
      importedBy: userId,
      rowCount: validatedRows.length,
      validRowCount: validRowsToProcess.length,
      status: 'COMMITTED'
    };

    const { error: importErr } = await supabase
      .from('northfleet_sto_imports')
      .insert(toSnakeCase(importDoc));
    if (importErr) throw importErr;

    let committedCount = 0;
    let updatedCount = 0;
    const affectedProductIds = new Set<string>();
    const inserts: any[] = [];

    for (const row of validRowsToProcess) {
      affectedProductIds.add(row.matchedProductId!);
      if (row.previousProductId && row.previousProductId !== row.matchedProductId) {
        affectedProductIds.add(row.previousProductId);
      }

      if (row.existingRequirementId && row.validationStatus === 'EXISTING_STO_CHANGED') {
        // Update existing STO record with updated product details, dates, and quantities
        const { error: updateErr } = await supabase
          .from('northfleet_sto_requirements')
          .update(toSnakeCase({
            productId: row.matchedProductId!,
            productCode: row.productCode,
            productDescriptionSnapshot: row.matchedProductDescription || row.productCode,
            destinationId: row.matchedDestinationId || 'DEST_NORTHFLEET',
            destinationCode: row.matchedDestinationCode || 'NORTHFLEET',
            northfleetDeliveryDate: row.northfleetDeliveryDate!.toISOString(),
            barrowCollectionDate: row.barrowCollectionDate!.toISOString(),
            pallets: row.pallets,
            cases: row.cases,
            casesPerPalletSnapshot: row.casesPerPallet,
            importId,
            status: row.derivedStatus,
            modifiedBy: userId,
            modifiedDate: new Date().toISOString()
          }))
          .eq('id', row.existingRequirementId);
        
        if (updateErr) throw updateErr;
        updatedCount++;
      } else if (row.validationStatus !== 'DUPLICATE_STO') {
        // Create new STO record
        inserts.push({
          tenantId,
          siteId,
          stoNumber: row.stoNumber,
          productId: row.matchedProductId!,
          productCode: row.productCode,
          productDescriptionSnapshot: row.matchedProductDescription || row.productCode,
          destinationId: row.matchedDestinationId || 'DEST_NORTHFLEET',
          destinationCode: row.matchedDestinationCode || 'NORTHFLEET',
          northfleetDeliveryDate: row.northfleetDeliveryDate!.toISOString(),
          barrowCollectionDate: row.barrowCollectionDate!.toISOString(),
          pallets: row.pallets,
          cases: row.cases,
          casesPerPalletSnapshot: row.casesPerPallet,
          importId,
          status: row.derivedStatus,
          createdBy: userId,
          createdDate: new Date().toISOString(),
          modifiedBy: userId,
          modifiedDate: new Date().toISOString()
        });
        committedCount++;
      }
    }

    if (inserts.length > 0) {
      const { error: insertErr } = await supabase
        .from('northfleet_sto_requirements')
        .insert(inserts.map(item => toSnakeCase(item)));
      if (insertErr) throw insertErr;
    }

    // Log Audit Event
    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'NORTHFLEET_STO_IMPORT_COMMIT',
      entityType: 'NORTHFLEET_STO_IMPORT',
      entityId: importId,
      summary: `Committed Northfleet STO import batch with ${committedCount} new/updated requirements`,
      performedBy: userId,
      metadata: {
        totalRows: validatedRows.length,
        committedCount,
        updatedCount,
        affectedProductsCount: affectedProductIds.size,
        notes
      }
    });

    // Re-evaluate recommendations for all affected products
    for (const prodId of affectedProductIds) {
      await generateRecommendationForProduct(tenantId, siteId, prodId, true);
    }

    return {
      success: true,
      data: {
        importId,
        committedCount,
        updatedCount
      }
    };
  } catch (error: any) {
    console.error('Failed to commit STO requirements:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get total outstanding STO cases for a specific product (status UPCOMING or DUE_FOR_COLLECTION).
 */
export const getOutstandingStoCasesForProduct = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<number> => {
  try {
    const docs = await getDocuments<NorthfleetStoRequirement>(
      STO_REQUIREMENTS_COLLECTION,
      [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', productId)
      ]
    );

    let totalCases = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    docs.forEach(data => {
      if (data.status === 'CANCELLED') return;

      const collDate = new Date(data.barrowCollectionDate as any);
      collDate.setHours(0, 0, 0, 0);

      // Status logic: UPCOMING (> today) or DUE_FOR_COLLECTION (== today)
      if (collDate.getTime() >= today.getTime()) {
        totalCases += data.cases || 0;
      }
    });

    return totalCases;
  } catch (error: any) {
    console.error(`Error calculating STO cases for product ${productId}:`, error);
    throw new Error(`Failed to retrieve Northfleet STO requirements for product ${productId}: ${error?.message || error}`);
  }
};

/**
 * Get all active STO requirements for tenant & site.
 */
export const getNorthfleetStoRequirements = async (
  tenantId: string,
  siteId: string
): Promise<NorthfleetStoRequirement[]> => {
  try {
    const docs = await getDocuments<NorthfleetStoRequirement>(
      STO_REQUIREMENTS_COLLECTION,
      [where('tenantId', '==', tenantId), where('siteId', '==', siteId)]
    );

    const localControls = getLocalDispatchControls();
    const localSubstitutions = getLocalSubstitutions();
    const list: NorthfleetStoRequirement[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    docs.forEach(data => {
      let currentStatus = data.status;
      const local = localControls[data.id];
      const localSub = localSubstitutions[data.id];
      const dispatchMode = local?.dispatchMode || data.dispatchMode || 'AUTOMATIC';
      const manualStatus = local?.manualStatus || data.manualStatus || 'PENDING';
      const actualDespatchDate = local?.actualDespatchDate !== undefined ? local.actualDespatchDate : data.actualDespatchDate;

      // Merge substitution data if present
      const productId = localSub?.substitutedProductId || data.productId;
      const productCode = localSub?.substitutedProductCode || data.productCode;
      const originalProductId = localSub?.originalProductId || data.originalProductId;
      const originalProductCode = localSub?.originalProductCode || data.originalProductCode;
      const originalProductDescriptionSnapshot = localSub?.originalProductDescriptionSnapshot || data.originalProductDescriptionSnapshot;
      const substitutedProductId = localSub?.substitutedProductId || data.substitutedProductId;
      const substitutedProductCode = localSub?.substitutedProductCode || data.substitutedProductCode;
      const substitutionDate = localSub?.substitutionDate || data.substitutionDate;
      const isBacklogRetained = localSub?.isBacklogRetained !== undefined ? localSub.isBacklogRetained : data.isBacklogRetained;
      const cases = localSub?.cases !== undefined ? localSub.cases : data.cases;
      const casesPerPalletSnapshot = localSub?.casesPerPalletSnapshot !== undefined ? localSub.casesPerPalletSnapshot : data.casesPerPalletSnapshot;

      if (dispatchMode === 'MANUAL') {
        if (manualStatus === 'DESPATCHED') {
          currentStatus = 'ASSUMED_DISPATCHED';
        } else if (manualStatus === 'HOLD') {
          currentStatus = 'UPCOMING';
        }
      } else if (currentStatus !== 'CANCELLED') {
        const collDate = new Date(data.barrowCollectionDate as any);
        collDate.setHours(0, 0, 0, 0);

        if (collDate.getTime() > today.getTime()) {
          currentStatus = 'UPCOMING';
        } else if (collDate.getTime() === today.getTime()) {
          currentStatus = 'DUE_FOR_COLLECTION';
        } else {
          currentStatus = 'ASSUMED_DISPATCHED';
        }
      }

      list.push({
        ...data,
        productId,
        productCode,
        cases,
        casesPerPalletSnapshot,
        originalProductId,
        originalProductCode,
        originalProductDescriptionSnapshot,
        substitutedProductId,
        substitutedProductCode,
        substitutionDate,
        isBacklogRetained,
        dispatchMode,
        manualStatus,
        actualDespatchDate,
        status: currentStatus
      });
    });

    // Sort by Barrow Collection Date ascending
    list.sort((a, b) => {
      const timeA = a.barrowCollectionDate ? new Date(a.barrowCollectionDate as any).getTime() : 0;
      const timeB = b.barrowCollectionDate ? new Date(b.barrowCollectionDate as any).getTime() : 0;
      return timeA - timeB;
    });

    return list;
  } catch (error: any) {
    console.error('Failed to fetch STO requirements:', error);
    throw new Error(`Failed to retrieve Northfleet STO requirements: ${error?.message || error}`);
  }
};

/**
 * Cancel an STO requirement and recalculate product recommendations.
 */
export const cancelNorthfleetStoRequirement = async (
  tenantId: string,
  siteId: string,
  stoId: string,
  userId: string = 'planner-user'
): Promise<ServiceResult<void>> => {
  try {
    const data = await getDocument<NorthfleetStoRequirement>(STO_REQUIREMENTS_COLLECTION, stoId);
    if (!data) return { success: false, error: 'STO requirement not found' };

    const { error: updateErr } = await supabase
      .from('northfleet_sto_requirements')
      .update(toSnakeCase({
        status: 'CANCELLED',
        modifiedBy: userId,
        modifiedDate: new Date().toISOString()
      }))
      .eq('id', stoId);
    if (updateErr) throw updateErr;

    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'NORTHFLEET_STO_CANCEL',
      entityType: 'NORTHFLEET_STO_REQUIREMENT',
      entityId: stoId,
      summary: `Cancelled Northfleet STO requirement ${data.stoNumber} for product ${data.productCode}`,
      performedBy: userId,
      metadata: {
        stoNumber: data.stoNumber,
        productCode: data.productCode,
        cases: data.cases
      }
    });

    // Re-evaluate product recommendation
    await generateRecommendationForProduct(tenantId, siteId, data.productId, true);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to cancel STO requirement:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Update an existing STO requirement and recalculate product recommendations.
 */
export const updateNorthfleetStoRequirement = async (
  tenantId: string,
  siteId: string,
  stoId: string,
  updates: Partial<NorthfleetStoRequirement>,
  userId: string = 'planner-user'
): Promise<ServiceResult<void>> => {
  try {
    const data = await getDocument<NorthfleetStoRequirement>(STO_REQUIREMENTS_COLLECTION, stoId);
    if (!data) return { success: false, error: 'STO requirement not found' };

    const { error: updateErr } = await supabase
      .from('northfleet_sto_requirements')
      .update(toSnakeCase({
        ...updates,
        modifiedBy: userId,
        modifiedDate: new Date().toISOString()
      }))
      .eq('id', stoId);
    if (updateErr) throw updateErr;

    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'NORTHFLEET_STO_UPDATE',
      entityType: 'NORTHFLEET_STO_REQUIREMENT',
      entityId: stoId,
      summary: `Updated Northfleet STO requirement ${data.stoNumber} for product ${data.productCode}`,
      performedBy: userId,
      metadata: {
        stoNumber: data.stoNumber,
        productCode: data.productCode,
        updates
      }
    });

    // Re-evaluate product recommendation
    await generateRecommendationForProduct(tenantId, siteId, data.productId, true);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to update STO requirement:', error);
    return { success: false, error: error.message };
  }
};

export interface StoFeasibility {
  stoId: string;
  productCode: string;
  requiredCases: number;
  availableStockCases: number;
  allocatedCases?: number;
  shortfallCases?: number;
  remainingStockAfter?: number;
  isDespatched?: boolean;
  feasibilityStatus: 'GREEN' | 'AMBER' | 'RED';
}

/**
 * Check if an STO requirement is already completed, dispatched, or cancelled.
 * STOs with status 'Assumed Sent' or 'Despatched' must not consume from pending on-hand stock.
 */
export const isStoDespatchedOrSent = (req: NorthfleetStoRequirement): boolean => {
  if (req.status === 'CANCELLED') return true;
  if (req.dispatchMode === 'MANUAL') {
    return req.manualStatus === 'DESPATCHED';
  }
  return req.status === 'ASSUMED_DISPATCHED';
};

export const updateStoDispatchControl = async (
  tenantId: string,
  siteId: string,
  stoId: string,
  dispatchMode: 'AUTOMATIC' | 'MANUAL',
  manualStatus?: 'PENDING' | 'DESPATCHED' | 'HOLD',
  userId: string = 'planner-user'
): Promise<ServiceResult<void>> => {
  try {
    const data = await getDocument<NorthfleetStoRequirement>(STO_REQUIREMENTS_COLLECTION, stoId);
    if (!data) return { success: false, error: 'STO requirement not found' };

    const actualDespatchDate = manualStatus === 'DESPATCHED' ? new Date().toISOString() : null;

    // Save locally for guaranteed persistence
    saveLocalDispatchControl(stoId, dispatchMode, manualStatus, actualDespatchDate);

    // Attempt Supabase update (ignoring schema column errors if columns haven't been migrated yet)
    try {
      const updates: any = {
        dispatchMode,
        manualStatus,
        actualDespatchDate,
        modifiedBy: userId,
        modifiedDate: new Date().toISOString()
      };
      await supabase
        .from('northfleet_sto_requirements')
        .update(toSnakeCase(updates))
        .eq('id', stoId);
    } catch (dbErr) {
      console.warn('Supabase schema update skipped, using local persistence overlay:', dbErr);
    }

    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'NORTHFLEET_STO_UPDATE',
      entityType: 'NORTHFLEET_STO_REQUIREMENT',
      entityId: stoId,
      summary: `Updated STO dispatch control for ${data.stoNumber}: mode=${dispatchMode}, status=${manualStatus}`,
      performedBy: userId,
      metadata: { stoNumber: data.stoNumber, dispatchMode, manualStatus }
    });

    await generateRecommendationForProduct(tenantId, siteId, data.productId, true);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to update STO dispatch control:', error);
    return { success: false, error: error.message };
  }
};

export interface EligibleSubstituteProduct {
  product: Product;
  casesPerPallet: number;
  totalOnHandCases: number;
  totalOnHandPallets: number;
  ddxmRetentionCases: number;
  minRetentionCases: number;
  planningProtectedCases: number;
  otherStoProtectedCases: number;
  totalProtectedCases: number;
  availableCases: number;
  availablePallets: number;
  stoRequiredCases: number;
  stoRequiredPallets: number;
  remainingCasesAfterSub: number;
  remainingPalletsAfterSub: number;
  isEligible: boolean;
  ineligibilityReason?: string;
}

/**
 * Evaluates candidate products for substituting an STO requirement.
 * Enforces strict inventory protection rules:
 * 1. Only products with available stock are considered.
 * 2. Products with less than 52 pallets available are filtered out (isEligible = false).
 * 3. The substitution quantity must NOT take away from other protected stocks (DDXM retention, planning minimums, or other active Northfleet STOs).
 */
export const getEligibleSubstituteProducts = async (
  tenantId: string,
  siteId: string,
  targetSto: NorthfleetStoRequirement
): Promise<EligibleSubstituteProduct[]> => {
  try {
    // 1. Fetch products, inventory balances, planning rules, and all STO requirements in parallel
    const [products, balances, rules, existingStos] = await Promise.all([
      getDocuments<Product>(PRODUCTS_COLLECTION, [where('tenantId', '==', tenantId)]),
      getDocuments<any>('inventoryBalances', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getDocuments<ProductPlanningRule>('planningRules', [
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId)
      ]),
      getNorthfleetStoRequirements(tenantId, siteId)
    ]);

    // 2. Map inventory balances by productId and productCode
    const stockByProductId = new Map<string, number>();
    const stockByProductCode = new Map<string, number>();
    balances.forEach(b => {
      const qty = Number(b.quantity) || 0;
      if (b.productId) {
        stockByProductId.set(b.productId, (stockByProductId.get(b.productId) || 0) + qty);
      }
      if (b.productCode) {
        stockByProductCode.set(b.productCode.toUpperCase(), (stockByProductCode.get(b.productCode.toUpperCase()) || 0) + qty);
      }
    });

    // 3. Map active planning rules
    const ruleByProductId = new Map<string, ProductPlanningRule>();
    rules.forEach(r => {
      if (r.productId && (!ruleByProductId.has(r.productId) || r.status === 'active')) {
        ruleByProductId.set(r.productId, r);
      }
    });

    // 4. Map committed/protected STO cases from other active STOs
    const otherStoCasesByProductId = new Map<string, number>();
    const otherStoCasesByProductCode = new Map<string, number>();
    existingStos.forEach(sto => {
      // Exclude target STO itself being substituted
      if (sto.id === targetSto.id) return;
      // Exclude already despatched, assumed despatched, or cancelled STOs
      if (isStoDespatchedOrSent(sto)) return;

      const cases = Number(sto.cases) || 0;
      if (sto.productId) {
        otherStoCasesByProductId.set(
          sto.productId,
          (otherStoCasesByProductId.get(sto.productId) || 0) + cases
        );
      }
      if (sto.productCode) {
        const codeUpper = sto.productCode.toUpperCase();
        otherStoCasesByProductCode.set(
          codeUpper,
          (otherStoCasesByProductCode.get(codeUpper) || 0) + cases
        );
      }
    });

    const results: EligibleSubstituteProduct[] = [];

    // 5. Evaluate each product
    for (const p of products) {
      // Exclude current scheduled product of the STO
      const isCurrentProduct = (targetSto.productId && p.id === targetSto.productId) ||
        (targetSto.productCode && p.productCode.toUpperCase() === targetSto.productCode.toUpperCase());
      if (isCurrentProduct) continue;

      const cpp = p.casesPerPallet || p.configurations?.[0]?.casesPerPallet || 1;
      const totalOnHandCases = stockByProductId.get(p.id) ?? stockByProductCode.get(p.productCode.toUpperCase()) ?? 0;
      const totalOnHandPallets = Math.floor(totalOnHandCases / cpp);

      // Planning rule protection (DDXM & Min)
      const rule = ruleByProductId.get(p.id);
      const ddxmRetentionCases = Number(rule?.ddxmRetentionQuantity) || 0;
      const minRetentionCases = Number(rule?.minimumQuantity) || 0;
      let planningProtectedCases = 0;

      if (rule) {
        switch (rule.controllingThresholdMode) {
          case 'HIGHEST_MANDATORY':
            planningProtectedCases = Math.max(minRetentionCases, ddxmRetentionCases);
            break;
          case 'DDXM_ONLY':
            planningProtectedCases = ddxmRetentionCases;
            break;
          case 'MINIMUM_ONLY':
            planningProtectedCases = minRetentionCases;
            break;
          case 'CUSTOM':
            planningProtectedCases = Number(rule.customControllingRetentionQuantity) || 0;
            break;
          default:
            planningProtectedCases = Math.max(minRetentionCases, ddxmRetentionCases);
        }
      }

      // Other active Northfleet STO committed protection
      const otherStoProtectedCases = otherStoCasesByProductId.get(p.id) ?? otherStoCasesByProductCode.get(p.productCode.toUpperCase()) ?? 0;
      const totalProtectedCases = planningProtectedCases + otherStoProtectedCases;

      // Unprotected stock available
      const availableCases = Math.max(0, totalOnHandCases - totalProtectedCases);
      const availablePallets = Math.floor(availableCases / cpp);

      // Required quantity for target STO if substituted to this product
      const stoRequiredPallets = targetSto.pallets || Math.ceil((targetSto.cases || 0) / cpp);
      const stoRequiredCases = stoRequiredPallets * cpp;

      const remainingCasesAfterSub = availableCases - stoRequiredCases;
      const remainingPalletsAfterSub = Math.floor(remainingCasesAfterSub / cpp);

      // Eligibility checks:
      // 1. Must have >= 52 pallets available
      // 2. Must not take away from other protected stocks (availableCases >= stoRequiredCases)
      let isEligible = true;
      let ineligibilityReason: string | undefined = undefined;

      if (availablePallets < 52) {
        isEligible = false;
        ineligibilityReason = `Only ${availablePallets} pallets available (minimum 52 pallets required).`;
      } else if (availableCases < stoRequiredCases || remainingCasesAfterSub < 0) {
        isEligible = false;
        ineligibilityReason = `Required ${stoRequiredCases.toLocaleString()} cases (${stoRequiredPallets} plts) exceeds unprotected available stock (${availableCases.toLocaleString()} cases) and would breach DDXM or STO protected reserves.`;
      }

      results.push({
        product: p,
        casesPerPallet: cpp,
        totalOnHandCases,
        totalOnHandPallets,
        ddxmRetentionCases,
        minRetentionCases,
        planningProtectedCases,
        otherStoProtectedCases,
        totalProtectedCases,
        availableCases,
        availablePallets,
        stoRequiredCases,
        stoRequiredPallets,
        remainingCasesAfterSub,
        remainingPalletsAfterSub,
        isEligible,
        ineligibilityReason
      });
    }

    // Sort: Eligible first, then highest available pallets descending
    results.sort((a, b) => {
      if (a.isEligible !== b.isEligible) return a.isEligible ? -1 : 1;
      return b.availablePallets - a.availablePallets;
    });

    return results;
  } catch (err) {
    console.error('Error fetching eligible substitute products:', err);
    return [];
  }
};

export interface StoProductSubstitutionRequest {
  tenantId: string;
  siteId: string;
  stoId: string;
  newProductId: string;
  newProductCode: string;
  newProductDescription?: string;
  newCasesPerPallet?: number;
  retainOriginalBacklog: boolean;
  userId: string;
}

/**
 * Substitute product on an STO requirement when the original product is unavailable.
 * Retains original product demand metadata for deferred backlog fulfillment.
 * Triggers dual-product recommendation recalculation cascade for both original and substitute products.
 */
export const substituteStoProduct = async (
  req: StoProductSubstitutionRequest
): Promise<ServiceResult<void>> => {
  try {
    const current = await getDocument<NorthfleetStoRequirement>(STO_REQUIREMENTS_COLLECTION, req.stoId);
    if (!current) return { success: false, error: 'STO requirement not found' };

    const newCpp = req.newCasesPerPallet || current.casesPerPalletSnapshot || 1;
    const newCases = current.pallets ? (current.pallets * newCpp) : current.cases;

    const originalProductId = current.originalProductId || current.productId;
    const originalProductCode = current.originalProductCode || current.productCode;
    const originalProductDescriptionSnapshot = current.originalProductDescriptionSnapshot || current.productDescriptionSnapshot || '';
    const substitutionDate = new Date().toISOString();

    const subData: LocalStoSubstitution = {
      originalProductId,
      originalProductCode,
      originalProductDescriptionSnapshot,
      substitutedProductId: req.newProductId,
      substitutedProductCode: req.newProductCode,
      substitutionDate,
      isBacklogRetained: req.retainOriginalBacklog,
      cases: newCases,
      casesPerPalletSnapshot: newCpp
    };

    saveLocalSubstitution(req.stoId, subData);

    const updates = {
      productId: req.newProductId,
      productCode: req.newProductCode,
      productDescriptionSnapshot: req.newProductDescription || current.productDescriptionSnapshot,
      casesPerPalletSnapshot: newCpp,
      cases: newCases,
      originalProductId,
      originalProductCode,
      originalProductDescriptionSnapshot,
      substitutedProductId: req.newProductId,
      substitutedProductCode: req.newProductCode,
      substitutionDate,
      isBacklogRetained: req.retainOriginalBacklog,
      modifiedBy: req.userId,
      modifiedDate: substitutionDate
    };

    try {
      await supabase
        .from('northfleet_sto_requirements')
        .update(toSnakeCase(updates))
        .eq('id', req.stoId);
    } catch (dbErr) {
      console.warn('Supabase update skipped (using local overlay):', dbErr);
    }

    await logAuditEvent({
      tenantId: req.tenantId,
      siteId: req.siteId,
      eventType: 'NORTHFLEET_STO_UPDATE',
      entityType: 'NORTHFLEET_STO_REQUIREMENT',
      entityId: req.stoId,
      summary: `Substituted product on STO ${current.stoNumber}: ${originalProductCode} -> ${req.newProductCode} (Backlog retained: ${req.retainOriginalBacklog ? 'Yes' : 'No'})`,
      performedBy: req.userId,
      metadata: {
        stoNumber: current.stoNumber,
        originalProductCode,
        newProductCode: req.newProductCode,
        newCases,
        newCpp,
        retainOriginalBacklog: req.retainOriginalBacklog
      }
    });

    // Cascade recalculation: recalculate recommendations for BOTH the original product and the new substituted product!
    await generateRecommendationForProduct(req.tenantId, req.siteId, originalProductId, true);
    if (req.newProductId !== originalProductId) {
      await generateRecommendationForProduct(req.tenantId, req.siteId, req.newProductId, true);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Failed to substitute STO product:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Calculate batch STO feasibility using Cumulative Waterfall Stock Allocation (Plan A).
 * - STOs that have status as 'Assumed Sent' or 'Despatched' are excluded from consuming available stock.
 * - Active pending STOs for each product are sorted chronologically (by Barrow Collection Date, then STO #).
 * - Available inventory is sequentially allocated down the waterfall queue.
 * - Resulting feasibility is marked GREEN (Fully Covered), AMBER (Partial), or RED (Deficit/Out of Stock).
 */
export const calculateBatchStoFeasibility = async (
  tenantId: string,
  siteId: string,
  requirements: NorthfleetStoRequirement[]
): Promise<Map<string, StoFeasibility>> => {
  const resultMap = new Map<string, StoFeasibility>();
  if (!requirements || requirements.length === 0) return resultMap;

  try {
    // 1. Fetch all inventory balances for tenant & site in one query
    const balances = await getDocuments<any>('inventoryBalances', [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    ]);

    // Map total physical stock by productId and productCode
    const stockByProductId = new Map<string, number>();
    const stockByProductCode = new Map<string, number>();

    balances.forEach(b => {
      const qty = Number(b.quantity) || 0;
      if (b.productId) {
        stockByProductId.set(b.productId, (stockByProductId.get(b.productId) || 0) + qty);
      }
      if (b.productCode) {
        stockByProductCode.set(b.productCode.toUpperCase(), (stockByProductCode.get(b.productCode.toUpperCase()) || 0) + qty);
      }
    });

    // 2. Group requirements by product key (prefer productId, fallback to productCode)
    const stosByProductKey = new Map<string, NorthfleetStoRequirement[]>();
    requirements.forEach(req => {
      const key = req.productId || req.productCode.toUpperCase();
      if (!stosByProductKey.has(key)) {
        stosByProductKey.set(key, []);
      }
      stosByProductKey.get(key)!.push(req);
    });

    // 3. Perform Cumulative Waterfall Allocation per product
    for (const [productKey, productStos] of stosByProductKey.entries()) {
      const prodCodeUpper = (productStos[0]?.productCode || '').toUpperCase();
      const initialStock = stockByProductId.get(productKey) ?? 
        stockByProductCode.get(prodCodeUpper) ?? 
        stockByProductId.get(productStos[0]?.productId || '') ?? 0;

      let remainingStock = initialStock;

      // Separate into already dispatched/sent vs active pending STOs
      const dispatchedStos: NorthfleetStoRequirement[] = [];
      const pendingStos: NorthfleetStoRequirement[] = [];

      productStos.forEach(sto => {
        if (isStoDespatchedOrSent(sto)) {
          dispatchedStos.push(sto);
        } else {
          pendingStos.push(sto);
        }
      });

      // Dispatched / Assumed Sent STOs do NOT consume pending on-hand stock
      dispatchedStos.forEach(sto => {
        resultMap.set(sto.id, {
          stoId: sto.id,
          productCode: sto.productCode,
          requiredCases: sto.cases || 0,
          availableStockCases: initialStock,
          allocatedCases: sto.cases || 0,
          shortfallCases: 0,
          remainingStockAfter: remainingStock,
          isDespatched: true,
          feasibilityStatus: 'GREEN'
        });
      });

      // Sort pending STOs chronologically by Barrow Collection Date (earliest first), then STO #
      pendingStos.sort((a, b) => {
        const timeA = a.barrowCollectionDate ? new Date(a.barrowCollectionDate).getTime() : 0;
        const timeB = b.barrowCollectionDate ? new Date(b.barrowCollectionDate).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.stoNumber || '').localeCompare(b.stoNumber || '');
      });

      // Allocate stock sequentially down the waterfall
      for (const sto of pendingStos) {
        const reqCases = sto.cases || 0;
        let allocated = 0;
        let shortfall = 0;
        let status: 'GREEN' | 'AMBER' | 'RED' = 'RED';

        if (remainingStock >= reqCases) {
          allocated = reqCases;
          remainingStock -= reqCases;
          shortfall = 0;
          status = 'GREEN';
        } else if (remainingStock > 0) {
          allocated = remainingStock;
          shortfall = reqCases - remainingStock;
          remainingStock = 0;
          status = 'AMBER';
        } else {
          allocated = 0;
          shortfall = reqCases;
          status = 'RED';
        }

        resultMap.set(sto.id, {
          stoId: sto.id,
          productCode: sto.productCode,
          requiredCases: reqCases,
          availableStockCases: initialStock,
          allocatedCases: allocated,
          shortfallCases: shortfall,
          remainingStockAfter: remainingStock,
          isDespatched: false,
          feasibilityStatus: status
        });
      }
    }

    return resultMap;
  } catch (err) {
    console.error('Error calculating batch STO feasibility:', err);
    // Fallback: mark all as RED
    requirements.forEach(sto => {
      resultMap.set(sto.id, {
        stoId: sto.id,
        productCode: sto.productCode,
        requiredCases: sto.cases || 0,
        availableStockCases: 0,
        allocatedCases: 0,
        shortfallCases: sto.cases || 0,
        remainingStockAfter: 0,
        isDespatched: false,
        feasibilityStatus: 'RED'
      });
    });
    return resultMap;
  }
};

export const calculateStoFeasibility = async (
  tenantId: string,
  siteId: string,
  sto: NorthfleetStoRequirement
): Promise<StoFeasibility> => {
  const batchMap = await calculateBatchStoFeasibility(tenantId, siteId, [sto]);
  return batchMap.get(sto.id) || {
    stoId: sto.id,
    productCode: sto.productCode,
    requiredCases: sto.cases || 0,
    availableStockCases: 0,
    allocatedCases: 0,
    shortfallCases: sto.cases || 0,
    remainingStockAfter: 0,
    isDespatched: false,
    feasibilityStatus: 'RED'
  };
};

