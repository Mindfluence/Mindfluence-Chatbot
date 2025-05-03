// features/nlp-engine/utils/jsonDataLoader.ts
import fs from 'fs';
import path from 'path';
import type { Language } from '@/types/chatbot.types';

/**
 * Interface für ein Intent-Item aus einer JSON-Datei
 */
export interface JSONIntentItem {
  name: string;
  description?: string;
  type?: string;
  examples: string[];
  responses?: string[];
}

/**
 * Interface für ein Smalltalk-Item aus einer JSON-Datei
 */
export interface JSONSmalltalkItem {
  topic: string;
  responses: string[];
}

/**
 * Interface für ein FAQ-Item aus einer JSON-Datei
 */
export interface JSONFAQItem {
  question: string;
  answer: string;
  keywords?: string[];
}

/**
 * Interface für ein Followup-Suggestion-Item aus einer JSON-Datei
 */
export interface JSONFollowupSuggestionItem {
  language: 'all' | Language;
  type: 'context' | 'intent' | 'entity_type' | 'entity_value' | 'user_keyword' | 'fallback';
  match: string;
  questions?: string[];
  actions?: string[];
  topics?: string[];
  confidenceBoost?: number;
  minIntentConfidence?: number;
  maxIntentConfidence?: number;
  minEntityConfidence?: number;
  requiresEntity?: boolean;
  entityTypeMatch?: string;
  userKeywordMatch?: string[];
}

/**
 * Lädt eine JSON-Datei mit mehreren Suchpfaden
 * @param fileName Der Dateiname (z.B. 'intents_de.json')
 * @returns Der Inhalt der JSON-Datei, oder null wenn nicht gefunden
 */
export function loadJSONFile<T>(fileName: string): T | null {
  // Liste möglicher Pfade in absteigender Priorität
  const possiblePaths = [
    path.join(process.cwd(), 'data', 'chatbot', 'database', fileName),
    path.join(process.cwd(), 'public', 'data', 'chatbot', 'database', fileName),
    path.join(process.cwd(), 'src', 'data', 'chatbot', 'database', fileName),
    path.join(process.cwd(), 'data', 'chatbot', fileName),
    path.join(process.cwd(), 'public', 'data', 'chatbot', fileName),
    path.join(process.cwd(), 'src', 'data', 'chatbot', fileName)
  ];

  // Suche nach der Datei in den möglichen Pfaden
  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      try {
        console.log(`Loading JSON from: ${filePath}`);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent) as T;
      } catch (error) {
        console.error(`Error reading or parsing JSON from ${filePath}:`, error);
      }
    }
  }

  console.error(`Could not find ${fileName} in any of the expected locations`);
  return null;
}

/**
 * Lädt Intent-Daten aus JSON-Dateien
 * @param language Die Sprache der zu ladenden Intents
 * @returns Ein Array von Intent-Items
 */
export function loadIntentsFromJSON(language: Language): JSONIntentItem[] {
  const fileName = `intents_${language}.json`;
  const data = loadJSONFile<JSONIntentItem[] | { intents: JSONIntentItem[] }>(fileName);
  
  if (!data) {
    console.error(`Failed to load intents for language: ${language}`);
    return [];
  }
  
  // Handle both array and object with intents property
  return Array.isArray(data) ? data : (data.intents || []);
}

/**
 * Lädt Smalltalk-Daten aus JSON-Dateien
 * @param language Die Sprache der zu ladenden Smalltalk-Antworten
 * @returns Ein Array von Smalltalk-Items
 */
export function loadSmalltalkFromJSON(language: Language): JSONSmalltalkItem[] {
  const fileName = `smalltalk_${language}.json`;
  const data = loadJSONFile<JSONSmalltalkItem[] | { smalltalk: JSONSmalltalkItem[] }>(fileName);
  
  if (!data) {
    console.error(`Failed to load smalltalk for language: ${language}`);
    return [];
  }
  
  // Handle both array and object with smalltalk property
  return Array.isArray(data) ? data : (data.smalltalk || []);
}

/**
 * Lädt FAQ-Daten aus JSON-Dateien
 * @param language Die Sprache der zu ladenden FAQs
 * @returns Ein Array von FAQ-Items
 */
