const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
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
exports.createTenantUser = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }

  const callerUid = context.auth.uid;
  const callerProfileSnap = await db.collection('users').doc(callerUid).get();
  if (!callerProfileSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Caller profile not found.');
  }

  const callerProfile = callerProfileSnap.data();
  const { email, displayName, jobTitle, role, tenantId, siteIds, temporaryPassword } = data;

  // Enforce role permission hierarchy
  if (callerProfile.role !== 'PLATFORM_SUPERUSER' && callerProfile.role !== 'TENANT_ADMIN') {
    throw new functions.https.HttpsError('permission-denied', 'Only Platform Superusers and Tenant Admins can create users.');
  }

  // Tenant Admin cannot create users for another tenant, nor can they create superusers
  if (callerProfile.role === 'TENANT_ADMIN') {
    if (tenantId !== callerProfile.tenantId) {
      throw new functions.https.HttpsError('permission-denied', 'Tenant Admins can only create users within their own tenant.');
    }
    if (role === 'PLATFORM_SUPERUSER') {
      throw new functions.https.HttpsError('permission-denied', 'Tenant Admins cannot create Platform Superusers.');
    }
  }

  try {
    // 1. Create Auth Account
    const userRecord = await admin.auth().createUser({
      email,
      password: temporaryPassword || 'TempPass123!',
      displayName,
    });

    const timestampNow = admin.firestore.FieldValue.serverTimestamp();

    // 2. Create Firestore profile
    const profilePayload = {
      uid: userRecord.uid,
      email,
      displayName,
      jobTitle: jobTitle || '',
      role,
      tenantId: role === 'PLATFORM_SUPERUSER' ? null : tenantId,
      siteIds: role === 'PLATFORM_SUPERUSER' ? [] : (siteIds || []),
      accountStatus: 'ACTIVE',
      requiresPasswordChange: true,
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

    return { success: true, uid: userRecord.uid };
  } catch (error) {
    throw new functions.https.HttpsError('already-exists', error.message);
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
