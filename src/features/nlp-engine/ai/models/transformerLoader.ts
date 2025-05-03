/**
 * transformerLoader.ts
 * 
 * ACHTUNG: Diese Datei ist veraltet und wird nicht mehr aktiv verwendet.
 * Die Funktionalität wurde durch die SentenceTransformer-Klasse ersetzt,
 * die onnxruntime-web statt onnxruntime-node verwendet.
 * 
 * Diese Datei wird nur aus Kompatibilitätsgründen beibehalten.
 */

import { getOnnxRuntime } from '@/utils/onnx-env';
// Use type-only imports for types
import type { NLPEngineConfig } from '@/types/nlp.types';
import type { Language } from '@/types/nlp.types';
import type { 
  AIModel, 
  TransformerModel, 
  Embedding, 
  ModelMetadata
} from '@/features/nlp-engine/ai/models/modelRegistry';
import { basicTokenize } from '@/features/nlp-engine/utils/tokenizer';

// Import the actual configuration if available, or use this fallback
let config: NLPEngineConfig;
try {
  // Dynamic import to prevent build errors
  const importedConfig = require('@/features/nlp-engine/config').config;
  config = importedConfig;
} catch (e) {
  // Vollständige Fallback-Konfiguration
  config = {
    defaultLanguage: 'de',
    intentThresholds: {
      high: 0.8,
      medium: 0.5,
      low: 0.3
    },
    nlp: {
      modelBasePath: 'data/models',
      useSentimentAnalysis: false,
      defaultLanguage: 'de',
      supportedLanguages: ['de', 'en']
    },
    models: {
      intent: { modelPath: 'data/models/intent' },
      entity: { modelPath: 'data/models/entity' },
      context: { modelPath: 'data/models/context' }
    },
    fallbacks: {
      de: {
        unknown: ['Ich verstehe nicht ganz, was Sie meinen.'],
        greeting: ['Hallo! Wie kann ich Ihnen helfen?']
      },
      en: {
        unknown: ['I don\'t quite understand what you mean.'],
        greeting: ['Hello! How can I help you?']
      }
    },
    ai: {
      onnxThreads: 4,
      onnxLogLevel: 'warning',
      modelBasePath: 'data/models',
      onnxSimd: true,
      onnxProxy: false,
      onnxInitTimeout: 30000
    }
  };
}

// Import model registry if available, or use a fallback
let modelRegistry: any;
try {
  const registry = require('@/features/nlp-engine/ai/models/modelRegistry').modelRegistry;
  modelRegistry = registry;
} catch (e) {
  // Fallback model registry
  modelRegistry = {
    getTransformerModel: () => null,
    getModelPath: () => null,
    registerModel: () => {}
  };
}

// Create a utility function for model key generation
const createModelKey = (type: string, modelId: string, language?: string) => 
  `${type}_${modelId}${language ? `_${language}` : ''}`;

// Web-compatible file system operations
const fileSystem = {
  async exists(path: string): Promise<boolean> {
    // In a browser environment, we can't check if a file exists directly
    // We'll attempt a HEAD request to the URL
    try {
      // For local development, just return true
      if (typeof window === 'undefined' || (typeof location !== 'undefined' && location.protocol === 'file:')) {
        console.log(`[Web FS] Assuming file exists in development: ${path}`);
        return true;
      }
      
      // For HTTP/HTTPS, attempt a HEAD request
      const response = await fetch(path, { method: 'HEAD' });
      return response.ok;
    } catch (e) {
      console.warn(`[Web FS] Error checking file existence: ${path}`, e);
      return false;
    }
  },
  
  async readFile(path: string): Promise<any> {
    try {
      // In a browser, use fetch to get the file
      console.log(`[Web FS] Reading file: ${path}`);
      
      // For local development, return mock data
      if (typeof window === 'undefined' || (typeof location !== 'undefined' && location.protocol === 'file:')) {
        if (path.endsWith('_vocab.json')) {
          return JSON.stringify({
            token2idx: { "[PAD]": 0, "[UNK]": 1, "[CLS]": 2, "[SEP]": 3 },
            vocab: { "[PAD]": 0, "[UNK]": 1, "[CLS]": 2, "[SEP]": 3 }
          });
        } else if (path.endsWith('_tokenizer.json')) {
          return JSON.stringify({ merges: [] });
        }
        return "{}";
      }
      
      // For HTTP/HTTPS, fetch the file
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      if (path.endsWith('.json')) {
        return await response.text();
      } else {
        return await response.arrayBuffer();
      }
    } catch (e) {
      console.error(`[Web FS] Error reading file: ${path}`, e);
      throw e;
    }
  },
  
  statSync(path: string): { size: number } {
    // Mock file stats - in a real implementation, this could come from HTTP headers
    return { size: 1000000 };
  }
};

