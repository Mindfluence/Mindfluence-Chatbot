// features/database/connector.ts
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { Language } from '@/types/chatbot.types';

// Interface für Intent-Einträge aus der DB
interface DbIntent {
  intent_id: number;
  name: string;
  type: string;
  confidence: number;
}

// Interface für Response-Einträge aus der DB
interface DbResponse {
  response_id: number;
  intent_id: number;
  response_text: string;
}

// Einzelne DB-Verbindung für die gesamte Anwendung
let db: Database.Database | null = null;

/**
 * Gibt die Datenbankinstanz zurück oder initialisiert sie, wenn nötig
 * @throws Error wenn die Datenbank nicht initialisiert werden kann
 * @returns Die Datenbankinstanz
 */
export function getDatabaseInstance(): Database.Database {
  // Wenn bereits eine offene Verbindung existiert, gib sie zurück
  if (db && db.open) {
    return db;
  }
  
  // Verbindung muss initialisiert werden
  try {
    // Mögliche Pfade zur Datenbank
    const possiblePaths = [
      path.resolve(process.cwd(), 'data/chatbot/database/chatbot_knowledge.db'),
      path.resolve(process.cwd(), 'src/data/chatbot/database/chatbot_knowledge.db'),
      path.resolve(process.cwd(), 'public/data/chatbot/database/chatbot_knowledge.db')
    ];

    // Finde den ersten existierenden Pfad
    let dbPath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        dbPath = p;
        console.log(`Datenbank gefunden unter: ${p}`);
        break;
      }
    }

    if (!dbPath) {
      throw new Error('Konnte keine Datenbankdatei finden');
    }

    // Initialisiere die Datenbankverbindung
    db = new Database(dbPath, { verbose: console.log });
    console.log('Datenbankverbindung erfolgreich initialisiert');
    return db;
  } catch (error) {
    console.error('Fehler bei der Initialisierung der Datenbankverbindung:', error);
    throw new Error('Datenbankverbindung konnte nicht hergestellt werden');
  }
}

/**
 * Findet einen Intent basierend auf Text und Sprache
 * @param text Der zu analysierende Text
 * @param language Die Sprache
 * @returns Intent-Informationen oder null
 */
export function findIntent(text: string, language: Language): {name: string, type: string, confidence: number} | null {
  try {
    const db = getDatabaseInstance();

    // Normalisierter Text für die Suche
    const normalizedText = text.toLowerCase().trim();

    // 1. Versuche exakte Übereinstimmung
    const exactMatchStmt = db.prepare(`
      SELECT i.intent_id, i.name, i.type, 1.0 as confidence
      FROM intents i
      JOIN intent_examples e ON i.intent_id = e.intent_id
      WHERE LOWER(e.example_text) = ? AND i.language = ?
      LIMIT 1
    `);
    
    const exactMatch = exactMatchStmt.get(normalizedText, language) as DbIntent | undefined;
    
    if (exactMatch) {
      return {
        name: exactMatch.name,
        type: exactMatch.type || 'unknown',
        confidence: exactMatch.confidence
      };
    }

    // 2. Versuche Teilübereinstimmungen (Keyword-basiert)
    const keywordMatches = db.prepare(`
      SELECT i.intent_id, i.name, i.type, LENGTH(e.example_text) / LENGTH(?) * 0.7 as confidence
      FROM intents i
      JOIN intent_examples e ON i.intent_id = e.intent_id
      WHERE ? LIKE '%' || LOWER(e.example_text) || '%' 
        AND LENGTH(e.example_text) > 3
        AND i.language = ?
      ORDER BY confidence DESC
      LIMIT 5
    `).all(normalizedText, normalizedText, language) as DbIntent[];

    if (keywordMatches && keywordMatches.length > 0) {
      // Nimm das Match mit der höchsten Konfidenz
      const bestMatch = keywordMatches[0];
      
      if (bestMatch && bestMatch.confidence >= 0.3) {
        return {
          name: bestMatch.name,
          type: bestMatch.type || 'unknown',
          confidence: bestMatch.confidence
        };
      }
    }

    // Keine Übereinstimmung gefunden
    return null;
  } catch (error) {
    console.error('Fehler bei der Intent-Suche:', error);
    return null;
  }
}

/**
 * Holt eine zufällige Antwort für einen Intent aus der Datenbank
 * @param intentName Name des Intents
 * @param language Sprache
 * @returns Eine Antwort oder null
 */
export function getResponseForIntent(intentName: string, language: Language): string | null {
  try {
    const db = getDatabaseInstance();

    const stmt = db.prepare(`
      SELECT r.response_text
      FROM intent_responses r
      JOIN intents i ON r.intent_id = i.intent_id
      WHERE i.name = ? AND i.language = ?
      ORDER BY RANDOM()
      LIMIT 1
    `);
    
    const result = stmt.get(intentName, language) as {response_text: string} | undefined;
    
    return result ? result.response_text : null;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Antwort für Intent ${intentName}:`, error);
    return null;
  }
}

/**
 * Holt eine zufällige Smalltalk-Antwort aus der Datenbank
 * @param topic Thema des Smalltalks
 * @param language Sprache
 * @returns Eine Antwort oder null
 */
export function getSmalltalkResponse(topic: string, language: Language): string | null {
  try {
    const db = getDatabaseInstance();

    const stmt = db.prepare(`
      SELECT response
      FROM smalltalk_responses
      WHERE topic = ? AND language = ?
      ORDER BY RANDOM()
      LIMIT 1
    `);
    
    const result = stmt.get(topic, language) as {response: string} | undefined;
    
    return result ? result.response : null;
  } catch (error) {
    console.error(`Fehler beim Abrufen der Smalltalk-Antwort für ${topic}:`, error);
    return null;
  }
}

/**
 * Extrahiert Entities aus einem Text
 * @param text Der zu analysierende Text
 * @param language Die Sprache
 * @returns Liste von gefundenen Entities
 */
export function extractEntities(text: string, language: Language): {type: string, value: string}[] {
  try {
    // Dies würde normalerweise eine komplexere DB-Abfrage oder NLP-Logik beinhalten
    // Vereinfachte Implementierung, die später erweitert werden kann
    return [];
  } catch (error) {
    console.error('Fehler bei der Entity-Extraktion:', error);
    return [];
  }
}

/**
 * Schließt die Datenbankverbindung
 */
export function closeDatabase(): void {
  if (db && db.open) {
    db.close();
    console.log('Datenbankverbindung geschlossen');
    db = null;
  }
}

/**
 * Hilfsfunktion zum Initialisieren der Datenbank, hauptsächlich für Tests
 * @returns true bei Erfolg, false bei Fehler
 */
export function initializeDatabase(): boolean {
  try {
    getDatabaseInstance();
    return true;
  } catch (error) {
    return false;
  }
}

// Stellen Sie sicher, dass die Datenbankverbindung beim Beenden der Anwendung geschlossen wird
if (typeof process !== 'undefined') {
  process.on('exit', closeDatabase);
  process.on('SIGINT', () => {
    closeDatabase();
    process.exit(0);
  });
}