import { describe, it, expect } from 'vitest';
import { parsePastedInventoryText } from './pasteInventoryParser';
import { Product } from '../../../types/product';
import { UnitOfMeasure } from '../../../types/configuration';

describe('pasteInventoryParser', () => {
  const mockUnits: UnitOfMeasure[] = [
    { id: 'uom-a3', code: 'A3', name: 'A3 Pallet', quantityPrecision: 0, status: 'active', tenantId: 't1', createdBy: 'u1', modifiedBy: 'u1', createdDate: {} as any, modifiedDate: {} as any },
    { id: 'uom-cs', code: 'CS', name: 'Case', quantityPrecision: 0, status: 'active', tenantId: 't1', createdBy: 'u1', modifiedBy: 'u1', createdDate: {} as any, modifiedDate: {} as any }
  ];

  const mockProducts: Product[] = [
    {
      id: 'p1',
      productCode: '03215931',
      description: 'F1 KLX BOX Usoft CUBE 48sc x12 ap',
      categoryId: 'cat1',
      unitOfMeasureId: 'uom-cs',
      casesPerPallet: 80,
      unitsPerCase: 12,
      configurations: [
        { unitOfMeasureId: 'uom-a3', casesPerPallet: 80, unitsPerCase: 12 }
      ],
      defaultDestinationId: null,
      operationallyRelevant: true,
      notes: '',
      status: 'active',
      tenantId: 't1',
      createdBy: 'u1',
      modifiedBy: 'u1',
      createdDate: {} as any,
      modifiedDate: {} as any
    },
    {
      id: 'p2',
      productCode: '04310310',
      description: 'F1 Andrex Skin Protect 155sc 4rx6',
      categoryId: 'cat1',
      unitOfMeasureId: 'uom-cs',
      casesPerPallet: 54,
      unitsPerCase: 24,
      configurations: [
        { unitOfMeasureId: 'uom-cs', casesPerPallet: 54, unitsPerCase: 24 }
      ],
      defaultDestinationId: null,
      operationallyRelevant: true,
      notes: '',
      status: 'active',
      tenantId: 't1',
      createdBy: 'u1',
      modifiedBy: 'u1',
      createdDate: {} as any,
      modifiedDate: {} as any
    }
  ];

  const sampleText = `
Material Number    Material description                     Plnt SLoc BUn Crcy     Unrestricte

3215931            F1 KLX BOX Usoft CUBE 48sc x12 ap        3200 0001 CS  EUR            3,000
4310310            F1 Andrex Skin Protect 155sc 4rx6        3200 0001 CS  EUR            1,548
4310500            F1 Andrex Skin Protect 155sc 8rx3        3200 0001 CS  EUR            2,853
  `;

  it('correctly matches product codes missing leading zeros and calculates pallets', () => {
    const result = parsePastedInventoryText(sampleText, mockProducts, mockUnits);

    expect(result.totalParsed).toBe(3);
    expect(result.matchedCount).toBe(2);
    expect(result.unmatchedCount).toBe(1);

    // Item 1
    const item1 = result.items[0];
    expect(item1.rawMaterialNumber).toBe('3215931');
    expect(item1.matchedProduct?.productCode).toBe('03215931');
    expect(item1.unrestrictedCases).toBe(3000);
    expect(item1.casesPerPallet).toBe(80);
    expect(item1.palletSource).toBe('A3');
    expect(item1.calculatedPallets).toBe(37.5);

    // Item 2 (No A3 config, falls back to available config)
    const item2 = result.items[1];
    expect(item2.rawMaterialNumber).toBe('4310310');
    expect(item2.matchedProduct?.productCode).toBe('04310310');
    expect(item2.unrestrictedCases).toBe(1548);
    expect(item2.casesPerPallet).toBe(54);
    expect(item2.palletSource).toBe('Available');
    expect(item2.calculatedPallets).toBe(1548 / 54);

    // Item 3 (Unmatched)
    const item3 = result.items[2];
    expect(item3.rawMaterialNumber).toBe('4310500');
    expect(item3.status).toBe('NOT_FOUND');
  });
});
