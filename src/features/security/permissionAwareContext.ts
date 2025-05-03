/**
 * permissionAwareContext.ts
 * 
 * This module provides mechanisms to enrich the chatbot's processing context with 
 * user permission data and safely access this information throughout the pipeline.
 * It serves as a bridge between the authentication system and the NLP processing
 * pipeline, ensuring security checks can be performed reliably.
 */

// Direkte Definition der MindfluenceUser-Schnittstelle basierend auf der zentralen Auth-Komponente
interface AdminClaims {
  admin: boolean;
  role: string;
  permissions: string[];
}

interface MindfluenceUser {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  photoURL?: string;
  subscriptionStatus: 'none' | 'free' | 'basic' | 'premium' | 'family';
  role: 'user' | 'admin' | 'editor' | 'super-admin';
  claims?: AdminClaims;
  createdAt: string;
  lastLogin?: string;
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    language: 'en' | 'de';
    notifications: boolean;
    autoplayEnabled?: boolean;
  };
}

/**
 * Contains the essential authentication and authorization data needed for
 * permission-based security checks throughout the chatbot pipeline.
 */
export interface PermissionAwareContextData {
  /** Unique identifier for the user */
  userId: string;
  /** User roles (e.g., 'admin', 'user', 'premium') */
  roles: string[];
  /** Specific permission strings the user has */
  permissions: string[];
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
}

/**
 * Extended context that includes user authentication data
 * This can be used to extend existing context types in the pipeline
 */
export interface ExtendedPipelineContext {
  // Other context fields would go here
  /** User authorization data, null if not authenticated */
  userAuthData: PermissionAwareContextData | null;
}

/**
 * Creates permission-aware context data from verified user information
 * 
 * @param verifiedUser The verified user data from authentication
 * @returns Permission context data or null if no user provided
 */
export function createPermissionAwareContext(
  verifiedUser: MindfluenceUser | null
): PermissionAwareContextData | null {
  if (!verifiedUser) {
    return null;
  }
  
  return {
    userId: verifiedUser.id,
    roles: verifiedUser.role ? [verifiedUser.role] : [],
    permissions: verifiedUser.claims?.permissions || [],
    isAuthenticated: true,
  };
}

/**
 * Enriches an existing context with permission data
 * 
 * @param context The existing context to enrich
 * @param verifiedUser The verified user data from authentication
 * @returns The enriched context
 */
export function enrichContextWithPermissions<T extends { userAuthData?: PermissionAwareContextData | null }>(
  context: T,
  verifiedUser: MindfluenceUser | null
): T {
  context.userAuthData = createPermissionAwareContext(verifiedUser);
  return context;
}

/**
 * Safely retrieves user permissions from a context object
 * 
 * @param context The context containing auth data
 * @returns Array of permission strings or empty array if not available
 */
export function getUserPermissionsFromContext(
  context: { userAuthData?: PermissionAwareContextData | null } | null
): string[] {
  return context?.userAuthData?.permissions || [];
}

/**
 * Safely retrieves the user ID from a context object
 * 
 * @param context The context containing auth data
 * @returns User ID or null if not available
 */
export function getUserIdFromContext(
  context: { userAuthData?: PermissionAwareContextData | null } | null
): string | null {
  return context?.userAuthData?.userId || null;
}

/**
 * Checks if the context represents an authenticated user
 * 
 * @param context The context containing auth data
 * @returns Boolean indicating authentication status
 */
export function isAuthenticated(
  context: { userAuthData?: PermissionAwareContextData | null } | null
): boolean {
  return !!context?.userAuthData?.isAuthenticated;
}

/**
 * Checks if the user has a specific permission
 * 
 * @param context The context containing auth data
 * @param permission The permission to check for
 * @returns Boolean indicating if the user has the permission
 */
export function hasPermission(
  context: { userAuthData?: PermissionAwareContextData | null } | null,
  permission: string
): boolean {
  return !!context?.userAuthData?.permissions?.includes(permission);
}

/**
 * Checks if the user has any of the specified permissions
 * 
 * @param context The context containing auth data
 * @param permissions Array of permissions to check for
 * @returns Boolean indicating if the user has any of the permissions
 */
export function hasAnyPermission(
  context: { userAuthData?: PermissionAwareContextData | null } | null,
  permissions: string[]
): boolean {
  const userPermissions = context?.userAuthData?.permissions || [];
  return permissions.some(p => userPermissions.includes(p));
}

/**
 * Checks if the user has all of the specified permissions
 * 
 * @param context The context containing auth data
 * @param permissions Array of permissions to check for
 * @returns Boolean indicating if the user has all of the permissions
 */
export function hasAllPermissions(
  context: { userAuthData?: PermissionAwareContextData | null } | null,
  permissions: string[]
): boolean {
  const userPermissions = context?.userAuthData?.permissions || [];
  return permissions.every(p => userPermissions.includes(p));
}

/**
 * Checks if the user has a specific role
 * 
 * @param context The context containing auth data
 * @param role The role to check for
 * @returns Boolean indicating if the user has the role
 */
export function hasRole(
  context: { userAuthData?: PermissionAwareContextData | null } | null,
  role: string
): boolean {
  return !!context?.userAuthData?.roles?.includes(role);
}

/**
 * Creates a new context with auth data from an existing context but
 * with modified pipeline-specific data
 * 
 * @param existingContext Context containing auth data
 * @param newContextData New pipeline-specific context data
 * @returns A new context with preserved auth data
 */
export function preserveAuthContextData<T extends { userAuthData?: PermissionAwareContextData | null }>(
  existingContext: { userAuthData?: PermissionAwareContextData | null },
  newContextData: Omit<T, 'userAuthData'>
): T {
  return {
    ...newContextData,
    userAuthData: existingContext.userAuthData
  } as T;
}