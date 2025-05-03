// src/types/data.types.ts

// --- Basis-Typen für lokalisierte Inhalte ---

/**
 * Repräsentiert einen Text, der in mehreren Sprachen verfügbar sein kann.
 * Verwendet Sprachcodes (z.B. 'de', 'en') als Schlüssel.
 */
export type LocalizedString = {
    [locale: string]: string;
  };
  
  /**
   * Repräsentiert möglicherweise komplexere lokalisierte Inhalte,
   * die neben reinem Text auch Listen oder verschachtelte Objekte enthalten können.
   */
  export type LocalizedContent = {
    [locale: string]: string | string[] | Record<string, any>; // Kann Text, Listen oder komplexere Strukturen sein
  };
  
  // --- Typen für Chatbot-spezifische Daten (aus data/chatbot/*.json) ---
  
  /**
   * Struktur für eine einzelne Frage-Antwort-Paarung in den FAQ-Daten.
   */
  export interface FaqItem {
    /** Eindeutige ID für das FAQ-Item (optional, aber nützlich). */
    id?: string;
    /** Die Frage des Benutzers (kann lokalisiert sein). */
    question: string | LocalizedString;
    /** Die Antwort des Bots (kann lokalisiert sein und evtl. Markdown enthalten). */
    answer: string | LocalizedString;
    /** Schlüsselwörter oder Tags zur besseren Auffindbarkeit (optional). */
    tags?: string[];
    /** Zugehörige App-Features oder Kontexte (optional). */
    relatedFeatures?: string[];
  }
  
  /**
   * Struktur für eine einzelne Smalltalk-Antwort oder ein Muster.
   */
  export interface SmalltalkResponse {
    /** Kategorie oder Auslöser des Smalltalks (z.B. 'greeting', 'farewell', 'compliment'). */
    category: string;
    /** Die verschiedenen Antwortmöglichkeiten des Bots (können lokalisiert sein). */
    responses: string[] | LocalizedContent; // Einfache Strings oder komplexere lokalisierte Antworten
    /** Bedingungen, unter denen diese Antwort verwendet werden soll (optional). */
    conditions?: Record<string, any>;
  }
  
  /**
   * Beschreibt eine Funktion oder einen Aspekt der Hauptanwendung.
   * Wird von der NLP-Engine genutzt, um kontextbezogene Antworten zu geben.
   */
  export interface AppFeatureContext {
    /** Eindeutiger Bezeichner des Features (z.B. 'playlist_creation', 'premium_benefits', 'account_deletion'). */
    featureId: string;
    /** Eine detaillierte Beschreibung, wie das Feature funktioniert (lokalisiert). */
    description: LocalizedString;
    /** Schritte zur Nutzung des Features (lokalisiert, kann Liste sein). */
    usageSteps?: LocalizedContent;
    /** Schlüsselwörter oder Synonyme, die mit diesem Feature verbunden sind. */
    keywords: string[];
    /** Verknüpfungen zu relevanten Intents (optional). */
    relatedIntents?: string[];
    /** Link zu einer relevanten Seite in der App oder Hilfe (optional). */
    link?: string;
  }
  
  // --- Generische Typen für JSON-Datenquellen ---
  
  /**
   * Ein generischer Typ für eine Datensammlung, die aus einer JSON-Datei geladen wird.
   * Erwartet einen Typ `T` für die einzelnen Elemente in der Sammlung.
   * Nützlich für FAQ-Listen, Smalltalk-Daten, App-Kontext-Listen etc.
   */
  export type JsonDataSource<T> = T[];
  
  /**
   * Typ für eine einzelne FAQ-Datenquelle (z.B. faq_de.json).
   */
  export type FaqDataSource = JsonDataSource<FaqItem>;
  
  /**
   * Typ für eine einzelne Smalltalk-Datenquelle (z.B. smalltalk_en.json).
   */
  export type SmalltalkDataSource = JsonDataSource<SmalltalkResponse>;
  
  /**
   * Typ für eine einzelne App-Kontext-Datenquelle (z.B. app_context_de.json).
   */
  export type AppContextDataSource = JsonDataSource<AppFeatureContext>;
  
  
  // --- Typen für UI-bezogene Daten (aus data/ui/*.json) ---
  
  /**
   * Beispiel: Struktur für Button-Styling-Varianten aus einer JSON-Datei.
   * Definiert verschiedene visuelle Stile für Buttons.
   */
  export interface ButtonStyleVariant {
    variantName: 'primary' | 'secondary' | 'ghost' | 'destructive' | string; // Erlaubt bekannte und benutzerdefinierte Namen
    /** Tailwind-Klassen oder CSS-Eigenschaften für diesen Stil. */
    styleClasses: string; // Könnte auch ein Objekt mit CSS-Props sein
    /** Standardmäßige Icon-Informationen für diesen Button-Typ (optional). */
    defaultIcon?: {
      name: string; // Name des Icons (z.B. von react-icons)
      position: 'left' | 'right';
    };
  }
  
  /**
   * Typ für eine UI-Styling-Datenquelle (z.B. button-styles.json).
   */
  export type UiStyleDataSource = JsonDataSource<ButtonStyleVariant>; // Oder spezifischer, falls verschiedene Komponenten-Styles in einer Datei sind