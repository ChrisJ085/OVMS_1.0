# UAT-03: Location and Inventory Load

## Metadata
* **Test ID**: UAT-03
* **Requirement**: Verify the system supports bulk location provisioning and inventory initialization using CSV upload templates.
* **Preconditions**: Tester is logged in as `TENANT_ADMIN` or `PLANNER`.

## Steps
1. Navigate to the **Administration Console** -> **Data Utilities** page.
2. Select **Data Entity**: `Storage Locations`. Click **Template** to download the CSV template.
3. Open the CSV file and add rows:
   ```csv
   locationCode,locationName,areaCode,isActive
   LOC-A-01,Bulk Bay A-1,AREA-A,true
   LOC-A-02,Bulk Bay A-2,AREA-A,true
   ```
4. Drag and drop or select this CSV file under the upload zone. Click **Validate**.
5. Once validation passes, click **Commit Valid Rows**.
6. Switch **Data Entity** to `Inventory Balances`. Select **Import Mode**: `Initial Balance`. Download and modify the template:
   ```csv
   productCode,locationCode,quantity,status
   PROD-SHAMPOO-01,LOC-A-01,150,AVAILABLE
   ```
7. Upload, validate, and click **Commit Valid Rows**.

## Expected Result
- Location master records `LOC-A-01` and `LOC-A-02` are added to Firestore.
- Inventory balance of `150 EA` of product `PROD-SHAMPOO-01` is allocated to location `LOC-A-01` with status `AVAILABLE`.
- Status summary shows successful counts, with no validation failures.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
