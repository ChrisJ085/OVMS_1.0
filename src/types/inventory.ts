import { BaseDocument } from './common';
import { Timestamp } from 'firebase/firestore';

export interface Location extends BaseDocument {
  storageAreaId: string;
  locationCode: string;
  locationName: string;
}

export type InventorySource = 'MANUAL' | 'IMPORT' | 'INTEGRATION';

export interface InventoryBalance extends BaseDocument {
  productId: string;
  productCodeSnapshot: string;
  descriptionSnapshot: string;
  locationId: string;
  locationCodeSnapshot: string;
  quantity: number;
  unitOfMeasureId: string;
  source: InventorySource;
  sourceUpdatedAt: Timestamp;
}

export type MovementType = 'INCREASE' | 'DECREASE' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'INITIAL_LOAD' | 'CORRECTION';

export interface InventoryMovement extends BaseDocument {
  productId: string;
  productCodeSnapshot: string;
  movementType: MovementType;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  reason: string;
  reference: string;
  balanceBefore: number;
  balanceAfter: number;
  performedBy: string;
  timestamp: Timestamp;
}
