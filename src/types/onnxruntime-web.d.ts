// types/onnxruntime-web.d.ts
declare module 'onnxruntime-web' {
  // Common TypedArray types supported by ONNX
  export type TypedArray =
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

  // Tensor types enum
  export enum TensorType {
    float = 1,
    uint8 = 2,
    int8 = 3,
    uint16 = 4,
    int16 = 5,
    int32 = 6,
    int64 = 7,
    string = 8,
    bool = 9,
    float16 = 10,
    double = 11,
    uint32 = 12,
    uint64 = 13,
    complex64 = 14,
    complex128 = 15,
    bfloat16 = 16
  }

  // Tensor class definition
  export class Tensor {
    constructor(
      type: TensorType | number,
      data: TypedArray | number[] | boolean[] | string[],
      dims?: readonly number[]
    );
    // Alternative constructor for empty tensors
    constructor(type: TensorType | number, dims?: readonly number[]);
   
    readonly data: TypedArray | number[] | boolean[] | string[];
    readonly dims: readonly number[];
    readonly type: TensorType | number;
    readonly size: number;
  }

  // Session options interface
  export interface SessionOptions {
    executionProviders?: string[];
    graphOptimizationLevel?: string;
    enableCpuMemArena?: boolean;
    enableMemPattern?: boolean;
    executionMode?: string;
    logId?: string;
    logSeverityLevel?: number;
    logVerbosityLevel?: number;
    extra?: Record<string, unknown>;
    freeDimensionOverrides?: Record<string, number>;
    extraObservations?: {
      tokenize?: boolean;
    };
  }

  // InferenceSession interface
  export interface InferenceSession {
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    inputNames: string[];
    outputNames: string[];
    dispose(): Promise<void>;
    release?(): Promise<void>; // For backward compatibility
  }

  // IMPORTANT: This is the static create method that was missing
  export namespace InferenceSession {
    function create(
      uri: string | ArrayBufferLike,
      options?: SessionOptions
    ): Promise<InferenceSession>;
  }

  // WASM initialization options
  export interface WasmInitOptions {
    numThreads?: number;
    simd?: boolean;
    proxy?: boolean;
    initTimeout?: number;
    cpuMask?: number;
    wasmPaths?: string;
  }

  // Environment configuration
  export const env: {
    wasm: {
      init(options: WasmInitOptions): Promise<void>;
      numThreads: number;
      simd: boolean;
      proxy?: boolean;
    };
    logLevel: 'verbose' | 'info' | 'warning' | 'error' | 'fatal';
    webgl?: {
      disabled: boolean;
    };
    debug?: boolean;
    backends?: {
      onnx?: {
        wasm?: Record<string, any>;
        webgl?: Record<string, any>;
      };
      tfjs?: Record<string, any>;
    };
  };

  // Backend registration function
  export function registerBackend(
    name: string,
    factory: () => unknown,
    priority?: number
  ): void;
}

// Additional definitions for @xenova/transformers environment
declare namespace env {
  export namespace backends {
    export let onnx: any;
    export let tfjs: {};
  }
  export let __dirname: any;
  export let version: string;
  export let allowRemoteModels: boolean;
  export let remoteHost: string;
  export let remotePathTemplate: string;
  export let allowLocalModels: boolean;
  export let localModelPath: any;
  export let useFS: boolean;
  export let useBrowserCache: boolean;
  export let useFSCache: boolean;
  export let cacheDir: string;
  export let useCustomCache: boolean;
  export let customCache: any;
}