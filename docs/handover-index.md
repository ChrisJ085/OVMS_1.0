# OVMS Handover Documentation Index

This index lists the mandatory technical manuals, standard operating procedures, and configuration guides compiled for the handover of the Operations Visual Management System (OVMS).

---

## 1. Core Technical Manuals

### [Volume 1: Software Requirements Specification (SRS)](/docs/srs-volume-1.md)
*Status: [Active / Final]*
Comprehensive baseline detailing functional requirements, responsive design layouts, DDXM mathematical calculations, security matrices, and multi-tenant isolation directives.

### [Volume 2: Build Phases and Execution Steps](/docs/build-phases-volume-2.md)
*Status: [Active / Final]*
Chronological development narrative capturing phase-by-phase deliverables, structural migrations, database rules hardening, and deployment procedures.

### [Data Model Definition & Firestore Schema](/docs/data-model.md)
*Status: [Active / Final]*
Formal documentation of collection structures (Products, Locations, Inventory, Priorities, Recommendations, Sessions, Audits) with complete type declarations and timestamp constraints.

---

## 2. Operational Standard Operating Procedures (SOPs)

### [User Guides: Planners & Site Managers](/docs/user-guide-planners.md)
*Status: [Active / Draft]*
Step-by-step walkthroughs explaining recommendation approval workflows, priority dispatch queues, planning rule creation, and promotions calendar setups.

### [User Guides: Warehouse Operators](/docs/user-guide-operators.md)
*Status: [Active / Draft]*
Terminal workflow instructions covering task acknowledgment, starting tasks, flagging blocks/holds with delay reasons, and completing handovers.

### [TV Monitor Display SOP](/docs/sop-tv-display.md)
*Status: [Active / Draft]*
Hardware setup manual for wall-mounted TV monitors. Details TV browser configuration, automated read-only display mode logins, and automatic screen refresh recovery on network dropouts.

---

## 3. Systems Administration & Troubleshooting

### [Administrator & Provisioning Guide](/docs/admin-guide.md)
*Status: [Active / Draft]*
Comprehensive manual for Superusers and Tenant Admins. Covers user provisioning, password resets, account unlocks, and CSV bulk utility exports.

### [Troubleshooting & Connection Manual](/docs/troubleshooting-guide.md)
*Status: [Active / Draft]*
Field recovery procedures for stale browser indicators, missing profile errors, Firestore permissions rejections, and CSV parsing validation faults.

---

## 4. Release History & Engineering Logs

### [Release Notes - Production Launch](/docs/release-checklist.md#4-release-notes)
Highlights new capabilities, structural hardening adjustments, performance figures, and baseline dependencies.

### [Change Log & Version History](/docs/change-log.md)
*Status: [Active / Draft]*
Detailed timeline of code commits, layout optimizations, rules updates, and hotfixes applied during the staging pipeline.
