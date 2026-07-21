# OVMS Platform Superuser Bootstrap Documentation

This document describes the design and usage of the secure, one-time bootstrap mechanism for creating the initial Platform Superuser account in the Operations Visual Management System (OVMS).

## 1. Security Architecture (AC-06)

To prevent client-side credential leaking or privileged client-side write injection, the bootstrap process uses a server-side gateway:
1. **Secure Cloud Function**: A Google Cloud Function (`bootstrapSuperuser`) is deployed in the secure Google Cloud environment.
2. **Zero Client-Side Privilege**: The client UI only requests the invocation of this function; it cannot directly write superuser records or grant privileges without backend validation.
3. **Target Account Gating**: The bootstrap function is hardcoded to only provision the email address `chris.jeal@gxo.com` as the `PLATFORM_SUPERUSER`. No other email addresses can be granted superuser status via this process.
4. **Automatic Fallback for Sandboxes**: In local developer environments, a secure developer-only bypass writes the profile directly, ensuring immediate availability during sandbox runs.

---

## 2. Default Bootstrap Profile

- **Email**: `chris.jeal@gxo.com`
- **Initial Password**: `Password123!` (Forces change on first login)
- **Role**: `PLATFORM_SUPERUSER`
- **Tenant Scope**: `null` (Global platform scope)
- **Status**: `ACTIVE`

---

## 3. How to Bootstrap in Local Development / AI Studio Preview

To run the bootstrap in your developer preview:
1. Open the application's login screen.
2. Click **Run Superuser Bootstrap** in the **Bootstrap Superuser Tool** panel at the bottom.
3. Once the alert confirms a successful bootstrap, enter the credentials:
   - **Email**: `chris.jeal@gxo.com`
   - **Password**: `Password123!`
4. Upon clicking **Sign In**, the system will detect that a password reset is required (first-login requirement) and will render the **Password Reset Required** screen.
5. Enter a strong new password (minimum 8 characters) to complete your account setup and access the system.

---

## 4. Production Deployment & Continuous Provisioning

Once the platform has been bootstrapped, further Platform Superusers and Tenant Administrators should **only** be created through the secure administration interface using the **Provision New Account** console, which internally delegates the operation to the secure Cloud Function gateway.
