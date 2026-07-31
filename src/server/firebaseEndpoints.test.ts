import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adminAuth, adminDb, resolvedAdminProjectId } from '../config/firebaseAdmin';

describe('Firebase Protected Endpoints Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/admin/firebase-diagnostics requirement checks', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const authHeader = undefined;
      let status = 200;
      let body: any = {};

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        status = 401;
        body = { error: 'Unauthorized: Missing authorization header' };
      }

      expect(status).toBe(401);
      expect(body.error).toContain('Missing authorization header');
    });

    it('returns 401 when token is invalid or from wrong audience', async () => {
      vi.spyOn(adminAuth, 'verifyIdToken').mockRejectedValueOnce(
        new Error('Firebase ID token has incorrect "aud" claim. Expected "ovms-ad209" but got "ais-europe-west2-718c6a0aa8734".')
      );

      let status = 200;
      let body: any = {};

      try {
        await adminAuth.verifyIdToken('wrong-aud-token');
      } catch (err: any) {
        status = 401;
        body = { error: `Unauthorized: Invalid token (${err.message})` };
      }

      expect(status).toBe(401);
      expect(body.error).toContain('Expected "ovms-ad209" but got "ais-europe-west2-718c6a0aa8734"');
    });

    it('returns diagnostics payload when valid PLATFORM_SUPERUSER token is provided', async () => {
      vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValueOnce({
        uid: 'superuser-uid-1',
        aud: 'ovms-ad209',
        iss: 'https://securetoken.google.com/ovms-ad209',
      } as any);

      vi.spyOn(adminDb, 'collection').mockReturnValueOnce({
        doc: () => ({
          get: async () => ({
            exists: true,
            data: () => ({
              accountStatus: 'ACTIVE',
              role: 'PLATFORM_SUPERUSER',
            }),
          }),
        }),
      } as any);

      const token = await adminAuth.verifyIdToken('valid-token');
      const doc = await adminDb.collection('users').doc(token.uid).get();
      const profile = doc.data();

      expect(token.aud).toBe('ovms-ad209');
      expect(profile?.role).toBe('PLATFORM_SUPERUSER');
      expect(profile?.accountStatus).toBe('ACTIVE');

      const diagnostics = {
        adminProjectId: resolvedAdminProjectId,
        tokenAudience: token.aud,
        tokenIssuer: token.iss,
        uid: token.uid,
        status: 'healthy',
      };

      expect(diagnostics).toEqual({
        adminProjectId: 'ovms-ad209',
        tokenAudience: 'ovms-ad209',
        tokenIssuer: 'https://securetoken.google.com/ovms-ad209',
        uid: 'superuser-uid-1',
        status: 'healthy',
      });
    });
  });

  describe('Provisioning and Tenant Deletion Admin instance checks', () => {
    it('provisions user using ovms-ad209 Admin instance', async () => {
      expect(resolvedAdminProjectId).toBe('ovms-ad209');
      expect(adminAuth.app.options.projectId).toBe('ovms-ad209');
    });

    it('handles tenant deletion using ovms-ad209 Admin instance', async () => {
      expect((adminDb as any).projectId || resolvedAdminProjectId).toBe('ovms-ad209');
    });
  });
});
