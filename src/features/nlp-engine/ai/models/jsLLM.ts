// Remove static imports of pipeline and env from @xenova/transformers
import type { Language } from '@/types/nlp.types';
import path from 'path';
import fs from 'fs';
// Import getOnnxRuntime from utils/onnx-env
import { getOnnxRuntime } from '@/utils/onnx-env';
import type { OnnxRuntime, WasmInitOptions } from '@/utils/onnx-env';

// =============== Generation Config ===============

export interface GenerationConfig {
  max_length: number;
  temperature: number;
  top_k?: number;
  top_p?: number;
}

// =============== Knowledge Base für Kontext ===============

const KNOWLEDGE_BASE = {
  app_info: {
    de: `Mindfluence ist eine App für Persönlichkeitsentwicklung und mentales Training.
Sie bietet eine Sammlung von Audio-Inhalten wie Meditationen, Affirmationen und Subliminals,
die beim Training des Unterbewusstseins helfen und die Erreichung persönlicher Ziele unterstützen.`,
    en: `Mindfluence is an app for personal development and mental training.
It offers a collection of audio content such as meditations, affirmations, and subliminals 
that help train the subconscious mind and support achieving personal goals.`
  },
  
  invoices: {
    de: `Rechnungen befinden sich im Kontobereich unter 'Meine Rechnungen'. 
Dort werden alle Zahlungen und Rechnungen chronologisch aufgelistet.`,
    en: `Invoices can be found in the account area under 'My Invoices'.
All payments and invoices are listed there chronologically.`
  },
  
  cancellation: {
    de: `Um dein Abonnement zu kündigen, gehe in deinem Konto auf 'Abonnement verwalten' und wähle die Option 'Kündigen'. 
Die Änderung wird zum Ende der aktuellen Abrechnungsperiode wirksam.`,
    en: `To cancel your subscription, go to 'Manage Subscription' in your account and select the 'Cancel' option.
The change will take effect at the end of the current billing period.`
  }
};

// =============== Prompt Manager ===============

/**
 * Interface für bessere Typsicherheit im Kontext
 */
interface ContextInfo {
  intentName: string;
  intentType: string;
  intentConfidence: number;
  entities: any[];
  conversationHistory: string;
  language: Language;
}

/**
 * Optimierter Prompt-Manager für präzisere und kontextbezogene Antworten
 */
class PromptManager {
  private systemPrompts: Record<Language, string> = {
    de: "Du bist ein hilfreicher Assistent für die Mindfluence App, eine Anwendung für Persönlichkeitsentwicklung und mentales Training. Antworte kurz und präzise, aber sei freundlich und hilfreich.",
    en: "You are a helpful assistant for the Mindfluence App, an application for personal development and mental training. Answer concisely but be friendly and helpful."
  };
  
  // Spezifische Beispielantworten für häufige Intents
  private intentExamples: Record<string, Record<Language, string>> = {
    // FAQ-Intents
    "faq_find_invoice": {
      de: "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.",
      en: "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically."
    },
    "faq_cancel_subscription": {
      de: "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen. Die Kündigung wird zum Ende deiner aktuellen Zahlungsperiode wirksam.",
      en: "You can cancel your subscription anytime in your account settings under 'Manage Subscription'. The cancellation will take effect at the end of your current billing period."
    }
  };
  
  /**
   * Erstellt einen optimierten Prompt basierend auf der Benutzereingabe und dem Kontext
   */
  buildPrompt(userMessage: string, context: ContextInfo): string {
    const { intentName, intentType, intentConfidence, entities, conversationHistory, language } = context;
    
    // Basis-System-Prompt
    const systemPrompt = this.systemPrompts[language] || this.systemPrompts.de;
    
    // Relevante Wissensbasis auswählen basierend auf Inhalt
    let knowledgeContext = '';
    
    // Für Rechnungsanfragen
    if (this.isInvoiceQuery(userMessage)) {
      knowledgeContext = KNOWLEDGE_BASE.invoices[language];
    } 
    // Für Kündigungsanfragen
    else if (this.isCancellationQuery(userMessage)) {
      knowledgeContext = KNOWLEDGE_BASE.cancellation[language];
    }
    // Standard-App-Info
    else {
      knowledgeContext = KNOWLEDGE_BASE.app_info[language];
    }
    
    // Intent-Kontext mit spezifischen Beispielen
    let intentContext = '';
    
    if (intentName !== "unknown") {
      // Grundlegende Intent-Information
      intentContext = `Ich habe folgende Absicht erkannt: ${intentName} (Typ: ${intentType}, Konfidenz: ${(intentConfidence * 100).toFixed(0)}%).`;
      
      // Spezifisches Beispiel hinzufügen
      const exampleForIntent = this.getExampleForIntent(intentName, language);
      if (exampleForIntent) {
        intentContext += `\nEin Beispiel für eine gute Antwort wäre: "${exampleForIntent}"`;
      }
    }
    
    // Entity-Kontext
    const entityContext = entities.length > 0
      ? `Relevante Informationen: ${entities.map((e: any) => `${e.type} (${e.value})`).join(', ')}.`
      : "";
    
    // Konversationsgeschichte
    const historyContext = conversationHistory ? 
      `\nBisherige Konversation:\n${conversationHistory}` : '';
    
    // Spezifische Anweisungen
    let specificInstructions = this.getSpecificInstructions(userMessage, intentName, intentType, language);
    
    // Vollständigen Prompt zusammenbauen
    return `${systemPrompt}

${knowledgeContext}

${intentContext}
${entityContext}
${specificInstructions}
${historyContext}

Benutzer: ${userMessage}
Assistent:`;
  }
  
