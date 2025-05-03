import * as ort from 'onnxruntime-web';
import { tokenize } from '@/features/nlp-engine/utils/tokenizer';
import { config } from '@/features/nlp-engine/config';
import * as fs from 'fs'; // Beibehalten, da die Fehlerliste darauf basiert
import * as path from 'path'; // Beibehalten, da die Fehlerliste darauf basiert

// Typdefinitionen für onnxruntime-web (direkt aus onnxruntime-web importiert)
type InferenceSession = ort.InferenceSession;
type Tensor = ort.Tensor;
type OrtTensor = Record<string, Tensor>;
// Fixed: Import SessionOptions directly from ort
type SessionOptions = ort.SessionOptions;

// Typdefinitionen für das Transformer-Modell (könnten auch in types/nlp.types.ts sein, aber hier belassen, da sie im Kontext verwendet werden)
export interface TransformerModelConfig {
  modelPath: string;
  tokenizerPath: string;
  vocabPath: string;
  maxSequenceLength: number;
  outputDimension: number;
  language: string;
  quantized: boolean;
  poolingStrategy: 'mean' | 'cls' | 'max';
}

export interface TransformerOptions {
  batchSize?: number;
  useCache?: boolean;
  normalizeOutput?: boolean;
  modelVariant?: string;
}

// Typdefinitionen für die semantische Suche (könnten auch in types/nlp.types.ts sein)
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

// Interface für das zugrunde liegende Transformer-Modell, das Embeddings erzeugt
// Dies ist das Interface, das die SentenceTransformer-Klasse erfüllen sollte
interface EmbeddingTransformer {
    embed(text: string): Promise<Float32Array | null>;
    cosineSimilarity(a: Float32Array, b: Float32Array): number;
    getEmbeddingDimension(): number;
    initialize(): Promise<boolean>;
    dispose(): Promise<void>;
    clearCache(): void;
    // Optional: Methode für Batch-Verarbeitung
    embedBatch?(texts: string[]): Promise<Float32Array[] | null>;
}


/**
 * Verwaltet die Erzeugung und Suche von Text-Embeddings
 */
export class EmbeddingManager {
  // Fixed: Use the specific EmbeddingTransformer interface
  private transformer: EmbeddingTransformer | null = null;
  private embeddingCache: Map<string, Float32Array> = new Map();
  private initialized: boolean = false;
  private modelName: string;
  private dimension: number;
  private language: string;
  private similarityThreshold: number;
  private maxResults: number;

  /**
   * Konstruktor für EmbeddingManager
   *
   * @param transformer - Eine Instanz des Transformer-Modells (muss embed und cosineSimilarity haben)
   * @param config - Konfiguration für den Manager
   */
  constructor(
    transformer: EmbeddingTransformer, // Fixed: Expect a transformer instance
    config: {
      modelName: string;
      dimension: number;
      language: string;
      similarityThreshold?: number;
      maxResults?: number;
    }
  ) {
    this.transformer = transformer; // Fixed: Assign the passed transformer
    this.modelName = config.modelName;
    this.dimension = config.dimension;
    this.language = config.language;
    this.similarityThreshold = config.similarityThreshold ?? 0.7;
    this.maxResults = config.maxResults ?? 5;

    console.log(`[EmbeddingManager] Initialisiert für Modell: ${this.modelName}`);
  }

