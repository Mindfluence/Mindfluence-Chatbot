// lib/databaseService.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Language } from '@/types/chatbot.types';

// --- Type definitions ---
interface IntentFromDB {
  intent_id: number;
  name: string;
  description: string | null;
  language: Language;
}

interface IntentExampleFromDB {
  example_id: number;
  intent_id: number;
  example_text: string;
}

interface IntentResponseFromDB {
  response_id: number;
  intent_id: number;
  response_text: string;
}

interface FAQFromDB {
  faq_id: number;
  question: string;
  answer: string;
  language: Language;
  keywords: string | null;
}

interface SmallTalkResponseFromDB {
  smalltalk_id: number;
  topic: string;
  response: string;
  language: Language;
}

// Interface for the data passed to bulk operations
interface IntentData {
  name: string;
  description?: string | null;
  language: Language;
  examples?: string[];
  responses?: string[];
}

interface FAQData {
  question: string;
  answer: string;
  language: Language;
  keywords?: string | null;
}

interface SmalltalkData {
  topic: string;
  response: string;
  language: Language;
}

// Ensure correct path to database files
const resolveDbPath = () => {
  // List of potential database paths to try
  const potentialPaths = [
    path.resolve(process.cwd(), 'data', 'chatbot', 'database', 'chatbot_knowledge.db'),
    path.resolve(process.cwd(), 'public', 'data', 'chatbot', 'database', 'chatbot_knowledge.db'),
    path.resolve(process.cwd(), 'src', 'data', 'chatbot', 'database', 'chatbot_knowledge.db')
  ];

  // Find the first path that exists
  for (const dbPath of potentialPaths) {
    if (fs.existsSync(dbPath)) {
      console.log(`Database found at: ${dbPath}`);
      return dbPath;
    } else {
      console.log(`Database not found at: ${dbPath}`);
    }
  }

  // Default to the standard path if none exists
  const defaultPath = path.resolve(process.cwd(), 'data', 'chatbot', 'database', 'chatbot_knowledge.db');
  console.warn(`No database found at any expected location, defaulting to: ${defaultPath}`);
  
  // Ensure the directory exists
  const dbDir = path.dirname(defaultPath);
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Database directory created: ${dbDir}`);
    } catch (mkdirError) {
      console.error(`Error creating database directory ${dbDir}:`, mkdirError);
    }
  }
  
  return defaultPath;
};

const dbPath = resolveDbPath();

// Create database instance with better error handling
let db: Database.Database | null = null;
let dbInitialized = false;

try {
  // Consider removing 'verbose: console.log' for production
  db = new Database(dbPath, { verbose: console.log });
  console.log(`Successfully connected to SQLite database: ${dbPath}`);
} catch (error) {
  console.error(`Error connecting to SQLite database at ${dbPath}:`, error);
  
  // Don't rethrow, just log - we'll use fallbacks later
  console.warn("Will use fallback data from JSON files");
}

/**
 * Creates and initializes a SQLite database with the expected schema.
 * @returns true if successful, false otherwise
 */
function initializeDatabase(): boolean {
  if (!db || !db.open) {
    console.error("Database connection is not open. Cannot initialize.");
    return false;
  }
  
  try {
    console.log('Initializing database schema...');

    // Enable foreign key support
    db.exec("PRAGMA foreign_keys = ON;");

    // Table for languages
    db.exec(`
        CREATE TABLE IF NOT EXISTS languages (
            code TEXT PRIMARY KEY NOT NULL -- 'de', 'en'
        );
    `);
    
    // Insert languages (ignored if already exists)
    db.exec(`INSERT OR IGNORE INTO languages (code) VALUES ('de'), ('en');`);

    // Table for Intents
    db.exec(`
        CREATE TABLE IF NOT EXISTS intents (
            intent_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            language TEXT NOT NULL,
            FOREIGN KEY (language) REFERENCES languages(code),
            UNIQUE (name, language) -- No intent with same name per language
        );
    `);

    // Table for Intent examples
    db.exec(`
        CREATE TABLE IF NOT EXISTS intent_examples (
            example_id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER NOT NULL,
            example_text TEXT NOT NULL,
            FOREIGN KEY (intent_id) REFERENCES intents(intent_id) ON DELETE CASCADE
        );
    `);
    
    // Index for faster search by intent_id
    db.exec(`CREATE INDEX IF NOT EXISTS idx_intent_examples_intent_id ON intent_examples(intent_id);`);

    // Table for Intent responses
    db.exec(`
        CREATE TABLE IF NOT EXISTS intent_responses (
            response_id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER NOT NULL,
            response_text TEXT NOT NULL,
            FOREIGN KEY (intent_id) REFERENCES intents(intent_id) ON DELETE CASCADE
        );
    `);
    
    // Index for faster search by intent_id
    db.exec(`CREATE INDEX IF NOT EXISTS idx_intent_responses_intent_id ON intent_responses(intent_id);`);

    // Table for FAQs with FTS5 for search
    db.exec(`
       CREATE TABLE IF NOT EXISTS faqs (
           faq_id INTEGER PRIMARY KEY AUTOINCREMENT,
           question TEXT NOT NULL,
           answer TEXT NOT NULL,
           language TEXT NOT NULL,
           keywords TEXT, -- Optional keywords for better search
           FOREIGN KEY (language) REFERENCES languages(code)
       );
    `);
    
    // Index for faster search by language
    db.exec(`CREATE INDEX IF NOT EXISTS idx_faqs_language ON faqs(language);`);

    // Virtual FTS5 table for search
    db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS faqs_fts USING fts5(
            question,
            answer,
            keywords,
            content='faqs',
            content_rowid='faq_id'
        );
    `);

    // Triggers to keep FTS table in sync
    db.transaction(() => {
      db.exec(`
          CREATE TRIGGER IF NOT EXISTS faqs_ai AFTER INSERT ON faqs BEGIN
              INSERT INTO faqs_fts (rowid, question, answer, keywords) VALUES (new.faq_id, new.question, new.answer, new.keywords);
          END;
      `);
      db.exec(`
          CREATE TRIGGER IF NOT EXISTS faqs_ad AFTER DELETE ON faqs BEGIN
              DELETE FROM faqs_fts WHERE rowid=old.faq_id;
          END;
      `);
      db.exec(`
          CREATE TRIGGER IF NOT EXISTS faqs_au AFTER UPDATE ON faqs BEGIN
              UPDATE faqs_fts SET question=new.question, answer=new.answer, keywords=new.keywords WHERE rowid=old.faq_id;
          END;
      `);
    })();

    // Table for Smalltalk responses
    db.exec(`
        CREATE TABLE IF NOT EXISTS smalltalk_responses (
            smalltalk_id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL,
            response TEXT NOT NULL,
            language TEXT NOT NULL,
            FOREIGN KEY (language) REFERENCES languages(code)
        );
    `);
    
    // Index for faster search by topic and language
    db.exec(`CREATE INDEX IF NOT EXISTS idx_smalltalk_topic_lang ON smalltalk_responses(topic, language);`);

    console.log('Database schema initialization completed successfully.');
    dbInitialized = true;
    return true;
  } catch (error) {
    console.error('Error during database schema initialization:', error);
    return false;
  }
}

