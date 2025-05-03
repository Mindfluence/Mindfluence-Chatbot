// src/features/nlp-engine/ai/embeddings/sentenceTransformer.ts

// Imports aus der ONNX-Umgebungsabstraktion mit type-only imports
import {
  getOnnxRuntime,
  loadOnnxModel,
  type CommonInferenceSession, // Type-only import
  type CommonTensor, // Type-only import
  isNodeEnvironment // Hilfsfunktion, um Umgebung zu prüfen
} from '@/utils/onnx-env';

// Definiere SessionOptions direkt hier, anstatt zu importieren
// Dies löst das Problem, dass SessionOptions lokal in onnx-env.ts definiert ist
interface SessionOptions {
  executionProviders?: string[];
  graphOptimizationLevel?: string;
  enableCpuMemArena?: boolean;
  enableMemPattern?: boolean;
  executionMode?: string;
  logId?: string;
  logSeverityLevel?: number;
  logVerbosityLevel?: number;
  extra?: Record<string, unknown>;
}

// Importiere Tokenizer
import { tokenize } from '@/features/nlp-engine/utils/tokenizer';

// Importiere Konfiguration und Typen
import { config } from '@/features/nlp-engine/config';
import type { Language } from '@/types/nlp.types'; // Type-only import

// fs und path werden für Node.js-Umgebungen benötigt
import * as fs from 'fs';
import * as path from 'path';

// Typdefinitionen für onnxruntime-web
type OrtTensor = Record<string, CommonTensor>; // Verwende CommonTensor

// Typdefinitionen für das Transformer-Modell (hier lokal definiert, da sie in nlp.types.ts fehlen)
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

// Interface für das zugrunde liegende Transformer-Modell
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

// Klasse für Sentence-Transformer, die ONNX-Modelle für Embeddings verwendet
export class SentenceTransformer implements EmbeddingTransformer {
  private modelConfig: TransformerModelConfig;
  private options: TransformerOptions;
  private modelSession: CommonInferenceSession | null = null;
  private vocabulary: Map<string, number> = new Map();
  private tokenCache: Map<string, number[]> = new Map();
  private embeddingCache: Map<string, Float32Array> = new Map();
  // specialTokens wird mit Default-IDs initialisiert und dann vom Vokabular überschrieben
  private specialTokens: {[key: string]: number} = { CLS: 101, SEP: 102, PAD: 0, UNK: 100 };
  private initialized: boolean = false;
  private modelName: string;
  // Speichere die geladene ONNX Runtime Instanz
  private onnxRuntime: any = null; // Type any für onnxRuntime, um Typprobleme zu umgehen

  /**
   * Konstruktor für SentenceTransformer
   *
   * @param modelName - Name des zu ladenden Modells (z.B. 'minilm-l6-v2')
   * @param options - Optionen für den Transformer
   */
  constructor(modelName: string = 'minilm-l6-v2', options: TransformerOptions = {}) {
    this.modelName = modelName;
    this.options = {
      batchSize: 16,
      useCache: true,
      normalizeOutput: true,
      modelVariant: 'base',
      ...options
    };

    // Standard-Konfiguration basierend auf dem Modellnamen
    this.modelConfig = this.getModelConfigByName(modelName);

    console.log(`[SentenceTransformer] Initialisiert für Modell: ${modelName}`);
  }

  /**
   * Ruft die Konfiguration für ein Modell anhand seines Namens ab.
   * Liest primär aus config.ts und verwendet interne Defaults als Fallback.
   * @param modelName Der Name des Modells.
   * @returns Die Konfiguration für das Modell.
   */
  private getModelConfigByName(modelName: string): TransformerModelConfig {
    // Versuche Konfiguration aus config.ts zu laden
    // Sicherer Zugriff auf config.nlp.ai.embeddingModels
    const embeddingModelsConfig = config?.nlp?.ai?.embeddingModel as unknown as Record<string, TransformerModelConfig>;

    if (embeddingModelsConfig && modelName in embeddingModelsConfig) {
      console.log(`[SentenceTransformer] Konfiguration für Modell "${modelName}" aus config.ts geladen.`);
      const config = embeddingModelsConfig[modelName];
      if (config) {
        return config;
      }
    }

    console.warn(`[SentenceTransformer] Konfiguration für Modell "${modelName}" nicht in config.ts gefunden, verwende interne Standard-Konfiguration.`);

    // Interne Standard-Konfigurationen als Fallback
    const fallbackModelBasePath = config?.nlp?.modelBasePath ?? 'data/models';
    const resolvedModelBasePath = path.join(process.cwd(), fallbackModelBasePath);

    const defaultMiniLMConfig: TransformerModelConfig = {
        modelPath: path.join(resolvedModelBasePath, 'embeddings', 'minilm-l6-v2', 'model.onnx'),
        tokenizerPath: path.join(resolvedModelBasePath, 'embeddings', 'minilm-l6-v2', 'tokenizer.json'),
        vocabPath: path.join(resolvedModelBasePath, 'embeddings', 'minilm-l6-v2', 'vocab.txt'),
        maxSequenceLength: 128,
        outputDimension: 384,
        language: 'en',
        quantized: false,
        poolingStrategy: 'mean'
    };

    const fallbackConfigs: { [key: string]: TransformerModelConfig } = {
      'minilm-l6-v2': defaultMiniLMConfig,
      'multilingual-e5-small': {
        modelPath: path.join(resolvedModelBasePath, 'embeddings', 'multilingual-e5-small', 'model.onnx'),
        tokenizerPath: path.join(resolvedModelBasePath, 'embeddings', 'multilingual-e5-small', 'tokenizer.json'),
        vocabPath: path.join(resolvedModelBasePath, 'embeddings', 'multilingual-e5-small', 'vocab.txt'),
        maxSequenceLength: 512,
        outputDimension: 384,
        language: 'multilingual',
        quantized: true,
        poolingStrategy: 'mean'
      },
      'paraphrase-multilingual-mpnet-base-v2': {
        modelPath: path.join(resolvedModelBasePath, 'embeddings', 'paraphrase-multilingual-mpnet', 'model.onnx'),
        tokenizerPath: path.join(resolvedModelBasePath, 'embeddings', 'paraphrase-multilingual-mpnet', 'tokenizer.json'),
        vocabPath: path.join(resolvedModelBasePath, 'embeddings', 'paraphrase-multilingual-mpnet', 'vocab.txt'),
        maxSequenceLength: 384,
        outputDimension: 768,
        language: 'multilingual',
        quantized: false,
        poolingStrategy: 'mean'
      }
    };

    // Rückgabe der Fallback-Konfiguration oder der absoluten Standard-Konfiguration
    return fallbackConfigs[modelName] ?? defaultMiniLMConfig;
  }

