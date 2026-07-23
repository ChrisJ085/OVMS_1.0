# Role Permissions

## PLATFORM_SUPERUSER
- Full access to all tenants, sites, and configuration.
- Can create and delete tenants, sites, and users.
- Can access historical audit logs and imports.

## TENANT_ADMIN
- Full access to all sites within their assigned `tenantId`.
- Cannot create or modify users to become `PLATFORM_SUPERUSER`.
- Cannot access data from other tenants.

## PLANNER
- Access limited to their assigned `tenantId` and `siteIds`.
- Can manage production plans, imports, master data, and rules for their sites.
- Cannot delete or modify committed imports.

## WAREHOUSE_OPERATOR
- Access limited to their assigned `tenantId` and `siteIds`.
- Strictly limited to updating execution fields on operational priorities, inventory balances, and exceptions (e.g., `status`, `progressPercent`, `completedAt`).
- Cannot edit master data, planning rules, or production plans.

## VIEWER
- Read-only access to records within their assigned `tenantId` and `siteIds`.
- Cannot create, update, or delete any operational records.

## DISPLAY
- Highly restricted, read-only role intended for digital signage and TV dashboards.
- Access limited to specific operational collections (`priorities`, `inventoryMovements`) for their assigned `siteIds`.
- Denied access to sensitive data (e.g., user profiles, audit logs, import histories, sensitive site settings).

