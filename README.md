# OVMS – Operations Visual Management System

Operations Visual Management System (OVMS) is a lightweight operational decision-support and visual management layer designed for warehouse planning, decision support, and real-time operational execution. It provides role-based workspaces, real-time priorities queueing, live KPI tracking, and TV dashboard display outputs to keep operations teams aligned and agile.

---

## Main Operational Purpose

OVMS is engineered to:
1. **Bridge Planning and Execution**: Dynamically translate planning goals, promotion calendars, and inventory states into prioritized, actionable warehouse tasks.
2. **Mitigate Out-of-Stock Vulnerabilities**: Identify potential stockout and delivery issues before they impact execution using a built-in operational decision engine.
3. **Enhance Floor Visibility**: Broadcast real-time queue states, active alerts, and communication announcements via auto-rotating widescreen TV displays (TV Dashboard).
4. **Isolate Tenancy & Roles**: Enforce strict data isolation between multiple warehouse sites and tenants, supporting distinct permissions for Platform Superusers, Tenant Admins, Planners, Operators, Viewers, and TV Displays.

---

## Technology Stack & Architecture

The application is built on a high-performance full-stack web and database architecture:

### 1. Frontend & Client Layer
* **React 19** with modern functional components, hooks, and clean state boundaries
* **TypeScript** for strict compile-time type safety across domain models and data transfers
* **Vite** for fast module bundling, dev server execution, and production builds
* **Tailwind CSS** for responsive, utility-first styling and theme tokens
* **Motion** (`motion/react`) for smooth page transitions and interactive micro-animations
* **Lucide React** for consistent, accessible iconography
* **Supabase JS Client** (`@supabase/supabase-js`) for reactive PostgreSQL querying and Realtime WebSocket subscriptions

### 2. Database & Persistence Layer (Supabase PostgreSQL)
* **PostgreSQL Engine**: Relational schema hosting operational entities including tenants, sites, users, inventory balances, movements, master items, locations, operational priorities, exceptions, announcements, KPIs, and audit logs.
* **Row-Level Security (RLS)**: Fine-grained security policies enforced directly at the database engine level (`docs/supabase_rls.sql`), guaranteeing complete tenant isolation and site-level authorization.
* **Internal Security Helper Functions (`ovms_internal`)**: Optimized SQL routines evaluating caller context:
  * `ovms_internal.auth_uid()` & `ovms_internal.get_user_role()`
  * `ovms_internal.is_platform_superuser()` & `ovms_internal.is_tenant_admin()`
  * `ovms_internal.has_site_access(site_uuid)`
* **Immutable Audit Trail**: Database-level trigger (`trg_audit_logs_immutable`) guaranteeing tamper-proof, non-deletable audit log records for forensic compliance.
* **Realtime Channels**: Instant broadcast of changes across displays and client sessions for live warehouse execution and priority queue updates.

### 3. Backend Service & Server API
* **Express.js API Layer** (`server.ts` & `src/server/apiApp.ts`) running on Node.js
* **Elevated Supabase Admin Client**: Authenticated via `SUPABASE_SECRET_KEY` for secured administrative operations:
  * Asynchronous tenant deletion workflows with background status polling and cascade cleanup
  * Superuser role preservation and safety guardrails
  * Secure user provisioning and administrative account management
* **Google Gemini AI Integration** (`@google/genai`): Server-side AI integration for intelligent operational summaries, pattern recognition, and decision support.

### 4. Testing & Quality Assurance
* **Vitest**: Blazing-fast unit and integration test runner
* **React Testing Library**: DOM-level component and integration verification
* **RLS & Security Regression Testing**: Automated test suites verifying database policies, authorization matrix rules, and API permission boundaries
* **TypeScript Quality Gate**: Zero-error typecheck validation (`npm run lint` / `npm run typecheck`)

---

## Role-Based Access Control (RBAC)

| Role | Scope | Permissions & Capabilities |
| :--- | :--- | :--- |
| **PLATFORM_SUPERUSER** | Global / Platform-wide | Cross-tenant administration, tenant provisioning/deletion, global audit access, all operational permissions. Does not require a tenant association. |
| **TENANT_ADMIN** | Tenant-wide | Manage tenant sites, users, master data, configurations, and tenant-level audit logs. |
| **PLANNER** | Assigned Sites | Create and manage production plans, operational priorities, and inventory adjustments. |
| **WAREHOUSE_OPERATOR** | Assigned Sites | View and execute site priorities, report exceptions, update execution progress. |
| **VIEWER** | Assigned Sites | Read-only access to operational overview, reports, and dashboards. |
| **DISPLAY** | Single Site / TV | Dedicated kiosk/display mode for full-screen rotating operational TV dashboards. |

---

## Local Development & Operations

### Prerequisites

* **Node.js**: v20 or newer is recommended.
* **Supabase Project / PostgreSQL Database**: Configured with the schema and RLS policies from `/docs`.

### 1. Installation

Install project dependencies deterministically:
```bash
npm ci
```

### 2. Environment Configuration

Create a `.env` file at the project root based on `.env.example`:
```env
# Application URL
APP_URL="http://localhost:3000"

# Supabase Client & Server Config
VITE_SUPABASE_URL="https://your-project.supabase.co/rest/v1/"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
SUPABASE_URL="https://your-project.supabase.co/rest/v1/"
SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-key"
SUPABASE_SECRET_KEY="your-supabase-service-role-secret-key"

# Gemini AI (Optional / Server-Side)
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Run Locally

Start the full-stack server (Express + Vite middleware) on port `3000`:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Database Setup & Migrations

The SQL schema, migrations, and security rules are documented in `/docs`:
* `docs/supabase_schema.sql`: Full table definitions and indexes
* `docs/supabase_rls.sql`: Row-Level Security policies and helper functions
* `docs/full_reset_and_recreate.sql`: Complete consolidated database reset and recreation script

### 5. Running Tests & Quality Checks

```bash
# Run all unit, integration, and security tests
npm run test

# Run typecheck and linting
npm run lint

# Run unified full pre-push validation (typecheck + test + build)
npm run validate
```

### 6. Build for Production

Compile TypeScript and bundle the frontend and server entrypoints for production:
```bash
npm run build
```
The compiled server output is written to `dist/server.cjs` and static assets to `dist/`. Launch with:
```bash
npm start
```

