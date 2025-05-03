/**
 * features/dialog/conversationPlanner.ts
 * 
 * Responsible for planning the conversation flow, managing dialog strategies,
 * and deciding on the next best action based on the current conversation state.
 */

import type { 
  Intent, 
  Entity, 
  Context, 
  EnhancedContext 
} from '@/types/nlp.types';
import { contextualMemory } from './contextualMemory';
import type { ConversationState, MemoryEntry } from './contextualMemory';
// Fix: Import stateManager as default import
import stateManager from './stateManager';
import { config } from '@/features/nlp-engine/config';
// Fix: Create mock for FollowUpGenerator since module can't be found
// In a real app, ensure this file exists or modify your import structure

// Fix: Create interface for DialogState to use in place of imported DialogState
export interface DialogState {
  activeFlows: Array<{
    flowId: string;
    currentStepId: string;
    metadata?: Record<string, any>;
  }>;
}

// Fix: Create a followUpGenerator singleton that replaces FollowUpGenerator
const followUpGenerator = {
  generateFollowUp: (
    intent: Intent | null,
    context: Context,
    state: ConversationState
  ): string | null => {
    try {
      // For example, implement a simple version that works with the existing FollowUpGenerator
      return null; // Simplified - your implementation may vary
    } catch (error) {
      console.error(`[followUpGenerator] Error generating follow-up:`, error);
      return null;
    }
  }
};

// Dialog action types
export enum ActionType {
  RESPOND = 'respond',         // Simple response
  ASK_QUESTION = 'ask',        // Ask a question
  SUGGEST = 'suggest',         // Make a suggestion
  CONFIRM = 'confirm',         // Ask for confirmation
  CLARIFY = 'clarify',         // Ask for clarification
  FALLBACK = 'fallback',       // Use fallback response
  HANDOFF = 'handoff',         // Hand off to human
  SWITCH_TOPIC = 'switch',     // Switch to a different topic
  EXECUTE_FUNCTION = 'execute', // Execute a function/action
  CONTINUE_FLOW = 'continue'   // Continue current flow
}

// Action priority levels
export enum PriorityLevel {
  CRITICAL = 0,   // Must be handled immediately (e.g., error cases)
  HIGH = 1,       // High priority (e.g., direct questions)
  MEDIUM = 2,     // Medium priority (e.g., follow-ups)
  LOW = 3,        // Low priority (e.g., suggestions)
  FALLBACK = 4    // Fallback options
}

// Dialog action structure
export interface DialogAction {
  type: ActionType;               // The type of action
  priority: PriorityLevel;        // Action priority
  content?: string;               // Content or message template
  responseKey?: string;           // Key to retrieve response from template
  params?: Record<string, any>;   // Parameters for the action
  intentTarget?: string;          // Target intent for the action
  entities?: Entity[];            // Relevant entities for the action
  conditions?: ActionCondition[]; // Conditions for the action
  nextActions?: DialogAction[];   // Follow-up actions
  metadata?: Record<string, any>; // Additional metadata
}

// Dialog plan structure
export interface DialogPlan {
  primaryAction: DialogAction;        // The main action to take
  alternativeActions: DialogAction[]; // Alternative actions if primary fails
  contextInfo: {                      // Contextual information
    currentContext: string;
    previousContext: string;
    relevantEntities: Entity[];
    activeWorkflows: string[];
    confidence: number;
  };
  isResponseRequired: boolean;      // Whether a response is required
  isHandlingIntent: boolean;        // Whether we're handling a specific intent
  intentBeingHandled?: string;      // The intent being handled
  expectedNextIntents?: string[];   // Intents expected in the next turn
  metadata: Record<string, any>;    // Additional metadata
}

// Dialog flow definition
export interface DialogFlow {
  id: string;                      // Unique ID for the flow
  name: string;                    // Human-readable name
  description?: string;            // Description of the flow
  triggers: {                      // What triggers this flow
    intents?: string[];            // Intent triggers
    entities?: string[];           // Entity triggers
    contexts?: string[];           // Context triggers
    conditions?: ActionCondition[]; // Other conditions
  };
  steps: DialogStep[];             // Steps in the flow
  interruptible: boolean;          // Whether the flow can be interrupted
  priority: PriorityLevel;         // Flow priority
  allowRetry: boolean;             // Whether to allow retries
  maxRetries?: number;             // Maximum number of retries
  metadata?: Record<string, any>;  // Additional metadata
}

// Dialog step definition
export interface DialogStep {
  id: string;                      // Unique ID for the step
  action: DialogAction;            // Action to take at this step
  next?: string | {                // Next step ID or conditional paths
    default?: string;
    conditions: Array<{
      condition: ActionCondition;
      stepId: string;
    }>;
  };
  onError?: string;                // Step to go to on error
  metadata?: Record<string, any>;  // Additional metadata
}

// Action condition definition
export interface ActionCondition {
  type: 'entity_present' | 'entity_value' | 'intent_match' | 'context_match' | 
        'flag_value' | 'sentiment' | 'turn_count' | 'custom';
  entityType?: string;             // For entity conditions
  entityValue?: string;            // For entity value conditions
  intentName?: string;             // For intent conditions
  contextName?: string;            // For context conditions
  flagName?: string;               // For flag conditions
  flagValue?: any;                 // For flag value conditions
  sentimentValue?: string;         // For sentiment conditions
  turnCount?: number;              // For turn count conditions
  operator?: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  customCheck?: (state: ConversationState) => boolean; // For custom conditions
  value?: any;                     // Value to check against
}

// Response strategy definition
export interface ResponseStrategy {
  id: string;                      // Strategy identifier
  name: string;                    // Strategy name
  description?: string;            // Strategy description
  applicableContexts: string[];    // Contexts where this applies
  intentsHandled: string[];        // Intents this handles
  priority: PriorityLevel;         // Strategy priority
  selectAction: (                  // Function to select an action
    intent: Intent | null,
    context: Context,
    state: ConversationState,
    dialogState: DialogState
  ) => DialogAction;
  generateFallback?: (             // Function to generate fallback
    context: Context,
    state: ConversationState
  ) => DialogAction;
}

