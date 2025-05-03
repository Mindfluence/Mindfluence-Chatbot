import { SentenceTransformer } from './sentenceTransformer';
import { config } from '@/features/nlp-engine/config';
import { tokenize, containsToken } from '@/features/nlp-engine/utils/tokenizer';
import * as fs from 'fs';
import * as path from 'path';

// Datenbank-Anbindung für FAQs
import { getDatabaseInstance } from '@/features/database/connector';
import { searchFaqsByQuery } from '@/lib/databaseWrapper';

// Vector-Storage für persistente Embeddings
// eslint-disable-next-line @typescript-eslint/no-var-requires
const VectorStorage = require('vector-storage').VectorStorage;

// Typdefinitionen für die semantische Suche
export interface SearchOptions {
  threshold?: number;
  maxResults?: number;
  language?: string;
  includeMetadata?: boolean;
  filterByType?: string[];
  reranker?: 'bm25' | 'hybrid' | 'none';
  hybridAlpha?: number; // Gewichtung zwischen semantisch (1.0) und lexikalisch (0.0)
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
  explanation?: {
    semanticScore?: number;
    keywordScore?: number;
    matchedTokens?: string[];
    keyTerms?: string[];
  };
}

export interface FAQ {
  id: number;
  question: string;
  answer: string;
  language: string;
  topic: string;
  keywords: string;
}

export interface Intent {
  name: string;
  type: string;
  examples: string[];
  description?: string;
  responses?: string[];
}

// Hauptklasse für semantische Suche
export class SemanticSearch {
  private transformer: SentenceTransformer | null = null;
  private vectorStorage: any = null;
  private embeddingCache: Map<string, Float32Array> = new Map();
  private faqEmbeddings: Map<number, Float32Array> = new Map();
  private intentEmbeddings: Map<string, Float32Array> = new Map();
  private initialized: boolean = false;
  private modelName: string;
  private storagePath: string;

  /**
   * Konstruktor für SemanticSearch
   * 
   * @param modelName - Name des zu verwendenden Transformer-Modells
   */
  constructor(modelName: string = 'multilingual-e5-small') {
    this.modelName = modelName;
    // Sichererer Zugriff auf config mit nullish-Coalescing-Operator
    this.storagePath = path.join(process.cwd(), config?.nlp?.embeddingStoragePath || 'data/embeddings');
    
    console.log(`[SemanticSearch] Initialisiert mit Modell: ${modelName}`);
  }

