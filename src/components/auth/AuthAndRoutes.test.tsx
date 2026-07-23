import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AccessDeniedPage } from './AccessDeniedPage';

vi.mock('../../features/auth/context/AuthContext', () => ({
  useAuth: () => ({
    userProfile: { role: 'VIEWER', tenantId: 'tenant-1', siteId: 'site-1' },
    logout: vi.fn(),
  })
}));

vi.mock('../../contexts/SiteContext', () => ({
  useSiteContext: () => ({
    tenantId: 'tenant-1',
    siteId: 'site-1',
    siteName: 'Site 1',
    availableSites: [{ tenantId: 'tenant-1', siteId: 'site-1', siteName: 'Site 1', tenantName: 'Tenant 1', timezone: 'UTC' }],
    setSite: vi.fn()
  })
}));

describe('AccessDeniedPage and Auth Components', () => {
  it('renders access denied details correctly', () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <AccessDeniedPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('/admin/settings')).toBeInTheDocument();
    expect(screen.getByText('VIEWER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return Home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });
});