  /**
   * Initialisiert das Transformer-Modell und lädt das ONNX-Modell
   * @returns True bei Erfolg, False bei Fehler.
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      console.log(`[SentenceTransformer] Modell ${this.modelName} ist bereits initialisiert.`);
      return true;
    }

    try {
      console.log(`[SentenceTransformer] Initialisiere Modell: ${this.modelName}`);

      // Lade die ONNX Runtime über die Abstraktion
      this.onnxRuntime = await getOnnxRuntime();
      if (!this.onnxRuntime) {
           console.error('[SentenceTransformer] ONNX Runtime konnte nicht geladen werden.');
           return false;
      }

      // Überprüfe Modelldateien in Node.js-Umgebungen
      if (isNodeEnvironment()) {
         if (!this.checkModelFiles()) {
            console.error(`[SentenceTransformer] Modelldateien für ${this.modelName} konnten nicht gefunden werden.`);
            return false;
         }
      } else {
           console.log('[SentenceTransformer] Läuft in Browser-Umgebung, überspringe Dateisystem-Check.');
           console.warn('[SentenceTransformer] Vokabular-Laden mit fs.readFileSync wird im Browser fehlschlagen.');
      }

      // Lade das Vokabular
      await this.loadVocabulary();

      // Erstelle eine ONNX-Sitzung
      console.log(`[SentenceTransformer] Lade ONNX-Modell von: ${this.modelConfig.modelPath}`);

      // ONNX Session Optionen
      const sessionOptions: SessionOptions = {
        graphOptimizationLevel: 'all',
      };

      // Lade das Modell über die abstrahierte Funktion 
      // Fix: Übergebe nur den Pfad, nicht die Optionen, da loadOnnxModel sie nicht erwartet
      this.modelSession = await loadOnnxModel(this.modelConfig.modelPath);

      // Logge Modellinformationen
      if (this.modelSession) {
        console.log(`[SentenceTransformer] Modell geladen mit Eingaben:`, this.modelSession.inputNames);
        console.log(`[SentenceTransformer] Modell geladen mit Ausgaben:`, this.modelSession.outputNames);
      } else {
        console.error('[SentenceTransformer] Modell-Session konnte nicht erstellt werden.');
        return false;
      }

      this.initialized = true;
      console.log(`[SentenceTransformer] Modell erfolgreich initialisiert: ${this.modelName}`);
      return true;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Initialisierung des Modells ${this.modelName}:`, errorMessage);
      this.initialized = false;
      this.modelSession = null;
      this.onnxRuntime = null;
      return false;
    }
  }

  /**
   * Überprüft, ob die benötigten Modelldateien vorhanden sind (hauptsächlich für Node.js)
   * @returns True, wenn Dateien existieren oder Umgebung nicht Node.js ist, sonst False.
   */
  private checkModelFiles(): boolean {
    if (!isNodeEnvironment()) {
        console.warn('[SentenceTransformer] checkModelFiles() nur in Node.js-Umgebung sinnvoll.');
        return true;
    }
    try {
      const modelExists = fs.existsSync(this.modelConfig.modelPath);
      const vocabExists = fs.existsSync(this.modelConfig.vocabPath);
      if (!modelExists) {
        console.error(`[SentenceTransformer] Modelldatei nicht gefunden: ${this.modelConfig.modelPath}`);
      }
      if (!vocabExists) {
        console.error(`[SentenceTransformer] Vokabular-Datei nicht gefunden: ${this.modelConfig.vocabPath}`);
      }
      return modelExists && vocabExists;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.warn(`[SentenceTransformer] Fehler beim Überprüfen der Modelldateien mit fs:`, errorMessage);
      return false;
    }
  }

