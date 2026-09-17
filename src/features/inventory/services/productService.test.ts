import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkCreateOrUpdateProducts } from './productService';
import * as dbService from '../../../services/dbService';

vi.mock('../../../services/dbService', () => ({
  getDocument: vi.fn(),
  getDocuments: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deactivateDocument: vi.fn(),
  subscribeToCollection: vi.fn(),
}));

vi.mock('../../../services/auditService', () => ({
  logAuditEvent: vi.fn().mockResolvedValue({ success: true }),
}));

describe('productService bulkCreateOrUpdateProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new products and skips or updates existing ones based on configuration', async () => {
    // Mock existing products in DB
    vi.mocked(dbService.getDocuments).mockResolvedValue([
      {
        id: 'existing-1',
        tenantId: 't1',
        siteId: 's1',
        productCode: '3219021',
        description: 'Old Description',
        categoryId: 'cat-old',
        unitOfMeasureId: 'uom-cs',
        casesPerPallet: 50,
        unitsPerCase: 1,
        configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 50, unitsPerCase: 1 }],
        defaultDestinationId: null,
        operationallyRelevant: true,
        status: 'active',
      } as any,
    ]);

    vi.mocked(dbService.createDocument).mockResolvedValue('new-doc-id' as any);
    vi.mocked(dbService.updateDocument).mockResolvedValue({} as any);

    const items = [
      {
        productCode: '3219021',
        description: 'F1 KLX Usoft XL Compact 40sc x16 M',
        categoryId: 'cat-tissue',
        unitOfMeasureId: 'uom-cs',
        casesPerPallet: 96,
        unitsPerCase: 16,
      },
      {
        productCode: '3414219',
        description: 'F1 KLX BOX Collection CUBE 48sc x12',
        categoryId: 'cat-tissue',
        unitOfMeasureId: 'uom-cs',
        casesPerPallet: 100,
        unitsPerCase: 12,
      },
    ];

    const result = await bulkCreateOrUpdateProducts({
      tenantId: 't1',
      siteId: 's1',
      items,
      ifExistsAction: 'update',
      performedBy: 'Test Planner',
    });

    expect(result.success).toBe(true);
    expect(result.data?.createdCount).toBe(1);
    expect(result.data?.updatedCount).toBe(1);
    expect(result.data?.failedCount).toBe(0);

    // Verifies update was called for 3219021
    expect(dbService.updateDocument).toHaveBeenCalledWith(
      'products',
      'existing-1',
      expect.objectContaining({
        description: 'F1 KLX Usoft XL Compact 40sc x16 M',
        categoryId: 'cat-tissue',
        casesPerPallet: 96,
      })
    );

    // Verifies create was called for 3414219
    expect(dbService.createDocument).toHaveBeenCalledWith(
      'products',
      expect.objectContaining({
        productCode: '3414219',
        description: 'F1 KLX BOX Collection CUBE 48sc x12',
        tenantId: 't1',
        siteId: 's1',
      })
    );
  });
});
