// Server-only database wrapper
import path from 'path';
import fs from 'fs';
import { NextResponse } from 'next/server';

// Type definitions
export type Language = 'de' | 'en';

export interface IntentFromDB {
  intent_id: number;
  name: string;
  description: string | null;
  language: Language;
}

export interface FAQFromDB {
  faq_id: number;
  question: string;
  answer: string;
  language: Language;
  keywords: string | null;
}

export interface SmallTalkResponseFromDB {
  smalltalk_id: number;
  topic: string;
  response: string;
  language: Language;
}

// A singleton to hold the database connection
let dbConnection: any = null;
let Database: any = null;

/**
 * Safely initialize the database connection
 * This function is designed to work in Next.js API routes
 */
export async function getDatabase() {
  // Only initialize once
  if (dbConnection) {
    console.log('[DB] Using existing database connection');
    return dbConnection;
  }

  try {
    // Use dynamic import to load better-sqlite3
    const sqlite = await import('better-sqlite3');
    Database = sqlite.default;

    // Setup database path
    const dbDir = path.resolve(process.cwd(), 'src', 'data', 'chatbot', 'database');
    const dbPath = path.join(dbDir, 'chatbot_knowledge.db');
    
    // Log the resolved path for debugging
    console.log(`[DB] Attempting to connect to database at: ${dbPath}`);

    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`[DB] Database directory created: ${dbDir}`);
    }

    // Create the connection
    dbConnection = new Database(dbPath);
    console.log(`[DB] Successfully connected to SQLite database: ${dbPath}`);

    // Initialize if needed (tables, etc)
    initializeDatabase();

    return dbConnection;
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    return null;
  }
}

/**
 * Initialize database schema if needed
 */
function initializeDatabase() {
  if (!dbConnection) return;

  try {
    console.log('[DB] Initializing database schema...');

    // Enable foreign key support
    dbConnection.exec("PRAGMA foreign_keys = ON;");

    // Table for languages (optional, but good practice)
    dbConnection.exec(`
        CREATE TABLE IF NOT EXISTS languages (
            code TEXT PRIMARY KEY NOT NULL -- 'de', 'en'
        );
    `);
    // Insert languages (ignored if already exists)
    dbConnection.exec(`INSERT OR IGNORE INTO languages (code) VALUES ('de'), ('en');`);

    // Table for Intents
    dbConnection.exec(`
        CREATE TABLE IF NOT EXISTS intents (
            intent_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            language TEXT NOT NULL,
            FOREIGN KEY (language) REFERENCES languages(code),
            UNIQUE (name, language) -- No intent with same name per language
        );
    `);

    // Table for Intent examples (patterns)
    dbConnection.exec(`
        CREATE TABLE IF NOT EXISTS intent_examples (
            example_id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER NOT NULL,
            example_text TEXT NOT NULL,
            FOREIGN KEY (intent_id) REFERENCES intents(intent_id) ON DELETE CASCADE
        );
    `);
    // Index for faster search by intent_id
    dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_intent_examples_intent_id ON intent_examples(intent_id);`);

    // Table for Intent responses
    dbConnection.exec(`
        CREATE TABLE IF NOT EXISTS intent_responses (
            response_id INTEGER PRIMARY KEY AUTOINCREMENT,
            intent_id INTEGER NOT NULL,
            response_text TEXT NOT NULL,
            FOREIGN KEY (intent_id) REFERENCES intents(intent_id) ON DELETE CASCADE
        );
    `);
    // Index for faster search by intent_id
    dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_intent_responses_intent_id ON intent_responses(intent_id);`);

    // Table for FAQs (with FTS5 for full-text search)
    // 1. Normal table for data storage
    dbConnection.exec(`
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
    dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_faqs_language ON faqs(language);`);

    // 2. Virtual FTS5 table for search
    // 'content=faqs' => FTS table synchronizes with the faqs table
    // 'content_rowid=faq_id' => Uses faq_id as rowid for simple linking
    dbConnection.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS faqs_fts USING fts5(
            question,
            answer,
            keywords,
            content='faqs',      -- Links to the main table
            content_rowid='faq_id' -- Uses faq_id as rowid
        );
    `);

    // Triggers to keep FTS table in sync when changes occur in the main table
    dbConnection.exec(`
        CREATE TRIGGER IF NOT EXISTS faqs_ai AFTER INSERT ON faqs BEGIN
            INSERT INTO faqs_fts (rowid, question, answer, keywords) VALUES (new.faq_id, new.question, new.answer, new.keywords);
        END;
    `);
    dbConnection.exec(`
        CREATE TRIGGER IF NOT EXISTS faqs_ad AFTER DELETE ON faqs BEGIN
            DELETE FROM faqs_fts WHERE rowid=old.faq_id;
        END;
    `);
    dbConnection.exec(`
        CREATE TRIGGER IF NOT EXISTS faqs_au AFTER UPDATE ON faqs BEGIN
            UPDATE faqs_fts SET question=new.question, answer=new.answer, keywords=new.keywords WHERE rowid=old.faq_id;
        END;
    `);

    // Table for Smalltalk responses
    dbConnection.exec(`
        CREATE TABLE IF NOT EXISTS smalltalk_responses (
            smalltalk_id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL, -- The 'tag' or 'name' of the smalltalk topic
            response TEXT NOT NULL,
            language TEXT NOT NULL,
            FOREIGN KEY (language) REFERENCES languages(code)
        );
    `);
    // Index for faster search by topic and language
    dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_smalltalk_topic_lang ON smalltalk_responses(topic, language);`);

    console.log('[DB] Database schema initialized successfully.');
  } catch (error) {
    console.error('[DB] Error initializing database schema:', error);
  }
}

