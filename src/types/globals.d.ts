// src/types/globals.d.ts

// --- Globale Variablen oder Objekte erweitern ---

// Beispiel: Füge eine benutzerdefinierte Eigenschaft zum globalen Window-Interface hinzu
// Nützlich, wenn du globale Skripte hast, die Eigenschaften an window anhängen.
declare global {
    interface Window {
      // Beispiel: Ein globales Analytics-Objekt
      myAnalytics?: {
        trackEvent: (eventName: string, eventData: Record<string, any>) => void;
        setUser: (userId: string) => void;
      };
  
      // Beispiel: Eine globale Konfiguration, die von außen injiziert wird
      __APP_CONFIG__?: {
        apiUrl: string;
        featureFlags: Record<string, boolean>;
      };
    }
  }
  
  // --- Module ohne Typdefinitionen deklarieren ---
  
  // Beispiel: Deklariere ein Modul für eine JS-Bibliothek, die keine Typen hat.
  // Ermöglicht `import someLegacyLibrary from 'some-legacy-library';` ohne Fehler.
  // Idealerweise würdest du spezifischere Typen definieren, wenn du die API kennst.
  declare module 'some-legacy-library' {
    const library: any; // Sehr generisch, besser spezifischer definieren
    export default library;
  }
  
  // Beispiel: Deklariere Typen für spezifische Dateitypen, wenn sie importiert werden.
  // Nützlich für Assets wie SVG, wenn du sie direkt importieren willst.
  declare module '*.svg' {
    import React = require('react');
    export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
    const src: string;
    export default src;
  }
  
  declare module '*.wasm' {
      const value: string; // Pfad zur WASM-Datei
      export default value;
  }
  
  
  // --- Wichtiger Hinweis ---
  // Stelle sicher, dass diese Datei in das `include`-Array deiner `tsconfig.json` aufgenommen wird,
  // entweder direkt oder indirekt (z.B. durch "**/*.ts"). Standardmäßig ist das meist der Fall.
  
  // --- Export {} ---
  // Füge dies am Ende hinzu, um sicherzustellen, dass die Datei als Modul behandelt wird,
  // falls sie leer ist oder nur globale Erweiterungen enthält.
  // Dies verhindert potenzielle Konflikte.
  export {};