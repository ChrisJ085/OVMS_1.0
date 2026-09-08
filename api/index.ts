import apiApp from '../src/server/apiApp';

export default function handler(req: any, res: any) {
  return new Promise<void>((resolve) => {
    if (typeof res?.on === 'function') {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', (err: any) => {
        console.error('[Vercel Serverless Handler] Response stream error:', err);
        resolve();
      });
    }

    try {
      apiApp(req, res, (err?: any) => {
        if (err) {
          console.error('[Vercel Serverless Handler] Express error:', err);
          if (!res.headersSent && typeof res.status === 'function') {
            res.status(500).json({
              success: false,
              error: err?.message || 'Server error',
              stage: 'SERVERLESS_EXPRESS_NEXT_ERR'
            });
          }
        }
        resolve();
      });

      if (res.writableEnded || res.headersSent) {
        resolve();
      }
    } catch (err: any) {
      console.error('[Vercel Serverless Handler] Uncaught sync exception:', err);
      if (!res.headersSent && typeof res.status === 'function') {
        res.status(500).json({
          success: false,
          error: `Server handler error: ${err?.message || 'Unknown error'}`,
          stage: 'SERVERLESS_TOP_LEVEL_EXCEPTION'
        });
      }
      resolve();
    }
  });
}
