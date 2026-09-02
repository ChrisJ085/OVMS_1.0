import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { DataFreshnessHoverCard } from './DataFreshnessHoverCard';
import * as DataFreshnessContext from '../../features/planning/context/DataFreshnessContext';

vi.mock('../../features/planning/context/DataFreshnessContext', () => ({
  useDataFreshness: vi.fn()
}));

describe('DataFreshnessHoverCard Component', () => {
  const mockSummary = {
    tenantId: 'tenant-NCP',
    siteId: 'site-Barrow',
    fetchedAtMillis: 1700000000000,
    overallStatus: 'FRESH' as const,
    overallScore: 4,
    recommendationDecisionAdvice: 'All core operational data sources are current.',
    items: {
      inventory: {
        key: 'inventory' as const,
        title: 'Inventory Balance',
        shortLabel: 'Inventory',
        status: 'FRESH' as const,
        statusLabel: 'Fresh',
        updatedAtMillis: 1700000000000 - 15 * 60 * 1000,
        updatedAtFormatted: '14 Nov 2023, 22:00',
        relativeTime: '15 mins ago',
        updatedBy: 'Amelia Hart',
        sourceSummary: 'Batch stock • 42 SKUs',
        route: '/inventory/balances',
        actionLabel: 'Update Inventory',
        ageMinutes: 15
      },
      sto: {
        key: 'sto' as const,
        title: 'STO Requirements',
        shortLabel: 'STO Reqs',
        status: 'FRESH' as const,
        statusLabel: 'Fresh',
        updatedAtMillis: 1700000000000 - 60 * 60 * 1000,
        updatedAtFormatted: '14 Nov 2023, 21:15',
        relativeTime: '1 hr ago',
        updatedBy: 'John Doe',
        sourceSummary: '12 STO requirements active',
        route: '/planning/northfleet-sto',
        actionLabel: 'Import STO Requirements',
        ageMinutes: 60
      },
      productionPlan: {
        key: 'production_plan' as const,
        title: 'Production Plan',
        shortLabel: 'Prod Plan',
        status: 'FRESH' as const,
        statusLabel: 'Fresh',
        updatedAtMillis: 1700000000000 - 120 * 60 * 1000,
        updatedAtFormatted: '14 Nov 2023, 20:15',
        relativeTime: '2 hrs ago',
        updatedBy: 'SAP System',
        sourceSummary: 'MPPS7_Plan_W46.xlsx (88 rows)',
        route: '/planning/production-plan',
        actionLabel: 'Upload Production Plan',
        ageMinutes: 120
      },
      recommendations: {
        key: 'recommendations' as const,
        title: 'Recommendations',
        shortLabel: 'Recommendations',
        status: 'FRESH' as const,
        statusLabel: 'Fresh',
        updatedAtMillis: 1700000000000 - 10 * 60 * 1000,
        updatedAtFormatted: '14 Nov 2023, 22:05',
        relativeTime: '10 mins ago',
        updatedBy: 'Sarah Connor',
        sourceSummary: '42 SKU recommendations evaluated',
        route: '/planning/recommendations',
        actionLabel: 'Generate Recommendations',
        ageMinutes: 10
      }
    }
  };

  it('renders trigger button and opens popover card on click/hover with all 4 items', () => {
    (DataFreshnessContext.useDataFreshness as any).mockReturnValue({
      summary: mockSummary,
      loading: false,
      isRefreshing: false,
      refresh: vi.fn(),
      siteSettings: null
    });

    render(
      <BrowserRouter>
        <DataFreshnessHoverCard />
      </BrowserRouter>
    );

    const trigger = screen.getByRole('button', { name: /data updates/i });
    expect(trigger).toBeInTheDocument();

    // Click to open popover
    fireEvent.click(trigger);

    // Assert title and advice callout
    expect(screen.getByText('System Data Updates')).toBeInTheDocument();
    expect(screen.getByText('All core operational data sources are current.')).toBeInTheDocument();

    // Assert all 4 key areas are present with their times and user info
    expect(screen.getByText('Inventory Balance')).toBeInTheDocument();
    expect(screen.getByText('15 mins ago')).toBeInTheDocument();
    expect(screen.getByText('By Amelia Hart')).toBeInTheDocument();

    expect(screen.getByText('STO Requirements')).toBeInTheDocument();
    expect(screen.getByText('1 hr ago')).toBeInTheDocument();
    expect(screen.getByText('By John Doe')).toBeInTheDocument();

    expect(screen.getByText('Production Plan')).toBeInTheDocument();
    expect(screen.getByText('2 hrs ago')).toBeInTheDocument();
    expect(screen.getByText('By SAP System')).toBeInTheDocument();

    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('10 mins ago')).toBeInTheDocument();
  });
});
