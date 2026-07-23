# GitHub Quality Gates & Branch Protection Policy

This document outlines the recommended and mandatory branch protection rules for the OVMS repository to ensure code quality, security compliance, and robust release integrity.

## Recommended Branch Protection Rules for `main`

To maintain production stability and prevent regressions, configure the following settings under **Settings > Branches > Branch protection rules** for `main`:

1. **Require a pull request before merging**
   - Require approvals: At least 1 code review approval from a designated maintainer or tech lead.
   - Dismiss stale pull request approvals when new commits are pushed.
   - Require review from Code Owners.

2. **Require status checks to pass before merging**
   - Require branches to be up to date before merging.
   - Enable the mandatory status check corresponding to the CI workflow job:
     - `build-and-test`
     - *Note:* In GitHub, this status check represents the unified job in our `.github/workflows/ci.yml` pipeline that encompasses type checking, unit tests, security-rule tests, and production build checks.

3. **Enforce restrictions**
   - Do not allow force pushes (`--force`) on `main`.
   - Prevent direct deletion of `main`.
   - Restrict who can push to matching branches.

---

## CI Pipeline & Quality Gates Overview

The CI pipeline is automatically triggered on every push and pull request to `main` and `master`:

- **Execution Environment**: Runs on `ubuntu-latest`.
- **Node.js**: Set up with Node 20.x and `npm` package caching.
- **Java Platform**: Configured with OpenJDK (Temurin distribution, version 21). Java is strictly required to run the local Firestore Emulator.
- **Isolate Environment (No Credentials Needed)**: All tests run inside an isolated local Firestore emulator environment on a demo project (`demo-ovms-test`). No production keys, service accounts, or external network calls to live Firebase are required.
- **Pipeline Failure Conditions**: The workflow is configured to fail on any step failure (using no `continue-on-error` escapes). The build will fail if:
  - TypeScript compilation has any type or syntax errors (`npm run typecheck`).
  - Unit tests fail to pass (`npm run test`).
  - Firestore security rules fail to compile or any rule test fails (`npm run test:rules`).
  - The production bundles fail to build cleanly (`npm run build`).

### Pipeline Steps in Order

1. **Checkout Repository** (`actions/checkout@v4`)
2. **Set up Node.js** (`actions/setup-node@v4` with Node v20)
3. **Set up Java** (`actions/setup-java@v4` with Temurin v21)
4. **Install Dependencies** (`npm ci` for deterministic clean installation)
5. **Type Check** (`tsc --noEmit` via `npm run typecheck`)
6. **Run Unit Tests** (`npm run test` using Vitest)
7. **Run Firestore Security Rule Tests** (`npm run test:rules` executing inside the Firestore emulator)
8. **Build Application** (`npm run build` compiling assets and compiling/bundling the standalone application)

---

## How to Reproduce CI Locally

To make local development seamless, we provide two scripts in `package.json` to pre-validate your branches before pushing.

### 1. Full Validation (Closest to CI)
If you have Java installed locally (Java 21+ is highly recommended), run:
```bash
npm run validate:full
```
This executes:
```bash
npm run typecheck && npm run test && npm run test:rules && npm run build
```
This will launch the Firestore Emulator, run all 39+ security rule test cases, shut down the emulator cleanly, and run all other unit tests, typechecks, and builds.

### 2. Standard Validation (No Java Dependency)
If you do not have Java installed on your local workstation and cannot run the Firebase emulator, run:
```bash
npm run validate
```
This executes:
```bash
npm run typecheck && npm run test && npm run build
```
This bypasses the local emulator rule testing, allowing you to quickly verify type safety, unit tests, and production compilation locally while relying on the remote GitHub Actions environment to perform the emulator security checks.

---

## Common Emulator Failures and Solutions

When running `npm run test:rules` or `npm run validate:full` locally, you may encounter the following issues:

### 1. Port Conflict (Address already in use)
* **Symptom**: The Firestore Emulator fails to start, showing an error about port `9090` already in use.
* **Explanation**: Another process (possibly an old emulator instance that wasn't shut down cleanly, or another local application) is using port `9090`.
* **Solution**: Find and kill the process using port `9090` or stop the other application:
  ```bash
  # On macOS/Linux:
  lsof -i :9090
  kill -9 <PID>
  ```

### 2. Java Missing or Invalid Version
* **Symptom**: `firebase emulators:exec` exits immediately with an error about java missing, or the emulator fails to run.
* **Explanation**: The Firebase CLI Emulator requires a compatible Java Runtime Environment (JRE). Java 21 is recommended.
* **Solution**: Install OpenJDK 21. For example, on Ubuntu/Debian:
  ```bash
  sudo apt-get update && sudo apt-get install openjdk-21-jre-headless
  ```
  On macOS (using Homebrew):
  ```bash
  brew install openjdk@21
  ```

### 3. Firestore Rules Compilation Failure
* **Symptom**: The emulator fails to boot or test assertions fail with parse errors pointing to `firestore.rules`.
* **Explanation**: There is a syntax error or semantic violation in `firestore.rules`.
* **Solution**: Inspect the syntax in `firestore.rules`. Ensure you use correct parentheses, logical operators, and standard helper structures conforming to rules version `2`.
