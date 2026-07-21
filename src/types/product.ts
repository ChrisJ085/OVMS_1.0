import { BaseDocument } from './common';

export interface Product extends BaseDocument {
  productCode: string;
  description: string;
  categoryId: string;
  unitOfMeasureId: string;
  casesPerPallet: number | null;
  unitsPerCase: number | null;
  defaultDestinationId: string | null;
  operationallyRelevant: boolean;
  notes: string;
}
