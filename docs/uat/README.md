# OVMS User Acceptance Testing (UAT) Pack

This directory contains the formal User Acceptance Testing (UAT) scripts for the Operations Visual Management System (OVMS). These scripts are designed to validate system capabilities, security controls, multi-tenant boundaries, and real-time responsiveness prior to production release.

## UAT Execution Instructions
1. **Pre-requisites**: Ensure you have run the **Superuser Bootstrap** to create the initial `PLATFORM_SUPERUSER` account (`chris.jeal@gxo.com`), and completed the password reset.
2. **Execution**: For each script, the tester must verify the preconditions, execute the steps literally, and log the results against the expected outputs.
3. **Roles Required**:
   - `PLATFORM_SUPERUSER`
   - `TENANT_ADMIN`
   - `PLANNER`
   - `WAREHOUSE_OPERATOR`
   - `VIEWER`

---

## Test Script Index

| Test ID | Scenario | Target Functionality | File Link |
|---------|----------|----------------------|-----------|
| **UAT-01** | Configuration Setup | Global site, line, and destination definitions | [01-configuration-setup.md](01-configuration-setup.md) |
| **UAT-02** | Product Creation | Registering inventory SKU profiles | [02-product-creation.md](02-product-creation.md) |
| **UAT-03** | Location and Inventory Load | Bulk CSV ingestion and balance initialization | [03-location-inventory-load.md](03-location-inventory-load.md) |
| **UAT-04** | Stock Transfer | Moving goods between inventory locations | [04-stock-transfer.md](04-stock-transfer.md) |
| **UAT-05** | Planning Rule and DDXM | Dynamic decision execution rules & thresholds | [05-planning-rule-ddxm.md](05-planning-rule-ddxm.md) |
| **UAT-06** | Current and Next Production | Planning production runs & queue orders | [06-current-next-production.md](06-current-next-production.md) |
| **UAT-07** | Promotion Impact | Scheduling promotions and demand spikes | [07-promotion-impact.md](07-promotion-impact.md) |
| **UAT-08** | Decision Scenarios | Evaluating simulated inventory alerts | [08-decision-scenarios.md](08-decision-scenarios.md) |
| **UAT-09** | Recommendation Approval | Transitioning system suggestions to operational priorities | [09-recommendation-approval.md](09-recommendation-approval.md) |
| **UAT-10** | Recommendation Override | Modifying or bypassing auto-generated decisions | [10-recommendation-override.md](10-recommendation-override.md) |
| **UAT-11** | Priority Creation & Scheduling | Scheduling urgent material line replenishment tasks | [11-priority-creation-scheduling.md](11-priority-creation-scheduling.md) |
| **UAT-12** | Warehouse Acknowledge/Start/Block/Complete | Task execution status workflow on operational floor | [12-warehouse-execution-workflow.md](12-warehouse-execution-workflow.md) |
| **UAT-13** | TV Dashboard Live Update | Automated data updates without page reload | [13-tv-dashboard-live-update.md](13-tv-dashboard-live-update.md) |
| **UAT-14** | Announcements | Broadcasting critical operational warnings | [14-announcements.md](14-announcements.md) |
| **UAT-15** | Exceptions | Logging bottlenecks, stock shortages & system incidents | [15-exceptions.md](15-exceptions.md) |
| **UAT-16** | History and Reports | Exporting CSV audit trails and analytics logs | [16-history-and-reports.md](16-history-and-reports.md) |
| **UAT-17** | Superuser Tenant Creation | Multi-tenant setup & baseline parameters | [17-superuser-tenant-creation.md](17-superuser-tenant-creation.md) |
| **UAT-18** | Tenant Admin User Creation | Admin user provisioning & role setup | [18-tenant-admin-user-creation.md](18-tenant-admin-user-creation.md) |
| **UAT-19** | Role Restrictions | Verifying UI & feature blocks by user role | [19-role-restrictions.md](19-role-restrictions.md) |
| **UAT-20** | Cross-Tenant Security | Confirming data isolation and database partitions | [20-cross-tenant-security.md](20-cross-tenant-security.md) |
| **UAT-21** | Account Disable/Lock/Unlock | Handling failed logins and direct administrator unlock | [21-account-lockout-lifecycle.md](21-account-lockout-lifecycle.md) |
| **UAT-22** | Password Change | First-time login password resets & regular security updates | [22-password-change-flow.md](22-password-change-flow.md) |
| **UAT-23** | TV Display Account | Dedicated, non-interactive visual monitor credentials | [23-tv-display-account.md](23-tv-display-account.md) |
| **UAT-24** | Network / Stale Data Handling | Resilient offline checks & connection indicators | [24-network-stale-data-handling.md](24-network-stale-data-handling.md) |
