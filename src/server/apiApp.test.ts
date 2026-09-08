import { describe, it, expect } from 'vitest';
import apiApp from './apiApp';

describe('apiApp Express routing tests', () => {
  it('handles GET /health', async () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req: any = {
      method: 'GET',
      url: '/health',
      headers: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(jsonBody).toEqual({ status: 'ok' });
  });

  it('handles GET /api/health', async () => {
    let jsonBody: any = null;

    const req: any = {
      method: 'GET',
      url: '/api/health',
      headers: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(jsonBody).toEqual({ status: 'ok' });
  });

  it('handles GET / and GET /api root ping', async () => {
    let jsonBody: any = null;

    const req: any = {
      method: 'GET',
      url: '/api',
      headers: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(jsonBody).toEqual({ status: 'ok', service: 'OVMS API' });
  });

  it('returns 404 JSON for unmatched routes', async () => {
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'GET',
      url: '/non-existent-endpoint',
      headers: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(statusCode).toBe(404);
    expect(jsonBody.error).toBeDefined();
  });

  it('routes POST /api/admin/provision-user correctly (expecting 401 when unauthenticated)', async () => {
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'POST',
      url: '/api/admin/provision-user',
      headers: {
        'content-type': 'application/json'
      },
      body: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(statusCode).toBe(401);
    expect(jsonBody.error).toContain('Unauthorized');
    expect(jsonBody.stage).toBe('PROVISION_START');
  });

  it('routes POST /admin/provision-user correctly (expecting 401 and stage PROVISION_START when unauthenticated)', async () => {
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'POST',
      url: '/admin/provision-user',
      headers: {
        'content-type': 'application/json'
      },
      body: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(statusCode).toBe(401);
    expect(jsonBody.error).toContain('Unauthorized');
    expect(jsonBody.stage).toBe('PROVISION_START');
  });

  it('reports stage CALLER_TOKEN_VERIFICATION when bearer token is invalid', async () => {
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'POST',
      url: '/api/admin/provision-user',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer invalid-token-12345'
      },
      body: {
        email: 'test@example.com',
        displayName: 'Test User',
        role: 'PLANNER'
      }
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(statusCode).toBe(401);
    expect(jsonBody.error).toContain('Unauthorized');
    expect(jsonBody.stage).toBe('CALLER_TOKEN_VERIFICATION');
  });

  it('routes POST with x-matched-path header when URL is rewritten to /api', async () => {
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'POST',
      url: '/api',
      headers: {
        'content-type': 'application/json',
        'x-matched-path': '/api/admin/provision-user'
      },
      body: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      (apiApp as any)(req, res);
    });

    expect(statusCode).toBe(401);
    expect(jsonBody.error).toContain('Unauthorized');
  });

  it('invokes api/index.ts handler function cleanly', async () => {
    const apiHandler = (await import('../../api/index')).default;
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'GET',
      url: '/health',
      headers: {}
    };

    const res: any = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      setHeader() {
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      end() {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        resolve();
        return res;
      };
      apiHandler(req, res);
    });

    expect(statusCode).toBe(200);
    expect(jsonBody).toEqual({ status: 'ok' });
  });
});
