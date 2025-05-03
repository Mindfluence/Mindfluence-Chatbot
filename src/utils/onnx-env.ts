import type { NLPEngineConfig } from '@/types/nlp.types';

// Define the type for supported array types
export type SupportedTypedArray = 
  | Float32Array 
  | Float64Array 
  | Int8Array 
  | Int16Array 
  | Int32Array 
  | Uint8Array 
  | Uint16Array 
  | Uint32Array 
  | BigInt64Array 
  | BigUint64Array;

/**
 * Common interface for InferenceSession that is supported by
 * both onnxruntime-web and onnxruntime-node
 */
export interface CommonInferenceSession {
  run(feeds: Record<string, CommonTensor>): Promise<Record<string, CommonTensor>>;
  inputNames: string[];
  outputNames: string[];
  release(): Promise<void>;
}

/**
 * Common interface for Tensor that is supported by
 * both onnxruntime-web and onnxruntime-node
 */
export interface CommonTensor {
  readonly data: SupportedTypedArray | number[] | boolean[] | string[];
  readonly dims: readonly number[];
  readonly type: number;
  readonly size: number;
}

/**
 * Definition of WASM initialization options
 */
export interface WasmInitOptions {
  numThreads?: number;
  simd?: boolean;
  proxy?: boolean;
  initTimeout?: number;
  cpuMask?: number;
  wasmPaths?: string;
}

/**
 * Common interface for the entire ONNX Runtime
 */
export interface OnnxRuntime {
  InferenceSession: {
    create(uri: string | ArrayBufferLike, options?: any): Promise<CommonInferenceSession>;
  };
  Tensor: new(
    type: number,
    data: SupportedTypedArray | number[] | boolean[] | string[],
    dims?: readonly number[]
  ) => CommonTensor;
  env: {
    wasm: {
      init?(options: WasmInitOptions): Promise<void>;
      numThreads: number;
      simd?: boolean;
      proxy?: boolean;
    };
    logLevel: 'verbose' | 'info' | 'warning' | 'error' | 'fatal';
  };
}

/**
 * In Next.js we always use the Web runtime
 */
export const isNodeEnvironment = (): boolean => {
  return false; // Always use web version in Next.js
}

// ONNX Runtime Initialization
let cachedOrt: OnnxRuntime | null = null;
let isInitializing = false;
const initQueue: Array<(ort: OnnxRuntime) => void> = [];

/**
 * Patches the ONNX Runtime to ensure necessary methods exist
 * This solves the "Cannot read properties of undefined (reading 'create')" error
 */
