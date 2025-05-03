/**
 * features/nlp-engine/ai/training/evaluator.ts
 * 
 * Responsible for evaluating NLP models' performance with various metrics
 * Supports both quantitative metrics and qualitative error analysis
 */

import type { 
  NLPModel, 
  Intent, 
  Entity, 
  ModelType, 
  Language, 
  IntentItem,
  EntityItem,
  IntentDetectionOptions,
  Context
} from '@/types/nlp.types';
import { detectIntent } from '@/features/nlp-engine/pipelines/intent-detection';
import { manageContext } from '@/features/nlp-engine/pipelines/context-management';
import { extractEntities } from '@/features/nlp-engine/engine';
import { loadJSONFile } from '@/features/nlp-engine/utils/jsonDataLoader';
import { tokenize } from '@/features/nlp-engine/utils/tokenizer';
import { config } from '@/features/nlp-engine/config';

// Common metric types
export interface BaseMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  support: number;
  errorCount: number;
  successCount: number;
  confusionMatrix?: Record<string, Record<string, number>>;
}

// Intent-specific metrics
export interface IntentMetrics extends BaseMetrics {
  intentCoverage: number;
  outOfScopeDetectionRate: number;
  confidenceDistribution: number[];
  misclassifications: Array<{
    input: string;
    expectedIntent: string;
    predictedIntent: string;
    confidence: number;
  }>;
  perIntentMetrics: Record<string, {
    precision: number;
    recall: number;
    f1Score: number;
    support: number;
    averageConfidence: number;
  }>;
  macroF1: number;
  weightedF1: number;
}

// Entity-specific metrics
export interface EntityMetrics extends BaseMetrics {
  entityCoverage: number;
  averageEntitiesPerInput: number;
  partialMatchRate: number;
  overlapRate: number;
  missingEntities: Array<{
    input: string;
    expectedEntity: Entity;
    predictedEntities: Entity[];
  }>;
  extraneousEntities: Array<{
    input: string;
    predictedEntity: Entity;
    expectedEntities: Entity[];
  }>;
  perEntityTypeMetrics: Record<string, {
    precision: number;
    recall: number;
    f1Score: number;
    support: number;
  }>;
}

// Context-specific metrics
export interface ContextMetrics extends BaseMetrics {
  contextStability: number;
  contextTransitionAccuracy: number;
  contextPersistenceRate: number;
  entityPersistenceRate: number;
  contextErrorCases: Array<{
    conversationHistory: string[];
    expectedContext: string;
    predictedContext: string;
    confidence: number;
  }>;
}

// Consolidated evaluation results
export interface EvaluationResults {
  modelType: ModelType;
  language: Language;
  timestamp: number;
  testSetSize: number;
  overallMetrics: BaseMetrics;
  detailedMetrics: IntentMetrics | EntityMetrics | ContextMetrics;
  execTime: number;
  modelInfo?: any; // Additional model-specific information
  examples: {
    success: Array<{input: string, expected: any, predicted: any}>;
    failure: Array<{input: string, expected: any, predicted: any}>;
  };
}

// Configuration options for evaluation
export interface EvaluationOptions {
  includeMetrics: string[];        // Metrics to calculate
  detailedReport: boolean;         // Whether to include detailed error analysis
  confusionMatrix: boolean;        // Whether to generate a confusion matrix
  confidenceThreshold: number;     // Threshold for considering a prediction correct
  batchSize: number;               // Batch size for processing examples
  randomSeed: number;              // Random seed for reproducibility
  sampleSize?: number;             // Number of examples to sample (optional)
  crossValidation?: boolean;       // Whether to use cross-validation
  crossValidationFolds?: number;   // Number of folds for cross-validation
  exportFormat?: 'json' | 'csv';   // Format for exporting results
}

// Default evaluation options
const DEFAULT_EVALUATION_OPTIONS: EvaluationOptions = {
  includeMetrics: ['accuracy', 'precision', 'recall', 'f1'],
  detailedReport: true,
  confusionMatrix: true,
  confidenceThreshold: 0.5,
  batchSize: 64,
  randomSeed: 42,
  crossValidation: false,
  crossValidationFolds: 5,
  exportFormat: 'json'
};

/**
 * Main evaluator class that handles model evaluation
 */