// Path utilities compatible with web environment
const pathUtils = {
  join(...paths: string[]): string {
    // Simple path joining for web environment
    return paths.filter(Boolean).join('/').replace(/\/+/g, '/');
  }
};

// Initialize onnx runtime
let ort: any;
(async () => {
  try {
    ort = await getOnnxRuntime();
    // Configure ONNX environment
    if (ort && ort.env) {
      if (ort.env.wasm && typeof ort.env.wasm.numThreads !== 'undefined') {
        ort.env.wasm.numThreads = config.ai?.onnxThreads || 4;
      }
      if (typeof ort.env.logLevel !== 'undefined') {
        ort.env.logLevel = config.ai?.onnxLogLevel || 'warning';
      }
    }
  } catch (e) {
    console.warn("Failed to initialize ONNX runtime", e);
    // Create a minimal mock for development purposes
    ort = {
      InferenceSession: {
        create: async () => ({
          run: async () => ({}),
          inputNames: [],
          outputNames: [],
          release: async () => {}
        })
      },
      Tensor: class {
        constructor(public type: string, public data: any, public dims: number[]) {}
      }
    };
  }
})();

/**
 * Konfiguration für Transformer-Modelle
 */
export interface TransformerConfig {
  // Grundlegende Modellkonfiguration
  modelId: string;
  language: Language;
  dimension: number;  // Embedding-Dimension
  
  // Modellpfade und -dateien
  modelPath: string;
  tokenizerPath?: string;
  vocabPath?: string;
  
  // Modellparameter
  maxSequenceLength: number;
  doLowerCase: boolean;
  paddingToken: string;
  unknownToken: string;
  
  // Modellmetadaten
  description?: string;
  version?: string;
  parameters?: number;
}

/**
 * Standard-Konfigurationen für unterstützte Modelle
 */
export const TRANSFORMER_CONFIGS: Record<string, Partial<TransformerConfig>> = {
  'minilm-l6': {
    modelId: 'minilm-l6',
    dimension: 384,
    maxSequenceLength: 128,
    doLowerCase: true,
    description: 'Leichtgewichtiges allgemeines Sprachmodell für Textembeddings',
    parameters: 22 * 1000 * 1000  // 22M Parameter
  },
  'multilingual-e5-small': {
    modelId: 'multilingual-e5-small',
    dimension: 384,
    maxSequenceLength: 512,
    doLowerCase: true,
    description: 'Mehrsprachiges Embedding-Modell, optimiert für semantische Textähnlichkeit',
    parameters: 117 * 1000 * 1000  // 117M Parameter
  },
  'distilbert-faq': {
    modelId: 'distilbert-faq',
    dimension: 768,
    maxSequenceLength: 128,
    doLowerCase: true,
    description: 'Leichtgewichtiges Modell, finetuned für FAQ-Matching',
    parameters: 66 * 1000 * 1000  // 66M Parameter
  }
};

/**
 * Einfaches Vokabular für die Tokenisierung
 */
interface Vocabulary {
  token2idx: Record<string, number>;
  idx2token: Record<string, string>;
  specialTokens: {
    padding: string;
    unknown: string;
    cls: string;
    sep: string;
  };
}

/**
 * BPE-Tokenisierung Merger
 */
interface BPEMerges {
  merges: string[][];
}

/**
 * Erweiterte Tokenizer-Optionen
 */
interface ExtendedTokenizerOptions {
  toLowerCase?: boolean;
  preservePunctuation?: boolean;
  splitNumbers?: boolean;
}

/**
 * Implementierung eines ONNX-Transformer-Modells
 */
export class ONNXTransformerModel implements TransformerModel {
  private sessionObj: any = null;
  private vocabulary: Vocabulary | null = null;
  private bpeMerges: BPEMerges | null = null;
  private initialized: boolean = false;
  public type: 'transformer' = 'transformer';
  public modelId: string;
  public metadata: ModelMetadata;
  public instance: any; // Implementiert die erforderliche instance-Eigenschaft des AIModel-Interfaces
  public config: TransformerConfig; // Geändert von private zu public
  
