import express from "express";
import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseTransformers";

const app = express();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

async function safeVerifyCallerToken(callerToken: string): Promise<{ uid: string; email?: string }> {
  try {
    const { data, error } = await supabase.auth.getUser(callerToken);
    if (error || !data.user) {
      throw error || new Error('Invalid token');
    }
    return { uid: data.user.id, email: data.user.email };
  } catch (err: any) {
    console.warn('[Server Auth Verification] Supabase token verification failed:', err?.message || err);
    throw new Error('Invalid or expired authorization token.');
  }
}

async function safeGetUserProfile(uid: string, callerEmail?: string): Promise<{ exists: boolean; data?: any }> {
  const normalizedEmail = callerEmail ? callerEmail.toLowerCase().trim() : undefined;

  try {
    // 1. Direct document lookup by UID/ID
    const { data: userRow, error } = await supabase
      .from('users')
      .select('*, user_sites(site_id)')
      .eq('id', uid)
      .maybeSingle();

    if (userRow) {
      const siteIds = Array.isArray(userRow.user_sites)
        ? userRow.user_sites.map((us: any) => us.site_id)
        : [];
      const camel = toCamelCase<any>(userRow);
      return { exists: true, data: { ...camel, siteIds } };
    }

    // 2. Fallback query by email if provided
    if (normalizedEmail) {
      const { data: emailRow } = await supabase
        .from('users')
        .select('*, user_sites(site_id)')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (emailRow) {
        const siteIds = Array.isArray(emailRow.user_sites)
          ? emailRow.user_sites.map((us: any) => us.site_id)
          : [];
        const camel = toCamelCase<any>(emailRow);
        return { exists: true, data: { ...camel, siteIds } };
      }
    }

    // 3. Superuser bootstrap fallback for primary administrator accounts
    if (normalizedEmail === 'chris.jeal@gxo.com' || normalizedEmail === 'cjeal85@gmail.com') {
      console.info(`[Server Supabase] Bootstrapping superuser profile doc for administrator: ${normalizedEmail}`);
      const superProfile = {
        id: uid,
        uid,
        email: normalizedEmail,
        displayName: 'Platform Superuser',
        role: 'PLATFORM_SUPERUSER',
        accountStatus: 'ACTIVE',
        tenantId: null,
        siteIds: [],
        requiresPasswordChange: false,
        failedLoginAttempts: 0,
        jobTitle: 'Platform Administrator'
      };

      try {
        await supabase.from('users').upsert({
          id: uid,
          email: normalizedEmail,
          display_name: 'Platform Superuser',
          role: 'PLATFORM_SUPERUSER',
          account_status: 'ACTIVE',
          requires_password_change: false,
          created_by: 'SYSTEM_BOOTSTRAP',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } catch (setErr) {
        console.warn('[Server Supabase] Failed to save bootstrapped superuser profile:', setErr);
      }
      return { exists: true, data: superProfile };
    }

    return { exists: false };
  } catch (err: any) {
    console.warn('[Server Supabase] safeGetUserProfile failed:', err?.message || err);
    return { exists: false };
  }
}

// Health Check
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Admin Diagnostics
router.get("/admin/diagnostics", async (req, res) => {
  res.json({
    status: "ok",
    database: "supabase_postgresql",
    timestamp: new Date().toISOString()
  });
});

// Admin User Provisioning Endpoint
router.post("/admin/provision-user", async (req, res) => {
  let currentStage = "INIT";
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid Authorization header", stage: "AUTH_CHECK" });
    }

    const callerToken = authHeader.substring(7).trim();
    currentStage = "TOKEN_VERIFICATION";
    const verifiedToken = await safeVerifyCallerToken(callerToken);
    const verifiedUid = verifiedToken.uid;

    currentStage = "CALLER_PROFILE_LOOKUP";
    const callerRes = await safeGetUserProfile(verifiedUid, verifiedToken.email);
    if (!callerRes.exists || !callerRes.data) {
      return res.status(403).json({ success: false, error: "Forbidden: Caller user profile not found", stage: currentStage });
    }

    const callerProfile = callerRes.data;
    currentStage = "CALLER_AUTHORIZATION";
    const callerRoleUpper = (callerProfile.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER' && callerRoleUpper !== 'TENANT_ADMIN') {
      return res.status(403).json({ success: false, error: "Forbidden: Insufficient permissions to provision users", stage: currentStage });
    }

    const body = req.body || {};
    const { email, displayName, jobTitle, role, tenantId, siteIds, temporaryPassword } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, error: "A valid email is required", stage: currentStage });
    }
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return res.status(400).json({ success: false, error: "Display Name is required", stage: currentStage });
    }
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ success: false, error: "Role is required", stage: currentStage });
    }

    const cleanEmail = email.toLowerCase().trim();
    const targetTenantId = role === 'PLATFORM_SUPERUSER'
      ? null
      : (tenantId ? tenantId.trim() : (callerRoleUpper === 'TENANT_ADMIN' ? callerProfile.tenantId : null));

    // Create account via Supabase Auth or database record
    currentStage = "SUPABASE_AUTH_CREATE";
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: cleanEmail,
      password: temporaryPassword || 'TempPass123!',
      options: {
        data: { display_name: displayName.trim() }
      }
    });

    if (authErr && !authData?.user) {
      return res.status(400).json({ success: false, error: authErr.message, stage: currentStage });
    }

    const newUserId = authData.user?.id || crypto.randomUUID();

    currentStage = "USER_PROFILE_CREATE";
    const { error: profileErr } = await supabase.from('users').upsert({
      id: newUserId,
      email: cleanEmail,
      display_name: displayName.trim(),
      job_title: jobTitle ? String(jobTitle).trim() : '',
      role,
      tenant_id: targetTenantId,
      account_status: 'ACTIVE',
      requires_password_change: true,
      created_by: verifiedUid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (profileErr) {
      return res.status(500).json({ success: false, error: profileErr.message, stage: currentStage });
    }

    // Insert user site assignments into user_sites
    if (siteIds && Array.isArray(siteIds) && siteIds.length > 0) {
      const userSiteRows = siteIds.map((sId: string) => ({
        user_id: newUserId,
        site_id: sId
      }));
      await supabase.from('user_sites').insert(userSiteRows);
    }

    // Insert Audit Log
    currentStage = "AUDIT_LOG_CREATE";
    await supabase.from('audit_logs').insert({
      tenant_id: targetTenantId,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'USER_CREATION',
      entity_type: 'UserProfile',
      entity_id: newUserId,
      details: { email: cleanEmail, role, tenantId: targetTenantId }
    });

    return res.status(200).json({
      success: true,
      message: `User ${cleanEmail} provisioned successfully`,
      uid: newUserId,
      email: cleanEmail,
      role
    });

  } catch (err: any) {
    console.error(`[Admin Provisioning Error] Stage: ${currentStage}:`, err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error", stage: currentStage });
  }
});

app.use("/api", router);

export default app;
