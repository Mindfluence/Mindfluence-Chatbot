// src/features/nlp-engine/ai/feedback/feedbackCollector.ts

// TS1484: Type-only imports for types
import type { Entity, Intent, Context, NLPProcessingResult } from '@/types/nlp.types';
// TS1484: Type-only imports for UserCorrection type
import type { UserCorrection } from './correctionAnalyzer';
// TS1361 fix: Import CorrectionType as a regular value, not just a type
// Give it an alias to avoid collision if FeedbackType from types/nlp.types.ts is also used
import { CorrectionType as CorrectionAnalyzerType, CorrectionAnalyzer } from './correctionAnalyzer';
import { config } from '../..//config';
// TS2304: Import basicTokenize for analyzeSentiment
import { basicTokenize } from '../../utils/tokenizer';


/**
 * Types of user feedback that can be collected
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
  TERMINATION = 'termination'
  // NOTE: FeedbackType enum in types/nlp.types.ts has more values.
  // It might be better to align this enum or import it directly from there.
  // Assuming for now this enum is intended to be separate or a subset.
}

/**
 * Sentiment of the feedback
 */
export enum FeedbackSentiment {
  VERY_POSITIVE = 'very_positive',
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
  VERY_NEGATIVE = 'very_negative',
  MIXED = 'mixed'
}

/**
 * Categories of feedback issues
 */
export enum FeedbackCategory {
  /** Issues with understanding user intent */
  INTENT_RECOGNITION = 'intent_recognition',
  /** Issues with entity detection or resolution */
  ENTITY_RECOGNITION = 'entity_recognition',
  /** Factual errors in responses */
  FACTUAL_ACCURACY = 'factual_accuracy',
  /** Relevance of response to the query */
  RELEVANCE = 'relevance',
  /** Completeness of information provided */
  COMPLETENESS = 'completeness',
  /** Clarity and understandability of responses */
  CLARITY = 'clarity',
  /** Tone and style appropriateness */
  TONE = 'tone',
  /** Technical errors or failures */
  TECHNICAL = 'technical',
  /** General feedback not fitting other categories */
  GENERAL = 'general'
}

/**
 * Feedback item containing user feedback
 */
export interface FeedbackItem {
  /** Unique identifier for the feedback */
  id: string;
  /** Type of feedback */
  type: FeedbackType;
  /** Content/text of feedback (if provided) */
  content?: string;
  /** Numeric rating (e.g., 1-5 stars) */
  rating?: number;
  /** Sentiment of the feedback */
  sentiment?: FeedbackSentiment;
  /** Categories this feedback relates to */
  categories?: FeedbackCategory[];
  /** Session ID */
  sessionId: string;
  /** Conversation ID */
  conversationId: string;
  /** Message ID that received feedback */
  messageId: string;
  /** User ID (if available) */
  userId?: string;
  /** Original user message */
  originalMessage?: string;
  /** Chatbot's response that received feedback */
  botResponse?: string;
  /** NLP processing result for the original message */
  nlpResult?: NLPProcessingResult;
  /** Context at the time of the response */
  context?: Context;
  /** Timestamp when feedback was recorded */
  timestamp: number;
  /** How the feedback was collected (explicit, implicit, etc.) */
  source: 'explicit' | 'implicit' | 'derived' | 'system';
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Summary of feedback metrics
 */
export interface FeedbackMetrics {
  /** Total feedback count */
  totalFeedback: number;
  /** Feedback count by type */
  byType: Record<FeedbackType, number>;
  /** Average rating (if ratings were collected) */
  averageRating?: number;
  /** Distribution of ratings (1-5) */
  ratingDistribution?: number[];
  /** Feedback count by category */
  byCategory: Record<FeedbackCategory, number>;
  /** Feedback count by sentiment */
  bySentiment: Record<FeedbackSentiment, number>;
  /** Recent trends in feedback */
  trends: {
    /** Recent average rating */
    recentAverageRating?: number;
    /** Recent positive feedback rate */
    recentPositiveRate: number;
    /** Recent negative feedback rate */
    recentNegativeRate: number;
    /** Change in positive rate from previous period */
    positiveRateChange: number;
  };
  /** Most common issue categories */
  topIssueCategories: {
    category: FeedbackCategory;
    count: number;
  }[];
  /** Timestamp this summary was generated */
  generatedAt: number;
}

/**
 * Options for feedback collection
 */
export interface FeedbackCollectionOptions {
  /** Minimum rating considered positive (e.g., 4+ on 1-5 scale) */
  minPositiveRating?: number;
  /** Whether to automatically categorize feedback */
  autoCategorize?: boolean;
  /** Whether to automatically analyze corrections */
  analyzeCorrections?: boolean;
  /** Whether to do sentiment analysis */
  analyzeSentiment?: boolean;
  /** How many recent feedback items to use for trends */
  trendWindowSize?: number;
  /** Maximum number of feedback items to store in memory */
  maxStoredItems?: number;
  /** Duration in milliseconds for metrics cache freshness */
  metricsCacheDurationMs?: number;
}

/**
 * FeedbackCollector gathers, processes, and organizes user feedback about
 * chatbot interactions. It supports various feedback types and integrates
 * with analyzers for deeper processing.
 */
export class FeedbackCollector {
  private static instance: FeedbackCollector;
  private feedback: Map<string, FeedbackItem> = new Map();
  private feedbackByConversation: Map<string, Set<string>> = new Map();
  private feedbackBySession: Map<string, Set<string>> = new Map();
  private feedbackByUser: Map<string, Set<string>> = new Map();

  // Cache for metrics to avoid recalculating frequently
  private cachedMetrics: FeedbackMetrics | null = null;
  private lastMetricsUpdate: number = 0;
  private metricsStale: boolean = true;

  private correctionAnalyzer: CorrectionAnalyzer;

  // Default collection options
  private defaultOptions: FeedbackCollectionOptions = {
    minPositiveRating: 4,
    autoCategorize: true,
    analyzeCorrections: true,
    analyzeSentiment: true,
    trendWindowSize: 100,
    maxStoredItems: 1000,
    metricsCacheDurationMs: 5 * 60 * 1000 // 5 minutes
  };

  // Current options (merged with defaults)
  private options: FeedbackCollectionOptions;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Get the correction analyzer instance
    this.correctionAnalyzer = CorrectionAnalyzer.getInstance();

    // Initialize options, potentially merging with a config value if available
    this.options = {
      ...this.defaultOptions,
      // Assuming config.nlp?.feedbackCollection might exist for overriding defaults
      ...(config.nlp?.feedbackCollection as Partial<FeedbackCollectionOptions> || {}) // TS2304: Assumes config is imported correctly
    };

