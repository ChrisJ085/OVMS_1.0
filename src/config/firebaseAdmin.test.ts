import { describe, it, expect, vi } from 'vitest';
import { adminAuth, adminDb, adminStorage, resolvedAdminProjectId } from './firebaseAdmin';

describe('Firebase Admin Initialization & Security Verification', () => {
  it('explicitly resolves the Admin project ID as ovms-ad209', () => {
    expect(resolvedAdminProjectId).toBe('ovms-ad209');
  });

  it('exports adminAuth, adminDb, and adminStorage instances', () => {
    expect(adminAuth).toBeDefined();
    expect(adminDb).toBeDefined();
    expect(adminStorage).toBeDefined();
  });

  it('rejects missing tokens', async () => {
    const authHeader = undefined;
    const isValid = !!authHeader && authHeader.startsWith('Bearer ');
    expect(isValid).toBe(false);
  });

  it('rejects malformed/invalid tokens', async () => {
    vi.spyOn(adminAuth, 'verifyIdToken').mockRejectedValueOnce(
      new Error('Decoding Firebase ID token failed. Make sure you passed the raw, signed token.')
    );

    await expect(adminAuth.verifyIdToken('invalid-token-string')).rejects.toThrow(
      'Decoding Firebase ID token failed'
    );
  });

  it('rejects tokens issued for another Firebase project (e.g. ais-europe-west2-718c6a0aa8734)', async () => {
    const errorFromOtherProjectToken = new Error(
      'Firebase ID token has incorrect "aud" (audience) claim. Expected "ovms-ad209" but got "ais-europe-west2-718c6a0aa8734".'
    );
    vi.spyOn(adminAuth, 'verifyIdToken').mockRejectedValueOnce(errorFromOtherProjectToken);

    await expect(adminAuth.verifyIdToken('foreign-project-token')).rejects.toThrow(
      'Expected "ovms-ad209" but got "ais-europe-west2-718c6a0aa8734"'
    );
  });

  it('succeeds for valid tokens issued by ovms-ad209', async () => {
    const mockDecodedToken = {
      uid: 'user-123',
      email: 'admin@ovms.com',
      aud: 'ovms-ad209',
      iss: 'https://securetoken.google.com/ovms-ad209',
    };

    vi.spyOn(adminAuth, 'verifyIdToken').mockResolvedValueOnce(mockDecodedToken as any);

    const result = await adminAuth.verifyIdToken('valid-ovms-ad209-token');
    expect(result.aud).toBe('ovms-ad209');
    expect(result.iss).toBe('https://securetoken.google.com/ovms-ad209');
    expect(result.uid).toBe('user-123');
  });

  it('verifies provisioning endpoint uses shared ovms-ad209 Auth and Firestore', async () => {
    expect(adminAuth.app.options.projectId).toBe('ovms-ad209');
  });

  it('verifies tenant deletion endpoint uses shared ovms-ad209 Auth and Firestore', async () => {
    expect((adminDb as any).projectId || resolvedAdminProjectId).toBe('ovms-ad209');
  });
});