/**
 * Retrieves a random smalltalk response for a specific topic and language
 */
export async function getRandomSmalltalkResponse(topic: string, language: Language): Promise<string | undefined> {
  try {
    console.log(`[DB] Retrieving random smalltalk response for topic '${topic}', language '${language}'`);
    
    const db = await getDatabase();
    if (!db) {
      console.error('[DB] Database not available for getRandomSmalltalkResponse');
      return undefined;
    }

    // Prepare and execute the statement
    const sql = 'SELECT * FROM smalltalk_responses WHERE topic = ? AND language = ? ORDER BY RANDOM() LIMIT 1';
    console.log(`[DB] Executing SQL: "${sql}" with params: [${topic}, ${language}]`);
    
    const stmt = db.prepare(sql);
    const result = stmt.get(topic, language) as SmallTalkResponseFromDB | undefined;
    
    if (result) {
      console.log(`[DB] Found smalltalk response for topic '${topic}'`);
    } else {
      console.log(`[DB] No smalltalk response found for topic '${topic}', language '${language}'`);
    }
    
    return result?.response;
  } catch (error) {
    console.error(`[DB] Error retrieving smalltalk response for topic '${topic}':`, error);
    return undefined;
  }
}

/**
 * Checks if smalltalk responses exist for a specific topic and language
 */
export async function hasSmallTalkResponses(topic: string, language: Language): Promise<boolean> {
  try {
    const db = await getDatabase();
    if (!db) {
      console.error('[DB] Database not available for hasSmallTalkResponses');
      return false;
    }

    // Prepare and execute the statement
    const sql = 'SELECT COUNT(*) as count FROM smalltalk_responses WHERE topic = ? AND language = ?';
    console.log(`[DB] Executing SQL: "${sql}" with params: [${topic}, ${language}]`);
    
    const stmt = db.prepare(sql);
    const result = stmt.get(topic, language) as { count: number } | undefined;
    
    const hasResponses = (result?.count || 0) > 0;
    console.log(`[DB] Topic '${topic}' has ${result?.count || 0} responses for language '${language}'`);
    
    return hasResponses;
  } catch (error) {
    console.error(`[DB] Error checking smalltalk responses for topic '${topic}':`, error);
    return false;
  }
}

/**
 * Searches for FAQs that match the search query using full-text search
 * Improved version with flexibility for German language
 */
