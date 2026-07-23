import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MissingProductResolution } from './MissingProductResolution';
import { ImportDiagnosticsPanel } from './ImportDiagnosticsPanel';

describe('Planning Components Test Suite', () => {
  it('renders MissingProductResolution correctly with product details and affected rows', () => {
    const affectedRows = [
      {
        productionLineCode: 'LINE-01',
        productionLineName: 'Line 1',
        productionDate: { toDate: () => new Date() },
        plannedQuantity: 500,
        sourceUnitOfMeasure: 'CS'
      }
    ];

    render(
      <MissingProductResolution
        productCode="PRD-999"
        sapDescription="New SAP Beverage"
        affectedRows={affectedRows}
        existingProducts={[]}
        tenantId="tenant-1"
        siteId="site-1"
        userProfileName="Planner Joe"
        onClose={vi.fn()}
        onResolved={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('PRD-999')).toBeInTheDocument();
    expect(screen.getByDisplayValue('New SAP Beverage')).toBeInTheDocument();
    expect(screen.getByText(/500 cases/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Product & Revalidate/i })).toBeInTheDocument();
  });
});
