import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Supabase RLS Security & Hardening Rules', () => {
  let rlsSql: string = '';

  beforeAll(() => {
    const filePath = path.join(process.cwd(), 'docs', 'supabase_rls.sql');
    if (fs.existsSync(filePath)) {
      rlsSql = fs.readFileSync(filePath, 'utf-8').toUpperCase();
    }
  });

  it('Ensures docs/supabase_rls.sql exists for automated schema validation', () => {
    expect(rlsSql).toBeTruthy();
  });

  it('No permissive "FOR ALL" policies are used', () => {
    // We should strictly separate SELECT, INSERT, UPDATE, DELETE
    expect(rlsSql).not.toContain('FOR ALL');
  });

  it('SECURITY DEFINER functions use a pinned search_path = ""', () => {
    // Every SECURITY DEFINER must specify SET search_path = '' to prevent search path injection attacks
    const definerCount = (rlsSql.match(/LANGUAGE PLPGSQL SECURITY DEFINER/g) || []).length;
    const searchPathCount = (rlsSql.match(/SET SEARCH_PATH = ''/g) || []).length;
    expect(searchPathCount).toBeGreaterThanOrEqual(definerCount);
    expect(definerCount).toBeGreaterThanOrEqual(6);
  });

  it('Security functions are moved to the internal schema and fully schema-qualified', () => {
    expect(rlsSql).toContain('CREATE SCHEMA IF NOT EXISTS OVMS_INTERNAL');
    expect(rlsSql).toContain('OVMS_INTERNAL.GET_AUTH_USER()');
    expect(rlsSql).toContain('OVMS_INTERNAL.IS_PLATFORM_SUPERUSER()');
    expect(rlsSql).toContain('OVMS_INTERNAL.IS_TENANT_ADMIN(');
    expect(rlsSql).toContain('OVMS_INTERNAL.HAS_TENANT_ACCESS(');
    expect(rlsSql).toContain('OVMS_INTERNAL.HAS_SITE_ACCESS(');
  });

  it('User identity resolution is strictly anchored to auth.uid() and not email', () => {
    // Ensure get_auth_user resolves strictly via auth.uid()
    expect(rlsSql).toContain('SELECT * INTO U FROM PUBLIC.USERS WHERE ID = AUTH.UID()');
    // Ensure email is never queried as an identity fallback in security definer functions
    expect(rlsSql).not.toContain('WHERE EMAIL = AUTH.EMAIL()');
    expect(rlsSql).not.toContain('OR U.EMAIL =');
  });

  it('Tenant Admin privilege limits: Triggers prevent creating or promoting to superuser or tenant admin', () => {
    expect(rlsSql).toContain('TRG_USERS_PREVENT_ESCALATION');
    expect(rlsSql).toContain("NEW.ROLE IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN')");
    expect(rlsSql).toContain('TENANT ADMINS CANNOT CREATE PLATFORM_SUPERUSER OR TENANT_ADMIN ACCOUNTS');
    expect(rlsSql).toContain('TENANT ADMINS CANNOT GRANT PLATFORM_SUPERUSER OR TENANT_ADMIN ROLES');
    expect(rlsSql).toContain('TENANT ADMINS CANNOT MOVE USERS BETWEEN TENANTS');
  });

  it('Tenant Admin privilege limits: Sensitive security and auth fields are preserved', () => {
    // On update, sensitive auth fields are preserved from OLD
    expect(rlsSql).toContain('NEW.ID := OLD.ID');
    expect(rlsSql).toContain('NEW.EMAIL := OLD.EMAIL');
    expect(rlsSql).toContain('NEW.TENANT_ID := OLD.TENANT_ID');
    expect(rlsSql).toContain('NEW.FAILED_LOGIN_ATTEMPTS := OLD.FAILED_LOGIN_ATTEMPTS');
    expect(rlsSql).toContain('NEW.LOCKED_AT := OLD.LOCKED_AT');
    expect(rlsSql).toContain('NEW.REQUIRES_PASSWORD_CHANGE := OLD.REQUIRES_PASSWORD_CHANGE');
  });

  it('Tenant Admin user management policies enforce role restrictions in RLS', () => {
    // INSERT policy checks role NOT IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN')
    expect(rlsSql).toContain("ROLE NOT IN ('PLATFORM_SUPERUSER', 'TENANT_ADMIN')");
    // Site assignment ensures target site belongs to target user tenant
    expect(rlsSql).toContain('S.TENANT_ID = (SELECT U.TENANT_ID FROM PUBLIC.USERS U');
  });

  it('Audit Logs are explicitly enforced as immutable with restricted insertion', () => {
    expect(rlsSql).toContain('TRG_AUDIT_LOGS_IMMUTABLE');
    expect(rlsSql).toContain('BEFORE UPDATE ON PUBLIC.AUDIT_LOGS');
    expect(rlsSql).toContain('BEFORE DELETE ON PUBLIC.AUDIT_LOGS');
    expect(rlsSql).toContain('CREATE POLICY "AUDITLOGS: UPDATE" ON PUBLIC.AUDIT_LOGS FOR UPDATE USING (FALSE)');
    expect(rlsSql).toContain('CREATE POLICY "AUDITLOGS: DELETE" ON PUBLIC.AUDIT_LOGS FOR DELETE USING (FALSE)');
    // Regular users cannot manufacture privileged security actions
    expect(rlsSql).toContain('SECURITY_OVERRIDE');
    expect(rlsSql).toContain('TENANT_DELETION_INITIATED');
  });

  it('Historical operational records are immutable', () => {
    // Inventory movements, production events, and priority events should not allow UPDATE or DELETE
    expect(rlsSql).toContain('INVENTORY_MOVEMENTS FOR UPDATE USING (FALSE)');
    expect(rlsSql).toContain('INVENTORY_MOVEMENTS FOR DELETE USING (FALSE)');
    expect(rlsSql).toContain('PRODUCTION_EVENTS FOR UPDATE USING (FALSE)');
    expect(rlsSql).toContain('PRODUCTION_EVENTS FOR DELETE USING (FALSE)');
    expect(rlsSql).toContain('PRIORITY_EVENTS FOR UPDATE USING (FALSE)');
    expect(rlsSql).toContain('PRIORITY_EVENTS FOR DELETE USING (FALSE)');
  });

  it('DISPLAY role users are strictly restricted from the raw priorities dataset', () => {
    // Priorities table SELECT/INSERT/UPDATE explicitly excludes DISPLAY role
    expect(rlsSql).toContain('CREATE POLICY "PRIORITIES: SELECT" ON PUBLIC.PRIORITIES FOR SELECT USING (');
    expect(rlsSql).toContain("(OVMS_INTERNAL.GET_AUTH_USER()).ROLE != 'DISPLAY'");
  });

  it('Display priorities projection table provides read-only access for DISPLAY role', () => {
    // display_priorities allows SELECT for site access
    expect(rlsSql).toContain('CREATE TABLE IF NOT EXISTS PUBLIC.DISPLAY_PRIORITIES');
    expect(rlsSql).toContain('CREATE POLICY "DISPLAYPRIORITIES: SELECT" ON PUBLIC.DISPLAY_PRIORITIES FOR SELECT USING (');
    // Mutations on display_priorities are denied to DISPLAY role
    expect(rlsSql).toContain('CREATE POLICY "DISPLAYPRIORITIES: INSERT" ON PUBLIC.DISPLAY_PRIORITIES FOR INSERT WITH CHECK (');
  });

  it('Tenant Deletion Jobs & Receipts are strictly restricted to Platform Superuser', () => {
    expect(rlsSql).toContain('CREATE POLICY "TENANTDELETIONJOBS: SELECT" ON PUBLIC.TENANT_DELETION_JOBS FOR SELECT USING (OVMS_INTERNAL.IS_PLATFORM_SUPERUSER())');
    expect(rlsSql).toContain('CREATE POLICY "PLATFORMDELETIONRECEIPTS: SELECT" ON PUBLIC.PLATFORM_DELETION_RECEIPTS FOR SELECT USING (OVMS_INTERNAL.IS_PLATFORM_SUPERUSER())');
  });

  it('Database grants: blanket grants revoked, explicit least-privilege applied', () => {
    expect(rlsSql).toContain('REVOKE ALL ON PUBLIC.');
    expect(rlsSql).toContain('FROM AUTHENTICATED;');
    expect(rlsSql).toContain('FROM ANON;');
    expect(rlsSql).toContain('FROM PUBLIC;');
    // Event logs: SELECT, INSERT only (no UPDATE/DELETE granted to authenticated)
    expect(rlsSql).toContain('GRANT SELECT, INSERT ON PUBLIC.AUDIT_LOGS TO AUTHENTICATED;');
    expect(rlsSql).toContain('GRANT SELECT, INSERT ON PUBLIC.INVENTORY_MOVEMENTS TO AUTHENTICATED;');
  });
});
