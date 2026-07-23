import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AccessDeniedPage } from './AccessDeniedPage';

vi.mock('../../contexts/DevelopmentContext', () => ({
  useDevelopmentContext: () => ({
    userProfile: { role: 'VIEWER', tenantId: 'tenant-1', siteId: 'site-1' },
    logout: vi.fn(),
    currentSite: { id: 'site-1', name: 'Site 1' },
    sites: [{ id: 'site-1', name: 'Site 1' }],
    switchSite: vi.fn()
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
