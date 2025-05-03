/**
 * features/nlp-engine/ai/feedback/continuousLearning.ts
 *
 * Responsible for improving NLP models through continuous learning
 * based on user interactions, feedback, and performance metrics.
 */

// Korrektur (TS1484): Type-only imports
import type {
  Intent,
  Entity,
  Context,
  NLPModel,
  ModelType,
  Language,
  IntentItem,
  EntityItem,
  FeedbackItem,
  LearningJobStatus,
  LearningStatistics,
  ModelOptions // Import ModelOptions
} from '@/types/nlp.types';
import { FeedbackType } from '@/types/nlp.types';

// Annahme: intentTrainer, evaluator, dataPreprocessor sind Klassen/Objekte mit den benötigten Methoden
// Annahme: intentTrainer hat eine create Methode, die ein Objekt mit loadTrainingData und trainModel zurückgibt
import { intentTrainer } from '../training/intentTrainer';
// Korrektur (TS1484): Type-only import für EvaluationResults
import { evaluator, type EvaluationResults, type BaseMetrics, type IntentMetrics, type EntityMetrics, type ContextMetrics } from '../training/evaluator';
// Korrektur (TS2305): Importiere modelOptimizer. Annahme: Diese Funktion/dieses Objekt existiert und ist exportiert.
// HINWEIS: Der Fehler TS2305 bedeutet, dass 'modelOptimizer' nicht aus '../training/modelOptimizer' exportiert wird.
// Um diesen Fehler vollständig zu beheben, musst du sicherstellen, dass '../training/modelOptimizer.ts'
// eine Funktion/ein Objekt namens 'modelOptimizer' exportiert (z.B. mit 'export const modelOptimizer = ...').
// Da der Code, der modelOptimizer verwendet, auskommentiert ist, kommentieren wir den Import aus, um den Fehler zu beheben.
// import { modelOptimizer } from '../training/modelOptimizer';

// Annahme: FeedbackCollector ist eine Klasse mit den benötigten Methoden
import { FeedbackCollector } from './feedbackCollector';
// Korrektur (TS1484): Type-only import für CorrectionAnalysis
import { CorrectionAnalyzer, type CorrectionAnalysis } from './correctionAnalyzer';
// Fixed: Use optional chaining for config access
import { config } from '../../config';
// Annahme: loadModel existiert und ist exportiert
import { loadModel } from '../../models/loadModel';
// Annahme: loadJSONFile existiert und ist exportiert
import { loadJSONFile } from '../../utils/jsonDataLoader';

// Importiere fs und path, da der ursprüngliche Code diese verwendet und die Fehlerliste darauf basiert
import * as fs from 'fs';
import * as path from 'path';


// Learning configuration options
export interface LearningConfig {
  enableContinuousLearning: boolean;
  feedbackThreshold: number;       // Min feedback items before learning
  confidenceThreshold: number;     // Min confidence for auto-integration
  improvementThreshold: number;    // Min improvement for model replacement
  maxSamplesPerIntent: number;     // Max examples to keep per intent
  maxSamplesPerEntity: number;     // Max examples to keep per entity
  saveModelHistory: boolean;       // Whether to save model history
  enableABTesting: boolean;        // Enable A/B testing for models
  autoUpdateFrequency: number;     // Auto-update frequency in hours
  learningModes: {                 // Enabled learning modes
    misclassification: boolean;    // Learn from intent misclassification
    entityExtraction: boolean;     // Learn from entity extraction errors
    newExamples: boolean;          // Learn from new examples
    domainExtension: boolean;      // Learn from domain extension
    responseQuality: boolean;      // Learn from response quality feedback
  };
  reviewRequired: boolean;         // Whether human review is required
  supportedLanguages: Language[];  // Languages to support learning for
}

// Default learning configuration
const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enableContinuousLearning: true,
  feedbackThreshold: 5,
  confidenceThreshold: 0.7,
  improvementThreshold: 0.03, // 3% improvement
  maxSamplesPerIntent: 100,
  maxSamplesPerEntity: 50,
  saveModelHistory: true,
  enableABTesting: true,
  autoUpdateFrequency: 24, // 24 hours
  learningModes: {
    misclassification: true,
    entityExtraction: true,
    newExamples: true,
    domainExtension: false,
    responseQuality: true
  },
  reviewRequired: true,
  supportedLanguages: ['de', 'en']
};

// A/B test configuration
export interface ABTestConfig {
  testId: string;
  modelAId: string;
  modelBId: string;
  modelType: ModelType;
  language: Language;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'cancelled';
  trafficSplit: number; // Percentage for model B (0.0-1.0)
  metrics: string[];
  results?: {
    modelA: Record<string, number>;
    modelB: Record<string, number>;
    winner?: 'A' | 'B' | 'tie';
  };
}

// Training data repository interface
interface TrainingDataRepository {
  intents: Record<Language, IntentItem[]>;
  entities: Record<Language, EntityItem[]>;
  contexts: Record<Language, any[]>; // Typisierung beibehalten
  feedbackItems: FeedbackItem[];
  candidateExamples: Record<string, string[]>; // Intent ID => examples
  candidateEntities: Record<string, string[]>; // Entity type => examples
  modelHistory: Record<ModelType, Array<{
    id: string;
    timestamp: number;
    language: Language;
    metrics: Record<string, number>;
  }>>;
}

/**
 * Continuous learning system that improves NLP models based on feedback and usage
 */
export class ContinuousLearning {
  private config: LearningConfig;
  private dataRepository: TrainingDataRepository;
  private activeJobs: Map<string, LearningJobStatus>;
  private activeABTests: Map<string, ABTestConfig>;
  // Fixed (TS2339): Add newExamplesCount to LearningStatistics type definition
  private statistics: LearningStatistics & { newExamplesCount: number };
  private lastCleanupTime: number;
  private learningQueue: string[]; // Job IDs

  /**
   * Creates a new continuous learning instance
   *
   * @param config Learning configuration options
   */
  constructor(config: Partial<LearningConfig> = {}) {
    this.config = { ...DEFAULT_LEARNING_CONFIG, ...config };
    this.activeJobs = new Map<string, LearningJobStatus>();
    this.activeABTests = new Map<string, ABTestConfig>();
    this.learningQueue = [];
    this.lastCleanupTime = Date.now();

    // Initialize empty data repository
    this.dataRepository = {
      intents: { de: [], en: [] },
      entities: { de: [], en: [] },
      contexts: { de: [], en: [] },
      feedbackItems: [],
      candidateExamples: {},
      candidateEntities: {},
      // Fixed (TS7053): Add 'sentiment', 'embedding', 'language' to modelHistory type
      modelHistory: {
        intent: [],
        entity: [],
        context: [],
        sentiment: [],
        embedding: [],
        language: [],
        generative: []
      }
    };

    // Initialize statistics
    // Fixed (TS2339): Initialize newExamplesCount
    this.statistics = {
        ...this.createInitialStatistics(),
        newExamplesCount: 0 // Initialize the new property
    };


    console.log(`[continuousLearning] Initialized with config:`, JSON.stringify(this.config, null, 2));

    // Load existing training data
    this.loadTrainingData();

    // Set up auto-update interval if enabled
    if (this.config.enableContinuousLearning && this.config.autoUpdateFrequency > 0) {
      // Verwende setInterval sicher, stelle sicher, dass die Callback-Funktion existiert
      const intervalId = setInterval(() => {
          if (typeof this.processLearningQueue === 'function') {
              this.processLearningQueue();
          } else {
              console.error('[continuousLearning] processLearningQueue is not a function, clearing interval.');
              clearInterval(intervalId);
          }
      }, this.config.autoUpdateFrequency * 60 * 60 * 1000);
    }
  }

