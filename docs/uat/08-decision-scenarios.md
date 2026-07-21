# UAT-08: Decision Scenarios

## Metadata
* **Test ID**: UAT-08
* **Requirement**: Validate that the DDXM decision matrix flags correct categories (Shortage, Overstock, Optimal) and surfaces actionable warnings.
* **Preconditions**: Tester is logged in as `PLANNER` or `TENANT_ADMIN`. Planning rule with min threshold `40`, target `120`, max `300` exists for `PROD-SHAMPOO-01`.

## Steps
1. Navigate to **Planning** -> **Data Utilities** or **Inventory Catalog**.
2. Perform stock adjustment to reduce `PROD-SHAMPOO-01` stock to `25 EA` (below the `40 EA` min threshold).
3. Navigate to the **Operational Dashboard**.
4. Observe the alerts panel.
5. Perform another stock adjustment to increase stock of `PROD-SHAMPOO-01` to `350 EA` (above the `300 EA` max threshold).
6. Return to the dashboard and observe the updated status.

## Expected Result
- Under `25 EA`, the product displays a high-severity **Stock Shortage / Stockout Risk** alert.
- Under `350 EA`, the product displays an **Overstock Risk** or **Exceeded Max Capacity** alert.
- When stock is `150 EA` (between 40 and 300), the status displays as **Optimal** with no active warning.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
