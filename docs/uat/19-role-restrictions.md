# UAT-19: Role Restrictions

## Metadata
* **Test ID**: UAT-19
* **Requirement**: Validate that feature access, page routes, and database operations are strictly restricted and gated based on the six-role hierarchy:
  1. PLATFORM_SUPERUSER
  2. TENANT_ADMIN
  3. PLANNER
  4. WAREHOUSE_OPERATOR
  5. VIEWER
  6. DISPLAY
* **Preconditions**: Tester has access to accounts/sessions for all six roles.

## Steps
1. **PLATFORM_SUPERUSER Verification**:
   - Log in and verify full access across all tenants and sites.
   - Verify ability to manage tenants, users, plans, and perform warehouse updates.
2. **TENANT_ADMIN Verification**:
   - Log in and verify full operational management (rules, announcements, priorities) within their assigned tenant.
   - Verify they cannot access or modify any resources of another tenant.
3. **PLANNER Verification**:
   - Log in and verify access to planning dashboard, rules, promotions, and announcements (can create/edit announcements).
   - Navigate to the Warehouse Execution page: verify they can see the execution list (read-only).
   - Attempt to click any warehouse execution button (Acknowledge, Start, Complete, Block): verify these are disabled or hidden.
   - Verify that any manual update attempt on warehouse-specific execution fields is blocked both in the UI and by Firestore Security Rules.
4. **WAREHOUSE_OPERATOR Verification**:
   - Log in and verify ability to acknowledge, start, resume, hold, and complete warehouse tasks on the execution screen.
   - Verify that planning features (rules, promotions, announcements, import production plan) are completely hidden or inaccessible.
   - Attempt to modify planning-specific fields (e.g. priority rank, destination, target time): verify these are completely blocked by Firestore Security Rules.
5. **VIEWER Verification**:
   - Log in and verify that all planning and execution pages are in read-only mode (all buttons/controls are hidden).
6. **DISPLAY Verification**:
   - Log in and verify they are only able to access the TV Dashboard page.
   - Attempt to navigate to the normal application or any other route: verify they are redirected or blocked.

## Expected Result
- The application UI adapts dynamically for each role in accordance with the correct permission map.
- Firestore Security Rules strictly block invalid field-level writes and unauthorized cross-tenant writes.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
