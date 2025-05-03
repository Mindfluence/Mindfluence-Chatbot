/**
 * responseFilter.ts
 * 
 * This module provides functionality to filter chatbot responses based on:
 * - Information sensitivity classification
 * - User permissions
 * - Privacy rules
 * 
 * It ensures that users only receive information they are authorized to access
 * and that sensitive information is properly filtered according to privacy rules.
 */

// Importiere die InformationClassifier-Klasse und InformationClassification
import { InformationClassifier } from './informationClassifier';
import type { InformationClassification } from './informationClassifier';
import { 
  getRuleForClassification, 
  SensitivityLevel,
  FilteringStrategy
} from './privacyRules';
import type { PrivacyRule } from './privacyRules';
import { 
  getUserPermissionsFromContext,
  hasPermission
} from './permissionAwareContext';
import type { PermissionAwareContextData } from './permissionAwareContext';

// Diese Funktion ersetzt die aus permissionChecker
function checkPermission(
  userPermissions: string[],
  requiredPermissions: string[] | undefined
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }
  return requiredPermissions.every(perm => userPermissions.includes(perm));
}

/**
 * Supported languages for response messages
 */
type SupportedLanguage = 'de' | 'en';

/**
 * Default language to use when user preference is not specified
 */
const DEFAULT_LANGUAGE: SupportedLanguage = 'de';

/**
 * Generic blocked response messages by language
 */
const BLOCKED_RESPONSES: Record<SupportedLanguage, string> = {
  de: "Entschuldigung, auf diese spezifischen Informationen kann ich dir keinen Zugriff geben.",
  en: "Sorry, I cannot provide you with access to that specific information."
};

/**
 * Insufficient permissions response messages by language
 */
const PERMISSION_DENIED_RESPONSES: Record<SupportedLanguage, string> = {
  de: "Für diese Information benötigst du höhere Berechtigungen.",
  en: "You need higher permissions to access this information."
};

/**
 * Authentication required response messages by language
 */
const AUTH_REQUIRED_RESPONSES: Record<SupportedLanguage, string> = {
  de: "Bitte melde dich an, um auf diese Information zuzugreifen.",
  en: "Please log in to access this information."
};

/**
 * Redacts email addresses from the given text
 * 
 * @param text - The text to redact emails from
 * @returns The text with emails redacted
 */
function redactEmail(text: string): string {
  return text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, 
    '[REDACTED EMAIL]'
  );
}

/**
 * Redacts phone numbers from the given text
 * 
 * @param text - The text to redact phone numbers from
 * @returns The text with phone numbers redacted
 */
function redactPhone(text: string): string {
  return text.replace(
    /(\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9})/g,
    '[REDACTED PHONE]'
  );
}

/**
 * Redacts IP addresses from the given text
 * 
 * @param text - The text to redact IP addresses from
 * @returns The text with IP addresses redacted
 */
function redactIPAddress(text: string): string {
  // IPv4 pattern
  const ipv4Pattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
  
  // IPv6 pattern (simplified)
  const ipv6Pattern = /\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;
  
  let result = text.replace(ipv4Pattern, '[REDACTED IP]');
  result = result.replace(ipv6Pattern, '[REDACTED IP]');
  
  return result;
}

/**
 * Redacts personally identifiable information (PII) from the given text
 * 
 * @param text - The text to redact PII from
 * @returns The text with PII redacted
 */
function redactPII(text: string): string {
  let result = redactEmail(text);
  result = redactPhone(result);
  result = redactIPAddress(result);
  
  // Additional PII patterns can be added here as needed
  
  return result;
}

/**
 * Gets a generic blocked response message in the specified language
 * 
 * @param language - The language code for the response
 * @returns A generic blocked response message
 */
function getGenericBlockedResponse(language: SupportedLanguage = DEFAULT_LANGUAGE): string {
  return BLOCKED_RESPONSES[language] || BLOCKED_RESPONSES[DEFAULT_LANGUAGE];
}

/**
 * Gets a permission denied response message in the specified language
 * 
 * @param language - The language code for the response
 * @returns A permission denied response message
 */
function getPermissionDeniedResponse(language: SupportedLanguage = DEFAULT_LANGUAGE): string {
  return PERMISSION_DENIED_RESPONSES[language] || PERMISSION_DENIED_RESPONSES[DEFAULT_LANGUAGE];
}

/**
 * Gets an authentication required response message in the specified language
 * 
 * @param language - The language code for the response
 * @returns An authentication required response message
 */
function getAuthRequiredResponse(language: SupportedLanguage = DEFAULT_LANGUAGE): string {
  return AUTH_REQUIRED_RESPONSES[language] || AUTH_REQUIRED_RESPONSES[DEFAULT_LANGUAGE];
}

