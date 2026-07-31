const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'ovms-ad209'
});
const db = admin.firestore();

/**
 * 1. One-time bootstrap function for chris.jeal@gxo.com
 */
exports.bootstrapSuperuser = functions.https.onCall(async (data, context) => {
  const targetEmail = 'chris.jeal@gxo.com';
  
  try {
    // 1. Check if the superuser already exists in Auth
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(targetEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Create user with a strong default/temporary password
        userRecord = await admin.auth().createUser({
          email: targetEmail,
          emailVerified: true,
          password: 'Password123!', // Must be changed on first login
          displayName: 'Chris Jeal',
        });
      } else {
        throw err;
      }
    }

    // 2. Set or update custom user profile in Firestore
    const userRef = db.collection('users').doc(userRecord.uid);
    const userSnap = await userRef.get();

    const timestampNow = admin.firestore.FieldValue.serverTimestamp();

    const profileData = {
      uid: userRecord.uid,
      email: targetEmail,
      displayName: 'Chris Jeal',
      jobTitle: 'Global Platform Superuser',
      role: 'PLATFORM_SUPERUSER',
      tenantId: null,
      siteIds: [],
      accountStatus: 'ACTIVE',
      requiresPasswordChange: true,
      failedLoginAttempts: 0,
      failedAttemptWindowStartedAt: null,
      lockedAt: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdBy: 'BOOTSTRAP',
      createdDate: userSnap.exists ? userSnap.data().createdDate || timestampNow : timestampNow,
      modifiedBy: 'BOOTSTRAP',
      modifiedDate: timestampNow,
    };

    await userRef.set(profileData, { merge: true });

    return {
      success: true,
      message: `Superuser bootstrap successful for ${targetEmail}. UID: ${userRecord.uid}`,
    };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 2. Create User Profile & Auth account (restricted to PLATFORM_SUPERUSER and TENANT_ADMIN)
 */
exports.createOvmsUser = functions.https.onCall(async (data, context) => {
  // 1. Require the caller to be authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = context.auth.uid;
  
  // 2. Load the caller's trusted user profile
  const callerProfileSnap = await db.collection('users').doc(callerUid).get();
  if (!callerProfileSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Caller profile not found.');
  }

  const callerProfile = callerProfileSnap.data();

  // 3. Confirm caller accountStatus is ACTIVE
  if (callerProfile.accountStatus !== 'ACTIVE') {
    throw new functions.https.HttpsError('permission-denied', 'Your administrator account is not active.');
  }

  // 4. Confirm caller role is PLATFORM_SUPERUSER or TENANT_ADMIN
  if (callerProfile.role !== 'PLATFORM_SUPERUSER' && callerProfile.role !== 'TENANT_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only Platform Superusers and Tenant Admins can create users.');
  }

  const { email, displayName, jobTitle, role, tenantId, siteIds, accountStatus, temporaryPassword } = data;

  // 5. Validate all inputs
  if (!email || !displayName || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'Email, Display Name, and Role are required.');
  }

  const validRoles = ['PLATFORM_SUPERUSER', 'TENANT_ADMIN', 'PLANNER', 'WAREHOUSE_OPERATOR', 'VIEWER', 'DISPLAY'];
  if (!validRoles.includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', `Invalid role specified: ${role}`);
  }

  if (role !== 'PLATFORM_SUPERUSER' && !tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid tenant must be selected for non-superuser accounts.');
  }

  // Enforce specific role creation permissions
  if (callerProfile.role === 'TENANT_ADMIN') {
    if (role === 'PLATFORM_SUPERUSER') {
      throw new functions.https.HttpsError('permission-denied', 'Tenant Admins cannot create Platform Superusers.');
    }
    if (tenantId !== callerProfile.tenantId) {
      throw new functions.https.HttpsError('permission-denied', 'Tenant Admins can only create users within their own tenant.');
    }
  }

  // Display role special requirements
  if (role === 'DISPLAY') {
    if (!siteIds || siteIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Display users require at least one assigned site.');
    }
  }

  // Validate site assignments against tenant
  if (siteIds && siteIds.length > 0) {
    const defaultSites = [
      { tenantId: 'tenant_dev', siteId: 'site_barrow' },
      { tenantId: 'tenant_dev', siteId: 'site_test' },
    ];

    for (const sId of siteIds) {
      const isDefault = defaultSites.some(ds => ds.tenantId === tenantId && ds.siteId === sId);
      if (isDefault) {
        continue;
      }

      // Check Firestore sites collection
      let isValidSite = false;
      const siteDoc = await db.collection('sites').doc(sId).get();
      
      if (siteDoc.exists && siteDoc.data().tenantId === tenantId) {
        isValidSite = true;
      } else {
        // Fallback to checking by siteId field just in case
        const siteSnap = await db.collection('sites')
          .where('tenantId', '==', tenantId)
          .where('siteId', '==', sId)
          .limit(1)
          .get();
        if (!siteSnap.empty) {
          isValidSite = true;
        }
      }

      if (!isValidSite) {
        throw new functions.https.HttpsError('invalid-argument', `Site ID '${sId}' does not exist or does not belong to tenant '${tenantId}'.`);
      }
    }

    // Tenant Admin must not create users assigned to sites outside their own permitted sites
    if (callerProfile.role === 'TENANT_ADMIN') {
      if (callerProfile.siteIds && callerProfile.siteIds.length > 0) {
        for (const sId of siteIds) {
          if (!callerProfile.siteIds.includes(sId)) {
            throw new functions.https.HttpsError('permission-denied', `You are not permitted to administer site '${sId}'.`);
          }
        }
      }
    }
  }

  // 6. Duplicate Handling (Check Auth and Firestore before creation)
  let existingAuthUser = null;
  try {
    existingAuthUser = await admin.auth().getUserByEmail(email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      throw new functions.https.HttpsError('internal', `Auth duplicate verification failed: ${err.message}`);
    }
  }
  if (existingAuthUser) {
    throw new functions.https.HttpsError('already-exists', 'An account with this email address already exists in Firebase Authentication.');
  }

  const querySnapshot = await db.collection('users').where('email', '==', email.toLowerCase().trim()).get();
  if (!querySnapshot.empty) {
    throw new functions.https.HttpsError('already-exists', 'A user profile with this email address already exists in Firestore.');
  }

  // 7. Create Firebase Authentication user
  let userRecord;
  try {
    userRecord = await admin.auth().createUser({
      email: email.toLowerCase().trim(),
      password: temporaryPassword || 'TempPass123!',
      displayName,
    });
  } catch (error) {
    throw new functions.https.HttpsError('internal', `Failed to create Authentication account: ${error.message}`);
  }

  // 8. Create user profile in Firestore
  try {
    const timestampNow = admin.firestore.FieldValue.serverTimestamp();

    const profilePayload = {
      uid: userRecord.uid,
      email: email.toLowerCase().trim(),
      displayName,
      jobTitle: jobTitle || '',
      role,
      tenantId: role === 'PLATFORM_SUPERUSER' ? null : tenantId,
      siteIds: role === 'PLATFORM_SUPERUSER' ? [] : (siteIds || []),
      accountStatus: accountStatus || 'ACTIVE',
      requiresPasswordChange: true, // Forces first-login password change!
      failedLoginAttempts: 0,
      failedAttemptWindowStartedAt: null,
      lockedAt: null,
      lastLoginAt: null,
      passwordChangedAt: null,
      createdBy: callerUid,
      createdDate: timestampNow,
      modifiedBy: callerUid,
      modifiedDate: timestampNow,
    };

    await db.collection('users').doc(userRecord.uid).set(profilePayload);

    // 9. Write an Audit record
    const auditPayload = {
      tenantId: role === 'PLATFORM_SUPERUSER' ? null : tenantId,
      siteId: (siteIds && siteIds.length > 0) ? siteIds[0] : null,
      eventType: 'USER_CREATION',
      entityType: 'UserProfile',
      entityId: userRecord.uid,
      summary: `Created user account for ${email} with role ${role}`,
      performedBy: callerUid,
      createdDate: timestampNow,
      timestamp: timestampNow,
    };
    await db.collection('auditLogs').add(auditPayload);

    return {
      success: true,
      uid: userRecord.uid,
      message: `User ${email} successfully created with role ${role}.`
    };
  } catch (error) {
    // 10. ROLLBACK (Delete Auth user if Firestore profile creation fails)
    try {
      await admin.auth().deleteUser(userRecord.uid);
    } catch (deleteErr) {
      console.error(`Rollback deletion failed for Auth user ${userRecord.uid}:`, deleteErr);
    }

    // Record failed operation securely
    try {
      const timestampNow = admin.firestore.FieldValue.serverTimestamp();
      await db.collection('auditLogs').add({
        tenantId: role === 'PLATFORM_SUPERUSER' ? null : tenantId,
        eventType: 'USER_CREATION_FAILED',
        entityType: 'UserProfile',
        summary: `Failed to create user profile for ${email}: ${error.message}`,
        performedBy: callerUid,
        createdDate: timestampNow,
        timestamp: timestampNow,
      });
    } catch (auditErr) {
      console.error('Failed to log failed user creation audit:', auditErr);
    }

    throw new functions.https.HttpsError('internal', `Failed to create Firestore profile document (Rollback initiated): ${error.message}`);
  }
});

