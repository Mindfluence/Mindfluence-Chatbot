import { type Intent, type Entity, type Context, type EnhancedEntity, type EnhancedContext, type NLPModel, type Language } from '@/types/nlp.types';
import { config } from '../config';
import crypto from 'crypto';

// Define the result type for the context management pipeline
export interface ContextManagementResult extends EnhancedContext {
  // Additional fields specific to the pipeline result can be added here
}

// Internal context type for caching with conversation tracking
interface ConversationContext {
  context: EnhancedContext;
  timestamp: number;
  history: string[];
  entitiesForNextPersistence: EnhancedEntity[];
}

// Constants for context types
export const CONTEXT_TYPES = {
  INITIAL: 'initial',
  FOLLOW_UP: 'followup',
  TOPIC_CHANGE: 'topic_change',
  CLARIFICATION: 'clarification',
  CONFIRMATION: 'confirmation',
  NEGATION: 'negation',
  QUESTION: 'question',
  INSTRUCTION: 'instruction',
  INFORMATION: 'information',
  COMPARISON: 'comparison',
  ERROR: 'error',
  CLOSING: 'closing',
};

// Load configuration values with defaults
const MAX_CONTEXT_WINDOW = config.nlp.contextManagement?.maxContextWindow || 10;
const MAX_CACHED_CONVERSATIONS = config.nlp.contextManagement?.maxCachedConversations || 20;
const PERSISTENT_ENTITY_TYPES = config.nlp.contextManagement?.persistentEntityTypes || [
  'user', 'location', 'product', 'service', 'feature', 'category'
];
const HIGH_CONFIDENCE_THRESHOLD = config.nlp.contextManagement?.highConfidenceThreshold || 0.8;
const CONTEXT_CACHE_TIMEOUT = config.nlp.contextManagement?.contextCacheTimeout || 30 * 60 * 1000;
const ENABLE_ENHANCED_CONTEXT = config.nlp.contextManagement?.enableEnhancedContext !== false;

// Cache to maintain state between function calls
const contextCache: Map<string, ConversationContext> = new Map();

/**
 * Manages conversation context by analyzing history, intent, entities, and context model
 * 
 * @param conversationHistory Array of messages in the conversation history
 * @param model The context detection model
 * @param currentIntent The intent detected for the current message
 * @param currentEntities The entities detected for the current message
 * @param language The language being used for the conversation
 * @returns A ContextManagementResult with enhanced context information
 */
export async function manageContext(
  conversationHistory: string[],
  model: NLPModel,
  currentIntent: Intent | null,
  currentEntities: Entity[] = [],
  language: Language = 'de'
): Promise<ContextManagementResult> {
  try {
    console.log(`[manageContext] Processing context for conversation with ${conversationHistory.length} messages`);
    
    // Normalize the intent object for safety
    const safeIntent = normalizeIntent(currentIntent);
    
    // Limit conversation history to recent messages
    const recentHistory = conversationHistory.slice(-MAX_CONTEXT_WINDOW);
    
    // Generate conversation ID for caching
    const conversationId = generateConversationId(recentHistory);
    
    // Get previous context from cache if available
    const previousInternalContext = getContextFromCache(conversationId, recentHistory);
    const isContinuation = !!previousInternalContext;
    
    console.log(`[manageContext] Continuation of previous conversation: ${isContinuation}`);
    
    // Handle empty history case with initial context
    if (recentHistory.length === 0) {
      const initialContext = createRuleBasedContextResult(
        CONTEXT_TYPES.INITIAL,
        1.0,
        currentEntities,
        safeIntent,
        recentHistory
      );
      
      // Store in cache for future reference
      updateCache(conversationId, initialContext, recentHistory, initialContext.entities as EnhancedEntity[]);
      
      return initialContext;
    }
    
    // Check if we have a valid model
    if (!isValidModel(model)) {
      console.warn('[manageContext] Invalid or missing context model, using rule-based fallback');
      
      // Create a rule-based context as fallback
      const fallbackContext = createRuleBasedContextResult(
        determineContextType(recentHistory, safeIntent, previousInternalContext?.context),
        0.8,
        currentEntities,
        safeIntent,
        recentHistory,
        previousInternalContext?.context
      );
      
      // Store in cache for future reference
      updateCache(conversationId, fallbackContext, recentHistory, fallbackContext.entities as EnhancedEntity[]);
      
      return fallbackContext;
    }
    
    // Get model prediction
    let modelPrediction;
    try {
      // Use just the last message if this is a continuation, or the whole history if new
      const historyToAnalyze = isContinuation && recentHistory.length > 0 ? 
        [recentHistory[recentHistory.length - 1] || ''] : recentHistory;
      
      // IMPROVED: Also pass the previous context name to the model to help with prediction
      const previousContextName = previousInternalContext?.context?.name || undefined;
      
      // FIX: Convert complex modelInput to string format the model can understand
      // This approach maintains compatibility with NLPModel interface
      let modelInputString: string;
      
      // Create a special formatted string with all the data we need
      // We'll include metadata prefixes that the model can parse out
      if (previousContextName) {
        modelInputString = `__PREV_CTX:${previousContextName}__ `;
      } else {
        modelInputString = '';
      }
      
      // Add intent information if available
      if (safeIntent) {
        modelInputString += `__INTENT:${safeIntent.name}__ `;
        if (safeIntent.type) {
          modelInputString += `__TYPE:${safeIntent.type}__ `;
        }
        modelInputString += `__CONF:${safeIntent.confidence.toFixed(2)}__ `;
      }
      
      // Add the actual message content
      modelInputString += historyToAnalyze.join(" || ");
      
      // Now we're passing a string that contains all required information
      // but is compatible with the model's predict function signature
      modelPrediction = await model.predict(modelInputString);
      console.log(`[manageContext] Model prediction: ${JSON.stringify(modelPrediction)}`);
    } catch (predictionError) {
      console.error('[manageContext] Error during model prediction:', predictionError);
      modelPrediction = null;
    }
    
    // Create fallback prediction if model failed
    if (!modelPrediction || !modelPrediction.context) {
      modelPrediction = createFallbackContextPrediction(recentHistory.length, safeIntent);
    }
    
    // Extract context information from the model prediction
    const contextName = modelPrediction.context || CONTEXT_TYPES.FOLLOW_UP;
    const confidence = modelPrediction.confidence || 0.8;
    
    // Get previous entities for merging
    const previousEntities = isContinuation && previousInternalContext ? 
      previousInternalContext.entitiesForNextPersistence : [];
    
    // IMPROVED: Analyze last message for references to previous entities
    // FIX: Add a check to ensure recentHistory has at least one element
    const lastMessage = (recentHistory.length > 0 ? recentHistory[recentHistory.length - 1] || '' : '').toLowerCase();
    const entityReferences = detectEntityReferences(lastMessage, previousEntities);
    
    // Merge and enhance current and previous entities
    const enhancedEntities = mergeAndEnhanceEntities(
      currentEntities,
      previousEntities,
      contextName,
      entityReferences
    );
    
    // Build base context from model prediction
    const analysisResult: EnhancedContext = {
      name: contextName,
      confidence: confidence,
      entities: enhancedEntities,
      recentIntents: getRecentIntents(previousInternalContext?.context, safeIntent),
      topics: deriveTopicsFromIntentAndEntities(safeIntent, enhancedEntities),
      timestamp: Date.now(),
      messageCount: recentHistory.length,
      isLongConversation: recentHistory.length >= 10,
      hasContextBreak: false,
      contextBreakType: undefined,
      intentTransition: determineIntentTransition(previousInternalContext?.context, safeIntent),
      sentiment: 'neutral',
      urgency: 'normal',
      contextComplexity: 'low',
      persistentInfo: (previousInternalContext?.context?.persistentInfo && 
                     typeof previousInternalContext.context.persistentInfo === 'object') ? 
        { ...(previousInternalContext.context.persistentInfo || {}) } : {},
      sentimentInfo: {}
    };
    
    // IMPROVED: Store current topics in persistent info for better tracking
    if (safeIntent && analysisResult.topics.length > 0) {
      analysisResult.persistentInfo = {
        ...analysisResult.persistentInfo,
        lastDiscussedTopics: analysisResult.topics
      };
    }
    
    // Apply rule-based corrections - CRITICAL: FAQ intents MUST be processed first
    applyContextRules(analysisResult, safeIntent, recentHistory.length);
    
    // Enhanced context analysis when enabled
    if (ENABLE_ENHANCED_CONTEXT) {
      // Analyze for context breaks
      analyzeHistoryForContextBreaks(analysisResult, recentHistory);
      
      // Perform sentiment analysis
      analyzeMessageSentiment(analysisResult, recentHistory);
      
      // IMPROVED: Detect references to previous context
      detectContextReferences(analysisResult, recentHistory, previousInternalContext?.context);
      
      // Assess complexity
      analysisResult.contextComplexity = calculateContextComplexity(analysisResult);
    }
    
    // IMPROVED: Handle entity references for "es", "das", "diese", etc.
    handlePronounReferences(analysisResult, recentHistory, previousInternalContext?.context);
    
    // Prepare the final result that matches ContextManagementResult type
    const finalResult: ContextManagementResult = {
      ...analysisResult,
      // Ensure all EnhancedContext fields are present with defaults if missing
      isLongConversation: analysisResult.isLongConversation || false,
      hasContextBreak: analysisResult.hasContextBreak || false,
      contextBreakType: analysisResult.contextBreakType,
      intentTransition: analysisResult.intentTransition || '',
      sentiment: analysisResult.sentiment || 'neutral',
      urgency: analysisResult.urgency || 'normal',
      contextComplexity: analysisResult.contextComplexity || 'low',
      persistentInfo: analysisResult.persistentInfo || {},
      sentimentInfo: analysisResult.sentimentInfo || {}
    };
    
    // IMPROVED: Additional debug output for entity persistence
    const persistentEntities = enhancedEntities.filter(e => e.isPersistent);
    console.log(`[manageContext] Persisting ${persistentEntities.length} entities for next context`);
    
    // Update the cache with the new context
    updateCache(conversationId, finalResult, recentHistory, enhancedEntities);
    
    console.log(`[manageContext] Final context: ${finalResult.name} with ${enhancedEntities.length} enhanced entities`);
    return finalResult;
  } catch (error) {
    console.error('[manageContext] Error in context management:', error);
    
    // Create a minimal valid context in case of errors
    return createRuleBasedContextResult(
      CONTEXT_TYPES.ERROR,
      1.0,
      currentEntities,
      currentIntent,
      conversationHistory || []
    );
  }
}

