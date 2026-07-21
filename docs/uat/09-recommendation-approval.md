# UAT-09: Recommendation Approval

## Metadata
* **Test ID**: UAT-09
* **Requirement**: Validate that planners can approve auto-generated material or replenishment recommendations to produce a scheduled priority task.
* **Preconditions**: Tester is logged in as `PLANNER`. An active recommendation exists for `PROD-SHAMPOO-01` due to low stock.

## Steps
1. Navigate to the **Planning Console** or **Recommendations Screen**.
2. Locate the recommendation to "Replenish PROD-SHAMPOO-01 on LINE-A".
3. Review the proposed quantity (e.g., `100 EA`) and target destination.
4. Click the **Approve** button.

## Expected Result
- The recommendation status changes from `PROPOSED` to `APPROVED` in Firestore.
- An operational priority task is auto-created in the execution queue with status `QUEUED` or `SCHEDULED`, carrying the correct SKU, quantity, and destination details.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