    console.log('[FeedbackCollector] Initialized feedback collector');
    console.log('[FeedbackCollector] Current configuration:', this.options);
  }

  /**
   * Get the singleton instance of FeedbackCollector
   */
  public static getInstance(): FeedbackCollector {
    if (!FeedbackCollector.instance) {
      FeedbackCollector.instance = new FeedbackCollector();
    }
    return FeedbackCollector.instance;
  }

  /**
   * Configure feedback collection options
   * @param options The options to set
   */
  public configure(options: Partial<FeedbackCollectionOptions>): void {
    this.options = {
      ...this.options, // Start with current options
      ...options // Override with new options
    };

    console.log('[FeedbackCollector] Configuration updated:', this.options);
    // Invalidate metrics cache if options change
    this.metricsStale = true;
  }


  /**
   * Add a new feedback item
   * @param feedback The feedback to add (excluding ID, timestamp, sentiment, categories)
   * @returns The ID of the added feedback
   */
  public addFeedback(feedback: Omit<FeedbackItem, 'id' | 'timestamp' | 'sentiment' | 'categories'>): string {
    try {
      // Generate ID if not provided (should not be provided with Omit, but for safety)
      const id = (feedback as any).id || this.generateFeedbackId(); // Cast needed if id is sometimes passed
      const timestamp = Date.now();

      // Analyze sentiment if enabled
      // TS2345 fix: Ensure analyzeSentiment receives string for content
      const sentiment = this.options.analyzeSentiment ?
        this.analyzeSentiment(feedback.content || '', feedback.rating) :
        undefined;

      // Categorize feedback if enabled
      const categories = this.options.autoCategorize ?
        this.categorizeFeedback({ ...feedback, sentiment, rating: feedback.rating }) : // Pass potentially analyzed data
        undefined;

      // Create the complete feedback item
      const feedbackItem: FeedbackItem = {
        ...feedback,
        id,
        timestamp,
        sentiment,
        categories
      };

      // Enforce max stored items limit
      if (this.feedback.size >= (this.options.maxStoredItems || 1000)) {
         // Remove oldest item(s) if limit is reached
         const oldestFeedbackId = Array.from(this.feedback.values())
             .sort((a, b) => a.timestamp - b.timestamp)[0]?.id;
         if (oldestFeedbackId) {
             console.log(`[FeedbackCollector] Max items reached, removing oldest feedback: ${oldestFeedbackId}`);
             this.removeFeedback(oldestFeedbackId); // Implement a removeFeedback method
         } else {
             // Should not happen if size > 0, but as a fallback
             console.warn('[FeedbackCollector] Max items reached, but could not identify oldest item to remove.');
             // Optionally, refuse to add or clear all
             // this.clear(); // Drastic fallback
             // return ''; // Refuse to add
         }
      }


      // Store the feedback
      this.feedback.set(id, feedbackItem);
      this.metricsStale = true;

      // Update indexes
      this.updateFeedbackIndexes(id, feedbackItem);

      // Process correction if this is a correction and analysis is enabled
      if (feedbackItem.type === FeedbackType.CORRECTION && // Use feedbackItem to ensure fields are present
          feedbackItem.content &&
          feedbackItem.originalMessage && // Ensure original message is available for correction analysis
          feedbackItem.botResponse && // Ensure bot response is available for correction analysis
          this.options.analyzeCorrections) {
        this.processCorrection(feedbackItem); // Pass the fully formed feedbackItem
      }

      console.log(`[FeedbackCollector] Added feedback with ID: ${id}, type: ${feedback.type}`);
      return id;
    } catch (error) {
      console.error('[FeedbackCollector] Error adding feedback:', error);
      // Decide whether to throw or return null/empty string on error
      throw new Error('Failed to add feedback');
      // return ''; // Or return empty string to indicate failure
    }
  }

    /**
     * Removes a feedback item by ID and updates indexes.
     * @param id The ID of the feedback item to remove.
     */
    public removeFeedback(id: string): void {
        const feedbackItem = this.feedback.get(id);
        if (!feedbackItem) return;

        this.feedback.delete(id);

        // Remove from indexes
        if (feedbackItem.conversationId) {
            this.feedbackByConversation.get(feedbackItem.conversationId)?.delete(id);
            if (this.feedbackByConversation.get(feedbackItem.conversationId)?.size === 0) {
                this.feedbackByConversation.delete(feedbackItem.conversationId);
            }
        }
        if (feedbackItem.sessionId) {
            this.feedbackBySession.get(feedbackItem.sessionId)?.delete(id);
             if (this.feedbackBySession.get(feedbackItem.sessionId)?.size === 0) {
                this.feedbackBySession.delete(feedbackItem.sessionId);
            }
        }
         if (feedbackItem.userId) {
            this.feedbackByUser.get(feedbackItem.userId)?.delete(id);
             if (this.feedbackByUser.get(feedbackItem.userId)?.size === 0) {
                this.feedbackByUser.delete(feedbackItem.userId);
            }
        }

        this.metricsStale = true;
        console.log(`[FeedbackCollector] Removed feedback with ID: ${id}`);
    }


  /**
   * Add explicit positive (thumbs up) feedback
   * @param messageId ID of the message being upvoted
   * @param options Additional feedback data (conversationId, sessionId, userId, etc.)
   * @returns The ID of the added feedback
   */
  public addPositiveFeedback(
    messageId: string,
    options: Partial<Omit<FeedbackItem, 'id' | 'timestamp' | 'sentiment' | 'categories' | 'type' | 'messageId'>> = {}
  ): string {
    return this.addFeedback({
      type: FeedbackType.POSITIVE,
      messageId,
      sessionId: options.sessionId || 'unknown', // Ensure sessionId is always set
      conversationId: options.conversationId || 'unknown', // Ensure conversationId is always set
      source: 'explicit',
      ...options,
      content: options.content // Make sure content is included if provided
    });
  }

  /**
   * Add explicit negative (thumbs down) feedback
   * @param messageId ID of the message being downvoted
   * @param options Additional feedback data (conversationId, sessionId, userId, content etc.)
   * @returns The ID of the added feedback
   */
  public addNegativeFeedback(
    messageId: string,
    options: Partial<Omit<FeedbackItem, 'id' | 'timestamp' | 'sentiment' | 'categories' | 'type' | 'messageId'>> = {}
  ): string {
    return this.addFeedback({
      type: FeedbackType.NEGATIVE,
      messageId,
      sessionId: options.sessionId || 'unknown',
      conversationId: options.conversationId || 'unknown',
      source: 'explicit',
      ...options,
      content: options.content
    });
  }