export async function searchFaqsByQuery(query: string, language: Language, limit?: number): Promise<FAQFromDB[]> {
  try {
    console.log(`[DB] Searching FAQs for query '${query}', language '${language}', limit ${limit || 'none'}`);
    
    const db = await getDatabase();
    if (!db) {
      console.error('[DB] Database not available for searchFaqsByQuery');
      return [];
    }

    // Clean the input query
    const cleanedQuery = query.trim().toLowerCase();
    
    // Get individual terms for constructing a flexible search
    const terms = cleanedQuery.split(/\s+/).filter(term => term.length > 0);
    
    if (terms.length === 0) {
      console.log(`[DB] Empty query after cleaning`);
      return [];
    }
    
    // Build a more flexible FTS query using OR operator and suffix wildcards
    // Note: SQLite FTS5 does NOT support leading wildcards (*term) or infix searches (*term*)
    // Format: "term1* OR term2* OR term3*" etc.
    const ftsQueryParts = [];
    
    for (const term of terms) {
      // Standard prefix search (finds words starting with the term)
      ftsQueryParts.push(`${term}*`);
    }
    
    // Join with OR for more flexible matching (match any of the terms instead of all)
    const ftsQuery = ftsQueryParts.join(' OR ');
    console.log(`[DB] Formatted flexible FTS query: '${ftsQuery}'`);
    
    // Build the SQL query using standard FTS ranking
    // ORDER BY rank uses the default FTS5 relevance score
    let sql = `
      SELECT f.* 
      FROM faqs f 
      JOIN faqs_fts fts ON f.faq_id = fts.rowid 
      WHERE (fts.faqs_fts MATCH ?) AND f.language = ? 
      ORDER BY rank
    `;
    
    if (limit && limit > 0) {
      sql += ` LIMIT ${limit}`; 
    }
    
    // Log the simplified SQL and reduced parameters
    console.log(`[DB] Executing SQL: "${sql}" with params: [${ftsQuery}, ${language}]`);
    
    // Prepare and execute the statement with ONLY ftsQuery and language as parameters
    const statement = db.prepare(sql);
    const results = statement.all(ftsQuery, language) as FAQFromDB[];
    
    console.log(`[DB] Found ${results.length} FAQs matching query '${query}'`);
    
    // If no results with the flexible query, try one more approach as fallback:
    // Search for individual words with exact matching
    if (results.length === 0 && terms.length > 1) {
      console.log('[DB] No results with flexible query, trying individual term exact matching...');
      
      // Try each term individually with exact matching
      for (const term of terms) {
        if (term.length < 3) continue; // Skip very short terms
        
        const exactQuery = `"${term}"`;
        console.log(`[DB] Trying exact match for term: ${exactQuery}`);
        
        let exactSql = `
          SELECT f.* FROM faqs f 
          JOIN faqs_fts fts ON f.faq_id = fts.rowid 
          WHERE (fts.faqs_fts MATCH ?) AND f.language = ? 
          ORDER BY rank
        `;
        
        if (limit && limit > 0) {
          exactSql += ` LIMIT ${limit}`;
        }
        
        const exactStmt = db.prepare(exactSql);
        const exactResults = exactStmt.all(exactQuery, language) as FAQFromDB[];
        
        if (exactResults.length > 0) {
          console.log(`[DB] Found ${exactResults.length} results with exact term matching for '${term}'`);
          return exactResults;
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error(`[DB] Error in FAQ search for '${query}':`, error);
    return [];
  }
}

/**
 * Checks if any FAQs exist for a specific language
 */
export async function hasFAQs(language: Language): Promise<boolean> {
  try {
    const db = await getDatabase();
    if (!db) {
      console.error('[DB] Database not available for hasFAQs');
      return false;
    }

    // Prepare and execute the statement
    const sql = 'SELECT COUNT(*) as count FROM faqs WHERE language = ?';
    console.log(`[DB] Executing SQL: "${sql}" with params: [${language}]`);
    
    const stmt = db.prepare(sql);
    const result = stmt.get(language) as { count: number } | undefined;
    
    const hasFaqs = (result?.count || 0) > 0;
    console.log(`[DB] Language '${language}' has ${result?.count || 0} FAQs in database`);
    
    return hasFaqs;
  } catch (error) {
    console.error(`[DB] Error checking FAQs for language '${language}':`, error);
    return false;
  }
}

/**
 * Finds an intent by its name and language
 */
export async function getIntentByName(name: string, language: Language): Promise<IntentFromDB | undefined> {
  try {
    console.log(`[DB] Retrieving intent '${name}' for language '${language}'`);
    
    const db = await getDatabase();
    if (!db) {
      console.error('[DB] Database not available for getIntentByName');
      return undefined;
    }

    // Prepare and execute the statement
    const sql = 'SELECT * FROM intents WHERE name = ? AND language = ?';
    console.log(`[DB] Executing SQL: "${sql}" with params: [${name}, ${language}]`);
    
    const stmt = db.prepare(sql);
    const result = stmt.get(name, language) as IntentFromDB | undefined;
    
    if (result) {
      console.log(`[DB] Found intent '${name}' with ID ${result.intent_id}`);
    } else {
      console.log(`[DB] No intent found with name '${name}' for language '${language}'`);
    }
    
    return result;
  } catch (error) {
    console.error(`[DB] Error retrieving intent '${name}':`, error);
    return undefined;
  }
}

/**
 * Retrieves all possible responses for a given intent ID
 */
export async function getResponsesForIntent(intentId: number): Promise<string[]> {
  try {
    console.log(`[DB] Retrieving responses for intent ID ${intentId}`);
    
    const db = await getDatabase();
    if (!db) {
      console.error('[DB] Database not available for getResponsesForIntent');
      return [];
    }

    // Prepare and execute the statement
    const sql = 'SELECT * FROM intent_responses WHERE intent_id = ?';
    console.log(`[DB] Executing SQL: "${sql}" with params: [${intentId}]`);
    
    const stmt = db.prepare(sql);
    const responses = stmt.all(intentId) as { response_id: number, intent_id: number, response_text: string }[];
    
    console.log(`[DB] Found ${responses.length} responses for intent ID ${intentId}`);
    return responses.map(r => r.response_text);
  } catch (error) {
    console.error(`[DB] Error retrieving responses for intent ID ${intentId}:`, error);
    return [];
  }
}