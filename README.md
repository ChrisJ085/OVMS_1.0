# OVMS – Operations Visual Management System

Operations Visual Management System (OVMS) is a lightweight operational decision-support and visual management layer designed for warehouse planning, decision support, and real-time operational execution. It provides role-based workspaces, real-time priorities queueing, live KPI tracking, and TV dashboard display outputs to keep operations teams aligned and agile.

---

## Main Operational Purpose

OVMS is engineered to:
1. **Bridge Planning and Execution**: Dynamically translate planning goals, promotion calendars, and inventory states into prioritized, actionable warehouse tasks.
2. **Mitigate Out-of-Stock Vulnerabilities**: Identify potential stockout and delivery issues before they impact execution using a built-in operational decision engine.
3. **Enhance Floor Visibility**: Broadcast real-time queue states, active alerts, and communication announcements via auto-rotating widescreen TV displays (TV Dashboard).
4. **Isolate Tenancy & Roles**: Enforce strict data isolation between multiple warehouse sites and tenants, supporting distinct permissions for Admins, Planners, Operators, Viewers, and TV Displays.

---

## Technology Stack

The application is built on a modern full-stack web architecture:

* **Frontend**:
  * **React 19** with functional hooks
  * **TypeScript** for strict compile-time type safety
  * **Vite** as a lightning-fast build tool and dev server
  * **Tailwind CSS** for clean, responsive, utility-first styling
  * **Motion** (`motion/react`) for smooth fluid layouts and page transitions
  * **Lucide React** for consistent icon representation

* **Backend & Persistence**:
  * **Google Cloud Firestore (Firebase)** for low-latency real-time synchronization
  * **Firebase Authentication** with temporary password enforcement
  * **Firestore Security Rules** ensuring cross-tenant boundaries and role-based write rules are enforced directly at the database layer

* **Testing & Quality Assurance**:
  * **Vitest** for blistering fast unit and integration tests
  * **React Testing Library** for robust DOM-based UI component verification
  * **Firebase Rules Unit Testing** for programmatic validation of security policies inside a local emulator

---

## Current Project Status

* **Core Application**: Fully functional with support for dynamic priorities, promotions, exceptions tracking, user role management, and audit logging.
* **Testing Coverage**: Comprehensive test coverage encompassing UI rendering, route guard verification, state machines, date-parsers, and Firestore security rule correctness (39+ security rules scenarios verified).
* **Continuous Integration (CI)**: Integrated via GitHub Actions `.github/workflows/ci.yml` verifying TypeScript compiler integrity, Vitest tests, and Firestore rules in a clean, sandboxed emulator.

---

## Local Development & Operations

### Prerequisites

* **Node.js**: v20 or newer is highly recommended.
* **Java Runtime Environment (JRE)**: Java 21+ (required to run the Firestore local emulator suite).

### 1. Installation

Install project dependencies deterministically using `npm`:
```bash
npm ci
```

### 2. Run Locally

Start the Vite development server locally on port `3000`:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run Testing Suites

OVMS has two main testing layers:

#### A. Run Unit & UI Tests
To execute standard Vitest and React component test suites without starting the emulator:
```bash
npm run test
```

#### B. Run Firestore Security Rules Tests
To spin up a local Firestore Emulator instance, compile `firestore.rules`, and run the security suite:
```bash
npm run test:rules
```

### 4. Run Unified Pre-Push Validation

To run full checks locally exactly as they would run on GitHub Actions CI:

#### Full Validation (Requires Java)
Runs typecheck, unit tests, security rule emulator tests, and production build:
```bash
npm run validate:full
```

#### Standard Validation (No Java dependency)
Runs typecheck, unit tests, and production build, bypassing the emulator rules checks:
```bash
npm run validate
```

### 5. Build for Production

Compile TypeScript and build optimized static assets in the `dist/` directory:
```bash
npm run build
```

---

## Configuration & Environment

Create a `.env` file at the root based on `.env.example`. Environment configuration parameters include:
* Firebase project identifier
* Firestore database endpoint mapping

All sensitive API tokens and credentials are kept entirely server-side or bound securely via platform configuration profiles to prevent leakages.
