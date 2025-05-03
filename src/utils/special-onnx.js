// src/utils/special-onnx.js
let onnxruntimeCache = null;

// Diese Funktion patcht @xenova/transformers zur Laufzeit
export async function patchXenovaOnnx() {
  // Nur wenn wir im Server-Kontext sind
  if (typeof window === 'undefined') {
    try {
      // Import onnxruntime-web
      const ort = await import('onnxruntime-web');
      
      // Cache and setup global
      onnxruntimeCache = ort;
      if (typeof global !== 'undefined') global.onnxruntime = ort;
      if (typeof globalThis !== 'undefined') globalThis.onnxruntime = ort;
      
      // Direkt das Xenova-Modul patchen
      try {
        // Das Modul finden
        const xenovaOnnxPath = require.resolve('@xenova/transformers/dist/backends/onnx');
        // Den Modul-Cache löschen
        delete require.cache[xenovaOnnxPath];
        
        // Manuell den InferenceSession exportieren
        const originalModule = require('@xenova/transformers/dist/backends/onnx');
        originalModule.InferenceSession = ort.InferenceSession;
        console.log('[PATCH] Xenova ONNX Backend direkt gepatcht');
      } catch (patchError) {
        console.error('[PATCH] Konnte Xenova nicht patchen:', patchError);
      }
      
      return ort;
    } catch (error) {
      console.error('Fehler beim Laden von onnxruntime-web:', error);
      return null;
    }
  }
  return null;
}

// Getter-Funktion
export async function getOnnxRuntime() {
  if (onnxruntimeCache) {
    return onnxruntimeCache;
  }
  
  const ort = await import('onnxruntime-web');
  onnxruntimeCache = ort;
  
  // Setze auch auf den globalen Objekten
  if (typeof global !== 'undefined') global.onnxruntime = ort;
  if (typeof globalThis !== 'undefined') globalThis.onnxruntime = ort;
  
  return ort;
}