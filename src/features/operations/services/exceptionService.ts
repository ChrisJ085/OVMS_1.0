import { collection, query, where, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../../config/firebase';
import { OperationalException, ExceptionType, ExceptionSeverity, ExceptionStatus } from '../../../types/exception';
import { ServiceResult } from '../../../types/common';

const COLLECTION = 'exceptions';

export const runExceptionEvaluation = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<ServiceResult<void>> => {
  try {
    // We will scan priorities to check for BLOCKED or OVERDUE ones as an example
    const qPriorities = query(
      collection(db, 'priorities'),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId)
    );
    const snap = await getDocs(qPriorities);
    const priorities = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    
    for (const p of priorities) {
      if (p.priorityStatus === 'BLOCKED') {
        await evaluateAndLogException(
          tenantId,
          siteId,
          'PRIORITY_BLOCKED',
          'PRIORITY',
          p.id,
          p.productCodeSnapshot || null,
          p.id,
          'CRITICAL',
          `Priority Blocked: ${p.productCodeSnapshot}`,
          p.latestProgressNote || 'Priority marked as blocked during execution.',
          ['BLOCKED_BY_WAREHOUSE'],
          userId
        );
      } else {
        await autoResolveExceptions(tenantId, siteId, 'PRIORITY_BLOCKED', p.id, userId, 'Priority is no longer blocked.');
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('Exception evaluation error:', err);
    return { success: false, error: err.message };
  }
};

export const evaluateAndLogException = async (
  tenantId: string,
  siteId: string,
  exceptionType: ExceptionType,
  entityType: string,
  entityId: string,
  productId: string | null,
  priorityId: string | null,
  severity: ExceptionSeverity,
  title: string,
  message: string,
  reasonCodes: string[],
  userId: string
): Promise<void> => {
  try {
    // Check if open exception exists
    const q = query(
      collection(db, COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('exceptionType', '==', exceptionType),
      where('entityId', '==', entityId),
      where('exceptionStatus', 'in', ['OPEN', 'ACKNOWLEDGED'])
    );

    const snap = await getDocs(q);
    const batch = writeBatch(db);

    if (snap.empty) {
      // Create new exception
      const newRef = doc(collection(db, COLLECTION));
      const newEx: Omit<OperationalException, 'id'> = {
        tenantId,
        siteId,
        exceptionType,
        severity,
        entityType,
        entityId,
        productId,
        priorityId,
        title,
        message,
        reasonCodes,
        exceptionStatus: 'OPEN',
        firstDetectedAt: Timestamp.now(),
        lastDetectedAt: Timestamp.now(),
        acknowledgedAt: null,
        resolvedAt: null,
        resolutionNote: null,
        createdBy: userId,
        createdDate: Timestamp.now(),
        modifiedBy: userId,
        modifiedDate: Timestamp.now(),
      };
      batch.set(newRef, newEx);
    } else {
      // Update last detected
      snap.docs.forEach(d => {
        batch.update(d.ref, {
          lastDetectedAt: Timestamp.now(),
          modifiedDate: Timestamp.now(),
          modifiedBy: userId
        });
      });
    }

    await batch.commit();
  } catch (err) {
    console.error('Error evaluating exception:', err);
  }
};

export const autoResolveExceptions = async (
  tenantId: string,
  siteId: string,
  exceptionType: ExceptionType,
  entityId: string,
  userId: string,
  resolutionNote: string = 'Automatically resolved by system'
) => {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('exceptionType', '==', exceptionType),
      where('entityId', '==', entityId),
      where('exceptionStatus', 'in', ['OPEN', 'ACKNOWLEDGED'])
    );
    
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach(d => {
      batch.update(d.ref, {
        exceptionStatus: 'RESOLVED',
        resolvedAt: Timestamp.now(),
        resolutionNote,
        modifiedDate: Timestamp.now(),
        modifiedBy: userId
      });
    });
    
    await batch.commit();
  } catch (err) {
    console.error('Error auto-resolving exceptions:', err);
  }
};

export const updateExceptionStatus = async (
  exceptionId: string,
  newStatus: ExceptionStatus,
  userId: string,
  note?: string
): Promise<ServiceResult<void>> => {
  try {
    const ref = doc(db, COLLECTION, exceptionId);
    
    const updateData: any = {
      exceptionStatus: newStatus,
      modifiedDate: Timestamp.now(),
      modifiedBy: userId
    };

    if (newStatus === 'ACKNOWLEDGED') updateData.acknowledgedAt = Timestamp.now();
    if (newStatus === 'RESOLVED' || newStatus === 'DISMISSED') {
      updateData.resolvedAt = Timestamp.now();
      updateData.resolutionNote = note || `Manually ${newStatus.toLowerCase()}`;
    }
    
    const batch = writeBatch(db);
    batch.update(ref, updateData);
    await batch.commit();
    return { success: true };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
};
