# UAT-21: Account Lockout Lifecycle

## Metadata
* **Test ID**: UAT-21
* **Requirement**: Validate that accounts are locked after successive failed login attempts, and can be manually unlocked by an administrator.
* **Preconditions**: A valid user account `planner.test@gxo.com` exists.

## Steps
1. Navigate to the Login Screen.
2. Attempt to sign in as `planner.test@gxo.com` with an **incorrect** password 5 consecutive times.
3. Observe the login error message on the 5th attempt.
4. Try to sign in on the 6th attempt with the **correct** password.
5. Log in as a `TENANT_ADMIN` or `PLATFORM_SUPERUSER`.
6. Navigate to **Administration Console** -> **User Management**.
7. Locate `planner.test@gxo.com`, observe the account status (it should read `LOCKED`), and click the **Unlock Account** button.
8. Attempt to log in again with the correct password.

## Expected Result
- After 5 failed attempts, the user profile status changes to `LOCKED` in Firestore.
- Subsequent login attempts with the correct password are blocked, displaying a lockout warning message.
- Once the administrator unlocks the account, the status is reset to `ACTIVE`, and the user is successfully authenticated on their next correct login.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
