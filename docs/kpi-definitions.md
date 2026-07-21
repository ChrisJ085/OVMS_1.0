# OVMS KPI Definitions

This document details the formulas and logic used for the OVMS KPI Dashboard.
Calculations should use the site timezone and exclude logically cancelled records where appropriate.

## Priority Metrics

*   **Active Priorities**: Count of priorities where \`priorityStatus\` is one of: OPEN, ASSIGNED, IN_PROGRESS, BLOCKED.
*   **Priorities Created Today**: Count of priorities where \`createdDate\` is within the current calendar day (site timezone).
*   **Priorities Completed Today**: Count of priorities where \`completedAt\` is within the current calendar day (site timezone) and \`priorityStatus\` is COMPLETED.
*   **Completion Rate**: (Priorities Completed Today / (Priorities Created Today + Active Priorities carried over from previous days)) * 100. *Note: For simplicity in the initial dashboard, it may be calculated as (Completed Today / (Completed Today + Active))*
*   **Average Time to Acknowledge**: Average duration between \`createdDate\` and \`assignedAt\` (or first status change from OPEN) for priorities completed or started today.
*   **Average Time to Start**: Average duration between \`createdDate\` and \`startedAt\` (when status becomes IN_PROGRESS) for priorities started today.
*   **Average Time to Complete**: Average duration between \`createdDate\` and \`completedAt\` for priorities completed today.
*   **Blocked Priority Count**: Count of active priorities where \`priorityStatus\` is BLOCKED.
*   **Overdue/Expired Incomplete Count**: Count of active priorities where \`targetCompletionTime\` is in the past.

## Recommendation Metrics

*   **Recommendation Approval Rate**: (Count of Recommendations with status ACCEPTED) / (Count of Recommendations with status ACCEPTED + REJECTED) * 100 over a specific timeframe (e.g., today).
*   **Recommendation Override Rate**: Count of Recommendations where the executed action details (e.g., quantity, destination) differ from the recommended action. *Note: This requires comparing the original recommendation with the resulting priority or movement.*
*   **Manual Priority Percentage**: (Count of Priorities created manually (not from a recommendation) / Total Priorities Created) * 100 over a specific timeframe.

## Inventory / DDXM Metrics

*   **Products Below Controlling Retention**: Count of unique products where the total sellable quantity in picking locations is less than the \`controllingRetentionQuantity\`.
*   **Products Above Maximum**: Count of unique products where the total quantity in picking locations exceeds the \`maxQuantity\`.
*   **DDXM Compliance Percentage**: A composite metric reflecting how well the current inventory distribution matches the DDXM planning parameters (between min/max/retention). *Basic calculation: (Total Products - (Products Below Retention + Products Above Max)) / Total Products * 100.*
*   **Inventory Stale Product Count**: Count of unique products that have not had a stock movement (pick or putaway) within a defined stale threshold (e.g., 30 days) and have non-zero quantity.

## Operational Exceptions

*   **Active Exceptions**: Count of exceptions in OPEN or ACKNOWLEDGED status.
*   **Critical Exceptions**: Count of active exceptions with CRITICAL severity.
*   **Exception Resolution Rate**: (Exceptions RESOLVED today / Exceptions OPENED or active today) * 100.
