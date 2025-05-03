/**
 * features/firebase/firebaseConfig.ts
 *
 * This module provides secure configuration loading for the Firebase Admin SDK.
 * It retrieves Firebase service account credentials from environment variables
 * for server-side authentication and Firestore operations.
 *
 * IMPORTANT: This file is for server-side use only and should not be imported
 * in client-side code.
 *
 * Required environment variables:
 * - FIREBASE_PROJECT_ID: Your Firebase project ID
 * - FIREBASE_CLIENT_EMAIL: Service account client email
 * - FIREBASE_PRIVATE_KEY: Service account private key
 *
 * Alternatively:
 * - GOOGLE_APPLICATION_CREDENTIALS: Path to your service account JSON file
 */
import type { ServiceAccount } from 'firebase-admin/app';

/**
 * Loads Firebase Admin SDK Service Account credentials securely from environment variables
 *
 * @returns The ServiceAccount object or undefined if required variables are missing
 */
export function getFirebaseAdminCredentials(): ServiceAccount | undefined {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  // Option 1: Use individual credential components from environment variables
  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }
  
  // Option 2: Check if GOOGLE_APPLICATION_CREDENTIALS is set
  // When this env var is set, Firebase Admin SDK will find the file automatically
  // so we return undefined to signal that no explicit credentials need to be provided
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Firebase Admin SDK will be configured using GOOGLE_APPLICATION_CREDENTIALS');
    return undefined;
  }
  
  // No valid configuration found
  console.error(
    'Firebase Admin SDK configuration error: Required environment variables ' +
    '(FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) ' +
    'or GOOGLE_APPLICATION_CREDENTIALS are not properly set.'
  );
 
  return undefined;
}

/**
 * Gets the Firebase project ID from environment variables
 * Useful for other Firebase-related services that need the project ID
 *
 * @returns The Firebase project ID or undefined if not configured
 */
export function getFirebaseProjectId(): string | undefined {
  return process.env.FIREBASE_PROJECT_ID;
}

/**
 * Gets the Firebase database URL based on the project ID
 *
 * @returns The Firebase database URL or undefined if project ID is not available
 */
export function getFirebaseDatabaseURL(): string | undefined {
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    return undefined;
  }
 
  return process.env.FIREBASE_DATABASE_URL || `https://${projectId}.firebaseio.com`;
}

/**
 * Checks if Firebase Admin SDK is properly configured with credentials
 *
 * @returns True if credentials are available, false otherwise
 */
export function isFirebaseAdminConfigured(): boolean {
  return !!(
    (process.env.FIREBASE_PROJECT_ID &&
     process.env.FIREBASE_CLIENT_EMAIL &&
     process.env.FIREBASE_PRIVATE_KEY) ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}