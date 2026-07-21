import * as XLSX from 'xlsx';
import { db } from '../../../config/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  writeBatch,
  doc,
  Timestamp,
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import {
  ProductionPlanImport,
  ProductionPlanRow,
  ProductionPlanEntry,
  ProductionLinePlanNote,
  ProductionPlanImportStatus,
  ProductionPlanRowStatus
} from '../../../types/production';
import { Product } from '../../../types/product';
import { ProductionLine } from '../../../types/configuration';

// 1. Calculate File Hash
export const calculateFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// 2. Helper to Parse SAP Date Header (e.g. "Tue 21.07" or Serial Date)
export const parseSapDate = (dateStr: string, referenceYear: number = 2026): Date | null => {
  const cleaned = dateStr.trim();
  // Handles formatting like "Tue 21.07", "Wed 22.07", "21.07", "21/07", "Tue 21/07"
  const match = cleaned.match(/^([A-Za-z]{3}\s+)?(\d{1,2})[./](\d{1,2})$/);
  if (!match) return null;
  const day = parseInt(match[2], 10);
  const month = parseInt(match[3], 10) - 1; // 0-indexed month
  return new Date(Date.UTC(referenceYear, month, day, 0, 0, 0, 0));
};

export const resolveHeaderDate = (cellValue: any, referenceYear: number = 2026): Date | null => {
  if (!cellValue) return null;
  if (typeof cellValue === 'number') {
    // If it's serial date number, convert to date (Serial date 1 is Jan 1 1900)
    const date = new Date((cellValue - 25569) * 86400 * 1000);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  return parseSapDate(String(cellValue), referenceYear);
};

// 3. Inspect MPPS7 Workbook Structure
export interface WorkbookInspection {
  isValidMpps7: boolean;
  detectedWorksheetNames: string[];
  sampleHeaders: string[];
  error?: string;
}

export const inspectMpps7Workbook = (workbook: XLSX.WorkBook): WorkbookInspection => {
  try {
    const worksheetNames = workbook.SheetNames;
    if (worksheetNames.length === 0) {
      return { isValidMpps7: false, detectedWorksheetNames: [], sampleHeaders: [], error: 'Workbook is empty.' };
    }

    const firstSheetName = worksheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    if (!worksheet) {
      return { isValidMpps7: false, detectedWorksheetNames: worksheetNames, sampleHeaders: [], error: `Worksheet "${firstSheetName}" could not be loaded.` };
    }

    // Read first row to extract headers
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:Z1');
    const headers: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: range.s.r, c: col });
      const cell = worksheet[cellRef];
      if (cell && cell.v !== undefined) {
        headers.push(String(cell.v).trim());
      }
    }

    // Validate minimum required columns for MPPS7 format
    const hasResource = headers.some(h => h.toLowerCase() === 'resource');
    const hasProductNumber = headers.some(h => h.toLowerCase() === 'product number');
    const hasUom = headers.some(h => h.toLowerCase() === 'base unit of measure');
    const isValidMpps7 = hasResource && hasProductNumber && hasUom;

    return {
      isValidMpps7,
      detectedWorksheetNames: worksheetNames,
      sampleHeaders: headers
    };
  } catch (err) {
    return {
      isValidMpps7: false,
      detectedWorksheetNames: [],
      sampleHeaders: [],
      error: err instanceof Error ? err.message : 'Unknown inspection error'
    };
  }
};

// 4. Products & Production Lines Mapping
export const matchImportedProducts = async (tenantId: string): Promise<Record<string, Product>> => {
  if (!db) return {};
  const productsRef = collection(db, 'products');
  const q = query(productsRef, where('tenantId', '==', tenantId), where('status', '==', 'active'));
  const snap = await getDocs(q);
  const productsMap: Record<string, Product> = {};
  snap.forEach(docSnap => {
    const product = { id: docSnap.id, ...docSnap.data() } as Product;
    // Standardize SKU key with leading-zero trimming or exact matching
    productsMap[product.productCode.trim()] = product;
    // Also support padding up to 8 digits
    const paddedCode = product.productCode.trim().padStart(8, '0');
    productsMap[paddedCode] = product;
  });
  return productsMap;
};

