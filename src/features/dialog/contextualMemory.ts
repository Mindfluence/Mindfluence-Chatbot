/**
 * features/dialog/contextualMemory.ts
 * 
 * Responsible for maintaining conversation state across turns,
 * tracking entities, intents, and user context to provide
 * conversational coherence.
 */

import type { 
  Intent, 
  Entity, 
  Context, 
  EnhancedContext, 
  EnhancedEntity 
} from '@/types/nlp.types';
import { hasTopicChanged, extractRelevantContextForResponse } from '../nlp-engine/pipelines/context-management';
import { config } from '../nlp-engine/config';

// Types for contextual memory
export interface MemoryEntry {
  timestamp: number;
  entities: EnhancedEntity[];
  intent: Intent | null;
  context: EnhancedContext;
  userInput: string;
  botResponse: string;
  sessionId: string;
  turnIndex: number;
  relevantTopics: string[];
}

export interface ConversationState {
  sessionId: string;
  userId: string | null;
  startTime: number;
  lastUpdateTime: number;
  turns: MemoryEntry[];
  currentTurnIndex: number;
  persistentEntities: Record<string, EnhancedEntity>;
  userProfile: UserProfile;
  flags: Record<string, boolean>;
  metrics: ConversationMetrics;
  activeWorkflows: string[];
}

export interface UserProfile {
  userId: string | null;
  preferences: Record<string, any>;
  knownEntities: Record<string, EnhancedEntity>;
  interactionHistory: {
    sessionCount: number;
    lastSessionTime: number | null;
    frequentIntents: Record<string, number>;
    frequentTopics: Record<string, number>;
  };
  savedState: Record<string, any>;
}

export interface ConversationMetrics {
  messageCount: number;
  averageUserMessageLength: number;
  averageBotMessageLength: number;
  topicChanges: number;
  intentMatches: number;
  intentConfusionCount: number;
  fallbackCount: number;
  sentimentTracker: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

// Settings for memory management
export interface MemoryOptions {
  maxTurnsToKeep: number;
  entityExpirationTime: number; // in milliseconds
  enableUserProfilePersistence: boolean;
  contextWindowSize: number;
  entityConfidenceThreshold: number;
  intentConfidenceThreshold: number;
  enableDetailedLogging: boolean;
  topicDetectionThreshold: number;
}

// Default settings
const DEFAULT_MEMORY_OPTIONS: MemoryOptions = {
  maxTurnsToKeep: 20,
  entityExpirationTime: 30 * 60 * 1000, // 30 minutes
  enableUserProfilePersistence: true,
  contextWindowSize: 10,
  entityConfidenceThreshold: 0.6,
  intentConfidenceThreshold: 0.6,
  enableDetailedLogging: true,
  topicDetectionThreshold: 0.7
};

/**
 * Main class for managing contextual memory
 */
export class ContextualMemory {
  private activeConversations: Map<string, ConversationState>;
  private options: MemoryOptions;
  private persistentEntityTypes: string[];

  /**
   * Creates a new ContextualMemory instance
   * 
   * @param options Configuration options for memory management
   */
  constructor(options: Partial<MemoryOptions> = {}) {
    this.options = { ...DEFAULT_MEMORY_OPTIONS, ...options };
    this.activeConversations = new Map<string, ConversationState>();
    
    // Get persistent entity types from config
    this.persistentEntityTypes = config.nlp.contextManagement?.persistentEntityTypes || [
      'user', 'location', 'product', 'service', 'feature', 'category'
    ];
    
    console.log(`[contextualMemory] Initialized with ${this.persistentEntityTypes.length} persistent entity types`);
    console.log(`[contextualMemory] Memory options:`, JSON.stringify(this.options, null, 2));
  }