  /**
   * Liefert spezifische Anweisungen basierend auf der Anfrage
   */
  private getSpecificInstructions(
    userMessage: string, 
    intentName: string, 
    intentType: string, 
    language: Language
  ): string {
    let instructions = '';
    
    // Prüfe auf Rechnungsanfragen
    if (this.isInvoiceQuery(userMessage)) {
      instructions = language === 'en'
        ? '\nThe user is asking about invoices. Explain clearly where they can find their invoices in their account.'
        : '\nDer Nutzer fragt nach Rechnungen. Erkläre klar, wo er seine Rechnungen in seinem Konto finden kann.';
    }
    // Prüfe auf Kündigungsanfragen
    else if (this.isCancellationQuery(userMessage)) {
      instructions = language === 'en'
        ? '\nThe user wants to cancel their subscription. Provide clear instructions on how to cancel.'
        : '\nDer Nutzer möchte sein Abonnement kündigen. Gib klare Anweisungen zur Kündigung.';
    }
    // Standardanweisungen basierend auf Intent-Typ
    else if (intentType === 'faq') {
      instructions = language === 'en'
        ? '\nAnswer the question directly and informatively.'
        : '\nBeantworte die Frage direkt und informativ.';
    } else if (intentType === 'function') {
      instructions = language === 'en'
        ? '\nExplain clearly how the user can use this feature.'
        : '\nErkläre klar, wie der Nutzer diese Funktion verwenden kann.';
    } else if (intentType === 'smalltalk') {
      instructions = language === 'en'
        ? '\nRespond naturally, friendly and briefly to the small talk request.'
        : '\nAntworte natürlich, freundlich und kurz auf die Small-Talk-Anfrage.';
    }
    
    return instructions;
  }
  
  /**
   * Prüft, ob es sich um eine Rechnungsanfrage handelt
   */
  private isInvoiceQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return /rechnung|rechnungen|invoice|invoices|payment|zahlung|bezahlung|quittung/i.test(lowerMessage);
  }
  
  /**
   * Prüft, ob es sich um eine Kündigungsanfrage handelt
   */
  private isCancellationQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return /kündigen|cancel|abbestellen|beenden|stornieren|beende|abmelden|abonnement.*ende/i.test(lowerMessage);
  }
  
  /**
   * Gibt ein Beispiel für einen Intent zurück, wenn verfügbar
   */
  getExampleForIntent(intentName: string, language: Language): string | null {
    if (intentName in this.intentExamples) {
      const examplesForIntent = this.intentExamples[intentName] as Record<Language, string>;
      if (language in examplesForIntent) {
        return examplesForIntent[language];
      }
    }
    return null;
  }
  
  /**
   * Erweitert eine generierte Antwort basierend auf Intent und Benutzernachricht
   */
  enhanceResponse(response: string, intentName: string, intentType: string, userMessage: string, language: Language): string {
    // Spezialbehandlung für generische/unspezifische Antworten
    if (
      response.includes("Was möchtest du wissen?") || 
      response.includes("kann ich helfen") ||
      response.includes("What would you like to know?") ||
      response.includes("can I help")
    ) {
      // Rechnungsanfragen
      if (this.isInvoiceQuery(userMessage)) {
        const invoiceExample = this.getExampleForIntent("faq_find_invoice", language);
        if (invoiceExample) return invoiceExample;
        
        return language === 'en'
          ? "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically."
          : "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.";
      }
      
      // Kündigungsanfragen
      if (this.isCancellationQuery(userMessage)) {
        const cancelExample = this.getExampleForIntent("faq_cancel_subscription", language);
        if (cancelExample) return cancelExample;
        
        return language === 'en'
          ? "You can cancel your subscription anytime in your account settings under 'Manage Subscription'. The cancellation will take effect at the end of your current billing period."
          : "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen. Die Kündigung wird zum Ende deiner aktuellen Zahlungsperiode wirksam.";
      }
      
      // Für andere bekannte Intents
      const example = this.getExampleForIntent(intentName, language);
      if (example) {
        return example;
      }
    }
    
    return response;
  }
}

// =============== JSLLM - JavaScript Sprachmodell-Implementierung ===============

/**
 * JavaScript-basiertes Language Model (GPT-2 Small) mit robuster Modellinitialisierung
 * und präziser Fehlerbehandlung
 */
export class JSLLM {
  public generator: any = null;
  private modelName: string = 'gpt2-small';
  private isReady: boolean = false;
  private initPromise: Promise<boolean> | null = null;
  private fallbackMode: boolean = false;
  private lastUserMessage: string = "";
  private conversationHistory: Array<{role: string, content: string}> = [];
  
  // Properties for dynamically imported modules
  private transformersModule: any = null;
  private env: any = null;
  
  /**
   * Erstellt eine neue Instanz des JSLLM
   * @param modelName Optional: Der Name des zu verwendenden Modells
   */
  constructor(modelName?: string) {
    if (modelName) {
      this.modelName = modelName.replace(/^.*[\\\/]/, '');
    }
    
    console.log(`[JSLLM] Erstelle Instanz für Modell: ${this.modelName}`);
  }
  
  /**
   * Konfiguriert die Umgebung für die Transformer-Bibliothek
   * Verwendet das dynamisch importierte env-Objekt
   */
  private setupEnvironment(): void {
    // Check if env is available
    if (!this.env) {
      console.warn('[JSLLM] env ist nicht verfügbar, Umgebung kann nicht konfiguriert werden.');
      return;
    }
    
    // Kritische Konfiguration für ONNX und Transformer
    this.env.allowLocalModels = true;
    this.env.useFSCache = false;
    this.env.cacheDir = './cache/transformers';
    
    // ONNX Backend-Konfiguration
    if (!this.env.backends) {
      this.env.backends = {
        onnx: {
          wasm: { numThreads: 4 },
          webgl: {}
        },
        tfjs: {}
      };
    } else {
      // Stelle sicher, dass alle erforderlichen Untereigenschaften existieren
      if (!this.env.backends.onnx) {
        this.env.backends.onnx = { wasm: { numThreads: 4 }, webgl: {} };
      }
      if (!this.env.backends.onnx.wasm) {
        this.env.backends.onnx.wasm = { numThreads: 4 };
      }
      // Stelle sicher, dass tfjs existiert
      if (!this.env.backends.tfjs) {
        this.env.backends.tfjs = {};
      }
    }
    
    console.log(`[JSLLM] Umgebung konfiguriert für Modell: ${this.modelName}`);
    console.log(`[JSLLM] env.allowLocalModels: ${this.env.allowLocalModels}`);
    console.log(`[JSLLM] env.useFSCache: ${this.env.useFSCache}`);
  }
  