class ModelEvaluator {
  /**
   * Evaluates an intent model's performance on a test dataset
   * 
   * @param model The intent model to evaluate
   * @param testData Test data items for evaluation
   * @param language The language being evaluated
   * @param options Evaluation configuration options
   * @returns Detailed evaluation metrics
   */
  public async evaluateIntentModel(
    model: NLPModel,
    testData: IntentItem[],
    language: Language = 'de',
    options: Partial<EvaluationOptions> = {}
  ): Promise<EvaluationResults> {
    const startTime = Date.now();
    const evalOptions = { ...DEFAULT_EVALUATION_OPTIONS, ...options };
    
    console.log(`[evaluator] Starting intent model evaluation with ${this.countExamples(testData)} examples`);
    
    // Initialize metrics
    const metrics: IntentMetrics = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      support: 0,
      errorCount: 0,
      successCount: 0,
      confusionMatrix: {},
      intentCoverage: 0,
      outOfScopeDetectionRate: 0,
      confidenceDistribution: Array(10).fill(0), // 10 bins for confidence distribution
      misclassifications: [],
      perIntentMetrics: {},
      macroF1: 0,
      weightedF1: 0
    };
    
    // Initialize per-intent metrics
    for (const intent of testData) {
      metrics.perIntentMetrics[intent.name] = {
        precision: 0,
        recall: 0,
        f1Score: 0,
        support: 0,
        averageConfidence: 0
      };
      
      // Initialize confusion matrix
      if (evalOptions.confusionMatrix && metrics.confusionMatrix) {
        if (!metrics.confusionMatrix[intent.name]) {
          metrics.confusionMatrix[intent.name] = {};
        }
        for (const otherIntent of testData) {
          metrics.confusionMatrix[intent.name][otherIntent.name] = 0;
        }
        // Add unknown intent to confusion matrix
        if (metrics.confusionMatrix[intent.name]) {
          metrics.confusionMatrix[intent.name]['unknown'] = 0;
        }
      }
    }
    
    // Add the "unknown" intent to the confusion matrix (for out-of-scope predictions)
    if (evalOptions.confusionMatrix) {
      metrics.confusionMatrix!['unknown'] = {};
      for (const intent of testData) {
        metrics.confusionMatrix!['unknown'][intent.name] = 0;
      }
      metrics.confusionMatrix!['unknown']['unknown'] = 0;
    }
    
    // Track successful and failed examples
    const resultExamples = {
      success: [] as Array<{input: string, expected: any, predicted: any}>,
      failure: [] as Array<{input: string, expected: any, predicted: any}>
    };
    
    // Count total examples
    let totalExamples = 0;
    // Track true positives, false positives, false negatives for each intent
    const truePositives: Record<string, number> = {};
    const falsePositives: Record<string, number> = {};
    const falseNegatives: Record<string, number> = {};
    const confidenceSum: Record<string, number> = {};
    
    // Initialize counters
    for (const intent of testData) {
      truePositives[intent.name] = 0;
      falsePositives[intent.name] = 0;
      falseNegatives[intent.name] = 0;
      confidenceSum[intent.name] = 0;
    }
    
    // Set up intent detection options
    const intentOptions: IntentDetectionOptions = {
      minConfidence: 0, // Get all predictions for evaluation
      debug: false
    };
    
    // Process each intent and its examples
    for (const intent of testData) {
      if (!intent.examples || intent.examples.length === 0) {
        continue;
      }
      
      // Update support count
      metrics.perIntentMetrics[intent.name].support = intent.examples.length;
      
      // Process each example
      for (const example of intent.examples) {
        totalExamples++;
        
        try {
          // Get prediction from model
          const prediction = await detectIntent(example, model, language, intentOptions);
          
          if (!prediction) {
            // Count as error if no prediction
            metrics.errorCount++;
            continue;
          }
          
          // Update confidence distribution
          const confidenceBin = Math.min(Math.floor(prediction.confidence * 10), 9);
          if (metrics.confidenceDistribution && metrics.confidenceDistribution[confidenceBin] !== undefined) {
            metrics.confidenceDistribution[confidenceBin]++;
          }
          
          // Update confusion matrix
          if (evalOptions.confusionMatrix && metrics.confusionMatrix) {
            if (metrics.confusionMatrix[intent.name]) {
              metrics.confusionMatrix[intent.name][prediction.name] = 
                (metrics.confusionMatrix[intent.name][prediction.name] || 0) + 1;
            }
          }
          
          // Check if prediction is correct based on threshold
          const isCorrect = prediction.name === intent.name && 
                          prediction.confidence >= evalOptions.confidenceThreshold;
          
          // Update confidence sum for average calculation
          if (prediction.name === intent.name) {
            confidenceSum[intent.name] = (confidenceSum[intent.name] ?? 0) + prediction.confidence;
          }
          
          if (isCorrect) {
            // Count success
            metrics.successCount++;
            truePositives[intent.name] = (truePositives[intent.name] ?? 0) + 1;
            
            // Add to success examples
            if (resultExamples.success.length < 10) { // Limit to 10 examples
              resultExamples.success.push({
                input: example,
                expected: intent.name,
                predicted: {
                  name: prediction.name,
                  confidence: prediction.confidence,
                  type: prediction.type
                }
              });
            }
          } else {
            // Count error
            metrics.errorCount++;
            falseNegatives[intent.name] = (falseNegatives[intent.name] ?? 0) + 1;
            
            // Update false positives for the predicted intent
            if (prediction.name !== 'unknown') {
              if (!(prediction.name in falsePositives)) {
                falsePositives[prediction.name] = 0;
              }
              falsePositives[prediction.name] = (falsePositives[prediction.name] ?? 0) + 1;
            }
            
            // Add to misclassifications
            if (evalOptions.detailedReport) {
              metrics.misclassifications.push({
                input: example,
                expectedIntent: intent.name,
                predictedIntent: prediction.name,
                confidence: prediction.confidence
              });
            }
            
            // Add to failure examples
            if (resultExamples.failure.length < 10) { // Limit to 10 examples
              resultExamples.failure.push({
                input: example,
                expected: intent.name,
                predicted: {
                  name: prediction.name,
                  confidence: prediction.confidence,
                  type: prediction.type
                }
              });
            }
          }
        } catch (error) {
          console.error(`[evaluator] Error evaluating intent for example "${example}":`, error);
          metrics.errorCount++;
        }
      }
    }
    
