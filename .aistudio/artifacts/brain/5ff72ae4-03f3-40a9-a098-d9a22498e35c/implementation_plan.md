# Immediate Forced Sign-Out on Admin Password Reset & Account Status Change

Deliver immediate session termination when an administrator resets a user's password to a temporary password or disables/locks their account, signing active browser sessions out to the Login screen with a clear security notice.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product behaviors were confirmed and govern this implementation:

- **Confirmed Decision 1 (Password Reset Behavior)**: When an administrator resets a logged-in user's password, the user's active browser session is immediately signed out and redirected to the Login screen with a security notice instructing them to sign in using their new temporary password.
- **Confirmed Decision 2 (Account Status Enforcement)**: When an administrator disables, locks, or archives a logged-in user's account, the user's active browser session is also immediately signed out to the Login screen with an account status notice.

---

## 1. Overview & Core Concept

- **What It Does**: Combines server-side Supabase Auth token revocation with a real-time profile state subscription so that administrative security actions (password resets, account locks, and account disablements) take effect immediately across all open browser tabs for that user.
- **Target Audience / Persona**: Platform Superusers and Tenant Administrators managing operational security, and end users (Planners, Warehouse Operators, Viewers, Display accounts) whose credentials or access states are updated.
- **Key Value**: Eliminates the window where a user with a revoked password or disabled account could remain active in an already-open browser session until their JWT expires.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Admin Resets User Password**:
     - Administrator triggers a temporary password reset for a target user in the Administration portal.
     - The backend updates the user's password in Supabase Auth, revokes their server-side sessions, and marks `requires_password_change = true` on their user profile.
     - If the target user is currently logged in on any device or browser tab, their session immediately terminates and transitions to the Login screen.
     - A prominent security alert banner is displayed on the Login screen: *"Your password has been reset by an administrator. Please sign in with your new temporary password."*
     - Upon signing in with the temporary password, the user is guided into the mandatory Change Password screen.
  2. **Admin Disables or Locks User Account**:
     - Administrator changes a user's status to `DISABLED` or `LOCKED`.
     - If the target user is currently logged in, their active session immediately signs out to the Login screen displaying: *"Your account is currently disabled/locked. Please contact your administrator."*
- **Visual Identity & Theme**:
  - Preserves the existing dark slate (`bg-slate-950`) operational login interface and high-contrast amber/red alert banners (`border-red-500/40`, `bg-red-500/10`, `text-red-300`) already used for authentication errors and tenant status notices.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Layer Session Termination (Server Revocation + Real-Time Push)**
  - *Chosen Approach*: Revoke refresh tokens server-side via the Supabase Admin API during password reset AND subscribe to real-time profile updates on the client.
  - *Why*: Server-side sign-out invalidates refresh tokens so sessions cannot be renewed, while the real-time listener forces open browser tabs to drop their in-memory JWT and sign out within milliseconds.
  - *Alternatives Considered*: Relying solely on server-side token revocation was passed over because stateless JWT access tokens remain valid in open tabs until their expiry window elapses.
- **Decision 2: Guarding Self-Initiated Password Changes**
  - *Chosen Approach*: Track when a user is actively submitting their own password change (`isChangingPasswordRef`) and only trigger forced sign-out when `requires_password_change` transitions to `true` from an external administrative action.
  - *Why*: Ensures a user completing their own mandatory password change is never mistakenly signed out by their own update event.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Administrator Browser                             │
│  [Admin Overview Portal] ──(POSTReset Password / Update Status)──┐      │
└──────────────────────────────────────────────────────────────────┼──────┘
                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Backend API Server                              │
│  1. Update Auth Password & Metadata (`requires_password_change: true`)  │
│  2. Revoke Active Auth Sessions (`auth.admin.signOut(userId, 'global')`)│
│  3. Update `public.users` (`requires_password_change = true`, timestamp)│
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Supabase Postgres & Realtime                       │
│  `public.users` Row Updated ──(Postgres Changes Broadcast: id=eq.uid)   │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Target User Active Browser                         │
│  [AuthContext Realtime Listener]                                        │
│    ├─ Detects `requires_password_change === true` (External Reset)      │
│    ├─ Detects `account_status !== 'ACTIVE'` (Disabled / Locked)         │
│    ▼                                                                    │
│  [Immediate Local Sign-Out (`logoutUser()`)]                            │
│    ▼                                                                    │
│  [Login Screen Rendered with Security Notice Banner]                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **`public.users` Table**:
  - `requires_password_change` (`BOOLEAN`): Set to `true` when an admin resets the user's password; cleared to `false` when the user completes their password change.
  - `account_status` (`TEXT`): Tracks `ACTIVE`, `DISABLED`, `LOCKED`, or `ARCHIVED`.
  - `updated_at` (`TIMESTAMPTZ`): Updated on every administrative reset or status change so Postgres Realtime always emits a change payload even if `requires_password_change` was already `true`.
- **Realtime Publication**:
  - Ensure `public.users` is registered in the `supabase_realtime` publication so row-level `UPDATE` events are delivered to authenticated subscribers permitted by RLS (`id = auth.uid()`).

### Interactive Component & State Mapping
- **Admin Password Reset Endpoint**:
  - Updates password and metadata in Supabase Auth.
  - Invokes global session sign-out via the Admin Auth API (wrapped safely so password reset still succeeds even if the user has no active session).
  - Updates `public.users` with `requires_password_change: true` and a fresh `updated_at` timestamp.
- **Auth Context User Channel Subscription**:
  - Subscribes to `postgres_changes` (`UPDATE` on `public.users` filtered by `id=eq.${userProfile.id}`) alongside the existing tenant status subscription.
  - When `account_status` becomes non-active, executes `logoutUser()`, clears `user` and `userProfile`, and sets `authError` (`ACCOUNT_LOCKED`).
  - When `requires_password_change` is `true` on an incoming update (and the user is not currently on or submitting the initial password change screen), executes `logoutUser()`, clears `user` and `userProfile`, and sets `authError` (`PASSWORD_RESET_BY_ADMIN`).
