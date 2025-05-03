/**
 * features/auth/authService.ts
 * 
 * Server-side authentication service for the Mindfluence Chatbot.
 * This module serves as a bridge between the client-side authentication token,
 * the @mindfluence/auth package, and the chatbot backend.
 * 
 * IMPORTANT: This is a server-side service and should not be imported in client-side code.
 * Client-side authentication should use the @mindfluence/auth package directly.
 */

import { verifyFirebaseToken } from '../firebase/authProvider';
import type { MindfluenceUser } from '@mindfluence/auth/models/auth-types.js';
import { hasPermission, isUserAdmin, isAdminEmail } from '@mindfluence/auth/utils/permissions';

/**
 * Permission-aware context data for the chatbot's NLP engine
 * This is the data structure passed to the security filtering mechanisms
 */
export interface PermissionAwareContextData {
  userId: string;
  role: 'user' | 'admin' | 'editor' | 'super-admin';
  permissions: string[];
  email?: string;
  isAuthenticated: boolean;
  metadata?: Record<string, any>;
}

/**
 * Verifies a Firebase ID token and returns permission-aware context data
 * for the chatbot's security filtering mechanisms
 * 
 * This is the primary function used by the API endpoint (/api/chatbot/response/route.ts)
 * to authenticate incoming requests and prepare the security context for the NLP engine.
 * 
 * @param idToken The Firebase ID token to verify
 * @returns Permission-aware context data or null if verification fails
 */
export async function getVerifiedUserAuthData(idToken: string): Promise<PermissionAwareContextData | null> {
  if (!idToken) {
    console.warn('No token provided for verification');
    return null;
  }
  
  try {
    // Verify the token using Firebase Admin SDK
    const decodedToken = await verifyFirebaseToken(idToken);
    
    if (!decodedToken) {
      console.warn('Token verification failed');
      return null;
    }
    
    // Extract basic information from the token
    const userId = decodedToken.uid;
    const email = decodedToken.email;
    
    // Get custom claims from the token
    const customClaims = decodedToken.claims || {};
    
    // Determine role and permissions from token claims
    let role = customClaims.role || 'user';
    let permissions = Array.isArray(customClaims.permissions) 
      ? customClaims.permissions 
      : [];
    
    // Set admin role if the email is an admin email
    if (email && isAdminEmail(email)) {
      role = 'admin';
      // Add basic admin permissions if none are set
      if (permissions.length === 0) {
        permissions = [
          'users:read',
          'tracks:read',
          'analytics:read',
          'admin:access',
          'all:read'
        ];
      }
    }
    
    // Return permission-aware context data
    const contextData: PermissionAwareContextData = {
      userId,
      role,
      permissions,
      email,
      isAuthenticated: true,
      metadata: {
        tokenIssuer: decodedToken.iss,
        lastVerified: new Date().toISOString()
      }
    };
    
    return contextData;
  } catch (error) {
    console.error('Error verifying user auth data:', error);
    return null;
  }
}

/**
 * Validates an API token from the request headers
 * 
 * This is a convenience function for API routes to extract and verify
 * the token from the Authorization header.
 * 
 * @param authHeader The Authorization header value (e.g., "Bearer token123")
 * @returns The verified user auth data or null if invalid
 */
export async function validateApiToken(authHeader: string | undefined): Promise<PermissionAwareContextData | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn('Invalid or missing Authorization header');
    return null;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  return getVerifiedUserAuthData(token);
}

/**
 * Checks if a user has a specific permission based on their auth data
 * 
 * This function leverages the central @mindfluence/auth permission checking logic
 * applied to the PermissionAwareContextData format.
 * 
 * @param authData Permission-aware context data
 * @param permission The permission to check
 * @returns True if the user has the permission, false otherwise
 */
export function checkPermission(authData: PermissionAwareContextData | null, permission: string): boolean {
  if (!authData) return false;
  
  // Convert to MindfluenceUser format for compatibility with @mindfluence/auth
  const userFormatted: MindfluenceUser = {
    id: authData.userId,
    uid: authData.userId,
    email: authData.email || '',
    displayName: '', // Not required for permission checking
    role: authData.role,
    subscriptionStatus: 'free', // Not relevant for permission checking
    preferences: {
      theme: 'light',
      language: 'de',
      notifications: false
    },
    createdAt: '',
    claims: {
      admin: authData.role === 'admin' || authData.role === 'super-admin',
      role: authData.role,
      permissions: authData.permissions
    }
  };
  
  // Use the central permission checking logic from @mindfluence/auth
  return hasPermission(userFormatted, permission);
}

/**
 * Checks if a user is an admin based on their auth data
 * 
 * This function leverages the central @mindfluence/auth admin checking logic
 * applied to the PermissionAwareContextData format.
 * 
 * @param authData Permission-aware context data
 * @returns True if the user is an admin, false otherwise
 */
export function isAdmin(authData: PermissionAwareContextData | null): boolean {
  if (!authData) return false;
  
  return authData.role === 'admin' || 
         authData.role === 'super-admin' || 
         (authData.email ? isAdminEmail(authData.email) : false);
}

/**
 * Gets a guest user context for unauthenticated requests
 * 
 * @returns A basic permission context for guest users
 */
export function getGuestUserContext(): PermissionAwareContextData {
  return {
    userId: 'guest',
    role: 'user',
    permissions: ['basic:access'],
    isAuthenticated: false,
    email: undefined,
    metadata: {
      type: 'guest',
      createdAt: new Date().toISOString()
    }
  };
}