import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { NorthfleetStoRequirement, NorthfleetStoImport, NorthfleetStoStatus } from '../../../types/production';
import { ServiceResult } from '../../../types/common';
import { logAuditEvent } from '../../../services/auditService';
import { generateRecommendationForProduct } from './recommendationService';

const STO_REQUIREMENTS_COLLECTION = 'northfleetStoRequirements';
const STO_IMPORTS_COLLECTION = 'northfleetStoImports';
const PRODUCTS_COLLECTION = 'products';
const DESTINATIONS_COLLECTION = 'destinations';

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
  const productsQuery = query(
    collection(db, PRODUCTS_COLLECTION),
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId)
  );
  const prodSnap = await getDocs(productsQuery);
  const productsByCode = new Map<string, { id: string; description: string; preferredDestinationId?: string }>();

  prodSnap.docs.forEach(doc => {
    const d = doc.data();
    const code = d.code || d.productCode || doc.id;
    const desc = d.description || d.productName || d.name || code;
    productsByCode.set(code, {
      id: doc.id,
      description: desc,
      preferredDestinationId: d.preferredDestinationId
    });
  });

  // 2. Fetch Northfleet destination if configured
  const destQuery = query(
    collection(db, DESTINATIONS_COLLECTION),
    where('tenantId', '==', tenantId)
  );
  const destSnap = await getDocs(destQuery);
  let northfleetDestId = 'DEST_NORTHFLEET';
  let northfleetDestCode = 'NORTHFLEET';

  destSnap.docs.forEach(doc => {
    const d = doc.data();
    if (d.destinationCode?.toUpperCase() === 'NORTHFLEET' || d.destinationName?.toLowerCase().includes('northfleet')) {
      northfleetDestId = doc.id;
      northfleetDestCode = d.destinationCode || 'NORTHFLEET';
    }
  });

  // 3. Fetch existing STO requirements from DB
  const existingStoQuery = query(
    collection(db, STO_REQUIREMENTS_COLLECTION),
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId)
  );
  const existingSnap = await getDocs(existingStoQuery);
  const existingByStoNumber = new Map<string, NorthfleetStoRequirement>();

  existingSnap.docs.forEach(doc => {
    const d = doc.data() as NorthfleetStoRequirement;
    existingByStoNumber.set(d.stoNumber, { id: doc.id, ...d });
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
    const prodInfo = productsByCode.get(row.productCode);
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

    const batch = writeBatch(db);

    // 1. Create NorthfleetStoImport record
    const importRef = doc(collection(db, STO_IMPORTS_COLLECTION));
    const importId = importRef.id;

    const minDate = validRowsToProcess.reduce((min, r) => (!min || r.northfleetDeliveryDate! < min ? r.northfleetDeliveryDate! : min), null as Date | null);
    const maxDate = validRowsToProcess.reduce((max, r) => (!max || r.northfleetDeliveryDate! > max ? r.northfleetDeliveryDate! : max), null as Date | null);

    const importDoc: Omit<NorthfleetStoImport, 'id'> = {
      tenantId,
      siteId,
      importedAt: Timestamp.now(),
      importedBy: userId,
      rowCount: validatedRows.length,
      validRowCount: validRowsToProcess.length,
      warningCount: validatedRows.filter(r => r.validationStatus === 'WARNING').length,
      errorCount: validatedRows.filter(r => r.validationStatus === 'UNKNOWN_PRODUCT' || !r.northfleetDeliveryDate).length,
      effectiveStartDate: minDate ? Timestamp.fromDate(minDate) : null,
      effectiveEndDate: maxDate ? Timestamp.fromDate(maxDate) : null,
      status: 'COMMITTED',
      notes: notes || 'Pasted STO Requirements',
      createdDate: Timestamp.now(),
      modifiedDate: Timestamp.now()
    };

    batch.set(importRef, importDoc);

    let committedCount = 0;
    let updatedCount = 0;
    const affectedProductIds = new Set<string>();

    for (const row of validRowsToProcess) {
      affectedProductIds.add(row.matchedProductId!);

      if (row.existingRequirementId && row.validationStatus === 'EXISTING_STO_CHANGED') {
        // Update existing STO record
        const stoRef = doc(db, STO_REQUIREMENTS_COLLECTION, row.existingRequirementId);
        batch.update(stoRef, {
          northfleetDeliveryDate: Timestamp.fromDate(row.northfleetDeliveryDate!),
          barrowCollectionDate: Timestamp.fromDate(row.barrowCollectionDate!),
          pallets: row.pallets,
          cases: row.cases,
          casesPerPalletSnapshot: row.casesPerPallet,
          importId,
          status: row.derivedStatus,
          modifiedBy: userId,
          modifiedDate: Timestamp.now()
        });
        updatedCount++;
      } else if (row.validationStatus !== 'DUPLICATE_STO') {
        // Create new STO record
        const stoRef = doc(collection(db, STO_REQUIREMENTS_COLLECTION));
        const stoDoc: Omit<NorthfleetStoRequirement, 'id'> = {
          tenantId,
          siteId,
          stoNumber: row.stoNumber,
          productId: row.matchedProductId!,
          productCode: row.productCode,
          productDescriptionSnapshot: row.matchedProductDescription || row.productCode,
          destinationId: row.matchedDestinationId || 'DEST_NORTHFLEET',
          destinationCode: row.matchedDestinationCode || 'NORTHFLEET',
          northfleetDeliveryDate: Timestamp.fromDate(row.northfleetDeliveryDate!),
          barrowCollectionDate: Timestamp.fromDate(row.barrowCollectionDate!),
          pallets: row.pallets,
          cases: row.cases,
          casesPerPalletSnapshot: row.casesPerPallet,
          importId,
          status: row.derivedStatus,
          createdBy: userId,
          createdDate: Timestamp.now(),
          modifiedBy: userId,
          modifiedDate: Timestamp.now()
        };
        batch.set(stoRef, stoDoc);
        committedCount++;
      }
    }

    await batch.commit();

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
    const q = query(
      collection(db, STO_REQUIREMENTS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId)
    );
    const snap = await getDocs(q);

    let totalCases = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    snap.docs.forEach(docSnap => {
      const data = docSnap.data() as NorthfleetStoRequirement;
      if (data.status === 'CANCELLED') return;

      const collDate = (data.barrowCollectionDate as any)?.toDate
        ? (data.barrowCollectionDate as any).toDate()
        : new Date(data.barrowCollectionDate as any);
      collDate.setHours(0, 0, 0, 0);

      // Status logic: UPCOMING (> today) or DUE_FOR_COLLECTION (== today)
      if (collDate.getTime() >= today.getTime()) {
        totalCases += data.cases || 0;
      }
    });

    return totalCases;
  } catch (error) {
    console.error(`Error calculating STO cases for product ${productId}:`, error);
    return 0;
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
    const q = query(
      collection(db, STO_REQUIREMENTS_COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );
    const snap = await getDocs(q);

    const list: NorthfleetStoRequirement[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    snap.docs.forEach(docSnap => {
      const data = docSnap.data() as NorthfleetStoRequirement;
      let currentStatus = data.status;

      if (currentStatus !== 'CANCELLED') {
        const collDate = (data.barrowCollectionDate as any)?.toDate
          ? (data.barrowCollectionDate as any).toDate()
          : new Date(data.barrowCollectionDate as any);
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
        id: docSnap.id,
        ...data,
        status: currentStatus
      });
    });

    // Sort by Barrow Collection Date ascending
    list.sort((a, b) => {
      const timeA = (a.barrowCollectionDate as any)?.seconds || 0;
      const timeB = (b.barrowCollectionDate as any)?.seconds || 0;
      return timeA - timeB;
    });

    return list;
  } catch (error) {
    console.error('Failed to fetch STO requirements:', error);
    return [];
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
    const ref = doc(db, STO_REQUIREMENTS_COLLECTION, stoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, error: 'STO requirement not found' };

    const data = snap.data() as NorthfleetStoRequirement;

    await updateDoc(ref, {
      status: 'CANCELLED',
      modifiedBy: userId,
      modifiedDate: Timestamp.now()
    });

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
    const ref = doc(db, STO_REQUIREMENTS_COLLECTION, stoId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, error: 'STO requirement not found' };

    const data = snap.data() as NorthfleetStoRequirement;

    await updateDoc(ref, {
      ...updates,
      modifiedBy: userId,
      modifiedDate: Timestamp.now()
    });

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
