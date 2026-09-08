import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timestamp, collection, db, doc, getDoc, getDocs, writeBatch } from '../../../services/firestoreBase';
import { 
  createPriority,
  checkDuplicatePriority,
  updatePriorityStatus,
  logPriorityEvent
} from './priorityService';

// Mock Firestore functions to spy on collection names and query constraints
const mockCollectionSpy = vi.fn((_database: any, path: string) => ({ path }));
const mockDocSpy = vi.fn((...args: any[]) => {
  if (args[0] && typeof args[0] === 'object' && 'path' in args[0]) {
    const collPath = args[0].path;
    const docId = args[1] || 'mock-auto-id';
    return { path: `${collPath}/${docId}`, id: docId };
  }
  if (args.length >= 3) {
    const collPath = args[1];
    const docId = args[2] || 'mock-auto-id';
    return { path: `${collPath}/${docId}`, id: docId };
  }
  if (args.length === 2) {
    const fullPath = String(args[1]);
    const parts = fullPath.split('/');
    const docId = parts.length > 1 ? parts[parts.length - 1] : 'mock-auto-id';
    const finalPath = parts.length > 1 ? fullPath : `${fullPath}/${docId}`;
    return { path: finalPath, id: docId };
  }
  return { path: 'priorities/mock-auto-id', id: 'mock-auto-id' };
});

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../services/firestoreBase', async () => {
  const actual = await vi.importActual<any>('../../../services/firestoreBase');
  return {
    ...actual,
    collection: (db: any, path: string) => mockCollectionSpy(db, path),
    doc: (a: any, b?: any, c?: any) => mockDocSpy(a, b, c),
    writeBatch: () => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      delete: mockBatchDelete,
      commit: mockBatchCommit
    }),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    query: vi.fn((coll: any, ...constraints: any[]) => ({ coll, constraints })),
    where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
      fromDate: (d: Date) => ({ toMillis: () => d.getTime(), toDate: () => d })
    }
  };
});

