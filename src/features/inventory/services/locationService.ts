import {
  createDocument,
  updateDocument,
  deactivateDocument,
  subscribeToCollection
} from '../../../services/firestoreBase';
import { isUniqueCode, trimCode } from '../../../validation';
import { where, QueryConstraint } from 'firebase/firestore';
import { Location } from '../../../types/inventory';
import { ServiceResult } from '../../../types/common';

const COLLECTION_NAME = 'locations';

export const createLocation = async (
  data: Omit<Location, 'id' | 'status' | 'createdDate' | 'modifiedDate'>
): Promise<ServiceResult<string>> => {
  try {
    const codeValue = trimCode(data.locationCode);
    const isUnique = await isUniqueCode(
      COLLECTION_NAME,
      data.tenantId,
      data.siteId || '',
      'locationCode',
      codeValue
    );
    if (!isUnique) {
      return { success: false, error: `Location code ${codeValue} already exists.` };
    }

    const id = await createDocument<any>(COLLECTION_NAME, {
      ...data,
      locationCode: codeValue,
      status: 'active'
    });
    return { success: true, data: id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const updateLocation = async (
  id: string,
  data: Partial<Location>,
  tenantId: string,
  siteId: string
): Promise<ServiceResult<void>> => {
  try {
    if (data.locationCode) {
      const codeValue = trimCode(data.locationCode);
      const isUnique = await isUniqueCode(
        COLLECTION_NAME,
        tenantId,
        siteId,
        'locationCode',
        codeValue,
        id
      );
      if (!isUnique) {
        return { success: false, error: `Location code ${codeValue} already exists.` };
      }
      data.locationCode = codeValue;
    }

    await updateDocument(COLLECTION_NAME, id, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const setLocationStatus = async (
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

export const subscribeToLocations = (
  tenantId: string,
  siteId: string,
  onUpdate: (locations: Location[]) => void,
  onError: (error: Error) => void
) => {
  const constraints: QueryConstraint[] = [
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId)
  ];
  
  return subscribeToCollection<Location>(
    COLLECTION_NAME,
    constraints,
    (items) => {
      const sorted = [...items].sort((a, b) => a.locationCode.localeCompare(b.locationCode));
      onUpdate(sorted);
    },
    onError
  );
};
