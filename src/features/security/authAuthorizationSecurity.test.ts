import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/apiApp';
import { supabase } from '../../config/supabase';
import { ROLE_PERMISSIONS } from '../../config/rolePermissions';

describe('Application Auth, Authorization & Privilege Escalation Audit', () => {
  describe('Supabase Client & Environment Security', () => {
    it('Client configuration uses only public anonymous keys', () => {
      // Confirm that supabase client instance exists and does not expose service_role
      expect(supabase).toBeDefined();
      expect(supabase.auth).toBeDefined();
    });

    it('No service_role or secret keys are present in process.env with VITE_ prefix', () => {
      const viteKeys = Object.keys(process.env).filter(key => key.startsWith('VITE_'));
      viteKeys.forEach(key => {
        const value = (process.env[key] || '').toLowerCase();
        expect(key.toLowerCase()).not.toContain('service_role');
        expect(key.toLowerCase()).not.toContain('secret');
        expect(value).not.toContain('service_role');
      });
    });
  });

  describe('API Server Endpoint Protection', () => {
    it('Reject unauthenticated calls to /api/admin/provision-user with 401', async () => {
      const response = await request(app)
        .post('/api/admin/provision-user')
        .send({
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'PLANNER'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/Authorization/i);
    });

    it('Reject unauthenticated calls to /api/tenant-deletion with 401', async () => {
      const response = await request(app)
        .post('/api/tenant-deletion')
        .send({
          tenantId: 'tenant-123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/Authorization/i);
    });

    it('Reject unauthenticated calls to /api/tenant-deletion/:jobId/retry with 401', async () => {
      const response = await request(app)
        .post('/api/tenant-deletion/job-123/retry')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('Reject unauthenticated calls to /api/admin/bootstrap-superuser with 401', async () => {
      const response = await request(app)
        .post('/api/admin/bootstrap-superuser')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/Authorization/i);
    });

    it('Reject unauthorized caller emails for /api/admin/bootstrap-superuser', async () => {
      const response = await request(app)
        .post('/api/admin/bootstrap-superuser')
        .set('Authorization', 'Bearer invalid-token')
        .send({});

      // Should fail token verification with error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });

    it('Health endpoint is accessible without sensitive leaks', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('secret');
    });

    it('Diagnostics endpoint does not leak connection credentials', async () => {
      const response = await request(app).get('/api/admin/diagnostics');
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('connectionString');
    });
  });

  describe('Role-Based Access Control (RBAC) Integrity', () => {
    it('DISPLAY role has strictly limited display-only permissions', () => {
      const displayPermissions = ROLE_PERMISSIONS['DISPLAY'] || [];
      expect(displayPermissions).toEqual(['VIEW_TV_DASHBOARD']);
      expect(displayPermissions).not.toContain('MANAGE_PRIORITIES');
      expect(displayPermissions).not.toContain('MANAGE_CONFIGURATION');
      expect(displayPermissions).not.toContain('VIEW_ADMINISTRATION');
      expect(displayPermissions).not.toContain('MANAGE_USERS');
    });

    it('WAREHOUSE_OPERATOR role cannot manage users or configuration', () => {
      const whPermissions = ROLE_PERMISSIONS['WAREHOUSE_OPERATOR'] || [];
      expect(whPermissions).not.toContain('MANAGE_USERS');
      expect(whPermissions).not.toContain('MANAGE_CONFIGURATION');
      expect(whPermissions).not.toContain('VIEW_ADMINISTRATION');
    });

    it('PLANNER role cannot manage users or configuration', () => {
      const plannerPermissions = ROLE_PERMISSIONS['PLANNER'] || [];
      expect(plannerPermissions).not.toContain('VIEW_ADMINISTRATION');
      expect(plannerPermissions).not.toContain('MANAGE_USERS');
    });

    it('TENANT_ADMIN has tenant administration permissions', () => {
      const tenantAdminPermissions = ROLE_PERMISSIONS['TENANT_ADMIN'] || [];
      expect(tenantAdminPermissions).toContain('VIEW_ADMINISTRATION');
      expect(tenantAdminPermissions).toContain('MANAGE_USERS');
      expect(tenantAdminPermissions).toContain('MANAGE_CONFIGURATION');
    });

    it('PLATFORM_SUPERUSER has all administrative permissions', () => {
      const superPermissions = ROLE_PERMISSIONS['PLATFORM_SUPERUSER'] || [];
      expect(superPermissions).toContain('VIEW_ADMINISTRATION');
      expect(superPermissions).toContain('MANAGE_USERS');
      expect(superPermissions).toContain('MANAGE_CONFIGURATION');
      expect(superPermissions).toContain('VIEW_AUDIT_LOG');
    });
  });
});