  /**
   * Konfiguriert das ONNX-Backend für verschiedene Umgebungen
   * Verwendet das dynamisch importierte env-Objekt
   */
  private configureOnnxBackend(): void {
    const isServerEnvironment = typeof window === 'undefined';
    console.log(`[JSLLM] Konfiguriere ONNX-Backend für ${isServerEnvironment ? 'Server' : 'Browser'}-Umgebung`);

    // Check if env and backends are available
    if (!this.env || !this.env.backends || !this.env.backends.onnx) {
      console.warn('[JSLLM] env.backends.onnx ist nicht verfügbar, ONNX-Backend kann nicht konfiguriert werden.');
      return;
    }
    
    // Configure based on environment
    if (isServerEnvironment) {
      // Server-specific configuration
      if (this.env.backends.onnx.wasm) {
        this.env.backends.onnx.wasm.numThreads = 1; // Single thread for stability in server environment
      }
      if (this.env.backends.onnx.webgl) {
        // Disable WebGL on server
        (this.env.backends.onnx.webgl as any).disabled = true;
      }
    } else {
      // Browser-specific configuration
      if (this.env.backends.onnx.wasm) {
        this.env.backends.onnx.wasm.numThreads = 4; // Multiple threads in browser for performance
      }
    }
    
    console.log(`[JSLLM] ONNX-Backend konfiguriert mit numThreads=${this.env.backends.onnx.wasm?.numThreads || 'n/a'}`);
  }
  
  /**
   * Initialisiert das Sprachmodell
   */
  async initialize(): Promise<boolean> {
    if (this.isReady) {
      console.log(`[JSLLM] Modell ${this.modelName} ist bereits initialisiert.`);
      return true;
    }
    
    if (this.initPromise) {
      console.log(`[JSLLM] Initialisierung läuft bereits...`);
      return this.initPromise;
    }
    
    this.initPromise = this._initialize();
    return this.initPromise;
  }
  
  /**
   * Helper-Funktion, um ONNX Runtime in anderen Modulen zu patchen
   */
  private async patchOnnxRuntime(ort: any): Promise<any> {
    if (!ort) {
      console.error('[JSLLM] Cannot patch undefined ONNX Runtime');
      return null;
    }
 
    console.log('[JSLLM] Patching ONNX Runtime for missing methods');
 
    // Ensure InferenceSession exists
    if (!ort.InferenceSession) {
      console.log('[JSLLM] Creating missing InferenceSession object');
      ort.InferenceSession = {};
    }
 
    // Create the create method if it doesn't exist
    if (!ort.InferenceSession.create || typeof ort.InferenceSession.create !== 'function') {
      console.log('[JSLLM] Adding missing create method to InferenceSession');
     
      ort.InferenceSession.create = async function(modelPath: any, options: any) {
        console.log(`[JSLLM] Mock InferenceSession.create called with model path`);
        
        return {
          run: async (feeds: any) => { 
            console.log('[JSLLM] Mock session.run called');
            return {}; 
          },
          inputNames: [],
          outputNames: [],
          release: async () => { 
            console.log('[JSLLM] Mock session.release called');
          }
        };
      };
    }
 
    // Ensure Tensor constructor exists
    if (!ort.Tensor || typeof ort.Tensor !== 'function') {
      console.log('[JSLLM] Creating missing Tensor constructor');
      
      ort.Tensor = function(type: any, data: any, dims: any) {
        return {
          data: data || new Float32Array(1),
          type: type || 1,
          dims: dims || [1],
          size: (data || []).length
        };
      };
    }
 
    return ort;
  }

  /**
   * Versucht, das Xenova-ONNX-Backend zu finden und direkt zu patchen
   */
  private async tryPatchXenovaBackend(): Promise<boolean> {
    try {
      // Versuche zuerst ort zu bekommen, falls nicht bereits vorhanden
      const ort = await getOnnxRuntime();
      
      // Versuche, direkt das Xenova-Modul zu finden und patchen
      try {
        // Dynamisches patchen über den Module-Cache ist im Browser nicht möglich
        if (typeof window !== 'undefined') {
          return false;
        }

        // In Node.js-Umgebung versuchen, das Modul zu patchen
        if (typeof require !== 'undefined') {
          try {
            // Direkte Patch-Methode (funktioniert nur in Node.js)
            const modulePath = require.resolve('@xenova/transformers/dist/backends/onnx');
            delete require.cache[modulePath];
            
            // Versuche das Modul direkt zu laden
            const onnxBackend = require('@xenova/transformers/dist/backends/onnx');
            if (onnxBackend) {
              // Versuch, das Modul direkt zu modifizieren
              onnxBackend.InferenceSession = ort.InferenceSession;
              console.log('[JSLLM] Xenova ONNX-Backend erfolgreich direkt gepatcht');
              return true;
            }
          } catch (requireError) {
            console.error('[JSLLM] Fehler beim Patchen via require:', requireError);
          }
        }
      } catch (patchError) {
        console.error('[JSLLM] Fehler beim direkten Patchen des Xenova-Backends:', patchError);
      }
    } catch (error) {
      console.error('[JSLLM] Fehler beim Patch-Versuch:', error);
    }
    
    return false;
  }
  
