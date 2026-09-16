import { SopDocument, SopCategoryMeta } from '../../../types/learning';
import { UserRole } from '../../../types/auth';

const ALL_ROLES: UserRole[] = [
  'PLATFORM_SUPERUSER',
  'TENANT_ADMIN',
  'PLANNER',
  'WAREHOUSE_OPERATOR',
  'VIEWER',
  'DISPLAY'
];

export const SOP_CATEGORIES: SopCategoryMeta[] = [
  {
    id: 'GETTING_STARTED',
    title: 'Getting Started',
    description: 'Essential orientation, navigation, login, and fundamentals for all OVMS users.',
    iconName: 'Compass',
    colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  },
  {
    id: 'PRIORITIES',
    title: 'Priorities',
    description: 'Create, publish, execute, track, and complete operational priorities in the warehouse.',
    iconName: 'Boxes',
    colorClass: 'text-brand-400 bg-brand-500/10 border-brand-500/20'
  },
  {
    id: 'INVENTORY',
    title: 'Inventory',
    description: 'Monitor stock on hand, storage balances, movements, and reconcile discrepancies.',
    iconName: 'Database',
    colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  },
  {
    id: 'PLANNING',
    title: 'Planning',
    description: 'Rules, thresholds (Min/Target/Max), recommendation engine, and promotion ramps.',
    iconName: 'Target',
    colorClass: 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  },
  {
    id: 'PRODUCTION',
    title: 'Production',
    description: 'Manage production runs, lines, shift plans, schedules, and spreadsheet imports.',
    iconName: 'Factory',
    colorClass: 'text-blue-400 bg-blue-500/10 border-blue-500/20'
  },
  {
    id: 'CONFIGURATION',
    title: 'Configuration',
    description: 'Master data for products, categories, units of measure, lines, and destinations.',
    iconName: 'Sliders',
    colorClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
  },
  {
    id: 'ADMINISTRATION',
    title: 'Administration',
    description: 'User access, permissions, tenant administration, site onboarding, and audit logs.',
    iconName: 'ShieldCheck',
    colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
  },
  {
    id: 'DISPLAYS',
    title: 'Displays',
    description: 'High-visibility operations boards, TV screens, layout controls, and display sync.',
    iconName: 'MonitorPlay',
    colorClass: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
  },
  {
    id: 'TROUBLESHOOTING',
    title: 'Troubleshooting',
    description: 'Root cause analysis, resolution guides, and common system fault remedies.',
    iconName: 'LifeBuoy',
    colorClass: 'text-orange-400 bg-orange-500/10 border-orange-500/20'
  }
];

