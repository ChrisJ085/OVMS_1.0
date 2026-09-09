import { OperationalException, ExceptionType, ExceptionSeverity, ExceptionStatus } from '../../../types/exception';
import { ServiceResult } from '../../../types/common';
import { supabase } from '../../../config/supabase';
import { toSnakeCase, toCamelCase } from '../../../utils/caseTransformers';

export const runExceptionEvaluation = async (
  tenantId: string,
  siteId: string,
  userId: string
): Promise<ServiceResult<void>> => {
  try {
    const { data: priorities, error } = await supabase
      .from('priorities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId);

    if (error) throw error;

    for (const p of (priorities || [])) {
      const camelP = toCamelCase<any>(p);
      if (camelP.priorityStatus === 'BLOCKED') {
        await evaluateAndLogException(
          tenantId,
          siteId,
          'PRIORITY_BLOCKED',
          'PRIORITY',
          camelP.id,
          camelP.productCodeSnapshot || null,
          camelP.id,
          'CRITICAL',
          `Priority Blocked: ${camelP.productCodeSnapshot}`,
          camelP.latestProgressNote || 'Priority marked as blocked during execution.',
          ['BLOCKED_BY_WAREHOUSE'],
          userId
        );
      } else {
        await autoResolveExceptions(tenantId, siteId, 'PRIORITY_BLOCKED', camelP.id, userId, 'Priority is no longer blocked.');
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
    const { data: existing, error } = await supabase
      .from('exceptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId)
      .eq('exception_type', exceptionType)
      .eq('entity_id', entityId)
      .in('exception_status', ['OPEN', 'ACKNOWLEDGED']);

    if (error) throw error;

    const now = new Date().toISOString();

    if (!existing || existing.length === 0) {
      const validProductId = (productId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) ? productId : null;
      const validPriorityId = (priorityId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(priorityId)) ? priorityId : null;

      const newEx = toSnakeCase({
        tenantId,
        siteId,
        exceptionType,
        severity,
        entityType,
        entityId,
        productId: validProductId,
        priorityId: validPriorityId,
        title,
        message,
        reasonCodes,
        exceptionStatus: 'OPEN',
        firstDetectedAt: now,
        lastDetectedAt: now,
        acknowledgedAt: null,
        resolvedAt: null,
        resolutionNote: null,
        createdBy: userId,
        createdDate: now,
        modifiedBy: userId,
        modifiedDate: now
      });

      const { error: insErr } = await supabase
        .from('exceptions')
        .insert(newEx);

      if (insErr) throw insErr;
    } else {
      const ids = existing.map(e => e.id);
      const { error: updErr } = await supabase
        .from('exceptions')
        .update({
          last_detected_at: now,
          updated_at: now,
          updated_by: userId
        })
        .in('id', ids);

      if (updErr) throw updErr;
    }
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
    const { data: existing, error } = await supabase
      .from('exceptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId)
      .eq('exception_type', exceptionType)
      .eq('entity_id', entityId)
      .in('exception_status', ['OPEN', 'ACKNOWLEDGED']);

    if (error) throw error;
    if (!existing || existing.length === 0) return;

    const ids = existing.map(e => e.id);
    const now = new Date().toISOString();

    const { error: updErr } = await supabase
      .from('exceptions')
      .update({
        exception_status: 'RESOLVED',
        resolved_at: now,
        resolution_note: resolutionNote,
        updated_at: now,
        updated_by: userId
      })
      .in('id', ids);

    if (updErr) throw updErr;
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
    const now = new Date().toISOString();
    const updateData: any = {
      exception_status: newStatus,
      updated_at: now,
      updated_by: userId
    };

    if (newStatus === 'ACKNOWLEDGED') updateData.acknowledged_at = now;
    if (newStatus === 'RESOLVED' || newStatus === 'DISMISSED') {
      updateData.resolved_at = now;
      updateData.resolution_note = note || `Manually ${newStatus.toLowerCase()}`;
    }

    const { error } = await supabase
      .from('exceptions')
      .update(updateData)
      .eq('id', exceptionId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error(error);
    return { success: false, error: error.message };
  }
};
