# UAT-07: Promotion Impact

## Metadata
* **Test ID**: UAT-07
* **Requirement**: Validate entering promotional schedules and verifying their demand projection overlays on inventory targets.
* **Preconditions**: Tester is logged in as `PLANNER` or `TENANT_ADMIN`.

## Steps
1. Navigate to **Planning** -> **Promotions Calendar** or **Promotion Settings**.
2. Click **Create Promotion Event**.
3. Fill out the parameters:
   - Promotion Code: `PROM-SUMMER-SHAMPOO`
   - Name: `Summer Organic Shampoo Campaign`
   - Start Date: Select date 2 days in the future
   - End Date: Select date 10 days in the future
   - Targeted Products: Select `PROD-SHAMPOO-01`
   - Projected Lift Multiplier / Demand Increase: `1.5` (or +50% demand)
4. Click **Save Promotion**.
5. Navigate to **Planning** -> **Inventory Demand Projection** or check the dashboard.

## Expected Result
- The promotion is saved in Firestore.
- In the demand projection charts or inventory overview, the warning/safety threshold level for `PROD-SHAMPOO-01` dynamically scales up by 1.5x during the promotion window to prevent stockouts.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