  /**
   * Initializes a new conversation or retrieves an existing one
   * 
   * @param sessionId Unique session identifier
   * @param userId Optional user identifier for personalization
   * @returns The conversation state
   */
  public initializeConversation(sessionId: string, userId: string | null = null): ConversationState {
    // Check if conversation already exists
    if (this.activeConversations.has(sessionId)) {
      const existingConversation = this.activeConversations.get(sessionId)!;
      
      // Update last active time
      existingConversation.lastUpdateTime = Date.now();
      
      // Update user ID if provided and different
      if (userId && userId !== existingConversation.userId) {
        existingConversation.userId = userId;
        
        // Update user profile if it exists
        if (userId && existingConversation.userProfile) {
          existingConversation.userProfile.userId = userId;
        }
      }
      
      return existingConversation;
    }
    
    // Create new conversation state
    const currentTime = Date.now();
    const newConversation: ConversationState = {
      sessionId,
      userId,
      startTime: currentTime,
      lastUpdateTime: currentTime,
      turns: [],
      currentTurnIndex: 0,
      persistentEntities: {},
      userProfile: this.createInitialUserProfile(userId),
      flags: {
        isFirstInteraction: true,
        needsOnboarding: true,
        hasActiveWorkflow: false,
        isAuthenticated: false
      },
      metrics: this.createInitialMetrics(),
      activeWorkflows: []
    };
    
    // Store in active conversations
    this.activeConversations.set(sessionId, newConversation);
    
    // Log initialization
    console.log(`[contextualMemory] Initialized new conversation: sessionId=${sessionId}, userId=${userId || 'anonymous'}`);
    
    return newConversation;
  }

  /**
   * Updates memory with results from the latest conversation turn
   * 
   * @param sessionId Conversation session ID
   * @param userInput The user's message
   * @param botResponse The system's response
   * @param nlpResult NLP processing results
   * @returns Updated conversation state
   */
  public updateMemory(
    sessionId: string,
    userInput: string,
    botResponse: string,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    }
  ): ConversationState {
    try {
      // Ensure conversation exists
      if (!this.activeConversations.has(sessionId)) {
        console.warn(`[contextualMemory] Attempted to update nonexistent conversation: ${sessionId}. Creating new one.`);
        this.initializeConversation(sessionId);
      }
      
      const conversation = this.activeConversations.get(sessionId)!;
      
      // Update last active time
      conversation.lastUpdateTime = Date.now();
      
      // Enhance entities with additional metadata
      const enhancedEntities = this.enhanceEntities(
        nlpResult.entities, 
        conversation.persistentEntities
      );
      
      // Get previous turn's context if available
      const lastTurn = conversation.turns.length > 0 ? conversation.turns[conversation.turns.length - 1] : null;
      const previousContext = lastTurn ? lastTurn.context : null;
      
      // Check for topic changes
      const topicChanged = previousContext ? 
        hasTopicChanged(nlpResult.context, previousContext) : 
        false;
      
      // Extract relevant topics
      const relevantTopics = this.extractRelevantTopics(nlpResult.context);
      
      // Create the memory entry for this turn
      const memoryEntry: MemoryEntry = {
        timestamp: Date.now(),
        entities: enhancedEntities,
        intent: nlpResult.intent,
        context: nlpResult.context as EnhancedContext,
        userInput,
        botResponse,
        sessionId,
        turnIndex: conversation.currentTurnIndex,
        relevantTopics
      };
      
      // Add entry to conversation turns
      conversation.turns.push(memoryEntry);
      conversation.currentTurnIndex++;
      
      // Update conversation metrics
      this.updateConversationMetrics(conversation, userInput, botResponse, nlpResult, topicChanged);
      
      // Update persistent entities
      this.updatePersistentEntities(conversation, enhancedEntities);
      
      // Update user profile
      this.updateUserProfile(conversation, nlpResult, relevantTopics);
      
      // Clean up old turns if exceeding the limit
      this.pruneConversationHistory(conversation);
      
      // Log memory update
      if (this.options.enableDetailedLogging) {
        console.log(`[contextualMemory] Updated memory for session ${sessionId}, turn ${conversation.currentTurnIndex - 1}`);
        console.log(`[contextualMemory] Intent: ${nlpResult.intent?.name || 'none'}, Context: ${nlpResult.context.name}`);
        console.log(`[contextualMemory] Entities: ${enhancedEntities.map(e => e.type).join(', ') || 'none'}`);
        console.log(`[contextualMemory] Topics: ${relevantTopics.join(', ') || 'none'}`);
      }
      
      // Clear first interaction flag
      if (conversation.flags.isFirstInteraction) {
        conversation.flags.isFirstInteraction = false;
      }
      
      return conversation;
    } catch (error) {
      console.error(`[contextualMemory] Error updating memory:`, error);
      // Ensure we return a valid conversation state
      const fallbackConversation = this.activeConversations.get(sessionId) || 
        this.initializeConversation(sessionId);
      return fallbackConversation;
    }
  }