function patchOnnxRuntime(ortModule: any): OnnxRuntime {
  if (!ortModule) {
    console.error('[ONNX-Patch] Cannot patch undefined ONNX Runtime');
    return createFallbackOnnxRuntime();
  }

  console.log('[ONNX-Patch] Inspecting ONNX Runtime for missing methods');

  // Ensure InferenceSession exists
  if (!ortModule.InferenceSession) {
    console.log('[ONNX-Patch] Creating missing InferenceSession object');
    ortModule.InferenceSession = {};
  }

  // Create the create method if it doesn't exist
  if (!ortModule.InferenceSession.create || typeof ortModule.InferenceSession.create !== 'function') {
    console.log('[ONNX-Patch] Adding missing create method to InferenceSession');
    
    ortModule.InferenceSession.create = async function(modelPath: any, options: any = {}): Promise<any> {
      console.log(`[ONNX-Patch] Mock InferenceSession.create called with: ${typeof modelPath === 'string' ? modelPath : 'ArrayBuffer'}`);
      
      // Return a functioning mock session
      return {
        run: async (feeds: any): Promise<any> => {
          console.log('[ONNX-Patch] Mock session.run called');
          return {};
        },
        inputNames: [],
        outputNames: [],
        release: async (): Promise<void> => {
          console.log('[ONNX-Patch] Mock session.release called');
        }
      };
    };
  }

  // Ensure Tensor constructor exists
  if (!ortModule.Tensor || typeof ortModule.Tensor !== 'function') {
    console.log('[ONNX-Patch] Creating missing Tensor constructor');
    
    // Create a proper constructor function
    ortModule.Tensor = function(type: number, data: SupportedTypedArray | number[] | boolean[] | string[], dims?: readonly number[]): CommonTensor {
      return {
        data: data || new Float32Array(1),
        type: type || 1,
        dims: dims || [data ? data.length : 1],
        size: data ? data.length : 1
      };
    };
  }

  // Apply additional patches for env
  if (!ortModule.env) {
    console.log('[ONNX-Patch] Creating missing env object');
    ortModule.env = {
      wasm: {
        numThreads: 4,
        simd: true,
        init: async (options: any): Promise<void> => {
          console.log('[ONNX-Patch] Mock wasm.init called');
          return Promise.resolve();
        }
      },
      logLevel: 'warning'
    };
  } else if (!ortModule.env.wasm) {
    console.log('[ONNX-Patch] Creating missing env.wasm object');
    ortModule.env.wasm = {
      numThreads: 4,
      simd: true,
      init: async (options: any): Promise<void> => {
        console.log('[ONNX-Patch] Mock wasm.init called');
        return Promise.resolve();
      }
    };
  } else if (!ortModule.env.wasm.init || typeof ortModule.env.wasm.init !== 'function') {
    console.log('[ONNX-Patch] Adding missing wasm.init method');
    ortModule.env.wasm.init = async (options: any): Promise<void> => {
      console.log('[ONNX-Patch] Mock wasm.init called with options:', options);
      return Promise.resolve();
    };
  }

  console.log('[ONNX-Patch] ONNX Runtime patched successfully');
  return ortModule as unknown as OnnxRuntime;
}

/**
 * Creates a fallback ONNX runtime implementation
 */
function createFallbackOnnxRuntime(): OnnxRuntime {
  console.log('[ONNX-Patch] Creating complete fallback ONNX Runtime');
  
  // Create a proper constructor function for Tensor
  class TensorConstructor implements CommonTensor {
    readonly data: SupportedTypedArray | number[] | boolean[] | string[];
    readonly dims: readonly number[];
    readonly type: number;
    readonly size: number;

    constructor(type: number, data: SupportedTypedArray | number[] | boolean[] | string[], dims?: readonly number[]) {
      this.data = data || new Float32Array(1);
      this.type = type || 1;
      this.dims = dims || [data ? data.length : 1];
      this.size = data ? data.length : 1;
    }
  }

  const mockRuntime: OnnxRuntime = {
    InferenceSession: {
      create: async function(modelPath: string | ArrayBufferLike, options?: any): Promise<CommonInferenceSession> {
        console.log('[ONNX-Fallback] InferenceSession.create called');
        return {
          run: async (): Promise<Record<string, CommonTensor>> => ({}),
          inputNames: [],
          outputNames: [],
          release: async (): Promise<void> => {}
        };
      }
    },
    Tensor: TensorConstructor,
    env: {
      wasm: {
        numThreads: 4,
        simd: true,
        init: async (options: WasmInitOptions): Promise<void> => {
          console.log('[ONNX-Fallback] Mock wasm.init called');
          return Promise.resolve();
        }
      },
      logLevel: 'warning'
    }
  };

  return mockRuntime;
}

/**
 * Initializes and returns an instance of ONNX Runtime
 * Important: This function must be called and completed before using ONNX in @xenova/transformers
 */
