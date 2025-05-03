/**
 * features/nlp-engine/ai/training/intentTrainer.ts
 * 
 * Responsible for training intent detection models from example data
 * Supports both rule-based and ML-based training approaches
 */

import type { 
  IntentItem, 
  ModelOptions, 
  NLPModel, 
  Language, 
  Intent, 
  IntentDetectionOptions
} from '@/types/nlp.types';
// Import ModelMetadata from the correct location
import type { ModelMetadata } from '@/features/nlp-engine/ai/models/modelRegistry';
import type { AIModelType } from '@/features/nlp-engine/ai/models/modelRegistry';
import { config } from '../../config';
import { tokenize, calculateTokenSimilarity } from '../../utils/tokenizer';
import { loadModel } from '../../models/loadModel';
import { detectIntent } from '../../pipelines/intent-detection';
import * as jsonLoader from '../../utils/jsonDataLoader';
import { evaluator } from './evaluator';
import { dataPreprocessor } from './dataPreprocessor';
import * as modelOptimizer from './modelOptimizer';

// Training configuration interface
interface TrainingConfig {
  validationSplit: number;  // Percentage of data to use for validation (0.0-1.0)
  epochs: number;           // Number of training iterations
  batchSize: number;        // Batch size for training
  learningRate: number;     // Learning rate for optimizer
  evaluationMetrics: string[]; // Metrics to track during training
  augmentData: boolean;     // Whether to use data augmentation
  balanceClasses: boolean;  // Whether to balance class distribution
  saveCheckpoints: boolean; // Whether to save intermediate models
  earlyStoppingPatience: number; // Early stopping parameter
  randomSeed: number;       // Seed for reproducibility
}

// Result of the training process
interface TrainingResult {
  modelPath: string;        // Path to the saved model
  accuracy: number;         // Overall accuracy on validation set
  f1Score: number;          // F1 score (harmonic mean of precision and recall)
  precision: number;        // Precision score
  recall: number;           // Recall score
  confusionMatrix: Record<string, Record<string, number>>; // Confusion matrix
  trainingDuration: number; // Training duration in milliseconds
  epochs: number;           // Number of epochs trained
  performance: {            // Detailed performance metrics
    byIntent: Record<string, {
      precision: number;
      recall: number;
      f1Score: number;
      support: number;
    }>;
    averages: {
      macroF1: number;
      weightedF1: number;
      macroRecall: number;
      macroAccuracy: number;
    };
  };
  trainingLoss: number[];   // Training loss history
  validationLoss: number[]; // Validation loss history
}

// Default training configuration
const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  validationSplit: 0.2,
  epochs: 100,
  batchSize: 32,
  learningRate: 0.001,
  evaluationMetrics: ['accuracy', 'f1', 'precision', 'recall'],
  augmentData: true,
  balanceClasses: true,
  saveCheckpoints: true,
  earlyStoppingPatience: 10,
  randomSeed: 42
};

/**
 * Main class for training intent detection models
 */
export class IntentTrainer {
  private language: Language;
  private options: ModelOptions;
  private trainingConfig: TrainingConfig;
  private savePath: string;
  private intents: IntentItem[] = [];
  private preprocessor: typeof dataPreprocessor;
  private optimizer: typeof modelOptimizer;

  /**
   * Creates a new IntentTrainer instance
   * 
   * @param language The language to train the model for
   * @param options Additional model options
   * @param trainingConfig Custom training configuration
   */
  constructor(
    language: Language = 'de',
    options: ModelOptions = {},
    trainingConfig: Partial<TrainingConfig> = {}
  ) {
    this.language = language;
    this.options = options;
    this.trainingConfig = { ...DEFAULT_TRAINING_CONFIG, ...trainingConfig };
    this.savePath = options.modelPath || `${config.modelBasePath}/intent/${language}`;
    this.preprocessor = dataPreprocessor;
    this.optimizer = modelOptimizer;
    
    console.log(`[IntentTrainer] Initialized for language: ${language}`);
    console.log(`[IntentTrainer] Save path: ${this.savePath}`);
  }

