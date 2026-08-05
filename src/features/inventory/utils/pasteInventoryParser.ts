import { Product } from '../../../types/product';
import { UnitOfMeasure } from '../../../types/configuration';
import { areProductCodesEqual } from '../../../utils/productCodeNormalizer';

export interface ParsedInventoryItem {
  rawMaterialNumber: string;
  rawDescription?: string;
  unrestrictedCases: number;
  matchedProduct: Product | null;
  casesPerPallet: number | null;
  palletSource: 'A3' | 'Available' | 'None';
  calculatedPallets: number | null;
  unitOfMeasureId: string;
  status: 'MATCHED' | 'NOT_FOUND' | 'INVALID_QTY';
  errorDetails?: string;
}

export interface ParseResult {
  items: ParsedInventoryItem[];
  totalParsed: number;
  matchedCount: number;
  unmatchedCount: number;
  totalCases: number;
  totalPallets: number;
}

export function parsePastedInventoryText(
  text: string,
  products: Product[],
  units: UnitOfMeasure[]
): ParseResult {
  const lines = text.split(/\r?\n/);
  const items: ParsedInventoryItem[] = [];

  // Find A3 UOM IDs
  const a3UomIds = new Set<string>(
    units
      .filter(u => u.code?.toUpperCase() === 'A3' || u.name?.toUpperCase() === 'A3')
      .map(u => u.id)
  );

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Ignore known header patterns
    if (
      /^material/i.test(trimmed) ||
      /^plnt/i.test(trimmed) ||
      /^---/i.test(trimmed) ||
      /material number/i.test(trimmed)
    ) {
      continue;
    }

    // Split line by whitespace
    const tokens = trimmed.split(/\s+/);
    if (tokens.length < 2) continue;

    const rawMaterialNumber = tokens[0];
    const rawQuantityStr = tokens[tokens.length - 1];

    // Clean quantity string (e.g. "3,000" -> "3000")
    const cleanQtyStr = rawQuantityStr.replace(/,/g, '');
    const unrestrictedCases = parseInt(cleanQtyStr, 10);

    if (isNaN(unrestrictedCases)) {
      // Line is likely a header line or summary line
      continue;
    }

    // Match product in system
    const matchedProduct = products.find(p =>
      areProductCodesEqual(rawMaterialNumber, p.productCode)
    ) || null;

    let casesPerPallet: number | null = null;
    let palletSource: 'A3' | 'Available' | 'None' = 'None';
    let calculatedPallets: number | null = null;
    let unitOfMeasureId = '';

    if (matchedProduct) {
      unitOfMeasureId = matchedProduct.unitOfMeasureId || '';

      // Rule: Check 'A3' pallet quantity first
      let foundA3Config = false;
      if (matchedProduct.configurations && matchedProduct.configurations.length > 0) {
        for (const config of matchedProduct.configurations) {
          if (
            config.unitOfMeasureId &&
            a3UomIds.has(config.unitOfMeasureId) &&
            config.casesPerPallet &&
            config.casesPerPallet > 0
          ) {
            casesPerPallet = config.casesPerPallet;
            palletSource = 'A3';
            foundA3Config = true;
            unitOfMeasureId = config.unitOfMeasureId;
            break;
          }
        }

        if (!foundA3Config) {
          // Look for any available config with casesPerPallet > 0
          for (const config of matchedProduct.configurations) {
            if (config.casesPerPallet && config.casesPerPallet > 0) {
              casesPerPallet = config.casesPerPallet;
              palletSource = 'Available';
              unitOfMeasureId = config.unitOfMeasureId;
              break;
            }
          }
        }
      }

      // Fallback to top-level product casesPerPallet if no config matched
      if (casesPerPallet === null && matchedProduct.casesPerPallet && matchedProduct.casesPerPallet > 0) {
        casesPerPallet = matchedProduct.casesPerPallet;
        palletSource = 'Available';
      }

      if (casesPerPallet && casesPerPallet > 0) {
        calculatedPallets = unrestrictedCases / casesPerPallet;
      }
    }

    let status: 'MATCHED' | 'NOT_FOUND' | 'INVALID_QTY' = 'MATCHED';
    let errorDetails: string | undefined;

    if (!matchedProduct) {
      status = 'NOT_FOUND';
      errorDetails = `Product code ${rawMaterialNumber} (or padded) not found in master data`;
    } else if (unrestrictedCases < 0) {
      status = 'INVALID_QTY';
      errorDetails = 'Quantity cannot be negative';
    }

    items.push({
      rawMaterialNumber,
      rawDescription: tokens.length >= 7 ? tokens.slice(1, -5).join(' ') : tokens.slice(1, -1).join(' '),
      unrestrictedCases,
      matchedProduct,
      casesPerPallet,
      palletSource,
      calculatedPallets,
      unitOfMeasureId,
      status,
      errorDetails,
    });
  }

  const totalParsed = items.length;
  const matchedCount = items.filter(i => i.status === 'MATCHED').length;
  const unmatchedCount = totalParsed - matchedCount;
  const totalCases = items.reduce((sum, i) => sum + (i.unrestrictedCases || 0), 0);
  const totalPallets = items.reduce((sum, i) => sum + (i.calculatedPallets || 0), 0);

  return {
    items,
    totalParsed,
    matchedCount,
    unmatchedCount,
    totalCases,
    totalPallets,
  };
}