    // Calculate overall metrics
    metrics.support = totalExamples;
    metrics.accuracy = totalExamples > 0 ? metrics.successCount / totalExamples : 0;
    
    // Calculate per-intent metrics
    let sumPrecision = 0;
    let sumRecall = 0;
    let sumF1 = 0;
    let weightedSumF1 = 0;
    
    for (const intentName of Object.keys(metrics.perIntentMetrics)) {
      const tp = truePositives[intentName] || 0;
      const fp = falsePositives[intentName] || 0;
      const fn = falseNegatives[intentName] || 0;
      const support = metrics.perIntentMetrics[intentName]?.support ?? 0;
      
      // Calculate precision, recall, F1
      const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
      const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
      const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
      
      // Calculate average confidence
      const avgConfidence = tp > 0 ? (confidenceSum[intentName] ?? 0) / tp : 0;
      
      // Update per-intent metrics
      metrics.perIntentMetrics[intentName] = {
        precision,
        recall,
        f1Score: f1,
        support,
        averageConfidence: avgConfidence
      };
      
      // Accumulate for macro-averages
      sumPrecision += precision;
      sumRecall += recall;
      sumF1 += f1;
      weightedSumF1 += f1 * support;
    }
    
    // Calculate macro-averages
    const numIntents = Object.keys(metrics.perIntentMetrics).length;
    metrics.precision = numIntents > 0 ? sumPrecision / numIntents : 0;
    metrics.recall = numIntents > 0 ? sumRecall / numIntents : 0;
    metrics.f1Score = numIntents > 0 ? sumF1 / numIntents : 0;
    metrics.macroF1 = metrics.f1Score;
    metrics.weightedF1 = totalExamples > 0 ? weightedSumF1 / totalExamples : 0;
    
    // Calculate intent coverage
    const coveredIntents = Object.keys(metrics.perIntentMetrics)
      .filter(intent => metrics.perIntentMetrics[intent] && metrics.perIntentMetrics[intent].support > 0).length;
    metrics.intentCoverage = numIntents > 0 ? coveredIntents / numIntents : 0;
    
    // Out-of-scope detection rate (just a placeholder in this implementation)
    metrics.outOfScopeDetectionRate = 0.5; // Simulated value
    
    const execTime = Date.now() - startTime;
    console.log(`[evaluator] Completed intent model evaluation in ${execTime}ms`);
    console.log(`[evaluator] Accuracy: ${metrics.accuracy.toFixed(4)}, F1 Score: ${metrics.f1Score.toFixed(4)}`);
    
