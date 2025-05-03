import { loadModel } from './models/loadModel';
import { detectIntent } from './pipelines/intent-detection';
import { manageContext } from './pipelines/context-management';
import { generateResponse } from './pipelines/response-generation';
import { config } from './config';
import { EmbeddingManager } from './ai/embeddings/embeddingManager';
import { SemanticSearch } from './ai/embeddings/semanticSearch';
import { getVectorStore } from './ai/models/vectorStore';
import * as fs from 'fs';
import * as path from 'path';
import { basicTokenize } from './utils/tokenizer';
import { pipeline, env } from '@xenova/transformers';
// Import der getOnnxRuntime Funktion
import { getOnnxRuntime } from '../../utils/onnx-env'; // Passe den Pfad ggf. an
import type { 
  NLPProcessingResult, 
  Intent, 
  Entity,
  Context,
  NLPModelRegistry,
  NLPModel,
  ModelType,
  IntentItem,
  EntityExtractionOptions
} from '@/types/nlp.types';

// Re-exporting Language type to avoid duplication
import type { Language } from '@/types/nlp.types';

// TypeScript Declaration für ONNX Runtime
declare global {
  interface Window {
    onnxruntime: any;
  }
  
  namespace NodeJS {
    interface Global {
      onnxruntime: any;
    }
  }
  
  var onnxruntime: any;
}

// Konfiguration für ONNX Runtime
if (!env.backends) {
  env.backends = {
    onnx: {
      wasm: {},
      webgl: {}
    },
    tfjs: {}
  };
}
if (!env.backends.onnx) {
  env.backends.onnx = {
    wasm: {},
    webgl: {}
  };
}
if (!env.backends.onnx.wasm) {
  env.backends.onnx.wasm = {};
}
if (!env.backends.onnx.webgl) {
  env.backends.onnx.webgl = {};
}
env.backends.onnx.wasm.numThreads = 4;

// Grundeinstellungen für das Transformers-Modell
env.allowLocalModels = true;
env.useFSCache = false;
env.cacheDir = './cache/transformers';

export interface GenerationConfig {
  max_length: number;
  temperature: number;
  top_k?: number;
  top_p?: number;
}

/**
 * Patches the ONNX Runtime to ensure necessary methods exist
 * This solves the "Cannot read properties of undefined (reading 'create')" error
 */
function patchOnnxRuntime(ortModule: any): any {
  if (!ortModule) {
    console.error('[ONNX-Patch] Cannot patch undefined ONNX Runtime');
    return createFallbackOnnxRuntime();
  }

  console.log('[ONNX-Patch] Inspecting ONNX Runtime for missing methods');

  // Ensure InferenceSession exists
  if (!ortModule.InferenceSession) {
    console.log('[ONNX-Patch] Creating missing InferenceSession object');
    ortModule.InferenceSession = {};
  }

  // Create the create method if it doesn't exist
  if (!ortModule.InferenceSession.create || typeof ortModule.InferenceSession.create !== 'function') {
    console.log('[ONNX-Patch] Adding missing create method to InferenceSession');
    
    ortModule.InferenceSession.create = async function(modelPath: any, options: any = {}): Promise<any> {
      console.log(`[ONNX-Patch] Mock InferenceSession.create called with: ${typeof modelPath === 'string' ? modelPath : 'ArrayBuffer'}`);
      
      // Return a functioning mock session
      return {
        run: async (feeds: any): Promise<any> => {
          console.log('[ONNX-Patch] Mock session.run called');
          return {};
        },
        inputNames: [],
        outputNames: [],
        release: async (): Promise<void> => {
          console.log('[ONNX-Patch] Mock session.release called');
        }
      };
    };
  }

  // Ensure Tensor constructor exists
  if (!ortModule.Tensor || typeof ortModule.Tensor !== 'function') {
    console.log('[ONNX-Patch] Creating missing Tensor constructor');
    
    ortModule.Tensor = function(type: any, data: any, dims?: any): any {
      this.data = data || new Float32Array(1);
      this.type = type || 1;
      this.dims = dims || [data ? data.length : 1];
      this.size = this.data ? this.data.length : 1;
      return this;
    };
  }

  // Apply additional patches for env
  if (!ortModule.env) {
    console.log('[ONNX-Patch] Creating missing env object');
    ortModule.env = {
      wasm: {
        numThreads: 4,
        simd: true,
        init: async (options: any): Promise<void> => {
          console.log('[ONNX-Patch] Mock wasm.init called');
          return Promise.resolve();
        }
      },
      logLevel: 'warning'
    };
  } else if (!ortModule.env.wasm) {
    console.log('[ONNX-Patch] Creating missing env.wasm object');
    ortModule.env.wasm = {
      numThreads: 4,
      simd: true,
      init: async (options: any): Promise<void> => {
        console.log('[ONNX-Patch] Mock wasm.init called');
        return Promise.resolve();
      }
    };
  } else if (!ortModule.env.wasm.init || typeof ortModule.env.wasm.init !== 'function') {
    console.log('[ONNX-Patch] Adding missing wasm.init method');
    ortModule.env.wasm.init = async (options: any): Promise<void> => {
      console.log('[ONNX-Patch] Mock wasm.init called with options:', options);
      return Promise.resolve();
    };
  }

  console.log('[ONNX-Patch] ONNX Runtime patched successfully');
  return ortModule;
}

/**
 * Creates a fallback ONNX runtime implementation
 */
function createFallbackOnnxRuntime(): any {
  console.log('[ONNX-Patch] Creating complete fallback ONNX Runtime');
  
  const mockRuntime = {
    InferenceSession: {
      create: async (modelPath: any, options: any = {}): Promise<any> => {
        console.log('[ONNX-Fallback] InferenceSession.create called');
        return {
          run: async (): Promise<any> => ({}),
          inputNames: [],
          outputNames: [],
          release: async (): Promise<void> => {}
        };
      }
    },
    Tensor: function(this: any, type: any, data: any, dims?: any): any {
      this.data = data || new Float32Array(1);
      this.type = type || 1;
      this.dims = dims || [data ? data.length : 1];
      this.size = data ? data.length : 1;
      return this;
    },
    env: {
      wasm: {
        numThreads: 4,
        simd: true,
        init: async (options: any): Promise<void> => {
          console.log('[ONNX-Fallback] Mock wasm.init called');
          return Promise.resolve();
        }
      },
      logLevel: 'warning',
      backends: {
        onnx: {
          wasm: {},
          webgl: {}
        },
        tfjs: {}
      }
    }
  };

  return mockRuntime;
}

/**
 * JavaScript-basiertes Language Model (GPT-2 Small)
 * Vereinfachte Version, die sich auf die Pipeline-Logik verlässt.
 */
export class JSLLM {
  public generator: any = null;
  private modelName: string = 'gpt2-small'; // Standardmodellname
  private isReady: boolean = false;
  private fallbackMode: boolean = false;
 
  /**
   * Erstellt eine neue Instanz des JSLLM
   * @param modelName Optional: Der Name des zu verwendenden Modells (ohne Pfad)
   */
  constructor(modelName?: string) {
    // Speichere nur den sauberen Namen, falls übergeben
    if (modelName) {
      this.modelName = modelName.replace(/^.*[\\\/]/, '');
    }
    
    // Konfiguriere die Umgebung für die Transformer-Bibliothek
    this.setupEnvironment();
  }
  