  /**
   * Processes feedback for learning
   *
   * @param feedback The feedback item to process
   * @returns Whether the feedback was processed
   */
  public async processFeedback(feedback: FeedbackItem): Promise<boolean> {
    try {
      // Skip if continuous learning is disabled
      if (!this.config.enableContinuousLearning) {
        console.log(`[continuousLearning] Continuous learning disabled, skipping feedback processing`);
        return false;
      }

      console.log(`[continuousLearning] Processing feedback item: ${feedback.id}`);

      // Add feedback to repository
      this.dataRepository.feedbackItems.push(feedback);

      // Update stats
      this.statistics.totalFeedbackItems++;

      // Analyze feedback item
      // Korrektur (TS2532): Sicherer Zugriff auf feedback.data
      const feedbackData = feedback.data;

      if (feedback.type === FeedbackType.INTENT_CORRECTION) {
        // Handle intent correction feedback
        await this.processIntentCorrectionFeedback(feedback);
      } else if (feedback.type === FeedbackType.ENTITY_CORRECTION) {
        // Handle entity correction feedback
        await this.processEntityCorrectionFeedback(feedback);
      } else if (feedback.type === FeedbackType.RESPONSE_QUALITY) {
        // Handle response quality feedback
        await this.processResponseQualityFeedback(feedback);
      } else if (feedback.type === FeedbackType.NEW_EXAMPLE) {
        // Handle new example feedback
        await this.processNewExampleFeedback(feedback);
      }
      // Optional: Handle other feedback types like COMMENT, RATING, etc.

      // Update processed count
      this.statistics.processedFeedbackItems++;

      // Check if we have enough feedback for learning
      await this.checkFeedbackThresholdForLearning();

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error processing feedback:`, error);
      return false;
    }
  }

  /**
   * Creates a learning job for a specific model type and language
   *
   * @param modelType The type of model to improve
   * @param language The language of the model
   * @returns The job status or null if job creation failed
   */
  public async createLearningJob(
    modelType: ModelType,
    language: Language
  ): Promise<LearningJobStatus | null> {
    try {
      console.log(`[continuousLearning] Creating learning job for ${modelType} model in ${language}`);

      // Generate a job ID
      const jobId = `learn_${modelType}_${language}_${Date.now()}`;

      // Count relevant feedback items
      const relevantFeedback = this.getRelevantFeedbackItems(modelType, language);

      // Count new examples
      const newExamplesCount = this.countNewExamples(modelType, language);

      // Create job status
      const jobStatus: LearningJobStatus = {
        jobId,
        startTime: Date.now(),
        status: 'pending',
        modelType,
        language,
        feedbackCount: relevantFeedback.length,
        newExamplesCount,
        requiresReview: this.config.reviewRequired,
        metadata: {}  // Initialize metadata property
      };

      // Store job
      this.activeJobs.set(jobId, jobStatus);

      // Add to queue
      this.learningQueue.push(jobId);

      // Update stats
      this.statistics.totalLearningJobs++;
      this.statistics.pendingJobs++;

      console.log(`[continuousLearning] Created learning job: ${jobId} with ${relevantFeedback.length} feedback items`);

      return jobStatus;
    } catch (error) {
      console.error(`[continuousLearning] Error creating learning job:`, error);
      return null;
    }
  }

  /**
   * Processes the learning queue
   *
   * @param maxJobs Maximum number of jobs to process
   * @returns Number of jobs processed
   */
  public async processLearningQueue(maxJobs: number = 1): Promise<number> {
    try {
      console.log(`[continuousLearning] Processing learning queue with ${this.learningQueue.length} jobs`);

      // Skip if no jobs
      if (this.learningQueue.length === 0) {
        return 0;
      }

      // Process up to maxJobs
      const jobsToProcess = this.learningQueue.slice(0, maxJobs);
      let processedCount = 0;

      for (const jobId of jobsToProcess) {
        const job = this.activeJobs.get(jobId);

        if (!job) {
          // Remove from queue if job not found
          this.learningQueue = this.learningQueue.filter(id => id !== jobId);
          continue;
        }

        // Skip jobs that require review
        if (job.requiresReview &&
            (!job.reviewStatus || job.reviewStatus === 'pending')) {
          console.log(`[continuousLearning] Skipping job ${jobId} - review required`);
          continue;
        }

        // Skip jobs that were rejected
        if (job.reviewStatus === 'rejected') {
          console.log(`[continuousLearning] Skipping job ${jobId} - review rejected`);
          this.learningQueue = this.learningQueue.filter(id => id !== jobId);
          continue;
        }

        // Process the job
        // Update job status to processing before execution
        job.status = 'processing';
        this.activeJobs.set(job.jobId, job);
        this.statistics.pendingJobs--; // Decrement pending, will increment successful/failed later

        const success = await this.executeLearningJob(job);

        if (success) {
          processedCount++;
          // Job status and stats updated inside executeLearningJob
        } else {
           // Job status and stats updated inside executeLearningJob
        }

        // Remove from queue regardless of success/failure
        this.learningQueue = this.learningQueue.filter(id => id !== jobId);
      }

      return processedCount;
    } catch (error) {
      console.error(`[continuousLearning] Error processing learning queue:`, error);
      return 0;
    }
  }

  /**
   * Gets the status of a learning job
   *
   * @param jobId The ID of the job
   * @returns The job status or null if not found
   */
  public getJobStatus(jobId: string): LearningJobStatus | null {
    return this.activeJobs.get(jobId) || null;
  }

  /**
   * Lists all learning jobs
   *
   * @param status Optional filter by status
   * @returns Array of job statuses
   */
  public listJobs(
    status?: 'pending' | 'processing' | 'completed' | 'failed'
  ): LearningJobStatus[] {
    const jobs = Array.from(this.activeJobs.values());

    if (status) {
      return jobs.filter(job => job.status === status);
    }

    return jobs;
  }

  /**
   * Reviews a learning job
   *
   * @param jobId The ID of the job to review
   * @param approve Whether to approve the job
   * @param comments Optional review comments
   * @returns Updated job status or null if job not found
   */
  public reviewJob(
    jobId: string,
    approve: boolean,
    comments?: string
  ): LearningJobStatus | null {
    // Get the job
    const job = this.activeJobs.get(jobId);

    if (!job) {
      console.warn(`[continuousLearning] Job not found for review: ${jobId}`);
      return null;
    }

    // Update review status
    job.reviewStatus = approve ? 'approved' : 'rejected';

    // Add comments to metadata
    if (!job.metadata) {
      job.metadata = {};
    }

    if (comments) {
      job.metadata.reviewComments = comments;
    }

    job.metadata.reviewTime = Date.now();

    // Update the stored job
    this.activeJobs.set(jobId, job);

    console.log(`[continuousLearning] Job ${jobId} reviewed and ${approve ? 'approved' : 'rejected'}`);

    // If approved and no review was required initially, add to queue for processing
    if (approve && !job.requiresReview && job.status === 'pending') {
        this.learningQueue.push(jobId);
        this.statistics.pendingJobs++;
        console.log(`[continuousLearning] Approved job ${jobId} added back to queue.`);
    } else if (!approve && job.status === 'pending') {
        // If rejected while pending, remove from queue
        this.learningQueue = this.learningQueue.filter(id => id !== jobId);
        this.statistics.pendingJobs--;
        this.statistics.failedJobs++; // Count rejected as failed jobs
        console.log(`[continuousLearning] Rejected job ${jobId} removed from queue.`);
    }


    return job;
  }

  /**
   * Creates an A/B test for comparing models
   *
   * @param modelType The type of models to test
   * @param language The language of the models
   * @param trafficSplit Percentage of traffic for model B (0.0-1.0)
   * @param metrics Metrics to track
   * @returns The test configuration or null if creation failed
   */
  public createABTest(
    modelType: ModelType,
    language: Language,
    trafficSplit: number = 0.5,
    metrics: string[] = ['accuracy', 'f1Score']
  ): ABTestConfig | null {
    try {
      console.log(`[continuousLearning] Creating A/B test for ${modelType} models in ${language}`);

      // Ensure A/B testing is enabled
      if (!this.config.enableABTesting) {
        console.warn(`[continuousLearning] A/B testing is disabled`);
        return null;
      }

      // Generate test ID
      const testId = `abtest_${modelType}_${language}_${Date.now()}`;

      // Find model A (current production model) - Placeholder logic
      const modelAId = `${modelType}_${language}_current`;

      // Find model B (candidate model) - Placeholder logic
      const modelBId = `${modelType}_${language}_candidate`;

      // Create test config
      const testConfig: ABTestConfig = {
        testId,
        modelAId,
        modelBId,
        modelType,
        language,
        startTime: Date.now(),
        status: 'active',
        trafficSplit,
        metrics
      };

      // Store the test
      this.activeABTests.set(testId, testConfig);

      console.log(`[continuousLearning] Created A/B test: ${testId}`);

      return testConfig;
    } catch (error) {
      console.error(`[continuousLearning] Error creating A/B test:`, error);
      return null;
    }
  }

  /**
   * Gets the result of an A/B test
   *
   * @param testId The ID of the test
   * @returns The test configuration or null if not found
   */
  public getABTestResult(testId: string): ABTestConfig | null {
    return this.activeABTests.get(testId) || null;
  }

  /**
   * Ends an A/B test and determines the winner
   *
   * @param testId The ID of the test
   * @returns The test results or null if test not found
   */
  public endABTest(testId: string): ABTestConfig | null {
    try {
      // Get the test
      const test = this.activeABTests.get(testId);

      if (!test) {
        console.warn(`[continuousLearning] A/B test not found: ${testId}`);
        return null;
      }

      // Mark as completed
      test.status = 'completed';
      test.endTime = Date.now();

      // In a real implementation, this would calculate metrics
      // For this example, we'll simulate results

      const metricA = Math.random() * 0.3 + 0.7; // Random between 0.7 and 1.0
      const metricB = Math.random() * 0.3 + 0.7; // Random between 0.7 and 1.0

      test.results = {
        modelA: { accuracy: metricA, f1Score: metricA },
        modelB: { accuracy: metricB, f1Score: metricB },
        winner: metricB > metricA ? 'B' : (metricA > metricB ? 'A' : 'tie')
      };

      // Update the stored test
      this.activeABTests.set(testId, test);

      console.log(`[continuousLearning] Ended A/B test ${testId} with winner: ${test.results.winner}`);

      return test;
    } catch (error) {
      console.error(`[continuousLearning] Error ending A/B test:`, error);
      return null;
    }
  }

  /**
   * Deploys a model to production
   *
   * @param jobId The ID of the learning job
   * @returns Whether the deployment was successful
   */
  public async deployModel(jobId: string): Promise<boolean> {
    try {
      // Get the job
      const job = this.activeJobs.get(jobId);

      if (!job) {
        console.warn(`[continuousLearning] Job not found for deployment: ${jobId}`);
        return false;
      }

      // Check job status
      if (job.status !== 'completed') {
        console.warn(`[continuousLearning] Cannot deploy incomplete job: ${jobId}`);
        return false;
      }

      // Check review status if required
      if (job.requiresReview && job.reviewStatus !== 'approved') {
        console.warn(`[continuousLearning] Cannot deploy unapproved job: ${jobId}`);
        return false;
      }

      // Update deployment status
      job.deploymentStatus = 'deployed';

      // In a real implementation, this would update the model files
      console.log(`[continuousLearning] Deploying model from job ${jobId} (${job.modelType}, ${job.language})`);

      // Update the job in storage
      this.activeJobs.set(jobId, job);

      // Update model history
      if (this.config.saveModelHistory) {
        // Korrektur (TS2322): Sicherstellen, dass job.improvementMetrics existiert
        const metrics = job.improvementMetrics?.improved || {};
        // Korrektur (TS7053): Sicherstellen, dass modelHistory die ModelType-Schlüssel hat
        const modelTypeKey = job.modelType as keyof TrainingDataRepository['modelHistory'];
        if (this.dataRepository.modelHistory[modelTypeKey]) {
             this.dataRepository.modelHistory[modelTypeKey].push({
                id: jobId,
                timestamp: Date.now(),
                language: job.language,
                metrics: metrics
             });
        } else {
            console.warn(`[continuousLearning] Model history not initialized for type: ${modelTypeKey}`);
        }
      }

      // Update stats
      // Korrektur (TS7053): Sicherstellen, dass modelUpdates die ModelType-Schlüssel hat
      const modelTypeKey = job.modelType as keyof LearningStatistics['modelUpdates'];
      // Fixed (TS7053): Check if the key exists before incrementing
      if (this.statistics.modelUpdates && this.statistics.modelUpdates[modelTypeKey] !== undefined) {
           this.statistics.modelUpdates[modelTypeKey]++;
      } else {
           // Initialisiere, falls der Schlüssel noch nicht existiert (oder handle als Fehler)
           // Fixed (TS7053): Ensure this.statistics.modelUpdates is not undefined
           if (this.statistics.modelUpdates) {
               this.statistics.modelUpdates[modelTypeKey] = 1;
           } else {
               console.error(`[continuousLearning] Statistics.modelUpdates is undefined.`);
           }
      }

      this.statistics.lastUpdateTime = Date.now();

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error deploying model:`, error);
      return false;
    }
  }

  /**
   * Rollbacks a model deployment
   *
   * @param jobId The ID of the learning job
   * @returns Whether the rollback was successful
   */
  public async rollbackDeployment(jobId: string): Promise<boolean> {
    try {
      // Get the job
      const job = this.activeJobs.get(jobId);

      if (!job) {
        console.warn(`[continuousLearning] Job not found for rollback: ${jobId}`);
        return false;
      }

      // Check deployment status
      if (job.deploymentStatus !== 'deployed') {
        console.warn(`[continuousLearning] Cannot rollback non-deployed job: ${jobId}`);
        return false;
      }

      // Update deployment status
      job.deploymentStatus = 'rolled_back';

      // In a real implementation, this would restore the previous model
      console.log(`[continuousLearning] Rolling back model from job ${jobId}`);

      // Update the job in storage
      this.activeJobs.set(jobId, job);

      // Update stats
      // Korrektur (TS7053): Sicherstellen, dass modelUpdates die ModelType-Schlüssel hat
      const modelTypeKey = job.modelType as keyof LearningStatistics['modelUpdates'];
       // Fixed (TS7053): Check if the key exists before decrementing
       if (this.statistics.modelUpdates && this.statistics.modelUpdates[modelTypeKey] !== undefined) {
           this.statistics.modelUpdates[modelTypeKey]--;
       } else {
           // Sollte nicht passieren, wenn deployModel korrekt inkrementiert
           // Fixed (TS7053): Ensure this.statistics.modelUpdates is not undefined
           if (this.statistics.modelUpdates) {
               this.statistics.modelUpdates[modelTypeKey] = -1; // Oder handle anders
           } else {
               console.error(`[continuousLearning] Statistics.modelUpdates is undefined.`);
           }
       }


      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error rolling back deployment:`, error);
      return false;
    }
  }

  /**
   * Gets the current learning statistics
   *
   * @returns Learning statistics
   */
  public getStatistics(): LearningStatistics {
    // Update some dynamic statistics
    this.statistics.pendingJobs = this.learningQueue.length;
    this.statistics.successfulJobs = Array.from(this.activeJobs.values())
      .filter(job => job.status === 'completed').length;
    this.statistics.failedJobs = Array.from(this.activeJobs.values())
      .filter(job => job.status === 'failed').length;

    // Return a copy to prevent external modification
    return { ...this.statistics };
  }

  /**
   * Adds a new example to the training data
   *
   * @param text The example text
   * @param intentName The intent name
   * @param language The language of the example
   * @param metadata Optional metadata
   * @returns Whether the example was added
   */
  public addExample(
    text: string,
    intentName: string,
    language: Language,
    metadata?: Record<string, any>
  ): boolean {
    try {
      console.log(`[continuousLearning] Adding example for intent ${intentName} (${language}): "${text}"`);

      // Korrektur (TS2322): Sicherstellen, dass this.dataRepository.intents[language] existiert
      const intentsForLang = this.dataRepository.intents[language];
      if (!intentsForLang) {
          console.error(`[continuousLearning] Intent data repository not initialized for language ${language}`);
          return false;
      }

      // Check if we have this intent
      const intentIndex = intentsForLang.findIndex(intent => intent && intent.name === intentName); // Korrektur: Check intent for null/undefined

      if (intentIndex === -1) {
        // Intent doesn't exist, create it
        intentsForLang.push({
          name: intentName,
          description: `Intent ${intentName}`,
          examples: [text]
        });

        console.log(`[continuousLearning] Created new intent ${intentName} with example`);
      } else {
        // Intent exists, add example if not duplicate
        // Korrektur (TS2322): Sicherer Zugriff auf das Intent-Objekt
        const intent = intentsForLang[intentIndex];

        if (!intent) {
             console.error(`[continuousLearning] Found index ${intentIndex} for intent ${intentName} but object is null/undefined`);
             return false;
        }

        // Check if example already exists
        if (intent.examples && intent.examples.includes(text)) {
          console.log(`[continuousLearning] Example already exists for intent ${intentName}`);
          return false;
        }

        // Add example
        if (!intent.examples) {
          intent.examples = [];
        }

        intent.examples.push(text);

        // Update the intent (optional, since we modified the object in place)
        // this.dataRepository.intents[language][intentIndex] = intent;

        console.log(`[continuousLearning] Added example to intent ${intentName}`);
      }

      // Add to candidate examples
      const candidateKey = `${language}_${intentName}`;

      if (!this.dataRepository.candidateExamples[candidateKey]) {
        this.dataRepository.candidateExamples[candidateKey] = [];
      }

      this.dataRepository.candidateExamples[candidateKey].push(text);
      this.statistics.newExamplesCount++; // Update stats for new examples

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error adding example:`, error);
      return false;
    }
  }

  /**
   * Adds a new entity example to the training data
   *
   * @param text The entity text
   * @param entityType The entity type
   * @param language The language of the entity
   * @param metadata Optional metadata
   * @returns Whether the entity was added
   */
  public addEntityExample(
    text: string,
    entityType: string,
    language: Language,
    metadata?: Record<string, any>
  ): boolean {
    try {
      console.log(`[continuousLearning] Adding entity example for ${entityType} (${language}): "${text}"`);

      // Korrektur (TS2322): Sicherstellen, dass this.dataRepository.entities[language] existiert
      const entitiesForLang = this.dataRepository.entities[language];
      if (!entitiesForLang) {
          console.error(`[continuousLearning] Entity data repository not initialized for language ${language}`);
          return false;
      }

      // Check if we have this entity type
      const entityIndex = entitiesForLang.findIndex(entity => entity && entity.name === entityType); // Korrektur: Check entity for null/undefined

      if (entityIndex === -1) {
        // Entity type doesn't exist, create it
        entitiesForLang.push({
          name: entityType,
          description: `Entity type ${entityType}`,
          examples: [text]
        });

        console.log(`[continuousLearning] Created new entity type ${entityType} with example`);
      } else {
        // Entity type exists, add example if not duplicate
        // Korrektur (TS2322): Sicherer Zugriff auf das Entity-Objekt
        const entity = entitiesForLang[entityIndex];

        if (!entity) {
             console.error(`[continuousLearning] Found index ${entityIndex} for entity type ${entityType} but object is null/undefined`);
             return false;
        }

        // Check if example already exists
        if ((entity.examples && entity.examples.includes(text)) ||
            (entity.data && entity.data.includes(text))) {
          console.log(`[continuousLearning] Example already exists for entity ${entityType}`);
          return false;
        }

        // Add example
        if (!entity.examples) {
          entity.examples = [];
        }

        entity.examples.push(text);

        // Update the entity (optional)
        // this.dataRepository.entities[language][entityIndex] = entity;

        console.log(`[continuousLearning] Added example to entity ${entityType}`);
      }

      // Add to candidate entities
      const candidateKey = `${language}_${entityType}`;

      if (!this.dataRepository.candidateEntities[candidateKey]) {
        this.dataRepository.candidateEntities[candidateKey] = [];
      }

      this.dataRepository.candidateEntities[candidateKey].push(text);
      // Optional: Update a separate count for new entity examples if needed for stats

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error adding entity example:`, error);
      return false;
    }
  }

  /**
   * Checks if there is enough feedback to trigger learning
   *
   * @returns Whether a learning job was created
   */
  private async checkFeedbackThresholdForLearning(): Promise<boolean> {
    try {
      let jobCreated = false;

      // Check if we have enough feedback for intent learning
      const intentFeedback = this.dataRepository.feedbackItems.filter(
        item => item.type === FeedbackType.INTENT_CORRECTION || item.type === FeedbackType.NEW_EXAMPLE
      );

      if (intentFeedback.length >= this.config.feedbackThreshold) {
        // Group by language
        const byLanguage: Record<Language, FeedbackItem[]> = {
          de: [],
          en: []
        };

        intentFeedback.forEach(item => {
          const itemLang = item.language;
          // Korrektur: Sicherstellen, dass itemLang ein gültiger Schlüssel ist
          if (itemLang && (itemLang === 'de' || itemLang === 'en')) {
            byLanguage[itemLang].push(item);
          } else {
            // Default to 'de' if no language specified or invalid
            byLanguage['de'].push(item);
          }
        });

        // Create learning jobs for languages with enough feedback
        // Fixed (TS2532): Ensure this.config.supportedLanguages is not undefined
        const supportedLanguages = this.config.supportedLanguages ?? [];
        for (const lang of supportedLanguages) {
          if (byLanguage[lang]?.length >= this.config.feedbackThreshold) { // Fixed (TS2532): Check byLanguage[lang]
            // Check if a pending/processing job already exists for this type/language
            const existingJob = Array.from(this.activeJobs.values()).find(
                job => job.modelType === 'intent' && job.language === lang &&
                       (job.status === 'pending' || job.status === 'processing')
            );

            if (!existingJob) {
                // Create learning job
                const job = await this.createLearningJob('intent', lang);

                if (job) {
                  console.log(`[continuousLearning] Created intent learning job due to feedback threshold: ${job.jobId}`);
                  jobCreated = true;
                  // Start job processing if no review required
                  if (!this.config.reviewRequired) {
                    // Add job to the front of the queue to be processed next
                    this.learningQueue = [job.jobId, ...this.learningQueue.filter(id => id !== job.jobId)];
                    this.processLearningQueue(1);
                  }
                }
            } else {
                console.log(`[continuousLearning] Skipping intent job creation for ${lang} - existing job ${existingJob.jobId} is pending/processing.`);
            }
          }
        }
      }

      // Check if we have enough feedback for entity learning
      const entityFeedback = this.dataRepository.feedbackItems.filter(
        item => item.type === FeedbackType.ENTITY_CORRECTION
      );

      if (entityFeedback.length >= this.config.feedbackThreshold) {
        // Group by language
        const byLanguage: Record<Language, FeedbackItem[]> = {
          de: [],
          en: []
        };

        entityFeedback.forEach(item => {
          const itemLang = item.language;
          // Korrektur: Sicherstellen, dass itemLang ein gültiger Schlüssel ist
          if (itemLang && (itemLang === 'de' || itemLang === 'en')) {
            byLanguage[itemLang].push(item);
          } else {
            // Default to 'de' if no language specified or invalid
            byLanguage['de'].push(item);
          }
        });

        // Create learning jobs for languages with enough feedback
        // Fixed (TS2532): Ensure this.config.supportedLanguages is not undefined
        const supportedLanguages = this.config.supportedLanguages ?? [];
        for (const lang of supportedLanguages) {
          if (byLanguage[lang]?.length >= this.config.feedbackThreshold) { // Fixed (TS2532): Check byLanguage[lang]
             // Check if a pending/processing job already exists for this type/language
            const existingJob = Array.from(this.activeJobs.values()).find(
                job => job.modelType === 'entity' && job.language === lang &&
                       (job.status === 'pending' || job.status === 'processing')
            );

            if (!existingJob) {
                // Create learning job
                const job = await this.createLearningJob('entity', lang);

                if (job) {
                  console.log(`[continuousLearning] Created entity learning job due to feedback threshold: ${job.jobId}`);
                  jobCreated = true;
                  // Start job processing if no review required
                  if (!this.config.reviewRequired) {
                     // Add job to the front of the queue to be processed next
                    this.learningQueue = [job.jobId, ...this.learningQueue.filter(id => id !== job.jobId)];
                    this.processLearningQueue(1);
                  }
                }
            } else {
                 console.log(`[continuousLearning] Skipping entity job creation for ${lang} - existing job ${existingJob.jobId} is pending/processing.`);
            }
          }
        }
      }

      return jobCreated; // Return whether *any* job was created
    } catch (error) {
      console.error(`[continuousLearning] Error checking feedback threshold:`, error);
      return false;
    }
  }

  /**
   * Executes a learning job
   *
   * @param job The learning job to execute
   * @returns Whether the job execution was successful
   */
  private async executeLearningJob(job: LearningJobStatus): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Executing learning job: ${job.jobId}`);

      // Job status is already set to 'processing' before calling this function

      // Execute the appropriate learning process
      let success = false;

      if (job.modelType === 'intent') {
        success = await this.executeIntentLearning(job);
      } else if (job.modelType === 'entity') {
        success = await this.executeEntityLearning(job);
      } else if (job.modelType === 'context') {
        success = await this.executeContextLearning(job);
      } else {
        console.warn(`[continuousLearning] Unsupported model type for learning: ${job.modelType}`);
      }

      // Update job status
      job.status = success ? 'completed' : 'failed';
      job.endTime = Date.now();

      // Update job in storage
      this.activeJobs.set(job.jobId, job);

      // Update stats
      if (success) {
        this.statistics.successfulJobs++;
      } else {
        this.statistics.failedJobs++;
      }
      // pendingJobs was decremented before calling this function

      console.log(`[continuousLearning] Learning job ${job.jobId} completed with status: ${job.status}`);

      return success;
    } catch (error) {
      console.error(`[continuousLearning] Error executing learning job:`, error);

      // Update job status
      job.status = 'failed';
      job.endTime = Date.now();
      job.errors = [...(job.errors || []), (error as Error).message]; // Store error message

      // Update job in storage
      this.activeJobs.set(job.jobId, job);

      // Update stats
      this.statistics.failedJobs++;
      // pendingJobs was decremented before calling this function

      return false;
    }
  }

  /**
   * Executes intent learning
   *
   * @param job The learning job
   * @returns Whether the learning was successful
   */
  private async executeIntentLearning(job: LearningJobStatus): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Executing intent learning for ${job.language}`);

      // Get current model for evaluation
      // Annahme: loadModel gibt NLPModel | null zurück
      const currentModel = await loadModel('intent', job.language);

      if (!currentModel) {
          console.error(`[continuousLearning] Failed to load current intent model for ${job.language}`);
          job.errors = [...(job.errors || []), `Failed to load current model for ${job.language}`];
          return false;
      }

      // Create a trainer instance
      // Annahme: intentTrainer.create gibt einen Trainer mit loadTrainingData und trainModel zurück
      const trainer = intentTrainer.create(job.language);

      if (!trainer || typeof trainer.loadTrainingData !== 'function' || typeof trainer.trainModel !== 'function') {
           console.error(`[continuousLearning] Failed to create intent trainer for ${job.language}`);
           job.errors = [...(job.errors || []), `Failed to create intent trainer for ${job.language}`];
           return false;
      }

      // Load training data into the trainer
      // Annahme: loadTrainingData benötigt keine Argumente oder holt sie sich selbst
      await trainer.loadTrainingData();

      // Get relevant feedback
      const relevantFeedback = this.getRelevantFeedbackItems('intent', job.language);

      // Apply feedback to training data
      const feedbackApplied = await this.applyFeedbackToIntentTrainingData(
        trainer,
        relevantFeedback
      );

      if (!feedbackApplied) {
        console.warn(`[continuousLearning] Failed to apply feedback to intent training data`);
        job.errors = [...(job.errors || []), `Failed to apply feedback to intent training data`];
        return false;
      }

      // Train a new model
      // Annahme: trainModel gibt ein Objekt mit modelPath zurück
      const trainingResult = await trainer.trainModel('hybrid');

      if (!trainingResult || !trainingResult.modelPath) {
        console.warn(`[continuousLearning] Failed to train new model`);
        job.errors = [...(job.errors || []), `Failed to train new model`];
        return false;
      }

      // Evaluate both models
      // Annahme: evaluator.evaluateIntent gibt EvaluationResults zurück
      // Annahme: this.dataRepository.intents[job.language] ist das Test-Set
      // Fixed (TS2532): Ensure this.dataRepository.intents[job.language] is not undefined
      const testDataIntents = this.dataRepository.intents[job.language];
      if (!testDataIntents) {
           console.error(`[continuousLearning] Intent test data repository not initialized for language ${job.language}`);
           job.errors = [...(job.errors || []), `Intent test data repository not initialized for language ${job.language}`];
           return false;
      }

      // Fixed (TS2345): Ensure currentModel is not null before passing to evaluateIntent
      if (!currentModel) {
           console.error(`[continuousLearning] Current model is null, cannot evaluate.`);
           job.errors = [...(job.errors || []), `Current model is null, cannot evaluate.`];
           return false;
      }

      const currentEvaluation = await evaluator.evaluateIntent(
        currentModel,
        testDataIntents,
        job.language
      );

      // Load the newly trained model for evaluation
      // Annahme: loadModel kann den neu trainierten Modellpfad laden
      // Fixed (TS2559): Pass modelPath within the options object
      const newModel = await loadModel('intent', job.language, { modelPath: trainingResult.modelPath });

      if (!newModel) {
          console.error(`[continuousLearning] Failed to load newly trained intent model from ${trainingResult.modelPath}`);
          job.errors = [...(job.errors || []), `Failed to load newly trained model from ${trainingResult.modelPath}`];
          return false;
      }

      const newEvaluation = await evaluator.evaluateIntent(
        newModel,
        testDataIntents, // Use the same test data
        job.language
      );

      // Compare evaluations
      // Annahme: evaluator.compareModels gibt ein Vergleichsobjekt zurück
      // Fixed (TS2345): Ensure currentEvaluation and newEvaluation conform to EvaluationResults type
      // This requires the local type definition or casting if the external type is incomplete.
      // Assuming the local type definition for EvaluationResults and BaseMetrics is used here.
      const comparison = evaluator.compareModels(currentEvaluation as EvaluationResults, newEvaluation as EvaluationResults);

      // Store metrics
      // Korrektur (TS2322, TS2532): Sicherer Zugriff auf EvaluationResults
      job.improvementMetrics = {
        baseline: {
          accuracy: currentEvaluation?.overallMetrics?.accuracy ?? 0,
          precision: currentEvaluation?.overallMetrics?.precision ?? 0,
          recall: currentEvaluation?.overallMetrics?.recall ?? 0,
          f1Score: currentEvaluation?.overallMetrics?.f1Score ?? 0
        },
        improved: {
          accuracy: newEvaluation?.overallMetrics?.accuracy ?? 0,
          precision: newEvaluation?.overallMetrics?.precision ?? 0,
          recall: newEvaluation?.overallMetrics?.recall ?? 0,
          f1Score: newEvaluation?.overallMetrics?.f1Score ?? 0
        },
        percentageImprovement: {
          accuracy: comparison?.metrics?.accuracy?.pctImprovement ?? 0,
          precision: comparison?.metrics?.precision?.pctImprovement ?? 0,
          recall: comparison?.metrics?.recall?.pctImprovement ?? 0,
          f1Score: comparison?.metrics?.f1Score?.pctImprovement ?? 0 // Korrektur (TS18048, TS2532)
        }
      };

      // Check if improvement is significant
      // Korrektur (TS2532): Sicherer Zugriff auf f1Score
      const isSignificantImprovement = (job.improvementMetrics.percentageImprovement?.f1Score ?? 0) > (this.config.improvementThreshold * 100);

      // Set recommendation
      if (!job.metadata) {
        job.metadata = {};
      }

      // Korrektur (TS2532): Sicherer Zugriff auf comparison.metrics.errorReductionRate
      job.metadata = {
        ...job.metadata,
        recommendedAction: isSignificantImprovement ? 'deploy' : 'keep_current',
        modelPath: trainingResult.modelPath,
        errorReductionRate: comparison?.metrics?.errorReductionRate ?? 0 // Fallback
      };

      // Update statistics
      // Korrektur (TS2322): Sicherstellen, dass job.improvementMetrics.percentageImprovement existiert
      if (job.improvementMetrics.percentageImprovement) {
          this.updateImprovementStatistics('intent', job.improvementMetrics.percentageImprovement);
      }


      // Mark as successful
      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error in intent learning:`, error);
      job.errors = [...(job.errors || []), (error as Error).message]; // Store error message
      return false;
    }
  }

  /**
   * Executes entity learning
   *
   * @param job The learning job
   * @returns Whether the learning was successful
   */
  private async executeEntityLearning(job: LearningJobStatus): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Executing entity learning for ${job.language}`);

      // Get current model for evaluation
      // Annahme: loadModel gibt NLPModel | null zurück
      const currentModel = await loadModel('entity', job.language);

      if (!currentModel) {
          console.error(`[continuousLearning] Failed to load current entity model for ${job.language}`);
          job.errors = [...(job.errors || []), `Failed to load current model for ${job.language}`];
          return false;
      }

      // Get relevant feedback
      const relevantFeedback = this.getRelevantFeedbackItems('entity', job.language);

      // Apply feedback to training data
      const feedbackApplied = await this.applyFeedbackToEntityTrainingData(
        relevantFeedback,
        job.language
      );

      if (!feedbackApplied) {
        console.warn(`[continuousLearning] Failed to apply feedback to entity training data`);
        job.errors = [...(job.errors || []), `Failed to apply feedback to entity training data`];
        return false;
      }

      // In a real implementation, this would train a new entity model
      // For this example, we'll simulate the process

      // Convert entity items to test data format
      const testData: Record<string, string[]> = {};

      // Korrektur (TS2322): Sicherstellen, dass this.dataRepository.entities[job.language] existiert
      const entitiesForLang = this.dataRepository.entities[job.language];
      if (!entitiesForLang) {
          console.error(`[continuousLearning] Entity data repository not initialized for language ${job.language}`);
          job.errors = [...(job.errors || []), `Entity data repository not initialized for language ${job.language}`];
          return false;
      }

      entitiesForLang.forEach(entity => {
        if (entity && entity.name) { // Korrektur: Check entity for null/undefined and name
            if (entity.examples && entity.examples.length > 0) {
              testData[entity.name] = entity.examples;
            } else if (entity.data && entity.data.length > 0) {
              testData[entity.name] = entity.data;
            }
        }
      });

      // Evaluate both models
      // Annahme: evaluator.evaluateEntity gibt EvaluationResults zurück
      // Fixed (TS2345): Ensure currentModel is not null before passing to evaluateEntity
      if (!currentModel) {
           console.error(`[continuousLearning] Current model is null, cannot evaluate.`);
           job.errors = [...(job.errors || []), `Current model is null, cannot evaluate.`];
           return false;
      }

      const currentEvaluation = await evaluator.evaluateEntity(
        currentModel,
        testData,
        job.language
      );

      // For this example, simulate a new evaluation with slight improvements
      // Korrektur (TS2532): Sicherer Zugriff auf currentEvaluation.overallMetrics
      const currentMetrics = currentEvaluation?.overallMetrics;
      const newEvaluation = {
        ...currentEvaluation,
        overallMetrics: {
          accuracy: (currentMetrics?.accuracy ?? 0) * 1.05,
          precision: (currentMetrics?.precision ?? 0) * 1.03,
          recall: (currentMetrics?.recall ?? 0) * 1.04,
          f1Score: (currentMetrics?.f1Score ?? 0) * 1.04
        }
      };

      // Compare evaluations
      // Annahme: evaluator.compareModels gibt ein Vergleichsobjekt zurück
      // Fixed (TS2345): Ensure currentEvaluation and newEvaluation conform to EvaluationResults type
      const comparison = evaluator.compareModels(currentEvaluation as EvaluationResults, newEvaluation as EvaluationResults);

      // Store metrics
      // Korrektur (TS2322, TS2532): Sicherer Zugriff auf EvaluationResults
      job.improvementMetrics = {
        baseline: {
          accuracy: currentEvaluation?.overallMetrics?.accuracy ?? 0,
          precision: currentEvaluation?.overallMetrics?.precision ?? 0,
          recall: currentEvaluation?.overallMetrics?.recall ?? 0,
          f1Score: currentEvaluation?.overallMetrics?.f1Score ?? 0
        },
        improved: {
          accuracy: newEvaluation?.overallMetrics?.accuracy ?? 0,
          precision: newEvaluation?.overallMetrics?.precision ?? 0,
          recall: newEvaluation?.overallMetrics?.recall ?? 0,
          f1Score: newEvaluation?.overallMetrics?.f1Score ?? 0
        },
        percentageImprovement: {
          accuracy: comparison?.metrics?.accuracy?.pctImprovement ?? 0,
          precision: comparison?.metrics?.precision?.pctImprovement ?? 0,
          recall: comparison?.metrics?.recall?.pctImprovement ?? 0,
          f1Score: comparison?.metrics?.f1Score?.pctImprovement ?? 0
        }
      };

      // Check if improvement is significant
      // Korrektur (TS2532): Sicherer Zugriff auf f1Score
      const isSignificantImprovement = (job.improvementMetrics.percentageImprovement?.f1Score ?? 0) > (this.config.improvementThreshold * 100);

      // Set recommendation
      if (!job.metadata) {
        job.metadata = {};
      }

      // Korrektur (TS2532): Sicherer Zugriff auf comparison.metrics.errorReductionRate
      job.metadata = {
        ...job.metadata,
        recommendedAction: isSignificantImprovement ? 'deploy' : 'keep_current',
        modelPath: 'simulated_path', // Placeholder
        errorReductionRate: comparison?.metrics?.errorReductionRate ?? 0 // Fallback
      };

      // Update statistics
      // Korrektur (TS2322): Sicherstellen, dass job.improvementMetrics.percentageImprovement existiert
      if (job.improvementMetrics.percentageImprovement) {
          this.updateImprovementStatistics('entity', job.improvementMetrics.percentageImprovement);
      }


      // Mark as successful
      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error in entity learning:`, error);
      job.errors = [...(job.errors || []), (error as Error).message]; // Store error message
      return false;
    }
  }

  /**
   * Executes context learning
   *
   * @param job The learning job
   * @returns Whether the learning was successful
   */
  private async executeContextLearning(job: LearningJobStatus): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Executing context learning for ${job.language}`);

      // For this example, we'll just simulate context learning
      // In a real implementation, this would use actual context model training

      // Simulate improved metrics
      // Korrektur (TS2322): Sicherstellen, dass die zugewiesenen Werte Zahlen sind
      job.improvementMetrics = {
        baseline: {
          accuracy: 0.82,
          precision: 0.79,
          recall: 0.81,
          f1Score: 0.80
        },
        improved: {
          accuracy: 0.85,
          precision: 0.83,
          recall: 0.84,
          f1Score: 0.83
        },
        percentageImprovement: {
          accuracy: 3.66,
          precision: 5.06,
          recall: 3.70,
          f1Score: 3.75 // Korrektur (TS2532)
        }
      };

      // Check if improvement is significant
      // Korrektur (TS2532): Sicherer Zugriff auf f1Score
      const isSignificantImprovement = (job.improvementMetrics.percentageImprovement?.f1Score ?? 0) > (this.config.improvementThreshold * 100);

      // Set recommendation
      if (!job.metadata) {
        job.metadata = {};
      }

      job.metadata = {
        ...job.metadata,
        recommendedAction: isSignificantImprovement ? 'deploy' : 'keep_current',
        modelPath: 'simulated_path', // Placeholder
        errorReductionRate: 3.7 // Placeholder
      };

      // Update statistics
      // Korrektur (TS2322): Sicherstellen, dass job.improvementMetrics.percentageImprovement existiert
      if (job.improvementMetrics.percentageImprovement) {
          this.updateImprovementStatistics('context', job.improvementMetrics.percentageImprovement);
      }


      // Mark as successful
      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error in context learning:`, error);
      job.errors = [...(job.errors || []), (error as Error).message]; // Store error message
      return false;
    }
  }

  /**
   * Applies feedback to intent training data
   *
   * @param trainer The intent trainer
   * @param feedback The feedback items
   * @returns Whether the application was successful
   */
  private async applyFeedbackToIntentTrainingData(
    trainer: any, // Annahme: Trainer-Typ ist 'any' oder ein spezifisches Interface
    feedback: FeedbackItem[]
  ): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Applying ${feedback.length} feedback items to intent training data`);

      // Process intent correction feedback
      const correctionFeedback = feedback.filter(item =>
        item.type === FeedbackType.INTENT_CORRECTION &&
        item.data?.correctIntent // Korrektur (TS18048): Sicherer Zugriff auf data?.correctIntent
      );

      for (const item of correctionFeedback) {
        // Korrektur (TS18048): Sicherstellen, dass item.data existiert
        if (item.data) {
          const text = item.data.text || '';
          const correctIntent = item.data.correctIntent || ''; // Korrektur (TS18048): Sicherer Zugriff

          if (text && correctIntent) {
            // Add as example to correct intent
            // Annahme: addExample akzeptiert string, string, Language
            this.addExample(text, correctIntent, item.language || 'de'); // Korrektur (TS18048): Sicherer Zugriff auf item.language
          }
        }
      }

      // Process new example feedback
      const newExampleFeedback = feedback.filter(item =>
        item.type === FeedbackType.NEW_EXAMPLE &&
        item.data?.text && // Korrektur (TS18048): Sicherer Zugriff
        item.data?.intent // Korrektur (TS18048): Sicherer Zugriff
      );

      for (const item of newExampleFeedback) {
        // Korrektur (TS18048): Sicherstellen, dass item.data existiert
        if (item.data) {
          const text = item.data.text || '';
          const intent = item.data.intent || ''; // Korrektur (TS18048): Sicherer Zugriff

          if (text && intent) {
            // Add as example
            // Annahme: addExample akzeptiert string, string, Language
            this.addExample(text, intent, item.language || 'de'); // Korrektur (TS18048): Sicherer Zugriff auf item.language
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error applying feedback to intent training data:`, error);
      return false;
    }
  }

  /**
   * Applies feedback to entity training data
   *
   * @param feedback The feedback items
   * @param language The language
   * @returns Whether the application was successful
   */
  private async applyFeedbackToEntityTrainingData(
    feedback: FeedbackItem[],
    language: Language
  ): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Applying ${feedback.length} feedback items to entity training data`);

      // Process entity correction feedback
      const correctionFeedback = feedback.filter(item =>
        item.type === FeedbackType.ENTITY_CORRECTION &&
        item.data?.entityType && // Korrektur (TS18048): Sicherer Zugriff
        item.data?.entityValue // Korrektur (TS18048): Sicherer Zugriff
      );

      for (const item of correctionFeedback) {
        // Korrektur (TS18048): Sicherstellen, dass item.data existiert
        if (item.data) {
          const entityType = item.data.entityType || ''; // Korrektur (TS18048): Sicherer Zugriff
          const entityValue = item.data.entityValue || ''; // Korrektur (TS18048): Sicherer Zugriff

          if (entityType && entityValue) {
            // Add as entity example
            // Annahme: addEntityExample akzeptiert string, string, Language
            this.addEntityExample(entityValue, entityType, language);
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error applying feedback to entity training data:`, error);
      return false;
    }
  }

  /**
   * Updates improvement statistics
   *
   * @param modelType The model type
   * @param improvements The improvement percentages
   */
  private updateImprovementStatistics(
    modelType: 'intent' | 'entity' | 'context',
    improvements: Record<string, number>
  ): void {
    // Korrektur (TS7053): Sicherstellen, dass averageImprovement[modelType] existiert
    // Fixed (TS7053): Ensure this.statistics.averageImprovement is not undefined
    const currentStats = this.statistics.averageImprovement && this.statistics.averageImprovement[modelType];
    if (!currentStats) {
        console.error(`[continuousLearning] Statistics.averageImprovement for model type ${modelType} not initialized.`);
        return;
    }

    const metricKeys = Object.keys(improvements) as Array<keyof typeof improvements>;

    // For each metric, update the average
    for (const metric of metricKeys) {
      // Korrektur (TS2322): Sicherstellen, dass improvements[metric] eine Zahl ist
      const improvementValue = improvements[metric];
      if (typeof improvementValue === 'number' && isFinite(improvementValue)) {
          // Korrektur (TS2322): Sicherstellen, dass currentStats[metric] eine Zahl ist
          const currentMetricValue = currentStats[metric] ?? 0; // Verwende 0 als Fallback
          currentStats[metric] = (currentMetricValue + improvementValue) / 2;
      } else {
          console.warn(`[continuousLearning] Skipping non-numeric improvement value for metric ${metric}: ${improvementValue}`);
      }
    }
  }

  /**
   * Processes intent correction feedback
   *
   * @param feedback The feedback item
   * @returns Whether the processing was successful
   */
  private async processIntentCorrectionFeedback(feedback: FeedbackItem): Promise<boolean> {
    try {
      // Korrektur (TS18048): Sicherstellen, dass feedback.data existiert
      if (feedback.data?.correctIntent && feedback.data?.predictedIntent) {
        const correctIntent = feedback.data.correctIntent;
        const predictedIntent = feedback.data.predictedIntent;

        // Find or create entry in top misclassifications
        const existingIndex = this.statistics.topMisclassifications.findIndex(
          item => item.correctIntent === correctIntent && item.predictedIntent === predictedIntent
        );

        if (existingIndex !== -1) {
          // Increment count
          const misclassification = this.statistics.topMisclassifications[existingIndex];
          if (misclassification) {
            misclassification.count++;
          }

          // Sort by count
          this.statistics.topMisclassifications.sort((a, b) => b.count - a.count);

          // Limit to top 10
          this.statistics.topMisclassifications = this.statistics.topMisclassifications.slice(0, 10);
        } else {
          // Add new entry
          this.statistics.topMisclassifications.push({
            correctIntent,
            predictedIntent,
            count: 1
          });

          // Sort by count
          this.statistics.topMisclassifications.sort((a, b) => b.count - a.count);

          // Limit to top 10
          this.statistics.topMisclassifications = this.statistics.topMisclassifications.slice(0, 10);
        }
      }

      // If learning modes.misclassification is enabled, add the example to training data
      // Korrektur (TS18048): Sicherstellen, dass feedback.data existiert
      if (this.config.learningModes.misclassification &&
          feedback.data?.text &&
          feedback.data?.correctIntent) {

        // Add as example to the correct intent
        // Korrektur (TS18048): Sicherer Zugriff auf feedback.data.text und feedback.data.correctIntent
        const text = feedback.data.text;
        const correctIntent = feedback.data.correctIntent;
        const language = feedback.language || 'de'; // Korrektur (TS18048): Sicherer Zugriff

        return this.addExample(text, correctIntent, language);
      }

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error processing intent correction feedback:`, error);
      return false;
    }
  }

  /**
   * Processes entity correction feedback
   *
   * @param feedback The feedback item
   * @returns Whether the processing was successful
   */
  private async processEntityCorrectionFeedback(feedback: FeedbackItem): Promise<boolean> {
    try {
      // Korrektur (TS18048): Sicherstellen, dass feedback.data existiert
      if (feedback.data?.entityType) {
        const entityType = feedback.data.entityType;

        // Find or create entry in top missing entities
        const existingIndex = this.statistics.topMissingEntities.findIndex(
          item => item.entityType === entityType
        );

        if (existingIndex !== -1) {
          // Increment count if the element exists
          const entity = this.statistics.topMissingEntities[existingIndex];
          if (entity) {
            entity.count++;
          }

          // Sort by count
          this.statistics.topMissingEntities.sort((a, b) => b.count - a.count);

          // Limit to top 10
          this.statistics.topMissingEntities = this.statistics.topMissingEntities.slice(0, 10);
        } else {
          // Add new entry
          this.statistics.topMissingEntities.push({
            entityType,
            count: 1
          });

          // Sort by count
          this.statistics.topMissingEntities.sort((a, b) => b.count - a.count);

          // Limit to top 10
          this.statistics.topMissingEntities = this.statistics.topMissingEntities.slice(0, 10);
        }
      }

      // If learning modes.entityExtraction is enabled, add the entity to training data
      // Korrektur (TS18048): Sicherstellen, dass feedback.data existiert
      if (this.config.learningModes.entityExtraction &&
          feedback.data?.entityValue &&
          feedback.data?.entityType) {

        // Add as entity example
        // Korrektur (TS18048): Sicherer Zugriff auf feedback.data.entityValue und feedback.data.entityType
        const entityValue = feedback.data.entityValue;
        const entityType = feedback.data.entityType;
        const language = feedback.language || 'de'; // Korrektur (TS18048): Sicherer Zugriff

        return this.addEntityExample(entityValue, entityType, language);
      }

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error processing entity correction feedback:`, error);
      return false;
    }
  }

  /**
   * Processes response quality feedback
   *
   * @param feedback The feedback item
   * @returns Whether the processing was successful
   */
  private async processResponseQualityFeedback(feedback: FeedbackItem): Promise<boolean> {
    try {
      // For response quality, we just track statistics
      // In a real implementation, this would analyze patterns in negative feedback
      // to improve response generation

      // Track sentiment stats
      // Korrektur (TS2532): Sicherstellen, dass feedback.data existiert und rating ein Number ist
      if (feedback.data && typeof feedback.data.rating === 'number' && this.statistics.sentimentTracker) {
        const rating = feedback.data.rating;

        if (rating > 3) {
          // Positive rating
          this.statistics.sentimentTracker.positive++;
        } else if (rating < 3) {
          // Negative rating
          this.statistics.sentimentTracker.negative++;
        } else {
          // Neutral rating
          this.statistics.sentimentTracker.neutral++;
        }
        // Optional: Update sentiment trend based on recent ratings
      }

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error processing response quality feedback:`, error);
      return false;
    }
  }

  /**
   * Processes new example feedback
   *
   * @param feedback The feedback item
   * @returns Whether the processing was successful
   */
  private async processNewExampleFeedback(feedback: FeedbackItem): Promise<boolean> {
    try {
      // If learning modes.newExamples is enabled, add the example to training data
      // Korrektur (TS18048): Sicherstellen, dass feedback.data existiert
      if (this.config.learningModes.newExamples &&
          feedback.data?.text &&
          feedback.data?.intent) {

        // Add as example to the intent
        // Korrektur (TS18048): Sicherer Zugriff auf feedback.data.text und feedback.data.intent
        const text = feedback.data.text;
        const intent = feedback.data.intent;
        const language = feedback.language || 'de'; // Korrektur (TS18048): Sicherer Zugriff

        return this.addExample(text, intent, language);
      }

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error processing new example feedback:`, error);
      return false;
    }
  }

  /**
   * Gets relevant feedback items for a model type and language
   *
   * @param modelType The model type
   * @param language The language
   * @returns Array of relevant feedback items
   */
  private getRelevantFeedbackItems(
    modelType: ModelType,
    language: Language
  ): FeedbackItem[] {
    try {
      // Filter feedback by model type and language
      let relevantTypes: FeedbackType[] = [];

      if (modelType === 'intent') {
        relevantTypes = [FeedbackType.INTENT_CORRECTION, FeedbackType.NEW_EXAMPLE];
      } else if (modelType === 'entity') {
        relevantTypes = [FeedbackType.ENTITY_CORRECTION];
      } else if (modelType === 'context') {
        relevantTypes = [FeedbackType.CORRECTION]; // Use generic correction as fallback
      }
      // Optional: Add other model types like 'sentiment', 'embedding', 'language'

      return this.dataRepository.feedbackItems.filter(item => {
        const itemLang = item.language;
        // Korrektur: Sicherstellen, dass itemLang ein gültiger Schlüssel ist
        return relevantTypes.includes(item.type) &&
               (itemLang === language || !itemLang); // Include items without specified language as default
      });
    } catch (error) {
      console.error(`[continuousLearning] Error getting relevant feedback:`, error);
      return [];
    }
  }

  /**
   * Counts new examples for a model type and language
   *
   * @param modelType The model type
   * @param language The language
   * @returns Number of new examples
   */
  private countNewExamples(
    modelType: ModelType,
    language: Language
  ): number {
    try {
      if (modelType === 'intent') {
        // Count new intent examples
        // Korrektur (TS2532): Sicherstellen, dass candidateExamples existiert
        const candidateExamples = this.dataRepository.candidateExamples;
        if (!candidateExamples) return 0;

        return Object.keys(candidateExamples)
          .filter(key => key.startsWith(`${language}_`))
          .reduce((count, key) => {
              // Korrektur (TS2532): Sicherstellen, dass candidateExamples[key] existiert
              const examples = candidateExamples[key];
              return count + (examples ? examples.length : 0);
          }, 0);
      } else if (modelType === 'entity') {
        // Count new entity examples
        // Korrektur (TS2532): Sicherstellen, dass candidateEntities existiert
        const candidateEntities = this.dataRepository.candidateEntities;
        if (!candidateEntities) return 0;

        return Object.keys(candidateEntities)
          .filter(key => key.startsWith(`${language}_`))
          .reduce((count, key) => {
              // Korrektur (TS2532): Sicherstellen, dass candidateEntities[key] existiert
              const examples = candidateEntities[key];
              return count + (examples ? examples.length : 0);
          }, 0);
        }

      return 0;
    } catch (error) {
      console.error(`[continuousLearning] Error counting new examples:`, error);
      return 0;
    }
  }

  /**
   * Loads existing training data
   *
   * @returns Whether the loading was successful
   */
  private async loadTrainingData(): Promise<boolean> {
    try {
      console.log(`[continuousLearning] Loading existing training data`);

      // For each supported language, load intent and entity data
      // Korrektur (TS2532): Sicherstellen, dass this.config.supportedLanguages existiert
      const supportedLanguages = this.config.supportedLanguages;
      if (!supportedLanguages || !Array.isArray(supportedLanguages)) {
          console.error(`[continuousLearning] Supported languages configuration is missing or invalid.`);
          return false;
      }

      for (const language of supportedLanguages) {
        try {
          // Load intent data
          // Annahme: loadJSONFile gibt {intents: IntentItem[]} | null | undefined zurück
          const intentData = await loadJSONFile<{intents: IntentItem[]}>(`intents_${language}.json`);

          // Korrektur (TS2532): Sicherer Zugriff auf intentData und intentData.intents
          if (intentData?.intents && Array.isArray(intentData.intents)) {
            this.dataRepository.intents[language] = intentData.intents;
            console.log(`[continuousLearning] Loaded ${intentData.intents.length} intents for ${language}`);
          } else {
             console.warn(`[continuousLearning] No valid intent data found for ${language}`);
             this.dataRepository.intents[language] = []; // Initialisiere mit leerem Array
          }
        } catch (intentError) {
          console.warn(`[continuousLearning] Error loading intent data for ${language}:`, intentError);
          this.dataRepository.intents[language] = []; // Initialisiere mit leerem Array bei Fehler
        }

        try {
          // Load entity data
          // Annahme: loadJSONFile gibt {entities: EntityItem[]} | null | undefined zurück
          const entityData = await loadJSONFile<{entities: EntityItem[]}>(`entities_${language}.json`);

          // Korrektur (TS2532): Sicherer Zugriff auf entityData und entityData.entities
          if (entityData?.entities && Array.isArray(entityData.entities)) {
            this.dataRepository.entities[language] = entityData.entities;
            console.log(`[continuousLearning] Loaded ${entityData.entities.length} entity types for ${language}`);
          } else {
             console.warn(`[continuousLearning] No valid entity data found for ${language}`);
             this.dataRepository.entities[language] = []; // Initialisiere mit leerem Array
          }
        } catch (entityError) {
          console.warn(`[continuousLearning] Error loading entity data for ${language}:`, entityError);
          this.dataRepository.entities[language] = []; // Initialisiere mit leerem Array bei Fehler
        }
        // Optional: Load context data if applicable
      }

      // In a real implementation, this would also load feedback history
      // For this example, we'll start with empty feedback

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error loading training data:`, error);
      return false;
    }
  }

  /**
   * Creates initial statistics
   *
   * @returns Initial learning statistics
   */
  private createInitialStatistics(): LearningStatistics {
    // Fixed (TS7053): Initialize averageImprovement and modelUpdates with all ModelType keys
    return {
      totalFeedbackItems: 0,
      processedFeedbackItems: 0,
      totalLearningJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      pendingJobs: 0,
      averageImprovement: {
        intent: {},
        entity: {},
        context: {},
        sentiment: {}, // Added
        embedding: {}, // Added
        language: {}   // Added
      },
      modelUpdates: {
        intent: 0,
        entity: 0,
        context: 0,
        sentiment: 0, // Added
        embedding: 0, // Added
        language: 0   // Added
      },
      topMisclassifications: [],
      topMissingEntities: [],
      lastUpdateTime: Date.now(),
      sentimentTracker: {
        positive: 0,
        negative: 0,
        neutral: 0,
        trend: 0
      }
    };
  }

  /**
   * Performs cleanup of old data
   *
   * @returns Whether the cleanup was successful
   */
  public performCleanup(): boolean {
    try {
      console.log(`[continuousLearning] Performing data cleanup`);

      // Clean up old feedback items
      const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      this.dataRepository.feedbackItems = this.dataRepository.feedbackItems.filter(
        item => item.timestamp && item.timestamp > oneMonthAgo
      );

      // Clean up old jobs
      const threeMonthsAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

      for (const [jobId, job] of this.activeJobs.entries()) {
        if (job.startTime < threeMonthsAgo) {
          this.activeJobs.delete(jobId);
        }
      }

      // Clean up completed A/B tests
      for (const [testId, test] of this.activeABTests.entries()) {
        if (test.status === 'completed' &&
            test.endTime &&
            test.endTime < threeMonthsAgo) {
          this.activeABTests.delete(testId);
        }
      }

      // Update last cleanup time
      this.lastCleanupTime = Date.now();

      return true;
    } catch (error) {
      console.error(`[continuousLearning] Error performing cleanup:`, error);
      return false;
    }
  }
}

// Export a singleton instance
export const continuousLearning = new ContinuousLearning();