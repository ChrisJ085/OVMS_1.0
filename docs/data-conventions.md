# OVMS Data Conventions

## Collection Naming
- Use lowercase, plural names (e.g., `products`, `inventory_balances`, `promotions`).
- Subcollections should follow the same pattern (e.g., `products/{id}/movements`).

## Document IDs
- Rely on Firestore auto-generated IDs unless there's a strong reason to use natural keys (e.g., configurations that are singleton).
- Natural keys, if used, must be deterministic and include the tenant/site prefix if applicable.

## Metadata Requirements
Every primary business collection must extend `BaseDocument` and store:
- `tenantId`
- `siteId` (where site-specific)
- `createdBy`, `createdDate`
- `modifiedBy`, `modifiedDate`
- `status` (active, inactive, archived)

## Date Handling
- All dates sent to Firestore must be `Timestamp` objects (`Timestamp.fromDate(date)`).
- Timezones are handled by the application logic using the Site `timezone` property. UI should format accordingly.

## Deactivation vs Deletion
- Business records should NEVER be deleted directly. Use the `deactivateDocument` service method to set the `status` to `inactive`.
- Hard deletes are only permitted for temporary technical objects or explicit error correction by an administrator.

## Tenant & Site Scoping
- A `tenantId` and `siteId` are mandatory for operational data.
- Queries must always include a `where('tenantId', '==', tenantId)` and `where('siteId', '==', siteId)` filter to prevent cross-site contamination.

## Error Handling
- Never catch and ignore errors in the service layer.
- Ensure Firestore validation and permission errors are surfaced to the UI caller wrapped in a `ServiceResult` or thrown directly for React hooks to handle.
- Do not provide silent fallback data.

## Development Identity
- Until authentication is introduced in the Security Phase, the user identity for auditing is hardcoded as `development-user`.