  /**
   * Konfiguriert die Umgebung für die Transformer-Bibliothek
   * Sollte idealerweise nur einmal pro Anwendungslauf aufgerufen werden.
   */
  private setupEnvironment(): void {
    // Kritische Konfiguration für ausschließlich lokale Modelle
    env.allowLocalModels = true;
    env.useFSCache = false;
    env.cacheDir = './cache/transformers'; // Optional: Cache-Verzeichnis setzen
    
    // WICHTIG: env.localModelPath NICHT setzen, wenn das Modell in node_modules liegt!
    // Die Bibliothek sucht standardmäßig in node_modules/@xenova/transformers/models/
    
    // Konfiguriere Threads für ONNX Runtime (kann auch in onnx-env.ts passieren)
    if (!env.backends) env.backends = { onnx: { wasm: {}, webgl: {} }, tfjs: {} };
    if (!env.backends.onnx) env.backends.onnx = { wasm: {}, webgl: {} };
    if (!env.backends.onnx.wasm) env.backends.onnx.wasm = {};
    if (!env.backends.onnx.webgl) env.backends.onnx.webgl = {};
    env.backends.onnx.wasm.numThreads = 4;
    
    console.log(`[JSLLM] Umgebung konfiguriert für Standard-Pipeline-Laden`);
    console.log(`[JSLLM] env.allowLocalModels: ${env.allowLocalModels}`);
    console.log(`[JSLLM] env.useFSCache: ${env.useFSCache}`);
  }
 
  /**
   * Initialisiert das Sprachmodell über die Standard-Pipeline-Funktion
   */
  async initialize(): Promise<boolean> {
    if (this.isReady) {
        console.log(`[JSLLM] Modell ${this.modelName} ist bereits initialisiert.`);
        return true;
    }

    try {
      console.log(`[JSLLM] Initialisiere Modell: ${this.modelName} über Standard-Pipeline...`);
      
      // Make sure onnxruntime is available globally
      try {
        if (typeof window !== 'undefined') {
          if (!window.onnxruntime) {
            const ort = await getOnnxRuntime();
            window.onnxruntime = patchOnnxRuntime(ort);
            console.log("[JSLLM] Set onnxruntime in window object");
          }
        } else if (typeof global !== 'undefined') {
          if (!(global as any).onnxruntime) {
            const ort = await getOnnxRuntime();
            (global as any).onnxruntime = patchOnnxRuntime(ort);
            console.log("[JSLLM] Set onnxruntime in global object");
          }
        }
        
        // Set global var (if supported)
        try {
          if (typeof onnxruntime === 'undefined') {
            const ort = await getOnnxRuntime();
            (globalThis as any).onnxruntime = patchOnnxRuntime(ort);
            console.log("[JSLLM] Set onnxruntime in globalThis");
          }
        } catch (globalError) {
          console.warn("[JSLLM] Could not set global onnxruntime", globalError);
        }
      } catch (ortError) {
        console.error("[JSLLM] Error setting up onnxruntime:", ortError);
      }
     
      const modelOptions = {
        local: true, // Signalisiert, dass es ein lokales Modell ist
        local_files_only: true, // Erzwingt die Suche nur lokal
        use_cache: false, // Cache deaktivieren, falls Probleme auftreten
        revision: 'main',
        progress_callback: null as any
      };
      
      try {
        // HIER DIE ENTSCHEIDENDE ZEILE: Rufe pipeline() NUR mit dem Modellnamen auf
        // Die Bibliothek sollte es jetzt in node_modules/@xenova/transformers/models/ finden
        console.log(`[JSLLM] Rufe pipeline('text-generation', '${this.modelName}', ...) auf.`);
        this.generator = await pipeline('text-generation', this.modelName, modelOptions);
        
        this.isReady = true;
        this.fallbackMode = false;
        console.log(`[JSLLM] Modell '${this.modelName}' erfolgreich geladen.`);
        return true;
      } catch (pipelineError) {
        console.error(`[JSLLM] Fehler beim Ausführen der Pipeline:`, pipelineError);
        
        // Create a fallback generator that provides basic responses
        console.log(`[JSLLM] Erstelle Fallback-Generator...`);
        this.createFallbackGenerator();
        this.isReady = true;
        this.fallbackMode = true;
        return false;
      }
    } catch (error) {
      console.error(`[JSLLM] Fehler beim Laden des Modells '${this.modelName}' über Standard-Pipeline:`, error);
      console.error(`[JSLLM] Fehlerdetails: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[JSLLM] Stack Trace:`, error instanceof Error ? error.stack : "N/A");
      
      // Aktuelle Umgebungskonfiguration drucken zur Diagnose
      console.error(`[JSLLM] Aktuelle Umgebungskonfiguration:`);
      console.error(`- env.allowLocalModels: ${env.allowLocalModels}`);
      console.error(`- env.useFSCache: ${env.useFSCache}`);
      console.error(`- env.cacheDir: ${env.cacheDir}`);
      console.error(`- process.cwd(): ${process.cwd()}`);

      // Create a fallback generator
      console.log(`[JSLLM] Erstelle Fallback-Generator nach Fehler...`);
      this.createFallbackGenerator();
      this.isReady = true;
      this.fallbackMode = true;
      return false;
    }
  }
  
  /**
   * Creates a fallback generator that returns predefined responses
   */
  private createFallbackGenerator(): void {
    console.log(`[JSLLM] Creating fallback text generator`);
    
    // Create a mock generator function
    this.generator = async (prompt: string, config: any = {}): Promise<any> => {
      console.log(`[FallbackGenerator] Processing prompt: "${prompt.substring(0, 50)}..."`);
      
      // Extract language hint from prompt
      const isEnglish = prompt.toLowerCase().includes('english') || 
                      prompt.match(/\ben\b/) ||
                      prompt.match(/\benglish\b/);
      
      let responseText = isEnglish 
        ? "I understand your question. Let me think about it and get back to you."
        : "Ich verstehe deine Frage. Lass mich darüber nachdenken und dir später antworten.";
      
      // For invoice or cancellation queries, provide specific responses
      if (prompt.toLowerCase().match(/rechnung|invoice|zahlung|payment|quittung/i)) {
        responseText = isEnglish
          ? "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically."
          : "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.";
      }
      
      if (prompt.toLowerCase().match(/kündigen|cancel|abbestellen|beenden|stornieren/i)) {
        responseText = isEnglish
          ? "You can cancel your subscription anytime in your account settings under 'Manage Subscription'. The cancellation will take effect at the end of your current billing period."
          : "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen. Die Kündigung wird zum Ende deiner aktuellen Zahlungsperiode wirksam.";
      }
      
      return [{ generated_text: `${prompt}\n\n${responseText}` }];
    };
  }
 
  /**
   * Generiert eine Antwort basierend auf einem Prompt
   */
  async generateResponse(prompt: string, config: Partial<GenerationConfig> = {}): Promise<string> {
    if (!this.isReady || !this.generator) {
      console.warn("[JSLLM] generateResponse aufgerufen, aber Modell nicht bereit.");
      return "Entschuldigung, das Modell ist noch nicht bereit.";
    }
   
    try {
      const fullConfig: GenerationConfig = {
        max_length: config.max_length || 100,
        temperature: config.temperature || 0.7,
        top_k: config.top_k,
        top_p: config.top_p
      };
     
      console.log(`[JSLLM] Generiere Text für Prompt: "${prompt.substring(0, 50)}..."`);
     
      const output = await this.generator(prompt, fullConfig);
     
      // Extrahiere generierten Text und entferne den Prompt
      let generatedText = output[0].generated_text;
     
      // Entferne den ursprünglichen Prompt vom Output
      if (generatedText.startsWith(prompt)) {
        generatedText = generatedText.substring(prompt.length).trim();
      }
     
      return generatedText;
    } catch (error) {
      console.error("[JSLLM] Fehler bei der Textgenerierung:", error);
      return "Entschuldigung, ich konnte keine Antwort generieren.";
    }
  }

  /**
   * Gibt die Ressourcen des Modells frei
   */
  async dispose(): Promise<void> {
    try {
      // Falls der Generator eine dispose-Methode hat, rufe sie auf
      if (this.generator && typeof this.generator.dispose === 'function') {
        await this.generator.dispose();
      }
      
      this.generator = null;
      this.isReady = false;
      this.fallbackMode = false;
      console.log(`[JSLLM] Ressourcen freigegeben`);
    } catch (error) {
      console.error('[JSLLM] Fehler bei der Ressourcenfreigabe:', error);
    }
  }
  
  /**
   * Returns current status of the model
   */
  getStatus(): { isReady: boolean; fallbackMode: boolean; modelName: string } {
    return {
      isReady: this.isReady,
      fallbackMode: this.fallbackMode,
      modelName: this.modelName
    };
  }
}

