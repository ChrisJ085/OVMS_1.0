import express from "express";
import crypto from "crypto";
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
    const { data, error } = await supabaseAdmin.auth.getUser(callerToken);
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
async function safeGetUserProfile(uid: string, callerEmail?: string): Promise<{ exists: boolean; data?: any }> {
  if (!uid || typeof uid !== 'string') {
    return { exists: false };
  }

  try {
    // Direct document lookup strictly by authoritative authenticated UID
    const { data: userRow, error } = await supabaseAdmin
      .from('users')
      .select('*, user_sites(site_id)')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.warn('[Server Supabase] safeGetUserProfile query error:', error.message);
    }

    if (userRow && userRow.id === uid) {
      const siteIds = (Array.isArray(userRow.user_sites) && userRow.user_sites.length > 0)
        ? userRow.user_sites.map((us: any) => us.site_id)
        : (Array.isArray(userRow.site_ids) ? userRow.site_ids : []);
      const camel = toCamelCase<any>(userRow);
      return { exists: true, data: { ...camel, siteIds } };
    }

    // Auto-bootstrap fallback if the caller email is an authorized platform superuser
    const normalizedEmail = (callerEmail || userRow?.email || '').toLowerCase().trim();
    const envBootstrapEmail = process.env.INITIAL_SUPERUSER_EMAIL?.toLowerCase().trim();
    const isAuthorizedSuperuser = AUTHORIZED_BOOTSTRAP_EMAILS.includes(normalizedEmail) ||
      (envBootstrapEmail && normalizedEmail === envBootstrapEmail);

    if (isAuthorizedSuperuser) {
      const nowIso = new Date().toISOString();
      const newSuperuser = {
        id: uid,
        email: normalizedEmail,
        display_name: 'Platform Superuser',
        job_title: 'Platform Administrator',
        role: 'PLATFORM_SUPERUSER',
        tenant_id: null,
        account_status: 'ACTIVE',
        requires_password_change: false,
        failed_login_attempts: 0,
        created_by: 'SYSTEM_AUTHORITATIVE_BOOTSTRAP',
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: upsertedRow, error: upsertErr } = await supabaseAdmin
        .from('users')
        .upsert(newSuperuser)
        .select('*, user_sites(site_id)')
        .single();

      if (!upsertErr && upsertedRow) {
        const camel = toCamelCase<any>(upsertedRow);
        return { exists: true, data: { ...camel, siteIds: [] } };
      }
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
    const existing = await safeGetUserProfile(verifiedUid, callerEmail);
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
    const { error: upsertErr } = await supabaseAdmin.from('users').upsert({
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
    await supabaseAdmin.from('audit_logs').insert({
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
    // Authoritative UID identity check
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
      let query = supabaseAdmin.from('sites').select('id, site_code, tenant_id');
      if (targetTenantId) {
        query = query.eq('tenant_id', targetTenantId);
      }
      const { data: tenantSites, error: siteCheckErr } = await query;

      if (siteCheckErr) {
        return res.status(500).json({ success: false, error: "Failed to validate site assignments", stage: currentStage });
      }

      const validIdToUuidMap = new Map<string, string>();
      (tenantSites || []).forEach((s: any) => {
        if (s.id) validIdToUuidMap.set(s.id, s.id);
        if (s.site_code) validIdToUuidMap.set(s.site_code, s.id);
      });

      const resolvedSiteUuids: string[] = [];
      const invalidSites: string[] = [];
      for (const inputId of siteIds) {
        const mappedUuid = validIdToUuidMap.get(String(inputId).trim());
        if (mappedUuid) {
          if (!resolvedSiteUuids.includes(mappedUuid)) {
            resolvedSiteUuids.push(mappedUuid);
          }
        } else {
          invalidSites.push(inputId);
        }
      }

      if (invalidSites.length > 0) {
        return res.status(403).json({
          success: false,
          error: `Cannot assign sites: the following sites are invalid or do not belong to the target tenant: [${invalidSites.join(', ')}]`,
          stage: currentStage
        });
      }
      validatedSiteIds = resolvedSiteUuids;
    }

    // Cryptographically random password generation if not explicitly provided (no hardcoded credentials)
    const secureRandomPassword = crypto.randomBytes(18).toString('base64url') + 'A1!';
    const initialPassword = temporaryPassword && typeof temporaryPassword === 'string' && temporaryPassword.trim().length >= 8
      ? temporaryPassword.trim()
      : secureRandomPassword;

    // Create account via Supabase Admin Auth API (or update password if user already exists)
    currentStage = "SUPABASE_AUTH_CREATE";
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        display_name: displayName.trim()
      }
    });

    let newUserId: string;
    if (authErr || !authData?.user?.id) {
      const errMsg = authErr?.message || 'Failed to create Supabase Auth user';
      const isDuplicate = errMsg.toLowerCase().includes('already') || errMsg.toLowerCase().includes('registered') || errMsg.toLowerCase().includes('exists');
      
      if (isDuplicate) {
        currentStage = "SUPABASE_AUTH_LOOKUP_EXISTING";
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = (listData as any)?.users?.find((u: any) => u.email?.toLowerCase() === cleanEmail);
        if (!existingUser) {
          return res.status(400).json({ success: false, error: `Account exists in Auth but could not be located: ${errMsg}`, stage: currentStage });
        }
        newUserId = existingUser.id;
        createdAuthUid = existingUser.id;

        currentStage = "SUPABASE_AUTH_UPDATE_PASSWORD";
        const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(newUserId, {
          password: initialPassword,
          user_metadata: { display_name: displayName.trim() }
        });
        if (updateAuthErr) {
          return res.status(400).json({ success: false, error: `Failed to update password for existing user: ${updateAuthErr.message}`, stage: currentStage });
        }
      } else {
        return res.status(400).json({
          success: false,
          error: errMsg,
          stage: currentStage
        });
      }
    } else {
      newUserId = authData.user.id;
      createdAuthUid = authData.user.id;
    }

    currentStage = "USER_PROFILE_CREATE";
    const { error: profileErr } = await supabaseAdmin.from('users').upsert({
      id: newUserId,
      email: cleanEmail,
      display_name: displayName.trim(),
      job_title: jobTitle ? String(jobTitle).trim() : '',
      role: targetRoleUpper,
      tenant_id: targetTenantId,
      site_ids: validatedSiteIds,
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

    // Insert user site assignments into user_sites table
    let userSitesWarning: string | null = null;
    if (validatedSiteIds.length > 0) {
      currentStage = "USER_SITES_ASSIGN";
      const userSiteRows = validatedSiteIds.map((sId: string) => ({
        user_id: newUserId,
        site_id: sId
      }));
      const { error: sitesErr } = await supabaseAdmin
        .from('user_sites')
        .upsert(userSiteRows, { onConflict: 'user_id,site_id' });

      if (sitesErr) {
        console.warn('[Provisioning Sites Assignment Warning]:', sitesErr.message);
        // If the error is due to missing modified_date column on user_sites trigger
        if (sitesErr.message?.includes('modified_date') || sitesErr.code === '42703') {
          userSitesWarning = 'User provisioned and site permissions saved to user profile. Notice: The user_sites join table requires the migration in docs/migration_fix_user_sites.sql to be run in Supabase SQL editor.';
        } else {
          // Fatal unexpected error: rollback profile and auth user
          try {
            await supabaseAdmin.from('users').delete().eq('id', newUserId);
            if (createdAuthUid) {
              await supabaseAdmin.auth.admin.deleteUser(createdAuthUid);
            }
          } catch (rollbackErr) {
            console.warn('[Provisioning Rollback] Error during sites assignment rollback:', rollbackErr);
          }
          return res.status(500).json({
            success: false,
            error: `Failed to assign sites to newly provisioned user: ${sitesErr.message}. Ensure the user_sites table migration is applied.`,
            stage: currentStage
          });
        }
      }
    }

    // Insert Audit Log
    currentStage = "AUDIT_LOG_CREATE";
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: targetTenantId,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'USER_CREATION',
      entity_type: 'UserProfile',
      entity_id: newUserId,
      details: { email: cleanEmail, role: targetRoleUpper, tenantId: targetTenantId, siteIds: validatedSiteIds, warning: userSitesWarning }
    });

    return res.status(200).json({
      success: true,
      message: `User ${cleanEmail} provisioned successfully`,
      uid: newUserId,
      email: cleanEmail,
      role: targetRoleUpper,
      siteIds: validatedSiteIds,
      warning: userSitesWarning
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

// Admin Update User Sites Endpoint
router.post("/admin/update-user-sites", async (req, res) => {
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
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found", stage: currentStage });
    }

    const callerProfile = callerRes.data;
    const callerRoleUpper = (callerProfile.role || '').toUpperCase().trim();

    if (callerRoleUpper !== 'PLATFORM_SUPERUSER' && callerRoleUpper !== 'TENANT_ADMIN') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Tenant Admins or Superusers can update user sites", stage: currentStage });
    }

    const { targetUserId, siteIds } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: "targetUserId is required", stage: "VALIDATION" });
    }
    if (!Array.isArray(siteIds)) {
      return res.status(400).json({ success: false, error: "siteIds must be an array of site IDs", stage: "VALIDATION" });
    }

    currentStage = "TARGET_USER_LOOKUP";
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('users')
      .select('id, email, role, tenant_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetUser) {
      return res.status(404).json({ success: false, error: "Target user not found", stage: currentStage });
    }

    if (callerRoleUpper === 'TENANT_ADMIN' && targetUser.tenant_id !== callerProfile.tenantId) {
      return res.status(403).json({ success: false, error: "Forbidden: You cannot modify users belonging to another tenant", stage: currentStage });
    }

    const targetTenantId = targetUser.tenant_id;
    let validatedSiteIds: string[] = [];

    if (siteIds.length > 0) {
      let query = supabaseAdmin.from('sites').select('id, site_code, tenant_id');
      if (targetTenantId) {
        query = query.eq('tenant_id', targetTenantId);
      }
      const { data: tenantSites, error: siteCheckErr } = await query;
      if (siteCheckErr) {
        return res.status(500).json({ success: false, error: "Failed to validate site assignments", stage: currentStage });
      }

      const validIdToUuidMap = new Map<string, string>();
      (tenantSites || []).forEach((s: any) => {
        if (s.id) validIdToUuidMap.set(s.id, s.id);
        if (s.site_code) validIdToUuidMap.set(s.site_code, s.id);
      });

      const resolvedSiteUuids: string[] = [];
      const invalidSites: string[] = [];
      for (const inputId of siteIds) {
        const mappedUuid = validIdToUuidMap.get(String(inputId).trim());
        if (mappedUuid) {
          if (!resolvedSiteUuids.includes(mappedUuid)) {
            resolvedSiteUuids.push(mappedUuid);
          }
        } else {
          invalidSites.push(inputId);
        }
      }

      if (invalidSites.length > 0) {
        return res.status(403).json({
          success: false,
          error: `Cannot assign sites: invalid or unauthorized sites [${invalidSites.join(', ')}]`,
          stage: currentStage
        });
      }
      validatedSiteIds = resolvedSiteUuids;
    }

    // 1. Update site_ids directly on users profile table
    currentStage = "USER_PROFILE_UPDATE";
    const { error: userUpdateErr } = await supabaseAdmin
      .from('users')
      .update({
        site_ids: validatedSiteIds,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetUserId);

    if (userUpdateErr) {
      return res.status(500).json({
        success: false,
        error: `Failed to update site assignments on user profile: ${userUpdateErr.message}`,
        stage: currentStage
      });
    }

    // 2. Sync to user_sites join table (with graceful fallback for trigger schema mismatch)
    let userSitesWarning: string | null = null;
    currentStage = "USER_SITES_DELETE";
    const { error: deleteErr } = await supabaseAdmin
      .from('user_sites')
      .delete()
      .eq('user_id', targetUserId);

    if (deleteErr) {
      console.warn('[update-user-sites] deleteErr:', deleteErr.message);
    }

    if (validatedSiteIds.length > 0) {
      currentStage = "USER_SITES_INSERT";
      const userSiteRows = validatedSiteIds.map((sId: string) => ({
        user_id: targetUserId,
        site_id: sId
      }));

      const { error: insertErr } = await supabaseAdmin
        .from('user_sites')
        .upsert(userSiteRows, { onConflict: 'user_id,site_id' });

      if (insertErr) {
        console.warn('[update-user-sites] user_sites insert warning:', insertErr.message);
        if (insertErr.message?.includes('modified_date') || insertErr.code === '42703') {
          userSitesWarning = 'Site assignments saved to user profile. Notice: Run migration_fix_user_sites.sql in Supabase SQL editor to sync the user_sites join table.';
        } else {
          return res.status(500).json({
            success: false,
            error: `Failed to insert user site assignments: ${insertErr.message}. Ensure the user_sites table migration is applied.`,
            stage: currentStage
          });
        }
      }
    }

    // Audit log
    currentStage = "AUDIT_LOG_CREATE";
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: targetTenantId,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'USER_SITES_UPDATE',
      entity_type: 'UserProfile',
      entity_id: targetUserId,
      details: { targetEmail: targetUser.email, assignedSites: validatedSiteIds, warning: userSitesWarning }
    });

    return res.status(200).json({
      success: true,
      message: `User site assignments updated successfully (${validatedSiteIds.length} sites assigned).`,
      targetUserId,
      siteIds: validatedSiteIds,
      warning: userSitesWarning
    });
  } catch (err: any) {
    console.error(`[Admin Update User Sites Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to update user sites", stage: currentStage });
  }
});

// Admin Change User Role Endpoint (Superuser or Tenant Admin)
router.post("/admin/change-user-role", async (req, res) => {
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
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found", stage: currentStage });
    }

    const callerProfile = callerRes.data;
    const callerRoleUpper = (callerProfile.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER' && callerRoleUpper !== 'TENANT_ADMIN') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Tenant Admins or Platform Superusers can modify user roles", stage: currentStage });
    }

    currentStage = "VALIDATION";
    const body = req.body || {};
    const { targetUserId, newRole } = body;

    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ success: false, error: "targetUserId is required", stage: currentStage });
    }

    const VALID_ROLES = ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR', 'VIEWER', 'DISPLAY'];
    const normalizedNewRole = (newRole || '').toUpperCase().trim();
    if (!VALID_ROLES.includes(normalizedNewRole)) {
      return res.status(400).json({
        success: false,
        error: `Invalid role specified '${newRole}'. Allowed roles: ${VALID_ROLES.join(', ')}`,
        stage: currentStage
      });
    }

    currentStage = "TARGET_USER_LOOKUP";
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('users')
      .select('*, user_sites(site_id)')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetUser) {
      return res.status(404).json({ success: false, error: "Target user profile not found", stage: currentStage });
    }

    const targetCurrentRole = (targetUser.role || '').toUpperCase().trim();

    // 1. Role modification scope & restriction checks for TENANT_ADMIN
    if (callerRoleUpper === 'TENANT_ADMIN') {
      // A TENANT_ADMIN cannot promote anyone (or themselves) to PLATFORM_SUPERUSER
      if (normalizedNewRole === 'PLATFORM_SUPERUSER') {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Tenant Admins cannot grant Platform Superuser privileges or promote users to PLATFORM_SUPERUSER.",
          stage: "ROLE_PERMISSION_CHECK"
        });
      }

      // A TENANT_ADMIN cannot modify a user who is currently a PLATFORM_SUPERUSER
      if (targetCurrentRole === 'PLATFORM_SUPERUSER') {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Tenant Admins cannot alter Platform Superuser accounts.",
          stage: "ROLE_PERMISSION_CHECK"
        });
      }

      // Target user must belong to caller's tenant
      if (targetUser.tenant_id !== callerProfile.tenantId) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: Tenant Admins can only modify users belonging to their own tenant.",
          stage: "TENANT_AUTHORIZATION"
        });
      }

      // Target user must share at least one assigned site with caller (unless caller has full tenant scope)
      const callerSiteIds = callerProfile.siteIds || [];
      const targetSiteIds = (Array.isArray(targetUser.user_sites) && targetUser.user_sites.length > 0)
        ? targetUser.user_sites.map((us: any) => us.site_id)
        : (Array.isArray(targetUser.site_ids) ? targetUser.site_ids : []);

      if (callerSiteIds.length > 0) {
        const isSelf = targetUserId === verifiedUid;
        const sharesSite = targetSiteIds.some((sId: string) => callerSiteIds.includes(sId));
        if (!isSelf && !sharesSite) {
          return res.status(403).json({
            success: false,
            error: "Forbidden: You can only modify user roles for users assigned to your site(s).",
            stage: "SITE_AUTHORIZATION"
          });
        }
      }
    }

    // 2. Sole Platform Superuser Demotion Guard
    if (targetCurrentRole === 'PLATFORM_SUPERUSER' && normalizedNewRole !== 'PLATFORM_SUPERUSER') {
      const { count: superuserCount } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'PLATFORM_SUPERUSER')
        .neq('id', targetUserId);

      if (!superuserCount || superuserCount === 0) {
        return res.status(400).json({
          success: false,
          error: "Cannot remove PLATFORM_SUPERUSER role: This user is the only Platform Superuser on the system. There must be at least one active Platform Superuser.",
          stage: "SUPERUSER_GUARD"
        });
      }
    }

    // 3. Sole TENANT_ADMIN Protection Guard (Applies to both PLATFORM_SUPERUSER and TENANT_ADMIN)
    // "a PLATFORM_SUPERUSER cannot change remove TENANT_ADMIN roles from a user if there is only that user as the only TENANT_ADMIN for that site, there must be another."
    if (targetCurrentRole === 'TENANT_ADMIN' && normalizedNewRole !== 'TENANT_ADMIN') {
      const targetSiteIds: string[] = (Array.isArray(targetUser.user_sites) && targetUser.user_sites.length > 0)
        ? targetUser.user_sites.map((us: any) => us.site_id)
        : (Array.isArray(targetUser.site_ids) ? targetUser.site_ids : []);

      // Fetch all other TENANT_ADMIN users in this tenant
      let adminQuery = supabaseAdmin
        .from('users')
        .select('id, email, display_name, role, site_ids, user_sites(site_id), account_status')
        .eq('role', 'TENANT_ADMIN')
        .neq('id', targetUserId);

      if (targetUser.tenant_id) {
        adminQuery = adminQuery.eq('tenant_id', targetUser.tenant_id);
      }

      const { data: otherAdmins } = await adminQuery;
      const activeOtherAdmins = (otherAdmins || []).filter(
        (a: any) => a.account_status !== 'ARCHIVED' && a.account_status !== 'DISABLED'
      );

      if (targetSiteIds.length > 0) {
        // Check every site assigned to this target user
        for (const sId of targetSiteIds) {
          const hasOtherAdminForSite = activeOtherAdmins.some((admin: any) => {
            const adminSites = (Array.isArray(admin.user_sites) && admin.user_sites.length > 0)
              ? admin.user_sites.map((us: any) => us.site_id)
              : (Array.isArray(admin.site_ids) ? admin.site_ids : []);
            // Tenant admin with empty sites has tenant-wide admin scope, or explicitly assigned to this site
            return adminSites.length === 0 || adminSites.includes(sId);
          });

          if (!hasOtherAdminForSite) {
            const { data: siteInfo } = await supabaseAdmin
              .from('sites')
              .select('id, site_name, site_code')
              .eq('id', sId)
              .maybeSingle();

            const siteLabel = siteInfo?.site_name ? `${siteInfo.site_name} (${siteInfo.site_code || sId})` : sId;
            return res.status(400).json({
              success: false,
              error: `Cannot remove TENANT_ADMIN role: ${targetUser.display_name || targetUser.email} is the only TENANT_ADMIN for site "${siteLabel}". There must be another TENANT_ADMIN assigned to this site before this role can be removed.`,
              stage: "TENANT_ADMIN_GUARD"
            });
          }
        }
      } else {
        // Target has no specific site restrictions (tenant-wide TENANT_ADMIN)
        if (activeOtherAdmins.length === 0) {
          return res.status(400).json({
            success: false,
            error: `Cannot remove TENANT_ADMIN role: ${targetUser.display_name || targetUser.email} is the only TENANT_ADMIN in this tenant. Another user must be designated as TENANT_ADMIN first.`,
            stage: "TENANT_ADMIN_GUARD"
          });
        }
      }
    }

    // 4. Update the user role in public.users
    currentStage = "USER_ROLE_UPDATE";
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update({
        role: normalizedNewRole,
        updated_at: nowIso
      })
      .eq('id', targetUserId);

    if (updateErr) {
      return res.status(500).json({
        success: false,
        error: `Failed to update user role in database: ${updateErr.message}`,
        stage: currentStage
      });
    }

    // 5. Record Audit Log
    currentStage = "AUDIT_LOG_CREATE";
    try {
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: targetUser.tenant_id || null,
        user_id: verifiedUid,
        user_email: verifiedToken.email,
        action: 'USER_ROLE_CHANGE',
        entity_type: 'UserProfile',
        entity_id: targetUserId,
        details: {
          targetEmail: targetUser.email,
          targetDisplayName: targetUser.display_name,
          previousRole: targetUser.role,
          newRole: normalizedNewRole,
          modifiedByRole: callerRoleUpper
        },
        timestamp: nowIso
      });
    } catch (auditErr: any) {
      console.warn('[change-user-role] Audit log warning:', auditErr?.message);
    }

    return res.status(200).json({
      success: true,
      message: `Role for ${targetUser.display_name || targetUser.email} successfully changed from ${targetUser.role} to ${normalizedNewRole}`,
      targetUserId,
      previousRole: targetUser.role,
      newRole: normalizedNewRole
    });
  } catch (err: any) {
    console.error(`[Admin Change User Role Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to update user role", stage: currentStage });
  }
});

