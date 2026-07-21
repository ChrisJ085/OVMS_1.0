# OVMS Regression Test Checklist

This regression test checklist ensures the Quality, Performance, and Resilience of the Out-of-Stock Vulnerability Management System (OVMS). All listed operations must be verified following any deployment or architectural refactoring.

---

## 1. Product Management
- [ ] **Create Product**
  - Verify that a new product can be successfully added with a unique `productCode`.
  - Validate that tenant/site scopes are preserved (must contain `tenantId` and `siteId`).
  - Verify field validation fails if name or code is missing.
- [ ] **Edit Product**
  - Verify that updating product attributes (description, category) commits successfully.
  - Verify that `modifiedDate` is updated to a valid Firestore server timestamp.

## 2. Inventory Operations
- [ ] **Inventory Adjustment**
  - Verify positive adjustments increase quantity, negative adjustments decrease it.
  - Ensure the adjustment transaction uses atomic writes/movements.
  - Verify transaction log/movement entry is created with accurate metadata (`performedBy`, `reason`).
- [ ] **Inventory Transfer**
  - Verify that transferring stock from Location A to Location B operates inside a Firestore transaction to prevent double-draws or stock inflation.
  - Verify that invalid source quantities or missing destination parameters trigger immediate user-visible errors.

## 3. Product Planning Rules
- [ ] **Planning Rule Management**
  - Verify creation of min, target, and max thresholds for specific products.
  - **Threshold Relationship Validation**: Ensure `minThreshold <= targetThreshold <= maxThreshold` is strictly enforced during UI form submission and CSV import.
  - **Date Overlap Check**: Verify that overlapping rules trigger validation errors instead of silent overwrite.

## 4. Production Events
- [ ] **Production Schedule Import & Edit**
  - Verify importing production lines and schedules links correctly by `productCode` and `lineCode`.
  - Ensure end times are strictly greater than start times.
  - Verify production events correctly feed into the vulnerability projection calculations.

## 5. Promotion Impact & Rules
- [ ] **Promotion Schedule Import**
  - Verify promotions can be loaded with standard date-range validation (start date must precede end date).
  - **Product Impacts**: Check that promotion product impact records correctly associate promotion code with specific product codes.

## 6. Decision Scenarios & Recalculation
- [ ] **Decision Calculation Consistency**
  - Verify the decision engine does not trigger infinite render loops.
  - Ensure calculated parameters (e.g. out-of-stock projections) update correctly upon inventory adjustment or production scheduling.
  - Verify computations are memoized and do not degrade UI responsiveness.

## 7. Recommendation Approval & Override
- [ ] **Recommendation Generation & Processing**
  - Verify recommendation list displays dynamically.
  - **Approval Workflow**: Verify that clicking "Approve" triggers a state transition using transactions to prevent concurrent dual-approval.
  - **Override Workflow**: Verify that overriding a quantity or recommendation status saves user input correctly.

## 8. Priority Creation & Tracking
- [ ] **Priority Workflow**
  - Verify operational priorities can be created for at-risk products.
  - Ensure updates to priority progress (e.g., set to "IN_PROGRESS" or "RESOLVED") use concurrency-safe state transitions.
  - Avoid double-submissions by immediately disabling button states.

## 9. Warehouse Portal & Completion
- [ ] **Warehouse Task Execution**
  - Verify layout responsiveness on tablet / industrial hand-held browsers.
  - Ensure barcode-friendly / physical scanning forms have clearly visible focus.
  - Confirm completion of picking/replenishment tasks immediately adjusts active balances.

## 10. TV Dashboard Performance
- [ ] **TV Mode Monitoring**
  - Ensure the TV dashboard component handles continuous long-running sessions without memory leaks.
  - Verify it doesn't execute redundant/infinite onSnapshot triggers (reuse shared state / bounded listeners).
  - Layout must be fixed/grid full-screen, fitting exactly in standard displays without vertical/horizontal scrollbars.

## 11. Exception Creation & Resolution
- [ ] **Operational Exception Tracker**
  - Verify exceptions (e.g., stock mismatch, delayed delivery) display real-time statuses.
  - Ensure resolved exceptions are logged with resolving user and time.

## 12. Reports & Exports
- [ ] **CSV Data Exports**
  - Verify that products, locations, current inventory, and planning rules can be exported cleanly as CSV files.
  - Verify exported CSV formats map directly to corresponding import templates.
  - **Network / Offline States**: Verify robust handling and warning indicators during connection failures.
