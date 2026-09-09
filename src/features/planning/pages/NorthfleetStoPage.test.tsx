import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NorthfleetStoPage } from './NorthfleetStoPage';
import * as stoService from '../services/northfleetStoService';

vi.mock('../../../contexts/SiteContext', () => ({
  useSiteContext: () => ({
    site: { id: 'site-1', name: 'Barrow' },
    tenantId: 'tenant-1',
    siteId: 'site-1'
  })
}));

vi.mock('../../auth/context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', email: 'planner@example.com' }
  })
}));

vi.mock('../../../services/supabaseBase', () => ({
  db: { type: 'mocked-firestore' }
}));

describe('NorthfleetStoPage - Error State & Hardened Retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Unable to load Northfleet STO requirements" error state on retrieval failure rather than "no STOs"', async () => {
    vi.spyOn(stoService, 'getNorthfleetStoRequirements').mockRejectedValueOnce(
      new Error('Firestore network error or permission denied')
    );

    render(<NorthfleetStoPage />);

    // Initially shows loading
    expect(screen.getByText(/Loading Northfleet STO requirements/i)).toBeInTheDocument();

    // After failure, error states must appear and "No STO Requirements Found" must NOT appear
    await waitFor(() => {
      expect(screen.getAllByText(/Unable to load Northfleet STO requirements/i).length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.queryByText(/No STO Requirements Found/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No active STO requirements loaded/i)).not.toBeInTheDocument();

    // Error details are displayed
    expect(screen.getAllByText(/Firestore network error or permission denied/i).length).toBeGreaterThanOrEqual(1);

    // Retry button is available
    expect(screen.getAllByRole('button', { name: /Retry/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('renders STO requirements normally on successful retrieval', async () => {
    const mockRequirements = [
      {
        id: 'sto-101',
        stoNumber: '4505115590',
        productCode: '3414254',
        productDescriptionSnapshot: 'Andrex Classic Clean 4RL',
        cases: 3900,
        pallets: 52,
        casesPerPalletSnapshot: 75,
        status: 'UPCOMING' as const,
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-3414254',
        destinationId: 'dest-1',
        destinationCode: 'NORTHFLEET',
        importId: 'import-1',
        northfleetDeliveryDate: new Date('2026-08-14') as any,
        barrowCollectionDate: new Date('2026-08-12') as any,
        createdBy: 'user-1',
        createdDate: new Date() as any,
        modifiedBy: 'user-1',
        modifiedDate: new Date() as any
      }
    ];

    vi.spyOn(stoService, 'getNorthfleetStoRequirements').mockResolvedValueOnce(mockRequirements as any);

    render(<NorthfleetStoPage />);

    await waitFor(() => {
      expect(screen.getByText('4505115590')).toBeInTheDocument();
    });

    expect(screen.getByText('3414254')).toBeInTheDocument();
    expect(screen.getAllByText('3,900').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Unable to load Northfleet STO requirements/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No STO Requirements Found/i)).not.toBeInTheDocument();
  });

  it('re-attempts retrieval when Retry button is clicked after failure', async () => {
    const getRequirementsSpy = vi.spyOn(stoService, 'getNorthfleetStoRequirements');

    // First call fails
    getRequirementsSpy.mockRejectedValueOnce(new Error('Connection timeout'));

    render(<NorthfleetStoPage />);

    await waitFor(() => {
      expect(screen.getAllByText(/Unable to load Northfleet STO requirements/i).length).toBeGreaterThanOrEqual(1);
    });

    // Next call succeeds
    getRequirementsSpy.mockResolvedValueOnce([
      {
        id: 'sto-102',
        stoNumber: '4505115599',
        productCode: '3414254',
        cases: 1500,
        pallets: 20,
        casesPerPalletSnapshot: 75,
        status: 'UPCOMING' as const,
        tenantId: 'tenant-1',
        siteId: 'site-1',
        productId: 'prod-3414254',
        destinationId: 'dest-1',
        destinationCode: 'NORTHFLEET',
        importId: 'import-1',
        northfleetDeliveryDate: new Date() as any,
        barrowCollectionDate: new Date() as any,
        createdBy: 'user-1',
        createdDate: new Date() as any,
        modifiedBy: 'user-1',
        modifiedDate: new Date() as any
      }
    ] as any);

    const retryButtons = screen.getAllByRole('button', { name: /Retry/i });
    fireEvent.click(retryButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('4505115599')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Unable to load Northfleet STO requirements/i)).not.toBeInTheDocument();
  });
});
