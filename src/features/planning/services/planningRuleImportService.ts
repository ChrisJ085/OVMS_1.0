import * as XLSX from 'xlsx';
import { ProductPlanningRule } from '../../../types/planning';
import { Destination } from '../../../types/configuration';
import { Product } from '../../../types/product';
import { refreshSiteRecommendations } from './recommendationService';
import { Timestamp, collection, createDocument, db, doc, getDocs, query, where, writeBatch } from '../../../services/supabaseBase';

export interface PlanningRuleImportRow {
  rowIndex: number;
  productCode: string;
  description: string;
  ddxmRetentionQuantity: number;
  minimumQuantity: number;
  maximumQuantity: number;
  targetQuantity: number;
  preferredDestinationName: string;
  secondaryDestinationName: string;
  primaryUom: string;
  secondaryUom: string;
  validationErrors: string[];
  status: 'VALID' | 'WARNING' | 'ERROR';
}

export interface PlanningRuleImportSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: PlanningRuleImportRow[];
}

export interface ImportCommitResult {
  success: boolean;
  totalProcessed: number;
  createdRulesCount: number;
  updatedRulesCount: number;
  createdProductsCount: number;
  createdDestinationsCount: number;
  errors: string[];
}

/**
 * Parses an Excel or CSV file containing Product Planning Rules.
 */
