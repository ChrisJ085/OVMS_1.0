# UAT-19: Role Restrictions

## Metadata
* **Test ID**: UAT-19
* **Requirement**: Validate that feature access and UI elements are strictly gated based on the assigned user role (Superuser, Admin, Planner, Operator, Viewer).
* **Preconditions**: Tester has credentials for a `WAREHOUSE_OPERATOR` account and a `TENANT_ADMIN` account.

## Steps
1. Log in as the `WAREHOUSE_OPERATOR` user.
2. Observe the main navigation sidebar or links.
3. Attempt to manually navigate to `/admin` or `/planning/rules` in the browser URL bar.
4. Log out and log in as the `TENANT_ADMIN` user.
5. Re-observe the menu and attempt to access the Admin dashboards.

## Expected Result
- Under the `WAREHOUSE_OPERATOR` role, the Administration tab and planning rules are hidden. Navigating directly redirects back to the operator console with an authorization warning or displays a "Permission Denied" page.
- Under the `TENANT_ADMIN` role, all administration and planning settings are fully visible and active.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