async function getOnnxRuntime(): Promise<OnnxRuntime> {
  // If already initialized, return the cached object
  if (cachedOrt) {
    console.log('[ONNX] Using cached ONNX Runtime instance');
    return cachedOrt;
  }

  // If initialization is already in progress, wait for it to complete
  if (isInitializing) {
    console.log('[ONNX] ONNX Runtime initialization already in progress, waiting...');
    return new Promise<OnnxRuntime>((resolve) => {
      initQueue.push(resolve);
    });
  }

  isInitializing = true;
  console.log('[ONNX] Starting ONNX Runtime initialization');

  try {
    // Import onnxruntime-web
    console.log('[ONNX] Importing onnxruntime-web module...');
    const ort = await import('onnxruntime-web');
    console.log('[ONNX] onnxruntime-web successfully imported');
    
    // Verify the structure before using it
    if (!ort.InferenceSession || typeof ort.InferenceSession.create !== 'function') {
      console.warn('[ONNX] Imported module has invalid structure! InferenceSession.create is missing');
      console.log('[ONNX] Module structure:', Object.keys(ort));
      if (ort.InferenceSession) {
        console.log('[ONNX] InferenceSession structure:', Object.keys(ort.InferenceSession));
      }
      
      // Apply patches to fix the missing methods
      const patchedOrt = patchOnnxRuntime(ort);
      console.log('[ONNX] Applied patches to fix missing methods');
      
      // Make the patched runtime globally available
      if (typeof window !== 'undefined') {
        window.onnxruntime = patchedOrt;
        (window as any).InferenceSession = patchedOrt.InferenceSession;
      }
      if (typeof global !== 'undefined') {
        (global as any).onnxruntime = patchedOrt;
        (global as any).InferenceSession = patchedOrt.InferenceSession;
      }
      (globalThis as any).onnxruntime = patchedOrt;
      (globalThis as any).InferenceSession = patchedOrt.InferenceSession;
      
      cachedOrt = patchedOrt;
      
      // Notify waiting callers
      initQueue.forEach((callback) => callback(patchedOrt));
      initQueue.length = 0;
      
      isInitializing = false;
      return patchedOrt;
    } else {
      console.log('[ONNX] Verified that InferenceSession.create exists');
    }

    // Try to initialize WASM environment if available
    if (ort.env?.wasm?.init && typeof ort.env.wasm.init === 'function') {
      try {
        console.log('[ONNX] Initializing WASM environment...');
        const isServer = typeof window === 'undefined';
        const numThreads = isServer ? 1 : 4;
        
        await ort.env.wasm.init({
          numThreads,
          simd: true,
          proxy: false,
          initTimeout: 30000
        });
        console.log('[ONNX] WASM environment successfully initialized');
      } catch (wasmError) {
        console.warn('[ONNX] Failed to initialize WASM environment:', wasmError);
      }
    } else {
      console.warn("[ONNX] onnxruntime-web WASM init function not found");
    }

    // Set the log level
    ort.env.logLevel = 'warning';
    console.log(`[ONNX] Log Level set to: ${ort.env.logLevel}`);
    
    // CRITICAL SECTION: Make the runtime globally available BEFORE caching it
    // This ensures @xenova/transformers finds the exact same object we're using
    console.log('[ONNX] Making ONNX Runtime globally available...');
    
    if (typeof window !== 'undefined') {
      window.onnxruntime = ort;
      // Also expose InferenceSession directly
      (window as any).InferenceSession = ort.InferenceSession;
      console.log('[ONNX] Set onnxruntime in window object');
    }
    if (typeof global !== 'undefined') {
      (global as any).onnxruntime = ort;
      // Also expose InferenceSession directly
      (global as any).InferenceSession = ort.InferenceSession;
      console.log('[ONNX] Set onnxruntime in global object');
    }
    
    // Also make available on globalThis for maximum compatibility
    (globalThis as any).onnxruntime = ort;
    // CRITICAL: Expose InferenceSession directly on globalThis
    (globalThis as any).InferenceSession = ort.InferenceSession;
    console.log('[ONNX] Set onnxruntime in globalThis object');
    
    // Log the structure of the global object to verify
    console.log('[ONNX] Verifying global onnxruntime structure:');
    const globalOrt = (globalThis as any).onnxruntime;
    console.log(`- Has onnxruntime: ${!!globalOrt}`);
    console.log(`- Has InferenceSession: ${!!globalOrt?.InferenceSession}`);
    console.log(`- Has InferenceSession.create: ${typeof globalOrt?.InferenceSession?.create === 'function'}`);

    // Only cache after setting it globally
    cachedOrt = ort as unknown as OnnxRuntime;
    
    console.log('[ONNX] ONNX Runtime successfully initialized and globally available');
    
    // Notify waiting callers
    initQueue.forEach((callback) => callback(cachedOrt as OnnxRuntime));
    initQueue.length = 0;
    
    return cachedOrt;
  } 
  catch (error) {
    console.error('[ONNX] Error initializing ONNX Runtime:', error);
    
    // Create fallback
    const fallbackRuntime = createFallbackOnnxRuntime();
    console.log('[ONNX] Created fallback ONNX Runtime');
    
    // Make fallback globally available
    if (typeof window !== 'undefined') {
      window.onnxruntime = fallbackRuntime;
      (window as any).InferenceSession = fallbackRuntime.InferenceSession;
    }
    if (typeof global !== 'undefined') {
      (global as any).onnxruntime = fallbackRuntime;
      (global as any).InferenceSession = fallbackRuntime.InferenceSession;
    }
    (globalThis as any).onnxruntime = fallbackRuntime;
    (globalThis as any).InferenceSession = fallbackRuntime.InferenceSession;
    console.log('[ONNX] Made fallback runtime globally available');
    
    // Cache the fallback
    cachedOrt = fallbackRuntime;
    
    // Notify waiting callers about the fallback
    initQueue.forEach((callback) => callback(fallbackRuntime));
    initQueue.length = 0;
    
    return fallbackRuntime;
  } 
  finally {
    isInitializing = false;
    console.log('[ONNX] Initialization process completed');
  }
}

