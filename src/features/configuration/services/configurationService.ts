import {
  createDocument,
  updateDocument,
  deactivateDocument,
  subscribeToCollection,
  getBatch
} from '../../../services/firestoreBase';
import { isUniqueCode, trimCode } from '../../../validation';
import { where, QueryConstraint } from 'firebase/firestore';
import {
  SiteConfig,
  Destination,
  UnitOfMeasure,
  ProductCategory,
  StorageArea,
  ProductionLine,
  ActionType,
  PriorityLevel
} from '../../../types/configuration';
import { ServiceResult } from '../../../types/common';
import { db } from '../../../config/firebase';
import { collection, serverTimestamp, writeBatch, doc } from 'firebase/firestore';

const DEV_USER = 'development-user';

export const collections = {
  SITES: 'sites',
  DESTINATIONS: 'destinations',
  UNITS_OF_MEASURE: 'unitsOfMeasure',
  PRODUCT_CATEGORIES: 'productCategories',
  STORAGE_AREAS: 'storageAreas',
  PRODUCTION_LINES: 'productionLines',
  ACTION_TYPES: 'actionTypes',
  PRIORITY_LEVELS: 'priorityLevels'
};

import { createAuditLog } from '../../administration/services/settingsService';

const getUniqueConstraintParams = (
  tenantId: string,
  siteId: string | undefined,
  codeField: string,
  codeValue: string
) => {
  return { tenantId, siteId: siteId || '', codeField, codeValue };
};

export const createConfigItem = async <T extends { tenantId: string; siteId?: string }>(
  collectionName: string,
  data: Omit<T, 'id' | 'status'>,
  codeField: string,
  codeValue: string
): Promise<ServiceResult<string>> => {
  try {
    const isUnique = await isUniqueCode(
      collectionName,
      data.tenantId,
      data.siteId || '',
      codeField,
      trimCode(codeValue)
    );
    if (!isUnique) {
      return { success: false, error: `Code ${codeValue} already exists.` };
    }
    const id = await createDocument<any>(collectionName, {
      ...data,
      status: 'active'
    });
    await createAuditLog({ tenantId: data.tenantId, siteId: data.siteId || "", eventType: "CONFIG_CREATE", entityType: collectionName, entityId: id, summary: "Created config item " + codeValue, newValue: { ...data, status: "active" }, performedBy: "system", timestamp: serverTimestamp() }); return { success: true, data: id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const updateConfigItem = async <T extends { tenantId: string; siteId?: string }>(
  collectionName: string,
  id: string,
  data: Partial<T>,
  codeField?: string,
  codeValue?: string,
  tenantId?: string,
  siteId?: string
): Promise<ServiceResult<void>> => {
  try {
    if (codeField && codeValue && tenantId) {
      const isUnique = await isUniqueCode(
        collectionName,
        tenantId,
        siteId || '',
        codeField,
        trimCode(codeValue),
        id
      );
      if (!isUnique) {
        return { success: false, error: `Code ${codeValue} already exists.` };
      }
    }
    await updateDocument(collectionName, id, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const deactivateConfigItem = async (
  collectionName: string,
  id: string
): Promise<ServiceResult<void>> => {
  try {
    await deactivateDocument(collectionName, id);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

export const reactivateConfigItem = async (
  collectionName: string,
  id: string
): Promise<ServiceResult<void>> => {
  try {
    await updateDocument(collectionName, id, { status: 'active' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Seed utility for development
export const seedDevelopmentConfiguration = async (tenantId: string, siteId: string): Promise<ServiceResult<void>> => {
  if (!db) return { success: false, error: 'Firestore not initialized' };
  
  try {
    const batch = writeBatch(db);
    
    const addDocToBatch = (collName: string, data: any) => {
      const newDocRef = doc(collection(db, collName));
      const newDoc = {
        ...data,
        tenantId,
        createdBy: DEV_USER,
        modifiedBy: DEV_USER,
        createdDate: serverTimestamp(),
        modifiedDate: serverTimestamp(),
        status: 'active'
      };
      if (data.siteId !== undefined) {
         // Keep siteId if provided
      } else if (collName === collections.STORAGE_AREAS || collName === collections.PRODUCTION_LINES) {
         newDoc.siteId = siteId;
      } else {
         newDoc.siteId = '';
      }
      batch.set(newDocRef, newDoc);
    };

    // Barrow RDC Site
    addDocToBatch(collections.SITES, {
      siteCode: 'BARROW',
      siteName: 'Barrow RDC',
      timezone: 'Europe/London'
    });

    // Destinations NF and CH
    addDocToBatch(collections.DESTINATIONS, {
      destinationCode: 'NF',
      destinationName: 'North Fleet',
      destinationType: 'EXTERNAL_SITE',
      sortOrder: 1
    });
    addDocToBatch(collections.DESTINATIONS, {
      destinationCode: 'CH',
      destinationName: 'Chester',
      destinationType: 'EXTERNAL_SITE',
      sortOrder: 2
    });

    // Storage Areas
    addDocToBatch(collections.STORAGE_AREAS, {
      areaCode: 'HB1',
      areaName: 'High Bay 1',
      areaType: 'HIGH_BAY',
      sortOrder: 1
    });

    // Product Categories
    const initialCategories = [
      { code: 'FAMILY_SOFT', name: 'Family Soft' },
      { code: 'QUILTS', name: 'Quilts' },
      { code: 'COCONUT', name: 'Coconut' },
      { code: 'WR_ESS', name: 'WR Ess' },
      { code: 'WR_PREM', name: 'WR Prem' },
      { code: 'COMPLETE_CLEAN', name: 'Complete Clean' },
      { code: 'WATERMELON', name: 'Watermelon' },
    ];
    for (const cat of initialCategories) {
      addDocToBatch(collections.PRODUCT_CATEGORIES, cat);
    }

    // Action Types
    addDocToBatch(collections.ACTION_TYPES, {
      code: 'HOLD',
      label: 'Hold',
      meaning: 'Do not pick or load',
      colourToken: 'hold',
      iconKey: 'Clock',
      sortOrder: 1
    });
    
    addDocToBatch(collections.ACTION_TYPES, {
      code: 'SEND',
      label: 'Send',
      meaning: 'Release for picking',
      colourToken: 'release',
      iconKey: 'Send',
      sortOrder: 2
    });

    await batch.commit();
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to seed' };
  }
};
