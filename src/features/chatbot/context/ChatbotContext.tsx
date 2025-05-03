import { type Intent, type Entity, type Context, type EnhancedEntity, type EnhancedContext, type NLPModel, type Language } from '@/types/nlp.types';
import { config } from '../config';

// Constants for context management
const MAX_CONTEXT_WINDOW = 10; // Maximum number of messages to consider for context
const MAX_CACHED_CONVERSATIONS = 20; // Maximum number of conversation histories to keep in memory

// Context cache to maintain state between function calls
// Keys are conversation IDs (or a hash of the conversation history)
interface ContextCacheEntry {
  timestamp: number;
  context: EnhancedContext;
  history: string[];
}

// Internal module state to persist context across calls
const contextCache: Map<string, ContextCacheEntry> = new Map();

/**
 * Manages conversation context by analyzing history, intent, entities, and context model
 * 
 * @param conversationHistory Array of messages in the conversation history
 * @param model The context detection model
 * @param currentIntent The intent detected for the current message
 * @param currentEntities The entities detected for the current message
 * @param language The language being used for the conversation
 * @returns An EnhancedContext object with contextual information for response generation
 */
export async function manageContext(
  conversationHistory: string[],
  model: NLPModel,
  currentIntent: Intent | null,
  currentEntities: Entity[],
  language: Language = 'de'
): Promise<EnhancedContext> {
  try {
    console.log(`[manageContext] Verarbeite Kontext für Konversationshistorie mit ${conversationHistory.length} Nachrichten`);
    
    // Generate a conversation ID based on the history
    const conversationId = generateConversationId(conversationHistory);
    
    // Retrieve previous context if available
    const prevContextEntry = contextCache.get(conversationId);
    
    // Check if this is a continuation of a previous conversation
    const isContinuation = isPreviousContextRelated(prevContextEntry?.history, conversationHistory);
    console.log(`[manageContext] Fortsetzung einer vorherigen Konversation: ${isContinuation}`);
    
    // Limit conversation history to the most recent messages
    const recentHistory = conversationHistory.slice(-MAX_CONTEXT_WINDOW);
    
    // Check if model is valid and has a predict function
    if (!isValidModel(model)) {
      console.warn('[manageContext] Ungültiges oder fehlendes Kontext-Modell, verwende regelbasierte Fallback-Logik');
      return createContextWithRules(
        recentHistory,
        currentIntent,
        currentEntities,
        isContinuation ? prevContextEntry?.context : undefined
      );
    }
    
    // Get context prediction from model
    let modelPrediction;
    try {
      modelPrediction = await model.predict(recentHistory);
      console.log(`[manageContext] Modell-Vorhersage: ${JSON.stringify(modelPrediction)}`);
    } catch (predictionError) {
      console.error('[manageContext] Fehler bei der Modell-Vorhersage:', predictionError);
      modelPrediction = null;
    }
    
    // Create a base context object (either from model prediction or rules)
    let baseContext = modelPrediction && modelPrediction.context 
      ? createContextFromModelPrediction(
          modelPrediction,
          currentIntent,
          isContinuation ? prevContextEntry?.context : undefined
        ) 
      : createContextWithRules(
          recentHistory,
          currentIntent,
          currentEntities,
          isContinuation ? prevContextEntry?.context : undefined
        );
    
    // Extract previous entities from the previous context entry
    const previousEntities = extractPreviousEntities(
      isContinuation ? prevContextEntry?.context : undefined,
      currentIntent
    );
    
    // Enhance entities with context information
    const enhancedEntities = enhanceEntitiesWithContext(
      currentEntities,
      previousEntities,
      baseContext.name
    );
    
    // Create the final context object, incorporating the enhanced entities
    const finalContext: EnhancedContext = {
      ...baseContext,
      entities: enhancedEntities,
      recentIntents: getRecentIntents(
        isContinuation ? prevContextEntry?.context : undefined, 
        currentIntent
      ),
      topics: deriveTopicsFromIntentAndEntities(currentIntent, enhancedEntities)
    };
    
    // Add additional context information if required
    let result: EnhancedContext;
    if (isEnhancedContextRequired(finalContext, currentIntent)) {
      result = enhanceContextWithAdditionalInfo(
        finalContext, 
        recentHistory, 
        currentIntent, 
        enhancedEntities,
        isContinuation ? prevContextEntry?.context : undefined
      );
    } else {
      // Ensure all EnhancedContext properties are present
      result = {
        ...finalContext,
        timestamp: Date.now(),
        messageCount: recentHistory.length,
        isLongConversation: recentHistory.length > 5,
        hasContextBreak: false,
        contextBreakType: undefined,
        intentTransition: '',
        sentiment: 'neutral',
        urgency: 'normal',
        contextComplexity: 'low',
        persistentInfo: {},
        sentimentInfo: {}
      };
    }
    
    // Store the context in the cache for future reference
    updateContextCache(conversationId, result, recentHistory);
    
    console.log(`[manageContext] Finaler Kontext: ${result.name} mit ${enhancedEntities.length} verbesserten Entities`);
    return result;
  } catch (error) {
    console.error('[manageContext] Fehler beim Kontext-Management:', error);
    
    // Return a minimal valid context in case of errors
    return {
      name: 'error',
      confidence: 1.0,
      entities: enhanceEntitiesWithContext(currentEntities, [], 'error'),
      recentIntents: currentIntent ? [currentIntent] : [],
      topics: [],
      timestamp: Date.now(),
      messageCount: 0,
      isLongConversation: false,
      hasContextBreak: false,
      contextBreakType: undefined,
      intentTransition: '',
      sentiment: 'neutral',
      urgency: 'normal',
      contextComplexity: 'low',
      persistentInfo: {},
      sentimentInfo: {}
    };
  }
}

