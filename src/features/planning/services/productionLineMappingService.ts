import { ProductionLine } from '../../../types/configuration';
import { ServiceResult } from '../../../types/common';
import { logAuditEvent } from '../../../services/auditService';
import { createDocument, db, doc, getDoc, updateDoc } from '../../../services/supabaseBase';

export interface CreateProductionLineInput {
  lineCode: string;
  lineName: string;
  sapResourceCode: string;
  sapResourceAliases?: string[];
  status?: 'active' | 'inactive';
}

const COLLECTION_NAME = 'productionLines';

export const addSapAliasToLine = async (
  lineId: string,
  sapAlias: string,
  tenantId: string,
  siteId: string,
  userProfileName: string
): Promise<ServiceResult<void>> => {
  if (!db) {
    return { success: false, error: 'Database connection unavailable.' };
  }
  try {
    const cleanAlias = sapAlias.trim().toUpperCase();
    if (!cleanAlias) {
      return { success: false, error: 'SAP alias cannot be empty.' };
    }

    const lineRef = doc(db, COLLECTION_NAME, lineId);
    const lineSnap = await getDoc(lineRef);
    if (!lineSnap.exists()) {
      return { success: false, error: `Production line with ID ${lineId} not found.` };
    }

    const lineData = lineSnap.data() as ProductionLine;
    const existingAliases = Array.isArray(lineData.sapResourceAliases)
      ? lineData.sapResourceAliases
      : [];

    if (existingAliases.some(a => a.toUpperCase() === cleanAlias)) {
      return { success: true }; // Already exists as alias
    }

    const updatedAliases = [...existingAliases, cleanAlias];
    await updateDoc(lineRef, {
      sapResourceAliases: updatedAliases,
      modifiedDate: new Date()
    });

    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'LINE_ALIAS_ADD',
      entityType: 'ProductionLine',
      entityId: lineId,
      summary: `Added SAP resource alias "${cleanAlias}" to production line "${lineData.lineCode}" (${lineData.lineName})`,
      newValue: { sapResourceAliases: updatedAliases },
      performedBy: userProfileName
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to add SAP alias to line.' };
  }
};

export const createProductionLineFromImport = async (
  input: CreateProductionLineInput,
  tenantId: string,
  siteId: string,
  userProfileName: string
): Promise<ServiceResult<string>> => {
  try {
    const cleanCode = input.lineCode.trim().toUpperCase();
    const cleanResource = input.sapResourceCode.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, error: 'Line code is required.' };
    }
    if (!input.lineName.trim()) {
      return { success: false, error: 'Line name is required.' };
    }

    const aliases = Array.from(
      new Set([
        cleanResource,
        ...(input.sapResourceAliases || []).map(a => a.trim().toUpperCase())
      ].filter(Boolean))
    );

    const docId = await createDocument<any>(COLLECTION_NAME, {
      tenantId,
      siteId,
      lineCode: cleanCode,
      lineName: input.lineName.trim(),
      sapResourceCode: cleanResource,
      sapResourceAliases: aliases,
      status: input.status || 'active'
    });

    await logAuditEvent({
      tenantId,
      siteId,
      eventType: 'PRODUCTION_LINE_CREATE',
      entityType: 'ProductionLine',
      entityId: docId,
      summary: `Created production line ${cleanCode} (${input.lineName}) with SAP resource ${cleanResource}`,
      newValue: input,
      performedBy: userProfileName
    });

    return { success: true, data: docId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create production line.' };
  }
};
