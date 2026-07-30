# Firestore Index Documentation

To ensure high performance and zero silent query fallbacks or performance degradation, the following Firestore composite indexes are required. 

These composite indexes prevent potential missing-index errors during high-throughput queries or dashboard loads, and ensure the queries are bounded, paginated, and performant.

---

## Required Composite Indexes

### 1. `inventoryBalances` Collection
* **Query Type**: Filter by site, tenant, product, and location.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `locationId` (Ascending)
* **Purpose**: Used during inventory transaction/movement updates to fetch specific balances for adjustment.

### 2. `inventoryMovements` Collection (with and without Product scoping)
* **Query Type**: Real-time filtering and audit queries.
* **Fields (Product-Specific)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `timestamp` (Descending)
* **Fields (Global Site-Specific)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `timestamp` (Descending)
* **Purpose**: Displays inventory history logs in chronological order.

### 3. `planningRules` Collection
* **Query Type**: Checking overlap and matching rule sets.
* **Fields (Legacy/CSV Matching)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `isActive` (Ascending)
* **Fields (Modern Status Filtering)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `status` (Ascending)
* **Purpose**: Retrieves active rules for recommendations without loading deactivated entries.

### 4. `productionEvents` Collection
* **Query Type**: Querying upcoming events in chronological order.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `startTime` (Ascending)
* **Purpose**: Drives projection calculations for out-of-stock risk.

### 5. `priorities` Collection
* **Query Type**: Listing priorities sorted by status or creation time/target time/rank.
* **Fields (By Created Date)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `priorityStatus` (Ascending)
  - `createdDate` (Descending)
* **Fields (By Target Time)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `priorityStatus` (Ascending)
  - `targetTime` (Ascending)
* **Fields (By Rank)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `priorityStatus` (Ascending)
  - `rank` (Ascending)
* **Purpose**: Powers TV dashboard, priorities page, and warehouse execution queues.

### 6. `recommendations` Collection
* **Query Type**: Recommendations for specific site and active state.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `status` (Ascending)
  - `createdDate` (Descending)
* **Purpose**: Workspace queries to handle bulk action and filtering.

### 7. `auditLogs` Collection
* **Query Type**: Bounded paginated audit log queries.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `timestamp` (Descending)
* **Purpose**: Administration overview history log queries.

### 8. `productionLinePlanNotes` Collection
* **Query Type**: Active status notes and chronological overview.
* **Fields (By Note Date)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `noteDate` (Descending)
* **Fields (By Active Status)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `active` (Ascending)
* **Purpose**: Drives operational timeline notes display.

### 9. `productionPlanEntries` Collection
* **Query Type**: Production plan schedule.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productionDate` (Ascending)
* **Purpose**: Powers the production plan timeline and out-of-stock projections.

### 10. `products` Collection
* **Query Type**: Product filtering by active status.
* **Fields**:
  - `tenantId` (Ascending)
  - `status` (Ascending)
* **Purpose**: Resolves active catalog of products for recommendations workspace, import/export validation, and dashboards.

### 11. `users` Collection
* **Query Type**: User access lists.
* **Fields**:
  - `tenantId` (Ascending)
  - `role` (Ascending)
* **Purpose**: Powers administration management console.

### 12. `productionPlanImports` Collection
* **Query Type**: Timeline and history of imports.
* **Fields (Chronological status-filtered)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `status` (Ascending)
  - `uploadedAt` (Descending)
* **Fields (Chronological global)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `uploadedAt` (Descending)
* **Purpose**: Powers the production plan import history workspace and newer plan checks.

### 13. `announcements` Collection
* **Query Type**: Active and TV dashboard displays.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `active` (Ascending)
  - `createdDate` (Descending)
* **Purpose**: Powers team announcements alerts.

### 14. `exceptions` Collection
* **Query Type**: Chronological alert logs and severity filters.
* **Fields (Chronological status-filtered)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `exceptionStatus` (Ascending)
  - `createdDate` (Descending)
* **Fields (Severity status-filtered)**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `exceptionStatus` (Ascending)
  - `severity` (Ascending)
* **Purpose**: Powers Exception Centre page.

### 15. `sessions` Collection
* **Query Type**: Concurrent active user counters.
* **Fields**:
  - `tenantId` (Ascending)
  - `status` (Ascending)
  - `lastActivityAt` (Descending)
* **Purpose**: Powers operational active session metrics.

### 16. `promotions` Collection
* **Query Type**: Active marketing impact queries.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `promotionStatus` (Ascending)
* **Purpose**: Drives active marketing campaign rules.

### 17. `promotionProductRules` Collection
* **Query Type**: Product promotion mapping lookup.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `status` (Ascending)
* **Purpose**: Maps product items to corresponding promotions rules.

---

## Local Development Verification

To verify that queries match configured indexes, check browser console output or check Firestore Local Emulator logs. Any query requiring an index that is missing will yield a clear console error with a direct URL to provision the index in the Google Cloud Console.
