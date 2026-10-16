import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddUnknownProductsWizardModal } from './AddUnknownProductsWizardModal';
import * as productService from '../../../inventory/services/productService';
import * as dbService from '../../../../services/dbService';

describe('AddUnknownProductsWizardModal', () => {
  const mockCategories = [
    { id: 'cat-1', name: 'Bath Tissue', code: 'BT', status: 'active' }
  ];

  const mockUnits = [
    { id: 'uom-cs', code: 'CS', name: 'Cases', quantityPrecision: 0, status: 'active' },
    { id: 'uom-pal', code: 'PAL', name: 'Pallets', quantityPrecision: 2, status: 'active' }
  ];

  const mockDestinations = [
    { id: 'dest-chorley', destinationCode: 'CHORLEY', destinationName: 'Chorley', destinationType: 'EXTERNAL_SITE', sortOrder: 1, status: 'active' },
    { id: 'dest-northfleet', destinationCode: 'NF', destinationName: 'Northfleet', destinationType: 'EXTERNAL_SITE', sortOrder: 2, status: 'active' }
  ];

  const mockUnknownProducts = [
    {
      productNumber: '4310999',
      orderSku: 'SKU-999',
      description: 'Andrex Quilts Special Edition',
      rowCount: 5,
      baseUnitOfMeasure: 'CS'
    },
    {
      productNumber: '4310888',
      orderSku: 'SKU-888',
      description: 'Andrex Classic Clean 4pk',
      rowCount: 3,
      baseUnitOfMeasure: 'CS'
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(productService, 'createProduct').mockResolvedValue({
      success: true,
      data: 'new_prod_id_123'
    });
  });

  it('pre-populates Product Code and Description and defaults destination to Chorley', () => {
    render(
      <AddUnknownProductsWizardModal
        isOpen={true}
        onClose={vi.fn()}
        unknownProducts={mockUnknownProducts}
        categories={mockCategories as any}
        units={mockUnits as any}
        destinations={mockDestinations as any}
        tenantId="tenant-1"
        siteId="site-1"
        userFullName="Jane Planner"
        onProductSaved={vi.fn()}
        onAllCompleted={vi.fn()}
      />
    );

    // Verify wizard shows Product 1 of 2
    expect(screen.getByText('Product 1 of 2')).toBeInTheDocument();

    // Verify pre-populated Product Code
    const codeInput = screen.getByDisplayValue('4310999') as HTMLInputElement;
    expect(codeInput).toBeInTheDocument();

    // Verify pre-populated Description
    const descInput = screen.getByDisplayValue('Andrex Quilts Special Edition') as HTMLInputElement;
    expect(descInput).toBeInTheDocument();

    // Verify Default Destination is defaulted to Chorley
    const destSelect = screen.getByRole('combobox', { name: /Default Destination/i }) as HTMLSelectElement;
    expect(destSelect.value).toBe('dest-chorley');
  });

  it('steps through unknown products one-by-one upon saving and calls onAllCompleted', async () => {
    const onProductSaved = vi.fn();
    const onAllCompleted = vi.fn();
    const onClose = vi.fn();

    render(
      <AddUnknownProductsWizardModal
        isOpen={true}
        onClose={onClose}
        unknownProducts={mockUnknownProducts}
        categories={mockCategories as any}
        units={mockUnits as any}
        destinations={mockDestinations as any}
        tenantId="tenant-1"
        siteId="site-1"
        userFullName="Jane Planner"
        onProductSaved={onProductSaved}
        onAllCompleted={onAllCompleted}
      />
    );

    // Enter cases per pallet for Product 1 (4310999)
    const casesInput = screen.getByPlaceholderText('e.g. 80');
    fireEvent.change(casesInput, { target: { value: '80' } });

    // Click Save & Next
    const saveButton = screen.getByRole('button', { name: /Save & Next Product/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(productService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          siteId: 'site-1',
          productCode: '4310999',
          description: 'Andrex Quilts Special Edition',
          casesPerPallet: 80,
          defaultDestinationId: 'dest-chorley'
        })
      );
      expect(onProductSaved).toHaveBeenCalledTimes(1);
    });

    // Verify wizard moved to Product 2 of 2
    await waitFor(() => {
      expect(screen.getByText('Product 2 of 2')).toBeInTheDocument();
      expect(screen.getByDisplayValue('4310888')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Andrex Classic Clean 4pk')).toBeInTheDocument();
    });

    // Enter cases per pallet for Product 2 and save
    const casesInput2 = screen.getByPlaceholderText('e.g. 80');
    fireEvent.change(casesInput2, { target: { value: '64' } });

    const finishButton = screen.getByRole('button', { name: /Save & Finish/i });
    fireEvent.click(finishButton);

    await waitFor(() => {
      expect(productService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          productCode: '4310888',
          casesPerPallet: 64,
          defaultDestinationId: 'dest-chorley'
        })
      );
      expect(onAllCompleted).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('defaults to Chorley even when Chorley is not in initial destinations list by providing default Chorley option', () => {
    // Empty destinations list
    render(
      <AddUnknownProductsWizardModal
        isOpen={true}
        onClose={vi.fn()}
        unknownProducts={mockUnknownProducts}
        categories={mockCategories as any}
        units={mockUnits as any}
        destinations={[]}
        tenantId="tenant-1"
        siteId="site-1"
        userFullName="Jane Planner"
        onProductSaved={vi.fn()}
        onAllCompleted={vi.fn()}
      />
    );

    // Verify Chorley is present and selected
    const destSelect = screen.getByRole('combobox', { name: /Default Destination/i }) as HTMLSelectElement;
    expect(destSelect.value).toBe('CHORLEY_DEFAULT');
    expect(screen.getAllByText(/Chorley/i).length).toBeGreaterThan(0);
  });
});
