import { JSLLM } from '../models/jsLLM';
import type { Language } from '@/types/nlp.types';

// Interface for better type safety
interface ContextInfo {
  intentName: string;
  intentType: string;
  intentConfidence: number;
  entities: any[];
  conversationHistory: string;
  language: Language;
}

/**
 * Prompt-Manager für LLM
 */
export class PromptManager {
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
    "faq_pricing_info": {
      de: "Unser Basispaket beginnt bei 9,99€ pro Monat. Premium-Funktionen sind für 19,99€ verfügbar. Alle Pakete können monatlich oder jährlich abgerechnet werden, wobei du bei jährlicher Zahlung 20% sparst.",
      en: "Our basic package starts at $9.99 per month. Premium features are available for $19.99. All packages can be billed monthly or annually, with annual payment saving you 20%."
    },
    "faq_cancel_subscription": {
      de: "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen. Die Kündigung wird zum Ende deiner aktuellen Zahlungsperiode wirksam.",
      en: "You can cancel your subscription anytime in your account settings under 'Manage Subscription'. The cancellation will take effect at the end of your current billing period."
    },
    // Funktions-Intents
    "function_find_specific_content": {
      de: "Was genau suchst du? Ich kann dir helfen, deine Rechnungen, bestimmte Inhalte oder Funktionen zu finden.",
      en: "What exactly are you looking for? I can help you find your invoices, specific content, or features."
    },
    "function_change_password": {
      de: "Um dein Passwort zu ändern, gehe zu 'Mein Konto' > 'Sicherheit' > 'Passwort ändern'.",
      en: "To change your password, go to 'My Account' > 'Security' > 'Change Password'."
    }
  };
  
  /**
   * Erstellt einen optimierten Prompt basierend auf der Benutzereingabe und dem Kontext
   */
  buildPrompt(userMessage: string, context: ContextInfo): string {
    const { intentName, intentType, intentConfidence, entities, conversationHistory, language } = context;
    
    // Wähle passenden System-Prompt
    const systemPrompt = this.systemPrompts[language] || this.systemPrompts.de;
    
    // Erweiterter Intent-Kontext mit spezifischen Beispielen
    let intentContext = '';
    
    if (intentName !== "unknown") {
      // Grundlegende Intent-Information
      intentContext = `Ich habe folgende Absicht erkannt: ${intentName} (Typ: ${intentType}, Konfidenz: ${(intentConfidence * 100).toFixed(0)}%).`;
      
      // Füge spezifisches Beispiel hinzu, wenn verfügbar
      const exampleForIntent = this.getExampleForIntent(intentName, language);
      if (exampleForIntent) {
        intentContext += `\nEin Beispiel für eine gute Antwort wäre: "${exampleForIntent}"`;
      }
      
      // Spezifische Anweisungen für bestimmte Intent-Typen
      if (intentName === "faq_find_invoice" || (intentName === "function_find_specific_content" && userMessage.toLowerCase().includes("rechnung"))) {
        intentContext += `\nDer Nutzer fragt nach Rechnungen. Erkläre, dass Rechnungen im Kontobereich unter "Meine Rechnungen" zu finden sind.`;
      }
    }
    
    // Entity-Kontext - erweitert mit relevanten Details
    const entityContext = entities.length > 0
      ? `Relevante Informationen: ${entities.map((e: any) => `${e.type} (${e.value})`).join(', ')}.`
      : "";
    
    // Optimierte Konversationsgeschichte
    const historyContext = conversationHistory ? 
      `\nBisherige Konversation:\n${conversationHistory}` : '';
    
    // Verbesserte Anweisungen für natürlichere Antworten
    let specificInstructions = '';
    
    // Spezifische Anweisungen basierend auf dem Intent hinzufügen
    if (intentType === 'faq') {
      specificInstructions = '\nBeantworte die Frage direkt und informativ. Vermeide Rückfragen, wenn die Absicht klar ist.';
    } else if (intentType === 'function') {
      specificInstructions = '\nErkläre klar, wie der Nutzer diese Funktion verwenden kann. Sei präzise und hilfreich.';
    } else if (intentType === 'smalltalk') {
      specificInstructions = '\nAntworte natürlich, freundlich und kurz auf die Small-Talk-Anfrage.';
    }
    
    // Wenn die Nachricht eine Frage nach Rechnungen enthält, gib eine spezifische Antwort
    if (userMessage.toLowerCase().includes("rechnung") || userMessage.toLowerCase().includes("invoice")) {
      specificInstructions += '\nDa der Nutzer nach Rechnungen fragt, erkläre konkret, dass Rechnungen im Kontobereich unter "Meine Rechnungen" zu finden sind.';
    }
    
    // Vollständigen Prompt zusammenbauen
    return `${systemPrompt}

${historyContext}

${intentContext}
${entityContext}
${specificInstructions}

Benutzer: ${userMessage}
Assistent:`;
  }
  
  /**
   * Hilfsfunktion: Gibt ein Beispiel für einen Intent zurück, wenn verfügbar
   */
  getExampleForIntent(intentName: string, language: Language): string | null {
    if (intentName in this.intentExamples) {
      // Explizite Type-Assertion für TypeScript
      const examplesForIntent = this.intentExamples[intentName] as Record<Language, string>;
      if (language in examplesForIntent) {
        return examplesForIntent[language];
      }
    }
    return null;
  }
  
  /**
   * Erweitert eine generierte Antwort basierend auf dem Intent und der Benutzernachricht
   */
  enhanceResponse(response: string, intentName: string, intentType: string, userMessage: string, language: Language): string {
    // Wenn die Antwort zu generisch ist und wir ein spezifisches Beispiel haben
    if (response.includes("Was möchtest du wissen?") || response.includes("kann ich helfen")) {
      
      // Spezialbehandlung für Rechnungsanfragen
      if (intentName === "faq_find_invoice" || 
          (intentName === "function_find_specific_content" && userMessage.toLowerCase().includes("rechnung"))) {
        // Ersetze die generische Antwort durch die spezifische Antwort für Rechnungen
        const invoiceExample = this.getExampleForIntent("faq_find_invoice", language);
        if (invoiceExample) {
          return invoiceExample;
        }
      }
      
      // Für andere bekannte Intents
      const example = this.getExampleForIntent(intentName, language);
      if (example) {
        return example;
      }
    }
    
    return response;
  }
  
  /**
   * Gibt eine spezifische Antwort für einen Intent zurück
   */
  getDirectResponse(intentName: string, language: Language): string | null {
    return this.getExampleForIntent(intentName, language);
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
  
  async generateResponse(
    userMessage: string, 
    intentName: string, 
    intentType: string, 
    intentConfidence: number,
    entities: any[] = [],
    language: string = 'de'
  ): Promise<string> {
    // Stelle sicher, dass language ein gültiger Language-Typ ist
    const validLanguage: Language = (language === 'en') ? 'en' : 'de';
    
    try {
      // Behandle spezielle Fälle direkt
      if (this.shouldUseDirectResponse(userMessage, intentName, intentType)) {
        console.log(`[GenerativePipeline] Verwende direkte Antwort für ${intentName}`);
        const directResponse = this.getDirectResponse(userMessage, intentName, validLanguage);
        
        if (directResponse) {
          // Füge direkte Antwort zur Geschichte hinzu
          this.addToHistory('user', userMessage);
          this.addToHistory('assistant', directResponse);
          return directResponse;
        }
      }
      
      // Nachricht zur Geschichte hinzufügen
      this.addToHistory('user', userMessage);
      
      // Kontext aufbauen
      const context: ContextInfo = {
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
        max_length: prompt.length + 150, // Prompt + ca. 150 Zeichen
        temperature: 0.7
      });
      
      // Verbessere die Antwort bei Bedarf
      const enhancedResponse = this.promptManager.enhanceResponse(
        response, 
        intentName, 
        intentType, 
        userMessage, 
        validLanguage
      );
      
      // Antwort zur Geschichte hinzufügen
      this.addToHistory('assistant', enhancedResponse);
      
      return enhancedResponse;
    } catch (error) {
      console.error('[GenerativePipeline] Fehler bei der Antwortgenerierung:', error);
      
      // Fallback für Fehlerfall
      const fallbackMessage = validLanguage === 'en' 
        ? "I apologize, but I'm having trouble processing your request right now."
        : "Entschuldigung, ich habe Schwierigkeiten, deine Anfrage zu verarbeiten.";
      
      this.addToHistory('assistant', fallbackMessage);
      return fallbackMessage;
    }
  }
  
  /**
   * Prüft, ob eine direkte Antwort verwendet werden soll
   */
  private shouldUseDirectResponse(userMessage: string, intentName: string, intentType: string): boolean {
    // Für bestimmte Intents immer direkte Antworten verwenden
    const directResponseIntents = [
      'faq_find_invoice',
      'faq_pricing_info',
      'faq_cancel_subscription',
      'function_change_password'
    ];
    
    if (directResponseIntents.includes(intentName)) {
      return true;
    }
    
    // Bei Fragen nach Rechnungen
    if (intentType === 'function' && 
        intentName === 'function_find_specific_content' && 
        userMessage.toLowerCase().includes('rechnung')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Liefert eine direkte Antwort für bestimmte Intents
   */
  private getDirectResponse(userMessage: string, intentName: string, language: Language): string | null {
    // Prüfe zuerst auf Fragen nach Rechnungen
    if (userMessage.toLowerCase().includes('rechnung') || 
        userMessage.toLowerCase().includes('invoice')) {
      
      return language === 'en'
        ? "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically."
        : "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.";
    }
    
    // Verwende die Methode des PromptManagers für die spezifische Antwort
    return this.promptManager.getDirectResponse(intentName, language);
  }
  
  /**
   * Gibt den Status des Language Models zurück
   */
  getStatus(): { isReady: boolean; fallbackMode: boolean; modelName: string } {
    return this.llm.getStatus();
  }
}