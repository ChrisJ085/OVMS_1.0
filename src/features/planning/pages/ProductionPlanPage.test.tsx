import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ProductionPlanPage } from './ProductionPlanPage';
import { Snp87PlanningImport, Snp87PlanningRow } from '../../../types/snp87';

const { mockActiveSnapshot, mockActiveRows } = vi.hoisted(() => {
  const snapshot: Snp87PlanningImport = {
    id: 'imp_active_snapshot',
    tenantId: 'tenant-test',
    siteId: 'site-test',
    sourceReportName: 'SNP87_Week41_Final.xlsx',
    sourceReportType: 'SNP87',
    fileHash: 'hash123',
    importedBy: 'Lead Planner',
    importedAt: '2026-10-07T08:00:00Z',
    importStatus: 'COMMITTED',
    sourceRowCount: 120,
    recognisedRowCount: 100,
    ignoredRowCount: 20,
    forecastRowCount: 60,
    confirmedProductionRowCount: 40,
    totalForecastQuantity: 15420,
    totalConfirmedProductionQuantity: 28900,
    warningCount: 0,
    errorCount: 0,
    unknownProductCount: 0,
    importPeriod: {
      startDate: '2026-10-05',
      endDate: '2026-10-18'
    },
    diagnostics: {
      errors: [],
      warnings: [],
      unknownProducts: [],
      ignoredInfoObjects: []
    },
    version: 1,
    status: 'active',
    createdBy: 'Lead Planner',
    createdDate: '2026-10-07T08:00:00Z',
    modifiedBy: 'Lead Planner',
    modifiedDate: '2026-10-07T08:00:00Z'
  };

  const rows: Snp87PlanningRow[] = [
    {
      id: 'row-1',
      importId: 'imp_active_snapshot',
      tenantId: 'tenant-test',
      siteId: 'site-test',
      rowIndex: 1,
      orderSku: '1721199',
      productNumber: '4473386',
      productDescription: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
      location: '3200',
      sort: 14,
      infoObject: '9AFPROD',
      rowText: 'Production (Confirmed)',
      planningType: 'CONFIRMED_PRODUCTION',
      startDateRaw: '20261005',
      endDateRaw: '20261005',
      planningDate: '2026-10-05',
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      quantity: 6193.824,
      forecastQuantity: null,
      confirmedProductionQuantity: 6193.824,
      baseUnitOfMeasure: 'CS',
      productId: 'prod-4473386',
      productCodeSnapshot: '4473386',
      descriptionSnapshot: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
      productMatched: true,
      validationStatus: 'VALID',
      validationErrors: [],
      validationWarnings: [],
      rawSourceRow: {},
      createdAt: '2026-10-07T08:00:00Z'
    },
    {
      id: 'row-2',
      importId: 'imp_active_snapshot',
      tenantId: 'tenant-test',
      siteId: 'site-test',
      rowIndex: 2,
      orderSku: '1721199',
      productNumber: '4473386',
      productDescription: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
      location: '3200',
      sort: 1,
      infoObject: '9ADFCST',
      rowText: 'Forecast',
      planningType: 'FORECAST',
      startDateRaw: '20261005',
      endDateRaw: '20261005',
      planningDate: '2026-10-05',
      startDate: '2026-10-05',
      endDate: '2026-10-05',
      quantity: 500,
      forecastQuantity: 500,
      confirmedProductionQuantity: null,
      baseUnitOfMeasure: 'CS',
      productId: 'prod-4473386',
      productCodeSnapshot: '4473386',
      descriptionSnapshot: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
      productMatched: true,
      validationStatus: 'VALID',
      validationErrors: [],
      validationWarnings: [],
      rawSourceRow: {},
      createdAt: '2026-10-07T08:00:00Z'
    }
  ];

  return { mockActiveSnapshot: snapshot, mockActiveRows: rows };
});

// Mock Auth Context
vi.mock('../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    userProfile: { fullName: 'Lead Planner' }
  })
}));

// Mock Site Context
vi.mock('../../../contexts/SiteContext', () => ({
  useSiteContext: () => ({
    tenantId: 'tenant-test',
    siteId: 'site-test'
  })
}));

