import { isUniqueCode, trimCode, trimDescription } from '../../../validation';
import { Product, ProductConfiguration } from '../../../types/product';
import { ServiceResult } from '../../../types/common';
import { getDocument, getDocuments, createDocument, updateDocument, deactivateDocument, subscribeToCollection } from '../../../services/dbService';
import { areProductCodesEqual } from '../../../utils/productCodeNormalizer';
import { logAuditEvent } from '../../../services/auditService';

const COLLECTION_NAME = 'products';

/**
 * Check if a product code is unique within the tenant
 */
async function isUniqueProductCode(
  tenantId: string,
  productCode: string,
  excludeId?: string
): Promise<boolean> {
  const filters = [
    { field: 'tenantId', op: '==' as const, value: tenantId },
    { field: 'productCode', op: '==' as const, value: productCode }
  ];

  const products = await getDocuments<Product>(COLLECTION_NAME, filters);
  
  if (products.length === 0) return true;
  if (excludeId) {
    const others = products.filter(d => d.id !== excludeId);
    return others.length === 0;
  }
  return false;
}

export const getProduct = async (id: string): Promise<Product | null> => {
  try {
    return await getDocument<Product>(COLLECTION_NAME, id);
  } catch (e) {
    console.error(e);
    return null;
  }
};

