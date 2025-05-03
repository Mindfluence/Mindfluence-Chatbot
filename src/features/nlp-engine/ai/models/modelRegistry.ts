/**
 * modelRegistry.ts
 * Ein erweitertes Modell-Registry-System für KI-Modelle im Mindfluence Chatbot
 * 
 * Dieses Modul ermöglicht die Verwaltung, Registrierung und den Zugriff auf verschiedene
 * KI-Modelle (NLP, Embeddings, Transformer) über eine einheitliche Schnittstelle.
 */

import type { NLPModel, Language, ModelType, NLPEngineConfig } from '@/types/nlp.types';
import { config } from '@/features/nlp-engine/config';
import fs from 'fs';
import path from 'path';

// Erweiterte Modeltypen für AI-Integration
export type AIModelType = ModelType | 'embedding' | 'transformer' | 'classifier';

// Interface für registrierte Modellmetadaten
export interface ModelMetadata {
  modelId: string;
  type: AIModelType;
  language?: Language;
  version?: string;
  lastAccessed: number;
  size?: number;
  parameters?: number;
  framework: 'onnx' | 'tf' | 'custom' | 'rule-based';
  description?: string;
  path?: string;
  cached: boolean;
  // Zusätzliche Eigenschaften für modelOptimizer.ts und loadModel.ts
  pruned?: boolean;
  quantized?: boolean;
  distilled?: boolean;
  hyperparameterTuned?: boolean;
  isEnsemble?: boolean;
  earlyStoppingApplied?: boolean;
  parameterSharingApplied?: boolean;
  knowledgeDistilled?: boolean;
  pruningThreshold?: number;
  quantizationBits?: number;
  ensembleSize?: number;
  createdAt?: string;
}

// Interface für ein AI Modell, das alle Modelltypen umfasst
export interface AIModel {
  type: AIModelType;
  modelId: string;
  metadata: ModelMetadata;
  instance: any;  // ONNX Session, Transformer, Vector-Storage, etc.
  config?: any;   // Benötigt für modelOptimizer.ts
  
  // Grundfunktionen, die alle Modelle implementieren sollten
  predict: (...args: any[]) => Promise<any>;
  getInfo: () => ModelMetadata;
  
  // Optional: Methode zum Freigeben von Ressourcen
  dispose?: () => Promise<void>;
}

// Interface für einen Embedding-Vektor
export interface Embedding {
  vector: number[];
  dimension: number;
}

// Interface für das Embedding-Modell
export interface EmbeddingModel extends AIModel {
  embed: (text: string | string[]) => Promise<Embedding>;
  similarity: (embedding1: Embedding, embedding2: Embedding) => number;
  batchEmbed?: (texts: string[]) => Promise<Embedding[]>;
}

// Interface für ein Transformer-Modell
export interface TransformerModel extends AIModel {
  tokenize: (text: string) => Promise<number[]>;
  generateEmbedding: (text: string) => Promise<Embedding>;
  classify?: (text: string, labels: string[]) => Promise<{label: string, score: number}[]>;
}

// Transformiert einen Modelltyp und eine Sprache in einen eindeutigen Schlüssel
export function createModelKey(
  type: AIModelType, 
  modelId: string, 
  language?: Language
): string {
  return language ? `${type}_${modelId}_${language}` : `${type}_${modelId}`;
}

/**
 * Die erweiterte ModelRegistry-Klasse zum Verwalten aller KI-Modelle
 */
class ModelRegistry {
  private models: Map<string, AIModel> = new Map();
  private metadata: Map<string, ModelMetadata> = new Map();
  private modelPaths: Map<string, string> = new Map();
  
  // Maximale Anzahl von Modellen im Cache
  private maxCacheSize: number = config.ai?.maxModelCacheSize || 10;
  
  // Modelldurchlaufzeit bevor Entfernung aus Cache (ms)
  private cacheExpiry: number = config.ai?.modelCacheExpiry || 30 * 60 * 1000; // 30 Minuten
  
  constructor() {
    console.log('[ModelRegistry] Initialisierung...');
    
    // Cache-Bereinigung in regelmäßigen Intervallen
    if (config.ai?.enableAutoCacheCleanup !== false) {
      const cleanupInterval = config.ai?.cacheCleanupInterval || 10 * 60 * 1000; // 10 Minuten
      setInterval(() => this.cleanupCache(), cleanupInterval);
    }
    
    // Modell-Verzeichnisse initialisieren
    this.initializeModelDirectories();
  }
  