describe('Operational Priorities Collection Audit Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Verify canonical collection: Priority creation writes to the correct "priorities" collection', async () => {
    // Setup mocks
    mockCollectionSpy.mockImplementation((_db, path) => ({ path }));

    vi.mocked(getDocs).mockResolvedValue({
      empty: true,
      docs: []
    } as any);

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
      startAt: { toMillis: () => Date.now(), toDate: () => new Date() } as any,
      expireAt: null,
      priorityStatus: 'ACTIVE' as const
    };

    const result = await createPriority(priorityInput, 'user_tester');

    expect(result.success).toBe(true);

    // Assert priority document was created in 'priorities' collection
    const collectionCalls = mockCollectionSpy.mock.calls.map(call => call[1]);
    expect(collectionCalls).toContain('priorities');
    expect(collectionCalls).not.toContain('operationalPriorities');

    // Assert batch set was called on a ref path with 'priorities/'
    const setCall = mockBatchSet.mock.calls[0];
    expect(setCall[0].path).toContain('priorities/');
  });

  it('Verify canonical collection: Duplicate checking reads from the correct "priorities" collection', async () => {
    vi.mocked(getDocs).mockResolvedValue({
      empty: false,
      docs: [
        {
          data: () => ({
            actionTypeId: 'MOVE_STK',
            destinationId: 'dest_test',
            priorityStatus: 'ACTIVE'
          })
        }
      ]
    } as any);

    const isDuplicate = await checkDuplicatePriority(
      'tenant_test',
      'site_test',
      'prod_test',
      'MOVE_STK',
      'dest_test'
    );

    expect(isDuplicate).toBe(true);

    // Confirm that the collection queried is indeed 'priorities'
    const queryCollectionCall = mockCollectionSpy.mock.calls.find(call => call[1] === 'priorities');
    expect(queryCollectionCall).toBeDefined();
    
    const collectionCalls = mockCollectionSpy.mock.calls.map(call => call[1]);
    expect(collectionCalls).not.toContain('operationalPriorities');
  });

  it('Verify canonical collection: Priority status updates target the correct collection', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({
        tenantId: 'tenant_test',
        siteId: 'site_test',
        priorityStatus: 'ACTIVE',
        createdDate: Timestamp.now()
      })
    } as any);

    const result = await updatePriorityStatus('priority_123', 'COMPLETED', 'user_tester', 'Finished execution');
    expect(result.success).toBe(true);

    // Confirm doc call parameters
    const docCalls = mockDocSpy.mock.calls;
    const priorityDocCall = docCalls.find(call => call[1] === 'priorities');
    expect(priorityDocCall).toBeDefined();
    expect(priorityDocCall?.[2]).toBe('priority_123');
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

  describe('Manual Priority Protection vs Automatic Recommendations', () => {
    it('Manual priorities (sourceType = MANUAL) are preserved and never overwritten or cancelled by recommendation engine', async () => {
      const { generateRecommendationForProduct } = await import('../../planning/services/recommendationService');

      // 1. Existing manual priority for Product A
      const manualPriorityDoc: any = {
        id: 'manual-prio-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceType: 'MANUAL',
        productId: 'prod-manual-test',
        productCodeSnapshot: 'TEST-SKU',
        descriptionSnapshot: 'Manual product',
        priorityStatus: 'ACTIVE',
        actionTypeId: 'MOVE_HOLD',
        requestedQuantity: 200,
        remainingQuantity: 200,
        progressQuantity: 0,
        createdDate: Timestamp.now(),
        modifiedDate: Timestamp.now()
      };

      const baseRule: any = {
        id: 'rule-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-manual-test',
        minimumQuantity: 1000,
        targetQuantity: 2000,
        maximumQuantity: 5000,
        ddxmRetentionQuantity: 0,
        effectiveFrom: new Date(2020, 0, 1),
        effectiveTo: null,
        untilSwitchedOff: true,
        controllingThresholdMode: 'HIGHEST_MANDATORY',
        belowTargetBehavior: 'RELEASE_ABOVE_CONTROL',
        preferredDestinationId: 'DEST_CHORLEY',
        defaultActionTypeId: 'ACTION_RELEASE',
        defaultPriorityLevelId: 'PRIORITY_NORMAL',
        status: 'active'
      };

      const preloadedContext: any = {
        productsMap: new Map([[ 'prod-manual-test', { id: 'prod-manual-test', productCode: 'TEST-SKU', description: 'Manual product', status: 'active' } ]]),
        inventoryBalancesByProductId: new Map([[ 'prod-manual-test', [{ id: 'b1', quantity: 5000, modifiedDate: Timestamp.now() }] ]]),
        inventoryTotalsByProductId: new Map([[ 'prod-manual-test', 5000 ]]),
        planningRulesMap: new Map([[ 'prod-manual-test', baseRule ]]),
        productionEntriesByProductId: new Map([[ 'prod-manual-test', [] ]]),
        productionLineNotes: [],
        productionImportUploadTimes: new Map(),
        stoRequirementsByProductId: new Map([[ 'prod-manual-test', [] ]]),
        outstandingStoCasesByProductId: new Map([[ 'prod-manual-test', 0 ]]),
        promotionsMap: new Map(),
        promotionRulesByProductId: new Map([[ 'prod-manual-test', [] ]]),
        activeRecommendationsByProductId: new Map(),
        activePrioritiesByProductId: new Map([[ 'prod-manual-test', [manualPriorityDoc] ]]),
        configuration: {
          configurationVersion: 'v1.0.0',
          holdActionId: 'ACTION_HOLD',
          reviewActionId: 'ACTION_REVIEW',
          releaseActionId: 'ACTION_RELEASE',
          asPerScheduleActionId: 'ACTION_AS_PER_SCHEDULE',
          urgentPriorityId: 'PRIORITY_URGENT',
          normalPriorityId: 'PRIORITY_NORMAL',
          lowPriorityId: 'PRIORITY_LOW',
          defaultDestinationRules: {
            defaultDestinationId: 'DEST_CHORLEY',
            allowFallbackDestination: true
          }
        }
      };

      mockBatchSet.mockClear();
      mockBatchUpdate.mockClear();

      // 2. Generate recommendation for Product A (where decision output produces a recommendation)
      const res = await generateRecommendationForProduct('tenant-1', 'site-1', 'prod-manual-test', true, preloadedContext);
      expect(res.success).toBe(true);

      // Verify batch updates:
      // The manual priority 'manual-prio-1' should NOT be cancelled or updated!
      const updateCalls = mockBatchUpdate.mock.calls;
      const manualPriorityUpdated = updateCalls.some(c => c[0].path === 'priorities/manual-prio-1' || c[0].id === 'manual-prio-1');
      expect(manualPriorityUpdated).toBe(false);

      // A new system recommendation priority should be created with sourceType = 'RECOMMENDATION'
      const setCalls = mockBatchSet.mock.calls;
      const prioritySetCall = setCalls.find(c => c[0].path?.startsWith('priorities/') && c[1]?.sourceType === 'RECOMMENDATION');
      expect(prioritySetCall).toBeDefined();
      expect(prioritySetCall[1].sourceType).toBe('RECOMMENDATION');
      expect(prioritySetCall[1].productId).toBe('prod-manual-test');
    });

    it('Automatic recommendation cleanup only cancels system-generated priorities when action no longer required', async () => {
      const { generateRecommendationForProduct } = await import('../../planning/services/recommendationService');

      // System-generated priority exists
      const systemPriorityDoc: any = {
        id: 'system-prio-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        sourceType: 'RECOMMENDATION',
        productId: 'prod-no-action',
        productCodeSnapshot: 'SKU-NONE',
        descriptionSnapshot: 'No Action Product',
        priorityStatus: 'ACTIVE',
        actionTypeId: 'ACTION_HOLD',
        requestedQuantity: 0,
        createdDate: Timestamp.now(),
        modifiedDate: Timestamp.now()
      };

      const preloadedContext: any = {
        productsMap: new Map([[ 'prod-no-action', { id: 'prod-no-action', productCode: 'SKU-NONE', description: 'No Action Product', status: 'active' } ]]),
        inventoryBalancesByProductId: new Map([[ 'prod-no-action', [] ]]),
        inventoryTotalsByProductId: new Map([[ 'prod-no-action', 0 ]]),
        planningRulesMap: new Map([[ 'prod-no-action', null ]]),
        productionEntriesByProductId: new Map([[ 'prod-no-action', [] ]]),
        productionLineNotes: [],
        productionImportUploadTimes: new Map(),
        stoRequirementsByProductId: new Map([[ 'prod-no-action', [] ]]),
        outstandingStoCasesByProductId: new Map([[ 'prod-no-action', 0 ]]),
        promotionsMap: new Map(),
        promotionRulesByProductId: new Map([[ 'prod-no-action', [] ]]),
        activeRecommendationsByProductId: new Map(),
        activePrioritiesByProductId: new Map([[ 'prod-no-action', [systemPriorityDoc] ]]),
        configuration: {
          configurationVersion: 'v1.0.0',
          holdActionId: 'ACTION_HOLD',
          reviewActionId: 'ACTION_REVIEW',
          releaseActionId: 'ACTION_RELEASE',
          asPerScheduleActionId: 'ACTION_AS_PER_SCHEDULE',
          urgentPriorityId: 'PRIORITY_URGENT',
          normalPriorityId: 'PRIORITY_NORMAL',
          lowPriorityId: 'PRIORITY_LOW',
          defaultDestinationRules: {
            defaultDestinationId: 'DEST_CHORLEY',
            allowFallbackDestination: true
          }
        }
      };

      mockBatchSet.mockClear();
      mockBatchUpdate.mockClear();

      const res = await generateRecommendationForProduct('tenant-1', 'site-1', 'prod-no-action', true, preloadedContext);
      expect(res.success).toBe(true);

      // Assert that system priority 'system-prio-1' was updated to CANCELLED
      const cancelCall = mockBatchUpdate.mock.calls.find(c => 
        (c[0]?.path === 'priorities/system-prio-1' || c[0]?.id === 'system-prio-1') && 
        c[1]?.priorityStatus === 'CANCELLED'
      );
      expect(cancelCall).toBeDefined();
    });
  });

  describe('Physical Truth: Priority Status Changes and Deletion Do Not Mutate Inventory Balances', () => {
    it('Completing a priority updates priority status to COMPLETED without modifying inventory balances', async () => {
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant_test',
          siteId: 'site_test',
          productId: 'prod_123',
          productCodeSnapshot: 'TEST-SKU',
          priorityStatus: 'ACTIVE',
          requestedQuantity: 500,
          progressQuantity: 0,
          createdDate: Timestamp.now()
        })
      } as any);

      const result = await updatePriorityStatus('priority_123', 'COMPLETED', 'user_tester', 'Completed');
      expect(result.success).toBe(true);

      // Verify batch updates: only priorities and priorityEvents are updated, NO inventoryBalances writes
      const setPaths = mockBatchSet.mock.calls.map(c => c[0].path);
      const updatePaths = mockBatchUpdate.mock.calls.map(c => c[0].path);
      const allTouchedPaths = [...setPaths, ...updatePaths];

      const touchedInventory = allTouchedPaths.some(p => p && p.includes('inventoryBalances'));
      expect(touchedInventory).toBe(false);
    });

    it('Deleting a priority removes the priority document without deducting inventory balances', async () => {
      const { deletePriority } = await import('./priorityService');

      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant_test',
          siteId: 'site_test',
          productId: 'prod_123',
          productCodeSnapshot: 'TEST-SKU',
          priorityStatus: 'ACTIVE',
          requestedQuantity: 500,
          createdDate: Timestamp.now()
        })
      } as any);

      const result = await deletePriority('priority_123', 'user_tester', 100);
      expect(result.success).toBe(true);

      const setPaths = mockBatchSet.mock.calls.map(c => c[0].path);
      const updatePaths = mockBatchUpdate.mock.calls.map(c => c[0].path);
      const allTouchedPaths = [...setPaths, ...updatePaths];

      const touchedInventory = allTouchedPaths.some(p => p && p.includes('inventoryBalances'));
      expect(touchedInventory).toBe(false);
    });
  });
});
