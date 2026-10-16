import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Snp87CurrentSnapshotView } from './Snp87CurrentSnapshotView';
import { Snp87PlanningRow, Snp87PlanningImport } from '../../../../types/snp87';
import { Product } from '../../../../types/product';

const mockProducts: Product[] = [
  {
    id: 'prod-1',
    tenantId: 'tenant-1',
    productCode: '1001',
    description: 'Product 1001 Deluxe',
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
  }
];

const mockSnapshot: Snp87PlanningImport = {
  id: 'imp-1',
  tenantId: 'tenant-1',
  siteId: 'site-1',
  sourceReportName: 'SNP87_Baseline_W42.xlsx',
  sourceReportType: 'SNP87',
  fileHash: 'hash-abc',
  importedBy: 'Jane Planner',
  importedAt: '2026-10-10T09:00:00Z',
  importStatus: 'COMMITTED',
  sourceRowCount: 85,
  recognisedRowCount: 80,
  ignoredRowCount: 5,
  forecastRowCount: 40,
  confirmedProductionRowCount: 40,
  totalForecastQuantity: 10000,
  totalConfirmedProductionQuantity: 12000,
  warningCount: 0,
  errorCount: 0,
  unknownProductCount: 0,
  importPeriod: {
    startDate: '2026-10-12',
    endDate: '2026-10-25'
  },
  diagnostics: {
    errors: [],
    warnings: [],
    unknownProducts: [],
    ignoredInfoObjects: []
  },
  version: 1,
  status: 'active',
  createdBy: 'Jane Planner',
  createdDate: '2026-10-10',
  modifiedBy: 'Jane Planner',
  modifiedDate: '2026-10-10'
};

const mockRows: Snp87PlanningRow[] = [
  {
    id: 'row-cp-1',
    importId: 'imp-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    rowIndex: 1,
    orderSku: '1001',
    productNumber: '1001',
    productDescription: 'Product 1001 Deluxe',
    location: '3200',
    sort: 1,
    infoObject: '9AFPROD',
    rowText: 'Production (Confirmed)',
    planningType: 'CONFIRMED_PRODUCTION',
    startDateRaw: '20261012',
    endDateRaw: '20261012',
    planningDate: '2026-10-12',
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    quantity: 800,
    forecastQuantity: null,
    confirmedProductionQuantity: 800,
    baseUnitOfMeasure: 'CS',
    productId: 'prod-1',
    productCodeSnapshot: '1001',
    descriptionSnapshot: 'Product 1001 Deluxe',
    productMatched: true,
    validationStatus: 'VALID',
    validationErrors: [],
    validationWarnings: [],
    rawSourceRow: {},
    createdAt: '2026-10-10'
  },
  {
    id: 'row-fc-1',
    importId: 'imp-1',
    tenantId: 'tenant-1',
    siteId: 'site-1',
    rowIndex: 2,
    orderSku: '1001',
    productNumber: '1001',
    productDescription: 'Product 1001 Deluxe',
    location: '3200',
    sort: 2,
    infoObject: '9ADFCST',
    rowText: 'Forecast',
    planningType: 'FORECAST',
    startDateRaw: '20261012',
    endDateRaw: '20261012',
    planningDate: '2026-10-12',
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    quantity: 600,
    forecastQuantity: 600,
    confirmedProductionQuantity: null,
    baseUnitOfMeasure: 'CS',
    productId: 'prod-1',
    productCodeSnapshot: '1001',
    descriptionSnapshot: 'Product 1001 Deluxe',
    productMatched: true,
    validationStatus: 'VALID',
    validationErrors: [],
    validationWarnings: [],
    rawSourceRow: {},
    createdAt: '2026-10-10'
  }
];

describe('Snp87CurrentSnapshotView Component', () => {
  it('does NOT display the redundant baseline file card in the current snapshot view', () => {
    render(
      <MemoryRouter>
        <Snp87CurrentSnapshotView
          activeSnapshot={mockSnapshot}
          rows={mockRows}
          loading={false}
          onNavigateToImport={vi.fn()}
          onRefresh={vi.fn()}
          products={mockProducts}
        />
      </MemoryRouter>
    );

    // Baseline file metadata card elements should NOT be rendered in Current Planning Snapshot
    expect(screen.queryByText('SNP87_Baseline_W42.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByText(/Jane Planner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Source: 85/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Total Active Rows')).not.toBeInTheDocument();

    // Instead, operational planning controls should be rendered
    expect(screen.getByText(/Current Planning Horizon:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload New SNP87/i })).toBeInTheDocument();
  });

  it('renders pallet quantities alongside case quantities using product master info', () => {
    render(
      <MemoryRouter>
        <Snp87CurrentSnapshotView
          activeSnapshot={mockSnapshot}
          rows={mockRows}
          loading={false}
          onNavigateToImport={vi.fn()}
          onRefresh={vi.fn()}
          products={mockProducts}
        />
      </MemoryRouter>
    );

    // Default: Both CS & PAL
    expect(screen.getByText('Quantity (CS)')).toBeInTheDocument();
    expect(screen.getByText('Pallet Qty (PAL)')).toBeInTheDocument();
    expect(screen.getByText('Pallet Factor')).toBeInTheDocument();

    // Row 1: 800 cases / 40 = 20.0 PAL
    expect(screen.getByText('800')).toBeInTheDocument();
    expect(screen.getByText('20.0')).toBeInTheDocument();

    // Row 2: 600 cases / 40 = 15.0 PAL
    expect(screen.getByText('600')).toBeInTheDocument();
    expect(screen.getByText('15.0')).toBeInTheDocument();

    // Summary footer has both totals
    expect(screen.getByText(/Total Cases:/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Pallets:/i)).toBeInTheDocument();
  });
});