  /**
   * Add a correction feedback
   * @param messageId ID of the message being corrected
   * @param correctionContent The correction text
   * @param options Additional feedback data (conversationId, sessionId, userId, originalMessage, botResponse, nlpResult, context etc.)
   * @returns The ID of the added feedback
   */
  public addCorrectionFeedback(
    messageId: string,
    correctionContent: string,
    options: Partial<Omit<FeedbackItem, 'id' | 'timestamp' | 'sentiment' | 'categories' | 'type' | 'messageId' | 'content'>> = {}
  ): string {
    // Ensure originalMessage and botResponse are provided for meaningful correction analysis
    if (!options.originalMessage || !options.botResponse) {
         console.warn("[FeedbackCollector] Adding correction feedback without originalMessage or botResponse. Analysis may be limited.");
         // Depending on requirements, you might throw an error here
         // throw new Error("originalMessage and botResponse are required for correction feedback");
    }

    return this.addFeedback({
      type: FeedbackType.CORRECTION,
      content: correctionContent,
      messageId,
      sessionId: options.sessionId || 'unknown',
      conversationId: options.conversationId || 'unknown',
      source: 'explicit',
      ...options
    });
  }

  /**
   * Add a rating feedback
   * @param messageId ID of the message being rated
   * @param rating Numeric rating value
   * @param options Additional feedback data (conversationId, sessionId, userId, content etc.)
   * @returns The ID of the added feedback
   */
  public addRatingFeedback(
    messageId: string,
    rating: number,
    options: Partial<Omit<FeedbackItem, 'id' | 'timestamp' | 'sentiment' | 'categories' | 'type' | 'messageId' | 'rating'>> = {}
  ): string {
     // Validate rating range if needed
     if (rating < 1 || rating > 5) { // Example range
         console.warn(`[FeedbackCollector] Adding rating feedback with invalid rating value: ${rating}. Expected 1-5.`);
         // Adjust rating or throw error
         rating = Math.max(1, Math.min(5, rating)); // Clamp to 1-5
     }

    return this.addFeedback({
      type: FeedbackType.RATING,
      rating,
      messageId,
      sessionId: options.sessionId || 'unknown',
      conversationId: options.conversationId || 'unknown',
      source: 'explicit',
      ...options,
      content: options.content
    });
  }

  /**
   * Add implicit feedback (e.g., ignored response, clarification requested, termination)
   * @param type The implicit feedback type (must be one of the allowed implicit types)
   * @param messageId ID of the message related to the feedback
   * @param options Additional feedback data (conversationId, sessionId, userId, content, nlpResult, context etc.)
   * @returns The ID of the added feedback
   */
  public addImplicitFeedback(
      type: FeedbackType.IGNORED | FeedbackType.CLARIFICATION | FeedbackType.TERMINATION, // Restrict allowed types
      messageId: string,
      options: Partial<Omit<FeedbackItem, 'id' | 'timestamp' | 'sentiment' | 'categories' | 'type' | 'messageId' | 'source'>> = {}
  ): string {
       // TS2367 fixed: The comparison `type === explicitType` is now valid because
       // 'type' is restricted to a union, and we check if it's *one of* the explicit types.
       // However, since the parameter is *already* restricted to only implicit types,
       // this check will *always* be false. The warning is still correct conceptually
       // if someone tries to pass an explicit type via a cast.
       // We can remove this check as it's guaranteed false by the type signature
       /*
       const explicitTypes: FeedbackType[] = [
           FeedbackType.POSITIVE,
           FeedbackType.NEGATIVE,
           FeedbackType.CORRECTION,
           FeedbackType.RATING,
           FeedbackType.COMMENT
        ];
       if (explicitTypes.includes(type as FeedbackType)) { // Cast needed because 'type' is restricted
           console.warn(`[FeedbackCollector] addImplicitFeedback called with an explicit feedback type: ${type}. Use specific add methods for explicit feedback.`);
       }
       */

       return this.addFeedback({
           type, // Type is guaranteed to be one of the implicit types
           messageId,
           sessionId: options.sessionId || 'unknown',
           conversationId: options.conversationId || 'unknown',
           source: 'implicit', // Source is explicitly implicit
           ...options
       });
  }


  /**
   * Get a specific feedback item by ID
   * @param id ID of the feedback to retrieve
   * @returns The feedback item or undefined if not found
   */
  public getFeedback(id: string): FeedbackItem | undefined {
    return this.feedback.get(id);
  }

  /**
   * Get all feedback for a specific conversation
   * @param conversationId The conversation ID
   * @returns Array of feedback items for the conversation
   */
  public getFeedbackForConversation(conversationId: string): FeedbackItem[] {
    const feedbackIds = this.feedbackByConversation.get(conversationId);
    if (!feedbackIds) return [];

    return Array.from(feedbackIds)
      .map(id => this.feedback.get(id))
      .filter((item): item is FeedbackItem => item !== undefined); // Type guard
  }

  /**
   * Get all feedback for a specific session
   * @param sessionId The session ID
   * @returns Array of feedback items for the session
   */
  public getFeedbackForSession(sessionId: string): FeedbackItem[] {
    const feedbackIds = this.feedbackBySession.get(sessionId);
    if (!feedbackIds) return [];

    return Array.from(feedbackIds)
      .map(id => this.feedback.get(id))
      .filter((item): item is FeedbackItem => item !== undefined); // Type guard
  }

  /**
   * Get all feedback from a specific user
   * @param userId The user ID
   * @returns Array of feedback items from the user
   */
  public getFeedbackFromUser(userId: string): FeedbackItem[] {
    const feedbackIds = this.feedbackByUser.get(userId);
    if (!feedbackIds) return [];

    return Array.from(feedbackIds)
      .map(id => this.feedback.get(id))
      .filter((item): item is FeedbackItem => item !== undefined); // Type guard
  }

  /**
   * Get feedback for a specific message
   * @param messageId The message ID
   * @returns Array of feedback items for the message
   */
  public getFeedbackForMessage(messageId: string): FeedbackItem[] {
    // Note: This is inefficient for a large number of feedback items.
    // Consider indexing by messageId if this is a frequent operation.
    return Array.from(this.feedback.values())
      .filter(item => item.messageId === messageId);
  }

  /**
   * Get all feedback
   * @returns Array of all feedback items
   */
  public getAllFeedback(): FeedbackItem[] {
    return Array.from(this.feedback.values());
  }

