import type { Language } from '@/types/nlp.types';

// Interface für bessere Typsicherheit
interface ContextInfo {
  intentName: string;
  intentType: string;
  intentConfidence: number;
  entities: any[];
  conversationHistory: string;
  language: Language;
}

/**
 * Knowledge Base für kontextspezifische Antworten
 */
const KNOWLEDGE_BASE = {
  app_info: {
    de: `Mindfluence ist eine App für Persönlichkeitsentwicklung und mentales Training.
Sie bietet eine Sammlung von Audio-Inhalten wie Meditationen, Affirmationen und Subliminals,
die beim Training des Unterbewusstseins helfen und die Erreichung persönlicher Ziele unterstützen.
Die App enthält verschiedene Kategorien wie Selbstvertrauen, Erfolg, Gesundheit und Beziehungen.`,
    en: `Mindfluence is an app for personal development and mental training.
It offers a collection of audio content such as meditations, affirmations, and subliminals 
that help train the subconscious mind and support achieving personal goals.
The app includes various categories like self-confidence, success, health, and relationships.`
  },
  
  invoices: {
    de: `Rechnungen befinden sich im Kontobereich unter 'Meine Rechnungen'. 
Dort werden alle Zahlungen und Rechnungen chronologisch aufgelistet.
Um dorthin zu gelangen, melde dich in deinem Konto an und klicke auf 'Mein Konto' im Hauptmenü.
Von dort navigiere zur Sektion 'Meine Rechnungen' in der linken Seitenleiste.`,
    en: `Invoices can be found in the account area under 'My Invoices'.
All payments and invoices are listed there chronologically.
To get there, log into your account and click on 'My Account' in the main menu.
From there, navigate to the 'My Invoices' section in the left sidebar.`
  },
  
  cancellation: {
    de: `Um dein Abonnement zu kündigen, folge diesen Schritten:
1. Melde dich in deinem Konto an
2. Navigiere zu 'Mein Konto' im Hauptmenü
3. Wähle 'Abonnement verwalten' in der linken Seitenleiste
4. Klicke auf die Schaltfläche 'Abonnement kündigen'
5. Bestätige deine Entscheidung

Dein Abonnement bleibt bis zum Ende der aktuellen Abrechnungsperiode aktiv.`,
    en: `To cancel your subscription, follow these steps:
1. Log into your account
2. Navigate to 'My Account' in the main menu
3. Select 'Manage Subscription' in the left sidebar
4. Click on the 'Cancel Subscription' button
5. Confirm your decision

Your subscription will remain active until the end of the current billing period.`
  }
};

/**
 * Optimierter Prompt-Manager für präzisere und kontextbezogene Antworten
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
      
      // Füge spezifisches Beispiel hinzu, wenn verfügbar
      const exampleForIntent = this.getExampleForIntent(intentName, language);
      if (exampleForIntent) {
        intentContext += `\nEin Beispiel für eine gute Antwort wäre: "${exampleForIntent}"`;
      }
    }
    
    // Entity-Kontext - erweitert mit relevanten Details
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
        ? '\nThe user wants to cancel their subscription. Provide clear step-by-step instructions on how to cancel.'
        : '\nDer Nutzer möchte sein Abonnement kündigen. Gib klare Schritt-für-Schritt-Anweisungen zur Kündigung.';
    }
    // Standardanweisungen basierend auf Intent-Typ
    else if (intentType === 'faq') {
      instructions = language === 'en'
        ? '\nAnswer the question directly and informatively. Avoid asking clarification questions when the intent is clear.'
        : '\nBeantworte die Frage direkt und informativ. Vermeide Rückfragen, wenn die Absicht klar ist.';
    } else if (intentType === 'function') {
      instructions = language === 'en'
        ? '\nExplain clearly how the user can use this feature. Be precise and helpful.'
        : '\nErkläre klar, wie der Nutzer diese Funktion verwenden kann. Sei präzise und hilfreich.';
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
   * Hilfsfunktion: Gibt ein Beispiel für einen Intent zurück, wenn verfügbar
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
   * Erweitert eine generierte Antwort basierend auf dem Intent und der Benutzernachricht
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
  
  /**
   * Gibt eine spezifische Antwort für einen Intent zurück
   */
  getDirectResponse(intentName: string, language: Language): string | null {
    return this.getExampleForIntent(intentName, language);
  }
}