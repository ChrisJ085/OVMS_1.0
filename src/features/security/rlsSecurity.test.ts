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

  it('SECURITY DEFINER functions use a pinned search_path', () => {
    // Every SECURITY DEFINER must specify SET search_path to prevent search path injection attacks
    const definerCount = (rlsSql.match(/LANGUAGE PLPGSQL SECURITY DEFINER/g) || []).length;
    const searchPathCount = (rlsSql.match(/SET SEARCH_PATH/g) || []).length;
    expect(searchPathCount).toBeGreaterThanOrEqual(definerCount);
  });

  it('Security functions are moved to the internal schema', () => {
    expect(rlsSql).toContain('CREATE SCHEMA IF NOT EXISTS OVMS_INTERNAL');
    expect(rlsSql).toContain('OVMS_INTERNAL.IS_PLATFORM_SUPERUSER()');
    expect(rlsSql).toContain('OVMS_INTERNAL.IS_TENANT_ADMIN(');
  });

  it('Triggers prevent users from modifying sensitive fields (Privilege Escalation Protection)', () => {
    expect(rlsSql).toContain('TRG_USERS_PREVENT_ESCALATION');
    // Ensure sensitive fields are rolled back or protected
    expect(rlsSql).toContain('NEW.ROLE := OLD.ROLE');
    expect(rlsSql).toContain('NEW.TENANT_ID := OLD.TENANT_ID');
  });

  it('Audit Logs are explicitly enforced as immutable', () => {
    expect(rlsSql).toContain('TRG_AUDIT_LOGS_IMMUTABLE');
    expect(rlsSql).toContain('BEFORE UPDATE ON PUBLIC.AUDIT_LOGS');
    expect(rlsSql).toContain('BEFORE DELETE ON PUBLIC.AUDIT_LOGS');
  });

  it('Historical operational records are immutable', () => {
    // Inventory movements and production events should not allow UPDATE or DELETE
    expect(rlsSql).toContain('INVENTORY_MOVEMENTS FOR UPDATE USING (FALSE)');
    expect(rlsSql).toContain('INVENTORY_MOVEMENTS FOR DELETE USING (FALSE)');
    expect(rlsSql).toContain('PRODUCTION_EVENTS FOR UPDATE USING (FALSE)');
    expect(rlsSql).toContain('PRODUCTION_EVENTS FOR DELETE USING (FALSE)');
  });

  it('DISPLAY users cannot mutate operational data', () => {
    // Checks that INSERT/UPDATE policies exclude DISPLAY users
    expect(rlsSql).toContain("ROLE != 'DISPLAY'");
  });
});
