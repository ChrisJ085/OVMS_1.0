import { Product } from '../../../types/product';
import { areProductCodesEqual } from '../../../utils/productCodeNormalizer';

export interface ParsedProductItem {
  id: string; // generated client-side id for React key / state tracking
  rawLine: string;
  productCode: string;
  description: string;
  isExisting: boolean;
  existingProduct?: Product | null;
  isValid: boolean;
  validationError?: string;
  // User-configurable fields per row:
  categoryId: string;
  unitOfMeasureId: string;
  casesPerPallet: number | null;
  unitsPerCase: number | null;
  defaultDestinationId: string | null;
  operationallyRelevant: boolean;
  notes: string;
}

export interface ParseProductsResult {
  items: ParsedProductItem[];
  totalParsed: number;
  newCount: number;
  existingCount: number;
  invalidCount: number;
}

export interface ParseProductDefaults {
  defaultCategoryId?: string;
  defaultUnitOfMeasureId?: string;
  defaultCasesPerPallet?: number | null;
  defaultUnitsPerCase?: number | null;
  defaultDestinationId?: string | null;
  defaultOperationallyRelevant?: boolean;
}

const HEADER_KEYWORDS = [
  'material',
  'material description',
  'material number',
  'material desc',
  'product code',
  'product',
  'description',
  'matnr',
  'maktx',
  'sku',
  'item',
  'part number',
  'part no',
  'article',
  'code'
];

/**
 * Determines if a line is likely a table header row
 */
function isHeaderLine(line: string): boolean {
  const clean = line.trim().toLowerCase();
  if (clean.startsWith('---') || clean.startsWith('===') || clean.startsWith('___')) {
    return true;
  }

  // Check if line consists mostly of known header words
  const words = clean.split(/[\t,;|\s]+/).filter(Boolean);
  if (words.length === 0) return true;

  if (
    (words[0] === 'material' || words[0] === 'matnr' || words[0] === 'product' || words[0] === 'sku' || words[0] === 'code' || words[0] === 'item') &&
    (words.some(w => w.includes('desc') || w.includes('description') || w.includes('name') || w.includes('text')))
  ) {
    return true;
  }

  if (words.length <= 3 && words.every(w => HEADER_KEYWORDS.includes(w))) {
    return true;
  }

  return false;
}

/**
 * Parses pasted raw text into structured product entries with match status against existing products.
 */
export function parsePastedProductText(
  text: string,
  existingProducts: Product[],
  defaults: ParseProductDefaults = {}
): ParseProductsResult {
  const lines = text.split(/\r?\n/);
  const items: ParsedProductItem[] = [];
  const seenCodes = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) continue;

    // Check for header row
    if (isHeaderLine(trimmed)) {
      continue;
    }

    let productCode = '';
    let description = '';

    // Check 1: Tab-separated (most common when copying from Excel, Google Sheets, or SAP)
    if (trimmed.includes('\t')) {
      const cols = trimmed.split('\t').map(c => c.trim()).filter(Boolean);
      if (cols.length >= 1) {
        productCode = cols[0];
        description = cols.slice(1).join(' ').trim();
      }
    } 
    // Check 2: Comma or semicolon separated if formatted like CSV
    else if (trimmed.includes(',') && !trimmed.includes('\t') && (trimmed.match(/,/g) || []).length === 1) {
      const [col0, ...rest] = trimmed.split(',');
      productCode = col0.trim();
      description = rest.join(',').trim();
    } else if (trimmed.includes(';') && !trimmed.includes('\t') && (trimmed.match(/;/g) || []).length === 1) {
      const [col0, ...rest] = trimmed.split(';');
      productCode = col0.trim();
      description = rest.join(';').trim();
    }
    // Check 3: Whitespace separated (e.g. "3219021    F1 KLX Usoft XL Compact 40sc x16 M")
    else {
      // Split on first whitespace sequence: first token is code, the rest is description
      const match = trimmed.match(/^(\S+)\s+(.+)$/);
      if (match) {
        productCode = match[1].trim();
        description = match[2].trim();
      } else {
        // Single token on line (e.g. only product code pasted)
        productCode = trimmed;
        description = `Product ${productCode}`;
      }
    }

    if (!productCode) continue;

    const normalizedCode = productCode.toUpperCase().trim();
    
    // Check for duplicate in the current paste batch
    if (seenCodes.has(normalizedCode)) {
      continue;
    }
    seenCodes.add(normalizedCode);

    // Validation
    let isValid = true;
    let validationError: string | undefined;

    if (normalizedCode.length < 2) {
      isValid = false;
      validationError = 'Product code is too short';
    }

    // Match against existing products
    const existing = existingProducts.find(p =>
      areProductCodesEqual(normalizedCode, p.productCode)
    ) || null;

    const isExisting = !!existing;

    // Use existing product's current values as defaults if existing, else use provided defaults
    const categoryId = existing ? existing.categoryId : (defaults.defaultCategoryId || '');
    const unitOfMeasureId = existing ? (existing.unitOfMeasureId || (existing.configurations?.[0]?.unitOfMeasureId || '')) : (defaults.defaultUnitOfMeasureId || '');
    const casesPerPallet = existing ? (existing.casesPerPallet ?? (existing.configurations?.[0]?.casesPerPallet ?? null)) : (defaults.defaultCasesPerPallet ?? null);
    const unitsPerCase = existing ? (existing.unitsPerCase ?? (existing.configurations?.[0]?.unitsPerCase ?? null)) : (defaults.defaultUnitsPerCase ?? null);
    const defaultDestinationId = existing ? existing.defaultDestinationId : (defaults.defaultDestinationId || null);
    const operationallyRelevant = existing ? existing.operationallyRelevant : (defaults.defaultOperationallyRelevant !== undefined ? defaults.defaultOperationallyRelevant : true);
    const notes = existing ? (existing.notes || '') : '';

    items.push({
      id: `bulk-${i}-${normalizedCode}`,
      rawLine,
      productCode: normalizedCode,
      description: description || (existing ? existing.description : `Product ${normalizedCode}`),
      isExisting,
      existingProduct: existing,
      isValid,
      validationError,
      categoryId,
      unitOfMeasureId,
      casesPerPallet,
      unitsPerCase,
      defaultDestinationId,
      operationallyRelevant,
      notes,
    });
  }

  const newCount = items.filter(i => !i.isExisting && i.isValid).length;
  const existingCount = items.filter(i => i.isExisting && i.isValid).length;
  const invalidCount = items.filter(i => !i.isValid).length;

  return {
    items,
    totalParsed: items.length,
    newCount,
    existingCount,
    invalidCount
  };
}
