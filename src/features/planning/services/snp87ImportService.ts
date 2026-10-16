import * as XLSX from 'xlsx';
import { logAuditEvent } from '../../../services/auditService';
import {
  Snp87PlanningImport,
  Snp87PlanningRow,
  Snp87PlanningType,
  Snp87ImportStatus,
  Snp87RowValidationStatus,
  Snp87RawRow,
  Snp87ImportDiagnostics,
  getNormalizedPlanningType,
  ProductForecastWeeklyPlan
} from '../../../types/snp87';
import { Product } from '../../../types/product';
import { findDuplicateProduct, areProductCodesEqual } from '../../../utils/productCodeNormalizer';
import {
  createDocument,
  createDocuments,
  getDocuments,
  getDocument,
  updateDocument,
  where,
  subscribeToCollection
} from '../../../services/dbService';

export const SNP87_COLLECTIONS = {
  IMPORTS: 'snp87Imports',
  ROWS: 'snp87PlanningRows'
};

// Supported Base Units of Measure for SNP87
export const SUPPORTED_SNP87_UOM = [
  'CS', 'CASE', 'CASES', 'EA', 'EACH', 'KG', 'PAL', 'PALLET', 'BOX', 'PK', 'PAC', 'CT', 'CARTON', 'ST'
];

/**
 * Calculates SHA-256 hash of an uploaded file or buffer for audit integrity.
 */
export const calculateFileHash = async (fileOrBuffer: File | ArrayBuffer): Promise<string> => {
  const buffer = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Validates whether a unit of measure is supported.
 */
export const isSupportedSnp87Uom = (uom: string | null | undefined): boolean => {
  if (!uom) return false;
  const clean = String(uom).trim().toUpperCase();
  return SUPPORTED_SNP87_UOM.includes(clean);
};

/**
 * Parses SNP87 calendar dates formatted as YYYYMMDD (e.g. 20261005 -> "2026-10-05").
 * Explicitly parses without timezone-dependent date shifts.
 */
export const parseSnp87Date = (
  dateVal: string | number | Date | null | undefined
): { formattedDate: string; date: Date; year: number; month: number; day: number } | null => {
  if (dateVal === null || dateVal === undefined || dateVal === '') {
    return null;
  }

  // If already a Date object
  if (dateVal instanceof Date) {
    if (isNaN(dateVal.getTime())) return null;
    const year = dateVal.getUTCFullYear();
    const month = dateVal.getUTCMonth() + 1;
    const day = dateVal.getUTCDate();
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { formattedDate, date: dateVal, year, month, day };
  }

  const rawStr = String(dateVal).trim();

  // Primary SNP87 format: YYYYMMDD (e.g., "20261005" or 20261005)
  const yyyymmddMatch = rawStr.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1], 10);
    const month = parseInt(yyyymmddMatch[2], 10);
    const day = parseInt(yyyymmddMatch[3], 10);

    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      // Validate days in month
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day <= daysInMonth) {
        const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { formattedDate, date, year, month, day };
      }
    }
    return null;
  }

  // Standard ISO date format: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = rawStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);

    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day <= daysInMonth) {
        const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { formattedDate, date, year, month, day };
      }
    }
    return null;
  }

  // Excel serial date number check (e.g. 40000 - 60000)
  const asNumber = Number(rawStr);
  if (!isNaN(asNumber) && asNumber > 20000 && asNumber < 80000) {
    const date = new Date((asNumber - 25569) * 86400 * 1000);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { formattedDate, date, year, month, day };
  }

  return null;
};

/**
 * Detects whether a date value within an SNP87 record is out of the ordinary
 * (e.g. placeholder/epoch values like "19700101", "19000101", "00000000", "99991231", or dates outside realistic planning era).
 */
export const isOutOfOrdinaryDate = (dateVal: string | number | Date | null | undefined): boolean => {
  if (dateVal === null || dateVal === undefined || dateVal === '') {
    return false;
  }
  const cleanStr = String(dateVal).trim().replace(/[-/]/g, '');
  if (
    cleanStr === '19700101' ||
    cleanStr === '19000101' ||
    cleanStr === '00000000' ||
    cleanStr === '99991231' ||
    cleanStr === '0'
  ) {
    return true;
  }
  const parsed = parseSnp87Date(dateVal);
  if (parsed && (parsed.year <= 1975 || parsed.year >= 2099)) {
    return true;
  }
  return false;
};

/**
 * Identifies the SNP87 Planning Type based on InfoObject and Row text.
 * Only 9ADFCST (Forecast) and 9AFPROD (Production Confirmed) are recognised.
 * All other rows are classified as IGNORED to prevent accidental inclusion in planning calculations.
 */
export const identifySnp87PlanningType = (
  infoObject: string | undefined | null,
  rowText: string | undefined | null
): { planningType: Snp87PlanningType; ignoredReason?: string } => {
  const cleanInfo = (infoObject || '').trim().toUpperCase();
  const cleanText = (rowText || '').trim().toUpperCase();

  // Forecast: InfoObject 9ADFCST or Row text contains Forecast
  if (cleanInfo === '9ADFCST' || cleanText === 'FORECAST' || cleanText.includes('FORECAST')) {
    return { planningType: 'FORECAST' };
  }

  // Confirmed Production: InfoObject 9AFPROD or Row text contains Production (Confirmed)
  if (
    cleanInfo === '9AFPROD' ||
    cleanText === 'PRODUCTION (CONFIRMED)' ||
    cleanText.includes('PRODUCTION (CONFIRMED)') ||
    cleanText.includes('CONFIRMED')
  ) {
    return { planningType: 'CONFIRMED_PRODUCTION' };
  }

  // Unrecognised rows must be ignored
  return {
    planningType: 'IGNORED',
    ignoredReason: `Unrecognised InfoObject: "${infoObject || ''}" / Row text: "${rowText || ''}". Only 9ADFCST (Forecast) and 9AFPROD (Production Confirmed) are recognised.`
  };
};