/**
 * IMPROVED: Generates a more robust unique identifier for a conversation
 * Uses both content hashing and message structure
 */
function generateConversationId(history: string[]): string {
  if (history.length === 0) return 'empty-conversation';
  
  try {
    // Create a hash of the first few messages for better uniqueness
    const messagesToHash = history.slice(0, Math.min(3, history.length));
    const contentToHash = messagesToHash.join('||').substring(0, 100);
    
    // Create a simple hash for the content
    const hash = crypto.createHash('md5').update(contentToHash).digest('hex').substring(0, 8);
    
    // Include the message count and a fragment of the last message for sequence identification
    const lastMessage = history.length > 0 ? history[history.length - 1] || '' : '';
    const lastMessageFragment = lastMessage.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '');
    
    return `${hash}-${history.length}-${lastMessageFragment}`;
  } catch (error) {
    console.warn("[manageContext] Error generating conversation ID, using fallback method", error);
    
    // Fallback to simpler method if crypto fails
    const firstMessage = history.length > 0 ? history[0] || '' : '';
    const lastMessage = history.length > 0 ? 
      history[history.length - 1] || '' : '';
    
    const firstFragment = firstMessage.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '');
    const lastFragment = lastMessage.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '');
    
    return `${firstFragment}-${history.length}-${lastFragment}`;
  }
}

/**
 * Retrieves context from cache if available and related to current history
 */
function getContextFromCache(
  conversationId: string,
  currentHistory: string[]
): ConversationContext | undefined {
  const cachedEntry = contextCache.get(conversationId);
  
  // Check if we have a cache entry and it's not expired
  if (cachedEntry && isContextCacheValid(cachedEntry)) {
    // Verify that the histories are related
    if (isPreviousContextRelated(cachedEntry.history, currentHistory)) {
      return cachedEntry;
    }
  }
  
  return undefined;
}

/**
 * Determines if the cached context is still valid (not expired)
 */
function isContextCacheValid(entry: ConversationContext): boolean {
  const now = Date.now();
  return (now - entry.timestamp) < CONTEXT_CACHE_TIMEOUT;
}

/**
 * Updates the context cache with new information
 */
