import express from "express";
import crypto from "crypto";
import { supabase } from "../config/supabase";
import { supabaseAdmin } from "../config/supabaseAdmin";
import { toCamelCase, toSnakeCase } from "../utils/caseTransformers";

const app = express();
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

const AUTHORIZED_BOOTSTRAP_EMAILS = [
  'chris.jeal@gxo.com',
  'cjeal85@gmail.com'
];

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

/**
 * Authoritative User Profile Identity Resolution
 * A profile must only be treated as the caller's profile when users.id = authenticated Supabase user ID.
 * Email must NEVER substitute for the authenticated UID during authorization.
 */
async function safeGetUserProfile(uid: string): Promise<{ exists: boolean; data?: any }> {
  if (!uid || typeof uid !== 'string') {
    return { exists: false };
  }

  try {
    // Direct document lookup strictly by authoritative authenticated UID
    const { data: userRow, error } = await supabase
      .from('users')
      .select('*, user_sites(site_id)')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.warn('[Server Supabase] safeGetUserProfile query error:', error.message);
      return { exists: false };
    }

    if (userRow && userRow.id === uid) {
      const siteIds = Array.isArray(userRow.user_sites)
        ? userRow.user_sites.map((us: any) => us.site_id)
        : [];
      const camel = toCamelCase<any>(userRow);
      return { exists: true, data: { ...camel, siteIds } };
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

/**
 * Dedicated, explicit superuser bootstrap endpoint.
 * Requires authenticated caller token matching authorized bootstrap identity.
 * Does not rely on request-time side effects or email fallback during normal lookups.
 */
router.post("/admin/bootstrap-superuser", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
    }

    const callerToken = authHeader.substring(7).trim();
    const verifiedToken = await safeVerifyCallerToken(callerToken);
    const verifiedUid = verifiedToken.uid;
    const callerEmail = (verifiedToken.email || '').toLowerCase().trim();

    const envBootstrapEmail = process.env.INITIAL_SUPERUSER_EMAIL?.toLowerCase().trim();
    const isAuthorizedEmail = AUTHORIZED_BOOTSTRAP_EMAILS.includes(callerEmail) ||
      (envBootstrapEmail && callerEmail === envBootstrapEmail);

    if (!isAuthorizedEmail) {
      return res.status(403).json({
        success: false,
        error: "Forbidden: Caller email is not designated for platform administrator bootstrap"
      });
    }

    // Check if profile already exists for this authoritative UID
    const existing = await safeGetUserProfile(verifiedUid);
    if (existing.exists && existing.data?.role === 'PLATFORM_SUPERUSER') {
      return res.status(200).json({
        success: true,
        message: "Platform superuser profile already active",
        uid: verifiedUid,
        email: callerEmail,
        role: 'PLATFORM_SUPERUSER'
      });
    }

    // Upsert the platform superuser profile explicitly tied to authenticated UID
    const nowIso = new Date().toISOString();
    const { error: upsertErr } = await supabase.from('users').upsert({
      id: verifiedUid,
      email: callerEmail,
      display_name: 'Platform Superuser',
      job_title: 'Platform Administrator',
      role: 'PLATFORM_SUPERUSER',
      tenant_id: null,
      account_status: 'ACTIVE',
      requires_password_change: false,
      failed_login_attempts: 0,
      created_by: 'SYSTEM_EXPLICIT_BOOTSTRAP',
      created_at: nowIso,
      updated_at: nowIso
    });

    if (upsertErr) {
      return res.status(500).json({ success: false, error: "Failed to persist bootstrap profile: " + upsertErr.message });
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      tenant_id: null,
      user_id: verifiedUid,
      user_email: callerEmail,
      action: 'SYSTEM_BOOTSTRAP_SUPERUSER',
      entity_type: 'UserProfile',
      entity_id: verifiedUid,
      details: { email: callerEmail, role: 'PLATFORM_SUPERUSER' },
      timestamp: nowIso
    });

    return res.status(200).json({
      success: true,
      message: "Platform superuser successfully bootstrapped",
      uid: verifiedUid,
      email: callerEmail,
      role: 'PLATFORM_SUPERUSER'
    });
  } catch (err: any) {
    console.error('[Bootstrap Superuser Error]:', err?.message || err);
    return res.status(500).json({ success: false, error: "Internal server error during bootstrap" });
  }
});

