// Define necessary types that would normally be in '@/types/nlp.types'
interface Entity {
  type: string;
  value: string;
  text?: string;
  confidence?: number;
  start?: number;
  end?: number;
  metadata?: Record<string, any>;
}

interface Intent {
  name: string;
  type?: string;
  confidence: number;
}

interface Context {
  name: string;
  confidence: number;
  entities: Entity[];
  recentIntents: Intent[];
  topics: string[];
  isLongConversation?: boolean;
  messageCount?: number;
}

type Language = 'de' | 'en';

interface NLPProcessingResult {
  intent?: Intent | null;
  entities: Entity[];
  context?: Context;
  error?: Error | string;
}

import { config } from '../config';

/**
 * Generiert eine Antwort basierend auf den Ergebnissen der NLP-Verarbeitung
 * 
 * @param nlpResult Das Ergebnis der NLP-Verarbeitung (Intent, Entities, Kontext)
 * @param language Die Sprache, in der die Antwort generiert werden soll
 * @returns Eine für den Benutzer geeignete Antwort als String
 */
export async function generateResponse(
  nlpResult: NLPProcessingResult,
  language: Language = 'de'
): Promise<string> {
  const { intent, entities, context, error } = nlpResult;
  
  // Behandle Fehler bei der NLP-Verarbeitung
  if (error) {
    return getErrorResponse(language);
  }
  
  // Wenn kein Intent erkannt wurde oder die Konfidenz zu niedrig ist
  if (
    !intent ||
    !config.nlp.intentThresholds ||
    intent.confidence < config.nlp.intentThresholds.low
  ) {
    return getUnknownIntentResponse(language, context);
  }

  try {
    // Je nach Intent-Typ unterschiedliche Antwortgenerierungsstrategien verwenden
    switch (intent.type) {
      case 'faq':
        return await generateFaqResponse(intent, entities, language, context);
      
      case 'smalltalk':
        return await generateSmalltalkResponse(intent, entities, language, context);
      
      case 'function':
        return await generateFunctionResponse(intent, entities, language, context);
      
      default:
        // Fallback für unbekannte Intent-Typen
        return getUnknownIntentResponse(language, context);
    }
  } catch (error) {
    console.error('Fehler bei der Antwortgenerierung:', error);
    return getErrorResponse(language);
  }
}

/**
 * Generiert eine Antwort für FAQ-Intents durch Abrufen der entsprechenden Antwortvorlage
 */
async function generateFaqResponse(
  intent: Intent,
  entities: Entity[],
  language: Language,
  context?: Context
): Promise<string> {
  try {
    // Lade die FAQ-Antworten aus der entsprechenden Sprachdatei
    const faqResponses = await import(`@/data/chatbot/faq_${language}.json`);
    
    // Suche nach der passenden Antwortvorlage für diesen Intent
    const responseTemplate = faqResponses[intent.name];
    
    if (!responseTemplate) {
      console.warn(`Keine Antwortvorlage gefunden für FAQ-Intent: ${intent.name}`);
      return getGenericResponse(language, 'faq');
    }
    
    // Ersetze Platzhalter in der Antwortvorlage mit Entity-Werten
    return fillResponseTemplate(responseTemplate, entities, context);
  } catch (error) {
    console.error('Fehler beim Generieren der FAQ-Antwort:', error);
    return getGenericResponse(language, 'faq');
  }
}

/**
 * Generiert eine Antwort für Smalltalk-Intents
 */
async function generateSmalltalkResponse(
  intent: Intent,
  entities: Entity[],
  language: Language,
  context?: Context
): Promise<string> {
  try {
    // Lade die Smalltalk-Antworten aus der entsprechenden Sprachdatei
    const smalltalkResponses = await import(`@/data/chatbot/smalltalk_${language}.json`);
    
    // Suche nach möglichen Antworten für diesen Intent
    const possibleResponses = smalltalkResponses[intent.name];
    
    if (!possibleResponses || possibleResponses.length === 0) {
      console.warn(`Keine Antwortvorlage gefunden für Smalltalk-Intent: ${intent.name}`);
      return getGenericResponse(language, 'smalltalk');
    }
    
    // Wähle zufällig eine der möglichen Antworten
    const randomIndex = Math.floor(Math.random() * possibleResponses.length);
    const responseTemplate = possibleResponses[randomIndex];
    
    // Ersetze Platzhalter in der Antwortvorlage mit Entity-Werten
    return fillResponseTemplate(responseTemplate, entities, context);
  } catch (error) {
    console.error('Fehler beim Generieren der Smalltalk-Antwort:', error);
    return getGenericResponse(language, 'smalltalk');
  }
}

/**
 * Generiert eine Antwort für Funktions-Intents, die eine spezifische Aktion auslösen
 */
async function generateFunctionResponse(
  intent: Intent,
  entities: Entity[],
  language: Language,
  context?: Context
): Promise<string> {
  // Hier würde die Logik zur Ausführung der entsprechenden Funktion implementiert
  // In einer echten Anwendung könnte dies externe APIs aufrufen, Datenbank-Abfragen durchführen, etc.

  // Beispielimplementierung
  const functionName = intent.name.replace('function_', '');
  
  // Simuliere verschiedene Funktionen
  switch (functionName) {
    case 'weather':
      // Beispiel für eine Wetter-Funktion
      const locationEntity = entities.find(e => e.type === 'location');
      const location = locationEntity?.value || 'Berlin';
      
      return language === 'de'
        ? `Das aktuelle Wetter in ${location} ist sonnig bei 22°C.`
        : `The current weather in ${location} is sunny at 22°C.`;

    case 'time':
      // Beispiel für eine Zeit-Funktion
      const now = new Date();
      const timeString = now.toLocaleTimeString(language === 'de' ? 'de-DE' : 'en-US');
      
      return language === 'de'
        ? `Die aktuelle Zeit ist ${timeString}.`
        : `The current time is ${timeString}.`;
        
    // Weitere Funktionen könnten hier implementiert werden
    
    default:
      console.warn(`Unbekannte Funktion: ${functionName}`);
      return getGenericResponse(language, 'function');
  }
}