  /**
   * Get metrics and stats about collected feedback
   * @param forceRecalculate Whether to force recalculation even if cache is recent
   * @returns Feedback metrics
   */
  public getMetrics(forceRecalculate: boolean = false): FeedbackMetrics {
    const now = Date.now();

    // Use cached metrics if they're fresh (less than cacheDurationMs) and not stale
    const cacheDuration = this.options.metricsCacheDurationMs || 5 * 60 * 1000; // Default 5 minutes

    if (!forceRecalculate &&
        this.cachedMetrics &&
        !this.metricsStale &&
        now - this.lastMetricsUpdate < cacheDuration) {
      return this.cachedMetrics;
    }

    console.log(`[FeedbackCollector] Recalculating metrics (Stale: ${this.metricsStale}, Force: ${forceRecalculate}, Age: ${now - this.lastMetricsUpdate}ms)`);
    // Calculate new metrics
    const metrics = this.calculateMetrics();

    // Update cache
    this.cachedMetrics = metrics;
    this.lastMetricsUpdate = now;
    this.metricsStale = false;

    return metrics;
  }

  /**
   * Export feedback data for external storage
   * @returns Exportable feedback data
   */
  public exportFeedbackData(): {
    feedback: FeedbackItem[];
    metrics: FeedbackMetrics;
  } {
    return {
      feedback: this.getAllFeedback(),
      metrics: this.getMetrics()
    };
  }

  /**
   * Import feedback data from external source
   * @param data The feedback data to import
   * @returns Number of imported feedback items
   */
  public importFeedbackData(data: { feedback: FeedbackItem[] }): number {
    let importCount = 0;

    if (!data || !Array.isArray(data.feedback)) {
        console.warn('[FeedbackCollector] Invalid data format for import.');
        return 0;
    }

    // Consider a strategy for exceeding maxStoredItems.
    // Current: Just add up to limit, or clear if significantly over?
    // Simple approach: just add until the limit is reached, older incoming items might be ignored if limit is strict.
    // More complex: merge and keep the newest up to the limit.
    // Let's stick to the previous logic: clear if total would exceed limit significantly.
     const totalItemsAfterImport = this.feedback.size + data.feedback.length;
     if (totalItemsAfterImport > (this.options.maxStoredItems || 1000) * 1.2) { // Clear if more than 20% over limit after import
       console.warn(`[FeedbackCollector] Incoming data (${data.feedback.length} items) would exceed max storage limit (${this.options.maxStoredItems}). Clearing current storage.`);
       this.clear();
     } else if (totalItemsAfterImport > (this.options.maxStoredItems || 1000)) {
        console.warn(`[FeedbackCollector] Incoming data (${data.feedback.length} items) will exceed max storage limit (${this.options.maxStoredItems}). Importing up to limit.`);
        // Simple import up to limit - implies older imported items might replace newer existing ones depending on Map behavior (not guaranteed)
        // A proper implementation would sort all feedback (existing + new) by timestamp and keep the newest N.
     }


    // Import each feedback item
    for (const item of data.feedback) {
      // Optional: Basic validation of imported item
      if (!item || !item.id || !item.type || !item.sessionId || !item.conversationId || !item.messageId || item.timestamp === undefined || !item.source) { // Check timestamp specifically
          console.warn(`[FeedbackCollector] Skipping import of invalid feedback item: ${JSON.stringify(item)}`);
          continue;
      }

      // Add only if not already present or handle updates if needed
      if (!this.feedback.has(item.id)) {
          // Check limit again before adding
          if (this.feedback.size < (this.options.maxStoredItems || 1000)) {
             this.feedback.set(item.id, item);
             this.updateFeedbackIndexes(item.id, item); // Index after setting
             importCount++;
          } else {
               console.warn(`[FeedbackCollector] Stopped importing - max storage limit reached.`);
               break; // Stop importing if limit is hit during import
          }
      } else {
          // Handle duplicate ID (e.g., log, ignore, or update)
          console.log(`[FeedbackCollector] Skipping import of duplicate feedback ID: ${item.id}`);
      }
    }

    this.metricsStale = true;
    console.log(`[FeedbackCollector] Imported ${importCount} feedback items`);

    return importCount;
  }

  /**
   * Check if a message has received positive feedback
   * @param messageId The message ID to check
   * @returns Whether the message has positive feedback
   */
  public hasPositiveFeedback(messageId: string): boolean {
    const feedback = this.getFeedbackForMessage(messageId);

    const minPositiveRatingThreshold = this.options.minPositiveRating || 4;

    return feedback.some(item =>
      item.type === FeedbackType.POSITIVE ||
      (item.type === FeedbackType.RATING &&
       item.rating !== undefined &&
       item.rating >= minPositiveRatingThreshold)
    );
  }

  /**
   * Check if a message has received negative feedback
   * @param messageId The message ID to check
   * @returns Whether the message has negative feedback
   */
  public hasNegativeFeedback(messageId: string): boolean {
    const feedback = this.getFeedbackForMessage(messageId);

    const minPositiveRatingThreshold = this.options.minPositiveRating || 4;

    return feedback.some(item =>
      item.type === FeedbackType.NEGATIVE ||
      (item.type === FeedbackType.RATING &&
       item.rating !== undefined &&
       item.rating < minPositiveRatingThreshold)
    );
  }