  constructor(config: TransformerConfig) {
    // Ensure all required properties have default values
    this.config = {
      modelId: config.modelId,
      language: config.language,
      dimension: config.dimension || 384, // Default dimension if not provided
      modelPath: config.modelPath,
      tokenizerPath: config.tokenizerPath,
      vocabPath: config.vocabPath,
      maxSequenceLength: config.maxSequenceLength || 128, // Default if not provided
      doLowerCase: config.doLowerCase !== undefined ? config.doLowerCase : true,
      paddingToken: config.paddingToken || '[PAD]',
      unknownToken: config.unknownToken || '[UNK]',
      description: config.description,
      version: config.version,
      parameters: config.parameters
    };
    
    this.modelId = this.config.modelId;
    
    // Erstelle Metadaten für das Modell
    this.metadata = {
      modelId: this.config.modelId,
      type: 'transformer',
      language: this.config.language,
      version: this.config.version || '1.0',
      lastAccessed: Date.now(),
      size: 0,  // Wird nach dem Laden aktualisiert
      parameters: this.config.parameters,
      framework: 'onnx',
      description: this.config.description || `ONNX ${this.config.modelId} Transformer-Modell`,
      path: this.config.modelPath,
      cached: true
    };
    
    // Initialisiere instance als null - wird bei initialize() gesetzt
    this.instance = null;
  }
  
  /**
   * Initialisiert das Transformer-Modell
   */
  async initialize(): Promise<boolean> {
    try {
      // Prüfe, ob das Modell existiert
      if (!(await fileSystem.exists(this.config.modelPath))) {
        console.error(`[ONNXTransformerModel] Modelldatei nicht gefunden: ${this.config.modelPath}`);
        return false;
      }
      
      // Lade das ONNX-Modell
      console.log(`[ONNXTransformerModel] Lade Modell: ${this.config.modelPath}`);
      
      try {
        // Verwende ort.InferenceSession.create direkt
        this.sessionObj = await ort.InferenceSession.create(this.config.modelPath);
      } catch (error) {
        console.error(`[ONNXTransformerModel] Fehler beim Erstellen der InferenceSession: ${error}`);
        return false;
      }
      
      // Setze instance auf die Session für AIModel-Kompatibilität
      this.instance = this.sessionObj;
      
      // Aktualisiere Metadaten mit der Dateigröße
      try {
        const stats = fileSystem.statSync(this.config.modelPath);
        this.metadata.size = stats.size;
      } catch (statsError) {
        console.warn(`[ONNXTransformerModel] Konnte Modelldateigröße nicht ermitteln:`, statsError);
      }
      
      // Lade Vokabular, falls ein Pfad angegeben ist
      if (this.config.vocabPath && await fileSystem.exists(this.config.vocabPath)) {
        try {
          const vocabString = await fileSystem.readFile(this.config.vocabPath);
          const vocabData = JSON.parse(vocabString);
          
          // Basiskonstruktion des Vokabulars
          this.vocabulary = {
            token2idx: vocabData.token2idx || vocabData.vocab || {},
            idx2token: {},
            specialTokens: {
              padding: this.config.paddingToken || '[PAD]',
              unknown: this.config.unknownToken || '[UNK]',
              cls: '[CLS]',
              sep: '[SEP]'
            }
          };
          
          // Erstelle inverse Mapping (idx -> token)
          for (const [token, idx] of Object.entries(this.vocabulary.token2idx)) {
            if (this.vocabulary && idx !== undefined) {
              this.vocabulary.idx2token[String(idx)] = token;
            }
          }
          
          if (this.vocabulary) {
            console.log(`[ONNXTransformerModel] Vokabular geladen mit ${Object.keys(this.vocabulary.token2idx).length} Tokens`);
          }
        } catch (vocabError) {
          console.error(`[ONNXTransformerModel] Fehler beim Laden des Vokabulars:`, vocabError);
        }
      }
      
      // Lade BPE-Merges, falls ein Tokenizer-Pfad angegeben ist
      if (this.config.tokenizerPath && await fileSystem.exists(this.config.tokenizerPath)) {
        try {
          const tokenizerString = await fileSystem.readFile(this.config.tokenizerPath);
          const tokenizerData = JSON.parse(tokenizerString);
          if (tokenizerData.merges) {
            this.bpeMerges = {
              merges: tokenizerData.merges.map((merge: string) => merge.split(' '))
            };
            console.log(`[ONNXTransformerModel] BPE-Merges geladen mit ${this.bpeMerges.merges.length} Einträgen`);
          }
        } catch (tokenizerError) {
          console.error(`[ONNXTransformerModel] Fehler beim Laden des Tokenizers:`, tokenizerError);
        }
      }
      
      this.initialized = true;
      console.log(`[ONNXTransformerModel] Modell ${this.config.modelId} erfolgreich initialisiert`);
      return true;
    } catch (error) {
      console.error(`[ONNXTransformerModel] Fehler bei der Initialisierung:`, error);
      return false;
    }
  }
  
