import apiApp from '../src/server/apiApp';

export default function handler(req: any, res: any) {
  try {
    return apiApp(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless Handler] Uncaught exception:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: `Server handler error: ${err?.message || 'Unknown error'}`,
        stage: 'SERVERLESS_TOP_LEVEL_EXCEPTION'
      });
    }
  }
}
