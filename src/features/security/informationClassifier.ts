/**
 * informationClassifier.ts
 * 
 * This module analyzes chatbot responses to determine their sensitivity level
 * and the permissions required to view them. It is part of the security layer
 * that ensures sensitive information is only shared with authorized users.
 */

// Define sensitivity levels in ascending order of restrictiveness
export enum SensitivityLevel {
    PUBLIC = 'PUBLIC',           // Anyone can see this information
    INTERNAL = 'INTERNAL',       // Only authenticated users can see this
    USER_SPECIFIC = 'USER_SPECIFIC', // Only the specific user this relates to can see this
    ADMIN_ONLY = 'ADMIN_ONLY',   // Only administrators can see this
    CONFIDENTIAL = 'CONFIDENTIAL' // Highly restricted, requires special permissions
  }
  
  // Permission constants to avoid typos
  export const Permissions = {
    // User-related permissions
    SELF_READ: 'self:read',
    USERS_READ: 'users:read',
    USERS_WRITE: 'users:write',
    
    // Subscription-related permissions
    SUBSCRIPTION_BASIC_READ: 'subscription:basic:read',
    SUBSCRIPTION_DETAILS_READ: 'subscription:details:read',
    SUBSCRIPTION_ADMIN: 'subscription:admin',
    
    // Admin permissions
    ADMIN_ACCESS: 'admin:access',
    ADMIN_FULL: 'admin:full',
    
    // System permissions
    SYSTEM_DIAGNOSTICS_READ: 'system:diagnostics:read',
    SYSTEM_LOGS_READ: 'system:logs:read',
    
    // Business/pricing permissions
    PRICING_READ: 'pricing:read',
    BUSINESS_METRICS_READ: 'business:metrics:read',
    
    // Analytics permissions
    ANALYTICS_BASIC: 'analytics:basic',
    ANALYTICS_ADVANCED: 'analytics:advanced'
  };
  
  // Define the classification result interface
  export interface InformationClassification {
    sensitivityLevel: SensitivityLevel;
    requiredPermissions: string[];
    details?: string; // Optional explanation for debugging/logging
  }
  
  // Define pattern rules for classification
  interface ClassificationRule {
    pattern: RegExp | string[];
    sensitivityLevel: SensitivityLevel;
    requiredPermissions: string[];
    details: string;
  }
  
  /**
   * Main class for classifying information in chatbot responses
   */
  export class InformationClassifier {
    // Define classification rules
    private static rules: ClassificationRule[] = [
      // Confidential - System diagnostics and internal error details
      {
        pattern: [
          'system error', 'internal error', 'exception id', 'stack trace',
          'debug log', 'system identifier', 'internal database', 'security breach',
          'deployment status', 'server configuration', 'api key', 'service password',
          'internal endpoint'
        ],
        sensitivityLevel: SensitivityLevel.CONFIDENTIAL,
        requiredPermissions: [Permissions.SYSTEM_DIAGNOSTICS_READ, Permissions.ADMIN_ACCESS],
        details: 'Contains system diagnostics or internal error information'
      },
      
      // Admin only - User management and system administration
      {
        pattern: [
          'user list', 'all customers', 'registered users', 'admin settings',
          'user statistics', 'admin dashboard', 'user management', 'role assignment',
          'permission management', 'all accounts', 'customer database'
        ],
        sensitivityLevel: SensitivityLevel.ADMIN_ONLY,
        requiredPermissions: [Permissions.USERS_READ, Permissions.ADMIN_ACCESS],
        details: 'Contains user management or administrative information'
      },
      
      // Admin only - Business and financial metrics
      {
        pattern: [
          'revenue report', 'financial summary', 'conversion rate', 'customer acquisition',
          'business metrics', 'monthly revenue', 'profit margin', 'sales data',
          'churn rate', 'customer lifetime value', 'quarterly results'
        ],
        sensitivityLevel: SensitivityLevel.ADMIN_ONLY,
        requiredPermissions: [Permissions.BUSINESS_METRICS_READ, Permissions.ADMIN_ACCESS],
        details: 'Contains business or financial metrics'
      },
      
      // User specific - Personal account information
      {
        pattern: /\b(your|dein[e]?|deine[r]?|Ihr[e]?|seine[r]?|ihre[r]?)(\s+)(account|konto|e-mail|email|e mail|bestellung|order|payment|zahlung|rechnung|invoice|adresse|address|profile|profil|subscription|abo[nnement]?|name|passwort|password)\b/i,
        sensitivityLevel: SensitivityLevel.USER_SPECIFIC,
        requiredPermissions: [Permissions.SELF_READ],
        details: 'Contains user-specific account information'
      },
      
      // User specific - Subscription details
      {
        pattern: /\b(your|dein[e]?|deine[r]?|Ihr[e]?|seine[r]?|ihre[r]?)(\s+)(subscription|abo[nnement]?|plan|paket|member[ship]?|mitglied[schaft]?|premium|benefits|vorteile)\b/i,
        sensitivityLevel: SensitivityLevel.USER_SPECIFIC,
        requiredPermissions: [Permissions.SUBSCRIPTION_DETAILS_READ, Permissions.SELF_READ],
        details: 'Contains user-specific subscription details'
      },
      
      // Internal - Pricing and subscription information (general)
      {
        pattern: [
          'price list', 'pricing details', 'subscription options', 'payment plan',
          'premium benefits', 'discount code', 'pricing strategy', 'special offer',
          'price comparison', 'preisliste', 'preisdetails', 'abooptionen', 'rabattcode'
        ],
        sensitivityLevel: SensitivityLevel.INTERNAL,
        requiredPermissions: [Permissions.PRICING_READ],
        details: 'Contains pricing or subscription plan information'
      },
      
      // Internal - Analytics and statistics
      {
        pattern: [
          'user statistics', 'usage analytics', 'performance metrics', 'user engagement',
          'feature usage', 'active users', 'usage trend', 'user behavior', 
          'nutzungsstatistik', 'analytik', 'metriken', 'nutzungsverhalten'
        ],
        sensitivityLevel: SensitivityLevel.INTERNAL,
        requiredPermissions: [Permissions.ANALYTICS_BASIC],
        details: 'Contains analytics or statistical information'
      }
    ];
  
    /**
     * Analyzes a chatbot response to determine its sensitivity and required permissions
     * 
     * @param responseText The text response to analyze
     * @returns An InformationClassification object with sensitivity level and required permissions
     */
    public static classify(responseText: string): InformationClassification {
      if (!responseText || responseText.trim() === '') {
        return {
          sensitivityLevel: SensitivityLevel.PUBLIC,
          requiredPermissions: [],
          details: 'Empty response'
        };
      }
      
      // Normalize text for case-insensitive matching
      const normalizedText = responseText.toLowerCase();
      
      // Default classification (public information)
      let highestSensitivity = SensitivityLevel.PUBLIC;
      let allRequiredPermissions: Set<string> = new Set();
      let matchDetails: string[] = [];
      
      // Check against each rule
      for (const rule of this.rules) {
        let isMatch = false;
        
        // Check if the rule pattern is a RegExp or string array
        if (rule.pattern instanceof RegExp) {
          isMatch = rule.pattern.test(responseText);
        } else if (Array.isArray(rule.pattern)) {
          // Check if any of the keywords/phrases are in the text
          isMatch = rule.pattern.some(keyword => 
            normalizedText.includes(keyword.toLowerCase())
          );
        }
        
        if (isMatch) {
          // Add rule details to match details
          matchDetails.push(rule.details);
          
          // Check if this rule has a higher sensitivity level
          if (this.getSensitivityRank(rule.sensitivityLevel) > 
              this.getSensitivityRank(highestSensitivity)) {
            highestSensitivity = rule.sensitivityLevel;
          }
          
          // Add required permissions to the set (automatically handles duplicates)
          for (const permission of rule.requiredPermissions) {
            allRequiredPermissions.add(permission);
          }
        }
      }
      
      // Create final classification result
      return {
        sensitivityLevel: highestSensitivity,
        requiredPermissions: Array.from(allRequiredPermissions),
        details: matchDetails.length > 0 
          ? matchDetails.join('; ') 
          : 'No sensitive information detected'
      };
    }
    
    /**
     * Helper method to get the numerical rank of a sensitivity level
     * Used for comparing severity of different sensitivity levels
     */
    private static getSensitivityRank(level: SensitivityLevel): number {
      const ranks = {
        [SensitivityLevel.PUBLIC]: 0,
        [SensitivityLevel.INTERNAL]: 1,
        [SensitivityLevel.USER_SPECIFIC]: 2,
        [SensitivityLevel.ADMIN_ONLY]: 3,
        [SensitivityLevel.CONFIDENTIAL]: 4
      };
      
      return ranks[level] || 0;
    }
    
    /**
     * Adds a custom classification rule
     * Useful for extending the classifier with application-specific patterns
     * 
     * @param rule The classification rule to add
     */
    public static addRule(rule: ClassificationRule): void {
      // Add the rule to the beginning to give it higher priority
      this.rules.unshift(rule);
    }
    
    /**
     * Checks if a response contains a specific category of sensitive information
     * 
     * @param responseText The text to analyze
     * @param sensitivityLevel The sensitivity level to check for
     * @returns True if the response has the specified sensitivity level or higher
     */
    public static hasSensitivityLevel(
      responseText: string, 
      sensitivityLevel: SensitivityLevel
    ): boolean {
      const classification = this.classify(responseText);
      return this.getSensitivityRank(classification.sensitivityLevel) >= 
             this.getSensitivityRank(sensitivityLevel);
    }
  }
  
  // Export default instance
  export default InformationClassifier;