// Prepared statements with safe initialization
let stmtAddIntent: Database.Statement | null = null;
let stmtAddIntentExample: Database.Statement | null = null;
let stmtAddIntentResponse: Database.Statement | null = null;
let stmtGetIntent: Database.Statement | null = null;
let stmtGetIntentResponses: Database.Statement | null = null;
let stmtAddFaq: Database.Statement | null = null;
let stmtSearchFaqsDefault: Database.Statement | null = null;
let stmtAddSmalltalk: Database.Statement | null = null;
let stmtGetRandomSmalltalk: Database.Statement | null = null;
let stmtGetSmalltalkTopics: Database.Statement | null = null;

if (db && db.open) {
  try {
    // Intents
    stmtAddIntent = db.prepare(`
        INSERT INTO intents (name, description, language) VALUES (?, ?, ?)
        ON CONFLICT(name, language) DO UPDATE SET description=excluded.description
        RETURNING intent_id
    `);
    stmtAddIntentExample = db.prepare('INSERT INTO intent_examples (intent_id, example_text) VALUES (?, ?)');
    stmtAddIntentResponse = db.prepare('INSERT INTO intent_responses (intent_id, response_text) VALUES (?, ?)');
    stmtGetIntent = db.prepare('SELECT * FROM intents WHERE name = ? AND language = ?');
    stmtGetIntentResponses = db.prepare('SELECT * FROM intent_responses WHERE intent_id = ?');

    // FAQs
    stmtAddFaq = db.prepare('INSERT INTO faqs (question, answer, language, keywords) VALUES (?, ?, ?, ?)');
    stmtSearchFaqsDefault = db.prepare('SELECT f.* FROM faqs f JOIN faqs_fts fts ON f.faq_id = fts.rowid WHERE fts.faqs_fts MATCH ? AND f.language = ? ORDER BY rank');

    // Smalltalk
    stmtAddSmalltalk = db.prepare('INSERT INTO smalltalk_responses (topic, response, language) VALUES (?, ?, ?)');
    stmtGetRandomSmalltalk = db.prepare('SELECT * FROM smalltalk_responses WHERE topic = ? AND language = ? ORDER BY RANDOM() LIMIT 1');
    stmtGetSmalltalkTopics = db.prepare('SELECT DISTINCT topic FROM smalltalk_responses WHERE language = ?');
    
    console.log("All database prepared statements created successfully");
  } catch (error) {
    console.error("Error creating prepared statements:", error);
  }
} else {
  console.error("Database connection not available. Prepared statements cannot be created.");
}