function updateCache(
  conversationId: string, 
  context: ContextManagementResult, 
  history: string[],
  entitiesForNextPersistence: EnhancedEntity[]
): void {
  // Filter to only persistent entities for next turn
  const persistentEntitiesOnly = entitiesForNextPersistence.filter(e => 
    e.isPersistent || shouldEntityPersist(e)
  );
  
  // Create cache entry
  const cacheEntry: ConversationContext = {
    context,
    timestamp: Date.now(),
    history,
    entitiesForNextPersistence: persistentEntitiesOnly
  };
  
  // Store in cache
  contextCache.set(conversationId, cacheEntry);
  
  // Clean up old entries if cache exceeds size limit
  if (contextCache.size > MAX_CACHED_CONVERSATIONS) {
    const entries = Array.from(contextCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Remove the oldest entries
    for (let i = 0; i < Math.floor(entries.length / 2); i++) {
      const entry = entries[i];
      if (entry) {
        contextCache.delete(entry[0]);
      }
    }
  }
}

/**
 * IMPROVED: More robust check for related conversation history
 */
function isPreviousContextRelated(
  prevHistory?: string[],
  currentHistory?: string[]
): boolean {
  if (!prevHistory || !currentHistory) return false;
  if (prevHistory.length === 0 || currentHistory.length === 0) return false;
  
  // If histories are too different in length, they're probably not related
  if (currentHistory.length < prevHistory.length - 2) return false;
  
  // Different approaches depending on history length
  if (prevHistory.length <= 3) {
    // For short histories, check message by message
    // Check if the beginning of current history matches previous history
    const minLength = Math.min(prevHistory.length, currentHistory.length);
    
    let matchCount = 0;
    for (let i = 0; i < minLength; i++) {
      const prevMessage = prevHistory[i];
      const currMessage = currentHistory[i];
      if (prevMessage && currMessage && prevMessage === currMessage) {
        matchCount++;
      }
    }
    
    // Require at least 70% match for short conversations
    return matchCount >= Math.ceil(minLength * 0.7);
  } else {
    // For longer histories, check the first 3 messages and last message
    // This is more efficient and still reliable
    if (!prevHistory[0] || !currentHistory[0] || prevHistory[0] !== currentHistory[0]) return false;
    
    const prevLastIdx = prevHistory.length - 1;
    const currLastIdx = currentHistory.length - 1;
    
    // If current history is longer, the previous last message should be somewhere in the current history
    if (currentHistory.length > prevHistory.length) {
      const prevLastMessage = prevHistory[prevLastIdx];
      return prevLastMessage ? currentHistory.includes(prevLastMessage) : false;
    }
    
    // Same length, check if the last messages match
    const prevLastMessage = prevHistory[prevLastIdx];
    const currLastMessage = currentHistory[currLastIdx];
    return prevLastMessage && currLastMessage ? prevLastMessage === currLastMessage : false;
  }
}

/**
 * Creates a fallback context prediction when model fails
 */
function createFallbackContextPrediction(
  messageCount: number,
  currentIntent?: Intent | null
): { context: string, confidence: number } {
  // Intelligent fallback based on intent and message count
  if (currentIntent && isQuestionIntent(currentIntent)) {
    return { context: CONTEXT_TYPES.QUESTION, confidence: 0.7 };
  }
  
  if (messageCount <= 1) {
    return { context: CONTEXT_TYPES.INITIAL, confidence: 0.9 };
  } else if (messageCount <= 3) {
    return { context: CONTEXT_TYPES.FOLLOW_UP, confidence: 0.7 };
  } else {
    return { context: CONTEXT_TYPES.FOLLOW_UP, confidence: 0.5 };
  }
}

/**
 * Validates whether a model is usable for context prediction
 */
function isValidModel(model: any): boolean {
  if (!model) {
    console.error('[manageContext] Model is null or undefined');
    return false;
  }
  
  if (!model.predict) {
    console.error('[manageContext] Model has no predict property');
    return false; 
  }
  
  if (typeof model.predict !== 'function') {
    console.error(`[manageContext] model.predict is not a function, but ${typeof model.predict}`);
    return false;
  }
  
  return true;
}

/**
 * Normalizes an intent object to ensure it has valid properties
 */
function normalizeIntent(intent: Intent | null | undefined): Intent | null {
  if (!intent) return null;
  
  return {
    name: intent.name,
    confidence: typeof intent.confidence === 'number' ? intent.confidence : 0.5,
    type: intent.type || 'unknown',
    // Copy any other properties
    ...(intent as any)
  };
}

/**
 * Checks if an intent represents a question
 */
function isQuestionIntent(intent: Intent): boolean {
  // Look for question-related intent names
  if (intent.name?.includes('question') || 
      intent.name?.includes('faq') || 
      intent.name?.includes('ask') ||
      intent.name?.includes('how_') ||
      intent.name?.includes('what_') ||
      intent.name?.includes('when_') ||
      intent.name?.includes('where_') ||
      intent.name?.includes('why_')) {
    return true;
  }
  
  // Consider type for FAQ intents
  if (intent.type === 'faq') {
    return true;
  }
  
  // Lower confidence for intents with very low confidence
  return intent.confidence > 0.4;
}

/**
 * Creates a rule-based context when model prediction fails
 */
function createRuleBasedContextResult(
  contextType: string,
  confidence: number,
  currentEntities: Entity[],
  currentIntent: Intent | null,
  conversationHistory: string[],
  previousContext?: EnhancedContext
): ContextManagementResult {
  // Convert current entities to enhanced entities
  const enhancedCurrentEntities = currentEntities.map(entity => enhanceEntity(entity, true));
  
  // Get previously persistent entities if available
  const previousEntities: EnhancedEntity[] = (previousContext?.entities as EnhancedEntity[]) || [];
  
  // Merge and enhance entities
  const mergedEntities = mergeAndEnhanceEntities(
    currentEntities,
    previousEntities.filter(e => e && (e.isPersistent || shouldEntityPersist(e))),
    contextType
  );
  
  // Get recent intents
  const recentIntents = getRecentIntents(previousContext, currentIntent);
  
  // Derive topics
  const topics = deriveTopicsFromIntentAndEntities(currentIntent, mergedEntities);
  
  // Create the rule-based context result with all required fields
  const result: ContextManagementResult = {
    name: contextType,
    confidence: confidence,
    entities: mergedEntities,
    recentIntents: recentIntents,
    topics: topics,
    timestamp: Date.now(),
    messageCount: conversationHistory.length,
    isLongConversation: conversationHistory.length >= 10,
    hasContextBreak: false,
    contextBreakType: undefined,
    intentTransition: previousContext && currentIntent ? 
      `${previousContext.recentIntents && previousContext.recentIntents.length > 0 ? 
        previousContext.recentIntents[0]?.name || 'none' : 'none'}->${currentIntent.name}` : '',
    sentiment: 'neutral',
    urgency: 'normal',
    sentimentInfo: {},
    contextComplexity: 'low',
    persistentInfo: previousContext?.persistentInfo ? { ...(previousContext.persistentInfo || {}) } : {}
  };
  
  // Further analyze context if enabled
  if (ENABLE_ENHANCED_CONTEXT && conversationHistory.length > 0) {
    analyzeHistoryForContextBreaks(result, conversationHistory);
    analyzeMessageSentiment(result, conversationHistory);
    result.contextComplexity = calculateContextComplexity(result);
  }
  
  return result;
}

/**
 * IMPROVED: Better context type detection with more signals
 */
function determineContextType(
  conversationHistory: string[],
  currentIntent: Intent | null,
  previousContext?: EnhancedContext
): string {
  const isFirstMessage = conversationHistory.length <= 1;
  if (isFirstMessage) {
    return CONTEXT_TYPES.INITIAL;
  }
  
  // Get the latest message for analysis
  // FIX: Add a check to ensure conversationHistory has at least one element
  const latestMessage = (conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] || '' : '').toLowerCase();
  
  // IMPROVED: Detect special follow-up patterns first
  if (isFollowUpMessage(latestMessage, previousContext)) {
    return CONTEXT_TYPES.FOLLOW_UP;
  }
  
  // If we have an intent, use it to help determine context type
  if (currentIntent) {
    // FAQ intents should always result in a question context
    if (currentIntent.type === 'faq') {
      return CONTEXT_TYPES.QUESTION;
    }
    
    // Check intent types
    if (currentIntent.type === 'smalltalk') {
      if (currentIntent.name?.includes('greeting')) return CONTEXT_TYPES.INITIAL;
      if (currentIntent.name?.includes('farewell')) return CONTEXT_TYPES.CLOSING;
      if (currentIntent.name?.includes('thank')) return CONTEXT_TYPES.CONFIRMATION;
    }
    
    // Check for question patterns
    if (currentIntent.name?.includes('question') || 
        latestMessage.includes('?')) {
      return CONTEXT_TYPES.QUESTION;
    }
    
    // If the intent is function-related, it's often an instruction
    if (currentIntent.type === 'function') {
      return CONTEXT_TYPES.INSTRUCTION;
    }
    
    // Check for confirmation/negation patterns
    if (currentIntent.name?.includes('confirm') || 
        currentIntent.name?.includes('yes') || 
        currentIntent.name?.includes('agree')) {
      return CONTEXT_TYPES.CONFIRMATION;
    }
    
    if (currentIntent.name?.includes('deny') || 
        currentIntent.name?.includes('no') || 
        currentIntent.name?.includes('disagree')) {
      return CONTEXT_TYPES.NEGATION;
    }
  }
  
  // Check for question marks in the latest message
  if (latestMessage.includes('?')) {
    return CONTEXT_TYPES.QUESTION;
  }
  
  // Check for indicators of topic change
  if (latestMessage.includes('anderes thema') || 
      latestMessage.includes('different topic') ||
      latestMessage.includes('übrigens') ||
      latestMessage.includes('by the way')) {
    return CONTEXT_TYPES.TOPIC_CHANGE;
  }
  
  // Check for clarification patterns
  if (latestMessage.includes('verstehe nicht') ||
      latestMessage.includes("don't understand") ||
      latestMessage.includes('was meinst du') ||
      latestMessage.includes('what do you mean')) {
    return CONTEXT_TYPES.CLARIFICATION;
  }
  
  // If there's a previous context type and it's significant, often it carries over
  if (previousContext?.name) {
    if (['question', 'clarification', 'instruction'].includes(previousContext.name)) {
      return CONTEXT_TYPES.FOLLOW_UP;
    }
  }
  
  // Default to followup if no specific type is determined
  return CONTEXT_TYPES.FOLLOW_UP;
}