  /**
   * Interne Implementierung der Initialisierung mit dem korrekten 
   * dynamischen Import-Ansatz, um das Timing-Problem zu lösen
   */
  private async _initialize(): Promise<boolean> {
    try {
      console.log(`[JSLLM] Starte _initialize für Modell: ${this.modelName}`);

      // Versuche zuerst das Xenova-Backend direkt zu patchen
      await this.tryPatchXenovaBackend();

      // 1. First, ensure ONNX runtime is properly initialized and globally available
      // This is the key step to solve the timing issue
      try {
        console.log('[JSLLM] Initialisiere ONNX Runtime vor Xenova-Import');
        
        // Get ONNX Runtime instance
        const ort = await getOnnxRuntime();
        await this.patchOnnxRuntime(ort);
        
        // CRITICAL: Explicitly set on all possible global objects
        // This is the key fix for the "Cannot read properties of undefined (reading 'create')" error
        if (typeof globalThis !== 'undefined') {
          globalThis.onnxruntime = ort;
          // CRITICAL: Expose InferenceSession directly on globalThis
          (globalThis as any).InferenceSession = ort.InferenceSession;
          console.log('[JSLLM] ONNX Runtime auf globalThis gesetzt');
        }
        if (typeof global !== 'undefined') {
          global.onnxruntime = ort;
          (global as any).InferenceSession = ort.InferenceSession;
          console.log('[JSLLM] ONNX Runtime auf global gesetzt');
        }
        if (typeof window !== 'undefined') {
          window.onnxruntime = ort;
          (window as any).InferenceSession = ort.InferenceSession;
          console.log('[JSLLM] ONNX Runtime auf window gesetzt');
        }
        
        // Verify global ONNX availability
        if (typeof globalThis !== 'undefined') {
          console.log('[JSLLM] Verifiziere globalThis.onnxruntime:',
            globalThis.onnxruntime ? 'verfügbar' : 'nicht verfügbar',
            globalThis.onnxruntime?.InferenceSession ? 'InferenceSession verfügbar' : 'InferenceSession nicht verfügbar',
            globalThis.onnxruntime?.InferenceSession?.create ? 'create verfügbar' : 'create nicht verfügbar'
          );
          
          // Zusätzlich direkte Verfügbarkeit prüfen
          console.log('[JSLLM] Verifiziere direkte globalThis.InferenceSession:',
            (globalThis as any).InferenceSession ? 'verfügbar' : 'nicht verfügbar',
            (globalThis as any).InferenceSession?.create ? 'create verfügbar' : 'create nicht verfügbar'
          );
        }
        
        console.log('[JSLLM] ONNX Runtime erfolgreich initialisiert und global verfügbar gemacht');
        
        // Add a small delay to ensure ONNX runtime is fully initialized
        // This helps prevent race conditions
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (ortError) {
        console.error('[JSLLM] Fehler bei ONNX Runtime Initialisierung:', ortError);
        // Continue anyway, we'll use fallback mechanisms if needed
      }

      // 2. AFTER ONNX runtime is initialized, dynamically import @xenova/transformers
      try {
        console.log('[JSLLM] Dynamischer Import von @xenova/transformers');
        
        // Use dynamic import with Function constructor to avoid static analysis
        // This ensures the import happens at runtime after ONNX is initialized
        const dynamicImportCode = `
          return new Promise(async (resolve) => {
            // Ensure ONNX Runtime is available globally before importing
            if (!globalThis.onnxruntime || !globalThis.onnxruntime.InferenceSession) {
              console.warn('[JSLLM] ONNX Runtime not found on globalThis, trying to get it again');
              const ort = await import('onnxruntime-web');
              globalThis.onnxruntime = ort;
              if (globalThis.onnxruntime && !globalThis.InferenceSession) {
                globalThis.InferenceSession = globalThis.onnxruntime.InferenceSession;
              }
            }
            
            // Small delay for stability
            await new Promise(r => setTimeout(r, 300));
            
            // Now we can safely import transformers
            const transformers = await import('@xenova/transformers');
            resolve(transformers);
          });
        `;
        
        // Dynamically evaluate and execute the code at runtime
        const dynamicImport = new Function(dynamicImportCode)();
        this.transformersModule = await dynamicImport;
        
        // Extract the necessary components
        this.env = this.transformersModule.env;
        
        // Ensure transformers uses our ONNX instance
        if (this.env) {
          this.env.useExternalOnnxRuntime = true;
          this.env.allowLocalModels = true;
          this.env.useFSCache = false;
          console.log('[JSLLM] Transformers env konfiguriert für externe ONNX Runtime');
        }
        
        console.log('[JSLLM] Transformers Modul erfolgreich importiert');
        
        // 3. Now that we have the dynamically imported modules, configure environment
        console.log('[JSLLM] Konfiguriere Umgebung nach dynamischem Import');
        this.setupEnvironment();
        this.configureOnnxBackend();
      } catch (importError) {
        console.error('[JSLLM] Fehler beim dynamischen Import von @xenova/transformers:', importError);
        this.createEnhancedFallbackGenerator();
        this.isReady = true;
        this.fallbackMode = true;
        return false;
      }

      // Erkennung des Ausführungskontexts
      const isServerEnvironment = typeof window === 'undefined';
      console.log(`[JSLLM] Erkannte Umgebung: ${isServerEnvironment ? 'Server (Node.js)' : 'Client (Browser)'}`);

      // Optimierte Modeloptionen
      const modelOptions = {
        local: true,
        local_files_only: true,
        use_cache: false,
        revision: 'main',
        quantized: true,
        device: 'cpu',
        cache_dir: './cache/transformers'
      };

      console.log(`[JSLLM] Modeloptionen: ${JSON.stringify(modelOptions, null, 2)}`);

      // Get all possible model paths to try
      const modelPathsToTry = this.getModelPathsToTry(isServerEnvironment);
      
      console.log(`[JSLLM] Versuche Modell aus folgenden Pfaden zu laden:`, modelPathsToTry);

      let lastError: any = null;
      let successPath: string | null = null;

      // 4. Systematic attempt to load with the dynamically imported pipeline
      for (const pathAttempt of modelPathsToTry) {
        try {
          console.log(`[JSLLM] Ladeversuch von: "${pathAttempt}"`);

          // Check existence of direct paths
          if (isServerEnvironment && pathAttempt.includes('onnx')) {
            this.checkAndLogPathDetails(pathAttempt);
          }

          // IMPORTANT: Verify once more that ONNX runtime is available globally before calling pipeline
          if (typeof globalThis !== 'undefined' && (!globalThis.onnxruntime || !globalThis.onnxruntime.InferenceSession)) {
            console.warn('[JSLLM] ONNX Runtime ist nicht global verfügbar vor Pipeline-Aufruf, versuche erneut zu setzen');
            const ort = await getOnnxRuntime();
            (globalThis as any).onnxruntime = ort;
            (globalThis as any).InferenceSession = ort.InferenceSession;
          }

          console.log(`[JSLLM] Starte this.transformersModule.pipeline('text-generation', "${pathAttempt}", ...)`);
          
          // Make sure transformersModule is available
          if (!this.transformersModule || typeof this.transformersModule.pipeline !== 'function') {
            throw new Error('transformersModule.pipeline ist nicht verfügbar');
          }
          
          // Explicit check of ONNX runtime before pipeline call
          if (typeof globalThis !== 'undefined') {
            console.log('[JSLLM] Final ONNX check before pipeline:',
              typeof globalThis.onnxruntime,
              typeof globalThis.onnxruntime?.InferenceSession,
              typeof globalThis.onnxruntime?.InferenceSession?.create
            );
          }
          
          // Use the dynamically imported pipeline
          this.generator = await this.transformersModule.pipeline('text-generation', pathAttempt, modelOptions);
          
          // Validate the generated generator
          if (this.generator && typeof this.generator === 'function') {
            console.log(`[JSLLM] Pipeline erfolgreich geladen. Generator-Typ:`, typeof this.generator);
            
            // Short test run for validation
            try {
              const testPrompt = "Teste die Antwortgenerierung.";
              console.log(`[JSLLM] Führe Test-Inferenz durch: "${testPrompt}"`);
              
              const testResult = await this.generator(testPrompt, {
                max_length: 20,
                temperature: 0.5
              });
              
              console.log(`[JSLLM] Test-Ergebnis:`, JSON.stringify(testResult));
              
              if (testResult && testResult[0] && testResult[0].generated_text) {
                console.log(`[JSLLM] Model ERFOLGREICH geladen und getestet von Pfad: ${pathAttempt}`);
                this.isReady = true;
                this.fallbackMode = false;
                successPath = pathAttempt;
                return true;
              } else {
                console.warn(`[JSLLM] Generator lieferte ungültiges Ergebnis beim Test:`, testResult);
              }
            } catch (testError) {
              console.error(`[JSLLM] Test-Inferenz fehlgeschlagen:`, testError);
              // Continue to next path if test fails
            }
          } else {
            console.warn(`[JSLLM] Pipeline geladen, aber generator ist kein function. Typ:`, typeof this.generator);
          }
        } catch (error) {
          // Detailed error analysis
          lastError = error;
          
          console.error(`[JSLLM] Fehler beim Laden von "${pathAttempt}":`);
          console.error(`[JSLLM] Fehlertyp: ${(error as Error).constructor?.name || typeof error}`);
          console.error(`[JSLLM] Fehlermeldung: ${error instanceof Error ? error.message : String(error)}`);
          
          if (error instanceof Error && error.stack) {
            console.error(`[JSLLM] Stack Trace:`, error.stack);
          }
          
          // Specific error handling for file-not-found errors
          if (error instanceof Error && error.message.includes('Could not find file')) {
            this.logModelFileStructure();
          }
        }
      }

      // If we're here, all attempts failed
      console.error(`[JSLLM] Alle Versuche (${modelPathsToTry.length} Pfade) zum Laden des Modells sind fehlgeschlagen.`);
      console.error(`[JSLLM] Letzter Fehler:`, lastError);
      
      // Activate fallback
      console.warn(`[JSLLM] Aktiviere Fallback-Generator`);
      this.createEnhancedFallbackGenerator();
      this.isReady = true;
      this.fallbackMode = true;
      return false;

    } catch (error) {
      console.error(`[JSLLM] Unerwarteter Fehler während _initialize:`, error);
      this.createEnhancedFallbackGenerator();
      this.isReady = true;
      this.fallbackMode = true;
      return false;
    } finally {
      this.initPromise = null;
    }
  }

  /**
   * Gibt alle möglichen Modellpfade zurück
   */
  private getModelPathsToTry(isServerEnvironment: boolean): string[] {
    if (isServerEnvironment) {
      // Server environment - prioritize direct ONNX file paths
      return [
        // DIRECT PATHS TO ONNX FILES - HIGHEST PRIORITY
        path.join(process.cwd(), 'node_modules', '@xenova', 'transformers', 'models', this.modelName, 'onnx', 'decoder_model_merged_quantized.onnx'),
        path.join(process.cwd(), 'node_modules', '@xenova', 'transformers', 'models', this.modelName, 'onnx', 'decoder_model_merged.onnx'),
        
        // MODEL DIRECTORY PATHS - MEDIUM PRIORITY
        path.join(process.cwd(), 'node_modules', '@xenova', 'transformers', 'models', this.modelName),
        
        // STANDARD XENOVA PATHS - LOW PRIORITY
        this.modelName,
        `@xenova/${this.modelName}`,
        
        // ALTERNATIVE PATHS - LOWEST PRIORITY
        path.join(process.cwd(), 'src', 'models', this.modelName),
        path.join(process.cwd(), 'models', this.modelName),
        path.join(process.cwd(), 'public', 'models', this.modelName)
      ];
    } else {
      // Browser environment - simpler paths
      return [
        this.modelName,
        `@xenova/${this.modelName}`,
        `/models/${this.modelName}`,
        `/public/models/${this.modelName}`
      ];
    }
  }

  /**
   * Überprüft und protokolliert detaillierte Informationen über einen Pfad
   */
  private checkAndLogPathDetails(pathToCheck: string): void {
    try {
      if (!fs.existsSync(pathToCheck)) {
        console.warn(`[JSLLM] Pfad existiert NICHT: ${pathToCheck}`);
        
        // Try to check the parent directory
        const parentDir = path.dirname(pathToCheck);
        if (fs.existsSync(parentDir)) {
          console.log(`[JSLLM] Übergeordnetes Verzeichnis existiert: ${parentDir}`);
          
          try {
            const files = fs.readdirSync(parentDir);
            console.log(`[JSLLM] Inhalt des übergeordneten Verzeichnisses (${files.length} Einträge):`);
            files.forEach(file => console.log(`  - ${file}`));
          } catch (readError) {
            console.error(`[JSLLM] Fehler beim Lesen des Verzeichnisinhalts:`, readError);
          }
        } else {
          console.warn(`[JSLLM] Auch übergeordnetes Verzeichnis existiert nicht: ${parentDir}`);
        }
      } else {
        console.log(`[JSLLM] Pfad existiert: ${pathToCheck}`);
        
        // For directories: list content
        const stats = fs.statSync(pathToCheck);
        if (stats.isDirectory()) {
          const files = fs.readdirSync(pathToCheck);
          console.log(`[JSLLM] Verzeichnisinhalt (${files.length} Einträge):`);
          files.forEach(file => console.log(`  - ${file}`));
        } else {
          console.log(`[JSLLM] Dateidetails: Größe=${stats.size} Bytes, Zuletzt geändert=${stats.mtime}`);
        }
      }
    } catch (error) {
      console.error(`[JSLLM] Fehler beim Überprüfen des Pfades ${pathToCheck}:`, error);
    }
  }

  /**
   * Protokolliert die Modellordnerstruktur für Diagnosezwecke
   */
  private logModelFileStructure(): void {
    try {
      const isServerEnvironment = typeof window === 'undefined';
      if (!isServerEnvironment) return;

      const baseModelDir = path.join(process.cwd(), 'node_modules', '@xenova', 'transformers', 'models');
      console.log(`[JSLLM] Überprüfe Xenova Transformers Modellverzeichnis: ${baseModelDir}`);
      
      if (!fs.existsSync(baseModelDir)) {
        console.error(`[JSLLM] Basis-Modellverzeichnis existiert nicht: ${baseModelDir}`);
        return;
      }
      
      // List model directories
      const modelDirs = fs.readdirSync(baseModelDir);
      console.log(`[JSLLM] Gefundene Modellverzeichnisse (${modelDirs.length}):`, modelDirs);
      
      // Check specific model directory
      const specificModelDir = path.join(baseModelDir, this.modelName);
      if (!fs.existsSync(specificModelDir)) {
        console.error(`[JSLLM] Spezifisches Modellverzeichnis existiert nicht: ${specificModelDir}`);
        return;
      }
      
      // List files in the model directory
      const modelFiles = fs.readdirSync(specificModelDir);
      console.log(`[JSLLM] Dateien im Modellverzeichnis (${modelFiles.length}):`, modelFiles);
      
      // Check ONNX directory
      const onnxDir = path.join(specificModelDir, 'onnx');
      if (!fs.existsSync(onnxDir)) {
        console.error(`[JSLLM] ONNX-Verzeichnis existiert nicht: ${onnxDir}`);
        return;
      }
      
      // List ONNX files
      const onnxFiles = fs.readdirSync(onnxDir);
      console.log(`[JSLLM] ONNX-Dateien (${onnxFiles.length}):`, onnxFiles);
      
      // Check specific ONNX files
      const quantizedPath = path.join(onnxDir, 'decoder_model_merged_quantized.onnx');
      const regularPath = path.join(onnxDir, 'decoder_model_merged.onnx');
      
      console.log(`[JSLLM] Quantisierte ONNX-Datei existiert: ${fs.existsSync(quantizedPath)}`);
      console.log(`[JSLLM] Reguläre ONNX-Datei existiert: ${fs.existsSync(regularPath)}`);
      
      if (fs.existsSync(quantizedPath)) {
        const stats = fs.statSync(quantizedPath);
        console.log(`[JSLLM] Quantisierte ONNX-Datei: Größe=${stats.size} Bytes, Geändert=${stats.mtime}`);
      }
      
      if (fs.existsSync(regularPath)) {
        const stats = fs.statSync(regularPath);
        console.log(`[JSLLM] Reguläre ONNX-Datei: Größe=${stats.size} Bytes, Geändert=${stats.mtime}`);
      }
    } catch (error) {
      console.error(`[JSLLM] Fehler beim Überprüfen der Modellordnerstruktur:`, error);
    }
  }
  
  /**
   * Erstellt einen erweiterten Fallback-Generator mit kontextsensitiven Antworten
   */
  private createEnhancedFallbackGenerator(): void {
    console.log(`[JSLLM] Erstelle erweiterten kontextsensitiven Fallback-Generator`);
    
    this.generator = async (prompt: string, config?: any) => {
      console.log(`[EnhancedFallback] Verarbeite Prompt: "${prompt.substring(0, 50)}..."`);
      
      // Extrahiere die Benutzeranfrage und speichere sie
      const userMessage = this.extractUserMessage(prompt);
      if (userMessage) {
        this.lastUserMessage = userMessage;
        this.conversationHistory.push({ role: 'user', content: userMessage });
        console.log(`[EnhancedFallback] Extrahierte Benutzeranfrage: "${userMessage}"`);
      }
      
      // Kontextsensitive Antwortgenerierung basierend auf Schlüsselwörtern
      let responseText = this.getContextualResponse(userMessage);
      
      // Füge Antwort zur Konversationshistorie hinzu
      this.conversationHistory.push({ role: 'assistant', content: responseText });
      
      // Behalte nur die letzten N Nachrichten bei
      if (this.conversationHistory.length > 8) {
        this.conversationHistory = this.conversationHistory.slice(-8);
      }
      
      console.log(`[EnhancedFallback] Generierte Antwort: "${responseText.substring(0, 50)}${responseText.length > 50 ? '...' : ''}"`);
      return [{ generated_text: prompt + "\n\n" + responseText }];
    };
  }
  
  /**
   * Generiert eine kontextsensitive Antwort basierend auf Schlüsselwörtern
   */
  private getContextualResponse(userMessage: string): string {
    // Kontextanalyse aus Konversationsverlauf
    const recentMessages = this.conversationHistory.slice(-4);
    const hasAskedAboutCancellation = this.messageContainsCancel(userMessage) || 
                                     recentMessages.some(msg => 
                                       msg.role === 'user' && this.messageContainsCancel(msg.content));
    
    const hasMentionedPreviousQuestion = recentMessages.some(msg => 
      msg.role === 'user' && msg.content.match(/hab.*gesagt|bereits.*erwähnt|schon.*geschrieben|gerade.*(gesagt|gefragt)/i)
    );
    
    // Themenspezifische Antworten
    if (this.messageContainsCancel(userMessage)) {
      return "Um dein Abonnement zu kündigen, gehe in deinem Konto auf 'Abonnement verwalten' und wähle die Option 'Kündigen'. Die Änderung wird zum Ende der aktuellen Abrechnungsperiode wirksam.";
    }
    else if (userMessage.match(/rechnung|zahlung|kosten|gebühr|preis/i)) {
      return "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.";
    }
    else if (userMessage.match(/bist du doof|dumm|idiot|stupid/i)) {
      return "Ich verstehe deine Frustration. Als KI-Assistent versuche ich, so hilfreich wie möglich zu sein, habe aber manchmal Schwierigkeiten, Anfragen richtig zu verstehen. Bitte teile mir mit, wie ich dir besser helfen kann.";
    }
    else if (userMessage.match(/wie.+finde|wo.+finde|zugang|route|weg|gehe|gelange|pfad|navigation/i)) {
      return "Um dorthin zu gelangen, melde dich in deinem Konto an und klicke oben im Menü auf 'Mein Konto'. In der linken Seitenleiste findest du dann den Bereich 'Meine Rechnungen'.";
    }
    else if (userMessage.match(/verstehe nicht|falsch|funktioniert nicht|problem|fehler/i)) {
      return "Es tut mir leid, dass es Probleme gibt. Könntest du genauer beschreiben, was nicht funktioniert? Dann kann ich dir besser helfen.";
    }
    else if (userMessage.match(/danke|dank/i)) {
      return "Gerne! Ich helfe dir jederzeit weiter. Hast du noch weitere Fragen?";
    }
    else if (userMessage.match(/hallo|hi|hey|guten tag/i)) {
      return "Hallo! Schön, dass du da bist. Wie kann ich dir heute behilflich sein?";
    }
    else if (userMessage.match(/delete.*account|account.*löschen|konto.*löschen/i)) {
      return "Um deinen Account zu löschen, gehe zu den Kontoeinstellungen und wähle 'Account löschen'. Bitte beachte, dass dies alle deine Daten unwiderruflich entfernt.";
    }
    else if (hasMentionedPreviousQuestion && hasAskedAboutCancellation) {
      return "Entschuldigung für das Missverständnis. Um dein Abonnement zu kündigen, gehe in deinem Konto auf 'Abonnement verwalten' und wähle die Option 'Kündigen'. Die Änderung wird zum Ende der aktuellen Abrechnungsperiode wirksam.";
    }
    else if (hasMentionedPreviousQuestion) {
      return "Entschuldigung, dass ich deine Frage nicht richtig verstanden habe. Könntest du bitte präzisieren, worauf du dich beziehst? Dann kann ich dir besser helfen.";
    }
    else if (userMessage && userMessage.match(/chronische?\s+schmerz/i)) {
      return "Wir haben ein Subliminal zur 'Schmerzlinderung', das vielen unserer Nutzer bei der Bewältigung von chronischen Schmerzen hilft. Es arbeitet mit Entspannungstechniken und positiven Suggestionen, um die Schmerzwahrnehmung zu reduzieren. Es ersetzt jedoch keine medizinische Behandlung - bitte konsultiere bei anhaltenden Schmerzen einen Arzt.";
    }
    else if (userMessage && userMessage.match(/schlaf|einschlaf|besser\s+schlaf/i)) {
      return "Ja, wir haben mehrere Subliminals für besseren Schlaf. In der Kategorie 'Entspannung & Schlaf' findest du unser 'Tiefer Schlaf' Programm, das vielen Nutzern bereits zu einer erholsameren Nachtruhe verholfen hat.";
    }
    
    // Abwechslungsreiche generische Antworten
    const genericResponses = [
      "Ich verstehe dein Anliegen. Wie kann ich dir dabei behilflich sein?",
      "Danke für deine Anfrage. Könntest du mir weitere Details nennen, damit ich dir besser helfen kann?",
      "Interessante Frage. Könntest du mir mehr Kontext geben, damit ich eine passende Antwort geben kann?",
      "Ich stehe dir gerne zur Verfügung. Könntest du deine Anfrage bitte präzisieren?"
    ];
    
    const index = Math.floor(Math.random() * genericResponses.length);
    return genericResponses[index] || "Wie kann ich dir helfen?";
  }
  
  /**
   * Prüft, ob eine Nachricht Kündigungsabsichten enthält
   */
  private messageContainsCancel(message: string): boolean {
    return !!message.match(/kündigen|cancel|abbestellen|beenden|stornieren|beende|abmelden|abonnement.*ende/i);
  }
  
  /**
   * Extrahiert die Benutzeranfrage aus dem Prompt, unabhängig vom Format
   */
  private extractUserMessage(prompt: string): string {
    // Verschiedene Prompt-Formate erkennen
    const patterns = [
      /Benutzer: (.*?)(\n|$)/,
      /Benutzer sagt: (.*?)(\n|$)/,
      /Anfrage: (.*?)(\n|$)/,
      /:\s*"(.*?)"\s*[\n$]/,
      /\n([^:]+?)(?:\n|$)/,
      /.*?:\s+(.*?)(?:\n|$)/,
    ];
    
    // Bekannte Prompt-Muster extrahieren
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1] && match[1].trim().length > 0) {
        return match[1].trim();
      }
    }
    
    // Extrahiere den letzten Teil des Prompts als Fallback
    const lines = prompt.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      const lastLineRaw = lines[lines.length - 1];
      const lastLine = lastLineRaw ? lastLineRaw.trim() : "";
      if (lastLine.length > 0 && !lastLine.includes("Assistent:")) {
        return lastLine;
      }
    }
    
    // Verwende den gespeicherten letzten Benutzer-Prompt als letzten Ausweg
    return this.lastUserMessage || "";
  }
  
  /**
   * Generiert eine Antwort basierend auf einem Prompt
   */
  async generateResponse(prompt: string, config: Partial<GenerationConfig> = {}): Promise<string> {
    if (!this.isReady) {
      await this.initialize();
    }
    
    if (!this.generator) {
      return "Entschuldigung, das Modell ist nicht verfügbar.";
    }
    
    try {
      const fullConfig: GenerationConfig = {
        max_length: prompt.length + 150,
        temperature: 0.7,
        ...config
      };
      
      console.log(`[JSLLM] Generiere Antwort für: "${prompt.substring(0, 50)}..."`);
      
      const output = await this.generator(prompt, fullConfig);
      console.log(`[JSLLM] Generator-Ausgabe:`, output);
      
      const generatedText = output && output[0] && output[0].generated_text 
        ? output[0].generated_text
        : "";
      
      // Entferne den Prompt aus der Antwort
      const response = generatedText.startsWith(prompt)
        ? generatedText.substring(prompt.length).trim() || "Entschuldigung, ich konnte keine Antwort generieren."
        : generatedText || "Entschuldigung, ich konnte keine Antwort generieren.";
      
      return response;
      
    } catch (error) {
      console.error("[JSLLM] Fehler bei der Textgenerierung:", error);
      
      if (!this.fallbackMode) {
        this.createEnhancedFallbackGenerator();
        this.fallbackMode = true;
        
        try {
          const output = await this.generator(prompt);
          if (output && output[0] && output[0].generated_text) {
            const text = output[0].generated_text;
            return text.startsWith(prompt) ? text.substring(prompt.length).trim() : text;
          }
        } catch (fallbackError) {
          console.error("[JSLLM] Auch Fallback-Generator fehlgeschlagen:", fallbackError);
        }
      }
      
      return "Entschuldigung, ich konnte keine Antwort generieren.";
    }
  }
  
  /**
   * Gibt die Ressourcen des Modells frei
   */
  async dispose(): Promise<void> {
    try {
      if (this.generator && typeof this.generator.dispose === 'function') {
        await this.generator.dispose();
      }
      
      this.generator = null;
      this.isReady = false;
      this.fallbackMode = false;
      this.initPromise = null;
      this.conversationHistory = [];
      // Clear the dynamically imported modules
      this.transformersModule = null;
      this.env = null;
      console.log(`[JSLLM] Ressourcen freigegeben`);
    } catch (error) {
      console.error('[JSLLM] Fehler bei der Ressourcenfreigabe:', error);
    }
  }
  
  /**
   * Gibt Statusinformationen über das Modell zurück
   */
  getStatus(): { isReady: boolean; fallbackMode: boolean; modelName: string } {
    return {
      isReady: this.isReady,
      fallbackMode: this.fallbackMode,
      modelName: this.modelName
    };
  }
}

