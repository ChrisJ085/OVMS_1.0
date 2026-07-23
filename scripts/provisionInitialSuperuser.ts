/**
 * ONE-TIME SCRIPT: Initial Superuser Provisioning
 * 
 * This script is used to securely provision the initial platform superuser.
 * It uses the Firebase Admin SDK to bypass client-side restrictions and securely
 * create the required Auth user and Firestore profile.
 * 
 * REQUIRED ENVIRONMENT VARIABLES:
 * - FIREBASE_PROJECT_ID: The Firebase project ID
 * - FIREBASE_CLIENT_EMAIL: The service account client email
 * - FIREBASE_PRIVATE_KEY: The service account private key (with \n correctly formatted)
 * - INITIAL_SUPERUSER_EMAIL: The email for the superuser
 * - INITIAL_SUPERUSER_TEMP_PASSWORD: The temporary password (must be changed on first login)
 * 
 * Usage:
 * npx tsx scripts/provisionInitialSuperuser.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Load environment variables if .env exists
dotenv.config();

async function run() {
  console.log('Starting one-time provisioning script for initial superuser...');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const targetEmail = process.env.INITIAL_SUPERUSER_EMAIL?.trim().toLowerCase();
  const tempPassword = process.env.INITIAL_SUPERUSER_TEMP_PASSWORD;

  if (!projectId || !clientEmail || !privateKey) {
    console.error('ERROR: Firebase Admin credentials are not set.');
    console.error('Please ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are provided.');
    process.exit(1);
  }

  if (!targetEmail || !tempPassword) {
    console.error('ERROR: Missing target user details.');
    console.error('Please ensure INITIAL_SUPERUSER_EMAIL and INITIAL_SUPERUSER_TEMP_PASSWORD are provided.');
    process.exit(1);
  }

  // Handle escaped newlines in the private key string
  privateKey = privateKey.replace(/\\n/g, '\n');

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (error: any) {
    console.error('ERROR: Failed to initialize Firebase Admin SDK.', error.message);
    process.exit(1);
  }

  const auth = getAuth();
  const db = getFirestore();

  let userRecord;
  let isNewUser = false;

  try {
    userRecord = await auth.getUserByEmail(targetEmail);
    console.log(`User ${targetEmail} already exists in Firebase Authentication.`);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      console.log(`User ${targetEmail} not found in Firebase Authentication. Creating new user...`);
      try {
        userRecord = await auth.createUser({
          email: targetEmail,
          password: tempPassword,
          displayName: 'Initial Superuser',
        });
        isNewUser = true;
        console.log(`Successfully created Firebase Authentication user with UID: ${userRecord.uid}`);
      } catch (createError: any) {
        console.error('ERROR: Failed to create Firebase Authentication user.', createError.message);
        process.exit(1);
      }
    } else {
      console.error('ERROR: Failed to fetch user from Firebase Authentication.', error.message);
      process.exit(1);
    }
  }

  const uid = userRecord.uid;
  console.log(`Checking Firestore profile for UID: ${uid}`);

  const userDocRef = db.collection('users').doc(uid);
  
  try {
    const userDoc = await userDocRef.get();
    
    if (userDoc.exists) {
      console.log('Firestore profile already exists. Updating role to PLATFORM_SUPERUSER...');
      await userDocRef.update({
        role: 'PLATFORM_SUPERUSER',
        accountStatus: 'ACTIVE',
        requiresPasswordChange: isNewUser ? true : userDoc.data()?.requiresPasswordChange,
        tenantId: null,
        siteIds: [],
        modifiedBy: 'SYSTEM_BOOTSTRAP',
        modifiedDate: Timestamp.now()
      });
      console.log('Successfully updated existing Firestore profile.');
    } else {
      console.log('Creating new Firestore profile...');
      await userDocRef.set({
        uid: uid,
        email: targetEmail,
        displayName: userRecord.displayName || 'Initial Superuser',
        jobTitle: 'Global Platform Administrator',
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
        createdBy: 'SYSTEM_BOOTSTRAP',
        createdDate: Timestamp.now(),
        modifiedBy: 'SYSTEM_BOOTSTRAP',
        modifiedDate: Timestamp.now()
      });
      console.log('Successfully created new Firestore profile.');
    }
    
    console.log('\n--- PROVISIONING COMPLETE ---');
    console.log(`The user ${targetEmail} is now a PLATFORM_SUPERUSER.`);
    console.log('IMPORTANT: Please instruct the user to change their temporary password upon first login.');
    console.log('NOTE: Ensure you remove this script from operational execution paths or deployment tools to maintain security.');

  } catch (dbError: any) {
    console.error('ERROR: Failed to provision Firestore profile.', dbError.message);
    process.exit(1);
  }
}

run().catch(console.error);
