# UAT-17: Superuser Tenant Creation

## Metadata
* **Test ID**: UAT-17
* **Requirement**: Validate that Platform Superusers can create and provision entirely new tenants with baseline parameters.
* **Preconditions**: Tester is logged in as `PLATFORM_SUPERUSER`.

## Steps
1. Navigate to the **Administration Console** -> **Tenants Directory** section.
2. Click **Create New Tenant**.
3. Complete the form:
   - Tenant Code: `gxo_retail_north`
   - Tenant Name: `GXO Retail North Division`
   - Primary Admin Email: `retail.admin@gxo.com`
   - Status: `ACTIVE`
4. Click **Create Tenant**.

## Expected Result
- A new document is written to the `tenants` collection in Firestore.
- An associated tenant profile is registered with correct status metadata, available for immediate admin user assignment.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
