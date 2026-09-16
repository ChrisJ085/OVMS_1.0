import { ProductionLine } from '../../../types/configuration';
import { ProductionPlanEntry } from '../../../types/production';
import { ServiceResult } from '../../../types/common';
import { logAuditEvent } from '../../../services/auditService';
import { getDocument, createDocument, updateDocument } from '../../../services/dbService';

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
  try {
    const cleanAlias = sapAlias.trim().toUpperCase();
    if (!cleanAlias) {
      return { success: false, error: 'SAP alias cannot be empty.' };
    }

    const lineData = await getDocument<ProductionLine>(COLLECTION_NAME, lineId);
    if (!lineData) {
      return { success: false, error: `Production line with ID ${lineId} not found.` };
    }

    const existingAliases = Array.isArray(lineData.sapResourceAliases)
      ? lineData.sapResourceAliases
      : [];

    if (existingAliases.some(a => a.toUpperCase() === cleanAlias)) {
      return { success: true }; // Already exists as alias
    }

    const updatedAliases = [...existingAliases, cleanAlias];
    await updateDocument(COLLECTION_NAME, lineId, {
      sapResourceAliases: updatedAliases
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

/**
 * Determines whether a production plan entry belongs to a given production line.
 * Matches by:
 * 1. Direct UUID ID match (entry.productionLineId === line.id)
 * 2. Line code snapshot match against lineCode or code
 * 3. Line name match against lineName or name
 * 4. SAP resource code match against line.sapResourceCode
 * 5. SAP resource aliases match
 * 6. Fallback match on entry.productionLineId (if it was stored as line code)
 */
export const isEntryForLine = (entry: ProductionPlanEntry, line: ProductionLine): boolean => {
  if (!entry || !line) return false;

  // 1. Direct UUID ID match
  if (entry.productionLineId && line.id && entry.productionLineId === line.id) {
    return true;
  }

  // 2. Candidate strings from entry
  const entryLineCodeSnapshot = (entry.productionLineCodeSnapshot || '').trim().toUpperCase();
  const entryLineIdStr = (entry.productionLineId || '').trim().toUpperCase();

  // Targets from line
  const targetLineCode = (line.lineCode || (line as any).code || '').trim().toUpperCase();
  const targetLineName = (line.lineName || (line as any).name || '').trim().toUpperCase();
  const targetSapCode = (line.sapResourceCode || '').trim().toUpperCase();
  const targetAliases = Array.isArray(line.sapResourceAliases)
    ? line.sapResourceAliases.map(a => (a || '').trim().toUpperCase()).filter(Boolean)
    : [];

  const candidateCodes = [entryLineCodeSnapshot, entryLineIdStr].filter(Boolean);

  for (const candidate of candidateCodes) {
    if (targetLineCode && candidate === targetLineCode) return true;
    if (targetLineName && candidate === targetLineName) return true;
    if (targetSapCode && candidate === targetSapCode) return true;
    if (targetAliases.includes(candidate)) return true;

    // Check prefix match before underscores e.g. "FCL5" from "FCL5_3200_001"
    if (candidate.includes('_')) {
      const prefix = candidate.split('_')[0];
      if (prefix && (prefix === targetLineCode || prefix === targetSapCode || targetAliases.includes(prefix))) {
        return true;
      }
    }
  }

  return false;
};
