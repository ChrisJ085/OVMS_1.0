# UAT-06: Current and Next Production

## Metadata
* **Test ID**: UAT-06
* **Requirement**: Validate scheduling, sequencing, and visualization of active ("Current") and upcoming ("Next") production events.
* **Preconditions**: Tester is logged in as `PLANNER` or `TENANT_ADMIN`. Production lines exist.

## Steps
1. Navigate to **Planning** -> **Production Schedules**.
2. Click **Schedule Production Event**.
3. Create the active (Current) run:
   - Line: `LINE-A`
   - Product: `PROD-SHAMPOO-01`
   - Planned Qty: `2000`
   - Start Time: Select current local time minus 1 hour
   - End Time: Select current local time plus 4 hours
   - Status: `RUNNING`
4. Click **Schedule Event**.
5. Click **Schedule Production Event** again to create the next run:
   - Line: `LINE-A`
   - Product: `PROD-SHAMPOO-01`
   - Planned Qty: `1500`
   - Start Time: Select current local time plus 5 hours
   - End Time: Select current local time plus 9 hours
   - Status: `PLANNED`
6. Click **Schedule Event**.
7. Navigate to the **Operational Dashboard**.

## Expected Result
- The dashboard highlights the first event under the **Current Production** container.
- The second event is queued and displays under the **Next Production** or **Upcoming Schedule** slot.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
