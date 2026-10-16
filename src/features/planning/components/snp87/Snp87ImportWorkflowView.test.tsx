import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Snp87ImportWorkflowView } from './Snp87ImportWorkflowView';
import * as snp87ImportService from '../../services/snp87ImportService';
import * as productService from '../../../inventory/services/productService';

vi.mock('../../services/snp87ImportService', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    parseSnp87Workbook: vi.fn(),
    commitSnp87Import: vi.fn()
  };
});

describe('Snp87ImportWorkflowView', () => {
  const mockProducts = [
    { id: 'p1', productCode: '4310310', description: 'Andrex 4rx6', configurations: [], status: 'active' }
  ];

  const mockCategories = [
    { id: 'c1', name: 'Toilet Tissue', status: 'active' }
  ];

  const mockUnits = [
    { id: 'u1', code: 'CS', name: 'Cases', status: 'active' }
  ];

  const mockDestinations = [
    { id: 'd1', destinationCode: 'CHORLEY', destinationName: 'Chorley', destinationType: 'EXTERNAL_SITE', status: 'active', sortOrder: 1 }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 with SNP87 Ingestion Specifications panel hidden by default and toggles via (i) button', () => {
    render(
      <Snp87ImportWorkflowView
        tenantId="tenant-1"
        siteId="site-1"
        userFullName="Jane Planner"
        existingProducts={mockProducts as any}
        activeSnapshot={null}
        categories={mockCategories as any}
        units={mockUnits as any}
        destinations={mockDestinations as any}
        onCommitSuccess={vi.fn()}
        onViewCurrentSnapshot={vi.fn()}
        onViewHistory={vi.fn()}
      />
    );

    // Verify upload step is visible
    expect(screen.getByText('Select or Drop Weekly SNP87 Report')).toBeInTheDocument();

    // Verify action (i) button exists
    const infoButton = screen.getByRole('button', { name: /SNP87 Ingestion Specifications \(i\)/i });
    expect(infoButton).toBeInTheDocument();

    // Verify specifications slideover panel is translated off-screen / hidden by default
    const slideover = document.querySelector('#snp87-specs-slideover');
    expect(slideover).toBeInTheDocument();
    const innerContainer = slideover?.querySelector('.translate-x-full');
    expect(innerContainer).toBeInTheDocument();

    // Click (i) button to open drawer
    fireEvent.click(infoButton);

    // Drawer is now open (translate-x-0)
    expect(slideover?.querySelector('.translate-x-0')).toBeInTheDocument();
    expect(screen.getByText('SAP SNP87 format requirements & parsing behavior')).toBeInTheDocument();
  });

  it('detects unknown products and prompts user to add them, stepping through wizard and updating row matches', async () => {
    const onProductCreated = vi.fn();

    const mockSummary = {
      id: 'imp-1',
      tenantId: 'tenant-1',
      siteId: 'site-1',
      sourceReportName: 'SNP87_Week41.xlsx',
      sourceReportType: 'SNP87' as const,
      fileHash: 'hash-1',
      importedBy: 'Jane Planner',
      importedAt: new Date().toISOString(),
      importStatus: 'REQUIRES_REVIEW' as const,
      sourceRowCount: 1,
      recognisedRowCount: 1,
      ignoredRowCount: 0,
      forecastRowCount: 0,
      confirmedProductionRowCount: 1,
      totalForecastQuantity: 0,
      totalConfirmedProductionQuantity: 500,
      warningCount: 0,
      errorCount: 1,
      unknownProductCount: 1,
      diagnostics: {
        errors: ['Unknown Product'],
        warnings: [],
        unknownProducts: [
          {
            productNumber: '4476999',
            orderSku: 'SKU-999',
            description: 'Andrex Supreme Care',
            rowCount: 1
          }
        ],
        ignoredInfoObjects: []
      },
      version: 1,
      status: 'active' as const,
      createdBy: 'Jane Planner',
      createdDate: new Date().toISOString(),
      modifiedBy: 'Jane Planner',
      modifiedDate: new Date().toISOString()
    };

    const mockRows = [
      {
        id: 'row-1',
        importId: 'imp-1',
        tenantId: 'tenant-1',
        siteId: 'site-1',
        rowIndex: 2,
        orderSku: 'SKU-999',
        productNumber: '4476999',
        productDescription: 'Andrex Supreme Care',
        planningType: 'CONFIRMED_PRODUCTION' as const,
        planningDate: '20261010',
        startDateRaw: '20261010',
        endDateRaw: '20261010',
        quantity: 500,
        baseUnitOfMeasure: 'CS',
        productMatched: false,
        productId: null,
        productCodeSnapshot: '4476999',
        validationStatus: 'ERROR' as const,
        validationErrors: ['Unknown Product: Product Number "4476999" was not found in Product Master.'],
        validationWarnings: [],
        version: 1,
        status: 'active' as const,
        createdBy: 'Jane Planner',
        createdDate: new Date().toISOString(),
        modifiedBy: 'Jane Planner',
        modifiedDate: new Date().toISOString()
      }
    ];

    vi.spyOn(productService, 'createProduct').mockResolvedValue({
      success: true,
      data: 'new_prod_4476999'
    });

    render(
      <Snp87ImportWorkflowView
        tenantId="tenant-1"
        siteId="site-1"
        userFullName="Jane Planner"
        existingProducts={mockProducts as any}
        activeSnapshot={null}
        categories={mockCategories as any}
        units={mockUnits as any}
        destinations={mockDestinations as any}
        initialStep={3}
        initialSummary={mockSummary}
        initialRows={mockRows}
        onProductCreated={onProductCreated}
        onCommitSuccess={vi.fn()}
        onViewCurrentSnapshot={vi.fn()}
        onViewHistory={vi.fn()}
      />
    );

    // Expect prompt modal asking if user wants to add unknown products
    await waitFor(() => {
      expect(screen.getByText('Unknown Products Detected')).toBeInTheDocument();
      expect(screen.getByText('4476999')).toBeInTheDocument();
      expect(screen.getByText('Andrex Supreme Care')).toBeInTheDocument();
    });

    // User chooses "Yes, Add to Product Master"
    const yesButton = screen.getByRole('button', { name: /Yes, Add to Product Master/i });
    fireEvent.click(yesButton);

    // Wizard opens with Product 1 of 1
    await waitFor(() => {
      expect(screen.getByText('Add Unknown Product to Product Master')).toBeInTheDocument();
      expect(screen.getByDisplayValue('4476999')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Andrex Supreme Care')).toBeInTheDocument();
      const destSelect = screen.getByRole('combobox', { name: /Default Destination/i }) as HTMLSelectElement;
      expect(destSelect.value).toBe('d1'); // Chorley
    });

    // Enter cases per pallet and click Save & Finish
    const casesInput = screen.getByPlaceholderText('e.g. 80');
    fireEvent.change(casesInput, { target: { value: '80' } });

    const finishButton = screen.getByRole('button', { name: /Save & Finish/i });
    fireEvent.click(finishButton);

    // Verify product was saved via productService
    await waitFor(() => {
      expect(productService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          productCode: '4476999',
          description: 'Andrex Supreme Care',
          casesPerPallet: 80,
          defaultDestinationId: 'd1'
        })
      );
      expect(onProductCreated).toHaveBeenCalled();
    });

    // Verify Review table now has the product matched (VALID instead of ERROR)
    await waitFor(() => {
      expect(screen.getByText('VALID')).toBeInTheDocument();
      expect(screen.queryByText('+ Add to Master')).not.toBeInTheDocument();
    });

    // Discard the report - product remains added in product master
    const discardButton = screen.getByRole('button', { name: /Discard & Upload Another/i });
    fireEvent.click(discardButton);

    // Back to Step 1
    await waitFor(() => {
      expect(screen.getByText('Select or Drop Weekly SNP87 Report')).toBeInTheDocument();
    });
  });
});