  /**
   * Lädt das Vokabular des Modells.
   * @throws Error wenn das Vokabular nicht geladen werden kann.
   */
  private async loadVocabulary(): Promise<void> {
    try {
      console.log(`[SentenceTransformer] Lade Vokabular aus: ${this.modelConfig.vocabPath}`);

      // Diese Zeile schlägt im Browser fehl
      const vocabText = fs.readFileSync(this.modelConfig.vocabPath, 'utf8');
      const vocabLines = vocabText.split('\n').filter(line => line.trim().length > 0);

      this.vocabulary = new Map();
      vocabLines.forEach((token, index) => {
        this.vocabulary.set(token.trim(), index);
      });

      // Definiere Standard-Token-IDs als Fallback
      const defaultTokenIds = {
        CLS: 101,
        SEP: 102,
        PAD: 0,
        UNK: 100
      };

      // Spezielle Tokens für Transformer mit Nullish Coalescing für undefined
      this.specialTokens = {
        CLS: this.vocabulary.get('[CLS]') ?? defaultTokenIds.CLS,
        SEP: this.vocabulary.get('[SEP]') ?? defaultTokenIds.SEP,
        PAD: this.vocabulary.get('[PAD]') ?? defaultTokenIds.PAD,
        UNK: this.vocabulary.get('[UNK]') ?? defaultTokenIds.UNK
      };

      // Überprüfe, ob die Spezialtokens gefunden wurden und logge Warnung, falls nicht
      if (!this.vocabulary.has('[CLS]')) console.warn("[SentenceTransformer] CLS token '[CLS]' not found in vocabulary, using default ID.");
      if (!this.vocabulary.has('[SEP]')) console.warn("[SentenceTransformer] SEP token '[SEP]' not found in vocabulary, using default ID.");
      if (!this.vocabulary.has('[PAD]')) console.warn("[SentenceTransformer] PAD token '[PAD]' not found in vocabulary, using default ID.");
      if (!this.vocabulary.has('[UNK]')) console.warn("[SentenceTransformer] UNK token '[UNK]' not found in vocabulary, using default ID.");

      console.log(`[SentenceTransformer] Vokabular geladen mit ${this.vocabulary.size} Tokens. Special Tokens:`, this.specialTokens);
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler beim Laden des Vokabulars:`, errorMessage);
      this.specialTokens = { CLS: 101, SEP: 102, PAD: 0, UNK: 100 };
      throw new Error(`Konnte Vokabular nicht laden: ${errorMessage}`);
    }
  }

  /**
   * Erzeugt ein Embedding für einen einzelnen Text.
   * @param text - Der zu embeddierende Text
   * @returns Ein Float32Array mit dem Embedding-Vektor oder null bei Fehler
   */
  public async embed(text: string): Promise<Float32Array | null> {
    if (!this.initialized) {
      console.log('[SentenceTransformer] Modell nicht initialisiert, starte Initialisierung...');
      const success = await this.initialize();
      if (!success) {
        return null;
      }
    }

    // Verwende den Cache, wenn aktiviert
    if (this.options.useCache && this.embeddingCache.has(text)) {
      const cachedEmbedding = this.embeddingCache.get(text);
      console.log(`[SentenceTransformer] Embedding aus Cache geladen.`);
      return cachedEmbedding ?? new Float32Array(this.modelConfig.outputDimension).fill(0);
    }

    try {
      const tokens = await this.tokenizeText(text);
      if (!tokens || tokens.length === 0) {
           console.warn(`[SentenceTransformer] Tokenisierung ergab keine Tokens.`);
           return new Float32Array(this.modelConfig.outputDimension).fill(0);
      }
      
      const batchResult = await this.runInferenceBatch([tokens]);

      if (!batchResult || batchResult.length === 0 || !batchResult[0]) {
           console.error('[SentenceTransformer] Inferenz fehlgeschlagen.');
           return new Float32Array(this.modelConfig.outputDimension).fill(0);
      }

      const embedding = batchResult[0];

      // Cache das Ergebnis, wenn aktiviert
      if (this.options.useCache && embedding) {
        this.embeddingCache.set(text, embedding);
      }

      return embedding;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Erzeugung des Embeddings:`, errorMessage);
      return new Float32Array(this.modelConfig.outputDimension).fill(0);
    }
  }

  /**
   * Erzeugt Embeddings für mehrere Texte auf einmal (Batch-Verarbeitung)
   * @param texts - Array von Texten, für die Embeddings erzeugt werden sollen
   * @returns Ein Array von Float32Arrays mit den Embedding-Vektoren
   */
  public async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!this.initialized) {
      console.log('[SentenceTransformer] Modell nicht initialisiert, starte Initialisierung...');
      const success = await this.initialize();
      if (!success) {
        return texts.map(() => new Float32Array(this.modelConfig.outputDimension).fill(0));
      }
    }

    if (!texts || texts.length === 0) {
      return [];
    }

    try {
      const batchSize = this.options.batchSize ?? 16;
      // Initialisiere results zur Positionserhaltung
      const results: (Float32Array | null)[] = Array(texts.length).fill(null);
      const textsToProcessIndexes: number[] = [];
      const textsToProcess: string[] = [];

      // Vorabprüfung des Caches und Trennung von gecachten/nicht-gecachten Texten
      for (let idx = 0; idx < texts.length; idx++) {
        const text = texts[idx];
        if (!text) continue;
        
        if (this.options.useCache && this.embeddingCache.has(text)) {
           const cachedEmbedding = this.embeddingCache.get(text);
           if(cachedEmbedding) {
              results[idx] = cachedEmbedding;
           } else {
               textsToProcessIndexes.push(idx);
               textsToProcess.push(text);
           }
        } else {
          textsToProcessIndexes.push(idx);
          textsToProcess.push(text);
        }
      }

      // Wenn alle Texte im Cache waren
      if (textsToProcess.length === 0) {
          return results.map(r => r ?? new Float32Array(this.modelConfig.outputDimension).fill(0));
      }

      console.log(`[SentenceTransformer] Verarbeite ${textsToProcess.length} Texte im Batch-Modus.`);

      // Verarbeite Texte in Batches
      for (let i = 0; i < textsToProcess.length; i += batchSize) {
        const batch = textsToProcess.slice(i, i + batchSize);
        const originalIndexes = textsToProcessIndexes.slice(i, i + batchSize);

        // Tokenisiere den Batch
        const tokenizedBatchPromises = batch.map(text => this.tokenizeText(text));
        const tokenizedBatch = await Promise.all(tokenizedBatchPromises);

        // Filtere leere Tokenisierungen
        const validTokenizedBatch: number[][] = [];
        const validOriginalIndexes: number[] = [];
        
        for (let j = 0; j < tokenizedBatch.length; j++) {
            const tokens = tokenizedBatch[j];
            const origIdx = originalIndexes[j];
            
            if (tokens && tokens.length > 0) {
                validTokenizedBatch.push(tokens);
                // Fix für "originalIndex kann undefined sein"
                if (typeof origIdx === 'number') {
                    validOriginalIndexes.push(origIdx);
                }
            } else if (typeof origIdx === 'number') {
                results[origIdx] = new Float32Array(this.modelConfig.outputDimension).fill(0);
            }
        }

        if (validTokenizedBatch.length === 0) {
             continue; // Überspringe leere Batches
        }

        // Führe Inferenz durch
        const batchEmbeddings = await this.runInferenceBatch(validTokenizedBatch);

        // Füge Ergebnisse an den ursprünglichen Positionen hinzu
        for (let j = 0; j < validOriginalIndexes.length; j++) {
            const origIdx = validOriginalIndexes[j];
            const embedding = batchEmbeddings[j];

            // Fix für "originalIndex kann undefined sein"
            if (typeof origIdx === 'number' && embedding) {
                results[origIdx] = embedding;
                // Cache das Ergebnis
                if (this.options.useCache && origIdx < texts.length) {
                    const text = texts[origIdx];
                    if (text) {
                        this.embeddingCache.set(text, embedding);
                    }
                }
            } else if (typeof origIdx === 'number') {
                results[origIdx] = new Float32Array(this.modelConfig.outputDimension).fill(0);
            }
        }
      }

      // Stelle sicher, dass alle Positionen gefüllt sind
      return results.map(r => r ?? new Float32Array(this.modelConfig.outputDimension).fill(0));

    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Batch-Verarbeitung:`, errorMessage);
      return texts.map(() => new Float32Array(this.modelConfig.outputDimension).fill(0));
    }
  }

  /**
   * Tokenisiert einen Text für die Verwendung mit dem Transformer-Modell.
   * @param text Der zu tokenisierende Text.
   * @returns Ein Array von Token-IDs.
   */
  private async tokenizeText(text: string): Promise<number[]> {
    if (!text) {
      return [];
    }
    
    // Verwende den Cache, wenn aktiviert
    if (this.options.useCache && this.tokenCache.has(text)) {
      const cachedTokens = this.tokenCache.get(text);
      return cachedTokens ?? [];
    }

    try {
      // Tokenisiere den Text
      const preprocessedTokens = tokenize(text, {
        preservePunctuation: true,
        toLowerCase: true
      });

      // Stelle sicher, dass specialTokens geladen sind
      if (Object.keys(this.specialTokens).length < 4 ||
          typeof this.specialTokens.CLS !== 'number' ||
          typeof this.specialTokens.SEP !== 'number' ||
          typeof this.specialTokens.PAD !== 'number' ||
          typeof this.specialTokens.UNK !== 'number') {
             try {
                await this.loadVocabulary();
             } catch(vocabErr) {
                console.error("[SentenceTransformer] Vokabular laden fehlgeschlagen:", vocabErr);
                this.specialTokens = { CLS: 101, SEP: 102, PAD: 0, UNK: 100 };
             }
      }

      const clsToken: number = this.specialTokens.CLS ?? 101;
      let tokenIds: number[] = [clsToken]; // Start mit CLS-Token

      if (preprocessedTokens && preprocessedTokens.length > 0) {
        for (const token of preprocessedTokens) {
          // Wenn der Token im Vokabular ist, verwende seine ID
          if (this.vocabulary.has(token)) {
            const tokenId: number = this.vocabulary.get(token) ?? this.specialTokens.UNK ?? 100;
            tokenIds.push(tokenId);
          } else {
            // Versuche, den Token in Unterteile zu zerlegen
            let subTokenized = false;
            if (token.length > 1) {
              const potentialSubtokens = this.getSubtokens(token);
              if (potentialSubtokens.length > 0) {
                tokenIds.push(...potentialSubtokens);
                subTokenized = true;
              }
            }

            // Wenn keine Subtokens gefunden wurden, verwende UNK-Token
            if (!subTokenized) {
              const unkToken: number = this.specialTokens.UNK ?? 100;
              tokenIds.push(unkToken);
            }
          }
        }
      }

      // Füge SEP-Token am Ende hinzu
      const sepToken: number = this.specialTokens.SEP ?? 102;
      tokenIds.push(sepToken);

      // Begrenze die Sequenzlänge auf maxSequenceLength
      if (tokenIds.length > this.modelConfig.maxSequenceLength) {
        const firstToken: number = tokenIds[0] ?? this.specialTokens.CLS ?? 101;
        const lastToken: number = tokenIds[tokenIds.length - 1] ?? this.specialTokens.SEP ?? 102;

        // Kürze, aber behalte CLS und SEP
        const safeMaxLength = Math.max(2, this.modelConfig.maxSequenceLength);
        const sliceEnd = safeMaxLength - 1;
        const effectiveSliceEnd = Math.max(1, sliceEnd);

        tokenIds = [
          firstToken,
          ...tokenIds.slice(1, effectiveSliceEnd),
          lastToken
        ];

        // Nach dem Kürzen, stelle sicher, dass die Länge nicht überschritten wird
        if (tokenIds.length > safeMaxLength) {
             tokenIds = tokenIds.slice(0, safeMaxLength);
        }
      } else {
          // Füge Padding-Token hinzu, wenn kürzer als maxSequenceLength
          const padToken: number = this.specialTokens.PAD ?? 0;
          while (tokenIds.length < this.modelConfig.maxSequenceLength) {
            tokenIds.push(padToken);
          }
      }

      // Cache das Ergebnis, wenn aktiviert
      if (this.options.useCache) {
        this.tokenCache.set(text, tokenIds);
      }

      return tokenIds;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Tokenisierung:`, errorMessage);

      // Fallback: Minimaler Token-Satz
      const fallbackTokenIds = [
        this.specialTokens.CLS ?? 101,
        this.specialTokens.UNK ?? 100,
        this.specialTokens.SEP ?? 102
      ];
       
      // Füge Padding hinzu
      const padToken: number = this.specialTokens.PAD ?? 0;
      while (fallbackTokenIds.length < this.modelConfig.maxSequenceLength) {
          fallbackTokenIds.push(padToken);
      }

      return fallbackTokenIds;
    }
  }

  /**
   * Versucht, einen unbekannten Token in bekannte Subtoken zu zerlegen.
   * @param token Der zu zerlegende Token-String.
   * @returns Ein Array von Token-IDs der Subtoken.
   */
  private getSubtokens(token: string): number[] {
    if (!token) return [];
    
    const subtokens: number[] = [];
    let start = 0;

    // Maximale Anzahl an Iterationen, um Endlosschleifen zu vermeiden
    const maxIterations = token.length * 2;
    let iterations = 0;

    while (start < token.length && iterations < maxIterations) {
      iterations++;
      let end = token.length;
      let foundMatch = false;

      // Versuche, den längstmöglichen Subtoken zu finden
      while (end > start && !foundMatch) {
        // Füge ##-Präfix hinzu, außer am Anfang
        const prefix = start === 0 ? '' : '##';
        const subtokenText = prefix + token.substring(start, end);

        if (this.vocabulary.has(subtokenText)) {
          foundMatch = true;
          const subtokenId: number = this.vocabulary.get(subtokenText) ?? (this.specialTokens.UNK ?? 100);
          subtokens.push(subtokenId);
          start = end;
        } else {
          end--;
        }
      }

      // Wenn kein passender Subtoken gefunden wurde, nimm das einzelne Zeichen
      if (!foundMatch) {
         const char = token[start];
         if (char) {
            if(this.vocabulary.has(char)) {
                const charId: number = this.vocabulary.get(char) ?? (this.specialTokens.UNK ?? 100);
                subtokens.push(charId);
            } else {
                const unkToken: number = this.specialTokens.UNK ?? 100;
                subtokens.push(unkToken);
            }
         } else {
            const unkToken: number = this.specialTokens.UNK ?? 100;
            subtokens.push(unkToken);
         }
         start++;
      }
    }

    // Füge UNK für übrige Zeichen hinzu
    while(start < token.length) {
       const unkToken: number = this.specialTokens.UNK ?? 100;
       subtokens.push(unkToken);
       start++;
    }

    return subtokens;
  }

  /**
   * Führt die Inferenz mit dem ONNX-Modell für einen Batch durch.
   * @param tokenIdsBatch Ein Array von Arrays von Token-IDs
   * @returns Ein Array von Float32Arrays der Embeddings
   */
  private async runInferenceBatch(tokenIdsBatch: number[][]): Promise<Float32Array[]> {
    if (!this.modelSession || !this.onnxRuntime) {
      throw new Error('Modell-Session oder ONNX Runtime ist nicht initialisiert');
    }

    if (!tokenIdsBatch || tokenIdsBatch.length === 0 || tokenIdsBatch.every(tokens => !tokens || tokens.length === 0)) {
        console.warn('[SentenceTransformer] Leerer Batch übergeben.');
        return [];
    }

    try {
      const batchSize = tokenIdsBatch.length;
      const maxSequenceLength = this.modelConfig.maxSequenceLength;
      const padToken: number = this.specialTokens.PAD ?? 0;

      // Arrays für den gesamten Batch erstellen
      const flatInputIds: number[] = [];
      const flatAttentionMask: number[] = [];
      const sequenceLengths: number[] = [];

      // Padding und Flattening für den Batch
      for (const tokens of tokenIdsBatch) {
        if (!tokens) continue;
        
        const originalLength = tokens.length;
        sequenceLengths.push(originalLength);

        let paddedTokens = [...tokens];
        let attentionMask = new Array(originalLength).fill(1);

        // Padding hinzufügen
        while (paddedTokens.length < maxSequenceLength) {
          paddedTokens.push(padToken);
          attentionMask.push(0);
        }

        // Truncation bei Bedarf
        if (paddedTokens.length > maxSequenceLength) {
             paddedTokens = paddedTokens.slice(0, maxSequenceLength);
             attentionMask = attentionMask.slice(0, maxSequenceLength);
        }

        flatInputIds.push(...paddedTokens);
        flatAttentionMask.push(...attentionMask);
      }

      // Prüfe die flachen Arrays
      const expectedFlatLength = batchSize * maxSequenceLength;
      if (flatInputIds.length !== expectedFlatLength || flatAttentionMask.length !== expectedFlatLength) {
           console.error(`[SentenceTransformer] Fehler beim Padding/Truncation: Erwartete Länge ${expectedFlatLength}, erhalten ${flatInputIds.length}.`);
           return Array(batchSize).fill(new Float32Array(this.modelConfig.outputDimension).fill(0));
      }

      // Erstelle ONNX-Tensoren - Fix: Verwende numerische Konstanten statt Strings für TensorType
      // TensorType.int32 = 6 gemäß onnxruntime-web Definitionen 
      const inputIdsTensor = new this.onnxRuntime.Tensor(6, new Int32Array(flatInputIds), [batchSize, maxSequenceLength]);
      const attentionMaskTensor = new this.onnxRuntime.Tensor(6, new Int32Array(flatAttentionMask), [batchSize, maxSequenceLength]);

      // Erstelle ONNX-Eingaben
      const feeds: OrtTensor = {
        'input_ids': inputIdsTensor,
        'attention_mask': attentionMaskTensor
      };

      // Prüfe, ob token_type_ids erforderlich ist
      if (this.modelSession.inputNames.includes('token_type_ids')) {
        const flatTokenTypeIds = new Int32Array(expectedFlatLength).fill(0);
        feeds['token_type_ids'] = new this.onnxRuntime.Tensor(6, flatTokenTypeIds, [batchSize, maxSequenceLength]);
      }

      // Führe die Inferenz durch
      const results: OrtTensor = await this.modelSession.run(feeds);

      // Finde den richtigen Ausgabe-Tensor
      const outputTensorNames = Object.keys(results);
      let outputTensorName = outputTensorNames.find(name =>
        name.includes('last_hidden_state') ||
        name.includes('token_embeddings') ||
        name.includes('output') ||
        name.includes('embedding')
      ) || '';

      // Fallback: Prüfe auf Tensor mit richtiger Batch-Form
      if (!outputTensorName) {
        for (const name of outputTensorNames) {
          const tensor = results[name];
          if (tensor && tensor.dims && Array.isArray(tensor.dims) && 
              tensor.dims.length >= 2 && tensor.dims[0] === batchSize) {
            outputTensorName = name;
            break;
          }
        }
      }

      if (!outputTensorName) {
        console.error(`[SentenceTransformer] Kein passender Ausgabe-Tensor gefunden.`);
        return Array(batchSize).fill(new Float32Array(this.modelConfig.outputDimension).fill(0));
      }

      const outputTensor = results[outputTensorName];

      // Prüfe den Tensor
      if (!outputTensor || !outputTensor.data || !outputTensor.dims || !Array.isArray(outputTensor.dims)) {
         console.error(`[SentenceTransformer] Ausgabe-Tensor hat keine gültigen Daten.`);
         return Array(batchSize).fill(new Float32Array(this.modelConfig.outputDimension).fill(0));
      }

      const outputData = outputTensor.data as Float32Array;
      const dimensions = outputTensor.dims;

      // Prüfe die Dimensionen
      if (dimensions.length < 2 || dimensions[0] !== batchSize) {
          console.error(`[SentenceTransformer] Unerwartete Ausgabe-Tensor-Form: ${dimensions.join('x')}.`);
          return Array(batchSize).fill(new Float32Array(this.modelConfig.outputDimension).fill(0));
      }

      // Extrahiere Dimensionen
      const hiddenSize = dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension;
      const tensorSequenceLength = dimensions.length === 3 ? dimensions[1] ?? maxSequenceLength : 1;

      // Verarbeite jeden Satz im Batch
      const batchEmbeddings: Float32Array[] = [];
      for (let i = 0; i < batchSize; i++) {
         // Berechne Offset im flachen Tensor
         const offset = i * tensorSequenceLength * hiddenSize;
         
         // Erstelle Attention-Maske für den aktuellen Satz
         const originalSentenceLength = sequenceLengths[i] ?? 0;
         const currentAttentionMask = new Array(tensorSequenceLength).fill(0)
                                          .map((_, idx) => idx < originalSentenceLength ? 1 : 0);

         // Prüfe Grenzen
         const sentenceDataLength = tensorSequenceLength * hiddenSize;
         if (offset + sentenceDataLength > outputData.length) {
              console.error(`[SentenceTransformer] Datenfehler beim Extrahieren von Satz ${i}.`);
              batchEmbeddings.push(new Float32Array(this.modelConfig.outputDimension).fill(0));
              continue;
         }
         
         // Extrahiere Daten für den aktuellen Satz
         const sentenceData = outputData.slice(offset, offset + sentenceDataLength);
         const sentenceDims = dimensions.length === 3 
                               ? [1, tensorSequenceLength, hiddenSize] 
                               : [1, hiddenSize];

         // Erstelle temporären Tensor - Fix: Verwende nur arrays von Zahlen
         const safeData = Array.from(sentenceData).filter(val => typeof val === 'number');
         const sentenceTensor: CommonTensor = {
             data: safeData,
             dims: sentenceDims,
             type: outputTensor.type,
             size: safeData.length
         };

         // Pooling basierend auf Strategie
         let embedding: Float32Array;
         switch (this.modelConfig.poolingStrategy) {
            case 'cls':
              embedding = this.extractClsEmbedding(sentenceTensor);
              break;
            case 'mean':
              embedding = this.computeMeanPooling(sentenceTensor, currentAttentionMask);
              break;
            case 'max':
              embedding = this.computeMaxPooling(sentenceTensor, currentAttentionMask);
              break;
            default:
              embedding = this.computeMeanPooling(sentenceTensor, currentAttentionMask);
         }

         // Normalisiere wenn nötig
         if (this.options.normalizeOutput) {
           embedding = this.normalizeVector(embedding);
         }

         batchEmbeddings.push(embedding);
      }

      return batchEmbeddings;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Batch-Inferenz:`, errorMessage);
      const originalBatchSize = tokenIdsBatch.length;
      return Array(originalBatchSize).fill(new Float32Array(this.modelConfig.outputDimension).fill(0));
    }
  }

  /**
   * Extrahiert das CLS-Token-Embedding
   * @param outputTensor Der Tensor für einen einzelnen Satz
   * @returns Das CLS-Embedding
   */
  private extractClsEmbedding(outputTensor: CommonTensor): Float32Array {
    try {
      const data = outputTensor.data;
      const dimensions = outputTensor.dims ?? [];

      if (!data || !Array.isArray(dimensions) || dimensions.length < 2) {
        console.warn(`[SentenceTransformer] Unerwartete Tensor-Daten für CLS-Embedding.`);
        const outputDimension = dimensions && dimensions.length > 0 
          ? (dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension) 
          : this.modelConfig.outputDimension;
        return new Float32Array(outputDimension).fill(0);
      }

      // Fix: Sicheres Konvertieren von data zu Float32Array
      const safeData: number[] = [];
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (typeof val === 'number' && isFinite(val)) {
          safeData.push(val);
        } else {
          safeData.push(0);
        }
      }
      const floatData = new Float32Array(safeData);

      // Extrahiere hiddenSize aus Dimensionen
      const hiddenSize = dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension;

      // CLS ist das erste Token (Offset 0)
      if (floatData.length >= hiddenSize) {
        return new Float32Array(floatData.slice(0, hiddenSize));
      } else {
        console.warn('[SentenceTransformer] Daten im Tensor zu kurz für CLS-Embedding.');
        return new Float32Array(hiddenSize).fill(0);
      }
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei CLS-Pooling:`, errorMessage);
      return new Float32Array(this.modelConfig.outputDimension).fill(0);
    }
  }

  /**
   * Berechnet das Mean-Pooling über Token-Embeddings
   * @param outputTensor Der Tensor für einen einzelnen Satz
   * @param attentionMask Die Aufmerksamkeitsmaske für diesen Satz
   * @returns Das Mean-gepoolte Embedding
   */
  private computeMeanPooling(outputTensor: CommonTensor, attentionMask: number[]): Float32Array {
    try {
      const data = outputTensor.data;
      const dimensions = outputTensor.dims ?? [];

      if (!data || !Array.isArray(dimensions) || dimensions.length < 2) {
        console.warn(`[SentenceTransformer] Unerwartete Tensor-Daten für Mean-Pooling.`);
        const outputDimension = dimensions && dimensions.length > 0 
          ? (dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension) 
          : this.modelConfig.outputDimension;
        return new Float32Array(outputDimension).fill(0);
      }

      // Fix: Sicheres Konvertieren von data zu float array
      const safeData: number[] = [];
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (typeof val === 'number' && isFinite(val)) {
          safeData.push(val);
        } else {
          safeData.push(0);
        }
      }
      const floatData = new Float32Array(safeData);

      // Extrahiere Dimensionen
      const tensorSequenceLength = dimensions.length === 3 
                                    ? dimensions[1] ?? this.modelConfig.maxSequenceLength 
                                    : 1;
      const hiddenSize = dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension;

      // Initialisiere Output
      const pooledOutput = new Float32Array(hiddenSize).fill(0);
      let tokenCount = 0;

      // Prozessiere Token (überspringe Padding)
      const safeSequenceLength = Math.min(tensorSequenceLength, attentionMask.length);

      if (floatData.length < safeSequenceLength * hiddenSize) {
          console.warn(`[SentenceTransformer] Tensor-Daten kürzer als erwartet.`);
      }

      for (let i = 0; i < safeSequenceLength; i++) {
        if (attentionMask[i] === 1) { // Nicht-Padding Token
          for (let j = 0; j < hiddenSize; j++) {
            const index = (i * hiddenSize) + j;
            if (index < floatData.length) {
              const value = floatData[index];
              if (typeof value === 'number' && isFinite(value)) {
                pooledOutput[j] = (pooledOutput[j] ?? 0) + value;
              }
            } else {
                break; // Abbrechen wenn außerhalb der Grenzen
            }
          }
          tokenCount++;
        }
      }

      // Durchschnitt berechnen
      if (tokenCount > 0) {
        for (let j = 0; j < hiddenSize; j++) {
          if (isFinite(pooledOutput[j] ?? 0)) {
            pooledOutput[j] = (pooledOutput[j] ?? 0) / tokenCount;
          } else {
            pooledOutput[j] = 0;
          }
        }
      } else {
        console.warn('[SentenceTransformer] Keine gültigen Tokens für Mean-Pooling.');
        return new Float32Array(hiddenSize).fill(0);
      }

      return pooledOutput;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei Mean-Pooling:`, errorMessage);
      return new Float32Array(this.modelConfig.outputDimension).fill(0);
    }
  }

  /**
   * Berechnet das Max-Pooling über Token-Embeddings
   * @param outputTensor Der Tensor für einen einzelnen Satz
   * @param attentionMask Die Aufmerksamkeitsmaske für diesen Satz
   * @returns Das Max-gepoolte Embedding
   */
  private computeMaxPooling(outputTensor: CommonTensor, attentionMask: number[]): Float32Array {
    try {
      const data = outputTensor.data;
      const dimensions = outputTensor.dims ?? [];

      if (!data || !Array.isArray(dimensions) || dimensions.length < 2) {
        console.warn(`[SentenceTransformer] Unerwartete Tensor-Daten für Max-Pooling.`);
        const outputDimension = dimensions && dimensions.length > 0 
          ? (dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension) 
          : this.modelConfig.outputDimension;
        return new Float32Array(outputDimension).fill(0);
      }

      // Fix: Sicheres Konvertieren von data zu float array
      const safeData: number[] = [];
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        if (typeof val === 'number' && isFinite(val)) {
          safeData.push(val);
        } else {
          safeData.push(0);
        }
      }
      const floatData = new Float32Array(safeData);

      // Extrahiere Dimensionen
      const tensorSequenceLength = dimensions.length === 3 
                                    ? dimensions[1] ?? this.modelConfig.maxSequenceLength 
                                    : 1;
      const hiddenSize = dimensions[dimensions.length - 1] ?? this.modelConfig.outputDimension;

      // Initialisiere mit -Infinity für Max-Pooling
      const pooledOutput = new Float32Array(hiddenSize).fill(-Infinity);
      let validTokenFound = false;

      // Prozessiere Token (überspringe Padding)
      const safeSequenceLength = Math.min(tensorSequenceLength, attentionMask.length);

      if (floatData.length < safeSequenceLength * hiddenSize) {
          console.warn(`[SentenceTransformer] Tensor-Daten kürzer als erwartet.`);
      }

      for (let i = 0; i < safeSequenceLength; i++) {
        if (attentionMask[i] === 1) { // Nicht-Padding Token
          validTokenFound = true;
          for (let j = 0; j < hiddenSize; j++) {
            const index = (i * hiddenSize) + j;
            if (index < floatData.length) {
              const value = floatData[index];
              if (typeof value === 'number' && isFinite(value)) {
                if (isFinite(pooledOutput[j] ?? -Infinity)) {
                  pooledOutput[j] = Math.max(pooledOutput[j] ?? -Infinity, value);
                } else {
                  pooledOutput[j] = value;
                }
              }
            } else {
                break; // Abbrechen wenn außerhalb der Grenzen
            }
          }
        }
      }

      // Ersetze -Infinity durch 0
      for (let j = 0; j < hiddenSize; j++) {
        if (!isFinite(pooledOutput[j] ?? -Infinity) || (pooledOutput[j] ?? -Infinity) === -Infinity) {
          pooledOutput[j] = 0;
        }
      }

      if (!validTokenFound) {
        console.warn('[SentenceTransformer] Keine gültigen Tokens für Max-Pooling.');
        return new Float32Array(hiddenSize).fill(0);
      }

      return pooledOutput;
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei Max-Pooling:`, errorMessage);
      return new Float32Array(this.modelConfig.outputDimension).fill(0);
    }
  }

  /**
   * Normalisiert einen Vektor auf Einheitslänge (L2-Norm)
   * @param vector Der zu normalisierende Vektor
   * @returns Der normalisierte Vektor
   */
  private normalizeVector(vector: Float32Array): Float32Array {
    try {
      if (!vector || vector.length === 0) {
        console.warn('[SentenceTransformer] Normalisierung eines leeren Vektors versucht.');
        return new Float32Array(this.modelConfig.outputDimension).fill(0);
      }

      // Bereinige NaN/Infinity Werte
      const cleanedVector = new Float32Array(vector.length);
      let hasInvalidValues = false;
      
      for (let i = 0; i < vector.length; i++) {
        const value = vector[i];
        if (typeof value === 'number' && isFinite(value)) {
          cleanedVector[i] = value;
        } else {
          hasInvalidValues = true;
          cleanedVector[i] = 0;
        }
      }

      if (hasInvalidValues) {
        console.warn(`[SentenceTransformer] Vektor enthielt ungültige Werte, die durch 0 ersetzt wurden.`);
      }

      // Berechne L2-Norm
      let norm = 0;
      for (let i = 0; i < cleanedVector.length; i++) {
        const value = cleanedVector[i];
        if (typeof value === 'number' && isFinite(value)) {
          norm += value * value;
        }
      }
      norm = Math.sqrt(norm);

      // Vermeide Division durch 0
      if (norm > 1e-10 && isFinite(norm)) {
        const normalizedVector = new Float32Array(cleanedVector.length);
        for (let i = 0; i < cleanedVector.length; i++) {
          const value = cleanedVector[i];
          if (typeof value === 'number' && isFinite(value) && isFinite(norm)) {
            normalizedVector[i] = value / norm;
          } else {
            normalizedVector[i] = 0;
          }
        }
        return normalizedVector;
      } else {
        console.warn(`[SentenceTransformer] Normalisierung nicht möglich: Norm ist ${norm}.`);
        return cleanedVector;
      }
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Vektornormalisierung:`, errorMessage);
      return new Float32Array(vector);
    }
  }

  /**
   * Berechnet die Kosinus-Ähnlichkeit zwischen zwei Vektoren
   * @param a Der erste Vektor
   * @param b Der zweite Vektor
   * @returns Die Kosinus-Ähnlichkeit (-1 bis 1)
   */
  public cosineSimilarity(a: Float32Array, b: Float32Array): number {
    try {
      // Nullchecks
      if (!a || !b) {
        console.warn('[SentenceTransformer] Kosinus-Ähnlichkeit mit ungültigen Vektoren versucht.');
        return 0;
      }

      // Überprüfe Dimensionen
      const len = Math.min(a.length, b.length);
      if (len === 0) {
        return 0;
      }

      // Berechne Skalarprodukt und Normen
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < len; i++) {
        const aVal = a[i] ?? 0;
        const bVal = b[i] ?? 0;

        if (isFinite(aVal) && isFinite(bVal)) {
          dotProduct += aVal * bVal;
          normA += aVal * aVal;
          normB += bVal * bVal;
        }
      }

      // Prüfe auf Nullvektoren
      if (normA < 1e-10 || normB < 1e-10 || !isFinite(normA) || !isFinite(normB)) {
        console.warn(`[SentenceTransformer] Ein oder beide Vektoren sind (fast) Nullvektoren.`);
        return 0;
      }

      const normASqrt = Math.sqrt(normA);
      const normBSqrt = Math.sqrt(normB);

      // Prüfe auf NaN/Infinity
      if (!isFinite(normASqrt) || !isFinite(normBSqrt) || normASqrt === 0 || normBSqrt === 0) {
        console.warn(`[SentenceTransformer] Fehler bei der Berechnung der Wurzelnormen.`);
        return 0;
      }

      const similarity = dotProduct / (normASqrt * normBSqrt);

      // Prüfe auf NaN/Infinity
      if (!isFinite(similarity)) {
        console.warn(`[SentenceTransformer] Kosinus-Ähnlichkeit ergab nicht-endliches Ergebnis.`);
        return 0;
      }
      
      // Begrenze das Ergebnis auf [-1, 1]
      return Math.max(-1, Math.min(1, similarity));
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler bei der Berechnung der Kosinus-Ähnlichkeit:`, errorMessage);
      return 0;
    }
  }

  /**
   * Gibt die Konfiguration des Modells zurück
   */
  public getModelConfig(): TransformerModelConfig {
    return { ...this.modelConfig };
  }

  /**
   * Gibt die Dimension des Embedding-Vektors zurück
   */
  public getEmbeddingDimension(): number {
    return this.modelConfig.outputDimension;
  }

  /**
   * Löscht die internen Caches
   */
  public clearCache(): void {
    this.tokenCache.clear();
    this.embeddingCache.clear();
    console.log(`[SentenceTransformer] Cache geleert`);
  }

  /**
   * Gibt die Ressourcen der ONNX-Session frei
   */
  public async dispose(): Promise<void> {
    try {
      if (this.modelSession) {
        try {
          if (typeof (this.modelSession as any).dispose === 'function') {
            await (this.modelSession as any).dispose();
            console.log(`[SentenceTransformer] Modell-Session mit dispose() freigegeben`);
          }
          else if (typeof (this.modelSession as any).release === 'function') {
            await (this.modelSession as any).release();
            console.log(`[SentenceTransformer] Modell-Session mit release() freigegeben`);
          }
          else {
            console.log(`[SentenceTransformer] Keine explizite Freigabe-Methode für die Session verfügbar`);
          }
        } catch (disposeError) {
          console.warn(`[SentenceTransformer] Fehler beim Freigeben der Session:`, disposeError);
        }

        this.modelSession = null;
      }

      this.clearCache();
      this.initialized = false;
      console.log(`[SentenceTransformer] Modell freigegeben: ${this.modelName}`);
    } catch (error) {
      const errorMessage = (error instanceof Error) ? error.message : String(error);
      console.error(`[SentenceTransformer] Fehler beim Freigeben des Modells:`, errorMessage);
    }
  }
}