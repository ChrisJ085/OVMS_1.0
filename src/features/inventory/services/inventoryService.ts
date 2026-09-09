import { logAuditEvent } from '../../../services/auditService';
import { InventoryBalance, InventoryMovement } from '../../../types/inventory';
import { ServiceResult } from '../../../types/common';
import { getProduct } from './productService';
import { generateRecommendationForProduct } from '../../planning/services/recommendationService';
import { supabase } from '../../../config/supabase';
import { toCamelCase, toSnakeCase } from '../../../utils/caseTransformers';
import { subscribeToCollection } from '../../../services/dbService';

export const COLLECTIONS = {
  BALANCES: 'inventoryBalances',
  MOVEMENTS: 'inventoryMovements'
};

export interface AdjustmentParams {
  tenantId: string;
  siteId: string;
  productId: string;
  productCodeSnapshot: string;
  quantity: number;
  reason: string;
  reference: string;
  performedBy: string;
}

export interface IncreaseDecreaseParams extends AdjustmentParams {
  locationId: string;
  locationCodeSnapshot: string;
  unitOfMeasureId: string;
  descriptionSnapshot: string;
}

export interface TransferParams extends AdjustmentParams {
  fromLocationId: string;
  fromLocationCodeSnapshot: string;
  toLocationId: string;
  toLocationCodeSnapshot: string;
  unitOfMeasureId: string;
  descriptionSnapshot: string;
}