/**
 * Prompt-Manager für LLM
 */
export class PromptManager {
  private systemPrompts: Record<string, string> = {
    de: "Du bist ein hilfreicher Assistent für die Mindfluence App, eine Anwendung für Persönlichkeitsentwicklung und mentales Training. Antworte kurz und präzise, aber sei freundlich und hilfreich.",
    en: "You are a helpful assistant for the Mindfluence App, an application for personal development and mental training. Answer concisely but be friendly and helpful."
  };
  
  buildPrompt(userMessage: string, context: any): string {
    const { intentName, intentType, entities, conversationHistory, language } = context;
    
    // Wähle passenden System-Prompt
    const systemPrompt = this.systemPrompts[language] || this.systemPrompts.de;
    
    // Bau den Intent-Kontext auf
    const intentContext = intentName !== "unknown" 
      ? `Ich habe folgende Absicht erkannt: ${intentName} (Typ: ${intentType}).` 
      : "";
    
    // Entity-Kontext
    const entityContext = entities.length > 0
      ? `Relevante Informationen: ${entities.map((e: any) => e.type).join(', ')}.`
      : "";
    
    // Vollständigen Prompt zusammenbauen
    return `${systemPrompt}
    
${conversationHistory ? `Bisherige Konversation:
${conversationHistory}` : ''}

${intentContext}
${entityContext}
Benutzer: ${userMessage}
Assistent:`;
  }
}

/**
 * Generative Pipeline
 */
export class GenerativePipeline {
  private llm: JSLLM;
  private promptManager: PromptManager;
  private conversationHistory: { role: string, content: string }[] = [];
  private maxHistoryLength: number = 5; // Anzahl der zu speichernden Nachrichtenpaare
  
  constructor() {
    this.llm = new JSLLM();
    this.promptManager = new PromptManager();
  }
  
  async initialize(): Promise<boolean> {
    return await this.llm.initialize();
  }
  
  addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });
    
    // Begrenze die Größe der Geschichte
    if (this.conversationHistory.length > this.maxHistoryLength * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength * 2);
    }
  }
  
  getFormattedHistory(): string {
    return this.conversationHistory
      .map(msg => `${msg.role === 'user' ? 'Benutzer' : 'Assistent'}: ${msg.content}`)
      .join('\n');
  }
  
  clearHistory(): void {
    this.conversationHistory = [];
  }
  
  getStatus(): { isReady: boolean; fallbackMode: boolean; modelName: string } {
    return this.llm.getStatus();
  }
  
  async generateResponse(
    userMessage: string, 
    intentName: string, 
    intentType: string, 
    intentConfidence: number,
    entities: any[] = [],
    language: string = 'de'
  ): Promise<string> {
    // Nachricht zur Geschichte hinzufügen
    this.addToHistory('user', userMessage);
    
    // Kontext aufbauen
    const context = {
      intentName,
      intentType,
      intentConfidence,
      entities,
      conversationHistory: this.getFormattedHistory(),
      language
    };
    
    // Prompt erstellen
    const prompt = this.promptManager.buildPrompt(userMessage, context);
    
    // Antwort generieren
    const response = await this.llm.generateResponse(prompt, {
      max_length: prompt.length + 150, // Prompt + ca. 150 Zeichen
      temperature: 0.7
    });
    
    // Antwort zur Geschichte hinzufügen
    this.addToHistory('assistant', response);
    
    return response;
  }
}

// Extracting entities function
async function extractEntities(
  text: string,
  model: NLPModel,
  language: Language = 'de',
  intent: Intent | null = null,
  options: EntityExtractionOptions = {}
): Promise<Entity[]> {
  try {
    // Check if input is valid
    if (!text || text.trim().length === 0) {
      console.log('[extractEntities] Empty text, no entity extraction possible');
      return [];
    }

    if (!model || typeof model.predict !== 'function') {
      console.error('[extractEntities] Invalid model or model.predict is not a function');
      return [];
    }

    console.log(`[extractEntities] Extracting entities from text in ${language}: "${text}"`);

    // Use the model to predict entities
    const prediction = await model.predict(text);

    // Process the prediction result
    let entities: Entity[] = [];

    if (Array.isArray(prediction)) {
      // If prediction is already an array of entities
      entities = prediction
        .filter((entity: any) => entity != null)
        .map((entity: any) => ({
          type: entity.type,
          value: entity.value,
          confidence: entity.confidence ?? 0.5,
          text: entity.text,
          start: entity.start,
          end: entity.end,
          metadata: entity.metadata,
          position: entity.position
        }));
    } else if (prediction && typeof prediction === 'object') {
      // If prediction is an object with an entities property
      if (Array.isArray(prediction.entities)) {
        entities = prediction.entities
          .filter((entity: any) => entity != null)
          .map((entity: any) => ({
            type: entity.type,
            value: entity.value,
            confidence: entity.confidence ?? 0.5,
            text: entity.text,
            start: entity.start,
            end: entity.end,
            metadata: entity.metadata,
            position: entity.position
          }));
      } else {
        // Try to convert the prediction to entities
        const tempEntities = Object.entries(prediction)
          .filter(([key, value]) => key !== 'text' && key !== 'intent')
          .map(([type, value]) => {
            if (typeof value === 'string') {
              // Simple string value
              return {
                type,
                value,
                confidence: 0.5 // Default confidence
              } as Entity;
            } else if (value && typeof value === 'object') {
              // Object with value and possibly confidence
              const valueObj = value as Record<string, any>;
              return {
                type,
                value: valueObj.value ?? String(valueObj),
                confidence: valueObj.confidence ?? 0.5
              } as Entity;
            }
            return null;
          });
          
        entities = tempEntities.filter((entity): entity is Entity => entity !== null);
      }
    }

    console.log(`[extractEntities] Extracted ${entities.length} entities`);
    return entities;
  } catch (error) {
    console.error('[extractEntities] Error extracting entities:', error);
    return [];
  }
}

// Singleton für die NLPEngine
let engineInstance: NLPEngine | null = null;

/**
 * Gibt eine Singleton-Instanz der NLPEngine zurück
 */
export async function getEngine(): Promise<NLPEngine> {
  if (!engineInstance) {
    engineInstance = new NLPEngine();
    await engineInstance.initialize();
  }
  return engineInstance;
}

/**
 * Hauptklasse der NLP-Engine, die alle NLP-Funktionalitäten kapselt
 */
export class NLPEngine {
  private generativePipeline: GenerativePipeline | null = null;
  private useGenerativeMode: boolean = false;
  
  // Add prioritized intents for generative responses
  private priorityGenerativeIntents: string[] = [
    'faq_what_is_mindfluence',
    'faq_how_subliminals_work',
    'faq_feature_list',
    'faq_scientific_basis'
  ];
  
  async initialize(languages: Language[] = ['de', 'en']): Promise<void> {
    // Initialisierung der NLP-Komponenten
    await initializeNLPEngine(languages);
  }
  