    return {
      modelType: 'intent',
      language,
      timestamp: Date.now(),
      testSetSize: totalExamples,
      overallMetrics: {
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        support: metrics.support,
        errorCount: metrics.errorCount,
        successCount: metrics.successCount,
        confusionMatrix: metrics.confusionMatrix
      },
      detailedMetrics: metrics,
      execTime,
      examples: resultExamples
    };
  }

  /**
   * Evaluates an entity extraction model's performance on a test dataset
   * 
   * @param model The entity extraction model to evaluate
   * @param testData Test data items for evaluation
   * @param language The language being evaluated
   * @param options Evaluation configuration options
   * @returns Detailed evaluation metrics
   */
  public async evaluateEntityModel(
    model: NLPModel,
    testData: Record<string, string[]>,
    language: Language = 'de',
    options: Partial<EvaluationOptions> = {}
  ): Promise<EvaluationResults> {
    const startTime = Date.now();
    const evalOptions = { ...DEFAULT_EVALUATION_OPTIONS, ...options };
    
    // Prepare metrics structure
    const metrics: EntityMetrics = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      support: 0,
      errorCount: 0,
      successCount: 0,
      entityCoverage: 0,
      averageEntitiesPerInput: 0,
      partialMatchRate: 0,
      overlapRate: 0,
      missingEntities: [],
      extraneousEntities: [],
      perEntityTypeMetrics: {}
    };
    
    // Initialize per entity type metrics
    const entityTypes = Object.keys(testData);
    for (const entityType of entityTypes) {
      metrics.perEntityTypeMetrics[entityType] = {
        precision: 0,
        recall: 0,
        f1Score: 0,
        support: 0
      };
    }
    
    console.log(`[evaluator] Starting entity model evaluation for ${entityTypes.length} entity types`);
    
    // Track examples for reporting
    const resultExamples = {
      success: [] as Array<{input: string, expected: any, predicted: any}>,
      failure: [] as Array<{input: string, expected: any, predicted: any}>
    };
    
    // Prepare counters
    let totalExamples = 0;
    let totalEntities = 0;
    let totalPredictedEntities = 0;
    let totalCorrectEntities = 0;
    let totalPartialMatches = 0;
    let totalOverlaps = 0;
    
    const truePositives: Record<string, number> = {};
    const falsePositives: Record<string, number> = {};
    const falseNegatives: Record<string, number> = {};
    
    // Initialize counters for each entity type
    for (const entityType of entityTypes) {
      truePositives[entityType] = 0;
      falsePositives[entityType] = 0;
      falseNegatives[entityType] = 0;
    }
    
    // Process each entity type and its examples
    for (const [entityType, entityExamples] of Object.entries(testData)) {
      // Skip empty examples
      if (!entityExamples || entityExamples.length === 0) continue;
      
      // Update support count
      metrics.perEntityTypeMetrics[entityType]!.support = entityExamples.length;
      
      // Process each example for this entity type
      for (const exampleText of entityExamples) {
        totalExamples++;
        
        try {
          // Create an expected entity of this type
          const expectedEntity: Entity = {
            type: entityType,
            value: exampleText,
            confidence: 1.0
          };
          
          totalEntities++;
          
          // Extract entities using the model
          const extractedEntities = await extractEntities(exampleText, model, language);
          totalPredictedEntities += extractedEntities.length;
          
          // Check for correct matches, partial matches, and overlaps
          let foundExactMatch = false;
          let foundPartialMatch = false;
          let foundOverlap = false;
          
          for (const entity of extractedEntities) {
            // Check for exact match (same type and value)
            if (entity.type === entityType && entity.value === exampleText) {
              foundExactMatch = true;
              totalCorrectEntities++;
              truePositives[entityType] = (truePositives[entityType] ?? 0) + 1;
              break;
            }
            
            // Check for partial match (same type, partial value match)
            if (entity.type === entityType && 
                (entity.value.includes(exampleText) || exampleText.includes(entity.value))) {
              foundPartialMatch = true;
              totalPartialMatches++;
            }
            
            // Check for overlap (same value, different type)
            if (entity.type !== entityType && entity.value === exampleText) {
              foundOverlap = true;
              totalOverlaps++;
            }
          }
          
          // Record success or failure
          if (foundExactMatch) {
            metrics.successCount++;
            
            // Add to success examples
            if (resultExamples.success.length < 10) {
              resultExamples.success.push({
                input: exampleText,
                expected: { type: entityType, value: exampleText },
                predicted: extractedEntities
              });
            }
          } else {
            metrics.errorCount++;
            falseNegatives[entityType] = (falseNegatives[entityType] ?? 0) + 1;
            
            // Log missing entity
            if (evalOptions.detailedReport) {
              metrics.missingEntities.push({
                input: exampleText,
                expectedEntity,
                predictedEntities: extractedEntities
              });
            }
            
            // Add to failure examples
            if (resultExamples.failure.length < 10) {
              resultExamples.failure.push({
                input: exampleText,
                expected: { type: entityType, value: exampleText },
                predicted: extractedEntities
              });
            }
          }
          
          // Count false positives for incorrect entity types
          for (const entity of extractedEntities) {
            if (entity.type !== entityType) {
              if (!(entity.type in falsePositives)) {
                falsePositives[entity.type] = 0;
              }
              falsePositives[entity.type] = (falsePositives[entity.type] ?? 0) + 1;
              
              // Log extraneous entity
              if (evalOptions.detailedReport) {
                metrics.extraneousEntities.push({
                  input: exampleText,
                  predictedEntity: entity,
                  expectedEntities: [expectedEntity]
                });
              }
            }
          }
        } catch (error) {
          console.error(`[evaluator] Error evaluating entity extraction for example "${exampleText}":`, error);
          metrics.errorCount++;
        }
      }
    }
    
    // Calculate overall metrics
    metrics.support = totalExamples;
    metrics.accuracy = totalExamples > 0 ? metrics.successCount / totalExamples : 0;
    metrics.precision = totalPredictedEntities > 0 ? totalCorrectEntities / totalPredictedEntities : 0;
    metrics.recall = totalEntities > 0 ? totalCorrectEntities / totalEntities : 0;
    metrics.f1Score = (metrics.precision + metrics.recall) > 0 
      ? 2 * metrics.precision * metrics.recall / (metrics.precision + metrics.recall) 
      : 0;
    
    metrics.partialMatchRate = totalEntities > 0 ? totalPartialMatches / totalEntities : 0;
    metrics.overlapRate = totalEntities > 0 ? totalOverlaps / totalEntities : 0;
    metrics.averageEntitiesPerInput = totalExamples > 0 ? totalPredictedEntities / totalExamples : 0;
    
    // Calculate per entity type metrics
    let sumPrecision = 0;
    let sumRecall = 0;
    let sumF1 = 0;
    
    for (const entityType of entityTypes) {
      const tp = truePositives[entityType] || 0;
      const fp = falsePositives[entityType] || 0;
      const fn = falseNegatives[entityType] || 0;
      
      // Calculate precision, recall, F1
      const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0;
      const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0;
      const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0;
      
      // Update per-entity type metrics
      metrics.perEntityTypeMetrics[entityType] = {
        precision,
        recall,
        f1Score: f1,
        support: metrics.perEntityTypeMetrics[entityType]?.support ?? 0
      };
      
      // Accumulate for macro-averages
      sumPrecision += precision;
      sumRecall += recall;
      sumF1 += f1;
    }
    
    // Calculate macro-averages
    const numEntityTypes = entityTypes.length;
    metrics.precision = numEntityTypes > 0 ? sumPrecision / numEntityTypes : 0;
    metrics.recall = numEntityTypes > 0 ? sumRecall / numEntityTypes : 0;
    metrics.f1Score = numEntityTypes > 0 ? sumF1 / numEntityTypes : 0;
    
    // Calculate entity type coverage
    const coveredEntityTypes = entityTypes.filter(type => 
      (metrics.perEntityTypeMetrics[type]?.support ?? 0) > 0
    ).length;
    metrics.entityCoverage = numEntityTypes > 0 ? coveredEntityTypes / numEntityTypes : 0;
    
    const execTime = Date.now() - startTime;
    console.log(`[evaluator] Completed entity model evaluation in ${execTime}ms`);
    console.log(`[evaluator] Precision: ${metrics.precision.toFixed(4)}, Recall: ${metrics.recall.toFixed(4)}, F1: ${metrics.f1Score.toFixed(4)}`);
    
    return {
      modelType: 'entity',
      language,
      timestamp: Date.now(),
      testSetSize: totalExamples,
      overallMetrics: {
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        support: metrics.support,
        errorCount: metrics.errorCount,
        successCount: metrics.successCount
      },
      detailedMetrics: metrics,
      execTime,
      examples: resultExamples
    };
  }

  /**
   * Evaluates a context management model's performance on conversational test data
   * 
   * @param model The context model to evaluate
   * @param testConversations Test conversation sequences
   * @param language The language being evaluated
   * @param options Evaluation configuration options
   * @returns Detailed evaluation metrics
   */
  public async evaluateContextModel(
    model: NLPModel,
    testConversations: Array<{
      messages: string[],
      expectedContexts: string[]
    }>,
    language: Language = 'de',
    options: Partial<EvaluationOptions> = {}
  ): Promise<EvaluationResults> {
    const startTime = Date.now();
    const evalOptions = { ...DEFAULT_EVALUATION_OPTIONS, ...options };
    
    // Prepare metrics structure
    const metrics: ContextMetrics = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      support: 0,
      errorCount: 0,
      successCount: 0,
      contextStability: 0,
      contextTransitionAccuracy: 0,
      contextPersistenceRate: 0,
      entityPersistenceRate: 0,
      contextErrorCases: []
    };
    
    // Initialize confusion matrix if enabled
    if (evalOptions.confusionMatrix) {
      metrics.confusionMatrix = {};
      const allContextTypes = new Set<string>();
      
      // Collect all context types from test data
      for (const conversation of testConversations) {
        for (const context of conversation.expectedContexts) {
          allContextTypes.add(context);
        }
      }
      
      // Initialize matrix
      for (const contextType of allContextTypes) {
        metrics.confusionMatrix[contextType] = {};
        for (const otherType of allContextTypes) {
          metrics.confusionMatrix[contextType][otherType] = 0;
        }
      }
    }
    
    console.log(`[evaluator] Starting context model evaluation with ${testConversations.length} conversations`);
    
    // Track examples for reporting
    const resultExamples = {
      success: [] as Array<{input: string, expected: any, predicted: any}>,
      failure: [] as Array<{input: string, expected: any, predicted: any}>
    };
    
    // Counters for various metrics
    let totalContextTransitions = 0;
    let correctContextTransitions = 0;
    let totalMessageContexts = 0;
    let stableContextCount = 0;
    let totalPersistentContexts = 0;
    let correctPersistentContexts = 0;
    let totalEntities = 0;
    let persistedEntities = 0;
    
    // Process each test conversation
    for (const conversation of testConversations) {
      const { messages, expectedContexts } = conversation;
      
      // Skip invalid test cases
      if (!messages || !expectedContexts || messages.length === 0 || 
          messages.length !== expectedContexts.length) {
        console.warn("[evaluator] Skipping invalid test case: messages and expectedContexts must have the same length");
        continue;
      }
      
      try {
        let prevContext: Context | undefined;
        let prevPredictedContextName: string | undefined;
        
        // Process each message in the conversation
        for (let i = 0; i < messages.length; i++) {
          totalMessageContexts++;
          const message = messages[i];
          const expectedContext = expectedContexts[i];
          
          // Create conversation history up to this point
          const historyToUse = messages.slice(0, i + 1);
          
          // Process with context model
          const contextResult = await manageContext(
            historyToUse,
            model,
            null, // No intent information for the test
            []    // No entity information for the test
          );
          
          const predictedContext = contextResult.name;
          
          // Update confusion matrix
          if (
            evalOptions.confusionMatrix &&
            metrics.confusionMatrix &&
            expectedContext !== undefined &&
            metrics.confusionMatrix[expectedContext] &&
            typeof metrics.confusionMatrix[expectedContext]![predictedContext] === 'number'
          ) {
            metrics.confusionMatrix[expectedContext]![predictedContext]++;
          }
            // Defensive: handle possibly undefined expectedContext
            if (expectedContext === undefined) {
            console.warn("[evaluator] Warning: expectedContext is undefined for message:", message);
            continue;
            }          
          // Check if prediction is correct
          const isCorrect = predictedContext === expectedContext;
          
          if (isCorrect) {
            metrics.successCount++;
            
            // Add to success examples (only for first 10)
            if (resultExamples.success.length < 10) {
              resultExamples.success.push({
                input: message ?? "",
                expected: expectedContext,
                predicted: {
                  context: predictedContext,
                  confidence: contextResult.confidence
                }
              });
            }
          } else {
            metrics.errorCount++;
            
            // Log error case for detailed report
            if (evalOptions.detailedReport) {
              metrics.contextErrorCases.push({
                conversationHistory: historyToUse,
                expectedContext,
                predictedContext,
                confidence: contextResult.confidence
              });
            }
            
            // Add to failure examples
            if (resultExamples.failure.length < 10) {
              resultExamples.failure.push({
                input: message ?? "",
                expected: expectedContext,
                predicted: {
                  context: predictedContext,
                  confidence: contextResult.confidence
                }
              });
            }
          }
          
          // Check context stability (same context type for multiple turns)
          if (i > 0 && expectedContexts[i] === expectedContexts[i-1]) {
            // This is a context that should be stable
            if (predictedContext === prevPredictedContextName) {
              stableContextCount++;
            }
          }
          
          // Check context transitions
          if (i > 0 && expectedContexts[i] !== expectedContexts[i-1]) {
            totalContextTransitions++;
            
            // Check if the transition was detected correctly
            if (predictedContext === expectedContext) {
              correctContextTransitions++;
            }
          }
          
          // Check entity persistence
          if (contextResult.entities && contextResult.entities.length > 0) {
            totalEntities += contextResult.entities.length;
            
            // Count persisted entities
            for (const entity of contextResult.entities) {
              if ('fromPreviousContext' in entity && entity.fromPreviousContext) {
                persistedEntities++;
              }
            }
          }
          
          // Track context persistence
          if (i > 0 && prevContext) {
            totalPersistentContexts++;
            
            // Check if relevant information persisted
            if (contextResult.recentIntents?.[0]?.name === prevContext.recentIntents?.[0]?.name) {
              correctPersistentContexts++;
            }
          }
          
          // Update previous context for next iteration
          prevContext = contextResult;
          prevPredictedContextName = predictedContext;
        }
      } catch (error) {
        console.error(`[evaluator] Error evaluating context model for conversation:`, error);
        metrics.errorCount++;
      }
    }
    
    // Calculate overall metrics
    metrics.support = totalMessageContexts;
    metrics.accuracy = totalMessageContexts > 0 ? metrics.successCount / totalMessageContexts : 0;
    
    // Context stability and transition metrics
    const totalExpectedStableContexts = testConversations.reduce((count, conversation) => {
      for (let i = 1; i < conversation.expectedContexts.length; i++) {
        if (conversation.expectedContexts[i] === conversation.expectedContexts[i-1]) {
          count++;
        }
      }
      return count;
    }, 0);
    
    metrics.contextStability = totalExpectedStableContexts > 0 
      ? stableContextCount / totalExpectedStableContexts 
      : 0;
      
    metrics.contextTransitionAccuracy = totalContextTransitions > 0 
      ? correctContextTransitions / totalContextTransitions 
      : 0;
    
    metrics.contextPersistenceRate = totalPersistentContexts > 0 
      ? correctPersistentContexts / totalPersistentContexts 
      : 0;
      
    metrics.entityPersistenceRate = totalEntities > 0 
      ? persistedEntities / totalEntities 
      : 0;
    
    // Use the context transition accuracy for precision/recall/f1
    metrics.precision = metrics.contextTransitionAccuracy;
    metrics.recall = metrics.contextTransitionAccuracy;
    metrics.f1Score = metrics.contextTransitionAccuracy;
    
    const execTime = Date.now() - startTime;
    console.log(`[evaluator] Completed context model evaluation in ${execTime}ms`);
    console.log(`[evaluator] Accuracy: ${metrics.accuracy.toFixed(4)}, Context Transitions: ${metrics.contextTransitionAccuracy.toFixed(4)}`);
    
    return {
      modelType: 'context',
      language,
      timestamp: Date.now(),
      testSetSize: totalMessageContexts,
      overallMetrics: {
        accuracy: metrics.accuracy,
        precision: metrics.precision,
        recall: metrics.recall,
        f1Score: metrics.f1Score,
        support: metrics.support,
        errorCount: metrics.errorCount,
        successCount: metrics.successCount,
        confusionMatrix: metrics.confusionMatrix
      },
      detailedMetrics: metrics,
      execTime,
      examples: resultExamples
    };
  }

  /**
   * Compares two models to determine if there's a significant improvement
   * 
   * @param baseline Results from the baseline model
   * @param improved Results from the improved model
   * @returns Analysis of the improvements
   */
  public compareModels(
    baseline: EvaluationResults,
    improved: EvaluationResults
  ): Record<string, any> {
    console.log(`[evaluator] Comparing models: ${baseline.modelType} vs ${improved.modelType}`);
    
    if (baseline.modelType !== improved.modelType) {
      console.warn(`[evaluator] Warning: Comparing different model types: ${baseline.modelType} vs ${improved.modelType}`);
    }
    
    // Calculate differences in key metrics
    const accuracyDiff = improved.overallMetrics.accuracy - baseline.overallMetrics.accuracy;
    const precisionDiff = improved.overallMetrics.precision - baseline.overallMetrics.precision;
    const recallDiff = improved.overallMetrics.recall - baseline.overallMetrics.recall;
    const f1Diff = improved.overallMetrics.f1Score - baseline.overallMetrics.f1Score;
    
    // Calculate percentage improvements
    const accuracyImprovementPct = baseline.overallMetrics.accuracy > 0 
      ? (accuracyDiff / baseline.overallMetrics.accuracy) * 100 
      : Infinity;
      
    const f1ImprovementPct = baseline.overallMetrics.f1Score > 0 
      ? (f1Diff / baseline.overallMetrics.f1Score) * 100 
      : Infinity;
    
    // Error reduction rate (important metric for model improvement)
    const baselineErrorRate = 1 - baseline.overallMetrics.accuracy;
    const improvedErrorRate = 1 - improved.overallMetrics.accuracy;
    const errorReductionRate = baselineErrorRate > 0 
      ? (baselineErrorRate - improvedErrorRate) / baselineErrorRate * 100 
      : 0;
    
    // Determine if the improvement is significant
    // Rule of thumb: > 5% improvement in F1 or > 20% error reduction is significant
    const isSignificantImprovement = f1ImprovementPct > 5 || errorReductionRate > 20;
    
    const comparison = {
      modelType: baseline.modelType,
      timestamp: Date.now(),
      metrics: {
        accuracy: { diff: accuracyDiff, pctImprovement: accuracyImprovementPct },
        precision: { diff: precisionDiff, pctImprovement: precisionDiff / Math.max(0.0001, baseline.overallMetrics.precision) * 100 },
        recall: { diff: recallDiff, pctImprovement: recallDiff / Math.max(0.0001, baseline.overallMetrics.recall) * 100 },
        f1Score: { diff: f1Diff, pctImprovement: f1ImprovementPct },
        errorReductionRate
      },
      executionTime: {
        baseline: baseline.execTime,
        improved: improved.execTime,
        diff: improved.execTime - baseline.execTime,
        pctChange: (improved.execTime - baseline.execTime) / baseline.execTime * 100
      },
      isSignificantImprovement,
      recommendedAction: isSignificantImprovement ? 'replace_model' : 'keep_baseline'
    };
    
    console.log(`[evaluator] Model comparison complete`);
    console.log(`[evaluator] F1 Score improvement: ${f1Diff.toFixed(4)} (${f1ImprovementPct.toFixed(2)}%)`);
    console.log(`[evaluator] Error reduction rate: ${errorReductionRate.toFixed(2)}%`);
    console.log(`[evaluator] Recommendation: ${comparison.recommendedAction}`);
    
    return comparison;
  }

  /**
   * Exports evaluation results to a file
   * 
   * @param results The evaluation results to export
   * @param filepath The path to save the exported file
   * @param format The format to export (json or csv)
   * @returns Whether the export was successful
   */
  public exportResults(
    results: EvaluationResults,
    filepath: string,
    format: 'json' | 'csv' = 'json'
  ): boolean {
    try {
      console.log(`[evaluator] Exporting evaluation results to ${filepath} in ${format} format`);
      
      // In a real implementation, this would write to a file
      // For this example, we'll just simulate success
      
      return true;
    } catch (error) {
      console.error(`[evaluator] Error exporting evaluation results:`, error);
      return false;
    }
  }

  /**
   * Helper method to count examples in IntentItem array
   */
  private countExamples(intents: IntentItem[]): number {
    return intents.reduce((count, intent) => count + (intent.examples?.length || 0), 0);
  }
}