// --- Transactions for bulk import ---

/**
 * Adds multiple intents and their examples/responses in a transaction.
 */
const insertIntentsTransaction = (intentsData: IntentData[]): boolean => {
    if (!db || !db.open || !stmtAddIntent || !stmtAddIntentExample || !stmtAddIntentResponse) {
        console.error("Cannot perform bulk intent insert: DB connection or statements missing.");
        return false;
    }
    
    try {
        const transaction = db.transaction((data: IntentData[]) => {
          for (const intent of data) {
            try {
               const result = stmtAddIntent?.get(intent.name, intent.description ?? null, intent.language) as { intent_id: number } | undefined;
               if (!result) {
                 console.warn(`Could not add or find intent during bulk insert: ${intent.name} (${intent.language})`);
                 continue;
               }
               const intentId = result.intent_id;
    
               // Delete old examples and responses for this intent (if update)
               db.prepare('DELETE FROM intent_examples WHERE intent_id = ?').run(intentId);
               db.prepare('DELETE FROM intent_responses WHERE intent_id = ?').run(intentId);
    
               // Add examples
               if (intent.examples && Array.isArray(intent.examples)) {
                 for (const example of intent.examples) {
                   stmtAddIntentExample?.run(intentId, example);
                 }
               }
               // Add responses
               if (intent.responses && Array.isArray(intent.responses)) {
                 for (const response of intent.responses) {
                   stmtAddIntentResponse?.run(intentId, response);
                 }
               }
             } catch (error) {
                console.error(`Error processing intent '${intent.name}' in bulk insert:`, error);
             }
          }
          console.log(`${data.length} intents processed in bulk.`);
        });
        
        transaction(intentsData);
        return true;
    } catch (error) {
        console.error("Bulk intent insert transaction failed:", error);
        return false;
    }
};

/**
 * Adds multiple FAQs in a transaction.
 */
const insertFaqsTransaction = (faqsData: FAQData[]): boolean => {
    if (!db || !db.open || !stmtAddFaq) {
        console.error("Cannot perform bulk FAQ insert: DB connection or statement missing.");
        return false;
    }
    
    try {
        const transaction = db.transaction((data: FAQData[]) => {
            for (const faq of data) {
                try {
                    stmtAddFaq?.run(faq.question, faq.answer, faq.language, faq.keywords ?? null);
                } catch (error) {
                    console.error(`Error processing FAQ '${faq.question.substring(0, 30)}...' in bulk insert:`, error);
                }
            }
            console.log(`${data.length} FAQs processed in bulk.`);
        });
        
        transaction(faqsData);
        return true;
    } catch (error) {
        console.error("Bulk FAQ insert transaction failed:", error);
        return false;
    }
};

/**
 * Adds multiple smalltalk responses in a transaction.
 */
const insertSmalltalkTransaction = (smalltalkData: SmalltalkData[]): boolean => {
    if (!db || !db.open || !stmtAddSmalltalk) {
        console.error("Cannot perform bulk smalltalk insert: DB connection or statement missing.");
        return false;
    }
    
    try {
        const transaction = db.transaction((data: SmalltalkData[]) => {
            for (const item of data) {
               try {
                    stmtAddSmalltalk?.run(item.topic, item.response, item.language);
                } catch (error) {
                    console.error(`Error processing smalltalk topic '${item.topic}' in bulk insert:`, error);
                }
            }
            console.log(`${data.length} smalltalk responses processed in bulk.`);
        });
        
        transaction(smalltalkData);
        return true;
    } catch (error) {
        console.error("Bulk smalltalk insert transaction failed:", error);
        return false;
    }
};

// --- Public API of the service ---