// Admin User Provisioning Endpoint
router.post("/admin/provision-user", async (req, res) => {
  let currentStage = "INIT";
  let createdAuthUid: string | null = null;
  let createdProfileInDb = false;

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
    // Strictly authoritative UID identity check
    const callerRes = await safeGetUserProfile(verifiedUid);
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

    const targetRoleUpper = role.toUpperCase().trim();

    // Privilege Escalation Guards:
    if (callerRoleUpper === 'TENANT_ADMIN') {
      if (targetRoleUpper === 'PLATFORM_SUPERUSER' || targetRoleUpper === 'TENANT_ADMIN') {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Tenant Admins cannot provision Platform Superusers or Tenant Admins",
          stage: currentStage
        });
      }
      if (!callerProfile.tenantId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Tenant Admin has no associated tenant",
          stage: currentStage
        });
      }
      if (tenantId && tenantId.trim() !== callerProfile.tenantId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Tenant Admins cannot provision users into other tenants",
          stage: currentStage
        });
      }
    }

    const cleanEmail = email.toLowerCase().trim();
    // Enforce tenant scoping:
    const targetTenantId = callerRoleUpper === 'TENANT_ADMIN'
      ? callerProfile.tenantId
      : (targetRoleUpper === 'PLATFORM_SUPERUSER' ? null : (tenantId ? tenantId.trim() : null));

    // Validate site assignments if provided:
    let validatedSiteIds: string[] = [];
    if (siteIds && Array.isArray(siteIds) && siteIds.length > 0) {
      if (callerRoleUpper === 'TENANT_ADMIN' && targetTenantId) {
        // Query database to ensure all siteIds belong to this tenant
        const { data: tenantSites, error: siteCheckErr } = await supabase
          .from('sites')
          .select('id')
          .eq('tenant_id', targetTenantId)
          .in('id', siteIds);

        if (siteCheckErr) {
          return res.status(500).json({ success: false, error: "Failed to validate site assignments", stage: currentStage });
        }
        const validSiteIdSet = new Set((tenantSites || []).map((s: any) => s.id));
        const invalidSites = siteIds.filter((sId: string) => !validSiteIdSet.has(sId));
        if (invalidSites.length > 0) {
          return res.status(403).json({
            success: false,
            error: "Forbidden: Cannot assign sites that do not belong to your tenant",
            stage: currentStage
          });
        }
      }
      validatedSiteIds = siteIds;
    }

    // Cryptographically random password generation if not explicitly provided (no hardcoded credentials)
    const secureRandomPassword = crypto.randomBytes(18).toString('base64url') + 'A1!';
    const initialPassword = temporaryPassword && typeof temporaryPassword === 'string' && temporaryPassword.trim().length >= 8
      ? temporaryPassword.trim()
      : secureRandomPassword;

    // Create account via Supabase Admin Auth API
    currentStage = "SUPABASE_AUTH_CREATE";
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName.trim()
      }
    });

    if (authErr || !authData?.user?.id) {
      const errMsg = authErr?.message || 'Failed to create Supabase Auth user';
      const isDuplicate = errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('registered') || errMsg.toLowerCase().includes('exists');
      const status = isDuplicate ? 409 : 400;
      return res.status(status).json({
        success: false,
        error: isDuplicate ? 'An account with this email address already exists in Supabase Auth.' : errMsg,
        stage: currentStage
      });
    }

    const newUserId = authData.user.id;
    createdAuthUid = authData.user.id;

    // Create a scoped client acting as the caller for RLS
    const { createClient } = await import('@supabase/supabase-js');
    const { supabaseUrl, supabasePublishableKey } = await import('../config/supabase');
    const callerClient = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${callerToken}` } },
      auth: { persistSession: false }
    });

    currentStage = "USER_PROFILE_CREATE";
    const { error: profileErr } = await callerClient.from('users').upsert({
      id: newUserId,
      email: cleanEmail,
      display_name: displayName.trim(),
      job_title: jobTitle ? String(jobTitle).trim() : '',
      role: targetRoleUpper,
      tenant_id: targetTenantId,
      account_status: 'ACTIVE',
      requires_password_change: true,
      failed_login_attempts: 0,
      created_by: verifiedUid,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    if (profileErr) {
      // Safe compensation: delete orphaned auth user
      if (createdAuthUid) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdAuthUid);
        } catch (rollbackErr) {
          console.warn('[Provisioning Rollback] Could not delete Auth user during rollback:', rollbackErr);
        }
      }
      return res.status(500).json({
        success: false,
        error: `Failed to create user profile in database: ${profileErr.message}`,
        stage: currentStage
      });
    }

    createdProfileInDb = true;

    // Insert user site assignments into user_sites
    if (validatedSiteIds.length > 0) {
      currentStage = "USER_SITES_ASSIGN";
      const userSiteRows = validatedSiteIds.map((sId: string) => ({
        user_id: newUserId,
        site_id: sId
      }));
      const { error: sitesErr } = await callerClient.from('user_sites').insert(userSiteRows);
      if (sitesErr) {
        // Safe compensation: clean up profile and auth user
        try {
          await callerClient.from('users').delete().eq('id', newUserId);
          if (createdAuthUid) {
            await supabaseAdmin.auth.admin.deleteUser(createdAuthUid);
          }
        } catch (rollbackErr) {
          console.warn('[Provisioning Rollback] Error during sites assignment rollback:', rollbackErr);
        }
        return res.status(500).json({
          success: false,
          error: `Failed to assign sites to newly provisioned user: ${sitesErr.message}`,
          stage: currentStage
        });
      }
    }

    // Insert Audit Log
    currentStage = "AUDIT_LOG_CREATE";
    await callerClient.from('audit_logs').insert({
      tenant_id: targetTenantId,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'USER_CREATION',
      entity_type: 'UserProfile',
      entity_id: newUserId,
      details: { email: cleanEmail, role: targetRoleUpper, tenantId: targetTenantId }
    });

    return res.status(200).json({
      success: true,
      message: `User ${cleanEmail} provisioned successfully`,
      uid: newUserId,
      email: cleanEmail,
      role: targetRoleUpper
    });

  } catch (err: any) {
    console.error(`[Admin Provisioning Error] Stage: ${currentStage}:`, err?.message || err);
    // Rollback compensation in catch block if profile was created
    if (createdProfileInDb && createdAuthUid) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(createdAuthUid);
      } catch (e) {
        console.warn('[Provisioning Rollback Error]:', e);
      }
    }
    return res.status(500).json({ success: false, error: err?.message || "Failed to process user provisioning request", stage: currentStage });
  }
});

// Tenant Deletion Endpoint (Superuser Only)
router.post("/tenant-deletion", async (req, res) => {
  let currentStage = "INIT";
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
    }

    const callerToken = authHeader.substring(7).trim();
    currentStage = "TOKEN_VERIFICATION";
    const verifiedToken = await safeVerifyCallerToken(callerToken);
    const verifiedUid = verifiedToken.uid;

    currentStage = "CALLER_AUTHORIZATION";
    // Authoritative UID identity check
    const callerRes = await safeGetUserProfile(verifiedUid);
    if (!callerRes.exists || !callerRes.data) {
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found" });
    }

    const callerRoleUpper = (callerRes.data.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers can delete tenants" });
    }

    const { tenantId, tenantName } = req.body || {};
    if (!tenantId || typeof tenantId !== 'string') {
      return res.status(400).json({ success: false, error: "Valid tenantId is required" });
    }

    const jobId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Mark tenant as DELETION_PENDING
    const { error: tenantErr } = await supabase
      .from('tenants')
      .update({
        status: 'DELETION_PENDING',
        updated_at: nowIso
      })
      .eq('id', tenantId);

    if (tenantErr) {
      console.warn('[Tenant Deletion] Failed to update tenant status:', tenantErr.message);
      return res.status(500).json({ success: false, error: "Failed to update tenant status" });
    }

    // Persist deletion job record with accurate status DELETION_PENDING
    const { error: jobErr } = await supabase
      .from('tenant_deletion_jobs')
      .insert({
        id: jobId,
        tenant_id: tenantId,
        tenant_name: tenantName || tenantId,
        requested_by: verifiedUid,
        requested_by_email: verifiedToken.email || 'unknown',
        requested_at: nowIso,
        status: 'DELETION_PENDING',
        current_stage: 'INITIATED',
        retry_count: 0
      });

    if (jobErr) {
      console.warn('[Tenant Deletion] Failed to record deletion job:', jobErr.message);
    }

    // Insert Audit Log
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'TENANT_DELETION_INITIATED',
      entity_type: 'Tenant',
      entity_id: tenantId,
      details: { tenantName, jobId, initiatedBy: verifiedUid },
      timestamp: nowIso
    });

    // Accurately model and report status as DELETION_PENDING
    return res.status(200).json({
      success: true,
      jobId,
      tenantId,
      status: 'DELETION_PENDING',
      message: `Tenant deletion initiated and pending for ${tenantName || tenantId}`
    });
  } catch (err: any) {
    console.error(`[Tenant Deletion Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: "Internal server error during tenant deletion" });
  }
});

