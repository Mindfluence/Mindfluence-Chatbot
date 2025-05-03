import type { Intent, Entity, Context, NLPProcessingResult } from '@/types/nlp.types';
import { processMessage } from '@/features/nlp-engine/engine';
import { extractRelevantContextForResponse } from '@/features/nlp-engine/pipelines/context-management';
import { v4 as uuidv4 } from 'uuid';

// Types für die Dialogverwaltung
export type DialogState = string;
export type DialogAction = string;
export type DialogCondition = (
  input: string, 
  currentState: DialogStateNode, 
  nlpResult: NLPProcessingResult
) => boolean;

export type StateTransition = {
  targetState: DialogState;
  conditions: DialogCondition[];
  actions?: DialogAction[];
  priority: number;
};

export type DialogStateNode = {
  id: DialogState;
  name: string;
  description?: string;
  isInitial?: boolean;
  isFinal?: boolean;
  onEnter?: DialogAction[];
  onExit?: DialogAction[];
  transitions: StateTransition[];
  responseGenerators: ResponseGenerator[];
  requiredEntities?: string[];
  collectData?: boolean;
  timeoutMs?: number;
  metadata?: Record<string, any>;
};

export type DialogFlow = {
  id: string;
  name: string;
  description?: string;
  states: Map<DialogState, DialogStateNode>;
  initialStates: DialogState[];
  finalStates: DialogState[];
  globalTransitions?: StateTransition[];
  metadata?: Record<string, any>;
  variables: Map<string, any>;
};

// Interface für die Antwortgenerierung
export interface ResponseGenerator {
  condition: DialogCondition;
  generate: (
    input: string, 
    state: DialogStateNode, 
    context: DialogContext, 
    nlpResult: NLPProcessingResult
  ) => Promise<DialogResponse>;
  priority: number;
}

// Kontext für einen Dialog
export interface DialogContext {
  sessionId: string;
  userId?: string;
  currentState: DialogState;
  previousStates: DialogState[];
  collectedData: Map<string, any>;
  collectedEntities: Entity[];
  conversationHistory: ConversationTurn[];
  variables: Map<string, any>;
  lastActiveTime: number;
  startTime: number;
  metadata: Record<string, any>;
}

// Struktur für einen einzelnen Konversationsschritt
export interface ConversationTurn {
  userInput: string;
  nlpResult: NLPProcessingResult;
  systemResponse: DialogResponse;
  timestamp: number;
  stateId: DialogState;
}

// Struktur für die Systemantwort
export interface DialogResponse {
  text: string;
  suggestions?: string[];
  actions?: DialogAction[];
  followUpQuestions?: string[];
  requiredEntities?: string[];
  needsMoreInfo?: boolean;
  metadata?: Record<string, any>;
}

// Ereignistypen für Event-Emitter
export enum DialogEventType {
  STATE_CHANGED = 'stateChanged',
  DIALOG_STARTED = 'dialogStarted',
  DIALOG_COMPLETED = 'dialogCompleted',
  ENTITY_COLLECTED = 'entityCollected',
  TRANSITION_EXECUTED = 'transitionExecuted',
  ERROR = 'error',
  TIMEOUT = 'timeout'
}

// Event-Listener Typ
export type DialogEventListener = (eventData: any) => void;