export const parsePlanningRulesFile = async (file: File): Promise<PlanningRuleImportSummary> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  
  if (workbook.SheetNames.length === 0) {
    throw new Error('The uploaded workbook contains no sheets.');
  }

  // Find the first sheet that has data
  let worksheet: XLSX.WorkSheet | null = null;
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (ws && ws['!ref']) {
      worksheet = ws;
      break;
    }
  }

  if (!worksheet) {
    throw new Error('The uploaded file appears to be empty.');
  }

  // Convert sheet to 2D array
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  if (rawRows.length < 2) {
    throw new Error('File must contain a header row and at least one data row.');
  }

  // Detect header row index
  let headerRowIndex = -1;
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const rowStr = rawRows[r].map(cell => String(cell).toLowerCase().trim()).join(' ');
    if (rowStr.includes('product') || rowStr.includes('min') || rowStr.includes('target') || rowStr.includes('destination')) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = 0; // Default to first row
  }

  const headerRow = rawRows[headerRowIndex].map(cell => String(cell).trim());
  
  // Helper to map header names
  const getColIndex = (keywords: string[]): number => {
    return headerRow.findIndex(h => {
      const lower = h.toLowerCase().trim();
      return keywords.some(k => lower.includes(k.toLowerCase()));
    });
  };

  const productCol = getColIndex(['product short description', 'product', 'material', 'code', 'item']);
  const descCol = getColIndex(['product short description', 'description', 'short description']);
  const ddxmCol = getColIndex(['ddxm retention quantity', 'ddxm', 'retention']);
  const minCol = getColIndex(['min', 'minimum']);
  const maxCol = getColIndex(['max', 'maximum']);
  const targetCol = getColIndex(['target']);
  const prefDestCol = getColIndex(['preferred destination', 'preferred dest', 'primary destination']);
  const secDestCol = getColIndex(['secondary destination', 'secondary dest']);
  const primUomCol = getColIndex(['primary uom', 'primary unit', 'uom']);
  const secUomCol = getColIndex(['secondary uom', 'secondary unit']);

  // Precise index resolution if multiple keywords match (e.g. Product vs Product Short Description)
  let resolvedProdCodeCol = productCol;
  let resolvedDescCol = descCol;

  // Check if header row specifically has both 'Product' and 'Product Short Description'
  headerRow.forEach((colName, idx) => {
    const lower = colName.toLowerCase().trim();
    if (lower === 'product' || lower === 'product code' || lower === 'material') {
      resolvedProdCodeCol = idx;
    }
    if (lower.includes('description') || lower.includes('short description')) {
      resolvedDescCol = idx;
    }
  });

  const parsedRows: PlanningRuleImportRow[] = [];

  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) {
      continue; // Skip empty rows
    }

    const rawProdCode = resolvedProdCodeCol >= 0 ? String(row[resolvedProdCodeCol] || '').trim() : '';
    const rawDesc = resolvedDescCol >= 0 ? String(row[resolvedDescCol] || '').trim() : '';
    const rawDdxm = ddxmCol >= 0 ? parseFloat(String(row[ddxmCol] || '0').replace(/,/g, '')) : 0;
    const rawMin = minCol >= 0 ? parseFloat(String(row[minCol] || '0').replace(/,/g, '')) : 0;
    const rawMax = maxCol >= 0 ? parseFloat(String(row[maxCol] || '0').replace(/,/g, '')) : 0;
    const rawTarget = targetCol >= 0 ? parseFloat(String(row[targetCol] || '0').replace(/,/g, '')) : 0;
    const rawPrefDest = prefDestCol >= 0 ? String(row[prefDestCol] || '').trim() : '';
    const rawSecDest = secDestCol >= 0 ? String(row[secDestCol] || '').trim() : '';
    const rawPrimUom = primUomCol >= 0 ? String(row[primUomCol] || '').trim() : 'CS';
    const rawSecUom = secUomCol >= 0 ? String(row[secUomCol] || '').trim() : '';

    const validationErrors: string[] = [];

    if (!rawProdCode) {
      validationErrors.push('Product Code is required');
    }

    const ddxm = isNaN(rawDdxm) ? 0 : rawDdxm;
    const min = isNaN(rawMin) ? 0 : rawMin;
    const max = isNaN(rawMax) ? 0 : rawMax;
    const target = isNaN(rawTarget) ? 0 : rawTarget;

    if (min < 0 || target < 0 || max < 0 || ddxm < 0) {
      validationErrors.push('Quantities cannot be negative');
    }

    if (min > target && target > 0) {
      validationErrors.push('Min quantity should be <= Target quantity');
    }

    if (target > max && max > 0) {
      validationErrors.push('Target quantity should be <= Max quantity');
    }

    if (!rawPrefDest) {
      validationErrors.push('Preferred Destination is required');
    }

    parsedRows.push({
      rowIndex: i + 1,
      productCode: rawProdCode,
      description: rawDesc || `Product ${rawProdCode}`,
      ddxmRetentionQuantity: ddxm,
      minimumQuantity: min,
      maximumQuantity: max,
      targetQuantity: target,
      preferredDestinationName: rawPrefDest,
      secondaryDestinationName: rawSecDest,
      primaryUom: rawPrimUom || 'CS',
      secondaryUom: rawSecUom,
      validationErrors,
      status: validationErrors.length > 0 ? 'ERROR' : 'VALID'
    });
  }

  const validRows = parsedRows.filter(r => r.status === 'VALID').length;

  return {
    totalRows: parsedRows.length,
    validRows,
    errorRows: parsedRows.length - validRows,
    rows: parsedRows
  };
};

/**
 * Commits imported planning rules to Firestore.
 */
