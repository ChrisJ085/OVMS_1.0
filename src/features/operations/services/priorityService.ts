import { Priority, PriorityEvent, PriorityStatus, PriorityEventType, PriorityConflict, ConflictResolutionChoice } from '../../../types/priority';
import { Recommendation } from '../../../types/recommendation';
import { ServiceResult } from '../../../types/common';
import { logAuditEvent } from '../../../services/auditService';
import { supabase } from '../../../config/supabase';
import { normalizeTablePayload, toCamelCase, toSnakeCase } from '../../../utils/caseTransformers';
import { normalizeProductCode } from '../../../utils/productCodeNormalizer';

const TERMINAL_PRIORITY_STATUSES: PriorityStatus[] = ['DRAFT', 'CANCELLED', 'EXPIRED', 'ARCHIVED'];

/**
 * Safely removes a priority from the display_priorities projection table.
 * First marks it as CANCELLED via UPDATE (which non-admin PLANNER roles are permitted
 * to perform under RLS) and then attempts DELETE (which succeeds for admins/superusers).
 * This guarantees cancelled priorities disappear immediately from the TV Dashboard.
 */
export const removeDisplayPriorityProjection = async (
  priorityId: string,
  terminalStatus: PriorityStatus = 'CANCELLED'
): Promise<void> => {
  if (!priorityId) return;
  const nowIso = new Date().toISOString();
  const payload: Record<string, any> = {
    priorityStatus: terminalStatus,
    modifiedDate: nowIso
  };

  try {
    const { error: updErr } = await supabase
      .from('display_priorities')
      .update(toSnakeCase(payload))
      .eq('id', priorityId);
    if (updErr) {
      console.warn(`Could not mark display_priorities ${priorityId} as ${terminalStatus}:`, updErr);
    }
  } catch (err) {
    console.warn(`Could not mark display_priorities ${priorityId} as ${terminalStatus}:`, err);
  }

  try {
    await supabase
      .from('display_priorities')
      .delete()
      .eq('id', priorityId);
  } catch (err) {
    console.warn(`Could not delete display_priorities ${priorityId}:`, err);
  }
};

/**
 * Reconciles display_priorities against canonical priorities for a site.
 * Designed to be safe for non-admin Planner roles: marks orphaned or cancelled/expired
 * display_priorities rows as CANCELLED via UPDATE before attempting DELETE, and upserts
 * any out-of-sync active priorities.
 */