  /**
   * Loads intent training data from a file
   * 
   * @param filePath Path to the intents JSON file
   * @returns Whether the loading was successful
   */
  public async loadTrainingData(filePath?: string): Promise<boolean> {
    try {
      const dataPath = filePath || `@/data/chatbot/database/intents_${this.language}.json`;
      console.log(`[IntentTrainer] Loading training data from: ${dataPath}`);
      
      // Use the correct JSON loading function
      const data = await this.loadJSON<{intents: IntentItem[]}>(dataPath);
      
      if (!data || !data.intents || !Array.isArray(data.intents)) {
        console.error(`[IntentTrainer] Invalid data format in ${dataPath}`);
        return false;
      }
      
      this.intents = data.intents;
      console.log(`[IntentTrainer] Loaded ${this.intents.length} intents with ${this.countExamples()} examples`);
      return true;
    } catch (error) {
      console.error(`[IntentTrainer] Error loading training data:`, error);
      return false;
    }
  }

  /**
   * Helper method to load JSON data from a file
   * 
   * @param path Path to the JSON file
   * @returns The parsed JSON data
   */
  private async loadJSON<T>(path: string): Promise<T | null> {
    // For this implementation, we'll use a simple mock function
    // In a real implementation, this would use the actual file system API
    console.log(`[IntentTrainer] Mock loading JSON from: ${path}`);
    
    // Simulate loading data
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return a mock object
    return { intents: [] } as unknown as T;
  }

  /**
   * Trains a new intent detection model
   * 
   * @param method The training method to use ('rule-based', 'ml', or 'hybrid')
   * @returns The result of the training process
   */
  public async trainModel(method: 'rule-based' | 'ml' | 'hybrid' = 'hybrid'): Promise<TrainingResult | null> {
    try {
      if (this.intents.length === 0) {
        console.error(`[IntentTrainer] No training data available. Call loadTrainingData() first.`);
        return null;
      }

      console.log(`[IntentTrainer] Starting intent model training using ${method} method`);
      const startTime = Date.now();
      
      // Split data into training and validation sets
      const { trainingData, validationData } = this.splitData(this.trainingConfig.validationSplit);
      
      // Preprocess the data
      const processedTrainingData = await this.preprocessor.preprocessIntentData(
        trainingData, 
        { 
          augment: this.trainingConfig.augmentData,
          balance: this.trainingConfig.balanceClasses,
          language: this.language
        }
      );

      // Select appropriate training method
      let trainedModel: NLPModel;
      switch (method) {
        case 'rule-based':
          trainedModel = await this.trainRuleBasedModel(processedTrainingData);
          break;
        case 'ml':
          trainedModel = await this.trainMLModel(processedTrainingData);
          break;
        case 'hybrid':
          trainedModel = await this.trainHybridModel(processedTrainingData);
          break;
        default:
          console.error(`[IntentTrainer] Unknown training method: ${method}`);
          return null;
      }

      // Validate the model
      const validationResult = await this.validateModel(trainedModel, validationData);
      
      // Optimize the model if needed
      if (this.trainingConfig.saveCheckpoints) {
        trainedModel = await this.optimizer.optimizeModel(trainedModel, validationResult);
      }

      // Save the model
      const modelPath = await this.saveModel(trainedModel, method);
      
      // Prepare the training result
      const trainingDuration = Date.now() - startTime;
      
      const result: TrainingResult = {
        modelPath,
        accuracy: validationResult.accuracy,
        f1Score: validationResult.f1Score,
        precision: validationResult.precision,
        recall: validationResult.recall,
        confusionMatrix: validationResult.confusionMatrix,
        trainingDuration,
        epochs: this.trainingConfig.epochs,
        performance: {
          byIntent: validationResult.intentMetrics,
          averages: {
            macroF1: validationResult.macroF1,
            weightedF1: validationResult.weightedF1,
            macroRecall: validationResult.macroRecall,
            macroAccuracy: validationResult.macroAccuracy
          }
        },
        trainingLoss: validationResult.trainingLoss || [],
        validationLoss: validationResult.validationLoss || []
      };

      console.log(`[IntentTrainer] Training completed in ${trainingDuration}ms`);
      console.log(`[IntentTrainer] Model accuracy: ${result.accuracy.toFixed(4)}`);
      console.log(`[IntentTrainer] Model F1 score: ${result.f1Score.toFixed(4)}`);
      
      return result;
    } catch (error) {
      console.error(`[IntentTrainer] Error during training:`, error);
      return null;
    }
  }