/**
 * Generates a unique identifier for a conversation based on its history
 */
function generateConversationId(history: string[]): string {
  if (history.length === 0) return 'empty-conversation';
  
  // Simple hashing approach, using the first message and the length as identifiers
  // In a production system, you'd want a more robust identification mechanism
  const firstMessage = history[0] || '';
  const lastMessage = history[history.length - 1] || '';
  
  return `${firstMessage.substring(0, 10)}-${history.length}-${lastMessage.substring(0, 10)}`;
}

/**
 * Determines if a new conversation history is related to a previous one
 */
function isPreviousContextRelated(prevHistory?: string[], currentHistory?: string[]): boolean {
  if (!prevHistory || !currentHistory) return false;
  if (prevHistory.length === 0 || currentHistory.length === 0) return false;
  
  // If the current history contains all messages from the previous history
  // (plus potentially new ones), they are related
  if (currentHistory.length < prevHistory.length) return false;
  
  for (let i = 0; i < prevHistory.length; i++) {
    if (prevHistory[i] !== currentHistory[i]) return false;
  }
  
  return true;
}

/**
 * Updates the context cache with the latest context information
 */
function updateContextCache(conversationId: string, context: EnhancedContext, history: string[]): void {
  // Store the context with a timestamp
  contextCache.set(conversationId, {
    timestamp: Date.now(),
    context,
    history
  });
  
  // Clean up old entries if the cache gets too large
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
 * Validates whether the provided model is usable for context prediction
 */
function isValidModel(model: NLPModel | null): boolean {
  return !!(model && typeof model.predict === 'function');
}

/**
 * Creates a context object based on rules (when model prediction fails or is unavailable)
 */
function createContextWithRules(
  conversationHistory: string[],
  currentIntent: Intent | null,
  currentEntities: Entity[],
  previousContext?: EnhancedContext
): EnhancedContext {
  // Determine context type based on conversation state
  const isFirstMessage = conversationHistory.length <= 1;
  const contextName = determineContextTypeWithRules(
    conversationHistory, 
    currentIntent, 
    isFirstMessage,
    previousContext?.name
  );
  
  // Convert current entities to enhanced entities
  const enhancedCurrentEntities = enhanceEntitiesWithContext(
    currentEntities,
    [],
    contextName
  );
  
  // Start with a new context object with all required EnhancedContext properties
  const newContext: EnhancedContext = {
    name: contextName,
    confidence: 0.8, // Moderately high confidence for rule-based decisions
    entities: enhancedCurrentEntities,
    recentIntents: currentIntent ? [currentIntent] : [],
    topics: deriveTopicsFromIntentAndEntities(currentIntent, enhancedCurrentEntities),
    timestamp: Date.now(),
    messageCount: conversationHistory.length,
    isLongConversation: conversationHistory.length > 5,
    hasContextBreak: false,
    contextBreakType: undefined,
    intentTransition: previousContext ? 
      `${previousContext.name}->${contextName}` : 'initial',
    sentiment: 'neutral',
    urgency: 'normal',
    contextComplexity: 'low',
    persistentInfo: {},
    sentimentInfo: {}
  };
  
  // If we have a previous context, we can take some values from it
  if (previousContext) {
    // Merge topics to maintain continuity
    if (previousContext.topics) {
      newContext.topics = [
        ...newContext.topics,
        ...previousContext.topics.filter(topic => !newContext.topics.includes(topic))
      ];
    }
    
    // Copy persistent info
    if (previousContext.persistentInfo) {
      newContext.persistentInfo = { ...(previousContext.persistentInfo || {}) };
    }
  }
  
  return newContext;
}

/**
 * Determines the context type using rule-based heuristics
 */
function determineContextTypeWithRules(
  conversationHistory: string[],
  currentIntent: Intent | null,
  isFirstMessage: boolean,
  previousContextType?: string
): string {
  if (isFirstMessage) {
    return 'initial';
  }
  
  // Get the latest message for analysis
  const latestMessage = conversationHistory.length > 0 ? conversationHistory[conversationHistory.length - 1] || '' : '';
  const latestMessageLower = latestMessage.toLowerCase();
  
  // If we have an intent, use it to help determine context type
  if (currentIntent) {
    // Check intent types
    if (currentIntent.type === 'smalltalk') {
      if (currentIntent.name === 'greeting') return 'greeting';
      if (currentIntent.name === 'farewell') return 'closing';
      if (currentIntent.name === 'thanks') return 'acknowledgment';
    }
    
    // Check for question patterns in the intent name or the latest message
    if (currentIntent.type === 'faq' || 
        currentIntent.name?.includes('question') || 
        latestMessage.includes('?')) {
      return 'question';
    }
    
    // If the intent is function-related, it's often a request
    if (currentIntent.type === 'function') {
      return 'request';
    }
  }
  
  // Check for question marks in the latest message
  if (latestMessage.includes('?')) {
    return 'question';
  }
  
  // Check for indicators of topic change
  if (latestMessageLower.includes('anderes thema') || 
      latestMessageLower.includes('different topic') ||
      latestMessageLower.includes('übrigens') ||
      latestMessageLower.includes('by the way')) {
    return 'topic_change';
  }
  
  // Check for clarification patterns
  if (latestMessageLower.includes('verstehe nicht') ||
      latestMessageLower.includes("don't understand") ||
      latestMessageLower.includes('was meinst du') ||
      latestMessageLower.includes('what do you mean')) {
    return 'clarification';
  }
  
  // If there's a previous context type and it's significant, often it carries over
  if (previousContextType) {
    if (['question', 'clarification', 'request'].includes(previousContextType)) {
      return 'followup';
    }
  }
  
  // Default to followup if no specific type is determined
  return 'followup';
}

/**
 * Creates a context object from a model prediction
 */
function createContextFromModelPrediction(
  prediction: any,
  currentIntent: Intent | null,
  previousContext?: EnhancedContext
): EnhancedContext {
  // Extract the context type from the prediction
  const contextName = prediction.context || 'unknown';
  const confidence = prediction.confidence || 0.5;
  
  // Create a new context object with all required EnhancedContext properties
  const newContext: EnhancedContext = {
    name: contextName,
    confidence: confidence,
    entities: [], // Will be filled later
    recentIntents: currentIntent ? [currentIntent] : [],
    topics: [], // Will be filled later
    timestamp: Date.now(),
    messageCount: 0,
    isLongConversation: false,
    hasContextBreak: false,
    contextBreakType: undefined,
    intentTransition: previousContext ? 
      `${previousContext.name}->${contextName}` : 'initial',
    sentiment: 'neutral',
    urgency: 'normal',
    contextComplexity: 'low',
    persistentInfo: {},
    sentimentInfo: {}
  };
  
  // If we have a previous context, carry over relevant information
  if (previousContext) {
    // Copy persistent info
    if (previousContext.persistentInfo) {
      newContext.persistentInfo = { ...(previousContext.persistentInfo || {}) };
    }
    
    // Copy message count
    newContext.messageCount = (previousContext.messageCount || 0) + 1;
    
    // Determine if it's a long conversation based on message count
    newContext.isLongConversation = newContext.messageCount > 5;
  }
  
  return newContext;
}

/**
 * Extracts previous entities from the previous context
 * This now correctly retrieves entities from the stored context
 */
function extractPreviousEntities(
  previousContext?: EnhancedContext,
  currentIntent?: Intent | null
): Entity[] {
  if (!previousContext) return [];
  
  // Extract entities from the previous context
  const previousEntities = previousContext.entities || [];
  
  // Convert to regular Entity objects if they're not already
  return previousEntities
    .map(entity => {
      if (!entity) return null;
      
      // If the entity already has an isNew property, it's an EnhancedEntity
      if ('isNew' in entity) {
        // Cast to EnhancedEntity to access the properties
        const enhancedEntity = entity as EnhancedEntity;
        
        // Keep only persistent entities or those relevant to the current intent
        if (enhancedEntity.isPersistent || isEntityRelevantToIntent(enhancedEntity, currentIntent)) {
          return entity;
        }
        return null;
      }
      
      // Regular Entity without enhancement
      return entity;
    })
    .filter((entity): entity is NonNullable<typeof entity> => entity !== null);
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
 * Enhances entities with context-specific information
 */
function enhanceEntitiesWithContext(
  currentEntities: Entity[],
  previousEntities: Entity[],
  contextType: string
): EnhancedEntity[] {
  // Start with current entities, mark them as new
  const enhancedCurrent: EnhancedEntity[] = currentEntities.map(entity => ({
    ...entity,
    isNew: true,
    fromPreviousContext: false,
    timestamp: Date.now()
  }));
  
  // Process previous entities, marking them as from context
  const enhancedPrevious: EnhancedEntity[] = previousEntities
    .filter(entity => entity !== null && entity !== undefined)
    .map(entity => {
      // Check if this is already an EnhancedEntity
      if ('isNew' in entity) {
        const enhancedEntity = entity as EnhancedEntity;
        return {
          ...enhancedEntity,
          isNew: false,
          fromPreviousContext: true,
          // Keep isPersistent if it was already set
          isPersistent: enhancedEntity.isPersistent || shouldEntityPersist(enhancedEntity),
          // Update timestamp if needed
          timestamp: enhancedEntity.timestamp || Date.now() - 10000
        };
      }
      
      // Regular Entity from previous context
      return {
        ...entity,
        isNew: false,
        fromPreviousContext: true,
        isPersistent: shouldEntityPersist(entity),
        timestamp: Date.now() - 10000 // Estimate a previous timestamp
      };
    });
  
  // Combine current and previous entities, but filter for duplicates
  const combinedEntities = [
    ...enhancedCurrent,
    ...enhancedPrevious.filter(prevEntity => 
      !enhancedCurrent.some(currEntity => 
        currEntity.type === prevEntity.type && currEntity.value === prevEntity.value
      )
    )
  ];
  
  // Apply any context-specific transformations
  return applyContextSpecificTransformations(combinedEntities, contextType);
}

/**
 * Determines if an entity should persist across conversation turns
 */
function shouldEntityPersist(entity: Entity): boolean {
  // Some entity types are naturally persistent (like user information, locations, etc.)
  const persistentTypes = ['user', 'location', 'product', 'service', 'feature', 'category'];
  
  if (persistentTypes.includes(entity.type)) {
    return true;
  }
  
  // Entities with high confidence are more likely to be important
  if (entity.confidence && entity.confidence > 0.8) {
    return true;
  }
  
  // Default to non-persistent
  return false;
}

/**
 * Applies context-specific transformations to entities
 */
function applyContextSpecificTransformations(
  entities: EnhancedEntity[],
  contextType: string
): EnhancedEntity[] {
  switch (contextType) {
    case 'question':
      // For questions, prioritize entities that could be the subject
      return entities.map(entity => ({
        ...entity,
        confidence: entity.isNew ? Math.min((entity.confidence || 0.5) * 1.2, 1.0) : (entity.confidence || 0.5)
      }));
    
    case 'clarification':
      // For clarifications, all entities are potentially important
      return entities.map(entity => ({
        ...entity,
        confidence: Math.min((entity.confidence || 0.5) * 1.1, 1.0)
      }));
    
    case 'topic_change':
      // For topic changes, new entities are more relevant than previous ones
      return entities.map(entity => ({
        ...entity,
        confidence: entity.isNew 
          ? Math.min((entity.confidence || 0.5) * 1.3, 1.0) 
          : (entity.confidence || 0.5) * 0.8
      }));
    
    default:
      // No transformation for other context types
      return entities;
  }
}

/**
 * Extracts recent intents from previous context and current intent
 */
function getRecentIntents(
  previousContext?: EnhancedContext,
  currentIntent: Intent | null = null
): Intent[] {
  const recentIntents: Intent[] = [];
  
  // Add the current intent if available
  if (currentIntent) {
    recentIntents.push(currentIntent);
  }
  
  // Add intents from the previous context
  if (previousContext && previousContext.recentIntents) {
    // Only add intents that aren't duplicates of the current intent
    for (const prevIntent of previousContext.recentIntents) {
      if (prevIntent && (!currentIntent || prevIntent.name !== currentIntent.name)) {
        recentIntents.push(prevIntent);
      }
    }
  }
  
  // Limit to the most recent N intents (e.g., 3)
  return recentIntents.slice(0, 3);
}

/**
 * Derives topics from the current intent and entities
 */
function deriveTopicsFromIntentAndEntities(
  currentIntent: Intent | null,
  entities: EnhancedEntity[]
): string[] {
  const topics: string[] = [];
  
  // Extract topic from intent if available
  if (currentIntent) {
    const intentName = currentIntent.name || '';
    
    // Extract topic from FAQ intents (format: faq_topic_subtopic)
    if (intentName.startsWith('faq_')) {
      const topicParts = intentName.split('_');
      if (topicParts.length > 1 && topicParts[1]) {
        topics.push(topicParts[1]); // Add the main topic
      }
    }
    
    // Extract topic from function intents (format: function_action)
    if (intentName.startsWith('function_')) {
      const topicParts = intentName.split('_');
      if (topicParts.length > 1 && topicParts[1]) {
        topics.push(topicParts[1]); // Add the action as a topic
      }
    }
  }
  
  // Extract topics from relevant entity types
  const topicEntityTypes = ['topic', 'category', 'product', 'service', 'feature'];
  
  for (const entity of entities) {
    if (entity && topicEntityTypes.includes(entity.type)) {
      topics.push(entity.value);
    }
  }
  
  // Remove duplicates
  return [...new Set(topics)];
}

/**
 * Determines if enhanced context information is required
 */
function isEnhancedContextRequired(
  context: Context,
  currentIntent: Intent | null
): boolean {
  // Always provide enhanced context for FAQ and function intents
  if (currentIntent && ['faq', 'function'].includes(currentIntent.type || '')) {
    return true;
  }
  
  // Provide enhanced context for specific context types
  if (['question', 'clarification', 'topic_change'].includes(context.name)) {
    return true;
  }
  
  // Default to false for simpler contexts
  return false;
}

/**
 * Enhances a basic context with additional information
 */
function enhanceContextWithAdditionalInfo(
  baseContext: EnhancedContext,
  conversationHistory: string[],
  currentIntent: Intent | null,
  entities: EnhancedEntity[],
  previousEnhancedContext?: EnhancedContext
): EnhancedContext {
  // Create an enhanced context object with additional useful information
  const enhancedContext: EnhancedContext = {
    ...baseContext,
    timestamp: Date.now(),
    messageCount: conversationHistory.length,
    isLongConversation: conversationHistory.length > 5,
    
    // Analyze context based on conversation patterns
    hasContextBreak: detectContextBreak(conversationHistory),
    contextBreakType: detectContextBreak(conversationHistory) 
      ? detectContextBreakType(conversationHistory, currentIntent) 
      : undefined,
    
    // Track intent transitions
    intentTransition: determineIntentTransition(previousEnhancedContext, currentIntent),
    
    // Analyze message sentiment
    sentiment: conversationHistory.length > 0 
      ? detectSentiment(conversationHistory[conversationHistory.length - 1] || '') 
      : 'neutral',
    urgency: 'normal',
    
    // Assess context complexity
    contextComplexity: assessContextComplexity(baseContext, entities, conversationHistory.length),
    
    // Initialize sentiment info
    sentimentInfo: {}
  };
  
  // Carry over persistent information from previous context
  if (previousEnhancedContext?.persistentInfo) {
    enhancedContext.persistentInfo = { ...(previousEnhancedContext.persistentInfo || {}) };
  } else {
    enhancedContext.persistentInfo = {};
  }
  
  return enhancedContext;
}

/**
 * Detects if there's a break in the conversation context
 */
function detectContextBreak(conversationHistory: string[]): boolean {
  if (conversationHistory.length < 2) {
    return false;
  }
  
  const latestMessage = (conversationHistory.length > 0 
    ? conversationHistory[conversationHistory.length - 1] || '' 
    : '').toLowerCase();
  
  // Check for phrases indicating topic changes
  const topicChangeIndicators = [
    'übrigens', 'by the way', 'anderes thema', 'different topic',
    'changing subject', 'apropos', 'speaking of', 'something else',
    'ich habe eine andere frage', 'i have another question'
  ];
  
  return topicChangeIndicators.some(indicator => latestMessage.includes(indicator));
}

/**
 * Identifies the type of context break, if any
 */
function detectContextBreakType(
  conversationHistory: string[],
  currentIntent: Intent | null
): string {
  const latestMessage = (conversationHistory.length > 0 
    ? conversationHistory[conversationHistory.length - 1] || '' 
    : '').toLowerCase();
  
  // Check for specific break types
  if (latestMessage.includes('übrigens') || latestMessage.includes('by the way')) {
    return 'digression';
  }
  
  if (latestMessage.includes('anderes thema') || latestMessage.includes('different topic')) {
    return 'topic_change';
  }
  
  if (currentIntent && currentIntent.type !== 'smalltalk') {
    return 'intent_change';
  }
  
  return 'general_break';
}

/**
 * Determines the transition between previous and current intents
 * Now uses the previous context for accurate transition detection
 */
function determineIntentTransition(
  previousContext?: EnhancedContext,
  currentIntent: Intent | null = null
): string {
  if (!currentIntent) {
    return 'unknown';
  }
  
  // Simple distinction between initial and followup
  if (!previousContext) {
    return 'initial';
  }
  
  // Get the most recent previous intent
  const previousIntent = previousContext.recentIntents && previousContext.recentIntents.length > 0
    ? previousContext.recentIntents[0]
    : null;
  
  if (!previousIntent) {
    return 'initial';
  }
  
  // Compare current and previous intents
  if (currentIntent.name === previousIntent.name) {
    return 'continue'; // Same intent
  }
  
  if (currentIntent.type === previousIntent.type) {
    return 'same_type'; // Different intent but same type
  }
  
  if (currentIntent.type === 'smalltalk' && previousIntent.type !== 'smalltalk') {
    return 'to_smalltalk';
  }
  
  if (currentIntent.type === 'faq' && previousIntent.type !== 'faq') {
    return 'to_faq';
  }
  
  if (currentIntent.type === 'function' && previousIntent.type !== 'function') {
    return 'to_function';
  }
  
  return 'change'; // Generic change
}

/**
 * Performs basic sentiment analysis on a message
 */
function detectSentiment(message: string): string {
  const text = message.toLowerCase();
  
  // Simple keyword-based sentiment detection
  const positiveWords = ['gut', 'toll', 'super', 'freue', 'danke', 'perfekt', 'ausgezeichnet'];
  const negativeWords = ['schlecht', 'nicht', 'problem', 'fehler', 'falsch', 'leider', 'schade'];
  
  let positiveCount = 0;
  let negativeCount = 0;
  
  // Count sentiment indicators
  for (const word of positiveWords) {
    if (text.includes(word)) positiveCount++;
  }
  
  for (const word of negativeWords) {
    if (text.includes(word)) negativeCount++;
  }
  
  // Determine sentiment based on counts
  if (positiveCount > negativeCount) {
    return 'positive';
  } else if (negativeCount > positiveCount) {
    return 'negative';
  } else {
    return 'neutral';
  }
}

/**
 * Assesses the complexity of the current context
 */
function assessContextComplexity(
  context: Context,
  entities: EnhancedEntity[],
  messageCount: number
): 'low' | 'medium' | 'high' {
  // Count factors that contribute to complexity
  let complexityScore = 0;
  
  // More entities = more complex
  if (entities.length > 3) complexityScore++;
  if (entities.length > 6) complexityScore++;
  
  // More topics = more complex
  if (context.topics && context.topics.length > 1) complexityScore++;
  if (context.topics && context.topics.length > 3) complexityScore++;
  
  // Longer conversation = more complex
  if (messageCount > 5) complexityScore++;
  if (messageCount > 10) complexityScore++;
  
  // Specific context types are more complex
  if (['clarification', 'topic_change', 'error'].includes(context.name)) {
    complexityScore++;
  }
  
  // Determine complexity level based on score
  if (complexityScore >= 3) {
    return 'high';
  } else if (complexityScore >= 1) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Checks if a topic change has occurred between contexts
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
  if (contextName === 'followup') {
    contextInfo.isFollowUp = true;
  }
  
  return contextInfo;
}

// Export utility functions for testing if needed
export const __testing = {
  generateConversationId,
  isPreviousContextRelated,
  extractPreviousEntities,
  enhanceEntitiesWithContext,
  hasTopicChanged,
  extractRelevantContextForResponse
};