/**
 * Füllt eine Antwortvorlage mit den aus Entities extrahierten Werten
 */
function fillResponseTemplate(
  template: string,
  entities: Entity[],
  context?: Context
): string {
  // Beginne mit der ursprünglichen Vorlage
  let filledTemplate = template;
  
  // Ersetze Entity-Platzhalter
  for (const entity of entities) {
    const placeholder = `{${entity.type}}`;
    if (filledTemplate.includes(placeholder)) {
      // Fixed RegExp replacement by using a string for replacement instead of a function
      filledTemplate = filledTemplate.replace(new RegExp(escapeRegExp(placeholder), 'g'), entity.value);
    }
  }
  
  // Ersetze Kontextplatzhalter
  if (context && filledTemplate.includes('{context}')) {
    filledTemplate = filledTemplate.replace(new RegExp(escapeRegExp('{context}'), 'g'), context.name);
  }
  
  // Ersetze Datums- und Zeitplatzhalter
  if (filledTemplate.includes('{date}')) {
    const today = new Date();
    const dateString = today.toLocaleDateString();
    filledTemplate = filledTemplate.replace(new RegExp(escapeRegExp('{date}'), 'g'), dateString);
  }
  
  if (filledTemplate.includes('{time}')) {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    filledTemplate = filledTemplate.replace(new RegExp(escapeRegExp('{time}'), 'g'), timeString);
  }
  
  // Überprüfe auf verbleibende Platzhalter
  const remainingPlaceholders = filledTemplate.match(/{[^}]+}/g);
  if (remainingPlaceholders) {
    console.warn('Nicht ersetzte Platzhalter in der Antwort:', remainingPlaceholders);
    // Ersetze übrige Platzhalter mit leeren Strings oder Standardwerten
    for (const placeholder of remainingPlaceholders) {
      filledTemplate = filledTemplate.replace(new RegExp(escapeRegExp(placeholder), 'g'), '');
    }
  }
  
  return filledTemplate;
}

// Helper function to escape RegExp special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Generiert eine generische Antwort für einen bestimmten Intent-Typ
 */
function getGenericResponse(language: Language, intentType: string): string {
  // Type-safe object with explicit Language keys
  const responses: Record<Language, Record<string, string>> = {
    de: {
      faq: 'Ich habe leider keine genaue Information zu dieser Frage. Kann ich dir mit etwas anderem helfen?',
      smalltalk: 'Interessant! Erzähl mir mehr.',
      function: 'Entschuldigung, ich konnte diese Funktion nicht ausführen. Kann ich dir anders behilflich sein?',
      default: 'Ich verstehe. Gibt es etwas Bestimmtes, womit ich dir helfen kann?'
    },
    en: {
      faq: 'I don\'t have specific information for this question. Can I help you with something else?',
      smalltalk: 'Interesting! Tell me more.',
      function: 'Sorry, I couldn\'t execute this function. Is there anything else I can help you with?',
      default: 'I understand. Is there something specific I can help you with?'
    }
  };
  
  // Fix: Stelle sicher, dass immer ein String zurückgegeben wird
  return (responses[language]?.[intentType] || 
          responses[language]?.default || 
          responses.en?.default || 
          "Ich kann Ihnen leider nicht weiterhelfen.");
}

/**
 * Generiert eine Antwort für den Fall, dass kein Intent erkannt wurde
 */
function getUnknownIntentResponse(language: Language, context?: Context): string {
  // Mit Kontextinformationen könnten hier spezifischere Antworten gegeben werden
  const contextName = context?.name || 'unknown';
  
  // Type-safe object with explicit Language keys
  const responses: Record<Language, Record<string, string>> = {
    de: {
      initial: 'Entschuldigung, ich habe nicht ganz verstanden, was du meinst. Kannst du es bitte anders formulieren?',
      followup: 'Ich bin mir nicht sicher, worauf du dich beziehst. Könntest du deine Frage etwas ausführlicher stellen?',
      unknown: 'Das habe ich leider nicht verstanden. Bitte formuliere deine Anfrage anders oder stelle eine neue Frage.'
    },
    en: {
      initial: 'Sorry, I didn\'t quite understand what you mean. Could you rephrase that?',
      followup: 'I\'m not sure what you\'re referring to. Could you elaborate on your question?',
      unknown: 'I didn\'t understand that. Please rephrase your request or ask a new question.'
    }
  };
  
  // Fix: Stelle sicher, dass immer ein String zurückgegeben wird
  return (responses[language]?.[contextName] || 
          responses[language]?.unknown || 
          responses.en?.unknown || 
          "Ich verstehe Ihre Anfrage nicht.");
}

/**
 * Generiert eine Antwort für den Fall, dass ein Fehler aufgetreten ist
 */
function getErrorResponse(language: Language): string {
  // Type-safe object with explicit Language keys
  const responses: Record<Language, string> = {
    de: 'Es tut mir leid, aber es ist ein technisches Problem aufgetreten. Bitte versuche es später noch einmal oder formuliere deine Anfrage neu.',
    en: 'I\'m sorry, but a technical issue has occurred. Please try again later or rephrase your request.'
  };
  
  return responses[language] || responses.en;
}