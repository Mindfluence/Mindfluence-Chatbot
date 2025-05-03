// Diese Datei muss im /types Ordner gespeichert werden
// /types/next-font-google.d.ts

declare module 'next/font/google' {
    export interface FontOptions {
      weight?: string | string[];
      style?: string | string[];
      subsets?: string[];
      display?: string;
      variable?: string;
      preload?: boolean;
      fallback?: string[];
      adjustFontFallback?: boolean | string;
    }
  
    export function Inter(options: FontOptions): {
      className: string;
      style: {
        fontFamily: string;
      };
      variable: string;
    };
  }