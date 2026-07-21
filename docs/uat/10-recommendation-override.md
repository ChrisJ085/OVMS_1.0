# UAT-10: Recommendation Override

## Metadata
* **Test ID**: UAT-10
* **Requirement**: Validate that planners can override recommended quantities, destinations, or line assignments before final authorization.
* **Preconditions**: Tester is logged in as `PLANNER`. An active recommendation exists for `PROD-SHAMPOO-01`.

## Steps
1. Navigate to the **Recommendations Screen**.
2. Locate the recommendation for `PROD-SHAMPOO-01` suggesting `100 EA`.
3. Click the **Override / Modify** button.
4. Change the proposed quantity to `180 EA`.
5. Change the target destination to `Outbound Bay 1` (or choice from dropdown).
6. Click **Approve Override** or **Save and Authorize**.

## Expected Result
- The final priority schedule is generated with the updated quantity of `180 EA` and target destination.
- The recommendation is successfully marked as `APPROVED` with an audit flag indicating that an manual override took place.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