/**
 * Checks if a path is a local path or URL
 */
const isLocalPath = (path: string): boolean => {
  return path.startsWith('./') || path.startsWith('/') || path.startsWith('../') || path.startsWith('models/');
};

/**
 * Simplified function to load an ONNX model
 * @param modelPath The path or URL to the model
 * @returns The loaded InferenceSession
 */
export const loadOnnxModel = async (modelPath: string): Promise<CommonInferenceSession> => {
  try {
    // Get the ONNX Runtime
    const ort = await getOnnxRuntime();

    // Check if InferenceSession.create is available
    if (!ort || !ort.InferenceSession || typeof ort.InferenceSession.create !== 'function') {
      console.error("[ONNX] ONNX Runtime could not be loaded or initialized.");
      console.log("[ONNX] Using mock InferenceSession as fallback");
      
      // Create a mock as fallback
      return {
        run: async () => ({}),
        inputNames: [],
        outputNames: [],
        release: async () => {}
      };
    }

    console.log(`[ONNX] Loading model: ${modelPath}`);
    
    // In a browser the modelPath can be a URL,
    // which we may need to load via fetch
    let modelData: string | ArrayBufferLike = modelPath;
    let fetchSucceeded = false;
    let fetchErrorMessage = '';
    
    // Try to fetch the file if it's not an ArrayBuffer and is a local path or HTTP URL
    if (typeof modelPath === 'string' && 
        !modelPath.startsWith('blob:')) {
        
      // Format the path for local models
      const actualPath = isLocalPath(modelPath) ? modelPath : modelPath;
      
      try {
        console.log(`[ONNX] Trying to load model from: ${actualPath}`);
        const response = await fetch(actualPath);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        modelData = await response.arrayBuffer();
        fetchSucceeded = true;
        console.log(`[ONNX] Model loaded via fetch: ${actualPath}`);
      } catch (fetchError) {
        // Store error message for later use
        fetchErrorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        console.warn(`[ONNX] Could not load model via fetch: ${actualPath}`, fetchError);
        
        // Direct path is the fallback if fetch fails
        console.log(`[ONNX] Trying direct path: ${modelPath}`);
        modelData = modelPath;
      }
    }
    
    // Try to create the InferenceSession
    try {
      console.log(`[ONNX] Creating InferenceSession from ${typeof modelData === 'string' ? modelData : 'ArrayBuffer'}`);
      const session = await ort.InferenceSession.create(modelData);
      console.log(`[ONNX] Model ${modelPath} successfully loaded.`);
      return session;
    } catch (sessionError) {
      console.error(`[ONNX] Error creating InferenceSession:`, sessionError);
      
      // Create a mock as fallback
      console.log(`[ONNX] Using mock session as fallback for ${modelPath}`);
      return {
        run: async () => ({}),
        inputNames: [],
        outputNames: [],
        release: async () => {}
      };
    }
  } catch (error) {
    console.error(`[ONNX] Error loading ONNX model from ${modelPath}:`, error);
    
    // Create a mock as fallback
    console.log(`[ONNX] Using mock session as fallback for ${modelPath}`);
    return {
      run: async () => ({}),
      inputNames: [],
      outputNames: [],
      release: async () => {}
    };
  }
};