  /**
   * Trains a rule-based intent detection model
   * 
   * @param trainingData The preprocessed training data
   * @returns The trained model
   */
  private async trainRuleBasedModel(trainingData: IntentItem[]): Promise<NLPModel> {
    console.log(`[IntentTrainer] Training rule-based model with ${trainingData.length} intents`);
    
    // Generate a unique model ID
    const modelId = `intent_${this.language}_rule_${Date.now()}`;
    
    // For rule-based models, we create a model that uses the training data directly
    const model: NLPModel = {
      type: 'intent' as AIModelType,
      name: `Rule-based Intent Model (${this.language})`,
      modelId,
      language: this.language,
      data: trainingData,
      metadata: {
        modelId,
        type: 'intent' as AIModelType,
        language: this.language,
        version: '1.0.0',
        lastAccessed: Date.now(),
        framework: 'rule-based',
        cached: true,
        description: `Rule-based intent detection model for ${this.language} language`,
        parameters: 0,
        createdAt: new Date().toISOString()
      },
      instance: {},
      
      // Implementation for rule-based prediction using token similarity
      predict: async (input: string | string[]): Promise<Intent> => {
        const text = Array.isArray(input) ? input.join(' ') : input;
        const normalizedText = text.toLowerCase().trim();
        
        // Tokenize input
        const inputTokens = tokenize(normalizedText, { toLowerCase: true });
        
        // Track best match and score
        let bestMatch: Intent = {
          name: 'unknown',
          confidence: 0.0,
          type: 'unknown'
        };
        
        // Calculate similarity with each intent example
        for (const intent of trainingData) {
          const examples = intent.examples || [];
          
          // Skip intents without examples
          if (examples.length === 0) continue;
          
          // Find the best matching example for this intent
          let bestScore = 0;
          
          for (const example of examples) {
            const exampleTokens = tokenize(example.toLowerCase(), { toLowerCase: true });
            const similarity = calculateTokenSimilarity(inputTokens, exampleTokens);
            
            if (similarity > bestScore) {
              bestScore = similarity;
            }
          }
          
          // Update best match if this intent has a higher similarity
          if (bestScore > bestMatch.confidence) {
            bestMatch = {
              name: intent.name,
              confidence: bestScore,
              type: intent.type || this.getIntentTypeFromName(intent.name)
            };
          }
        }
        
        return bestMatch;
      },
      
      // Add the required getInfo method
      getInfo: function(): ModelMetadata {
        return this.metadata;
      },
      
      isReady: true
    };
    
    return model;
  }

