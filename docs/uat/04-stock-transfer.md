# UAT-04: Stock Transfer

## Metadata
* **Test ID**: UAT-04
* **Requirement**: Verify operators can perform stock transfer operations between storage locations, maintaining strict audit logs.
* **Preconditions**: Tester is logged in as `WAREHOUSE_OPERATOR` or `PLANNER`. Product `PROD-SHAMPOO-01` exists in `LOC-A-01` with `150 EA`.

## Steps
1. Navigate to **Operations** -> **Stock Transfers** or **Inventory** view.
2. Click **New Stock Transfer**.
3. Select Source Location: `LOC-A-01`.
4. Select Target Location: `LOC-A-02`.
5. Select Product: `PROD-SHAMPOO-01`.
6. Enter Transfer Quantity: `50`.
7. Click **Submit Transfer**.

## Expected Result
- Inventory balance in `LOC-A-01` decreases to `100 EA`.
- Inventory balance in `LOC-A-02` increases to `50 EA`.
- An entry is logged in the **Audit Logs** indicating a quantity of 50 was moved from `LOC-A-01` to `LOC-A-02`.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
