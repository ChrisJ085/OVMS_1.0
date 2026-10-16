import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmedProductionVisual } from './ConfirmedProductionVisual';
import { Snp87PlanningRow, Snp87PlanningImport } from '../../../../types/snp87';
import { Product } from '../../../../types/product';

const mockProducts: Product[] = [
  {
    id: 'prod-1',
    tenantId: 'tenant-1',
    productCode: '1001',
    description: 'Product 1001 Deluxe 40x',
    categoryId: 'cat-1',
    unitOfMeasureId: 'uom-cs',
    casesPerPallet: 40,
    unitsPerCase: 10,
    configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 40, unitsPerCase: 10 }],
    defaultDestinationId: null,
    operationallyRelevant: true,
    notes: '',
    status: 'active',
    createdBy: 'test',
    createdDate: '2026-10-01',
    modifiedBy: 'test',
    modifiedDate: '2026-10-01'
  },
  {
    id: 'prod-2',
    tenantId: 'tenant-1',
    productCode: '1002',
    description: 'Product 1002 Standard 50x',
    categoryId: 'cat-1',
    unitOfMeasureId: 'uom-cs',
    casesPerPallet: 50,
    unitsPerCase: 12,
    configurations: [{ unitOfMeasureId: 'uom-cs', casesPerPallet: 50, unitsPerCase: 12 }],
    defaultDestinationId: null,
    operationallyRelevant: true,
    notes: '',
    status: 'active',
    createdBy: 'test',
    createdDate: '2026-10-01',
    modifiedBy: 'test',
    modifiedDate: '2026-10-01'
  }
];

const mockRows: Snp87PlanningRow[] = [
  {
    id: 'cp-row-1',
    importId: 'imp-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    rowIndex: 1,
    orderSku: 'SKU1001',
    productNumber: '1001',
    productDescription: 'Product 1001 Deluxe 40x',
    location: '3200',
    sort: 1,
    infoObject: '9AFPROD',
    rowText: 'Production (Confirmed)',
    planningType: 'CONFIRMED_PRODUCTION',
    startDateRaw: '20261010',
    endDateRaw: '20261010',
    planningDate: '2026-10-10',
    startDate: '2026-10-10',
    endDate: '2026-10-10',
    quantity: 2000,
    forecastQuantity: null,
    confirmedProductionQuantity: 2000,
    baseUnitOfMeasure: 'CS',
    productId: 'prod-1',
    productCodeSnapshot: '1001',
    descriptionSnapshot: 'Product 1001 Deluxe 40x',
    productMatched: true,
    validationStatus: 'VALID',
    validationErrors: [],
    validationWarnings: [],
    rawSourceRow: {},
    createdAt: '2026-10-01'
  },
  {
    id: 'cp-row-2',
    importId: 'imp-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    rowIndex: 2,
    orderSku: 'SKU1002',
    productNumber: '1002',
    productDescription: 'Product 1002 Standard 50x',
    location: '3200',
    sort: 2,
    infoObject: '9AFPROD',
    rowText: 'Production (Confirmed)',
    planningType: 'CONFIRMED_PRODUCTION',
    startDateRaw: '20261012',
    endDateRaw: '20261012',
    planningDate: '2026-10-12',
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    quantity: 3000,
    forecastQuantity: null,
    confirmedProductionQuantity: 3000,
    baseUnitOfMeasure: 'CS',
    productId: 'prod-2',
    productCodeSnapshot: '1002',
    descriptionSnapshot: 'Product 1002 Standard 50x',
    productMatched: true,
    validationStatus: 'VALID',
    validationErrors: [],
    validationWarnings: [],
    rawSourceRow: {},
    createdAt: '2026-10-01'
  }
];

describe('ConfirmedProductionVisual Component', () => {
  it('renders confirmed production metrics with both case quantities and pallet quantities', () => {
    render(
      <MemoryRouter>
        <ConfirmedProductionVisual
          rows={mockRows}
          products={mockProducts}
          showEmbeddedTable={true}
        />
      </MemoryRouter>
    );

    // Total Cases: 2000 + 3000 = 5000 CS
    expect(screen.getByText('5,000')).toBeInTheDocument();
    // Total Pallets: (2000 / 40 = 50) + (3000 / 50 = 60) = 110 pallets
    expect(screen.getByText(/~110 pallets/i)).toBeInTheDocument();

    // Table rows initially display both products
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
  });

  it('filters table and highlights bar on initial click, removes on second click of same date, and updates on another date click', () => {
    const handleSelectDate = vi.fn();
    const { container } = render(
      <MemoryRouter>
        <ConfirmedProductionVisual
          rows={mockRows}
          products={mockProducts}
          showEmbeddedTable={true}
          onSelectDate={handleSelectDate}
        />
      </MemoryRouter>
    );

    // Initially both rows are visible
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();

    // 1. Initial click on 2026-10-10 bar / label
    const date10Label = screen.getByText('10/10');
    fireEvent.click(date10Label);

    // onSelectDate called with '2026-10-10'
    expect(handleSelectDate).toHaveBeenCalledWith('2026-10-10');

    // Table filtered: only 1001 should be visible, 1002 hidden
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.queryByText('1002')).not.toBeInTheDocument();

    // Highlight indicator is rendered
    expect(screen.getByText('FILTERED')).toBeInTheDocument();
    expect(screen.getByText(/Table filtered by Date:/i)).toBeInTheDocument();

    // 2. Click ANOTHER date bar (2026-10-12)
    const date12Label = screen.getByText('12/10');
    fireEvent.click(date12Label);

    expect(handleSelectDate).toHaveBeenCalledWith('2026-10-12');
    // Now only 1002 should be visible, 1001 hidden
    expect(screen.getByText('1002')).toBeInTheDocument();
    expect(screen.queryByText('1001')).not.toBeInTheDocument();

    // 3. Second click on the SAME date (2026-10-12) removes filter
    fireEvent.click(date12Label);

    expect(handleSelectDate).toHaveBeenCalledWith(null);
    // Both products visible again
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getByText('1002')).toBeInTheDocument();
  });

  it('allows switching unit preference between Both, Cases, and Pallets', () => {
    render(
      <MemoryRouter>
        <ConfirmedProductionVisual
          rows={mockRows}
          products={mockProducts}
          showEmbeddedTable={true}
        />
      </MemoryRouter>
    );

    // Initial default: Both (CS & PAL)
    expect(screen.getByText('Case Qty (CS)')).toBeInTheDocument();
    expect(screen.getByText('Pallet Qty (PAL)')).toBeInTheDocument();
    expect(screen.getByText('40 CS/PAL')).toBeInTheDocument();
    expect(screen.getByText('50 CS/PAL')).toBeInTheDocument();

    // Switch to Cases only
    const casesUnitBtn = screen.getByRole('button', { name: /^Cases$/i });
    fireEvent.click(casesUnitBtn);

    expect(screen.getByText('Case Qty (CS)')).toBeInTheDocument();
    expect(screen.queryByText('Pallet Qty (PAL)')).not.toBeInTheDocument();

    // Switch to Pallets only
    const palletsUnitBtn = screen.getByRole('button', { name: /^Pallets$/i });
    fireEvent.click(palletsUnitBtn);

    expect(screen.queryByText('Case Qty (CS)')).not.toBeInTheDocument();
    expect(screen.getByText('Pallet Qty (PAL)')).toBeInTheDocument();
    expect(screen.getByText('50.0')).toBeInTheDocument(); // 2000 / 40 = 50.0 PAL
    expect(screen.getByText('60.0')).toBeInTheDocument(); // 3000 / 50 = 60.0 PAL
  });
});
