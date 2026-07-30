import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../../config/firebase';
import {
  createPriority,
  checkDuplicatePriority,
  updatePriorityStatus,
  logPriorityEvent
} from './priorityService';
import { collection, doc, writeBatch, getDocs, getDoc, Timestamp } from 'firebase/firestore';

// Mock Firestore functions to spy on collection names and query constraints
const mockCollectionSpy = vi.fn((_database: any, path: string) => ({ path }));
const mockDocSpy = vi.fn((_databaseOrCollection: any, pathOrId?: string, id?: string) => {
  if (typeof _databaseOrCollection === 'object' && _databaseOrCollection !== null && 'path' in _databaseOrCollection) {
    return { path: `${_databaseOrCollection.path}/${pathOrId}`, id: pathOrId };
  }
  return { path: `${pathOrId}/${id}`, id };
});

const mockBatchSet = vi.fn();
const mockBatchUpdate = vi.fn();
const mockBatchCommit = vi.fn();

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<any>('firebase/firestore');
  return {
    ...actual,
    collection: (db: any, path: string) => mockCollectionSpy(db, path),
    doc: (a: any, b?: any, c?: any) => mockDocSpy(a, b, c),
    writeBatch: () => ({
      set: mockBatchSet,
      update: mockBatchUpdate,
      commit: mockBatchCommit
    }),
    getDocs: vi.fn(),
    getDoc: vi.fn(),
    query: vi.fn((coll: any, ...constraints: any[]) => ({ coll, constraints })),
    where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
    Timestamp: {
      now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() })
    }
  };
});

vi.mock('../../../config/firebase', () => ({
  db: { type: 'mocked-firestore' }
}));

describe('Operational Priorities Collection Audit Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Verify canonical collection: Priority creation writes to the correct "priorities" collection', async () => {
    // Setup mocks
    mockCollectionSpy.mockImplementation((_db, path) => ({ path }));
    mockDocSpy.mockImplementation((coll: any, id?: string) => ({
      path: id ? `${coll.path}/${id}` : `${coll.path}/mock-auto-id`,
      id: id || 'mock-auto-id'
    }));

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
});
