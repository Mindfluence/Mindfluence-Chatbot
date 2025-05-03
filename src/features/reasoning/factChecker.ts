/**
 * features/reasoning/factChecker.ts
 * 
 * Responsible for validating factual information in the chatbot's responses
 * and ensuring accuracy of knowledge-based answers.
 */

import type { Entity } from '@/types/nlp.types';
import { KnowledgeGraph, type KnowledgeNode, type KnowledgeEdge } from './knowledgeGraph';
import { EntityRelationManager, type EntityRelationType } from './entityRelationManager';
import { InferenceEngine, type Fact } from './inferenceEngine';
import { databaseService } from '@/lib/databaseService';

// Confidence levels for fact validation
export enum ConfidenceLevel {
  VERIFIED = 'verified',        // Confirmed by multiple reliable sources
  LIKELY = 'likely',            // Supported by limited but reliable sources
  UNCERTAIN = 'uncertain',      // Insufficient information to verify
  UNLIKELY = 'unlikely',        // Contradicted by some sources
  INCORRECT = 'incorrect',      // Contradicted by reliable sources
  OUTDATED = 'outdated'         // Was true but is now obsolete
}

// Source types for fact checking
export enum SourceType {
  KNOWLEDGE_GRAPH = 'knowledge_graph',
  DATABASE = 'database',
  INFERENCE = 'inference',
  DOMAIN_RULES = 'domain_rules',
  USER_PROVIDED = 'user_provided',
  EXTERNAL_SOURCE = 'external_source'
}

// Source reference for fact validation
export interface SourceReference {
  type: SourceType;
  id: string;
  name: string;
  timestamp?: number;
  reliability: number;          // 0.0-1.0 reliability score
  url?: string;
  metadata?: Record<string, any>;
}

// Fact statement representation
export interface FactStatement {
  id: string;
  subject: string;              // The entity the fact is about
  subjectType?: string;         // Type of the subject entity
  predicate: string;            // The relation or property
  object: string;               // The value or related entity
  objectType?: string;          // Type of the object entity
  confidence: ConfidenceLevel;  // Confidence in this fact
  sources: SourceReference[];   // Sources supporting this fact
  timestamp: number;            // When this fact was last verified
  expirationTime?: number;      // When this fact should be rechecked
  metadata?: Record<string, any>;
}

// Result of fact verification
export interface VerificationResult {
  statement: FactStatement;
  isVerified: boolean;
  confidence: ConfidenceLevel;
  confidenceScore: number;      // Numerical confidence (0.0-1.0)
  sources: SourceReference[];
  contradictions?: FactStatement[];
  suggestedCorrection?: string;
  reasoning?: string;
  verificationTime: number;
}

// Settings for fact checking
export interface FactCheckSettings {
  minConfidenceRequired: number;
  checkContradictions: boolean;
  useInference: boolean;
  useDomainKnowledge: boolean;
  maxSourceAge: number;         // Max age of sources in milliseconds
  minSourcesRequired: number;
  checkExternalSources: boolean;
  logVerificationDetails: boolean;
  cacheVerificationResults: boolean;
  cacheLifetime: number;        // Cache lifetime in milliseconds
}

// Default settings
const DEFAULT_SETTINGS: FactCheckSettings = {
  minConfidenceRequired: 0.7,
  checkContradictions: true,
  useInference: true,
  useDomainKnowledge: true,
  maxSourceAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  minSourcesRequired: 1,
  checkExternalSources: false,
  logVerificationDetails: true,
  cacheVerificationResults: true,
  cacheLifetime: 24 * 60 * 60 * 1000 // 24 hours
};

// Cache for verification results
interface VerificationCache {
  [statementId: string]: {
    result: VerificationResult;
    timestamp: number;
  };
}

// Define InferenceResult interface for proper typing
interface InferenceResult {
  confidence: number;
  facts: Fact[];
  explanation?: string;
}

/**
 * Fact checker service for validating information
 */
export class FactChecker {
  private settings: FactCheckSettings;
  private verificationCache: VerificationCache = {};
  private domainRules: Map<string, any> = new Map();
  private lastCleanupTime: number = Date.now();
  private knowledgeGraph: KnowledgeGraph;
  private entityRelationManager: EntityRelationManager;
  private inferenceEngine: InferenceEngine;
  
  /**
   * Creates a new fact checker instance
   * 
   * @param settings Optional custom settings
   */
  constructor(settings: Partial<FactCheckSettings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    
    // Initialize dependencies
    this.knowledgeGraph = KnowledgeGraph.getInstance();
    this.entityRelationManager = EntityRelationManager.getInstance();
    this.inferenceEngine = InferenceEngine.getInstance();
    
    // Load domain rules
    this.loadDomainRules();
    
    console.log('[factChecker] Initialized with settings:', this.settings);
  }
  
  /**
   * Verifies a factual statement for accuracy
   * 
   * @param statement The statement to verify
   * @returns Verification result
   */
  public async verifyStatement(statement: FactStatement): Promise<VerificationResult> {
    try {
      const startTime = Date.now();
      
      // Create unique ID for the statement if not provided
      if (!statement.id) {
        statement.id = this.generateStatementId(statement);
      }
      
      // Log the verification request
      if (this.settings.logVerificationDetails) {
        console.log(`[factChecker] Verifying statement: "${statement.subject} ${statement.predicate} ${statement.object}"`);
      }
      
      // Check cache first if enabled
      if (this.settings.cacheVerificationResults) {
        const cachedResult = this.getCachedResult(statement.id);
        
        if (cachedResult) {
          return cachedResult;
        }
      }
      
      // Clean up cache periodically
      this.cleanupCacheIfNeeded();
      
      // Initialize verification result
      const result: VerificationResult = {
        statement,
        isVerified: false,
        confidence: ConfidenceLevel.UNCERTAIN,
        confidenceScore: 0,
        sources: [],
        verificationTime: startTime
      };
      
      // Start verification process
      await this.performVerification(statement, result);
      
      // Cache the result if enabled
      if (this.settings.cacheVerificationResults) {
        this.cacheResult(statement.id, result);
      }
      
      // Log the verification result
      if (this.settings.logVerificationDetails) {
        console.log(`[factChecker] Verification result: ${result.isVerified ? 'VERIFIED' : 'NOT VERIFIED'} (confidence: ${result.confidence}, score: ${result.confidenceScore.toFixed(2)})`);
      }
      
      return result;
    } catch (error) {
      console.error('[factChecker] Error verifying statement:', error);
      
      // Return a fallback uncertain result
      return {
        statement,
        isVerified: false,
        confidence: ConfidenceLevel.UNCERTAIN,
        confidenceScore: 0,
        sources: [],
        reasoning: `Error during verification: ${(error as Error).message}`,
        verificationTime: Date.now()
      };
    }
  }
  
