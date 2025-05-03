/**
 * features/firebase/authProvider.ts
 * 
 * Server-side Firebase Admin SDK utility for authentication and token verification.
 * This module initializes the Firebase Admin SDK and provides functions for verifying
 * Firebase ID tokens and retrieving user information.
 * 
 * IMPORTANT: This is a server-side module and should not be imported in client-side code.
 * Client-side authentication should use the shared AuthProvider component.
 */

import * as admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';

/**
 * Tracks whether the Firebase Admin SDK has been initialized
 */
let isInitialized = false;

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized already
 * 
 * This function follows a singleton pattern to ensure the SDK is only initialized once.
 * It loads Firebase credentials from environment variables for security.
 * 
 * Required environment variables:
 * - FIREBASE_PROJECT_ID: Your Firebase project ID
 * - FIREBASE_CLIENT_EMAIL: Service account client email
 * - FIREBASE_PRIVATE_KEY: Service account private key
 * 
 * Alternatively, you can use GOOGLE_APPLICATION_CREDENTIALS environment variable
 * pointing to your service account JSON file.
 * 
 * @returns The initialized Firebase Admin app instance
 * @throws Error if required environment variables are missing
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (isInitialized) {
    return admin.app();
  }

  try {
    // Check if the app has already been initialized (in case of module reloads)
    try {
      const existingApp = admin.app();
      isInitialized = true;
      return existingApp;
    } catch (error) {
      // No existing app, proceed with initialization
    }

    // Option 1: Initialize with service account credentials from env variables
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      const serviceAccount: ServiceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // The private key might be stored with escaped newlines, so we need to replace them
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };

      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
      });

      isInitialized = true;
      return app;
    } 
    // Option 2: Initialize using GOOGLE_APPLICATION_CREDENTIALS environment variable
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const app = admin.initializeApp();
      isInitialized = true;
      return app;
    } 
    // No valid credentials found
    else {
      throw new Error(
        'Firebase Admin SDK initialization failed: Missing credentials. ' +
        'Please set either FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY ' +
        'or GOOGLE_APPLICATION_CREDENTIALS environment variables.'
      );
    }
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
    throw error;
  }
}

/**
 * Verifies a Firebase ID token and returns the decoded token information
 * 
 * This function verifies that the provided token is valid and was issued 
 * by Firebase Authentication for your project.
 * 
 * @param token - The Firebase ID token to verify
 * @returns The decoded token with user information or null if verification fails
 */
export async function verifyFirebaseToken(token: string): Promise<admin.auth.DecodedIdToken | null> {
  if (!token) {
    console.warn('No token provided for verification');
    return null;
  }
  
  try {
    // Ensure Firebase Admin is initialized
    initializeFirebaseAdmin();
    
    // Verify the token
    const decodedToken = await admin.auth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    // Log the error but don't throw it
    console.error('Error verifying Firebase token:', error);
    return null;
  }
}

/**
 * Retrieves user information from Firebase Authentication by user ID
 * 
 * @param uid - The Firebase user ID
 * @returns The user record or null if an error occurs
 */
export async function getFirebaseAdminUser(uid: string): Promise<admin.auth.UserRecord | null> {
  if (!uid) {
    console.warn('No user ID provided');
    return null;
  }
  
  try {
    // Ensure Firebase Admin is initialized
    initializeFirebaseAdmin();
    
    // Retrieve the user
    const userRecord = await admin.auth().getUser(uid);
    return userRecord;
  } catch (error) {
    // Log the error but don't throw it
    console.error(`Error retrieving Firebase user with ID ${uid}:`, error);
    return null;
  }
}

/**
 * Retrieves user custom claims from Firebase Authentication by user ID
 * 
 * Custom claims contain user roles and permissions that can be used for authorization.
 * 
 * @param uid - The Firebase user ID
 * @returns The user's custom claims or null if an error occurs
 */
export async function getUserCustomClaims(uid: string): Promise<Record<string, any> | null> {
  const userRecord = await getFirebaseAdminUser(uid);
  
  if (!userRecord) {
    return null;
  }
  
  return userRecord.customClaims || {};
}

/**
 * Convenience function to verify a token and return basic user information
 * 
 * This combines token verification and extraction of common user information
 * into a single function call for API route handlers.
 * 
 * @param token - The Firebase ID token to verify
 * @returns Object containing user ID, email, and custom claims, or null if verification fails
 */
export async function verifyUserFromToken(token: string): Promise<{
  uid: string;
  email: string | undefined;
  claims: Record<string, any>;
} | null> {
  const decodedToken = await verifyFirebaseToken(token);
  
  if (!decodedToken) {
    return null;
  }
  
  return {
    uid: decodedToken.uid,
    email: decodedToken.email,
    claims: decodedToken.claims || {},
  };
}