// =============== Generative Pipeline ===============

/**
 * Generative Pipeline für die Verarbeitung von Benutzeranfragen
 */
export class GenerativePipeline {
  private llm: JSLLM;
  private promptManager: PromptManager;
  private conversationHistory: { role: string, content: string }[] = [];
  private maxHistoryLength: number = 5;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<boolean> | null = null;
  
  /**
   * Initialisiert die Generative Pipeline mit verbesserten Komponenten
   */
  constructor() {
    this.llm = new JSLLM();
    this.promptManager = new PromptManager();
  }
  
  /**
   * Initialisiert das Language Model
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }
  
  /**
   * Interne Initialisierungsimplementierung
   */
  private async _initialize(): Promise<boolean> {
    try {
      console.log('[GenerativePipeline] Initialisiere Komponenten...');
      
      // LLM initialisieren mit Fehlerbehandlung
      const llmInitialized = await this.llm.initialize();
      
      if (!llmInitialized) {
        console.warn('[GenerativePipeline] LLM-Initialisierung fehlgeschlagen, verwende Fallback-Modus');
      } else {
        console.log('[GenerativePipeline] LLM erfolgreich initialisiert');
      }
      
      this.isInitialized = true;
      this.initializationPromise = null;
      
      return llmInitialized;
    } catch (error) {
      console.error('[GenerativePipeline] Fehler bei der Initialisierung:', error);
      this.initializationPromise = null;
      return false;
    }
  }
  