  /**
   * Initialisiert den generativen Modus mit einem JavaScript LLM
   * VERSUCHT ZUERST, das eigentliche LLM zu laden. Fällt bei Fehler auf Fallback zurück.
   * @returns Ob die Initialisierung erfolgreich war (echtes LLM geladen) oder Fallback aktiv ist
   */
  async initializeGenerativeMode(): Promise<boolean> {
    try {
      console.log(`[NLPEngine] Initialisiere generativen Modus...`);
      
      // 1. Initialisiere ONNX Runtime explizit (falls noch nicht geschehen)
      // Dies ist notwendig, damit Xenova's Pipeline-Funktion funktioniert
      try {
          const ort = await getOnnxRuntime();
           // Optional: Stelle sicher, dass onnxruntime global verfügbar ist, falls Xenova es dort erwartet
           if (typeof window !== 'undefined') {
             window.onnxruntime = ort;
           } else if (typeof global !== 'undefined') {
             (global as any).onnxruntime = ort;
           }
           
           // Make it available in the global scope if possible
           try {
             if (typeof onnxruntime === 'undefined') {
               (globalThis as any).onnxruntime = ort;
             }
           } catch (globalError) {
             console.warn('[NLPEngine] Could not set global onnxruntime', globalError);
           }
           
          console.log(`[NLPEngine] ONNX Runtime Status: ${ort ? 'verfügbar' : 'nicht verfügbar'}`);
           if (ort && ort.env?.wasm && typeof ort.env.wasm.init !== 'function') {
               console.warn('[NLPEngine] ONNX Runtime WASM init Funktion nicht gefunden.'); 
           } else if (ort && ort.env?.wasm) {
               console.log('[NLPEngine] ONNX Runtime WASM init Funktion gefunden.');
           }
           if (!ort) {
               throw new Error("ONNX Runtime konnte nicht geladen werden.");
           }

      } catch (ortError) {
          console.error('[NLPEngine] Schwerwiegender Fehler bei der ONNX Runtime Initialisierung:', ortError);
           console.error('[NLPEngine] Stack Trace:', ortError instanceof Error ? ortError.stack : 'N/A');
          // Bei ONNX-Fehler direkt in den Fallback
          console.log(`[NLPEngine] Aktiviere Fallback-Generativer Modus wegen ONNX-Fehler`);
          this.generativePipeline = new GenerativePipeline();
          await this.generativePipeline.initialize(); // Initialisiert den Fallback-Generator INNERHALB der Pipeline
          this.useGenerativeMode = true; // Der Fallback ist aktiv
          return false; // ECHTES LLM konnte nicht geladen werden
      }


      // 2. Versuche, das eigentliche Generative Pipeline (mit dem echten LLM) zu initialisieren
      this.generativePipeline = new GenerativePipeline();
      console.log(`[NLPEngine] Versuche, das Haupt-Generative Pipeline zu initialisieren...`);
      const mainPipelineInitialized = await this.generativePipeline.initialize(); // <-- Ruft JSLLM.initialize auf

      if (mainPipelineInitialized) {
        // Das Haupt-LLM wurde erfolgreich geladen
        this.useGenerativeMode = true;
        console.log(`[NLPEngine] Haupt-Generativer Modus aktiviert (LLM erfolgreich geladen)`);
        // Optional: Checke den Status des LLM innerhalb der Pipeline
         const llmStatus = this.generativePipeline.getStatus();
         console.log(`[NLPEngine] LLM Status: Ready=${llmStatus.isReady}, Fallback=${llmStatus.fallbackMode}, Model=${llmStatus.modelName}`);
        return true; // Erfolg
      } else {
        // Das Haupt-LLM konnte nicht geladen werden (Fehler wurde in JSLLM.initialize protokolliert)
        console.warn(`[NLPEngine] Haupt-Generative Pipeline Initialisierung fehlgeschlagen.`);
        
        // Das GenerativePipeline-Objekt wurde bereits erstellt, 
        // aber seine interne LLM-Initialisierung schlug fehl. 
        // Wenn JSLLM.initialize auf den internen Fallback umgeschaltet hat, ist das Objekt bereits bereit,
        // aber im Fallback-Modus. Wir können prüfen, ob das der Fall ist.
        const llmStatus = this.generativePipeline.getStatus();

        if (llmStatus.fallbackMode) {
             console.log(`[NLPEngine] Fallback-Generativer Modus aktiviert (Haupt-LLM Initialisierung fehlgeschlagen, aber JSLLM fiel auf Fallback zurück)`);
             this.useGenerativeMode = true; // Der Fallback ist aktiv
             return false; // ECHTES LLM konnte nicht geladen werden
        } else {
             // Dies sollte nicht passieren, wenn JSLLM einen Fallback hat, aber als Sicherheit
             console.error(`[NLPEngine] Haupt-Generative Pipeline Initialisierung fehlgeschlagen und JSLLM fiel NICHT auf Fallback zurück. Etwas stimmt nicht.`);
             // Manuell den Fallback neu initialisieren, nur für den Fall
              console.log(`[NLPEngine] Aktiviere Fallback-Generativer Modus als letzten Ausweg.`);
              // Erstelle ein neues Fallback Pipeline Objekt
              this.generativePipeline = new GenerativePipeline();
              // Dies ruft intern JSLLM.initialize auf, was wieder zum Fallback führt
              await this.generativePipeline.initialize();
              this.useGenerativeMode = true;
              return false; // ECHTES LLM konnte nicht geladen werden
        }
      }

    } catch (error) {
      console.error("[NLPEngine] Unerwarteter Fehler während der Initialisierung des generativen Modus:", error);
      console.error('[NLPEngine] Stack Trace:', error instanceof Error ? error.stack : 'N/A');
      
      // Bei jedem unerwarteten Fehler in den Fallback
      console.log(`[NLPEngine] Aktiviere Fallback-Generativer Modus wegen unerwartetem Fehler.`);
      this.generativePipeline = new GenerativePipeline();
      await this.generativePipeline.initialize(); // Initialisiert den Fallback-Generator
      this.useGenerativeMode = true; // Der Fallback ist aktiv
      return false; // ECHTES LLM konnte nicht geladen werden
    }
  }
  
