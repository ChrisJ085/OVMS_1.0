import { Product } from '../types/product';

/**
 * Normalises a product code by trimming whitespace, converting to uppercase,
 * and stripping leading zeros.
 * E.g., "00012345" -> "12345", "  abc-10 " -> "ABC-10"
 */
export const normalizeProductCode = (code: string): string => {
  if (!code) return '';
  const trimmed = code.trim().toUpperCase();
  // Strip leading zeros if numeric or padded number
  const stripped = trimmed.replace(/^0+/, '');
  return stripped || '0';
};

/**
 * Pads a product code with leading zeros up to specified length if it is numeric.
 */
export const padProductCode = (code: string, length: number = 8): string => {
  if (!code) return '';
  const trimmed = code.trim().toUpperCase();
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(length, '0');
  }
  return trimmed;
};

/**
 * Checks if two product codes are equal under exact, padded, or normalised rules.
 */
export const areProductCodesEqual = (codeA: string, codeB: string): boolean => {
  if (!codeA || !codeB) return false;
  const cleanA = codeA.trim().toUpperCase();
  const cleanB = codeB.trim().toUpperCase();

  if (cleanA === cleanB) return true;
  if (padProductCode(cleanA) === padProductCode(cleanB)) return true;
  if (normalizeProductCode(cleanA) === normalizeProductCode(cleanB)) return true;

  return false;
};

/**
 * Searches an array of existing products to find any product matching
 * exact, padded, or normalised code equivalencies.
 */
export const findDuplicateProduct = (
  targetCode: string,
  existingProducts: Product[]
): Product | null => {
  if (!targetCode || !existingProducts.length) return null;

  for (const product of existingProducts) {
    if (areProductCodesEqual(targetCode, product.productCode)) {
      return product;
    }
  }

  return null;
};
