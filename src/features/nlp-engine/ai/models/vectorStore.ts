// src/features/nlp-engine/ai/models/vectorStore.ts

import fs from 'fs';
import path from 'path';
import { config } from '@/features/nlp-engine/config';

// Erweiterte VectorResult-Typdefinition für präzisere Typisierung
interface VectorResult {
  vector: Float32Array;
  metadata: Record<string, any>;
}

// Interface für die Konfiguration eines Vektorindex
export interface IndexConfig {
  dimension: number;
  metric: 'cosine' | 'euclidean' | 'dot';
  useHnsw?: boolean;
  efConstruction?: number;
  M?: number;
}

// Interface für Suchergebnisse
export interface SearchResult {
  id: string;
  score: number;
  vector: Float32Array;
  metadata: any;
}

/**
 * Metadata interface for stored vectors
 */
export interface VectorMetadata {
  id: string;
  text: string;
  timestamp: number;
  intentName?: string; 
  language?: string;
  source?: string;
  [key: string]: any; // Allow additional custom metadata
}

/**
 * TypeGuard zur Überprüfung, ob ein Objekt ein gültiges VectorResult ist
 */
function isValidVectorResult(obj: any): obj is VectorResult {
  return obj !== null && 
         typeof obj === 'object' && 
         'vector' in obj && 
         obj.vector instanceof Float32Array &&
         'metadata' in obj && 
         typeof obj.metadata === 'object';
}

/**
 * Class for vector storage management
 * Provides a wrapper around vector-storage library with persistent storage capabilities
 */
export class VectorStore {
  private storage: any;
  private initialized: boolean = false;
  private collections: Set<string> = new Set();
  private storePath: string;
  private dimensions: Record<string, number> = {};
  