export const commitPlanningRulesImport = async (
  tenantId: string,
  siteId: string,
  rowsToImport: PlanningRuleImportRow[],
  existingDestinations: Destination[],
  existingProducts: Product[]
): Promise<ImportCommitResult> => {
  let createdRulesCount = 0;
  let updatedRulesCount = 0;
  let createdProductsCount = 0;
  let createdDestinationsCount = 0;
  const errors: string[] = [];

  const destMap = new Map<string, Destination>();
  existingDestinations.forEach(d => {
    destMap.set(d.destinationCode.toLowerCase(), d);
    destMap.set(d.destinationName.toLowerCase(), d);
    if (d.id) destMap.set(d.id.toLowerCase(), d);
  });

  const productMap = new Map<string, Product>();
  existingProducts.forEach(p => {
    productMap.set(p.productCode.toLowerCase(), p);
  });

  // Helper to ensure destination exists or create it
  const resolveOrCreateDestination = async (destName: string): Promise<string> => {
    if (!destName) return '';
    const key = destName.toLowerCase();
    if (destMap.has(key)) {
      return destMap.get(key)!.id!;
    }

    // Auto-create destination if not found
    try {
      const code = destName.toUpperCase().replace(/\s+/g, '_').slice(0, 10);
      const newDestId = await createDocument<any>('destinations', {
        tenantId,
        siteId,
        destinationCode: code,
        destinationName: destName,
        destinationType: 'EXTERNAL_SITE',
        sortOrder: 10,
        status: 'active'
      });
      const newDest: Destination = {
        id: newDestId,
        tenantId,
        siteId,
        destinationCode: code,
        destinationName: destName,
        destinationType: 'EXTERNAL_SITE',
        sortOrder: 10,
        status: 'active',
        createdBy: 'import',
        createdDate: Timestamp.now(),
        modifiedBy: 'import',
        modifiedDate: Timestamp.now()
      };
      destMap.set(key, newDest);
      destMap.set(code.toLowerCase(), newDest);
      createdDestinationsCount++;
      return newDestId;
    } catch (e: any) {
      console.error('Failed to create destination:', destName, e);
      return '';
    }
  };

  // Helper to ensure product exists or create it
  const resolveOrCreateProduct = async (productCode: string, description: string, primaryUom: string): Promise<Product> => {
    const key = productCode.toLowerCase();
    if (productMap.has(key)) {
      return productMap.get(key)!;
    }

    // Create product
    const newProdId = await createDocument<any>('products', {
      tenantId,
      siteId,
      productCode,
      description: description || `Product ${productCode}`,
      categoryId: '',
      unitOfMeasureId: primaryUom || 'CS',
      casesPerPallet: 100,
      unitsPerCase: 1,
      configurations: [
        {
          unitOfMeasureId: primaryUom || 'CS',
          casesPerPallet: 100,
          unitsPerCase: 1
        }
      ],
      defaultDestinationId: null,
      operationallyRelevant: true,
      notes: 'Auto-created via Planning Rules Import',
      status: 'active'
    });

    const newProd: Product = {
      id: newProdId,
      tenantId,
      siteId,
      productCode,
      description: description || `Product ${productCode}`,
      categoryId: '',
      unitOfMeasureId: primaryUom || 'CS',
      casesPerPallet: 100,
      unitsPerCase: 1,
      configurations: [
        {
          unitOfMeasureId: primaryUom || 'CS',
          casesPerPallet: 100,
          unitsPerCase: 1
        }
      ],
      defaultDestinationId: null,
      operationallyRelevant: true,
      notes: 'Auto-created via Planning Rules Import',
      status: 'active',
      createdBy: 'import',
      createdDate: Timestamp.now(),
      modifiedBy: 'import',
      modifiedDate: Timestamp.now()
    };

    productMap.set(key, newProd);
    createdProductsCount++;
    return newProd;
  };

  // Process rows
  for (const row of rowsToImport) {
    if (row.status !== 'VALID' || !row.productCode) continue;

    try {
      const prefDestId = await resolveOrCreateDestination(row.preferredDestinationName);
      const secDestId = row.secondaryDestinationName ? await resolveOrCreateDestination(row.secondaryDestinationName) : null;
      const product = await resolveOrCreateProduct(row.productCode, row.description, row.primaryUom);

      // Check existing active planning rule for product
      const rulesRef = collection(db, 'planningRules');
      const q = query(
        rulesRef,
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productId', '==', product.id!),
        where('status', '==', 'active')
      );
      const snap = await getDocs(q);

      const rulePayload: Omit<ProductPlanningRule, 'id' | 'createdBy' | 'createdDate' | 'modifiedBy' | 'modifiedDate'> = {
        tenantId,
        siteId,
        productId: product.id!,
        productCodeSnapshot: product.productCode,
        descriptionSnapshot: product.description,
        minimumQuantity: row.minimumQuantity,
        targetQuantity: row.targetQuantity,
        maximumQuantity: row.maximumQuantity,
        ddxmRetentionQuantity: row.ddxmRetentionQuantity,
        controllingThresholdMode: 'HIGHEST_MANDATORY',
        customControllingRetentionQuantity: null,
        preferredDestinationId: prefDestId,
        secondaryDestinationId: secDestId || null,
        defaultActionTypeId: '',
        defaultPriorityLevelId: 'NORMAL',
        allowQuantityOverride: true,
        allowDestinationOverride: true,
        overrideRequiresReason: true,
        effectiveFrom: Timestamp.now(),
        effectiveTo: null,
        untilSwitchedOff: true,
        notes: `Imported from Excel on ${new Date().toLocaleDateString()}`,
        status: 'active'
      };

      if (!snap.empty) {
        // Update existing rule
        const existingDoc = snap.docs[0];
        const batch = writeBatch(db);
        batch.update(existingDoc.ref, {
          ...rulePayload,
          modifiedBy: 'import',
          modifiedDate: Timestamp.now()
        });
        await batch.commit();
        updatedRulesCount++;
      } else {
        // Create new rule
        await createDocument<any>('planningRules', rulePayload);
        createdRulesCount++;
      }
    } catch (e: any) {
      console.error(`Error importing row for product ${row.productCode}:`, e);
      errors.push(`Product ${row.productCode}: ${e.message || 'Import failed'}`);
    }
  }

  // Refresh site recommendations so recommendations update immediately
  try {
    await refreshSiteRecommendations(tenantId, siteId);
  } catch (e) {
    console.warn('Failed to refresh recommendations after rules import:', e);
  }

  return {
    success: errors.length === 0,
    totalProcessed: rowsToImport.length,
    createdRulesCount,
    updatedRulesCount,
    createdProductsCount,
    createdDestinationsCount,
    errors
  };
};

