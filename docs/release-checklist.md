# OVMS Release Checklist

This document details the mandatory pre-requisites, gate checks, and validation procedures required for deploying the Operations Visual Management System (OVMS) to the live production environment.

## 1. Release Identification
- **Release Version**: v1.0.0-PROD
- **Target Deployment Date**: July 21, 2026
- **Release Coordinator**: Chris Jeal (Global Platform Superuser)
- **Deployment Platform**: Cloud Run Containerized Ingress + Firebase Services

---

## 2. Pre-Deployment Readiness Check

| Check ID | Phase / Verification Target | Status | Assigned Owner | Date Verified |
|----------|-----------------------------|--------|----------------|---------------|
| **RC-01** | **Approved Requirements**: Baseline SRS and deliverables signed off | [ ] | Product Owner | |
| **RC-02** | **Successful Compilation**: Production build (`npm run build`) passes cleanly | [ ] | Release Eng | |
| **RC-03** | **Firestore Indexes Deployed**: Compound composite index configuration active | [ ] | Database Admin| |
| **RC-04** | **Firestore Rules Active**: Security rules deployed and validated | [ ] | Security Lead | |
| **RC-05** | **Cloud Functions Deployed**: Security and bootstrap endpoints validated | [ ] | Backend Eng | |
| **RC-06** | **Superuser Bootstrapped**: Platform Superuser account initialized | [ ] | Systems Admin | |
| **RC-07** | **Tenant & Site Configured**: Initial tenant directories and site locations active | [ ] | Solutions Arch| |
| **RC-08** | **UAT Execution Complete**: All 24 test scripts passed or signed off | [ ] | Test Lead | |
| **RC-09** | **Production Data Ingestion**: Clean SKU master records loaded | [ ] | Data Steward | |
| **RC-10** | **Display Hardware Tested**: Monitor screens validated with VIEWER profile | [ ] | Infrastructure | |
| **RC-11** | **Network Latency & Stale Checks**: Redundant stale checks validated | [ ] | NetOps | |
| **RC-12** | **Backup Executed**: Pre-deployment snapshot of active database collections taken | [ ] | Database Admin| |
| **RC-13** | **Support Ownership Defined**: Support teams trained and logs integrated | [ ] | Support Mgr | |

---

## 3. Rollback Action Plan

In the event of a catastrophic deployment failure, security breach, or critical performance issue, the following rollback procedures must be executed. Do not attempt unapproved dynamic hotfixes on live production nodes.

### Standard Rollback Procedures

#### A. Previous Hosting Version Rollback
If the frontend static bundle contains critical bugs:
1. Open the **Firebase Console** or **Cloud Run / Container Registry**.
2. Select the **Hosting** or **Revision** management tab.
3. Locate the previous working stable version tag (e.g., `v0.9.5-beta`).
4. Click **Rollback / Deploy Selected Version**.
5. Verify that traffic redirects successfully within 60 seconds.

#### B. Security Rules Rollback
If a firestore rule update causes runtime blocking or security leaks:
1. Locate the previous stable `firestore.rules` file in the version control repository.
2. Run the deployment CLI:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. Confirm that the rules revert instantly across all clients.

#### C. Cloud Functions Rollback
If a compiled function deploy fails:
1. Re-deploy the previously compiled bundle or redeploy using the stable Git tag:
   ```bash
   firebase deploy --only functions
   ```

#### D. Live Data Correction Process
* **WARNING**: Firebase Firestore does not support point-in-time automated rollback without formal database backups.
* In the event of catastrophic data corruption, initiate the **Firestore Restore** process using the backup snapshot stored in Cloud Storage.
* For smaller scope corrections, use the **Data Utilities** page to re-upload the master data using `ABSOLUTE_BALANCE` or `INITIAL_BALANCE` mode.

---

## 4. Release Notes
- **Initial Core Launch**: Transitioned from sandbox mock state to complete real-time Firebase-backed operations.
- **Enterprise Security Matrix**: Role-based access controls fully enforced at the database layer (Firestore Rules).
- **Multi-Tenant Partitioning**: Enforced logical isolation by `tenantId` across all operational views.
- **Real-Time Display Mode**: Full-screen TV monitoring interface with auto-connecting subscription listeners.