/**
 * IMPROVED: Detects if a message is a follow-up to previous context
 */
function isFollowUpMessage(message: string, previousContext?: EnhancedContext): boolean {
  if (!previousContext) return false;
  
  // Common follow-up phrase patterns in German and English
  const followUpPatterns = [
    // German patterns
    "wie gesagt", "wie bereits erwähnt", "wie ich schon sagte",
    "ich finde es nicht", "wo genau", "was genau", "welche genau",
    "außerdem", "zusätzlich", "übrigens", "jedenfalls", "zurück zu",
    "dazu noch", "nochmal", "nochmals", "weiterhin", "trotzdem",
    "dennoch", "genauer gesagt", "wie dem auch sei", "davon", "darüber",
    "dafür", "damit", "daran", "darin", "daraus", "darunter",
    
    // English patterns
    "as i said", "as mentioned", "like i said", "as stated",
    "i can't find it", "where exactly", "what exactly", "which exactly",
    "additionally", "moreover", "furthermore", "besides", "back to",
    "also", "again", "still", "nevertheless", "however",
    "more specifically", "anyway", "about it", "about that"
  ];
  
  // Check for pronoun references
  const pronounPatterns = [
    // German pronouns
    "\\b(es|das|diese[rs]?|jene[rs]?|die|der|ihn|ihnen|dazu|damit|davon|darüber)\\b",
    // English pronouns
    "\\b(it|this|that|these|those|them|they|he|she|its)\\b"
  ];
  
  // Check for follow-up patterns
  for (const pattern of followUpPatterns) {
    if (message.includes(pattern)) {
      return true;
    }
  }
  
  // Check for pronoun references that likely refer to previous context
  for (const pattern of pronounPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(message)) {
      return true;
    }
  }
  
  // Check for short messages that are likely follow-ups
  const words = message.split(/\s+/).filter(word => word.length > 0);
  if (words.length <= 3 && !message.includes('?')) {
    return true;
  }
  
  return false;
}

/**
 * IMPROVED: Detects potential references to entities in message text
 */
function detectEntityReferences(message: string, previousEntities: EnhancedEntity[]): Map<string, string> {
  const references = new Map<string, string>();
  
  if (!previousEntities || previousEntities.length === 0) {
    return references;
  }
  
  // Common reference words
  const referencePatterns: Record<string, { pattern: RegExp, type: string }[]> = {
    'de': [
      { pattern: /\b(es|das|diese[rs]?|jene[rs]?|die|der|ihn|ihnen|dazu|damit|davon|darüber)\b/i, type: 'general' },
      { pattern: /\b(erster[en]?|ersten|zweiter[en]?|zweiten|dritter[en]?|dritten|letzte[rn]?|vorige[rn]?)\b/i, type: 'ordinal' }
    ],
    'en': [
      { pattern: /\b(it|this|that|these|those|them|they|he|she|its|about it|about that)\b/i, type: 'general' },
      { pattern: /\b(first|second|third|last|previous|former|latter)\b/i, type: 'ordinal' }
    ]
  };
  
  // Check both German and English patterns
  for (const language of ['de', 'en']) {
    const patterns = referencePatterns[language as 'de' | 'en'] || [];
    for (const { pattern, type } of patterns) {
      if (pattern.test(message)) {
        // Found a potential reference, record the entity type
        for (const entity of previousEntities) {
          if (entity && entity.type && entity.value) {
            references.set(entity.type, entity.value);
            
            // Record the specific entity value for this reference
            references.set('reference_type', type);
            references.set('reference_target', entity.type);
            
            // Only record one reference for now to avoid confusion
            // In a more sophisticated version, we could handle multiple references
            break;
          }
        }
      }
    }
  }
  
  return references;
}

/**
 * FIXED: Extracts previous entities from the previous context
 * Now correctly returns EnhancedEntity[] instead of Entity[]
 */
function extractPreviousEntities(
  previousContext?: EnhancedContext,
  currentIntent?: Intent | null
): EnhancedEntity[] {
  if (!previousContext) return [];
  
  // Extract entities from the previous context - safely access potentially undefined property
  const previousEntities = previousContext.entities || [];
  
  // Convert to EnhancedEntity objects if they're not already and filter nulls
  return previousEntities
    .map(entity => {
      if (!entity) return null;
      
      // If this is already an EnhancedEntity, check if it should be kept
      const enhancedEntity = entity as EnhancedEntity;
      
      // Keep only persistent entities or those relevant to the current intent
      if (enhancedEntity.isPersistent || isEntityRelevantToIntent(enhancedEntity, currentIntent)) {
        return enhancedEntity;
      }
      return null;
    })
    .filter((entity): entity is EnhancedEntity => entity !== null);
}

/**
 * Determines if an entity is relevant to the current intent
 */
function isEntityRelevantToIntent(entity: Entity, intent?: Intent | null): boolean {
  if (!intent) return false;
  
  // For FAQ intents, most entities are potentially relevant
  if (intent.type === 'faq') {
    return true;
  }
  
  // For function intents, check entity type against intent name
  if (intent.type === 'function') {
    // Example: For "function_weather", a "location" entity is relevant
    if (intent.name === 'function_weather' && entity.type === 'location') {
      return true;
    }
    
    // Example: For "function_time", a "timezone" entity is relevant
    if (intent.name === 'function_time' && entity.type === 'timezone') {
      return true;
    }
  }
  
  // Default to false for unknown relationships
  return false;
}

/**
 * FIXED: Merges and enhances entities with reference handling
 * Now accepts previousEntities as EnhancedEntity[] instead of Entity[]
 */
