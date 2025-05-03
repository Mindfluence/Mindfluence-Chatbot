// src/types/module-declarations.d.ts

/**
 * This file contains type declarations for external modules
 * that don't have their own TypeScript definitions or need overrides
 */

/**
 * Declaration for .node binary files to prevent TypeScript errors
 */
declare module '*.node' {
    const content: any;
    export default content;
  }
  
  /**
   * Optional: Add mock type definitions for onnxruntime-node in browser contexts
   * This helps TypeScript understand our environment-based imports
   */
  declare module 'onnxruntime-node' {
    // Re-export the same interface as onnxruntime-web for type compatibility
    export * from 'onnxruntime-web';
  }