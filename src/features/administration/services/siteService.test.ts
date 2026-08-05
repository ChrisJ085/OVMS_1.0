import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchUserPermittedSites } from './siteService';
import { getDoc, getDocs } from 'firebase/firestore';
import { UserProfile } from '../../../types/auth';

vi.mock('../../../config/firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

describe('siteService - fetchUserPermittedSites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Planner with site document ID receives the site via direct getDoc', async () => {
    const profile = {
      uid: 'user-1',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-doc-123'],
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'site-doc-123',
      data: () => ({
        tenantId: 'tenant-NCP',
        siteName: 'Barrow RDC',
        active: true,
      }),
    } as any);

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

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'site-doc-456',
      data: () => ({
        tenantId: 'tenant-NCP',
        siteName: 'Warehouse 2',
        status: 'ACTIVE',
      }),
    } as any);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(1);
    expect(sites[0].siteId).toBe('site-doc-456');
  });

  it('Viewer and Display roles receive site via direct getDoc', async () => {
    const viewerProfile = {
      uid: 'user-3',
      role: 'VIEWER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-view'],
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'site-view',
      data: () => ({
        tenantId: 'tenant-NCP',
        siteName: 'View Site',
        active: true,
      }),
    } as any);

    const viewerSites = await fetchUserPermittedSites(viewerProfile);
    expect(viewerSites).toHaveLength(1);
    expect(viewerSites[0].siteId).toBe('site-view');

    const displayProfile = {
      uid: 'user-4',
      role: 'DISPLAY' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-display'],
      accountStatus: 'ACTIVE',
    } as unknown as UserProfile;

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'site-display',
      data: () => ({
        tenantId: 'tenant-NCP',
        siteName: 'Display Site',
        active: true,
      }),
    } as any);

    const displaySites = await fetchUserPermittedSites(displayProfile);
    expect(displaySites).toHaveLength(1);
    expect(displaySites[0].siteId).toBe('site-display');
  });

  it('Empty or missing siteIds returns no sites', async () => {
    const profileEmpty = {
      uid: 'user-5',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: [],
    } as unknown as UserProfile;
    const sitesEmpty = await fetchUserPermittedSites(profileEmpty);
    expect(sitesEmpty).toHaveLength(0);

    const profileMissing = {
      uid: 'user-6',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: null as any,
    } as unknown as UserProfile;
    const sitesMissing = await fetchUserPermittedSites(profileMissing);
    expect(sitesMissing).toHaveLength(0);
  });

  it('Assigned site from another tenant is rejected', async () => {
    const profile = {
      uid: 'user-7',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['other-tenant-site'],
    } as unknown as UserProfile;

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'other-tenant-site',
      data: () => ({
        tenantId: 'tenant-OTHER',
        siteName: 'Other Tenant Site',
        active: true,
      }),
    } as any);

    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as any);

    await expect(fetchUserPermittedSites(profile)).rejects.toThrow('UNRESOLVED_ASSIGNMENTS');
  });

  it('Unknown assigned ID produces unresolved-assignment error', async () => {
    const profile = {
      uid: 'user-8',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['non-existent'],
    } as unknown as UserProfile;

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
    } as any);

    vi.mocked(getDocs).mockResolvedValue({ empty: true, docs: [] } as any);

    await expect(fetchUserPermittedSites(profile)).rejects.toThrow('UNRESOLVED_ASSIGNMENTS');
  });

  it('Legacy siteId and siteCode query lookups work', async () => {
    const profile = {
      uid: 'user-9',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['legacy-code-123'],
    } as unknown as UserProfile;

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => false,
    } as any);

    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: true,
      docs: [],
    } as any);

    vi.mocked(getDocs).mockResolvedValueOnce({
      empty: false,
      docs: [
        {
          id: 'doc-id-matched',
          data: () => ({
            tenantId: 'tenant-NCP',
            siteCode: 'legacy-code-123',
            siteName: 'Legacy Site',
            active: true,
          }),
        },
      ],
    } as any);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(1);
    expect(sites[0].siteId).toBe('doc-id-matched');
    expect(sites[0].siteName).toBe('Legacy Site');
  });

  it('Tenant Admin receives all own-tenant active sites', async () => {
    const profile = {
      uid: 'admin-1',
      role: 'TENANT_ADMIN' as any,
      tenantId: 'tenant-NCP',
    } as unknown as UserProfile;

    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 's1',
          data: () => ({ tenantId: 'tenant-NCP', siteName: 'Site 1', active: true }),
        },
        {
          id: 's2',
          data: () => ({ tenantId: 'tenant-NCP', siteName: 'Site 2', status: 'ACTIVE' }),
        },
        {
          id: 's3',
          data: () => ({ tenantId: 'tenant-OTHER', siteName: 'Other Tenant Site', active: true }),
        },
      ],
      forEach(cb: any) {
        this.docs.forEach(cb);
      }
    } as any);

    const sites = await fetchUserPermittedSites(profile);
    expect(sites).toHaveLength(2);
    expect(sites.map(s => s.siteId)).toEqual(expect.arrayContaining(['s1', 's2']));
  });

  it('Permission-denied is correctly thrown and not treated as ordinary unassigned', async () => {
    const profile = {
      uid: 'user-10',
      role: 'PLANNER' as any,
      tenantId: 'tenant-NCP',
      siteIds: ['site-secured'],
    } as unknown as UserProfile;

    const permErr: any = new Error('permission-denied');
    permErr.code = 'permission-denied';

    vi.mocked(getDoc).mockRejectedValueOnce(permErr);

    await expect(fetchUserPermittedSites(profile)).rejects.toThrow('permission-denied');
  });
});