/**
 * Normalises column header text for flexible header matching.
 */
export const normalizeHeader = (header: string): string => {
  if (!header) return '';
  return header.toString().trim().toLowerCase().replace(/[\s_\-\.\(\)]/g, '');
};

/**
 * Validates SNP87 column headers and maps them to canonical fields.
 */
export const validateSnp87Headers = (
  headers: string[]
): { isValid: boolean; missingHeaders: string[]; headerMap: Record<string, string> } => {
  const normalizedMap: Record<string, string> = {};
  headers.forEach(h => {
    if (h) {
      normalizedMap[normalizeHeader(h)] = h;
    }
  });

  const headerDefinitions: Record<string, string[]> = {
    orderSku: ['ordersku', 'sku', 'orderskunumber'],
    productNumber: ['productnumber', 'material', 'productcode', 'itemnumber', 'productno', 'product'],
    productDescription: ['productdescription', 'description', 'materialdescription', 'productdesc', 'desc'],
    location: ['location', 'plant', 'site', 'locationid'],
    sort: ['sort', 'sortnumber', 'sortorder'],
    infoObject: ['infoobject', 'infoobjectid', 'keyfigure', 'infoobj'],
    rowText: ['rowtext', 'text', 'rowdescription'],
    startDate: ['startdate', 'start', 'planningstart', 'datefrom'],
    endDate: ['enddate', 'end', 'planningend', 'dateto'],
    quantity: ['quantity', 'qty', 'plannedquantity', 'amount'],
    baseUnitOfMeasure: ['baseunitofmeasure', 'baseuom', 'uom', 'unit', 'unitofmeasure', 'baseunit']
  };

  const headerMap: Record<string, string> = {};
  const missingHeaders: string[] = [];

  for (const [field, synonyms] of Object.entries(headerDefinitions)) {
    let matched = false;
    for (const syn of synonyms) {
      if (normalizedMap[syn]) {
        headerMap[field] = normalizedMap[syn];
        matched = true;
        break;
      }
    }
    if (!matched) {
      missingHeaders.push(field);
    }
  }

  // Critical headers required for SNP87 parsing
  const criticalRequired = [
    'productNumber',
    'infoObject',
    'rowText',
    'startDate',
    'endDate',
    'quantity',
    'baseUnitOfMeasure'
  ];

  const criticalMissing = criticalRequired.filter(req => !headerMap[req]);

  return {
    isValid: criticalMissing.length === 0,
    missingHeaders,
    headerMap
  };
};

/**
 * Maps and validates a single SNP87 row.
 */