// Tenant Deletion Retry Endpoint (Superuser Only)
router.post("/tenant-deletion/:jobId/retry", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
    }

    const callerToken = authHeader.substring(7).trim();
    const verifiedToken = await safeVerifyCallerToken(callerToken);
    const verifiedUid = verifiedToken.uid;

    // Authoritative UID identity check
    const callerRes = await safeGetUserProfile(verifiedUid);
    if (!callerRes.exists || !callerRes.data) {
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found" });
    }

    const callerRoleUpper = (callerRes.data.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers can retry tenant deletion jobs" });
    }

    const jobId = req.params.jobId;
    if (!jobId) {
      return res.status(400).json({ success: false, error: "jobId is required" });
    }

    // Look up deletion job in database
    const { data: jobRow, error: jobFetchErr } = await supabase
      .from('tenant_deletion_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobFetchErr) {
      return res.status(500).json({ success: false, error: "Failed to query deletion job" });
    }

    if (!jobRow) {
      return res.status(404).json({ success: false, error: "Tenant deletion job not found" });
    }

    const nowIso = new Date().toISOString();
    const newRetryCount = (jobRow.retry_count || 0) + 1;

    // Update job state
    const { error: updateErr } = await supabase
      .from('tenant_deletion_jobs')
      .update({
        status: 'DELETION_PENDING',
        current_stage: 'RETRY_INITIATED',
        retry_count: newRetryCount,
        updated_at: nowIso
      })
      .eq('id', jobId);

    if (updateErr) {
      return res.status(500).json({ success: false, error: "Failed to update deletion job status" });
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      tenant_id: jobRow.tenant_id,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'TENANT_DELETION_RETRY_REQUESTED',
      entity_type: 'TenantDeletionJob',
      entity_id: jobId,
      details: { retryCount: newRetryCount },
      timestamp: nowIso
    });

    return res.status(200).json({
      success: true,
      jobId,
      tenantId: jobRow.tenant_id,
      status: 'DELETION_PENDING',
      retryCount: newRetryCount,
      message: `Tenant deletion retry recorded for job ${jobId}`
    });
  } catch (err: any) {
    console.error('[Tenant Deletion Retry Error]:', err?.message || err);
    return res.status(500).json({ success: false, error: "Internal server error during retry" });
  }
});

app.use("/api", router);

export default app;
