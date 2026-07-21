# UAT-02: Product Creation

## Metadata
* **Test ID**: UAT-02
* **Requirement**: Verify user can register and configure new inventory product SKU profiles.
* **Preconditions**: Tester is logged in as `TENANT_ADMIN` or `PLANNER`.

## Steps
1. Navigate to **Planning** or **Inventory** -> **Products Catalog** section.
2. Click the **New Product** or **Add SKU** button.
3. Complete the form:
   - SKU / Product Code: `PROD-SHAMPOO-01`
   - Product Name: `Luxury Shampoo 250ml`
   - Category: `Cosmetics`
   - Unit of Measure: `EA` (Each)
   - Description: `High-end organic shampoo bottle`
4. Click **Create SKU**.

## Expected Result
- The new product is added to Firestore and immediately appears in the Products Catalog.
- Proper tenantId association is verified in the background.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
