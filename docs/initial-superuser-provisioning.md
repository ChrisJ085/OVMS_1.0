# Initial Superuser Provisioning

This document explains how to securely provision the first platform superuser for the OVMS application.

To harden the application's security, all client-side developer bootstrap shortcuts and fallback mechanisms that previously automatically granted `PLATFORM_SUPERUSER` privileges have been removed. The initial platform superuser must now be provisioned out-of-band using the Firebase Admin SDK.

## Requirements

You must run the provisioning script from an environment with Node.js installed, using the provided `scripts/provisionInitialSuperuser.ts`. This requires `firebase-admin` to be installed (which is included in the project's development dependencies).

### Environment Variables

Before running the script, you must provide the following environment variables. This can be done by exporting them in your terminal or adding them to a `.env` file at the root of the project.

- `FIREBASE_PROJECT_ID`: The ID of your Firebase project.
- `FIREBASE_CLIENT_EMAIL`: The client email from your Firebase Service Account credentials.
- `FIREBASE_PRIVATE_KEY`: The private key from your Firebase Service Account credentials. (If using a `.env` file, ensure newlines are properly represented as `\n`).
- `INITIAL_SUPERUSER_EMAIL`: The email address for the initial platform superuser (e.g., `admin@yourdomain.com`).
- `INITIAL_SUPERUSER_TEMP_PASSWORD`: A strong temporary password for the user.

> **CRITICAL SECURITY WARNING:** Do **not** commit your Firebase Admin service account credentials (private key, etc.) into version control or include them in any source code.

## Running the Provisioning Script

Use `tsx` to execute the TypeScript file:

```bash
npx tsx scripts/provisionInitialSuperuser.ts
```

### What the script does:

1. **Authentication**: Uses the Firebase Admin SDK to check if a Firebase Authentication user with the target email exists. If it does not, it securely creates the user with the given temporary password.
2. **Firestore Profile**: Queries the `users/{uid}` collection. If a profile doesn't exist, it writes a new profile document securely bypassing client-side Firestore security rules.
3. **Privileges**: The profile is granted the `PLATFORM_SUPERUSER` role.
4. **Security Enforcement**: The script sets `requiresPasswordChange: true`, forcing the user to securely change their password upon their first login attempt through the application.

## Post-Provisioning

- **Login and Update Password**: Have the user sign in via the browser application. The application will detect `requiresPasswordChange` and prompt the user to establish a new password before granting access.
- **Script Clean-up**: This script is intended as a **one-time** bootstrap tool. After successful provisioning, you do not need to run this script again. Ensure this script is not incorporated into standard operational deployments or automated startup routines.