  /**
   * Get feedback statistics for a specific conversation
   * @param conversationId The conversation ID
   * @returns Feedback statistics
   */
  public getConversationStats(conversationId: string): {
    positiveCount: number;
    negativeCount: number;
    correctionCount: number;
    averageRating?: number;
    dominantSentiment?: FeedbackSentiment;
  } {
    const feedback = this.getFeedbackForConversation(conversationId);

    const minPositiveRatingThreshold = this.options.minPositiveRating || 4;

    // Count feedback types
    const positiveCount = feedback.filter(item =>
      item.type === FeedbackType.POSITIVE ||
      (item.type === FeedbackType.RATING &&
       item.rating !== undefined &&
       item.rating >= minPositiveRatingThreshold)
    ).length;

    const negativeCount = feedback.filter(item =>
      item.type === FeedbackType.NEGATIVE ||
      (item.type === FeedbackType.RATING &&
       item.rating !== undefined &&
       item.rating < minPositiveRatingThreshold)
    ).length;

    const correctionCount = feedback.filter(item =>
      item.type === FeedbackType.CORRECTION
    ).length;

    // Calculate average rating if available
    const ratings = feedback
      .filter(item => item.type === FeedbackType.RATING && item.rating !== undefined)
      .map(item => item.rating as number);

    const averageRating = ratings.length > 0 ?
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length :
      undefined;

    // Determine dominant sentiment
    const sentimentCounts: Record<FeedbackSentiment, number> = {
      [FeedbackSentiment.VERY_POSITIVE]: 0,
      [FeedbackSentiment.POSITIVE]: 0,
      [FeedbackSentiment.NEUTRAL]: 0,
      [FeedbackSentiment.NEGATIVE]: 0,
      [FeedbackSentiment.VERY_NEGATIVE]: 0,
      [FeedbackSentiment.MIXED]: 0
    };

    feedback
      .filter(item => item.sentiment !== undefined)
      .forEach(item => {
        // Korrektur (TS2532): item.sentiment is guaranteed not undefined here
        sentimentCounts[item.sentiment as FeedbackSentiment]++; // Cast is safe
      });

    let dominantSentiment: FeedbackSentiment | undefined;
    let maxCount = -1; // Start with -1 to handle case where all counts are 0

    // Iterate over keys to find max count
    const orderedSentiments: FeedbackSentiment[] = [ // Define an order for tie-breaking if needed
        FeedbackSentiment.VERY_POSITIVE,
        FeedbackSentiment.POSITIVE,
        FeedbackSentiment.NEUTRAL,
        FeedbackSentiment.NEGATIVE,
        FeedbackSentiment.VERY_NEGATIVE,
        FeedbackSentiment.MIXED
    ];

    for (const sentiment of orderedSentiments) {
        const count = sentimentCounts[sentiment];
        if (count > maxCount) {
            maxCount = count;
            dominantSentiment = sentiment;
        }
        // No else if needed for tie-breaking with this order
    }


    // If maxCount is 0 (meaning no sentiment feedback), default to NEUTRAL
    if (maxCount === 0) {
        dominantSentiment = FeedbackSentiment.NEUTRAL; // TS2304 fix: Correct enum name
    }


    return {
      positiveCount,
      negativeCount,
      correctionCount,
      averageRating,
      dominantSentiment
    };
  }

  /**
   * Clear all stored feedback
   */
  public clear(): void {
    this.feedback.clear();
    this.feedbackByConversation.clear();
    this.feedbackBySession.clear();
    this.feedbackByUser.clear();
    this.cachedMetrics = null;
    this.metricsStale = true;

    console.log('[FeedbackCollector] Cleared all feedback data');
  }

