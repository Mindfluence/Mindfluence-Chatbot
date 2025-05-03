/**
 * @/types/nlp.types.ts
 * Contains all type definitions for the NLP engine components
 */

import type { AIModel, ModelMetadata, AIModelType } from '@/features/nlp-engine/ai/models/modelRegistry';

/**
 * Supported languages for the chatbot
 */
export type Language = 'de' | 'en';

/**
 * Types of feedback that can be collected
 */
export enum FeedbackType {
  /** Explicit thumbs up/positive feedback */
  POSITIVE = 'positive',
  /** Explicit thumbs down/negative feedback */
  NEGATIVE = 'negative',
  /** User provided a correction to chatbot response */
  CORRECTION = 'correction',
  /** User asked a follow-up question that indicates confusion */
  CLARIFICATION = 'clarification',
  /** User ignored or did not engage with response */
  IGNORED = 'ignored',
  /** User provided explicit rating for response */
  RATING = 'rating',
  /** User provided general comments or suggestions */
  COMMENT = 'comment',
  /** User terminated conversation or session abruptly */
  TERMINATION = 'termination',
  /** Intent correction feedback */
  INTENT_CORRECTION = 'intent_correction',
  /** Entity correction feedback */
  ENTITY_CORRECTION = 'entity_correction',
  /** Response quality feedback */
  RESPONSE_QUALITY = 'response_quality',
  /** New example feedback */
  NEW_EXAMPLE = 'new_example'
}

/**
 * Represents an entity recognized in user input
 */
export interface Entity {
  /** The type/category of the entity (e.g., 'location', 'date', 'product') */
  type: string;
  /** The extracted value of the entity */
  value: string;
  /** The original text from which the entity was extracted */
  text?: string;
  /** Confidence score of the entity extraction (0.0 to 1.0) */
  confidence?: number;
  /** Start position of the entity in the original text */
  start?: number;
  /** End position of the entity in the original text */
  end?: number;
  /** Optional additional data related to the entity */
  metadata?: Record<string, any>;
  /** Position in the text (for simpler implementation) */
  position?: number;
}

/**
 * Enhanced entity with additional context information
 */
export interface EnhancedEntity extends Entity {
  /** Was this entity detected in the current message? */
  isNew: boolean;
  /** Was this entity carried over from previous context? */
  fromPreviousContext: boolean;
  /** Should this entity persist across turns? */
  isPersistent?: boolean;
  /** When was this entity last seen or added? */
  timestamp: number;
}

/**
 * Represents an intent recognized from user input
 */
export interface Intent {
  /** The name of the intent (e.g., 'greeting', 'booking_request') */
  name: string;
  /** The type of intent (e.g., 'faq', 'smalltalk', 'function') */
  type?: string;
  /** Confidence score of the intent detection (0.0 to 1.0) */
  confidence: number;
  /** Optional information about the domain or category the intent belongs to */
  category?: string;
  /** Optional examples that were used to train this intent */
  examples?: string[];
  /** Optional patterns for matching */
  patterns?: string[];
  /** Optional description of the intent */
  description?: string;
}

/**
 * Options for intent detection
 */
export interface IntentDetectionOptions {
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Whether to convert to lowercase */
  toLowerCase?: boolean;
  /** Whether to remove punctuation */
  removePunctuation?: boolean;
  /** Whether to normalize whitespace */
  normalizeWhitespace?: boolean;
  /** Enable debugging output */
  debug?: boolean;
  /** Whether to enrich intents with metadata */
  enrichIntents?: boolean;
  /** Whether to normalize German umlauts (ä->ae, ö->oe, etc.) */
  normalizeGermanUmlauts?: boolean;
}

/**
 * Intent item as defined in the JSON data structure
 */
export interface IntentItem {
  /** The name of the intent */
  name: string;
  /** Description of the intent */
  description: string;
  /** Examples used to train the intent */
  examples: string[];
  /** Optional responses for this intent */
  responses?: string[];
  /** Optional type of the intent */
  type?: string;
  /** Optional patterns for matching */
  patterns?: string[];
  /** Optional category of the intent */
  category?: string;
}

/**
 * Entity item as defined in the JSON data structure
 */
export interface EntityItem {
  /** The name of the entity type */
  name: string;
  /** Description of the entity */
  description: string;
  /** Optional extractor method name */
  extractor?: string;
  /** Examples for this entity */
  examples: string[];
  /** Optional data/values for this entity */
  data?: string[];
  /** Optional values for this entity (alternative to data) */
  values?: string[];
}

/**
 * Represents the conversation context
 */