  /**
   * Retrieves relevant context for the current conversation state
   * 
   * @param sessionId Conversation session ID
   * @returns Relevant context information
   */
  public getRelevantContext(sessionId: string): Record<string, any> {
    try {
      // Ensure conversation exists
      if (!this.activeConversations.has(sessionId)) {
        console.warn(`[contextualMemory] Attempted to get context for nonexistent conversation: ${sessionId}`);
        return {
          isFirstInteraction: true,
          entities: [],
          recentTopics: [],
          lastIntent: null,
          conversationLength: 0
        };
      }
      
      const conversation = this.activeConversations.get(sessionId)!;
      
      // Get the most recent context if available
      const latestTurn = conversation.turns.length > 0 
        ? conversation.turns[conversation.turns.length - 1]
        : null;
        
      if (!latestTurn) {
        return {
          isFirstInteraction: true,
          entities: [],
          recentTopics: [],
          lastIntent: null,
          conversationLength: 0
        };
      }
      
      // Extract relevant context information
      const contextInfo = extractRelevantContextForResponse(latestTurn.context);
      
      // Add additional memory information
      return {
        ...contextInfo,
        isFirstInteraction: conversation.flags.isFirstInteraction,
        conversationLength: conversation.turns.length,
        persistentEntities: Object.values(conversation.persistentEntities),
        recentTopics: this.getMostRecentTopics(conversation, 3),
        turnsSinceTopicChange: this.getTurnsSinceTopicChange(conversation),
        userPreferences: conversation.userProfile.preferences,
        activeWorkflows: conversation.activeWorkflows,
        metrics: conversation.metrics
      };
    } catch (error) {
      console.error(`[contextualMemory] Error getting context:`, error);
      return {
        isFirstInteraction: true,
        entities: [],
        recentTopics: [],
        lastIntent: null,
        conversationLength: 0,
        error: 'Failed to retrieve context'
      };
    }
  }

  /**
   * Gets the conversation history for a specific session
   * 
   * @param sessionId Conversation session ID
   * @param maxTurns Maximum number of turns to retrieve (defaults to all turns)
   * @returns Array of conversation turns
   */
  public getConversationHistory(sessionId: string, maxTurns?: number): MemoryEntry[] {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to get history for nonexistent conversation: ${sessionId}`);
      return [];
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // If maxTurns is specified, return only the most recent turns
    if (maxTurns !== undefined && maxTurns > 0) {
      return conversation.turns.slice(-maxTurns);
    }
    
    // Otherwise return all turns
    return [...conversation.turns];
  }

  /**
   * Gets only the messages from the conversation history
   * 
   * @param sessionId Conversation session ID
   * @param maxTurns Maximum number of turns to retrieve
   * @returns Array of message pairs (user and bot)
   */
  public getMessageHistory(
    sessionId: string, 
    maxTurns?: number
  ): Array<{ user: string; bot: string; }> {
    // Get the conversation history
    const history = this.getConversationHistory(sessionId, maxTurns);
    
    // Map to message pairs
    return history.map(turn => ({
      user: turn.userInput,
      bot: turn.botResponse
    }));
  }

  /**
   * Sets a flag in the conversation state
   * 
   * @param sessionId Conversation session ID
   * @param flagName Name of the flag to set
   * @param value Value to set the flag to
   * @returns Updated conversation state
   */
  public setConversationFlag(
    sessionId: string, 
    flagName: string, 
    value: boolean
  ): ConversationState {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to set flag for nonexistent conversation: ${sessionId}`);
      return this.initializeConversation(sessionId);
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Update the flag
    conversation.flags[flagName] = value;
    
    // Update timestamp
    conversation.lastUpdateTime = Date.now();
    