  /**
   * Initialisiert die Verzeichnisse für die Modelle, falls noch nicht vorhanden
   */
  private initializeModelDirectories(): void {
    try {
      const baseModelDir = config.ai?.modelBasePath || 'data/models';
      
      // Stelle sicher, dass das Basisverzeichnis existiert
      if (!fs.existsSync(baseModelDir)) {
        fs.mkdirSync(baseModelDir, { recursive: true });
      }
      
      // Erstelle Unterverzeichnisse für verschiedene Modelltypen
      const modelTypes = ['embedding', 'transformer', 'classifier', 'intent', 'entity', 'context'];
      for (const type of modelTypes) {
        const typeDir = path.join(baseModelDir, type);
        if (!fs.existsSync(typeDir)) {
          fs.mkdirSync(typeDir, { recursive: true });
        }
        
        // Registriere den Pfad in der modelPaths-Map
        this.modelPaths.set(type, typeDir);
      }
      
      console.log('[ModelRegistry] Modellverzeichnisse initialisiert');
    } catch (error) {
      console.error('[ModelRegistry] Fehler beim Initialisieren der Modellverzeichnisse:', error);
    }
  }
  
  /**
   * Registriert ein neues KI-Modell im Registry
   */
  registerModel<T extends AIModel>(model: T): boolean {
    try {
      if (!model || !model.modelId || !model.type) {
        console.error('[ModelRegistry] Ungültiges Modell für Registrierung');
        return false;
      }
      
      // Erstelle einen eindeutigen Schlüssel für das Modell
      const key = createModelKey(
        model.type, 
        model.modelId, 
        model.metadata.language
      );
      
      // Aktualisiere den letzten Zugriffszeitstempel
      model.metadata.lastAccessed = Date.now();
      
      // Speichere Modell und Metadaten
      this.models.set(key, model);
      this.metadata.set(key, model.metadata);
      
      console.log(`[ModelRegistry] Modell registriert: ${key}`);
      
      // Bereinige Cache, wenn er zu groß wird
      if (this.models.size > this.maxCacheSize) {
        this.cleanupCache();
      }
      
      return true;
    } catch (error) {
      console.error('[ModelRegistry] Fehler bei der Modellregistrierung:', error);
      return false;
    }
  }
  
  /**
   * Ruft ein Modell aus dem Registry ab
   */
  getModel<T extends AIModel>(
    type: AIModelType, 
    modelId: string, 
    language?: Language
  ): T | null {
    try {
      const key = createModelKey(type, modelId, language);
      
      if (!this.models.has(key)) {
        console.log(`[ModelRegistry] Modell ${key} nicht im Registry gefunden`);
        return null;
      }
      
      // Aktualisiere den letzten Zugriffszeitstempel
      const metadata = this.metadata.get(key);
      if (metadata) {
        metadata.lastAccessed = Date.now();
        this.metadata.set(key, metadata);
      }
      
      // Gib das Modell zurück mit dem korrekten Typ
      return this.models.get(key) as T;
    } catch (error) {
      console.error('[ModelRegistry] Fehler beim Modellabruf:', error);
      return null;
    }
  }
  
  /**
   * Gibt das Embedding-Modell für eine bestimmte Sprache zurück
   */
  getEmbeddingModel(modelId: string = 'default', language: Language = 'de'): EmbeddingModel | null {
    return this.getModel<EmbeddingModel>('embedding', modelId, language);
  }
  
  /**
   * Gibt das Transformer-Modell für eine bestimmte Sprache zurück
   */
  getTransformerModel(modelId: string = 'default', language: Language = 'de'): TransformerModel | null {
    return this.getModel<TransformerModel>('transformer', modelId, language);
  }
  
  /**
   * Gibt ein NLP-Modell zurück
   */
  getNLPModel(type: ModelType, language: Language = 'de'): NLPModel | null {
    return this.getModel<NLPModel>(type, 'default', language);
  }
  
  /**
   * Bereinigt den Cache basierend auf letztem Zugriff
   */
  private cleanupCache(): void {
    if (this.models.size <= this.maxCacheSize / 2) {
      // Cache ist noch nicht groß genug für Bereinigung
      return;
    }
    
    console.log(`[ModelRegistry] Cache-Bereinigung gestartet (Aktuelle Größe: ${this.models.size})`);
    
    // Sammle alle Modellmetadaten mit ihren Schlüsseln
    const metadataEntries: [string, ModelMetadata][] = [];
    this.metadata.forEach((metadata, key) => {
      metadataEntries.push([key, metadata]);
    });
    
    // Sortiere nach letztem Zugriff (älteste zuerst)
    metadataEntries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Entferne die ältesten Modelle, bis wir unter dem Limit sind
    const currentTime = Date.now();
    let removedCount = 0;
    
    // Entferne zuerst abgelaufene Modelle
    for (const [key, metadata] of metadataEntries) {
      // Überspringe Modelle, die als nicht gecached markiert sind
      if (!metadata.cached) continue;
      
      // Prüfe, ob das Modell abgelaufen ist
      if (currentTime - metadata.lastAccessed > this.cacheExpiry) {
        this.releaseModel(key).catch(err => {
          console.error(`[ModelRegistry] Fehler beim Freigeben des abgelaufenen Modells ${key}:`, err);
        });
        removedCount++;
      }
    }
    
    // Wenn der Cache immer noch zu groß ist, entferne weitere Modelle
    if (this.models.size > this.maxCacheSize) {
      // Sortiere erneut, falls sich etwas geändert hat
      const remainingEntries = [...this.metadata.entries()]
        .filter(([key, metadata]) => metadata.cached)
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
      
      // Entferne die ältesten Modelle, bis wir unter dem Limit sind
      const modelsToRemove = Math.max(0, this.models.size - this.maxCacheSize / 2);
      for (let i = 0; i < modelsToRemove && i < remainingEntries.length; i++) {
        const key = remainingEntries[i]?.[0];
        if (key) {
          this.releaseModel(key).catch(err => {
            console.error(`[ModelRegistry] Fehler beim Freigeben des Modells ${key} während Cache-Bereinigung:`, err);
          });
          removedCount++;
        }
      }
    }
    
    console.log(`[ModelRegistry] Cache-Bereinigung abgeschlossen. ${removedCount} Modelle entfernt`);
  }
  
