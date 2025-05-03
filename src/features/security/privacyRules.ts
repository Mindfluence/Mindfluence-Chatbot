/**
 * privacyRules.ts
 * 
 * This module defines privacy and information disclosure rules for the Mindfluence Chatbot.
 * It specifies which types of information can be shared based on sensitivity levels,
 * and defines the conditions (permissions, roles) required to access each type.
 * 
 * These rules are referenced by responseFilter.ts and other security components
 * to enforce consistent information disclosure policies.
 */

// Import related types
import type { InformationClassification } from './informationClassifier';
import type { PermissionAwareContextData } from './permissionAwareContext';

/**
 * Defines the sensitivity levels for information,
 * matching the levels used in informationClassifier.ts
 */
export enum SensitivityLevel {
  /** Information that can be shared with anyone */
  PUBLIC = 'PUBLIC',
  
  /** Information that should only be shared with authenticated users */
  INTERNAL = 'INTERNAL',
  
  /** Information specific to a user that should only be shared with that user */
  USER_SPECIFIC = 'USER_SPECIFIC',
  
  /** Information that should only be shared with administrators */
  ADMIN_ONLY = 'ADMIN_ONLY',
  
  /** Highly sensitive information with strict access requirements */
  CONFIDENTIAL = 'CONFIDENTIAL'
}

/**
 * Defines standard permission strings for consistency across the application
 */
export const Permissions = {
  // User-related permissions
  SELF_READ: 'self:read',
  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  
  // Admin permissions
  ADMIN_ACCESS: 'admin:access',
  ADMIN_FULL: 'admin:full',
  
  // Subscription permissions
  SUBSCRIPTION_BASIC_READ: 'subscription:basic:read',
  SUBSCRIPTION_DETAILS_READ: 'subscription:details:read',
  SUBSCRIPTION_ADMIN: 'subscription:admin',
  
  // System permissions
  SYSTEM_DIAGNOSTICS_READ: 'system:diagnostics:read',
  SYSTEM_LOGS_READ: 'system:logs:read',
  
  // Business/pricing permissions
  PRICING_READ: 'pricing:read',
  BUSINESS_METRICS_READ: 'business:metrics:read'
};

/**
 * The set of possible filtering strategies for sensitive information
 */
export enum FilteringStrategy {
  /** Allow the information to be shown without modifications */
  ALLOW = 'ALLOW',
  
  /** Completely block/hide the information */
  BLOCK = 'BLOCK',
  
  /** Redact personally identifiable information */
  REDACT_PII = 'REDACT_PII',
  
  /** Show only a summary of the information */
  SHOW_SUMMARY = 'SHOW_SUMMARY',
  
  /** Replace specific values with placeholders */
  OBFUSCATE_VALUES = 'OBFUSCATE_VALUES'
}

/**
 * Defines user roles with increasing levels of access
 */
export enum UserRoles {
  GUEST = 'guest',
  USER = 'user',
  PREMIUM_USER = 'premium_user',
  EDITOR = 'editor',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

/**
 * Defines the structure for a privacy rule
 */
export interface PrivacyRule {
  /** The sensitivity level this rule applies to */
  level: SensitivityLevel;
  
  /** Roles that are allowed to access this type of information */
  allowedRoles?: string[];
  
  /** How the information should be filtered/presented */
  filtering: FilteringStrategy;
  
  /** Optional custom condition function for complex rules */
  condition?: (context: PermissionAwareContextData, classification: InformationClassification) => boolean;
  
  /** Human-readable description of the rule */
  description: string;
  
