import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

vi.mock('firebase/firestore', () => ({
  doc: (db: any, path: string, ...args: any[]) => ({ _type: 'doc', path, args }),
  collection: (db: any, name: string) => ({ _type: 'collection', name }),
  query: (col: any, ...args: any[]) => ({ _type: 'query', col, args }),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: (q: any, cb: any, errCb?: any) => {
    if (mockQueryError && errCb) {
      errCb(mockQueryError);
      return () => {};
    }
    if (q && q._type === 'doc') {
      cb({
        exists: () => true,
        data: () => ({
          tenantId: 'tenant-1',
          siteId: 'site-1',
          status: 'COMPLETED',
          currentStep: 3,
          completedSteps: [0, 1, 2],
          skippedOptionalSteps: []
        })
      });
    } else {
      let rawDocs = mockPrioritiesDocs;
      if (q && q._type === 'query' && q.col && q.col.name === 'exceptions') {
        rawDocs = mockExceptionsDocs;
      } else if (q && q._type === 'query' && q.col && q.col.name === 'announcements') {
        rawDocs = mockAnnouncementsDocs;
      }
      const docs = rawDocs.map(d => ({
        id: d.id || 'mock-id',
        data: () => d
      }));
      cb({ docs });
    }
    return () => {};
  },
  getDocs: async (q: any) => {
    if (mockQueryError) {
      throw mockQueryError;
    }
    let rawDocs = mockRecommendationsDocs;
    if (q && q._type === 'query' && q.col && q.col.name === 'productionPlanImports') {
      rawDocs = mockImportDocs;
    } else if (q && q._type === 'query' && q.col && q.col.name === 'siteSettings') {
      rawDocs = mockEntriesDocs;
    }
    const docs = rawDocs.map(d => ({
      id: d.id || 'mock-id',
      data: () => d
    }));
    return {
      empty: docs.length === 0,
      size: docs.length,
      docs,
    };
  },
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), toDate: () => new Date() }),
  },
}));

vi.mock('../config/firebase', () => ({
  db: {},
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
    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Operational Overview')).toBeInTheDocument();
    expect(screen.getByText(/Milton Keynes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review Recs/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import SAP Plan/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Priority/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Announcement/i })).toBeInTheDocument();
  });

  it('renders Warehouse Operator overview with execution shortcut', () => {
    mockAuthContext = {
      ...mockAuthContext,
      userProfile: { role: 'WAREHOUSE_OPERATOR', tenantId: 'tenant-1', siteId: 'site-1' },
    };

    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /Open Warehouse Execution/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import SAP Plan/i })).not.toBeInTheDocument();
  });

  it('renders Viewer overview in read-only mode', () => {
    mockAuthContext = {
      ...mockAuthContext,
      userProfile: { role: 'VIEWER', tenantId: 'tenant-1', siteId: 'site-1' },
    };

    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Operational Overview')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review Recs/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open Warehouse Execution/i })).not.toBeInTheDocument();
  });

  it('renders empty states when no data exists', () => {
    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/No active or blocked priorities for this site/i)).toBeInTheDocument();
    expect(screen.getByText(/No recommendations awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/SAP production plan has not been imported for this site/i)).toBeInTheDocument();
    expect(screen.getByText(/No open operational exceptions/i)).toBeInTheDocument();
  });

  it('renders stale/missing SAP plan warning banner', () => {
    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/SAP production plan has not been imported for this site/i)).toBeInTheDocument();
  });

  it('handles cross-site switch by displaying updated site name', () => {
    mockSiteContext = {
      ...mockSiteContext,
      site: { siteId: 'site-2', tenantId: 'tenant-1', siteName: 'Northampton Hub' },
      siteId: 'site-2',
      siteName: 'Northampton Hub',
    };

    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Northampton Hub/i)).toBeInTheDocument();
  });

  it('displays error state when queries fail', async () => {
    mockQueryError = new Error('Database query permission denied');

    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Failed to load operational priorities/i)).toBeInTheDocument();
  });

  it('navigates with correct filters when summary cards are clicked', () => {
    render(
      <MemoryRouter>
        <OperationalOverviewPage />
      </MemoryRouter>
    );

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