function mergeAndEnhanceEntities(
  currentEntities: Entity[],
  previousEntities: EnhancedEntity[] = [],
  contextType: string,
  entityReferences: Map<string, string> = new Map()
): EnhancedEntity[] {
  // First, enhance all current entities
  const enhancedCurrentEntities: EnhancedEntity[] = currentEntities.map(entity => 
    enhanceEntity(entity, true)
  );
  
  // Then process previous entities, marking them appropriately
  // We don't need the type predicate anymore since we already have EnhancedEntity[]
  const processedPreviousEntities: EnhancedEntity[] = previousEntities
    .filter(prevEntity => prevEntity !== null && prevEntity !== undefined)
    .map(prevEntity => ({
      ...prevEntity,
      isNew: false,
      fromPreviousContext: true,
      // Keep isPersistent flag if it exists, otherwise determine it
      isPersistent: prevEntity.isPersistent !== undefined ? 
        prevEntity.isPersistent : shouldEntityPersist(prevEntity)
    }));
  
  // Combine while avoiding duplicates
  const mergedEntities: EnhancedEntity[] = [...enhancedCurrentEntities];
  
  // Add previous entities that don't duplicate current ones
  for (const prevEntity of processedPreviousEntities) {
    // Check if this entity already exists in the merged list
    const existingIndex = mergedEntities.findIndex(entity => 
      entity.type === prevEntity.type && entity.value === prevEntity.value
    );
    
    if (existingIndex === -1) {
      // Not found, add it
      mergedEntities.push(prevEntity);
    } else if (mergedEntities[existingIndex]) {
      // Entity exists, update its metadata
      mergedEntities[existingIndex].fromPreviousContext = true;
      
      // If the previous entity was persistent, keep that flag
      if (prevEntity.isPersistent) {
        mergedEntities[existingIndex].isPersistent = true;
      }
      
      // Merge metadata if available
      if (prevEntity.metadata && !mergedEntities[existingIndex].metadata) {
        mergedEntities[existingIndex].metadata = { ...(prevEntity.metadata || {}) };
      } else if (prevEntity.metadata && mergedEntities[existingIndex].metadata) {
        mergedEntities[existingIndex].metadata = {
          ...(prevEntity.metadata || {}),
          ...(mergedEntities[existingIndex].metadata || {})
        };
      }
    }
  }
  
  // Handle entity references by boosting confidence for referenced entities
  if (entityReferences.size > 0) {
    for (const entity of mergedEntities) {
      if (entityReferences.has(entity.type) && entityReferences.get(entity.type) === entity.value) {
        // Boost confidence for referenced entities
        entity.confidence = Math.min((entity.confidence || 0.5) * 1.3, 1.0);
        
        // Make sure referenced entities persist
        entity.isPersistent = true;
        
        // Add metadata about being referenced
        entity.metadata = entity.metadata || {};
        entity.metadata.referenced = true;
        entity.metadata.referenceType = entityReferences.get('reference_type');
      }
    }
  }
  
  // Apply context-specific transformations
  return transformEntitiesBasedOnContext(mergedEntities, contextType);
}

/**
 * Enhances an entity with additional fields required for EnhancedEntity
 */
function enhanceEntity(entity: Entity, isNew: boolean = false): EnhancedEntity {
  return {
    ...entity,
    isNew: isNew,
    fromPreviousContext: !isNew,
    timestamp: Date.now(),
    isPersistent: shouldEntityPersist(entity),
    // Include any other required EnhancedEntity fields here
  };
}

/**
 * Applies transformations to entities based on context type
 */
function transformEntitiesBasedOnContext(
  entities: EnhancedEntity[],
  contextType: string
): EnhancedEntity[] {
  // Apply different transformations based on context type
  switch (contextType) {
    case CONTEXT_TYPES.QUESTION:
      // For questions, boost confidence of entities that might be the subject
      return entities.map(entity => ({
        ...entity,
        confidence: entity.isNew ? 
          Math.min((entity.confidence ?? 0.5) * 1.2, 1.0) : 
          (entity.confidence ?? 0.5)
      }));
      
    case CONTEXT_TYPES.CLARIFICATION:
      // For clarifications, all entities are potentially important
      return entities.map(entity => ({
        ...entity,
        confidence: Math.min((entity.confidence ?? 0.5) * 1.1, 1.0)
      }));
      
    case CONTEXT_TYPES.TOPIC_CHANGE:
      // For topic changes, new entities are more relevant
      return entities.map(entity => ({
        ...entity,
        confidence: entity.isNew ? 
          Math.min((entity.confidence ?? 0.5) * 1.3, 1.0) : 
          (entity.confidence ?? 0.5) * 0.8
      }));
      
    case CONTEXT_TYPES.FOLLOW_UP:
      // For follow-ups, persistent entities are more important
      return entities.map(entity => ({
        ...entity,
        confidence: entity.isPersistent ? 
          Math.min((entity.confidence ?? 0.5) * 1.2, 1.0) : 
          (entity.confidence ?? 0.5)
      }));
      
    default:
      // No transformation for other context types
      return entities;
  }
}

/**
 * IMPROVED: Better entity persistence determination
 */
function shouldEntityPersist(entity: Entity): boolean {
  // Check if entity type is in the configured persistent types
  if (PERSISTENT_ENTITY_TYPES.includes(entity.type)) {
    return true;
  }
  
  // Entities with high confidence are more likely to be important
  if (entity.confidence && entity.confidence > HIGH_CONFIDENCE_THRESHOLD) {
    return true;
  }
  
  // IMPROVED: Additional rules for specific entity types
  if (entity.type === 'topic' || entity.type === 'intent_subject') {
    return true;
  }
  
  // IMPROVED: Entities with metadata indicating importance should persist
  if (entity.metadata && 
     (entity.metadata?.important === true || 
      entity.metadata?.referenced === true)) {
    return true;
  }
  
  // Default to non-persistent
  return false;
}

/**
 * Gets recent intents from previous context and current intent
 */
function getRecentIntents(
  previousContext?: EnhancedContext,
  currentIntent: Intent | null = null
): Intent[] {
  const recentIntents: Intent[] = [];
  
  // Add current intent if available
  if (currentIntent) {
    recentIntents.push(currentIntent);
  }
  
  // Add previous intents if available
  if (previousContext?.recentIntents) {
    // Only add intents that aren't duplicates of the current intent
    for (const prevIntent of previousContext.recentIntents) {
      if (prevIntent && (!currentIntent || prevIntent.name !== currentIntent.name)) {
        recentIntents.push(prevIntent);
      }
    }
  }
  
  // Limit to most recent 5 intents
  return recentIntents.slice(0, 5);
}

/**
 * Determines the transition between previous and current intents
 */
function determineIntentTransition(
  previousContext?: EnhancedContext,
  currentIntent: Intent | null = null
): string {
  if (!currentIntent) {
    return '';
  }
  
  // If no previous context, this is initial
  if (!previousContext || !previousContext.recentIntents || previousContext.recentIntents.length === 0) {
    return 'initial';
  }
  
  // Get the previous intent
  const previousIntent = previousContext.recentIntents[0];
  
  // Check if previousIntent exists
  if (!previousIntent) {
    return 'initial';
  }
  
  // Compare intents
  if (previousIntent.name === currentIntent.name) {
    return 'continue'; // Same intent
  }
  
  if (previousIntent.type === currentIntent.type) {
    return 'same_type'; // Different intent but same type
  }
  
  // Specific transitions based on intent types
  if (previousIntent.type === 'smalltalk' && currentIntent.type !== 'smalltalk') {
    return 'from_smalltalk';
  }
  
  if (previousIntent.type !== 'smalltalk' && currentIntent.type === 'smalltalk') {
    return 'to_smalltalk';
  }
  
  if (currentIntent.type === 'faq') {
    return 'to_faq';
  }
  
  if (currentIntent.type === 'function') {
    return 'to_function';
  }
  
  return 'change'; // Generic change
}