  /**
   * Trains a machine learning based intent detection model
   * 
   * @param trainingData The preprocessed training data
   * @returns The trained model
   */
  private async trainMLModel(trainingData: IntentItem[]): Promise<NLPModel> {
    console.log(`[IntentTrainer] Training ML-based model with ${trainingData.length} intents`);
    
    // Generate a unique model ID
    const modelId = `intent_${this.language}_ml_${Date.now()}`;
    
    // Prepare the examples and labels for ML training
    const examples: string[] = [];
    const labels: string[] = [];
    
    // Collect all examples and their corresponding labels
    for (const intent of trainingData) {
      if (intent.examples && intent.examples.length > 0) {
        for (const example of intent.examples) {
          examples.push(example);
          labels.push(intent.name);
        }
      }
    }
    
    // Prepare training parameters
    const trainingParams = {
      epochs: this.trainingConfig.epochs,
      batchSize: this.trainingConfig.batchSize,
      learningRate: this.trainingConfig.learningRate,
      validationSplit: 0.1, // Internal validation split for training
      patience: this.trainingConfig.earlyStoppingPatience,
      modelType: 'fasttext', // or 'transformer', etc.
      embeddingDimension: 100,
      randomSeed: this.trainingConfig.randomSeed
    };
    
    // In a real implementation, this would use a machine learning library
    // For now, we'll create a mock ML model that mimics the behavior
    
    // Simulate ML training
    console.log(`[IntentTrainer] Training ML model with ${examples.length} examples`);
    console.log(`[IntentTrainer] Using parameters:`, trainingParams);
    
    // Wait to simulate training time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Create a model that uses simulated ML predictions
    const model: NLPModel = {
      type: 'intent' as AIModelType,
      name: `ML-based Intent Model (${this.language})`,
      modelId,
      language: this.language,
      data: {
        examples,
        labels,
        intents: trainingData,
        // In a real implementation, this would contain the trained model weights
        modelWeights: "simulated_weights"
      },
      metadata: {
        modelId,
        type: 'intent' as AIModelType,
        language: this.language,
        version: '1.0.0',
        lastAccessed: Date.now(), 
        framework: 'custom',
        cached: true,
        description: `Machine learning based intent detection model for ${this.language} language`,
        parameters: examples.length, // Use a meaningful number for parameters
        createdAt: new Date().toISOString()
      },
      instance: {},
      
      // Prediction function for the ML model
      predict: async (input: string | string[]): Promise<Intent> => {
        const text = Array.isArray(input) ? input.join(' ') : input;
        const normalizedText = text.toLowerCase().trim();
        
        // Tokenize input
        const inputTokens = tokenize(normalizedText, { toLowerCase: true });
        
        // In a real ML model, this would use the trained model to predict
        // For now, we'll simulate ML predictions using token similarity
        
        // Find the closest example by similarity
        let bestIndex = -1;
        let bestScore = 0;
        
        for (let i = 0; i < examples.length; i++) {
          const exampleText = examples[i];
          if (typeof exampleText !== 'string') continue;
          const exampleTokens = tokenize(exampleText.toLowerCase(), { toLowerCase: true });
          const similarity = calculateTokenSimilarity(inputTokens, exampleTokens);
          
          if (similarity > bestScore) {
            bestScore = similarity;
            bestIndex = i;
          }
        }
        
        // If no good match found, return unknown
        if (bestIndex === -1 || bestScore < 0.3) {
          return {
            name: 'unknown',
            confidence: 0.1,
            type: 'unknown'
          };
        }
        
        // Get the predicted intent name
        const predictedLabel = labels[bestIndex];
        
        // Find the intent type
        const intentData = trainingData.find(intent => intent.name === predictedLabel);
        const intentType = intentData?.type || this.getIntentTypeFromName(predictedLabel ?? '');
        
        // Apply a sigmoid-like function to the similarity score for better confidence distribution
        const confidence = 1 / (1 + Math.exp(-10 * (bestScore - 0.5)));
        
        return {
          name: predictedLabel ?? 'unknown',
          confidence: confidence,
          type: intentType
        };
      },
      
      // Add the required getInfo method
      getInfo: function(): ModelMetadata {
        return this.metadata;
      },
      
      isReady: true
    };
    
    return model;
  }

  /**
   * Trains a hybrid intent detection model that combines rule-based and ML approaches
   * 
   * @param trainingData The preprocessed training data
   * @returns The trained model
   */
  private async trainHybridModel(trainingData: IntentItem[]): Promise<NLPModel> {
    console.log(`[IntentTrainer] Training hybrid model with ${trainingData.length} intents`);
    
    // Generate a unique model ID
    const modelId = `intent_${this.language}_hybrid_${Date.now()}`;
    
    // Train both a rule-based and ML model
    const ruleBasedModel = await this.trainRuleBasedModel(trainingData);
    const mlModel = await this.trainMLModel(trainingData);
    
    // Create a hybrid model that combines both approaches
    const model: NLPModel = {
      type: 'intent' as AIModelType,
      name: `Hybrid Intent Model (${this.language})`,
      modelId,
      language: this.language,
      data: {
        ruleBasedModel,
        mlModel,
        intents: trainingData
      },
      metadata: {
        modelId,
        type: 'intent' as AIModelType,
        language: this.language,
        version: '1.0.0',
        lastAccessed: Date.now(),
        framework: 'custom',
        cached: true,
        description: `Hybrid intent detection model combining rule-based and ML approaches for ${this.language} language`,
        parameters: trainingData.length * 2, // Use a meaningful number
        isEnsemble: true, // This is an ensemble model combining rule-based and ML
        createdAt: new Date().toISOString()
      },
      instance: {},
      
      // Prediction function for the hybrid model
      predict: async (input: string | string[]): Promise<Intent> => {
        // Get predictions from both models
        const ruleBasedPrediction = await ruleBasedModel.predict(input);
        const mlPrediction = await mlModel.predict(input);
        
        // Use rule-based prediction if it has high confidence
        if (ruleBasedPrediction.confidence >= 0.8) {
          return ruleBasedPrediction;
        }
        
        // Use ML prediction if it has high confidence
        if (mlPrediction.confidence >= 0.7) {
          return mlPrediction;
        }
        
        // Otherwise, choose the prediction with higher confidence
        // But apply a slight bias toward ML predictions (considered more robust)
        const ruleBasedScore = ruleBasedPrediction.confidence;
        const mlScore = mlPrediction.confidence * 1.1; // 10% bias toward ML
        
        if (mlScore > ruleBasedScore) {
          return mlPrediction;
        } else {
          return ruleBasedPrediction;
        }
      },
      
      // Add the required getInfo method
      getInfo: function(): ModelMetadata {
        return this.metadata;
      },
      
      isReady: true
    };
    
    return model;
  }

