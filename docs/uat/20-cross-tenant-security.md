# UAT-20: Cross-Tenant Security

## Metadata
* **Test ID**: UAT-20
* **Requirement**: Verify that users in Tenant A cannot view, query, or modify any database documents belonging to Tenant B under any circumstances.
* **Preconditions**: Two users are created:
  - User A: `admin.leeds@gxo.com` (`tenantId: 'tenant_leeds'`)
  - User B: `admin.barrow@gxo.com` (`tenantId: 'tenant_barrow'`)

## Steps
1. Log in as User A. Navigate to **Inventory Balances** or **Products**.
2. Inspect the network requests and returned data. Verify if any items from `tenant_barrow` are visible.
3. Attempt to fetch or update a document belonging to `tenant_barrow` directly via a modified client-side query or custom API call.
4. Log out and log in as User B. Verify that Leeds products are not visible.

## Expected Result
- User A is strictly restricted to `tenant_leeds` records. No Leeds screens show Barrow data.
- Any direct attempt to query or update a Barrow document results in a **Missing or insufficient permissions** error, blocked enforced by Firestore Security Rules.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
