// src/features/reasoning/inferenceEngine.ts
// This file implements the inference engine for logical reasoning

// TS1484: Add 'type' keyword for imports that are only used as types
import { type Entity, type Context, type Intent } from '@/types/nlp.types'; // Removed NLPProcessingResult as it's not used here
// TS2614: Import RelationSearchResult as a named export. Assumes it's exported in entityRelationManager.ts
import { EntityRelationManager, type EntityRelationType, type RelationSearchResult } from './entityRelationManager';
import { KnowledgeGraph } from './knowledgeGraph'; // Import the KnowledgeGraph class
import { FactChecker } from './factChecker'; // Import the FactChecker class
import { getErrorMessage, truncateText, removeDuplicates } from '@/lib/utils'; // Import necessary utils

/**
 * Types of inference that can be performed
 */
export type InferenceType =
  | 'deductive'  // Applies logical rules to derive conclusions (certain)
  | 'inductive'  // Generalizes from specific observations (probabilistic)
  | 'abductive'  // Infers most likely explanation (hypothesis)
  | 'analogical' // Reason by analogy or similarity
  | 'default'    // Assumes common defaults (negation as failure)
  | 'causal';    // Reasons about cause-effect relationships

/**
 * Represents a logical fact
 */
export interface Fact {
  /** Subject of the fact */
  subject: string;
  /** Predicate or relation */
  predicate: string;
  /** Object of the fact */
  object: string;
  /** Confidence in the fact (0.0 to 1.0) */
  confidence: number;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Represents a logical rule for inference
 */
export interface InferenceRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Conditions that must be met for the rule to apply */
  conditions: string[]; // Array of strings like "?X isA ?Y"
  /** Conclusions that can be drawn if conditions are met */
  conclusions: string[]; // Array of strings like "?X hasProperty ?P"
  /** Type of inference this rule supports */
  inferenceType: InferenceType;
  /** Confidence modifier for conclusions (0.0 to 1.0) */
  confidenceModifier: number;
  /** Optional explanation template */
  explanationTemplate?: string; // Optional
  /** Domain or category this rule applies to */
  domain?: string[]; // Optional, array of strings
  /** Whether this rule is enabled */
  enabled: boolean;
}

/**
 * Inference result object
 */
export interface InferenceResult {
  /** Inferred facts */
  facts: Fact[]; // Array can be empty
  /** Confidence in the inference (0.0 to 1.0) */
  confidence: number;
  /** Explanation of how the inference was made */
  explanation: string;
  /** Type of inference used */
  inferenceType: InferenceType;
  /** Rules applied to reach this conclusion */
  rulesApplied: string[]; // Array can be empty
  /** Original facts and entities used to make the inference */
  sourceData: {
    facts: Fact[]; // Array can be empty
    entities: Entity[]; // Array can be empty
  };
}

/**
 * Options for inference operations
 */
export interface InferenceOptions {
  /** Minimum confidence threshold for accepting inferences */
  minConfidence?: number; // Optional
  /** Types of inference to use */
  inferenceTypes?: InferenceType[]; // Optional, array can be empty
  /** Maximum inference depth (recursive inference) */
  maxDepth?: number; // Optional
  /** Whether to include explanations */
  includeExplanations?: boolean; // Optional
  /** Specific domains to include in reasoning */
  domains?: string[]; // Optional, array can be empty
  /** Maximum number of results to return */
  maxResults?: number; // Optional
  /** Context from the conversation */
  context?: Context; // Optional
  /** Current intent */
  intent?: Intent; // Optional - though context usually contains intent
}

/**
 * Interface for variable bindings with special properties
 * Using a mapped type might be cleaner if TypeScript improves index signature exclusion.
 * For now, keep explicit special properties and a broad index signature.
 */
export interface VariableBindings {
  // Index signature allows any string key, including variable names like '?X'
  // Values can be strings (bound entity/value), numbers (e.g., quantities), string arrays (e.g., list of features), booleans.
  // Add boolean as values can be booleans for boolean facts/properties.
  [key: string]: string | number | string[] | boolean | undefined; // Allow undefined as intermediate state

  // Special properties - these are expected to be present in valid binding objects
  __confidence: number;  // Confidence score of the binding combination
  __usedFacts: string[]; // List of fact keys that were used to establish this binding
}

/**
 * InferenceEngine handles logical reasoning and deductions based on facts and rules.
 * It works with entity relations, knowledge graphs, and fact-checking to derive
 * new knowledge and answer complex questions.
 */
export class InferenceEngine {
  private static instance: InferenceEngine;
  private rules: InferenceRule[] = [];
  private facts: Map<string, Fact> = new Map(); // Store facts by unique key
  private entityRelationManager: EntityRelationManager;
  private knowledgeGraph: KnowledgeGraph | null = null;
  private factChecker: FactChecker | null = null;

  // Default inference options
  private defaultOptions: InferenceOptions = {
    minConfidence: 0.6,
    inferenceTypes: ['deductive', 'inductive', 'default'],
    maxDepth: 3,
    includeExplanations: true,
    maxResults: 10
  };

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Get instance of EntityRelationManager
    this.entityRelationManager = EntityRelationManager.getInstance(); // Assume this is always available

    // Load default rules
    this.loadDefaultRules();