// Planning configuration
export interface PlanningOptions {
  enabledStrategies: string[];      // Strategies to use
  enableContextualFallbacks: boolean; // Whether to use contextual fallbacks
  enableFlowInterruption: boolean;  // Whether to allow flow interruption
  prioritizeExistingFlows: boolean; // Whether to prioritize existing flows
  maxAlternatives: number;          // Maximum number of alternative actions
  confidenceThreshold: number;      // Confidence threshold for intents
  enableFollowUpQuestions: boolean; // Whether to generate follow-up questions
  logPlanningDecisions: boolean;    // Whether to log planning decisions
  fallbackThreshold: number;        // Number of fallbacks before escalation
}

// Default planning configuration
const DEFAULT_PLANNING_OPTIONS: PlanningOptions = {
  enabledStrategies: ['standard', 'contextual', 'intent_driven', 'faq'],
  enableContextualFallbacks: true,
  enableFlowInterruption: true,
  prioritizeExistingFlows: true,
  maxAlternatives: 3,
  confidenceThreshold: 0.6,
  enableFollowUpQuestions: true,
  logPlanningDecisions: true,
  fallbackThreshold: 3
};

/**
 * Conversation planner class responsible for dialog management
 */
export class ConversationPlanner {
  private dialogFlows: Map<string, DialogFlow>;
  private responseStrategies: Map<string, ResponseStrategy>;
  private options: PlanningOptions;
  private fallbackResponses: Record<string, string[]>;
  
  /**
   * Creates a new conversation planner
   * 
   * @param options Planning configuration options
   */
  constructor(options: Partial<PlanningOptions> = {}) {
    this.options = { ...DEFAULT_PLANNING_OPTIONS, ...options };
    this.dialogFlows = new Map<string, DialogFlow>();
    this.responseStrategies = new Map<string, ResponseStrategy>();
    
    // Initialize fallback responses from config
    this.fallbackResponses = this.loadFallbackResponses();
    
    // Register built-in response strategies
    this.registerBuiltInStrategies();
    
    // Load dialog flows from configuration
    this.loadDialogFlows();
    
    console.log(`[conversationPlanner] Initialized with ${this.dialogFlows.size} flows and ${this.responseStrategies.size} strategies`);
  }
  