// Interface for DialogState used in ConversationPlanner
export interface PlannerDialogState {
  activeFlows: Array<{
    flowId: string;
    currentStepId: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Hauptklasse für die Verwaltung von komplexen Dialogzuständen
 * Ermöglicht zustandsbasierte Konversationsflüsse
 */
export class DialogStateManager {
  // Speicherung aktiver Dialoge nach Session-ID
  private activeDialogs: Map<string, DialogFlow>;
  
  // Speicherung des Kontextes für jeden aktiven Dialog
  private dialogContexts: Map<string, DialogContext>;
  
  // Registrierte Dialogflüsse (Zustandsautomaten)
  private registeredFlows: Map<string, DialogFlow>;
  
  // Event-Listener für den Observer-Pattern
  private eventListeners: Map<DialogEventType, DialogEventListener[]>;
  
  // Timeout-Tracking
  private timeoutHandlers: Map<string, NodeJS.Timeout>;
  
  // Tracking für die active flows in PlannerDialogState format
  private plannerDialogStates: Map<string, PlannerDialogState>;
  
  // Konfiguration
  private config: {
    defaultTimeout: number;
    maxConversationTurns: number;
    maxInactivityTime: number;
  };

  /**
   * Konstruktor für den DialogStateManager
   */
  constructor() {
    this.activeDialogs = new Map();
    this.dialogContexts = new Map();
    this.registeredFlows = new Map();
    this.eventListeners = new Map();
    this.timeoutHandlers = new Map();
    this.plannerDialogStates = new Map();
    
    // Standard-Konfiguration
    this.config = {
      defaultTimeout: 300000, // 5 Minuten
      maxConversationTurns: 50,
      maxInactivityTime: 1800000 // 30 Minuten
    };
    
    // Initialisiere Event-Listener-Maps für alle Event-Typen
    Object.values(DialogEventType).forEach(eventType => {
      this.eventListeners.set(eventType as DialogEventType, []);
    });
    
    // Starte Cleanup-Intervall für inaktive Dialoge
    setInterval(() => this.cleanupInactiveDialogs(), 60000); // Jede Minute
  }

  /**
   * Registriert einen neuen Dialogflow (Zustandsautomat)
   * @param flow Der zu registrierende Dialogflow
   * @returns Die ID des registrierten Flows
   */
  public registerFlow(flow: DialogFlow): string {
    // Validiere den Flow vor der Registrierung
    this.validateFlow(flow);
    
    // Registriere den Flow
    this.registeredFlows.set(flow.id, flow);
    console.log(`[DialogStateManager] Flow registriert: ${flow.id} (${flow.name})`);
    
    return flow.id;
  }

  /**
   * Startet einen neuen Dialog basierend auf einem registrierten Flow
   * @param flowId ID des zu startenden Flows
   * @param sessionId Session-ID für den Dialog
   * @param userId Optionale Benutzer-ID
   * @param initialData Optionale Initialdaten
   * @returns Die erstellte Dialog-Kontext-ID oder null bei Fehler
   */
  public startDialog(
    flowId: string, 
    sessionId: string, 
    userId?: string,
    initialData?: Record<string, any>
  ): string | null {
    try {
      // Prüfe, ob Flow existiert
      const flow = this.registeredFlows.get(flowId);
      if (!flow) {
        console.error(`[DialogStateManager] Flow nicht gefunden: ${flowId}`);
        return null;
      }
      
      // Generiere Kontext-ID
      const contextId = sessionId || uuidv4();
      
      // Finde Initialzustand
      if (flow.initialStates.length === 0) {
        console.error(`[DialogStateManager] Flow hat keinen Initialzustand: ${flowId}`);
        return null;
      }
      
      // Jetzt wissen wir, dass initialStates nicht leer ist
      const initialStateId = flow.initialStates[0]!; // Non-null assertion hier hinzugefügt
      const initialState = flow.states.get(initialStateId);
      
      if (!initialState) {
        console.error(`[DialogStateManager] Initialzustand nicht gefunden: ${initialStateId}`);
        return null;
      }
      
      // Erstelle eine Kopie des Flows für diese Sitzung
      const activeFlow: DialogFlow = {
        ...flow,
        states: new Map(flow.states),
        variables: new Map(flow.variables)
      };
      
      // Initialisiere Kontext
      const now = Date.now();
      const dialogContext: DialogContext = {
        sessionId: contextId,
        userId,
        currentState: initialStateId, // Hier ist initialStateId garantiert nicht undefined
        previousStates: [],
        collectedData: new Map(),
        collectedEntities: [],
        conversationHistory: [],
        variables: new Map(),
        lastActiveTime: now,
        startTime: now,
        metadata: {}
      };
      
      // Initialdaten hinzufügen, falls vorhanden
      if (initialData) {
        Object.entries(initialData).forEach(([key, value]) => {
          dialogContext.variables.set(key, value);
        });
      }
      
      // Speichere Flow und Kontext
      this.activeDialogs.set(contextId, activeFlow);
      this.dialogContexts.set(contextId, dialogContext);
      
      // Führe onEnter-Aktionen des Initialzustands aus
      if (initialState.onEnter && initialState.onEnter.length > 0) {
        this.executeActions(initialState.onEnter, contextId);
      }
      
      // Setup Timeout für diesen Zustand, falls konfiguriert
      this.setupStateTimeout(contextId, initialState);
      
      // Ereignis auslösen
      this.emitEvent(DialogEventType.DIALOG_STARTED, {
        contextId,
        flowId,
        initialState: initialStateId
      });
      
      console.log(`[DialogStateManager] Dialog gestartet: ${flowId} (Session: ${contextId})`);
      return contextId;
    } catch (error) {
      console.error(`[DialogStateManager] Fehler beim Starten des Dialogs:`, error);
      this.emitEvent(DialogEventType.ERROR, {
        message: 'Fehler beim Starten des Dialogs',
        error
      });
      return null;
    }
  }

  /**
   * Verarbeitet eine Benutzereingabe im Kontext eines aktiven Dialogs
   * @param contextId Die Dialog-Kontext-ID
   * @param input Die Benutzereingabe
   * @param language Die Sprache der Eingabe
   * @returns Die generierte Antwort oder null bei Fehler
   */
  public async processInput(
    contextId: string, 
    input: string, 
    language: 'de' | 'en' = 'de'
  ): Promise<DialogResponse | null> {
    try {
      // Prüfe, ob Dialog existiert
      const dialogContext = this.dialogContexts.get(contextId);
      const dialogFlow = this.activeDialogs.get(contextId);
      
      if (!dialogContext || !dialogFlow) {
        console.error(`[DialogStateManager] Dialog nicht gefunden: ${contextId}`);
        return null;
      }
      
      // Aktualisiere Zeit der letzten Aktivität
      dialogContext.lastActiveTime = Date.now();
      
      // Hole aktuellen Zustand
      const currentStateId = dialogContext.currentState;
      const currentState = dialogFlow.states.get(currentStateId);
      
      if (!currentState) {
        console.error(`[DialogStateManager] Zustand nicht gefunden: ${currentStateId}`);
        return null;
      }
      
      // Konversationshistorie für NLP-Verarbeitung vorbereiten
      const conversationHistory = dialogContext.conversationHistory.map(turn => turn.userInput);
      
      // NLP-Verarbeitung durchführen
      console.log(`[DialogStateManager] Verarbeite Eingabe: "${input}" (Session: ${contextId})`);
      const nlpResult = await processMessage(input, language, conversationHistory);
      
      // Überprüfe auf Transitionen
      const nextState = this.determineNextState(contextId, input, nlpResult);
      
      // Wenn Zustandsübergang erkannt wurde
      if (nextState && nextState !== currentStateId) {
        const prevState = currentState;
        const newState = dialogFlow.states.get(nextState);
        
        if (newState) {
          // OnExit-Aktionen des aktuellen Zustands ausführen
          if (prevState.onExit && prevState.onExit.length > 0) {
            this.executeActions(prevState.onExit, contextId);
          }
          
          // Zustand aktualisieren
          dialogContext.previousStates.push(currentStateId);
          dialogContext.currentState = nextState;
          
          // Aktualisiere Timeout (entferne alten Timeout)
          this.clearStateTimeout(contextId);
          
          // OnEnter-Aktionen des neuen Zustands ausführen
          if (newState.onEnter && newState.onEnter.length > 0) {
            this.executeActions(newState.onEnter, contextId);
          }
          
          // Setup neuen Timeout
          this.setupStateTimeout(contextId, newState);
          
          // Ereignis auslösen
          this.emitEvent(DialogEventType.STATE_CHANGED, {
            contextId,
            previousState: currentStateId,
            newState: nextState
          });
          
          console.log(`[DialogStateManager] Zustandsübergang: ${currentStateId} -> ${nextState}`);
          
          // Prüfe, ob neuer Zustand ein Finalzustand ist
          if (newState.isFinal) {
            console.log(`[DialogStateManager] Finalzustand erreicht: ${nextState}`);
            this.emitEvent(DialogEventType.DIALOG_COMPLETED, {
              contextId,
              finalState: nextState
            });
          }
        }
      }
      
      // Sammle Entitäten, falls im aktuellen Zustand erforderlich
      if (currentState.collectData && nlpResult.entities.length > 0) {
        // Filtere auf benötigte Entitäten, falls spezifiziert
        const entitiesToCollect = currentState.requiredEntities 
          ? nlpResult.entities.filter(e => currentState.requiredEntities?.includes(e.type))
          : nlpResult.entities;
          
        // Füge Entitäten zum gesammelten Datenset hinzu
        for (const entity of entitiesToCollect) {
          // Ignoriere Entitäten mit niedriger Konfidenz
          if (entity.confidence && entity.confidence < 0.5) continue;
          
          dialogContext.collectedEntities.push(entity);
          dialogContext.collectedData.set(entity.type, entity.value);
          
          // Ereignis auslösen
          this.emitEvent(DialogEventType.ENTITY_COLLECTED, {
            contextId,
            entity,
            state: currentStateId
          });
        }
      }
      
      // Generiere Antwort basierend auf aktuellem/neuem Zustand
      const updatedStateId = dialogContext.currentState;
      const updatedState = dialogFlow.states.get(updatedStateId);
      
      if (!updatedState) {
        console.error(`[DialogStateManager] Aktualisierter Zustand nicht gefunden: ${updatedStateId}`);
        return null;
      }
      
      // Wähle passenden ResponseGenerator basierend auf Bedingungen und Priorität
      const validGenerators = updatedState.responseGenerators
        .filter(generator => generator.condition(input, updatedState, nlpResult))
        .sort((a, b) => b.priority - a.priority);
      
      // Wenn kein passender Generator gefunden, verwende Default
      if (validGenerators.length === 0) {
        console.warn(`[DialogStateManager] Kein passender ResponseGenerator für Zustand: ${updatedStateId}`);
        return this.createDefaultResponse(updatedState, nlpResult);
      }
      
      // Generiere Antwort mit höchstpriorisiertem Generator
      // Wir wissen, dass validGenerators mindestens einen Eintrag hat, da wir den Fall length === 0 abgefangen haben
      const response = await validGenerators[0]!.generate(
        input, 
        updatedState, 
        dialogContext, 
        nlpResult
      );
      
      // Speichere Konversationsschritt in der Historie
      const conversationTurn: ConversationTurn = {
        userInput: input,
        nlpResult,
        systemResponse: response,
        timestamp: Date.now(),
        stateId: updatedStateId
      };
      
      dialogContext.conversationHistory.push(conversationTurn);
      
      // Begrenze die Historie auf maximale Anzahl an Turns
      if (dialogContext.conversationHistory.length > this.config.maxConversationTurns) {
        dialogContext.conversationHistory.shift(); // Entferne ältesten Eintrag
      }
      
      return response;
    } catch (error) {
      console.error(`[DialogStateManager] Fehler bei Verarbeitung der Eingabe:`, error);
      this.emitEvent(DialogEventType.ERROR, {
        message: 'Fehler bei Verarbeitung der Eingabe',
        contextId,
        input,
        error
      });
      
      // Erzeuge Fehlerantwort
      return {
        text: "Es tut mir leid, bei der Verarbeitung Ihrer Anfrage ist ein Fehler aufgetreten.",
        metadata: { error: true }
      };
    }
  }

  /**
   * Bestimmt den nächsten Zustand basierend auf Eingabe und NLP-Ergebnis
   * @param contextId Die Dialog-Kontext-ID
   * @param input Die Benutzereingabe
   * @param nlpResult Das NLP-Ergebnis
   * @returns Die ID des nächsten Zustands oder null, wenn kein Übergang
   */
  private determineNextState(
    contextId: string, 
    input: string, 
    nlpResult: NLPProcessingResult
  ): DialogState | null {
    const dialogContext = this.dialogContexts.get(contextId);
    const dialogFlow = this.activeDialogs.get(contextId);
    
    if (!dialogContext || !dialogFlow) return null;
    
    const currentStateId = dialogContext.currentState;
    const currentState = dialogFlow.states.get(currentStateId);
    
    if (!currentState) return null;
    
    // Sammle alle möglichen Transitionen
    let possibleTransitions: Array<StateTransition & { source: string }> = [];
    
    // 1. Zustandsspezifische Transitionen
    currentState.transitions.forEach(transition => {
      possibleTransitions.push({
        ...transition,
        source: 'state'
      });
    });
    
    // 2. Globale Transitionen (falls vorhanden)
    if (dialogFlow.globalTransitions) {
      dialogFlow.globalTransitions.forEach(transition => {
        possibleTransitions.push({
          ...transition,
          source: 'global'
        });
      });
    }
    
    // Sortiere Übergänge nach Priorität (höchste zuerst)
    possibleTransitions.sort((a, b) => b.priority - a.priority);
    
    // Prüfe Bedingungen für jeden Übergang
    for (const transition of possibleTransitions) {
      // Alle Bedingungen müssen erfüllt sein
      const conditionsMet = transition.conditions.every(condition => 
        condition(input, currentState, nlpResult)
      );
      
      if (conditionsMet) {
        // Führe Aktionen aus, falls vorhanden
        if (transition.actions && transition.actions.length > 0) {
          this.executeActions(transition.actions, contextId);
        }
        
        // Transition-Ereignis auslösen
        this.emitEvent(DialogEventType.TRANSITION_EXECUTED, {
          contextId,
          from: currentStateId,
          to: transition.targetState,
          source: transition.source,
          triggeredBy: input
        });
        
        return transition.targetState;
      }
    }
    
    // Kein passender Übergang gefunden
    return null;
  }

  /**
   * Führt eine Liste von Aktionen für einen Dialog aus
   * @param actions Die auszuführenden Aktionen
   * @param contextId Die Dialog-Kontext-ID
   */
  private executeActions(actions: DialogAction[], contextId: string): void {
    const dialogContext = this.dialogContexts.get(contextId);
    if (!dialogContext) return;
    
    for (const action of actions) {
      try {
        // In einer realen Implementierung würden hier die eigentlichen Aktionen ausgeführt
        // z.B. API-Aufrufe, Datenbankoperationen, etc.
        console.log(`[DialogStateManager] Führe Aktion aus: ${action} (Session: ${contextId})`);
        
        // Beispiel für einfache Variable-Set-Aktion
        if (action.startsWith('set:')) {
          const parts = action.split(':');
          if (parts.length >= 3) {
            const [_, key, value] = parts;
            if (key) {
              dialogContext.variables.set(key, value);
            }
          }
        }
        
        // Beispiel für eine Clear-Aktion
        if (action === 'clear_collected_data') {
          dialogContext.collectedData.clear();
        }
        
      } catch (error) {
        console.error(`[DialogStateManager] Fehler bei Ausführung der Aktion ${action}:`, error);
      }
    }
  }

  /**
   * Erzeugt eine Standardantwort, wenn kein passender ResponseGenerator gefunden wurde
   * @param state Der aktuelle Zustand
   * @param nlpResult Das NLP-Ergebnis
   * @returns Eine Standard-Dialogantwort
   */
  private createDefaultResponse(
    state: DialogStateNode, 
    nlpResult: NLPProcessingResult
  ): DialogResponse {
    const contextInfo = extractRelevantContextForResponse(nlpResult.context);
    
    let responseText = "";
    
    // Generiere eine passende Antwort basierend auf Zustandsinformation
    if (state.isFinal) {
      responseText = "Vielen Dank! Wir haben unser Gespräch abgeschlossen.";
    } else if (state.requiredEntities && state.requiredEntities.length > 0) {
      // Für Zustände, die Entitäten sammeln
      const missingEntity = state.requiredEntities[0]; // Einfach die erste fehlende Entität
      if (missingEntity) {
        responseText = `Könnten Sie mir bitte Informationen zu ${this.formatEntityName(missingEntity)} geben?`;
      } else {
        responseText = "Könnten Sie mir bitte mehr Informationen geben?";
      }
    } else {
      // Allgemeine Fallback-Antwort
      responseText = "Wie kann ich Ihnen weiterhelfen?";
    }
    
    return {
      text: responseText,
      needsMoreInfo: !!state.requiredEntities,
      requiredEntities: state.requiredEntities,
      metadata: {
        stateId: state.id,
        stateName: state.name,
        isDefault: true,
        contextType: contextInfo.contextType
      }
    };
  }

  /**
   * Formatiert einen Entitäts-Typen für die Anzeige
   * @param entityType Der zu formatierende Entity-Typ
   * @returns Der formatierte Name
   */
  private formatEntityName(entityType: string): string {
    // Einfache Formatierung durch Ersetzen von Unterstrichen und Großschreibung
    return entityType
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Richtet einen Timeout für einen Zustand ein
   * @param contextId Die Dialog-Kontext-ID
   * @param state Der Zustand
   */
  private setupStateTimeout(contextId: string, state: DialogStateNode): void {
    // Bereinige vorhandene Timeouts
    this.clearStateTimeout(contextId);
    
    // Verwende zustandsspezifischen Timeout oder Standard-Timeout
    const timeoutMs = state.timeoutMs || this.config.defaultTimeout;
    
    // Setze neuen Timeout
    const timeoutHandler = setTimeout(() => {
      this.handleStateTimeout(contextId, state.id);
    }, timeoutMs);
    
    // Speichere Timeout-Handler
    this.timeoutHandlers.set(contextId, timeoutHandler);
  }

  /**
   * Entfernt einen bestehenden Timeout für einen Dialog
   * @param contextId Die Dialog-Kontext-ID
   */
  private clearStateTimeout(contextId: string): void {
    const existingTimeout = this.timeoutHandlers.get(contextId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.timeoutHandlers.delete(contextId);
    }
  }

  /**
   * Behandelt einen Timeout-Event für einen Zustand
   * @param contextId Die Dialog-Kontext-ID
   * @param stateId Die Zustand-ID
   */
  private handleStateTimeout(contextId: string, stateId: string): void {
    const dialogContext = this.dialogContexts.get(contextId);
    const dialogFlow = this.activeDialogs.get(contextId);
    
    if (!dialogContext || !dialogFlow) return;
    
    // Prüfe, ob der Dialog sich noch im selben Zustand befindet
    if (dialogContext.currentState !== stateId) return;
    
    console.log(`[DialogStateManager] Timeout für Zustand: ${stateId} (Session: ${contextId})`);
    
    // Auslösen des Timeout-Ereignisses
    this.emitEvent(DialogEventType.TIMEOUT, {
      contextId,
      stateId,
      elapsedTime: Date.now() - dialogContext.lastActiveTime
    });
    
    // Hier könnten weitere Aktionen ausgeführt werden, wie z.B.
    // automatische Transitionen, Erinnerungsnachrichten, etc.
  }

  /**
   * Bereinigt inaktive Dialoge
   */
  private cleanupInactiveDialogs(): void {
    const now = Date.now();
    const contextsToRemove: string[] = [];
    
    // Finde alle inaktiven Dialoge
    this.dialogContexts.forEach((context, contextId) => {
      const inactiveTime = now - context.lastActiveTime;
      if (inactiveTime > this.config.maxInactivityTime) {
        contextsToRemove.push(contextId);
      }
    });
    
    // Entferne inaktive Dialoge
    for (const contextId of contextsToRemove) {
      this.clearStateTimeout(contextId);
      this.activeDialogs.delete(contextId);
      this.dialogContexts.delete(contextId);
      console.log(`[DialogStateManager] Inaktiver Dialog entfernt: ${contextId}`);
    }
  }

  /**
   * Prüft, ob ein Dialog aktiv ist
   * @param contextId Die Dialog-Kontext-ID
   * @returns True, wenn der Dialog aktiv ist
   */
  public isDialogActive(contextId: string): boolean {
    return this.dialogContexts.has(contextId) && this.activeDialogs.has(contextId);
  }

  /**
   * Gibt den aktuellen Zustand eines Dialogs zurück
   * @param contextId Die Dialog-Kontext-ID
   * @returns Der aktuelle Zustand oder null, wenn der Dialog nicht existiert
   */
  public getCurrentState(contextId: string): DialogStateNode | null {
    const dialogContext = this.dialogContexts.get(contextId);
    const dialogFlow = this.activeDialogs.get(contextId);
    
    if (!dialogContext || !dialogFlow) return null;
    
    const currentStateId = dialogContext.currentState;
    return dialogFlow.states.get(currentStateId) || null;
  }

  /**
   * Gibt den Kontext eines Dialogs zurück
   * @param contextId Die Dialog-Kontext-ID
   * @returns Der Dialogkontext oder null, wenn der Dialog nicht existiert
   */
  public getDialogContext(contextId: string): DialogContext | null {
    return this.dialogContexts.get(contextId) || null;
  }

  /**
   * Beendet einen Dialog
   * @param contextId Die Dialog-Kontext-ID
   * @param reason Optionaler Grund für die Beendigung
   * @returns True, wenn der Dialog erfolgreich beendet wurde
   */
  public endDialog(contextId: string, reason?: string): boolean {
    const dialogContext = this.dialogContexts.get(contextId);
    const dialogFlow = this.activeDialogs.get(contextId);
    
    if (!dialogContext || !dialogFlow) return false;
    
    // Cleanup
    this.clearStateTimeout(contextId);
    this.activeDialogs.delete(contextId);
    this.dialogContexts.delete(contextId);
    
    // Ereignis auslösen
    this.emitEvent(DialogEventType.DIALOG_COMPLETED, {
      contextId,
      reason: reason || 'manually_ended',
      finalState: dialogContext.currentState
    });
    
    console.log(`[DialogStateManager] Dialog beendet: ${contextId} (Grund: ${reason || 'manuell'})`);
    return true;
  }

  /**
   * Fügt einen Event-Listener hinzu
   * @param eventType Der Ereignistyp
   * @param listener Der Ereignis-Listener
   */
  public addEventListener(eventType: DialogEventType, listener: DialogEventListener): void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.push(listener);
    this.eventListeners.set(eventType, listeners);
  }

  /**
   * Entfernt einen Event-Listener
   * @param eventType Der Ereignistyp
   * @param listener Der zu entfernende Ereignis-Listener
   */
  public removeEventListener(eventType: DialogEventType, listener: DialogEventListener): void {
    const listeners = this.eventListeners.get(eventType) || [];
    const newListeners = listeners.filter(l => l !== listener);
    this.eventListeners.set(eventType, newListeners);
  }

  /**
   * Löst ein Ereignis aus
   * @param eventType Der Ereignistyp
   * @param data Die Ereignisdaten
   */
  private emitEvent(eventType: DialogEventType, data: any): void {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`[DialogStateManager] Fehler in Event-Listener für ${eventType}:`, error);
      }
    });
  }

  /**
   * Validiert einen Dialogflow
   * @param flow Der zu validierende Flow
   */
  private validateFlow(flow: DialogFlow): void {
    // Grundlegende Validierung
    if (!flow.id) throw new Error('Flow muss eine ID haben');
    if (!flow.name) throw new Error('Flow muss einen Namen haben');
    if (!flow.states || flow.states.size === 0) 
      throw new Error('Flow muss mindestens einen Zustand haben');
    if (!flow.initialStates || flow.initialStates.length === 0)
      throw new Error('Flow muss mindestens einen Initialzustand haben');
      
    // Prüfe, ob alle referenzierten Zustände existieren
    flow.initialStates.forEach(stateId => {
      if (!flow.states.has(stateId)) 
        throw new Error(`Initialzustand ${stateId} existiert nicht im Flow`);
    });
    
    flow.finalStates.forEach(stateId => {
      if (!flow.states.has(stateId)) 
        throw new Error(`Finalzustand ${stateId} existiert nicht im Flow`);
    });
    
    // Prüfe alle Transitionen
    flow.states.forEach((state, stateId) => {
      state.transitions.forEach(transition => {
        if (!flow.states.has(transition.targetState))
          throw new Error(`Zielzustand ${transition.targetState} für Transition aus ${stateId} existiert nicht`);
      });
    });
  }
  
  /**
   * Erstellt einen neuen Dialog-Zustand
   * @param id Die Zustands-ID
   * @param name Der Name des Zustands
   * @param responseGenerators Die Antwortgeneratoren für diesen Zustand
   * @param options Weitere Optionen für den Zustand
   * @returns Der erstellte Zustand
   */
  public static createState(
    id: DialogState,
    name: string,
    responseGenerators: ResponseGenerator[],
    options?: Partial<Omit<DialogStateNode, 'id' | 'name' | 'responseGenerators' | 'transitions'>>
  ): DialogStateNode {
    return {
      id,
      name,
      responseGenerators,
      transitions: [],
      ...options
    };
  }
  
  /**
   * Erstellt eine neue Antwortgenerator-Funktion
   * @param condition Die Bedingung für den Generator
   * @param generator Die Generator-Funktion
   * @param priority Die Priorität des Generators
   * @returns Der erstellte ResponseGenerator
   */
  public static createResponseGenerator(
    condition: DialogCondition,
    generator: (
      input: string, 
      state: DialogStateNode, 
      context: DialogContext, 
      nlpResult: NLPProcessingResult
    ) => Promise<DialogResponse>,
    priority: number = 0
  ): ResponseGenerator {
    return {
      condition,
      generate: generator,
      priority
    };
  }
  
  /**
   * Erstellt eine neue Transition zwischen Zuständen
   * @param targetState Der Zielzustand
   * @param conditions Die Bedingungen für den Übergang
   * @param options Weitere Optionen für die Transition
   * @returns Die erstellte Transition
   */
  public static createTransition(
    targetState: DialogState,
    conditions: DialogCondition[],
    options?: Partial<Omit<StateTransition, 'targetState' | 'conditions'>>
  ): StateTransition {
    return {
      targetState,
      conditions,
      priority: options?.priority || 0,
      ...options
    };
  }
  
  /**
   * Bedingungsfunktion, die auf die Erkennung eines bestimmten Intents prüft
   * @param intentName Der zu prüfende Intent-Name
   * @param minConfidence Die Mindestkonfidenz (optional)
   * @returns Eine Bedingungsfunktion
   */
  public static intentCondition(intentName: string, minConfidence: number = 0.6): DialogCondition {
    return (_input, _state, nlpResult) => {
      const intent = nlpResult.intent;
      return (
        !!intent && 
        intent.name === intentName && 
        (intent.confidence !== undefined && intent.confidence >= minConfidence)
      );
    };
  }
  
  /**
   * Bedingungsfunktion, die auf das Vorhandensein einer bestimmten Entität prüft
   * @param entityType Der zu prüfende Entity-Typ
   * @param minConfidence Die Mindestkonfidenz (optional)
   * @returns Eine Bedingungsfunktion
   */
  public static entityCondition(entityType: string, minConfidence: number = 0.6): DialogCondition {
    return (_input, _state, nlpResult) => {
      return nlpResult.entities.some(
        entity => entity.type === entityType && ((entity.confidence ?? 0) >= minConfidence)
      );
    };
  }
  
  /**
   * Bedingungsfunktion, die auf einen bestimmten Kontext prüft
   * @param contextName Der zu prüfende Kontext-Name
   * @param minConfidence Die Mindestkonfidenz (optional)
   * @returns Eine Bedingungsfunktion
   */
  public static contextCondition(contextName: string, minConfidence: number = 0.6): DialogCondition {
    return (_input, _state, nlpResult) => {
      const context = nlpResult.context;
      return (
        !!context && 
        context.name === contextName && 
        (context.confidence >= minConfidence)
      );
    };
  }
  
  /**
   * Bedingungsfunktion, die Text-Pattern mit regulären Ausdrücken prüft
   * @param pattern Das zu prüfende Regex-Pattern
   * @returns Eine Bedingungsfunktion
   */
  public static patternCondition(pattern: RegExp): DialogCondition {
    return (input, _state, _nlpResult) => {
      return pattern.test(input);
    };
  }
  
  /**
   * Immer-wahr-Bedingung für Default-Übergänge oder -Antworten
   * @returns Eine Bedingungsfunktion, die immer true zurückgibt
   */
  public static alwaysCondition(): DialogCondition {
    return () => true;
  }
  
  /**
   * Kombiniert mehrere Bedingungen mit logischem UND
   * @param conditions Die zu kombinierenden Bedingungen
   * @returns Eine kombinierte Bedingungsfunktion
   */
  public static andConditions(...conditions: DialogCondition[]): DialogCondition {
    return (input, state, nlpResult) => {
      return conditions.every(condition => condition(input, state, nlpResult));
    };
  }
  
  /**
   * Kombiniert mehrere Bedingungen mit logischem ODER
   * @param conditions Die zu kombinierenden Bedingungen
   * @returns Eine kombinierte Bedingungsfunktion
   */
  public static orConditions(...conditions: DialogCondition[]): DialogCondition {
    return (input, state, nlpResult) => {
      return conditions.some(condition => condition(input, state, nlpResult));
    };
  }

  // =================================================================
  // NEW METHODS TO MATCH THE INTERFACE EXPECTED BY CONVERSATIONPLANNER
  // =================================================================

  /**
   * Gibt den DialogState für die ConversationPlanner-Komponente zurück
   * @param sessionId Die Session-ID
   * @returns DialogState im ConversationPlanner-Format oder null
   */
  public getDialogState(sessionId: string): PlannerDialogState {
    // Prüfe, ob wir bereits einen State für diese Session haben
    let plannerState = this.plannerDialogStates.get(sessionId);
    
    if (!plannerState) {
      // Erstelle einen neuen State
      plannerState = {
        activeFlows: []
      };
      this.plannerDialogStates.set(sessionId, plannerState);
    }
    
    return plannerState;
  }

  /**
   * Startet einen Dialog-Flow im ConversationPlanner-Format
   * @param sessionId Die Session-ID
   * @param flowId Die Flow-ID
   * @param initialStepId Die ID des ersten Schritts
   * @param metadata Metadata für den Flow
   * @returns Ob der Flow erfolgreich gestartet wurde
   */
  public startFlow(
    sessionId: string, 
    flowId: string, 
    initialStepId: string, 
    metadata?: Record<string, any>
  ): boolean {
    try {
      // Hole den Dialog-State
      let plannerState = this.getDialogState(sessionId);
      
      // Füge den Flow zu den aktiven Flows hinzu
      plannerState.activeFlows.push({
        flowId,
        currentStepId: initialStepId,
        metadata
      });
      
      console.log(`[DialogStateManager] Flow gestartet: ${flowId}, initialStep: ${initialStepId} (Session: ${sessionId})`);
      
      return true;
    } catch (error) {
      console.error(`[DialogStateManager] Fehler beim Starten des Flows:`, error);
      return false;
    }
  }

  /**
   * Aktualisiert den aktuellen Schritt in einem Flow
   * @param sessionId Die Session-ID
   * @param flowId Die Flow-ID
   * @param stepId Die neue Step-ID
   * @returns Ob der Step erfolgreich aktualisiert wurde
   */
  public updateFlowStep(
    sessionId: string, 
    flowId: string, 
    stepId: string
  ): boolean {
    try {
      // Hole den Dialog-State
      let plannerState = this.getDialogState(sessionId);
      
      // Finde den Flow
      const flowIndex = plannerState.activeFlows.findIndex(f => f.flowId === flowId);
      
      if (flowIndex === -1) {
        console.warn(`[DialogStateManager] Flow nicht gefunden: ${flowId} (Session: ${sessionId})`);
        return false;
      }
      
      // Sicherstellen, dass der Flow-Eintrag existiert
      if (plannerState.activeFlows[flowIndex]) {
        // Aktualisiere den Schritt
        plannerState.activeFlows[flowIndex].currentStepId = stepId;
        
        console.log(`[DialogStateManager] Flow-Schritt aktualisiert: ${flowId}, newStep: ${stepId} (Session: ${sessionId})`);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`[DialogStateManager] Fehler beim Aktualisieren des Flow-Schritts:`, error);
      return false;
    }
  }

  /**
   * Beendet einen Flow
   * @param sessionId Die Session-ID
   * @param flowId Die Flow-ID
   * @returns Ob der Flow erfolgreich beendet wurde
   */
  public endFlow(sessionId: string, flowId: string): boolean {
    try {
      // Hole den Dialog-State
      let plannerState = this.getDialogState(sessionId);
      
      // Entferne den Flow aus den aktiven Flows
      const flowIndex = plannerState.activeFlows.findIndex(f => f.flowId === flowId);
      
      if (flowIndex === -1) {
        console.warn(`[DialogStateManager] Flow nicht gefunden: ${flowId} (Session: ${sessionId})`);
        return false;
      }
      
      // Entferne den Flow
      plannerState.activeFlows.splice(flowIndex, 1);
      
      console.log(`[DialogStateManager] Flow beendet: ${flowId} (Session: ${sessionId})`);
      
      return true;
    } catch (error) {
      console.error(`[DialogStateManager] Fehler beim Beenden des Flows:`, error);
      return false;
    }
  }
}

// Export einer Singleton-Instanz
export const dialogStateManager = new DialogStateManager();

export default dialogStateManager;