/**
 * IMPROVED: More comprehensive topic derivation
 */
function deriveTopicsFromIntentAndEntities(
  currentIntent: Intent | null,
  entities: EnhancedEntity[]
): string[] {
  const topics: string[] = [];
  
  // Extract topics from intent
  if (currentIntent) {
    const intentName = currentIntent.name ?? '';
    
    // Extract from FAQ intents (format: faq_topic_subtopic)
    if (intentName.startsWith('faq_')) {
      const topicParts = intentName.split('_');
      if (topicParts.length > 1 && topicParts[1]) {
        topics.push(topicParts[1]); // Add main topic
        
        // Add subtopic if available
        if (topicParts.length > 2 && topicParts[2]) {
          topics.push(`${topicParts[1]}_${topicParts[2]}`);
        }
      }
    }
    
    // Extract from function intents (format: function_action)
    if (intentName.startsWith('function_')) {
      const topicParts = intentName.split('_');
      if (topicParts.length > 1 && topicParts[1]) {
        topics.push(topicParts[1]); // Add action as topic
      }
    }
    
    // Add intent type as topic
    if (currentIntent.type) {
      topics.push(currentIntent.type);
    }
    
    // IMPROVED: Add the full intent name as a topic for better tracking
    topics.push(intentName);
  }
  
  // Extract topics from relevant entity types
  const topicEntityTypes = ['topic', 'category', 'product', 'service', 'feature'];
  
  for (const entity of entities) {
    if (entity && topicEntityTypes.includes(entity.type)) {
      topics.push(entity.value);
    }
    
    // Add entity type as a topic category
    if (entity) {
      topics.push(entity.type);
    
      // IMPROVED: Add specific entity values as topics for important entity types
      if (entity.isPersistent && entity.value) {
        topics.push(`${entity.type}_${entity.value}`);
      }
    }
  }
  
  // Remove duplicates using Set
  return Array.from(new Set(topics));
}

/**
 * IMPROVED: Better context break detection with more indicators
 */
function analyzeHistoryForContextBreaks(
  context: EnhancedContext,
  history: string[]
): void {
  if (history.length < 2) return;
  
  // Get the latest message
  // FIX: Add a check to ensure history has at least one element
  const latestMessage = (history.length > 0 ? history[history.length - 1] || '' : '').toLowerCase();
  
  // Define context break indicators
  const contextBreakIndicators: Record<string, string[]> = {
    'digression': ["übrigens", "by the way", "apropos", "nebenbei", "am rande", "incidentally"],
    'topic_change': ["anderes thema", "neues thema", "lass uns über", "let's talk about", "different topic", "new topic"],
    'return': ["zurück zu", "getting back to", "um zurückzukommen", "returning to", "anyway"],
    'clarification': ["was meinst du", "what do you mean", "verstehe nicht", "don't understand", "unklar", "unclear"]
  };
  
  // Check for context break indicators
  for (const [breakType, indicators] of Object.entries(contextBreakIndicators)) {
    for (const indicator of indicators) {
      if (latestMessage.includes(indicator)) {
        context.hasContextBreak = true;
        context.contextBreakType = breakType;
        return;
      }
    }
  }
  
  // Check for special indicator words at the beginning of sentences
  const sentenceStartIndicators = [
    "also,", "nun,", "jedenfalls,", "dennoch,", "trotzdem,", "allerdings,",
    "well,", "so,", "anyway,", "however,", "still,", "nevertheless,"
  ];
  
  for (const indicator of sentenceStartIndicators) {
    if (latestMessage.startsWith(indicator)) {
      context.hasContextBreak = true;
      context.contextBreakType = 'transition';
      return;
    }
  }
}

/**
 * IMPROVED: More nuanced sentiment analysis with compound scoring
 */
function analyzeMessageSentiment(
  context: EnhancedContext,
  history: string[]
): void {
  if (history.length === 0) return;
  
  // Get the latest message
  // FIX: Add a check to ensure history has at least one element
  const latestMessage = (history.length > 0 ? history[history.length - 1] || '' : '').toLowerCase();
  
  // Define sentiment keywords with weights
  const sentimentWords: Record<string, Record<string, number>> = {
    positive: {
      'sehr gut': 2, 'ausgezeichnet': 2, 'hervorragend': 2, 'begeistert': 2, 'perfekt': 2,
      'gut': 1, 'toll': 1, 'super': 1, 'danke': 1, 'happy': 1, 'zufrieden': 1, 'gern': 1,
      'bitte': 0.5, 'ok': 0.5, 'okay': 0.5
    },
    negative: {
      'sehr schlecht': 2, 'furchtbar': 2, 'schrecklich': 2, 'katastrophe': 2, 'enttäuscht': 2,
      'schlecht': 1, 'problem': 1, 'fehler': 1, 'leider': 1, 'schade': 1, 'ärgerlich': 1,
      'nicht': 0.5, 'kein': 0.5, 'weder': 0.5
    },
    urgency: {
      'sofort': 2, 'dringend': 2, 'notfall': 2, 'kritisch': 2,
      'schnell': 1, 'eilig': 1, 'jetzt': 1, 'bald': 0.5
    }
  };
  
  // Count keyword occurrences with weights
  let positiveScore = 0;
  let negativeScore = 0;
  let urgencyScore = 0;
  
  for (const [word, weight] of Object.entries(sentimentWords.positive || {})) {
    if (latestMessage.includes(word)) positiveScore += weight;
  }
  
  for (const [word, weight] of Object.entries(sentimentWords.negative || {})) {
    if (latestMessage.includes(word)) negativeScore += weight;
  }
  
  for (const [word, weight] of Object.entries(sentimentWords.urgency || {})) {
    if (latestMessage.includes(word)) urgencyScore += weight;
  }
  
  // Negate positive scores when paired with negations
  const negations = ['nicht', 'kein', 'keine', 'keinen', 'keiner', 'nie', 'niemals'];
  
  for (const negation of negations) {
    // Check for negation of positive words
    for (const positiveWord of Object.keys(sentimentWords.positive || {})) {
      const pattern = new RegExp(`${negation}\\s+\\w*\\s*${positiveWord}|${negation}\\s+${positiveWord}`);
      if (pattern.test(latestMessage)) {
        // Found a negated positive, subtract its score
        const positiveWordScore = sentimentWords.positive?.[positiveWord];
        if (positiveWordScore !== undefined) {
          positiveScore -= positiveWordScore;
          negativeScore += 0.5; // Add a small negative score for negated positives
        }
      }
    }
  }
  
  // Determine sentiment
  let sentiment = 'neutral';
  if (positiveScore > negativeScore + 0.5) {
    sentiment = positiveScore >= 2 ? 'very_positive' : 'positive';
  } else if (negativeScore > positiveScore + 0.5) {
    sentiment = negativeScore >= 2 ? 'very_negative' : 'negative';
  } else if (positiveScore > 0 && negativeScore > 0) {
    sentiment = 'mixed';
  }
  
  // Determine urgency
  let urgency = 'normal';
  if (urgencyScore >= 2) {
    urgency = 'high';
  } else if (urgencyScore >= 1) {
    urgency = 'medium';
  }
  
  // Update context
  context.sentiment = sentiment;
  context.urgency = urgency;
  
  // Add detailed sentiment info
  context.sentimentInfo = {
    positive: positiveScore,
    negative: negativeScore,
    compound: positiveScore - negativeScore,
    urgency: urgencyScore
  };
}

