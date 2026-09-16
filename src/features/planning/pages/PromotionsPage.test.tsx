import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PromotionsPage } from './PromotionsPage';

vi.mock('../../../contexts/SiteContext', () => ({
  useSiteContext: () => ({
    tenantId: 'tenant-test',
    siteId: 'site-test',
    currentSite: { id: 'site-test', name: 'Test Site' }
  })
}));

vi.mock('../services/promotionService', () => ({
  subscribeToPromotions: (tenantId: string, onUpdate: (items: any[]) => void) => {
    // Return sample promotions with string ISO dates as returned from Supabase
    setTimeout(() => {
      onUpdate([
        {
          id: 'promo-1',
          promotionCode: 'SUMMER26',
          promotionName: 'Summer Sale',
          description: 'Summer promo',
          importance: 'HIGH',
          promotionStatus: 'ACTIVE',
          phase: 'ACTIVE',
          startDate: '2026-07-01T00:00:00Z',
          endDate: '2026-07-31T23:59:59Z',
          status: 'active'
        },
        {
          id: 'promo-2',
          promotionCode: 'AUTUMN26',
          promotionName: 'Autumn Sale',
          description: 'Autumn promo',
          importance: 'STANDARD',
          promotionStatus: 'SCHEDULED',
          phase: 'PRE_BUILD',
          startDate: '2026-09-01T00:00:00Z',
          endDate: '2026-09-30T23:59:59Z',
          status: 'active'
        }
      ]);
    }, 10);
    return () => {};
  }
}));

describe('PromotionsPage', () => {
  it('renders promotions without crashing on ISO string dates', async () => {
    render(
      <MemoryRouter>
        <PromotionsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading promotions/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('SUMMER26 - Summer Sale')).toBeInTheDocument();
      expect(screen.getByText('AUTUMN26 - Autumn Sale')).toBeInTheDocument();
    });
  });
});