export const SEED_SOPS: SopDocument[] = [
  // ==========================================
  // 1. GETTING STARTED
  // ==========================================
  {
    id: 'sop-welcome',
    title: 'Welcome to OVMS',
    slug: 'welcome-to-ovms',
    shortDescription: 'Overview of the Operations Visual Management System and its core capabilities.',
    fullDescription: 'An introduction to OVMS designed to help team members understand how warehouse planning, inventory telemetry, and real-time execution connect seamlessly.',
    category: 'GETTING_STARTED',
    module: 'Core',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'OVMS Operations Team',
    keywords: ['welcome', 'overview', 'introduction', 'basics', 'system'],
    tips: ['Keep the in-app Help panel open while performing tasks for step-by-step guidance.'],
    relatedSopIds: ['sop-signing-in', 'sop-navigation', 'sop-understanding-roles', 'sop-using-help-centre'],
    steps: [
      {
        stepNumber: 1,
        title: 'Understand the Purpose of OVMS',
        instruction: 'OVMS bridges supply planning and warehouse floor execution by turning live inventory data into actionable priority tasks for the operational team.',
        tip: 'Check the Operational Overview page daily for immediate system health metrics.',
        actionUrl: '/',
        actionLabel: 'Go to Operational Overview'
      },
      {
        stepNumber: 2,
        title: 'Identify the Key Functional Modules',
        instruction: 'Explore the 4 primary modules: Planning (recommendations & rules), Operations (priorities & execution), Inventory (stock on hand), and History & Reports.',
        actionUrl: '/operations/priorities',
        actionLabel: 'Explore Operational Priorities'
      },
      {
        stepNumber: 3,
        title: 'Access Persistent Help Anytime',
        instruction: 'Click the Help button in the top navigation bar or press "?" on your keyboard to open contextual instructions at any time without leaving your page.',
        tip: 'The Help drawer stays open as you navigate, providing live guidance.'
      }
    ]
  },
  {
    id: 'sop-signing-in',
    title: 'Signing In to OVMS',
    slug: 'signing-in',
    shortDescription: 'How to authenticate, enter your credentials, and handle initial password setups.',
    fullDescription: 'Step-by-step guide for logging into your tenant environment, security validation, and first-time password resets.',
    category: 'GETTING_STARTED',
    module: 'Auth',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 2,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Security & Access Admin',
    keywords: ['login', 'sign in', 'password', 'credentials', 'security'],
    relatedSopIds: ['sop-welcome', 'sop-login-problems', 'sop-understanding-roles'],
    troubleshooting: [
      {
        problem: 'Invalid login or account locked',
        possibleCauses: ['Typo in email address', 'Account has exceeded maximum failed login attempts (5)', 'Password has expired'],
        solutions: ['Double-check email spelling', 'Wait 15 minutes for lock window to clear or contact your Tenant Administrator'],
        relatedSopIds: ['sop-login-problems']
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Navigate to the Login Screen',
        instruction: 'Open your browser and navigate to the OVMS URL. If unauthenticated, you will automatically be directed to the Sign In portal.'
      },
      {
        stepNumber: 2,
        title: 'Enter Email and Password',
        instruction: 'Provide your assigned work email and password. Click "Sign In" to establish a secure authenticated session.'
      },
      {
        stepNumber: 3,
        title: 'Update Temporary Password (if prompted)',
        instruction: 'If logging in for the first time, provide a new strong password (minimum 8 characters) to activate your account.'
      }
    ]
  },
  {
    id: 'sop-navigation',
    title: 'OVMS Navigation & Application Shell',
    slug: 'ovms-navigation',
    shortDescription: 'Master the layout, sidebar menu, header status bars, and quick navigation.',
    fullDescription: 'Learn how to navigate across different sections of OVMS, read system freshness indicators, and switch between sites smoothly.',
    category: 'GETTING_STARTED',
    module: 'Core',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'OVMS Operations Team',
    keywords: ['navigation', 'sidebar', 'header', 'menu', 'search'],
    relatedSopIds: ['sop-welcome', 'sop-selecting-site', 'sop-using-help-centre'],
    steps: [
      {
        stepNumber: 1,
        title: 'Use the Left Sidebar',
        instruction: 'Access Overview, Planning, Operations, Inventory, Reports, and Administration using the grouped menu links on the left.'
      },
      {
        stepNumber: 2,
        title: 'Monitor Header Information',
        instruction: 'The header displays your user profile, assigned role badge, active tenant ID, Data Freshness status card, and active Site Selector.'
      },
      {
        stepNumber: 3,
        title: 'Recognize Data Freshness Indicators',
        instruction: 'Hover over the Data Freshness container in the header to view last sync times for Inventory Balances, Production Plans, and Planning Rules.'
      }
    ]
  },
  {
    id: 'sop-understanding-roles',
    title: 'Understanding Your User Role & Permissions',
    slug: 'understanding-your-role',
    shortDescription: 'Learn what permissions each OVMS role grants and what features you can access.',
    fullDescription: 'Detailed explanation of Superuser, Tenant Admin, Planner, Warehouse Operator, Viewer, and Display Screen roles.',
    category: 'GETTING_STARTED',
    module: 'Administration',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Security Admin',
    keywords: ['role', 'permission', 'access', 'admin', 'planner', 'operator'],
    relatedSopIds: ['sop-managing-users', 'sop-user-roles'],
    steps: [
      {
        stepNumber: 1,
        title: 'Identify Your Assigned Role',
        instruction: 'Check your role pill in the top header. Common roles include PLANNER, WAREHOUSE_OPERATOR, and TENANT_ADMIN.'
      },
      {
        stepNumber: 2,
        title: 'Role Capabilities Matrix',
        instruction: 'Planners configure rules and generate priorities. Warehouse Operators execute tasks. Tenant Admins manage users, master data, and site parameters.'
      },
      {
        stepNumber: 3,
        title: 'Request Permission Changes',
        instruction: 'If you need access to additional features, contact your system administrator to update your user profile in the Administration portal.'
      }
    ]
  },
  {
    id: 'sop-selecting-site',
    title: 'Selecting and Changing Operational Site',
    slug: 'selecting-changing-site',
    shortDescription: 'How to switch between assigned production sites and warehouses.',
    fullDescription: 'Instructions for multi-site users on selecting their active facility to view scoped inventory, recommendations, and execution queues.',
    category: 'GETTING_STARTED',
    module: 'Core',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 2,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Operations Admin',
    keywords: ['site', 'location', 'facility', 'switch site', 'multi-site'],
    relatedSopIds: ['sop-navigation', 'sop-site-access', 'sop-managing-sites'],
    steps: [
      {
        stepNumber: 1,
        title: 'Locate the Site Dropdown in the Header',
        instruction: 'Look at the top-right corner of the application header to find the Building icon and active site name.'
      },
      {
        stepNumber: 2,
        title: 'Select Your Desired Facility',
        instruction: 'Click the dropdown and choose the site you wish to manage. The application immediately updates all dashboards to reflect data for the selected location.'
      }
    ]
  },
  {
    id: 'sop-using-help-centre',
    title: 'Using the Help & Learning Centre',
    slug: 'using-the-help-centre',
    shortDescription: 'How to use the slide-out Help panel, search SOPs, and track your learning progress.',
    fullDescription: 'Learn how to leverage contextual guidance while performing operational duties, save favourite procedures, and review new features.',
    category: 'GETTING_STARTED',
    module: 'Learning',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'OVMS Learning Team',
    keywords: ['help', 'sop', 'learning', 'slideout', 'guide', 'tutorial'],
    relatedSopIds: ['sop-welcome', 'sop-navigation'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open the Right-Side Help Panel',
        instruction: 'Click the Help (?) button in the header or on any action card to slide open the guidance drawer.'
      },
      {
        stepNumber: 2,
        title: 'Search & Navigate Contextual SOPs',
        instruction: 'The Help panel automatically recommends instructions relevant to your current screen. You can also search all SOPs across the entire system.'
      },
      {
        stepNumber: 3,
        title: 'Track Completion and Bookmark Favourites',
        instruction: 'Mark procedures as completed when finished and click the bookmark star to save frequently referenced guides to your personal quick-access list.'
      }
    ]
  },

  // ==========================================
  // 2. PRIORITIES
  // ==========================================
  {
    id: 'sop-understanding-priorities',
    title: 'Understanding Operational Priorities',
    slug: 'understanding-priorities',
    shortDescription: 'Core concepts behind warehouse priorities, urgency weighting, and execution flow.',
    fullDescription: 'Understand how priorities direct physical stock movements to fulfill customer orders, clear bottleneck lines, and satisfy transfer demands.',
    category: 'PRIORITIES',
    module: 'Priorities',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR', 'VIEWER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Operations Planning Team',
    keywords: ['priority', 'task', 'workflow', 'status', 'urgency'],
    relatedSopIds: ['sop-creating-priority', 'sop-setting-priority-levels', 'sop-publishing-priority'],
    steps: [
      {
        stepNumber: 1,
        title: 'Review the Priority Lifecycle',
        instruction: 'A priority progresses from DRAFT → PUBLISHED → IN_PROGRESS → COMPLETED (or CANCELLED).'
      },
      {
        stepNumber: 2,
        title: 'Understand Target Quantities & Units',
        instruction: 'Each priority specifies a required SKU, quantity in pallets or cases, destination facility, and optional source location.'
      },
      {
        stepNumber: 3,
        title: 'Check Priority Expiry and Timers',
        instruction: 'Priorities can run "Until Switched Off" or carry a planned expiration timestamp for scheduled operational windows.'
      }
    ]
  },
  {
    id: 'sop-creating-priority',
    title: 'Creating an Operational Priority',
    slug: 'creating-a-priority',
    shortDescription: 'Step-by-step instructions for creating a manual or recommended warehouse priority.',
    fullDescription: 'Learn how to configure product code, target quantity, destination, priority level, and operational instructions when authoring a new priority.',
    category: 'PRIORITIES',
    module: 'Priorities',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 5,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Planning Lead',
    keywords: ['create priority', 'new task', 'destination', 'quantity', 'manual priority'],
    tips: ['You can also convert algorithmic recommendations into priorities with a single click from the Recommendation Workspace.'],
    relatedSopIds: ['sop-setting-priority-levels', 'sop-publishing-priority', 'sop-converting-recommendation'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Create Priority Page',
        instruction: 'Navigate to Operations → Operational Priorities and click "+ Create Priority" in the top right.',
        actionUrl: '/operations/priorities/new',
        actionLabel: 'Open Create Priority'
      },
      {
        stepNumber: 2,
        title: 'Select Product and Quantity',
        instruction: 'Use the product lookup dropdown to select the target SKU. Enter the required quantity to transfer or stage.'
      },
      {
        stepNumber: 3,
        title: 'Assign Priority Level & Destination',
        instruction: 'Choose the appropriate Priority Level (e.g. Critical, High, Normal) and target destination facility.'
      },
      {
        stepNumber: 4,
        title: 'Save as Draft or Publish Immediately',
        instruction: 'Click "Save Draft" to review later, or "Publish Priority" to immediately push the task to the Warehouse Execution queue and TV Dashboard.'
      }
    ]
  },
  {
    id: 'sop-setting-priority-levels',
    title: 'Setting Priority Levels & Weights',
    slug: 'setting-priority-levels',
    shortDescription: 'How priority ranks, urgency weights, and color coding dictate warehouse execution order.',
    fullDescription: 'Understand how priority level settings determine task ranking on warehouse mobile tablets and high-visibility TV displays.',
    category: 'PRIORITIES',
    module: 'Priorities',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Operations Planning Team',
    keywords: ['priority levels', 'ranking', 'weights', 'critical', 'urgent'],
    relatedSopIds: ['sop-creating-priority', 'sop-priority-levels-config'],
    steps: [
      {
        stepNumber: 1,
        title: 'Identify Priority Levels',
        instruction: 'Standard tiers range from CRITICAL (Level 1, Red), HIGH (Level 2, Amber), NORMAL (Level 3, Blue) to LOW (Level 4, Slate).'
      },
      {
        stepNumber: 2,
        title: 'Understand Sort Order & Weighting',
        instruction: 'Tasks with higher priority weights sort to the top of operator pick lists and TV dashboard displays automatically.'
      }
    ]
  },
  {
    id: 'sop-publishing-priority',
    title: 'Publishing a Priority to the Floor',
    slug: 'publishing-a-priority',
    shortDescription: 'Activating a draft priority so warehouse operators can start picking and staging.',
    fullDescription: 'Guidelines on publishing priorities, broadcasting alerts, and verifying visibility on warehouse execution screens.',
    category: 'PRIORITIES',
    module: 'Priorities',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Operations Lead',
    keywords: ['publish', 'activate', 'broadcast', 'live task'],
    relatedSopIds: ['sop-creating-priority', 'sop-updating-priority-progress'],
    steps: [
      {
        stepNumber: 1,
        title: 'Review the Draft Priority',
        instruction: 'Confirm product SKU, batch requirements, quantity, and destination on the Operational Priorities list.'
      },
      {
        stepNumber: 2,
        title: 'Click Publish',
        instruction: 'Click the "Publish" button on the priority row. The status changes to ACTIVE/PUBLISHED.'
      }
    ]
  },
  {
    id: 'sop-updating-priority-progress',
    title: 'Updating Priority Progress',
    slug: 'updating-priority-progress',
    shortDescription: 'How warehouse operators log picked quantities, mark milestones, and update status.',
    fullDescription: 'Procedures for warehouse team members executing priorities, reporting staged quantities, and updating progress percentages.',
    category: 'PRIORITIES',
    module: 'Operations',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Warehouse Supervisor',
    keywords: ['progress', 'warehouse execution', 'picked', 'staged', 'operator'],
    relatedSopIds: ['sop-completing-priority', 'sop-cancelling-priority'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Warehouse Execution Screen',
        instruction: 'Navigate to Operations → Warehouse Execution to view all active tasks assigned to your shift.',
        actionUrl: '/operations/warehouse',
        actionLabel: 'Open Warehouse Execution'
      },
      {
        stepNumber: 2,
        title: 'Update Completed Quantity',
        instruction: 'Click "Update Progress", enter the quantity of pallets/cases picked and staged, and save.'
      }
    ]
  },
  {
    id: 'sop-completing-priority',
    title: 'Completing an Operational Priority',
    slug: 'completing-a-priority',
    shortDescription: 'Finalizing a fulfilled priority and archiving it to the operational history ledger.',
    fullDescription: 'Steps to verify full fulfillment, close out completed priorities, and log final quantities into historical records.',
    category: 'PRIORITIES',
    module: 'Operations',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 2,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Warehouse Supervisor',
    keywords: ['complete', 'finish', 'fulfill', 'close task'],
    relatedSopIds: ['sop-updating-priority-progress', 'sop-understanding-priority-history'],
    steps: [
      {
        stepNumber: 1,
        title: 'Confirm 100% Quantity Fulfillment',
        instruction: 'Ensure all requested stock has been loaded or staged at the designated destination bay.'
      },
      {
        stepNumber: 2,
        title: 'Mark as Completed',
        instruction: 'Click "Complete Priority". The priority disappears from active picking queues and moves to History.'
      }
    ]
  },
  {
    id: 'sop-cancelling-priority',
    title: 'Cancelling a Priority',
    slug: 'cancelling-a-priority',
    shortDescription: 'How to cancel an unnecessary or obsolete priority with mandatory reason logging.',
    fullDescription: 'Safety guidelines and audit trail requirements when cancelling draft or in-progress operational priorities.',
    category: 'PRIORITIES',
    module: 'Priorities',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Planning Lead',
    keywords: ['cancel priority', 'abort', 'reason code', 'audit'],
    relatedSopIds: ['sop-understanding-priorities', 'sop-understanding-priority-history'],
    steps: [
      {
        stepNumber: 1,
        title: 'Select Priority to Cancel',
        instruction: 'From the Operational Priorities table, click the Cancel (X) icon on the targeted priority.'
      },
      {
        stepNumber: 2,
        title: 'Provide Reason for Cancellation',
        instruction: 'Select or type a clear cancellation reason (e.g. "Order modified by customer", "Replaced by recommendation").'
      }
    ]
  },
  {
    id: 'sop-understanding-priority-history',
    title: 'Understanding Priority History & Audit Trails',
    slug: 'understanding-priority-history',
    shortDescription: 'Review completed, cancelled, and expired priorities with full user attribution.',
    fullDescription: 'How to query historical priorities, filter by date ranges, inspect execution durations, and audit operator actions.',
    category: 'PRIORITIES',
    module: 'Reports',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'VIEWER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Compliance Lead',
    keywords: ['history', 'audit log', 'past priorities', 'reporting'],
    relatedSopIds: ['sop-completing-priority', 'sop-kpi-reports'],
    steps: [
      {
        stepNumber: 1,
        title: 'Navigate to Operational History',
        instruction: 'Go to History & Reports → Operational History to view all archived priorities.',
        actionUrl: '/reports/history',
        actionLabel: 'View Operational History'
      },
      {
        stepNumber: 2,
        title: 'Apply Date and Status Filters',
        instruction: 'Filter by completed date, product code, destination, or cancellation status.'
      }
    ]
  },

  // ==========================================
  // 3. INVENTORY
  // ==========================================
  {
    id: 'sop-understanding-inventory',
    title: 'Understanding Inventory & Telemetry',
    slug: 'understanding-inventory',
    shortDescription: 'How OVMS models products, stock on hand, storage locations, and pallet balances.',
    fullDescription: 'Comprehensive overview of stock tracking across warehouse locations, available units of measure, and data synchronization.',
    category: 'INVENTORY',
    module: 'Inventory',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Inventory Manager',
    keywords: ['inventory', 'stock', 'qoh', 'balances', 'skus'],
    relatedSopIds: ['sop-viewing-inventory', 'sop-understanding-stock-quantities', 'sop-investigating-stock-discrepancies'],
    steps: [
      {
        stepNumber: 1,
        title: 'Explore Master Products',
        instruction: 'Products represent items managed at the site, with defined cases per pallet, units per case, and category codes.',
        actionUrl: '/inventory/products',
        actionLabel: 'View Products Master'
      },
      {
        stepNumber: 2,
        title: 'Understand Inventory Balances',
        instruction: 'Inventory Balances represent current stock on hand (QOH) at specific physical locations in the facility.'
      }
    ]
  },
  {
    id: 'sop-viewing-inventory',
    title: 'Viewing Inventory Balances',
    slug: 'viewing-inventory',
    shortDescription: 'How to search, filter, and inspect product stock on hand and location breakdowns.',
    fullDescription: 'Learn how to look up product availability, search by SKU or description, and view detailed location-level breakdown modals.',
    category: 'INVENTORY',
    module: 'Inventory',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR', 'VIEWER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Inventory Analyst',
    keywords: ['search stock', 'qoh', 'view inventory', 'location breakdown'],
    relatedSopIds: ['sop-understanding-inventory', 'sop-understanding-stock-quantities'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Inventory Balances Page',
        instruction: 'Navigate to Inventory → Inventory Balances in the sidebar.',
        actionUrl: '/inventory/balances',
        actionLabel: 'Open Inventory Balances'
      },
      {
        stepNumber: 2,
        title: 'Search by Product Code or Description',
        instruction: 'Type into the search bar to locate specific SKUs and verify total quantity on hand.'
      },
      {
        stepNumber: 3,
        title: 'Click a Product to View Location Breakdown',
        instruction: 'Click any row to open the Inventory Detail Modal, showing exact quantities in every storage bay.'
      }
    ]
  },
  {
    id: 'sop-understanding-stock-quantities',
    title: 'Understanding Stock Quantities & UoM',
    slug: 'understanding-stock-quantities',
    shortDescription: 'Conversion rules between Pallets, Cases, and Each units of measure.',
    fullDescription: 'How OVMS handles conversions across cases per pallet, units per case, and decimal precision when calculating thresholds.',
    category: 'INVENTORY',
    module: 'Inventory',
    applicableRoles: ALL_ROLES,
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Inventory Team',
    keywords: ['uom', 'cases per pallet', 'units', 'conversions'],
    relatedSopIds: ['sop-units-of-measure-config', 'sop-products-config'],
    steps: [
      {
        stepNumber: 1,
        title: 'Check Product Master UoM Settings',
        instruction: 'Verify default unit of measure codes (e.g. CS for cases, PAL for pallets) in the product configuration.'
      },
      {
        stepNumber: 2,
        title: 'Review Cases Per Pallet Multipliers',
        instruction: 'Planning calculations convert quantities to standard base units using the configured cases-per-pallet values.'
      }
    ]
  },
  {
    id: 'sop-inventory-movements',
    title: 'Recording & Reviewing Inventory Movements',
    slug: 'inventory-movements',
    shortDescription: 'Tracking stock adjustments, transfers, and corrections in the immutable ledger.',
    fullDescription: 'Procedures for logging stock transfers between bays, adjustments, write-offs, and reviewing movement audit histories.',
    category: 'INVENTORY',
    module: 'Inventory',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Warehouse Lead',
    keywords: ['movements', 'ledger', 'adjustments', 'transfer', 'stock write-off'],
    relatedSopIds: ['sop-viewing-inventory', 'sop-investigating-stock-discrepancies'],
    steps: [
      {
        stepNumber: 1,
        title: 'Navigate to Inventory Movements',
        instruction: 'Go to Inventory → Inventory Movements to view the audit log of all stock changes.',
        actionUrl: '/inventory/movements',
        actionLabel: 'View Movements Ledger'
      },
      {
        stepNumber: 2,
        title: 'Perform a Stock Adjustment',
        instruction: 'On Inventory Balances, click "+ Stock Adjustment" to record an increase, decrease, or inter-bay transfer.'
      }
    ]
  },
  {
    id: 'sop-investigating-stock-discrepancies',
    title: 'Investigating Stock Discrepancies',
    slug: 'investigating-stock-discrepancies',
    shortDescription: 'Diagnosing differences between physical warehouse counts and system balances.',
    fullDescription: 'Troubleshooting steps for resolving stock discrepancies, missing product mappings, and reconciling paste imports.',
    category: 'INVENTORY',
    module: 'Inventory',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'ADVANCED',
    estimatedDurationMinutes: 5,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Inventory Control Lead',
    keywords: ['discrepancy', 'stock mismatch', 'reconciliation', 'cycle count'],
    relatedSopIds: ['sop-inventory-movements', 'sop-viewing-inventory', 'sop-missing-products'],
    steps: [
      {
        stepNumber: 1,
        title: 'Review Exception Centre for Stock Alerts',
        instruction: 'Check Operations → Exception Centre for inventory mismatch and negative stock warnings.',
        actionUrl: '/operations/exceptions',
        actionLabel: 'Check Exception Centre'
      },
      {
        stepNumber: 2,
        title: 'Audit Historical Movements',
        instruction: 'Inspect the movement ledger for the SKU to identify recent adjustments or erroneous transfers.'
      },
      {
        stepNumber: 3,
        title: 'Perform Physical Count and Correction',
        instruction: 'Carry out a cycle count in the physical location and post an adjustment with a descriptive reference note.'
      }
    ]
  },

  // ==========================================
  // 4. PLANNING
  // ==========================================
  {
    id: 'sop-understanding-planning-rules',
    title: 'Understanding Planning Rules',
    slug: 'understanding-planning-rules',
    shortDescription: 'How planning thresholds, Min/Target/Max levels, and action types govern recommendations.',
    fullDescription: 'Deep dive into the core planning rules that power the OVMS decision engine, retention policies, and automated suggestions.',
    category: 'PLANNING',
    module: 'Planning',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'VIEWER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 5,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Head of Supply Planning',
    keywords: ['planning rules', 'thresholds', 'min', 'target', 'max', 'decision engine'],
    relatedSopIds: ['sop-creating-planning-rule', 'sop-min-target-max-quantities', 'sop-understanding-recommendations'],
    steps: [
      {
        stepNumber: 1,
        title: 'View Product Planning Rules',
        instruction: 'Open Planning → Product Planning Rules to inspect rules active for your site.',
        actionUrl: '/planning/rules',
        actionLabel: 'View Planning Rules'
      },
      {
        stepNumber: 2,
        title: 'Understand Rule Components',
        instruction: 'Rules define Minimum, Target, Maximum stock bands, Default Action Types (e.g. Hold, Release), and Destinations.'
      }
    ]
  },
  {
    id: 'sop-creating-planning-rule',
    title: 'Creating and Editing a Planning Rule',
    slug: 'creating-a-planning-rule',
    shortDescription: 'Step-by-step instructions for establishing product planning parameters.',
    fullDescription: 'Configure target thresholds, minimum buffer stock, maximum storage caps, and priority actions for specific products.',
    category: 'PLANNING',
    module: 'Planning',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Supply Planning Lead',
    keywords: ['create rule', 'edit threshold', 'planning parameters'],
    relatedSopIds: ['sop-understanding-planning-rules', 'sop-min-target-max-quantities'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Planning Rules Page',
        instruction: 'Navigate to Planning → Product Planning Rules and click "+ Create Rule".',
        actionUrl: '/planning/rules',
        actionLabel: 'Open Planning Rules'
      },
      {
        stepNumber: 2,
        title: 'Select Target Product and Levels',
        instruction: 'Select the SKU, set Minimum Quantity, Target Quantity, and Maximum Quantity.'
      },
      {
        stepNumber: 3,
        title: 'Set Default Action & Destination',
        instruction: 'Select the default Action Type and target destination, then click Save Rule.'
      }
    ]
  },
  {
    id: 'sop-min-target-max-quantities',
    title: 'Minimum, Target, and Maximum Quantities',
    slug: 'minimum-target-maximum-quantities',
    shortDescription: 'The mathematical logic of stock bands and how breaches trigger recommendations.',
    fullDescription: 'Learn how the decision engine computes shortfall, available to release, and storage headroom based on inventory bands.',
    category: 'PLANNING',
    module: 'Planning',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Supply Planning Team',
    keywords: ['min', 'target', 'max', 'bands', 'shortfall', 'headroom'],
    relatedSopIds: ['sop-understanding-planning-rules', 'sop-understanding-recommendations'],
    steps: [
      {
        stepNumber: 1,
        title: 'Minimum Level (Deficit Trigger)',
        instruction: 'When stock drops below Minimum, the engine flags a CRITICAL deficit recommending immediate production or replenishment.'
      },
      {
        stepNumber: 2,
        title: 'Target Level (Desired Equilibrium)',
        instruction: 'The optimal operating stock level balancing service level requirements against warehouse holding costs.'
      },
      {
        stepNumber: 3,
        title: 'Maximum Level (Surplus Trigger)',
        instruction: 'When stock exceeds Maximum, the engine recommends releasing excess inventory to external destinations.'
      }
    ]
  },
  {
    id: 'sop-understanding-recommendations',
    title: 'Understanding Recommendations',
    slug: 'understanding-recommendations',
    shortDescription: 'How the algorithmic decision engine evaluates inventory, production, and rules.',
    fullDescription: 'Understand how recommendations are calculated in real time, explaining reason codes and urgency prioritization.',
    category: 'PLANNING',
    module: 'Planning',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'VIEWER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 5,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Planning Lead',
    keywords: ['recommendations', 'decision engine', 'reason codes', 'algorithmic planning'],
    relatedSopIds: ['sop-reviewing-recommendations', 'sop-converting-recommendation'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Recommendation Workspace',
        instruction: 'Navigate to Planning → Recommendation Workspace to view active suggestions.',
        actionUrl: '/planning/recommendations',
        actionLabel: 'Open Recommendation Workspace'
      },
      {
        stepNumber: 2,
        title: 'Inspect Recommendation Reason Codes',
        instruction: 'Look at badges such as SHORTFALL_BELOW_MIN, EXCESS_ABOVE_MAX, or PROMOTION_ACTIVE.'
      }
    ]
  },
  {
    id: 'sop-reviewing-recommendations',
    title: 'Reviewing & Evaluating Recommendations',
    slug: 'reviewing-recommendations',
    shortDescription: 'Inspecting calculation breakdowns, stock projections, and potential conflicts.',
    fullDescription: 'Detailed walkthrough on evaluating individual recommendation calculations, reviewing explanation logs, and resolving conflicts.',
    category: 'PLANNING',
    module: 'Planning',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Supply Planner',
    keywords: ['review recommendations', 'audit calculation', 'conflicts'],
    relatedSopIds: ['sop-understanding-recommendations', 'sop-converting-recommendation'],
    steps: [
      {
        stepNumber: 1,
        title: 'Filter Recommendations by Priority',
        instruction: 'Sort recommendations by priority level, category, or shortfall urgency.'
      },
      {
        stepNumber: 2,
        title: 'Open Recommendation Detail View',
        instruction: 'Click on a recommendation to inspect its complete step-by-step mathematical calculation trace.'
      }
    ]
  },
  {
    id: 'sop-converting-recommendation',
    title: 'Converting a Recommendation into a Priority',
    slug: 'converting-recommendation-to-priority',
    shortDescription: 'One-click conversion of planning suggestions into live operational tasks.',
    fullDescription: 'Learn how to accept recommendations, adjust quantities if necessary, and publish them directly to warehouse execution.',
    category: 'PLANNING',
    module: 'Planning',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Planning Lead',
    keywords: ['convert recommendation', 'create priority', 'approve suggestion'],
    relatedSopIds: ['sop-creating-priority', 'sop-reviewing-recommendations'],
    steps: [
      {
        stepNumber: 1,
        title: 'Locate Target Recommendation',
        instruction: 'On the Recommendation Workspace, find the recommendation you wish to execute.'
      },
      {
        stepNumber: 2,
        title: 'Click "Create Priority"',
        instruction: 'Click the Create Priority action button. The creation form is pre-filled with the calculated SKU, quantity, and destination.'
      },
      {
        stepNumber: 3,
        title: 'Publish to the Floor',
        instruction: 'Review the details and click Publish to push the task to the warehouse floor.'
      }
    ]
  },

  // ==========================================
  // 5. PRODUCTION
  // ==========================================
  {
    id: 'sop-production-planning',
    title: 'Production Planning Overview',
    slug: 'production-planning',
    shortDescription: 'How shift plans, line schedules, and output forecasts interface with warehouse holding.',
    fullDescription: 'Overview of production scheduling, tracking manufacturing runs across packing lines, and coordinating pallet in-feed.',
    category: 'PRODUCTION',
    module: 'Production',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'VIEWER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Production Planning Lead',
    keywords: ['production plan', 'schedule', 'packing lines', 'manufacturing'],
    relatedSopIds: ['sop-importing-production-plan', 'sop-production-events'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Production Plan',
        instruction: 'Navigate to Planning → Production Plan to view the interactive timeline grid.',
        actionUrl: '/planning/production-plan',
        actionLabel: 'Open Production Plan'
      },
      {
        stepNumber: 2,
        title: 'Inspect Shift Schedules',
        instruction: 'View scheduled runs by production line, planned shift hours, and target case outputs.'
      }
    ]
  },
  {
    id: 'sop-importing-production-plan',
    title: 'Importing a Production Plan (Excel / CSV)',
    slug: 'importing-production-plan',
    shortDescription: 'How to upload or paste daily/weekly production schedules into OVMS.',
    fullDescription: 'Step-by-step instructions for importing spreadsheets, resolving header mappings, and verifying line schedules.',
    category: 'PRODUCTION',
    module: 'Production',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 5,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Operations Systems Lead',
    keywords: ['import schedule', 'excel import', 'csv upload', 'paste plan'],
    relatedSopIds: ['sop-production-planning', 'sop-troubleshooting-production-imports'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Import Tool',
        instruction: 'On the Production Plan page, click "Import Plan" in the top action bar.'
      },
      {
        stepNumber: 2,
        title: 'Select File or Paste Data',
        instruction: 'Upload your schedule spreadsheet (.xlsx or .csv) or paste the tabular text directly into the modal.'
      },
      {
        stepNumber: 3,
        title: 'Validate and Commit',
        instruction: 'Review the validation summary for unmatched products or line codes, then click "Apply Import".'
      }
    ]
  },
  {
    id: 'sop-production-lines',
    title: 'Configuring Production Lines',
    slug: 'production-lines',
    shortDescription: 'Setting up factory production lines, changeover matrixes, and line speeds.',
    fullDescription: 'How to define manufacturing lines, changeover run rates, and assign product families to designated packing centers.',
    category: 'PRODUCTION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Configuration Lead',
    keywords: ['production lines', 'packing lines', 'manufacturing line', 'changeover'],
    relatedSopIds: ['sop-production-planning', 'sop-production-lines-config'],
    steps: [
      {
        stepNumber: 1,
        title: 'Navigate to Configuration → Production Lines',
        instruction: 'Open the Configuration portal and select the Production Lines tab.'
      },
      {
        stepNumber: 2,
        title: 'Create or Edit Line Definitions',
        instruction: 'Set Line Code, Name, Hourly Pallet Capacity, and default storage area.'
      }
    ]
  },
  {
    id: 'sop-production-events',
    title: 'Managing Production Events',
    slug: 'production-events',
    shortDescription: 'Logging line starts, stops, actual yields, and maintenance downtime.',
    fullDescription: 'Procedures for tracking live factory events, updating actual produced quantities, and flagging delays.',
    category: 'PRODUCTION',
    module: 'Production',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Production Supervisor',
    keywords: ['events', 'actual yield', 'downtime', 'line stop'],
    relatedSopIds: ['sop-production-planning', 'sop-troubleshooting-production-imports'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Production Events List',
        instruction: 'Go to Planning → Production Events to view scheduled and running runs.',
        actionUrl: '/planning/production',
        actionLabel: 'View Production Events'
      },
      {
        stepNumber: 2,
        title: 'Update Actual Quantities',
        instruction: 'Click "Update Actuals" on the active run to log pallets produced off the line.'
      }
    ]
  },
  {
    id: 'sop-troubleshooting-production-imports',
    title: 'Troubleshooting Production Imports',
    slug: 'troubleshooting-production-imports',
    shortDescription: 'Resolving unmatched product codes, date format errors, and import parsing failures.',
    fullDescription: 'Diagnostic guide for handling unrecognized header formats, invalid dates, and mapping missing product codes during import.',
    category: 'PRODUCTION',
    module: 'Production',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Systems Admin',
    keywords: ['import error', 'failed import', 'unmatched product', 'date error'],
    relatedSopIds: ['sop-importing-production-plan', 'sop-missing-products'],
    troubleshooting: [
      {
        problem: 'Unmatched product code in import file',
        possibleCauses: ['SKU does not exist in Master Data', 'Leading/trailing whitespace in spreadsheet', 'Formatting differences (e.g. dashes vs spaces)'],
        solutions: ['Use the quick-add product resolution dialog', 'Create the SKU in Products Master before re-importing'],
        relatedSopIds: ['sop-products-config']
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Inspect Validation Error Summary',
        instruction: 'Read the error message returned in the import modal highlighting the problematic row numbers.'
      },
      {
        stepNumber: 2,
        title: 'Resolve Missing Master Data',
        instruction: 'Add any new product SKUs or production lines to Master Data, then re-run the import.'
      }
    ]
  },

  // ==========================================
  // 6. CONFIGURATION
  // ==========================================
  {
    id: 'sop-products-config',
    title: 'Configuring Products Master Data',
    slug: 'products-configuration',
    shortDescription: 'Creating and managing SKUs, descriptions, pallet configurations, and categories.',
    fullDescription: 'How to maintain product records, configure cases per pallet, units per case, and assign product categories.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Master Data Admin',
    keywords: ['products', 'sku', 'master data', 'cases per pallet'],
    relatedSopIds: ['sop-product-categories-config', 'sop-units-of-measure-config'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Products Page',
        instruction: 'Navigate to Inventory → Products in the left sidebar.',
        actionUrl: '/inventory/products',
        actionLabel: 'Open Products Master'
      },
      {
        stepNumber: 2,
        title: 'Add or Edit a Product',
        instruction: 'Click "+ Add Product", enter the unique Product Code, Description, Category, and default UoM.'
      }
    ]
  },
  {
    id: 'sop-product-categories-config',
    title: 'Configuring Product Categories',
    slug: 'product-categories-configuration',
    shortDescription: 'Organizing SKUs into functional categories for filtering and aggregated reporting.',
    fullDescription: 'Learn how to create product categories, set color codes, and group related items for high-level planning.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Configuration Admin',
    keywords: ['categories', 'product groups', 'classification'],
    relatedSopIds: ['sop-products-config'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Configuration Portal',
        instruction: 'Go to Administration → Configuration and select the Product Categories tab.',
        actionUrl: '/admin/configuration',
        actionLabel: 'Open Configuration'
      },
      {
        stepNumber: 2,
        title: 'Create a New Category',
        instruction: 'Provide Category Code and Name, then assign it to active products.'
      }
    ]
  },
  {
    id: 'sop-units-of-measure-config',
    title: 'Configuring Units of Measure (UoM)',
    slug: 'units-of-measure-configuration',
    shortDescription: 'Defining measurement units (Cases, Pallets, Kg, Each) and numeric precision.',
    fullDescription: 'How to manage standard units of measure across the tenant and set appropriate rounding decimal precision.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 2,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Configuration Admin',
    keywords: ['uom', 'units of measure', 'cases', 'pallets', 'precision'],
    relatedSopIds: ['sop-products-config', 'sop-understanding-stock-quantities'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Units of Measure Tab',
        instruction: 'Under Administration → Configuration, select the Units of Measure tab.'
      },
      {
        stepNumber: 2,
        title: 'Add or Edit Unit Codes',
        instruction: 'Define the standard abbreviation (e.g. CS, PAL, KG) and decimal precision.'
      }
    ]
  },
  {
    id: 'sop-destinations-config',
    title: 'Configuring Destinations',
    slug: 'destinations-configuration',
    shortDescription: 'Managing target warehouses, customer bays, overflow stores, and transit hubs.',
    fullDescription: 'How to configure destination facilities, assign color indicators for TV boards, and set default delivery routes.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Logistics Lead',
    keywords: ['destinations', 'customer bays', 'overflow', 'shipping hubs'],
    relatedSopIds: ['sop-creating-priority', 'sop-missing-destinations'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Destinations Tab',
        instruction: 'Under Administration → Configuration, select the Destinations tab.'
      },
      {
        stepNumber: 2,
        title: 'Add a New Destination',
        instruction: 'Enter Destination Code, Name, Destination Type (Internal, Customer, Overflow), and display color.'
      }
    ]
  },
  {
    id: 'sop-action-types-config',
    title: 'Configuring Action Types',
    slug: 'action-types-configuration',
    shortDescription: 'Setting up recommendation action types (HOLD, RELEASE, REPLENISH, PRODUCE).',
    fullDescription: 'Learn how action types instruct warehouse and planning systems on what physical operation to perform when thresholds are breached.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Decision Engine Architect',
    keywords: ['action types', 'hold', 'release', 'replenish', 'produce'],
    relatedSopIds: ['sop-understanding-planning-rules', 'sop-understanding-recommendations'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Action Types Tab',
        instruction: 'Navigate to Administration → Configuration → Action Types.'
      },
      {
        stepNumber: 2,
        title: 'Configure Action Parameters',
        instruction: 'Set Action Code, Display Label, and behavior flags (e.g. holds inventory vs releases inventory).'
      }
    ]
  },
  {
    id: 'sop-priority-levels-config',
    title: 'Configuring Priority Levels',
    slug: 'priority-levels-configuration',
    shortDescription: 'Setting up urgency tiers, weights, and badge colors for operational tasks.',
    fullDescription: 'How to manage the hierarchy of priority tiers, configure sort weights, and choose high-contrast status colors.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Configuration Lead',
    keywords: ['priority levels', 'urgency', 'weights', 'tiers'],
    relatedSopIds: ['sop-setting-priority-levels', 'sop-creating-priority'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Priority Levels Tab',
        instruction: 'Under Administration → Configuration, select the Priority Levels tab.'
      },
      {
        stepNumber: 2,
        title: 'Adjust Urgency Weights',
        instruction: 'Define weight values (e.g. 100 for Critical, 50 for Normal) that govern automated ranking.'
      }
    ]
  },
  {
    id: 'sop-storage-areas-config',
    title: 'Configuring Storage Areas',
    slug: 'storage-areas-configuration',
    shortDescription: 'Defining high-level warehouse zones (Ambient, Cold Store, Overflow, Staging).',
    fullDescription: 'How to establish storage zones within a facility, set temperature constraints, and assign capacity limits.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Warehouse Logistics Admin',
    keywords: ['storage areas', 'warehouse zones', 'ambient', 'chilled', 'racking'],
    relatedSopIds: ['sop-locations-config', 'sop-viewing-inventory'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Storage Areas Tab',
        instruction: 'Under Administration → Configuration, select Storage Areas.'
      },
      {
        stepNumber: 2,
        title: 'Create Storage Zone',
        instruction: 'Specify Area Code, Name, Temperature Type, and Maximum Pallet Capacity.'
      }
    ]
  },
  {
    id: 'sop-locations-config',
    title: 'Configuring Physical Storage Locations',
    slug: 'locations-configuration',
    shortDescription: 'Managing bay, aisle, and rack coordinates within warehouse storage areas.',
    fullDescription: 'Procedures for creating specific pallet locations, barcoding coordinates, and assigning picking priorities.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Warehouse Logistics Admin',
    keywords: ['locations', 'bays', 'aisles', 'racking', 'bin'],
    relatedSopIds: ['sop-storage-areas-config', 'sop-viewing-inventory'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Storage Locations Page',
        instruction: 'Navigate to Inventory → Storage Locations in the sidebar.',
        actionUrl: '/inventory/locations',
        actionLabel: 'Open Locations'
      },
      {
        stepNumber: 2,
        title: 'Add New Location Coordinates',
        instruction: 'Enter Location Code (e.g. A-01-04), select Storage Area, and set active status.'
      }
    ]
  },
  {
    id: 'sop-production-lines-config',
    title: 'Configuring Production Lines Master Data',
    slug: 'production-lines-master-data',
    shortDescription: 'Setting line identities, shift capacities, and changeover matrices.',
    fullDescription: 'Complete guide for maintaining factory line configurations, downtime tolerances, and output ratings.',
    category: 'CONFIGURATION',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Configuration Lead',
    keywords: ['production lines', 'packing lines', 'capacities'],
    relatedSopIds: ['sop-production-lines', 'sop-production-planning'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Production Lines Tab',
        instruction: 'Under Administration → Configuration, select the Production Lines tab.'
      },
      {
        stepNumber: 2,
        title: 'Maintain Active Line Records',
        instruction: 'Review active line statuses, assign default operators, and update changeover rates.'
      }
    ]
  },

  // ==========================================
  // 7. ADMINISTRATION
  // ==========================================
  {
    id: 'sop-managing-users',
    title: 'Managing Users & Credentials',
    slug: 'managing-users',
    shortDescription: 'Creating user accounts, inviting team members, resetting passwords, and deactivating accounts.',
    fullDescription: 'Comprehensive guide for administrators to provision new accounts, enforce password policies, and manage account locks.',
    category: 'ADMINISTRATION',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Tenant Administrator',
    keywords: ['users', 'accounts', 'provisioning', 'password reset', 'lockout'],
    relatedSopIds: ['sop-user-roles', 'sop-site-access'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Admin Overview / User Management',
        instruction: 'Navigate to Administration → Admin Overview in the left sidebar.',
        actionUrl: '/admin/overview',
        actionLabel: 'Open Admin Overview'
      },
      {
        stepNumber: 2,
        title: 'Create a New User Account',
        instruction: 'Click "+ Add User", enter Email, Display Name, Job Title, and select the initial User Role.'
      },
      {
        stepNumber: 3,
        title: 'Assign Site Access',
        instruction: 'Check the boxes for all facilities the user is authorized to access.'
      }
    ]
  },
  {
    id: 'sop-user-roles',
    title: 'User Roles & Permission Boundaries',
    slug: 'user-roles-permissions',
    shortDescription: 'Assigning and auditing role permissions across your organization.',
    fullDescription: 'Principles of least privilege, assigning appropriate operational roles, and auditing administrative capabilities.',
    category: 'ADMINISTRATION',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Security Officer',
    keywords: ['roles', 'rbac', 'permissions', 'least privilege'],
    relatedSopIds: ['sop-managing-users', 'sop-understanding-roles'],
    steps: [
      {
        stepNumber: 1,
        title: 'Review Role Definitions',
        instruction: 'Ensure Warehouse Operators are restricted from planning rules and administration pages.'
      },
      {
        stepNumber: 2,
        title: 'Update User Role',
        instruction: 'On the user profile modal, update the role dropdown and click Save to apply immediately.'
      }
    ]
  },
  {
    id: 'sop-site-access',
    title: 'Managing Site Access Permissions',
    slug: 'managing-site-access',
    shortDescription: 'Granting or revoking access to specific sites for multi-facility operators.',
    fullDescription: 'How to restrict sensitive operational data by site and configure which warehouses users can switch between.',
    category: 'ADMINISTRATION',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Security Admin',
    keywords: ['site access', 'facility permissions', 'multi-site'],
    relatedSopIds: ['sop-managing-users', 'sop-selecting-site'],
    steps: [
      {
        stepNumber: 1,
        title: 'Edit User Profile',
        instruction: 'Open the user record in the Administration console.'
      },
      {
        stepNumber: 2,
        title: 'Configure Allowed Site IDs',
        instruction: 'Select authorized sites from the list and save changes.'
      }
    ]
  },
  {
    id: 'sop-managing-sites',
    title: 'Managing Sites & Facility Profiles',
    slug: 'managing-sites',
    shortDescription: 'Creating facilities, setting timezones, and configuring site-level operating parameters.',
    fullDescription: 'How to establish new operating warehouses, configure local timezones, and set default units of measure.',
    category: 'ADMINISTRATION',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Tenant Admin',
    keywords: ['sites', 'facility profile', 'timezone', 'site settings'],
    relatedSopIds: ['sop-site-onboarding', 'sop-tenant-site-concepts'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Site Settings Page',
        instruction: 'Navigate to Administration → Site Settings in the sidebar.',
        actionUrl: '/admin/site-settings',
        actionLabel: 'Open Site Settings'
      },
      {
        stepNumber: 2,
        title: 'Configure Facility Details',
        instruction: 'Set Site Name, Code, Operating Timezone, and Default Unit of Measure.'
      }
    ]
  },
  {
    id: 'sop-site-onboarding',
    title: 'Site Onboarding Wizard & Setup',
    slug: 'site-onboarding-wizard',
    shortDescription: 'Step-by-step setup guide for launching a brand-new facility in OVMS.',
    fullDescription: 'Learn how to use the Onboarding Wizard to bootstrap master data, storage locations, planning rules, and initial inventory balances.',
    category: 'ADMINISTRATION',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'ADVANCED',
    estimatedDurationMinutes: 6,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Onboarding Specialist',
    keywords: ['onboarding', 'wizard', 'site setup', 'initialization'],
    relatedSopIds: ['sop-managing-sites', 'sop-tenant-site-concepts'],
    steps: [
      {
        stepNumber: 1,
        title: 'Launch Onboarding Wizard',
        instruction: 'Access the onboarding checklist from the Site Settings banner or prompt modal.'
      },
      {
        stepNumber: 2,
        title: 'Follow the 5 Setup Steps',
        instruction: '1) Site Profile, 2) Storage Areas & Locations, 3) Products & Categories, 4) Planning Rules, 5) Initial Balances.'
      },
      {
        stepNumber: 3,
        title: 'Complete Onboarding',
        instruction: 'Mark onboarding as complete to activate live recommendation calculation and floor execution.'
      }
    ]
  },
  {
    id: 'sop-tenant-site-concepts',
    title: 'Tenant & Site Isolation Concepts',
    slug: 'tenant-site-concepts',
    shortDescription: 'Understanding multi-tenancy, data boundaries, and security isolation.',
    fullDescription: 'Technical overview of how OVMS enforces strict tenant isolation, preventing cross-tenant data leakage while enabling multi-site operations.',
    category: 'ADMINISTRATION',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN'],
    difficulty: 'ADVANCED',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Chief Architect',
    keywords: ['multi-tenant', 'isolation', 'security', 'row level security'],
    relatedSopIds: ['sop-managing-sites', 'sop-managing-users'],
    steps: [
      {
        stepNumber: 1,
        title: 'Tenant Scope Boundary',
        instruction: 'All products, users, priorities, and inventory records are partitioned by a unique tenantId.'
      },
      {
        stepNumber: 2,
        title: 'Site-Level Data Partitioning',
        instruction: 'Operational tables (e.g. inventory balances, line events) are additionally scoped by siteId.'
      }
    ]
  },

  // ==========================================
  // 8. DISPLAYS
  // ==========================================
  {
    id: 'sop-operational-displays',
    title: 'Operational TV Displays Overview',
    slug: 'operational-displays-overview',
    shortDescription: 'Setting up high-visibility dashboard screens across the warehouse floor.',
    fullDescription: 'Learn how to mount, configure, and operate dedicated TV screens in picking zones, staging bays, and control rooms.',
    category: 'DISPLAYS',
    module: 'Displays',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Visual Operations Lead',
    keywords: ['tv display', 'dashboard', 'visual management', 'screens'],
    relatedSopIds: ['sop-tv-display-content', 'sop-display-troubleshooting'],
    steps: [
      {
        stepNumber: 1,
        title: 'Launch TV Dashboard',
        instruction: 'Navigate to /tv-dashboard or click the TV Dashboard button in the sidebar.',
        actionUrl: '/tv-dashboard',
        actionLabel: 'Open TV Dashboard'
      },
      {
        stepNumber: 2,
        title: 'Enter Fullscreen Mode',
        instruction: 'Press F11 on the display PC keyboard to hide browser toolbars for a clean visual board.'
      }
    ]
  },
  {
    id: 'sop-tv-display-content',
    title: 'What Appears on the TV Display',
    slug: 'what-appears-on-tv-display',
    shortDescription: 'Understanding the priority ranking, progress bars, and announcement tickers on TV.',
    fullDescription: 'Detailed breakdown of the live cards, urgency color indicators, active line outputs, and alert banners shown on displays.',
    category: 'DISPLAYS',
    module: 'Displays',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Visual Operations Lead',
    keywords: ['tv cards', 'ticker', 'announcements', 'display content'],
    relatedSopIds: ['sop-operational-displays', 'sop-display-priorities'],
    steps: [
      {
        stepNumber: 1,
        title: 'Top Urgent Priorities Rail',
        instruction: 'The most urgent published priorities appear in prominent large cards ranked by priority weight.'
      },
      {
        stepNumber: 2,
        title: 'Real-time Progress Indicator',
        instruction: 'Live progress bars show percentage fulfilled as warehouse operators log picks.'
      },
      {
        stepNumber: 3,
        title: 'Broadcast Announcement Ticker',
        instruction: 'Site-wide announcements and safety notices scroll across the bottom banner in real time.'
      }
    ]
  },
  {
    id: 'sop-display-priorities',
    title: 'Configuring Display Priorities & Filters',
    slug: 'display-priorities-configuration',
    shortDescription: 'How to target specific TV displays to particular zones, lines, or destinations.',
    fullDescription: 'Learn how to filter TV dashboard views so specific picking areas only see tasks relevant to their operational zone.',
    category: 'DISPLAYS',
    module: 'Displays',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Visual Operations Lead',
    keywords: ['display filter', 'zone filter', 'tv settings'],
    relatedSopIds: ['sop-operational-displays', 'sop-tv-display-content'],
    steps: [
      {
        stepNumber: 1,
        title: 'Open Dashboard Settings',
        instruction: 'Go to Administration → Dashboard Settings to configure display preferences.',
        actionUrl: '/admin/dashboard-settings',
        actionLabel: 'Open Dashboard Settings'
      },
      {
        stepNumber: 2,
        title: 'Set Target Zones and Refresh Rates',
        instruction: 'Choose whether to show all site tasks or restrict cards to designated storage areas.'
      }
    ]
  },
  {
    id: 'sop-display-troubleshooting',
    title: 'TV Display Troubleshooting & Sync',
    slug: 'display-troubleshooting',
    shortDescription: 'Fixing frozen displays, offline connection banners, and stream reconnection.',
    fullDescription: 'Step-by-step diagnostic guide for restoring disconnected TV screens, clearing cached browser state, and refreshing sessions.',
    category: 'DISPLAYS',
    module: 'Displays',
    applicableRoles: ALL_ROLES,
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'IT Operations',
    keywords: ['tv frozen', 'offline display', 'sync error', 'screen refresh'],
    relatedSopIds: ['sop-operational-displays', 'sop-common-problems'],
    troubleshooting: [
      {
        problem: 'TV display is not updating in real time',
        possibleCauses: ['Network disconnection', 'Expired session token on display PC', 'Background tab throttling in browser'],
        solutions: ['Press Ctrl+F5 to hard-reload the page', 'Verify network connection cable/WiFi', 'Ensure display account has active session'],
        relatedSopIds: ['sop-login-problems']
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Check Offline Warning Banner',
        instruction: 'If the top red banner is visible, check the Ethernet or WiFi connection to the display device.'
      },
      {
        stepNumber: 2,
        title: 'Hard Refresh Browser',
        instruction: 'Press Ctrl+Shift+R or Ctrl+F5 to reload the latest bundle and re-establish real-time subscriptions.'
      }
    ]
  },

  // ==========================================
  // 9. TROUBLESHOOTING
  // ==========================================
  {
    id: 'sop-common-problems',
    title: 'Common OVMS Problems & Fast Fixes',
    slug: 'common-ovms-problems',
    shortDescription: 'Quick diagnostic cheat sheet for common user issues and questions.',
    fullDescription: 'Reference guide for rapid troubleshooting of the most frequent operational hiccups in OVMS.',
    category: 'TROUBLESHOOTING',
    module: 'Troubleshooting',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'OVMS Support Lead',
    keywords: ['common errors', 'faq', 'troubleshooting', 'help', 'fast fixes'],
    relatedSopIds: ['sop-login-problems', 'sop-missing-products', 'sop-understanding-errors'],
    steps: [
      {
        stepNumber: 1,
        title: 'Identify the Symptoms',
        instruction: 'Check whether the issue is related to Authentication, Missing Master Data, Stale Freshness, or Import Parsing.'
      },
      {
        stepNumber: 2,
        title: 'Review the Contextual Recommendation in Help',
        instruction: 'Open the in-app Help panel on the affected page to read specific guidance for that screen.'
      }
    ]
  },
  {
    id: 'sop-login-problems',
    title: 'Troubleshooting Login & Access Issues',
    slug: 'login-problems',
    shortDescription: 'Resolving forgotten passwords, account locks, and session expiration errors.',
    fullDescription: 'Comprehensive guide for users unable to log in, dealing with invalid credentials, or encountering access restrictions.',
    category: 'TROUBLESHOOTING',
    module: 'Auth',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Security Admin',
    keywords: ['cannot login', 'locked account', 'wrong password', 'expired session'],
    relatedSopIds: ['sop-signing-in', 'sop-managing-users'],
    troubleshooting: [
      {
        problem: 'Account locked due to 5 failed attempts',
        possibleCauses: ['Multiple incorrect password entries'],
        solutions: ['Wait 15 minutes for the security lockout window to reset, or request an admin unlock'],
        relatedSopIds: ['sop-managing-users']
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Check Credentials and Caps Lock',
        instruction: 'Ensure your email is entered in full and Caps Lock is not inadvertently enabled.'
      },
      {
        stepNumber: 2,
        title: 'Contact Tenant Admin for Password Reset',
        instruction: 'If forgotten, have your administrator issue a temporary password via Administration → Users.'
      }
    ]
  },
  {
    id: 'sop-missing-products',
    title: 'Troubleshooting Missing Products in Selectors',
    slug: 'missing-products',
    shortDescription: 'Why a product SKU is not appearing in planning rules, priorities, or stock modals.',
    fullDescription: 'Step-by-step diagnostic on resolving missing SKU errors, inactive statuses, and normalization mismatches.',
    category: 'TROUBLESHOOTING',
    module: 'Inventory',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Master Data Admin',
    keywords: ['missing product', 'cannot find sku', 'inactive product', 'product lookup'],
    relatedSopIds: ['sop-products-config', 'sop-investigating-stock-discrepancies'],
    troubleshooting: [
      {
        problem: 'Product does not appear in dropdown',
        possibleCauses: ['Product status is set to "inactive"', 'SKU code has leading or trailing spaces', 'Product belongs to a different tenant'],
        solutions: ['Open Inventory → Products, find the SKU, and ensure status is Active', 'Check product normalization in Master Data'],
        relatedSopIds: ['sop-products-config']
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Search in Products Master',
        instruction: 'Go to Inventory → Products and search for the SKU to confirm it exists in the database.'
      },
      {
        stepNumber: 2,
        title: 'Check Active Status',
        instruction: 'If the product is marked INACTIVE, click Edit and change status to ACTIVE.'
      }
    ]
  },
  {
    id: 'sop-missing-destinations',
    title: 'Troubleshooting Missing Destinations',
    slug: 'missing-destinations',
    shortDescription: 'Resolving missing target bays or customer codes in priority creation forms.',
    fullDescription: 'How to diagnose missing destination dropdown options and activate delivery locations in configuration.',
    category: 'TROUBLESHOOTING',
    module: 'Configuration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 2,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Logistics Lead',
    keywords: ['missing destination', 'destination dropdown empty', 'target bay'],
    relatedSopIds: ['sop-destinations-config', 'sop-creating-priority'],
    steps: [
      {
        stepNumber: 1,
        title: 'Verify Destinations in Configuration',
        instruction: 'Check Administration → Configuration → Destinations to ensure the target destination is registered and active.'
      }
    ]
  },
  {
    id: 'sop-missing-priorities',
    title: 'Troubleshooting Missing Priorities on Warehouse Screen',
    slug: 'missing-priorities',
    shortDescription: 'Why a created priority is not showing on the warehouse execution screen or TV display.',
    fullDescription: 'Diagnostic steps for verifying priority publish statuses, site assignment filters, and expiration timestamps.',
    category: 'TROUBLESHOOTING',
    module: 'Operations',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Warehouse Supervisor',
    keywords: ['missing priority', 'task not showing', 'draft vs published', 'tv not updating'],
    relatedSopIds: ['sop-publishing-priority', 'sop-updating-priority-progress'],
    troubleshooting: [
      {
        problem: 'Priority created by planner does not show on floor screens',
        possibleCauses: ['Priority is still in DRAFT status', 'Priority was created for a different Site ID', 'Priority expired based on expiration time setting'],
        solutions: ['Open Operational Priorities and click "Publish"', 'Verify active site selector matches priority site', 'Extend expiration time if required'],
        relatedSopIds: ['sop-publishing-priority', 'sop-selecting-site']
      }
    ],
    steps: [
      {
        stepNumber: 1,
        title: 'Check Priority Status',
        instruction: 'Ensure the priority is in PUBLISHED or IN_PROGRESS status, not DRAFT or CANCELLED.'
      },
      {
        stepNumber: 2,
        title: 'Check Active Site Match',
        instruction: 'Confirm that both the user creating the task and the warehouse screen are viewing the same facility site.'
      }
    ]
  },
  {
    id: 'sop-import-errors',
    title: 'Troubleshooting Data Import Errors',
    slug: 'data-import-errors',
    shortDescription: 'Resolving file encoding, delimiter, missing column, and schema validation errors.',
    fullDescription: 'Comprehensive guide to solving CSV, Excel, and clipboard paste errors during data onboarding and imports.',
    category: 'TROUBLESHOOTING',
    module: 'Administration',
    applicableRoles: ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER'],
    difficulty: 'INTERMEDIATE',
    estimatedDurationMinutes: 4,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'Data Engineer',
    keywords: ['import failed', 'csv error', 'excel error', 'paste inventory error', 'delimiter'],
    relatedSopIds: ['sop-troubleshooting-production-imports', 'sop-investigating-stock-discrepancies'],
    steps: [
      {
        stepNumber: 1,
        title: 'Check Column Headers',
        instruction: 'Ensure spreadsheet columns match required headers (e.g. ProductCode, Description, Quantity, LocationCode).'
      },
      {
        stepNumber: 2,
        title: 'Verify File Encoding',
        instruction: 'Export files using standard UTF-8 CSV or standard .XLSX workbook format without corrupted formula cells.'
      }
    ]
  },
  {
    id: 'sop-understanding-system-errors',
    title: 'Understanding System Errors & Status Codes',
    slug: 'understanding-system-errors',
    shortDescription: 'How to interpret error notifications, toasts, and exception logs in OVMS.',
    fullDescription: 'Learn what system error messages mean, how to read toast notifications, and when to capture diagnostics for support.',
    category: 'TROUBLESHOOTING',
    module: 'Core',
    applicableRoles: ALL_ROLES,
    difficulty: 'BEGINNER',
    estimatedDurationMinutes: 3,
    status: 'PUBLISHED',
    version: '1.0.0',
    publishedDate: '2026-09-01T08:00:00Z',
    updatedDate: '2026-09-14T08:00:00Z',
    author: 'OVMS Support Lead',
    keywords: ['system error', 'error banner', 'toast error', 'diagnostics'],
    relatedSopIds: ['sop-common-problems', 'sop-display-troubleshooting'],
    steps: [
      {
        stepNumber: 1,
        title: 'Read the Error Toast Details',
        instruction: 'System error notifications specify the operation that failed and the underlying cause.'
      },
      {
        stepNumber: 2,
        title: 'Check Data Freshness Card',
        instruction: 'Hover over the header Data Freshness card to verify whether background sync is operational or delayed.'
      }
    ]
  }
];