export interface Context {
  /** The type/name of the context (e.g., 'initial', 'followup', 'clarification') */
  name: string;
  /** Confidence score of the context determination (0.0 to 1.0) */
  confidence: number;
  /** Entities that are relevant in the current context */
  entities: Entity[];
  /** Recent intents that are relevant to the current context */
  recentIntents: Intent[];
  /** Current conversation topics */
  topics: string[];
  /** Whether this is a long-running conversation */
  isLongConversation?: boolean;
  /** Number of messages in the conversation */
  messageCount?: number;
  /** Last message in the conversation */
  lastMessage?: string;
  /** Any additional context-specific information */
  [key: string]: any;
}

/**
 * Enhanced context with additional conversation insights
 */
export interface EnhancedContext extends Context {
  /** Timestamp of context creation/update */
  timestamp: number;
  /** Total messages in the current relevant history */
  messageCount: number;
  /** Flag for longer conversations */
  isLongConversation: boolean;
  /** Was a context break detected? */
  hasContextBreak?: boolean;
  /** Type of break (e.g., 'topic_change', 'digression') */
  contextBreakType?: string;
  /** How did the intent change from the previous turn? */
  intentTransition?: string;
  /** Sentiment of the last message */
  sentiment?: string;
  /** Urgency level of the message */
  urgency?: string;
  /** Additional sentiment analysis data */
  sentimentInfo?: Record<string, any>;
  /** Assessed complexity of the current context */
  contextComplexity?: 'low' | 'medium' | 'high';
  /** Persistent information across sessions */
  persistentInfo?: Record<string, any>;
  /** Override entities to ensure they are EnhancedEntity within an EnhancedContext */
  entities: EnhancedEntity[];
}

/**
 * Result of NLP processing on user input
 */
export interface NLPProcessingResult {
  /** The detected primary intent (if any) */
  intent?: Intent | null;
  /** All detected entities */
  entities: Entity[];
  /** The current conversation context */
  context?: Context;
  /** Any error that occurred during processing */
  error?: Error | string;
  /** The original input text before preprocessing */
  originalText?: string;
  /** The preprocessed text used for analysis */
  preprocessedText?: string;
  /** Generated response from LLM (when using generative mode) */
  generatedResponse?: string;
}

/**
 * Types of NLP models
 */
export type ModelType = 'intent' | 'entity' | 'context' | 'embedding' | 'language' | 'sentiment' | 'generative';

/**
 * Interface for NLP models used by the engine
 * Extends AIModel to ensure compatibility
 */
export interface NLPModel extends AIModel {
  /** Name of the model */
  name?: string;
  /** Type of the model, overrides AIModel.type with more specific type */
  type: AIModelType;
  /** Language the model supports */
  language?: Language;
  /** Internal data used by the model */
  data?: any;
  /** Prediction method that can handle both string and string[] inputs */
  predict: (input: string | string[]) => Promise<any>;
  /** Whether the model is ready for use */
  isReady?: boolean;
  /** Returns metadata about the model */
  getInfo: () => ModelMetadata;
  /** Optional method to check if the model is ready */
  isReadySync?: () => boolean;
  /** Optional method to load model from a path */
  load?: (modelPath: string, language: Language) => Promise<boolean>;
}

/**
 * Options for entity extraction
 */
export interface EntityExtractionOptions {
  /** Whether to use pattern matching */
  usePatternMatching?: boolean;
  /** Whether to use intent context for extraction */
  useIntentContext?: boolean;
  /** Minimum confidence threshold for entities */
  confidenceThreshold?: number;
  /** Maximum number of entities to extract per type */
  maxEntitiesPerType?: number;
  /** Enable debugging output */
  debug?: boolean;
}

/**
 * Options for context management
 */
export interface ContextManagementOptions {
  /** Previous conversation context */
  previousContext?: Context;
  /** Whether to perform additional context enrichment */
  enrichContext?: boolean;
  /** Maximum context window size */
  maxContextWindow?: number;
  /** Context resolution strategy */
  resolutionStrategy?: 'recency' | 'confidence' | 'hybrid';
}

/**
 * Model configuration options
 */
export interface ModelOptions {
  /** Path to the model files */
  modelPath?: string;
  /** Custom preprocessing steps */
  preprocessors?: string[];
  /** Custom features to extract */
  features?: string[];
  /** Model-specific parameters */
  parameters?: Record<string, any>;
}

/**
 * Configuration for the generative LLM
 */
export interface GenerativeLLMConfig {
  /** Whether the generative mode is enabled */
  enabled: boolean;
  /** Name of the model to use (e.g., 'Xenova/gpt2-small') */
  modelName: string;
  /** Temperature setting for generation (0.0-1.0) */
  temperature: number;
  /** Maximum token length for generated responses */
  maxLength: number;
  /** Whether to load the model on startup */
  loadOnStartup?: boolean;
  /** Whether to use hybrid mode (combining rule-based and generative) */
  useHybridMode?: boolean;
  
