import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDocuments, createDocument, isValidUuid } from './dbService';
import { supabase } from '../config/supabase';

vi.mock('../config/supabase', () => {
  const insertMock = vi.fn().mockImplementation((payload) => ({
    select: vi.fn().mockImplementation(() => ({
      single: vi.fn().mockResolvedValue({ data: { id: 'mock-single-uuid' }, error: null }),
      then: vi.fn().mockImplementation((resolve) =>
        resolve({
          data: Array.isArray(payload)
            ? payload.map((p, idx) => ({ id: p.id || `mock-id-${idx}` }))
            : [{ id: 'mock-id-1' }],
          error: null
        })
      )
    }))
  }));

  return {
    supabase: {
      from: vi.fn().mockReturnValue({
        insert: insertMock,
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis()
      })
    }
  };
});

describe('dbService createDocuments and UUID sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates UUID correctly', () => {
    expect(isValidUuid('d54e4c9c-502a-4318-9cbb-927161b96d91')).toBe(true);
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('imp_123_row_1')).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
  });

  it('strips invalid synthetic string id so PostgreSQL DEFAULT gen_random_uuid() is invoked', async () => {
    const mockFrom = vi.mocked(supabase.from);
    let capturedInsertPayload: any = null;

    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((chunk) => {
        capturedInsertPayload = chunk;
        return {
          select: vi.fn().mockResolvedValue({
            data: chunk.map((c: any, i: number) => ({ id: `uuid-${i}` })),
            error: null
          })
        };
      })
    } as any);

    const rowsWithSyntheticIds = [
      {
        id: 'snp87_import_123_row_1',
        importId: 'c78f192d-944a-463e-b3f9-7f3c4dbdb183',
        tenantId: 'd54e4c9c-502a-4318-9cbb-927161b96d91',
        siteId: 'a12b3c4d-502a-4318-9cbb-927161b96d92',
        productNumber: 'SKU-001',
        planningType: 'FORECAST',
        quantity: 100
      }
    ];

    await createDocuments('snp87PlanningRows', rowsWithSyntheticIds as any);

    expect(capturedInsertPayload).toBeDefined();
    expect(capturedInsertPayload.length).toBe(1);
    // Crucial: id must NOT be null in the payload (which violates NOT NULL constraint 23502)
    expect(capturedInsertPayload[0].id).toBeUndefined();
    expect(capturedInsertPayload[0].tenant_id).toBe('d54e4c9c-502a-4318-9cbb-927161b96d91');
    expect(capturedInsertPayload[0].product_number).toBe('SKU-001');
  });

  it('preserves valid UUID id when provided in createDocuments', async () => {
    const mockFrom = vi.mocked(supabase.from);
    let capturedInsertPayload: any = null;

    const validUuid = '11111111-2222-3333-4444-555555555555';

    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((chunk) => {
        capturedInsertPayload = chunk;
        return {
          select: vi.fn().mockResolvedValue({
            data: chunk.map((c: any) => ({ id: c.id })),
            error: null
          })
        };
      })
    } as any);

    const rowsWithRealUuid = [
      {
        id: validUuid,
        importId: 'c78f192d-944a-463e-b3f9-7f3c4dbdb183',
        tenantId: 'd54e4c9c-502a-4318-9cbb-927161b96d91',
        siteId: 'a12b3c4d-502a-4318-9cbb-927161b96d92',
        productNumber: 'SKU-002',
        planningType: 'CONFIRMED_PRODUCTION',
        quantity: 250
      }
    ];

    await createDocuments('snp87PlanningRows', rowsWithRealUuid as any);

    expect(capturedInsertPayload).toBeDefined();
    expect(capturedInsertPayload[0].id).toBe(validUuid);
  });
});