// Admin Reset User Password Endpoint (Superuser or Tenant Admin)
router.post("/admin/reset-user-password", async (req, res) => {
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
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found", stage: currentStage });
    }

    currentStage = "CALLER_AUTHORIZATION";
    const callerProfile = callerRes.data;
    const callerRoleUpper = (callerProfile.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER' && callerRoleUpper !== 'TENANT_ADMIN') {
      return res.status(403).json({ success: false, error: "Forbidden: Insufficient permissions to reset passwords", stage: currentStage });
    }

    currentStage = "VALIDATION";
    const body = req.body || {};
    const { userId, temporaryPassword } = body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, error: "User ID is required", stage: currentStage });
    }
    if (!temporaryPassword || typeof temporaryPassword !== 'string' || temporaryPassword.trim().length < 8) {
      return res.status(400).json({ success: false, error: "Temporary password must be at least 8 characters long", stage: currentStage });
    }

    currentStage = "TARGET_USER_LOOKUP";
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('users')
      .select('id, email, tenant_id')
      .eq('id', userId)
      .maybeSingle();

    if (targetErr || !targetUser) {
      return res.status(404).json({ success: false, error: "Target user not found", stage: currentStage });
    }

    if (callerRoleUpper === 'TENANT_ADMIN' && targetUser.tenant_id !== callerProfile.tenantId) {
      return res.status(403).json({ success: false, error: "Forbidden: Tenant Admins can only reset passwords for users in their own tenant", stage: currentStage });
    }

    currentStage = "SUPABASE_AUTH_UPDATE";
    const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: temporaryPassword.trim(),
      user_metadata: { requires_password_change: true }
    });

    if (updateAuthErr) {
      return res.status(400).json({ success: false, error: `Failed to update auth password: ${updateAuthErr.message}`, stage: currentStage });
    }

    currentStage = "USER_PROFILE_UPDATE";
    await supabaseAdmin
      .from('users')
      .update({
        requires_password_change: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    currentStage = "AUDIT_LOG_CREATE";
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: targetUser.tenant_id,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'RESET_USER_PASSWORD',
      entity_type: 'UserProfile',
      entity_id: userId,
      details: { targetEmail: targetUser.email }
    });

    return res.status(200).json({
      success: true,
      message: `Temporary password reset successfully for ${targetUser.email}`,
      temporaryPassword: temporaryPassword.trim()
    });
  } catch (err: any) {
    console.error(`[Admin Reset Password Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to reset password", stage: currentStage });
  }
});

// Admin Delete User Endpoint (Platform Superuser Only)
router.post("/admin/delete-user", async (req, res) => {
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
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found", stage: currentStage });
    }

    currentStage = "CALLER_AUTHORIZATION";
    const callerProfile = callerRes.data;
    const callerRoleUpper = (callerProfile.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers can delete user accounts", stage: currentStage });
    }

    currentStage = "VALIDATION";
    const body = req.body || {};
    const { userId } = body;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ success: false, error: "User ID is required", stage: currentStage });
    }

    if (userId === verifiedUid) {
      return res.status(400).json({ success: false, error: "Cannot delete your own active Platform Superuser account", stage: currentStage });
    }

    currentStage = "TARGET_USER_LOOKUP";
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('id, email, role, tenant_id, display_name')
      .eq('id', userId)
      .maybeSingle();

    // 1. Delete associated site links in user_sites table
    currentStage = "USER_SITES_DELETE";
    try {
      await supabaseAdmin.from('user_sites').delete().eq('user_id', userId);
    } catch (err: any) {
      console.warn('[delete-user] user_sites delete non-fatal error:', err?.message);
    }

    // 2. Delete from public.users table
    currentStage = "USER_PROFILE_DELETE";
    const { error: profileDeleteErr } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (profileDeleteErr) {
      if (profileDeleteErr.message?.includes('audit_logs') || profileDeleteErr.message?.includes('immutable')) {
        return res.status(500).json({
          success: false,
          error: `Database Policy Conflict: The audit_logs table contains foreign key constraints that prevent deleting this user. Please execute the migration script 'docs/migration_fix_audit_logs_and_deletion.sql' in your Supabase SQL Editor to drop the audit_logs foreign key constraints.`,
          stage: currentStage
        });
      }
      return res.status(500).json({ success: false, error: `Failed to delete user profile from database: ${profileDeleteErr.message}`, stage: currentStage });
    }

    // 3. Delete from Supabase Auth
    currentStage = "SUPABASE_AUTH_DELETE";
    try {
      const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authDeleteErr) {
        console.warn(`[delete-user] Auth deletion notice for ${userId}:`, authDeleteErr.message);
      }
    } catch (authErr: any) {
      console.warn(`[delete-user] Auth deletion exception for ${userId}:`, authErr?.message);
    }

    // 4. Record Audit Log
    currentStage = "AUDIT_LOG_CREATE";
    try {
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: targetUser?.tenant_id || null,
        user_id: verifiedUid,
        user_email: verifiedToken.email,
        action: 'USER_DELETE',
        entity_type: 'UserProfile',
        entity_id: userId,
        details: {
          deletedEmail: targetUser?.email || userId,
          deletedName: targetUser?.display_name,
          deletedRole: targetUser?.role
        }
      });
    } catch (auditErr: any) {
      console.warn('[delete-user] Audit log insert warning:', auditErr?.message);
    }

    return res.status(200).json({
      success: true,
      message: `User account (${targetUser?.email || userId}) deleted permanently from the database and authentication system.`,
      deletedUserId: userId
    });
  } catch (err: any) {
    console.error(`[Admin Delete User Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to delete user account", stage: currentStage });
  }
});