export const validateAndMapSnp87Row = (
  rawRow: Record<string, any>,
  rowIndex: number,
  existingProducts: Product[],
  options: {
    importId: string;
    tenantId: string;
    siteId: string;
    headerMap?: Record<string, string>;
    horizonDate?: string;
  }
): Snp87PlanningRow => {
  const getVal = (canonicalKey: string, fallbackKeys: string[] = []): any => {
    if (options.headerMap && options.headerMap[canonicalKey] && rawRow[options.headerMap[canonicalKey]] !== undefined) {
      return rawRow[options.headerMap[canonicalKey]];
    }
    if (rawRow[canonicalKey] !== undefined) return rawRow[canonicalKey];
    for (const key of fallbackKeys) {
      if (rawRow[key] !== undefined) return rawRow[key];
    }
    return undefined;
  };

  const orderSkuRaw = getVal('orderSku', ['Order SKU', 'OrderSKU', 'SKU']);
  const productNumberRaw = getVal('productNumber', ['Product Number', 'ProductNumber', 'Material']);
  const productDescriptionRaw = getVal('productDescription', ['Product Description', 'ProductDescription', 'Description']);
  const locationRaw = getVal('location', ['Location', 'Plant']);
  const sortRaw = getVal('sort', ['Sort']);
  const infoObjectRaw = getVal('infoObject', ['InfoObject', 'Info Object']);
  const rowTextRaw = getVal('rowText', ['Row text', 'RowText', 'Text']);
  const startDateRaw = getVal('startDate', ['Start Date', 'StartDate', 'Start date', 'Start']);
  const endDateRaw = getVal('endDate', ['End Date', 'EndDate', 'End date', 'End']);
  const horizonDateRaw = getVal('horizonDate', [
    'Horizon Date', 'HorizonDate', 'Horizon',
    'Horizen Date', 'HorizenDate', 'Horizen',
    'Planning Horizon', 'PlanningHorizon', 'Planning Horizon Date',
    'Weekly Horizon', 'Weekly Plan Date', 'Horizon Start'
  ]);
  const quantityRaw = getVal('quantity', ['Quantity', 'Qty']);
  const baseUomRaw = getVal('baseUnitOfMeasure', ['Base Unit of Measure', 'BaseUnitOfMeasure', 'UoM', 'Base UoM']);

  const orderSku = orderSkuRaw !== undefined ? String(orderSkuRaw).trim() : '';
  const productNumber = productNumberRaw !== undefined ? String(productNumberRaw).trim() : '';
  const productDescription = productDescriptionRaw !== undefined ? String(productDescriptionRaw).trim() : '';
  const location = locationRaw !== undefined ? String(locationRaw).trim() : '';
  const sort = sortRaw !== undefined ? sortRaw : '';
  const infoObject = infoObjectRaw !== undefined ? String(infoObjectRaw).trim() : '';
  const rowText = rowTextRaw !== undefined ? String(rowTextRaw).trim() : '';
  const baseUnitOfMeasure = baseUomRaw !== undefined ? String(baseUomRaw).trim().toUpperCase() : '';

  const validationErrors: string[] = [];
  const validationWarnings: string[] = [];

  // 1. Identify Planning Type
  const { planningType, ignoredReason } = identifySnp87PlanningType(infoObject, rowText);

  // 2. Resolve Dates - Handle "out of the ordinary" dates (e.g. "19700101") using adjacent record cells
  const rawKeys = Object.keys(rawRow);
  const getAdjacentValue = (targetCanonical: 'startDate' | 'endDate' | 'horizonDate'): any => {
    // Paired date cells in SNP87 records: Start Date is adjacent to End Date!
    if (targetCanonical === 'startDate') {
      if (!isOutOfOrdinaryDate(endDateRaw)) return endDateRaw;
      if (!isOutOfOrdinaryDate(horizonDateRaw)) return horizonDateRaw;
    } else if (targetCanonical === 'endDate') {
      if (!isOutOfOrdinaryDate(startDateRaw)) return startDateRaw;
      if (!isOutOfOrdinaryDate(horizonDateRaw)) return horizonDateRaw;
    } else if (targetCanonical === 'horizonDate') {
      if (!isOutOfOrdinaryDate(startDateRaw)) return startDateRaw;
      if (!isOutOfOrdinaryDate(endDateRaw)) return endDateRaw;
    }

    // Physical column adjacency in spreadsheet row
    const targetKey = options.headerMap?.[targetCanonical] || targetCanonical;
    const idx = rawKeys.findIndex(k => {
      const lower = k.toLowerCase().replace(/[\s_-]/g, '');
      if (targetCanonical === 'startDate') return lower.includes('start') && lower.includes('date');
      if (targetCanonical === 'endDate') return lower.includes('end') && lower.includes('date');
      if (targetCanonical === 'horizonDate') return lower.includes('horizon') || lower.includes('horizen');
      return k.toLowerCase() === targetKey.toLowerCase();
    });

    if (idx !== -1) {
      if (idx + 1 < rawKeys.length) {
        const rVal = rawRow[rawKeys[idx + 1]];
        if (!isOutOfOrdinaryDate(rVal)) return rVal;
      }
      if (idx - 1 >= 0) {
        const lVal = rawRow[rawKeys[idx - 1]];
        if (!isOutOfOrdinaryDate(lVal)) return lVal;
      }
    }
    return undefined;
  };

  let effectiveStartDateRaw = startDateRaw;
  let effectiveEndDateRaw = endDateRaw;
  let effectiveHorizonDateRaw = horizonDateRaw;

  if (isOutOfOrdinaryDate(effectiveStartDateRaw)) {
    const adj = getAdjacentValue('startDate');
    if (adj !== undefined && !isOutOfOrdinaryDate(adj)) {
      effectiveStartDateRaw = adj;
      validationWarnings.push(`Start date "${startDateRaw ?? ''}" was out of ordinary and replaced from adjacent cell in record with "${effectiveStartDateRaw}".`);
    }
  }

  if (isOutOfOrdinaryDate(effectiveEndDateRaw)) {
    const adj = getAdjacentValue('endDate');
    if (adj !== undefined && !isOutOfOrdinaryDate(adj)) {
      effectiveEndDateRaw = adj;
      validationWarnings.push(`End date "${endDateRaw ?? ''}" was out of ordinary and replaced from adjacent cell in record with "${effectiveEndDateRaw}".`);
    }
  }

  if (isOutOfOrdinaryDate(effectiveHorizonDateRaw)) {
    const adj = getAdjacentValue('horizonDate');
    if (adj !== undefined && !isOutOfOrdinaryDate(adj)) {
      effectiveHorizonDateRaw = adj;
    }
  }

  const parsedStart = parseSnp87Date(effectiveStartDateRaw);
  const parsedEnd = parseSnp87Date(effectiveEndDateRaw);
  const parsedHorizon = effectiveHorizonDateRaw ? parseSnp87Date(effectiveHorizonDateRaw) : null;
  const horizonDate = parsedHorizon ? parsedHorizon.formattedDate : (options.horizonDate || '');

  let startDate = '';
  let endDate = '';
  let planningDate = '';

  if (parsedStart) {
    startDate = parsedStart.formattedDate;
  } else if (planningType !== 'IGNORED') {
    validationErrors.push(
      `Invalid Start Date: "${startDateRaw ?? ''}". Expected format YYYYMMDD (e.g. 20261005).`
    );
  }

  if (parsedEnd) {
    endDate = parsedEnd.formattedDate;
  } else if (planningType !== 'IGNORED') {
    validationErrors.push(
      `Invalid End Date: "${endDateRaw ?? ''}". Expected format YYYYMMDD (e.g. 20261005).`
    );
  }

  // Cross-populate if one was missing
  if (!startDate && endDate) startDate = endDate;
  if (!endDate && startDate) endDate = startDate;

  // Determine planningDate:
  // For Forecast: use the horizon date rather than the date within the End or Start date as this will be a weekly plan to work towards.
  if (planningType === 'FORECAST') {
    if (horizonDate) {
      planningDate = horizonDate;
    } else if (startDate) {
      planningDate = startDate;
    } else if (endDate) {
      planningDate = endDate;
    }
  } else {
    // For Confirmed Production
    if (startDate) {
      planningDate = startDate;
    } else if (endDate) {
      planningDate = endDate;
    } else if (horizonDate) {
      planningDate = horizonDate;
    }
  }

  // 3. Parse Quantity (numeric, non-negative)
  let quantity = 0;
  let forecastQuantity: number | null = null;
  let confirmedProductionQuantity: number | null = null;

  if (quantityRaw !== undefined && quantityRaw !== null && quantityRaw !== '') {
    const parsedQty = typeof quantityRaw === 'number' ? quantityRaw : parseFloat(String(quantityRaw).replace(/,/g, ''));
    if (isNaN(parsedQty) || parsedQty < 0) {
      if (planningType !== 'IGNORED') {
        validationErrors.push(
          `Invalid Quantity: "${quantityRaw}". Quantity must be a valid non-negative number.`
        );
      }
    } else {
      quantity = parsedQty;
      if (planningType === 'FORECAST') {
        forecastQuantity = parsedQty;
      } else if (planningType === 'CONFIRMED_PRODUCTION') {
        confirmedProductionQuantity = parsedQty;
      }
    }
  } else if (planningType !== 'IGNORED') {
    validationErrors.push('Missing Quantity value.');
  }

  // 4. Validate Base Unit of Measure
  if (planningType !== 'IGNORED') {
    if (!baseUnitOfMeasure) {
      validationErrors.push('Missing Base Unit of Measure.');
    } else if (!isSupportedSnp87Uom(baseUnitOfMeasure)) {
      validationWarnings.push(
        `Uncommon Base Unit of Measure: "${baseUnitOfMeasure}". Expected one of: ${SUPPORTED_SNP87_UOM.slice(0, 6).join(', ')}.`
      );
    }
  }

  // 5. Product Master Lookup & Mapping
  let matchedProduct: Product | null = null;
  let productMatched = false;
  let productId: string | null = null;
  let productCodeSnapshot = productNumber;
  let descriptionSnapshot = productDescription;

  if (productNumber) {
    matchedProduct = findDuplicateProduct(productNumber, existingProducts);
    if (!matchedProduct && orderSku) {
      matchedProduct = findDuplicateProduct(orderSku, existingProducts);
    }
    if (!matchedProduct) {
      matchedProduct = existingProducts.find(
        p => areProductCodesEqual(p.productCode, productNumber) || (orderSku && areProductCodesEqual(p.productCode, orderSku))
      ) || null;
    }
  }

  if (matchedProduct) {
    productMatched = true;
    productId = matchedProduct.id || null;
    productCodeSnapshot = matchedProduct.productCode;
    descriptionSnapshot = matchedProduct.description || productDescription;
  } else if (planningType !== 'IGNORED') {
    productMatched = false;
    productId = null;
    if (!productNumber) {
      validationErrors.push('Missing Product Number.');
    } else {
      validationErrors.push(
        `Unknown Product: Product Number "${productNumber}" was not found in Product Master.`
      );
    }
  }

  // 6. Compute Validation Status
  let validationStatus: Snp87RowValidationStatus = 'VALID';
  if (planningType === 'IGNORED') {
    validationStatus = 'IGNORED';
  } else if (validationErrors.length > 0) {
    validationStatus = 'ERROR';
  } else if (validationWarnings.length > 0) {
    validationStatus = 'WARNING';
  }

  const rowId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${options.importId}_row_${rowIndex}`;

  return {
    id: rowId,
    importId: options.importId,
    tenantId: options.tenantId,
    siteId: options.siteId,
    rowIndex,
    orderSku,
    productNumber,
    productDescription,
    location,
    sort,
    infoObject,
    rowText,
    planningType,
    startDateRaw: startDateRaw ?? '',
    endDateRaw: endDateRaw ?? '',
    planningDate,
    startDate,
    endDate,
    horizonDate: horizonDate || undefined,
    quantity,
    forecastQuantity,
    confirmedProductionQuantity,
    baseUnitOfMeasure,
    productId,
    productCodeSnapshot,
    descriptionSnapshot,
    productMatched,
    validationStatus,
    validationErrors,
    validationWarnings,
    ignoredReason,
    rawSourceRow: { ...rawRow },
    createdAt: new Date().toISOString()
  };
};

/**
 * Parses a complete SNP87 dataset (worksheet rows or buffer) into structured Snp87PlanningImport & rows.
 */
export const parseSnp87Workbook = async (
  input: File | ArrayBuffer | any[],
  existingProducts: Product[],
  options: {
    tenantId: string;
    siteId: string;
    sourceReportName: string;
    importedBy: string;
    fileHash?: string;
  }
): Promise<{
  importSummary: Snp87PlanningImport;
  rows: Snp87PlanningRow[];
  headerValidation: { isValid: boolean; missingHeaders: string[] };
}> => {
  let rawRows: any[] = [];
  let fileHash = options.fileHash || '';

  if (input instanceof File || input instanceof ArrayBuffer) {
    if (!fileHash) {
      fileHash = await calculateFileHash(input);
    }
    const buffer = input instanceof File ? await input.arrayBuffer() : input;
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });
  } else if (Array.isArray(input)) {
    rawRows = input;
    if (!fileHash) {
      fileHash = `snp87_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  }

  const importId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `snp87_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const headerValidation = validateSnp87Headers(headers);

  // Validate and map rows
  const parsedRows: Snp87PlanningRow[] = [];
  const seenDuplicateKeys = new Set<string>();

  const unknownProductMap = new Map<string, { productNumber: string; orderSku?: string; description?: string; rowCount: number }>();
  const ignoredInfoObjectsMap = new Map<string, { infoObject: string; rowText: string; count: number }>();

  let forecastRowCount = 0;
  let confirmedProductionRowCount = 0;
  let ignoredRowCount = 0;
  let totalForecastQuantity = 0;
  let totalConfirmedProductionQuantity = 0;
  let warningCount = 0;
  let errorCount = 0;

  let minDate: string | null = null;
  let maxDate: string | null = null;

  rawRows.forEach((rawRow, idx) => {
    const row = validateAndMapSnp87Row(rawRow, idx + 1, existingProducts, {
      importId,
      tenantId: options.tenantId,
      siteId: options.siteId,
      headerMap: headerValidation.headerMap
    });

    // Check for exact duplicate rows
    const duplicateKey = `${row.productNumber}_${row.planningType}_${row.startDate}_${row.endDate}_${row.quantity}_${row.baseUnitOfMeasure}_${row.location}`;
    if (seenDuplicateKeys.has(duplicateKey)) {
      row.isDuplicate = true;
      if (row.validationStatus === 'VALID') {
        row.validationStatus = 'WARNING';
      }
      row.validationWarnings.push('Duplicate row detected in this import file.');
    } else {
      seenDuplicateKeys.add(duplicateKey);
    }

    // Tally counts
    if (row.planningType === 'FORECAST') {
      forecastRowCount++;
      totalForecastQuantity += row.quantity;
    } else if (row.planningType === 'CONFIRMED_PRODUCTION') {
      confirmedProductionRowCount++;
      totalConfirmedProductionQuantity += row.quantity;
    } else {
      ignoredRowCount++;
      const key = `${row.infoObject}_${row.rowText}`;
      const existing = ignoredInfoObjectsMap.get(key) || { infoObject: row.infoObject, rowText: row.rowText, count: 0 };
      existing.count++;
      ignoredInfoObjectsMap.set(key, existing);
    }

    if (row.validationStatus === 'ERROR') errorCount++;
    if (row.validationStatus === 'WARNING') warningCount++;

    // Track unknown products
    if (!row.productMatched && row.planningType !== 'IGNORED') {
      const pKey = row.productNumber || row.orderSku;
      if (pKey) {
        const existing = unknownProductMap.get(pKey) || {
          productNumber: row.productNumber,
          orderSku: row.orderSku,
          description: row.productDescription,
          rowCount: 0
        };
        existing.rowCount++;
        unknownProductMap.set(pKey, existing);
      }
    }

    // Track date range
    if (row.planningDate && row.planningType !== 'IGNORED') {
      if (!minDate || row.planningDate < minDate) minDate = row.planningDate;
      if (!maxDate || row.planningDate > maxDate) maxDate = row.planningDate;
    }

    parsedRows.push(row);
  });

  const recognisedRowCount = forecastRowCount + confirmedProductionRowCount;
  const unknownProductCount = unknownProductMap.size;

  let importStatus: Snp87ImportStatus = 'VALIDATED';
  if (errorCount > 0 || unknownProductCount > 0 || !headerValidation.isValid) {
    importStatus = 'REQUIRES_REVIEW';
  }

  const diagnostics: Snp87ImportDiagnostics = {
    errors: [],
    warnings: [],
    unknownProducts: Array.from(unknownProductMap.values()),
    ignoredInfoObjects: Array.from(ignoredInfoObjectsMap.values())
  };

  if (!headerValidation.isValid) {
    diagnostics.errors.push(`Missing required column headers: ${headerValidation.missingHeaders.join(', ')}`);
  }
  if (unknownProductCount > 0) {
    diagnostics.errors.push(`${unknownProductCount} unknown product(s) detected. Must be mapped or created before planning.`);
  }
  if (errorCount > 0) {
    diagnostics.errors.push(`${errorCount} row(s) contain validation errors.`);
  }
  if (warningCount > 0) {
    diagnostics.warnings.push(`${warningCount} row(s) have warnings.`);
  }

  const now = new Date().toISOString();

  const importSummary: Snp87PlanningImport = {
    id: importId,
    tenantId: options.tenantId,
    siteId: options.siteId,
    sourceReportName: options.sourceReportName,
    sourceReportType: 'SNP87',
    fileHash,
    importedBy: options.importedBy,
    importedAt: now,
    importStatus,
    sourceRowCount: rawRows.length,
    recognisedRowCount,
    ignoredRowCount,
    forecastRowCount,
    confirmedProductionRowCount,
    totalForecastQuantity: Math.round(totalForecastQuantity * 1000) / 1000,
    totalConfirmedProductionQuantity: Math.round(totalConfirmedProductionQuantity * 1000) / 1000,
    warningCount,
    errorCount,
    unknownProductCount,
    importPeriod: minDate && maxDate ? { startDate: minDate, endDate: maxDate } : null,
    diagnostics,
    version: 1,
    status: 'active',
    createdBy: options.importedBy,
    createdDate: now,
    modifiedBy: options.importedBy,
    modifiedDate: now
  };

  return {
    importSummary,
    rows: parsedRows,
    headerValidation
  };
};

// Helper for local storage resilience
const getLocalKey = (tenantId: string, siteId: string) => `ovms_snp87_active_${tenantId}_${siteId}`;
const getLocalHistoryKey = (tenantId: string, siteId: string) => `ovms_snp87_history_${tenantId}_${siteId}`;
const getLocalRowsKey = (importId: string) => `ovms_snp87_rows_${importId}`;

function saveToLocalStore(importSummary: Snp87PlanningImport, rows: Snp87PlanningRow[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const { tenantId, siteId, id: importId } = importSummary;
    // 1. Save rows for import
    window.localStorage.setItem(getLocalRowsKey(importId), JSON.stringify(rows));

    // 2. Save/update in history list
    const historyKey = getLocalHistoryKey(tenantId, siteId);
    const existingRaw = window.localStorage.getItem(historyKey);
    let history: Snp87PlanningImport[] = existingRaw ? JSON.parse(existingRaw) : [];

    if (importSummary.importStatus === 'COMMITTED') {
      history = history.map(h => (h.importStatus === 'COMMITTED' && h.id !== importId ? { ...h, importStatus: 'SUPERSEDED' } : h));
      window.localStorage.setItem(getLocalKey(tenantId, siteId), JSON.stringify({ importSummary, rows }));
    }

    const idx = history.findIndex(h => h.id === importId);
    if (idx >= 0) {
      history[idx] = importSummary;
    } else {
      history.unshift(importSummary);
    }
    window.localStorage.setItem(historyKey, JSON.stringify(history));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

function getFromLocalStore(tenantId: string, siteId: string): { importSummary: Snp87PlanningImport | null; rows: Snp87PlanningRow[] } | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const activeRaw = window.localStorage.getItem(getLocalKey(tenantId, siteId));
    if (activeRaw) {
      const parsed = JSON.parse(activeRaw);
      return parsed;
    }
    // Check history for latest COMMITTED
    const historyRaw = window.localStorage.getItem(getLocalHistoryKey(tenantId, siteId));
    if (historyRaw) {
      const history: Snp87PlanningImport[] = JSON.parse(historyRaw);
      const active = history.find(h => h.importStatus === 'COMMITTED');
      if (active) {
        const rowsRaw = window.localStorage.getItem(getLocalRowsKey(active.id));
        const rows = rowsRaw ? JSON.parse(rowsRaw) : [];
        return { importSummary: active, rows };
      }
    }
  } catch (err) {
    console.warn('LocalStorage read failed:', err);
  }
  return null;
}

/**
 * Persists an SNP87 Planning Import and its rows into the database, creating an audit log.
 */
export const saveSnp87Import = async (
  importSummary: Snp87PlanningImport,
  rows: Snp87PlanningRow[]
): Promise<{ success: boolean; error?: string; importId?: string }> => {
  try {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let finalImportId = importSummary.id;
    if (!finalImportId || !UUID_REGEX.test(finalImportId)) {
      try {
        finalImportId = crypto.randomUUID();
      } catch {
        finalImportId = `snp87_${Date.now()}`;
      }
    }

    const { id, createdBy, createdDate, modifiedBy, modifiedDate, ...importPayload } = importSummary;
    const payloadWithId = UUID_REGEX.test(finalImportId)
      ? { ...importPayload, id: finalImportId }
      : importPayload;

    // 1. Create Import Record
    const savedImportId = await createDocument(SNP87_COLLECTIONS.IMPORTS, payloadWithId);
    if (savedImportId) {
      finalImportId = savedImportId;
    }

    // 2. Batch write rows with valid importId and valid row UUIDs
    if (rows.length > 0) {
      const rowsToInsert = rows.map((r, idx) => ({
        ...r,
        id: (r.id && UUID_REGEX.test(r.id))
          ? r.id
          : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined),
        importId: finalImportId,
        tenantId: importSummary.tenantId,
        siteId: importSummary.siteId,
        rowIndex: r.rowIndex || (idx + 1),
        planningType: getNormalizedPlanningType(r)
      }));
      await createDocuments(SNP87_COLLECTIONS.ROWS, rowsToInsert);
    }

    // Save to local store cache with matching finalImportId
    const updatedSummary = { ...importSummary, id: finalImportId };
    const updatedRows = rows.map((r, idx) => ({
      ...r,
      rowIndex: r.rowIndex || (idx + 1),
      importId: finalImportId,
      planningType: getNormalizedPlanningType(r)
    }));
    saveToLocalStore(updatedSummary, updatedRows);

    // 3. Log Audit Event
    await logAuditEvent({
      tenantId: importSummary.tenantId,
      siteId: importSummary.siteId,
      eventType: 'SNP87_PLANNING_IMPORT_UPLOADED',
      entityType: 'Snp87PlanningImport',
      entityId: importSummary.id,
      summary: `Uploaded SNP87 Planning Report "${importSummary.sourceReportName}" with ${importSummary.sourceRowCount} rows (${importSummary.recognisedRowCount} recognised, ${importSummary.ignoredRowCount} ignored, ${importSummary.unknownProductCount} unknown products)`,
      newValue: {
        importId: importSummary.id,
        sourceReportName: importSummary.sourceReportName,
        sourceRowCount: importSummary.sourceRowCount,
        recognisedRowCount: importSummary.recognisedRowCount,
        ignoredRowCount: importSummary.ignoredRowCount,
        forecastRowCount: importSummary.forecastRowCount,
        confirmedProductionRowCount: importSummary.confirmedProductionRowCount,
        importStatus: importSummary.importStatus,
        importPeriod: importSummary.importPeriod
      },
      performedBy: importSummary.importedBy
    });

    return { success: true, importId: finalImportId };
  } catch (err: any) {
    console.warn('DB write for SNP87 import encountered error, caching locally:', err);
    saveToLocalStore(importSummary, rows);
    return { success: true, importId: importSummary.id };
  }
};

/**
 * Commits an SNP87 planning snapshot, superseding any previous active snapshot.
 * Preserves import history and ensures rows from different imports are not mixed.
 */
export const commitSnp87Import = async (
  importSummary: Snp87PlanningImport,
  rows: Snp87PlanningRow[],
  committedBy: string,
  notes?: string
): Promise<{ success: boolean; error?: string; importId?: string }> => {
  try {
    const importId = importSummary.id;
    const now = new Date().toISOString();

    // 1. Retrieve all imports to supersede existing active snapshots
    const allImports = await getSnp87Imports(importSummary.tenantId, importSummary.siteId);
    const activeImports = allImports.filter(imp => imp.importStatus === 'COMMITTED');

    for (const prev of activeImports) {
      if (prev.id && prev.id !== importId) {
        try {
          await updateDocument(SNP87_COLLECTIONS.IMPORTS, prev.id, {
            importStatus: 'SUPERSEDED',
            notes: prev.notes
              ? `${prev.notes} (Superseded by ${importSummary.sourceReportName})`
              : `Superseded by ${importSummary.sourceReportName}`,
            modifiedBy: committedBy,
            modifiedDate: now
          });
        } catch (updateErr) {
          console.warn(`Could not mark import ${prev.id} as superseded in DB:`, updateErr);
        }
      }
    }

    // 2. Prepare committed record
    const committedSummary: Snp87PlanningImport = {
      ...importSummary,
      importStatus: 'COMMITTED',
      notes: notes || importSummary.notes,
      modifiedBy: committedBy,
      modifiedDate: now
    };

    // 3. Save import and rows
    await saveSnp87Import(committedSummary, rows);

    // 4. Update local storage cache
    saveToLocalStore(committedSummary, rows);

    // 5. Log commit audit event
    await logAuditEvent({
      tenantId: committedSummary.tenantId,
      siteId: committedSummary.siteId,
      eventType: 'SNP87_PLANNING_SNAPSHOT_COMMITTED',
      entityType: 'Snp87PlanningImport',
      entityId: importId,
      summary: `Committed SNP87 Planning Snapshot "${committedSummary.sourceReportName}" (${committedSummary.forecastRowCount} forecast rows, ${committedSummary.confirmedProductionRowCount} confirmed production rows) superseding previous snapshots.`,
      newValue: {
        importId,
        sourceReportName: committedSummary.sourceReportName,
        forecastRowCount: committedSummary.forecastRowCount,
        confirmedProductionRowCount: committedSummary.confirmedProductionRowCount,
        totalForecastQuantity: committedSummary.totalForecastQuantity,
        totalConfirmedProductionQuantity: committedSummary.totalConfirmedProductionQuantity,
        importPeriod: committedSummary.importPeriod,
        supersededImportIds: activeImports.map(a => a.id)
      },
      performedBy: committedBy
    });

    return { success: true, importId };
  } catch (err: any) {
    console.error('Failed to commit SNP87 import:', err);
    return { success: false, error: err.message || 'Failed to commit SNP87 import.' };
  }
};

/**
 * Retrieves the currently active committed SNP87 planning snapshot.
 * Returns only rows from the active import without mixing with older snapshots.
 */
export const getActiveSnp87Snapshot = async (
  tenantId: string,
  siteId: string
): Promise<{ importSummary: Snp87PlanningImport | null; rows: Snp87PlanningRow[] }> => {
  try {
    const allImports = await getSnp87Imports(tenantId, siteId);
    const activeImport = allImports.find(imp => imp.importStatus === 'COMMITTED') || null;

    if (!activeImport || !activeImport.id) {
      const local = getFromLocalStore(tenantId, siteId);
      if (local && local.importSummary && local.importSummary.importStatus === 'COMMITTED') {
        return local;
      }
      return { importSummary: null, rows: [] };
    }

    const rows = await getSnp87RowsByImportId(activeImport.id);
    if (rows.length === 0) {
      const local = getFromLocalStore(tenantId, siteId);
      if (local && local.rows && local.rows.length > 0) {
        if (
          local.importSummary?.id === activeImport.id ||
          local.importSummary?.sourceReportName === activeImport.sourceReportName ||
          local.importSummary?.importStatus === 'COMMITTED'
        ) {
          return { importSummary: activeImport, rows: local.rows };
        }
      }
    }

    return { importSummary: activeImport, rows };
  } catch (err) {
    console.warn('Failed to retrieve active SNP87 snapshot from DB, checking local store:', err);
    const local = getFromLocalStore(tenantId, siteId);
    return local || { importSummary: null, rows: [] };
  }
};

/**
 * Retrieves all SNP87 planning imports for a tenant/site.
 */
export const getSnp87Imports = async (
  tenantId: string,
  siteId: string
): Promise<Snp87PlanningImport[]> => {
  try {
    const imports = await getDocuments<Snp87PlanningImport>(SNP87_COLLECTIONS.IMPORTS, [
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    ]);
    const sorted = imports.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
    if (sorted.length > 0) return sorted;
  } catch (err) {
    console.warn('Failed to retrieve SNP87 imports from DB:', err);
  }

  // Fallback to local store history
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const localRaw = window.localStorage.getItem(getLocalHistoryKey(tenantId, siteId));
      if (localRaw) {
        const history: Snp87PlanningImport[] = JSON.parse(localRaw);
        return history.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
      }
    } catch {}
  }
  return [];
};

/**
 * Retrieves a single SNP87 planning import by ID.
 */
export const getSnp87ImportById = async (
  importId: string
): Promise<Snp87PlanningImport | null> => {
  try {
    const doc = await getDocument<Snp87PlanningImport>(SNP87_COLLECTIONS.IMPORTS, importId);
    if (doc) return doc;
  } catch (err) {
    console.warn(`Failed to get SNP87 import ${importId} from DB:`, err);
  }

  // Local fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('ovms_snp87_history_')) {
        try {
          const list: Snp87PlanningImport[] = JSON.parse(window.localStorage.getItem(key) || '[]');
          const match = list.find(l => l.id === importId);
          if (match) return match;
        } catch {}
      }
    }
  }
  return null;
};

/**
 * Retrieves all rows for a given SNP87 import ID.
 */
export const getSnp87RowsByImportId = async (
  importId: string
): Promise<Snp87PlanningRow[]> => {
  try {
    const rows = await getDocuments<Snp87PlanningRow>(SNP87_COLLECTIONS.ROWS, [
      where('importId', '==', importId)
    ]);
    if (rows.length > 0) {
      return rows.sort((a, b) => a.rowIndex - b.rowIndex);
    }
  } catch (err) {
    console.warn(`Failed to get rows for SNP87 import ${importId} from DB:`, err);
  }

  // Local fallback
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(getLocalRowsKey(importId));
      if (raw) {
        const list: Snp87PlanningRow[] = JSON.parse(raw);
        if (list.length > 0) return list.sort((a, b) => a.rowIndex - b.rowIndex);
      }

      // Check active snapshot stores
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('ovms_snp87_active_')) {
          const activeRaw = window.localStorage.getItem(key);
          if (activeRaw) {
            const parsed = JSON.parse(activeRaw);
            if (parsed && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
              if (parsed.importSummary?.id === importId || parsed.rows.some((r: any) => r.importId === importId)) {
                return parsed.rows.sort((a: any, b: any) => (a.rowIndex || 0) - (b.rowIndex || 0));
              }
            }
          }
        }
      }
    } catch {}
  }
  return [];
};


/**
 * Subscribes to SNP87 planning imports in real time.
 */
export const subscribeToSnp87Imports = (
  tenantId: string,
  siteId: string,
  onUpdate: (imports: Snp87PlanningImport[]) => void,
  onError?: (err: Error) => void
) => {
  return subscribeToCollection<Snp87PlanningImport>(
    SNP87_COLLECTIONS.IMPORTS,
    [where('tenantId', '==', tenantId), where('siteId', '==', siteId)],
    (imports) => {
      const sorted = [...imports].sort(
        (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
      );
      onUpdate(sorted);
    },
    onError
  );
};

/**
 * Sumproduct aggregation of Forecast rows for each Product over the weekly planning horizon.
 * Uses the horizon date rather than the date within the End or Start date to establish
 * a clear weekly plan target to work towards.
 */
export const computeWeeklyForecastPlan = (
  rows: Snp87PlanningRow[],
  products: Product[] = []
): ProductForecastWeeklyPlan[] => {
  const forecastRows = rows.filter(r => getNormalizedPlanningType(r) === 'FORECAST');
  const planMap = new Map<string, ProductForecastWeeklyPlan>();

  forecastRows.forEach(row => {
    const code = row.productCodeSnapshot || row.productNumber || row.orderSku || 'UNKNOWN';
    let matchedProduct = row.productId ? products.find(p => p.id === row.productId) : null;
    if (!matchedProduct && code !== 'UNKNOWN') {
      matchedProduct = products.find(p => areProductCodesEqual(p.productCode, code)) || null;
    }

    const casesPerPallet = matchedProduct?.casesPerPallet || 0;
    // Use horizon date rather than the date within the End or Start date
    const horizon = row.horizonDate || row.planningDate || row.startDate || '';
    const qty = row.forecastQuantity ?? row.quantity ?? 0;

    const existing = planMap.get(code);
    if (existing) {
      existing.totalForecastCases += qty;
      existing.rowCount += 1;
      if (horizon && !existing.distinctDates.includes(horizon)) {
        existing.distinctDates.push(horizon);
      }
      if (casesPerPallet > 0) {
        existing.palletEquivalent = Number((existing.totalForecastCases / casesPerPallet).toFixed(2));
      }
    } else {
      planMap.set(code, {
        productId: row.productId || matchedProduct?.id || null,
        productCode: code,
        orderSku: row.orderSku || '',
        productDescription: row.descriptionSnapshot || row.productDescription || matchedProduct?.description || 'Forecast Product',
        baseUnitOfMeasure: row.baseUnitOfMeasure || 'CS',
        horizonDate: horizon,
        totalForecastCases: qty,
        casesPerPallet,
        palletEquivalent: casesPerPallet > 0 ? Number((qty / casesPerPallet).toFixed(2)) : 0,
        rowCount: 1,
        distinctDates: horizon ? [horizon] : []
      });
    }
  });

  return Array.from(planMap.values()).sort((a, b) => b.totalForecastCases - a.totalForecastCases);
};

