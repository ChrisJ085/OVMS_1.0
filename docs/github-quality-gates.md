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
   - Enable mandatory status checks corresponding to the CI workflow jobs:
     - `Type Check` (`npm run typecheck`)
     - `Run Unit Tests` (`npm run test`)
     - `Build Application` (`npm run build`)

3. **Enforce restrictions**
   - Do not allow force pushes (`--force`) on `main`.
   - Prevent direct deletion of `main`.
   - Restrict who can push to matching branches.

## CI Pipeline Overview

The CI pipeline is automatically triggered on every push and pull request to `main`:
- **Node.js Environment**: Runs on Node 20.x with npm cache enabled.
- **Dependency Installation**: Uses `npm ci` for deterministic, clean dependency resolution.
- **Type Checking**: Executes `tsc --noEmit` to verify type safety across all frontend and backend TypeScript files.
- **Unit Testing**: Runs Vitest across decision engine, MPPS7 parser, role permissions, and component test suites.
- **Production Build**: Executes `npm run build` and esbuild bundling to guarantee production container readiness.