  /**
   * Initialisiert den EmbeddingManager und den zugrunde liegenden Transformer
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    try {
      console.log(`[EmbeddingManager] Starte Initialisierung...`);

      if (!this.transformer) {
          console.error(`[EmbeddingManager] Transformer wurde nicht im Konstruktor bereitgestellt.`);
          return false;
      }

      // Initialisiere den Transformer
      const transformerInitialized = await this.transformer.initialize();
      if (!transformerInitialized) {
        console.error(`[EmbeddingManager] Konnte Transformer nicht initialisieren`);
        return false;
      }

      // Fixed: Ensure dimension is set from the transformer if available
      try {
          const transformerDimension = this.transformer.getEmbeddingDimension();
          if (transformerDimension > 0) {
              this.dimension = transformerDimension;
              console.log(`[EmbeddingManager] Embedding Dimension vom Transformer übernommen: ${this.dimension}`);
          } else {
               console.warn(`[EmbeddingManager] Transformer gab ungültige Dimension zurück (${transformerDimension}). Verwende konfigurierte Dimension: ${this.dimension}`);
          }
      } catch (dimError) {
          console.warn(`[EmbeddingManager] Fehler beim Abrufen der Dimension vom Transformer. Verwende konfigurierte Dimension: ${this.dimension}`, dimError);
      }


      this.initialized = true;
      console.log(`[EmbeddingManager] Erfolgreich initialisiert`);
      return true;
    } catch (error) {
      console.error(`[EmbeddingManager] Fehler bei der Initialisierung:`, error);
      return false;
    }
  }


  /**
   * Erzeugt ein Embedding für einen gegebenen Text
   *
   * @param text - Der zu embeddierende Text
   * @returns Ein Float32Array mit dem Embedding-Vektor oder null bei Fehler
   */
  public async createEmbedding(text: string): Promise<Float32Array | null> {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.warn(`[EmbeddingManager] Leerer oder ungültiger Text für createEmbedding`);
      return null;
    }

    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[EmbeddingManager] Konnte nicht initialisiert werden`);
        return null;
      }
    }

    // Verwende Cache für bereits berechnete Embeddings
    if (this.embeddingCache.has(text)) {
      const cachedEmbedding = this.embeddingCache.get(text);
      // Fixed: Return cached embedding or null if cache entry is unexpectedly null/undefined
      if (cachedEmbedding) {
         return cachedEmbedding;
      } else {
         // Remove invalid cache entry
         this.embeddingCache.delete(text);
         console.warn(`[EmbeddingManager] Ungültiger Cache-Eintrag für "${text.substring(0, 30)}...", wird neu berechnet.`);
      }
    }

    try {
      if (!this.transformer) {
        throw new Error('Transformer ist nicht initialisiert');
      }

      const embedding = await this.transformer.embed(text);

      // Überprüfe, ob ein gültiges Embedding zurückgegeben wurde
      if (!embedding || !(embedding instanceof Float32Array) || embedding.length === 0) {
        console.warn(`[EmbeddingManager] Ungültiges Embedding für Text: "${text.substring(0, 30)}..."`);
        return null;
      }

      // Cache das Embedding
      this.embeddingCache.set(text, embedding);

      return embedding;
    } catch (error) {
      console.error(`[EmbeddingManager] Fehler bei der Embedding-Erzeugung für "${text.substring(0, 30)}...":`, error);
      return null;
    }
  }

   /**
   * Erzeugt Embeddings für mehrere Texte auf einmal (Batch-Verarbeitung)
   * Nutzt die Batch-Funktion des zugrunde liegenden Transformers, falls vorhanden.
   *
   * @param texts - Array von Texten
   * @returns Ein Array von Float32Arrays mit den Embedding-Vektoren oder null bei Fehler
   */
  public async createBatchEmbeddings(texts: string[]): Promise<Float32Array[] | null> {
      if (!texts || texts.length === 0) {
          return [];
      }

      if (!this.initialized) {
          const success = await this.initialize();
          if (!success) {
              console.error(`[EmbeddingManager] Konnte nicht initialisiert werden`);
              return null;
          }
      }

      if (!this.transformer) {
          console.error(`[EmbeddingManager] Transformer ist nicht verfügbar.`);
          return null;
      }

      // Prüfe, ob der Transformer eine Batch-Embed-Methode hat
      if (typeof this.transformer.embedBatch === 'function') {
          console.log(`[EmbeddingManager] Verwende Batch-Embed-Methode des Transformers für ${texts.length} Texte.`);
          try {
              const embeddings = await this.transformer.embedBatch(texts);
              // Cache die Ergebnisse einzeln
              if (embeddings && embeddings.length === texts.length) {
                  texts.forEach((text, index) => {
                      if (embeddings[index]) {
                          this.embeddingCache.set(text, embeddings[index]);
                      }
                  });
              }
              return embeddings;
          } catch (batchError) {
              console.error(`[EmbeddingManager] Fehler bei Batch-Embedding mit Transformer:`, batchError);
              // Fallback zur Einzelverarbeitung
              console.warn(`[EmbeddingManager] Fallback zur Einzelverarbeitung nach Batch-Fehler.`);
              return this.createEmbeddingsSequentially(texts);
          }
      } else {
          console.log(`[EmbeddingManager] Transformer unterstützt kein Batch-Embedding. Verarbeite sequenziell.`);
          // Fallback zur Einzelverarbeitung, wenn keine Batch-Methode verfügbar ist
          return this.createEmbeddingsSequentially(texts);
      }
  }

  /**
   * Erzeugt Embeddings für mehrere Texte sequenziell (Fallback für Batch)
   * @param texts Array von Texten
   * @returns Array von Float32Arrays oder null bei schwerwiegendem Fehler
   */
  private async createEmbeddingsSequentially(texts: string[]): Promise<Float32Array[] | null> {
      const results: Float32Array[] = [];
      // Fixed: Ensure dimension is a number before creating Float32Array
      const safeDimension = this.dimension ?? 0;
      for (const text of texts) {
          // createEmbedding nutzt bereits den Cache
          const embedding = await this.createEmbedding(text);
          // Füge das Embedding hinzu, auch wenn es null ist (repräsentiert Fehler für diesen Text)
          // Oder füge einen Nullvektor hinzu, um die Array-Länge konsistent zu halten
          results.push(embedding ?? new Float32Array(safeDimension).fill(0));
      }
      return results;
  }


  /**
   * Berechnet die semantische Ähnlichkeit zwischen zwei Texten
   *
   * @param text1 - Erster Text
   * @param text2 - Zweiter Text
   * @returns Der Kosinus-Ähnlichkeitsscore (0.0 bis 1.0) oder 0 bei Fehler
   */
  public async calculateSimilarity(text1: string, text2: string): Promise<number> {
    try {
      if (!text1 || !text2) {
        return 0;
      }

      const embedding1 = await this.createEmbedding(text1);
      const embedding2 = await this.createEmbedding(text2);

      // Fixed: Check if embeddings and transformer are available before calling cosineSimilarity
      if (!embedding1 || !embedding2 || !this.transformer || typeof this.transformer.cosineSimilarity !== 'function') {
        console.warn(`[EmbeddingManager] Konnte Ähnlichkeit nicht berechnen, fehlende Embeddings oder Transformer-Methode.`);
        return 0;
      }

      // Fixed: Ensure arguments passed to cosineSimilarity are Float32Array
      // The createEmbedding function should return Float32Array | null, so this check is important
      if (!(embedding1 instanceof Float32Array) || !(embedding2 instanceof Float32Array)) {
           console.error(`[EmbeddingManager] Ungültige Embedding-Typen für Ähnlichkeitsberechnung.`);
           return 0;
      }

      return this.transformer.cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      console.error(`[EmbeddingManager] Fehler bei der Ähnlichkeitsberechnung:`, error);
      return 0;
    }
  }

  /**
   * Sucht nach ähnlichen Elementen basierend auf einem Abfrage-Embedding
   *
   * @param queryEmbedding - Das Embedding der Suchabfrage
   * @param items - Array von Elementen, die ein 'embedding' Feld (Float32Array) und optional ein 'score' Feld (number) haben
   * @param options - Suchoptionen (threshold, maxResults)
   * @returns Ein Array von SearchResult-Objekten, sortiert nach Score
   */
  public async search<T extends { embedding?: Float32Array | null; score?: number | null; [key: string]: any }>(
    queryEmbedding: Float32Array,
    items: T[],
    options: SearchOptions = {}
  ): Promise<SearchResult<T>[]> {
    if (!queryEmbedding || !(queryEmbedding instanceof Float32Array) || queryEmbedding.length === 0 || !items || items.length === 0) {
      return [];
    }

    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        console.error(`[EmbeddingManager] Konnte nicht initialisiert werden`);
        return [];
      }
    }

    try {
      const threshold = options.threshold ?? this.similarityThreshold;
      const maxResults = options.maxResults ?? this.maxResults;

      const results: SearchResult<T>[] = [];

      if (!this.transformer || typeof this.transformer.cosineSimilarity !== 'function') {
           console.error(`[EmbeddingManager] Transformer oder cosineSimilarity Methode nicht verfügbar.`);
           return [];
      }

      for (const item of items) {
        // Fixed: Check if item and item.embedding are valid
        if (!item || !item.embedding || !(item.embedding instanceof Float32Array)) {
            // console.warn(`[EmbeddingManager] Überspringe ungültiges Element in der Suche.`);
            continue; // Überspringe ungültige Elemente
        }

        // Berechne die Ähnlichkeit
        const similarity = this.transformer.cosineSimilarity(queryEmbedding, item.embedding);

        // Fixed: Use nullish coalescing for item.score
        const itemScore = item.score ?? 0; // Verwende 0 als Standardwert, falls score fehlt

        // Kombiniere Ähnlichkeit und optionalen Item-Score
        // Hier könnte eine komplexere Logik stehen, z.B. Gewichtung
        const finalScore = similarity; // Standardmäßig nur semantische Ähnlichkeit

        // Nur Ergebnisse über dem Threshold aufnehmen
        if (finalScore >= threshold) {
          results.push({
            item: item,
            // Fixed: Ensure score is a number
            score: finalScore, // FinalScore ist bereits eine Zahl
            matchType: 'semantic', // Oder 'hybrid', wenn kombiniert
            // Optional Metadaten hinzufügen
            explanation: options.includeMetadata ? { semanticScore: similarity, keywordScore: itemScore } : undefined
          });
        }
      }

      // Sortiere nach Score absteigend
      // Fixed: Use nullish coalescing for sorting
      results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      // Begrenze die Anzahl der Ergebnisse
      return results.slice(0, maxResults);
    } catch (error) {
      console.error(`[EmbeddingManager] Fehler bei der Suche:`, error);
      return [];
    }
  }

  /**
   * Gibt die konfigurierte oder vom Transformer ermittelte Embedding-Dimension zurück
   */
  public getEmbeddingDimension(): number {
      // Fixed: Ensure dimension is a number, provide fallback
      return this.dimension ?? 0;
  }

  /**
   * Löscht den internen Embedding-Cache
   */
  public clearCache(): void {
    this.embeddingCache.clear();
    // Optional: Cache des zugrunde liegenden Transformers leeren
    if (this.transformer && typeof this.transformer.clearCache === 'function') {
        this.transformer.clearCache();
    }
    console.log(`[EmbeddingManager] Interner Cache geleert`);
  }

  /**
   * Gibt Ressourcen frei
   */
  public async dispose(): Promise<void> {
    try {
      if (this.transformer) {
        console.log(`[EmbeddingManager] Gebe Transformer-Ressourcen frei...`);
        if (typeof this.transformer.dispose === 'function') {
          await this.transformer.dispose();
        }
        this.transformer = null;
      }
      this.clearCache();
      this.initialized = false;
      console.log(`[EmbeddingManager] Ressourcen freigegeben`);
    } catch (error) {
      console.error(`[EmbeddingManager] Fehler beim Freigeben der Ressourcen:`, error);
    }
  }
}