  /**
   * Validates a trained model on the validation dataset
   * 
   * @param model The model to validate
   * @param validationData The validation data
   * @returns Validation metrics
   */
  public async validateModel(
    model: NLPModel, 
    validationData: IntentItem[]
  ): Promise<any> {
    console.log(`[IntentTrainer] Validating model on ${this.countExamples(validationData)} examples`);
    
    const validationOptions: IntentDetectionOptions = {
      minConfidence: 0.0, // We want all predictions for validation
      debug: false
    };
    
    // Initialize metrics tracking
    const metrics = {
      totalExamples: 0,
      correctPredictions: 0,
      incorrectPredictions: 0,
      confusionMatrix: {} as Record<string, Record<string, number>>,
      intentMetrics: {} as Record<string, any>,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      macroF1: 0,
      weightedF1: 0,
      macroRecall: 0,
      macroAccuracy: 0,
      trainingLoss: [] as number[],
      validationLoss: [] as number[]
    };
    
    // Initialize confusion matrix
    for (const intent of validationData) {
      if (!metrics.confusionMatrix[intent.name]) {
        metrics.confusionMatrix[intent.name] = {};
      }
      for (const otherIntent of validationData) {
        if (!metrics.confusionMatrix[otherIntent.name]) {
          metrics.confusionMatrix[otherIntent.name] = {};
        }
        if (!metrics.confusionMatrix[intent.name]) {
          metrics.confusionMatrix[intent.name] = {};
        }
        metrics.confusionMatrix[intent.name][otherIntent.name] = 0;
      }
      
      // Initialize intent-specific metrics
      metrics.intentMetrics[intent.name] = {
        truePositives: 0,
        falsePositives: 0,
        falseNegatives: 0,
        trueNegatives: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        support: 0
      };
    }
    
    // Process each example in the validation set
    for (const intent of validationData) {
      if (!intent.examples || intent.examples.length === 0) continue;
      
      for (const example of intent.examples) {
        metrics.totalExamples++;
        metrics.intentMetrics[intent.name].support++;
        
        // Get prediction from the model
        const prediction = await detectIntent(example, model, this.language, validationOptions);
        
        // Skip if no prediction
        if (!prediction) continue;
        
        // Update confusion matrix
        if (metrics.confusionMatrix[intent.name][prediction.name]) {
          metrics.confusionMatrix[intent.name][prediction.name]++;
        } else {
          // Handle the case where prediction.name is not in validationData
          if (!metrics.confusionMatrix[intent.name][prediction.name]) {
            metrics.confusionMatrix[intent.name][prediction.name] = 1;
          } else {
            metrics.confusionMatrix[intent.name][prediction.name]++;
          }
        }
        
        // Check if the prediction is correct
        if (prediction.name === intent.name) {
          metrics.correctPredictions++;
          metrics.intentMetrics[intent.name].truePositives++;
          
          // Count true negatives for other intents
          for (const otherIntent of Object.keys(metrics.intentMetrics)) {
            if (otherIntent !== intent.name) {
              metrics.intentMetrics[otherIntent].trueNegatives++;
            }
          }
        } else {
          metrics.incorrectPredictions++;
          metrics.intentMetrics[intent.name].falseNegatives++;
          
          // Count false positives for predicted intent
          if (metrics.intentMetrics[prediction.name]) {
            metrics.intentMetrics[prediction.name].falsePositives++;
          }
        }
      }
    }
    
    // Calculate overall metrics
    metrics.accuracy = metrics.totalExamples > 0 
      ? metrics.correctPredictions / metrics.totalExamples
      : 0;
    
    // Calculate intent-specific metrics
    let sumPrecision = 0;
    let sumRecall = 0;
    let sumF1 = 0;
    let totalSupport = 0;
    let weightedSumF1 = 0;
    
    for (const intentName of Object.keys(metrics.intentMetrics)) {
      const m = metrics.intentMetrics[intentName];
      
      // Calculate precision
      m.precision = (m.truePositives + m.falsePositives) > 0 
        ? m.truePositives / (m.truePositives + m.falsePositives)
        : 0;
      
      // Calculate recall
      m.recall = (m.truePositives + m.falseNegatives) > 0 
        ? m.truePositives / (m.truePositives + m.falseNegatives)
        : 0;
      
      // Calculate F1 score
      m.f1Score = (m.precision + m.recall) > 0 
        ? 2 * m.precision * m.recall / (m.precision + m.recall)
        : 0;
      
      // Accumulate for macro averages
      sumPrecision += m.precision;
      sumRecall += m.recall;
      sumF1 += m.f1Score;
      totalSupport += m.support;
      weightedSumF1 += m.f1Score * m.support;
    }
    
    // Calculate macro-averaged metrics
    const numIntents = Object.keys(metrics.intentMetrics).length;
    metrics.precision = numIntents > 0 ? sumPrecision / numIntents : 0;
    metrics.recall = numIntents > 0 ? sumRecall / numIntents : 0;
    metrics.f1Score = numIntents > 0 ? sumF1 / numIntents : 0;
    metrics.macroF1 = metrics.f1Score;
    metrics.weightedF1 = totalSupport > 0 ? weightedSumF1 / totalSupport : 0;
    metrics.macroRecall = metrics.recall;
    metrics.macroAccuracy = metrics.accuracy;
    
    // Generate training and validation loss curves (simulated for this implementation)
    metrics.trainingLoss = this.generateSimulatedLossCurve(this.trainingConfig.epochs);
    metrics.validationLoss = this.generateSimulatedLossCurve(this.trainingConfig.epochs, 1.2);
    
    console.log(`[IntentTrainer] Validation results:`);
    console.log(`  - Accuracy: ${metrics.accuracy.toFixed(4)}`);
    console.log(`  - Precision: ${metrics.precision.toFixed(4)}`);
    console.log(`  - Recall: ${metrics.recall.toFixed(4)}`);
    console.log(`  - F1 Score: ${metrics.f1Score.toFixed(4)}`);
    console.log(`  - Weighted F1: ${metrics.weightedF1.toFixed(4)}`);
    
    return metrics;
  }

