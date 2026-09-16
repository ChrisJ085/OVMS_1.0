export interface RouteSopRecommendation {
  pathPattern: RegExp;
  exactPath?: string;
  defaultSopId: string;
  recommendedSopIds: string[];
  contextTitle: string;
  contextDescription: string;
}

export const ROUTE_SOP_MAPPINGS: RouteSopRecommendation[] = [
  {
    pathPattern: /^\/$/,
    exactPath: '/',
    defaultSopId: 'sop-welcome',
    recommendedSopIds: ['sop-welcome', 'sop-navigation', 'sop-understanding-priorities', 'sop-using-help-centre'],
    contextTitle: 'Operational Overview Guidance',
    contextDescription: 'Learn how to interpret high-level operational statistics and system health.'
  },
  {
    pathPattern: /^\/operations\/priorities\/new/,
    defaultSopId: 'sop-creating-priority',
    recommendedSopIds: ['sop-creating-priority', 'sop-setting-priority-levels', 'sop-destinations-config'],
    contextTitle: 'Creating Priorities',
    contextDescription: 'Step-by-step instructions on setting quantities, priority levels, and destinations.'
  },
  {
    pathPattern: /^\/operations\/priorities\/edit/,
    defaultSopId: 'sop-updating-priority-progress',
    recommendedSopIds: ['sop-updating-priority-progress', 'sop-cancelling-priority', 'sop-setting-priority-levels'],
    contextTitle: 'Editing Priorities',
    contextDescription: 'Guidelines on updating target values or cancelling active priorities.'
  },
  {
    pathPattern: /^\/operations\/priorities/,
    defaultSopId: 'sop-understanding-priorities',
    recommendedSopIds: ['sop-understanding-priorities', 'sop-publishing-priority', 'sop-creating-priority', 'sop-missing-priorities'],
    contextTitle: 'Operational Priorities',
    contextDescription: 'Master creating, filtering, publishing, and managing floor priorities.'
  },
  {
    pathPattern: /^\/operations\/warehouse/,
    defaultSopId: 'sop-updating-priority-progress',
    recommendedSopIds: ['sop-updating-priority-progress', 'sop-completing-priority', 'sop-understanding-priorities'],
    contextTitle: 'Warehouse Execution',
    contextDescription: 'How operators log picks, update staged quantities, and mark tasks complete.'
  },
  {
    pathPattern: /^\/operations\/exceptions/,
    defaultSopId: 'sop-investigating-stock-discrepancies',
    recommendedSopIds: ['sop-investigating-stock-discrepancies', 'sop-missing-products', 'sop-common-problems'],
    contextTitle: 'Exception Centre',
    contextDescription: 'Diagnose and resolve inventory anomalies, deficits, and rule breaches.'
  },
  {
    pathPattern: /^\/operations\/announcements/,
    defaultSopId: 'sop-tv-display-content',
    recommendedSopIds: ['sop-tv-display-content', 'sop-operational-displays', 'sop-welcome'],
    contextTitle: 'Announcements & Broadcasts',
    contextDescription: 'Publish site-wide announcements and scrolling banners to floor screens.'
  },
  {
    pathPattern: /^\/planning\/recommendations/,
    defaultSopId: 'sop-understanding-recommendations',
    recommendedSopIds: ['sop-understanding-recommendations', 'sop-reviewing-recommendations', 'sop-converting-recommendation'],
    contextTitle: 'Recommendation Workspace',
    contextDescription: 'Review algorithmic planning suggestions and convert them into live priorities.'
  },
  {
    pathPattern: /^\/planning\/rules/,
    defaultSopId: 'sop-understanding-planning-rules',
    recommendedSopIds: ['sop-understanding-planning-rules', 'sop-creating-planning-rule', 'sop-min-target-max-quantities'],
    contextTitle: 'Product Planning Rules',
    contextDescription: 'Configure stock bands (Min, Target, Max) and automated action policies.'
  },
  {
    pathPattern: /^\/planning\/northfleet-sto/,
    defaultSopId: 'sop-understanding-recommendations',
    recommendedSopIds: ['sop-understanding-recommendations', 'sop-converting-recommendation', 'sop-destinations-config'],
    contextTitle: 'Northfleet STO Requirements',
    contextDescription: 'Review stock transfer order requirements and destination allocations.'
  },
  {
    pathPattern: /^\/planning\/production/,
    defaultSopId: 'sop-production-planning',
    recommendedSopIds: ['sop-production-planning', 'sop-importing-production-plan', 'sop-troubleshooting-production-imports'],
    contextTitle: 'Production Planning',
    contextDescription: 'Track factory schedules, line yields, shift plans, and import spreadsheets.'
  },
  {
    pathPattern: /^\/planning\/promotions/,
    defaultSopId: 'sop-understanding-planning-rules',
    recommendedSopIds: ['sop-understanding-planning-rules', 'sop-min-target-max-quantities', 'sop-creating-planning-rule'],
    contextTitle: 'Promotions Management',
    contextDescription: 'Manage promotional volume surges and temporary planning rule adjustments.'
  },
  {
    pathPattern: /^\/inventory\/products/,
    defaultSopId: 'sop-products-config',
    recommendedSopIds: ['sop-products-config', 'sop-product-categories-config', 'sop-missing-products'],
    contextTitle: 'Products Master',
    contextDescription: 'Maintain SKUs, descriptions, cases per pallet, and product categories.'
  },
  {
    pathPattern: /^\/inventory\/balances/,
    defaultSopId: 'sop-viewing-inventory',
    recommendedSopIds: ['sop-viewing-inventory', 'sop-understanding-stock-quantities', 'sop-investigating-stock-discrepancies'],
    contextTitle: 'Inventory Balances',
    contextDescription: 'Search stock on hand, inspect location breakdowns, and post adjustments.'
  },
  {
    pathPattern: /^\/inventory\/locations/,
    defaultSopId: 'sop-locations-config',
    recommendedSopIds: ['sop-locations-config', 'sop-storage-areas-config', 'sop-viewing-inventory'],
    contextTitle: 'Storage Locations',
    contextDescription: 'Configure warehouse storage bays, aisles, and staging racks.'
  },
  {
    pathPattern: /^\/inventory\/movements/,
    defaultSopId: 'sop-inventory-movements',
    recommendedSopIds: ['sop-inventory-movements', 'sop-investigating-stock-discrepancies', 'sop-viewing-inventory'],
    contextTitle: 'Inventory Movements',
    contextDescription: 'Audit the chronological ledger of all stock adjustments and transfers.'
  },
  {
    pathPattern: /^\/reports\//,
    defaultSopId: 'sop-understanding-priority-history',
    recommendedSopIds: ['sop-understanding-priority-history', 'sop-kpi-reports', 'sop-navigation'],
    contextTitle: 'History & Reports',
    contextDescription: 'Analyze historical execution velocity, KPIs, and generate reports.'
  },
  {
    pathPattern: /^\/admin\/site-settings/,
    defaultSopId: 'sop-managing-sites',
    recommendedSopIds: ['sop-managing-sites', 'sop-site-onboarding', 'sop-tenant-site-concepts'],
    contextTitle: 'Site Settings',
    contextDescription: 'Configure facility timezones, default units, and operating parameters.'
  },
  {
    pathPattern: /^\/admin\/configuration/,
    defaultSopId: 'sop-products-config',
    recommendedSopIds: ['sop-products-config', 'sop-action-types-config', 'sop-priority-levels-config', 'sop-destinations-config'],
    contextTitle: 'Master Configuration',
    contextDescription: 'Manage categories, UoMs, destinations, action types, and priority levels.'
  },
  {
    pathPattern: /^\/admin\/overview/,
    defaultSopId: 'sop-managing-users',
    recommendedSopIds: ['sop-managing-users', 'sop-user-roles', 'sop-site-access'],
    contextTitle: 'User & Tenant Administration',
    contextDescription: 'Provision user accounts, assign roles, and grant site permissions.'
  },
  {
    pathPattern: /^\/admin\/audit-log/,
    defaultSopId: 'sop-managing-users',
    recommendedSopIds: ['sop-managing-users', 'sop-tenant-site-concepts', 'sop-understanding-system-errors'],
    contextTitle: 'Security Audit Log',
    contextDescription: 'Inspect administrative actions, user logins, and configuration changes.'
  },
  {
    pathPattern: /^\/admin\/data-utilities/,
    defaultSopId: 'sop-import-errors',
    recommendedSopIds: ['sop-import-errors', 'sop-troubleshooting-production-imports', 'sop-common-problems'],
    contextTitle: 'Data Utilities',
    contextDescription: 'Perform bulk imports, clean stale test data, and manage seeds.'
  },
  {
    pathPattern: /^\/tv-dashboard|^\/operations-display/,
    defaultSopId: 'sop-operational-displays',
    recommendedSopIds: ['sop-operational-displays', 'sop-tv-display-content', 'sop-display-troubleshooting'],
    contextTitle: 'TV Dashboard Display',
    contextDescription: 'Manage high-visibility operational boards, screen layouts, and live ticker.'
  },
  {
    pathPattern: /^\/learning/,
    defaultSopId: 'sop-using-help-centre',
    recommendedSopIds: ['sop-using-help-centre', 'sop-welcome', 'sop-understanding-roles'],
    contextTitle: 'Learning & SOP Centre',
    contextDescription: 'Explore the full catalog of standard operating procedures and track progress.'
  }
];

export function getContextualRecommendation(currentPath: string): RouteSopRecommendation {
  const match = ROUTE_SOP_MAPPINGS.find(mapping => {
    if (mapping.exactPath && mapping.exactPath === currentPath) return true;
    return mapping.pathPattern.test(currentPath);
  });

  if (match) return match;

  return {
    pathPattern: /.*/,
    defaultSopId: 'sop-welcome',
    recommendedSopIds: ['sop-welcome', 'sop-navigation', 'sop-using-help-centre', 'sop-common-problems'],
    contextTitle: 'OVMS Operations Guide',
    contextDescription: 'General operating guidance and standard procedures.'
  };
}