  /**
   * Generate a unique ID for a feedback item
   */
  private generateFeedbackId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    // Use a UUID library for stronger uniqueness in production
    // return uuidv4(); // If you have uuid installed
    return `feed_${timestamp}_${random}`;
  }

  /**
   * Update the various feedback indexes (conversation, session, user)
   */
  private updateFeedbackIndexes(id: string, feedback: FeedbackItem): void {
    // Update conversation index
    if (feedback.conversationId) {
      if (!this.feedbackByConversation.has(feedback.conversationId)) {
        this.feedbackByConversation.set(feedback.conversationId, new Set());
      }
      this.feedbackByConversation.get(feedback.conversationId)!.add(id);
    }

    // Update session index
    if (feedback.sessionId) {
      if (!this.feedbackBySession.has(feedback.sessionId)) {
        this.feedbackBySession.set(feedback.sessionId, new Set());
      }
      this.feedbackBySession.get(feedback.sessionId)!.add(id);
    }

    // Update user index
    if (feedback.userId) {
      if (!this.feedbackByUser.has(feedback.userId)) {
        this.feedbackByUser.set(feedback.userId, new Set());
      }
      this.feedbackByUser.get(feedback.userId)!.add(id);
    }
  }

  /**
   * Process a correction feedback using the correction analyzer
   */
  private processCorrection(feedback: FeedbackItem): void {
    // Ensure required fields for CorrectionAnalyzer are present in the feedback item
    if (!feedback.content || !feedback.originalMessage || !feedback.botResponse) {
      console.warn('[FeedbackCollector] Skipping correction analysis due to missing data (content, originalMessage, or botResponse).');
      return;
    }

    try {
      // Create a user correction object using data from the feedback item
      const correction: UserCorrection = {
        id: feedback.id, // Use feedback item ID for the correction
        originalMessage: feedback.originalMessage,
        originalResponse: feedback.botResponse,
        correctionMessage: feedback.content, // Correction text is the content
        context: feedback.context,
        nlpResult: feedback.nlpResult,
        timestamp: feedback.timestamp,
        userId: feedback.userId,
        sessionId: feedback.sessionId,
        conversationId: feedback.conversationId,
        metadata: feedback.metadata // Include existing metadata
      };

      // Add to the correction analyzer
      this.correctionAnalyzer.addCorrection(correction);

      // Analyze the correction
      // Korrektur (TS2532): Access analysis result safely
      const analysis = this.correctionAnalyzer.analyzeCorrection(feedback.id);

      // Store analysis results in feedback metadata (handle metadata being undefined)
      if (!feedback.metadata) { // TS2532 fix: Check if metadata exists before assigning
        feedback.metadata = {};
      }
      feedback.metadata.correctionAnalysis = {
        correctionType: analysis.correctionType,
        confidence: analysis.confidence,
        learningValue: analysis.learningValue,
        extractedCorrectionsCount: analysis.extractedCorrections.length,
        suggestedChangesCount: analysis.suggestedChanges.length
      };

      console.log(`[FeedbackCollector] Processed correction feedback ${feedback.id} as ${analysis.correctionType}`);
    } catch (error) {
      console.error('[FeedbackCollector] Error processing correction analysis:', error);
      // Log the error but don't necessarily throw, as adding feedback might have succeeded
    }
  }


  /**
   * Analyze the sentiment of feedback content
   */
  private analyzeSentiment(
    content: string,
    rating?: number
  ): FeedbackSentiment {
    // Use rating if available
    if (rating !== undefined) {
      // Assuming rating is 1-5
      if (rating >= 5) return FeedbackSentiment.VERY_POSITIVE;
      if (rating >= 4) return FeedbackSentiment.POSITIVE;
      if (rating === 3) return FeedbackSentiment.NEUTRAL;
      if (rating >= 2) return FeedbackSentiment.NEGATIVE; // 2 or 1
      return FeedbackSentiment.VERY_NEGATIVE; // Must be 1 if clamped
    }

    // Simple keyword-based sentiment analysis for the content
    const lowerContent = content.toLowerCase();
    // TS2304: Call basicTokenize with correct arguments
    const tokens = basicTokenize(lowerContent, { preservePunctuation: false, toLowerCase: true, removeStopwords: false, language: 'en' }); // Use basic options


    // Count positive and negative words
    let positiveScore = 0;
    let negativeScore = 0;

    // Positive words and phrases (use a Set for faster lookup)
    const positiveWords = new Set([
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
      'helpful', 'thanks', 'thank you', 'appreciate', 'love', 'like',
      'perfect', 'accurate', 'useful', 'clear', 'correct', 'fine', 'okay', 'ok'
    ]);

    // Negative words and phrases (use a Set)
    const negativeWords = new Set([
      'bad', 'terrible', 'awful', 'horrible', 'wrong', 'incorrect',
      'unhelpful', 'useless', 'unclear', 'confusing', 'inaccurate',
      'disappointed', 'error', 'mistake', 'poor', 'fail', 'missing', 'not', 'no', 'n\'t' // Include n't for contractions
    ]);

    // Count token occurrences
    for (const token of tokens) {
      if (positiveWords.has(token)) {
        positiveScore++;
      }
      if (negativeWords.has(token)) {
        negativeScore++;
      }
    }

    // Simple negation handling (check token before)
    // This needs refinement for complex sentences, but improves basic accuracy
    const negationTokens = new Set(['not', 'no', 'n\'t', 'never']);

    for (let i = 0; i < tokens.length; i++) {
         const currentToken = tokens[i];
         const nextToken = tokens[i + 1]; // Look ahead for sentiment word

         if (currentToken && negationTokens.has(currentToken)) {
             if (nextToken && positiveWords.has(nextToken)) {
                 // Negated positive word (e.g., "not good")
                 positiveScore = Math.max(0, positiveScore - 1); // Decrement positive, ensure not negative
                 negativeScore++; // Increment negative
             } else if (nextToken && negativeWords.has(nextToken)) {
                 // Negated negative word (e.g., "not bad") - double negative
                 negativeScore = Math.max(0, negativeScore - 1); // Decrement negative
                 positiveScore++; // Increment positive
             }
         }
    }


    // Determine sentiment based on scores
    const totalScore = positiveScore - negativeScore;

    if (totalScore > 1) {
        return FeedbackSentiment.VERY_POSITIVE;
    } else if (totalScore === 1) {
        return FeedbackSentiment.POSITIVE;
    } else if (totalScore === 0) {
        return FeedbackSentiment.NEUTRAL;
    } else if (totalScore === -1) {
        return FeedbackSentiment.NEGATIVE;
    } else { // totalScore < -1
        return FeedbackSentiment.VERY_NEGATIVE;
    }

    // This keyword-based approach is basic. For better sentiment analysis,
    // integrate a dedicated sentiment analysis model (e.g., from Hugging Face).
    // Consider using the sentiment property from NLPProcessingResult if available.
    // if (feedback.nlpResult?.sentiment) { ... }
  }

  /**
   * Categorize feedback into issue categories
   */
  private categorizeFeedback(
    feedback: Omit<FeedbackItem, 'id' | 'timestamp' | 'categories'> // Includes sentiment and rating if available
  ): FeedbackCategory[] {
    const categories: FeedbackCategory[] = [];

    // Handle different feedback types
    switch (feedback.type) {
      case FeedbackType.POSITIVE:
        // Positive feedback doesn't typically indicate issues, but might reinforce positive aspects
        // Could potentially add categories like CLARITY or COMPLETENESS if content mentions it positively.
         if (feedback.content) {
             const contentCategories = this.categorizeFromContent(feedback.content, true); // Pass true to look for positive indicators
             categories.push(...contentCategories);
         }
        break;

      case FeedbackType.NEGATIVE:
        // Try to categorize negative feedback based on content or sentiment
        if (feedback.content) {
          categories.push(...this.categorizeFromContent(feedback.content));
        } else if (feedback.sentiment && (feedback.sentiment === FeedbackSentiment.NEGATIVE || feedback.sentiment === FeedbackSentiment.VERY_NEGATIVE)) {
             // If negative sentiment but no content, assume a general issue
             categories.push(FeedbackCategory.GENERAL);
         }
        break;

      case FeedbackType.CORRECTION:
        // Corrections often relate to factual or entity issues
        // Do NOT assume FactualAccuracy automatically. Rely on correction analysis if available.

        // If correction analysis was performed, use its result
         // TS2532 fix: Check if metadata and correctionAnalysis exist
         if (feedback.metadata?.correctionAnalysis?.correctionType) {
             const analysisType = feedback.metadata.correctionAnalysis.correctionType;
             // Map analysis types to Feedback Categories
             switch (analysisType) {
                 case CorrectionAnalyzerType.FACTUAL_ERROR: categories.push(FeedbackCategory.FACTUAL_ACCURACY); break;
                 case CorrectionAnalyzerType.INTENT_MISUNDERSTOOD: categories.push(FeedbackCategory.INTENT_RECOGNITION); break;
                 case CorrectionAnalyzerType.ENTITY_ERROR: categories.push(FeedbackCategory.ENTITY_RECOGNITION); break;
                 case CorrectionAnalyzerType.IRRELEVANT: categories.push(FeedbackCategory.RELEVANCE); break;
                 case CorrectionAnalyzerType.INCOMPLETE: categories.push(FeedbackCategory.COMPLETENESS); break;
                 case CorrectionAnalyzerType.LINGUISTIC: categories.push(FeedbackCategory.CLARITY); break; // Linguistic can affect clarity
                 case CorrectionAnalyzerType.TONE: categories.push(FeedbackCategory.TONE); break;
                 case CorrectionAnalyzerType.AMBIGUOUS: categories.push(FeedbackCategory.GENERAL); break; // Explicitly map ambiguous
                 default: categories.push(FeedbackCategory.GENERAL); break; // Add others as needed or default
             }
         } else if (feedback.content) {
          // Fallback to content analysis if correction analysis wasn't done or failed
          categories.push(...this.categorizeFromContent(feedback.content));
         } else {
             // Correction without content and analysis - general issue
             categories.push(FeedbackCategory.GENERAL);
         }
        break;

      case FeedbackType.CLARIFICATION:
        // Clarifications typically indicate clarity or relevance issues
        categories.push(FeedbackCategory.CLARITY); // Assume clarity is likely

        // Check for additional categories from content
        if (feedback.content) {
          const contentCategories = this.categorizeFromContent(feedback.content);
          for (const category of contentCategories) {
            if (category !== FeedbackCategory.CLARITY) { // Avoid adding CLARITY again
              categories.push(category);
            }
          }
        }
        break;

      case FeedbackType.RATING:
        // For low ratings with content, analyze the content
        if (feedback.rating !== undefined &&
            feedback.rating < (this.options.minPositiveRating || 4) &&
            feedback.content) {
          categories.push(...this.categorizeFromContent(feedback.content));
        } else if (feedback.rating !== undefined && feedback.rating < (this.options.minPositiveRating || 4)) {
             // Low rating without content indicates a general issue
             categories.push(FeedbackCategory.GENERAL);
        } else if (feedback.rating !== undefined && feedback.rating >= (this.options.minPositiveRating || 4) && feedback.content) {
             // High rating with content - categorize positive indicators
             categories.push(...this.categorizeFromContent(feedback.content, true));
        }
        break;

      case FeedbackType.COMMENT:
        // Comments can relate to any category, analyze content
        if (feedback.content) {
          categories.push(...this.categorizeFromContent(feedback.content));
        } else {
          categories.push(FeedbackCategory.GENERAL); // Comment without content is general
        }
        break;

      case FeedbackType.IGNORED:
        // Ignored responses may indicate relevance issues or lack of engagement
        categories.push(FeedbackCategory.RELEVANCE);
        // Could also potentially add GENERAL or based on original intent/context
        break;

      case FeedbackType.TERMINATION:
        // Terminations without specific content are general, but might indicate frustration
        categories.push(FeedbackCategory.GENERAL);
        // Could potentially correlate with negative sentiment if sentiment analysis is available
        break;

      default:
         // Handle unknown feedback types
         if (feedback.content) {
            categories.push(...this.categorizeFromContent(feedback.content));
         } else {
            categories.push(FeedbackCategory.GENERAL);
         }
         break;
    }

    // Ensure there's at least one category if analysis occurred but found nothing specific AND it's negative/correction/clarification/rating/comment
     const issueOrCommentTypes: FeedbackType[] = [
         FeedbackType.NEGATIVE,
         FeedbackType.CORRECTION,
         FeedbackType.CLARIFICATION,
         FeedbackType.RATING,
         FeedbackType.COMMENT
        ];
     if (categories.length === 0 && issueOrCommentTypes.includes(feedback.type) && (feedback.content || feedback.rating !== undefined)) {
          categories.push(FeedbackCategory.GENERAL);
     }


    // Deduplicate categories
    return Array.from(new Set(categories));
  }


  /**
   * Categorize feedback from its content using keyword matching
   * @param content The feedback content string
   * @param lookForPositiveIndicators If true, looks for positive phrasing indicators instead of issues
   * @returns Array of matching Feedback Categories
   */
  private categorizeFromContent(content: string, lookForPositiveIndicators: boolean = false): FeedbackCategory[] {
    const lowerContent = content.toLowerCase();
    const categories: FeedbackCategory[] = [];

    // TS2322 fix: Ensure all keys are present in both branches for Record type
    const categoryPatterns: Record<FeedbackCategory, string[]> = lookForPositiveIndicators ? {
         // Patterns indicating *good* performance in these areas
         [FeedbackCategory.INTENT_RECOGNITION]: [], // No typical positive phrasing for this
         [FeedbackCategory.ENTITY_RECOGNITION]: [], // No typical positive phrasing for this
         [FeedbackCategory.FACTUAL_ACCURACY]: ['accurate', 'correct', 'right', 'truth'],
         [FeedbackCategory.RELEVANCE]: ['relevant', 'related', 'on topic', 'what i wanted'],
         [FeedbackCategory.COMPLETENESS]: ['complete', 'full', 'detailed', 'enough information'],
         [FeedbackCategory.CLARITY]: ['clear', 'easy to understand', 'understandable', 'simple'],
         [FeedbackCategory.TONE]: ['friendly', 'polite', 'nice', 'professional', 'helpful tone'],
         [FeedbackCategory.TECHNICAL]: [], // No typical positive phrasing for this
         [FeedbackCategory.GENERAL]: ['good answer', 'great job', 'well done', 'thank you'] // Added thank you
    } : {
      // Patterns indicating *issues* in these areas (as defined before)
      [FeedbackCategory.INTENT_RECOGNITION]: [
        'understand', 'misunderstood', "didn't understand", 'meant', 'trying to ask',
        'different question', 'wrong question', 'not what i asked', 'confused what i meant'
      ],
      [FeedbackCategory.ENTITY_RECOGNITION]: [
        'name', 'wrong name', 'different name', 'entity', 'identified',
        'confused with', 'mixed up', 'mentioned', 'referring to', 'about X not Y'
      ],
      [FeedbackCategory.FACTUAL_ACCURACY]: [
        'wrong', 'incorrect', 'error', 'mistake', 'actually', 'fact',
        'false', 'untrue', 'inaccurate', 'truth is'
      ],
      [FeedbackCategory.RELEVANCE]: [
        'irrelevant', 'unrelated', 'off topic', 'not relevant', 'different topic',
        'not what i wanted', 'not asking about', 'nothing to do with', 'has nothing to do'
      ],
      [FeedbackCategory.COMPLETENESS]: [
        'missing', 'incomplete', 'left out', 'forgot', 'more information',
        'additional', 'also', 'too short', 'brief', 'elaborate', 'details'
      ],
      [FeedbackCategory.CLARITY]: [
        'unclear', 'confusing', 'vague', 'ambiguous', 'hard to understand',
        'cannot understand', "don't understand", 'not clear', 'clearer'
      ],
      [FeedbackCategory.TONE]: [
        'tone', 'rude', 'friendly', 'formal', 'informal', 'casual', // Friendly/formal can indicate a mismatch, not necessarily issue
        'professional', 'style', 'language', 'harsh', 'nice' // Nice can indicate mismatch too
      ],
      [FeedbackCategory.TECHNICAL]: [
        'broken', 'crash', 'bug', 'glitch', 'error', 'technical',
        'doesn\'t work', 'slow', 'performance', 'loading', 'freezing', 'stuck'
      ],
      [FeedbackCategory.GENERAL]: [] // Catch-all
    };


    // Check for pattern matches
    for (const categoryKey in categoryPatterns) {
        if (Object.prototype.hasOwnProperty.call(categoryPatterns, categoryKey)) {
            const category = categoryKey as FeedbackCategory;
            const patterns = categoryPatterns[category];
            for (const pattern of patterns) {
                if (lowerContent.includes(pattern)) {
                    // Add category if not already present
                    if (!categories.includes(category)) {
                       categories.push(category);
                    }
                }
            }
        }
    }

    // Ensure GENERAL is included if no specific patterns matched and we are looking for issues
    // but only if there's actually content to categorize
    if (categories.length === 0 && !lookForPositiveIndicators && content.trim().length > 0) {
      categories.push(FeedbackCategory.GENERAL);
    }

    // Note: This is a simple keyword matcher. For better categorization,
    // a text classification model or more sophisticated NLP techniques are needed.

    return categories;
  }


  /**
   * Calculate metrics from stored feedback
   */
  private calculateMetrics(): FeedbackMetrics {
    const allFeedback = this.getAllFeedback();
    const now = Date.now();

    // Count total feedback
    const totalFeedback = allFeedback.length;

    // Count by type
    const byType: Record<FeedbackType, number> = {
      [FeedbackType.POSITIVE]: 0,
      [FeedbackType.NEGATIVE]: 0,
      [FeedbackType.CORRECTION]: 0,
      [FeedbackType.CLARIFICATION]: 0,
      [FeedbackType.IGNORED]: 0,
      [FeedbackType.RATING]: 0,
      [FeedbackType.COMMENT]: 0,
      [FeedbackType.TERMINATION]: 0
    };

    for (const feedback of allFeedback) {
      byType[feedback.type]++;
    }

    // Calculate rating metrics
    const ratings = allFeedback
      .filter(item => item.type === FeedbackType.RATING && item.rating !== undefined)
      .map(item => item.rating as number);

    const averageRating = ratings.length > 0 ?
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length :
      undefined;

    // Calculate rating distribution (1-5)
    const ratingDistribution = [0, 0, 0, 0, 0]; // Indices 0-4 for ratings 1-5

    for (const rating of ratings) {
      if (rating >= 1 && rating <= 5) {
        const index = Math.floor(rating) - 1;
        if (ratingDistribution[index] !== undefined) {
            ratingDistribution[index]++;
        }
      }
    }

    // Count by category
    const byCategory: Record<FeedbackCategory, number> = {
      [FeedbackCategory.INTENT_RECOGNITION]: 0,
      [FeedbackCategory.ENTITY_RECOGNITION]: 0,
      [FeedbackCategory.FACTUAL_ACCURACY]: 0,
      [FeedbackCategory.RELEVANCE]: 0,
      [FeedbackCategory.COMPLETENESS]: 0,
      [FeedbackCategory.CLARITY]: 0,
      [FeedbackCategory.TONE]: 0,
      [FeedbackCategory.TECHNICAL]: 0,
      [FeedbackCategory.GENERAL]: 0
    };

    for (const feedback of allFeedback) {
      if (feedback.categories) {
        for (const category of feedback.categories) {
          byCategory[category]++;
        }
      }
    }

    // Count by sentiment
    const bySentiment: Record<FeedbackSentiment, number> = {
      [FeedbackSentiment.VERY_POSITIVE]: 0,
      [FeedbackSentiment.POSITIVE]: 0,
      [FeedbackSentiment.NEUTRAL]: 0,
      [FeedbackSentiment.NEGATIVE]: 0,
      [FeedbackSentiment.VERY_NEGATIVE]: 0,
      [FeedbackSentiment.MIXED]: 0
    };

    for (const feedback of allFeedback) {
      if (feedback.sentiment) {
        bySentiment[feedback.sentiment]++;
      }
    }

    // Calculate trends
    const trendWindowSize = this.options.trendWindowSize || 100;

    // Sort by timestamp (most recent first)
    const sortedFeedback = [...allFeedback].sort((a, b) => b.timestamp - a.timestamp);

    // Recent feedback (limited by window size)
    const recentFeedback = sortedFeedback.slice(0, trendWindowSize);

    // Previous period feedback
    const previousFeedback = sortedFeedback.slice(trendWindowSize, trendWindowSize * 2);

    // Calculate recent ratings
    const recentRatings = recentFeedback
      .filter(item => item.type === FeedbackType.RATING && item.rating !== undefined)
      .map(item => item.rating as number);

    const recentAverageRating = recentRatings.length > 0 ?
      recentRatings.reduce((sum, rating) => sum + rating, 0) / recentRatings.length :
      undefined;

    // Calculate positive/negative counts for rates
    const isPositive = (item: FeedbackItem, minPositive: number) =>
       item.type === FeedbackType.POSITIVE ||
       (item.type === FeedbackType.RATING && item.rating !== undefined && item.rating >= minPositive);

    const isNegative = (item: FeedbackItem, minPositive: number) =>
       item.type === FeedbackType.NEGATIVE ||
       (item.type === FeedbackType.RATING && item.rating !== undefined && item.rating < minPositive);

    const minPositiveRatingThreshold = this.options.minPositiveRating || 4;


    const recentPositiveCount = recentFeedback.filter(item => isPositive(item, minPositiveRatingThreshold)).length;
    const recentNegativeCount = recentFeedback.filter(item => isNegative(item, minPositiveRatingThreshold)).length;

    const recentTotalFeedbackForRate = recentPositiveCount + recentNegativeCount; // Only consider feedback types used for rate
    const recentPositiveRate = recentTotalFeedbackForRate > 0 ? recentPositiveCount / recentTotalFeedbackForRate : 0;
    const recentNegativeRate = recentTotalFeedbackForRate > 0 ? recentNegativeCount / recentTotalFeedbackForRate : 0; // Added negative rate


    // Calculate previous period positive/negative rates
    const previousPositiveCount = previousFeedback.filter(item => isPositive(item, minPositiveRatingThreshold)).length;
    const previousNegativeCount = previousFeedback.filter(item => isNegative(item, minPositiveRatingThreshold)).length;

    const previousTotalFeedbackForRate = previousPositiveCount + previousNegativeCount;
    const previousPositiveRate = previousTotalFeedbackForRate > 0 ? previousPositiveCount / previousTotalFeedbackForRate : 0;


    // Calculate change in positive rate
    const positiveRateChange = previousPositiveRate > 0 ?
      (recentPositiveRate - previousPositiveRate) / previousPositiveRate :
      0; // Percentage change


    // Find top issue categories
    const categoryEntries = Object.entries(byCategory) as [FeedbackCategory, number][];
    const sortedCategories = categoryEntries
      .filter(([category]) => category !== FeedbackCategory.GENERAL) // Exclude general category from top issues
      .sort((a, b) => b[1] - a[1]);

    const topIssueCategories = sortedCategories
      .slice(0, 3) // Limit to top 3
      .map(([category, count]) => ({ category, count }));

    // Final metrics object
    return {
      totalFeedback,
      byType,
      averageRating,
      ratingDistribution,
      byCategory,
      bySentiment,
      trends: {
        recentAverageRating,
        recentPositiveRate,
        recentNegativeRate, // Included recent negative rate
        positiveRateChange
      },
      topIssueCategories,
      generatedAt: now
    };
  }
}

// Export default instance
export default FeedbackCollector.getInstance();