  /**
   * Creates a new VectorStore instance
   * @param storePath Path where vector indices will be stored
   */
  constructor(storePath?: string) {
    this.storePath = storePath || path.join(process.cwd(), 'data/models/vector-indices');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const VectorStorage = require('vector-storage').VectorStorage;
    this.storage = new VectorStorage();
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(this.storePath)) {
      fs.mkdirSync(this.storePath, { recursive: true });
    }
  }
  
  /**
   * Initializes the vector store
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Check for existing collections
      const indexFiles = fs.readdirSync(this.storePath)
        .filter(file => file.endsWith('.vsi'));
      
      // Load existing collections
      for (const indexFile of indexFiles) {
        const collectionName = indexFile.replace('.vsi', '');
        const indexPath = path.join(this.storePath, indexFile);
        const configPath = path.join(this.storePath, `${collectionName}.config.json`);
        
        if (fs.existsSync(configPath)) {
          const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          await this.loadCollection(collectionName, configData.dimension);
        } else {
          console.warn(`[VectorStore] Config file not found for collection ${collectionName}`);
        }
      }
      
      this.initialized = true;
      console.log(`[VectorStore] Initialized with ${this.collections.size} collections`);
      
    } catch (error) {
      console.error('[VectorStore] Initialization error:', error);
      throw new Error(`Failed to initialize vector store: ${(error as Error).message}`);
    }
  }
  
  /**
   * Ensures the store is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  
  /**
   * Creates a new vector collection (index)
   * @param collectionName Name of the collection
   * @param dimension Vector dimension
   */
  public async createCollection(collectionName: string, dimension: number): Promise<void> {
    await this.ensureInitialized();
    
    if (this.collections.has(collectionName)) {
      console.warn(`[VectorStore] Collection ${collectionName} already exists`);
      return;
    }
    
    try {
      // Configure index
      const indexConfig: IndexConfig = {
        dimension,
        metric: 'cosine',  // Default to cosine similarity
        useHnsw: true,     // Use hierarchical navigable small worlds graph
        efConstruction: 200, // Trade-off between build time and search accuracy
        M: 16,             // Max number of connections per node in the graph
      };
      
      // Create the index
      await this.storage.createIndex(collectionName, indexConfig);
      this.collections.add(collectionName);
      this.dimensions[collectionName] = dimension;
      
      // Save config
      const configPath = path.join(this.storePath, `${collectionName}.config.json`);
      fs.writeFileSync(configPath, JSON.stringify({
        dimension,
        createdAt: new Date().toISOString(),
        metric: 'cosine',
        description: `Vector collection for ${collectionName}`,
      }));
      
      console.log(`[VectorStore] Created collection "${collectionName}" with dimension ${dimension}`);
    } catch (error) {
      console.error(`[VectorStore] Error creating collection ${collectionName}:`, error);
      throw new Error(`Failed to create collection: ${(error as Error).message}`);
    }
  }
  
  /**
   * Loads an existing collection from disk
   * @param collectionName Name of the collection
   * @param dimension Vector dimension
   */
  public async loadCollection(collectionName: string, dimension: number): Promise<void> {
    const indexPath = path.join(this.storePath, `${collectionName}.vsi`);
    
    if (!fs.existsSync(indexPath)) {
      console.warn(`[VectorStore] Index file not found: ${indexPath}`);
      return;
    }
    
    try {
      // Configure index
      const indexConfig: IndexConfig = {
        dimension,
        metric: 'cosine',
        useHnsw: true,
        efConstruction: 200,
        M: 16,
      };
      
      // Load the index
      await this.storage.loadIndex(collectionName, indexPath, indexConfig);
      this.collections.add(collectionName);
      this.dimensions[collectionName] = dimension;
      
      // Get vector count
      const count = await this.storage.getCount(collectionName);
      console.log(`[VectorStore] Loaded collection "${collectionName}" with ${count} vectors`);
      
    } catch (error) {
      console.error(`[VectorStore] Error loading collection ${collectionName}:`, error);
      throw new Error(`Failed to load collection: ${(error as Error).message}`);
    }
  }
  
  /**
   * Adds vectors to a collection
   * @param vectors Array of vectors to add
   * @param metadata Array of metadata for each vector
   * @param collectionName Name of the collection
   */
  public async addVectors(
    vectors: Float32Array[],
    metadata: VectorMetadata[],
    collectionName: string
  ): Promise<void> {
    await this.ensureInitialized();
    
    if (vectors.length !== metadata.length) {
      throw new Error('Number of vectors and metadata items must match');
    }
    
    if (vectors.length === 0) {
      console.warn('[VectorStore] No vectors to add');
      return;
    }
    
    try {
      // Create collection if it doesn't exist
      if (!this.collections.has(collectionName)) {
        // FIX: Zusätzliche Prüfung auf vectors[0]
        if (!vectors[0]) {
          throw new Error('First vector must be defined to create collection');
        }
        await this.createCollection(collectionName, vectors[0].length);
      }
      
      // Check dimension - mit sicherer Überprüfung
      const dim = this.dimensions[collectionName];
      if (dim === undefined || dim <= 0) {
        throw new Error(`Invalid dimension for collection ${collectionName}`);
      }
      
      // FIX: Zusätzliche Prüfung auf vectors[0]
      if (!vectors[0]) {
        throw new Error('First vector must be defined to check dimensions');
      }
      
      if (vectors[0].length !== dim) {
        throw new Error(`Vector dimension mismatch: expected ${dim}, got ${vectors[0].length}`);
      }
      
      // Add vectors to the index
      for (let i = 0; i < vectors.length; i++) {
        const vector = vectors[i];
        const metaItem = metadata[i];
        
        // FIX: Zusätzliche Prüfung auf null/undefined
        if (!vector || !metaItem || metaItem.id === undefined) {
          console.warn(`[VectorStore] Skipping invalid vector/metadata at index ${i}`);
          continue;
        }
        
        await this.storage.addVector(
          collectionName,
          vector,
          metaItem.id,
          metaItem
        );
      }
      
      // Save the index
      await this.saveCollection(collectionName);
      
      console.log(`[VectorStore] Added ${vectors.length} vectors to collection "${collectionName}"`);
    } catch (error) {
      console.error(`[VectorStore] Error adding vectors to ${collectionName}:`, error);
      throw new Error(`Failed to add vectors: ${(error as Error).message}`);
    }
  }
  
  /**
   * Searches for similar vectors in a collection
   * @param queryVector Query vector
   * @param collectionName Name of the collection
   * @param k Number of results to return
   */
  public async search(
    queryVector: Float32Array,
    collectionName: string,
    k: number = 5
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      // Check dimension - mit sicherer Überprüfung
      const dim = this.dimensions[collectionName];
      if (dim === undefined || dim <= 0) {
        throw new Error(`Invalid dimension for collection ${collectionName}`);
      }
      
      if (queryVector.length !== dim) {
        throw new Error(`Vector dimension mismatch: expected ${dim}, got ${queryVector.length}`);
      }
      
      // Perform the search
      const results = await this.storage.search(collectionName, queryVector, k);
      return Array.isArray(results) ? results : [];
      
    } catch (error) {
      console.error(`[VectorStore] Error searching in ${collectionName}:`, error);
      throw new Error(`Failed to search: ${(error as Error).message}`);
    }
  }
  
  /**
   * Searches for similar vectors with a filter
   * @param queryVector Query vector
   * @param collectionName Name of the collection
   * @param filter Filter function to apply on metadata
   * @param k Number of results to return
   */
  public async searchWithFilter(
    queryVector: Float32Array,
    collectionName: string,
    filter: (metadata: VectorMetadata) => boolean,
    k: number = 5
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      // Initial search with more results than needed
      const initialResults = await this.search(
        queryVector, 
        collectionName, 
        Math.min(k * 3, 100) // Get more results than needed to filter
      );
      
      // Apply filter - mit Typecheck
      const filteredResults = initialResults.filter((result: SearchResult) => {
        if (!result || result.metadata === undefined || result.metadata === null) return false;
        try {
          return filter(result.metadata as VectorMetadata);
        } catch (e) {
          console.warn(`[VectorStore] Error applying filter:`, e);
          return false;
        }
      });
      
      // Return up to k results
      return filteredResults.slice(0, k);
      
    } catch (error) {
      console.error(`[VectorStore] Error filtered search in ${collectionName}:`, error);
      throw new Error(`Failed to search with filter: ${(error as Error).message}`);
    }
  }
  
  /**
   * Gets vector by ID
   * @param id Vector ID
   * @param collectionName Name of the collection
   */
  public async getVector(
    id: string,
    collectionName: string
  ): Promise<{ vector: Float32Array, metadata: VectorMetadata } | null> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      // Rufe Vektor ab und prüfe das Ergebnis
      const result = await this.storage.getVector(collectionName, id);
      
      // Früher Return, wenn nichts gefunden wurde
      if (!result) {
        return null;
      }
      
      // Verwende unseren TypeGuard für die Validierung
      if (!isValidVectorResult(result)) {
        console.error(`[VectorStore] Invalid vector result structure for ${id}`);
        return null;
      }
      
      // Bereite Rückgabe vor mit sicheren Daten
      const safeVector = result.vector;
      const safeMetadata = result.metadata || {};
      
      // Jetzt sind die Eigenschaften garantiert und TypeScript sollte keine Probleme mehr haben
      return {
        vector: safeVector,
        metadata: safeMetadata as VectorMetadata
      };
      
    } catch (error) {
      console.error(`[VectorStore] Error getting vector ${id} from ${collectionName}:`, error);
      return null;
    }
  }
  
  /**
   * Updates vector metadata
   * @param id Vector ID
   * @param newMetadata New metadata (partial or complete)
   * @param collectionName Name of the collection
   */
  public async updateMetadata(
    id: string,
    newMetadata: Partial<VectorMetadata>,
    collectionName: string
  ): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      // Holen und validieren des bestehenden Vektors
      const result = await this.getVector(id, collectionName);
      
      // Frühe Rückgabe, wenn kein Ergebnis
      if (!result) {
        return false;
      }
      
      // Da wir getVector verwendet haben, sind diese Eigenschaften garantiert vorhanden
      const safeVector = result.vector;
      const safeMetadata = result.metadata;
      
      // Erstelle aktualisierte Metadaten
      const updatedMetadata = {
        ...safeMetadata,
        ...newMetadata
      };
      
      // Führe das Update durch mit garantiert vorhandenen Werten
      await this.storage.replaceVector(
        collectionName,
        safeVector,
        id,
        updatedMetadata
      );
      
      // Speichere die Sammlung
      await this.saveCollection(collectionName);
      
      return true;
      
    } catch (error) {
      console.error(`[VectorStore] Error updating metadata for ${id} in ${collectionName}:`, error);
      return false;
    }
  }
  
  /**
   * Deletes a vector from the collection
   * @param id Vector ID
   * @param collectionName Name of the collection
   */
  public async deleteVector(id: string, collectionName: string): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      await this.storage.deleteVector(collectionName, id);
      await this.saveCollection(collectionName);
      return true;
      
    } catch (error) {
      console.error(`[VectorStore] Error deleting vector ${id} from ${collectionName}:`, error);
      return false;
    }
  }
  
  /**
   * Saves a collection to disk
   * @param collectionName Name of the collection
   */
  public async saveCollection(collectionName: string): Promise<void> {
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      const indexPath = path.join(this.storePath, `${collectionName}.vsi`);
      await this.storage.saveIndex(collectionName, indexPath);
      console.log(`[VectorStore] Saved collection "${collectionName}" to ${indexPath}`);
      
    } catch (error) {
      console.error(`[VectorStore] Error saving collection ${collectionName}:`, error);
      throw new Error(`Failed to save collection: ${(error as Error).message}`);
    }
  }
  
  /**
   * Gets information about a collection
   * @param collectionName Name of the collection
   */
  public async getCollectionInfo(collectionName: string): Promise<{
    name: string;
    dimension: number;
    count: number;
    indices: string[];
  }> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      throw new Error(`Collection "${collectionName}" does not exist`);
    }
    
    try {
      const count = await this.storage.getCount(collectionName);
      const indices = await this.storage.getIndices(collectionName);
      
      // Sichere Prüfung für dimension
      const dimension = this.dimensions[collectionName];
      if (dimension === undefined || dimension <= 0) {
        throw new Error(`Dimension information missing for collection ${collectionName}`);
      }
      
      return {
        name: collectionName,
        dimension,
        count,
        indices
      };
      
    } catch (error) {
      console.error(`[VectorStore] Error getting info for ${collectionName}:`, error);
      throw new Error(`Failed to get collection info: ${(error as Error).message}`);
    }
  }
  
  /**
   * Lists all available collections
   */
  public async listCollections(): Promise<string[]> {
    await this.ensureInitialized();
    return Array.from(this.collections);
  }
  
  /**
   * Deletes a collection
   * @param collectionName Name of the collection
   */
  public async deleteCollection(collectionName: string): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.collections.has(collectionName)) {
      console.warn(`[VectorStore] Collection "${collectionName}" does not exist`);
      return false;
    }
    
    try {
      // Delete from memory
      await this.storage.deleteIndex(collectionName);
      this.collections.delete(collectionName);
      delete this.dimensions[collectionName];
      
      // Delete files
      const indexPath = path.join(this.storePath, `${collectionName}.vsi`);
      const configPath = path.join(this.storePath, `${collectionName}.config.json`);
      
      if (fs.existsSync(indexPath)) {
        fs.unlinkSync(indexPath);
      }
      
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      
      console.log(`[VectorStore] Deleted collection "${collectionName}"`);
      return true;
      
    } catch (error) {
      console.error(`[VectorStore] Error deleting collection ${collectionName}:`, error);
      return false;
    }
  }
}

// Singleton instance
let vectorStoreInstance: VectorStore | null = null;

/**
 * Gets a singleton instance of VectorStore
 */
export async function getVectorStore(): Promise<VectorStore> {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStore();
    await vectorStoreInstance.initialize();
  }
  return vectorStoreInstance;
}