export const createProduct = async (
  data: Omit<Product, 'id' | 'status' | 'createdDate' | 'modifiedDate'>
): Promise<ServiceResult<string>> => {
  try {
    const codeValue = trimCode(data.productCode);
    const isUnique = await isUniqueProductCode(data.tenantId, codeValue);
    if (!isUnique) {
      return { success: false, error: `A product with code "${codeValue}" already exists.` };
    }

    if (!data.configurations || data.configurations.length === 0) {
      return { success: false, error: 'At least one configuration is required.' };
    }

    // Validate configurations
    for (const config of data.configurations) {
      if (config.casesPerPallet !== null && config.casesPerPallet <= 0) {
        return { success: false, error: 'Cases per pallet must be greater than 0.' };
      }
      if (config.unitsPerCase !== null && config.unitsPerCase <= 0) {
        return { success: false, error: 'Units per case must be greater than 0.' };
      }
    }

    // Synchronize legacy fields with first configuration
    const primaryConfig = data.configurations[0];

    const id = await createDocument<any>(COLLECTION_NAME, {
      ...data,
      productCode: codeValue,
      description: trimDescription(data.description),
      unitOfMeasureId: primaryConfig.unitOfMeasureId,
      casesPerPallet: primaryConfig.casesPerPallet,
      unitsPerCase: primaryConfig.unitsPerCase,
      status: 'active'
    });
    return { success: true, data: id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const updateProduct = async (
  id: string,
  data: Partial<Product>,
  tenantId: string
): Promise<ServiceResult<void>> => {
  try {
    let currentProduct: Product | null = null;
    try {
      currentProduct = await getProduct(id);
    } catch (e) {
      console.warn('Could not fetch current product for diff:', e);
    }

    if (data.productCode) {
      const codeValue = trimCode(data.productCode);
      const isUnique = await isUniqueProductCode(tenantId, codeValue, id);
      if (!isUnique) {
        return { success: false, error: `A product with code "${codeValue}" already exists.` };
      }
      data.productCode = codeValue;
      data.code = codeValue;
    }
    
    if (data.description !== undefined) {
      data.description = trimDescription(data.description);
      data.name = data.description;
    }

    if (data.configurations) {
      if (data.configurations.length === 0) {
        return { success: false, error: 'At least one configuration is required.' };
      }
      
      for (const config of data.configurations) {
        if (config.casesPerPallet !== null && config.casesPerPallet !== undefined && config.casesPerPallet <= 0) {
          return { success: false, error: 'Cases per pallet must be greater than 0.' };
        }
        if (config.unitsPerCase !== null && config.unitsPerCase !== undefined && config.unitsPerCase <= 0) {
          return { success: false, error: 'Units per case must be greater than 0.' };
        }
      }

      // Synchronize legacy fields
      const primaryConfig = data.configurations[0];
      data.unitOfMeasureId = primaryConfig.unitOfMeasureId;
      data.casesPerPallet = primaryConfig.casesPerPallet;
      data.unitsPerCase = primaryConfig.unitsPerCase;
    } else if (currentProduct?.configurations && currentProduct.configurations.length > 0) {
      if (data.casesPerPallet !== undefined || data.unitOfMeasureId !== undefined || data.unitsPerCase !== undefined) {
        const updatedConfigs = [...currentProduct.configurations];
        updatedConfigs[0] = {
          ...updatedConfigs[0],
          casesPerPallet: data.casesPerPallet !== undefined ? data.casesPerPallet : updatedConfigs[0].casesPerPallet,
          unitOfMeasureId: data.unitOfMeasureId !== undefined ? data.unitOfMeasureId : updatedConfigs[0].unitOfMeasureId,
          unitsPerCase: data.unitsPerCase !== undefined ? data.unitsPerCase : updatedConfigs[0].unitsPerCase,
        };
        data.configurations = updatedConfigs;
      }
    }

    await updateDocument(COLLECTION_NAME, id, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const setProductStatus = async (
  id: string,
  active: boolean
): Promise<ServiceResult<void>> => {
  try {
    if (!active) {
      await deactivateDocument(COLLECTION_NAME, id);
    } else {
      await updateDocument(COLLECTION_NAME, id, { status: 'active' });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const subscribeToProducts = (
  tenantId: string,
  siteId: string,
  onUpdate: (products: Product[]) => void,
  onError: (error: Error) => void
) => {
  const constraints: any[] = [];

  if (tenantId && tenantId !== 'GLOBAL') {
    constraints.push({ field: 'tenantId', op: '==' as const, value: tenantId });
  }

  if (siteId && siteId !== 'GLOBAL' && siteId !== 'SETUP_REQUIRED') {
    constraints.push({ field: 'siteId', op: '==' as const, value: siteId });
  }
  
  return subscribeToCollection<Product>(
    COLLECTION_NAME,
    constraints,
    (items) => {
      // Sort alphabetically by productCode
      const sorted = [...items].sort((a, b) => a.productCode.localeCompare(b.productCode));
      onUpdate(sorted);
    },
    onError
  );
};

export interface BulkProductItemInput {
  productCode: string;
  description: string;
  categoryId: string;
  configurations?: ProductConfiguration[];
  unitOfMeasureId?: string;
  casesPerPallet?: number | null;
  unitsPerCase?: number | null;
  defaultDestinationId?: string | null;
  operationallyRelevant?: boolean;
  notes?: string;
  action?: 'create' | 'update' | 'skip';
}

export interface BulkProductBatchParams {
  tenantId: string;
  siteId: string;
  items: BulkProductItemInput[];
  ifExistsAction?: 'update' | 'skip';
  performedBy?: string;
}

export interface BulkProductBatchResult {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: { productCode: string; error: string }[];
}

export const bulkCreateOrUpdateProducts = async (
  params: BulkProductBatchParams
): Promise<ServiceResult<BulkProductBatchResult>> => {
  const { tenantId, siteId, items, ifExistsAction = 'skip', performedBy = 'System' } = params;
  
  if (!items || items.length === 0) {
    return { success: false, error: 'No product items provided for bulk upload.' };
  }

  try {
    // Fetch all existing products for this tenant to check codes
    const existingProducts = await getDocuments<Product>(COLLECTION_NAME, [
      { field: 'tenantId', op: '==' as const, value: tenantId }
    ]);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors: { productCode: string; error: string }[] = [];

    for (const item of items) {
      try {
        const rawCode = trimCode(item.productCode);
        if (!rawCode) {
          failedCount++;
          errors.push({ productCode: item.productCode || 'UNKNOWN', error: 'Product code is empty.' });
          continue;
        }

        const existing = existingProducts.find(p =>
          areProductCodesEqual(rawCode, p.productCode)
        );

        const configs: ProductConfiguration[] = item.configurations && item.configurations.length > 0
          ? item.configurations
          : [{
              unitOfMeasureId: item.unitOfMeasureId || '',
              casesPerPallet: item.casesPerPallet ?? null,
              unitsPerCase: item.unitsPerCase ?? null
            }];

        const primaryConfig = configs[0] || { unitOfMeasureId: '', casesPerPallet: null, unitsPerCase: null };

        if (existing) {
          const actionToTake = item.action || ifExistsAction;
          if (actionToTake === 'skip') {
            skippedCount++;
            continue;
          }

          // Update existing product
          await updateDocument(COLLECTION_NAME, existing.id, {
            description: trimDescription(item.description) || existing.description,
            categoryId: item.categoryId || existing.categoryId,
            unitOfMeasureId: primaryConfig.unitOfMeasureId || existing.unitOfMeasureId,
            casesPerPallet: primaryConfig.casesPerPallet !== null ? primaryConfig.casesPerPallet : existing.casesPerPallet,
            unitsPerCase: primaryConfig.unitsPerCase !== null ? primaryConfig.unitsPerCase : existing.unitsPerCase,
            configurations: configs,
            defaultDestinationId: item.defaultDestinationId !== undefined ? item.defaultDestinationId : existing.defaultDestinationId,
            operationallyRelevant: item.operationallyRelevant !== undefined ? item.operationallyRelevant : existing.operationallyRelevant,
            notes: item.notes !== undefined ? item.notes : (existing.notes || ''),
            siteId: existing.siteId || siteId,
          });
          updatedCount++;
        } else {
          // Create new product
          await createDocument<any>(COLLECTION_NAME, {
            tenantId,
            siteId,
            productCode: rawCode,
            code: rawCode,
            description: trimDescription(item.description) || `Product ${rawCode}`,
            categoryId: item.categoryId || '',
            unitOfMeasureId: primaryConfig.unitOfMeasureId || '',
            casesPerPallet: primaryConfig.casesPerPallet,
            unitsPerCase: primaryConfig.unitsPerCase,
            configurations: configs,
            defaultDestinationId: item.defaultDestinationId || null,
            operationallyRelevant: item.operationallyRelevant !== undefined ? item.operationallyRelevant : true,
            notes: item.notes || '',
            status: 'active'
          });
          createdCount++;
        }
      } catch (itemErr: any) {
        failedCount++;
        errors.push({
          productCode: item.productCode,
          error: itemErr?.message || 'Failed to process item'
        });
      }
    }

    if (createdCount > 0 || updatedCount > 0) {
      try {
        await logAuditEvent({
          tenantId,
          siteId,
          eventType: 'PRODUCT_CREATE',
          entityType: 'Product',
          entityId: 'BULK_UPLOAD',
          summary: `Bulk uploaded ${createdCount} products (${updatedCount} updated, ${skippedCount} skipped)`,
          performedBy
        });
      } catch (auditErr) {
        console.warn('Failed to log bulk product audit event:', auditErr);
      }
    }

    return {
      success: true,
      data: {
        createdCount,
        updatedCount,
        skippedCount,
        failedCount,
        errors
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during bulk product upload.'
    };
  }
};