  /**
   * Plans the next dialog action based on the current conversation state
   * 
   * @param sessionId The conversation session ID
   * @param nlpResult The NLP result for the current turn
   * @returns A dialog plan with the next action
   */
  public planNextAction(
    sessionId: string,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    }
  ): DialogPlan {
    try {
      const startTime = Date.now();
      
      // Get the current conversation state
      const conversationState = contextualMemory.getRelevantContext(sessionId);
      const state = contextualMemory.initializeConversation(sessionId);
      
      // Get the current dialog state
      // Fix: Use our defined DialogState interface 
      const dialogState = stateManager.getDialogState(sessionId) as DialogState;
      
      // Log planning start if enabled
      if (this.options.logPlanningDecisions) {
        console.log(`[conversationPlanner] Planning action for session ${sessionId}`);
        console.log(`[conversationPlanner] Intent: ${nlpResult.intent?.name || 'none'} (${nlpResult.intent?.confidence || 0})`);
        console.log(`[conversationPlanner] Context: ${nlpResult.context.name}`);
        // Fix: Add proper type for f parameter
        console.log(`[conversationPlanner] Active flows: ${dialogState.activeFlows.map((f: { flowId: string }) => f.flowId).join(', ') || 'none'}`);
      }
      
      // Check for active flows first
      if (this.options.prioritizeExistingFlows && dialogState.activeFlows.length > 0) {
        const flowPlan = this.continueActiveFlow(dialogState, nlpResult, state);
        
        // If we have a plan from an active flow, use it
        if (flowPlan) {
          this.logPlanningResult(flowPlan, startTime);
          return flowPlan;
        }
      }
      
      // Check for new flow triggers
      const triggeredFlow = this.checkFlowTriggers(nlpResult, state, dialogState);
      
      if (triggeredFlow) {
        // Start a new flow
        const flowPlan = this.startNewFlow(triggeredFlow, nlpResult, state, dialogState);
        this.logPlanningResult(flowPlan, startTime);
        return flowPlan;
      }
      
      // If no flow is applicable, use response strategies
      const plan = this.applyResponseStrategies(nlpResult, state, dialogState);
      
      // Add follow-up question if enabled
      if (this.options.enableFollowUpQuestions && 
          plan.primaryAction.type === ActionType.RESPOND) {
        const followUp = this.generateFollowUpQuestion(nlpResult, state);
        
        if (followUp) {
          plan.primaryAction.content = `${plan.primaryAction.content || ''} ${followUp}`;
        }
      }
      
      this.logPlanningResult(plan, startTime);
      return plan;
    } catch (error) {
      console.error(`[conversationPlanner] Error planning next action:`, error);
      
      // Return a fallback plan in case of error
      return this.createFallbackPlan('error', nlpResult.context);
    }
  }
  
  /**
   * Registers a new dialog flow
   * 
   * @param flow The dialog flow to register
   * @returns Whether the flow was registered successfully
   */
  public registerDialogFlow(flow: DialogFlow): boolean {
    try {
      // Validate flow first
      if (!flow.id || !flow.steps || flow.steps.length === 0) {
        console.error(`[conversationPlanner] Invalid flow definition: ${flow.id}`);
        return false;
      }
      
      // Add to flows map
      this.dialogFlows.set(flow.id, flow);
      
      console.log(`[conversationPlanner] Registered dialog flow: ${flow.id} with ${flow.steps.length} steps`);
      return true;
    } catch (error) {
      console.error(`[conversationPlanner] Error registering dialog flow:`, error);
      return false;
    }
  }
  
  /**
   * Registers a new response strategy
   * 
   * @param strategy The response strategy to register
   * @returns Whether the strategy was registered successfully
   */
  public registerResponseStrategy(strategy: ResponseStrategy): boolean {
    try {
      // Validate strategy first
      if (!strategy.id || !strategy.selectAction) {
        console.error(`[conversationPlanner] Invalid strategy definition: ${strategy.id}`);
        return false;
      }
      
      // Add to strategies map
      this.responseStrategies.set(strategy.id, strategy);
      
      console.log(`[conversationPlanner] Registered response strategy: ${strategy.id}`);
      return true;
    } catch (error) {
      console.error(`[conversationPlanner] Error registering response strategy:`, error);
      return false;
    }
  }
  
  /**
   * Gets a dialog flow by ID
   * 
   * @param flowId The ID of the flow to get
   * @returns The dialog flow or undefined if not found
   */
  public getDialogFlow(flowId: string): DialogFlow | undefined {
    return this.dialogFlows.get(flowId);
  }
  
  /**
   * Gets a response strategy by ID
   * 
   * @param strategyId The ID of the strategy to get
   * @returns The response strategy or undefined if not found
   */
  public getResponseStrategy(strategyId: string): ResponseStrategy | undefined {
    return this.responseStrategies.get(strategyId);
  }
  
  /**
   * Lists all registered dialog flows
   * 
   * @returns Array of dialog flow information
   */
  public listDialogFlows(): Array<{id: string; name: string; description?: string}> {
    return Array.from(this.dialogFlows.values()).map(flow => ({
      id: flow.id,
      name: flow.name,
      description: flow.description
    }));
  }
  
  /**
   * Lists all registered response strategies
   * 
   * @returns Array of response strategy information
   */
  public listResponseStrategies(): Array<{id: string; name: string; description?: string}> {
    return Array.from(this.responseStrategies.values()).map(strategy => ({
      id: strategy.id,
      name: strategy.name,
      description: strategy.description
    }));
  }
  
  /**
   * Adds a fallback response for a specific context
   * 
   * @param context The context for the fallback
   * @param response The fallback response to add
   */
  public addFallbackResponse(context: string, response: string): void {
    if (!this.fallbackResponses[context]) {
      this.fallbackResponses[context] = [];
    }
    
    this.fallbackResponses[context].push(response);
  }
  
  /**
   * Processes an action to get the final content
   * 
   * @param action The action to process
   * @param nlpResult The NLP result
   * @param state The conversation state
   * @returns The processed action with resolved content
   */
  public processAction(
    action: DialogAction,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState
  ): DialogAction {
    try {
      // Create a copy of the action to avoid modifying the original
      const processedAction: DialogAction = { ...action };
      
      // If action has explicit content, use it
      if (processedAction.content) {
        // Replace placeholders in the content
        processedAction.content = this.replaceContentPlaceholders(
          processedAction.content,
          nlpResult,
          state,
          processedAction.params || {}
        );
        
        return processedAction;
      }
      
      // If action has a responseKey, get the template from a response dictionary
      if (processedAction.responseKey) {
        // In a real implementation, this would use a template system or response database
        // For now, we'll use a simple fallback to a hardcoded response
        processedAction.content = `Response for ${processedAction.responseKey}`;
        
        // Replace placeholders
        processedAction.content = this.replaceContentPlaceholders(
          processedAction.content,
          nlpResult,
          state,
          processedAction.params || {}
        );
        
        return processedAction;
      }
      
      // If we get here, we need a fallback
      processedAction.content = this.getFallbackResponse(nlpResult.context.name);
      
      return processedAction;
    } catch (error) {
      console.error(`[conversationPlanner] Error processing action:`, error);
      
      // Return the original action if processing fails
      return action;
    }
  }
  
  /**
   * Continues an active dialog flow
   * 
   * @param dialogState The current dialog state
   * @param nlpResult The NLP result for the current turn
   * @param state The conversation state
   * @returns A dialog plan or null if the flow can't be continued
   */
  private continueActiveFlow(
    dialogState: DialogState,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState
  ): DialogPlan | null {
    // If no active flows, return null
    if (dialogState.activeFlows.length === 0) {
      return null;
    }
    
    // Get the most recently activated flow
    const activeFlow = dialogState.activeFlows[dialogState.activeFlows.length - 1];
    
    // Check if activeFlow exists
    if (!activeFlow) {
      return null;
    }
    
    // Get the flow definition
    const flowDefinition = this.dialogFlows.get(activeFlow.flowId);
    
    if (!flowDefinition) {
      console.warn(`[conversationPlanner] Active flow not found: ${activeFlow.flowId}`);
      return null;
    }
    
    // Check if the flow is interruptible and if an interruption is happening
    if (flowDefinition.interruptible && 
        nlpResult.intent && 
        this.isFlowInterruption(nlpResult.intent, activeFlow.currentStepId, flowDefinition)) {
      
      console.log(`[conversationPlanner] Flow ${activeFlow.flowId} interrupted by intent ${nlpResult.intent.name}`);
      
      // Remove the flow from active flows
      stateManager.endFlow(state.sessionId, activeFlow.flowId);
      
      // Don't return a plan, fall through to other planning methods
      return null;
    }
    
    // Get the current step
    const currentStep = flowDefinition.steps.find(step => step.id === activeFlow.currentStepId);
    
    if (!currentStep) {
      console.warn(`[conversationPlanner] Current step not found: ${activeFlow.currentStepId}`);
      return null;
    }
    
    // Process the current step action
    const action = this.processAction(currentStep.action, nlpResult, state);
    
    // Determine the next step
    let nextStepId: string | undefined;
    
    if (typeof currentStep.next === 'string') {
      // Simple next step reference
      nextStepId = currentStep.next;
    } else if (currentStep.next) {
      // Conditional next step
      if (currentStep.next.conditions) {
        // Check each condition
        for (const conditionPath of currentStep.next.conditions) {
          if (this.evaluateCondition(conditionPath.condition, state, nlpResult)) {
            nextStepId = conditionPath.stepId;
            break;
          }
        }
      }
      
      // If no condition matched, use default
      if (!nextStepId && currentStep.next.default) {
        nextStepId = currentStep.next.default;
      }
    }
    
    // If we have a next step, prepare to advance the flow
    if (nextStepId) {
      // Find the next step
      const nextStep = flowDefinition.steps.find(step => step.id === nextStepId);
      
      if (nextStep) {
        // Update the current step in the dialog state
        stateManager.updateFlowStep(state.sessionId, activeFlow.flowId, nextStepId);
      } else {
        console.warn(`[conversationPlanner] Next step not found: ${nextStepId}`);
        
        // End the flow since the next step doesn't exist
        stateManager.endFlow(state.sessionId, activeFlow.flowId);
      }
    } else {
      // No next step, end the flow
      stateManager.endFlow(state.sessionId, activeFlow.flowId);
    }
    
    // Create a dialog plan
    const plan: DialogPlan = {
      primaryAction: action,
      alternativeActions: [],
      contextInfo: {
        currentContext: nlpResult.context.name,
        previousContext: activeFlow.metadata?.previousContext || 'unknown',
        relevantEntities: nlpResult.entities,
        activeWorkflows: [activeFlow.flowId],
        confidence: nlpResult.intent?.confidence || 0.5
      },
      isResponseRequired: true,
      isHandlingIntent: !!nlpResult.intent,
      intentBeingHandled: nlpResult.intent?.name,
      expectedNextIntents: [],
      metadata: {
        flowId: activeFlow.flowId,
        currentStepId: activeFlow.currentStepId,
        nextStepId,
        isLastStep: !nextStepId
      }
    };
    
    return plan;
  }
  
  /**
   * Checks if an intent should interrupt a flow
   * 
   * @param intent The intent to check
   * @param currentStepId The current step ID
   * @param flow The flow definition
   * @returns Whether the intent should interrupt the flow
   */
  private isFlowInterruption(
    intent: Intent,
    currentStepId: string,
    flow: DialogFlow
  ): boolean {
    // Certain intents always interrupt flows
    const globalInterrupts = [
      'cancel', 'stop', 'help', 'restart', 'logout', 'speak_to_human'
    ];
    
    if (globalInterrupts.includes(intent.name)) {
      return true;
    }
    
    // Check if the intent is a high confidence intent not related to the flow
    if (intent.confidence > 0.8 && 
        flow.triggers.intents && 
        !flow.triggers.intents.includes(intent.name)) {
      return true;
    }
    
    // In a real implementation, you might have more complex rules
    
    return false;
  }
  
  /**
   * Checks if any dialog flows should be triggered
   * 
   * @param nlpResult The NLP result for the current turn
   * @param state The conversation state
   * @param dialogState The current dialog state
   * @returns The triggered flow or null if no flow should be triggered
   */
  private checkFlowTriggers(
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState,
    dialogState: DialogState
  ): DialogFlow | null {
    // Skip if no intent (can't trigger without an intent)
    if (!nlpResult.intent) {
      return null;
    }
    
    // Find all flows that might be triggered by this intent
    const potentialFlows: Array<{flow: DialogFlow; score: number}> = [];
    
    for (const flow of this.dialogFlows.values()) {
      let score = 0;
      
      // Check intent triggers
      if (flow.triggers.intents && 
          flow.triggers.intents.includes(nlpResult.intent.name)) {
        score += 2 * nlpResult.intent.confidence;
      }
      
      // Check entity triggers
      if (flow.triggers.entities) {
        for (const entityType of flow.triggers.entities) {
          const matchingEntity = nlpResult.entities.find(e => e.type === entityType);
          
          if (matchingEntity) {
            score += 1 * (matchingEntity.confidence || 0.5);
          }
        }
      }
      
      // Check context triggers
      if (flow.triggers.contexts && 
          flow.triggers.contexts.includes(nlpResult.context.name)) {
        score += 1;
      }
      
      // Check other conditions
      if (flow.triggers.conditions) {
        for (const condition of flow.triggers.conditions) {
          if (this.evaluateCondition(condition, state, nlpResult)) {
            score += 1;
          }
        }
      }
      
      // If score is positive, add to potential flows
      if (score > 0) {
        potentialFlows.push({ flow, score });
      }
    }
    
    // Sort flows by score (highest first)
    potentialFlows.sort((a, b) => b.score - a.score);
    
    // Return the highest scoring flow, if any
    if (potentialFlows.length > 0 && potentialFlows[0] && potentialFlows[0].score >= 2) {
      return potentialFlows[0].flow;
    }
    
    return null;
  }
  
  /**
   * Starts a new dialog flow
   * 
   * @param flow The flow to start
   * @param nlpResult The NLP result for the current turn
   * @param state The conversation state
   * @param dialogState The current dialog state
   * @returns A dialog plan for the first step of the flow
   */
  private startNewFlow(
    flow: DialogFlow,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState,
    dialogState: DialogState
  ): DialogPlan {
    // Get the first step of the flow
    const firstStep = flow.steps[0];
    
    if (!firstStep) {
      console.error(`[conversationPlanner] Flow ${flow.id} has no steps`);
      return this.createFallbackPlan('flow_error', nlpResult.context);
    }
    
    // Initialize the flow in the dialog state
    stateManager.startFlow(
      state.sessionId, 
      flow.id, 
      firstStep.id, 
      {
        previousContext: nlpResult.context.name,
        initialIntent: nlpResult.intent?.name,
        initialEntities: nlpResult.entities.map(e => e.type)
      }
    );
    
    // Process the first step action
    const action = this.processAction(firstStep.action, nlpResult, state);
    
    // Create a dialog plan
    const plan: DialogPlan = {
      primaryAction: action,
      alternativeActions: [],
      contextInfo: {
        currentContext: nlpResult.context.name,
        previousContext: nlpResult.context.name,
        relevantEntities: nlpResult.entities,
        activeWorkflows: [flow.id],
        confidence: nlpResult.intent?.confidence || 0.5
      },
      isResponseRequired: true,
      isHandlingIntent: !!nlpResult.intent,
      intentBeingHandled: nlpResult.intent?.name,
      expectedNextIntents: [],
      metadata: {
        flowId: flow.id,
        currentStepId: firstStep.id,
        isNewFlow: true,
        flowPriority: flow.priority
      }
    };
    
    return plan;
  }
  
  /**
   * Applies response strategies to determine the next action
   * 
   * @param nlpResult The NLP result for the current turn
   * @param state The conversation state
   * @param dialogState The current dialog state
   * @returns A dialog plan with the next action
   */
  private applyResponseStrategies(
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState,
    dialogState: DialogState
  ): DialogPlan {
    // If no response strategies are enabled, use fallback
    if (this.options.enabledStrategies.length === 0) {
      return this.createFallbackPlan('no_strategies', nlpResult.context);
    }
    
    // Find applicable strategies
    const applicableStrategies: ResponseStrategy[] = [];
    
    for (const strategyId of this.options.enabledStrategies) {
      const strategy = this.responseStrategies.get(strategyId);
      
      if (!strategy) {
        continue;
      }
      
      // Check if the strategy applies to the current context
      if (strategy.applicableContexts.includes(nlpResult.context.name) || 
          strategy.applicableContexts.includes('*')) {
        
        // For intent-specific strategies, check if they handle the current intent
        if (nlpResult.intent && 
            strategy.intentsHandled.includes(nlpResult.intent.name)) {
          applicableStrategies.push(strategy);
        }
        
        // Add strategies that handle all intents
        if (strategy.intentsHandled.includes('*')) {
          applicableStrategies.push(strategy);
        }
      }
    }
    
    // If no applicable strategies, use fallback
    if (applicableStrategies.length === 0) {
      return this.createFallbackPlan('no_applicable_strategies', nlpResult.context);
    }
    
    // Sort strategies by priority
    applicableStrategies.sort((a, b) => a.priority - b.priority);
    
    // Apply the highest priority strategy
    const bestStrategy = applicableStrategies[0];
    
    if (!bestStrategy) {
      return this.createFallbackPlan('no_best_strategy', nlpResult.context);
    }
    
    console.log(`[conversationPlanner] Using response strategy: ${bestStrategy.id}`);
    
    // Get action from the strategy
    const action = bestStrategy.selectAction(
      nlpResult.intent,
      nlpResult.context,
      state,
      dialogState
    );
    
    // Process the action
    const processedAction = this.processAction(action, nlpResult, state);
    
    // Generate alternative actions from other strategies
    const alternativeActions: DialogAction[] = [];
    
    for (let i = 1; i < Math.min(applicableStrategies.length, this.options.maxAlternatives + 1); i++) {
      const altStrategy = applicableStrategies[i];
      
      if (!altStrategy) continue;
      
      try {
        const altAction = altStrategy.selectAction(
          nlpResult.intent,
          nlpResult.context,
          state,
          dialogState
        );
        
        alternativeActions.push(this.processAction(altAction, nlpResult, state));
      } catch (error) {
        console.warn(`[conversationPlanner] Error generating alternative action from strategy ${altStrategy.id}:`, error);
      }
    }
    
    // Get a context name from a previous turn if available
    let previousContext = 'initial';
    if (state.turns.length > 0) {
      const lastTurn = state.turns[state.turns.length - 1];
      if (lastTurn && lastTurn.context) {
        previousContext = lastTurn.context.name;
      }
    }
    
    // Create a dialog plan
    const plan: DialogPlan = {
      primaryAction: processedAction,
      alternativeActions,
      contextInfo: {
        currentContext: nlpResult.context.name,
        previousContext,
        relevantEntities: nlpResult.entities,
        // Fix: Add type for f parameter and check for undefined
        activeWorkflows: dialogState.activeFlows.map((f: { flowId: string } | undefined) => 
          f?.flowId || '').filter(id => id !== ''),
        confidence: nlpResult.intent?.confidence || 0.5
      },
      isResponseRequired: true,
      isHandlingIntent: !!nlpResult.intent,
      intentBeingHandled: nlpResult.intent?.name,
      expectedNextIntents: [],
      metadata: {
        strategyId: bestStrategy.id,
        alternativeStrategies: applicableStrategies.slice(1)
          .map(s => s?.id || '')
          .filter(id => id !== '')
      }
    };
    
    return plan;
  }
  
  /**
   * Creates a fallback dialog plan
   * 
   * @param reason The reason for fallback
   * @param context The current context
   * @returns A dialog plan with a fallback action
   */
  private createFallbackPlan(reason: string, context: Context): DialogPlan {
    console.warn(`[conversationPlanner] Creating fallback plan due to: ${reason}`);
    
    // Get a fallback response for the context
    const fallbackContent = this.getFallbackResponse(context.name);
    
    // Create fallback action
    const fallbackAction: DialogAction = {
      type: ActionType.FALLBACK,
      priority: PriorityLevel.FALLBACK,
      content: fallbackContent,
      params: {
        reason,
        context: context.name
      }
    };
    
    // Create a dialog plan
    const plan: DialogPlan = {
      primaryAction: fallbackAction,
      alternativeActions: [],
      contextInfo: {
        currentContext: context.name,
        previousContext: 'unknown',
        relevantEntities: [],
        activeWorkflows: [],
        confidence: 0.1
      },
      isResponseRequired: true,
      isHandlingIntent: false,
      metadata: {
        isFallback: true,
        fallbackReason: reason
      }
    };
    
    return plan;
  }
  
  /**
   * Loads fallback responses from configuration
   * 
   * @returns Object mapping context names to fallback responses
   */
  private loadFallbackResponses(): Record<string, string[]> {
    try {
      // In a real implementation, this would load from config
      // For now, return hardcoded fallbacks
      
      // Default fallbacks
      const defaultFallbacks = {
        general: [
          "Es tut mir leid, ich verstehe nicht ganz. Könntest du das bitte anders formulieren?",
          "Leider habe ich das nicht verstanden. Kannst du das noch einmal anders sagen?",
          "Entschuldigung, das habe ich nicht ganz erfasst. Kannst du es bitte anders ausdrücken?"
        ],
        question: [
          "Ich bin mir nicht sicher, was du mich fragen möchtest. Kannst du deine Frage umformulieren?",
          "Es fällt mir schwer, deine Frage zu verstehen. Könntest du sie anders stellen?"
        ],
        instruction: [
          "Ich bin nicht sicher, was ich tun soll. Könntest du deine Anweisung präzisieren?",
          "Entschuldigung, ich kann nicht erkennen, was du von mir möchtest. Kannst du es anders erklären?"
        ]
      };
      
      // Check if we have fallbacks in the config
      if (config && config.fallbacks && config.fallbacks.de) {
        return config.fallbacks.de;
      }
      
      return defaultFallbacks;
    } catch (error) {
      console.error(`[conversationPlanner] Error loading fallback responses:`, error);
      
      // Return minimal fallbacks
      return {
        general: ["Es tut mir leid, ich habe das nicht verstanden."]
      };
    }
  }
  
  /**
   * Gets a fallback response for a specific context
   * 
   * @param context The context for the fallback
   * @returns A fallback response
   */
  private getFallbackResponse(context: string): string {
    // Look for context-specific fallbacks
    if (this.fallbackResponses[context] && this.fallbackResponses[context].length > 0) {
      // Get a random fallback for this context
      return this.getRandomItem(this.fallbackResponses[context]);
    }
    
    // Fall back to general fallbacks
    if (this.fallbackResponses.general && this.fallbackResponses.general.length > 0) {
      return this.getRandomItem(this.fallbackResponses.general);
    }
    
    // Ultimate fallback
    return "Es tut mir leid, ich habe das nicht verstanden.";
  }
  
  /**
   * Gets a random item from an array
   * 
   * @param items The array of items
   * @returns A random item from the array
   */
  private getRandomItem<T>(items: T[]): T {
    if (!items || items.length === 0) {
      throw new Error("Cannot get random item from empty array");
    }
    
    const index = Math.floor(Math.random() * items.length);
    // Ensure we have a valid item (fixes the type error)
    const item = items[index];
    if (item === undefined) {
      // If somehow we got an undefined item, return the first item or throw
      return items[0] || (function() { throw new Error("No valid items found"); })();
    }
    return item;
  }
  
  /**
   * Evaluates a condition in the context of a conversation
   * 
   * @param condition The condition to evaluate
   * @param state The conversation state
   * @param nlpResult The NLP result
   * @returns Whether the condition is true
   */
  private evaluateCondition(
    condition: ActionCondition,
    state: ConversationState,
    nlpResult?: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    }
  ): boolean {
    try {
      switch (condition.type) {
        case 'entity_present':
          if (!condition.entityType) return false;
          
          // Check if entity is present in the NLP result
          if (nlpResult) {
            return nlpResult.entities.some(e => e.type === condition.entityType);
          }
          
          // Or check if it's in persistent entities
          return !!state.persistentEntities[condition.entityType];
          
        case 'entity_value':
          if (!condition.entityType || condition.entityValue === undefined) return false;
          
          let entityValue: string | undefined;
          
          // Check NLP result first
          if (nlpResult) {
            const entity = nlpResult.entities.find(e => e.type === condition.entityType);
            if (entity) {
              entityValue = entity.value;
            }
          }
          
          // If not found, check persistent entities
          if (entityValue === undefined && condition.entityType && 
              state.persistentEntities[condition.entityType]) {
            const persistentEntity = state.persistentEntities[condition.entityType];
            if (persistentEntity) {
              entityValue = persistentEntity.value;
            }
          }
          
          // Compare values
          if (entityValue === undefined) return false;
          
          if (condition.operator === 'equals') {
            return entityValue === condition.entityValue;
          } else if (condition.operator === 'not_equals') {
            return entityValue !== condition.entityValue;
          } else if (condition.operator === 'contains') {
            return entityValue.includes(condition.entityValue);
          }
          
          return false;
          
        case 'intent_match':
          if (!condition.intentName || !nlpResult || !nlpResult.intent) return false;
          
          return nlpResult.intent.name === condition.intentName;
          
        case 'context_match':
          if (!condition.contextName || !nlpResult) return false;
          
          return nlpResult.context.name === condition.contextName;
          
        case 'flag_value':
          if (!condition.flagName) return false;
          
          const flagValue = state.flags[condition.flagName];
          
          if (condition.flagValue === undefined) {
            // Just check if flag exists
            return flagValue !== undefined;
          }
          
          // Compare flag value
          return flagValue === condition.flagValue;
          
        case 'sentiment':
          if (!condition.sentimentValue || !nlpResult) return false;
          
          // Check sentiment from context
          const sentiment = (nlpResult.context as EnhancedContext).sentiment;
          
          return sentiment === condition.sentimentValue;
          
        case 'turn_count':
          if (condition.turnCount === undefined) return false;
          
          // Compare turn count
          if (condition.operator === 'equals') {
            return state.turns.length === condition.turnCount;
          } else if (condition.operator === 'greater_than') {
            return state.turns.length > condition.turnCount;
          } else if (condition.operator === 'less_than') {
            return state.turns.length < condition.turnCount;
          }
          
          return false;
          
        case 'custom':
          if (!condition.customCheck) return false;
          
          // Execute custom check
          return condition.customCheck(state);
          
        default:
          console.warn(`[conversationPlanner] Unknown condition type: ${(condition as any).type}`);
          return false;
      }
    } catch (error) {
      console.error(`[conversationPlanner] Error evaluating condition:`, error);
      return false;
    }
  }
  
  /**
   * Replaces placeholders in content with values
   * 
   * @param content The content with placeholders
   * @param nlpResult The NLP result
   * @param state The conversation state
   * @param params Additional parameters
   * @returns The content with placeholders replaced
   */
  private replaceContentPlaceholders(
    content: string,
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState,
    params: Record<string, any>
  ): string {
    try {
      let result = content;
      
      // Replace entity values (e.g., {entity:location})
      const entityRegex = /\{entity:([\w-]+)\}/g;
      result = result.replace(entityRegex, (match, entityType) => {
        // Check current entities first
        const entity = nlpResult.entities.find(e => e.type === entityType);
        
        if (entity) {
          return entity.value;
        }
        
        // Then check persistent entities
        if (state.persistentEntities[entityType]) {
          return state.persistentEntities[entityType].value;
        }
        
        // Fallback
        return `[${entityType}]`;
      });
      
      // Replace user info (e.g., {user:name})
      const userRegex = /\{user:([\w-]+)\}/g;
      result = result.replace(userRegex, (match, property) => {
        if (property === 'name' && state.userId) {
          return state.userId;
        }
        
        // Check user preferences
        if (state.userProfile.preferences[property]) {
          return state.userProfile.preferences[property];
        }
        
        // Fallback
        return `[user ${property}]`;
      });
      
      // Replace context variables (e.g., {context:current})
      const contextRegex = /\{context:([\w-]+)\}/g;
      result = result.replace(contextRegex, (match, property) => {
        if (property === 'current') {
          return nlpResult.context.name;
        }
        
        // Fallback
        return `[context ${property}]`;
      });
      
      // Replace parameters (e.g., {param:name})
      const paramRegex = /\{param:([\w-]+)\}/g;
      result = result.replace(paramRegex, (match, property) => {
        if (params[property] !== undefined) {
          return String(params[property]);
        }
        
        // Fallback
        return `[param ${property}]`;
      });
      
      return result;
    } catch (error) {
      console.error(`[conversationPlanner] Error replacing placeholders:`, error);
      return content;
    }
  }
  
  /**
   * Generates a follow-up question based on the current context
   * 
   * @param nlpResult The NLP result
   * @param state The conversation state
   * @returns A follow-up question or null if none is appropriate
   */
  private generateFollowUpQuestion(
    nlpResult: {
      intent: Intent | null;
      entities: Entity[];
      context: Context;
    },
    state: ConversationState
  ): string | null {
    try {
      // Skip follow-up if user asked a question (context is 'question')
      if (nlpResult.context.name === 'question') {
        return null;
      }
      
      // Use follow-up generator to create a relevant question
      return followUpGenerator.generateFollowUp(
        nlpResult.intent,
        nlpResult.context,
        state
      );
    } catch (error) {
      console.error(`[conversationPlanner] Error generating follow-up question:`, error);
      return null;
    }
  }
  
  /**
   * Logs the result of planning
   * 
   * @param plan The dialog plan
   * @param startTime The start time for performance measurement
   */
  private logPlanningResult(plan: DialogPlan, startTime: number): void {
    // Skip if logging is disabled
    if (!this.options.logPlanningDecisions) {
      return;
    }
    
    const duration = Date.now() - startTime;
    
    console.log(`[conversationPlanner] Planning completed in ${duration}ms`);
    console.log(`[conversationPlanner] Selected action: ${plan.primaryAction.type} (${plan.primaryAction.responseKey || 'direct content'})`);
    console.log(`[conversationPlanner] Alternative actions: ${plan.alternativeActions.length}`);
    
    if (plan.metadata.flowId) {
      console.log(`[conversationPlanner] Using flow: ${plan.metadata.flowId}, step: ${plan.metadata.currentStepId}`);
    }
    
    if (plan.metadata.strategyId) {
      console.log(`[conversationPlanner] Using strategy: ${plan.metadata.strategyId}`);
    }
  }
  
  /**
   * Loads dialog flows from configuration
   */
  private loadDialogFlows(): void {
    try {
      // In a real implementation, this would load from config files or a database
      // For this example, we'll register a simple flow

      const exampleFlow: DialogFlow = {
        id: 'greeting_flow',
        name: 'Greeting Flow',
        description: 'Handles initial greetings and introductions',
        triggers: {
          intents: ['smalltalk_greeting', 'greeting'],
          contexts: ['initial', 'greeting']
        },
        steps: [
          {
            id: 'greeting',
            action: {
              type: ActionType.RESPOND,
              priority: PriorityLevel.HIGH,
              content: "Hallo! Wie kann ich dir heute helfen?"
            },
            next: 'ask_need'
          },
          {
            id: 'ask_need',
            action: {
              type: ActionType.ASK_QUESTION,
              priority: PriorityLevel.MEDIUM,
              content: "Suchst du nach Informationen zu einem bestimmten Thema?"
            },
            next: {
              conditions: [
                {
                  condition: {
                    type: 'intent_match',
                    intentName: 'affirmation'
                  },
                  stepId: 'suggest_topics'
                },
                {
                  condition: {
                    type: 'intent_match',
                    intentName: 'negation'
                  },
                  stepId: 'end_flow'
                }
              ],
              default: 'end_flow'
            }
          },
          {
            id: 'suggest_topics',
            action: {
              type: ActionType.SUGGEST,
              priority: PriorityLevel.MEDIUM,
              content: "Ich kann dir zu folgenden Themen helfen: Produkte, Preise, Support oder Allgemeine Informationen. Was interessiert dich?"
            },
            next: 'end_flow'
          },
          {
            id: 'end_flow',
            action: {
              type: ActionType.RESPOND,
              priority: PriorityLevel.LOW,
              content: "Gut, dann melde dich einfach, wenn du Fragen hast!"
            }
          }
        ],
        interruptible: true,
        priority: PriorityLevel.MEDIUM,
        allowRetry: true,
        maxRetries: 2
      };
      
      this.registerDialogFlow(exampleFlow);
    } catch (error) {
      console.error(`[conversationPlanner] Error loading dialog flows:`, error);
    }
  }
  
  /**
   * Registers built-in response strategies
   */
  private registerBuiltInStrategies(): void {
    try {
      // Standard strategy for general responses
      const standardStrategy: ResponseStrategy = {
        id: 'standard',
        name: 'Standard Response Strategy',
        description: 'General-purpose response strategy for common intents',
        applicableContexts: ['*'], // Applies to all contexts
        intentsHandled: ['*'], // Handles all intents
        priority: PriorityLevel.MEDIUM,
        selectAction: (intent, context, state, dialogState) => {
          // Default action
          const action: DialogAction = {
            type: ActionType.RESPOND,
            priority: PriorityLevel.MEDIUM,
            content: "Ich verstehe. Kann ich dir mit etwas anderem helfen?"
          };
          
          // If no intent, use fallback
          if (!intent) {
            action.type = ActionType.FALLBACK;
            action.content = this.getFallbackResponse(context.name);
            return action;
          }
          
          // Standard responses for common intents
          if (intent.name.includes('greeting')) {
            action.content = "Hallo! Wie kann ich dir heute helfen?";
          } else if (intent.name.includes('farewell')) {
            action.content = "Auf Wiedersehen! Bis zum nächsten Mal.";
          } else if (intent.name.includes('thanks')) {
            action.content = "Gerne! Kann ich dir noch mit etwas anderem helfen?";
          } else if (intent.name.includes('help')) {
            action.content = "Ich kann dir zu verschiedenen Themen helfen. Du kannst nach Produkten, Preisen, oder Support fragen.";
          } else if (intent.name.includes('affirm')) {
            action.content = "Ausgezeichnet!";
          } else if (intent.name.includes('deny')) {
            action.content = "Alles klar, kein Problem.";
          }
          
          return action;
        }
      };
      
      // Context-aware strategy that adapts to conversation context
      const contextualStrategy: ResponseStrategy = {
        id: 'contextual',
        name: 'Contextual Response Strategy',
        description: 'Context-aware response strategy for more natural conversations',
        applicableContexts: ['*'], // Applies to all contexts
        intentsHandled: ['*'], // Handles all intents
        priority: PriorityLevel.HIGH,
        selectAction: (intent, context, state, dialogState) => {
          const contextName = context.name;
          
          // Default action
          const action: DialogAction = {
            type: ActionType.RESPOND,
            priority: PriorityLevel.HIGH,
            content: "Ich verstehe."
          };
          
          // Adapt based on context
          if (contextName === 'question') {
            action.type = ActionType.ASK_QUESTION;
            action.content = "Das ist eine interessante Frage. Möchtest du mehr Details dazu wissen?";
          } else if (contextName === 'clarification') {
            action.type = ActionType.CLARIFY;
            action.content = "Entschuldige die Unklarheit. Meinst du damit...?";
          } else if (contextName === 'confirmation') {
            action.type = ActionType.CONFIRM;
            action.content = "Verstanden! Soll ich fortfahren?";
          } else if (contextName === 'negation') {
            action.content = "Alles klar, dann nicht. Womit kann ich dir stattdessen helfen?";
          } else if (contextName === 'instruction') {
            action.content = "Ich werde versuchen, das für dich zu erledigen.";
          }
          
          return action;
        }
      };
      
      // Intent-driven strategy focused on specific intent handling
      const intentDrivenStrategy: ResponseStrategy = {
        id: 'intent_driven',
        name: 'Intent-Driven Strategy',
        description: 'Focuses on handling specific intents with tailored responses',
        applicableContexts: ['*'], // Applies to all contexts
        intentsHandled: ['function_find_specific_content', 'function_change_password', 'function_logout', 'function_give_feedback', 'function_contact_support'],
        priority: PriorityLevel.HIGH,
        selectAction: (intent, context, state, dialogState) => {
          if (!intent) {
            return {
              type: ActionType.FALLBACK,
              priority: PriorityLevel.FALLBACK,
              content: this.getFallbackResponse(context.name)
            };
          }
          
          // Handle function intents
          if (intent.name === 'function_find_specific_content') {
            return {
              type: ActionType.EXECUTE_FUNCTION,
              priority: PriorityLevel.HIGH,
              content: "Ich suche nach Informationen zu {entity:topic}. Einen Moment bitte.",
              params: { functionName: 'searchContent' }
            };
          } else if (intent.name === 'function_change_password') {
            return {
              type: ActionType.EXECUTE_FUNCTION,
              priority: PriorityLevel.HIGH,
              content: "Um dein Passwort zu ändern, musst du diese Schritte befolgen...",
              params: { functionName: 'showPasswordChangeInstructions' }
            };
          } else if (intent.name === 'function_logout') {
            return {
              type: ActionType.EXECUTE_FUNCTION,
              priority: PriorityLevel.HIGH,
              content: "Ich melde dich jetzt ab.",
              params: { functionName: 'logout' }
            };
          } else if (intent.name === 'function_give_feedback') {
            return {
              type: ActionType.EXECUTE_FUNCTION,
              priority: PriorityLevel.HIGH,
              content: "Vielen Dank, dass du Feedback geben möchtest. Hier ist unser Feedback-Formular.",
              params: { functionName: 'showFeedbackForm' }
            };
          } else if (intent.name === 'function_contact_support') {
            return {
              type: ActionType.EXECUTE_FUNCTION,
              priority: PriorityLevel.HIGH,
              content: "Ich verbinde dich mit unserem Support-Team.",
              params: { functionName: 'contactSupport' }
            };
          }
          
          // Fallback for other intents
          return {
            type: ActionType.RESPOND,
            priority: PriorityLevel.MEDIUM,
            content: "Ich verstehe deinen Wunsch. Lass mich dir dabei helfen."
          };
        }
      };
      
      // FAQ strategy for handling question intents
      const faqStrategy: ResponseStrategy = {
        id: 'faq',
        name: 'FAQ Strategy',
        description: 'Handles frequently asked questions',
        applicableContexts: ['question', 'clarification', 'followup'],
        intentsHandled: ['faq_pricing_info', 'faq_premium_benefits', 'faq_cancel_subscription', 'faq_find_invoice', 'faq_general'],
        priority: PriorityLevel.HIGH,
        selectAction: (intent, context, state, dialogState) => {
          if (!intent) {
            return {
              type: ActionType.FALLBACK,
              priority: PriorityLevel.FALLBACK,
              content: this.getFallbackResponse(context.name)
            };
          }
          
          // Handle FAQ intents
          if (intent.name === 'faq_pricing_info') {
            return {
              type: ActionType.RESPOND,
              priority: PriorityLevel.HIGH,
              content: "Unsere Preise beginnen bei 9,99€ pro Monat für den Basis-Plan. Der Premium-Plan kostet 19,99€ pro Monat und bietet zusätzliche Funktionen."
            };
          } else if (intent.name === 'faq_premium_benefits') {
            return {
              type: ActionType.RESPOND,
              priority: PriorityLevel.HIGH,
              content: "Der Premium-Plan bietet dir unbegrenzten Zugriff auf alle Funktionen, priorisierter Support und erweiterte Analysemöglichkeiten."
            };
          } else if (intent.name === 'faq_cancel_subscription') {
            return {
              type: ActionType.RESPOND,
              priority: PriorityLevel.HIGH,
              content: "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen kündigen. Die Kündigung wird zum Ende deiner aktuellen Abrechnungsperiode wirksam."
            };
          } else if (intent.name === 'faq_find_invoice') {
            return {
              type: ActionType.RESPOND,
              priority: PriorityLevel.HIGH,
              content: "Deine Rechnungen findest du im Bereich 'Abrechnung' in deinen Kontoeinstellungen. Dort kannst du alle bisherigen Rechnungen einsehen und herunterladen."
            };
          } else if (intent.name === 'faq_general') {
            return {
              type: ActionType.RESPOND,
              priority: PriorityLevel.MEDIUM,
              content: "Zu dieser Frage kann ich leider keine spezifische Antwort geben. Möchtest du mehr über unsere Produkte, Preise oder den Support erfahren?"
            };
          }
          
          // Fallback for other FAQ intents
          return {
            type: ActionType.RESPOND,
            priority: PriorityLevel.MEDIUM,
            content: "Das ist eine gute Frage. Leider habe ich darauf keine spezifische Antwort. Kann ich dir mit etwas anderem helfen?"
          };
        }
      };
      
      // Register the strategies
      this.registerResponseStrategy(standardStrategy);
      this.registerResponseStrategy(contextualStrategy);
      this.registerResponseStrategy(intentDrivenStrategy);
      this.registerResponseStrategy(faqStrategy);
    } catch (error) {
      console.error(`[conversationPlanner] Error registering built-in strategies:`, error);
    }
  }
}

// Export a singleton instance
export const conversationPlanner = new ConversationPlanner();