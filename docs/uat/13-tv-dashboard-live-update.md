# UAT-13: TV Dashboard Live Update

## Metadata
* **Test ID**: UAT-13
* **Requirement**: Validate that the TV Display layout registers real-time operational state changes instantly without page refreshes.
* **Preconditions**: Tester has two browser tabs/windows open:
  - Tab 1: **TV Dashboard Display Route** (unauthenticated display mode).
  - Tab 2: **Planning Console** (logged in as `PLANNER`).

## Steps
1. On Tab 1, observe the active production lines and priority counts.
2. On Tab 2, navigate to **Planning** -> **Operational Priorities Queue**.
3. Create a new `CRITICAL` priority task for `LINE-A`. Click **Create**.
4. Change the status of an existing production line or log a block event on Tab 2.
5. Immediately look at Tab 1 without clicking or reloading the page.

## Expected Result
- The TV Display on Tab 1 updates within 1 second to show the newly added critical task.
- Status changes, color updates, and alert headers flash or pulse to catch attention without any manual reload or polling lag.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