  /** Hybrid mode settings */
  hybridMode?: {
    /** Settings for when to prefer generative responses */
    preferGenerative?: {
      /** Prefer generative mode when intent confidence is low */
      lowConfidence?: boolean;
      /** Prefer generative mode for unknown intents */
      unknownIntent?: boolean;
      /** Prefer generative mode for follow-up questions */
      followUp?: boolean;
    };
    /** Intent types that prefer generative responses */
    preferredIntentTypes?: string[];
    /** Intent types that prefer rule-based responses */
    preferredRuleBasedTypes?: string[];
    /** Confidence threshold below which to use generative mode */
    confidenceThreshold?: number;
  };
  
  /** Prompt configuration */
  promptConfig?: {
    /** System prompts by language */
    systemPrompt?: Record<Language, string>;
    /** Maximum number of conversation history messages to include */
    maxHistoryLength?: number;
    /** Whether to include intent information in the prompt */
    includeIntentInfo?: boolean;
    /** Whether to include entity information in the prompt */
    includeEntityInfo?: boolean;
  };
}

/**
 * NLP engine configuration
 */
export interface NLPEngineConfig {
  /** Default language */
  defaultLanguage: Language;
  /** Base path for model files */
  modelBasePath?: string;
  /** Intent detection thresholds */
  intentThresholds: {
    high: number;
    medium: number;
    low: number;
  };
  /** NLP-specific configuration */
  nlp: {
    modelBasePath: string;
    useSentimentAnalysis?: boolean;
    useContextTracking?: boolean;
    useFallbackResponse?: boolean;
    useSemanticIntentRefinement?: boolean;
    responseDelay?: {
      min: number;
      maxPerChar: number;
      max: number;
    };
    modelCaching?: {
      enabled: boolean;
      maxAge: number;
    };
    defaultLanguage: Language;
    supportedLanguages: Language[];
    logging?: {
      enabled: boolean;
      level: string;
      saveToFile: boolean;
    };
    contextManagement?: {
      maxContextWindow: number;
      maxCachedConversations: number;
      persistentEntityTypes: string[];
      highConfidenceThreshold: number;
      enableEnhancedContext: boolean;
      contextCacheTimeout: number;
    };
    embeddingStoragePath?: string;
    /** Configuration for generative LLM */
    generativeLLM?: GenerativeLLMConfig;
    intentThresholds?: {
      high: number;
      medium: number;
      low: number;
      byType?: Record<string, number>;
    };
    ai?: {
      embeddingModel?: {
        modelPath: string;
        tokenizerPath: string;
        name: string;
        dimension: number;
        maxSeqLength: number;
        parameters?: Record<string, any>;
      };
      semanticSearch?: {
        similarityThreshold: number;
        maxResults: number;
        useContextWeighting: boolean;
        intentRefinement?: {
          fusionMethod: string;
          minConfidenceGain: number;
          highConfidenceThreshold: number;
          fallbackToSemantic: boolean;
          useExampleWeighting: boolean;
        };
      };
      languageModel?: {
        modelType: string;
        endpoint?: string;
        apiKey?: string;
        maxTokens: number;
        temperature: number;
      };
    };
    [key: string]: any;
  };
  /** Model configuration */
  models: {
    intent: ModelOptions;
    entity: ModelOptions;
    context: ModelOptions;
    sentiment?: ModelOptions;
    generative?: ModelOptions;
  };
  /** Fallback responses */
  fallbacks: Record<Language, Record<string, string[]>>;
  /** Security configuration for various security features */
  security?: {
    /** Maximum text length for tokenization (to prevent DoS attacks) */
    maxTokenizerTextLength?: number;
    /** Salt used for token validation hashing */
    tokenSalt?: string;
    /** Whether to log suspicious tokens */
    logSuspiciousTokens?: boolean;
    /** Other security settings */
    [key: string]: any;
  };
  /**
   * KI/AI-spezifische Konfigurationen, einschließlich ONNX Runtime
   */
  ai?: {
    /** Basispfad für die KI-Modelle */
    modelBasePath?: string;
    /** Anzahl der Threads für ONNX Runtime */
    onnxThreads?: number;
    /** Log-Level für ONNX Runtime */
    onnxLogLevel?: 'verbose' | 'info' | 'warning' | 'error' | 'fatal';
    /** SIMD-Support für ONNX Runtime WASM */
    onnxSimd?: boolean;
    /** Proxy-Modus für ONNX Runtime WASM */
    onnxProxy?: boolean;
    /** Timeout für ONNX Runtime WASM-Initialisierung in ms */
    onnxInitTimeout?: number;
    /** Zusätzliche AI-bezogene Konfigurationen */
    [key: string]: any;
  };
}

/**
 * Registry for loaded NLP models
 */