export const reconcileDisplayPrioritiesForSite = async (
  tenantId: string,
  siteId: string
): Promise<{ markedCancelled: number; deleted: number; synced: number }> => {
  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') {
    return { markedCancelled: 0, deleted: 0, synced: 0 };
  }

  let markedCancelled = 0;
  let deleted = 0;
  let synced = 0;

  try {
    const [{ data: prioRows, error: prioErr }, { data: dispRows, error: dispErr }] = await Promise.all([
      supabase
        .from('priorities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId),
      supabase
        .from('display_priorities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId)
    ]);

    if (prioErr || dispErr || !prioRows || !dispRows) {
      return { markedCancelled, deleted, synced };
    }

    const now = new Date();
    const priorities = toCamelCase<Priority[]>(prioRows);
    const displays = toCamelCase<any[]>(dispRows);

    const priorityById = new Map<string, Priority>();
    priorities.forEach(p => {
      if (p.id) priorityById.set(p.id, p);
    });

    const displayById = new Map<string, any>();
    displays.forEach(d => {
      if (d.id) displayById.set(d.id, d);
    });

    // 1. Clean up orphaned, terminal, or expired rows in display_priorities
    for (const d of displays) {
      const sourceId = d.sourcePriorityId || d.id;
      const sourcePrio = sourceId ? priorityById.get(sourceId) : undefined;

      const isExpired = Boolean(
        sourcePrio &&
        sourcePrio.expireAt &&
        !sourcePrio.untilSwitchedOff &&
        new Date(sourcePrio.expireAt as any).getTime() < now.getTime()
      );

      const isCompletedExpired = Boolean(
        sourcePrio &&
        sourcePrio.priorityStatus === 'COMPLETED' &&
        sourcePrio.completedAt &&
        (now.getTime() - new Date(sourcePrio.completedAt as any).getTime()) > 10 * 60 * 1000
      );

      const shouldRemove =
        !sourcePrio ||
        TERMINAL_PRIORITY_STATUSES.includes(sourcePrio.priorityStatus) ||
        isExpired ||
        isCompletedExpired;

      if (shouldRemove) {
        const targetStatus: PriorityStatus =
          sourcePrio && TERMINAL_PRIORITY_STATUSES.includes(sourcePrio.priorityStatus)
            ? sourcePrio.priorityStatus
            : isExpired
            ? 'EXPIRED'
            : 'CANCELLED';

        if (d.priorityStatus !== targetStatus && d.priorityStatus !== 'CANCELLED') {
          markedCancelled++;
        }
        await removeDisplayPriorityProjection(d.id, targetStatus === 'COMPLETED' ? 'CANCELLED' : targetStatus);
        deleted++;
      }
    }

    // 2. Ensure active priorities match their display_priorities projection
    for (const p of priorities) {
      if (TERMINAL_PRIORITY_STATUSES.includes(p.priorityStatus)) continue;
      const isExpired = Boolean(
        p.expireAt &&
        !p.untilSwitchedOff &&
        new Date(p.expireAt as any).getTime() < now.getTime()
      );
      if (isExpired) continue;

      if (p.priorityStatus === 'COMPLETED') {
        const compTime = p.completedAt ? new Date(p.completedAt as any).getTime() : 0;
        if (compTime > 0 && now.getTime() - compTime > 10 * 60 * 1000) {
          continue;
        }
      }

      const existingDisp = displayById.get(p.id);
      const needsSync =
        !existingDisp ||
        existingDisp.priorityStatus !== p.priorityStatus ||
        Number(existingDisp.requestedQuantity ?? 0) !== Number(p.requestedQuantity ?? 0) ||
        existingDisp.actionTypeId !== p.actionTypeId ||
        (existingDisp.destinationId || null) !== (p.destinationId || null) ||
        (existingDisp.priorityLevelId || null) !== (p.priorityLevelId || null) ||
        (existingDisp.instruction || '') !== (p.instruction || '');

      if (needsSync) {
        const projection = buildDisplayPriorityDoc(p, p.id);
        await supabase
          .from('display_priorities')
          .upsert(toSnakeCase({ ...projection, id: p.id }));
        synced++;
      }
    }
  } catch (err) {
    console.warn('Could not reconcile display_priorities for site:', err);
  }

  return { markedCancelled, deleted, synced };
};

export const buildDisplayPriorityDoc = (p: Partial<Priority>, priorityId?: string) => {
  const docId = priorityId || p.id || '';
  const cleanProductCode = normalizeProductCode(p.productCodeSnapshot || '');
  return {
    tenantId: p.tenantId || '',
    siteId: p.siteId || '',
    sourcePriorityId: docId,
    priorityCode: cleanProductCode || p.productId || '',
    productCodeSnapshot: cleanProductCode,
    descriptionSnapshot: p.descriptionSnapshot || '',
    title: p.descriptionSnapshot || p.instruction || '',
    instruction: p.instruction || '',
    priorityStatus: p.priorityStatus || 'ACTIVE',
    priorityLevelId: p.priorityLevelId || 'NORMAL',
    priorityLevelLabel: p.priorityLevelLabel || p.priorityLevelId || 'NORMAL',
    actionTypeId: p.actionTypeId || '',
    actionTypeLabel: p.actionTypeLabel || '',
    requestedQuantity: p.requestedQuantity ?? null,
    progressQuantity: p.progressQuantity ?? 0,
    progressPercent: p.progressPercent ?? 0,
    destinationId: p.destinationId ?? null,
    destinationLabel: p.destinationLabel || '',
    overflowDestinationId: p.overflowDestinationId ?? null,
    overflowDestinationLabel: p.overflowDestinationLabel || '',
    startAt: p.startAt || null,
    createdDate: p.createdDate || null,
    completedAt: p.completedAt || null,
    expireAt: p.expireAt || null,
    untilSwitchedOff: p.untilSwitchedOff || false,
    modifiedDate: p.modifiedDate || new Date().toISOString()
  };
};

export const logPriorityEvent = async (
  tenantId: string,
  siteId: string,
  priorityId: string,
  eventType: PriorityEventType,
  previousStatus: PriorityStatus | null,
  newStatus: PriorityStatus | null,
  previousValue: any | null,
  newValue: any | null,
  note: string,
  performedBy: string
) => {
  const event: Omit<PriorityEvent, 'id' | 'status'> = {
    tenantId,
    siteId,
    priorityId,
    eventType,
    previousStatus,
    newStatus,
    previousValue,
    newValue,
    note,
    performedBy,
    timestamp: new Date().toISOString(),
    createdBy: performedBy,
    createdDate: new Date().toISOString(),
    modifiedBy: performedBy,
    modifiedDate: new Date().toISOString()
  };

  const snakePayload = toSnakeCase(event);
  delete (snakePayload as any).status;

  const { error } = await supabase
    .from('priority_events')
    .insert(snakePayload);

  if (error) {
    console.error('Error logging priority event:', error);
  }
};

export const checkDuplicatePriority = async (
  tenantId: string,
  siteId: string,
  productId: string,
  actionTypeId: string,
  destinationId: string | null
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('priorities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('site_id', siteId)
    .eq('product_id', productId)
    .in('priority_status', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE']);

  if (error) {
    console.error('Error checking duplicate priority:', error);
    return false;
  }

  const priorities = toCamelCase<Priority[]>(data || []);
  for (const p of priorities) {
    if (p.actionTypeId === actionTypeId || (destinationId && p.destinationId === destinationId)) {
      return true;
    }
  }
  
  return false;
};

export const createPriority = async (
  priorityData: Omit<Priority, 'id' | 'status' | 'createdDate' | 'modifiedDate' | 'createdBy' | 'modifiedBy' | 'progressQuantity' | 'remainingQuantity' | 'progressPercent' | 'latestProgressNote' | 'publishedAt' | 'completedAt' | 'cancelledAt'>,
  userId: string,
  duplicateOverrideReason?: string
): Promise<ServiceResult<string>> => {
  try {
    const isDuplicate = await checkDuplicatePriority(
      priorityData.tenantId,
      priorityData.siteId,
      priorityData.productId,
      priorityData.actionTypeId,
      priorityData.destinationId
    );

    if (isDuplicate && !duplicateOverrideReason) {
      return { success: false, error: 'DUPLICATE_ACTIVE_PRIORITY' };
    }

    const priority: Omit<Priority, 'id'> = {
      ...priorityData,
      status: 'active',
      progressQuantity: 0,
      remainingQuantity: priorityData.requestedQuantity || 0,
      progressPercent: 0,
      latestProgressNote: null,
      publishedAt: priorityData.priorityStatus !== 'DRAFT' ? new Date().toISOString() : null,
      completedAt: null,
      cancelledAt: null,
      createdBy: userId,
      createdDate: new Date().toISOString(),
      modifiedBy: userId,
      modifiedDate: new Date().toISOString(),
    };

    const { data: newPrio, error: prioErr } = await supabase
      .from('priorities')
      .insert(normalizeTablePayload('priorities', toSnakeCase(priority)))
      .select('id')
      .single();

    if (prioErr || !newPrio) {
      throw new Error(prioErr?.message || 'Failed to insert priority');
    }

    const priorityId = newPrio.id;

    if (TERMINAL_PRIORITY_STATUSES.includes(priority.priorityStatus)) {
      await removeDisplayPriorityProjection(priorityId, priority.priorityStatus);
    } else {
      await supabase
        .from('display_priorities')
        .upsert(toSnakeCase({
          ...buildDisplayPriorityDoc(priority, priorityId),
          id: priorityId
        }));
    }

    // Link recommendation if applicable
    if (priorityData.sourceRecommendationId) {
      await supabase
        .from('recommendations')
        .update(toSnakeCase({
          linkedPriorityId: priorityId,
          modifiedDate: new Date().toISOString(),
          modifiedBy: userId
        }))
        .eq('id', priorityData.sourceRecommendationId);
    }

    // Log creation event
    await logPriorityEvent(
      priorityData.tenantId,
      priorityData.siteId,
      priorityId,
      'CREATED',
      null,
      priorityData.priorityStatus,
      null,
      null,
      duplicateOverrideReason ? `Created with duplicate override: ${duplicateOverrideReason}` : 'Priority created',
      userId
    );

    return { success: true, data: priorityId };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: e.message };
  }
};

export const updatePriority = async (
  priorityId: string,
  priorityData: Partial<Priority>,
  userId: string,
  note: string = 'Priority details updated'
): Promise<ServiceResult<void>> => {
  try {
    const { data: existingData, error: fetchErr } = await supabase
      .from('priorities')
      .select('*')
      .eq('id', priorityId)
      .single();

    if (fetchErr || !existingData) {
      return { success: false, error: 'Priority not found' };
    }

    const existing = toCamelCase<Priority>(existingData);

    const updateData: any = {
      ...priorityData,
      modifiedDate: new Date().toISOString(),
      modifiedBy: userId || 'System'
    };

    // Remove any undefined properties
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    if (priorityData.requestedQuantity !== undefined) {
      const reqQty = priorityData.requestedQuantity;
      const progQty = existing.progressQuantity || 0;
      if (reqQty !== null && reqQty !== undefined) {
        updateData.remainingQuantity = Math.max(0, reqQty - progQty);
        updateData.progressPercent = reqQty > 0 ? Math.round((progQty / reqQty) * 100) : 0;
      } else {
        updateData.remainingQuantity = null;
        updateData.progressPercent = 0;
      }
    }

    const { error: updateErr } = await supabase
      .from('priorities')
      .update(toSnakeCase(updateData))
      .eq('id', priorityId);

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    const mergedPriority = { ...existing, ...updateData };
    if (TERMINAL_PRIORITY_STATUSES.includes(mergedPriority.priorityStatus)) {
      await removeDisplayPriorityProjection(priorityId, mergedPriority.priorityStatus);
    } else {
      await supabase
        .from('display_priorities')
        .upsert(toSnakeCase({
          ...buildDisplayPriorityDoc(mergedPriority, priorityId),
          id: priorityId
        }));
    }

    await logPriorityEvent(
      existing.tenantId,
      existing.siteId,
      priorityId,
      'MATERIAL_AMENDMENT',
      existing.priorityStatus,
      priorityData.priorityStatus || existing.priorityStatus,
      null,
      null,
      note,
      userId
    );

    return { success: true };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: e.message };
  }
};

const VALID_TRANSITIONS: Record<PriorityStatus, PriorityStatus[]> = {
  'DRAFT': ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CANCELLED', 'COMPLETED'],
  'SCHEDULED': ['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'CANCELLED', 'EXPIRED', 'COMPLETED'],
  'ACTIVE': ['ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  'ACKNOWLEDGED': ['IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  'IN_PROGRESS': ['WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE', 'COMPLETED', 'CANCELLED'],
  'WAITING': ['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CANCELLED'],
  'BLOCKED': ['IN_PROGRESS', 'WAITING', 'CANCELLED'],
  'PARTIALLY_COMPLETE': ['IN_PROGRESS', 'BLOCKED', 'COMPLETED'],
  'COMPLETED': ['ARCHIVED'],
  'CANCELLED': ['ARCHIVED'],
  'EXPIRED': ['ARCHIVED'],
  'ARCHIVED': []
};

export const updatePriorityStatus = async (
  priorityId: string,
  newStatus: PriorityStatus,
  userId: string,
  note: string = ''
): Promise<ServiceResult<void>> => {
  try {
    const { data: existingData, error: fetchErr } = await supabase
      .from('priorities')
      .select('*')
      .eq('id', priorityId)
      .single();

    if (fetchErr || !existingData) {
      return { success: false, error: 'Priority not found' };
    }

    const priority = toCamelCase<Priority>(existingData);
    
    if (!VALID_TRANSITIONS[priority.priorityStatus].includes(newStatus)) {
      return { success: false, error: `Invalid transition from ${priority.priorityStatus} to ${newStatus}` };
    }

    const updateData: any = {
      priorityStatus: newStatus,
      modifiedDate: new Date().toISOString(),
      modifiedBy: userId
    };

    if (newStatus === 'COMPLETED') updateData.completedAt = new Date().toISOString();
    if (newStatus === 'CANCELLED') updateData.cancelledAt = new Date().toISOString();
    if (['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'].includes(newStatus)) {
       if (!priority.publishedAt) updateData.publishedAt = new Date().toISOString();
    }

    const { error: updateErr } = await supabase
      .from('priorities')
      .update(toSnakeCase(updateData))
      .eq('id', priorityId);

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    if (TERMINAL_PRIORITY_STATUSES.includes(newStatus)) {
      await removeDisplayPriorityProjection(priorityId, newStatus);
    } else {
      await supabase
        .from('display_priorities')
        .upsert(toSnakeCase({
          ...buildDisplayPriorityDoc({ ...priority, ...updateData }, priorityId),
          id: priorityId
        }));
    }

    await logPriorityEvent(
      priority.tenantId,
      priority.siteId,
      priorityId,
      'STATUS_CHANGED',
      priority.priorityStatus,
      newStatus,
      priority.priorityStatus,
      newStatus,
      note || `Status changed to ${newStatus}`,
      userId
    );

    return { success: true };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: e.message };
  }
};

export interface PriorityUpdateParams {
  priorityId: string;
  userId: string;
  userRole?: string;
  newStatus?: PriorityStatus;
  progressQuantity?: number;
  note?: string;
  varianceReason?: string;
}

export const executePriorityUpdate = async (params: PriorityUpdateParams): Promise<ServiceResult<void>> => {
  try {
    const { data: existingData, error: fetchErr } = await supabase
      .from('priorities')
      .select('*')
      .eq('id', params.priorityId)
      .single();

    if (fetchErr || !existingData) {
      throw new Error('Priority not found');
    }

    const priority = toCamelCase<Priority>(existingData);
    const newStatus = params.newStatus || priority.priorityStatus;
    
    if (params.newStatus && !VALID_TRANSITIONS[priority.priorityStatus].includes(params.newStatus)) {
      throw new Error(`Invalid transition from ${priority.priorityStatus} to ${params.newStatus}`);
    }

    if (params.newStatus === 'BLOCKED' && !params.note?.trim()) {
      throw new Error('Blocked status requires a reason');
    }
    if (params.newStatus === 'WAITING' && !params.note?.trim()) {
      throw new Error('Waiting status requires a note');
    }

    const updateData: any = {
      modifiedDate: new Date().toISOString(),
      modifiedBy: params.userId
    };

    let newProgressQty = priority.progressQuantity;
    
    if (params.progressQuantity !== undefined) {
      newProgressQty = params.progressQuantity;
      
      if (priority.requestedQuantity !== null) {
        if (newStatus === 'PARTIALLY_COMPLETE' && (newProgressQty <= 0 || newProgressQty >= priority.requestedQuantity)) {
           throw new Error('Partially Complete requires completed quantity greater than 0 and less than requested quantity');
        }
        if (newStatus === 'COMPLETED' && newProgressQty !== priority.requestedQuantity && !params.varianceReason?.trim()) {
           throw new Error('Completed requires completed quantity equal to requested quantity, or an authorized variance reason');
        }
        if (newProgressQty > priority.requestedQuantity && !params.varianceReason?.trim()) {
           throw new Error('Progress quantity cannot be greater than requested quantity without a variance reason');
        }
      }
      
      updateData.progressQuantity = newProgressQty;
      if (priority.requestedQuantity) {
        updateData.remainingQuantity = Math.max(0, priority.requestedQuantity - newProgressQty);
        updateData.progressPercent = Math.round((newProgressQty / priority.requestedQuantity) * 100);
      }
    }
    
    if (params.newStatus) {
      updateData.priorityStatus = params.newStatus;
      if (params.newStatus === 'COMPLETED') updateData.completedAt = new Date().toISOString();
      if (params.newStatus === 'CANCELLED') updateData.cancelledAt = new Date().toISOString();
    }
    
    if (params.note) {
      updateData.latestProgressNote = params.note;
    }

    const { error: updateErr } = await supabase
      .from('priorities')
      .update(toSnakeCase(updateData))
      .eq('id', params.priorityId);

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    if (params.userRole !== 'WAREHOUSE_OPERATOR') {
      if (TERMINAL_PRIORITY_STATUSES.includes(newStatus)) {
        await removeDisplayPriorityProjection(params.priorityId, newStatus);
      } else {
        await supabase
          .from('display_priorities')
          .upsert(toSnakeCase({
            ...buildDisplayPriorityDoc({ ...priority, ...updateData }, params.priorityId),
            id: params.priorityId
          }));
      }
    }

    // Log the event
    if (params.newStatus && params.newStatus !== priority.priorityStatus) {
       await logPriorityEvent(
        priority.tenantId,
        priority.siteId,
        params.priorityId,
        'STATUS_CHANGED',
        priority.priorityStatus,
        params.newStatus,
        priority.priorityStatus,
        params.newStatus,
        params.note || `Status changed to ${params.newStatus}`,
        params.userId
      );
    } else if (params.progressQuantity !== undefined && params.progressQuantity !== priority.progressQuantity) {
       await logPriorityEvent(
        priority.tenantId,
        priority.siteId,
        params.priorityId,
        'PROGRESS_UPDATED',
        priority.priorityStatus,
        priority.priorityStatus,
        priority.progressQuantity,
        params.progressQuantity,
        params.note || `Progress updated to ${params.progressQuantity}`,
        params.userId
      );
    } else if (params.note) {
       await logPriorityEvent(
        priority.tenantId,
        priority.siteId,
        params.priorityId,
        'PROGRESS_UPDATED',
        priority.priorityStatus,
        priority.priorityStatus,
        null,
        null,
        params.note,
        params.userId
      );
    }

    return { success: true };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: e.message };
  }
};

export const deletePriority = async (
  priorityId: string,
  userId: string,
  _completedQty?: number
): Promise<ServiceResult<void>> => {
  try {
    const nowIso = new Date().toISOString();
    // Mark CANCELLED first so non-admin Planners (who lack DELETE RLS) still deactivate both tables
    try {
      await supabase
        .from('priorities')
        .update(toSnakeCase({
          priorityStatus: 'CANCELLED',
          cancelledAt: nowIso,
          modifiedDate: nowIso,
          modifiedBy: userId || 'system'
        }))
        .eq('id', priorityId);
    } catch (updErr) {
      console.warn('Could not mark priority CANCELLED prior to delete:', updErr);
    }

    await supabase
      .from('priorities')
      .delete()
      .eq('id', priorityId);

    await removeDisplayPriorityProjection(priorityId, 'CANCELLED');

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};

export interface ProjectionRepairResult {
  created: number;
  updated: number;
  removed: number;
  failed: number;
  auditLogId: string | null;
}

export const repairDisplayPriorities = async (
  userProfile: { role: string; tenantId?: string; uid?: string },
  options: { tenantId?: string; siteId?: string; dryRun?: boolean } = {}
): Promise<ServiceResult<ProjectionRepairResult>> => {
  if (userProfile.role !== 'PLATFORM_SUPERUSER' && userProfile.role !== 'TENANT_ADMIN') {
    return { success: false, error: 'Unauthorized: Only Platform Superusers and Tenant Admins can run projection repair.' };
  }

  const targetTenantId = userProfile.role === 'TENANT_ADMIN' ? userProfile.tenantId : options.tenantId;
  const isDryRun = !!options.dryRun;

  try {
    let prioQuery = supabase.from('priorities').select('*');
    if (targetTenantId) {
      prioQuery = prioQuery.eq('tenant_id', targetTenantId);
    }
    if (options.siteId) {
      prioQuery = prioQuery.eq('site_id', options.siteId);
    }
    const { data: prioritiesData, error: prioErr } = await prioQuery;
    if (prioErr) throw new Error(prioErr.message);

    let dispQuery = supabase.from('display_priorities').select('*');
    if (targetTenantId) {
      dispQuery = dispQuery.eq('tenant_id', targetTenantId);
    }
    if (options.siteId) {
      dispQuery = dispQuery.eq('site_id', options.siteId);
    }
    const { data: displaysData, error: dispErr } = await dispQuery;
    if (dispErr) throw new Error(dispErr.message);

    const existingDisplayMap = new Map<string, any>();
    (displaysData || []).forEach(d => existingDisplayMap.set(d.id, toCamelCase(d)));

    let created = 0;
    let updated = 0;
    let removed = 0;
    let failed = 0;

    const sourceDocIds = new Set<string>();

    for (const priorityDoc of (prioritiesData || [])) {
      const p = toCamelCase<Priority>(priorityDoc);
      sourceDocIds.add(p.id);

      const isTerminal = TERMINAL_PRIORITY_STATUSES.includes(p.priorityStatus);
      const hasDisplayDoc = existingDisplayMap.has(p.id);

      if (isTerminal) {
        if (hasDisplayDoc) {
          removed++;
          if (!isDryRun) {
            await removeDisplayPriorityProjection(p.id, p.priorityStatus);
          }
        }
      } else {
        const sanitizedDoc = buildDisplayPriorityDoc(p, p.id);
        if (!hasDisplayDoc) {
          created++;
        } else {
          updated++;
        }

        if (!isDryRun) {
          await supabase.from('display_priorities').upsert(toSnakeCase({ ...sanitizedDoc, id: p.id }));
        }
      }
    }

    for (const dDoc of (displaysData || [])) {
      if (!sourceDocIds.has(dDoc.id)) {
        removed++;
        if (!isDryRun) {
          await removeDisplayPriorityProjection(dDoc.id, 'CANCELLED');
        }
      }
    }

    const auditLogId = await logAuditEvent({
      tenantId: targetTenantId || 'ALL',
      siteId: options.siteId || 'ALL',
      eventType: 'PROJECTION_REPAIR',
      entityType: 'DisplayPriority',
      entityId: 'ALL',
      summary: `Display priorities projection repair completed (${isDryRun ? 'DRY-RUN' : 'LIVE'}). Created: ${created}, Updated: ${updated}, Removed: ${removed}, Failed: ${failed}`,
      performedBy: userProfile.uid || 'UNKNOWN',
      metadata: { created, updated, removed, failed, dryRun: isDryRun }
    });

    return {
      success: true,
      data: { created, updated, removed, failed, auditLogId }
    };
  } catch (e: any) {
    console.error('Projection repair failed:', e);
    return { success: false, error: e.message };
  }
};

export const detectPriorityConflicts = async (
  tenantId: string,
  siteId: string
): Promise<PriorityConflict[]> => {
  try {
    const { data, error } = await supabase
      .from('priorities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId)
      .in('priority_status', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE']);

    if (error || !data) return [];

    const priorities = toCamelCase<Priority[]>(data);

    // Group by productId
    const byProduct = new Map<string, Priority[]>();
    priorities.forEach(p => {
      if (!p.productId) return;
      const existing = byProduct.get(p.productId) || [];
      existing.push(p);
      byProduct.set(p.productId, existing);
    });

    const conflicts: PriorityConflict[] = [];

    byProduct.forEach((proList, prodId) => {
      const manuals = proList.filter(p => p.sourceType === 'MANUAL');
      const systems = proList.filter(p => p.sourceType === 'RECOMMENDATION');

      if (manuals.length > 0 && systems.length > 0) {
        manuals.forEach(manualPrio => {
          systems.forEach(systemPrio => {
            conflicts.push({
              id: `${manualPrio.id}_${systemPrio.id}`,
              tenantId,
              siteId,
              productId: prodId,
              productCodeSnapshot: manualPrio.productCodeSnapshot || systemPrio.productCodeSnapshot || prodId,
              descriptionSnapshot: manualPrio.descriptionSnapshot || systemPrio.descriptionSnapshot || '',
              manualPriority: manualPrio,
              systemPriority: systemPrio,
            });
          });
        });
      }
    });

    return conflicts;
  } catch (e) {
    console.error('Failed to detect priority conflicts:', e);
    return [];
  }
};

export const resolvePriorityConflict = async (
  tenantId: string,
  siteId: string,
  manualPriorityId: string,
  systemPriorityId: string,
  resolution: ConflictResolutionChoice,
  userId: string
): Promise<ServiceResult<void>> => {
  try {
    if (resolution === 'REPLACE_MANUAL_WITH_SYSTEM') {
      const { data: manualData } = await supabase.from('priorities').select('*').eq('id', manualPriorityId).single();
      if (manualData) {
        const manualPrio = toCamelCase<Priority>(manualData);
        await supabase
          .from('priorities')
          .update(toSnakeCase({
            priorityStatus: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
            modifiedDate: new Date().toISOString(),
            modifiedBy: userId
          }))
          .eq('id', manualPriorityId);

        await removeDisplayPriorityProjection(manualPriorityId, 'CANCELLED');

        await logPriorityEvent(
          tenantId,
          siteId,
          manualPriorityId,
          'STATUS_CHANGED',
          manualPrio.priorityStatus,
          'CANCELLED',
          manualPrio.priorityStatus,
          'CANCELLED',
          'Manual priority replaced by system driven recommendation upon planner confirmation.',
          userId
        );
      }
    } else if (resolution === 'KEEP_MANUAL_IGNORE_SYSTEM') {
      const { data: systemData } = await supabase.from('priorities').select('*').eq('id', systemPriorityId).single();
      if (systemData) {
        const systemPrio = toCamelCase<Priority>(systemData);
        await supabase
          .from('priorities')
          .update(toSnakeCase({
            priorityStatus: 'CANCELLED',
            cancelledAt: new Date().toISOString(),
            modifiedDate: new Date().toISOString(),
            modifiedBy: userId
          }))
          .eq('id', systemPriorityId);

        await removeDisplayPriorityProjection(systemPriorityId, 'CANCELLED');

        await logPriorityEvent(
          tenantId,
          siteId,
          systemPriorityId,
          'STATUS_CHANGED',
          systemPrio.priorityStatus,
          'CANCELLED',
          systemPrio.priorityStatus,
          'CANCELLED',
          'System driven priority overridden and cancelled in favor of existing manual priority.',
          userId
        );
      }
    }

    return { success: true };
  } catch (e: any) {
    console.error('Error resolving priority conflict:', e);
    return { success: false, error: e.message };
  }
};

export const resolveAllPriorityConflicts = async (
  tenantId: string,
  siteId: string,
  resolutions: Array<{
    manualPriorityId: string;
    systemPriorityId: string;
    resolution: ConflictResolutionChoice;
  }>,
  userId: string
): Promise<ServiceResult<void>> => {
  try {
    for (const item of resolutions) {
      const res = await resolvePriorityConflict(
        tenantId,
        siteId,
        item.manualPriorityId,
        item.systemPriorityId,
        item.resolution,
        userId
      );
      if (!res.success) return res;
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
};