export function loadFAQsFromJSON(language: Language): JSONFAQItem[] {
  const fileName = `faq_${language}.json`;
  const data = loadJSONFile<JSONFAQItem[] | { faqs: JSONFAQItem[] }>(fileName);
  
  if (!data) {
    console.error(`Failed to load FAQs for language: ${language}`);
    return [];
  }
  
  // Handle both array and object with faqs property
  return Array.isArray(data) ? data : (data.faqs || []);
}

/**
 * Lädt Followup-Suggestions aus JSON-Dateien
 * @param language Die Sprache der zu ladenden Followup-Suggestions
 * @returns Ein Array von Followup-Suggestion-Items
 */
export function loadFollowupSuggestionsFromJSON(language: Language): JSONFollowupSuggestionItem[] {
  const fileName = `followup_suggestions_${language}.json`;
  const data = loadJSONFile<JSONFollowupSuggestionItem[] | { suggestions: JSONFollowupSuggestionItem[] }>(fileName);
  
  if (!data) {
    console.error(`Failed to load followup suggestions for language: ${language}`);
    return [];
  }
  
  // Handle both array and object with suggestions property
  return Array.isArray(data) ? data : (data.suggestions || []);
}

/**
 * Sucht in den Intent-Daten nach einem passenden Intent
 * @param text Der zu analysierende Text
 * @param language Die Sprache der Intents
 * @returns Das gefundene Intent oder null
 */
export function findIntentForText(text: string, language: Language): { name: string, type: string, confidence: number } | null {
  const intents = loadIntentsFromJSON(language);
  const normalizedText = text.toLowerCase().trim();
  
  if (intents.length === 0) {
    console.warn(`No intents loaded for language: ${language}`);
    return null;
  }
  
  // Suche nach exakten Übereinstimmungen
  for (const intent of intents) {
    const examples = intent.examples || [];
    
    // Exakte Übereinstimmung mit einem Beispiel
    for (const example of examples) {
      if (normalizedText === example.toLowerCase().trim()) {
        console.log(`[jsonDataLoader] Exact match found for intent: ${intent.name}`);
        return {
          name: intent.name,
          type: intent.type || 'unknown',
          confidence: 1.0
        };
      }
    }
    
    // Enthaltene Schlüsselwörter
    for (const example of examples) {
      const normalizedExample = example.toLowerCase().trim();
      if (normalizedText.includes(normalizedExample) && normalizedExample.length > 3) {
        const confidence = 0.7 + (normalizedExample.length / normalizedText.length) * 0.3;
        console.log(`[jsonDataLoader] Keyword match found for intent: ${intent.name}`);
        return {
          name: intent.name,
          type: intent.type || 'unknown',
          confidence: confidence
        };
      }
    }
  }
  
  console.log(`[jsonDataLoader] No intent match found for: ${text}`);
  return null;
}

/**
 * Holt eine zufällige Antwort für einen gegebenen Intent
 * @param intentName Der Name des Intents
 * @param language Die Sprache der Antworten
 * @returns Eine zufällige Antwort oder undefined wenn keine gefunden
 */
export function getRandomResponseForIntent(intentName: string, language: Language): string | undefined {
  const intents = loadIntentsFromJSON(language);
  const intent = intents.find(i => i.name === intentName);
  
  if (!intent || !intent.responses || intent.responses.length === 0) {
    console.warn(`No responses found for intent: ${intentName}`);
    return undefined;
  }
  
  const randomIndex = Math.floor(Math.random() * intent.responses.length);
  return intent.responses[randomIndex];
}

/**
 * Holt eine zufällige Smalltalk-Antwort für ein gegebenes Thema
 * @param topic Das Thema des Smalltalks
 * @param language Die Sprache der Antworten
 * @returns Eine zufällige Antwort oder undefined wenn keine gefunden
 */
export function getRandomSmalltalkResponse(topic: string, language: Language): string | undefined {
  const smalltalkItems = loadSmalltalkFromJSON(language);
  const item = smalltalkItems.find(i => i.topic === topic);
  
  if (!item || !item.responses || item.responses.length === 0) {
    console.warn(`No smalltalk responses found for topic: ${topic}`);
    return undefined;
  }
  
  const randomIndex = Math.floor(Math.random() * item.responses.length);
  return item.responses[randomIndex];
}