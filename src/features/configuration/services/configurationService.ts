import { isUniqueCode, trimCode } from '../../../validation';
import { ServiceResult } from '../../../types/common';
import { createAuditLog } from '../../administration/services/settingsService';
import { createDocument, updateDocument, deactivateDocument, subscribeToCollection } from '../../../services/dbService';
import { supabase } from '../../../config/supabase';
import { toSnakeCase } from '../../../utils/caseTransformers';

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
    
    await createAuditLog({
      tenantId: data.tenantId,
      siteId: data.siteId || "",
      eventType: "CONFIG_CREATE",
      entityType: collectionName,
      entityId: id,
      summary: "Created config item " + codeValue,
      newValue: { ...data, status: "active" },
      performedBy: (data as any).createdBy || "system",
      timestamp: new Date().toISOString()
    });
    
    return { success: true, data: id };
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
export const seedDevelopmentConfiguration = async (tenantId: string, siteId: string, userId: string): Promise<ServiceResult<void>> => {
  if (!userId) {
    return { success: false, error: 'User ID is required for database auditing.' };
  }

  try {
    // 1. Seed Site
    const siteData = toSnakeCase({
      tenantId,
      siteCode: 'BARROW',
      siteName: 'Barrow RDC',
      timezone: 'Europe/London',
      createdBy: userId,
      modifiedBy: userId,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      status: 'active'
    });
    
    const { error: sitesErr } = await supabase.from('sites').insert(siteData);
    if (sitesErr) throw sitesErr;

    // 2. Seed Destinations
    const destinationsData = [
      {
        tenantId,
        siteId: '',
        destinationCode: 'NF',
        destinationName: 'North Fleet',
        destinationType: 'EXTERNAL_SITE',
        sortOrder: 1,
        createdBy: userId,
        modifiedBy: userId,
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        status: 'active'
      },
      {
        tenantId,
        siteId: '',
        destinationCode: 'CH',
        destinationName: 'Chester',
        destinationType: 'EXTERNAL_SITE',
        sortOrder: 2,
        createdBy: userId,
        modifiedBy: userId,
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        status: 'active'
      }
    ].map(toSnakeCase);

    const { error: destErr } = await supabase.from('destinations').insert(destinationsData);
    if (destErr) throw destErr;

    // 3. Seed Storage Areas
    const storageAreasData = [
      {
        tenantId,
        siteId,
        areaCode: 'HB1',
        areaName: 'High Bay 1',
        areaType: 'HIGH_BAY',
        sortOrder: 1,
        createdBy: userId,
        modifiedBy: userId,
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        status: 'active'
      }
    ].map(toSnakeCase);

    const { error: saErr } = await supabase.from('storage_areas').insert(storageAreasData);
    if (saErr) throw saErr;

    // 4. Seed Product Categories
    const initialCategories = [
      { code: 'FAMILY_SOFT', name: 'Family Soft' },
      { code: 'QUILTS', name: 'Quilts' },
      { code: 'COCONUT', name: 'Coconut' },
      { code: 'WR_ESS', name: 'WR Ess' },
      { code: 'WR_PREM', name: 'WR Prem' },
      { code: 'COMPLETE_CLEAN', name: 'Complete Clean' },
      { code: 'WATERMELON', name: 'Watermelon' },
    ];
    const categoriesData = initialCategories.map(cat => toSnakeCase({
      tenantId,
      siteId: '',
      code: cat.code,
      name: cat.name,
      createdBy: userId,
      modifiedBy: userId,
      createdDate: new Date().toISOString(),
      modifiedDate: new Date().toISOString(),
      status: 'active'
    }));

    const { error: catErr } = await supabase.from('product_categories').insert(categoriesData);
    if (catErr) throw catErr;

    // 5. Seed Action Types
    const actionTypesData = [
      {
        tenantId,
        siteId: '',
        code: 'HOLD',
        label: 'Hold',
        meaning: 'Do not pick or load',
        colourToken: 'hold',
        iconKey: 'Clock',
        sortOrder: 1,
        createdBy: userId,
        modifiedBy: userId,
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        status: 'active'
      },
      {
        tenantId,
        siteId: '',
        code: 'SEND',
        label: 'Send',
        meaning: 'Release for picking',
        colourToken: 'release',
        iconKey: 'Send',
        sortOrder: 2,
        createdBy: userId,
        modifiedBy: userId,
        createdDate: new Date().toISOString(),
        modifiedDate: new Date().toISOString(),
        status: 'active'
      }
    ].map(toSnakeCase);

    const { error: actErr } = await supabase.from('action_types').insert(actionTypesData);
    if (actErr) throw actErr;

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to seed development configuration' };
  }
};