    console.log(`[InferenceEngine] Initialized with ${this.rules.length} rules`);
  }

  /**
   * Get the singleton instance of the InferenceEngine
   */
  public static getInstance(): InferenceEngine {
    if (!InferenceEngine.instance) {
      InferenceEngine.instance = new InferenceEngine();
    }
    return InferenceEngine.instance;
  }

  /**
   * Sets the KnowledgeGraph instance
   */
  public setKnowledgeGraph(knowledgeGraph: KnowledgeGraph): void {
    this.knowledgeGraph = knowledgeGraph;
    console.log('[InferenceEngine] KnowledgeGraph connected');
  }

  /**
   * Sets the FactChecker instance
   */
  public setFactChecker(factChecker: FactChecker): void {
    this.factChecker = factChecker;
    console.log('[InferenceEngine] FactChecker connected');
  }

  /**
   * Adds a fact to the inference engine
   *
   * @param fact The fact to add
   * @returns Boolean indicating success
   */
  public addFact(fact: Fact): boolean {
    try {
      // Ensure fact properties are valid strings before creating key and storing
      if (!fact || typeof fact !== 'object' || typeof fact.subject !== 'string' || fact.subject.length === 0 || typeof fact.predicate !== 'string' || fact.predicate.length === 0 || typeof fact.object !== 'string' || fact.object.length === 0 || typeof fact.confidence !== 'number') { // Added non-empty string checks
          console.warn('[InferenceEngine] Skipping invalid fact:', fact);
          return false;
      }
      // Ensure confidence is within bounds
      fact.confidence = Math.max(0.0, Math.min(1.0, fact.confidence));

      const factKey = this.createFactKey(fact);

      // Check if the fact already exists
      const existingFact = this.facts.get(factKey);
      if (existingFact) {
        // Update with higher confidence version
        if (fact.confidence > existingFact.confidence) {
          this.facts.set(factKey, { ...fact });
          // console.log(`[InferenceEngine] Updated fact: ${factKey} with confidence ${fact.confidence}`);
        } else {
           // console.log(`[InferenceEngine] Fact already exists with higher or equal confidence: ${factKey}`);
        }
      } else {
        // Add new fact
        this.facts.set(factKey, { ...fact });
        // console.log(`[InferenceEngine] Added new fact: ${factKey} with confidence ${fact.confidence}`);
      }

      return true;
    } catch (error) {
      console.error('[InferenceEngine] Error adding fact:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Adds multiple facts to the inference engine
   *
   * @param facts Array of facts to add
   * @returns Number of facts successfully added
   */
  public addFacts(facts: Fact[]): number {
    if (!Array.isArray(facts)) { // Basic check
        console.warn('[InferenceEngine] addFacts received non-array input');
        return 0;
    }
    let successCount = 0;

    for (const fact of facts) {
      if (this.addFact(fact)) {
        successCount++;
      }
    }
    // console.log(`[InferenceEngine] Successfully added ${successCount} out of ${facts.length} facts.`);
    return successCount;
  }

  /**
   * Adds a new inference rule
   *
   * @param rule The rule to add
   * @returns Boolean indicating success
   */
  public addRule(rule: InferenceRule): boolean {
    try {
      // Basic rule validation
      if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string' || rule.id.length === 0 || !Array.isArray(rule.conditions) || rule.conditions.length === 0 || !Array.isArray(rule.conclusions) || rule.conclusions.length === 0 || typeof rule.enabled !== 'boolean' || typeof rule.confidenceModifier !== 'number' || rule.confidenceModifier < 0 || rule.confidenceModifier > 1) {
          console.warn('[InferenceEngine] Skipping invalid rule (missing id, conditions, conclusions, enabled, or confidenceModifier):', rule);
          return false;
      }

      // Check if rule with this ID already exists
      const existingIndex = this.rules.findIndex(r => r.id === rule.id);

      if (existingIndex >= 0) {
        // Replace existing rule
        this.rules[existingIndex] = { ...rule };
        console.log(`[InferenceEngine] Updated rule: ${rule.id}`);
      } else {
        // Add new rule
        this.rules.push({ ...rule });
        console.log(`[InferenceEngine] Added new rule: ${rule.id}`);
      }

      return true;
    } catch (error) {
      console.error('[InferenceEngine] Error adding rule:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Converts entities to facts
   *
   * @param entities Array of entities to convert
   * @returns Array of facts derived from entities
   */
  public createFactsFromEntities(entities: Entity[]): Fact[] {
    const facts: Fact[] = [];

     if (!Array.isArray(entities)) { // Basic check
         console.warn('[InferenceEngine] createFactsFromEntities received non-array input');
         return [];
     }

    // Process each entity
    for (const entity of entities) {
      // Ensure entity has required properties
      if (!entity || typeof entity !== 'object' || typeof entity.type !== 'string' || entity.type.length === 0 || typeof entity.value !== 'string' || entity.value.length === 0) {
          console.warn('[InferenceEngine] Skipping invalid entity:', entity);
          continue;
      }

      // Basic fact about entity existence
      facts.push({
        subject: entity.type,
        predicate: 'hasInstance',
        object: entity.value,
        confidence: entity.confidence ?? 0.8 // Use nullish coalescing for optional confidence
      });

      // If entity has metadata, create facts from that
      if (entity.metadata && typeof entity.metadata === 'object') { // Check if metadata is a valid object
        for (const [key, value] of Object.entries(entity.metadata)) {
          // Only create facts for primitive values and ensure key is string
           if (typeof key === 'string' && key.length > 0 && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
            facts.push({
              subject: entity.value,
              predicate: key,
              object: String(value), // Ensure object is string
              confidence: (entity.confidence ?? 0.7) * 0.9, // Confidence slightly lower than entity confidence
              metadata: {
                fromEntityMetadata: true,
                entityType: entity.type
              }
            });
          }
        }
      }
    }

    // Use EntityRelationManager to find relationships between entities
    // Check if there are at least 2 entities and EntityRelationManager is available
    if (entities.length > 1 && this.entityRelationManager) {
       try { // Added try/catch around relation manager usage
          for (let i = 0; i < entities.length; i++) {
            for (let j = i + 1; j < entities.length; j++) {
              const entityA = entities[i]; // These should be defined due to loop bounds
              const entityB = entities[j]; // These should be defined due to loop bounds

               // Added defensive check, though loop bounds usually guarantee this
               if (!entityA || typeof entityA !== 'object' || typeof entityA.type !== 'string' || typeof entityA.value !== 'string' ||
                   !entityB || typeof entityB !== 'object' || typeof entityB.type !== 'string' || typeof entityB.value !== 'string') { // Added type checks for entityA/B
                   console.warn('[InferenceEngine] Unexpected undefined or invalid entity in loop (should not happen).');
                   continue;
               }

              // Check if these entities are related using the manager
              // Assuming areEntitiesRelated correctly handles Entity types
              if (this.entityRelationManager.areEntitiesRelated(entityA, entityB)) { // Potential TS2345 error location in original code
                // Find all relations between these entities using the manager
                // Assuming findRelations correctly handles Entity types and returns RelationSearchResult[]
                const relations = this.entityRelationManager.findRelations(entityA); // Potential TS2345 error location in original code

                // Filter to only relations with entityB
                const relevantRelations = relations.filter(
                  // Ensure relation result and targetEntity are valid objects
                  r => r?.targetEntity &&
                       // Ensure targetEntity properties are strings before comparison
                       typeof r.targetEntity.type === 'string' && typeof r.targetEntity.value === 'string' &&
                       r.targetEntity.type === entityB.type &&
                       r.targetEntity.value === entityB.value
                );

                // Create facts from these relations
                for (const relation of relevantRelations) {
                  // Ensure relation, relation.relation and targetEntity are valid before creating fact
                   if (relation?.relation?.relationType &&
                       relation.targetEntity?.type && relation.targetEntity.value && // Already checked type/value are strings
                       typeof relation.confidence === 'number' && relation.confidence >= 0 && relation.confidence <= 1) { // Added checks
                        facts.push({
                          subject: entityA.value, // entityA is validated by outer loop
                          predicate: relation.relation.relationType,
                          object: relation.targetEntity.value, // Use validated target value
                          confidence: relation.confidence,
                          metadata: {
                            fromRelation: true,
                            sourceEntityType: entityA.type,
                            targetEntityType: entityB.type,
                            relationMetadata: relation.relation.metadata // Include relation metadata
                          }
                        });
                   } else {
                       console.warn('[InferenceEngine] Skipping invalid relation during fact creation:', relation);
                   }
                }
              }
            }
          }
       } catch (ermError) {
          console.error('[InferenceEngine] Error during EntityRelationManager processing in createFactsFromEntities:', getErrorMessage(ermError));
          // Continue, but fact creation from relations might be incomplete
       }
    }

    console.log(`[InferenceEngine] Created ${facts.length} facts from ${entities.length} entities.`);
    return facts;
  }

  /**
   * Performs inference based on known facts and rules
   *
   * @param query Optional query to focus the inference (e.g., a question)
   * @param entities Entities to consider in the reasoning
   * @param options Inference options
   * @returns Array of inference results
   */
  public async performInference(
    query: string = '',
    entities: Entity[] = [],
    options: InferenceOptions = {}
  ): Promise<InferenceResult[]> {
    try {
      console.log(`[InferenceEngine] Performing inference for query: "${truncateText(query, 80)}"`); // Use truncateText
      console.log(`[InferenceEngine] Entities considered: ${entities.map(e => `${e.type}:${e.value}`).join(', ')}`);


      // Merge with default options using nullish coalescing for deeper merge if needed
      const inferenceOptions: InferenceOptions = {
        ...this.defaultOptions,
        ...options,
        // Ensure arrays are merged properly
        inferenceTypes: options.inferenceTypes ?? this.defaultOptions.inferenceTypes,
        domains: options.domains ?? this.defaultOptions.domains,
      };
       // Ensure numeric options have default fallbacks
       inferenceOptions.minConfidence = inferenceOptions.minConfidence ?? this.defaultOptions.minConfidence ?? 0.6; // Add fallback for defaultOptions too
       inferenceOptions.maxDepth = inferenceOptions.maxDepth ?? this.defaultOptions.maxDepth ?? 3;
       inferenceOptions.maxResults = inferenceOptions.maxResults ?? this.defaultOptions.maxResults ?? 10;


      // Create facts from entities
      const entityFacts = this.createFactsFromEntities(entities);

      // Add these facts temporarily for this inference (do not modify permanent this.facts)
      // Create a set of fact keys from the main knowledge base for sourceData tracking
      //const initialFactKeys = new Set(this.facts.keys()); // Not used later, commented out
      const tempFacts = new Map(this.facts); // Start with permanent facts
      const newFactKeys = new Set<string>();

      for (const fact of entityFacts) {
        // Ensure fact is valid before adding
        if (fact && typeof fact === 'object' && typeof fact.subject === 'string' && typeof fact.predicate === 'string' && typeof fact.object === 'string' && typeof fact.confidence === 'number') {
             const factKey = this.createFactKey(fact);
             // Only add entity facts if not already present or higher confidence
             const existingFact = tempFacts.get(factKey);
             if (!existingFact || fact.confidence > existingFact.confidence) {
                tempFacts.set(factKey, fact);
                newFactKeys.add(factKey); // Track facts added from entities
             }
        } else {
            console.warn('[InferenceEngine] Skipping invalid entity fact during temporary add:', fact);
        }
      }

      const factSet = Array.from(tempFacts.values());
       console.log(`[InferenceEngine] Using a temporary fact set of ${factSet.length} facts (${newFactKeys.size} from entities).`);


      // Filter rules based on options
      const applicableRules = this.rules.filter(rule => {
        // Skip disabled rules
        if (!rule.enabled) return false;

        // Filter by inference type if specified and options.inferenceTypes is a valid array
        if (Array.isArray(inferenceOptions.inferenceTypes) && inferenceOptions.inferenceTypes.length > 0 &&
            !inferenceOptions.inferenceTypes.includes(rule.inferenceType)) {
          return false;
        }

        // Filter by domain if specified and both options.domains and rule.domain are valid arrays
        if (Array.isArray(inferenceOptions.domains) && inferenceOptions.domains.length > 0) {
           // Ensure rule.domain exists and is an array before proceeding
           if (!rule.domain || !Array.isArray(rule.domain)) {
               return false; // Rule has no domains, but options require domains
           }
           // Check for intersection
           const hasIntersection = rule.domain.some(domain =>
             typeof domain === 'string' && domain.length > 0 && inferenceOptions.domains!.includes(domain) // Ensure domain is string and non-empty
           );
           if (!hasIntersection) {
               return false; // No matching domain found
           }
        }

        return true;
      });

      console.log(`[InferenceEngine] Using ${applicableRules.length} applicable rules for inference.`);

      // Perform inference
      let inferenceResults: InferenceResult[] = [];

      // Apply each rule
      for (const rule of applicableRules) {
         try { // Added try/catch around rule application
            const ruleResults = this.applyRule(
              rule,
              factSet, // Use the temporary fact set including entity facts
              entities, // Pass original entities as source data
              query,
              inferenceOptions
            );
             // Add only valid rule results
            if (Array.isArray(ruleResults) && ruleResults.length > 0) {
              inferenceResults.push(...ruleResults.filter(res => res && typeof res === 'object' && typeof res.confidence === 'number' && res.confidence >= 0 && res.confidence <= 1 && Array.isArray(res.facts) && res.facts.length > 0));
            }
         } catch (ruleError) {
            console.error(`[InferenceEngine] Error applying rule ${rule?.id}:`, getErrorMessage(ruleError));
            // Continue with the next rule
         }
      }

      // If we have a knowledgeGraph, try to use it for additional inferences
      if (this.knowledgeGraph) {
        try { // Added inner try/catch for graph inference
            const graphInferences = await this.inferFromKnowledgeGraph( // Await the async call
              query,
              entities,
              inferenceOptions
            );
             // Add only valid graph inferences
            if (Array.isArray(graphInferences) && graphInferences.length > 0) {
                 inferenceResults.push(...graphInferences.filter(inf => inf && typeof inf === 'object' && typeof inf.confidence === 'number' && inf.confidence >= 0 && inf.confidence <= 1 && Array.isArray(inf.facts) && inf.facts.length > 0));
            }
             console.log(`[InferenceEngine] Added ${Array.isArray(graphInferences) ? graphInferences.length : 0} inferences from KnowledgeGraph.`);
        } catch (graphError) {
             console.error('[InferenceEngine] Error during KnowledgeGraph inference:', getErrorMessage(graphError));
        }
      }

      // Sort by confidence and limit results
      // Ensure inferenceResults is a valid array before sorting/filtering
      if (!Array.isArray(inferenceResults)) {
          console.warn('[InferenceEngine] inferenceResults is not an array after processing, returning empty.');
          return [];
      }

      inferenceResults.sort((a, b) => b.confidence - a.confidence);

      // Use the correctly resolved minConfidence from options or defaults
      const minConf = inferenceOptions.minConfidence; // Already resolved above
      const filteredResults = inferenceResults.filter(
        // Ensure result and confidence are valid before comparison
        result => result && typeof result.confidence === 'number' && result.confidence >= (minConf ?? 0.6) // Use ?? 0.6 as final fallback
      );

      // Use the correctly resolved maxResults from options or defaults
      const maxRes = inferenceOptions.maxResults; // Already resolved above
      const finalResults = filteredResults.slice(0, maxRes ?? 10); // Use ?? 10 as final fallback


      console.log(`[InferenceEngine] Generated ${finalResults.length} final inference results (out of ${inferenceResults.length} before filtering/sorting).`);
      return finalResults;
    } catch (error) {
      console.error('[InferenceEngine] Critical error performing inference:', getErrorMessage(error));
      return []; // Return empty array on critical error
    }
  }

  /**
   * Answers a question using inference and available knowledge
   *
   * @param question The question to answer
   * @param entities Entities mentioned in the question
   * @param context Conversation context
   * @returns The answer with explanation and confidence
   */
  public async answerQuestion( // Made async because performInference is async
    question: string,
    entities: Entity[],
    context?: Context
  ): Promise<{ answer: string, explanation: string, confidence: number }> { // Return type is Promise
    try {
      console.log(`[InferenceEngine] Attempting to answer question: "${truncateText(question, 80)}"`); // Use truncateText
      console.log(`[InferenceEngine] Entities: ${entities.map(e => `${e.type}:${e.value}`).join(', ')}`);

      // Default answer if we can't infer anything
      let answer = "I don't have enough information to answer that question.";
      let explanation = "No relevant facts or rules were found to answer the question.";
      let confidence = 0.0;

      // Extract domain from context or intent if available
      const domains: string[] = [];
      if (context?.topics && Array.isArray(context.topics)) { // Added Array check
        domains.push(...context.topics.filter(t => typeof t === 'string')); // Ensure topics are strings
      }
      // Add domain/category from intent if available and is string or string array
       // Safely access intent and its properties
      if (context?.intent) {
           if (typeof context.intent.category === 'string' && context.intent.category.length > 0) { // Assuming category might function as domain
               domains.push(context.intent.category);
           }
           // Assuming intent object itself might have a domain property (not in nlp.types.ts currently)
           const intentWithDomain = context.intent as any; // Use 'any' or update nlp.types.ts if domain is standard
            if (intentWithDomain.domain && typeof intentWithDomain.domain === 'string' && intentWithDomain.domain.length > 0) {
                domains.push(intentWithDomain.domain);
            } else if (Array.isArray(intentWithDomain.domain)) {
                domains.push(...intentWithDomain.domain.filter((d: unknown): d is string => typeof d === 'string' && d.length > 0)); // Use type predicate
            }
      }
       const uniqueDomains = Array.from(new Set(domains)); // Remove duplicate domains


      // Determine question type
      const questionType = this.analyzeQuestionType(question);
      console.log(`[InferenceEngine] Question type detected: ${questionType}`);

      // Set inference types based on question type
      const inferenceTypes: InferenceType[] =
        this.selectInferenceTypesForQuestion(questionType);

      // Perform inference (await the async call)
      const inferences = await this.performInference(question, entities, {
        inferenceTypes,
        domains: uniqueDomains.length > 0 ? uniqueDomains : undefined, // Pass only if non-empty
        includeExplanations: true,
        context, // Pass context to inference options
        maxResults: 5 // Limit inference results
      });

      // If we found any inferences, use the top one to generate an answer
      if (Array.isArray(inferences) && inferences.length > 0) {
        const topInference = inferences[0];

        // Check if topInference is defined and valid before using it
        if (topInference?.confidence !== undefined && Array.isArray(topInference.facts)) { // Added checks for topInference
             // Verify with fact checker if available
            let factCheckerConfidence = 1.0;
            if (this.factChecker && topInference.facts.length > 0) {
              try { // Added try/catch around fact checker
                 // Ensure checkFacts accepts and returns expected types
                const factCheckResult = this.factChecker.checkFacts(topInference.facts); // Assuming checkFacts exists and returns { confidence: number }
                 // Ensure factCheckResult is valid
                 if (factCheckResult?.confidence !== undefined) {
                     factCheckerConfidence = Math.max(0.0, Math.min(1.0, factCheckResult.confidence)); // Clamp confidence
                 } else {
                     console.warn('[InferenceEngine] Fact checker returned invalid result for top inference.');
                     factCheckerConfidence = 1.0; // Assume no red flags if checker errors
                 }
              } catch (fcError) {
                  console.error('[InferenceEngine] Error during FactChecker check:', getErrorMessage(fcError));
                  factCheckerConfidence = 1.0; // Assume no red flags if checker errors
              }

              // If fact checker strongly disagrees, we may need to reconsider
              // Use defaultOptions.minConfidence as reference
              const minConfThreshold = this.defaultOptions.minConfidence ?? 0.6;
              if (factCheckerConfidence < minConfThreshold * 0.5) { // Threshold for strong disagreement
                console.log('[InferenceEngine] Fact checker flagged potential misinformation with low confidence:', factCheckerConfidence);

                // Use a more cautious answer
                return {
                  answer: "I'm not fully confident about this information, but based on some facts I found...", // Adjusted wording
                  explanation: topInference.explanation || "Based on logical inference.", // Fallback explanation
                  confidence: Math.max(0.0, Math.min(1.0, topInference.confidence * factCheckerConfidence * 0.8)) // Reduced confidence slightly more and clamp
                };
              }
            }

            // Generate answer from the inference
            // Ensure generateAnswerFromInference accepts and handles optional string types if necessary
            answer = this.generateAnswerFromInference(
              topInference,
              questionType,
              question // Pass original question for context
            );

            explanation = topInference.explanation || "Based on logical inference."; // Fallback explanation
            confidence = topInference.confidence * factCheckerConfidence;

             // Ensure confidence is within valid range
             confidence = Math.max(0.0, Math.min(1.0, confidence));
             console.log(`[InferenceEngine] Generated answer from inference with confidence ${confidence}.`);

        } else {
            console.warn('[InferenceEngine] Top inference result is invalid or undefined.');
        }
      }

      // If still no sufficient answer from inference (confidence below threshold), try knowledge graph if available
      const minConfAnswer = this.defaultOptions.minConfidence ?? 0.6;
      if (confidence < minConfAnswer && this.knowledgeGraph) { // Only try graph if inference wasn't confident enough
        console.log('[InferenceEngine] No confident inference, trying KnowledgeGraph...');
        try { // Added inner try/catch for KG answer
            // Assuming knowledgeGraph.answerQuestion returns an object with optional answer, explanation, confidence
            const graphAnswerResult = await this.knowledgeGraph.answerQuestion(question, entities, context); // Await the async call

            // Check if graphAnswerResult is valid and confident enough
            if (graphAnswerResult && typeof graphAnswerResult === 'object' && (graphAnswerResult.confidence ?? 0) > confidence) { // Added checks and comparison
              // Use nullish coalescing for answer, explanation, confidence
              answer = graphAnswerResult.answer ?? `Based on knowledge graph information about ${entities.map(e => e.value).join(', ')}.`;
              explanation = graphAnswerResult.explanation ?? "Answer based on knowledge graph."; // Fallback
              confidence = graphAnswerResult.confidence ?? 0.7; // Fallback confidence
              // Ensure confidence is within valid range
              confidence = Math.max(0.0, Math.min(1.0, confidence));
              console.log(`[InferenceEngine] KnowledgeGraph provided answer with confidence ${confidence}.`);
            } else if (graphAnswerResult && (graphAnswerResult.confidence ?? 0) > 0 && typeof graphAnswerResult.explanation === 'string' && graphAnswerResult.explanation.length > 0 && confidence < 0.3) { // Only use explanation if confidence is very low
                 // If no direct answer but a confident explanation and no inference answer found yet, use that
                 answer = graphAnswerResult.explanation; // Use explanation as answer
                 explanation = graphAnswerResult.explanation; // Explanation is the answer
                 confidence = graphAnswerResult.confidence ?? 0.5; // Slightly lower fallback confidence
                 // Ensure confidence is within valid range
                 confidence = Math.max(0.0, Math.min(1.0, confidence));
                 console.log(`[InferenceEngine] KnowledgeGraph provided explanation as fallback answer with confidence ${confidence}.`);
            } else {
                console.log('[InferenceEngine] KnowledgeGraph provided no better or no valid answer/explanation.');
            }
        } catch (graphError) {
             console.error('[InferenceEngine] Error during KnowledgeGraph answering:', getErrorMessage(graphError));
             // Continue, maybe fallback to default "I don't know"
        }
      }

       // Final check on confidence before returning a specific answer
       if (confidence < minConfAnswer) {
           answer = "I don't have enough information to answer that question with high confidence."; // More specific fallback
           explanation = "Could not find sufficient evidence or rules to provide a confident answer.";
           confidence = Math.max(0.1, confidence); // Keep slightly higher confidence if KG provided something, but still low
           console.log(`[InferenceEngine] Final confidence ${confidence.toFixed(2)} is below threshold ${minConfAnswer}. Using fallback answer.`);
       } else {
            console.log(`[InferenceEngine] Final confidence ${confidence.toFixed(2)} is sufficient.`);
       }


      return { answer, explanation, confidence };
    } catch (error) {
      console.error('[InferenceEngine] Critical error answering question:', getErrorMessage(error));
      return {
        answer: "I encountered an internal error while trying to answer that question.",
        explanation: `An internal reasoning error occurred: ${getErrorMessage(error)}`, // Include error message in explanation
        confidence: 0.0
      };
    }
  }

  /**
   * Reasons about entity relationships using inference
   *
   * @param sourceEntity The source entity
   * @param targetEntity The target entity
   * @param options Inference options
   * @returns Explanation of the relationship
   */
  public async explainRelationship( // Made async because performInference is async
    sourceEntity: Entity,
    targetEntity: Entity,
    options: InferenceOptions = {}
  ): Promise<{ explanation: string, confidence: number, relationPath: string[] }> { // Return type is Promise
    try {
      // Default result
      let explanation = `I don't know how ${sourceEntity?.value ?? 'the first entity'} relates to ${targetEntity?.value ?? 'the second entity'}.`; // Use nullish coalescing for initial message
      let confidence = 0.0;
      let relationPath: string[] = []; // Declare relationPath outside the try block

       // Basic validation for entities
       if (!sourceEntity?.value || !targetEntity?.value) { // Simplified check for value presence
           console.warn('[InferenceEngine] Invalid entities provided for explainRelationship.');
           return { explanation: "Invalid entities provided.", confidence: 0.0, relationPath: [] };
       }

       // Check if entities are the same
        if (sourceEntity.type === targetEntity.type && sourceEntity.value === targetEntity.value) {
            return { explanation: `${sourceEntity.value} is the same entity as ${targetEntity.value}.`, confidence: 1.0, relationPath: [] };
        }


      // First check if there's a direct relationship using EntityRelationManager
      if (this.entityRelationManager) { // Added check
         try { // Added inner try/catch for EntityRelationManager
             // areEntitiesRelated takes Entity objects, which are validated above
             if (this.entityRelationManager.areEntitiesRelated(sourceEntity, targetEntity)) {
                // findRelations takes Entity object
                const relations = this.entityRelationManager.findRelations(
                  sourceEntity,
                  undefined, // No specific relation type filter initially
                  { bidirectional: true, maxResults: 10 } // Limit results from ERM
                );

                // Filter to relationships where the target is entityB
                const directRelations = relations.filter(r =>
                  r?.targetEntity?.type === targetEntity.type &&
                  r?.targetEntity?.value === targetEntity.value
                );

                if (directRelations.length > 0) {
                  // Sort by confidence (using nullish coalescing for safety)
                  directRelations.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
                  const topRelation = directRelations[0];

                  // Check if topRelation is defined and has required properties before using it
                  if (topRelation?.relation?.relationType && typeof topRelation.confidence === 'number') { // Added checks
                     // Generate explanation
                    explanation = this.relationTypeToExplanation(
                      sourceEntity.value,
                      topRelation.relation.relationType, // Accessing relationType
                      targetEntity.value
                    );

                    confidence = topRelation.confidence; // topRelation.confidence is guaranteed number by checks above
                    relationPath = [`${sourceEntity.value} ${topRelation.relation.relationType} ${targetEntity.value}`];

                    console.log('[InferenceEngine] Found direct relationship via EntityRelationManager.');
                    return { explanation, confidence, relationPath }; // Return early if a direct path is found
                  } else {
                      console.warn('[InferenceEngine] Found direct relations, but topRelation object is invalid:', topRelation);
                  }
                }
             }
         } catch (ermError) {
              console.error('[InferenceEngine] Error during EntityRelationManager check in explainRelationship:', getErrorMessage(ermError));
              // Continue to try inference
         }
      } else {
           console.log('[InferenceEngine] EntityRelationManager not available.');
      }


      // If no direct relationship found or insufficient confidence, try inference (await the async call)
      console.log('[InferenceEngine] No direct relationship found or insufficient confidence, trying inference...');
      const query = `How does ${sourceEntity.value} relate to ${targetEntity.value}?`;
      const inferences = await this.performInference( // Await the async call
        query,
        [sourceEntity, targetEntity], // Pass entities
        {
          ...options,
          inferenceTypes: options.inferenceTypes ?? ['deductive', 'inductive', 'analogical'], // Use default if not provided
          includeExplanations: options.includeExplanations ?? true, // Use default if not provided
          maxResults: options.maxResults ?? 3 // Limit inference results
        }
      );

      if (Array.isArray(inferences) && inferences.length > 0) {
        const topInference = inferences[0];

         // Check if topInference is defined and valid before using it
         if (topInference?.confidence !== undefined && typeof topInference.explanation === 'string' && Array.isArray(topInference.facts)) { // Added checks
            console.log('[InferenceEngine] Found inference result for relationship.');
             // Extract relationship path from inference
            const path = this.extractRelationshipPathFromInference(
              topInference,
              sourceEntity.value,
              targetEntity.value
            );

            if (Array.isArray(path) && path.length > 0) { // Check if path is valid array and non-empty
              relationPath = path;
              explanation = topInference.explanation; // explanation is guaranteed string
              confidence = topInference.confidence; // confidence is guaranteed number
              // Ensure confidence is within valid range
              confidence = Math.max(0.0, Math.min(1.0, confidence));
               console.log(`[InferenceEngine] Found path via inference with confidence ${confidence.toFixed(2)}.`);
               return { explanation, confidence, relationPath }; // Return early if a path is found via inference
            } else {
                 console.log('[InferenceEngine] Inference result found but could not extract a clear path.');
                 // Use the explanation even if path extraction failed, if confidence is high enough
                 if (topInference.confidence > (this.defaultOptions.minConfidence ?? 0.6)) {
                     explanation = topInference.explanation;
                     confidence = topInference.confidence;
                     relationPath = []; // No path extracted
                 }
            }
         } else {
             console.warn('[InferenceEngine] Top inference result is invalid or undefined.');
         }
      } else {
          console.log('[InferenceEngine] No inference results found for relationship.');
      }


      // If still no relationship found from inference (confidence below threshold), try knowledge graph if available
       const minConfExplain = this.defaultOptions.minConfidence ?? 0.6;
      if (confidence < minConfExplain && this.knowledgeGraph) { // Only try KG if confidence is low
        console.log('[InferenceEngine] No confident inference, trying KnowledgeGraph relationship...');
        try { // Added inner try/catch for KG explanation
            // Map intent to string if needed for GraphQueryOptions
            const graphQueryOptions = {
              ...options,
              intent: typeof options.intent === 'string'
                ? options.intent
                : (options.intent && typeof options.intent.category === 'string'
                    ? options.intent.category
                    : undefined)
            };
            // Assuming knowledgeGraph.explainRelationship returns an object with optional explanation, confidence, path
            const graphExplanationResult = await this.knowledgeGraph.explainRelationship( // Await the async call
              sourceEntity, // Pass validated entities
              targetEntity,
              graphQueryOptions // Pass mapped options to KG
            );

            // Check if graphExplanationResult is valid and confident enough
            if (graphExplanationResult && typeof graphExplanationResult === 'object' && (graphExplanationResult.confidence ?? 0) > confidence) { // Added checks and comparison
              // Use nullish coalescing for explanation, confidence, path
              explanation = graphExplanationResult.explanation ?? `Relationship found in knowledge graph between ${sourceEntity.value} and ${targetEntity.value}.`; // Use nullish coalescing
              confidence = graphExplanationResult.confidence ?? 0.7; // Use nullish coalescing as fallback
              relationPath = Array.isArray(graphExplanationResult.path) ? graphExplanationResult.path : []; // Ensure path is array, use fallback
               // Ensure confidence is within valid range
               confidence = Math.max(0.0, Math.min(1.0, confidence));
              console.log(`[InferenceEngine] KnowledgeGraph provided relationship explanation with confidence ${confidence.toFixed(2)}.`);
               return { explanation, confidence, relationPath }; // Return KG result
            } else if (graphExplanationResult && (graphExplanationResult.confidence ?? 0) > 0 && typeof graphExplanationResult.explanation === 'string' && graphExplanationResult.explanation.length > 0 && confidence < 0.3) { // Only use KG explanation if confidence is very low
                 // If KG found something but not better than current, maybe still use it if confidence is higher than 0 and no explanation found yet
                 explanation = graphExplanationResult.explanation ?? "Relationship found in knowledge graph.";
                 confidence = graphExplanationResult.confidence ?? 0.5;
                 relationPath = Array.isArray(graphExplanationResult.path) ? graphExplanationResult.path : [];
                 // Ensure confidence is within valid range
                 confidence = Math.max(0.0, Math.min(1.0, confidence));
                 console.log(`[InferenceEngine] KnowledgeGraph provided relationship explanation (lower confidence) with confidence ${confidence.toFixed(2)}.`);
                 return { explanation, confidence, relationPath }; // Return KG result
            } else {
                console.log('[InferenceEngine] KnowledgeGraph provided no better or no valid explanation.');
            }
        } catch (graphError) {
             console.error('[InferenceEngine] Error during KnowledgeGraph explainRelationship:', getErrorMessage(graphError));
             // Continue, maybe fallback to default "I don't know"
        }
      }

       // Final check on confidence before returning the default or found explanation
       if (confidence < minConfExplain) { // Re-check against the explanation threshold
           explanation = `I cannot confidently determine the relationship between ${sourceEntity.value} and ${targetEntity.value} based on my current knowledge.`; // More specific fallback
           confidence = Math.max(0.1, confidence); // Keep slightly higher confidence if KG provided something, but still low
           relationPath = []; // Ensure path is empty on low confidence
           console.log(`[InferenceEngine] Final confidence ${confidence.toFixed(2)} is below threshold ${minConfExplain}. Using fallback explanation.`);
       } else {
            console.log(`[InferenceEngine] Final confidence ${confidence.toFixed(2)} is sufficient.`);
       }


      return { explanation, confidence, relationPath };
    } catch (error) {
      console.error('[InferenceEngine] Critical error explaining relationship:', getErrorMessage(error));
      return {
        explanation: `I encountered an internal error while trying to explain this relationship: ${getErrorMessage(error)}`, // Include error message
        confidence: 0.0,
        relationPath: []
      };
    }
  }

  /**
   * Checks if an inference can be made from given facts
   *
   * @param facts Facts to check
   * @param query Optional query to focus the check
   * @returns Boolean indicating whether an inference can be made (asynchronously).
   */
  public async canInferFromFacts(facts: Fact[], query: string = ''): Promise<boolean> {
    try {
      if (!Array.isArray(facts)) { // Basic check
          console.warn('[InferenceEngine] canInferFromFacts received non-array input');
          return false;
      }

      // Try to perform inference with these facts
      const tempEntities: Entity[] = [];

      // Convert facts to entities for inference
      for (const fact of facts) {
        // Ensure fact is valid before creating entities
         if (fact?.subject && fact.predicate && fact.object) { // Added non-empty string checks
            // Create subject entity (minimal properties needed for inference)
             const subjectEntityType = this.extractEntityTypeFromFact(fact, 'subject') || 'unknown';
             if (subjectEntityType.length > 0) { // Ensure type is not empty string
                tempEntities.push({
                   type: subjectEntityType,
                   value: fact.subject,
                   confidence: fact.confidence ?? 0.5 // Fallback confidence
                });
             } else {
                 console.warn('[InferenceEngine] Skipping subject entity creation due to empty extracted type.');
             }


            // Create object entity (minimal properties needed for inference)
             const objectEntityType = this.extractEntityTypeFromFact(fact, 'object') || 'unknown';
             if (objectEntityType.length > 0) { // Ensure type is not empty string
                tempEntities.push({
                   type: objectEntityType,
                   value: fact.object,
                   confidence: fact.confidence ?? 0.5 // Fallback confidence
                });
             } else {
                  console.warn('[InferenceEngine] Skipping object entity creation due to empty extracted type.');
             }

         } else {
             console.warn('[InferenceEngine] Skipping invalid fact during entity conversion in canInferFromFacts:', fact);
         }
      }

       // Remove duplicate entities based on value and type
       // Use a robust removeDuplicates function and filter for valid entity structure afterwards
       const uniqueEntities = removeDuplicates(tempEntities, 'value').filter(e => e?.type && e.value); // Ensure results are valid Entities

       console.log(`[InferenceEngine] Converted ${facts.length} facts to ${uniqueEntities.length} unique entities for inference check.`);

      // Perform a limited inference (await the async call)
      const inferences = await this.performInference(query, uniqueEntities, { // Use uniqueEntities
        maxDepth: 1, // Limit depth for quick check
        maxResults: 1, // Only need one result to know if inference is possible
        includeExplanations: false, // Don't need explanations for this check
        minConfidence: 0.3 // Lower confidence threshold for just checking possibility
      });

      // If we got any inference results with some confidence, return true
      // Ensure inferences is an array and the first result is valid
      const canInfer = Array.isArray(inferences) && inferences.length > 0 && (inferences[0]?.confidence ?? 0) > 0;
      console.log(`[InferenceEngine] Can infer from facts: ${canInfer}`);
      return canInfer;

    } catch (error) {
      console.error('[InferenceEngine] Error checking inference capability:', getErrorMessage(error));
      return false; // Return false if a critical error occurs
    }
  }

  /**
   * Load default inference rules
   */
  private loadDefaultRules(): void {
    // Common sense reasoning rules
    // Ensure each rule is valid before adding
    const defaultRules: InferenceRule[] = [
      // Transitivity rule for "isA" relationships
      {
        id: 'transitivity_isa',
        name: 'Transitivity of IsA Relationship',
        conditions: [
          '?X isA ?Y',
          '?Y isA ?Z'
        ],
        conclusions: [
          '?X isA ?Z'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.9,
        explanationTemplate: 'If {0} is a {1}, and {1} is a {2}, then {0} is a {2}.',
        domain: ['general', 'taxonomy'],
        enabled: true
      },

      // Transitivity rule for "hasPart" relationships
      {
        id: 'transitivity_haspart',
        name: 'Transitivity of HasPart Relationship',
        conditions: [
          '?X hasPart ?Y',
          '?Y hasPart ?Z'
        ],
        conclusions: [
          '?X hasPart ?Z'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.8,
        explanationTemplate: 'If {0} has part {1}, and {1} has part {2}, then {0} has part {2}.',
        domain: ['general', 'composition'],
        enabled: true
      },

      // Inverse rule for "hasPart" and "isPart" relationships
      {
        id: 'inverse_haspart_ispart',
        name: 'Inverse HasPart/IsPart Relationship',
        conditions: [
          '?X hasPart ?Y'
        ],
        conclusions: [
          '?Y isPart ?X'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.95,
        explanationTemplate: 'If {0} has part {1}, then {1} is part of {0}.',
        domain: ['general', 'composition'],
        enabled: true
      },

      // Inverse rule for "contains" and "belongsTo" relationships
      {
        id: 'inverse_contains_belongsto',
        name: 'Inverse Contains/BelongsTo Relationship',
        conditions: [
          '?X contains ?Y'
        ],
        conclusions: [
          '?Y belongsTo ?X'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.95,
        explanationTemplate: 'If {0} contains {1}, then {1} belongs to {0}.',
        domain: ['general', 'categorization'],
        enabled: true
      },

      // Inheritance rule for properties
      {
        id: 'property_inheritance',
        name: 'Property Inheritance',
        conditions: [
          '?X isA ?Y',
          '?Y hasProperty ?P'
        ],
        conclusions: [
          '?X hasProperty ?P'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.8,
        explanationTemplate: 'If {0} is a {1}, and {1} has property {2}, then {0} has property {2}.',
        domain: ['general', 'properties'],
        enabled: true
      },

      // Temporal ordering rule
      {
        id: 'temporal_ordering',
        name: 'Temporal Ordering',
        conditions: [
          '?X before ?Y',
          '?Y before ?Z'
        ],
        conclusions: [
          '?X before ?Z'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.9,
        explanationTemplate: 'If {0} occurs before {1}, and {1} occurs before {2}, then {0} occurs before {2}.',
        domain: ['temporal', 'sequence'],
        enabled: true
      },

      // Location containment rule
      {
        id: 'location_containment',
        name: 'Location Containment',
        conditions: [
          '?X locatedIn ?Y',
          '?Y locatedIn ?Z'
        ],
        conclusions: [
          '?X locatedIn ?Z'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.85,
        explanationTemplate: 'If {0} is located in {1}, and {1} is located in {2}, then {0} is located in {2}.',
        domain: ['spatial', 'location'],
        enabled: true
      },

      // Cause-effect chaining rule
      {
        id: 'cause_effect_chain',
        name: 'Cause-Effect Chain',
        conditions: [
          '?X causes ?Y',
          '?Y causes ?Z'
        ],
        conclusions: [
          '?X causes ?Z'
        ],
        inferenceType: 'causal',
        confidenceModifier: 0.7,
        explanationTemplate: 'If {0} causes {1}, and {1} causes {2}, then {0} indirectly causes {2}.',
        domain: ['causal', 'events'],
        enabled: true
      },

      // Functional dependency rule
      {
        id: 'functional_dependency',
        name: 'Functional Dependency',
        conditions: [
          '?X requires ?Y',
          '?Y requires ?Z'
        ],
        conclusions: [
          '?X requires ?Z'
        ],
        inferenceType: 'deductive',
        confidenceModifier: 0.8,
        explanationTemplate: 'If {0} requires {1}, and {1} requires {2}, then {0} also requires {2}.',
        domain: ['functional', 'requirements'],
        enabled: true
      },

      // Similarity-based property inference
      {
        id: 'similarity_property',
        name: 'Similarity-Based Property Inference',
        conditions: [
          '?X similarTo ?Y',
          '?Y hasProperty ?P'
        ],
        conclusions: [
          '?X hasProperty ?P'
        ],
        inferenceType: 'analogical',
        confidenceModifier: 0.6,
        explanationTemplate: 'If {0} is similar to {1}, and {1} has property {2}, then {0} might also have property {2}.',
        domain: ['analogy', 'properties'],
        enabled: true
      },

      // Product-category relation rule
      {
        id: 'product_category_relation',
        name: 'Product-Category Relation',
        conditions: [
          '?X belongsTo ?C',
          '?C hasProperty ?P'
        ],
        conclusions: [
          '?X hasProperty ?P'
        ],
        inferenceType: 'inductive',
        confidenceModifier: 0.7,
        explanationTemplate: 'If {0} belongs to category {1}, and {1} has property {2}, then {0} likely has property {2}.',
        domain: ['products', 'categories'],
        enabled: true
      },

      // Feature-Product compatibility rule
      {
        id: 'feature_product_compatibility',
        name: 'Feature-Product Compatibility',
        conditions: [
          '?F isPart ?P1', // Feature F is part of Product P1
          '?P1 isA ?C',    // Product P1 is a type C (Category)
          '?P2 isA ?C'     // Product P2 is also a type C
        ],
        conclusions: [
          '?F compatibleWith ?P2' // Then Feature F might be compatible with Product P2
        ],
        inferenceType: 'inductive',
        confidenceModifier: 0.6,
        explanationTemplate: 'If feature {0} is part of product {1}, and both {1} and {2} are a type of {3}, then {0} might be compatible with {2}.',
        domain: ['products', 'compatibility'],
        enabled: true
      },

      // Problem-solution rule
      {
        id: 'problem_solution',
        name: 'Problem-Solution Mapping',
        conditions: [
          '?P causes ?S', // Problem P causes Symptom S
          '?X solves ?S'  // Solution X solves Symptom S
        ],
        conclusions: [
          '?X addresses ?P' // Then Solution X addresses Problem P
        ],
        inferenceType: 'abductive',
        confidenceModifier: 0.75,
        explanationTemplate: 'If {0} causes symptom {1}, and {2} solves {1}, then {2} addresses problem {0}.',
        domain: ['troubleshooting', 'support'],
        enabled: true
      },

      // Default feature rule (Example of a default inference)
      {
        id: 'default_features',
        name: 'Default Product Features',
        conditions: [
          '?P isA product', // If ?P is classified as a product
          '?P belongsTo ?C' // And ?P belongs to Category ?C
        ],
        conclusions: [
          '?P hasStandardFeatures' // Then it has standard features (a generic fact)
        ],
        inferenceType: 'default',
        confidenceModifier: 0.8,
        explanationTemplate: 'Since {0} is a product in the {1} category, it likely has the standard features for that category.',
        domain: ['products'],
        enabled: true
      }
    ];
    // Add valid rules to the engine's rules array
    this.rules = defaultRules.filter(rule => {
        const isValid = rule?.id && Array.isArray(rule.conditions) && rule.conditions.length > 0 && Array.isArray(rule.conclusions) && rule.conclusions.length > 0 && typeof rule.enabled === 'boolean' && typeof rule.confidenceModifier === 'number' && rule.confidenceModifier >= 0 && rule.confidenceModifier <= 1;
        if (!isValid) {
            console.warn('[InferenceEngine] Skipping invalid default rule:', rule);
        }
        return isValid;
    });

    console.log(`[InferenceEngine] Loaded ${this.rules.length} default rules.`);
  }

  /**
   * Apply an inference rule to a set of facts
   * This is a core pattern matching and conclusion generation method.
   */
  private applyRule(
    rule: InferenceRule,
    facts: Fact[], // Use the combined fact set
    entities: Entity[], // Keep for sourceData
    query: string,
    options: InferenceOptions
  ): InferenceResult[] {
    const results: InferenceResult[] = [];

     // Basic validation
     if (!rule?.conditions?.length || !rule.conclusions?.length || !Array.isArray(facts)) {
         console.warn(`[InferenceEngine] Invalid rule or facts provided to applyRule (${rule?.id}).`);
         return [];
     }


    try {
      // Get variable bindings from conditions
      // This function returns VariableBindings[]
      const bindings = this.matchConditions(rule.conditions, facts);

      if (bindings.length === 0) {
        // No matches for this rule
        // console.log(`[InferenceEngine] Rule ${rule.id}: No matches found.`);
        return [];
      }

       // console.log(`[InferenceEngine] Rule ${rule.id}: Found ${bindings.length} bindings.`);

      // For each set of bindings, generate conclusions
      for (const binding of bindings) {
        const inferredFacts: Fact[] = [];

        // Apply bindings to conclusions
        for (const conclusion of rule.conclusions) {
           // Ensure conclusion is a string
           if (typeof conclusion !== 'string' || conclusion.trim().length === 0) {
               console.warn(`[InferenceEngine] Skipping invalid conclusion in rule ${rule.id}:`, conclusion);
               continue;
           }
          const boundConclusion = this.applyBindings(conclusion, binding);

          // Parse the bound conclusion into a fact
          const fact = this.parseFactString(boundConclusion);
          if (fact) {
            // Apply confidence modifier from the rule and binding confidence
             // Ensure binding.__confidence is a number, fallback to 1.0 if not
            fact.confidence = Math.max(0.0, Math.min(
              (binding.__confidence ?? 1.0) * rule.confidenceModifier,
              0.99 // Cap confidence below 1.0 for inferred facts
            ));

            // Add metadata
            fact.metadata = {
              inferredBy: rule.id,
              inferenceType: rule.inferenceType,
              timestamp: Date.now(),
              // Add keys of facts used for this specific binding instance to metadata for traceability
              // Ensure __usedFacts exists and is an array
              usedFacts: Array.isArray(binding.__usedFacts) ? binding.__usedFacts : []
            };

            inferredFacts.push(fact);
          } else {
             console.warn(`[InferenceEngine] Failed to parse fact string "${boundConclusion}" from rule ${rule.id}.`);
          }
        }

        if (inferredFacts.length > 0) {
          // Generate explanation if requested and template is available
          let explanation = '';
          if (options.includeExplanations && typeof rule.explanationTemplate === 'string' && rule.explanationTemplate.length > 0) {
            explanation = this.generateExplanation(
              rule.explanationTemplate,
              binding
            );
          } else {
            explanation = `Applied rule: ${rule.name}`; // Fallback explanation
          }

          // Create inference result
          // Ensure sourceData facts are filtered from the *original* input fact set
          const sourceFactsForBinding = Array.isArray(binding.__usedFacts) ?
             facts.filter(f => f && binding.__usedFacts.includes(this.createFactKey(f))) : []; // Add check for 'f'

          const result: InferenceResult = {
            facts: inferredFacts,
            // Confidence of the result is the minimum confidence of the inferred facts,
            // or the confidence of the binding if no facts were inferred (shouldn't happen if conclusions > 0)
            confidence: inferredFacts.length > 0 ? Math.min(...inferredFacts.map(f => f.confidence)) : (binding.__confidence ?? 0),
            explanation,
            inferenceType: rule.inferenceType,
            rulesApplied: [rule.id],
            sourceData: {
              facts: sourceFactsForBinding,
              entities // Original entities that contributed facts
            }
          };

          results.push(result);
        } else {
             // console.log(`[InferenceEngine] Rule ${rule.id} generated no inferred facts for a binding.`);
        }
      }

      return results;
    } catch (error) {
      console.error(`[InferenceEngine] Error applying rule ${rule?.id}:`, getErrorMessage(error));
      return []; // Return empty array on error
    }
  }

  /**
   * Match rule conditions against facts
   * This is a core pattern matching function.
   *
   * @returns Array of VariableBindings that satisfy all conditions.
   */
  private matchConditions(
    conditions: string[],
    facts: Fact[]
  ): VariableBindings[] {
    // Start with an initial binding representing the empty state before conditions are met
    // It has 100% confidence and an empty list of used facts.
    let currentBindings: VariableBindings[] = [{
      __confidence: 1.0,
      __usedFacts: []
    }];

     // Basic validation
     if (!Array.isArray(conditions) || conditions.length === 0 || !Array.isArray(facts)) {
         console.warn('[InferenceEngine] Invalid conditions or facts provided to matchConditions.');
         return [];
     }


    // Process each condition sequentially. Each condition refines the possible bindings.
    for (const condition of conditions) {
      const nextBindings: VariableBindings[] = [];

      // Ensure condition is a valid string before parsing
      if (typeof condition !== 'string' || condition.trim().length === 0) {
         console.warn(`[InferenceEngine] Skipping invalid condition string: "${condition}"`);
         // If a condition is malformed, no bindings can be made from it,
         // meaning the rule cannot be applied. Return empty.
         return [];
      }

      // Parse the condition string into components (subject, predicate, object)
      const parts = condition.trim().split(/\s+/); // Split by one or more whitespace characters
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) { // Added check for defined parts
         console.warn(`[InferenceEngine] Skipping malformed condition (expected 3 valid parts): "${condition}"`);
         // If a condition is malformed, no bindings can be made from it,
         // meaning the rule cannot be applied. Return empty.
         return [];
      }
      const [subjectVar, predicateVar, objectVar] = parts as [string, string, string]; // Assert types


      // For each current partial binding, find matching facts to extend the binding
      for (const currentBinding of currentBindings) {
        // Find facts that match the current condition pattern given the current binding
        // findFactMatches returns an array of potential matches for this condition and binding
        const matches = this.findFactMatches(
          subjectVar,
          predicateVar,
          objectVar,
          facts, // Match against the full set of available facts
          currentBinding // The binding state built from previous conditions
        );

        // Create new, extended bindings from the matches found for this condition
        for (const match of matches) {
          // Combine the current binding with the new bindings found for this match
          // Match.bindings contains the new variable assignments for *this specific condition*
          // CurrentBinding contains the variables matched from *previous conditions* and the special properties
          const combinedBinding: VariableBindings = {
            ...currentBinding, // Start with the variables and special properties from the previous step
            ...match.bindings, // Add/overwrite variables matched in this step
            // Update confidence multiplicatively. Ensure currentBinding.__confidence is a number.
            __confidence: (currentBinding.__confidence ?? 1.0) * match.confidence, // Match confidence comes from the fact confidence
            // Add the fact key used for this match. Ensure __usedFacts is an array.
            __usedFacts: Array.isArray(currentBinding.__usedFacts) ? [...currentBinding.__usedFacts, match.factKey] : [match.factKey]
          };

          nextBindings.push(combinedBinding);
        }
      }

      // The bindings for the next iteration are the results of matching the current condition.
      // Replace the current set of bindings with the new set.
      currentBindings = nextBindings;

      // If after processing a condition, no bindings are found, the rule doesn't match for *any* path.
      if (currentBindings.length === 0) {
        // console.log(`[InferenceEngine] Rule condition "${condition}" had no matches across any current bindings.`);
        return []; // Rule cannot be applied
      }
    }

    // Return all bindings that successfully matched all conditions
    // console.log(`[InferenceEngine] MatchConditions finished. Found ${currentBindings.length} complete bindings.`);
    return currentBindings;
  }

  /**
   * Find facts matching a condition pattern given a current binding state
   * This function tries to unify a single condition (subject, predicate, or object pattern)
   * with facts, respecting and extending existing variable bindings.
   *
   * @returns Array of potential new variable assignments and the fact key that matched.
   */
  private findFactMatches(
    subjectVar: string, // e.g., '?X' or 'product'
    predicateVar: string, // e.g., 'isA' or '?P'
    objectVar: string, // e.g., '?Y' or 'Software'
    facts: Fact[],
    currentBinding: VariableBindings
  ): Array<{
    bindings: Record<string, string | number | boolean>, // Return types that can be bound
    confidence: number, // Confidence of the matched fact
    factKey: string // Key of the matched fact
  }> {
    const matches: Array<{
      bindings: Record<string, string | number | boolean>,
      confidence: number,
      factKey: string
    }> = [];

     // Basic validation
    if (!Array.isArray(facts) || typeof currentBinding !== 'object' || currentBinding === null) {
         console.warn('[InferenceEngine] Invalid facts or currentBinding provided to findFactMatches.');
         return [];
    }


    // Process each fact to see if it matches the pattern given the current binding
    for (const fact of facts) {
        // Basic fact structure validation before processing
        if (!fact?.subject || !fact.predicate || !fact.object) {
             // console.warn('[InferenceEngine] Skipping malformed fact:', fact);
             continue; // Skip malformed facts
        }

      const newBindings: Record<string, string | number | boolean> = {};
      let isMatch = true;

      // Helper function to check/bind a part (subject, predicate, or object)
      const checkAndBindPart = (
        patternPart: string, // e.g., '?X' or 'product'
        factPart: string,     // e.g., fact.subject
        bindingKey: string    // e.g., '?X'
      ): boolean => {
        if (patternPart.startsWith('?')) {
          // It's a variable (e.g., ?X, ?Y, ?P)
          // Retrieve the value currently bound to this variable, if any.
          const existingBindingValue = currentBinding[bindingKey];

          // Check if this variable is already bound in the current context.
          if (existingBindingValue !== undefined) {
             // If already bound, the fact part must match the bound value exactly.
             const existingBindingValueAsString = String(existingBindingValue); // Convert binding value to string for comparison with factPart (which is string)
             return existingBindingValueAsString === factPart;
          } else {
            // Not yet bound, create a new binding for this variable using the fact part's value.
            newBindings[bindingKey] = factPart; // factPart is guaranteed string by validation above
            return true; // Match succeeds for this part.
          }
        } else {
          // It's a constant (e.g., 'product'). The fact part must match the constant value exactly (case-sensitive).
          return patternPart === factPart;
        }
      };

      // Check subject
      isMatch = checkAndBindPart(subjectVar, fact.subject, subjectVar);

      // Check predicate if subject matched
      if (isMatch) {
        isMatch = checkAndBindPart(predicateVar, fact.predicate, predicateVar);
      }

      // Check object if subject and predicate matched
      if (isMatch) {
        isMatch = checkAndBindPart(objectVar, fact.object, objectVar);
      }

      // If all components match for this fact, add this fact's contribution to possible bindings.
      if (isMatch) {
        matches.push({
          bindings: newBindings, // These are the *new* bindings specific to this fact match
          confidence: fact.confidence ?? 0.5, // Use 0.5 as fallback confidence
          factKey: this.createFactKey(fact) // Store the key of the fact that matched
        });
      }
    }

    return matches; // Return the array of potential matches found for this condition
  }


  /**
   * Create a unique key for a fact
   * Ensures all parts are strings before joining.
   */
  private createFactKey(fact: Fact): string {
     // Ensure properties are strings before creating key
     const subject = typeof fact.subject === 'string' ? fact.subject : 'invalid_subject';
     const predicate = typeof fact.predicate === 'string' ? fact.predicate : 'invalid_predicate';
     const object = typeof fact.object === 'string' ? fact.object : 'invalid_object';

    return `${subject}|${predicate}|${object}`;
  }

  /**
   * Apply variable bindings to a string template
   * Replaces variable placeholders (e.g., '?X') with their bound values.
   */
  private applyBindings(
    template: string,
    bindings: VariableBindings
  ): string {
    let result = template;

     // Basic validation
     if (typeof template !== 'string') {
         console.warn('[InferenceEngine] Invalid template string provided to applyBindings.');
         return ''; // Return empty string for invalid template
     }
      if (typeof bindings !== 'object' || bindings === null) {
         console.warn('[InferenceEngine] Invalid bindings object provided to applyBindings.');
         // If bindings are invalid, return template without replacement
         return template;
     }


    // Sort binding keys to replace longer variable names first (e.g., '?X_part' before '?X').
    // Filter out special keys starting with '__'.
    const sortedVariableKeys = Object.keys(bindings)
        .filter(key => !key.startsWith('__'))
        .sort((a, b) => b.length - a.length); // Sort descending by length

    for (const variable of sortedVariableKeys) {
      const value = bindings[variable];

      // Replace the variable with its string representation.
      // Handle different types of bound values using explicit type checks.
      let valueString: string | undefined = undefined; // Use undefined initially

      if (typeof value === 'string') {
        valueString = value;
      } else if (typeof value === 'number') {
        valueString = String(value); // Convert number to string
      } else if (typeof value === 'boolean') {
        valueString = String(value); // Convert boolean to string
      } else if (Array.isArray(value)) {
        // Join array elements with a comma and space. Ensure all array elements are strings.
         const stringElements = value.filter((item): item is string => typeof item === 'string'); // Use type predicate
         valueString = stringElements.join(', ');
         if (stringElements.length < value.length) {
              console.warn(`[InferenceEngine] Array binding for "${variable}" contains non-string elements.`);
         }
         if (value.length > 0 && valueString.length === 0 && stringElements.length === 0) {
              // Array was not empty but had no string elements
              valueString = `[array with ${value.length} non-string elements]`; // Indicate content
         } else if (value.length === 0) {
             valueString = '[empty_array]';
         }

      } else if (value === undefined || value === null) {
          // Handle undefined or null bindings explicitly
          // console.warn(`[InferenceEngine] Binding for variable "${variable}" is undefined or null.`);
          valueString = `[${variable}_undefined]`; // Placeholder - Ensure it's a valid string
      }
       else {
        // Skip unsupported types for replacement
        console.warn(`[InferenceEngine] Skipping binding for variable "${variable}" with unsupported type "${typeof value}".`);
        continue;
      }

      // Fix: Ensure valueString is a defined string before replacing
      if (valueString === undefined) {
        console.warn(`[InferenceEngine] Logic error: valueString became undefined for variable "${variable}". Skipping replacement.`);
        continue; // Skip this variable if conversion failed
      }


      // Use a regex to replace the variable.
      // \b matches word boundaries, preventing replacing "?X" within "?X_part".
      // Escape the variable name to handle special regex characters if variable names could contain them.
      const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special characters
      const regex = new RegExp(`\\b${escapedVariable}\\b`, 'g'); // Match whole word boundary

      const newResult = result.replace(regex, valueString ?? '');

      // If the regex replacement didn't change anything (e.g., variable wasn't a whole word, or no boundary exists),
      // try a simpler replace without word boundaries as a fallback.
      // This handles cases like variables at the very start/end of the template or adjacent to punctuation.
      if (newResult === result) {
           const simpleRegex = new RegExp(escapedVariable, 'g');
           result = result.replace(simpleRegex, valueString ?? ''); // Error TS2345 was here
      } else {
           result = newResult;
      }
    }

    return result;
  }


  /**
   * Parse a fact string into a Fact object
   * Expected format: "subject predicate object"
   */
  private parseFactString(factString: string): Fact | null {
    try {
      // Ensure factString is a valid non-empty string
      if (typeof factString !== 'string' || factString.trim().length === 0) {
           console.warn('[InferenceEngine] Cannot parse empty or invalid fact string.');
           return null;
      }

      // Split by one or more whitespace characters
      const parts = factString.trim().split(/\s+/);

      // A fact string must have at least subject, predicate, and object (3 parts)
      // Also check if parts themselves are defined strings
      if (parts.length < 3 || typeof parts[0] !== 'string' || typeof parts[1] !== 'string') { // Fix: Check parts[0] and parts[1] types
        console.warn(`[InferenceEngine] Fact string "${factString}" does not have enough valid parts (expected >= 3, got ${parts.length}).`);
        return null;
      }

      // Fix: Ensure subject and predicate are strings after the checks
      const subject: string = parts[0];
      const predicate: string = parts[1];
      const object: string = parts.slice(2).join(' '); // Object is guaranteed string

      // Basic check that subject, predicate, and object are non-empty strings after parsing
      if (subject.length === 0 || predicate.length === 0 || object.length === 0) {
          console.warn(`[InferenceEngine] Parsed fact string "${factString}" resulted in empty subject, predicate, or object.`);
          return null;
      }

      return {
        subject, // Fix: Now guaranteed to be string
        predicate, // Fix: Now guaranteed to be string
        object,
        confidence: 0.8 // Default confidence, will be updated later by applyRule
      };
    } catch (error) {
      console.error('[InferenceEngine] Error parsing fact string:', getErrorMessage(error));
      return null; // Return null if parsing fails
    }
  }

  /**
   * Generate an explanation from a template and bindings
   * Replaces {n} placeholders with the value of the n-th bound variable (excluding special __ variables).
   *
   * TS2769: No overload matches call for result.replace(placeholderRegex, (match, indexStr) => ...)
   * This error occurs because the callback function in replace might return `string | undefined`
   * based on the logic, but String.prototype.replace expects the callback to return `string`.
   * Ensure the callback always returns a string.
   */
  private generateExplanation(
    template: string,
    bindings: VariableBindings
  ): string {
    try {
       // Ensure template is a string and bindings is an object
       if (typeof template !== 'string') {
           console.warn('[InferenceEngine] Explanation template is not a string.');
           return "Inference based on logical rules.";
       }
        if (typeof bindings !== 'object' || bindings === null) {
           console.warn('[InferenceEngine] Bindings object is invalid for explanation generation.');
           return template; // Return template if bindings are invalid
       }


      let result = template;

      // Get all variable names from bindings (excluding special ones)
      // Ensure consistent order for indexing by sorting keys alphabetically
      const variableNames = Object.keys(bindings)
        .filter(key => !key.startsWith('__'))
        .sort(); // Sort alphabetically for stable indexing

      // Map variable names to their string values for easy access by index
      const variableValues = variableNames.map(key => {
          const value = bindings[key];
          if (typeof value === 'string') return value;
          if (typeof value === 'number') return String(value);
          if (Array.isArray(value)) {
              const stringElements = value.filter((item): item is string => typeof item === 'string'); // Use type predicate
              const joined = stringElements.join(', ');
               if (stringElements.length < value.length) {
                   console.warn(`[InferenceEngine] Explanation binding array for "${key}" contains non-string elements.`);
               }
               if (value.length > 0 && joined.length === 0 && stringElements.length === 0) {
                  return `[array with ${value.length} non-string elements for ${key}]`;
               } else if (value.length === 0) {
                   return `[empty_array for ${key}]`;
               }
              return joined;
          }
          if (typeof value === 'boolean') return String(value); // Convert boolean to string
          if (value === undefined || value === null) return `[${key}_undefined]`; // Placeholder for undefined/null

          console.warn(`[InferenceEngine] Explanation binding for "${key}" has unsupported type "${typeof value}".`);
          return `[unknown value for ${key}]`; // Placeholder for unsupported types
      });

      // Use a regex to find all {n} placeholders
      const placeholderRegex = /{(\d+)}/g;

      // Replace each {n} placeholder with the corresponding variable value by index
      // Use a functional replacer to handle multiple occurrences and ensures correct index mapping
      // Annotate the callback function with a return type of 'string' to satisfy TS2769
      result = result.replace(placeholderRegex, (match, indexStr) : string => {
          const index = parseInt(indexStr, 10); // Parse the index string to a number

          // Check if the index is valid within the variableValues array bounds
          if (!isNaN(index) && index >= 0 && index < variableValues.length) {
              // Fix: Ensure variableValues[index] is always a string before returning
              return variableValues[index] ?? match; // Use original match as fallback if value is unexpectedly undefined
          }
          // If the index is invalid, return the original placeholder string (e.g., "{99}")
          console.warn(`[InferenceEngine] Invalid explanation placeholder index "${indexStr}" in template "${template}". Available indices: 0 to ${variableValues.length -1}.`);
          return match; // Return original match string (which is a string)
      });

      return result;
    } catch (error) {
      console.error('[InferenceEngine] Error generating explanation:', getErrorMessage(error));
      return "Inference based on logical rules."; // Fallback explanation on error
    }
  }


  /**
   * Execute inference using the knowledge graph
   * Assumes KnowledgeGraph instance exists and has a `query` method.
   * KnowledgeGraph `query` method is assumed to return an array of results,
   * where each result has `facts`, `confidence`, `explanation`, `metadata`.
   */
  private async inferFromKnowledgeGraph(
    query: string,
    entities: Entity[],
    options: InferenceOptions
  ): Promise<InferenceResult[]> {
    // Ensure knowledge graph is available
    if (!this.knowledgeGraph) {
      // console.log('[InferenceEngine] KnowledgeGraph not available for inference.');
      return [];
    }

    try {
      // Query the knowledge graph for related facts or answers.
      // Assume knowledgeGraph.query is an async method
      console.log(`[InferenceEngine] Querying KnowledgeGraph for "${truncateText(query, 50)}"...`);
      // Assuming knowledgeGraph.query returns a structure similar to InferenceResult[] but needs mapping.
      // Or it returns a simpler structure like { facts: Fact[], confidence: number, explanation?: string }[]
      // Let's assume it returns [{ facts: KnowledgeFact[], confidence: number, explanation?: string, metadata?: any }]
      // where KnowledgeFact might be { subject: string, predicate: string, object: string, confidence?: number, metadata?: any }
      // Map InferenceOptions to GraphQueryOptions, converting intent to string if needed
      const graphQueryOptions = {
        ...options,
        intent: typeof options.intent === 'string'
          ? options.intent
          : (options.intent && typeof options.intent.category === 'string'
              ? options.intent.category
              : undefined)
      };
      const graphResults = await this.knowledgeGraph.query(query, entities, graphQueryOptions); // Pass mapped options

      const inferences: InferenceResult[] = [];

      // Process results if graphResults is a valid array
      if (Array.isArray(graphResults)) {
          // Convert each graph result to an inference result format
          for (const result of graphResults) {
             // Ensure result is valid before processing
             // Fix: Check for existence and types before accessing properties (TS2532)
             if (!result || !Array.isArray(result.facts) || typeof result.confidence !== 'number') {
                 console.warn('[InferenceEngine] Skipping invalid graph result:', result);
                 continue;
             }

            // Convert graph facts to our Fact format, ensuring validation
            const facts: Fact[] = [];
             for (const graphFact of result.facts) {
                  // Ensure graphFact is valid before converting (TS2532 fix)
                  if (graphFact?.subject && graphFact.predicate && graphFact.object) {
                     facts.push({
                        subject: graphFact.subject,
                        predicate: graphFact.predicate,
                        object: graphFact.object,
                        confidence: Math.max(0.0, Math.min(1.0, graphFact.confidence ?? 0.7)), // Use nullish coalescing and clamp.
                        metadata: typeof graphFact.metadata === 'object' && graphFact.metadata !== null ? {
                          fromKnowledgeGraph: true,
                          ...graphFact.metadata
                        } : { fromKnowledgeGraph: true } // Provide minimal metadata if original is invalid
                     });
                  } else {
                      console.warn('[InferenceEngine] Skipping invalid graph fact during conversion:', graphFact);
                  }
             }


            // Only create an inference result if we successfully converted some facts
            if (facts.length > 0) {
              inferences.push({
                facts,
                confidence: Math.max(0.0, Math.min(1.0, result.confidence ?? 0.5)), // Use nullish coalescing and clamp
                explanation: result.explanation || "Inferred from knowledge graph", // Fallback explanation
                inferenceType: 'deductive', // Assuming graph query is primarily deductive reasoning
                rulesApplied: [], // No specific rule ID from graph query
                sourceData: {
                  facts: facts, // The facts came from the KG query
                  entities // Pass original entities from user query
                }
              });
            }
          }
      } else {
          console.warn('[InferenceEngine] KnowledgeGraph query did not return a valid array of results.');
      }


      // console.log(`[InferenceEngine] KnowledgeGraph inference found ${inferences.length} results.`);
      return inferences; // Return the array of inference results derived from KG
    } catch (error) {
      console.error('[InferenceEngine] Error inferring from knowledge graph:', getErrorMessage(error));
      return []; // Return empty array on error
    }
  }

  /**
   * Analyzes the type of question being asked based on keywords and structure.
   */
  private analyzeQuestionType(question: string): string {
    // Ensure question is a valid string
    if (typeof question !== 'string') return 'general';
    const lowerQuestion = question.trim().toLowerCase(); // Trim whitespace

    // Check for different question types based on keywords
    if (lowerQuestion.startsWith('what is') ||
        lowerQuestion.startsWith('what are') ||
        lowerQuestion.startsWith('what was') ||
        lowerQuestion.startsWith('tell me about') || // Added
        lowerQuestion.startsWith('define') || // Added
        (lowerQuestion.endsWith('?') && lowerQuestion.includes('what is')) || // Handle questions ending with ?
        (lowerQuestion.endsWith('?') && lowerQuestion.includes('was ist'))) // Added German example based on logs
         {
      return 'definition';
    }

    if (lowerQuestion.startsWith('how do') ||
        lowerQuestion.startsWith('how does') ||
        lowerQuestion.startsWith('how can') ||
        lowerQuestion.startsWith('how to') || // Added
        lowerQuestion.startsWith('wie funktioniert') || // Added German
        (lowerQuestion.endsWith('?') && lowerQuestion.includes('wie'))) // German how questions
         {
      return 'procedure';
    }

    if (lowerQuestion.startsWith('why is') ||
        lowerQuestion.startsWith('why are') ||
        lowerQuestion.startsWith('why does') ||
        lowerQuestion.startsWith('warum') || // Added German
         lowerQuestion.startsWith('weshalb') || // Added German
         (lowerQuestion.endsWith('?') && lowerQuestion.includes('warum'))) // German why questions
         {
      return 'explanation';
    }

    if (lowerQuestion.startsWith('where is') ||
        lowerQuestion.startsWith('where are') ||
        lowerQuestion.startsWith('wo ist') || // Added German
         lowerQuestion.startsWith('wo finde') || // Added German
         (lowerQuestion.endsWith('?') && lowerQuestion.includes('wo'))) // German where questions
         {
      return 'location';
    }

    if (lowerQuestion.startsWith('when is') ||
        lowerQuestion.startsWith('when are') ||
        lowerQuestion.startsWith('wann ist') || // Added German
        lowerQuestion.startsWith('wann war') || // Added German
         (lowerQuestion.endsWith('?') && lowerQuestion.includes('wann'))) // German when questions
         {
      return 'temporal';
    }

    if (lowerQuestion.startsWith('who is') ||
        lowerQuestion.startsWith('who are') ||
        lowerQuestion.startsWith('wer ist') || // Added German
        lowerQuestion.startsWith('wer sind') || // Added German
         (lowerQuestion.endsWith('?') && lowerQuestion.includes('wer'))) // German who questions
         {
      return 'person';
    }

    if (lowerQuestion.startsWith('which') ||
        lowerQuestion.startsWith('welcher') || // Added German
        lowerQuestion.startsWith('welche') || // Added German
        lowerQuestion.startsWith('welches')) // Added German
         {
      return 'selection'; // Or 'choice'
    }

    // Yes/No questions often start with auxiliary verbs or specific German phrasing
    if ((lowerQuestion.startsWith('can') ||
        lowerQuestion.startsWith('does') ||
        lowerQuestion.startsWith('do') ||
        lowerQuestion.startsWith('is') ||
        lowerQuestion.startsWith('are') ||
        lowerQuestion.startsWith('kann') || // Added German
        lowerQuestion.startsWith('können') || // Added German
        lowerQuestion.startsWith('ist') || // Added German
        lowerQuestion.startsWith('sind') || // Added German
        lowerQuestion.startsWith('haben') || // Added German
        lowerQuestion.startsWith('hat')) && // Added German
        lowerQuestion.endsWith('?')) // Any question ending with '?' without a clear Wh-word could be Yes/No
         {
      return 'yesno';
    }

    if (lowerQuestion.startsWith('how many') ||
        lowerQuestion.startsWith('how much') ||
        lowerQuestion.startsWith('wieviel') || // Added German
        lowerQuestion.startsWith('wie viele')) // Added German
         {
      return 'quantity'; // Or 'count'
    }

    if (lowerQuestion.includes('difference between') ||
        lowerQuestion.includes('unterschied zwischen') || // Added German
        lowerQuestion.includes('versus') ||
        lowerQuestion.includes('compared to')) {
      return 'comparison';
    }

    // Default to general question type if no specific type detected
    return 'general';
  }

  /**
   * Select appropriate inference types based on question type.
   */
  private selectInferenceTypesForQuestion(questionType: string): InferenceType[] {
    switch (questionType) {
      case 'definition':
        return ['deductive', 'default']; // Deductive logic for definitions, default for common properties

      case 'procedure':
        return ['deductive', 'causal']; // Steps often follow logical or causal chains

      case 'explanation':
        return ['causal', 'abductive', 'deductive']; // Cause/effect, inferring reasons, logical deduction

      case 'location':
        return ['deductive']; // Spatial relationships are often deductive

      case 'temporal':
        return ['deductive', 'causal']; // Temporal ordering is deductive, cause-effect can be temporal

      case 'person':
        return ['deductive', 'default']; // Deductive for facts, default for roles/properties

      case 'selection':
        return ['deductive', 'analogical']; // Deductive for exact matches, analogical for similar options

      case 'yesno':
        return ['deductive', 'inductive', 'abductive', 'default']; // Deductive for certainty, inductive/abductive for likelihood, default for common assumptions

      case 'quantity':
        return ['deductive']; // Quantity is usually a direct fact or derived deductively

      case 'comparison':
        return ['analogical', 'inductive', 'deductive']; // Finding similarities/differences (analogical/inductive), comparing facts (deductive)

      case 'general':
      default:
        // For general questions, try a broader set of inference types
        return ['deductive', 'inductive', 'abductive', 'analogical', 'default', 'causal']; // All relevant types
    }
  }

  /**
   * Fix: Define the missing method
   * Creates a simple VariableBindings object from a single fact.
   * Used for generating explanations when focusing on one fact.
   */
  private bindingFromFact(fact: Fact): VariableBindings {
    return {
      '?SUBJECT': fact.subject,
      '?PREDICATE': fact.predicate,
      '?OBJECT': fact.object,
      __confidence: fact.confidence,
      __usedFacts: [this.createFactKey(fact)]
    };
  }

  /**
   * Generate an answer string from an inference result based on the question type.
   */
  private generateAnswerFromInference(
    inference: InferenceResult,
    questionType: string,
    question: string // Keep question for context, though not strictly used in current logic
  ): string {
    // Basic validation
     if (!inference?.facts) {
         console.warn('[InferenceEngine] Invalid inference result provided to generateAnswerFromInference.');
         return "I found some relevant information, but couldn't formulate a clear answer.";
     }

    try {
      // If we have facts, use them to construct an answer
      if (inference.facts.length > 0) {
        // Filter for valid facts before sorting/accessing
        const validFacts = inference.facts.filter(f => f?.subject && f.predicate && f.object && typeof f.confidence === 'number');

        if (validFacts.length === 0) {
             console.warn('[InferenceEngine] Inference result contained no valid facts.');
             // Fallback to explanation if no valid facts
             return inference.explanation || "Based on my reasoning, I can infer some information.";
        }

        // Sort valid facts by confidence (descending)
        validFacts.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)); // Use nullish coalescing for sorting

        const mostRelevantFact = validFacts[0]; // Get the top fact

         // Double check mostRelevantFact is defined after filtering/sorting (defensive)
         if (!mostRelevantFact) {
             console.warn('[InferenceEngine] Logic error: validFacts was non-empty but mostRelevantFact is undefined.');
             return inference.explanation || "Based on my reasoning, I can infer some information."; // Fallback
         }


        // Format answer based on detected question type
        switch (questionType) {
          case 'definition':
            if (mostRelevantFact.predicate === 'isA' || mostRelevantFact.predicate === 'hasType') {
              return `${mostRelevantFact.subject} is a ${mostRelevantFact.object}.`;
            }
            if (mostRelevantFact.predicate === 'hasProperty' || mostRelevantFact.predicate === 'hasAttribute') {
              return `${mostRelevantFact.subject} has the property: ${mostRelevantFact.object}.`;
            }
             if (mostRelevantFact.predicate === 'hasInstance') { // e.g., 'product' hasInstance 'Mindfluence App' -> Mindfluence App is an instance of product.
                 return `${mostRelevantFact.object} is an instance of a ${mostRelevantFact.subject}.`;
             }
            // Fallback for definition type if predicates above don't match
             if (validFacts.length > 1) { // If multiple facts, try to list some properties
                  const properties = validFacts.filter(f => f.subject === mostRelevantFact.subject && (f.predicate === 'hasProperty' || f.predicate === 'hasAttribute' || f.predicate === 'usedFor')).map(f => f.object);
                  if (properties.length > 0) {
                      return `${mostRelevantFact.subject} is described as having properties like: ${properties.join(', ')}.`;
                  }
             }
             // Default definition fallback
            return `${mostRelevantFact.subject} ${this.humanizePredicateName(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;


          case 'procedure':
             // Look for facts indicating steps, requirements, or usage
             const stepFact = validFacts.find(f => f.predicate === 'hasStep');
             if (stepFact) return `One step to ${stepFact.subject} is to ${stepFact.object}.`; // Simple step
             const requirementFact = validFacts.find(f => f.predicate === 'requires');
             if (requirementFact) return `To ${requirementFact.subject}, you need ${requirementFact.object}.`; // Simple requirement
             const usageFact = validFacts.find(f => f.predicate === 'usedFor');
             if (usageFact) return `${usageFact.subject} is used for ${usageFact.object}.`; // Simple usage
            break; // If no specific procedure facts, fall through to generic


          case 'explanation':
            // Look for facts indicating causes or explanations
            if (mostRelevantFact.predicate === 'causes' || mostRelevantFact.predicate === 'results in' || mostRelevantFact.predicate === 'explains') {
              return `${mostRelevantFact.subject} happens because ${mostRelevantFact.object}.`;
            }
            // If the top fact isn't a direct cause, try to explain *why* the top fact is true
            // Create a temporary binding just with the parts of the most relevant fact
            // Fix: Use the defined method
            const factBinding: VariableBindings = this.bindingFromFact(mostRelevantFact);
            // Ensure explanation is always a string before passing to generateExplanation
            const explanationText = inference.explanation || "Based on my reasoning.";
            return this.generateExplanation(explanationText, factBinding);


          case 'location':
            if (mostRelevantFact.predicate === 'locatedIn' || mostRelevantFact.predicate === 'locatedAt') {
              return `${mostRelevantFact.subject} is located in ${mostRelevantFact.object}.`;
            }
            break;

          case 'temporal':
            if (mostRelevantFact.predicate === 'occursAt' || mostRelevantFact.predicate === 'happenedOn' || mostRelevantFact.predicate === 'before' || mostRelevantFact.predicate === 'after') {
              return `${mostRelevantFact.subject} occurs ${this.humanizePredicateName(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
            }
            break;

          case 'yesno':
            // For yes/no questions, the existence of relevant facts usually implies "yes"
            // Use a higher threshold for a definite "Yes"
             if (inference.confidence > 0.85) return "Yes, that is correct.";
             if (inference.confidence > 0.6) return "Possibly, based on the information I have.";
            return "I'm not certain based on the available facts."; // Low confidence

          case 'comparison':
             // Try to find facts related to differences or common properties
             const differenceFact = validFacts.find(f => f.predicate === 'differFrom');
             if (differenceFact) {
                  return `One key difference is that ${differenceFact.subject} ${this.humanizePredicateName(differenceFact.predicate)} ${differenceFact.object}.`;
             }
             const comparisonFact = validFacts.find(f => f.predicate === 'comparesWith' || f.predicate === 'similarTo');
             if (comparisonFact) {
                  return `${comparisonFact.subject} compares with ${comparisonFact.object}. For example, ${mostRelevantFact.subject} ${this.humanizePredicateName(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`; // Use top fact as an example
             }
            // Generic comparison answer
            if (validFacts.length > 1) {
                 // Fix TS2532 errors by checking fact1 and fact2
                 const fact1 = validFacts[0];
                 const fact2 = validFacts[1];
                 if (fact1 && fact2) { // Check if facts exist at these indices
                    return `Regarding ${fact1.subject} and ${fact2.subject}: ${fact1.subject} ${this.humanizePredicateName(fact1.predicate)} ${fact1.object}, while ${fact2.subject} ${this.humanizePredicateName(fact2.predicate)} ${fact2.object}.`;
                 } else {
                     console.warn('[InferenceEngine] Comparison logic expected valid facts at indices 0 and 1 but found invalid.');
                     // Fallback to a simpler answer if facts are unexpectedly invalid
                     return `I found some facts for comparison, like ${mostRelevantFact.subject} ${this.humanizePredicateName(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
                 }
            }
            break; // Fall through if not enough valid facts for comparison


           case 'quantity':
                if (mostRelevantFact.predicate === 'hasQuantity' || mostRelevantFact.predicate === 'count') {
                    return `${mostRelevantFact.subject} has a quantity of ${mostRelevantFact.object}.`;
                }
                 break;
           case 'selection':
                 // Could list options based on facts - simple case: return the subject of the most relevant fact
                 return `Based on the facts, ${mostRelevantFact.subject} seems relevant because it ${this.humanizePredicateName(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;

           case 'person':
                 if (mostRelevantFact.predicate === 'isA' || mostRelevantFact.predicate === 'hasRole') {
                     return `${mostRelevantFact.subject} is a ${mostRelevantFact.object}.`;
                 }
                // Try to find facts about the person
                const personFacts = validFacts.filter(f => f.subject === mostRelevantFact.subject);
                if (personFacts.length > 0) {
                    return `${mostRelevantFact.subject}: ${personFacts.map(f => `${this.humanizePredicateName(f.predicate)} ${f.object}`).join(', ')}.`;
                }
                 break;

        }

        // Generic answer based on subject-predicate-object structure if no specific type match
        // Use the most relevant fact
        return `${mostRelevantFact.subject} ${this.humanizePredicateName(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
      }

      // If no facts were present in the inference result, use the explanation as the answer
      return inference.explanation || "Based on my reasoning, I can infer an answer to your question.";
    } catch (error) {
      console.error('[InferenceEngine] Error generating answer:', getErrorMessage(error));
      return "I found some relevant information, but couldn't formulate a clear answer."; // Fallback on error
    }
  }

  /**
   * Convert a predicate name to a more human-readable form
   * @param predicate The predicate string (e.g., 'isA')
   * @returns A human-readable phrase (e.g., 'is a')
   */
  private humanizePredicateName(predicate: string): string {
    // Ensure predicate is a string
     if (typeof predicate !== 'string') return String(predicate); // Return string representation if not string

    // Map of predicate names to human-readable forms
    const predicateMap: Record<string, string> = {
      'isA': 'is a',
      'hasInstance': 'is an instance of', // Added
      'hasPart': 'has a part called',
      'isPart': 'is part of',
      'belongsTo': 'belongs to',
      'contains': 'contains',
      'relatedTo': 'is related to',
      'causes': 'causes',
      'results in': 'results in', // Added
      'explains': 'explains why', // Added
      'locatedIn': 'is located in',
      'locatedAt': 'is located at', // Added
      'before': 'happens before',
      'after': 'happens after',
      'occursAt': 'occurs at', // Added
      'happenedOn': 'happened on', // Added
      'usedFor': 'is used for',
      'requires': 'requires',
      'hasProperty': 'has property',
      'hasType': 'is of type',
      'hasAttribute': 'has attribute',
      'hasFunction': 'functions as',
      'compatibleWith': 'is compatible with',
      'similarTo': 'is similar to',
      'sameAs': 'is the same as',
      'differFrom': 'differs from',
      'comparesWith': 'compares with', // Added
      'madeOf': 'is made of',
      'produces': 'produces',
      'hasStep': 'involves the step', // Added
      'hasQuantity': 'has quantity', // Added
      'count': 'has a count of', // Added
      'hasRole': 'has the role of', // Added
      'addresses': 'addresses the issue of' // Added
      // Add other common predicates here
    };

    // Return mapped name if found, otherwise return the original predicate string.
    return predicateMap[predicate] ?? predicate;
  }


  /**
   * Convert an EntityRelationType to a human-readable explanation for a specific relationship instance.
   * This seems slightly redundant with humanizePredicateName, but kept separate
   * as it's used specifically for explaining RELATIONSHIPS found by EntityRelationManager.
   * Could potentially be refactored to use humanizePredicateName if EntityRelationType union aligns with Fact predicates.
   */
  private relationTypeToExplanation(
    sourceValue: string,
    relationType: EntityRelationType, // This type is the union/enum from EntityRelationManager
    targetValue: string
  ): string {
     // Ensure inputs are strings
     if (typeof sourceValue !== 'string' || typeof relationType !== 'string' || typeof targetValue !== 'string') {
         console.warn('[InferenceEngine] Invalid inputs to relationTypeToExplanation.');
         return `Cannot explain relationship between ${sourceValue} and ${targetValue}.`;
     }
     // EntityRelationType is a union of string literals, so direct string casting works.
     const relationString = String(relationType);

    // Use a switch based on the string representation of the relation type
    switch (relationString) {
      case 'isA':
        return `${sourceValue} is a type of ${targetValue}.`;

      case 'hasPart':
        return `${sourceValue} has ${targetValue} as one of its parts.`;

      case 'isPart':
        return `${sourceValue} is a part of ${targetValue}.`;

      case 'belongsTo':
        return `${sourceValue} belongs to the ${targetValue} category.`;

      case 'contains':
        return `${sourceValue} contains ${targetValue}.`;

      case 'relatedTo':
        return `${sourceValue} is related to ${targetValue}.`;

      case 'causes':
        return `${sourceValue} causes ${targetValue}.`;

      case 'locatedIn':
        return `${sourceValue} is located in ${targetValue}.`;

      case 'before':
        return `${sourceValue} happens before ${targetValue}.`;

      case 'after':
        return `${sourceValue} happens after ${targetValue}.`;

      case 'usedFor':
        return `${sourceValue} is used for ${targetValue}.`;

      case 'requires':
        return `${sourceValue} requires ${targetValue}.`;

      default:
        // Fallback using the humanize helper if the type isn't in the switch.
        // This assumes EntityRelationType values can be mapped by humanizePredicateName.
        return `${sourceValue} ${this.humanizePredicateName(relationString)} ${targetValue}.`;
    }
  }


  /**
   * Extract relationship path from an inference result's facts.
   * Finds a sequence of facts connecting sourceValue to targetValue using Breadth-First Search (BFS).
   */
  private extractRelationshipPathFromInference(
    inference: InferenceResult,
    sourceValue: string,
    targetValue: string
  ): string[] {
    const path: string[] = [];

     // Basic validation
     if (!inference?.facts) {
         console.warn('[InferenceEngine] Cannot extract path from invalid inference result.');
         return [];
     }
      if (typeof sourceValue !== 'string' || sourceValue.length === 0 || typeof targetValue !== 'string' || targetValue.length === 0) {
           console.warn('[InferenceEngine] Invalid source or target value provided for path extraction.');
           return [];
      }
       // Quick check: if source and target are the same, path is empty or trivial.
       if (sourceValue === targetValue) return []; // No path needed for self

    // Filter for valid facts within the inference result
    const facts = inference.facts.filter(f => f?.subject && f.predicate && f.object);

    if (facts.length === 0) {
        return []; // No facts to build a path from
    }

    // Simple case: check for a direct relationship fact
    const directRelation = facts.find(f =>
      f.subject === sourceValue && f.object === targetValue
    );

    if (directRelation) {
      // Return the direct path segment
      path.push(`${sourceValue} ${directRelation.predicate} ${targetValue}`);
      return path;
    }

    // More complex case: find a path through intermediate entities using BFS
    const visited = new Set<string>(); // Track visited entity values to prevent cycles and redundant processing
    // Queue stores nodes as { value: entityValue, pathSoFar: array of path segments leading to this value }
    const queue: { value: string, pathSoFar: string[] }[] = [];

    // Start BFS from the source value
    queue.push({ value: sourceValue, pathSoFar: [] });
    visited.add(sourceValue);

    let depth = 0;
    const maxDepth = 5; // Limit search depth to prevent excessive computation


    while (queue.length > 0 && depth < maxDepth) { // Check depth limit
      const levelSize = queue.length; // Process all nodes at the current level

      // Iterate through all nodes at the current level before moving to the next depth
      for (let i = 0; i < levelSize; i++) {
          // Dequeue the next node. `shift()` removes from the front.
          const currentNode = queue.shift();

           // Defensive check: ensure currentNode is defined before accessing its properties
           if (!currentNode) {
               console.warn('[InferenceEngine] Queue shift resulted in undefined (should not happen with levelSize check).');
               continue; // Skip to the next iteration if somehow undefined
           }

          const { value, pathSoFar } = currentNode;

          // Find all facts where the current node's value is the subject (outgoing edges)
          const outgoingRelations = facts.filter(f => f.subject === value);

          for (const relation of outgoingRelations) {
             // Ensure relation is valid before accessing properties
             if (!relation?.predicate || !relation.object) {
                 console.warn('[InferenceEngine] Skipping malformed relation object in path extraction (outgoing):', relation);
                 continue;
             }
              // Ensure the object of the relation is a non-empty string value
              if (relation.object.length === 0) continue;


            // Check if this fact connects to the target value
            if (relation.object === targetValue) {
              // Found a path to the target! Construct the full path and return.
              return [
                ...pathSoFar, // Path segments leading to the current value
                `${value} ${relation.predicate} ${targetValue}` // The final segment
              ];
            }

            // If the object of this fact is not the target, but is a new entity value not yet visited...
            if (!visited.has(relation.object)) {
              // Add the object to the visited set
              visited.add(relation.object);
              // Enqueue the object's value for further exploration, extending the path
              queue.push({
                value: relation.object,
                pathSoFar: [
                  ...pathSoFar, // Path segments leading to the current value
                  `${value} ${relation.predicate} ${relation.object}` // Add the segment from current to object
                ]
              });
            }
          }

          // The loop for incoming relations below is commented out as per previous reasoning
          // regarding directed path extraction.

      }
      depth++; // Increment depth after processing a full level
    }

    // If the loop finishes without finding a path within the maximum depth, return empty array
     if (depth >= maxDepth) {
         console.warn(`[InferenceEngine] Path extraction reached max depth (${maxDepth}) without finding a path from "${sourceValue}" to "${targetValue}".`);
     } else {
         // console.log(`[InferenceEngine] Path extraction queue empty after ${depth} levels, no path found from "${sourceValue}" to "${targetValue}".`);
     }
    return path; // Return empty array if no path found
  }


  /**
   * Extract entity type from a fact, looking at metadata or specific predicates like 'isA'.
   * Returns string if a type is found, otherwise undefined.
   */
  private extractEntityTypeFromFact(fact: Fact, role: 'subject' | 'object'): string | undefined { // Return undefined possible
    // Ensure fact is valid
     if (!fact?.metadata) {
         // console.warn('[InferenceEngine] Invalid fact provided to extractEntityTypeFromFact.');
         // Fallback: attempt basic type inference if metadata is missing
         const valueToCheck = role === 'subject' ? fact?.subject : fact?.object;
         if (!valueToCheck) return undefined; // Cannot infer if value is missing

         // Simple inference based on value (e.g., number, potentially date)
         if (!isNaN(Number(valueToCheck))) return 'number';
         // Add more simple inferences if needed

         return undefined; // Return undefined if no metadata and no simple inference
     }

    const valueToCheck = role === 'subject' ? fact.subject : fact.object;

    // Check metadata first
    if (fact.metadata) {
      if (role === 'subject' && typeof fact.metadata.sourceEntityType === 'string') {
        return fact.metadata.sourceEntityType;
      }
      if (role === 'object' && typeof fact.metadata.targetEntityType === 'string') {
        return fact.metadata.targetEntityType;
      }
      if (typeof fact.metadata.entityType === 'string') { // Generic entityType in metadata
        return fact.metadata.entityType;
      }
    }

    // Check specific predicates
    if (fact.predicate === 'isA') {
      if (role === 'object') {
        return 'category'; // The object of 'isA' is usually a category
      }
      // The subject of 'isA' could be anything, rely on metadata or other facts
    }

    if (fact.predicate === 'hasInstance') {
      if (role === 'subject') {
        return 'category'; // The subject of 'hasInstance' is usually a category
      }
      // The object of 'hasInstance' is the instance, rely on metadata
    }

    // Add more predicate-based inferences if needed

    // Fallback if no type found
    return undefined; // Fix: Ensure all paths return a value (TS7030)
  } // Fix: Added missing closing brace for the method (TS1005)
} // Fix: Added missing closing brace for the class (TS1005)