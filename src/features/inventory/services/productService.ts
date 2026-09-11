import { isUniqueCode, trimCode, trimDescription } from '../../../validation';
import { Product } from '../../../types/product';
import { ServiceResult } from '../../../types/common';
import { getDocument, getDocuments, createDocument, updateDocument, deactivateDocument, subscribeToCollection } from '../../../services/dbService';

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
    const { siteId: _unusedSiteId, ...productData } = data as any;

    const id = await createDocument<any>(COLLECTION_NAME, {
      ...productData,
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
    const currentProduct = await getProduct(id);
    if (!currentProduct) return { success: false, error: 'Product not found' };

    if (data.productCode) {
      const codeValue = trimCode(data.productCode);
      const isUnique = await isUniqueProductCode(tenantId, codeValue, id);
      if (!isUnique) {
        return { success: false, error: `A product with code "${codeValue}" already exists.` };
      }
      data.productCode = codeValue;
    }
    
    if (data.description !== undefined) {
      data.description = trimDescription(data.description);
    }

    if (data.configurations) {
      if (data.configurations.length === 0) {
        return { success: false, error: 'At least one configuration is required.' };
      }
      
      for (const config of data.configurations) {
        if (config.casesPerPallet !== null && config.casesPerPallet <= 0) {
          return { success: false, error: 'Cases per pallet must be greater than 0.' };
        }
        if (config.unitsPerCase !== null && config.unitsPerCase <= 0) {
          return { success: false, error: 'Units per case must be greater than 0.' };
        }
      }

      // Synchronize legacy fields
      const primaryConfig = data.configurations[0];
      data.unitOfMeasureId = primaryConfig.unitOfMeasureId;
      data.casesPerPallet = primaryConfig.casesPerPallet;
      data.unitsPerCase = primaryConfig.unitsPerCase;
    } else if (currentProduct.configurations && currentProduct.configurations.length > 0) {
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

    const { siteId: _unusedSiteId, ...updatePayload } = data as any;
    await updateDocument(COLLECTION_NAME, id, updatePayload);
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
  _siteId: string,
  onUpdate: (products: Product[]) => void,
  onError: (error: Error) => void
) => {
  const constraints = [
    { field: 'tenantId', op: '==' as const, value: tenantId }
  ];
  
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