  /** Example replacement text when information is blocked/redacted */
  fallbackMessage?: string;
}

/**
 * Maps sensitivity levels to their corresponding privacy rules
 */
export const PRIVACY_RULES: Record<SensitivityLevel, PrivacyRule> = {
  [SensitivityLevel.PUBLIC]: { 
    level: SensitivityLevel.PUBLIC, 
    filtering: FilteringStrategy.ALLOW,
    description: "Public information available to all users"
  },
  
  [SensitivityLevel.INTERNAL]: { 
    level: SensitivityLevel.INTERNAL, 
    allowedRoles: [
      UserRoles.USER,
      UserRoles.PREMIUM_USER,
      UserRoles.EDITOR,
      UserRoles.ADMIN,
      UserRoles.SUPER_ADMIN
    ],
    filtering: FilteringStrategy.ALLOW,
    description: "Internal information available to authenticated users only",
    fallbackMessage: "This information is only available to authenticated users. Please log in to view it."
  },
  
  [SensitivityLevel.USER_SPECIFIC]: { 
    level: SensitivityLevel.USER_SPECIFIC, 
    filtering: FilteringStrategy.ALLOW,
    condition: (context, classification) => {
      // Information is only shown if it refers to the current user
      // This is a simplified check - in reality, you would need to compare
      // information subject IDs with the current user ID
      return (
        !!context?.isAuthenticated && 
        context.permissions.includes(Permissions.SELF_READ)
      );
    },
    description: "User-specific information that should only be shown to the relevant user",
    fallbackMessage: "This information contains personal details that you don't have permission to access."
  },
  
  [SensitivityLevel.ADMIN_ONLY]: { 
    level: SensitivityLevel.ADMIN_ONLY, 
    allowedRoles: [UserRoles.ADMIN, UserRoles.SUPER_ADMIN],
    filtering: FilteringStrategy.BLOCK,
    description: "Administrative information restricted to admin-level users",
    fallbackMessage: "This information is restricted to administrators only."
  },
  
  [SensitivityLevel.CONFIDENTIAL]: { 
    level: SensitivityLevel.CONFIDENTIAL, 
    allowedRoles: [UserRoles.SUPER_ADMIN],
    filtering: FilteringStrategy.BLOCK,
    description: "Highly confidential information with strict access control",
    fallbackMessage: "This information is confidential and cannot be displayed."
  }
};

/**
 * Role hierarchy for determining access rights
 * Higher index roles include all permissions from lower index roles
 */
export const ROLE_HIERARCHY = [
  UserRoles.GUEST,
  UserRoles.USER,
  UserRoles.PREMIUM_USER,
  UserRoles.EDITOR,
  UserRoles.ADMIN,
  UserRoles.SUPER_ADMIN
];

/**
 * Finds the privacy rule corresponding to a given information classification
 * 
 * @param classification The information classification from the classifier
 * @returns The corresponding privacy rule, or undefined if no match found
 */
export function getRuleForClassification(
  classification: InformationClassification
): PrivacyRule | undefined {
  return PRIVACY_RULES[classification.sensitivityLevel];
}

/**
 * Determines if access should be allowed based on rule, classification, and user context
 * 
 * @param rule The privacy rule to apply
 * @param classification The information classification
 * @param userContext The user's authorization context
 * @returns Boolean indicating if access should be allowed
 */
export function shouldAllowAccess(
  rule: PrivacyRule | undefined,
  classification: InformationClassification,
  userContext: PermissionAwareContextData | null
): boolean {
  // If no rule is found, default to blocking access
  if (!rule) return false;
  
  // If rule specifies blocking, deny access
  if (rule.filtering === FilteringStrategy.BLOCK) return false;
  
  // If user is not authenticated but the rule requires authentication, deny access
  if (!userContext?.isAuthenticated && rule.level !== SensitivityLevel.PUBLIC) return false;
  
  // Check role-based access if applicable
  if (rule.allowedRoles && rule.allowedRoles.length > 0) {
    if (!userContext?.roles || userContext.roles.length === 0) return false;
    
    // Check if user has any of the allowed roles
    const hasAllowedRole = userContext.roles.some(userRole => 
      rule.allowedRoles?.includes(userRole)
    );
    
    if (!hasAllowedRole) return false;
  }
  
  // Check required permissions from the classification
  if (classification.requiredPermissions && classification.requiredPermissions.length > 0) {
    if (!userContext?.permissions || userContext.permissions.length === 0) return false;
    
    // Check if user has all required permissions
    const hasAllRequiredPermissions = classification.requiredPermissions.every(
      requiredPermission => userContext.permissions.includes(requiredPermission)
    );
    
    if (!hasAllRequiredPermissions) return false;
  }
  
  // Check custom condition if it exists
  if (rule.condition && userContext) {
    return rule.condition(userContext, classification);
  }
  
  // If all checks pass, allow access
  return true;
}

/**
 * Gets the appropriate fallback message when access is denied
 * 
 * @param rule The privacy rule that blocked access
 * @returns A user-friendly message explaining why access was denied
 */
export function getFallbackMessage(rule: PrivacyRule | undefined): string {
  if (!rule || !rule.fallbackMessage) {
    return "I'm sorry, but I can't provide that information due to privacy restrictions.";
  }
  
  return rule.fallbackMessage;
}

/**
 * Checks if a user role has higher or equal privileges than a required role
 * 
 * @param userRole The user's role to check
 * @param requiredRole The minimum role required for access
 * @returns Boolean indicating if the user role meets or exceeds the required role
 */
export function hasRolePrivilege(userRole: string | UserRoles, requiredRole: string | UserRoles): boolean {
  // Konvertiere zu UserRoles Enum falls nötig
  const userRoleEnum = typeof userRole === 'string' ? userRole as UserRoles : userRole;
  const requiredRoleEnum = typeof requiredRole === 'string' ? requiredRole as UserRoles : requiredRole;
  
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRoleEnum);
  const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRoleEnum);
  
  // If either role is not in the hierarchy, return false
  if (userRoleIndex === -1 || requiredRoleIndex === -1) return false;
  
  // User role has sufficient privileges if its index is >= the required role index
  return userRoleIndex >= requiredRoleIndex;
}

/**
 * Creates a custom privacy rule for special cases
 * 
 * @param level The sensitivity level
 * @param options Additional rule options
 * @returns A new PrivacyRule
 */
export function createCustomRule(
  level: SensitivityLevel,
  options: Partial<Omit<PrivacyRule, 'level'>>
): PrivacyRule {
  const baseRule = PRIVACY_RULES[level];
  
  return {
    level,
    allowedRoles: options.allowedRoles || baseRule.allowedRoles,
    filtering: options.filtering || baseRule.filtering,
    condition: options.condition || baseRule.condition,
    description: options.description || baseRule.description,
    fallbackMessage: options.fallbackMessage || baseRule.fallbackMessage
  };
}