import { describe, it, expect } from 'vitest';
import request from 'supertest';
import apiApp from './apiApp';

describe('apiApp Express routing tests', () => {
  it('handles GET /api/health', async () => {
    const res = await request(apiApp).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('handles GET /api/admin/diagnostics', async () => {
    const res = await request(apiApp).get('/api/admin/diagnostics');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('supabase_postgresql');
  });

  it('returns 404 for unmatched routes', async () => {
    const res = await request(apiApp).get('/non-existent-endpoint');
    expect(res.status).toBe(404);
  });

  it('routes POST /api/admin/provision-user correctly (expecting 401 and stage AUTH_CHECK when unauthenticated)', async () => {
    const res = await request(apiApp)
      .post('/api/admin/provision-user')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Missing or invalid Authorization header');
    expect(res.body.stage).toBe('AUTH_CHECK');
  });

  it('routes POST /api/admin/provision-tenant correctly (expecting 401 and stage AUTH_CHECK when unauthenticated)', async () => {
    const res = await request(apiApp)
      .post('/api/admin/provision-tenant')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Missing or invalid Authorization header');
    expect(res.body.stage).toBe('AUTH_CHECK');
  });

  it('reports stage TOKEN_VERIFICATION when bearer token is invalid for tenant provisioning', async () => {
    const res = await request(apiApp)
      .post('/api/admin/provision-tenant')
      .set('Authorization', 'Bearer invalid-token-12345')
      .send({
        tenantName: 'New Logistics Inc',
        tenantCode: 'NLI'
      });
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe('TOKEN_VERIFICATION');
  });

  it('reports stage TOKEN_VERIFICATION when bearer token is invalid', async () => {
    const res = await request(apiApp)
      .post('/api/admin/provision-user')
      .set('Authorization', 'Bearer invalid-token-12345')
      .send({
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'PLANNER'
      });
    expect(res.body.success).toBe(false);
    expect(res.body.stage).toBe('TOKEN_VERIFICATION');
  });

  it('invokes api/index.js handler function cleanly and resolves module correctly', async () => {
    const apiHandler = (await import('../../api/index.js')).default;
    expect(typeof apiHandler).toBe('function');

    const res = await request(apiHandler).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  }, 15000);

  it('verifies that /api/admin/provision-user is mounted and reachable via the bundled entrypoint', async () => {
    const apiHandler = (await import('../../api/index.js')).default;
    const res = await request(apiHandler)
      .post('/api/admin/provision-user')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.stage).toBe('AUTH_CHECK');
    expect(res.body.error).toContain('Missing or invalid Authorization header');
  });
});