export const matchProductionLines = async (tenantId: string, siteId: string): Promise<ProductionLine[]> => {
  if (!db) return [];
  const linesRef = collection(db, 'productionLines');
  const q = query(
    linesRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('status', '==', 'active')
  );
  const snap = await getDocs(q);
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as ProductionLine));
};

export const matchResourceToLine = (resourceCode: string, lines: ProductionLine[]): ProductionLine | null => {
  const cleanResource = resourceCode.toUpperCase().trim();
  const prefix = cleanResource.split('_')[0].toUpperCase().trim();

  // 1. Try match on sapResourceCode
  let matched = lines.find(l => l.sapResourceCode?.toUpperCase().trim() === cleanResource || l.sapResourceCode?.toUpperCase().trim() === prefix);
  if (matched) return matched;

  // 2. Try match on sapResourceAliases
  matched = lines.find(l => 
    Array.isArray(l.sapResourceAliases) && l.sapResourceAliases.some((alias: string) => alias.toUpperCase().trim() === cleanResource || alias.toUpperCase().trim() === prefix)
  );
  if (matched) return matched;

  // 3. Fallback exact match on lineCode (for seeded data)
  matched = lines.find(l => l.lineCode.toUpperCase().trim() === cleanResource || l.lineCode.toUpperCase().trim() === prefix);
  if (matched) return matched;

  // 4. Try containing match on name or code as final guess fallback
  matched = lines.find(l => {
    const code = l.lineCode.toUpperCase();
    const name = l.lineName.toUpperCase();
    return prefix.includes(code) || code.includes(prefix) || name.includes(prefix);
  });

  return matched || null;
};

// 5. Pallet Calculation
export const calculatePlannedPallets = (plannedCases: number, casesPerPallet: number): number => {
  if (!casesPerPallet || casesPerPallet <= 0) return plannedCases;
  return Math.round((plannedCases / casesPerPallet) * 100) / 100;
};

// 6. Validate & Parse MPPS7 Workbook Row-by-Row
export interface ParsedPlanPreview {
  summary: Omit<ProductionPlanImport, 'id' | 'createdDate' | 'modifiedDate'>;
  rows: Omit<ProductionPlanRow, 'createdDate'>[];
}