// Mock Production Master Data
vi.mock('../hooks/useProductionMasterData', () => ({
  useProductionMasterData: () => ({
    products: [
      {
        id: 'prod-4473386',
        tenantId: 'tenant-test',
        siteId: 'site-test',
        productCode: '4473386',
        description: 'F1 Andrex UQuilts 155sc 4rx6 £2.99 PMP',
        categoryId: 'cat-1',
        unitOfMeasureId: 'uom-cs',
        casesPerPallet: 36,
        unitsPerCase: 24,
        configurations: [],
        defaultDestinationId: null,
        operationallyRelevant: true,
        notes: '',
        status: 'active',
        createdBy: 'system',
        createdDate: '2026-01-01',
        modifiedBy: 'system',
        modifiedDate: '2026-01-01'
      }
    ],
    productionLines: [],
    units: [],
    categories: [],
    loading: false,
    revalidate: vi.fn()
  })
}));

// Mock Snp87Planning hook
vi.mock('../hooks/useSnp87Planning', () => ({
  useSnp87Planning: () => ({
    activeSnapshot: mockActiveSnapshot,
    activeRows: mockActiveRows,
    snapshotLoading: false,
    historyImports: [mockActiveSnapshot],
    historyLoading: false,
    refreshActiveSnapshot: vi.fn(),
    refreshHistory: vi.fn()
  })
}));

// Mock production import service
vi.mock('../services/snp87ImportService', () => ({
  parseSnp87Workbook: vi.fn().mockResolvedValue({
    importSummary: {
      ...mockActiveSnapshot,
      id: 'imp_new_preview',
      sourceReportName: 'SNP87_New_Upload.xlsx',
      importStatus: 'VALIDATED'
    },
    rows: mockActiveRows,
    headerValidation: { isValid: true, missingHeaders: [] }
  }),
  commitSnp87Import: vi.fn().mockResolvedValue({ success: true, importId: 'imp_new_preview' }),
  getActiveSnp87Snapshot: vi.fn().mockResolvedValue({ importSummary: mockActiveSnapshot, rows: mockActiveRows }),
  getSnp87Imports: vi.fn().mockResolvedValue([mockActiveSnapshot]),
  getSnp87RowsByImportId: vi.fn().mockResolvedValue(mockActiveRows),
  subscribeToSnp87Imports: vi.fn(() => () => {}),
  computeWeeklyForecastPlan: vi.fn((rows: any[]) => {
    const forecastRows = (rows || []).filter((r: any) => (r.planningType === 'FORECAST' || r.infoObject === '9ADFCST'));
    const map = new Map<string, any>();
    forecastRows.forEach((r: any) => {
      const code = r.productNumber || r.orderSku;
      const existing = map.get(code);
      if (existing) {
        existing.totalForecastCases += (r.quantity || 0);
      } else {
        map.set(code, {
          productCode: code,
          productDescription: r.productDescription,
          baseUnitOfMeasure: r.baseUnitOfMeasure || 'CS',
          horizonDate: r.horizonDate || r.planningDate || '2026-10-05',
          totalForecastCases: r.quantity || 0,
          casesPerPallet: 36,
          palletEquivalent: (r.quantity || 0) / 36,
          rowCount: 1,
          distinctDates: [r.planningDate || '2026-10-05']
        });
      }
    });
    return Array.from(map.values());
  }),
  isOutOfOrdinaryDate: vi.fn((val: any) => String(val).replace(/[-/]/g, '') === '19700101')
}));

