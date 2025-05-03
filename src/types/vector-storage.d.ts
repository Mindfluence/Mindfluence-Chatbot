// types/vector-storage.d.ts

declare module 'vector-storage' {
    export interface IndexConfig {
      dimension: number;
      metric: 'cosine' | 'euclidean' | 'dot';
      useHnsw?: boolean;
      efConstruction?: number;
      M?: number;
    }
  
    export interface SearchResult<T = any> {
      id: string;
      score: number;
      vector: Float32Array;
      metadata: T;
    }
  
    export class VectorStorage {
      constructor();
      
      createIndex(collectionName: string, config: IndexConfig): Promise<void>;
      loadIndex(collectionName: string, path: string, config: IndexConfig): Promise<void>;
      saveIndex(collectionName: string, path: string): Promise<void>;
      deleteIndex(collectionName: string): Promise<void>;
      
      addVector<T = any>(collectionName: string, vector: Float32Array, id: string, metadata?: T): Promise<void>;
      replaceVector<T = any>(collectionName: string, vector: Float32Array, id: string, metadata?: T): Promise<void>;
      deleteVector(collectionName: string, id: string): Promise<void>;
      
      getVector<T = any>(collectionName: string, id: string): Promise<{vector: Float32Array, metadata: T} | null>;
      search<T = any>(collectionName: string, queryVector: Float32Array, k: number): Promise<Array<SearchResult<T>>>;
      
      getCount(collectionName: string): Promise<number>;
      getIndices(collectionName: string): Promise<string[]>;
    }
  }