  /**
   * Tokensiert einen Text in Token-IDs
   * Falls ein eigenes Vokabular geladen wurde, wird dieses verwendet
   * Ansonsten wird der einfache Tokenizer aus dem Projekt verwendet
   */
  async tokenize(text: string): Promise<number[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Vorverarbeitung
      const processedText = this.config.doLowerCase ? text.toLowerCase() : text;
      
      // Wenn wir ein eigenes Vokabular haben, verwenden wir es für die Tokenisierung
      if (this.vocabulary) {
        // Teile den Text in Tokens auf
        // Dies ist eine sehr einfache Implementierung, die für komplexe Tokenisierungsschemen
        // wie BPE oder WordPiece ersetzt werden sollte
        
        // Tokenisiere mit Projektfunktion - ersetze deprecated tokenize mit basicTokenize
        const tokens = basicTokenize(processedText, { 
          toLowerCase: this.config.doLowerCase,
          preservePunctuation: true
        } as ExtendedTokenizerOptions);
        
        // Konvertiere Tokens zu Token-IDs mit Vokabular
        const tokenIds: number[] = [];
        for (const token of tokens) {
          // Schaue nach, ob Token im Vokabular ist
          if (token in this.vocabulary.token2idx) {
            const tokenId = this.vocabulary.token2idx[token];
            if (tokenId !== undefined) {
              tokenIds.push(tokenId);
            }
          } else {
            // Unbekannter Token
            const unknownToken = this.vocabulary.specialTokens.unknown;
            const unknownId = this.vocabulary.token2idx[unknownToken];
            tokenIds.push(unknownId !== undefined ? unknownId : 0);
          }
        }
        
        // Füge CLS und SEP Token hinzu (BERT-Stil)
        const clsToken = this.vocabulary.specialTokens.cls;
        const sepToken = this.vocabulary.specialTokens.sep;
        
        const clsId = clsToken && this.vocabulary.token2idx[clsToken] !== undefined 
          ? this.vocabulary.token2idx[clsToken] : 101;
          
        const sepId = sepToken && this.vocabulary.token2idx[sepToken] !== undefined 
          ? this.vocabulary.token2idx[sepToken] : 102;
        
        return [clsId, ...tokenIds, sepId];
      }
      
      // Fallback: Verwende den Projekttoken tokenizer und mappe direkt zu Zahlen
      const tokens = basicTokenize(processedText, { 
        toLowerCase: this.config.doLowerCase,
        preservePunctuation: true
      });
      
      // Einfache Heuristik zur Konvertierung von Tokens zu IDs
      // Dies ist nur ein Fallback und sollte durch eine echte Tokenisierung ersetzt werden
      const tokenIds = tokens.map((token: string) => {
        // Einfache Hash-Funktion
        return (token.split('').reduce((acc: number, char: string) => 
          acc + char.charCodeAt(0), 0) % 30000) + 1;
      });
      
      return [1, ...tokenIds, 2]; // 1=CLS, 2=SEP als Fallback-IDs
    } catch (error) {
      console.error(`[ONNXTransformerModel] Tokenisierungsfehler:`, error);
      return []; // Leere Token-Liste im Fehlerfall
    }
  }
  
  /**
   * Erzeugt einen Tensor für die Aufmerksamkeitsmaske
   */
  private createAttentionMask(inputIds: number[]): number[] {
    // Default paddingId
    let paddingId = 0;
    
    // Versuche, die Padding-ID aus dem Vokabular zu bekommen
    if (this.vocabulary && this.vocabulary.specialTokens && this.vocabulary.token2idx) {
      const paddingToken = this.vocabulary.specialTokens.padding;
      if (paddingToken && paddingToken in this.vocabulary.token2idx) {
        const id = this.vocabulary.token2idx[paddingToken];
        if (id !== undefined) {
          paddingId = id;
        }
      }
    }
    
    return inputIds.map(id => id === paddingId ? 0 : 1);
  }
  
  /**
   * Bereitet die Eingabe für das ONNX-Modell vor
   */
  private prepareInput(
    inputIds: number[]
  ): { inputIds: any, attentionMask: any } {
    // Truncate oder Padding für maximale Sequenzlänge
    const maxLength = this.config.maxSequenceLength;
    let truncatedIds = inputIds.slice(0, maxLength);
    
    // Padding falls nötig
    // Default paddingId
    let paddingId = 0;
    
    // Versuche, die Padding-ID aus dem Vokabular zu bekommen
    if (this.vocabulary && this.vocabulary.specialTokens && this.vocabulary.token2idx) {
      const paddingToken = this.vocabulary.specialTokens.padding;
      if (paddingToken && paddingToken in this.vocabulary.token2idx) {
        const id = this.vocabulary.token2idx[paddingToken];
        if (id !== undefined) {
          paddingId = id;
        }
      }
    }
    
    while (truncatedIds.length < maxLength) {
      truncatedIds.push(paddingId);
    }
    
    // Erzeuge Aufmerksamkeitsmaske
    const attentionMask = this.createAttentionMask(truncatedIds);
    
    // Ensure ort is available
    if (!ort || !ort.Tensor) {
      console.error("[ONNXTransformerModel] ONNX Runtime not initialized");
      throw new Error("ONNX Runtime not initialized");
    }
    
    // Erzeuge Tensoren
    return {
      inputIds: new ort.Tensor('int64', BigInt64Array.from(truncatedIds.map(id => BigInt(id))), [1, truncatedIds.length]),
      attentionMask: new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(id => BigInt(id))), [1, attentionMask.length])
    };
  }
  
  /**
   * Generiert Embeddings für einen gegebenen Text
   */
  async generateEmbedding(text: string): Promise<Embedding> {
    if (!this.initialized || !this.sessionObj) {
      const success = await this.initialize();
      if (!success || !this.sessionObj) {
        console.error(`[ONNXTransformerModel] Modell ${this.config.modelId} konnte nicht initialisiert werden`);
        return this.createFallbackEmbedding();
      }
    }
    
    try {
      // Tokenize text to token IDs
      const tokenIds = await this.tokenize(text);
      if (!tokenIds || tokenIds.length === 0) {
        console.warn("[ONNXTransformerModel] Tokenisierung lieferte keine Tokens");
        return this.createFallbackEmbedding();
      }
      
      // Prepare input tensors
      const { inputIds, attentionMask } = this.prepareInput(tokenIds);
      
      // Create input feeds
      const feeds: Record<string, any> = {
        'input_ids': inputIds,
        'attention_mask': attentionMask
      };
      
      // Run inference
      let outputMap;
      try {
        outputMap = await this.sessionObj.run(feeds);
      } catch (error) {
        console.error(`[ONNXTransformerModel] Fehler bei der Modell-Inferenz: ${error}`);
        return this.createFallbackEmbedding();
      }
      
      // Get output embedding
      // Suche nach dem Ausgabetensor - Namen können je nach Modell variieren
      const possibleOutputNames = ['embeddings', 'last_hidden_state', 'sentence_embedding', 'pooler_output'];
      let outputTensor: any = null;
      
      for (const name of possibleOutputNames) {
        if (outputMap && name in outputMap) {
          outputTensor = outputMap[name];
          break;
        }
      }
      
      if (!outputTensor && outputMap) {
        // Nimm den ersten verfügbaren Tensor
        const outputKeys = Object.keys(outputMap);
        if (outputKeys.length > 0) {
          const firstOutputName = outputKeys[0];
          if (firstOutputName && typeof firstOutputName === 'string') {
            outputTensor = outputMap[firstOutputName];
          }
        }
      }
      
      if (!outputTensor) {
        console.error("[ONNXTransformerModel] Keine Ausgabetensoren gefunden");
        return this.createFallbackEmbedding();
      }
      
      // Abhängig von der Form des Ausgabetensors, extrahiere das Embedding
      const dimension = this.config.dimension;
      let vectorData: number[] = Array(dimension).fill(0);
      
      if (outputTensor.dims && outputTensor.data) {
        if (outputTensor.dims.length === 3) {
          // Shape [batch_size, sequence_length, hidden_size]
          const limit = Math.min(dimension, outputTensor.data.length);
          for (let i = 0; i < limit; i++) {
            vectorData[i] = Number(outputTensor.data[i]);
          }
        } else if (outputTensor.dims.length === 2) {
          // Shape [batch_size, hidden_size]
          const limit = Math.min(dimension, outputTensor.data.length);
          for (let i = 0; i < limit; i++) {
            vectorData[i] = Number(outputTensor.data[i]);
          }
        } else {
          console.error(`[ONNXTransformerModel] Unerwartete Ausgabeform: ${outputTensor.dims.join('x')}`);
          return this.createFallbackEmbedding();
        }
      } else {
        console.error("[ONNXTransformerModel] Ausgabetensor hat keine gültigen Daten oder Dimensionen");
        return this.createFallbackEmbedding();
      }
      
      return {
        vector: vectorData,
        dimension
      };
    } catch (error) {
      console.error(`[ONNXTransformerModel] Embedding-Fehler:`, error);
      return this.createFallbackEmbedding();
    }
  }
  
  /**
   * Erzeugt ein Fallback-Embedding mit zufälligen Werten
   */
  private createFallbackEmbedding(): Embedding {
    const dimension = this.config.dimension;
    const randomVector = new Array(dimension);
    for (let i = 0; i < dimension; i++) {
      randomVector[i] = Math.random() * 2 - 1; // Werte zwischen -1 und 1
    }
    
    return {
      vector: randomVector,
      dimension
    };
  }
  
  /**
   * Vorhersagefunktion für die AIModel-Schnittstelle
   * Gibt standardmäßig ein Embedding zurück
   */
  async predict(input: string | string[]): Promise<Embedding | Embedding[]> {
    if (Array.isArray(input)) {
      // Batch-Verarbeitung
      const results: Embedding[] = [];
      for (const text of input) {
        const embedding = await this.generateEmbedding(text);
        results.push(embedding);
      }
      return results;
    }
    
    return this.generateEmbedding(input);
  }
  
  /**
   * Gibt Metadaten des Modells zurück
   */
  getInfo(): ModelMetadata {
    return this.metadata;
  }
  
  /**
   * Klassifiziert einen Text in vorgegebene Labels
   * Nutzt Cosine-Similarity zwischen Text-Embedding und Label-Embeddings
   */
  async classify(text: string, labels: string[]): Promise<{label: string, score: number}[]> {
    try {
      // Erzeuge Embedding für den Text
      const textEmbedding = await this.generateEmbedding(text);
      
      // Erzeuge Embeddings für alle Labels
      const labelEmbeddings: {label: string, embedding: Embedding}[] = [];
      for (const label of labels) {
        const embedding = await this.generateEmbedding(label);
        labelEmbeddings.push({label, embedding});
      }
      
      // Berechne Ähnlichkeiten
      const similarities: {label: string, score: number}[] = [];
      for (const labelData of labelEmbeddings) {
        const similarity = this.cosineSimilarity(textEmbedding, labelData.embedding);
        similarities.push({
          label: labelData.label,
          score: similarity
        });
      }
      
      // Sortiere nach Ähnlichkeit (höchste zuerst)
      return similarities.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error(`[ONNXTransformerModel] Klassifizierungsfehler:`, error);
      
      // Fallback: Gleichverteilte Scores
      return labels.map(label => ({
        label,
        score: 1.0 / labels.length
      }));
    }
  }
  
  /**
   * Berechnet die Cosinus-Ähnlichkeit zwischen zwei Vektoren
   */
  private cosineSimilarity(embedding1: Embedding, embedding2: Embedding): number {
    const vec1 = embedding1.vector;
    const vec2 = embedding2.vector;
    
    if (!vec1 || !vec2 || vec1.length === 0 || vec2.length === 0) {
      return 0;
    }
    
    // Use the shorter length
    const len = Math.min(vec1.length, vec2.length);
    
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < len; i++) {
      const val1 = vec1[i] || 0;
      const val2 = vec2[i] || 0;
      
      dotProduct += val1 * val2;
      mag1 += val1 * val1;
      mag2 += val2 * val2;
    }
    
    const magnitude1 = Math.sqrt(mag1);
    const magnitude2 = Math.sqrt(mag2);
    
    // Avoid division by zero
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }
    
    return dotProduct / (magnitude1 * magnitude2);
  }
  
  /**
   * Berechnet die Ähnlichkeit zwischen zwei Embeddings
   */
  similarity(embedding1: Embedding, embedding2: Embedding): number {
    return this.cosineSimilarity(embedding1, embedding2);
  }
  
  /**
   * Gibt Ressourcen frei
   */
  async dispose(): Promise<void> {
    try {
      if (this.sessionObj && typeof this.sessionObj.release === 'function') {
        await this.sessionObj.release();
        this.sessionObj = null;
        this.instance = null;
      }
      
      this.initialized = false;
      console.log(`[ONNXTransformerModel] Modell ${this.config.modelId} freigegeben`);
    } catch (error) {
      console.error(`[ONNXTransformerModel] Fehler bei der Ressourcenfreigabe:`, error);
    }
  }
  
  /**
   * Prüft, ob Modell initialisiert ist
   */
  isInitialized(): boolean {
    return this.initialized && this.sessionObj !== null;
  }
}

