# UAT-12: Warehouse Execution Workflow

## Metadata
* **Test ID**: UAT-12
* **Requirement**: Validate that warehouse operators can progress a task through the complete lifecycle: Acknowledge, Start, Block, and Complete.
* **Preconditions**: Tester is logged in as `WAREHOUSE_OPERATOR`. A priority task with status `QUEUED` exists for the current site.

## Steps
1. Navigate to the **Operator Terminal** or **Task Execution Dashboard**.
2. Locate the assigned priority task: `Urgent Glass Bottle Replenishment`.
3. Click the **Acknowledge** button. Observe status.
4. Click the **Start** button. Observe status.
5. Click the **Block** or **Hold** button.
   - Enter block reason: `Forklift maintenance delay`
   - Save block. Observe status.
6. Click **Resume Task** to clear the hold.
7. Click the **Complete** button.
   - Confirm quantity handled: `100`
   - Complete task.

## Expected Result
- Status transitions correctly in Firestore: `QUEUED` -> `ACKNOWLEDGED` -> `RUNNING` -> `BLOCKED` -> `RUNNING` -> `COMPLETED`.
- The status updates instantly in real-time across all connected terminals.
- Completion auto-updates associated storage levels if configuring direct adjustment.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