export const createImportPreview = async (
  workbook: XLSX.WorkBook,
  fileName: string,
  fileSize: number,
  fileHash: string,
  tenantId: string,
  siteId: string,
  uploadedBy: string,
  referenceYear: number = 2026
): Promise<ParsedPlanPreview> => {
  const inspection = inspectMpps7Workbook(workbook);
  if (!inspection.isValidMpps7) {
    throw new Error('File does not match the mandatory MPPS7 structure. Missing required headers.');
  }

  // 1. Check File-Level Validations from Firestore
  let isDuplicateFile = false;
  let isOlderThanActive = false;

  if (db) {
    try {
      const importsRef = collection(db, 'productionPlanImports');
      
      // Duplicate file check
      const dupQuery = query(
        importsRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('fileHash', '==', fileHash),
        where('status', '==', 'COMMITTED'),
        limit(1)
      );
      const dupSnap = await getDocs(dupQuery);
      if (!dupSnap.empty) {
        isDuplicateFile = true;
      }

      // Older than active check
      const activeQuery = query(
        importsRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'COMMITTED'),
        orderBy('periodStart', 'desc'),
        limit(1)
      );
      const activeSnap = await getDocs(activeQuery);
      if (!activeSnap.empty) {
        const activeImport = activeSnap.docs[0].data() as ProductionPlanImport;
        // If the current file's period ends before the active plan's period start
        // or we have some other logical check. Let's compare periodStart
        if (activeImport.periodStart) {
          // We don't have the new file's period start yet, but we will calculate it.
        }
      }
    } catch (e) {
      console.warn('Metadata checks failed or indexes not built yet:', e);
    }
  }

  // Load master data maps for validation & matching
  const productsMap = await matchImportedProducts(tenantId);
  const linesList = await matchProductionLines(tenantId, siteId);

  const firstSheetName = inspection.detectedWorksheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Use sheet_to_json to get raw rows
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  
  // Identify date columns
  if (rawRows.length === 0) {
    throw new Error('The workbook contains no active production planning rows.');
  }

  const sampleRow = rawRows[0];
  const keys = Object.keys(sampleRow);
  const dateColumns: { key: string; date: Date }[] = [];

  keys.forEach(k => {
    const date = resolveHeaderDate(k, referenceYear);
    if (date) {
      dateColumns.push({ key: k, date });
    }
  });

  if (dateColumns.length === 0) {
    throw new Error('Could not identify any valid production date columns in the sheet header.');
  }

  // Sort dates to resolve full period boundaries
  dateColumns.sort((a, b) => a.date.getTime() - b.date.getTime());
  const periodStart = dateColumns[0].date;
  const periodEnd = dateColumns[dateColumns.length - 1].date;

  // Let's finish the "Older Than Active" validation using calculated periodStart
  if (db && !isOlderThanActive) {
    try {
      const importsRef = collection(db, 'productionPlanImports');
      const activeQuery = query(
        importsRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('status', '==', 'COMMITTED'),
        orderBy('periodStart', 'desc'),
        limit(1)
      );
      const activeSnap = await getDocs(activeQuery);
      if (!activeSnap.empty) {
        const activeImport = activeSnap.docs[0].data() as ProductionPlanImport;
        if (activeImport.periodStart && periodStart.getTime() < activeImport.periodStart.toDate().getTime()) {
          isOlderThanActive = true;
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  const parsedRows: Omit<ProductionPlanRow, 'createdDate'>[] = [];
  let totalSourceRows = 0;
  let recognisedRows = 0;
  let ignoredRows = 0;
  let warningCount = 0;
  let errorCount = 0;

  // Unique identifier for this session preview
  const previewImportId = `preview_${Math.random().toString(36).substring(2, 11)}`;

  // Set to keep track of duplicates within the spreadsheet to identify DUPLICATE_SOURCE_ROW
  const seenRowsSet = new Set<string>();

  rawRows.forEach((row, idx) => {
    totalSourceRows++;
    const resourceVal = String(row['Resource'] || '').trim();
    const skuVal = String(row['Product Number'] || '').trim();
    const descVal = String(row['Product Short Description'] || '').trim();
    const uomVal = String(row['Base Unit of Measure'] || '').trim();
    const sheetTotalVal = row['Total'] !== undefined ? Number(String(row['Total']).replace(/,/g, '')) : null;

    if (!resourceVal && !skuVal) {
      ignoredRows++;
      return;
    }

    // Prefix line parsing
    const lineObj = matchResourceToLine(resourceVal, linesList);
    const productObj = productsMap[skuVal];

    // Read quantities for each date column
    let calculatedRowTotal = 0;

    dateColumns.forEach(dateCol => {
      const qtyRaw = row[dateCol.key];
      const qty = typeof qtyRaw === 'number' ? qtyRaw : parseInt(String(qtyRaw || '0').replace(/,/g, ''), 10);
      
      // Skip dates with zero plan to prevent Firestore document inflation
      if (!qty || qty <= 0) {
        return;
      }

      calculatedRowTotal += qty;

      const rowErrors: string[] = [];
      const rowWarnings: string[] = [];
      const validationCodes: string[] = [];
      let rowStatus: ProductionPlanRowStatus = 'VALID';

      // 1. Production Line Mappings
      if (!resourceVal) {
        rowErrors.push('Production line resource is missing.');
        validationCodes.push('PRODUCTION_LINE_MISSING');
        rowStatus = 'ERROR';
      } else if (!lineObj) {
        rowWarnings.push(`SAP Resource Code "${resourceVal}" is not configured in productionLines.`);
        validationCodes.push('PRODUCTION_LINE_NOT_CONFIGURED');
        rowStatus = 'WARNING';
      }

      // 2. Product/SKU Mappings
      if (!skuVal) {
        rowErrors.push('Product Material Number is missing.');
        validationCodes.push('PRODUCT_CODE_MISSING');
        rowStatus = 'ERROR';
      } else if (!productObj) {
        rowWarnings.push(`Product SKU "${skuVal}" not found in Product Master database.`);
        validationCodes.push('PRODUCT_NOT_FOUND');
        rowStatus = 'WARNING';
      } else if (productObj.status === 'inactive') {
        rowWarnings.push(`Product SKU "${skuVal}" exists but is inactive.`);
        validationCodes.push('PRODUCT_INACTIVE');
        rowStatus = 'WARNING';
      }

      // 3. Description Difference Warning
      if (productObj && descVal) {
        const ovmsDesc = (productObj.description || '').toLowerCase().trim();
        const sapDesc = descVal.toLowerCase().trim();
        if (ovmsDesc !== sapDesc) {
          rowWarnings.push(`SAP product description "${descVal}" differs from local Product Master: "${productObj.description}".`);
          validationCodes.push('DESCRIPTION_DIFFERENCE');
          // Keeps status as WARNING, does not fail
          if (rowStatus === 'VALID') {
            rowStatus = 'WARNING';
          }
        }
      }

      // 4. Quantity Validations
      if (isNaN(qty)) {
        rowErrors.push(`Planned quantity "${qtyRaw}" is not a valid number.`);
        validationCodes.push('QUANTITY_INVALID');
        rowStatus = 'ERROR';
      } else if (qty < 0) {
        rowErrors.push(`Planned quantity "${qtyRaw}" cannot be negative.`);
        validationCodes.push('QUANTITY_NEGATIVE');
        rowStatus = 'ERROR';
      }

      // 5. Unit of Measure check
      if (uomVal && uomVal.toUpperCase() !== 'CS' && uomVal.toUpperCase() !== 'CASE' && uomVal.toUpperCase() !== 'CASES') {
        rowWarnings.push(`SAP Unit of Measure "${uomVal}" differs from standard CASES.`);
        validationCodes.push('UNIT_NOT_SUPPORTED');
        if (rowStatus === 'VALID') {
          rowStatus = 'WARNING';
        }
      }

      // 6. Cases Per Pallet check
      const casesPerPallet = productObj?.casesPerPallet || 1;
      if (productObj && (!productObj.casesPerPallet || productObj.casesPerPallet <= 0)) {
        rowWarnings.push(`Cases per Pallet (CS/Pallet) conversion rate is not configured for SKU: ${skuVal}. Defaulting to 1.`);
        validationCodes.push('CASES_PER_PALLET_MISSING');
        if (rowStatus === 'VALID') {
          rowStatus = 'WARNING';
        }
      }

      // 7. Duplicate row check within spreadsheet
      const rowUniqueKey = `${resourceVal}_${skuVal}_${dateCol.key}`;
      if (seenRowsSet.has(rowUniqueKey)) {
        rowWarnings.push(`Duplicate active production code entry found in spreadsheet for Line/SKU/Date: ${rowUniqueKey}.`);
        validationCodes.push('DUPLICATE_SOURCE_ROW');
        if (rowStatus === 'VALID') {
          rowStatus = 'WARNING';
        }
      } else {
        seenRowsSet.add(rowUniqueKey);
      }

      // 8. Date checks
      const dateVal = dateCol.date;
      if (!dateVal || isNaN(dateVal.getTime())) {
        rowErrors.push('Production date is invalid.');
        validationCodes.push('PRODUCTION_DATE_INVALID');
        rowStatus = 'ERROR';
      } else if (dateVal < periodStart || dateVal > periodEnd) {
        rowErrors.push('Row production date is outside of the detected planning period.');
        validationCodes.push('DATE_OUTSIDE_DETECTED_PERIOD');
        rowStatus = 'ERROR';
      }

      if (rowStatus === 'WARNING') warningCount++;
      if (rowStatus === 'ERROR') errorCount++;
      if (rowStatus === 'VALID' || rowStatus === 'WARNING') recognisedRows++;

      parsedRows.push({
        tenantId,
        siteId,
        importId: previewImportId,
        sourceSheetName: firstSheetName,
        sourceRowNumber: idx + 2, // 1-indexed Excel row + 1 header row
        productionLineCode: lineObj ? lineObj.lineCode : (resourceVal.split('_')[0] || resourceVal),
        productionLineName: lineObj ? lineObj.lineName : resourceVal,
        productCode: skuVal,
        sourceProductDescription: descVal,
        matchedProductId: productObj ? (productObj.id || null) : null,
        matchedProductDescription: productObj ? productObj.description : null,
        productionDate: Timestamp.fromDate(dateCol.date),
        plannedQuantity: qty,
        sourceUnitOfMeasure: uomVal || 'CS',
        casesPerPallet,
        calculatedPallets: calculatePlannedPallets(qty, casesPerPallet),
        rowStatus,
        validationCodes,
        validationMessages: [...rowErrors, ...rowWarnings],
        sourceData: {
          Resource: resourceVal,
          'Product Number': skuVal,
          'Product Short Description': descVal,
          'Base Unit of Measure': uomVal
        }
      });
    });

    // 9. Verify sheet total matches calculated row total
    if (sheetTotalVal !== null && sheetTotalVal !== calculatedRowTotal && calculatedRowTotal > 0) {
      // Flag the parsed rows from this sheet row with a total mismatch warning
      parsedRows.forEach(parsedRow => {
        if (parsedRow.sourceRowNumber === idx + 2) {
          parsedRow.validationMessages.push(`SAP Total column (${sheetTotalVal}) does not match sum of individual dates (${calculatedRowTotal}).`);
          parsedRow.validationCodes.push('SOURCE_TOTAL_MISMATCH');
          if (parsedRow.rowStatus === 'VALID') {
            parsedRow.rowStatus = 'WARNING';
            warningCount++;
          }
        }
      });
    }
  });

  // Check file level duplicate or older warnings to include in notes and status
  let previewStatus: ProductionPlanImportStatus = errorCount > 0 ? 'FAILED' : (warningCount > 0 ? 'REQUIRES_REVIEW' : 'READY_TO_COMMIT');
  
  const notesList: string[] = [];
  if (isDuplicateFile) {
    notesList.push('Warning: File is an exact duplicate of a previously committed import (DUPLICATE_FILE).');
    if (previewStatus === 'READY_TO_COMMIT') previewStatus = 'REQUIRES_REVIEW';
  }
  if (isOlderThanActive) {
    notesList.push('Warning: Selected file period is older than the currently active plan (OLDER_THAN_ACTIVE_PLAN).');
    if (previewStatus === 'READY_TO_COMMIT') previewStatus = 'REQUIRES_REVIEW';
  }

  return {
    summary: {
      tenantId,
      siteId,
      fileName,
      fileSize,
      fileHash,
      sourceType: 'MPPS7_SAP',
      sourceWorkbookDate: Timestamp.fromDate(new Date()),
      periodStart: Timestamp.fromDate(periodStart),
      periodEnd: Timestamp.fromDate(periodEnd),
      detectedWorksheetNames: inspection.detectedWorksheetNames,
      uploadedBy,
      uploadedAt: Timestamp.fromDate(new Date()),
      status: previewStatus,
      totalSourceRows,
      recognisedRows,
      ignoredRows,
      warningCount,
      errorCount,
      parserVersion: 'v1.0.0',
      supersedesImportId: null,
      notes: notesList.join(' ') || (errorCount > 0 ? 'Errors detected during structural validation. Ingestion aborted.' : '')
    },
    rows: parsedRows
  };
};

// 7. Commit Production Plan Import
export const commitProductionPlanImport = async (
  preview: ParsedPlanPreview,
  notes: string = ''
): Promise<string> => {
  if (!db) throw new Error('Firestore is not initialized.');

  // Create real import document
  const importsRef = collection(db, 'productionPlanImports');
  const importId = `imp_${Math.random().toString(36).substring(2, 11)}`;

  const importDoc: ProductionPlanImport = {
    ...preview.summary,
    id: importId,
    status: 'COMMITTED',
    notes: notes || preview.summary.notes,
    createdDate: Timestamp.fromDate(new Date()),
    modifiedDate: Timestamp.fromDate(new Date())
  };

  const batch = writeBatch(db);

  // Set the import summary document
  batch.set(doc(importsRef, importId), importDoc);

  // Write staging row audits (stored nested under imports for cleanliness)
  preview.rows.forEach(row => {
    const rowRef = doc(collection(db, `productionPlanImports/${importId}/rows`));
    batch.set(rowRef, {
      ...row,
      importId,
      createdDate: serverTimestamp()
    });
  });

  // Query previous active entries to supersede
  await supersedePreviousProductionPlan(
    preview.summary.tenantId,
    preview.summary.siteId,
    preview.summary.periodStart,
    preview.summary.periodEnd,
    importId,
    batch
  );

  // Generate production entries (the actual active schedule cells)
  const entriesRef = collection(db, 'productionPlanEntries');
  preview.rows.forEach(row => {
    if (row.rowStatus === 'ERROR' || !row.matchedProductId || !row.productionLineCode) return;

    const entryDoc: Omit<ProductionPlanEntry, 'createdDate' | 'modifiedDate'> = {
      tenantId: row.tenantId,
      siteId: row.siteId,
      activeImportId: importId,
      productId: row.matchedProductId,
      productCodeSnapshot: row.productCode,
      descriptionSnapshot: row.matchedProductDescription || row.sourceProductDescription,
      productionLineId: row.productionLineCode, // Matches lineCode as logical ID in local layouts
      productionLineCodeSnapshot: row.productionLineCode,
      productionDate: row.productionDate,
      plannedCases: row.plannedQuantity,
      casesPerPallet: row.casesPerPallet,
      plannedPallets: row.calculatedPallets,
      sourceType: 'SAP_MPPS7',
      sourceSheetName: row.sourceSheetName,
      sourceRowNumber: row.sourceRowNumber,
      sourceUpdatedAt: Timestamp.fromDate(new Date()),
      planVersion: '1.0',
      status: 'PLANNED'
    };

    const newEntryRef = doc(entriesRef);
    batch.set(newEntryRef, {
      ...entryDoc,
      createdDate: serverTimestamp(),
      modifiedDate: serverTimestamp()
    });
  });

  await batch.commit();
  return importId;
};

// 8. Supersede Previous Production Plan
export const supersedePreviousProductionPlan = async (
  tenantId: string,
  siteId: string,
  periodStart: Timestamp,
  periodEnd: Timestamp,
  newImportId: string,
  batch: any
): Promise<void> => {
  if (!db) return;

  // Mark overlapping entries as COMPLETE/CANCELLED or remove them to prevent visual duplicates
  // To avoid orphaned plan entries, we delete or label older entries on matching dates
  const entriesRef = collection(db, 'productionPlanEntries');
  const qEntries = query(
    entriesRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId)
  );

  const snapEntries = await getDocs(qEntries);
  snapEntries.forEach(docSnap => {
    // If the entry does not belong to the newly committed import, mark it or delete it.
    // Deleting older uncommitted planned entries ensures layout freshness.
    const entryData = docSnap.data();
    if (entryData.productionDate) {
      const pMillis = entryData.productionDate.toMillis();
      if (pMillis >= periodStart.toMillis() && pMillis <= periodEnd.toMillis()) {
        if (entryData.activeImportId !== newImportId && entryData.status === 'PLANNED') {
          batch.delete(docSnap.ref);
        }
      }
    }
  });

  // Mark older imports in date range as SUPERSEDED
  const importsRef = collection(db, 'productionPlanImports');
  const qImports = query(
    importsRef,
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('status', '==', 'COMMITTED')
  );

  const snapImports = await getDocs(qImports);
  snapImports.forEach(docSnap => {
    const impData = docSnap.data() as ProductionPlanImport;
    // Check overlapping period
    if (
      impData.id !== newImportId &&
      impData.periodStart.toMillis() <= periodEnd.toMillis() &&
      impData.periodEnd.toMillis() >= periodStart.toMillis()
    ) {
      batch.update(docSnap.ref, {
        status: 'SUPERSEDED',
        supersedesImportId: newImportId,
        modifiedDate: serverTimestamp()
      });
    }
  });
};

// Legacy LineProductionContext interface removed to keep context unified