/**
 * Hilfsfunktion zum Berechnen der Ähnlichkeit zwischen zwei Embeddings
 */
export function calculateEmbeddingSimilarity(embedding1: Embedding, embedding2: Embedding): number {
  const vec1 = embedding1.vector;
  const vec2 = embedding2.vector;
  
  if (!vec1 || !vec2 || vec1.length === 0 || vec2.length === 0) {
    return 0;
  }
  
  // Use the shorter length
  const len = Math.min(vec1.length, vec2.length);
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < len; i++) {
    const val1 = vec1[i] || 0;
    const val2 = vec2[i] || 0;
    
    dotProduct += val1 * val2;
    mag1 += val1 * val1;
    mag2 += val2 * val2;
  }
  
  const magnitude1 = Math.sqrt(mag1);
  const magnitude2 = Math.sqrt(mag2);
  
  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }
  
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Lädt ein Transformer-Modell und registriert es im ModelRegistry
 */
export async function loadTransformerModel(
  modelId: string = 'minilm-l6',
  language: Language = 'de',
  customConfig?: Partial<TransformerConfig>
): Promise<TransformerModel> {
  try {
    console.log(`[transformerLoader] Lade Transformer-Modell: ${modelId} (${language})`);
    
    // Prüfe, ob das Modell bereits im Registry ist
    const existingModel = modelRegistry.getTransformerModel ? modelRegistry.getTransformerModel(modelId, language) : null;
    if (existingModel) {
      console.log(`[transformerLoader] Modell ${modelId} bereits geladen, verwende gecachte Version`);
      return existingModel;
    }
    
    // Hole Basiskonfiguration für das Modell oder verwende Empty Object
    const baseConfig = TRANSFORMER_CONFIGS[modelId] || {};
    
    // Bestimme Modellpfad
    const aiBasePath = config.ai?.modelBasePath || 'data/models';
    const regPath = modelRegistry.getModelPath ? modelRegistry.getModelPath('transformer') : null;
    const modelDirPath = regPath || `${aiBasePath}/transformer`;
    
    // Baue vollständige Konfiguration mit sicheren Defaults
    const modelConfig: TransformerConfig = {
      modelId,
      language,
      dimension: baseConfig.dimension !== undefined ? baseConfig.dimension : 
                (customConfig?.dimension !== undefined ? customConfig.dimension : 384),
      modelPath: `${modelDirPath}/${modelId}_${language}.onnx`,
      tokenizerPath: `${modelDirPath}/${modelId}_tokenizer.json`,
      vocabPath: `${modelDirPath}/${modelId}_vocab.json`,
      maxSequenceLength: baseConfig.maxSequenceLength !== undefined ? baseConfig.maxSequenceLength : 
                         (customConfig?.maxSequenceLength !== undefined ? customConfig.maxSequenceLength : 128),
      doLowerCase: baseConfig.doLowerCase !== undefined ? baseConfig.doLowerCase : 
                  (customConfig?.doLowerCase !== undefined ? customConfig.doLowerCase : true),
      paddingToken: baseConfig.paddingToken || customConfig?.paddingToken || '[PAD]',
      unknownToken: baseConfig.unknownToken || customConfig?.unknownToken || '[UNK]',
      description: baseConfig.description || customConfig?.description,
      version: baseConfig.version || customConfig?.version,
      parameters: baseConfig.parameters || customConfig?.parameters
    };
    
    // Prüfe, ob Modelldatei existiert
    if (!(await fileSystem.exists(modelConfig.modelPath))) {
      console.error(`[transformerLoader] Modelldatei nicht gefunden: ${modelConfig.modelPath}`);
      // Erstelle trotzdem ein Modell mit Fallback-Funktionalität
      const model = new ONNXTransformerModel(modelConfig);
      if (modelRegistry.registerModel) {
        modelRegistry.registerModel(model);
      }
      return model;
    }
    
    // Erstelle und initialisiere das Modell
    const model = new ONNXTransformerModel(modelConfig);
    const success = await model.initialize();
    
    if (!success) {
      console.error(`[transformerLoader] Initialisierung von ${modelId} fehlgeschlagen`);
    }
    
    // Registriere das Modell im Registry
    if (modelRegistry.registerModel) {
      modelRegistry.registerModel(model);
    }
    
    console.log(`[transformerLoader] Transformer-Modell ${modelId} erfolgreich geladen und registriert`);
    return model;
  } catch (error) {
    console.error(`[transformerLoader] Fehler beim Laden des Transformer-Modells ${modelId}:`, error);
    
    // Fallback: Erstelle ein minimales Modell
    const fallbackConfig: TransformerConfig = {
      modelId,
      language,
      dimension: 384,
      modelPath: `data/models/transformer/${modelId}_${language}.onnx`,
      maxSequenceLength: 128,
      doLowerCase: true,
      paddingToken: '[PAD]',
      unknownToken: '[UNK]'
    };
    
    const model = new ONNXTransformerModel(fallbackConfig);
    return model;
  }
}

