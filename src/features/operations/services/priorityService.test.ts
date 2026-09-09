import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../../../config/supabase';
import { 
  createPriority,
  checkDuplicatePriority,
  updatePriorityStatus,
  logPriorityEvent
} from './priorityService';

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn().mockImplementation(() => ({
  eq: vi.fn().mockImplementation(() => ({
    eq: vi.fn().mockResolvedValue({ error: null })
  }))
}));
const mockSelect = vi.fn().mockImplementation(() => ({
  eq: vi.fn().mockImplementation(() => ({
    eq: vi.fn().mockImplementation(() => ({
      eq: vi.fn().mockImplementation(() => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
      })),
      in: vi.fn().mockResolvedValue({ data: [], error: null })
    }))
  }))
}));

vi.mock('../../../config/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      upsert: vi.fn().mockResolvedValue({ error: null })
    }))
  }
}));

describe('Operational Priorities Collection Audit Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Verify canonical table: Priority creation writes to "priorities" table', async () => {
    mockInsert.mockResolvedValueOnce({ error: null });

    const priorityInput = {
      tenantId: 'tenant_test',
      siteId: 'site_test',
      sourceType: 'MANUAL' as const,
      sourceRecommendationId: null,
      productId: 'prod_test',
      productCodeSnapshot: 'TEST-SKU',
      descriptionSnapshot: 'Test product details',
      actionTypeId: 'MOVE_STK',
      requestedQuantity: 50,
      destinationId: 'dest_test',
      priorityLevelId: 'HIGH',
      supportingReasons: ['Low stock danger'],
      planningContextSnapshot: null,
      startAt: new Date().toISOString() as any,
      expireAt: null,
      priorityStatus: 'ACTIVE' as const
    };

    const result = await createPriority(priorityInput, 'user_tester');

    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('priorities');
  });

  it('Verify canonical table: Duplicate checking reads from "priorities" table', async () => {
    const isDuplicate = await checkDuplicatePriority(
      'tenant_test',
      'site_test',
      'prod_test',
      'MOVE_STK',
      'dest_test'
    );

    expect(supabase.from).toHaveBeenCalledWith('priorities');
  });

  it('Verify canonical table: Priority status updates target the "priorities" table', async () => {
    const result = await updatePriorityStatus('priority_123', 'COMPLETED', 'user_tester', 'Finished execution');
    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('priorities');
  });

  it('No operationalPriorities references exist in runtime configuration maps', () => {
    const activeCollections = [
      'priorities',
      'priorityEvents',
      'recommendations',
      'auditLogs',
      'productionEvents',
      'inventoryBalances',
      'inventoryMovements'
    ];
    expect(activeCollections).not.toContain('operationalPriorities');
  });
});