/**
 * Generates and downloads a sample Excel (.xlsx) file template matching the image structure.
 */
export const downloadPlanningRulesTemplate = () => {
  const headers = [
    'Product',
    'Product Short Description',
    'DDXM Retention Quantity',
    'Min',
    'Max',
    'Target',
    'Preferred Destination',
    'Secondary Destination',
    'Primary UOM',
    'Secondary UOM'
  ];

  const sampleData = [
    ['4310500', 'F1 Andrex Skin Protect 155sc 8rx3', 450, 900, 2400, 1600, 'Chorley', 'Northfleet', 'A3', 'CS'],
    ['4310310', 'F1 Andrex Skin Protect 155sc 4rx6', 500, 1000, 2700, 1800, 'Northfleet', 'Chorley', 'A3', 'CS'],
    ['4476102', 'F1 Andrex UQuilts Mega 235sc 9rx1 Flash', 300, 600, 1600, 1050, 'Chorley', 'Northfleet', 'A3', 'CS'],
    ['4475706', 'F1 Andrex UQuilts 155sc 16rx1 Cube', 350, 700, 1900, 1250, 'Northfleet', 'Chorley', 'A3', 'CS'],
    ['4474124', 'F1 Andrex UQuilts 155sc 9rx132 MU', 600, 1200, 3200, 2100, 'Chorley', 'Northfleet', 'A3', 'CS'],
    ['4474132', 'F1 Andrex UQuilts 155sc 9rx4', 750, 1500, 4000, 2600, 'Northfleet', 'Chorley', 'A3', 'CS'],
    ['4475901', 'F1 Andrex UQuilts155sc 24rx1', 400, 800, 2200, 1450, 'Chorley', 'Northfleet', 'A3', 'CS']
  ];

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Set column widths for readability
  worksheet['!cols'] = [
    { wch: 12 }, // Product
    { wch: 45 }, // Description
    { wch: 22 }, // DDXM
    { wch: 8 },  // Min
    { wch: 8 },  // Max
    { wch: 8 },  // Target
    { wch: 22 }, // Preferred Destination
    { wch: 22 }, // Secondary Destination
    { wch: 12 }, // Primary UOM
    { wch: 12 }  // Secondary UOM
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planning Rules');

  XLSX.writeFile(workbook, 'Product_Planning_Rules_Template.xlsx');
};