/**
 * Gibt alle Text-Embeddings für ein Modell zurück
 */
export async function generateEmbeddings(
  texts: string[],
  modelId: string = 'minilm-l6', 
  language: Language = 'de'
): Promise<Embedding[]> {
  try {
    // Lade das Modell
    const model = await loadTransformerModel(modelId, language);
    
    // Generiere Embeddings für alle Texte
    const embeddings: Embedding[] = [];
    
    for (const text of texts) {
      const embedding = await model.generateEmbedding(text);
      embeddings.push(embedding);
    }
    
    return embeddings;
  } catch (error) {
    console.error(`[transformerLoader] Fehler beim Generieren von Embeddings:`, error);
    
    // Fallback: Leere Embeddings mit richtiger Dimension
    const dimension = TRANSFORMER_CONFIGS[modelId]?.dimension || 384;
    return texts.map(() => ({
      vector: Array(dimension).fill(0),
      dimension
    }));
  }
}

/**
 * Berechnet die semantische Ähnlichkeit zwischen zwei Texten
 */
export async function calculateSimilarity(
  text1: string,
  text2: string,
  modelId: string = 'minilm-l6',
  language: Language = 'de'
): Promise<number> {
  try {
    // Lade das Modell
    const model = await loadTransformerModel(modelId, language);
    
    // Generiere Embeddings
    const embedding1 = await model.generateEmbedding(text1);
    const embedding2 = await model.generateEmbedding(text2);
    
    // Berechne Ähnlichkeit mit der Hilfsfunktion
    return calculateEmbeddingSimilarity(embedding1, embedding2);
  } catch (error) {
    console.error(`[transformerLoader] Fehler bei der Ähnlichkeitsberechnung:`, error);
    return 0;
  }
}

