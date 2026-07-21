# UAT-18: Tenant Admin User Creation

## Metadata
* **Test ID**: UAT-18
* **Requirement**: Validate that a superuser or active tenant admin can provision standard users, assigning specific roles and site restrictions.
* **Preconditions**: Tester is logged in as `PLATFORM_SUPERUSER` or `TENANT_ADMIN`.

## Steps
1. Navigate to **Administration Console** -> **User Management** tab.
2. Click **Create User**.
3. Complete the form:
   - Email Address: `planner.sheffield@gxo.com`
   - Full Name: `Sheffield Planner`
   - Assigned Role: `PLANNER`
   - Target Tenant: `GXO Retail North Division` (if superuser)
   - Assigned Site IDs: `site_leeds`
   - Temp Password: `Password123!`
4. Click **Create User**.

## Expected Result
- The user is provisioned in Firebase Authentication.
- A matching profile is added to the `users` collection in Firestore with `requiresPasswordChange: true`, `role: 'PLANNER'`, and `siteIds: ['site_leeds']`.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
