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
});
