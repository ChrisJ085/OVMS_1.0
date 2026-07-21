import { db } from '../../../config/firebase';
import { 
  collection, 
  doc, 
  runTransaction, 
  serverTimestamp, 
  Timestamp, 
  where, 
  QueryConstraint,
  getDocs,
  query
} from 'firebase/firestore';
import { InventoryBalance, InventoryMovement, MovementType } from '../../../types/inventory';
import { ServiceResult } from '../../../types/common';
import { subscribeToCollection } from '../../../services/firestoreBase';
import { Product } from '../../../types/product';
import { Location } from '../../../types/inventory';

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
    const q = query(
      collection(db, COLLECTIONS.BALANCES),
      where('tenantId', '==', tenantId),
      where('siteId', '==', siteId),
      where('productId', '==', productId)
    );
    const snap = await getDocs(q);
    const balances = snap.docs.map(d => ({ id: d.id, ...d.data() } as InventoryBalance));
    
    if (balances.length === 0) {
      return { totalQuantity: 0, balances: [] };
    }
    
    const totalQuantity = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
    return { totalQuantity, balances };
  } catch (e) {
    console.error(e);
    return null;
  }
};