/**
 * 3. Track failed login attempts securely (unauthenticated caller)
 */
exports.recordLoginFailure = functions.https.onCall(async (data, context) => {
  const { email } = data;
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Email is required.');
  }

  try {
    const usersRef = db.collection('users');
    const qSnap = await usersRef.where('email', '==', email.toLowerCase().trim()).limit(1).get();

    if (qSnap.empty) {
      // Return success silently so we don't disclose if email exists
      return { success: true, message: 'Processed' };
    }

    const userDoc = qSnap.docs[0];
    const userData = userDoc.data();

    if (userData.accountStatus !== 'ACTIVE') {
      return { success: true, status: userData.accountStatus };
    }

    const now = admin.firestore.Timestamp.now();
    let failedAttempts = (userData.failedLoginAttempts || 0) + 1;
    let windowStart = userData.failedAttemptWindowStartedAt;

    if (!windowStart) {
      windowStart = now;
    } else {
      // Check if 15 minutes have passed since the failed login window started
      const diffMs = now.toMillis() - windowStart.toMillis();
      if (diffMs > 15 * 60 * 1000) {
        // Reset window and counter
        failedAttempts = 1;
        windowStart = now;
      }
    }

    const updates = {
      failedLoginAttempts: failedAttempts,
      failedAttemptWindowStartedAt: windowStart,
    };

    if (failedAttempts >= 5) {
      updates.accountStatus = 'LOCKED';
      updates.lockedAt = now;
    }

    await userDoc.ref.update(updates);

    return {
      success: true,
      locked: failedAttempts >= 5,
    };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 4. Reset user password (restricted to PLATFORM_SUPERUSER and TENANT_ADMIN)
 */
exports.resetUserPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated users only.');
  }

  const { targetUid, newPassword } = data;
  const callerUid = context.auth.uid;

  const [callerSnap, targetSnap] = await Promise.all([
    db.collection('users').doc(callerUid).get(),
    db.collection('users').doc(targetUid).get(),
  ]);

  if (!callerSnap.exists || !targetSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Profiles not found.');
  }

  const caller = callerSnap.data();
  const target = targetSnap.data();

  // Enforce role restrictions
  if (caller.role !== 'PLATFORM_SUPERUSER' && caller.role !== 'TENANT_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'No permission.');
  }

  if (caller.role === 'TENANT_ADMIN' && caller.tenantId !== target.tenantId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot reset password for another tenant user.');
  }

  try {
    // 1. Update Auth account
    await admin.auth().updateUser(targetUid, {
      password: newPassword,
    });

    // 2. Update profile
    await db.collection('users').doc(targetUid).update({
      requiresPasswordChange: true,
      accountStatus: 'ACTIVE', // Unlock if locked
      failedLoginAttempts: 0,
      failedAttemptWindowStartedAt: null,
      lockedAt: null,
      modifiedBy: callerUid,
      modifiedDate: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 5. Unlock user account (restricted to PLATFORM_SUPERUSER and TENANT_ADMIN)
 */
exports.unlockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authenticated users only.');
  }

  const { targetUid } = data;
  const callerUid = context.auth.uid;

  const [callerSnap, targetSnap] = await Promise.all([
    db.collection('users').doc(callerUid).get(),
    db.collection('users').doc(targetUid).get(),
  ]);

  if (!callerSnap.exists || !targetSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Profiles not found.');
  }

  const caller = callerSnap.data();
  const target = targetSnap.data();

  if (caller.role !== 'PLATFORM_SUPERUSER' && caller.role !== 'TENANT_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'No permission.');
  }

  if (caller.role === 'TENANT_ADMIN' && caller.tenantId !== target.tenantId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot unlock another tenant user.');
  }

  try {
    await db.collection('users').doc(targetUid).update({
      accountStatus: 'ACTIVE',
      failedLoginAttempts: 0,
      failedAttemptWindowStartedAt: null,
      lockedAt: null,
      modifiedBy: callerUid,
      modifiedDate: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});