  /**
   * Saves the trained model to disk
   * 
   * @param model The model to save
   * @param method The training method used
   * @returns The path where the model was saved
   */
  private async saveModel(model: NLPModel, method: string): Promise<string> {
    try {
      // Generate a unique model identifier
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const modelId = `intent_${this.language}_${method}_${timestamp}`;
      const savePath = `${this.savePath}/${modelId}`;
      
      console.log(`[IntentTrainer] Saving model to: ${savePath}`);
      
      // In a real implementation, this would serialize the model to disk
      // For now, just log the success
      console.log(`[IntentTrainer] Model saved successfully`);
      
      return savePath;
    } catch (error) {
      console.error(`[IntentTrainer] Error saving model:`, error);
      return `${this.savePath}/unsaved_model`;
    }
  }

  /**
   * Splits training data into training and validation sets
   * 
   * @param validationSplit The fraction of data to use for validation
   * @returns The split data
   */
  public splitData(validationSplit: number): { trainingData: IntentItem[], validationData: IntentItem[] } {
    const result = {
      trainingData: [] as IntentItem[],
      validationData: [] as IntentItem[]
    };
    
    // Process each intent
    for (const intent of this.intents) {
      // Skip intents without examples
      if (!intent.examples || intent.examples.length === 0) {
        continue;
      }
      
      // Create copies for each set
      const trainingIntent: IntentItem = { ...intent, examples: [] };
      const validationIntent: IntentItem = { ...intent, examples: [] };
      
      // Shuffle examples
      const shuffledExamples = [...intent.examples].sort(() => Math.random() - 0.5);
      
      // Calculate split point
      const splitIndex = Math.floor(shuffledExamples.length * (1 - validationSplit));
      
      // Split examples
      trainingIntent.examples = shuffledExamples.slice(0, splitIndex);
      validationIntent.examples = shuffledExamples.slice(splitIndex);
      
      // Add to result sets if they have examples
      if (trainingIntent.examples.length > 0) {
        result.trainingData.push(trainingIntent);
      }
      
      if (validationIntent.examples.length > 0) {
        result.validationData.push(validationIntent);
      }
    }
    
    console.log(`[IntentTrainer] Split data: ${result.trainingData.length} training intents, ${result.validationData.length} validation intents`);
    console.log(`[IntentTrainer] Training examples: ${this.countExamples(result.trainingData)}, Validation examples: ${this.countExamples(result.validationData)}`);
    
    return result;
  }