/**
 * Determines the language to use based on user context
 * 
 * @param context - The context containing user data
 * @returns The language code to use
 */
function getLanguageFromContext(context: { userAuthData?: PermissionAwareContextData | null }): SupportedLanguage {
  // Da PermissionAwareContextData keine Spracheinstellungen hat,
  // verwenden wir immer die Standardsprache
  return DEFAULT_LANGUAGE;
}

/**
 * Filters a chatbot response based on the user's permissions and privacy rules
 * 
 * @param responseText - The original response text generated by the chatbot
 * @param context - Context containing user permissions and authentication status
 * @returns The filtered response text that is safe to show to the user
 */
export async function filterResponse(
  responseText: string,
  context: { userAuthData?: PermissionAwareContextData | null }
): Promise<string> {
  // Determine user language for messages
  const language = getLanguageFromContext(context);
  
  // Step 1: Classify the information in the response
  // Verwende die statische classify-Methode statt einer Instanzmethode
  const classification = InformationClassifier.classify(responseText);
  
  // Step 2: Get the privacy rule for this classification
  const rule = getRuleForClassification(classification);
  
  // If no rule is found, block access as a precaution
  if (!rule) {
    console.warn(`No privacy rule found for sensitivity level: ${classification.sensitivityLevel}`);
    return getGenericBlockedResponse(language);
  }
  
  // Step 3: Handle public information
  if (classification.sensitivityLevel === SensitivityLevel.PUBLIC) {
    // Public information is always accessible, but we still redact PII for safety
    return rule.filtering === FilteringStrategy.REDACT_PII 
      ? redactPII(responseText) 
      : responseText;
  }
  
  // Step 4: Handle unauthenticated users
  if (!context?.userAuthData || !context.userAuthData.isAuthenticated) {
    // Unauthenticated users can only access public information
    return getAuthRequiredResponse(language);
  }
  
  // Step 5: Get user permissions from context
  const userPermissions = getUserPermissionsFromContext(context);
  
  // Step 6: Check if user has required permissions
  const hasRequiredPermissions = checkPermission(
    userPermissions, 
    classification.requiredPermissions
  );
  
  // Step 7: Handle permission denied case
  if (!hasRequiredPermissions) {
    return getPermissionDeniedResponse(language);
  }
  
  // Step 8: Apply filtering strategy based on the rule
  switch (rule.filtering) {
    case FilteringStrategy.ALLOW:
      // Allow access without modification
      return responseText;
      
    case FilteringStrategy.REDACT_PII:
      // Allow access but redact personally identifiable information
      return redactPII(responseText);
      
    case FilteringStrategy.BLOCK:
      // Block access completely
      return getGenericBlockedResponse(language);
      
    default:
      // Default to blocking if strategy is unknown
      console.warn(`Unknown filtering strategy: ${rule.filtering}`);
      return getGenericBlockedResponse(language);
  }
}

/**
 * Synchronous version of filterResponse for cases where asynchronous operation
 * is not needed or possible
 * 
 * @param responseText - The original response text generated by the chatbot
 * @param context - Context containing user permissions and authentication status
 * @returns The filtered response text that is safe to show to the user
 */
export function filterResponseSync(
  responseText: string,
  context: { userAuthData?: PermissionAwareContextData | null }
): string {
  // This implementation assumes that checkPermission can be called synchronously
  // If that's not the case, this function should not be exposed
  
  const language = getLanguageFromContext(context);
  
  // Verwende die statische classify-Methode
  const classification = InformationClassifier.classify(responseText);
  
  const rule = getRuleForClassification(classification);
  
  if (!rule) {
    console.warn(`No privacy rule found for sensitivity level: ${classification.sensitivityLevel}`);
    return getGenericBlockedResponse(language);
  }
  
  if (classification.sensitivityLevel === SensitivityLevel.PUBLIC) {
    return rule.filtering === FilteringStrategy.REDACT_PII 
      ? redactPII(responseText) 
      : responseText;
  }
  
  if (!context?.userAuthData || !context.userAuthData.isAuthenticated) {
    return getAuthRequiredResponse(language);
  }
  
  const userPermissions = getUserPermissionsFromContext(context);
  
  // Note: This assumes checkPermission has a synchronous version
  const hasRequiredPermissions = checkPermission(
    userPermissions, 
    classification.requiredPermissions
  );
  
  if (!hasRequiredPermissions) {
    return getPermissionDeniedResponse(language);
  }
  
  switch (rule.filtering) {
    case FilteringStrategy.ALLOW:
      return responseText;
    case FilteringStrategy.REDACT_PII:
      return redactPII(responseText);
    case FilteringStrategy.BLOCK:
      return getGenericBlockedResponse(language);
    default:
      console.warn(`Unknown filtering strategy: ${rule.filtering}`);
      return getGenericBlockedResponse(language);
  }
}