  /**
   * Gibt Ressourcen eines Modells frei und entfernt es aus dem Cache
   */
  private async releaseModel(key: string): Promise<void> {
    try {
      const model = this.models.get(key);
      
      if (!model) return;
      
      // Prüfe, ob das Modell eine dispose-Methode hat
      if (model.dispose && typeof model.dispose === 'function') {
        try {
          // Rufe die dispose-Methode des Modells auf
          await model.dispose();
          console.log(`[ModelRegistry] Modell-Ressourcen freigegeben für: ${key}`);
        } catch (disposeError) {
          console.warn(`[ModelRegistry] Fehler beim Aufrufen der dispose-Methode für Modell ${key}:`, disposeError);
        }
      } else {
        console.log(`[ModelRegistry] Keine dispose-Methode gefunden für Modell ${key}`);
      }
      
      // Entferne Modell aus der Map
      this.models.delete(key);
      
      // Behalte die Metadaten, markiere aber als nicht gecached
      const metadata = this.metadata.get(key);
      if (metadata) {
        metadata.cached = false;
        this.metadata.set(key, metadata);
      }
      
      console.log(`[ModelRegistry] Modell aus Registry entfernt: ${key}`);
    } catch (error) {
      console.error(`[ModelRegistry] Fehler beim Freigeben des Modells ${key}:`, error);
    }
  }
  
  /**
   * Gibt alle registrierten Modelle zurück
   */
  getAllModelMetadata(): ModelMetadata[] {
    return Array.from(this.metadata.values());
  }
  
  /**
   * Gibt den Pfad für einen Modelltyp zurück
   */
  getModelPath(type: AIModelType): string | null {
    return this.modelPaths.get(type as string) || null;
  }
  
  /**
   * Setzt das Registry zurück und gibt alle Ressourcen frei
   */
  async reset(): Promise<void> {
    try {
      console.log('[ModelRegistry] Setze Registry zurück...');
      
      // Sammle alle dispose-Aufrufe als Promises
      const disposePromises: Promise<void>[] = [];
      
      // Gib alle Modell-Ressourcen frei
      for (const [key, model] of this.models.entries()) {
        if (model.dispose && typeof model.dispose === 'function') {
          try {
            // Füge das Promise zur Liste hinzu
            disposePromises.push(
              model.dispose().catch(err => {
                console.warn(`[ModelRegistry] Fehler beim Freigeben des Modells ${key} während Reset:`, err);
              })
            );
          } catch (disposeError) {
            console.warn(`[ModelRegistry] Fehler beim Erstellen des dispose-Promises für Modell ${key}:`, disposeError);
          }
        }
      }
      
      // Warte auf den Abschluss aller dispose-Aufrufe
      if (disposePromises.length > 0) {
        await Promise.allSettled(disposePromises);
        console.log(`[ModelRegistry] ${disposePromises.length} Modelle freigegeben`);
      }
      
      // Leere alle Collections
      this.models.clear();
      this.metadata.clear();
      
      console.log('[ModelRegistry] Registry zurückgesetzt');
    } catch (error) {
      console.error('[ModelRegistry] Fehler beim Zurücksetzen des Registry:', error);
    }
  }
  
  /**
   * Prüft, ob ein bestimmtes Modell im Registry verfügbar ist
   */
  hasModel(type: AIModelType, modelId: string, language?: Language): boolean {
    const key = createModelKey(type, modelId, language);
    return this.models.has(key);
  }
  
  /**
   * Entfernt ein Modell aus dem Registry
   */
  async unregisterModel(type: AIModelType, modelId: string, language?: Language): Promise<boolean> {
    try {
      const key = createModelKey(type, modelId, language);
      
      if (!this.models.has(key)) {
        console.log(`[ModelRegistry] Modell ${key} nicht gefunden für Deregistrierung`);
        return false;
      }
      
      // Gib Ressourcen frei und entferne aus dem Registry
      await this.releaseModel(key);
      
      // Entferne auch Metadaten
      this.metadata.delete(key);
      
      console.log(`[ModelRegistry] Modell deregistriert: ${key}`);
      return true;
    } catch (error) {
      console.error('[ModelRegistry] Fehler bei der Modellderegistrierung:', error);
      return false;
    }
  }
}

// Singleton-Instanz des ModelRegistry
export const modelRegistry = new ModelRegistry();

// Export des Moduls
export default modelRegistry;