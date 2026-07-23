# OVMS Firestore Rules

## Rule Structure
The Firestore rules (`firestore.rules`) enforce the security model defined in `docs/security-model.md`.

## Core Mechanisms
1. **Authentication:** All requests must be authenticated (`request.auth != null`).
2. **Profile Loading:** Rules use `getUserProfile()` to fetch the user's role, `tenantId`, and `siteIds`.
3. **Tenant Boundary:** The `hasTenantAccess(tenantId)` function ensures non-superusers can only access documents matching their profile's `tenantId`.
4. **Site Boundary:** The `hasAssignedSiteAccess(tenantId, siteId)` function ensures non-superusers can only access documents for sites in their `siteIds` list. `TENANT_ADMIN` is automatically granted access to all sites in their tenant.
5. **Immutability:** The `ownershipFieldsUnchanged()` function asserts that `tenantId` and `siteId` cannot be mutated after creation.
6. **Field-Level Restrictions:** `isOnlyUpdatingWarehouseFields()` and similar functions enforce that specific roles can only modify permitted fields. `progressPercent` and `quantity` fields are safely bounded.
7. **Display Profiles:** The `DISPLAY` role is restricted from reading user profiles, historic import logs, and sensitive `siteSettings`.
8. **Audit Logs:** Audit logs are strictly append-only.
9. **Global Deny:** A catch-all `match /{document=**}` denies access by default.