describe('ProductionPlanPage – SAP Planning SNP87 Workflow', () => {
  it('renders the page header as "SAP Planning" without line scheduling wording', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /SAP Planning/i })).toBeInTheDocument();
    expect(screen.getByText(/Weekly SAP SNP87 Planning Ingestion/i)).toBeInTheDocument();
  });

  it('renders the updated workflow tabs: Current Planning Snapshot, Import SNP87 Report, Import History', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Current Planning Snapshot/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import SNP87 Report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import History/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Planner Notes/i })).toBeInTheDocument();
  });

  it('displays the active SNP87 snapshot details and row entries', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    // Active snapshot header
    expect(screen.getByText('SNP87_Week41_Final.xlsx')).toBeInTheDocument();
    expect(screen.getByText(/Active Snapshot/i)).toBeInTheDocument();

    // Summary counts
    expect(screen.getByText('15,420')).toBeInTheDocument(); // Forecast quantity
    expect(screen.getByText('28,900')).toBeInTheDocument(); // Confirmed production quantity

    // Table rows
    expect(screen.getAllByText('4473386').length).toBeGreaterThan(0);
    expect(screen.getByText('6,193.824')).toBeInTheDocument();
    expect(screen.getAllByText('Forecast').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Confirmed Production').length).toBeGreaterThan(0);
  });

  it('switches to the Import SNP87 Report tab with low-interaction upload workflow', async () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    const importTabBtn = screen.getByRole('button', { name: /Import SNP87 Report/i });
    fireEvent.click(importTabBtn);

    // Verifies Step 1 upload zone is displayed
    expect(screen.getByText(/Select or Drop Weekly SNP87 Report/i)).toBeInTheDocument();
    expect(screen.getByText(/Browse Workbook File/i)).toBeInTheDocument();
    // Confirms NO production line mapping is asked
    expect(screen.queryByText(/Select Production Line/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Map Line Code/i)).not.toBeInTheDocument();
  });

  it('switches to the Import History tab and displays historical imports', async () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    const historyTabBtn = screen.getByRole('button', { name: /Import History/i });
    fireEvent.click(historyTabBtn);

    expect(screen.getByText(/SNP87 Planning Import Audit Trail/i)).toBeInTheDocument();
    expect(screen.getAllByText('SNP87_Week41_Final.xlsx').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ACTIVE/i).length).toBeGreaterThan(0);
  });

  it('renders primary "Import SNP87" header action and switches to import tab when clicked', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    const primaryImportBtn = screen.getByRole('button', { name: /^Import SNP87$/i });
    expect(primaryImportBtn).toBeInTheDocument();
    fireEvent.click(primaryImportBtn);

    expect(screen.getByText(/Select or Drop Weekly SNP87 Report/i)).toBeInTheDocument();
  });

  it('renders SAP Planning Status Strip with horizon and demand/supply metrics', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/ACTIVE \/ CURRENT/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2026-10-05 → 2026-10-18/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Horizon Demand/i)).toBeInTheDocument();
    expect(screen.getByText(/Horizon Supply/i)).toBeInTheDocument();
  });

  it('filters rows correctly when clicking Forecast and Confirmed Production pills', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    // Initial state: both row-1 (6,193.824) and row-2 (500) are visible
    expect(screen.getAllByText('6,193.824').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('500')).toBeInTheDocument();

    // 1. Filter by Forecast
    const forecastPills = screen.getAllByRole('button', { name: /Forecast/i });
    const forecastPill = forecastPills.find(b => b.textContent?.includes('Forecast'));
    expect(forecastPill).toBeDefined();
    fireEvent.click(forecastPill!);

    // Confirmed production row (6,193.824) should be hidden, Forecast row (500) should remain
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.queryByText('6,193.824')).not.toBeInTheDocument();

    // 2. Filter by Confirmed Production
    const confirmedPills = screen.getAllByRole('button', { name: /Confirmed Production/i });
    const confirmedPill = confirmedPills.find(b => b.textContent?.includes('Confirmed Production'));
    expect(confirmedPill).toBeDefined();
    fireEvent.click(confirmedPill!);

    // Confirmed production row (6,193.824) should be visible, Forecast row (500) should be hidden
    expect(screen.getAllByText('6,193.824').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('500')).not.toBeInTheDocument();

    // 3. Switch back to All Types
    const allPill = screen.getByRole('button', { name: /All Types/i });
    fireEvent.click(allPill);

    // Both should be visible again
    expect(screen.getAllByText('6,193.824').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('provides an action (i) button to show and hide the slide-in right-to-left baseline info panel', () => {
    render(
      <MemoryRouter>
        <ProductionPlanPage />
      </MemoryRouter>
    );

    const infoButton = screen.getByRole('button', { name: /Planning Baseline Info/i });
    expect(infoButton).toBeInTheDocument();

    const slideover = document.getElementById('snp87-baseline-slideover');
    expect(slideover).toBeInTheDocument();

    const slideContainer = slideover?.querySelector('.transform');
    // Initially hidden by default (translate-x-full)
    expect(slideContainer?.className).toContain('translate-x-full');

    // Click (i) button to open
    fireEvent.click(infoButton);
    expect(slideContainer?.className).toContain('translate-x-0');

    // Click close (X) button inside panel
    const closeBtn = screen.getByRole('button', { name: /Close Panel/i });
    fireEvent.click(closeBtn);
    expect(slideContainer?.className).toContain('translate-x-full');

    // Click (i) button again to toggle open
    fireEvent.click(infoButton);
    expect(slideContainer?.className).toContain('translate-x-0');

    // Click (i) button again to toggle closed
    fireEvent.click(infoButton);
    expect(slideContainer?.className).toContain('translate-x-full');
  });
});

