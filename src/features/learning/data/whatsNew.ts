import { WhatsNewItem } from '../../../types/learning';

export const SEED_WHATS_NEW: WhatsNewItem[] = [
  {
    id: 'wn-learning-centre',
    type: 'NEW_FEATURE',
    title: 'In-App Learning & SOP Centre Released',
    description: 'Access comprehensive standard operating procedures directly in the app without interrupting your workflow. Use the persistent Help button or keyboard shortcut (?) to slide out contextual guides.',
    date: '2026-09-14T08:00:00Z',
    sopId: 'sop-using-help-centre',
    appRoute: '/learning',
    badgeText: 'New Feature'
  },
  {
    id: 'wn-date-fix',
    type: 'CHANGED_FEATURE',
    title: 'Robust ISO Timestamp & Promotion Sorting',
    description: 'Promotions and Production Plans now feature automated ISO date parsing and error-resilient sorting across multi-timezone environments.',
    date: '2026-09-14T07:30:00Z',
    sopId: 'sop-production-planning',
    appRoute: '/planning/promotions',
    badgeText: 'Enhancement'
  },
  {
    id: 'wn-uom-names',
    type: 'CHANGED_FEATURE',
    title: 'Tenant-Wide Unit of Measure Display',
    description: 'Inventory balances, stock modals, and rule builders now consistently render human-readable Unit of Measure labels (e.g. Cases, Pallets) rather than internal unit IDs.',
    date: '2026-09-14T07:00:00Z',
    sopId: 'sop-understanding-stock-quantities',
    appRoute: '/inventory/balances',
    badgeText: 'Fix'
  },
  {
    id: 'wn-recommendations-speed',
    type: 'UPDATED_SOP',
    title: 'Updated SOP: Reviewing Recommendations',
    description: 'New step-by-step guidance on evaluating multi-line algorithmic shortfall calculations and converting them directly into live picking priorities.',
    date: '2026-09-13T10:00:00Z',
    sopId: 'sop-reviewing-recommendations',
    appRoute: '/planning/recommendations',
    badgeText: 'SOP Update'
  },
  {
    id: 'wn-tv-dashboard-refresh',
    type: 'ANNOUNCEMENT',
    title: 'Visual Management TV Dashboard Best Practices',
    description: 'Review our updated display instructions for mounting warehouse televisions and setting high-contrast dark visual priority boards.',
    date: '2026-09-12T12:00:00Z',
    sopId: 'sop-operational-displays',
    appRoute: '/tv-dashboard',
    badgeText: 'Notice'
  }
];