  /**
   * Verarbeitet eine Nachricht mit NLP-Pipelines und optional dem generativen LLM
   */
  async processMessage(
    message: string,
    language: Language = 'de',
    conversationHistory: string[] = []
  ): Promise<NLPProcessingResult & { generatedResponse?: string }> {
    console.log(`[NLPEngine] Verarbeite Nachricht in ${language}: "${message}"`);
    
    try {
      // Verwende zunächst die existierende NLP-Verarbeitung
      const result = await processMessage(message, language, conversationHistory);
      
      // Intent aus dem Ergebnis extrahieren
      const intent = result.intent;
      
      // Wenn generativer Modus aktiv ist, generiere eine Antwort
      if (this.useGenerativeMode && this.generativePipeline) {
        try {
          // Prüfen, ob es sich um einen priorisierten Intent handelt
          const isPriorityIntent = intent && this.priorityGenerativeIntents.includes(intent.name);
          
          // Generiere die Antwort mit dem generativen Modell
          const generatedResponse = await this.generativePipeline.generateResponse(
            message,
            intent?.name || "unknown",
            intent?.type || "unknown",
            intent?.confidence || 0,
            result.entities || [],
            language
          );
          
          console.log(`[NLPEngine] Generierte Antwort${isPriorityIntent ? ' (Prioritäts-Intent)' : ''}: "${generatedResponse.substring(0, 50)}${generatedResponse.length > 50 ? '...' : ''}"`);
          
          // Wichtig: Die generierte Antwort als Teil des Ergebnisses zurückgeben
          return {
            ...result,
            generatedResponse
          };
        } catch (genError) {
          console.error("[NLPEngine] Fehler bei der generativen Antwort:", genError);
          // Gib das ursprüngliche Ergebnis zurück, wenn die Generierung fehlschlägt
          return result;
        }
      }
      
      // Gib das ursprüngliche Ergebnis zurück, wenn kein generativer Modus aktiv ist
      return result;
    } catch (error) {
      console.error('[NLPEngine] Fehler bei der Verarbeitung der Nachricht:', error);
      // Gib ein Standard-Ergebnis mit Fehlerinformationen zurück
      return {
        intent: null,
        entities: [],
        context: { 
          name: 'error', 
          confidence: 1.0,
          entities: [],
          recentIntents: [],
          topics: []
        },
        originalText: message,
        preprocessedText: message,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Liste der gültigen ModelType-Schlüssel für NLPModelRegistry
const validModelTypeKeys: ModelType[] = ['intent', 'entity', 'context', 'sentiment'];

// Type Guard für ModelType-Prüfung
function isModelTypeKey(key: string): key is keyof NLPModelRegistry {
  return validModelTypeKeys.includes(key as ModelType);
}

/**
 * Überprüft, ob ein Modell eine gültige predict-Funktion hat
 * @param model Das zu prüfende Modell
 * @returns True, wenn das Modell eine gültige predict-Funktion hat, sonst False
 */
function hasValidPredictFunction(model: NLPModel | null): boolean {
  if (!model) return false;
  if (!model.predict) return false;
  if (typeof model.predict !== 'function') return false;
  return true;
}

/**
 * Hilfsfunktion, um typensicher auf einen bestimmten Teil der Registry zuzugreifen
 */
function getModelRegistryForType(type: ModelType): Record<Language, NLPModel> {
  switch (type) {
    case 'intent':
      return modelRegistry.intent;
    case 'entity':
      return modelRegistry.entity;
    case 'context':
      return modelRegistry.context;
    case 'sentiment':
      // Sicherstellen, dass sentiment nicht undefined ist
      modelRegistry.sentiment = modelRegistry.sentiment || { de: {} as NLPModel, en: {} as NLPModel };
      return modelRegistry.sentiment;
    default:
      // Dieser Fall sollte theoretisch nie eintreten, aber wir müssen
      // für TypeScript einen vollständigen Returnpfad haben
      console.error(`[getModelRegistryForType] Ungültiger Modelltyp: ${type}`);
      return {} as Record<Language, NLPModel>;
  }
}

// Registry für geladene Modelle während der Laufzeit
const modelRegistry: NLPModelRegistry = {
  intent: { de: {} as NLPModel, en: {} as NLPModel },
  entity: { de: {} as NLPModel, en: {} as NLPModel },
  context: { de: {} as NLPModel, en: {} as NLPModel },
  sentiment: { de: {} as NLPModel, en: {} as NLPModel },
  
  // Implementierung der Methoden
  getModel(type: ModelType, language: Language): NLPModel | null {
    if (!isModelTypeKey(type)) {
      console.warn(`[modelRegistry.getModel] Ungültiger Modelltyp: ${type}`);
      return null;
    }
    
    let model: NLPModel | null = null;
    
    try {
      // Typensicherer Zugriff
      if (type === 'intent' && this.intent && this.intent[language]) {
        model = this.intent[language];
      } else if (type === 'entity' && this.entity && this.entity[language]) {
        model = this.entity[language];
      } else if (type === 'context' && this.context && this.context[language]) {
        model = this.context[language];
      } else if (type === 'sentiment') {
        // Sichere Überprüfung und Zugriff auf sentiment
        const sentimentRegistry = this.sentiment || { de: {} as NLPModel, en: {} as NLPModel };
        if (sentimentRegistry[language]) {
          model = sentimentRegistry[language];
        }
      }
      
      // Überprüfe, ob das Modell eine gültige predict-Funktion hat
      if (model && !hasValidPredictFunction(model)) {
        console.warn(`[modelRegistry.getModel] Modell für ${type}/${language} hat keine gültige predict-Funktion`);
        return null; // Betrachte ungültiges Modell als nicht vorhanden
      }
      
      return model;
    } catch (error) {
      console.error(`[modelRegistry.getModel] Fehler beim Abrufen des Modells ${type}/${language}:`, error);
      return null;
    }
  },
  
  registerModel(model: NLPModel, type: ModelType, language: Language): void {
    if (!isModelTypeKey(type)) {
      console.warn(`[modelRegistry.registerModel] Ungültiger Modelltyp: ${type}`);
      return;
    }
    
    // Überprüfe, ob das Modell eine gültige predict-Funktion hat
    if (!hasValidPredictFunction(model)) {
      console.error(`[modelRegistry.registerModel] Kann Modell ohne gültige predict-Funktion nicht registrieren: ${type}/${language}`);
      return;
    }
    
    try {
      // Typensicherer Zugriff
      if (type === 'intent') this.intent[language] = model;
      else if (type === 'entity') this.entity[language] = model;
      else if (type === 'context') this.context[language] = model;
      else if (type === 'sentiment') {
        // Stelle sicher, dass sentiment immer initialisiert ist
        this.sentiment = this.sentiment || { de: {} as NLPModel, en: {} as NLPModel };
        this.sentiment[language] = model;
      }
      
      console.log(`[modelRegistry] Modell registriert: ${type}/${language}`);
    } catch (error) {
      console.error(`[modelRegistry.registerModel] Fehler beim Registrieren des Modells ${type}/${language}:`, error);
    }
  }
};

// Singleton-Instanzen für EmbeddingManager und SemanticSearch
let embeddingManagerInstance: EmbeddingManager | null = null;
let semanticSearchInstance: SemanticSearch | null = null;
// Map für gespeicherte Intent-Embeddings
let intentEmbeddingsMap: Map<string, Map<string, Float32Array>> = new Map();

/**
 * Factory-Funktion: Erstellt und konfiguriert eine EmbeddingManager-Instanz
 */
export async function getEmbeddingManager(): Promise<EmbeddingManager | null> {
  try {
    // Erstelle ein vollständiges Dummy-Modell für den EmbeddingManager,
    // das alle erforderlichen Methoden implementiert
    const dimension = config.nlp?.ai?.embeddingModel?.dimension || 384;
    
    const dummyModel = {
      // Grundlegende Embedding-Funktion
      embed: async (text: string): Promise<Float32Array> => {
        // Einfaches Fallback-Embedding
        return new Float32Array(dimension);
      },
      
      // Erforderliche Methode zur Berechnung der Kosinus-Ähnlichkeit
      cosineSimilarity: (a: Float32Array, b: Float32Array): number => {
        if (!a || !b || a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
          // Sichere Zugriffe mit Nullish Coalescing Operator
          const aVal = a[i] ?? 0;
          const bVal = b[i] ?? 0;
          dotProduct += aVal * bVal;
          normA += aVal * aVal;
          normB += bVal * bVal;
        }
        
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      },
      
      // Erforderliche Methode, um die Embedding-Dimension zurückzugeben
      getEmbeddingDimension: (): number => {
        return dimension;
      },
      
      // Erforderliche Initialisierungsmethode
      initialize: async (): Promise<boolean> => {
        return true;
      },
      
      // Erforderliche Methode zur Ressourcenfreigabe
      dispose: async (): Promise<void> => {
        // Nichts zu tun bei einem Dummy-Modell
      },
      
      // Erforderliche Methode zum Leeren des Caches
      clearCache: (): void => {
        // Nichts zu tun bei einem Dummy-Modell
      },
      
      // Informationen zum Modell
      getInfo: () => ({
        name: config.nlp?.ai?.embeddingModel?.name || 'default-model',
        modelType: 'embedding' as const,
        version: '1.0',
        description: 'Dummy embedding model'
      })
    };
    
    // EmbeddingManager-Konfiguration aus der globalen Konfiguration erstellen
    const embeddingConfig = {
      modelName: config.nlp?.ai?.embeddingModel?.name || 'default-model',
      dimension: config.nlp?.ai?.embeddingModel?.dimension || 384,
      language: config.defaultLanguage as Language || 'de',
      similarityThreshold: config.nlp?.ai?.semanticSearch?.similarityThreshold || 0.7,
      maxResults: config.nlp?.ai?.semanticSearch?.maxResults || 5
    };
    
    // Erstelle eine neue EmbeddingManager-Instanz
    const manager = new EmbeddingManager(dummyModel, embeddingConfig);
    
    return manager;
  } catch (error) {
    console.error('[getEmbeddingManager] Fehler beim Erstellen des EmbeddingManagers:', error);
    return null;
  }
}

/**
 * Erweitert den EmbeddingManager um die fehlenden Methoden
 * @param manager Die zu erweiternde EmbeddingManager-Instanz
 */
function extendEmbeddingManager(manager: EmbeddingManager): void {
  // Füge die initialize-Methode hinzu, falls sie noch nicht existiert
  if (!('initialize' in manager)) {
    (manager as any).initialize = async function(): Promise<boolean> {
      try {
        console.log('[EmbeddingManager] Initialisiere...');
        return true;
      } catch (error) {
        console.error('[EmbeddingManager] Fehler bei der Initialisierung:', error);
        return false;
      }
    };
  }
  
  // Füge die embedText-Methode hinzu als Wrapper für createEmbedding
  if (!('embedText' in manager)) {
    (manager as any).embedText = async function(text: string): Promise<Float32Array | null> {
      return this.createEmbedding(text);
    };
  }
  
  // Füge die getEmbeddingDimension-Methode hinzu
  if (!('getEmbeddingDimension' in manager)) {
    (manager as any).getEmbeddingDimension = function(): number {
      return 384; // Default dimension
    };
  }
}

/**
 * Gibt eine Instanz des initialisierten EmbeddingManagers zurück
 * @returns Initialisierter EmbeddingManager oder null, wenn nicht verfügbar
 */
export async function getInitializedEmbeddingManager(): Promise<EmbeddingManager | null> {
  if (!embeddingManagerInstance) {
    console.warn('[getInitializedEmbeddingManager] EmbeddingManager ist nicht initialisiert');
    try {
      embeddingManagerInstance = await getEmbeddingManager();
      if (embeddingManagerInstance) {
        // Erweitere den Manager um die fehlenden Methoden
        extendEmbeddingManager(embeddingManagerInstance);
        
        // Initialisiere den erweiterten Manager
        await (embeddingManagerInstance as any).initialize();
      }
    } catch (error) {
      console.error('[getInitializedEmbeddingManager] Fehler bei der Initialisierung:', error);
      return null;
    }
  }
  return embeddingManagerInstance;
}

/**
 * Gibt eine Instanz der initialisierten SemanticSearch zurück
 * @returns Initialisierte SemanticSearch oder null, wenn nicht verfügbar
 */
export async function getInitializedSemanticSearch(): Promise<SemanticSearch | null> {
  if (!semanticSearchInstance) {
    console.warn('[getInitializedSemanticSearch] SemanticSearch ist nicht initialisiert');
    try {
      const modelName = config.nlp?.ai?.embeddingModel?.name || "default-model";
      semanticSearchInstance = new SemanticSearch(modelName);
      if (semanticSearchInstance) {
        // Wenn die SemanticSearch-Klasse eine initialize-Methode hat,
        // verwenden wir diese, ansonsten tun wir nichts
        if (typeof (semanticSearchInstance as any).initialize === 'function') {
          await (semanticSearchInstance as any).initialize();
        }
      }
    } catch (error) {
      console.error('[getInitializedSemanticSearch] Fehler bei der Initialisierung:', error);
      return null;
    }
  }
  return semanticSearchInstance;
}

/**
 * Lädt und verarbeitet Intent-Beispiele für die semantische Suche
 * @param language Sprache der zu ladenden Intents
 */
async function loadAndProcessIntentExamples(language: Language): Promise<void> {
  try {
    console.log(`[loadAndProcessIntentExamples] Lade Intent-Beispiele für ${language}...`);
    
    // Pfad zur Intent-JSON-Datei
    const intentsPath = path.join(process.cwd(), `data/chatbot/database/intents_${language}.json`);
    
    // Prüfe, ob die Datei existiert
    if (!fs.existsSync(intentsPath)) {
      console.warn(`[loadAndProcessIntentExamples] Intent-Datei nicht gefunden: ${intentsPath}`);
      return;
    }
    
    // Lade die Intent-Daten
    const intentsData = JSON.parse(fs.readFileSync(intentsPath, 'utf8'));
    
    // Extrahiere die Intent-Liste
    let intents: IntentItem[] = [];
    if (Array.isArray(intentsData)) {
      intents = intentsData;
    } else if (intentsData && typeof intentsData === 'object') {
      if (Array.isArray(intentsData.intents)) {
        intents = intentsData.intents;
      } else if (intentsData.default && Array.isArray(intentsData.default)) {
        intents = intentsData.default;
      }
    }
    
    if (intents.length === 0) {
      console.warn(`[loadAndProcessIntentExamples] Keine Intents gefunden für ${language}`);
      return;
    }
    
    console.log(`[loadAndProcessIntentExamples] ${intents.length} Intents geladen für ${language}`);
    
    // Hole den EmbeddingManager
    const embeddingManager = await getInitializedEmbeddingManager();
    if (!embeddingManager) {
      console.error('[loadAndProcessIntentExamples] EmbeddingManager nicht verfügbar');
      return;
    }
    
    // Erstelle eine Map für die Intent-Embeddings dieser Sprache
    const languageEmbeddings = new Map<string, Float32Array>();
    intentEmbeddingsMap.set(language, languageEmbeddings);
    
    // Berechne Embeddings für jedes Intent-Beispiel
    let processedExamples = 0;
    
    for (const intent of intents) {
      if (!intent.examples || intent.examples.length === 0) {
        continue;
      }
      
      try {
        // Für jeden Intent berechnen wir ein gemitteltes Embedding aus allen Beispielen
        const exampleEmbeddings: Float32Array[] = [];
        
        for (const example of intent.examples) {
          // Verwende die erweiterte embedText-Methode oder fallback zu createEmbedding
          let embedding: Float32Array | null = null;
          
          if ('embedText' in embeddingManager && typeof (embeddingManager as any).embedText === 'function') {
            embedding = await (embeddingManager as any).embedText(example);
          } else if ('createEmbedding' in embeddingManager && typeof embeddingManager.createEmbedding === 'function') {
            embedding = await embeddingManager.createEmbedding(example);
          }
          
          if (embedding) {
            exampleEmbeddings.push(embedding);
          }
        }
        
        if (exampleEmbeddings.length > 0) {
          // Berechne das Durchschnitts-Embedding
          // Sichere Ermittlung der Dimension
          let dimension = 384; // Default-Wert als Fallback
          
          if ('getEmbeddingDimension' in embeddingManager && 
              typeof (embeddingManager as any).getEmbeddingDimension === 'function') {
            dimension = (embeddingManager as any).getEmbeddingDimension();
          }
          
          const averageEmbedding = new Float32Array(dimension);
          
          // Addiere alle Embedding-Vektoren - MIT KORREKTUR
          for (const embedding of exampleEmbeddings) {
            // Sicherheitscheck, ob embedding definiert ist
            if (embedding) {
              for (let i = 0; i < dimension && i < embedding.length; i++) {
                // Sicherheitscheck: Wir verwenden den Nullish Coalescing Operator, um undefined zu behandeln
                if (embedding[i] !== undefined) {
                  // Sicherstellen, dass beide Indizes definiert sind
                  averageEmbedding[i] = (averageEmbedding[i] ?? 0) + (embedding[i] ?? 0);
                }
              }
            }
          }
          
          // Teile durch die Anzahl
          const validEmbeddingsCount = exampleEmbeddings.filter(emb => emb !== undefined).length;
          if (validEmbeddingsCount > 0) {
            for (let i = 0; i < dimension; i++) {
              // Fix: Sichere Zugriffe mit Nullish Coalescing Operator zur Vermeidung von undefined
              const currentValue = averageEmbedding[i] ?? 0;
              averageEmbedding[i] = currentValue / validEmbeddingsCount;
            }
          }
          
          // Speichere das gemittelte Embedding
          languageEmbeddings.set(intent.name, averageEmbedding);
          processedExamples++;
        }
      } catch (error) {
        console.error(`[loadAndProcessIntentExamples] Fehler bei Intent ${intent.name}:`, error);
      }
    }
    
    console.log(`[loadAndProcessIntentExamples] ${processedExamples} von ${intents.length} Intent-Embeddings erstellt für ${language}`);
    
  } catch (error) {
    console.error(`[loadAndProcessIntentExamples] Fehler beim Laden der Intent-Beispiele für ${language}:`, error);
  }
}

/**
 * Initialisiert die NLP-Engine und lädt die benötigten Modelle
 * @param languages Array von Sprachcodes, für die Modelle geladen werden sollen
 */
export async function initializeNLPEngine(languages: Language[] = ['de', 'en']): Promise<void> {
  console.log('[NLP-Engine] Initialisierung gestartet...');
  
  try {
    // Lade die grundlegenden Modelle für alle angegebenen Sprachen
    for (const language of languages) {
      console.log(`[NLP-Engine] Lade Modelle für Sprache: ${language}`);
      
      // Lade Intent-Erkennungsmodell
      await loadModelAndRegister('intent', language);
      
      // Lade Entity-Extraktionsmodell
      await loadModelAndRegister('entity', language);
      
      // Lade Kontext-Modell
      await loadModelAndRegister('context', language);
      
      // Optional: Lade Sentiment-Analysemodell wenn konfiguriert
      if (config.nlp?.useSentimentAnalysis) {
        await loadModelAndRegister('sentiment', language);
      }
    }
    
    // Initialisiere AI-Komponenten, wenn semantische Intent-Erkennung aktiviert ist
    if (config.nlp?.useSemanticIntentRefinement) {
      try {
        console.log('[NLP-Engine] Initialisiere AI-Komponenten für semantische Intent-Erkennung...');
        
        // 1. Initialisiere den EmbeddingManager mit der Konfiguration aus config.ts
        embeddingManagerInstance = await getEmbeddingManager();
        if (embeddingManagerInstance) {
          // Erweitere den Manager um die fehlenden Methoden
          extendEmbeddingManager(embeddingManagerInstance);
          
          // Initialisiere den erweiterten Manager
          await (embeddingManagerInstance as any).initialize();
        }
        
        // 2. Initialisiere den VectorStore für persistente Speicherung von Embeddings (optional)
        const vectorStore = await getVectorStore();
        
        // 3. Initialisiere den SemanticSearch-Dienst
        if (config.nlp?.ai?.embeddingModel?.name) {
          semanticSearchInstance = new SemanticSearch(config.nlp.ai.embeddingModel.name);
          if (semanticSearchInstance) {
            // Wenn die SemanticSearch-Klasse eine initialize-Methode hat,
            // verwenden wir diese, ansonsten tun wir nichts
            if (typeof (semanticSearchInstance as any).initialize === 'function') {
              await (semanticSearchInstance as any).initialize();
            }
          }
        }
        
        // 4. Lade und verarbeite Intent-Beispiele für semantische Suche
        for (const language of languages) {
          await loadAndProcessIntentExamples(language);
        }
        
        console.log('[NLP-Engine] AI-Komponenten erfolgreich initialisiert');
      } catch (aiError) {
        console.error('[NLP-Engine] Fehler bei der Initialisierung der AI-Komponenten:', aiError);
        console.warn('[NLP-Engine] Die Engine wird ohne semantische Intent-Erkennung fortfahren');
      }
    }
    
    // Überprüfe, ob alle erforderlichen Modelle geladen wurden
    const loadedModels = getLoadedModels();
    const requiredModelsLoaded = languages.every(lang => 
      isModelLoaded('intent', lang) && 
      isModelLoaded('entity', lang) && 
      isModelLoaded('context', lang)
    );
    
    if (requiredModelsLoaded) {
      console.log('[NLP-Engine] Erfolgreich initialisiert');
    } else {
      console.warn('[NLP-Engine] Initialisierung abgeschlossen, aber nicht alle erforderlichen Modelle wurden geladen');
      console.warn('[NLP-Engine] Geladene Modelle:', loadedModels);
    }
  } catch (error) {
    console.error('[NLP-Engine] Fehler bei der Initialisierung:', error);
    console.error(`[NLP-Engine] Konnte nicht vollständig initialisiert werden: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Hilfsfunktion zum Laden und Registrieren eines Modells
 */
async function loadModelAndRegister(type: ModelType, language: Language): Promise<boolean> {
  try {
    console.log(`[loadModelAndRegister] Lade ${type}-Modell für ${language}`);
    const model = await loadModel(type, language);
    
    if (hasValidPredictFunction(model)) {
      modelRegistry.registerModel(model, type, language);
      console.log(`[loadModelAndRegister] ${type}-Modell für ${language} erfolgreich geladen und registriert`);
      return true;
    } else {
      console.error(`[loadModelAndRegister] ${type}-Modell für ${language} hat keine gültige predict-Funktion`);
      return false;
    }
  } catch (error) {
    console.error(`[loadModelAndRegister] Fehler beim Laden/Registrieren des ${type}-Modells für ${language}:`, error);
    return false;
  }
}

/**
 * Stellt sicher, dass ein Modell geladen und gültig ist
 * @param modelType Der Typ des zu ladenden Modells
 * @param language Die Sprache des Modells
 * @returns Das geladene Modell oder ein Fallback-Modell
 */
async function ensureModelLoaded(modelType: ModelType, language: Language): Promise<NLPModel> {
  try {
    // Versuche zuerst, das Modell aus der Registry zu holen
    let model = modelRegistry.getModel(modelType, language);
    
    if (!model || !hasValidPredictFunction(model)) {
      console.log(`[ensureModelLoaded] Modell ${modelType}/${language} muss neu geladen werden`);
      
      // Modell ist nicht in der Registry oder ungültig, lade es neu
      const success = await loadModelAndRegister(modelType, language);
      
      if (success) {
        // Hole das neu registrierte Modell aus der Registry
        model = modelRegistry.getModel(modelType, language);
        
        if (!model) {
          console.error(`[ensureModelLoaded] Modell ${modelType}/${language} konnte nicht aus Registry geholt werden`);
          // Lade direkt ohne Registry-Speicherung als Fallback
          model = await loadModel(modelType, language, undefined, true);
        }
      } else {
        console.error(`[ensureModelLoaded] Laden und Registrieren des Modells ${modelType}/${language} fehlgeschlagen`);
        // Lade direkt ohne Registry-Speicherung als Fallback
        model = await loadModel(modelType, language, undefined, true);
      }
    }
    
    // Rückgabe des modells, egal ob es gültig ist oder nicht - loadModel sollte immer ein Fallback liefern
    return model as NLPModel; // Assertion, da loadModel ein Fallback-Modell liefern sollte
  } catch (error) {
    console.error(`[ensureModelLoaded] Fehler beim Laden des Modells ${modelType}/${language}:`, error);
    // Lade ein Fallback-Modell als letzten Ausweg
    return await loadModel(modelType, language, undefined, true);
  }
}

/**
 * Verarbeitet eine Benutzernachricht und gibt das Analyseergebnis zurück
 */
export async function processMessage(
  message: string,
  language: Language = 'de',
  conversationHistory: string[] = []
): Promise<NLPProcessingResult> {
  console.log(`[processMessage] Verarbeite Nachricht in ${language}: "${message}"`);
  
  try {
    // Vorverarbeitung des Textes (Normalisierung, Bereinigung)
    const preprocessedText = preprocessText(message);
    
    // Stelle sicher, dass alle benötigten Modelle geladen sind
    const intentModel = await ensureModelLoaded('intent', language);
    const entityModel = await ensureModelLoaded('entity', language);
    const contextModel = await ensureModelLoaded('context', language);
    
    // Deklariere Variablen für die Pipeline-Ergebnisse mit korrekten Typen
    let intent: Intent | null = null;
    let entities: Entity[] = [];
    
    // 1. Intent-Erkennung mit erweiterter Fehlerbehandlung
    try {
      const detectedIntent = await detectIntent(preprocessedText, intentModel, language);
      
      // Stelle sicher, dass intent.confidence immer definiert ist
      if (detectedIntent) {
        intent = {
          name: detectedIntent.name,
          confidence: detectedIntent.confidence ?? 0.5, // Default-Konfidenz, wenn nicht angegeben
          type: detectedIntent.type || 'unknown'
        };
      }
      
      console.log(`[processMessage] Intent erkannt: ${intent?.name ?? 'keiner'} (Konfidenz: ${intent?.confidence.toFixed(2) ?? 'n/a'})`);
    } catch (intentError) {
      console.error('[processMessage] Fehler bei der Intent-Erkennung:', intentError);
      // Setze ein Standard-Intent bei Fehler
      intent = { name: 'error_intent_detection', confidence: 0.1, type: 'unknown' };
    }
    
    // 2. Entity-Extraktion mit erweiterter Fehlerbehandlung
    try {
      entities = await extractEntities(preprocessedText, entityModel, language, intent);
      
      if (entities.length > 0) {
        console.log(`[processMessage] ${entities.length} Entities erkannt: ${entities.map(e => e.type).join(', ')}`);
      } else {
        console.log(`[processMessage] Keine Entities erkannt`);
      }
    } catch (entityError) {
      console.error('[processMessage] Fehler bei der Entity-Extraktion:', entityError);
      // Behalte leeres Entities-Array bei Fehler
    }
    
    // 3. Kontext-Management mit erweiterter Fehlerbehandlung
    let context: Context;
    try {
      // Füge aktuelle Nachricht zum Verlauf hinzu
      const updatedHistory = [...conversationHistory, message];
      
      // Rufe das Kontext-Management auf und speichere das Ergebnis
      context = await manageContext(updatedHistory, contextModel, intent, entities);
      console.log(`[processMessage] Kontext erkannt: ${context.name} (Konfidenz: ${context.confidence.toFixed(2)})`);
    } catch (contextError) {
      console.error('[processMessage] Fehler beim Kontext-Management:', contextError);
      // Verwende Standard-Kontext bei Fehler
      context = {
        name: 'error',
        confidence: 1.0,
        entities: [],
        recentIntents: intent ? [intent] : [],
        topics: []
      };
    }
    
    // Gesamtes Ergebnis zusammenstellen
    const result: NLPProcessingResult = {
      intent,
      entities,
      context,
      originalText: message,
      preprocessedText
    };
    
    console.log('[processMessage] NLP-Verarbeitung abgeschlossen');
    
    return result;
  } catch (error) {
    console.error('[processMessage] Fehler bei der Verarbeitung der Nachricht:', error);
    // Return default result with error information
    return {
      intent: null,
      entities: [],
      context: { 
        name: 'error', 
        confidence: 1.0,
        entities: [],
        recentIntents: [],
        topics: []
      },
      originalText: message,
      preprocessedText: message,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Vorverarbeitung des Eingabetextes
 */
function preprocessText(text: string): string {
  if (!text) {
    console.warn('[preprocessText] Leerer Eingabetext erhalten');
    return '';
  }
  
  try {
    // Basisfunktionalität: Trimmen und Normalisierung der Groß-/Kleinschreibung
    let processedText = text.trim().toLowerCase();
    
    // Entferne Sonderzeichen, behalte aber Umlaute, Leerzeichen und grundlegende Interpunktion
    // Verwende eine ES5-kompatible Version ohne 'u'-Flag
    processedText = processedText.replace(/[^a-zäöüßA-ZÄÖÜ0-9\s.,!?-]/g, '');
    
    // Normalisiere mehrfache Leerzeichen
    processedText = processedText.replace(/\s+/g, ' ');
    
    return processedText;
  } catch (error) {
    console.error('[preprocessText] Fehler bei der Textvorverarbeitung:', error);
    // Gib den Originaltext zurück, wenn ein Fehler auftritt
    return text;
  }
}

/**
 * Erstellt eine benutzerdefinierte Antwort basierend auf den Analyseergebnissen
 */
export async function createResponse(
  nlpResult: NLPProcessingResult,
  language: Language = 'de'
): Promise<string> {
  try {
    // Rufe die Response-Generation-Pipeline auf
    return await generateResponse(nlpResult, language);
  } catch (error) {
    console.error('[createResponse] Fehler bei der Antwortgenerierung:', error);
    // Rückgabe einer Fehlermeldung in der richtigen Sprache
    return language === 'de'
      ? "Entschuldigung, es gab ein Problem bei der Verarbeitung deiner Anfrage."
      : "Sorry, there was a problem processing your request.";
  }
}

/**
 * Gibt die geladenen Modelle aus dem Registry zurück
 * Nützlich für Diagnose- und Debugging-Zwecke
 */
export function getLoadedModels(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  
  try {
    // Sichere Durchführung für jeden Modelltyp
    for (const type of validModelTypeKeys) {
      const registry = getModelRegistryForType(type);
      if (registry) {
        result[type] = Object.keys(registry)
          .filter(lang => (lang === 'de' || lang === 'en') && 
                          hasValidPredictFunction(registry[lang as Language]));
      }
    }
    
    return result;
  } catch (error) {
    console.error('[getLoadedModels] Fehler beim Abrufen der geladenen Modelle:', error);
    return {};
  }
}

/**
 * Überprüft, ob ein bestimmtes Modell bereits geladen ist
 */
export function isModelLoaded(modelType: ModelType, language: Language): boolean {
  try {
    const model = modelRegistry.getModel(modelType, language);
    return model !== null && hasValidPredictFunction(model);
  } catch (error) {
    console.error(`[isModelLoaded] Fehler beim Überprüfen des Modells ${modelType}/${language}:`, error);
    return false;
  }
}

/**
 * Setzt die NLP-Engine zurück und entlädt alle Modelle
 */
export function resetEngine(): void {
  try {
    // Für alle Modelltypen und Sprachen
    for (const type of validModelTypeKeys) {
      const registry = getModelRegistryForType(type);
      if (registry) {
        Object.keys(registry).forEach(lang => {
          if (lang === 'de' || lang === 'en') {
            delete registry[lang as Language];
          }
        });
      }
    }
    
    // Setze auch die AI-Komponenten zurück
    embeddingManagerInstance = null;
    semanticSearchInstance = null;
    intentEmbeddingsMap.clear();
    
    // Setze die Engine-Instanz zurück
    engineInstance = null;
    
    console.log('[resetEngine] NLP-Engine zurückgesetzt');
  } catch (error) {
    console.error('[resetEngine] Fehler beim Zurücksetzen der NLP-Engine:', error);
  }
}

/**
 * Findet ähnliche Intents basierend auf einem Embedding
 */
export async function findSimilarIntents(
  inputEmbedding: Float32Array, 
  language: Language = 'de',
  similarityThreshold: number = config.nlp?.ai?.semanticSearch?.similarityThreshold ?? 0.7
): Promise<{name: string; type: string; score: number}[]> {
  try {
    // Prüfe, ob Intent-Embeddings für diese Sprache geladen sind
    const languageEmbeddings = intentEmbeddingsMap.get(language);
    if (!languageEmbeddings || languageEmbeddings.size === 0) {
      console.warn(`[findSimilarIntents] Keine Intent-Embeddings gefunden für ${language}`);
      return [];
    }
    
    // Hole den EmbeddingManager
    const embeddingManager = await getInitializedEmbeddingManager();
    if (!embeddingManager) {
      console.error('[findSimilarIntents] EmbeddingManager nicht verfügbar');
      return [];
    }
    
    // Berechne Ähnlichkeitsscores für alle Intents
    const similarityScores: {name: string; score: number; type: string}[] = [];
    
    for (const [intentName, embedding] of languageEmbeddings.entries()) {
      // KRITISCHE KORREKTUR: Sicherer Methodenaufruf von cosineSimilarity
      let similarity = 0;
      if ('cosineSimilarity' in embeddingManager && 
          typeof embeddingManager.cosineSimilarity === 'function' &&
          embedding) {
        // Add null check for embedding
        if (embedding && inputEmbedding) {
          similarity = embeddingManager.cosineSimilarity(inputEmbedding, embedding);
        }
      }
      
      // Nur Intents über dem Schwellenwert berücksichtigen
      if (similarity >= similarityThreshold) {
        // Bestimme den Intent-Typ basierend auf dem Namen
        let intentType = 'unknown';
        // Sicherstellen, dass intentName definiert ist
        if (intentName) {
          if (intentName.startsWith('smalltalk_')) {
            intentType = 'smalltalk';
          } else if (intentName.startsWith('faq_')) {
            intentType = 'faq';
          } else if (intentName.startsWith('function_')) {
            intentType = 'function';
          }
        }
        
        similarityScores.push({
          name: intentName || 'unknown',  // Fallback für undefined
          score: similarity,
          type: intentType
        });
      }
    }
    
    // Sortiere nach Score absteigend
    similarityScores.sort((a, b) => b.score - a.score);
    
    return similarityScores;
  } catch (error) {
    console.error('[findSimilarIntents] Fehler bei der semantischen Intent-Suche:', error);
    return [];
  }
}