export interface NLPModelRegistry {
  /** Intent detection models by language */
  intent: Record<Language, NLPModel>;
  /** Entity extraction models by language */
  entity: Record<Language, NLPModel>;
  /** Context management models by language */
  context: Record<Language, NLPModel>;
  /** Sentiment analysis models by language */
  sentiment?: Record<Language, NLPModel>;
  /** Generative language models by language */
  generative?: Record<Language, NLPModel>;
  /** Get a specific model */
  getModel(type: ModelType, language: Language): NLPModel | null;
  /** Register a new model */
  registerModel(model: NLPModel, type: ModelType, language: Language): void;
}

/**
 * Feedback item for continuous learning
 */
export interface FeedbackItem {
  /** Unique identifier */
  id: string;
  /** When the feedback was created */
  timestamp: number;
  /** User ID who provided the feedback */
  userId?: string;
  /** Session ID related to the feedback */
  sessionId: string;
  /** Conversation ID */
  conversationId: string;
  /** Message ID that this feedback is about */
  messageId: string;
  /** Feedback type (correction, rating, example, etc.) */
  type: FeedbackType;
  /** Status of the feedback processing */
  status: 'new' | 'processing' | 'applied' | 'rejected' | 'ignored';
  /** Language of the feedback */
  language?: Language;
  /** Detailed data related to the feedback */
  data?: {
    /** The intent that was detected */
    intent?: string;
    /** The corrected intent if the original was wrong */
    correctedIntent?: string;
    /** The entity type that was involved */
    entityType?: string;
    /** The entity value that was detected */
    entityValue?: string;
    /** The corrected entity value if the original was wrong */
    correctedEntityValue?: string;
    /** User rating (e.g., 1-5) */
    rating?: number;
    /** User comment */
    comment?: string;
    /** Example text for learning */
    exampleText?: string;
    /** Intent for the example text */
    exampleIntent?: string;
    /** Original text that this feedback pertains to */
    text?: string;
    /** The intent that was predicted but was incorrect */
    predictedIntent?: string;
    /** Any other custom properties */
    [key: string]: any;
  };
  /** Original user message */
  originalMessage?: string;
  /** Chatbot's response that received feedback */
  botResponse?: string;
  /** NLP processing result for the original message */
  nlpResult?: NLPProcessingResult;
  /** Context at the time of the response */
  context?: Context;
  /** How the feedback was collected (explicit, implicit, etc.) */
  source?: 'explicit' | 'implicit' | 'derived' | 'system';
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Status information for a learning job
 */
export interface LearningJobStatus {
  /** Unique identifier */
  jobId: string;
  /** Current status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Timestamp when job was created/started */
  startTime: number;
  /** Timestamp when job was completed/failed */
  endTime?: number;
  /** The type of model being trained */
  modelType: ModelType;
  /** Language of the model */
  language: Language;
  /** Number of feedback items used for learning */
  feedbackCount: number;
  /** Number of new examples added */
  newExamplesCount: number;
  /** Whether human review is required */
  requiresReview: boolean;
  /** Status of the review process */
  reviewStatus?: 'pending' | 'approved' | 'rejected';
  /** Status of deployment */
  deploymentStatus?: 'pending' | 'deployed' | 'rolled_back';
  /** Error information if status is 'failed' */
  errors?: string[];
  /** Improvement metrics */
  improvementMetrics?: {
    /** Baseline metrics */
    baseline: Record<string, number>;
    /** Improved metrics */
    improved: Record<string, number>;
    /** Percentage improvement */
    percentageImprovement: Record<string, number>;
  };
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Learning performance statistics
 */
export interface LearningStatistics {
  /** Total number of feedback items */
  totalFeedbackItems: number;
  /** Number of processed feedback items */
  processedFeedbackItems: number;
  /** Total number of learning jobs */
  totalLearningJobs: number;
  /** Number of successful jobs */
  successfulJobs: number;
  /** Number of failed jobs */
  failedJobs: number;
  /** Number of pending jobs */
  pendingJobs: number;
  /** Average improvement by model type */
  averageImprovement: {
    intent: Record<string, number>;
    entity: Record<string, number>;
    context: Record<string, number>;
  };
  /** Number of model updates by type */
  modelUpdates: {
    intent: number;
    entity: number;
    context: number;
  };
  /** Top misclassifications */
  topMisclassifications: Array<{
    correctIntent: string;
    predictedIntent: string;
    count: number;
  }>;
  /** Top missing entities */
  topMissingEntities: Array<{
    entityType: string;
    count: number;
  }>;
  /** When statistics were last updated */
  lastUpdateTime: number;
  /** Sentiment tracking information */
  sentimentTracker?: {
    /** Count of positive sentiments */
    positive: number;
    /** Count of negative sentiments */
    negative: number;
    /** Count of neutral sentiments */
    neutral: number;
    /** Trend indicator (change over time) */
    trend: number;
  };
}