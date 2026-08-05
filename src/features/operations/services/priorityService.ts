import { collection, doc, getDocs, query, where, writeBatch, Timestamp, addDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { Priority, PriorityEvent, PriorityStatus, PriorityEventType } from '../../../types/priority';
import { Recommendation } from '../../../types/recommendation';
import { ServiceResult } from '../../../types/common';

import { logAuditEvent } from '../../../services/auditService';

const PRIORITIES_COLLECTION = 'priorities';
const DISPLAY_PRIORITIES_COLLECTION = 'displayPriorities';
const EVENTS_COLLECTION = 'priorityEvents';

const TERMINAL_PRIORITY_STATUSES: PriorityStatus[] = ['DRAFT', 'CANCELLED', 'EXPIRED', 'ARCHIVED'];

export const buildDisplayPriorityDoc = (p: Partial<Priority>, priorityId?: string) => {
  const docId = priorityId || p.id || '';
  return {
    tenantId: p.tenantId || '',
    siteId: p.siteId || '',
    sourcePriorityId: docId,
    priorityCode: p.productCodeSnapshot || p.productId || '',
    productCodeSnapshot: p.productCodeSnapshot || '',
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
    modifiedDate: p.modifiedDate || Timestamp.now()
  };
};

export const logPriorityEvent = async (
  batchOrTransaction: any, // Supports both writeBatch and runTransaction
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
  const eventRef = doc(collection(db, EVENTS_COLLECTION));
  const event: Omit<PriorityEvent, 'id'> = {
    tenantId,
    siteId,
    status: 'active',
    priorityId,
    eventType,
    previousStatus,
    newStatus,
    previousValue,
    newValue,
    note,
    performedBy,
    timestamp: Timestamp.now(),
    createdBy: performedBy,
    createdDate: Timestamp.now(),
    modifiedBy: performedBy,
    modifiedDate: Timestamp.now()
  };
  batchOrTransaction.set(eventRef, event);
};

export const checkDuplicatePriority = async (
  tenantId: string,
  siteId: string,
  productId: string,
  actionTypeId: string,
  destinationId: string | null
): Promise<boolean> => {
  const q = query(
    collection(db, PRIORITIES_COLLECTION),
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    where('productId', '==', productId),
    where('priorityStatus', 'in', ['SCHEDULED', 'ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE'])
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return false;

  for (const d of snap.docs) {
    const p = d.data() as Priority;
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

    const batch = writeBatch(db);
    const newRef = doc(collection(db, PRIORITIES_COLLECTION));
    
    const priority: Omit<Priority, 'id'> = {
      ...priorityData,
      status: 'active',
      progressQuantity: 0,
      remainingQuantity: priorityData.requestedQuantity || 0,
      progressPercent: 0,
      latestProgressNote: null,
      publishedAt: priorityData.priorityStatus !== 'DRAFT' ? Timestamp.now() : null,
      completedAt: null,
      cancelledAt: null,
      createdBy: userId,
      createdDate: Timestamp.now(),
      modifiedBy: userId,
      modifiedDate: Timestamp.now(),
    };

    batch.set(newRef, priority);
    const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, newRef.id);
    if (TERMINAL_PRIORITY_STATUSES.includes(priority.priorityStatus)) {
      batch.delete(displayRef);
    } else {
      batch.set(displayRef, buildDisplayPriorityDoc(priority, newRef.id));
    }

    // Link recommendation if applicable
    if (priorityData.sourceRecommendationId) {
      const recRef = doc(db, 'recommendations', priorityData.sourceRecommendationId);
      batch.update(recRef, { linkedPriorityId: newRef.id, modifiedDate: Timestamp.now(), modifiedBy: userId });
    }

    // Log creation event
    await logPriorityEvent(
      batch,
      priorityData.tenantId,
      priorityData.siteId,
      newRef.id,
      'CREATED',
      null,
      priorityData.priorityStatus,
      null,
      null,
      duplicateOverrideReason ? `Created with duplicate override: ${duplicateOverrideReason}` : 'Priority created',
      userId
    );

    await batch.commit();
    return { success: true, data: newRef.id };
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
    const ref = doc(db, PRIORITIES_COLLECTION, priorityId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, error: 'Priority not found' };

    const existing = snap.data() as Priority;
    const batch = writeBatch(db);

    const updateData: any = {
      ...priorityData,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId || 'System'
    };

    // Remove any undefined properties to prevent Firestore write errors
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

    batch.update(ref, updateData);
    const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, priorityId);
    const mergedPriority = { ...existing, ...updateData };
    if (TERMINAL_PRIORITY_STATUSES.includes(mergedPriority.priorityStatus)) {
      batch.delete(displayRef);
    } else {
      batch.set(displayRef, buildDisplayPriorityDoc(mergedPriority, priorityId));
    }

    await logPriorityEvent(
      batch,
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

    await batch.commit();
    return { success: true };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: e.message };
  }
};