    return conversation;
  }

  /**
   * Updates user preferences
   * 
   * @param sessionId Conversation session ID
   * @param preferences Object containing preference updates
   * @returns Updated conversation state
   */
  public updateUserPreferences(
    sessionId: string, 
    preferences: Record<string, any>
  ): ConversationState {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to update preferences for nonexistent conversation: ${sessionId}`);
      return this.initializeConversation(sessionId);
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Update preferences
    conversation.userProfile.preferences = {
      ...conversation.userProfile.preferences,
      ...preferences
    };
    
    // Update timestamp
    conversation.lastUpdateTime = Date.now();
    
    console.log(`[contextualMemory] Updated user preferences for session ${sessionId}:`, preferences);
    
    return conversation;
  }

  /**
   * Adds a workflow to the active workflows list
   * 
   * @param sessionId Conversation session ID
   * @param workflowId The ID of the workflow to add
   * @returns Updated conversation state
   */
  public addActiveWorkflow(sessionId: string, workflowId: string): ConversationState {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to add workflow to nonexistent conversation: ${sessionId}`);
      return this.initializeConversation(sessionId);
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Add workflow if not already active
    if (!conversation.activeWorkflows.includes(workflowId)) {
      conversation.activeWorkflows.push(workflowId);
      conversation.flags.hasActiveWorkflow = true;
    }
    
    // Update timestamp
    conversation.lastUpdateTime = Date.now();
    
    console.log(`[contextualMemory] Added active workflow '${workflowId}' for session ${sessionId}`);
    
    return conversation;
  }

  /**
   * Removes a workflow from the active workflows list
   * 
   * @param sessionId Conversation session ID
   * @param workflowId The ID of the workflow to remove
   * @returns Updated conversation state
   */
  public removeActiveWorkflow(sessionId: string, workflowId: string): ConversationState {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to remove workflow from nonexistent conversation: ${sessionId}`);
      return this.initializeConversation(sessionId);
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Remove workflow if present
    conversation.activeWorkflows = conversation.activeWorkflows.filter(id => id !== workflowId);
    
    // Update workflow flag
    conversation.flags.hasActiveWorkflow = conversation.activeWorkflows.length > 0;
    
    // Update timestamp
    conversation.lastUpdateTime = Date.now();
    
    console.log(`[contextualMemory] Removed active workflow '${workflowId}' for session ${sessionId}`);
    
    return conversation;
  }

  /**
   * Ends a conversation and optionally persists user data
   * 
   * @param sessionId Conversation session ID
   * @param persistUserData Whether to persist user data for future sessions
   * @returns Success status
   */
  public endConversation(sessionId: string, persistUserData: boolean = true): boolean {
    try {
      // Ensure conversation exists
      if (!this.activeConversations.has(sessionId)) {
        console.warn(`[contextualMemory] Attempted to end nonexistent conversation: ${sessionId}`);
        return false;
      }
      
      const conversation = this.activeConversations.get(sessionId)!;
      
      // Persist user data if requested and user ID is available
      if (persistUserData && conversation.userId && this.options.enableUserProfilePersistence) {
        this.persistUserProfile(conversation);
      }
      
      // Remove from active conversations
      this.activeConversations.delete(sessionId);
      
      console.log(`[contextualMemory] Ended conversation: ${sessionId}`);
      
      return true;
    } catch (error) {
      console.error(`[contextualMemory] Error ending conversation:`, error);
      return false;
    }
  }

  /**
   * Cleans up stale conversations based on inactivity
   * 
   * @param maxInactivityTime Maximum inactivity time in milliseconds
   * @returns Number of conversations cleaned up
   */
  public cleanupStaleConversations(maxInactivityTime: number = 60 * 60 * 1000): number {
    try {
      const currentTime = Date.now();
      let cleanupCount = 0;
      
      // Identify stale conversations
      const staleSessionIds: string[] = [];
      this.activeConversations.forEach((conversation, sessionId) => {
        if (currentTime - conversation.lastUpdateTime > maxInactivityTime) {
          staleSessionIds.push(sessionId);
        }
      });
      
      // Clean up each stale conversation
      staleSessionIds.forEach(sessionId => {
        this.endConversation(sessionId, true);
        cleanupCount++;
      });
      
      if (cleanupCount > 0) {
        console.log(`[contextualMemory] Cleaned up ${cleanupCount} stale conversations`);
      }
      
      return cleanupCount;
    } catch (error) {
      console.error(`[contextualMemory] Error cleaning up stale conversations:`, error);
      return 0;
    }
  }

  /**
   * Retrieves a specific entity from the conversation memory
   * 
   * @param sessionId Conversation session ID
   * @param entityType Type of entity to retrieve
   * @param mostRecent Whether to get only the most recent entity of this type
   * @returns The found entity or entities, or null if not found
   */
  public getEntity(
    sessionId: string, 
    entityType: string, 
    mostRecent: boolean = true
  ): EnhancedEntity | EnhancedEntity[] | null {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to get entity from nonexistent conversation: ${sessionId}`);
      return null;
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Check persistent entities first
    const persistentEntity = conversation.persistentEntities[entityType];
    if (persistentEntity) {
      return persistentEntity;
    }
    
    // If not found in persistent entities, look through turns
    const entities: EnhancedEntity[] = [];
    
    // Search from most recent to oldest
    for (let i = conversation.turns.length - 1; i >= 0; i--) {
      const turn = conversation.turns[i];
      
      if (turn) {
        const matchingEntities = turn.entities.filter(entity => entity.type === entityType);
        
        if (matchingEntities.length > 0) {
          if (mostRecent) {
            // Return the most recent one with non-null assertion to tell TypeScript we're sure it exists
            return matchingEntities[0]!;
          } else {
            // Collect all entities of this type
            entities.push(...matchingEntities);
          }
        }
      }
    }
    
    if (entities.length > 0) {
      return entities;
    }
    
    return null;
  }

  /**
   * Gets all active entities that are currently relevant in the conversation
   * 
   * @param sessionId Conversation session ID
   * @returns Object mapping entity types to their values
   */
  public getAllActiveEntities(sessionId: string): Record<string, any> {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to get entities from nonexistent conversation: ${sessionId}`);
      return {};
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Start with persistent entities
    const result: Record<string, any> = {};
    
    // Add persistent entities
    Object.entries(conversation.persistentEntities).forEach(([type, entity]) => {
      result[type] = entity.value;
    });
    
    // Get entities from the last turn if available
    const lastTurn = conversation.turns.length > 0 ? conversation.turns[conversation.turns.length - 1] : undefined;
    if (lastTurn) {
      lastTurn.entities.forEach(entity => {
        // Add if not already present
        if (!result[entity.type]) {
          result[entity.type] = entity.value;
        }
      });
    }
    
    return result;
  }

  /**
   * Saves custom state data in the conversation
   * 
   * @param sessionId Conversation session ID
   * @param key State key
   * @param value State value
   * @returns Updated conversation state
   */
  public saveState(
    sessionId: string, 
    key: string, 
    value: any
  ): ConversationState {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to save state to nonexistent conversation: ${sessionId}`);
      return this.initializeConversation(sessionId);
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Save state in user profile
    conversation.userProfile.savedState[key] = value;
    
    // Update timestamp
    conversation.lastUpdateTime = Date.now();
    
    return conversation;
  }

  /**
   * Loads custom state data from the conversation
   * 
   * @param sessionId Conversation session ID
   * @param key State key
   * @param defaultValue Default value if state not found
   * @returns The state value or default value
   */
  public loadState<T>(sessionId: string, key: string, defaultValue: T): T {
    // Ensure conversation exists
    if (!this.activeConversations.has(sessionId)) {
      console.warn(`[contextualMemory] Attempted to load state from nonexistent conversation: ${sessionId}`);
      return defaultValue;
    }
    
    const conversation = this.activeConversations.get(sessionId)!;
    
    // Get state from user profile
    return conversation.userProfile.savedState[key] !== undefined 
      ? conversation.userProfile.savedState[key] 
      : defaultValue;
  }

  /**
   * Private helper method to create initial user profile
   */
  private createInitialUserProfile(userId: string | null): UserProfile {
    return {
      userId,
      preferences: {},
      knownEntities: {},
      interactionHistory: {
        sessionCount: 1,
        lastSessionTime: Date.now(),
        frequentIntents: {},
        frequentTopics: {}
      },
      savedState: {}
    };
  }

  /**
   * Private helper method to create initial metrics
   */
  private createInitialMetrics(): ConversationMetrics {
    return {
      messageCount: 0,
      averageUserMessageLength: 0,
      averageBotMessageLength: 0,
      topicChanges: 0,
      intentMatches: 0,
      intentConfusionCount: 0,
      fallbackCount: 0,
      sentimentTracker: {
        positive: 0,
        negative: 0,
        neutral: 0
      }
    };
  }

  /**
   * Private helper method to enhance entities with metadata
   */
  private enhanceEntities(
    entities: Entity[],
    persistentEntities: Record<string, EnhancedEntity>
  ): EnhancedEntity[] {
    const currentTime = Date.now();
    
    return entities.map(entity => {
      // Check if this entity already exists in persistent entities
      const existingEntity = persistentEntities[entity.type];
      const isNew = !existingEntity || existingEntity.value !== entity.value;
      
      // Create enhanced entity
      const enhancedEntity: EnhancedEntity = {
        ...entity,
        isNew,
        fromPreviousContext: !isNew,
        timestamp: currentTime,
        // Determine persistence based on entity type
        isPersistent: this.shouldEntityPersist(entity)
      };
      
      return enhancedEntity;
    });
  }

  /**
   * Private helper method to determine if an entity should persist
   */
  private shouldEntityPersist(entity: Entity): boolean {
    // Check against the list of persistent entity types
    if (this.persistentEntityTypes.includes(entity.type)) {
      return true;
    }
    
    // Check confidence threshold for other entities
    if (entity.confidence && entity.confidence >= this.options.entityConfidenceThreshold) {
      return true;
    }
    
    return false;
  }

  /**
   * Private helper method to extract relevant topics from context
   */
  private extractRelevantTopics(context: Context): string[] {
    // If context has topics property, use it
    if (context.topics && Array.isArray(context.topics)) {
      return [...context.topics];
    }
    
    // Otherwise, try to derive topics from context name
    const contextName = context.name || '';
    
    // Add context type as a topic
    const topics: string[] = [contextName];
    
    return topics;
  }

  /**
   * Private helper method to update conversation metrics
   */
  private updateConversationMetrics(
    conversation: ConversationState,
    userInput: string,
    botResponse: string,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    topicChanged: boolean
  ): void {
    const metrics = conversation.metrics;
    
    // Update message count
    metrics.messageCount++;
    
    // Update message length averages
    const userMessageLength = userInput.length;
    const botMessageLength = botResponse.length;
    
    // Update average user message length
    metrics.averageUserMessageLength = 
      ((metrics.averageUserMessageLength * (metrics.messageCount - 1)) + userMessageLength) / 
      metrics.messageCount;
    
    // Update average bot message length
    metrics.averageBotMessageLength = 
      ((metrics.averageBotMessageLength * (metrics.messageCount - 1)) + botMessageLength) / 
      metrics.messageCount;
    
    // Update topic changes
    if (topicChanged) {
      metrics.topicChanges++;
    }
    
    // Update intent matches
    if (nlpResult.intent) {
      metrics.intentMatches++;
      
      // Check for low confidence intents
      if (nlpResult.intent.confidence < this.options.intentConfidenceThreshold) {
        metrics.intentConfusionCount++;
      }
      
      // Check for fallback intents
      if (nlpResult.intent.name === 'fallback' || 
          nlpResult.intent.name === 'unknown' || 
          nlpResult.intent.name.startsWith('error_')) {
        metrics.fallbackCount++;
      }
    } else {
      metrics.fallbackCount++;
    }
    
    // Update sentiment tracker if sentiment information is available
    const enhancedContext = nlpResult.context as EnhancedContext;
    const sentiment = enhancedContext.sentiment;
    
    if (sentiment) {
      if (sentiment.includes('positive')) {
        metrics.sentimentTracker.positive++;
      } else if (sentiment.includes('negative')) {
        metrics.sentimentTracker.negative++;
      } else {
        metrics.sentimentTracker.neutral++;
      }
    } else {
      // Default to neutral if no sentiment info
      metrics.sentimentTracker.neutral++;
    }
  }

  /**
   * Private helper method to update persistent entities
   */
  private updatePersistentEntities(
    conversation: ConversationState,
    entities: EnhancedEntity[]
  ): void {
    const currentTime = Date.now();
    
    // Update or add new persistent entities
    entities.forEach(entity => {
      if (entity.isPersistent) {
        // Update the persistent entities map
        conversation.persistentEntities[entity.type] = {
          ...entity,
          timestamp: currentTime
        };
      }
    });
    
    // Clean up expired entities
    Object.keys(conversation.persistentEntities).forEach(type => {
      const entity = conversation.persistentEntities[type];
      if (entity) {
        const age = currentTime - (entity.timestamp || 0);
        
        // Remove if too old and not a critical entity type
        if (age > this.options.entityExpirationTime && !this.persistentEntityTypes.includes(type)) {
          delete conversation.persistentEntities[type];
        }
      }
    });
  }

  /**
   * Private helper method to update user profile
   */
  private updateUserProfile(
    conversation: ConversationState,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    topics: string[]
  ): void {
    const profile = conversation.userProfile;
    
    // Update known entities with persistent entities
    Object.values(conversation.persistentEntities).forEach(entity => {
      if (entity.confidence && entity.confidence >= this.options.entityConfidenceThreshold) {
        profile.knownEntities[entity.type] = entity;
      }
    });
    
    // Update intent frequencies
    if (nlpResult.intent && nlpResult.intent.confidence >= this.options.intentConfidenceThreshold) {
      const intentName = nlpResult.intent.name;
      profile.interactionHistory.frequentIntents[intentName] = 
        (profile.interactionHistory.frequentIntents[intentName] || 0) + 1;
    }
    
    // Update topic frequencies
    topics.forEach(topic => {
      if (topic) {
        profile.interactionHistory.frequentTopics[topic] = 
          (profile.interactionHistory.frequentTopics[topic] || 0) + 1;
      }
    });
  }

  /**
   * Private helper method to persist user profile
   */
  private persistUserProfile(conversation: ConversationState): void {
    // In a real implementation, this would save to a database or other storage
    // For now, just log that we're persisting
    console.log(`[contextualMemory] Persisting user profile for userId=${conversation.userId}`);
    
    // Update session information
    conversation.userProfile.interactionHistory.sessionCount++;
    conversation.userProfile.interactionHistory.lastSessionTime = Date.now();
  }

  /**
   * Private helper method to clean up old conversation turns
   */
  private pruneConversationHistory(conversation: ConversationState): void {
    // Check if we need to prune
    if (conversation.turns.length <= this.options.maxTurnsToKeep) {
      return;
    }
    
    // Remove oldest turns, keeping maxTurnsToKeep
    const excessTurns = conversation.turns.length - this.options.maxTurnsToKeep;
    conversation.turns = conversation.turns.slice(excessTurns);
    
    console.log(`[contextualMemory] Pruned ${excessTurns} old turns from conversation ${conversation.sessionId}`);
  }

  /**
   * Private helper method to get most recent topics
   */
  private getMostRecentTopics(conversation: ConversationState, maxTopics: number): string[] {
    // If no turns, return empty array
    if (conversation.turns.length === 0) {
      return [];
    }
    
    // Collect topics from recent turns
    const topicCounts: Record<string, number> = {};
    
    // Start from the most recent turn
    for (let i = conversation.turns.length - 1; i >= Math.max(0, conversation.turns.length - 5); i--) {
      const turn = conversation.turns[i];
      
      if (turn && turn.relevantTopics) {
        turn.relevantTopics.forEach(topic => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    }
    
    // Sort topics by frequency
    const sortedTopics = Object.entries(topicCounts)
      .sort(([, countA], [, countB]) => countB - countA)
      .map(([topic]) => topic);
    
    // Return the top topics
    return sortedTopics.slice(0, maxTopics);
  }

  /**
   * Private helper method to count turns since last topic change
   */
  private getTurnsSinceTopicChange(conversation: ConversationState): number {
    // If fewer than 2 turns, return 0
    if (conversation.turns.length < 2) {
      return 0;
    }
    
    let turnsSinceChange = 0;
    
    // Start from the most recent turn
    for (let i = conversation.turns.length - 1; i > 0; i--) {
      const currentTurn = conversation.turns[i];
      const previousTurn = conversation.turns[i - 1];
      
      if (currentTurn && previousTurn) {
        // Check if topics are different
        const currentTopics = currentTurn.relevantTopics || [];
        const previousTopics = previousTurn.relevantTopics || [];
        
        // Compare topics
        const topicChanged = !this.haveOverlappingTopics(currentTopics, previousTopics);
        
        if (topicChanged) {
          break;
        }
        
        turnsSinceChange++;
      }
    }
    
    return turnsSinceChange;
  }

  /**
   * Private helper method to check if two topic arrays overlap
   */
  private haveOverlappingTopics(topicsA: string[], topicsB: string[]): boolean {
    // If either array is empty, there's no overlap
    if (topicsA.length === 0 || topicsB.length === 0) {
      return false;
    }
    
    // Check for overlap
    return topicsA.some(topic => topicsB.includes(topic));
  }
}

// Export a singleton instance
export const contextualMemory = new ContextualMemory();