# OVMS Monitoring & Support Guide

This document defines the post-release operational monitoring setup, support procedures, incident management paths, and data governance cadence for the Operations Visual Management System (OVMS).

---

## 1. System Monitoring Setup

### A. Firebase Usage & Error Monitoring
- **Firestore Reads/Writes Tracker**: Monitored via Google Cloud Monitoring dashboard under project metrics. High spikes must trigger alerts to prevent billing shocks.
- **Firebase Authentication Failures**: Monitored via Auth logs in GCP Logging to capture brute-force or unauthorized credential entry attempts.
- **Rules Access Denied Logs**: Security rule rejections are logged as GCP Cloud Audit Logs. Weekly audits review these rejections to trace misbehaving clients or bad requests.

### B. Application Error Reporting Approach
- **Frontend Logging Exception Handler**: Intercepts unhandled errors using a React ErrorBoundary and logs them to the `auditLogs` or standard error logger.
- **DevTools Monitoring**: In-browser client states track real-time listeners (`onSnapshot`) to detect sudden closures or auth token expiration.

---

## 2. Incident & Support Management

### A. Operational Support Contact
For high-severity issues, contact the GXO Regional Solutions Support Desk:
- **Email**: `ovms.support@gxo.com`
- **Internal Extension**: 7000-OVMS

### B. Severity Levels

| Severity Tier | Criteria | Response Target (SLA) | Workaround Required? |
|---------------|----------|----------------------|----------------------|
| **L1 - CRITICAL** | TV Dashboard frozen sitewide, or real-time Firestore database unresponsive. Operations halted. | **15 Minutes** | No immediate workaround; rollback required. |
| **L2 - HIGH** | Planner unable to approve recommendations, or critical stock transfers fail to submit. | **1 Hour** | Operators can use manual overrides or fall back to spreadsheets. |
| **L3 - MEDIUM** | Performance lags (>5 seconds for imports) or minor display rendering anomalies on specific rows. | **4 Hours** | Standard operations continue. |
| **L4 - LOW** | Typos, styling updates, or non-blocking CSV export formatting requests. | **24 Hours** | Backlogged to next sprint cycle. |

### C. Incident Logging Procedure
Every reported issue must be registered in the central incident tracking system containing:
- **Timestamp** of failure
- **User Profile** / **Tenant ID** reporting
- **Steps to reproduce**
- **Symptom description** and browser version

---

## 3. Data Governance & Maintenance

### A. Data Owner Responsibilities
The designated **Data Steward** at each site is responsible for:
- Maintaining SKU master records in the local system.
- Correcting inventory balance anomalies reported by line operators.
- Triggering periodic baseline reconciliations (e.g. weekly physical audits matched against absolute balances).

### B. Regular Review Cadence

| Item Under Review | Frequency | Evaluated By | Purpose |
|-------------------|-----------|--------------|---------|
| **Planning Rules** | Monthly | Lead Planner & Site Manager | Adjust Min/Max thresholds to align with seasonal demand patterns and active promotions. |
| **User Access List**| Bi-Weekly | Tenant Admin | Disable inactive accounts, audit failed login logs, and verify site-id constraints. |
| **Audit Logs Archive**| Quarterly | Compliance Auditor | Review system modifications, bulk overrides, and user-tenant partition access logs. |
