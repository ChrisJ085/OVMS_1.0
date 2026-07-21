# UAT-22: Password Change Flow

## Metadata
* **Test ID**: UAT-22
* **Requirement**: Validate that newly created users are forced to change their password on first login, and that any user can trigger a password change.
* **Preconditions**: A new user profile `temp.user@gxo.com` has been provisioned with `requiresPasswordChange: true`.

## Steps
1. Navigate to the login screen and authenticate as `temp.user@gxo.com` with the temp password.
2. Confirm that the application forces redirection to a **Change Password** screen and locks access to other views.
3. Attempt to save an invalid or short password (e.g., `123`). Verify validation.
4. Input a strong password (e.g., `SecurePass2026!`) and click **Submit**.
5. Once submitted, verify access is restored to standard screens.

## Expected Result
- Redirection to `/change-password` is enforced instantly on successful login if `requiresPasswordChange` is true.
- Submitting a strong password updates the account on Firebase Auth, clears the `requiresPasswordChange` flag, and redirects the user to the operational dashboard.

## Run Status
* **Actual Result**: 
* **Pass/Fail**: 
* **Tester**: 
* **Date**: 
* **Defect Reference**: 
