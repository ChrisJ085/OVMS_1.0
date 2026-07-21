# UAT-14: Announcements

## Metadata
* **Test ID**: UAT-14
* **Requirement**: Validate the creation, display, and acknowledgement of sitewide broadcast announcements.
* **Preconditions**: Tester is logged in as `TENANT_ADMIN`. Another browser is logged in as `WAREHOUSE_OPERATOR`.

## Steps
1. On the Admin account, navigate to **Administration Console** -> **Announcements**.
2. Click **Post Sitewide Announcement**.
3. Complete the form:
   - Message: `Severe weather alert: Expect delivery delays for afternoon inbound trucks.`
   - Priority: `HIGH`
   - Active: `true`
4. Click **Publish**.
5. Switch to the `WAREHOUSE_OPERATOR` screen.

## Expected Result
- A prominent broadcast alert banner is rendered at the top of the operator's display.
- The operator can read and dismiss the banner. Dismissal is recorded so it does not reappear on their current session.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