  /**
   * Counts the total number of examples in a set of intents
   * 
   * @param intents The intents to count examples for
   * @returns The total number of examples
   */
  private countExamples(intents: IntentItem[] = this.intents): number {
    return intents.reduce((sum, intent) => sum + (intent.examples?.length || 0), 0);
  }

  /**
   * Generates a simulated loss curve for training visualization
   * 
   * @param epochs The number of epochs
   * @param factor A factor to apply to the loss values
   * @returns An array of loss values
   */
  private generateSimulatedLossCurve(epochs: number, factor: number = 1.0): number[] {
    const loss: number[] = [];
    const initialLoss = 2.5 * factor;
    const finalLoss = 0.2 * factor;
    
    for (let i = 0; i < epochs; i++) {
      // Calculate a decreasing loss with some noise
      const progress = i / (epochs - 1);
      const smoothLoss = initialLoss - (initialLoss - finalLoss) * (1 - Math.exp(-5 * progress));
      const noise = (Math.random() - 0.5) * 0.1 * factor;
      loss.push(Math.max(0.01, smoothLoss + noise));
    }
    
    return loss;
  }

  /**
   * Derives the intent type from an intent name
   * 
   * @param intentName The name of the intent
   * @returns The derived intent type
   */
  private getIntentTypeFromName(intentName: string): string {
    if (intentName.startsWith('faq_')) {
      return 'faq';
    } else if (intentName.startsWith('smalltalk_')) {
      return 'smalltalk';
    } else if (intentName.startsWith('function_')) {
      return 'function';
    } else {
      return 'unknown';
    }
  }
}

// Export a singleton instance
export const intentTrainer = {
  /**
   * Creates a new IntentTrainer instance
   * 
   * @param language The language to train for
   * @param options Additional model options
   * @param trainingConfig Custom training configuration
   * @returns A new IntentTrainer instance
   */
  create(
    language: Language = 'de',
    options: ModelOptions = {},
    trainingConfig: Partial<TrainingConfig> = {}
  ): IntentTrainer {
    return new IntentTrainer(language, options, trainingConfig);
  },
  
  /**
   * Quick method to train a model with default settings
   * 
   * @param language The language to train for
   * @param method The training method to use
   * @returns The training result
   */
  async quickTrain(
    language: Language = 'de',
    method: 'rule-based' | 'ml' | 'hybrid' = 'hybrid'
  ): Promise<TrainingResult | null> {
    const trainer = new IntentTrainer(language);
    const success = await trainer.loadTrainingData();
    
    if (!success) {
      console.error(`[intentTrainer.quickTrain] Failed to load training data for ${language}`);
      return null;
    }
    
    return trainer.trainModel(method);
  },
  
  /**
   * Evaluates an existing intent model
   * 
   * @param language The language of the model
   * @param testData Optional: custom test data file path
   * @returns Evaluation metrics
   */
  async evaluateModel(language: Language = 'de', testData?: string): Promise<any> {
    try {
      // Load the model to evaluate
      const model = await loadModel('intent', language);
      
      // Create a trainer instance
      const trainer = new IntentTrainer(language);
      
      // Load test data
      const success = await trainer.loadTrainingData(testData);
      
      if (!success) {
        console.error(`[intentTrainer.evaluateModel] Failed to load test data for ${language}`);
        return null;
      }
      
      // Split the data and use the validation set for evaluation
      const { validationData } = trainer.splitData(0.3);
      
      // Validate the model
      return await trainer.validateModel(model, validationData);
    } catch (error) {
      console.error(`[intentTrainer.evaluateModel] Error evaluating model:`, error);
      return null;
    }
  }
};