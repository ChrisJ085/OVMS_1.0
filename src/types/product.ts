import { BaseDocument } from './common';

export interface ProductConfiguration {
  unitOfMeasureId: string;
  casesPerPallet: number | null;
  unitsPerCase: number | null;
}

export interface Product extends BaseDocument {
  productCode: string;
  code?: string;
  description: string;
  name?: string;
  categoryId: string;
  // Legacy fields for backward compatibility, synchronized with configurations[0]
  unitOfMeasureId: string;
  casesPerPallet: number | null;
  unitsPerCase: number | null;
  
  configurations: ProductConfiguration[];
  defaultImportUomId?: string | null;
  defaultDestinationId: string | null;
  operationallyRelevant: boolean;
  notes: string;
}