// Admin Tenant Provisioning Endpoint (Superuser Only)
router.post("/admin/provision-tenant", async (req, res) => {
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
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found", stage: currentStage });
    }

    currentStage = "CALLER_AUTHORIZATION";
    const callerRoleUpper = (callerRes.data.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers can create tenants", stage: currentStage });
    }

    currentStage = "VALIDATION";
    const body = req.body || {};
    const tenantName = (body.tenantName || body.name || '').trim();
    const tenantCode = (body.tenantCode || body.code || '').trim().toUpperCase();

    if (!tenantName) {
      return res.status(400).json({ success: false, error: "Tenant Name is required", stage: currentStage });
    }
    if (!tenantCode) {
      return res.status(400).json({ success: false, error: "Tenant Code is required", stage: currentStage });
    }

    currentStage = "TENANT_DUPLICATE_CHECK";
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id, tenant_code, name')
      .or(`tenant_code.eq.${tenantCode},name.eq.${tenantName}`)
      .maybeSingle();

    if (existingTenant) {
      return res.status(409).json({
        success: false,
        error: `A tenant with code '${tenantCode}' or name '${tenantName}' already exists.`,
        stage: currentStage
      });
    }

    currentStage = "TENANT_CREATE";
    const tenantId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newTenantRecord = {
      id: tenantId,
      name: tenantName,
      tenant_name: tenantName,
      tenant_code: tenantCode,
      active: true,
      status: 'active',
      is_system_tenant: false,
      created_by: verifiedUid,
      created_at: nowIso,
      created_date: nowIso,
      modified_by: verifiedUid,
      modified_date: nowIso,
      updated_at: nowIso
    };

    const { error: insertErr } = await supabaseAdmin
      .from('tenants')
      .insert(newTenantRecord);

    if (insertErr) {
      return res.status(500).json({
        success: false,
        error: `Failed to create tenant in database: ${insertErr.message}`,
        stage: currentStage
      });
    }

    currentStage = "AUDIT_LOG_CREATE";
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'TENANT_CREATION',
      entity_type: 'Tenant',
      entity_id: tenantId,
      details: { tenantName, tenantCode, createdBy: verifiedUid },
      timestamp: nowIso
    });

    return res.status(200).json({
      success: true,
      message: `Tenant ${tenantName} (${tenantCode}) successfully created.`,
      tenantId,
      tenant: {
        id: tenantId,
        name: tenantName,
        tenantName,
        tenantCode,
        active: true,
        status: 'active'
      }
    });

  } catch (err: any) {
    console.error(`[Admin Provision Tenant Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to process tenant provisioning request", stage: currentStage });
  }
});

// Helper function to execute full background/synchronous deletion of tenant and its child resources
async function executeTenantDeletion(tenantId: string, jobId: string | null, verifiedUid?: string, verifiedEmail?: string) {
  let totalDocsDeleted = 0;
  let totalUsersDeleted = 0;
  const failures: string[] = [];

  const updateJob = async (status: string, stage: string, extra: Record<string, any> = {}) => {
    if (!jobId) return;
    try {
      await supabaseAdmin
        .from('tenant_deletion_jobs')
        .update({
          status,
          current_stage: stage,
          documents_deleted: totalDocsDeleted,
          users_deleted: totalUsersDeleted,
          failures,
          updated_at: new Date().toISOString(),
          ...extra
        })
        .eq('id', jobId);
    } catch (e) {
      console.warn('[executeTenantDeletion] Job update warning:', e);
    }
  };

  try {
    // 0. Fetch tenant details beforehand for final permanent audit logging
    let targetTenantName = 'Unknown';
    let targetTenantCode = '';
    try {
      const { data: tenantData } = await supabaseAdmin
        .from('tenants')
        .select('name, tenant_name, tenant_code')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantData) {
        targetTenantName = tenantData.tenant_name || tenantData.name || targetTenantName;
        targetTenantCode = tenantData.tenant_code || '';
      }
    } catch (tFetchErr) {
      console.warn('[executeTenantDeletion] Could not fetch tenant metadata:', tFetchErr);
    }

    await updateJob('IN_PROGRESS', 'PURGING_USERS');

    // 1. Fetch all users belonging to this tenant
    const { data: tenantUsers } = await supabaseAdmin
      .from('users')
      .select('id, email, role')
      .eq('tenant_id', tenantId);

    if (tenantUsers && tenantUsers.length > 0) {
      for (const u of tenantUsers) {
        // PLATFORM_SUPERUSER does not belong to a single tenant and must never be deleted with a tenant
        if (u.role === 'PLATFORM_SUPERUSER') {
          try {
            await supabaseAdmin
              .from('users')
              .update({ tenant_id: null, updated_at: new Date().toISOString() })
              .eq('id', u.id);
          } catch (spErr: any) {
            console.warn(`[executeTenantDeletion] Error unlinking superuser ${u.email}:`, spErr?.message);
          }
          continue;
        }

        try {
          await supabaseAdmin.from('user_sites').delete().eq('user_id', u.id);
          await supabaseAdmin.from('user_favorites').delete().eq('user_id', u.id);
          await supabaseAdmin.from('users').delete().eq('id', u.id);
          await supabaseAdmin.auth.admin.deleteUser(u.id);
          totalUsersDeleted++;
          totalDocsDeleted++;
        } catch (uErr: any) {
          console.warn(`[executeTenantDeletion] Error removing user ${u.email}:`, uErr?.message);
          failures.push(`User ${u.email}: ${uErr?.message}`);
        }
      }
    }

    // 2. Cascade delete records from all operational tables containing tenant_id (audit_logs is preserved)
    const collections = [
      'inventory_transactions',
      'inventory_balances',
      'inventory_snapshots',
      'priority_events',
      'priorities',
      'exceptions',
      'announcements',
      'planning_rules',
      'promotions',
      'promotion_product_rules',
      'recommendation_runs',
      'recommendations',
      'production_plan_imports',
      'production_plan_entries',
      'production_events',
      'northfleet_sto_imports',
      'northfleet_sto_requirements',
      'site_settings',
      'site_onboarding',
      'products',
      'pallets',
      'sites'
    ];

    for (const coll of collections) {
      await updateJob('IN_PROGRESS', `PURGING_${coll.toUpperCase()}`);
      try {
        await supabaseAdmin
          .from(coll)
          .delete()
          .eq('tenant_id', tenantId);
        totalDocsDeleted++;
      } catch (collErr: any) {
        console.warn(`[executeTenantDeletion] Exception on ${coll}:`, collErr.message);
      }
    }

    // 3. Delete tenant itself
    await updateJob('IN_PROGRESS', 'PURGING_TENANT');
    const { error: tenantDelErr } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', tenantId);

    if (tenantDelErr) {
      failures.push(`Tenant record: ${tenantDelErr.message}`);
      throw tenantDelErr;
    }

    totalDocsDeleted++;

    // 4. Record Immutable Audit Log that Tenant was deleted
    const completedTimestamp = new Date().toISOString();
    try {
      await supabaseAdmin.from('audit_logs').insert({
        tenant_id: null,
        site_id: null,
        user_id: verifiedUid || null,
        user_email: verifiedEmail || 'system',
        action: 'TENANT_DELETED',
        entity_type: 'Tenant',
        entity_id: tenantId,
        details: {
          tenantId,
          tenantName: targetTenantName,
          tenantCode: targetTenantCode,
          deletedByUid: verifiedUid || null,
          deletedByEmail: verifiedEmail || null,
          totalUsersDeleted,
          totalDocsDeleted,
          deletedAt: completedTimestamp,
          status: 'COMPLETED'
        },
        timestamp: completedTimestamp
      });
    } catch (auditErr: any) {
      console.warn('[executeTenantDeletion] Audit log insert warning:', auditErr?.message);
    }

    // 5. Mark job as COMPLETED
    await updateJob('COMPLETED', 'FINISHED', {
      completed_at: completedTimestamp
    });

    console.log(`[executeTenantDeletion] Successfully deleted tenant ${tenantId}.`);
    return { success: true, totalDocsDeleted, totalUsersDeleted };
  } catch (err: any) {
    console.error(`[executeTenantDeletion] Error deleting tenant ${tenantId}:`, err?.message || err);
    await updateJob('FAILED', 'FAILED', {
      failures: [...failures, err?.message || 'Deletion execution failed']
    });
    return { success: false, error: err?.message || 'Deletion execution failed' };
  }
}

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
    const callerRes = await safeGetUserProfile(verifiedUid, verifiedToken.email);
    if (!callerRes.exists || !callerRes.data) {
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found" });
    }

    const callerRoleUpper = (callerRes.data.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers can delete tenants" });
    }

    const { tenantId, tenantName, forceImmediate } = req.body || {};
    if (!tenantId || typeof tenantId !== 'string') {
      return res.status(400).json({ success: false, error: "Valid tenantId is required" });
    }

    const jobId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    // Mark tenant as DELETION_PENDING
    await supabaseAdmin
      .from('tenants')
      .update({
        status: 'DELETION_PENDING',
        updated_at: nowIso
      })
      .eq('id', tenantId);

    // Persist deletion job record
    await supabaseAdmin
      .from('tenant_deletion_jobs')
      .insert({
        id: jobId,
        tenant_id: tenantId,
        tenant_name: tenantName || tenantId,
        requested_by: verifiedUid,
        requested_by_email: verifiedToken.email || 'unknown',
        requested_at: nowIso,
        status: 'IN_PROGRESS',
        current_stage: 'INITIATING',
        retry_count: 0
      });

    // Insert Audit Log (with tenant_id: null to prevent foreign key cascade conflicts upon tenant purge)
    await supabaseAdmin.from('audit_logs').insert({
      tenant_id: null,
      site_id: null,
      user_id: verifiedUid,
      user_email: verifiedToken.email,
      action: 'TENANT_DELETION_INITIATED',
      entity_type: 'Tenant',
      entity_id: tenantId,
      details: { tenantId, tenantName, jobId, initiatedBy: verifiedUid, initiatedByEmail: verifiedToken.email },
      timestamp: nowIso
    });

    if (forceImmediate) {
      const execResult = await executeTenantDeletion(tenantId, jobId, verifiedUid, verifiedToken.email);
      return res.status(200).json({
        success: execResult.success,
        jobId,
        tenantId,
        status: execResult.success ? 'COMPLETED' : 'FAILED',
        error: execResult.error,
        message: `Tenant deletion executed for ${tenantName || tenantId}`
      });
    } else {
      // Run in background and respond immediately with job ID
      executeTenantDeletion(tenantId, jobId, verifiedUid, verifiedToken.email).catch(e => {
        console.error('[tenant-deletion background error]:', e);
      });

      return res.status(200).json({
        success: true,
        jobId,
        tenantId,
        status: 'IN_PROGRESS',
        message: `Tenant deletion initiated for ${tenantName || tenantId}`
      });
    }
  } catch (err: any) {
    console.error(`[Tenant Deletion Error] Stage: ${currentStage}:`, err?.message || err);
    return res.status(500).json({ success: false, error: "Internal server error during tenant deletion" });
  }
});

// Cancel Tenant Deletion / Restore to Active (Superuser Only)
router.post("/admin/cancel-tenant-deletion", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
    }

    const callerToken = authHeader.substring(7).trim();
    const verifiedToken = await safeVerifyCallerToken(callerToken);
    const verifiedUid = verifiedToken.uid;

    const callerRes = await safeGetUserProfile(verifiedUid, verifiedToken.email);
    if (!callerRes.exists || !callerRes.data) {
      return res.status(403).json({ success: false, error: "Forbidden: Caller profile not found" });
    }

    const callerRoleUpper = (callerRes.data.role || '').toUpperCase().trim();
    if (callerRoleUpper !== 'PLATFORM_SUPERUSER') {
      return res.status(403).json({ success: false, error: "Forbidden: Only Platform Superusers can manage tenants" });
    }

    const { tenantId } = req.body || {};
    if (!tenantId) {
      return res.status(400).json({ success: false, error: "tenantId is required" });
    }

    const nowIso = new Date().toISOString();

    // Restore tenant status to active
    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        status: 'active',
        updated_at: nowIso
      })
      .eq('id', tenantId);

    if (updateErr) {
      return res.status(500).json({ success: false, error: `Failed to restore tenant: ${updateErr.message}` });
    }

    // Cancel any active jobs
    await supabaseAdmin
      .from('tenant_deletion_jobs')
      .update({
        status: 'CANCELLED',
        current_stage: 'CANCELLED_BY_ADMIN',
        updated_at: nowIso
      })
      .eq('tenant_id', tenantId)
      .eq('status', 'DELETION_PENDING');

    return res.status(200).json({
      success: true,
      message: `Tenant status successfully restored to active.`
    });
  } catch (err: any) {
    console.error('[Cancel Tenant Deletion Error]:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || "Failed to cancel tenant deletion" });
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

    const callerRes = await safeGetUserProfile(verifiedUid, verifiedToken.email);
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

    const { data: jobRow, error: jobFetchErr } = await supabaseAdmin
      .from('tenant_deletion_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (jobFetchErr || !jobRow) {
      return res.status(404).json({ success: false, error: "Tenant deletion job not found" });
    }

    const nowIso = new Date().toISOString();
    const newRetryCount = (jobRow.retry_count || 0) + 1;

    await supabaseAdmin
      .from('tenant_deletion_jobs')
      .update({
        status: 'IN_PROGRESS',
        current_stage: 'RETRY_INITIATED',
        retry_count: newRetryCount,
        updated_at: nowIso
      })
      .eq('id', jobId);

    // Run deletion execution
    executeTenantDeletion(jobRow.tenant_id, jobId, verifiedUid, verifiedToken.email).catch(e => {
      console.error('[Tenant Deletion Retry Execution Error]:', e);
    });

    return res.status(200).json({
      success: true,
      jobId,
      tenantId: jobRow.tenant_id,
      status: 'IN_PROGRESS',
      retryCount: newRetryCount,
      message: `Tenant deletion retry initiated for job ${jobId}`
    });
  } catch (err: any) {
    console.error('[Tenant Deletion Retry Error]:', err?.message || err);
    return res.status(500).json({ success: false, error: "Internal server error during retry" });
  }
});

app.use("/api", router);

export default app;
