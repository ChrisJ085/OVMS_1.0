import { describe, it, expect } from 'vitest';
import { parsePastedProductText } from './pasteProductParser';
import { Product } from '../../../types/product';

describe('pasteProductParser', () => {
  const mockExistingProducts: Product[] = [
    {
      id: 'prod-1',
      tenantId: 't1',
      siteId: 's1',
      productCode: '3219021',
      description: 'Existing Description',
      categoryId: 'cat-tissue',
      unitOfMeasureId: 'uom-cs',
      casesPerPallet: 96,
      unitsPerCase: 16,
      configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 96, unitsPerCase: 16 }],
      defaultDestinationId: 'dest-1',
      operationallyRelevant: true,
      notes: 'Existing notes',
      status: 'active',
      createdBy: 'user1',
      createdDate: {} as any,
      modifiedBy: 'user1',
      modifiedDate: {} as any
    }
  ];

  it('correctly parses user pasted product text with multi-space headers and rows', () => {
    const rawInput = `
Material   Material description

3219021    F1 KLX Usoft XL Compact 40sc x16 M
3414219    F1 KLX BOX Collection CUBE 48sc x12
3414254    F1 KLX Ltd Ed Cube Mr Doodle V2 48
3415906    F1 KLX BOX Collection CUBE 48sc x1
`;

    const result = parsePastedProductText(rawInput, mockExistingProducts, {
      defaultCategoryId: 'cat-default',
      defaultUnitOfMeasureId: 'uom-cs',
      defaultCasesPerPallet: 100,
      defaultUnitsPerCase: 1
    });

    expect(result.totalParsed).toBe(4);
    expect(result.newCount).toBe(3);
    expect(result.existingCount).toBe(1);
    expect(result.invalidCount).toBe(0);

    // First item is existing
    expect(result.items[0].productCode).toBe('3219021');
    expect(result.items[0].description).toBe('F1 KLX Usoft XL Compact 40sc x16 M');
    expect(result.items[0].isExisting).toBe(true);
    expect(result.items[0].categoryId).toBe('cat-tissue'); // inherits existing

    // Second item is new
    expect(result.items[1].productCode).toBe('3414219');
    expect(result.items[1].description).toBe('F1 KLX BOX Collection CUBE 48sc x12');
    expect(result.items[1].isExisting).toBe(false);
    expect(result.items[1].categoryId).toBe('cat-default');
    expect(result.items[1].casesPerPallet).toBe(100);

    // Third item is new
    expect(result.items[2].productCode).toBe('3414254');
    expect(result.items[2].description).toBe('F1 KLX Ltd Ed Cube Mr Doodle V2 48');
    expect(result.items[2].isExisting).toBe(false);

    // Fourth item is new
    expect(result.items[3].productCode).toBe('3415906');
    expect(result.items[3].description).toBe('F1 KLX BOX Collection CUBE 48sc x1');
    expect(result.items[3].isExisting).toBe(false);
  });

  it('handles tab-separated lines from Excel and skips dashed divider lines', () => {
    const tabInput = `Product Code\tDescription\n--------------------------------\n5551234\tFacial Tissue Cube\n6667890\tPaper Towels Jumbo`;
    const result = parsePastedProductText(tabInput, []);

    expect(result.totalParsed).toBe(2);
    expect(result.items[0].productCode).toBe('5551234');
    expect(result.items[0].description).toBe('Facial Tissue Cube');
    expect(result.items[1].productCode).toBe('6667890');
    expect(result.items[1].description).toBe('Paper Towels Jumbo');
  });

  it('deduplicates duplicate lines in the same paste payload', () => {
    const dupInput = `
3414219    F1 KLX BOX Collection CUBE 48sc x12
3414219    F1 KLX BOX Collection CUBE 48sc x12
`;
    const result = parsePastedProductText(dupInput, []);
    expect(result.totalParsed).toBe(1);
    expect(result.items[0].productCode).toBe('3414219');
  });
});
