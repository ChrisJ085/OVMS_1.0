import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserPermittedSites } from './siteService';
import { UserProfile } from '../../../types/auth';
import { supabase } from '../../../config/supabase';

vi.mock('../../../config/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('siteService - fetchUserPermittedSites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Planner with site document ID receives the site via Supabase query', async () => {
    const profile = {
      uid: 'user-1',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-doc-123'],
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'site-doc-123',
              tenant_id: 'tenant-NCP',
              name: 'Barrow RDC',
              status: 'active',
            },
          ],
          error: null,
        }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(1);
    expect(sites[0].siteId).toBe('site-doc-123');
    expect(sites[0].siteName).toBe('Barrow RDC');
    expect(sites[0].tenantId).toBe('tenant-NCP');
  });

  it('Warehouse Operator with site document ID receives the site', async () => {
    const profile = {
      uid: 'user-2',
      role: 'WAREHOUSE_OPERATOR' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-doc-456'],
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'site-doc-456',
              tenant_id: 'tenant-NCP',
              name: 'Warehouse 2',
              status: 'ACTIVE',
            },
          ],
          error: null,
        }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(1);
    expect(sites[0].siteId).toBe('site-doc-456');
  });

  it('Viewer and Display roles receive site via assigned site query', async () => {
    const viewerProfile = {
      uid: 'user-3',
      role: 'VIEWER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-view'],
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'site-view',
              tenant_id: 'tenant-NCP',
              name: 'View Site',
              status: 'active',
            },
          ],
          error: null,
        }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const viewerSites = await fetchUserPermittedSites(viewerProfile);
    expect(viewerSites).toHaveLength(1);
    expect(viewerSites[0].siteId).toBe('site-view');
  });

  it('Empty or missing siteIds returns no sites', async () => {
    const profileEmpty = {
      uid: 'user-5',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: [],
    } as unknown as UserProfile;

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }),
    });
    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const sitesEmpty = await fetchUserPermittedSites(profileEmpty);
    expect(sitesEmpty).toHaveLength(0);
  });

  it('Tenant Admin receives all own-tenant active sites', async () => {
    const profile = {
      uid: 'admin-1',
      role: 'TENANT_ADMIN' as any,
      tenantId: 'tenant-NCP',
    } as unknown as UserProfile;

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 's1', tenant_id: 'tenant-NCP', name: 'Site 1', status: 'active' },
            { id: 's2', tenant_id: 'tenant-NCP', name: 'Site 2', status: 'ACTIVE' },
          ],
          error: null,
        }),
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(2);
    expect(sites.map(s => s.siteId)).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  it('Platform Superuser receives all active sites across all tenants', async () => {
    const profile = {
      uid: 'super-1',
      role: 'PLATFORM_SUPERUSER' as any,
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          { id: 's1', tenant_id: 'tenant-A', name: 'Site A1', status: 'active' },
          { id: 's2', tenant_id: 'tenant-B', name: 'Site B1', status: 'active' },
        ],
        error: null,
      }),
    });

    vi.mocked(supabase.from).mockImplementation(mockFrom);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(2);
    expect(sites.map(s => s.siteId)).toEqual(expect.arrayContaining(['s1', 's2']));
  });
});
