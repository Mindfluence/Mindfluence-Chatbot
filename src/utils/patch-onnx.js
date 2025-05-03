/**
 * patch-onnx.js
 * This file patches the ONNX runtime for Xenova Transformers
 * Solving the "Cannot read properties of undefined (reading 'create')" error
 */

// Cache for the ONNX runtime to avoid multiple imports
let onnxRuntimeCache = null;

/**
 * Initialize and patch the ONNX runtime for use with @xenova/transformers
 * This must be called before any transformers operations
 */
export async function initializeOnnxRuntime() {
  // If already initialized, return the cached instance
  if (onnxRuntimeCache) {
    console.log('[ONNX-Patch] Using cached ONNX runtime');
    return onnxRuntimeCache;
  }

  try {
    console.log('[ONNX-Patch] Initializing ONNX runtime...');
    
    // Import the ONNX runtime
    const ort = await import('onnxruntime-web');
    console.log('[ONNX-Patch] ONNX runtime imported successfully');
    
    // Make ONNX globally available
    if (typeof window !== 'undefined') {
      console.log('[ONNX-Patch] Setting ONNX runtime on window object');
      window.onnxruntime = ort;
      
      // CRITICAL: Also expose the InferenceSession directly on window
      window.InferenceSession = ort.InferenceSession;
    }
    
    if (typeof global !== 'undefined') {
      console.log('[ONNX-Patch] Setting ONNX runtime on global object');
      global.onnxruntime = ort;
      
      // CRITICAL: Also expose the InferenceSession directly on global
      global.InferenceSession = ort.InferenceSession;
    }
    
    // Also set on globalThis for maximum compatibility
    console.log('[ONNX-Patch] Setting ONNX runtime on globalThis object');
    globalThis.onnxruntime = ort;
    
    // CRITICAL: This is the key fix - Xenova's code looks for this directly
    // without going through the onnxruntime object
    globalThis.InferenceSession = ort.InferenceSession;
    
    // Additional patch for transformers backend
    try {
      // Dynamically patch the Xenova backend
      // We can't use require directly in Next.js/webpack environment
      const transformers = await import('@xenova/transformers');
      
      // If the transformers.env object exists, configure it
      if (transformers.env) {
        console.log('[ONNX-Patch] Configuring transformers.env');
        transformers.env.allowLocalModels = true;
        transformers.env.useFSCache = false;
        transformers.env.useExternalOnnxRuntime = true;
        
        // Make sure backends is properly set up
        if (!transformers.env.backends) {
          transformers.env.backends = {};
        }
        
        transformers.env.backends.onnx = {
          wasm: {
            numThreads: 4
          }
        };
      }
      
      console.log('[ONNX-Patch] Transformers environment configured');
    } catch (transformersError) {
      console.error('[ONNX-Patch] Error patching transformers:', transformersError);
    }
    
    // Initialize the WASM backend if available
    if (ort.env?.wasm?.init && typeof ort.env.wasm.init === 'function') {
      try {
        console.log('[ONNX-Patch] Initializing WASM environment...');
        await ort.env.wasm.init({
          numThreads: 4,
          simd: true,
          proxy: false,
          initTimeout: 60000  // Increased timeout for reliability
        });
        console.log('[ONNX-Patch] WASM environment initialized');
      } catch (wasmError) {
        console.warn('[ONNX-Patch] WASM initialization error:', wasmError);
      }
    } else {
      console.warn('[ONNX-Patch] WASM init function not found');
    }
    
    // Cache the ONNX runtime for future use
    onnxRuntimeCache = ort;
    
    // Verify the patched state
    console.log('[ONNX-Patch] Verifying patched state:');
    console.log(`- globalThis.onnxruntime exists: ${!!globalThis.onnxruntime}`);
    console.log(`- globalThis.InferenceSession exists: ${!!globalThis.InferenceSession}`);
    console.log(`- globalThis.InferenceSession.create exists: ${typeof globalThis.InferenceSession?.create === 'function'}`);
    
    console.log('[ONNX-Patch] ONNX runtime successfully initialized and patched');
    return ort;
  } catch (error) {
    console.error('[ONNX-Patch] Error initializing ONNX runtime:', error);
    throw error; // Re-throw to allow proper error handling
  }
}

/**
 * Creates a mock ONNX InferenceSession for fallback
 * @returns Mock session with expected interface
 */
export function createMockSession() {
  return {
    run: async () => ({}),
    inputNames: [],
    outputNames: [],
    release: async () => {}
  };
}

/**
 * Reset the ONNX runtime cache (for testing)
 */
export function resetOnnxRuntime() {
  onnxRuntimeCache = null;
  console.log('[ONNX-Patch] ONNX runtime cache reset');
}

// Export a getOnnxRuntime function for compatibility with other code
export async function getOnnxRuntime() {
  return await initializeOnnxRuntime();
}

// Export default to allow import * as onnxPatch syntax
export default {
  initializeOnnxRuntime,
  getOnnxRuntime,
  createMockSession,
  resetOnnxRuntime
};