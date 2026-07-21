# UAT-01: Configuration Setup

## Metadata
* **Test ID**: UAT-01
* **Requirement**: Verify the platform allows administrators to set up and configure sites, production lines, and destinations.
* **Preconditions**: Tester is logged in as `PLATFORM_SUPERUSER` or `TENANT_ADMIN`.

## Steps
1. Navigate to the **Administration Console** -> **Site Settings** or **Configuration** page.
2. Click **Create New Site** (or use the site configuration panel).
3. Input the Site Code: `site_leeds`, Site Name: `Leeds Logistics Hub`, and Timezone: `Europe/London`. Click **Save**.
4. Navigate to **Production Lines** configuration.
5. Click **Add Production Line**. Assign to `Leeds Logistics Hub` (or current active site). Input Line Code: `LINE-A`, Line Name: `Packaging Line A`. Click **Save**.
6. Navigate to **Destinations** configuration.
7. Click **Add Destination**. Input Destination Code: `DEST-01`, Name: `Outbound Bay 1`. Click **Save**.

## Expected Result
- The new site `Leeds Logistics Hub`, production line `LINE-A`, and destination `DEST-01` are successfully saved in Firestore.
- They appear instantly on their respective lists and dropdowns with correct metadata.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
