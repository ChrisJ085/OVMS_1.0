# OVMS Security Model

## 1. Authentication & Context
- Identity is established via Firebase Authentication.
- Application context is maintained through `AuthContext` and `SiteContext`.

## 2. Multi-Tenant Architecture
- The application is strictly multi-tenant.
- Every record MUST belong to a `tenantId`.
- Superusers (`PLATFORM_SUPERUSER`) have cross-tenant access.
- Non-superusers have access ONLY to records matching their assigned `tenantId`.
- `tenantId` is immutable for the life of a document.

## 3. Site-Scoped Access
- Most operational records are scoped to a specific `siteId`.
- Users (except Superusers and Tenant Admins) can only read or write records for sites listed in their `siteIds` array.
- Site-level access is enforced by `isAssignedToSite(siteId)`.
- A missing `siteId` denies access to site-scoped collections.
- `siteId` is immutable for the life of a document.

## 4. Field-Level Allow-Lists
- Certain roles have restricted update capabilities.
- Warehouse Operators can only update execution fields (e.g. `status`, `quantity`, `warehouseProgress`, `progressPercent`, `startedAt`, `completedAt`).
- Users updating their own profiles are restricted to `displayName`, `jobTitle`, `passwordChangedAt`, `requiresPasswordChange`, `lastLoginAt`.

## 5. Audit immutability
- Audit logs cannot be updated or deleted by anyone, even superusers.
- `userId` and `performedBy` must match the authenticated user.

