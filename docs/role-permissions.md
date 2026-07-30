# OVMS Role Hierarchy and Permissions

This document defines the Operations Visual Management System (OVMS) role hierarchy, field-level permissions, and functional capabilities for each role.

---

## 1. PLATFORM_SUPERUSER
**Platform-wide administrative and operational control across all tenants and sites.**

### Approved Capabilities:
- Create and manage tenants.
- Create and manage Tenant Admin users.
- Access all tenants, sites, and configuration.
- Manage all planning, operational, execution, and configuration data.
- Access platform audit logs, system settings, and platform administration.
- Perform warehouse execution updates across any site.
- Override tenant-level restrictions where explicitly intended.
- Includes both `VIEW_WAREHOUSE_EXECUTION` and `UPDATE_WAREHOUSE_EXECUTION` permissions.

---

## 2. TENANT_ADMIN
**Full tenant administration and operational control within their assigned tenant.**

### Approved Capabilities:
- Manage all sites within their assigned `tenantId`.
- Create and manage tenant users (cannot create or promote users to `PLATFORM_SUPERUSER`).
- Manage planning, operational, warehouse execution, and configuration data within their tenant.
- Access tenant audit logs, history, and administration.
- Upload warehouse inventory snapshots.
- Upload MPPS production-plan files.
- Manage Product Planning Rules, Promotions, and Announcements.
- Create and manage Operational Priorities and Recommendations.
- Perform warehouse execution updates.
- Includes both `VIEW_WAREHOUSE_EXECUTION` and `UPDATE_WAREHOUSE_EXECUTION` permissions.

### Restrictions:
- Strictly forbidden from accessing data belonging to other tenants.
- Cannot create or promote users to `PLATFORM_SUPERUSER`.
- Cannot modify platform-wide settings reserved for Platform Superusers.

---

## 3. PLANNER
**Full planning and operational-content management for assigned sites, with no tenant administration and no warehouse execution updates.**

### Approved Capabilities:
- Upload warehouse inventory snapshots.
- Upload MPPS production-plan files.
- Create and manage Product Planning Rules.
- Create and manage Promotions.
- Create and manage Announcements (controlled via `'MANAGE_ANNOUNCEMENTS'` permission).
- Create and edit Operational Priorities (controlled via `'MANAGE_PRIORITIES'` permission).
- Review and manage Recommendations.
- View warehouse execution progress in read-only mode (includes `VIEW_WAREHOUSE_EXECUTION` permission).
- Manage planning content for their assigned tenant and sites.

### Restrictions:
- Strictly forbidden from creating tenants.
- Cannot manage Tenant Admin or Platform Superuser accounts.
- Cannot access unassigned sites.
- Cannot change tenant ownership or system-wide configuration.
- Cannot perform warehouse execution updates (strictly blocked by Firestore rules from modifying execution fields such as `completedAt`, `cancelledAt`, `latestProgressNote`, `progressQuantity`, `remainingQuantity`, `progressPercent`).
- Cannot acknowledge or start warehouse work.
- Cannot place work into wait or blocked status.
- Cannot partially complete or complete warehouse work.
- Cannot change operator execution notes or execution timestamps.

---

## 4. WAREHOUSE_OPERATOR
**Limited operational execution access for assigned sites, without planning or configuration authority.**

### Approved Capabilities:
- View assigned Operational Priorities.
- View Warehouse Execution progress (includes `VIEW_WAREHOUSE_EXECUTION`).
- Acknowledge work, start work, and record progress.
- Record partial completion or full completion of work.
- Set work to wait or blocked status.
- Add execution notes and update permitted warehouse inventory execution fields.
- Update permitted exception-resolution fields.
- Includes `UPDATE_WAREHOUSE_EXECUTION` permission.

### Restrictions:
- Cannot upload MPPS production plans.
- Cannot upload planning-owned inventory snapshots.
- Cannot create or edit Product Planning Rules, Promotions, or Announcements.
- Cannot change priority planning instructions (such as title, description, action required, destination, planned quantity, rank, sort order, priority level, severity, target time, production line, department, stage, start or expiry scheduling, planning notes).
- Cannot manage users, tenants, sites, or configuration.

---

## 5. VIEWER
**Read-only access to permitted operational and planning information for assigned sites.**

### Approved Capabilities:
- View dashboards, priorities, and warehouse execution progress (includes `VIEW_WAREHOUSE_EXECUTION` in read-only mode).
- View inventory, production plans, and recommendations.
- View reports where currently permitted.

### Restrictions:
- Strictly forbidden from creating, updating, or deleting any operational, planning, execution, or configuration records.

---

## 6. DISPLAY
**Highly restricted, read-only role intended strictly for TV/digital signage dashboards.**

### Approved Capabilities:
- Access the approved TV Dashboard (`VIEW_TV_DASHBOARD`) and operational display data for assigned sites.

### Restrictions:
- Strictly forbidden from accessing the main application, users, audit logs, imports, administration, or sensitive configuration.
- Cannot create, update, or delete any records.
- Strictly blocked from accessing the Warehouse Execution module.

---

## 7. Security & Multi-Tenancy Rules

### Site Discovery & Source of Truth
- **Sites Collection**: Operational sites are discovered strictly from the `sites` Firestore collection. Development fallbacks (`tenant_dev`, `site_barrow`, `site_test`) are completely eliminated in production.
- **Explicit Site Assignment**: For non-superuser and non-tenant-admin roles (Planner, Warehouse Operator, Viewer, Display), access to site-scoped resources requires explicit assignment via a non-empty `siteIds` array in the user profile. Missing, null, or empty `siteIds` results in deny-by-default (no site access).
- **Secure Site Switching**: Active site changes in `SiteContext` perform deterministic validation against the user's `availableSites` prior to updating application state or persistence.

### Account Status & Superuser Enforcement
- **Active Account Requirement**: Security rules enforce that `PLATFORM_SUPERUSER` actions require `accountStatus == 'ACTIVE'`. Inactive or disabled superusers fail security rules instantly across all endpoints.

### Announcement Authorship Validation
- **Authenticated Authorship**: Announcement creation and updates require `createdBy` and `modifiedBy` fields to match `request.auth.uid` (or rely on authenticated user context), preventing unauthenticated author spoofing.

### Display Role Data Sanitization
- **Display-Safe Priorities**: The `DISPLAY` role reads TV dashboard data exclusively from the `displayPriorities` collection containing only sanitized fields needed for display. The `DISPLAY` role is strictly denied access to full `priorities` documents.
