import { describe, it, expect } from 'vitest';
import {
  buildInventoryStockLookup,
  deduplicateDisplayPriorities,
  reconcileDisplayPriorityForTV,
  ForecastStockSummary
} from './tvDisplayReconciler';
import { DisplayPriority } from '../../../types/priority';
import { Product } from '../../../types/product';
import { ActionType, Destination } from '../../../types/configuration';
import { InventoryBalance } from '../../../types/inventory';

const mockActions: ActionType[] = [
  { id: 'act-rel', tenantId: 't1', code: 'RELEASE', label: 'Release', status: 'active' } as any,
  { id: 'act-hold', tenantId: 't1', code: 'HOLD', label: 'Hold', status: 'active' } as any
];

const mockDestinations: Destination[] = [
  { id: 'dest-ch', tenantId: 't1', destinationCode: 'CH', destinationName: 'Chorley', status: 'active' } as any
];

const makePriority = (overrides: Partial<DisplayPriority> = {}): DisplayPriority => ({
  id: 'prio-1',
  tenantId: 't1',
  siteId: 's1',
  sourcePriorityId: 'prio-1',
  priorityCode: '4475950',
  productId: 'prod-4475950',
  productCodeSnapshot: '0004475950',
  descriptionSnapshot: 'F1 Andrex UQuilts155sc 24rx56 MU',
  title: 'F1 Andrex UQuilts155sc 24rx56 MU',
  instruction: 'Release 717 cases (717 Pallets) to Chorley (CH)',
  priorityStatus: 'ACTIVE',
  priorityLevelId: 'HIGH',
  priorityLevelLabel: 'HIGH',
  actionTypeId: 'act-rel',
  actionTypeLabel: 'Release',
  requestedQuantity: 717,
  progressQuantity: 0,
  progressPercent: 0,
  destinationId: 'dest-ch',
  destinationLabel: 'Chorley (CH)',
  untilSwitchedOff: true,
  modifiedDate: '2026-11-19T10:00:00Z',
  ...overrides
} as DisplayPriority);

const makeProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-4475950',
  tenantId: 't1',
  siteId: 's1',
  productCode: '0004475950',
  description: 'F1 Andrex UQuilts155sc 24rx56 MU',
  casesPerPallet: 1,
  status: 'active',
  ...overrides
} as Product);

