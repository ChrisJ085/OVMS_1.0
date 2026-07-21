# UAT-11: Priority Creation & Scheduling

## Metadata
* **Test ID**: UAT-11
* **Requirement**: Validate that planners can manually create urgent high-priority warehouse tasks and dispatch them immediately.
* **Preconditions**: Tester is logged in as `PLANNER` or `TENANT_ADMIN`.

## Steps
1. Navigate to **Planning** -> **Operational Priorities Queue**.
2. Click **Create Priority Task**.
3. Complete the form:
   - Priority Title: `Urgent Glass Bottle Replenishment`
   - Severity: `CRITICAL`
   - Assigned Line: `LINE-A`
   - Product SKU: `PROD-SHAMPOO-01`
   - Action Required: `Move 100 EA from LOC-A-01 to Outbound Bay 1`
   - Schedule Time: Select immediately
4. Click **Create Task**.

## Expected Result
- The priority task is written to Firestore with a status of `QUEUED`.
- It is immediately rendered at the top of the Operational Priorities list on both the Planning screen and the Operator screen because of its `CRITICAL` severity rating.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
