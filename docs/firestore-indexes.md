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

### 2. `inventoryMovements` Collection
* **Query Type**: Real-time filtering and audit queries.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `timestamp` (Descending)
* **Purpose**: Displays inventory history in chronological order.

### 3. `planningRules` Collection
* **Query Type**: Checking overlap and matching rule sets.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `productId` (Ascending)
  - `isActive` (Ascending)
* **Purpose**: Retrieves active rules for recommendations without loading deactivated entries.

### 4. `productionEvents` Collection
* **Query Type**: Querying upcoming events in chronological order.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `startTime` (Ascending)
* **Purpose**: Drives projection calculations for out-of-stock risk.

### 5. `operationalPriorities` Collection
* **Query Type**: Listing priorities sorted by severity or creation time.
* **Fields**:
  - `tenantId` (Ascending)
  - `siteId` (Ascending)
  - `status` (Ascending)
  - `severity` (Descending)
  - `createdDate` (Descending)
* **Purpose**: Powers TV dashboard and priority queues.

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

---

## Local Development Verification

To verify that queries match configured indexes, check browser console output or check Firestore Local Emulator logs. Any query requiring an index that is missing will yield a clear console error with a direct URL to provision the index in the Google Cloud Console.