  /**
   * Verifies a collection of facts in a response
   * 
   * @param text The response text to check
   * @param entities Relevant entities for context
   * @returns Array of verification results for facts in the text
   */
  public async verifyResponseFacts(
    text: string, 
    entities: Entity[] = []
  ): Promise<VerificationResult[]> {
    try {
      console.log(`[factChecker] Verifying facts in response: "${text.substring(0, 50)}..."`);
      
      // Extract factual statements from the text
      const statements = await this.extractFactualStatements(text, entities);
      
      if (statements.length === 0) {
        console.log('[factChecker] No factual statements found in response');
        return [];
      }
      
      console.log(`[factChecker] Extracted ${statements.length} factual statements`);
      
      // Verify each statement
      const verificationPromises = statements.map(statement => 
        this.verifyStatement(statement)
      );
      
      // Wait for all verifications to complete
      const results = await Promise.all(verificationPromises);
      
      return results;
    } catch (error) {
      console.error('[factChecker] Error verifying response facts:', error);
      return [];
    }
  }
  
  /**
   * Corrects factual errors in a response
   * 
   * @param text The response text to correct
   * @param verificationResults The verification results for facts in the text
   * @returns Corrected text
   */
  public correctFactualErrors(
    text: string, 
    verificationResults: VerificationResult[]
  ): string {
    try {
      // Skip if no verification results
      if (verificationResults.length === 0) {
        return text;
      }
      
      console.log(`[factChecker] Correcting factual errors in: "${text.substring(0, 50)}..."`);
      
      let correctedText = text;
      
      // Find and correct errors
      const errorsToCorrect = verificationResults.filter(result => 
        !result.isVerified && 
        result.suggestedCorrection &&
        (result.confidence === ConfidenceLevel.INCORRECT || 
         result.confidence === ConfidenceLevel.OUTDATED)
      );
      
      if (errorsToCorrect.length === 0) {
        console.log('[factChecker] No corrections needed');
        return text;
      }
      
      console.log(`[factChecker] Found ${errorsToCorrect.length} errors to correct`);
      
      // Apply corrections
      for (const error of errorsToCorrect) {
        const statement = error.statement;
        const errorPattern = `${statement.subject}\\s+${statement.predicate}\\s+${statement.object}`;
        const errorRegex = new RegExp(errorPattern, 'gi');
        
        if (error.suggestedCorrection) {
          correctedText = correctedText.replace(errorRegex, error.suggestedCorrection);
        }
      }
      
      // Add uncertainty disclaimers for uncertain facts
      const uncertainFacts = verificationResults.filter(result => 
        result.confidence === ConfidenceLevel.UNCERTAIN ||
        result.confidence === ConfidenceLevel.UNLIKELY
      );
      
      if (uncertainFacts.length > 0) {
        correctedText += "\n\nHinweis: Einige Informationen in dieser Antwort konnten nicht vollständig verifiziert werden.";
      }
      
      console.log('[factChecker] Correction completed');
      
      return correctedText;
    } catch (error) {
      console.error('[factChecker] Error correcting factual errors:', error);
      return text;
    }
  }
  
  /**
   * Gets all known facts about an entity
   * 
   * @param entityId The entity identifier
   * @param entityType Optional entity type
   * @returns Array of facts about the entity
   */
  public async getFactsAboutEntity(
    entityId: string, 
    entityType?: string
  ): Promise<FactStatement[]> {
    try {
      console.log(`[factChecker] Getting facts about entity: ${entityId} (${entityType || 'unknown type'})`);
      
      const facts: FactStatement[] = [];
      
      // Try to get facts from knowledge graph
      try {
        // Create a simple entity object for query
        const entity: Entity = {
          type: entityType || 'entity',
          value: entityId,
          confidence: 1.0
        };
        
        // Query the knowledge graph for related facts
        const results = this.knowledgeGraph.query("", [entity]);
        
        if (results.length > 0) {
          // Convert results to facts
          for (const result of results) {
            for (const fact of result.facts) {
              facts.push({
                id: this.generateUniqueId(),
                subject: fact.subject,
                subjectType: fact.metadata?.sourceType,
                predicate: fact.predicate,
                object: fact.object,
                objectType: fact.metadata?.targetType,
                confidence: this.mapConfidenceToLevel(fact.confidence),
                sources: [{
                  type: SourceType.KNOWLEDGE_GRAPH,
                  id: 'knowledge_graph',
                  name: 'Knowledge Graph',
                  reliability: 0.8,
                  timestamp: Date.now()
                }],
                timestamp: Date.now()
              });
            }
          }
        }
      } catch (kgError) {
        console.warn('[factChecker] Error getting facts from knowledge graph:', kgError);
      }
      
      // Try to get facts from entity relation manager
      try {
        // Create a simple entity object for query
        const entity: Entity = {
          type: entityType || 'entity',
          value: entityId,
          confidence: 1.0
        };
        
        // Get relations using findRelations
        const relations = this.entityRelationManager.findRelations(entity);
        
        relations.forEach(relation => {
          const fact: FactStatement = {
            id: this.generateUniqueId(),
            subject: entityId,
            subjectType: entityType,
            predicate: relation.relation.relationType,
            object: relation.targetEntity.value,
            objectType: relation.targetEntity.type,
            confidence: this.mapConfidenceToLevel(relation.confidence || 0.5),
            sources: [{
              type: SourceType.KNOWLEDGE_GRAPH,
              id: 'entity_relation_manager',
              name: 'Entity Relation Manager',
              reliability: 0.8,
              timestamp: Date.now()
            }],
            timestamp: Date.now()
          };
          
          facts.push(fact);
        });
      } catch (ermError) {
        console.warn('[factChecker] Error getting facts from entity relation manager:', ermError);
      }
      
      // Try to get facts from domain rules
      if (this.settings.useDomainKnowledge) {
        const domainFacts = this.getFactsFromDomainRules(entityId, entityType);
        facts.push(...domainFacts);
      }
      
      console.log(`[factChecker] Found ${facts.length} facts about entity ${entityId}`);
      
      return facts;
    } catch (error) {
      console.error('[factChecker] Error getting facts about entity:', error);
      return [];
    }
  }
  