/**
 * Findet die ähnlichsten Texte zu einem Abfragetext
 */
export async function findSimilarTexts(
  queryText: string,
  candidates: string[],
  modelId: string = 'minilm-l6',
  language: Language = 'de',
  topK: number = 5
): Promise<Array<{text: string, similarity: number}>> {
  try {
    // Lade das Modell
    const model = await loadTransformerModel(modelId, language);
    
    // Generiere Embedding für die Abfrage
    const queryEmbedding = await model.generateEmbedding(queryText);
    
    // Generiere Embeddings für alle Kandidaten und berechne Ähnlichkeiten
    const similarities: Array<{text: string, similarity: number}> = [];
    
    for (const candidate of candidates) {
      const candidateEmbedding = await model.generateEmbedding(candidate);
      const similarity = calculateEmbeddingSimilarity(queryEmbedding, candidateEmbedding);
      
      similarities.push({
        text: candidate,
        similarity
      });
    }
    
    // Sortiere nach Ähnlichkeit (höchste zuerst) und beschränke auf topK
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK);
  } catch (error) {
    console.error(`[transformerLoader] Fehler beim Finden ähnlicher Texte:`, error);
    return [];
  }
}

// Exportiere das Modul
export default {
  loadTransformerModel,
  generateEmbeddings,
  calculateSimilarity,
  findSimilarTexts,
  ONNXTransformerModel,
  calculateEmbeddingSimilarity
};