  /**
   * Initialisiert die semantische Suche
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      console.log(`[SemanticSearch] Starte Initialisierung...`);
      
      // Erstelle und initialisiere den SentenceTransformer
      this.transformer = new SentenceTransformer(this.modelName, {
        useCache: true,
        normalizeOutput: true
      });
      
      if (!this.transformer) {
        console.error(`[SemanticSearch] Konnte SentenceTransformer nicht erstellen`);
        return false;
      }
      
      const transformerInitialized = await this.transformer.initialize();
      if (!transformerInitialized) {
        console.error(`[SemanticSearch] Konnte Transformer nicht initialisieren`);
        return false;
      }

      // Initialisiere Vector Storage ohne dimension parameter
      this.vectorStorage = new VectorStorage({
        path: this.storagePath,
        metric: 'cosine',
        persistIndexes: true
      });
      
      await this.ensureStorageDirectories();
      
      // Lade gespeicherte Embeddings, falls vorhanden
      await this.loadStoredEmbeddings();
      
      this.initialized = true;
      console.log(`[SemanticSearch] Erfolgreich initialisiert`);
      return true;
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Initialisierung:`, error);
      return false;
    }
  }

  /**
   * Stellt sicher, dass die nötigen Verzeichnisse für die Speicherung existieren
   */
  private async ensureStorageDirectories(): Promise<void> {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      
      const faqsPath = path.join(this.storagePath, 'faqs');
      if (!fs.existsSync(faqsPath)) {
        fs.mkdirSync(faqsPath, { recursive: true });
      }
      
      const intentsPath = path.join(this.storagePath, 'intents');
      if (!fs.existsSync(intentsPath)) {
        fs.mkdirSync(intentsPath, { recursive: true });
      }
    } catch (error) {
      console.error(`[SemanticSearch] Fehler beim Erstellen der Verzeichnisse:`, error);
      throw error;
    }
  }

  /**
   * Lädt gespeicherte Embeddings aus dem Speicher
   */
  private async loadStoredEmbeddings(): Promise<void> {
    try {
      // Lade FAQ-Embeddings
      const faqsPath = path.join(this.storagePath, 'faqs');
      if (fs.existsSync(faqsPath)) {
        const faqFiles = fs.readdirSync(faqsPath).filter(file => file.endsWith('.json'));
        
        for (const file of faqFiles) {
          try {
            const filePath = path.join(faqsPath, file);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            if (data && data.id && data.embedding && Array.isArray(data.embedding)) {
              this.faqEmbeddings.set(data.id, new Float32Array(data.embedding));
            }
          } catch (fileError) {
            console.warn(`[SemanticSearch] Konnte FAQ-Embedding-Datei nicht laden: ${file}`, fileError);
          }
        }
        
        console.log(`[SemanticSearch] ${this.faqEmbeddings.size} FAQ-Embeddings geladen`);
      }

      // Lade Intent-Embeddings
      const intentsPath = path.join(this.storagePath, 'intents');
      if (fs.existsSync(intentsPath)) {
        const intentFiles = fs.readdirSync(intentsPath).filter(file => file.endsWith('.json'));
        
        for (const file of intentFiles) {
          try {
            const filePath = path.join(intentsPath, file);
            const fileContent = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(fileContent);
            
            if (data && data.name && data.embedding && Array.isArray(data.embedding)) {
              this.intentEmbeddings.set(data.name, new Float32Array(data.embedding));
            }
          } catch (fileError) {
            console.warn(`[SemanticSearch] Konnte Intent-Embedding-Datei nicht laden: ${file}`, fileError);
          }
        }
        
        console.log(`[SemanticSearch] ${this.intentEmbeddings.size} Intent-Embeddings geladen`);
      }
    } catch (error) {
      console.error(`[SemanticSearch] Fehler beim Laden gespeicherter Embeddings:`, error);
    }
  }

  /**
   * Speichert ein FAQ-Embedding
   */
  private async saveFaqEmbedding(faqId: number, embedding: Float32Array): Promise<void> {
    try {
      if (!faqId || !embedding) {
        console.warn(`[SemanticSearch] Ungültige Parameter für saveFaqEmbedding`);
        return;
      }
      
      const filePath = path.join(this.storagePath, 'faqs', `faq_${faqId}.json`);
      const data = {
        id: faqId,
        embedding: Array.from(embedding),
        timestamp: Date.now()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (error) {
      console.error(`[SemanticSearch] Fehler beim Speichern des FAQ-Embeddings (ID: ${faqId}):`, error);
    }
  }

  /**
   * Speichert ein Intent-Embedding
   */
  private async saveIntentEmbedding(intentName: string, embedding: Float32Array): Promise<void> {
    try {
      if (!intentName || !embedding) {
        console.warn(`[SemanticSearch] Ungültige Parameter für saveIntentEmbedding`);
        return;
      }
      
      const filePath = path.join(this.storagePath, 'intents', `intent_${intentName}.json`);
      const data = {
        name: intentName,
        embedding: Array.from(embedding),
        timestamp: Date.now()
      };
      
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (error) {
      console.error(`[SemanticSearch] Fehler beim Speichern des Intent-Embeddings (${intentName}):`, error);
    }
  }

  /**
   * Erzeugt ein Embedding für einen gegebenen Text
   */
  public async embedText(text: string): Promise<Float32Array | null> {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.warn(`[SemanticSearch] Leerer oder ungültiger Text für embedText`);
      return null;
    }
    
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[SemanticSearch] Konnte nicht initialisiert werden`);
        return null;
      }
    }

    // Verwende Cache für bereits berechnete Embeddings
    if (this.embeddingCache.has(text)) {
      const cachedEmbedding = this.embeddingCache.get(text);
      if (cachedEmbedding) {
        return cachedEmbedding;
      }
    }

    try {
      if (!this.transformer) {
        throw new Error('Transformer ist nicht initialisiert');
      }
      
      const embedding = await this.transformer.embed(text);
      
      // Überprüfe, ob ein gültiges Embedding zurückgegeben wurde
      if (!embedding || !(embedding instanceof Float32Array) || embedding.length === 0) {
        console.warn(`[SemanticSearch] Ungültiges Embedding für Text: "${text.substring(0, 30)}..."`);
        return null;
      }
      
      // Cache das Embedding
      this.embeddingCache.set(text, embedding);
      
      return embedding;
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Embedding-Erzeugung:`, error);
      return null;
    }
  }

  /**
   * Berechnet semantische Ähnlichkeit zwischen zwei Texten
   */
  public async calculateSimilarity(text1: string, text2: string): Promise<number> {
    try {
      if (!text1 || !text2) {
        return 0;
      }
      
      const embedding1 = await this.embedText(text1);
      const embedding2 = await this.embedText(text2);
      
      if (!embedding1 || !embedding2 || !this.transformer) {
        return 0;
      }
      
      // Überprüfe, ob die cosineSimilarity-Methode existiert
      if (typeof this.transformer.cosineSimilarity !== 'function') {
        console.error(`[SemanticSearch] transformer.cosineSimilarity ist keine Funktion`);
        return 0;
      }
      
      return this.transformer.cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Ähnlichkeitsberechnung:`, error);
      return 0;
    }
  }

  /**
   * Findet FAQs, die semantisch ähnlich zur Abfrage sind
   */
  public async searchFAQs(
    query: string, 
    language: string = 'de', 
    options: SearchOptions = {}
  ): Promise<SearchResult<FAQ>[]> {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      console.warn(`[SemanticSearch] Leere oder ungültige Abfrage für searchFAQs`);
      return [];
    }
    
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[SemanticSearch] Konnte nicht initialisiert werden`);
        return [];
      }
    }

    try {
      console.log(`[SemanticSearch] Suche FAQs für: "${query}" (${language})`);
      
      // Standardwerte für Optionen
      const threshold = options.threshold ?? 0.6;
      const maxResults = options.maxResults ?? 5;
      const includeMetadata = options.includeMetadata ?? false;
      const reranker = options.reranker ?? 'hybrid';
      const hybridAlpha = options.hybridAlpha ?? 0.7; // 70% semantisch, 30% lexikalisch
      
      // Holen der FAQs aus der Datenbank
      const db = getDatabaseInstance();
      if (!db) {
        throw new Error('Datenbankverbindung konnte nicht hergestellt werden');
      }
      
      // Hole alle FAQs für die gegebene Sprache
      const stmt = db.prepare(`
        SELECT id, question, answer, language, topic, keywords
        FROM faqs
        WHERE language = ?
      `);
      
      const faqs: FAQ[] = stmt.all(language) as FAQ[];
      
      if (!faqs || faqs.length === 0) {
        console.log(`[SemanticSearch] Keine FAQs für Sprache ${language} gefunden`);
        return [];
      }
      
      console.log(`[SemanticSearch] ${faqs.length} FAQs für Sprache ${language} gefunden`);
      
      // Erzeuge Embedding für die Abfrage
      const queryEmbedding = await this.embedText(query);
      if (!queryEmbedding) {
        throw new Error('Konnte kein Embedding für die Abfrage erzeugen');
      }
      
      // Tokenisiere die Abfrage für Keyword-Matching
      const queryTokens = tokenize(query, { toLowerCase: true });
      
      // Ergebnisse mit Ähnlichkeitsscores
      const results: SearchResult<FAQ>[] = [];
      
      // Erzeuge oder hole Embeddings für alle FAQs und berechne Ähnlichkeit
      for (const faq of faqs) {
        if (!faq || typeof faq.id !== 'number') {
          continue;
        }
        
        let faqEmbedding: Float32Array | null = null;
        
        // Prüfe, ob wir bereits ein Embedding für diese FAQ haben
        if (this.faqEmbeddings.has(faq.id)) {
          const storedEmbedding = this.faqEmbeddings.get(faq.id);
          if (storedEmbedding) {
            faqEmbedding = storedEmbedding;
          }
        } 
        
        // Kein Embedding gefunden, erzeugen wir ein neues
        if (!faqEmbedding) {
          // Für FAQs verwenden wir die Frage + die Keywords für ein besseres Embedding
          const textToEmbed = `${faq.question} ${faq.keywords || ''}`.trim();
          faqEmbedding = await this.embedText(textToEmbed);
          
          if (faqEmbedding) {
            // Speichere das Embedding für späteren Zugriff
            this.faqEmbeddings.set(faq.id, faqEmbedding);
            await this.saveFaqEmbedding(faq.id, faqEmbedding);
          }
        }
        
        if (!faqEmbedding || !this.transformer || typeof this.transformer.cosineSimilarity !== 'function') {
          continue;
        }
        
        // Berechne semantische Ähnlichkeit
        const semanticScore = this.transformer.cosineSimilarity(queryEmbedding, faqEmbedding);
        
        // Berechne lexikalische Ähnlichkeit (Keyword-basiert)
        let keywordScore = 0;
        const keywordsTokens = tokenize(faq.keywords || '', { toLowerCase: true });
        const questionTokens = tokenize(faq.question || '', { toLowerCase: true });
        
        // Zähle übereinstimmende Tokens in Keywords und Frage
        const matchedTokens: string[] = [];
        
        if (queryTokens && Array.isArray(queryTokens)) {
          for (const token of queryTokens) {
            if (containsToken(keywordsTokens, token) || containsToken(questionTokens, token)) {
              matchedTokens.push(token);
              keywordScore += 1;
            }
          }
          
          // Normalisiere den Score
          if (queryTokens.length > 0) {
            keywordScore = keywordScore / queryTokens.length;
          }
        }
        
        // Kombiniere Scores je nach Reranking-Methode
        let finalScore: number;
        let matchType: 'semantic' | 'keyword' | 'hybrid';
        
        switch (reranker) {
          case 'bm25':
            finalScore = keywordScore;
            matchType = 'keyword';
            break;
          case 'hybrid':
            // Gewichtete Kombination aus semantischer und lexikalischer Ähnlichkeit
            finalScore = (semanticScore * hybridAlpha) + (keywordScore * (1 - hybridAlpha));
            matchType = 'hybrid';
            break;
          case 'none':
          default:
            finalScore = semanticScore;
            matchType = 'semantic';
        }
        
        // Nur Ergebnisse aufnehmen, die über dem Threshold liegen
        if (finalScore >= threshold) {
          const result: SearchResult<FAQ> = {
            item: faq,
            score: finalScore,
            matchType
          };
          
          // Füge Metadaten hinzu, wenn gewünscht
          if (includeMetadata) {
            result.explanation = {
              semanticScore,
              keywordScore,
              matchedTokens,
              keyTerms: keywordsTokens && keywordsTokens.length > 0 ? keywordsTokens.slice(0, 10) : [] // Limitiere auf 10 Keywords
            };
          }
          
          results.push(result);
        }
      }
      
      // Sortiere nach Score absteigend
      results.sort((a, b) => b.score - a.score);
      
      // Begrenze die Anzahl der Ergebnisse
      const limitedResults = results.slice(0, maxResults);
      
      console.log(`[SemanticSearch] ${limitedResults.length} passende FAQs gefunden`);
      return limitedResults;
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der FAQ-Suche:`, error);
      return [];
    }
  }

  /**
   * Findet Intents, die semantisch ähnlich zur Abfrage sind
   */
  public async searchIntents(
    query: string, 
    language: string = 'de', 
    options: SearchOptions = {}
  ): Promise<SearchResult<Intent>[]> {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      console.warn(`[SemanticSearch] Leere oder ungültige Abfrage für searchIntents`);
      return [];
    }
    
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[SemanticSearch] Konnte nicht initialisiert werden`);
        return [];
      }
    }

    try {
      console.log(`[SemanticSearch] Suche Intents für: "${query}" (${language})`);
      
      // Standardwerte für Optionen
      const threshold = options.threshold ?? 0.65;
      const maxResults = options.maxResults ?? 3;
      const includeMetadata = options.includeMetadata ?? false;
      const filterByType = options.filterByType || [];
      
      // Lade die Intents aus der JSON-Datei
      let intentsData;
      try {
        const intentsPath = path.join(process.cwd(), `data/chatbot/database/intents_${language}.json`);
        const fileContent = fs.readFileSync(intentsPath, 'utf8');
        intentsData = JSON.parse(fileContent);
      } catch (fileError) {
        console.error(`[SemanticSearch] Konnte Intent-Datei nicht laden:`, fileError);
        return [];
      }
      
      // Extrahiere die Intent-Liste
      let intents: Intent[] = [];
      if (Array.isArray(intentsData)) {
        intents = intentsData;
      } else if (intentsData && typeof intentsData === 'object') {
        if (Array.isArray(intentsData.intents)) {
          intents = intentsData.intents;
        } else if (intentsData.default && Array.isArray(intentsData.default)) {
          intents = intentsData.default;
        }
      }
      
      if (!intents || intents.length === 0) {
        console.log(`[SemanticSearch] Keine Intents für Sprache ${language} gefunden`);
        return [];
      }
      
      // Filtere nach Typ, wenn angegeben
      if (filterByType && filterByType.length > 0) {
        intents = intents.filter(intent => 
          intent && intent.type && filterByType.includes(intent.type)
        );
        
        console.log(`[SemanticSearch] ${intents.length} Intents nach Typfilterung übrig`);
      }
      
      // Erzeuge Embedding für die Abfrage
      const queryEmbedding = await this.embedText(query);
      if (!queryEmbedding) {
        throw new Error('Konnte kein Embedding für die Abfrage erzeugen');
      }
      
      // Tokenisiere die Abfrage für Keyword-Matching
      const queryTokens = tokenize(query, { toLowerCase: true });
      
      // Ergebnisse mit Ähnlichkeitsscores
      const results: SearchResult<Intent>[] = [];
      
      // Für jeden Intent
      for (const intent of intents) {
        // Prüfe, ob es Beispiele gibt
        if (!intent || !intent.examples || !Array.isArray(intent.examples) || intent.examples.length === 0) {
          continue;
        }
        
        let intentEmbedding: Float32Array | null = null;
        
        // Prüfe, ob wir bereits ein Embedding für diesen Intent haben
        if (intent.name && this.intentEmbeddings.has(intent.name)) {
          const storedEmbedding = this.intentEmbeddings.get(intent.name);
          if (storedEmbedding) {
            intentEmbedding = storedEmbedding;
          }
        } 
        
        // Kein Embedding gefunden, erzeugen wir ein neues
        if (!intentEmbedding) {
          // Für Intents verwenden wir den Durchschnitt der Embeddings aller Beispiele
          const exampleEmbeddings: Float32Array[] = [];
          
          for (const example of intent.examples) {
            if (!example || typeof example !== 'string') continue;
            
            const embedding = await this.embedText(example);
            if (embedding) {
              exampleEmbeddings.push(embedding);
            }
          }
          
          // Wenn wir mindestens ein Beispiel-Embedding haben, berechnen wir den Durchschnitt
          if (exampleEmbeddings.length > 0) {
            // Fix: Check that the first embedding exists and has a length property
            const firstEmbedding = exampleEmbeddings[0];
            if (!firstEmbedding) {
              console.warn(`[SemanticSearch] Erstes Example-Embedding für Intent ${intent.name} ist ungültig`);
              continue;
            }
            
            const dimension = firstEmbedding.length;
            if (typeof dimension !== 'number' || dimension <= 0) {
              console.warn(`[SemanticSearch] Ungültige Dimension (${dimension}) für Intent ${intent.name}`);
              continue;
            }
            
            const averageEmbedding = new Float32Array(dimension);
            let validEmbeddingsCount = 0;
            
            // Summiere alle Embeddings mit Sicherheitsüberprüfungen
            for (const embedding of exampleEmbeddings) {
              if (embedding && embedding.length === dimension) {
                validEmbeddingsCount++;
                for (let i = 0; i < dimension; i++) {
                  // Direkte numerische Zuweisung mit Standardwerten von 0
                  const currentVal = 0 + Number(averageEmbedding[i] || 0);
                  const embedVal = 0 + Number(embedding[i] || 0);
                  averageEmbedding[i] = currentVal + embedVal;
                }
              }
            }
            
            // Teile durch die Anzahl gültiger Embeddings
            if (validEmbeddingsCount > 0) {
              for (let i = 0; i < dimension; i++) {
                // Fix: Completely explicit division with full null check
                const numValue = 0 + Number(averageEmbedding[i] || 0);
                averageEmbedding[i] = numValue / validEmbeddingsCount;
              }
            }
            
            intentEmbedding = averageEmbedding;
            
            // Speichere das Embedding für späteren Zugriff
            if (intent.name) {
              this.intentEmbeddings.set(intent.name, intentEmbedding);
              await this.saveIntentEmbedding(intent.name, intentEmbedding);
            }
          } else {
            continue; // Überspringe diesen Intent, wenn wir kein Embedding erstellen konnten
          }
        }
        
        if (!intentEmbedding || !this.transformer || typeof this.transformer.cosineSimilarity !== 'function') {
          continue;
        }
        
        // Berechne die semantische Ähnlichkeit
        const semanticScore = this.transformer.cosineSimilarity(queryEmbedding, intentEmbedding);
        
        // Berechne auch direkte Ähnlichkeit zu jedem einzelnen Beispiel
        let bestExampleScore = 0;
        let bestExampleMatch = '';
        
        for (const example of intent.examples) {
          if (!example || typeof example !== 'string') continue;
          
          const exampleEmbedding = await this.embedText(example);
          if (exampleEmbedding && this.transformer && typeof this.transformer.cosineSimilarity === 'function') {
            const score = this.transformer.cosineSimilarity(queryEmbedding, exampleEmbedding);
            if (score > bestExampleScore) {
              bestExampleScore = score;
              bestExampleMatch = example;
            }
          }
        }
        
        // Berechne lexikalische Ähnlichkeit
        let keywordScore = 0;
        const matchedTokens: string[] = [];
        
        // Sammle alle Tokens aus allen Beispielen
        const allExampleTokens: string[] = [];
        for (const example of intent.examples) {
          if (!example || typeof example !== 'string') continue;
          
          const exampleTokens = tokenize(example, { toLowerCase: true });
          if (exampleTokens && Array.isArray(exampleTokens)) {
            allExampleTokens.push(...exampleTokens);
          }
        }
        
        // Zähle übereinstimmende Tokens
        if (queryTokens && Array.isArray(queryTokens)) {
          for (const token of queryTokens) {
            if (containsToken(allExampleTokens, token)) {
              matchedTokens.push(token);
              keywordScore += 1;
            }
          }
          
          // Normalisiere den Score
          if (queryTokens.length > 0) {
            keywordScore = keywordScore / queryTokens.length;
          }
        }
        
        // Kombiniere Scores mit Gewichtung (70% semantisch, 30% lexikalisch)
        const hybridScore = (semanticScore * 0.7) + (keywordScore * 0.3);
        
        // Nehme das Maximum von Intent-Embedding-Score und bestem Beispiel-Score
        const finalScore = Math.max(hybridScore, bestExampleScore);
        
        // Nur Ergebnisse über dem Threshold aufnehmen
        if (finalScore >= threshold) {
          const result: SearchResult<Intent> = {
            item: intent,
            score: finalScore,
            matchType: 'hybrid'
          };
          
          // Füge Metadaten hinzu, wenn gewünscht
          if (includeMetadata) {
            result.explanation = {
              semanticScore,
              keywordScore,
              matchedTokens,
              keyTerms: intent.examples && intent.examples.length > 0 ? intent.examples.slice(0, 3) : [] // Die ersten 3 Beispiele
            };
          }
          
          results.push(result);
        }
      }
      
      // Sortiere nach Score absteigend
      results.sort((a, b) => b.score - a.score);
      
      // Begrenze die Anzahl der Ergebnisse
      const limitedResults = results.slice(0, maxResults);
      
      console.log(`[SemanticSearch] ${limitedResults.length} passende Intents gefunden`);
      return limitedResults;
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Intent-Suche:`, error);
      return [];
    }
  }

  /**
   * Sucht frei über alle verfügbaren Quellen (FAQs, Intents, ...)
   */
  public async universalSearch(
    query: string,
    language: string = 'de',
    options: SearchOptions = {}
  ): Promise<{
    faqs: SearchResult<FAQ>[];
    intents: SearchResult<Intent>[];
  }> {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        console.warn(`[SemanticSearch] Leere oder ungültige Abfrage für universalSearch`);
        return { faqs: [], intents: [] };
      }
      
      // Führe parallele Suchen durch
      const [faqs, intents] = await Promise.all([
        this.searchFAQs(query, language, {
          ...options,
          maxResults: options.maxResults ?? 3
        }),
        this.searchIntents(query, language, {
          ...options,
          maxResults: options.maxResults ?? 2
        })
      ]);
      
      return { 
        faqs: faqs || [], 
        intents: intents || [] 
      };
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Universal-Suche:`, error);
      return { faqs: [], intents: [] };
    }
  }

  /**
   * Indiziert alle FAQs für schnellere Suche
   */
  public async indexAllFAQs(language: string = 'de'): Promise<number> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[SemanticSearch] Konnte nicht initialisiert werden`);
        return 0;
      }
    }

    try {
      console.log(`[SemanticSearch] Indexiere alle FAQs für Sprache: ${language}`);
      
      // Holen der FAQs aus der Datenbank
      const db = getDatabaseInstance();
      if (!db) {
        throw new Error('Datenbankverbindung konnte nicht hergestellt werden');
      }
      
      // Hole alle FAQs für die gegebene Sprache
      const stmt = db.prepare(`
        SELECT id, question, answer, language, topic, keywords
        FROM faqs
        WHERE language = ?
      `);
      
      const faqs: FAQ[] = stmt.all(language) as FAQ[];
      
      if (!faqs || faqs.length === 0) {
        console.log(`[SemanticSearch] Keine FAQs für Sprache ${language} gefunden`);
        return 0;
      }
      
      console.log(`[SemanticSearch] ${faqs.length} FAQs für Sprache ${language} gefunden`);
      
      // Erzeuge Embeddings für alle FAQs
      let successCount = 0;
      
      for (const faq of faqs) {
        if (!faq || typeof faq.id !== 'number') continue;
        
        // Für FAQs verwenden wir die Frage + die Keywords für ein besseres Embedding
        const textToEmbed = `${faq.question} ${faq.keywords || ''}`.trim();
        const embedding = await this.embedText(textToEmbed);
        
        if (embedding) {
          // Speichere das Embedding für späteren Zugriff
          this.faqEmbeddings.set(faq.id, embedding);
          await this.saveFaqEmbedding(faq.id, embedding);
          successCount++;
        }
      }
      
      console.log(`[SemanticSearch] ${successCount} von ${faqs.length} FAQs erfolgreich indiziert`);
      return successCount;
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Indizierung aller FAQs:`, error);
      return 0;
    }
  }

  /**
   * Indiziert alle Intents für schnellere Suche
   */
  public async indexAllIntents(language: string = 'de'): Promise<number> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[SemanticSearch] Konnte nicht initialisiert werden`);
        return 0;
      }
    }

    try {
      console.log(`[SemanticSearch] Indexiere alle Intents für Sprache: ${language}`);
      
      // Lade die Intents aus der JSON-Datei
      let intentsData;
      try {
        const intentsPath = path.join(process.cwd(), `data/chatbot/database/intents_${language}.json`);
        const fileContent = fs.readFileSync(intentsPath, 'utf8');
        intentsData = JSON.parse(fileContent);
      } catch (fileError) {
        console.error(`[SemanticSearch] Konnte Intent-Datei nicht laden:`, fileError);
        return 0;
      }
      
      // Extrahiere die Intent-Liste
      let intents: Intent[] = [];
      if (Array.isArray(intentsData)) {
        intents = intentsData;
      } else if (intentsData && typeof intentsData === 'object') {
        if (Array.isArray(intentsData.intents)) {
          intents = intentsData.intents;
        } else if (intentsData.default && Array.isArray(intentsData.default)) {
          intents = intentsData.default;
        }
      }
      
      if (!intents || intents.length === 0) {
        console.log(`[SemanticSearch] Keine Intents für Sprache ${language} gefunden`);
        return 0;
      }
      
      // Erzeuge Embeddings für alle Intents
      let successCount = 0;
      
      for (const intent of intents) {
        // Überspringe Intents ohne Beispiele oder ohne Namen
        if (!intent || !intent.name || !intent.examples || !Array.isArray(intent.examples) || intent.examples.length === 0) {
          continue;
        }
        
        // Berechne Embeddings für alle Beispiele
        const exampleEmbeddings: Float32Array[] = [];
        
        for (const example of intent.examples) {
          if (!example || typeof example !== 'string') continue;
          
          const embedding = await this.embedText(example);
          if (embedding) {
            exampleEmbeddings.push(embedding);
          }
        }
        
        // Wenn wir mindestens ein Beispiel-Embedding haben, berechnen wir den Durchschnitt
        if (exampleEmbeddings.length > 0) {
          // Fix: Check that the first embedding exists and has a length property
          const firstEmbedding = exampleEmbeddings[0];
          if (!firstEmbedding) {
            console.warn(`[SemanticSearch] Erstes Example-Embedding für Intent ${intent.name} ist ungültig`);
            continue;
          }
          
          const dimension = firstEmbedding.length;
          if (typeof dimension !== 'number' || dimension <= 0) {
            console.warn(`[SemanticSearch] Ungültige Dimension (${dimension}) für Intent ${intent.name}`);
            continue;
          }
          
          const averageEmbedding = new Float32Array(dimension);
          let validEmbeddingsCount = 0;
          
          // Summiere alle Embeddings mit Sicherheitsüberprüfungen
          for (const embedding of exampleEmbeddings) {
            if (embedding && embedding.length === dimension) {
              validEmbeddingsCount++;
              for (let i = 0; i < dimension; i++) {
                // Direkte numerische Zuweisung mit Standardwerten von 0
                const currentVal = 0 + Number(averageEmbedding[i] || 0);
                const embedVal = 0 + Number(embedding[i] || 0);
                averageEmbedding[i] = currentVal + embedVal;
              }
            }
          }
          
          // Teile durch die Anzahl gültiger Embeddings
          if (validEmbeddingsCount > 0) {
            for (let i = 0; i < dimension; i++) {
              // Fix: Completely explicit division with full null check
              const numValue = 0 + Number(averageEmbedding[i] || 0);
averageEmbedding[i] = numValue / validEmbeddingsCount;
            }
          }
          
          // Speichere das Embedding für späteren Zugriff
          this.intentEmbeddings.set(intent.name, averageEmbedding);
          await this.saveIntentEmbedding(intent.name, averageEmbedding);
          successCount++;
        }
      }
      
      console.log(`[SemanticSearch] ${successCount} von ${intents.length} Intents erfolgreich indiziert`);
      return successCount;
    } catch (error) {
      console.error(`[SemanticSearch] Fehler bei der Indizierung aller Intents:`, error);
      return 0;
    }
  }

  /**
   * Löscht alle Caches und Indizes
   */
  public async clearCache(): Promise<void> {
    try {
      this.embeddingCache.clear();
      this.faqEmbeddings.clear();
      this.intentEmbeddings.clear();
      
      if (this.transformer) {
        if (typeof this.transformer.clearCache === 'function') {
          this.transformer.clearCache();
        }
      }
      
      console.log(`[SemanticSearch] Cache geleert`);
    } catch (error) {
      console.error(`[SemanticSearch] Fehler beim Leeren des Caches:`, error);
    }
  }

  /**
   * Gibt alle Ressourcen frei
   */
  public async dispose(): Promise<void> {
    try {
      if (this.transformer) {
        if (typeof this.transformer.dispose === 'function') {
          await this.transformer.dispose();
        }
      }
      
      await this.clearCache();
      this.initialized = false;
      
      console.log(`[SemanticSearch] Ressourcen freigegeben`);
    } catch (error) {
      console.error(`[SemanticSearch] Fehler beim Freigeben der Ressourcen:`, error);
    }
  }
}