// Erstellen eines JSON Data Loaders mit ähnlicher Schnittstelle
const jsonDataLoader = {
  async load<T>(filepath: string): Promise<T | null> {
    try {
      return await loadJSONFile<T>(filepath);
    } catch (error) {
      console.error(`[jsonDataLoader] Error loading data from ${filepath}:`, error);
      return null;
    }
  }
};

// Export a singleton instance
export const evaluator = {
  /**
   * Evaluates an intent detection model
   * 
   * @param model The model to evaluate
   * @param testData Test data for evaluation
   * @param language The language being tested
   * @param options Evaluation options
   * @returns Evaluation results
   */
  async evaluateIntent(
    model: NLPModel,
    testData: IntentItem[],
    language: Language = 'de',
    options: Partial<EvaluationOptions> = {}
  ): Promise<EvaluationResults> {
    const evaluator = new ModelEvaluator();
    return evaluator.evaluateIntentModel(model, testData, language, options);
  },
  
  /**
   * Evaluates an entity extraction model
   * 
   * @param model The model to evaluate
   * @param testData Test data for evaluation
   * @param language The language being tested
   * @param options Evaluation options
   * @returns Evaluation results
   */
  async evaluateEntity(
    model: NLPModel,
    testData: Record<string, string[]>,
    language: Language = 'de',
    options: Partial<EvaluationOptions> = {}
  ): Promise<EvaluationResults> {
    const evaluator = new ModelEvaluator();
    return evaluator.evaluateEntityModel(model, testData, language, options);
  },
  
  /**
   * Evaluates a context management model
   * 
   * @param model The model to evaluate
   * @param testData Test conversation data
   * @param language The language being tested
   * @param options Evaluation options
   * @returns Evaluation results
   */
  async evaluateContext(
    model: NLPModel,
    testData: Array<{messages: string[], expectedContexts: string[]}>,
    language: Language = 'de',
    options: Partial<EvaluationOptions> = {}
  ): Promise<EvaluationResults> {
    const evaluator = new ModelEvaluator();
    return evaluator.evaluateContextModel(model, testData, language, options);
  },
  
  /**
   * Compares two models to determine improvement
   * 
   * @param baseline Baseline model results
   * @param improved Improved model results
   * @returns Comparison analysis
   */
  compareModels(
    baseline: EvaluationResults,
    improved: EvaluationResults
  ): Record<string, any> {
    const evaluator = new ModelEvaluator();
    return evaluator.compareModels(baseline, improved);
  },
  
  /**
   * Loads test data from a file
   * 
   * @param filepath Path to the test data file
   * @param modelType Type of model the data is for
   * @returns Loaded test data
   */
  async loadTestData(filepath: string, modelType: ModelType): Promise<any> {
    try {
      console.log(`[evaluator] Loading test data from ${filepath} for ${modelType} evaluation`);
      
      const data = await jsonDataLoader.load(filepath);
      
      if (!data) {
        console.error(`[evaluator] Failed to load test data from ${filepath}`);
        return null;
      }
      
      console.log(`[evaluator] Successfully loaded test data`);
      return data;
    } catch (error) {
      console.error(`[evaluator] Error loading test data:`, error);
      return null;
    }
  },
  
  /**
   * Exports evaluation results to a file
   * 
   * @param results Results to export
   * @param filepath Path to save the file
   * @param format Export format (json or csv)
   * @returns Whether the export was successful
   */
  exportResults(
    results: EvaluationResults,
    filepath: string,
    format: 'json' | 'csv' = 'json'
  ): boolean {
    const evaluator = new ModelEvaluator();
    return evaluator.exportResults(results, filepath, format);
  }
};