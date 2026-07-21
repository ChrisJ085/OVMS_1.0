# UAT-05: Planning Rule and DDXM

## Metadata
* **Test ID**: UAT-05
* **Requirement**: Verify configuration and execution of the Dynamic Decision Execution Matrix (DDXM) rule thresholds.
* **Preconditions**: Tester is logged in as `PLANNER` or `TENANT_ADMIN`. Product `PROD-SHAMPOO-01` exists.

## Steps
1. Navigate to **Planning** -> **Planning Rules**.
2. Click **Create Planning Rule**.
3. Fill out the rule parameters:
   - Product Code: `PROD-SHAMPOO-01`
   - Min Threshold (Stock shortage trigger): `40`
   - Target Threshold (Optimal level): `120`
   - Max Threshold (Overstock safety limit): `300`
   - Replenishment Source: `LINE-A`
   - Active: `true`
4. Click **Save Rule**.

## Expected Result
- Rule thresholds are registered in Firestore under the matching `tenantId` and `siteId`.
- The DDXM calculation engine successfully parses these thresholds during subsequent inventory balance changes to generate replenishment suggestions.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