const VALID_TRANSITIONS: Record<PriorityStatus, PriorityStatus[]> = {
  'DRAFT': ['SCHEDULED', 'ACTIVE', 'CANCELLED'],
  'SCHEDULED': ['ACTIVE', 'CANCELLED'],
  'ACTIVE': ['ACKNOWLEDGED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED', 'EXPIRED'],
  'ACKNOWLEDGED': ['IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  'IN_PROGRESS': ['WAITING', 'BLOCKED', 'PARTIALLY_COMPLETE', 'COMPLETED', 'CANCELLED'],
  'WAITING': ['ACTIVE', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CANCELLED'], // Assuming it can go back
  'BLOCKED': ['IN_PROGRESS', 'WAITING', 'CANCELLED'],
  'PARTIALLY_COMPLETE': ['IN_PROGRESS', 'BLOCKED', 'COMPLETED'],
  'COMPLETED': ['ARCHIVED'],
  'CANCELLED': ['ARCHIVED'],
  'EXPIRED': ['ARCHIVED'],
  'WITHDRAWN': ['ARCHIVED'],
  'SUPERSEDED': ['ARCHIVED'],
  'ARCHIVED': []
};

export const updatePriorityStatus = async (
  priorityId: string,
  newStatus: PriorityStatus,
  userId: string,
  note: string = ''
): Promise<ServiceResult<void>> => {
  try {
    const ref = doc(db, PRIORITIES_COLLECTION, priorityId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { success: false, error: 'Priority not found' };

    const priority = snap.data() as Priority;
    
    if (!VALID_TRANSITIONS[priority.priorityStatus].includes(newStatus)) {
      return { success: false, error: `Invalid transition from ${priority.priorityStatus} to ${newStatus}` };
    }

    const batch = writeBatch(db);
    
    const updateData: any = {
      priorityStatus: newStatus,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    };

    if (newStatus === 'COMPLETED') updateData.completedAt = Timestamp.now();
    if (newStatus === 'CANCELLED') updateData.cancelledAt = Timestamp.now();
    if (newStatus === 'SCHEDULED' || newStatus === 'ACTIVE') {
       if (!priority.publishedAt) updateData.publishedAt = Timestamp.now();
    }

    batch.update(ref, updateData);
    const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, priorityId);
    if (TERMINAL_PRIORITY_STATUSES.includes(newStatus)) {
      batch.delete(displayRef);
    } else {
      batch.set(displayRef, buildDisplayPriorityDoc({ ...priority, ...updateData }, priorityId));
    }

    await logPriorityEvent(
      batch,
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

    await batch.commit();
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
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, PRIORITIES_COLLECTION, params.priorityId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('Priority not found');

      const priority = snap.data() as Priority;
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
        modifiedDate: Timestamp.now(),
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
        if (params.newStatus === 'COMPLETED') updateData.completedAt = Timestamp.now();
        if (params.newStatus === 'CANCELLED') updateData.cancelledAt = Timestamp.now();
      }
      
      if (params.note) {
        updateData.latestProgressNote = params.note;
      }

      transaction.update(ref, updateData);
      if (params.userRole !== 'WAREHOUSE_OPERATOR') {
        const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, params.priorityId);
        if (TERMINAL_PRIORITY_STATUSES.includes(newStatus)) {
          transaction.delete(displayRef);
        } else {
          transaction.set(displayRef, buildDisplayPriorityDoc({ ...priority, ...updateData }, params.priorityId));
        }
      }

      // Log the event
      if (params.newStatus && params.newStatus !== priority.priorityStatus) {
         await logPriorityEvent(
          transaction,
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
          transaction,
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
          transaction,
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
    });

    return { success: true };
  } catch (e: any) {
    console.error(e);
    return { success: false, error: e.message };
  }
};

export const deletePriority = async (
  priorityId: string,
  userId: string
): Promise<ServiceResult<void>> => {
  try {
    const batch = writeBatch(db);
    const ref = doc(db, PRIORITIES_COLLECTION, priorityId);
    const displayRef = doc(db, DISPLAY_PRIORITIES_COLLECTION, priorityId);
    batch.delete(ref);
    batch.delete(displayRef);
    await batch.commit();
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
    let q = query(collection(db, PRIORITIES_COLLECTION));
    if (targetTenantId) {
      q = query(q, where('tenantId', '==', targetTenantId));
    }
    if (options.siteId) {
      q = query(q, where('siteId', '==', options.siteId));
    }

    const prioritiesSnap = await getDocs(q);

    let dispQ = query(collection(db, DISPLAY_PRIORITIES_COLLECTION));
    if (targetTenantId) {
      dispQ = query(dispQ, where('tenantId', '==', targetTenantId));
    }
    if (options.siteId) {
      dispQ = query(dispQ, where('siteId', '==', options.siteId));
    }
    const displaySnap = await getDocs(dispQ);
    const existingDisplayMap = new Map<string, any>();
    displaySnap.forEach(d => existingDisplayMap.set(d.id, d.data()));

    let created = 0;
    let updated = 0;
    let removed = 0;
    let failed = 0;

    const sourceDocIds = new Set<string>();
    let batch = writeBatch(db);
    let operationCount = 0;

    for (const priorityDoc of prioritiesSnap.docs) {
      const p = { id: priorityDoc.id, ...priorityDoc.data() } as Priority;
      sourceDocIds.add(p.id);

      const isTerminal = TERMINAL_PRIORITY_STATUSES.includes(p.priorityStatus);
      const hasDisplayDoc = existingDisplayMap.has(p.id);

      if (isTerminal) {
        if (hasDisplayDoc) {
          removed++;
          if (!isDryRun) {
            batch.delete(doc(db, DISPLAY_PRIORITIES_COLLECTION, p.id));
            operationCount++;
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
          batch.set(doc(db, DISPLAY_PRIORITIES_COLLECTION, p.id), sanitizedDoc);
          operationCount++;
        }
      }

      if (operationCount >= 400 && !isDryRun) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    }

    displaySnap.forEach(dDoc => {
      if (!sourceDocIds.has(dDoc.id)) {
        removed++;
        if (!isDryRun) {
          batch.delete(doc(db, DISPLAY_PRIORITIES_COLLECTION, dDoc.id));
          operationCount++;
        }
      }
    });

    if (operationCount > 0 && !isDryRun) {
      await batch.commit();
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
