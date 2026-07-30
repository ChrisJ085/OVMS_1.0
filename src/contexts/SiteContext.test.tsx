import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SiteProvider, useSiteContext } from './SiteContext';
import { fetchUserPermittedSites } from '../features/administration/services/siteService';

// Mock fetchUserPermittedSites
vi.mock('../features/administration/services/siteService', () => ({
  DEFAULT_SITES: [
    { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' },
    { tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' }
  ],
  fetchUserPermittedSites: vi.fn(),
}));

// Mock useAuth
let mockAuth = {
  userProfile: null as any,
  loading: false,
};
vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// Helper Consumer Component to read from SiteContext
const TestConsumer: React.FC = () => {
  const { siteReady, siteLoading, siteError, siteId, tenantId, availableSites, setSite } = useSiteContext();

  return (
    <div>
      <div data-testid="site-loading">{siteLoading ? 'LOADING' : 'IDLE'}</div>
      <div data-testid="site-ready">{siteReady ? 'READY' : 'NOT_READY'}</div>
      <div data-testid="site-error">{siteError || 'NO_ERROR'}</div>
      <div data-testid="site-id">{siteId}</div>
      <div data-testid="tenant-id">{tenantId}</div>
      <div data-testid="available-sites-count">{availableSites.length}</div>
      <button 
        data-testid="switch-site-btn" 
        onClick={() => setSite({ tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' })}
      >
        Switch
      </button>
    </div>
  );
};

describe('SiteContext Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuth = {
      userProfile: null,
      loading: false,
    };
  });

  it('No saved site: defaults to first permitted site when profile is loaded', async () => {
    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow'] },
    };
    
    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('site-id').textContent).toBe('site_barrow');
    expect(screen.getByTestId('tenant-id').textContent).toBe('tenant_dev');
  });

  it('Valid saved site: restores from local storage if it is in permitted list', async () => {
    localStorage.setItem('ovms_active_site', JSON.stringify({
      tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London'
    }));

    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow', 'site_test'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' },
      { tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('site-id').textContent).toBe('site_test');
  });

  it('Invalid saved site: falls back to first permitted site if saved site is not permitted', async () => {
    localStorage.setItem('ovms_active_site', JSON.stringify({
      tenantId: 'tenant_dev', siteId: 'site_unauthorised', siteName: 'Hacker Facility', tenantName: 'Hacker Inc', timezone: 'Europe/London'
    }));

    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('site-id').textContent).toBe('site_barrow');
    // Verifies correction is saved back to local storage
    const saved = JSON.parse(localStorage.getItem('ovms_active_site') || '{}');
    expect(saved.siteId).toBe('site_barrow');
  });

  it('User with one permitted site vs multiple permitted sites', async () => {
    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    const { rerender } = render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });
    expect(screen.getByTestId('available-sites-count').textContent).toBe('1');

    // Change profile to multiple sites
    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow', 'site_test'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' },
      { tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    rerender(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('available-sites-count').textContent).toBe('2');
    });
  });

  it('User with no permitted sites: shows controlled message, does not fall back to default, blocks siteReady', async () => {
    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: [] },
    };

    // Simulate empty permitted sites
    vi.mocked(fetchUserPermittedSites).mockResolvedValue([]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-loading').textContent).toBe('IDLE');
    });

    expect(screen.getByTestId('site-ready').textContent).toBe('NOT_READY');
    expect(screen.getByTestId('site-error').textContent).toBe('You have no assigned operational sites.');
    expect(screen.getByTestId('site-id').textContent).toBe('');
    expect(screen.getByTestId('tenant-id').textContent).toBe('');
  });

  it('Tenant Admin: automatically has access to all sites in their tenant', async () => {
    mockAuth = {
      loading: false,
      userProfile: { role: 'TENANT_ADMIN', tenantId: 'tenant_dev' },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' },
      { tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('available-sites-count').textContent).toBe('2');
  });

  it('Site switching: triggers state transition and briefs loading/unsubscription phase', async () => {
    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow', 'site_test'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' },
      { tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    // Initial site
    expect(screen.getByTestId('site-id').textContent).toBe('site_barrow');

    // Switch site
    const switchBtn = screen.getByTestId('switch-site-btn');
    act(() => {
      switchBtn.click();
    });

    // Instant transition to not ready & loading
    expect(screen.getByTestId('site-ready').textContent).toBe('NOT_READY');
    expect(screen.getByTestId('site-loading').textContent).toBe('LOADING');

    // Wait 150ms for simulated transition
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 150));
    });

    expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    expect(screen.getByTestId('site-id').textContent).toBe('site_test');
  });

  it('Migration from old key: copies to ovms_active_site and removes old ovms_dev_context key', async () => {
    const siteToMigrate = {
      tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London'
    };
    localStorage.setItem('ovms_dev_context', JSON.stringify(siteToMigrate));

    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow', 'site_test'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' },
      { tenantId: 'tenant_dev', siteId: 'site_test', siteName: 'Test Facility', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('site-id').textContent).toBe('site_test');

    // Confirm stored in new key and old key deleted
    expect(localStorage.getItem('ovms_active_site')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('ovms_active_site') || '{}').siteId).toBe('site_test');
    expect(localStorage.getItem('ovms_dev_context')).toBeNull();
  });

  it('Malformed old value: ignores malformed old value and deletes it, then falls back', async () => {
    localStorage.setItem('ovms_dev_context', 'invalid_json{');

    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('site-id').textContent).toBe('site_barrow');
    expect(localStorage.getItem('ovms_dev_context')).toBeNull();
  });

  it('Malformed new value: ignores malformed new value and deletes it, then falls back', async () => {
    localStorage.setItem('ovms_active_site', JSON.stringify({ tenantId: 'tenant_dev' })); // Missing required fields

    mockAuth = {
      loading: false,
      userProfile: { role: 'PLANNER', tenantId: 'tenant_dev', siteIds: ['site_barrow'] },
    };

    vi.mocked(fetchUserPermittedSites).mockResolvedValue([
      { tenantId: 'tenant_dev', siteId: 'site_barrow', siteName: 'Barrow RDC', tenantName: 'GXO Dev', timezone: 'Europe/London' }
    ]);

    render(
      <SiteProvider>
        <TestConsumer />
      </SiteProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('site-ready').textContent).toBe('READY');
    });

    expect(screen.getByTestId('site-id').textContent).toBe('site_barrow');
    expect(JSON.parse(localStorage.getItem('ovms_active_site') || '{}').siteId).toBe('site_barrow');
  });
});
