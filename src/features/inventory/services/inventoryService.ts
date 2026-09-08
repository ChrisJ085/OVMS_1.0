import { logAuditEvent } from '../../../services/auditService';
import { InventoryBalance, InventoryMovement, MovementType } from '../../../types/inventory';
import { ServiceResult } from '../../../types/common';
import { Product } from '../../../types/product';
import { Location } from '../../../types/inventory';
import { getProduct } from './productService';

import { generateRecommendationForProduct } from '../../planning/services/recommendationService';
import { QueryConstraint, Timestamp, collection, db, doc, getDocs, query, runTransaction, serverTimestamp, subscribeToCollection, where } from '../../../services/firestoreBase';

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
    await runTransaction(db, async (transaction) => {
      // Look for an existing balance document
      const balancesRef = collection(db, COLLECTIONS.BALANCES);
      const q = query(
        balancesRef, 
        where('tenantId', '==', params.tenantId), 
        where('siteId', '==', params.siteId),
        where('productId', '==', params.productId),
        where('locationId', '==', params.locationId)
      );
      
      const querySnapshot = await getDocs(q);
      let balanceDocRef;
      let currentQuantity = 0;
      let balanceDocData: any = null;

      if (!querySnapshot.empty) {
        balanceDocRef = querySnapshot.docs[0].ref;
        balanceDocData = querySnapshot.docs[0].data();
        currentQuantity = balanceDocData.quantity;
      } else {
        balanceDocRef = doc(balancesRef);
      }

      const adjustmentAmount = type === 'INCREASE' ? params.quantity : -params.quantity;
      const newQuantity = currentQuantity + adjustmentAmount;

      if (newQuantity < 0) {
        throw new Error(`Insufficient stock. Current balance: ${currentQuantity}`);
      }

      // Update or create balance
      if (balanceDocData) {
        transaction.update(balanceDocRef, {
          quantity: newQuantity,
          source: 'MANUAL',
          sourceUpdatedAt: serverTimestamp(),
          modifiedBy: params.performedBy,
          modifiedDate: serverTimestamp(),
        });
      } else {
        transaction.set(balanceDocRef, {
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
          sourceUpdatedAt: serverTimestamp(),
          createdBy: params.performedBy,
          createdDate: serverTimestamp(),
          modifiedBy: params.performedBy,
          modifiedDate: serverTimestamp(),
          status: 'active'
        });
      }

      // Create movement record
      const movementRef = doc(collection(db, COLLECTIONS.MOVEMENTS));
      transaction.set(movementRef, {
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
        timestamp: serverTimestamp(),
      });
    });

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
    await runTransaction(db, async (transaction) => {
      const balancesRef = collection(db, COLLECTIONS.BALANCES);
      
      // Get from location balance
      const fromQ = query(
        balancesRef, 
        where('tenantId', '==', params.tenantId), 
        where('siteId', '==', params.siteId),
        where('productId', '==', params.productId),
        where('locationId', '==', params.fromLocationId)
      );
      const fromSnapshot = await getDocs(fromQ);
      
      if (fromSnapshot.empty) {
        throw new Error('Source location has no stock for this product');
      }

      const fromDoc = fromSnapshot.docs[0];
      const fromQuantity = fromDoc.data().quantity;
      const newFromQuantity = fromQuantity - params.quantity;

      if (newFromQuantity < 0) {
        throw new Error(`Insufficient stock in source location. Current balance: ${fromQuantity}`);
      }

      // Get to location balance
      const toQ = query(
        balancesRef, 
        where('tenantId', '==', params.tenantId), 
        where('siteId', '==', params.siteId),
        where('productId', '==', params.productId),
        where('locationId', '==', params.toLocationId)
      );
      const toSnapshot = await getDocs(toQ);

      let toDocRef;
      let toQuantity = 0;
      let hasToDoc = false;

      if (!toSnapshot.empty) {
        toDocRef = toSnapshot.docs[0].ref;
        toQuantity = toSnapshot.docs[0].data().quantity;
        hasToDoc = true;
      } else {
        toDocRef = doc(balancesRef);
      }

      const newToQuantity = toQuantity + params.quantity;

      // Execute updates
      transaction.update(fromDoc.ref, {
        quantity: newFromQuantity,
        source: 'MANUAL',
        sourceUpdatedAt: serverTimestamp(),
        modifiedBy: params.performedBy,
        modifiedDate: serverTimestamp(),
      });

      if (hasToDoc) {
        transaction.update(toDocRef, {
          quantity: newToQuantity,
          source: 'MANUAL',
          sourceUpdatedAt: serverTimestamp(),
          modifiedBy: params.performedBy,
          modifiedDate: serverTimestamp(),
        });
      } else {
        transaction.set(toDocRef, {
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
          sourceUpdatedAt: serverTimestamp(),
          createdBy: params.performedBy,
          createdDate: serverTimestamp(),
          modifiedBy: params.performedBy,
          modifiedDate: serverTimestamp(),
          status: 'active'
        });
      }

      // Transfer Out Movement
      const moveOutRef = doc(collection(db, COLLECTIONS.MOVEMENTS));
      transaction.set(moveOutRef, {
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
        timestamp: serverTimestamp(),
      });

      // Transfer In Movement
      const moveInRef = doc(collection(db, COLLECTIONS.MOVEMENTS));
      transaction.set(moveInRef, {
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
        timestamp: serverTimestamp(),
      });

    });

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
  const constraints: QueryConstraint[] = [
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId),
    // Status isn't consistently used for balances but standard base document has it
  ];
  if (productId) {
    constraints.push(where('productId', '==', productId));
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
  const constraints: QueryConstraint[] = [
    where('tenantId', '==', tenantId),
    where('siteId', '==', siteId)
  ];
  if (productId) {
    constraints.push(where('productId', '==', productId));
  }
  
  return subscribeToCollection<InventoryMovement>(
    COLLECTIONS.MOVEMENTS,
    constraints,
    (items) => {
      // Sort descending by timestamp
      const sorted = [...items].sort((a, b) => {
        const timeA = (a.timestamp as any)?.toDate?.()?.getTime() || 0;
        const timeB = (b.timestamp as any)?.toDate?.()?.getTime() || 0;
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
  try {
    const balancesMap = new Map<string, InventoryBalance>();

    // 1. Query by productId
    const qByProdId = query(
      collection(db, COLLECTIONS.BALANCES),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId)
    );
    const snapProdId = await getDocs(qByProdId);
    snapProdId.docs.forEach(d => {
      balancesMap.set(d.id, { id: d.id, ...d.data() } as InventoryBalance);
    });

    // 2. Query by productCodeSnapshot as fallback/supplement
    const productDoc = await getProduct(productId);
    if (productDoc?.productCode) {
      const qCode = query(
        collection(db, COLLECTIONS.BALANCES),
        where('tenantId', '==', tenantId),
        where('siteId', '==', siteId),
        where('productCodeSnapshot', '==', productDoc.productCode)
      );
      const snapCode = await getDocs(qCode);
      snapCode.docs.forEach(d => {
        if (!balancesMap.has(d.id)) {
          balancesMap.set(d.id, { id: d.id, ...d.data() } as InventoryBalance);
        }
      });
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
    const allBalancesQ = query(
      collection(db, COLLECTIONS.BALANCES),
      where('tenantId', '==', params.tenantId),
      where('siteId', '==', params.siteId)
    );
    const allBalancesSnap = await getDocs(allBalancesQ);

    // Identify balance docs for products NOT in the pasted items that currently have quantity > 0
    interface ZeroItem {
      docRef: any;
      data: InventoryBalance;
    }
    const omittedBalanceDocs: ZeroItem[] = [];
    const zeroedProductIds = new Set<string>();

    allBalancesSnap.docs.forEach(docSnap => {
      const data = docSnap.data() as InventoryBalance;
      const pId = data.productId;
      const pCode = data.productCodeSnapshot;

      const isPasted = (pId && pastedProductIds.has(pId)) || (pCode && pastedProductCodes.has(pCode));
      if (!isPasted && (data.quantity || 0) > 0) {
        omittedBalanceDocs.push({
          docRef: docSnap.ref,
          data: { id: docSnap.id, ...data }
        });
        if (pId) zeroedProductIds.add(pId);
      }
    });

    let totalUpdated = 0;
    let totalZeroed = 0;

    // Process pasted items in chunks
    const chunkSize = 200;
    for (let i = 0; i < params.items.length; i += chunkSize) {
      const chunk = params.items.slice(i, i + chunkSize);

      await runTransaction(db, async (transaction) => {
        for (const item of chunk) {
          const balancesRef = collection(db, COLLECTIONS.BALANCES);
          const q = query(
            balancesRef,
            where('tenantId', '==', params.tenantId),
            where('siteId', '==', params.siteId),
            where('productId', '==', item.productId),
            where('locationId', '==', params.locationId)
          );

          const snap = await getDocs(q);
          let balanceDocRef;
          let currentQuantity = 0;
          let balanceDocData: any = null;

          if (!snap.empty) {
            balanceDocRef = snap.docs[0].ref;
            balanceDocData = snap.docs[0].data();
            currentQuantity = balanceDocData.quantity || 0;
          } else {
            balanceDocRef = doc(balancesRef);
          }

          const newQuantity = item.quantity;
          const delta = newQuantity - currentQuantity;

          if (balanceDocData) {
            transaction.update(balanceDocRef, {
              quantity: newQuantity,
              productCodeSnapshot: item.productCodeSnapshot,
              descriptionSnapshot: item.descriptionSnapshot,
              source: 'IMPORT',
              sourceUpdatedAt: serverTimestamp(),
              modifiedBy: params.performedBy,
              modifiedDate: serverTimestamp(),
            });
          } else {
            transaction.set(balanceDocRef, {
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
              sourceUpdatedAt: serverTimestamp(),
              createdBy: params.performedBy,
              createdDate: serverTimestamp(),
              modifiedBy: params.performedBy,
              modifiedDate: serverTimestamp(),
              status: 'active'
            });
          }

          const movementRef = doc(collection(db, COLLECTIONS.MOVEMENTS));
          transaction.set(movementRef, {
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
            timestamp: serverTimestamp(),
          });

          totalUpdated++;
        }
      });
    }

    // Process omitted items (setting their balance to 0) in chunks
    for (let i = 0; i < omittedBalanceDocs.length; i += chunkSize) {
      const chunk = omittedBalanceDocs.slice(i, i + chunkSize);

      await runTransaction(db, async (transaction) => {
        for (const item of chunk) {
          const currentQty = item.data.quantity || 0;

          transaction.update(item.docRef, {
            quantity: 0,
            source: 'IMPORT',
            sourceUpdatedAt: serverTimestamp(),
            modifiedBy: params.performedBy,
            modifiedDate: serverTimestamp(),
          });

          const movementRef = doc(collection(db, COLLECTIONS.MOVEMENTS));
          transaction.set(movementRef, {
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
            timestamp: serverTimestamp(),
          });

          totalZeroed++;
        }
      });
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
    await runTransaction(db, async (transaction) => {
      const balancesRef = collection(db, COLLECTIONS.BALANCES);
      const q = query(
        balancesRef, 
        where('tenantId', '==', params.tenantId), 
        where('siteId', '==', params.siteId),
        where('productId', '==', params.productId)
      );
      
      const querySnapshot = await getDocs(q);
      
      let remainingToDeduct = params.quantity;
      
      const sortedDocs = querySnapshot.docs.map(docSnap => ({
        ref: docSnap.ref,
        id: docSnap.id,
        data: docSnap.data() as InventoryBalance
      })).sort((a, b) => {
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

        transaction.update(item.ref, {
          quantity: newQty,
          source: 'MANUAL',
          sourceUpdatedAt: serverTimestamp(),
          modifiedBy: params.performedBy,
          modifiedDate: serverTimestamp(),
        });

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
          timestamp: serverTimestamp(),
        });
      }

      if (remainingToDeduct > 0) {
        if (sortedDocs.length > 0) {
          const firstItem = sortedDocs[0];
          const currentQty = firstItem.data.quantity || 0;
          const newQty = currentQty - remainingToDeduct;

          transaction.update(firstItem.ref, {
            quantity: newQty,
            source: 'MANUAL',
            sourceUpdatedAt: serverTimestamp(),
            modifiedBy: params.performedBy,
            modifiedDate: serverTimestamp(),
          });

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
            timestamp: serverTimestamp(),
          });
        } else {
          const locationsRef = collection(db, 'locations');
          const locQ = query(
            locationsRef,
            where('tenantId', '==', params.tenantId),
            where('siteId', '==', params.siteId),
            where('status', '==', 'active')
          );
          const locSnap = await getDocs(locQ);
          let defaultLocationId = 'SYSTEM';
          let defaultLocationCode = 'SYSTEM';
          
          if (!locSnap.empty) {
            defaultLocationId = locSnap.docs[0].id;
            defaultLocationCode = locSnap.docs[0].data().locationCode || 'HB-01';
          }

          const product = await getProduct(params.productId);
          const descSnapshot = product?.description || '';
          const uomId = product?.unitOfMeasureId || '';

          const newBalanceDocRef = doc(balancesRef);
          const newQty = -remainingToDeduct;

          transaction.set(newBalanceDocRef, {
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
            sourceUpdatedAt: serverTimestamp(),
            createdBy: params.performedBy,
            createdDate: serverTimestamp(),
            modifiedBy: params.performedBy,
            modifiedDate: serverTimestamp(),
            status: 'active'
          });

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
            timestamp: serverTimestamp(),
          });
        }
      }

      for (const move of movementsToCreate) {
        const movementRef = doc(collection(db, COLLECTIONS.MOVEMENTS));
        transaction.set(movementRef, move);
      }
    });

    generateRecommendationForProduct(params.tenantId, params.siteId, params.productId).catch(console.error);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to deduct product inventory' };
  }
};

