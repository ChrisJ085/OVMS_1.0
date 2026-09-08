import { isUniqueCode, trimCode, trimDescription } from '../../../validation';
import { Product } from '../../../types/product';
import { ServiceResult } from '../../../types/common';
import { QueryConstraint, collection, createDocument, db, deactivateDocument, doc, getBatch, getDoc, getDocs, orderBy, query, subscribeToCollection, updateDocument, where } from '../../../services/firestoreBase';

const COLLECTION_NAME = 'products';

/**
 * Check if a product code is unique within the tenant
 */
async function isUniqueProductCode(
  tenantId: string,
  siteId: string,
  productCode: string,
  excludeId?: string
): Promise<boolean> {
  const constraints = [
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('productCode', '==', productCode)
  ];

  const q = query(collection(db, COLLECTION_NAME), ...constraints);
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return true;
  if (excludeId) {
    const others = snapshot.docs.filter(d => d.id !== excludeId);
    return others.length === 0;
  }
  return false;
}

export const getProduct = async (id: string): Promise<Product | null> => {
  try {
    const d = await getDoc(doc(db, COLLECTION_NAME, id));
    if (d.exists()) {
      return { id: d.id, ...d.data() } as Product;
    }
    return null;
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
    const isUnique = await isUniqueProductCode(data.tenantId, data.siteId, codeValue);
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
      siteId: data.siteId,
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
      const isUnique = await isUniqueProductCode(tenantId, data.siteId !== undefined ? data.siteId : currentProduct.siteId, codeValue, id);
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
  const constraints: QueryConstraint[] = [
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId)
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