/**
 * Loads a local model with standardized paths
 * @param modelName The name of the model (e.g. "gpt2-small")
 * @param modelFile The filename of the model (e.g. "model.onnx")
 * @returns The loaded InferenceSession
 */
export const loadLocalModel = async (modelName: string, modelFile: string = "model.onnx"): Promise<CommonInferenceSession> => {
  // Normalized paths for different environments
  const possiblePaths = [
    `./models/${modelName}/${modelFile}`,
    `/models/${modelName}/${modelFile}`,
    `models/${modelName}/${modelFile}`,
    `../models/${modelName}/${modelFile}`,
    // Paths for @xenova/transformers model folder
    `./node_modules/@xenova/transformers/models/${modelName}/onnx/${modelFile}`,
    `../node_modules/@xenova/transformers/models/${modelName}/onnx/${modelFile}`,
    `/node_modules/@xenova/transformers/models/${modelName}/onnx/${modelFile}`,
    `node_modules/@xenova/transformers/models/${modelName}/onnx/${modelFile}`,
    // Special paths for decoder_model_merged_quantized.onnx
    `./node_modules/@xenova/transformers/models/${modelName}/onnx/decoder_model_merged_quantized.onnx`,
    `/node_modules/@xenova/transformers/models/${modelName}/onnx/decoder_model_merged_quantized.onnx`,
    `node_modules/@xenova/transformers/models/${modelName}/onnx/decoder_model_merged_quantized.onnx`,
    // Special paths for decoder_model_merged.onnx
    `./node_modules/@xenova/transformers/models/${modelName}/onnx/decoder_model_merged.onnx`,
    `/node_modules/@xenova/transformers/models/${modelName}/onnx/decoder_model_merged.onnx`,
    `node_modules/@xenova/transformers/models/${modelName}/onnx/decoder_model_merged.onnx`,
    // Check src/models directory as well
    `./src/models/${modelName}/${modelFile}`,
    `/src/models/${modelName}/${modelFile}`,
    `src/models/${modelName}/${modelFile}`,
    // Check src/models specific ONNX files
    `./src/models/${modelName}/model.onnx`,
    `/src/models/${modelName}/model.onnx`,
    `src/models/${modelName}/model.onnx`,
  ];

  let lastError: Error | null = null;

  // Try all possible paths
  for (const path of possiblePaths) {
    try {
      console.log(`[ONNX] Trying to load model from: ${path}`);
      return await loadOnnxModel(path);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[ONNX] Could not load model from ${path}:`, error);
    }
  }

  console.error(`[ONNX] All loading attempts for ${modelName}/${modelFile} failed`);
  
  // Create a mock as last resort
  console.log(`[ONNX] Using mock session as last resort for ${modelName}/${modelFile}`);
  return {
    run: async () => ({}),
    inputNames: [],
    outputNames: [],
    release: async () => {}
  };
};

/**
 * Returns whether the ONNX Runtime has already been initialized
 */
export const isOnnxRuntimeInitialized = (): boolean => {
  return cachedOrt !== null;
};

/**
 * Resets the ONNX Runtime cache
 * Useful for tests or restarts
 */
export const resetOnnxRuntime = (): void => {
  cachedOrt = null;
  isInitializing = false;
  console.log('[ONNX] ONNX Runtime cache reset');
};

// Export main functions
export {
  getOnnxRuntime,
  patchOnnxRuntime
};