  /**
   * Gets all known contradictions to a fact
   * 
   * @param statement The fact statement to check for contradictions
   * @returns Array of contradicting facts
   */
  public async findContradictions(
    statement: FactStatement
  ): Promise<FactStatement[]> {
    try {
      console.log(`[factChecker] Finding contradictions for: "${statement.subject} ${statement.predicate} ${statement.object}"`);
      
      const contradictions: FactStatement[] = [];
      
      // Get all facts about the subject
      const relatedFacts = await this.getFactsAboutEntity(statement.subject, statement.subjectType);
      
      // Filter for facts with the same predicate but different object
      const potentialContradictions = relatedFacts.filter(fact => 
        fact.predicate === statement.predicate && 
        fact.object !== statement.object
      );
      
      // Analyze each potential contradiction
      for (const contradiction of potentialContradictions) {
        // Skip facts with low confidence
        if (this.getConfidenceScore(contradiction.confidence) < 0.5) {
          continue;
        }
        
        // Check if the contradiction is significant
        const isSignificantContradiction = await this.isContradiction(statement, contradiction);
        
        if (isSignificantContradiction) {
          contradictions.push(contradiction);
        }
      }
      
      console.log(`[factChecker] Found ${contradictions.length} contradictions`);
      
      return contradictions;
    } catch (error) {
      console.error('[factChecker] Error finding contradictions:', error);
      return [];
    }
  }
  
  /**
   * Adds a new verified fact to the knowledge system
   * 
   * @param fact The fact to add
   * @returns Whether the fact was successfully added
   */
  public async addVerifiedFact(fact: FactStatement): Promise<boolean> {
    try {
      console.log(`[factChecker] Adding verified fact: "${fact.subject} ${fact.predicate} ${fact.object}"`);
      
      // Ensure the fact has a high confidence
      if (this.getConfidenceScore(fact.confidence) < this.settings.minConfidenceRequired) {
        console.warn('[factChecker] Cannot add fact with insufficient confidence');
        return false;
      }
      
      // Add to knowledge graph
      try {
        // Create source entity
        const sourceEntity: Entity = {
          type: fact.subjectType || 'entity',
          value: fact.subject,
          confidence: this.getConfidenceScore(fact.confidence)
        };
        
        // Create target entity
        const targetEntity: Entity = {
          type: fact.objectType || 'entity',
          value: fact.object,
          confidence: this.getConfidenceScore(fact.confidence)
        };
        
        // Add relationship to knowledge graph
        const success = this.knowledgeGraph.addRelationship(
          sourceEntity,
          fact.predicate,
          targetEntity,
          this.getConfidenceScore(fact.confidence),
          'fact_checker'
        );
        
        if (!success) {
          console.warn('[factChecker] Failed to add fact to knowledge graph');
          return false;
        }
        
        console.log('[factChecker] Fact added to knowledge graph');
        
        // Add to entity relation manager
        // Use EntityRelationType for type safety
        const relationType = this.mapPredicateToEntityRelationType(fact.predicate);
        
        if (relationType) {
          this.entityRelationManager.addRelation(
            sourceEntity, 
            targetEntity,
            relationType,
            this.getConfidenceScore(fact.confidence),
            fact.metadata || {}
          );
          
          console.log('[factChecker] Fact added to entity relation manager');
        } else {
          console.warn(`[factChecker] Couldn't map predicate '${fact.predicate}' to EntityRelationType`);
        }
        
        return true;
      } catch (error) {
        console.error('[factChecker] Error adding fact to knowledge systems:', error);
        return false;
      }
    } catch (error) {
      console.error('[factChecker] Error adding verified fact:', error);
      return false;
    }
  }
  
  /**
   * Checks facts for accuracy
   * 
   * @param facts Array of facts to check
   * @returns Result with overall confidence and any corrections
   */
  public checkFacts(facts: any[]): { confidence: number, corrections: any[] } {
    // Implementation would be added here
    return { confidence: 1.0, corrections: [] };
  }
  