  /**
   * Fügt eine Nachricht zur Konversationshistorie hinzu
   */
  addToHistory(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });
    
    // Begrenze die Größe der Historie
    if (this.conversationHistory.length > this.maxHistoryLength * 2) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength * 2);
    }
  }
  
  /**
   * Formatiert die Konversationshistorie für den Prompt
   */
  getFormattedHistory(): string {
    return this.conversationHistory
      .map(msg => `${msg.role === 'user' ? 'Benutzer' : 'Assistent'}: ${msg.content}`)
      .join('\n');
  }
  
  /**
   * Löscht die Konversationshistorie
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }
  
  /**
   * Generiert eine Antwort auf die Benutzeranfrage
   */
  async generateResponse(
    userMessage: string, 
    intentName: string, 
    intentType: string, 
    intentConfidence: number,
    entities: any[] = [],
    language: string = 'de'
  ): Promise<string> {
    // Sichere Typumwandlung für language
    const validLanguage: Language = (language === 'en') ? 'en' : 'de';
    
    try {
      // Sicherstellen, dass die Pipeline initialisiert ist
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      // 1. Nachricht zur Historie hinzufügen
      this.addToHistory('user', userMessage);
      
      // 2. Direkte Antworten für kritische Anfragen
      if (/kündigen|cancel|abbestellen|beenden|stornieren/i.test(userMessage.toLowerCase())) {
        const cancelResponse = validLanguage === 'en'
          ? "You can cancel your subscription anytime in your account settings under 'Manage Subscription'. The cancellation will take effect at the end of your current billing period."
          : "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen. Die Kündigung wird zum Ende deiner aktuellen Zahlungsperiode wirksam.";
        
        this.addToHistory('assistant', cancelResponse);
        return cancelResponse;
      }
      
      if (/rechnung|zahlung|kosten|gebühr|preis/i.test(userMessage.toLowerCase())) {
        const invoiceResponse = validLanguage === 'en'
          ? "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically."
          : "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.";
        
        this.addToHistory('assistant', invoiceResponse);
        return invoiceResponse;
      }
      
      // 3. Standard-Generative Pipeline für andere Anfragen
      console.log('[GenerativePipeline] Generiere Antwort mit LLM');
      
      // Kontext aufbauen
      const context = {
        intentName,
        intentType,
        intentConfidence,
        entities,
        conversationHistory: this.getFormattedHistory(),
        language: validLanguage
      };
      
      // Optimierten Prompt erstellen
      const prompt = this.promptManager.buildPrompt(userMessage, context);
      
      // Antwort generieren
      const response = await this.llm.generateResponse(prompt, {
        max_length: prompt.length + 200,
        temperature: 0.7
      });
      
      // Antwort verbessern und kontextualisieren
      const enhancedResponse = this.promptManager.enhanceResponse(
        response, 
        intentName, 
        intentType, 
        userMessage, 
        validLanguage
      );
      
      // Antwort zur Historie hinzufügen
      this.addToHistory('assistant', enhancedResponse);
      
      return enhancedResponse;
    } catch (error) {
      console.error('[GenerativePipeline] Fehler bei der Antwortgenerierung:', error);
      
      // Fehlerfall mit kontextabhängigem Fallback behandeln
      let fallbackMessage: string;
      
      if (/kündigen|cancel|abbestellen|beenden|stornieren/i.test(userMessage.toLowerCase())) {
        fallbackMessage = validLanguage === 'en'
          ? "You can cancel your subscription in your account settings under 'Manage Subscription'."
          : "Du kannst dein Abonnement in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen.";
      } else if (/rechnung|zahlung|kosten|gebühr|preis/i.test(userMessage.toLowerCase())) {
        fallbackMessage = validLanguage === 'en'
          ? "You can find your invoices in your account area under 'My Invoices'."
          : "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'.";
      } else {
        fallbackMessage = validLanguage === 'en' 
          ? "I apologize, but I'm having trouble processing your request right now. How else can I help you?"
          : "Entschuldigung, ich habe gerade Schwierigkeiten, deine Anfrage zu verarbeiten. Wie kann ich dir sonst helfen?";
      }
      
      this.addToHistory('assistant', fallbackMessage);
      return fallbackMessage;
    }
  }
  
  /**
   * Gibt den Status des Language Models zurück
   */
  getStatus(): { isReady: boolean; fallbackMode: boolean; modelName: string } {
    return this.llm.getStatus();
  }
  
  /**
   * Gibt Ressourcen frei
   */
  async dispose(): Promise<void> {
    try {
      await this.llm.dispose();
      this.clearHistory();
      this.isInitialized = false;
      this.initializationPromise = null;
    } catch (error) {
      console.error('[GenerativePipeline] Fehler bei der Ressourcenfreigabe:', error);
    }
  }
}

// =============== Module-Export ===============

export default {
  JSLLM,
  GenerativePipeline,
  getOnnxRuntime
};