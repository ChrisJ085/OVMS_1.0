import {
  createDocument,
  updateDocument,
  deactivateDocument,
  subscribeToCollection,
  getBatch
} from '../../../services/firestoreBase';
import { isUniqueCode, trimCode, trimDescription } from '../../../validation';
import { doc, getDoc, where, QueryConstraint, orderBy } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Product } from '../../../types/product';
import { ServiceResult } from '../../../types/common';

const COLLECTION_NAME = 'products';

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
    const isUnique = await isUniqueCode(
      COLLECTION_NAME,
      data.tenantId,
      '', // siteId is empty for products
      'productCode',
      codeValue
    );
    if (!isUnique) {
      return { success: false, error: `Product code ${codeValue} already exists.` };
    }

    if (data.casesPerPallet !== null && data.casesPerPallet <= 0) {
      return { success: false, error: 'Cases per pallet must be greater than 0.' };
    }
    if (data.unitsPerCase !== null && data.unitsPerCase <= 0) {
      return { success: false, error: 'Units per case must be greater than 0.' };
    }

    const id = await createDocument<any>(COLLECTION_NAME, {
      ...data,
      productCode: codeValue,
      description: trimDescription(data.description),
      siteId: '', // Always empty for tenant-level products
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
    if (data.productCode) {
      const codeValue = trimCode(data.productCode);
      const isUnique = await isUniqueCode(
        COLLECTION_NAME,
        tenantId,
        '', // siteId empty
        'productCode',
        codeValue,
        id
      );
      if (!isUnique) {
        return { success: false, error: `Product code ${codeValue} already exists.` };
      }
      data.productCode = codeValue;
    }
    
    if (data.description !== undefined) {
      data.description = trimDescription(data.description);
    }
    
    if (data.casesPerPallet !== undefined && data.casesPerPallet !== null && data.casesPerPallet <= 0) {
      return { success: false, error: 'Cases per pallet must be greater than 0.' };
    }
    if (data.unitsPerCase !== undefined && data.unitsPerCase !== null && data.unitsPerCase <= 0) {
      return { success: false, error: 'Units per case must be greater than 0.' };
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
  onUpdate: (products: Product[]) => void,
  onError: (error: Error) => void
) => {
  const constraints: QueryConstraint[] = [
    where('tenantId', '==', tenantId),
    where('siteId', '==', '')
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