export const adjustInventory = async (params: IncreaseDecreaseParams, type: 'INCREASE' | 'DECREASE'): Promise<ServiceResult<void>> => {
  if (params.quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }

  try {
    // 1. Look for an existing balance document
    const { data: existingData, error: fetchErr } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('site_id', params.siteId)
      .eq('product_id', params.productId)
      .eq('location_id', params.locationId)
      .maybeSingle();

    if (fetchErr) {
      throw new Error(`Failed to fetch inventory balance: ${fetchErr.message}`);
    }

    const balanceDocData = existingData ? toCamelCase<InventoryBalance>(existingData) : null;
    const currentQuantity = balanceDocData ? balanceDocData.quantity : 0;

    const adjustmentAmount = type === 'INCREASE' ? params.quantity : -params.quantity;
    const newQuantity = currentQuantity + adjustmentAmount;

    if (newQuantity < 0) {
      throw new Error(`Insufficient stock. Current balance: ${currentQuantity}`);
    }

    let balanceId = balanceDocData?.id;

    // 2. Update or create balance
    if (balanceDocData && balanceId) {
      const { error: updateErr } = await supabase
        .from('inventory_balances')
        .update(toSnakeCase({
          quantity: newQuantity,
          source: 'MANUAL',
          sourceUpdatedAt: new Date().toISOString(),
          modifiedBy: params.performedBy,
          modifiedDate: new Date().toISOString(),
        }))
        .eq('id', balanceId);

      if (updateErr) throw new Error(updateErr.message);
    } else {
      const newDoc = {
        tenantId: params.tenantId,
        siteId: params.siteId,
        productId: params.productId,
        productCodeSnapshot: params.productCodeSnapshot,
        descriptionSnapshot: params.descriptionSnapshot,
        locationId: params.locationId,
        locationCodeSnapshot: params.locationCodeSnapshot,
        quantity: newQuantity,
        unitOfMeasureId: params.unitOfMeasureId,
        source: 'MANUAL',
        sourceUpdatedAt: new Date().toISOString(),
        createdBy: params.performedBy,
        createdDate: new Date().toISOString(),
        modifiedBy: params.performedBy,
        modifiedDate: new Date().toISOString(),
        status: 'active'
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('inventory_balances')
        .insert(toSnakeCase(newDoc))
        .select('id')
        .single();

      if (insertErr || !inserted) throw new Error(insertErr?.message || 'Failed to insert inventory balance');
      balanceId = inserted.id;
    }

    // 3. Create movement record
    const movementDoc = {
      tenantId: params.tenantId,
      siteId: params.siteId,
      productId: params.productId,
      productCodeSnapshot: params.productCodeSnapshot,
      movementType: type,
      fromLocationId: type === 'DECREASE' ? params.locationId : null,
      toLocationId: type === 'INCREASE' ? params.locationId : null,
      quantity: params.quantity,
      reason: params.reason,
      reference: params.reference,
      balanceBefore: currentQuantity,
      balanceAfter: newQuantity,
      performedBy: params.performedBy,
      timestamp: new Date().toISOString(),
    };

    const { error: moveErr } = await supabase
      .from('inventory_movements')
      .insert(toSnakeCase(movementDoc));

    if (moveErr) throw new Error(moveErr.message);

    // Trigger recommendation refresh for affected product
    generateRecommendationForProduct(params.tenantId, params.siteId, params.productId).catch(console.error);

    // Log Audit Event
    try {
      await logAuditEvent({
        tenantId: params.tenantId,
        siteId: params.siteId,
        eventType: `INVENTORY_${type}`,
        entityType: 'InventoryBalance',
        entityId: params.productId,
        summary: `${type === 'INCREASE' ? 'Increased' : 'Decreased'} inventory for product ${params.productCodeSnapshot} by ${params.quantity} in location ${params.locationCodeSnapshot}. Reason: ${params.reason}. Ref: ${params.reference}`,
        newValue: {
          productId: params.productId,
          productCode: params.productCodeSnapshot,
          locationId: params.locationId,
          locationCode: params.locationCodeSnapshot,
          quantity: params.quantity,
          adjustmentType: type,
          reason: params.reason,
          reference: params.reference
        },
        performedBy: params.performedBy
      });
    } catch (auditErr) {
      console.warn('Failed to log inventory adjust audit event:', auditErr);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to adjust inventory' };
  }
};

export const transferInventory = async (params: TransferParams): Promise<ServiceResult<void>> => {
  if (params.quantity <= 0) {
    return { success: false, error: 'Quantity must be positive' };
  }
  if (params.fromLocationId === params.toLocationId) {
    return { success: false, error: 'Cannot transfer to the same location' };
  }

  try {
    // 1. Get from location balance
    const { data: fromData, error: fromErr } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('site_id', params.siteId)
      .eq('product_id', params.productId)
      .eq('location_id', params.fromLocationId)
      .maybeSingle();

    if (fromErr || !fromData) {
      throw new Error('Source location has no stock for this product');
    }

    const fromDoc = toCamelCase<InventoryBalance>(fromData);
    const fromQuantity = fromDoc.quantity;
    const newFromQuantity = fromQuantity - params.quantity;

    if (newFromQuantity < 0) {
      throw new Error(`Insufficient stock in source location. Current balance: ${fromQuantity}`);
    }

    // 2. Get to location balance
    const { data: toData, error: toErr } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('site_id', params.siteId)
      .eq('product_id', params.productId)
      .eq('location_id', params.toLocationId)
      .maybeSingle();

    if (toErr) throw new Error(toErr.message);

    const toDoc = toData ? toCamelCase<InventoryBalance>(toData) : null;
    const toQuantity = toDoc ? toDoc.quantity : 0;
    const newToQuantity = toQuantity + params.quantity;

    // 3. Execute updates
    const { error: updFromErr } = await supabase
      .from('inventory_balances')
      .update(toSnakeCase({
        quantity: newFromQuantity,
        source: 'MANUAL',
        sourceUpdatedAt: new Date().toISOString(),
        modifiedBy: params.performedBy,
        modifiedDate: new Date().toISOString(),
      }))
      .eq('id', fromDoc.id);

    if (updFromErr) throw new Error(updFromErr.message);

    if (toDoc) {
      const { error: updToErr } = await supabase
        .from('inventory_balances')
        .update(toSnakeCase({
          quantity: newToQuantity,
          source: 'MANUAL',
          sourceUpdatedAt: new Date().toISOString(),
          modifiedBy: params.performedBy,
          modifiedDate: new Date().toISOString(),
        }))
        .eq('id', toDoc.id);

      if (updToErr) throw new Error(updToErr.message);
    } else {
      const newToDoc = {
        tenantId: params.tenantId,
        siteId: params.siteId,
        productId: params.productId,
        productCodeSnapshot: params.productCodeSnapshot,
        descriptionSnapshot: params.descriptionSnapshot,
        locationId: params.toLocationId,
        locationCodeSnapshot: params.toLocationCodeSnapshot,
        quantity: newToQuantity,
        unitOfMeasureId: params.unitOfMeasureId,
        source: 'MANUAL',
        sourceUpdatedAt: new Date().toISOString(),
        createdBy: params.performedBy,
        createdDate: new Date().toISOString(),
        modifiedBy: params.performedBy,
        modifiedDate: new Date().toISOString(),
        status: 'active'
      };

      const { error: insToErr } = await supabase
        .from('inventory_balances')
        .insert(toSnakeCase(newToDoc));

      if (insToErr) throw new Error(insToErr.message);
    }

    // 4. Transfer Out Movement
    const moveOut = {
      tenantId: params.tenantId,
      siteId: params.siteId,
      productId: params.productId,
      productCodeSnapshot: params.productCodeSnapshot,
      movementType: 'TRANSFER_OUT',
      fromLocationId: params.fromLocationId,
      toLocationId: params.toLocationId,
      quantity: params.quantity,
      reason: params.reason,
      reference: params.reference,
      balanceBefore: fromQuantity,
      balanceAfter: newFromQuantity,
      performedBy: params.performedBy,
      timestamp: new Date().toISOString(),
    };

    // 5. Transfer In Movement
    const moveIn = {
      tenantId: params.tenantId,
      siteId: params.siteId,
      productId: params.productId,
      productCodeSnapshot: params.productCodeSnapshot,
      movementType: 'TRANSFER_IN',
      fromLocationId: params.fromLocationId,
      toLocationId: params.toLocationId,
      quantity: params.quantity,
      reason: params.reason,
      reference: params.reference,
      balanceBefore: toQuantity,
      balanceAfter: newToQuantity,
      performedBy: params.performedBy,
      timestamp: new Date().toISOString(),
    };

    const { error: insMovesErr } = await supabase
      .from('inventory_movements')
      .insert([toSnakeCase(moveOut), toSnakeCase(moveIn)]);

    if (insMovesErr) throw new Error(insMovesErr.message);

    // Trigger recommendation refresh for affected product
    generateRecommendationForProduct(params.tenantId, params.siteId, params.productId).catch(console.error);

    // Log Audit Event
    try {
      await logAuditEvent({
        tenantId: params.tenantId,
        siteId: params.siteId,
        eventType: 'INVENTORY_TRANSFER',
        entityType: 'InventoryBalance',
        entityId: params.productId,
        summary: `Transferred ${params.quantity} of product ${params.productCodeSnapshot} from ${params.fromLocationCodeSnapshot} to ${params.toLocationCodeSnapshot}. Reason: ${params.reason}. Ref: ${params.reference}`,
        newValue: {
          productId: params.productId,
          productCode: params.productCodeSnapshot,
          fromLocationId: params.fromLocationId,
          fromLocationCode: params.fromLocationCodeSnapshot,
          toLocationId: params.toLocationId,
          toLocationCode: params.toLocationCodeSnapshot,
          quantity: params.quantity,
          reason: params.reason,
          reference: params.reference
        },
        performedBy: params.performedBy
      });
    } catch (auditErr) {
      console.warn('Failed to log inventory transfer audit event:', auditErr);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to transfer inventory' };
  }
};

export const subscribeToBalances = (
  tenantId: string,
  siteId: string,
  onUpdate: (balances: InventoryBalance[]) => void,
  onError: (error: Error) => void,
  productId?: string
) => {
  const constraints = [
    { field: 'tenantId', op: '==' as const, value: tenantId },
    { field: 'siteId', op: '==' as const, value: siteId },
  ];
  if (productId) {
    constraints.push({ field: 'productId', op: '==' as const, value: productId });
  }
  
  return subscribeToCollection<InventoryBalance>(
    COLLECTIONS.BALANCES,
    constraints,
    onUpdate,
    onError
  );
};

export const subscribeToMovements = (
  tenantId: string,
  siteId: string,
  onUpdate: (movements: InventoryMovement[]) => void,
  onError: (error: Error) => void,
  productId?: string
) => {
  const constraints = [
    { field: 'tenantId', op: '==' as const, value: tenantId },
    { field: 'siteId', op: '==' as const, value: siteId }
  ];
  if (productId) {
    constraints.push({ field: 'productId', op: '==' as const, value: productId });
  }
  
  return subscribeToCollection<InventoryMovement>(
    COLLECTIONS.MOVEMENTS,
    constraints,
    (items) => {
      // Sort descending by timestamp
      const sorted = [...items].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      onUpdate(sorted);
    },
    onError
  );
};

export const getProductInventory = async (
  tenantId: string,
  siteId: string,
  productId: string
): Promise<{ totalQuantity: number, balances: InventoryBalance[] } | null> => {
  if (!tenantId || !siteId || tenantId === 'GLOBAL' || siteId === 'GLOBAL') return null;
  try {
    const balancesMap = new Map<string, InventoryBalance>();

    // 1. Query by productId
    const { data: dataById, error: errById } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('site_id', siteId)
      .eq('product_id', productId);

    if (!errById && dataById) {
      dataById.forEach(d => {
        balancesMap.set(d.id, toCamelCase<InventoryBalance>(d));
      });
    }

    // 2. Query by productCodeSnapshot as fallback/supplement
    const productDoc = await getProduct(productId);
    if (productDoc?.productCode) {
      const { data: dataByCode, error: errByCode } = await supabase
        .from('inventory_balances')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('site_id', siteId)
        .eq('product_code_snapshot', productDoc.productCode);

      if (!errByCode && dataByCode) {
        dataByCode.forEach(d => {
          if (!balancesMap.has(d.id)) {
            balancesMap.set(d.id, toCamelCase<InventoryBalance>(d));
          }
        });
      }
    }

    const balances = Array.from(balancesMap.values());
    const totalQuantity = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
    return { totalQuantity, balances };
  } catch (e) {
    console.error('Error fetching product inventory:', e);
    return null;
  }
};

export interface BatchInventoryUpdateItem {
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  quantity: number;
  unitOfMeasureId: string;
}

export interface BatchInventoryUpdateParams {
  tenantId: string;
  siteId: string;
  locationId: string;
  locationCodeSnapshot: string;
  items: BatchInventoryUpdateItem[];
  performedBy: string;
}

export const batchUpdateInventoryFromPastedData = async (
  params: BatchInventoryUpdateParams
): Promise<ServiceResult<{ updatedCount: number; zeroedCount: number }>> => {
  if (!params.items || params.items.length === 0) {
    return { success: false, error: 'No items provided for inventory update.' };
  }

  try {
    const pastedProductIds = new Set(params.items.map(i => i.productId).filter(Boolean));
    const pastedProductCodes = new Set(params.items.map(i => i.productCodeSnapshot).filter(Boolean));

    // Fetch all existing inventory balances for this tenant and site
    const { data: allBalances, error: balErr } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('site_id', params.siteId);

    if (balErr) throw new Error(balErr.message);

    const omittedBalanceDocs: { id: string; data: InventoryBalance }[] = [];
    const zeroedProductIds = new Set<string>();

    (allBalances || []).forEach(row => {
      const data = toCamelCase<InventoryBalance>(row);
      const pId = data.productId;
      const pCode = data.productCodeSnapshot;

      const isPasted = (pId && pastedProductIds.has(pId)) || (pCode && pastedProductCodes.has(pCode));
      if (!isPasted && (data.quantity || 0) > 0) {
        omittedBalanceDocs.push({
          id: data.id,
          data
        });
        if (pId) zeroedProductIds.add(pId);
      }
    });

    let totalUpdated = 0;
    let totalZeroed = 0;

    // Process pasted items sequentially
    for (const item of params.items) {
      const { data: existing, error: findErr } = await supabase
        .from('inventory_balances')
        .select('*')
        .eq('tenant_id', params.tenantId)
        .eq('site_id', params.siteId)
        .eq('product_id', item.productId)
        .eq('location_id', params.locationId)
        .maybeSingle();

      if (findErr) throw new Error(findErr.message);

      let currentQuantity = 0;
      let balanceId = null;

      if (existing) {
        const row = toCamelCase<InventoryBalance>(existing);
        currentQuantity = row.quantity || 0;
        balanceId = row.id;
      }

      const newQuantity = item.quantity;
      const delta = newQuantity - currentQuantity;

      if (existing && balanceId) {
        const { error: updErr } = await supabase
          .from('inventory_balances')
          .update(toSnakeCase({
            quantity: newQuantity,
            productCodeSnapshot: item.productCodeSnapshot,
            descriptionSnapshot: item.descriptionSnapshot,
            source: 'IMPORT',
            sourceUpdatedAt: new Date().toISOString(),
            modifiedBy: params.performedBy,
            modifiedDate: new Date().toISOString(),
          }))
          .eq('id', balanceId);

        if (updErr) throw new Error(updErr.message);
      } else {
        const newDoc = {
          tenantId: params.tenantId,
          siteId: params.siteId,
          productId: item.productId,
          productCodeSnapshot: item.productCodeSnapshot,
          descriptionSnapshot: item.descriptionSnapshot,
          locationId: params.locationId,
          locationCodeSnapshot: params.locationCodeSnapshot,
          quantity: newQuantity,
          unitOfMeasureId: item.unitOfMeasureId || '',
          source: 'IMPORT',
          sourceUpdatedAt: new Date().toISOString(),
          createdBy: params.performedBy,
          createdDate: new Date().toISOString(),
          modifiedBy: params.performedBy,
          modifiedDate: new Date().toISOString(),
          status: 'active'
        };

        const { error: insErr } = await supabase
          .from('inventory_balances')
          .insert(toSnakeCase(newDoc));

        if (insErr) throw new Error(insErr.message);
      }

      const movementDoc = {
        tenantId: params.tenantId,
        siteId: params.siteId,
        productId: item.productId,
        productCodeSnapshot: item.productCodeSnapshot,
        movementType: delta >= 0 ? 'INCREASE' : 'DECREASE',
        fromLocationId: delta < 0 ? params.locationId : null,
        toLocationId: delta >= 0 ? params.locationId : null,
        quantity: Math.abs(delta),
        reason: 'Pasted Stock Update',
        reference: `Stock Update at ${params.locationCodeSnapshot}`,
        balanceBefore: currentQuantity,
        balanceAfter: newQuantity,
        performedBy: params.performedBy,
        timestamp: new Date().toISOString(),
      };

      const { error: moveErr } = await supabase
        .from('inventory_movements')
        .insert(toSnakeCase(movementDoc));

      if (moveErr) throw new Error(moveErr.message);

      totalUpdated++;
    }

    // Process omitted items (setting their balance to 0)
    for (const item of omittedBalanceDocs) {
      const currentQty = item.data.quantity || 0;

      const { error: updErr } = await supabase
        .from('inventory_balances')
        .update(toSnakeCase({
          quantity: 0,
          source: 'IMPORT',
          sourceUpdatedAt: new Date().toISOString(),
          modifiedBy: params.performedBy,
          modifiedDate: new Date().toISOString(),
        }))
        .eq('id', item.id);

      if (updErr) throw new Error(updErr.message);

      const movementDoc = {
        tenantId: params.tenantId,
        siteId: params.siteId,
        productId: item.data.productId,
        productCodeSnapshot: item.data.productCodeSnapshot,
        movementType: 'DECREASE',
        fromLocationId: item.data.locationId || params.locationId,
        toLocationId: null,
        quantity: currentQty,
        reason: 'Pasted Stock Update - Omitted Product Zeroed',
        reference: `Stock Update at ${params.locationCodeSnapshot} (Omitted Product Zeroed)`,
        balanceBefore: currentQty,
        balanceAfter: 0,
        performedBy: params.performedBy,
        timestamp: new Date().toISOString(),
      };

      const { error: moveErr } = await supabase
        .from('inventory_movements')
        .insert(toSnakeCase(movementDoc));

      if (moveErr) throw new Error(moveErr.message);

      totalZeroed++;
    }

    // Trigger recommendation refresh for ALL affected products (pasted + zeroed)
    const allAffectedProductIds = Array.from(new Set([
      ...Array.from(pastedProductIds),
      ...Array.from(zeroedProductIds)
    ]));

    allAffectedProductIds.forEach(productId => {
      generateRecommendationForProduct(params.tenantId, params.siteId, productId, true).catch(console.error);
    });

    return { success: true, data: { updatedCount: totalUpdated, zeroedCount: totalZeroed } };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to update inventory balances.' };
  }
};

export interface DeductInventoryParams {
  tenantId: string;
  siteId: string;
  productId: string;
  productCodeSnapshot: string;
  quantity: number;
  reason: string;
  reference: string;
  performedBy: string;
}

export const deductProductInventory = async (params: DeductInventoryParams): Promise<ServiceResult<void>> => {
  if (params.quantity <= 0) {
    return { success: true };
  }

  try {
    const { data: balances, error: balErr } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('tenant_id', params.tenantId)
      .eq('site_id', params.siteId)
      .eq('product_id', params.productId);

    if (balErr) throw new Error(balErr.message);

    let remainingToDeduct = params.quantity;
    
    const sortedDocs = (balances || []).map(row => {
      const data = toCamelCase<InventoryBalance>(row);
      return {
        id: data.id,
        data
      };
    }).sort((a, b) => {
      return (b.data.quantity || 0) - (a.data.quantity || 0);
    });

    const movementsToCreate: any[] = [];

    for (const item of sortedDocs) {
      if (remainingToDeduct <= 0) break;
      const currentQty = item.data.quantity || 0;
      if (currentQty <= 0) continue;

      const deductAmt = Math.min(currentQty, remainingToDeduct);
      const newQty = currentQty - deductAmt;
      remainingToDeduct -= deductAmt;

      const { error: updErr } = await supabase
        .from('inventory_balances')
        .update(toSnakeCase({
          quantity: newQty,
          source: 'MANUAL',
          sourceUpdatedAt: new Date().toISOString(),
          modifiedBy: params.performedBy,
          modifiedDate: new Date().toISOString(),
        }))
        .eq('id', item.id);

      if (updErr) throw new Error(updErr.message);

      movementsToCreate.push({
        tenantId: params.tenantId,
        siteId: params.siteId,
        productId: params.productId,
        productCodeSnapshot: params.productCodeSnapshot,
        movementType: 'DECREASE',
        fromLocationId: item.data.locationId,
        toLocationId: null,
        quantity: deductAmt,
        reason: params.reason,
        reference: params.reference,
        balanceBefore: currentQty,
        balanceAfter: newQty,
        performedBy: params.performedBy,
        timestamp: new Date().toISOString(),
      });
    }

    if (remainingToDeduct > 0) {
      if (sortedDocs.length > 0) {
        const firstItem = sortedDocs[0];
        const currentQty = firstItem.data.quantity || 0;
        const newQty = currentQty - remainingToDeduct;

        const { error: updErr } = await supabase
          .from('inventory_balances')
          .update(toSnakeCase({
            quantity: newQty,
            source: 'MANUAL',
            sourceUpdatedAt: new Date().toISOString(),
            modifiedBy: params.performedBy,
            modifiedDate: new Date().toISOString(),
          }))
          .eq('id', firstItem.id);

        if (updErr) throw new Error(updErr.message);

        movementsToCreate.push({
          tenantId: params.tenantId,
          siteId: params.siteId,
          productId: params.productId,
          productCodeSnapshot: params.productCodeSnapshot,
          movementType: 'DECREASE',
          fromLocationId: firstItem.data.locationId,
          toLocationId: null,
          quantity: remainingToDeduct,
          reason: params.reason,
          reference: params.reference,
          balanceBefore: currentQty,
          balanceAfter: newQty,
          performedBy: params.performedBy,
          timestamp: new Date().toISOString(),
        });
      } else {
        const { data: locationsData } = await supabase
          .from('locations')
          .select('*')
          .eq('tenant_id', params.tenantId)
          .eq('site_id', params.siteId)
          .eq('status', 'active');

        let defaultLocationId = 'SYSTEM';
        let defaultLocationCode = 'SYSTEM';
        
        if (locationsData && locationsData.length > 0) {
          defaultLocationId = locationsData[0].id;
          defaultLocationCode = locationsData[0].location_code || 'HB-01';
        }

        const product = await getProduct(params.productId);
        const descSnapshot = product?.description || '';
        const uomId = product?.unitOfMeasureId || '';

        const newQty = -remainingToDeduct;

        const newDoc = {
          tenantId: params.tenantId,
          siteId: params.siteId,
          productId: params.productId,
          productCodeSnapshot: params.productCodeSnapshot,
          descriptionSnapshot: descSnapshot,
          locationId: defaultLocationId,
          locationCodeSnapshot: defaultLocationCode,
          quantity: newQty,
          unitOfMeasureId: uomId,
          source: 'MANUAL',
          sourceUpdatedAt: new Date().toISOString(),
          createdBy: params.performedBy,
          createdDate: new Date().toISOString(),
          modifiedBy: params.performedBy,
          modifiedDate: new Date().toISOString(),
          status: 'active'
        };

        const { error: insErr } = await supabase
          .from('inventory_balances')
          .insert(toSnakeCase(newDoc));

        if (insErr) throw new Error(insErr.message);

        movementsToCreate.push({
          tenantId: params.tenantId,
          siteId: params.siteId,
          productId: params.productId,
          productCodeSnapshot: params.productCodeSnapshot,
          movementType: 'DECREASE',
          fromLocationId: defaultLocationId,
          toLocationId: null,
          quantity: remainingToDeduct,
          reason: params.reason,
          reference: params.reference,
          balanceBefore: 0,
          balanceAfter: newQty,
          performedBy: params.performedBy,
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (movementsToCreate.length > 0) {
      const { error: movesErr } = await supabase
        .from('inventory_movements')
        .insert(toSnakeCase(movementsToCreate));

      if (movesErr) throw new Error(movesErr.message);
    }

    generateRecommendationForProduct(params.tenantId, params.siteId, params.productId).catch(console.error);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to deduct product inventory' };
  }
};
