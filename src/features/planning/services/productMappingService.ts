import { Product, ProductConfiguration } from '../../../types/product';
import { ServiceResult } from '../../../types/common';
import { createProduct, updateProduct, setProductStatus, getProduct } from '../../inventory/services/productService';
import { findDuplicateProduct } from '../../../utils/productCodeNormalizer';
import { logAuditEvent } from '../../../services/auditService';

export interface CreateProductMasterInput {
  productCode: string;
  description: string;
  categoryId: string;
  configurations: ProductConfiguration[];
  // Legacy fields for backward compatibility
  unitOfMeasureId: string;
  casesPerPallet: number;
  unitsPerCase?: number | null;
  defaultDestinationId?: string | null;
  operationallyRelevant: boolean;
  notes?: string;
  status?: 'active' | 'inactive';
}

export const checkDuplicateProductCode = (
  code: string,
  existingProducts: Product[]
): Product | null => {
  return existingProducts.find(p => p.productCode === code) || null;
};

export const createProductFromImport = async (
  input: CreateProductMasterInput,
  tenantId: string,
  siteId: string,
  userProfileName: string,
  existingProducts: Product[] = []
): Promise<ServiceResult<string>> => {
  // 1. Confirm duplicate check (by code)
  const duplicate = existingProducts.find(p => p.productCode === input.productCode);
  if (duplicate) {
    return {
      success: false,
      error: `Product Master already exists for code "${input.productCode}".`
    };
  }

  // 2. Validate configurations
  if (!input.configurations || input.configurations.length === 0) {
    return {
      success: false,
      error: 'At least one configuration is required.'
    };
  }

  // 3. Create product
  const result = await createProduct({
    tenantId,
    productCode: input.productCode,
    description: input.description,
    categoryId: input.categoryId || 'default',
    configurations: input.configurations,
    // Legacy fields for backward compatibility, synchronized with configurations[0]
    unitOfMeasureId: input.configurations[0].unitOfMeasureId,
    casesPerPallet: input.configurations[0].casesPerPallet,
    unitsPerCase: input.configurations[0].unitsPerCase,
    defaultDestinationId: input.defaultDestinationId || null,
    operationallyRelevant: input.operationallyRelevant ?? true,
    notes: input.notes || 'Created via Master Data Controls during import review',
    createdBy: userProfileName,
    modifiedBy: userProfileName
  });

  if (result.success && result.data) {
    // 4. Log Audit Event
    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'PRODUCT_CREATE_FROM_IMPORT',
      entityType: 'Product',
      entityId: result.data,
      summary: `Created Product Master ${input.productCode} (${input.description}) with ${input.casesPerPallet} cases/pallet from import issue workflow`,
      newValue: input,
      performedBy: userProfileName
    });
  }

  return result;
};

export const updateProductDescriptionInMaster = async (
  productId: string,
  newDescription: string,
  tenantId: string,
  siteId: string,
  userProfileName: string
): Promise<ServiceResult<void>> => {
  const result = await updateProduct(productId, { description: newDescription }, tenantId);
  if (result.success) {
    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'PRODUCT_UPDATE_DESCRIPTION_FROM_IMPORT',
      entityType: 'Product',
      entityId: productId,
      summary: `Updated Product Master description for ${productId} to "${newDescription}"`,
      newValue: { description: newDescription },
      performedBy: userProfileName
    });
  }
  return result;
};

export const updateCasesPerPalletInMaster = async (
  productId: string,
  casesPerPallet: number,
  tenantId: string,
  siteId: string,
  userProfileName: string
): Promise<ServiceResult<void>> => {
  if (casesPerPallet <= 0) {
    return { success: false, error: 'Cases per pallet must be greater than 0.' };
  }

  const result = await updateProduct(productId, { casesPerPallet }, tenantId);
  if (result.success) {
    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'PRODUCT_UPDATE_CASES_PER_PALLET',
      entityType: 'Product',
      entityId: productId,
      summary: `Updated Product Master cases per pallet for ${productId} to ${casesPerPallet}`,
      newValue: { casesPerPallet },
      performedBy: userProfileName
    });
  }
  return result;
};

export const activateProductInMaster = async (
  productId: string,
  tenantId: string,
  siteId: string,
  userProfileName: string
): Promise<ServiceResult<void>> => {
  const result = await setProductStatus(productId, true);
  if (result.success) {
    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'PRODUCT_ACTIVATE',
      entityType: 'Product',
      entityId: productId,
      summary: `Activated Product Master ${productId} from import issue workflow`,
      performedBy: userProfileName
    });
  }
  return result;
};

export const selectProductImportUomInMaster = async (
  productId: string,
  uomId: string,
  tenantId: string,
  siteId: string,
  userProfileName: string
): Promise<ServiceResult<void>> => {
  const currentProduct = await getProduct(productId);
  if (!currentProduct) {
    return { success: false, error: 'Product not found.' };
  }

  const configs = currentProduct.configurations || [];
  const chosenIdx = configs.findIndex(c => c.unitOfMeasureId.trim().toUpperCase() === uomId.trim().toUpperCase());
  
  let newConfigs = [...configs];
  if (chosenIdx > 0) {
    const [chosenConfig] = newConfigs.splice(chosenIdx, 1);
    newConfigs.unshift(chosenConfig);
  }

  const result = await updateProduct(productId, {
    defaultImportUomId: uomId,
    configurations: newConfigs.length > 0 ? newConfigs : undefined
  }, tenantId);

  if (result.success) {
    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'PRODUCT_UPDATE_CASES_PER_PALLET',
      entityType: 'Product',
      entityId: productId,
      summary: `Selected effective Unit of Measure "${uomId}" for Product Master ${productId}`,
      newValue: { defaultImportUomId: uomId },
      performedBy: userProfileName
    });
  }
  return result;
};