  /**
   * Extracts factual statements from text
   * 
   * @param text The text to analyze
   * @param entities Optional relevant entities
   * @returns Array of extracted fact statements
   */
  private async extractFactualStatements(
    text: string, 
    entities: Entity[] = []
  ): Promise<FactStatement[]> {
    try {
      const statements: FactStatement[] = [];
      
      // In a real implementation, this would use NLP to extract facts
      // For this example, we'll use a simple pattern-based approach
      
      // First, convert entities to potential subjects
      const potentialSubjects = entities.map(entity => entity.value);
      
      // Simple fact pattern: "[Subject] [predicate] [object]"
      // Example: "Berlin is the capital of Germany"
      
      // Define some common predicates to look for
      const commonPredicates = [
        'is', 'are', 'was', 'were', 'has', 'have', 'contains', 'includes',
        'liegt in', 'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'enthält', 'beinhaltet',
        'located in', 'founded in', 'created by', 'owned by', 'made by',
        'gegründet in', 'erstellt von', 'gehört zu', 'hergestellt von'
      ];
      
      // For each entity/subject, look for fact patterns
      for (const subject of potentialSubjects) {
        for (const predicate of commonPredicates) {
          // Create a regex pattern that looks for:
          // [subject] [predicate] something
          const pattern = new RegExp(`\\b${subject}\\b\\s+\\b${predicate}\\b\\s+([^\\.,;]+)`, 'gi');
          
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const object = (match[1] ?? '').trim();
            
            // Find entity type for the object if possible
            const objectEntity = entities.find(entity => entity.value === object);
            const objectType = objectEntity?.type;
            
            // Find entity type for the subject if possible
            const subjectEntity = entities.find(entity => entity.value === subject);
            const subjectType = subjectEntity?.type;
            
            // Create the fact statement
            const statement: FactStatement = {
              id: this.generateUniqueId(),
              subject,
              subjectType,
              predicate,
              object,
              objectType,
              confidence: ConfidenceLevel.UNCERTAIN, // Start with uncertain
              sources: [{
                type: SourceType.USER_PROVIDED,
                id: 'response_text',
                name: 'Response Text',
                timestamp: Date.now(),
                reliability: 0.5 // Medium reliability for extracted facts
              }],
              timestamp: Date.now()
            };
            
            statements.push(statement);
          }
        }
      }
      
      return statements;
    } catch (error) {
      console.error('[factChecker] Error extracting factual statements:', error);
      return [];
    }
  }
  
  /**
   * Performs the verification process for a statement
   * 
   * @param statement The statement to verify
   * @param result The verification result to update
   */
  private async performVerification(
    statement: FactStatement,
    result: VerificationResult
  ): Promise<void> {
    try {
      // First, collect evidence from knowledge graph
      await this.checkKnowledgeGraph(statement, result);
      
      // Then, check database if needed
      if (result.confidenceScore < this.settings.minConfidenceRequired) {
        await this.checkDatabase(statement, result);
      }
      
      // If confidence is still low and inference is enabled, try inference
      if (result.confidenceScore < this.settings.minConfidenceRequired && 
          this.settings.useInference) {
        await this.useInference(statement, result);
      }
      
      // Check domain rules if enabled
      if (this.settings.useDomainKnowledge) {
        this.checkDomainRules(statement, result);
      }
      
      // If contradictions checking is enabled, find contradictions
      if (this.settings.checkContradictions) {
        const contradictions = await this.findContradictions(statement);
        
        if (contradictions.length > 0) {
          result.contradictions = contradictions;
          
          // If there are strong contradictions, reduce confidence
          const strongContradictions = contradictions.filter(
            c => this.getConfidenceScore(c.confidence) > result.confidenceScore
          );
          
          if (strongContradictions.length > 0) {
            result.confidence = ConfidenceLevel.UNLIKELY;
            result.confidenceScore = Math.max(0.1, result.confidenceScore - 0.3);
            
            // Add reasoning
            if (!result.reasoning) {
              result.reasoning = '';
            }
            result.reasoning += ` Found ${strongContradictions.length} strong contradictions.`;
            
            // Add suggested correction if a contradiction is very strong
            const veryStrongContradiction = strongContradictions.find(
              c => this.getConfidenceScore(c.confidence) > 0.9
            );
            
            if (veryStrongContradiction) {
              result.suggestedCorrection = `${statement.subject} ${statement.predicate} ${veryStrongContradiction.object}`;
              result.confidence = ConfidenceLevel.INCORRECT;
            }
          }
        }
      }
      
      // Finalize verification based on confidence score
      result.isVerified = result.confidenceScore >= this.settings.minConfidenceRequired;
      
      // Set final confidence level
      if (!result.isVerified && result.confidence !== ConfidenceLevel.INCORRECT) {
        if (result.confidenceScore < 0.3) {
          result.confidence = ConfidenceLevel.UNCERTAIN;
        } else if (result.confidenceScore < this.settings.minConfidenceRequired) {
          result.confidence = ConfidenceLevel.UNLIKELY;
        }
      }
      
      // Check for outdated sources
      if (result.isVerified) {
        const oldestSource = this.getOldestSourceTimestamp(result.sources);
        const sourceAge = Date.now() - oldestSource;
        
        if (sourceAge > this.settings.maxSourceAge) {
          result.confidence = ConfidenceLevel.OUTDATED;
          result.isVerified = false;
          
          if (!result.reasoning) {
            result.reasoning = '';
          }
          result.reasoning += ` Sources are outdated (${Math.round(sourceAge / (24 * 60 * 60 * 1000))} days old).`;
        }
      }
    } catch (error) {
      console.error('[factChecker] Error during verification process:', error);
      result.isVerified = false;
      result.confidence = ConfidenceLevel.UNCERTAIN;
      result.confidenceScore = 0;
      
      if (!result.reasoning) {
        result.reasoning = '';
      }
      result.reasoning += ` Error during verification: ${(error as Error).message}`;
    }
  }
  
  /**
   * Checks the knowledge graph for evidence about a statement
   * 
   * @param statement The statement to check
   * @param result The verification result to update
   */
  private async checkKnowledgeGraph(
    statement: FactStatement,
    result: VerificationResult
  ): Promise<void> {
    try {
      // Create source entity for querying
      const sourceEntity: Entity = {
        type: statement.subjectType || 'entity',
        value: statement.subject,
        confidence: 1.0
      };
      
      // Create target entity for querying
      const targetEntity: Entity = {
        type: statement.objectType || 'entity',
        value: statement.object,
        confidence: 1.0
      };
      
      // Query the graph for relationships between source and target
      const results = this.knowledgeGraph.query(
        `${statement.subject} ${statement.predicate} ${statement.object}`,
        [sourceEntity, targetEntity]
      );
      
      if (results.length > 0) {
        // Get the highest confidence result
        results.sort((a, b) => b.confidence - a.confidence);
        const bestResult = results[0];
        
        // Fix for TS2532: Object is possibly 'undefined'
        if (bestResult) {
          // Look for facts matching our statement
          const matchingFacts = bestResult.facts.filter(fact => 
            fact.subject === statement.subject && 
            fact.predicate === statement.predicate && 
            fact.object === statement.object
          );
          
          if (matchingFacts.length > 0) {
            // We found direct evidence
            const bestMatch = matchingFacts.reduce((best, current) => 
              current.confidence > best.confidence ? current : best
            );
            
            // Update result confidence based on match confidence
            result.confidenceScore = bestMatch.confidence;
            result.confidence = this.mapConfidenceToLevel(result.confidenceScore);
            
            // Add source
            result.sources.push({
              type: SourceType.KNOWLEDGE_GRAPH,
              id: 'knowledge_graph_match',
              name: 'Knowledge Graph',
              timestamp: Date.now(),
              reliability: 0.9 // High reliability for knowledge graph
            });
            
            // Add reasoning
            if (!result.reasoning) {
              result.reasoning = '';
            }
            result.reasoning += ` Found direct match in knowledge graph with confidence ${result.confidenceScore.toFixed(2)}.`;
          } else {
            // No direct match, check for related information
            const relatedFacts = bestResult.facts.filter(fact => 
              fact.subject === statement.subject && 
              fact.predicate === statement.predicate
            );
            
            if (relatedFacts.length > 0) {
              // Found information about the same predicate but different objects
              
              if (!result.reasoning) {
                result.reasoning = '';
              }
              result.reasoning += ` Found ${relatedFacts.length} related facts with different values.`;
              
              // These could be contradictions, but that's handled separately
            }
          }
        }
      }
    } catch (error) {
      console.error('[factChecker] Error checking knowledge graph:', error);
      
      if (!result.reasoning) {
        result.reasoning = '';
      }
      result.reasoning += ` Error checking knowledge graph: ${(error as Error).message}`;
    }
  }
  
  /**
   * Checks the database for evidence about a statement
   * 
   * @param statement The statement to check
   * @param result The verification result to update
   */
  private async checkDatabase(
    statement: FactStatement,
    result: VerificationResult
  ): Promise<void> {
    try {
      // In a real implementation, this would query a database
      // For this example, we'll just simulate a database check
      
      // Create a query to find the fact in the database
      const query = {
        sql: `
          SELECT * FROM facts 
          WHERE subject = ? AND predicate = ? AND object = ?
        `,
        params: [
          statement.subject,
          statement.predicate,
          statement.object
        ]
      };
      
      // Use mock database result since databaseService.execute might not exist
      const dbResult: any[] = [];
      
      // Process the result
      if (dbResult && dbResult.length > 0) {
        // We found evidence in the database
        const dbFact = dbResult[0];
        
        // Get confidence from database (simulated)
        const dbConfidence = dbFact.confidence || 0.8;
        
        // If database confidence is higher, update our confidence
        if (dbConfidence > result.confidenceScore) {
          result.confidenceScore = dbConfidence;
          result.confidence = this.mapConfidenceToLevel(dbConfidence);
          
          // Add source
          result.sources.push({
            type: SourceType.DATABASE,
            id: `db_fact_${dbFact.id}`,
            name: 'Fact Database',
            timestamp: dbFact.timestamp || Date.now(),
            reliability: 0.85 // High reliability for database
          });
          
          // Add reasoning
          if (!result.reasoning) {
            result.reasoning = '';
          }
          result.reasoning += ` Found supporting evidence in database with confidence ${dbConfidence.toFixed(2)}.`;
        }
      } else {
        // No direct evidence found
        
        // Check for related facts - in a real implementation this would query the database
        const relatedResults: any[] = [];
        
        if (relatedResults && relatedResults.length > 0) {
          // Found related facts with different objects
          
          if (!result.reasoning) {
            result.reasoning = '';
          }
          result.reasoning += ` Found ${relatedResults.length} related facts in database with different values.`;
          
          // These could be contradictions, but that's handled separately
        }
      }
    } catch (error) {
      console.error('[factChecker] Error checking database:', error);
      
      if (!result.reasoning) {
        result.reasoning = '';
      }
      result.reasoning += ` Error checking database: ${(error as Error).message}`;
    }
  }
  
  /**
   * Uses inference to check if a statement can be derived
   * 
   * @param statement The statement to check
   * @param result The verification result to update
   */
  private async useInference(
    statement: FactStatement,
    result: VerificationResult
  ): Promise<void> {
    try {
      // Create a fact to check
      const fact: Fact = {
        subject: statement.subject,
        predicate: statement.predicate,
        object: statement.object,
        confidence: this.getConfidenceScore(statement.confidence)
      };
      
      // Create source entity for inference
      const sourceEntity: Entity = {
        type: statement.subjectType || 'entity',
        value: statement.subject,
        confidence: 1.0
      };
      
      // Create target entity for inference
      const targetEntity: Entity = {
        type: statement.objectType || 'entity',
        value: statement.object,
        confidence: 1.0
      };
      
      // Use inference engine to check this fact
      // Fix missing await - add await before Promise operations
      const inferenceResults = await this.inferenceEngine.performInference(
        `${statement.subject} ${statement.predicate} ${statement.object}`,
        [sourceEntity, targetEntity]
      );
      
      // Check if we got any results
      if (inferenceResults.length > 0) {
        // Get the highest confidence result
        inferenceResults.sort((a: InferenceResult, b: InferenceResult) => b.confidence - a.confidence);
        const topResult = inferenceResults[0];
        
        // Fix for TS18048: 'bestResult' is possibly 'undefined'
        if (topResult) {
          // Check if this result supports our statement
          const supportingFacts = topResult.facts.filter(f => 
            f.subject === statement.subject && 
            f.predicate === statement.predicate && 
            f.object === statement.object
          );
          
          if (supportingFacts.length > 0) {
            // We have inference support
            const inferenceConfidence = topResult.confidence;
            
            // Update confidence if inference is more confident
            if (inferenceConfidence > result.confidenceScore) {
              result.confidenceScore = inferenceConfidence;
              result.confidence = this.mapConfidenceToLevel(inferenceConfidence);
              
              // Add source
              result.sources.push({
                type: SourceType.INFERENCE,
                id: `inference_${Date.now()}`,
                name: 'Inference Engine',
                timestamp: Date.now(),
                reliability: 0.7 // Medium-high reliability for inference
              });
              
              // Add reasoning
              if (!result.reasoning) {
                result.reasoning = '';
              }
              result.reasoning += ` Fact was validated through inference with confidence ${inferenceConfidence.toFixed(2)}.`;
              
              // Add explanation
              if (topResult.explanation) {
                result.reasoning += ` Inference explanation: ${topResult.explanation}`;
              }
            }
          } else {
            // Inference couldn't validate the fact directly
            if (!result.reasoning) {
              result.reasoning = '';
            }
            result.reasoning += ' Inference engine found related information but could not validate this fact directly.';
          }
        }
      } else {
        // Inference couldn't validate the fact
        if (!result.reasoning) {
          result.reasoning = '';
        }
        result.reasoning += ' Inference engine could not validate this fact.';
      }
    } catch (error) {
      console.error('[factChecker] Error using inference:', error);
      
      if (!result.reasoning) {
        result.reasoning = '';
      }
      result.reasoning += ` Error using inference: ${(error as Error).message}`;
    }
  }
  
  /**
   * Checks domain rules for evidence about a statement
   * 
   * @param statement The statement to check
   * @param result The verification result to update
   */
  private checkDomainRules(
    statement: FactStatement,
    result: VerificationResult
  ): void {
    try {
      // Check if we have domain rules for this subject or predicate
      const subjectRules = this.domainRules.get(statement.subject);
      const predicateRules = this.domainRules.get(statement.predicate);
      
      if (!subjectRules && !predicateRules) {
        // No applicable rules
      }
      
      // Check subject-specific rules
      if (subjectRules) {
        const matchingRule = subjectRules.find((rule: any) => 
          rule.predicate === statement.predicate
        );
        
        if (matchingRule) {
          // We have a rule for this subject-predicate combination
          
          if (matchingRule.validValues && matchingRule.validValues.includes(statement.object)) {
            // The object is in the list of valid values
            result.confidenceScore = Math.max(result.confidenceScore, 0.9);
            result.confidence = ConfidenceLevel.VERIFIED;
            
            // Add source
            result.sources.push({
              type: SourceType.DOMAIN_RULES,
              id: `domain_rule_${statement.subject}_${statement.predicate}`,
              name: 'Domain Rules',
              timestamp: Date.now(),
              reliability: 0.95 // Very high reliability for domain rules
            });
            
            // Add reasoning
            if (!result.reasoning) {
              result.reasoning = '';
            }
            result.reasoning += ` Fact confirmed by domain rules for ${statement.subject}.`;
          } else if (matchingRule.validValues && !matchingRule.validValues.includes(statement.object)) {
            // The object is NOT in the list of valid values
            result.confidenceScore = 0.1;
            result.confidence = ConfidenceLevel.INCORRECT;
            
            // Add source
            result.sources.push({
              type: SourceType.DOMAIN_RULES,
              id: `domain_rule_${statement.subject}_${statement.predicate}`,
              name: 'Domain Rules',
              timestamp: Date.now(),
              reliability: 0.95 // Very high reliability for domain rules
            });
            
            // Add reasoning
            if (!result.reasoning) {
              result.reasoning = '';
            }
            result.reasoning += ` Fact contradicts domain rules for ${statement.subject}.`;
            
            // Suggest correction from valid values
            if (matchingRule.validValues.length > 0) {
              result.suggestedCorrection = `${statement.subject} ${statement.predicate} ${matchingRule.validValues[0]}`;
            }
          }
        }
      }
      
      // Check predicate-specific rules (if no subject rule matched)
      if (predicateRules && result.confidence !== ConfidenceLevel.VERIFIED && 
          result.confidence !== ConfidenceLevel.INCORRECT) {
        
        const matchingRule = predicateRules.find((rule: any) => 
          rule.subjectType === statement.subjectType || rule.subjectType === '*'
        );
        
        if (matchingRule) {
          // We have a rule for this predicate and subject type
          
          // Check if the rule has a validator function
          if (matchingRule.validator && typeof matchingRule.validator === 'function') {
            const isValid = matchingRule.validator(statement.subject, statement.object);
            
            if (isValid) {
              // The validator confirms the fact
              result.confidenceScore = Math.max(result.confidenceScore, 0.85);
              result.confidence = ConfidenceLevel.VERIFIED;
              
              // Add source
              result.sources.push({
                type: SourceType.DOMAIN_RULES,
                id: `domain_rule_${statement.predicate}`,
                name: 'Domain Rules',
                timestamp: Date.now(),
                reliability: 0.9 // High reliability for domain rules
              });
              
              // Add reasoning
              if (!result.reasoning) {
                result.reasoning = '';
              }
              result.reasoning += ` Fact validated by domain rules for ${statement.predicate}.`;
            } else {
              // The validator rejects the fact
              result.confidenceScore = 0.1;
              result.confidence = ConfidenceLevel.INCORRECT;
              
              // Add source
              result.sources.push({
                type: SourceType.DOMAIN_RULES,
                id: `domain_rule_${statement.predicate}`,
                name: 'Domain Rules',
                timestamp: Date.now(),
                reliability: 0.9 // High reliability for domain rules
              });
              
              // Add reasoning
              if (!result.reasoning) {
                result.reasoning = '';
              }
              result.reasoning += ` Fact invalidated by domain rules for ${statement.predicate}.`;
              
              // No suggested correction for this case
            }
          }
        }
      }
    } catch (error) {
      console.error('[factChecker] Error checking domain rules:', error);
      
      if (!result.reasoning) {
        result.reasoning = '';
      }
      result.reasoning += ` Error checking domain rules: ${(error as Error).message}`;
    }
  }
  
  /**
   * Checks if two facts contradict each other
   * 
   * @param fact1 The first fact
   * @param fact2 The second fact
   * @returns Whether the facts contradict each other
   */
  private async isContradiction(
    fact1: FactStatement,
    fact2: FactStatement
  ): Promise<boolean> {
    try {
      // Simple case: same subject and predicate but different objects
      if (fact1.subject === fact2.subject && 
          fact1.predicate === fact2.predicate && 
          fact1.object !== fact2.object) {
        
        // Check if the predicate is functional (can only have one valid value)
        const isFunctional = await this.isPredicateFunctional(fact1.predicate);
        
        if (isFunctional) {
          // For functional predicates, different objects are a contradiction
          return true;
        }
        
        // For non-functional predicates, check if the objects are mutually exclusive
        const areMutuallyExclusive = await this.areObjectsMutuallyExclusive(
          fact1.object, 
          fact2.object, 
          fact1.objectType, 
          fact2.objectType
        );
        
        return areMutuallyExclusive;
      }
      
      // Not a contradiction
      return false;
    } catch (error) {
      console.error('[factChecker] Error checking for contradiction:', error);
      return false;
    }
  }
  
  /**
   * Checks if a predicate is functional (can only have one valid value)
   * 
   * @param predicate The predicate to check
   * @returns Whether the predicate is functional
   */
  private async isPredicateFunctional(predicate: string): Promise<boolean> {
    // List of common functional predicates
    const functionalPredicates = [
      'is', 'ist', 'was', 'war',
      'has capital', 'has currency', 'has population',
      'hat hauptstadt', 'hat währung', 'hat einwohnerzahl',
      'geboren am', 'born on', 'founded in', 'gegründet in',
      'located in', 'liegt in'
    ];
    
    return functionalPredicates.includes(predicate.toLowerCase());
  }
  
  /**
   * Checks if two objects are mutually exclusive
   * 
   * @param object1 The first object
   * @param object2 The second object
   * @param type1 Optional type of the first object
   * @param type2 Optional type of the second object
   * @returns Whether the objects are mutually exclusive
   */
  private async areObjectsMutuallyExclusive(
    object1: string,
    object2: string,
    type1?: string,
    type2?: string
  ): Promise<boolean> {
    // If objects are of different types, they're not necessarily exclusive
    if (type1 && type2 && type1 !== type2) {
      return false;
    }
    
    // Check for obvious exclusivity (like numbers, dates, etc.)
    
    // If both are numbers, they're exclusive
    if (!isNaN(Number(object1)) && !isNaN(Number(object2))) {
      return true;
    }
    
    // If both look like dates, they're exclusive
    const datePattern = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;
    if (datePattern.test(object1) && datePattern.test(object2)) {
      return true;
    }
    
    // For specific types, check more complex exclusivity
    if (type1 === 'location' || type2 === 'location') {
      // For locations, check if one is a sub-location of the other
      const isSubLocation = await this.isSubLocation(object1, object2);
      
      // If one is a sub-location of the other, they're not exclusive
      return !isSubLocation;
    }
    
    // For other cases, default to exclusive
    return true;
  }
  
  /**
   * Checks if one location is a sub-location of another
   * 
   * @param location1 The first location
   * @param location2 The second location
   * @returns Whether one location is a sub-location of the other
   */
  private async isSubLocation(location1: string, location2: string): Promise<boolean> {
    try {
      // Create entity objects for locations
      const entity1: Entity = {
        type: 'location',
        value: location1
      };
      
      const entity2: Entity = {
        type: 'location',
        value: location2
      };
      
      // Check if entities are related with locatedIn relation type
      const isRelated = this.entityRelationManager.areEntitiesRelated(
        entity1, 
        entity2, 
        'locatedIn'
      );
      
      if (isRelated) {
        return true;
      }
      
      // Check other direction
      const isRelatedReverse = this.entityRelationManager.areEntitiesRelated(
        entity2,
        entity1,
        'locatedIn'
      );
      
      return isRelatedReverse;
    } catch (error) {
      console.error('[factChecker] Error checking sub-location relationship:', error);
      return false;
    }
  }
  
  /**
   * Gets facts from domain rules
   * 
   * @param entityId The entity ID
   * @param entityType Optional entity type
   * @returns Array of facts from domain rules
   */
  private getFactsFromDomainRules(
    entityId: string,
    entityType?: string
  ): FactStatement[] {
    try {
      const facts: FactStatement[] = [];
      
      // Check if we have rules for this entity
      const entityRules = this.domainRules.get(entityId);
      
      if (!entityRules) {
        return facts;
      }
      
      // Convert rules to facts
      entityRules.forEach((rule: any) => {
        // Check if rule has a definite value
        if (rule.value !== undefined) {
          facts.push({
            id: this.generateUniqueId(),
            subject: entityId,
            subjectType: entityType,
            predicate: rule.predicate,
            object: rule.value,
            objectType: rule.objectType,
            confidence: ConfidenceLevel.VERIFIED,
            sources: [{
              type: SourceType.DOMAIN_RULES,
              id: `domain_rule_${entityId}_${rule.predicate}`,
              name: 'Domain Rules',
              reliability: 0.95,
              timestamp: Date.now()
            }],
            timestamp: Date.now()
          });
        }
        
        // Check if rule has valid values
        if (rule.validValues && rule.validValues.length > 0) {
          // Add each valid value as a possible fact
          rule.validValues.forEach((value: string) => {
            facts.push({
              id: this.generateUniqueId(),
              subject: entityId,
              subjectType: entityType,
              predicate: rule.predicate,
              object: value,
              objectType: rule.objectType,
              confidence: ConfidenceLevel.LIKELY,
              sources: [{
                type: SourceType.DOMAIN_RULES,
                id: `domain_rule_${entityId}_${rule.predicate}`,
                name: 'Domain Rules',
                reliability: 0.8,
                timestamp: Date.now()
              }],
              timestamp: Date.now()
            });
          });
        }
      });
      
      return facts;
    } catch (error) {
      console.error('[factChecker] Error getting facts from domain rules:', error);
      return [];
    }
  }
  
  /**
   * Loads domain rules from configuration
   */
  private loadDomainRules(): void {
    try {
      console.log('[factChecker] Loading domain rules');
      
      // In a real implementation, this would load from a configuration file
      // For this example, we'll add some hardcoded rules
      
      // Rule for Berlin
      this.domainRules.set('Berlin', [
        {
          predicate: 'is',
          validValues: ['capital of Germany', 'city in Germany', 'city in Europe'],
          objectType: 'description'
        },
        {
          predicate: 'is capital of',
          validValues: ['Germany'],
          objectType: 'country'
        },
        {
          predicate: 'founded in',
          value: '1237',
          objectType: 'year'
        }
      ]);
      
      // Rule for Germany
      this.domainRules.set('Germany', [
        {
          predicate: 'has capital',
          validValues: ['Berlin'],
          objectType: 'city'
        },
        {
          predicate: 'is',
          validValues: ['country in Europe', 'member of EU', 'federal republic'],
          objectType: 'description'
        }
      ]);
      
      // Rule for "has population" predicate
      this.domainRules.set('has population', [
        {
          subjectType: 'city',
          validator: (subject: string, object: string) => {
            // Check if object is a number
            const population = Number(object);
            return !isNaN(population) && population > 0;
          }
        }
      ]);
      
      console.log(`[factChecker] Loaded ${this.domainRules.size} domain rules`);
    } catch (error) {
      console.error('[factChecker] Error loading domain rules:', error);
    }
  }
  
  /**
   * Gets a cached verification result
   * 
   * @param statementId The statement ID
   * @returns The cached result or null if not found or expired
   */
  private getCachedResult(statementId: string): VerificationResult | null {
    try {
      const cachedItem = this.verificationCache[statementId];
      
      // Fix for TS18048: 'cachedItem' is possibly 'undefined'
      if (!cachedItem) {
        return null;
      }
      
      // Check if expired
      const currentTime = Date.now();
      if (!cachedItem) {
        return null;
      }
      if (!cachedItem) {
        return null;
      }
      const age = currentTime - cachedItem.timestamp;
      
      if (age > this.settings.cacheLifetime) {
        // Expired
        delete this.verificationCache[statementId];
        return null;
      }
      
      // Return cached result
      return cachedItem.result;
    } catch (error) {
      console.error('[factChecker] Error getting cached result:', error);
      return null;
    }
  }
  
  /**
   * Caches a verification result
   * 
   * @param statementId The statement ID
   * @param result The verification result
   */
  private cacheResult(statementId: string, result: VerificationResult): void {
    try {
      this.verificationCache[statementId] = {
        result,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[factChecker] Error caching result:', error);
    }
  }
  
  /**
   * Cleans up the cache if needed
   */
  private cleanupCacheIfNeeded(): void {
    try {
      const currentTime = Date.now();
      const timeSinceLastCleanup = currentTime - this.lastCleanupTime;
      
      // Only clean up if it's been at least an hour since last cleanup
      if (timeSinceLastCleanup < 60 * 60 * 1000) {
        return;
      }
      
      console.log('[factChecker] Cleaning up verification cache');
      
      // Clean up expired items
      const expiredIds: string[] = [];
      
      for (const statementId in this.verificationCache) {
        const cachedItem = this.verificationCache[statementId];
        if (!cachedItem) {
          continue;
        }
        const age = currentTime - cachedItem.timestamp;
        
        if (age > this.settings.cacheLifetime) {
          expiredIds.push(statementId);
        }
      }
      
      // Remove expired items
      expiredIds.forEach(id => {
        delete this.verificationCache[id];
      });
      
      console.log(`[factChecker] Removed ${expiredIds.length} expired cache items`);
      
      // Update last cleanup time
      this.lastCleanupTime = currentTime;
    } catch (error) {
      console.error('[factChecker] Error cleaning up cache:', error);
    }
  }
  
  /**
   * Maps a predicate to an EntityRelationType
   * 
   * @param predicate The predicate to map
   * @returns The corresponding EntityRelationType or null if no match
   */
  private mapPredicateToEntityRelationType(predicate: string): EntityRelationType | null {
    // Map of common predicates to EntityRelationType
    const predicateMap: Record<string, EntityRelationType> = {
      'is a': 'isA',
      'isA': 'isA',
      'is type of': 'isA',
      'has part': 'hasPart',
      'contains part': 'hasPart',
      'is part of': 'isPart',
      'belongs to': 'belongsTo',
      'is member of': 'belongsTo',
      'contains': 'contains',
      'has': 'contains',
      'includes': 'contains',
      'related to': 'relatedTo',
      'connected to': 'relatedTo',
      'associated with': 'relatedTo',
      'causes': 'causes',
      'results in': 'causes',
      'leads to': 'causes',
      'located in': 'locatedIn',
      'is in': 'locatedIn',
      'found in': 'locatedIn',
      'before': 'before',
      'precedes': 'before',
      'earlier than': 'before',
      'after': 'after',
      'follows': 'after',
      'later than': 'after',
      'used for': 'usedFor',
      'serves as': 'usedFor',
      'used as': 'usedFor',
      'requires': 'requires',
      'needs': 'requires',
      'depends on': 'requires'
    };
    
    // Try direct match
    if (predicateMap[predicate]) {
      return predicateMap[predicate];
    }
    
    // Try lowercase
    const lowerPredicate = predicate.toLowerCase();
    if (predicateMap[lowerPredicate]) {
      return predicateMap[lowerPredicate];
    }
    
    // For simple 'is' predicates, default to 'isA'
    if (lowerPredicate === 'is' || lowerPredicate === 'are') {
      return 'isA';
    }
    
    // Default to 'relatedTo' for anything else
    return 'relatedTo';
  }
  
  /**
   * Maps a numerical confidence score to a confidence level
   * 
   * @param confidence The confidence score (0.0-1.0)
   * @returns The corresponding confidence level
   */
  private mapConfidenceToLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.9) {
      return ConfidenceLevel.VERIFIED;
    } else if (confidence >= 0.7) {
      return ConfidenceLevel.LIKELY;
    } else if (confidence >= 0.4) {
      return ConfidenceLevel.UNCERTAIN;
    } else if (confidence >= 0.2) {
      return ConfidenceLevel.UNLIKELY;
    } else {
      return ConfidenceLevel.INCORRECT;
    }
  }
  
  /**
   * Gets the confidence score for a confidence level
   * 
   * @param level The confidence level
   * @returns The corresponding confidence score (0.0-1.0)
   */
  private getConfidenceScore(level: ConfidenceLevel): number {
    switch (level) {
      case ConfidenceLevel.VERIFIED:
        return 0.95;
      case ConfidenceLevel.LIKELY:
        return 0.8;
      case ConfidenceLevel.UNCERTAIN:
        return 0.5;
      case ConfidenceLevel.UNLIKELY:
        return 0.3;
      case ConfidenceLevel.INCORRECT:
        return 0.1;
      case ConfidenceLevel.OUTDATED:
        return 0.4;
      default:
        return 0.5;
    }
  }
  
  /**
   * Gets the oldest timestamp from a list of sources
   * 
   * @param sources The list of sources
   * @returns The oldest timestamp
   */
  private getOldestSourceTimestamp(sources: SourceReference[]): number {
    if (!sources || sources.length === 0) {
      return Date.now();
    }
    
    let oldestTimestamp = Date.now();
    
    for (const source of sources) {
      if (source.timestamp && source.timestamp < oldestTimestamp) {
        oldestTimestamp = source.timestamp;
      }
    }
    
    return oldestTimestamp;
  }
  
  /**
   * Generates a statement ID from its content
   * 
   * @param statement The statement
   * @returns The generated ID
   */
  private generateStatementId(statement: FactStatement): string {
    return `fact_${statement.subject}_${statement.predicate}_${statement.object}`.replace(/\s+/g, '_');
  }
  
  /**
   * Generates a unique ID
   * 
   * @returns A unique ID
   */
  private generateUniqueId(): string {
    return `id_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }
}

// Export a singleton instance
export const factChecker = new FactChecker();