export const databaseService = {
  /**
   * Initializes the database (creates tables etc.).
   * Must be called once at startup.
   */
  initialize: initializeDatabase,

  /**
   * Check if database is operational
   */
  isReady: () => dbInitialized && db !== null && db.open,

  /**
   * Closes the database connection.
   * Should be called when the application exits.
   */
  close: (): void => {
    if (db && db.open) {
      try {
        db.close();
        console.log('SQLite database connection closed successfully.');
      } catch (error) {
        console.error('Error closing SQLite database connection:', error);
      }
    } else {
      console.log('SQLite database connection already closed or not initialized.');
    }
  },

  /**
   * Returns the raw database instance for advanced use cases.
   */
  getDbInstance: (): Database.Database | null => {
      if (db && db.open) {
          return db;
      }
      console.warn("Attempted to get DB instance, but connection is not open.");
      return null;
  },

  // --- Functions for import ---

  bulkAddIntents: insertIntentsTransaction,
  bulkAddFaqs: insertFaqsTransaction,
  bulkAddSmalltalk: insertSmalltalkTransaction,

  // --- Functions for runtime operation ---

  /**
   * Finds an intent by its name and language.
   */
  getIntentByName: (name: string, language: Language): IntentFromDB | undefined => {
    if (!stmtGetIntent || !db || !db.open) {
        console.error("getIntentByName: Statement not prepared or database not available.");
        return undefined;
    }
    
    try {
      const result = stmtGetIntent.get(name, language);
      return result as IntentFromDB | undefined;
    } catch (error) {
      console.error(`Error retrieving intent '${name}' (${language}):`, error);
      return undefined;
    }
  },

  /**
   * Retrieves all possible responses for a given intent ID.
   */
  getResponsesForIntent: (intentId: number): string[] => {
     if (!stmtGetIntentResponses || !db || !db.open) {
        console.error("getResponsesForIntent: Statement not prepared or database not available.");
        return [];
    }
    
    try {
      const responses = stmtGetIntentResponses.all(intentId) as IntentResponseFromDB[];
      return responses.map(r => r.response_text);
    } catch (error) {
      console.error(`Error retrieving responses for intent ID ${intentId}:`, error);
      return [];
    }
  },

  /**
   * Searches for FAQs that match the search query using full-text search.
   */
  searchFaqsByQuery: (query: string, language: Language, limit?: number): FAQFromDB[] => {
    if (!stmtSearchFaqsDefault || !db || !db.open) {
      console.error("searchFaqsByQuery: Statement not prepared or database not available.");
      return [];
    }
    
    try {
      // Clean and format the FTS query
      const ftsQuery = query.trim().split(/\s+/).filter(term => term.length > 0).map(term => term + '*').join(' ');
      if (!ftsQuery) return [];

      let statement: Database.Statement;
      let params: any[] = [ftsQuery, language];

      if (limit && limit > 0) {
        // Create a specific statement with LIMIT if needed
        const sql = `SELECT f.* FROM faqs f JOIN faqs_fts fts ON f.faq_id = fts.rowid WHERE fts.faqs_fts MATCH ? AND f.language = ? ORDER BY rank LIMIT ?`;
        statement = db.prepare(sql);
        params.push(limit);
      } else {
        if (!stmtSearchFaqsDefault) throw new Error("Default search statement is missing");
        statement = stmtSearchFaqsDefault;
      }

      const results = statement.all(...params);
      return results as FAQFromDB[];
    } catch (error) {
      console.error(`Error in FAQ search for '${query}' (${language}):`, error);
      return [];
    }
  },

  /**
   * Retrieves a random smalltalk response for a specific topic and language.
   */
  getRandomSmalltalkResponse: (topic: string, language: Language): string | undefined => {
    if (!stmtGetRandomSmalltalk || !db || !db.open) {
        console.error("getRandomSmalltalkResponse: Statement not prepared or database not available.");
        return undefined;
    }
    
    try {
      const result = stmtGetRandomSmalltalk.get(topic, language) as SmallTalkResponseFromDB | undefined;
      return result?.response;
    } catch (error) {
      console.error(`Error retrieving smalltalk response for '${topic}' (${language}):`, error);
      return undefined;
    }
  },

  /**
   * Retrieves all unique smalltalk topics for a language.
   */
  getSmalltalkTopics: (language: Language): string[] => {
     if (!stmtGetSmalltalkTopics || !db || !db.open) {
        console.error("getSmalltalkTopics: Statement not prepared or database not available.");
        return [];
    }
    
    try {
      const results = stmtGetSmalltalkTopics.all(language) as { topic: string }[];
      return results.map(r => r.topic);
    } catch (error) {
      console.error(`Error retrieving smalltalk topics for ${language}:`, error);
      return [];
    }
  }
};

// Initialize the database when loading the module
if (db && db.open) {
    const initResult = databaseService.initialize();
    if (!initResult) {
      console.error("Database initialization failed - some features might not work correctly.");
    }
} else {
    console.error("Database connection failed, skipping initialization.");
}

// --- Graceful Shutdown Handling ---
const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}. Closing database connection...`);
  databaseService.close();
  process.exit(0);
};

// Register shutdown handlers
process.on('exit', () => databaseService.close());
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception:`, err);
  databaseService.close();
  process.exit(1);
});