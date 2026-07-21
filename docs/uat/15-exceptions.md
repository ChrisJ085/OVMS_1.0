# UAT-15: Exceptions

## Metadata
* **Test ID**: UAT-15
* **Requirement**: Validate exception logging, severity escalation, and tracking of unresolved blockages.
* **Preconditions**: Tester is logged in as `WAREHOUSE_OPERATOR` or `PLANNER`.

## Steps
1. Navigate to **Operations** -> **Exception Logs** (or the exceptions reporting pane).
2. Click **Log Operational Exception**.
3. Fill out the parameters:
   - Exception Type: `STOCK_SHORTAGE`
   - Description: `Required labels missing for GXO batch, line halted.`
   - Impacted Line: `LINE-A`
   - Severity Level: `HIGH`
4. Click **Submit Exception**.
5. Log in as `TENANT_ADMIN`, and navigate to the **Exceptions Management Dashboard**.
6. Select the exception, click **Mark as Resolved**, and input resolution: `Emergency backup labels printed locally.`

## Expected Result
- The exception is stored in Firestore with a status of `UNRESOLVED`.
- It displays a high-contrast red warning status on the Planning screen.
- When marked as `RESOLVED` by the administrator, its status update is logged with resolution comments and the exception moves to the historical records view.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