describe('tvDisplayReconciler', () => {
  it('caps SKU 4475950 RELEASE quantity (717) to live physical QOH (3) and rewrites auto-generated note', () => {
    const balances: InventoryBalance[] = [
      {
        id: 'bal-1',
        tenantId: 't1',
        siteId: 's1',
        productId: 'prod-4475950',
        productCodeSnapshot: '0004475950',
        quantity: 3,
        locationId: 'loc-1'
      } as any
    ];

    const result = reconcileDisplayPriorityForTV({
      priority: makePriority(),
      inventoryStockMap: buildInventoryStockLookup(balances),
      balancesLoaded: true,
      products: [makeProduct()],
      actionTypes: mockActions,
      destinations: mockDestinations,
      forecastStockItems: [],
      pluralUnitStyle: 'long'
    });

    expect(result.shouldHide).toBe(false);
    expect(result.qtyValue).toBe('3');
    expect(result.unitLabel).toBe('PALLETS');
    expect(result.wasCappedByStock).toBe(true);
    expect(result.displayInstruction).toBe('Release 3 cases (3 Pallets) to Chorley (CH)');
  });

  it('hides RELEASE tile completely when physical QOH is 0 after balances load', () => {
    const result = reconcileDisplayPriorityForTV({
      priority: makePriority(),
      inventoryStockMap: buildInventoryStockLookup([
        {
          id: 'bal-zero',
          tenantId: 't1',
          siteId: 's1',
          productId: 'prod-4475950',
          productCodeSnapshot: '0004475950',
          quantity: 0,
          locationId: 'loc-1'
        } as any
      ]),
      balancesLoaded: true,
      products: [makeProduct()],
      actionTypes: mockActions,
      destinations: mockDestinations,
      forecastStockItems: []
    });

    expect(result.shouldHide).toBe(true);
  });

  it('protects active SNP87 forecast demand using activeRequiredPallets and surplusPallets', () => {
    const forecastItems: ForecastStockSummary[] = [
      {
        productId: 'prod-4475950',
        productCode: '0004475950',
        activeRequiredPallets: 10,
        totalForecastCases: 10,
        surplusPallets: 2
      }
    ];

    const balances: InventoryBalance[] = [
      {
        id: 'bal-12',
        tenantId: 't1',
        siteId: 's1',
        productId: 'prod-4475950',
        productCodeSnapshot: '0004475950',
        quantity: 12,
        locationId: 'loc-1'
      } as any
    ];

    const result = reconcileDisplayPriorityForTV({
      priority: makePriority({
        requestedQuantity: 12,
        instruction: 'Release 12 cases (12 Pallets) to Chorley (CH)'
      }),
      inventoryStockMap: buildInventoryStockLookup(balances),
      balancesLoaded: true,
      products: [makeProduct()],
      actionTypes: mockActions,
      destinations: mockDestinations,
      forecastStockItems: forecastItems
    });

    expect(result.hasForecastDemand).toBe(true);
    expect(result.shouldHide).toBe(false);
    expect(result.qtyValue).toBe('2');
    expect(result.unitLabel).toBe('PALLETS');
    expect(result.displayInstruction).toBe('Release 2 cases (2 Pallets) to Chorley (CH)');
  });

  it('does not hide non-RELEASE actions even when QOH is 0', () => {
    const result = reconcileDisplayPriorityForTV({
      priority: makePriority({
        actionTypeId: 'act-hold',
        actionTypeLabel: 'Hold',
        requestedQuantity: 0,
        instruction: 'Hold for production check'
      }),
      inventoryStockMap: buildInventoryStockLookup([]),
      balancesLoaded: true,
      products: [makeProduct()],
      actionTypes: mockActions,
      destinations: mockDestinations,
      forecastStockItems: []
    });

    expect(result.shouldHide).toBe(false);
    expect(result.isReleaseAction).toBe(false);
  });

  it('deduplicates stale and duplicate display_priorities keeping the newest entry', () => {
    const older = makePriority({
      id: 'prio-old',
      sourcePriorityId: 'prio-old',
      requestedQuantity: 717,
      modifiedDate: '2026-11-18T08:00:00Z'
    });
    const newer = makePriority({
      id: 'prio-new',
      sourcePriorityId: 'prio-new',
      requestedQuantity: 3,
      modifiedDate: '2026-11-19T08:00:00Z'
    });

    const deduped = deduplicateDisplayPriorities([older, newer]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('prio-new');
    expect(deduped[0].requestedQuantity).toBe(3);
  });

  it('resolves physical QOH even when display_priorities has no productId and inventory_balances has no productCodeSnapshot', () => {
    const products = [makeProduct({ id: 'uuid-4475950', productCode: '4475950', casesPerPallet: 1 })];
    const balances: InventoryBalance[] = [
      {
        id: 'bal-no-snapshot',
        tenantId: 't1',
        siteId: 's1',
        productId: 'uuid-4475950',
        quantity: 3,
        locationId: 'loc-1'
      } as any
    ];

    const result = reconcileDisplayPriorityForTV({
      priority: makePriority({
        productId: undefined,
        productCodeSnapshot: '4475950',
        requestedQuantity: 717
      }),
      inventoryStockMap: buildInventoryStockLookup(balances, products),
      balancesLoaded: true,
      products,
      actionTypes: mockActions,
      destinations: mockDestinations,
      forecastStockItems: []
    });

    expect(result.shouldHide).toBe(false);
    expect(result.qtyValue).toBe('3');
    expect(result.wasCappedByStock).toBe(true);
    expect(result.displayInstruction).toBe('Release 3 cases (3 Pallets) to Chorley (CH)');
  });
});
