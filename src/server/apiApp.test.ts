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

  it('invokes api/index.js handler function cleanly and resolves module correctly', async () => {
    const apiHandler = (await import('../../api/index.js')).default;
    expect(typeof apiHandler).toBe('function');

    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'GET',
      url: '/health',
      headers: {}
    };

    const res: any = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
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
        this.headersSent = true;
        this.writableEnded = true;
        return this;
      },
      end() {
        this.headersSent = true;
        this.writableEnded = true;
        return this;
      },
      on(_event: string, _cb: Function) {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        res.headersSent = true;
        res.writableEnded = true;
        resolve();
        return res;
      };
      res.end = () => {
        res.headersSent = true;
        res.writableEnded = true;
        resolve();
        return res;
      };
      apiHandler(req, res);
    });

    expect(statusCode).toBe(200);
    expect(jsonBody).toEqual({ status: 'ok' });
  }, 15000);

  it('verifies that /api/admin/provision-user is mounted and reachable via the bundled entrypoint', async () => {
    const apiHandler = (await import('../../api/index.js')).default;
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      method: 'POST',
      url: '/admin/provision-user',
      headers: {},
      body: {}
    };

    const res: any = {
      statusCode: 200,
      headersSent: false,
      writableEnded: false,
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
        this.headersSent = true;
        this.writableEnded = true;
        return this;
      },
      end() {
        this.headersSent = true;
        this.writableEnded = true;
        return this;
      },
      on(_event: string, _cb: Function) {
        return this;
      }
    };

    await new Promise<void>((resolve) => {
      res.json = (data: any) => {
        jsonBody = data;
        res.headersSent = true;
        res.writableEnded = true;
        resolve();
        return res;
      };
      res.end = () => {
        res.headersSent = true;
        res.writableEnded = true;
        resolve();
        return res;
      };
      apiHandler(req, res);
    });

    // Should reach the provision-user route handler (which returns 401 Unauthorized without auth header)
    expect(statusCode).toBe(401);
    expect(jsonBody.stage).toBe('PROVISION_START');
    expect(jsonBody.error).toContain('Unauthorized');
  }, 15000);
});
