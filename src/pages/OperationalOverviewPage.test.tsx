import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { OperationalOverviewPage } from './OperationalOverviewPage';

// Mocks
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

let mockAuthContext = {
  userProfile: { role: 'PLANNER', tenantId: 'tenant-1', siteId: 'site-1' },
};

let mockSiteContext = {
  tenantId: 'tenant-1',
  siteId: 'site-1',
  site: { siteId: 'site-1', tenantId: 'tenant-1', siteName: 'Milton Keynes' },
  siteName: 'Milton Keynes',
};

vi.mock('../features/auth/context/AuthContext', () => ({
  useAuth: () => mockAuthContext,
}));

vi.mock('../contexts/SiteContext', () => ({
  useSiteContext: () => mockSiteContext,
}));

// Mock Firestore functions
let mockPrioritiesDocs: any[] = [];
let mockExceptionsDocs: any[] = [];
let mockAnnouncementsDocs: any[] = [];
let mockRecommendationsDocs: any[] = [];
let mockImportDocs: any[] = [];
let mockEntriesDocs: any[] = [];
let mockQueryError: Error | null = null;

vi.mock('../services/dbService', () => ({
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  subscribeToCollection: (col: string, _constraints: any[], cb: any, errCb?: any) => {
    if (mockQueryError && errCb) {
      errCb(mockQueryError);
      return () => {};
    }
    let docs: any[] = [];
    if (col === 'displayPriorities' || col === 'priorities') docs = mockPrioritiesDocs.map(d => d.data ? d.data() : d);
    else if (col === 'operationalExceptions') docs = mockExceptionsDocs.map(d => d.data ? d.data() : d);
    else if (col === 'announcements') docs = mockAnnouncementsDocs.map(d => d.data ? d.data() : d);
    cb(docs);
    return () => {};
  },
  getDocuments: async (col: string) => {
    if (mockQueryError) {
      throw mockQueryError;
    }
    if (col === 'recommendations') return mockRecommendationsDocs.map(d => d.data ? d.data() : d);
    if (col === 'productionPlanImports') return mockImportDocs.map(d => d.data ? d.data() : d);
    if (col === 'productionPlanEntries') return mockEntriesDocs.map(d => d.data ? d.data() : d);
    return [];
  },
  getDocument: async () => null,
  updateDocument: async () => {},
  setDocument: async () => {},
  createDocument: async () => {},
  deleteDocument: async () => {},
}));

describe('OperationalOverviewPage Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryError = null;
    mockPrioritiesDocs = [];
    mockExceptionsDocs = [];
    mockAnnouncementsDocs = [];
    mockRecommendationsDocs = [];
    mockImportDocs = [];
    mockEntriesDocs = [];
    mockAuthContext = {
      userProfile: { role: 'PLANNER', tenantId: 'tenant-1', siteId: 'site-1' },
    };
    mockSiteContext = {
      tenantId: 'tenant-1',
      siteId: 'site-1',
      site: { siteId: 'site-1', tenantId: 'tenant-1', siteName: 'Milton Keynes' },
      siteName: 'Milton Keynes',
    };
  });

  it('renders Planner overview with quick actions and summary cards', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Operational Overview')).toBeInTheDocument();
    expect(screen.getAllByText(/Milton Keynes/i)[0]).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Recs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import SAP Plan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Priority/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Announcement/i })).toBeInTheDocument();
  });

  it('renders Warehouse Operator overview with execution shortcut', async () => {
    mockAuthContext = {
      ...mockAuthContext,
      userProfile: { role: 'WAREHOUSE_OPERATOR', tenantId: 'tenant-1', siteId: 'site-1' },
    };

    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByRole('button', { name: /Open Warehouse Execution/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import SAP Plan/i })).not.toBeInTheDocument();
  });

  it('renders Viewer overview in read-only mode', async () => {
    mockAuthContext = {
      ...mockAuthContext,
      userProfile: { role: 'VIEWER', tenantId: 'tenant-1', siteId: 'site-1' },
    };

    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText('Operational Overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review Recs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Warehouse Execution/i })).not.toBeInTheDocument();
  });

  it('renders empty states when no data exists', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText(/No active or blocked priorities for this site/i)).toBeInTheDocument();
    expect(screen.getByText(/No recommendations awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/SAP production plan has not been imported for this site/i)).toBeInTheDocument();
    expect(screen.getByText(/No open operational exceptions/i)).toBeInTheDocument();
  });

  it('renders stale/missing SAP plan warning banner', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText(/SAP production plan has not been imported for this site/i)).toBeInTheDocument();
  });

  it('handles cross-site switch by displaying updated site name', async () => {
    mockSiteContext = {
      ...mockSiteContext,
      site: { siteId: 'site-2', tenantId: 'tenant-1', siteName: 'Northampton Hub' },
      siteId: 'site-2',
      siteName: 'Northampton Hub',
    };

    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getAllByText(/Northampton Hub/i)[0]).toBeInTheDocument();
  });

  it('displays error state when queries fail', async () => {
    mockQueryError = new Error('Database query permission denied');

    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    expect(screen.getByText(/Failed to load operational priorities/i)).toBeInTheDocument();
  });

  it('navigates with correct filters when summary cards are clicked', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <OperationalOverviewPage />
        </MemoryRouter>
      );
    });

    const recsCard = screen.getByText('Recommendations').closest('div');
    if (recsCard) {
      fireEvent.click(recsCard);
      expect(mockNavigate).toHaveBeenCalledWith('/planning/recommendations?filter=requires-review');
    }

    const urgentCard = screen.getByText('Urgent Priorities').closest('div');
    if (urgentCard) {
      fireEvent.click(urgentCard);
      expect(mockNavigate).toHaveBeenCalledWith('/operations/priorities?filter=urgent');
    }
  });
});