/**
 * IMPROVED: Detect explicit references to previous context
 */
function detectContextReferences(
  context: EnhancedContext,
  history: string[],
  previousContext?: EnhancedContext
): void {
  if (history.length < 2 || !previousContext) return;
  
  // FIX: Add a check to ensure history has at least one element
  const latestMessage = (history.length > 0 ? history[history.length - 1] || '' : '').toLowerCase();
  
  // Words that indicate reference to previous context
  const referenceWords = {
    'de': [
      "wie gesagt", "wie erwähnt", "wie bereits gesagt", "wie schon gesagt",
      "vorhin", "zuvor", "vorher", "früher", "letztens", "gerade eben",
      "das vorige", "das vorherige", "die letzte", "die vorige"
    ],
    'en': [
      "as mentioned", "as stated", "as said before", "as previously mentioned",
      "earlier", "before", "previously", "a while ago", "just now",
      "the previous", "the last", "last time", "the former"
    ]
  };
  
  // Check for reference words in both languages
  const allReferenceWords = [...referenceWords.de, ...referenceWords.en];
  
  for (const word of allReferenceWords) {
    if (latestMessage.includes(word)) {
      // Update persistent info to reflect reference to previous context
      context.persistentInfo = context.persistentInfo || {};
      context.persistentInfo.hasExplicitReference = true;
      context.persistentInfo.referenceType = 'explicit';
      
      // If there were previous topics, mark them as referenced
      if (previousContext.topics && previousContext.topics.length > 0) {
        context.persistentInfo.referencedTopics = [...previousContext.topics];
      }
      
      break;
    }
  }
}

/**
 * IMPROVED: Handle pronoun references ("es", "das", etc.)
 */
function handlePronounReferences(
  context: EnhancedContext,
  history: string[],
  previousContext?: EnhancedContext
): void {
  if (history.length < 2 || !previousContext) return;
  
  // FIX: Add a check to ensure history has at least one element
  const latestMessage = (history.length > 0 ? history[history.length - 1] || '' : '').toLowerCase();
  
  // Pronouns that might refer to previous entities or topics
  const pronounPatterns: Record<string, RegExp[]> = {
    'de': [
      /\b(es|das|diese[rs]?|jene[rs]?|die|der|dem|den)\b/i,
      /\b(dazu|damit|davon|darüber|darin|daraus)\b/i
    ],
    'en': [
      /\b(it|this|that|these|those|them|they|he|she|its|theirs|him|her)\b/i,
      /\b(about it|with it|from it|in it|on it|for it)\b/i
    ]
  };
  
  // Check if the message contains pronouns
  let hasPronouns = false;
  for (const language of ['de', 'en']) {
    const patterns = pronounPatterns[language as 'de' | 'en'] || [];
    for (const pattern of patterns) {
      if (pattern.test(latestMessage)) {
        hasPronouns = true;
        break;
      }
    }
    if (hasPronouns) break;
  }
  
  if (hasPronouns) {
    // Update persistent info to reflect potential pronoun reference
    context.persistentInfo = context.persistentInfo || {};
    context.persistentInfo.hasPronounReference = true;
    
    // Make previous entities more likely to be persistent
    if (context.entities && context.entities.length > 0) {
      const enhancedEntities = context.entities;
      
      // Mark entities that came from previous context as likely referenced by pronouns
      for (let i = 0; i < enhancedEntities.length; i++) {
        const entity = enhancedEntities[i];
        if (entity && entity.fromPreviousContext) {
          entity.isPersistent = true;
          
          // Add metadata about being referenced by pronoun
          entity.metadata = entity.metadata || {};
          entity.metadata.referencedByPronoun = true;
        }
      }
    }
    
    // Mark the context as a follow-up if it isn't already marked as one
    if (context.name !== CONTEXT_TYPES.FOLLOW_UP &&
        context.name !== CONTEXT_TYPES.CLARIFICATION &&
        context.name !== CONTEXT_TYPES.CONFIRMATION &&
        context.name !== CONTEXT_TYPES.NEGATION) {
      context.name = CONTEXT_TYPES.FOLLOW_UP;
      context.confidence = Math.max(context.confidence, 0.7);
    }
  }
}

/**
 * Applies rule-based corrections to the context
 */
function applyContextRules(
  context: EnhancedContext,
  currentIntent: Intent | null,
  messageCount: number = 0
): void {
  // CRITICAL FIX: Rule for FAQ Intents - Must come first to have highest priority
  if (currentIntent && currentIntent.type === 'faq') {
    context.name = CONTEXT_TYPES.QUESTION;
    context.confidence = 0.95; // Very high confidence for this rule
    console.log(`[applyContextRules] Context updated to QUESTION due to FAQ intent type: ${currentIntent.name}`);
    return; // Exit early to prevent other rules from overriding this
  }

  // Rule 1: Greetings in first message -> initial context
  if (
    currentIntent &&
    ['smalltalk_greeting', 'smalltalk_hello', 'greeting'].some(k => currentIntent.name?.includes(k)) &&
    messageCount <= 1
  ) {
    context.name = CONTEXT_TYPES.INITIAL;
    context.confidence = Math.max(context.confidence, 0.9);
  }
  
  // Rule 2: Clarification intents -> clarification context
  if (
    currentIntent &&
    ['clarification', 'repeat', 'what', 'explain'].some(kw => 
      currentIntent.name?.includes(kw)
    )
  ) {
    context.name = CONTEXT_TYPES.CLARIFICATION;
    context.confidence = Math.max(context.confidence, 0.8);
  }
  
  // Rule 3: Confirmation intents -> confirmation context
  if (
    currentIntent &&
    ['confirm', 'yes', 'agree', 'correct'].some(kw =>
      currentIntent.name?.includes(kw)
    )
  ) {
    context.name = CONTEXT_TYPES.CONFIRMATION;
    context.confidence = Math.max(context.confidence, 0.9);
  }
  
  // Rule 4: Negation intents -> negation context
  if (
    currentIntent &&
    ['no', 'negative', 'disagree', 'incorrect', 'deny'].some(kw =>
      currentIntent.name?.includes(kw)
    )
  ) {
    context.name = CONTEXT_TYPES.NEGATION;
    context.confidence = Math.max(context.confidence, 0.9);
  }
  
  // Rule 5: Farewell intents -> closing context
  if (
    currentIntent &&
    ['goodbye', 'bye', 'end', 'close'].some(kw =>
      currentIntent.name?.includes(kw)
    )
  ) {
    context.name = CONTEXT_TYPES.CLOSING;
    context.confidence = Math.max(context.confidence, 0.9);
  }
  
  // Rule 6: Question intents -> question context
  if (
    currentIntent &&
    (currentIntent.name?.includes('question') || 
     currentIntent.name?.includes('ask') ||
     currentIntent.name?.startsWith('what_') ||
     currentIntent.name?.startsWith('how_') ||
     currentIntent.name?.startsWith('where_') ||
     currentIntent.name?.startsWith('when_') ||
     currentIntent.name?.startsWith('why_'))
  ) {
    context.name = CONTEXT_TYPES.QUESTION;
    context.confidence = Math.max(context.confidence, 0.8);
  }
  
  // Rule 7: Command/instruction intents -> instruction context
  if (
    currentIntent &&
    (currentIntent.name?.includes('command') || 
     currentIntent.name?.includes('order') ||
     currentIntent.name?.includes('request') ||
     currentIntent.name?.startsWith('do_') ||
     currentIntent.name?.startsWith('set_') ||
     currentIntent.name?.startsWith('change_') ||
     currentIntent.name?.startsWith('update_'))
  ) {
    context.name = CONTEXT_TYPES.INSTRUCTION;
    context.confidence = Math.max(context.confidence, 0.8);
  }
}

/**
 * Calculates the complexity of the conversation context
 */
function calculateContextComplexity(
  context: EnhancedContext
): 'low' | 'medium' | 'high' {
  let complexityScore = 0;
  
  // Factors contributing to complexity
  if (context.entities && context.entities.length > 5) {
    complexityScore += 2;
  } else if (context.entities && context.entities.length > 2) {
    complexityScore += 1;
  }
  
  if (context.topics && context.topics.length > 3) {
    complexityScore += 2;
  } else if (context.topics && context.topics.length > 1) {
    complexityScore += 1;
  }
  
  if (context.recentIntents && context.recentIntents.length > 3) {
    complexityScore += 1;
  }
  
  if (context.isLongConversation) {
    complexityScore += 1;
  }
  
  if (context.hasContextBreak) {
    complexityScore += 1;
  }
  
  // IMPROVED: Additional factors for complexity
  if (context.name === CONTEXT_TYPES.CLARIFICATION || 
      context.name === CONTEXT_TYPES.TOPIC_CHANGE) {
    complexityScore += 1;
  }
  
  if (context.sentiment === 'mixed' || context.sentiment === 'very_negative') {
    complexityScore += 1;
  }
  
  if (context.urgency === 'high') {
    complexityScore += 1;
  }
  
  // Determine complexity level
  if (complexityScore >= 4) {
    return 'high';
  } else if (complexityScore >= 2) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Checks if a topic change has occurred between contexts
 * FIXED: Exported for use in contextualMemory.ts
 */
export function hasTopicChanged(
  currentContext: Context | null | undefined, 
  previousContext?: Context | null | undefined
): boolean {
  // 1. Validate previousContext and its topics
  if (!previousContext?.topics || !Array.isArray(previousContext.topics) || previousContext.topics.length === 0) {
    return false; 
  }
  
  // 2. Validate currentContext and its topics
  if (!currentContext?.topics || !Array.isArray(currentContext.topics) || currentContext.topics.length === 0) {
    return false; 
  }

  // 3. Use Set for efficient comparison (Type safety is ensured by checks above)
  const prevTopicsSet = new Set(previousContext.topics);
  
  // 4. Check if any current topic exists in the previous set
  for (const topic of currentContext.topics) {
    if (prevTopicsSet.has(topic)) {
      return false; // Common topic found -> No topic change
    }
  }

  // 5. No common topics found -> Topic has changed
  return true; 
}

/**
 * Extracts relevant context information for response generation
 * FIXED: Exported for use in contextualMemory.ts
 */
export function extractRelevantContextForResponse(context: Context | null | undefined): Record<string, any> {
  // 1. Early exit if context is invalid
  if (!context) {
    console.warn('[extractRelevantContextForResponse] Context is null or undefined. Returning minimal fallback.');
    return { 
      contextType: 'unknown', topics: [], entities: [], primaryEntity: undefined,
      complexity: 'low', sentiment: 'neutral', urgency: 'normal', lastIntent: undefined,
      persistentInfo: {}, contextBreak: undefined, timestamp: Date.now(), messageCount: 0
    };
  }

  // 2. Safely assign base fields with defaults
  const contextName: string = typeof context.name === 'string' ? context.name : 'unknown';
  const topics: string[] = (context.topics && Array.isArray(context.topics)) ? context.topics : [];
  
  // Initialize the result object with defaults
  const contextInfo: Record<string, any> = {
    contextType: contextName,
    topics: topics,
    entities: [], 
    primaryEntity: undefined, 
    timestamp: typeof context.timestamp === 'number' ? context.timestamp : Date.now(), 
    messageCount: typeof context.messageCount === 'number' ? context.messageCount : 0,     
    complexity: 'low',   
    sentiment: 'neutral',
    urgency: 'normal',   
    lastIntent: undefined,
    persistentInfo: {},
    contextBreak: undefined
  };

  // 3. Cast to EnhancedContext after validating context exists, but continue checking properties
  const enhancedContext = context as EnhancedContext; 

  // 4. Safely add Enhanced Properties if they exist and have the correct type
  if (typeof enhancedContext.contextComplexity === 'string') { 
    contextInfo.complexity = enhancedContext.contextComplexity;
  }
  if (typeof enhancedContext.sentiment === 'string') { 
    contextInfo.sentiment = enhancedContext.sentiment;
  }
  if (typeof enhancedContext.urgency === 'string') { 
    contextInfo.urgency = enhancedContext.urgency;
  }

  // 5. Safe access and processing of Entities
  if (enhancedContext.entities && Array.isArray(enhancedContext.entities) && enhancedContext.entities.length > 0) {
    const entitiesArray: EnhancedEntity[] = enhancedContext.entities as EnhancedEntity[];
    try { 
      const sortedEntities = [...entitiesArray].sort((a, b) => {
        const confA = a?.confidence ?? 0;
        const confB = b?.confidence ?? 0;
        const newA = a?.isNew ?? false;
        const newB = b?.isNew ?? false;
        if (newA && !newB) return -1;
        if (!newA && newB) return 1;
        return confB - confA;
      });
      contextInfo.entities = sortedEntities.slice(0, 5);
      if (sortedEntities.length > 0) {
        contextInfo.primaryEntity = sortedEntities[0]; 
      }
    } catch (sortError) {
       console.error("[extractRelevantContextForResponse] Error sorting Entities:", sortError);
       // Keep entities as empty array in case of error
       contextInfo.entities = [];
       contextInfo.primaryEntity = undefined;
    }
  } 

  // 6. Safe access to recentIntents
  if (enhancedContext.recentIntents && Array.isArray(enhancedContext.recentIntents) && enhancedContext.recentIntents.length > 0) {
    contextInfo.lastIntent = enhancedContext.recentIntents[0];
    if (typeof enhancedContext.intentTransition === 'string') {
      contextInfo.intentTransition = enhancedContext.intentTransition;
    }
  }

  // 7. Safe access to persistentInfo
  if (typeof enhancedContext.persistentInfo === 'object' && enhancedContext.persistentInfo !== null) {
    contextInfo.persistentInfo = enhancedContext.persistentInfo;
  }

  // 8. Safe access to contextBreak Info
  if (enhancedContext.hasContextBreak === true) { 
    contextInfo.contextBreak = {
      detected: true,
      type: typeof enhancedContext.contextBreakType === 'string' ? enhancedContext.contextBreakType : 'general'
    };
  }
  
  // 9. Set follow-up flag
  if (contextName === CONTEXT_TYPES.FOLLOW_UP) {
    contextInfo.isFollowUp = true;
  }
  
  return contextInfo;
}

// Export utility functions for testing
export const __testing = {
  generateConversationId,
  isPreviousContextRelated,
  mergeAndEnhanceEntities,
  enhanceEntity,
  shouldEntityPersist,
  calculateContextComplexity,
  isFollowUpMessage,
  detectEntityReferences,
  hasTopicChanged, // Exported for external tests
  extractRelevantContextForResponse // Exported for external use
};