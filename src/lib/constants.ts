/**
 * Applikations-Konstanten
 * 
 * Diese Datei enthält alle globalen Konstanten für die Anwendung,
 * um Magic Strings/Numbers zu vermeiden und zentrale Konfiguration zu ermöglichen.
 */

import type { Language } from '@/types/chatbot.types';

// ============================
// Sprach-Konfiguration
// ============================

/**
 * Unterstützte Sprachen in der Anwendung
 */
export const SUPPORTED_LANGUAGES: Language[] = ['de', 'en'];

/**
 * Standard-Sprache der Anwendung
 */
export const DEFAULT_LANGUAGE: Language = 'de';

/**
 * Namen der Sprachen für die UI
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  de: 'Deutsch',
  en: 'English',
};

// ============================
// Chatbot-Konfiguration
// ============================

/**
 * Standard-Name des Chatbots in verschiedenen Sprachen
 */
export const BOT_NAME: Record<Language, string> = {
  de: 'Mindfluence Assistent',
  en: 'Mindfluence Assistant',
};

/**
 * Maximale Länge einer einzelnen Nachricht in Zeichen
 */
export const MAX_MESSAGE_LENGTH = 500;

/**
 * Maximale Anzahl von Nachrichten, die im Chat-Verlauf gespeichert werden
 */
export const MAX_CHAT_HISTORY = 100;

/**
 * Verzögerungszeiten für natürlichere Bot-Antworten
 */
export const TYPING_DELAYS = {
  MIN: 500,           // Minimale Verzögerung in Millisekunden
  MAX: 3000,          // Maximale Verzögerung in Millisekunden 
  CHARS_PER_SEC: 15,  // Durchschnittliche Zeichen pro Sekunde
};

/**
 * Zeitraum in Millisekunden, nach dem ein inaktiver Chat automatisch geschlossen wird
 * (0 = deaktiviert)
 */
export const AUTO_CLOSE_TIMEOUT = 15 * 60 * 1000; // 15 Minuten

/**
 * Zeit in Millisekunden für Debouncing der Benutzereingabe
 */
export const INPUT_DEBOUNCE_DELAY = 300;

// ============================
// LocalStorage-Schlüssel
// ============================

/**
 * Schlüssel für die Speicherung von Anwendungsdaten im LocalStorage
 */
export const STORAGE_KEYS = {
  LANGUAGE: 'mindfluence-chatbot-language',
  CHAT_HISTORY: 'mindfluence-chatbot-history',
  CHAT_STATE: 'mindfluence-chatbot-state',
  USER_PREFERENCES: 'mindfluence-chatbot-preferences',
  FEEDBACK: 'mindfluence-chatbot-feedback',
  THEME: 'mindfluence-chatbot-theme',
};

// ============================
// NLP-Konfiguration
// ============================

/**
 * Schwellenwerte für die Intent-Erkennung
 */
export const INTENT_CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,   // Hohe Konfidenz - Antwort kann ohne Rückfrage verwendet werden
  MEDIUM: 0.5, // Mittlere Konfidenz - evtl. Rückfrage nötig
  LOW: 0.3,    // Niedrige Konfidenz - sollte Rückfrage erfordern
  NONE: 0.1,   // Praktisch keine Übereinstimmung
};

/**
 * Dateipfade zu NLP-Daten
 */
export const NLP_DATA_PATHS = {
  INTENTS: 'intents',
  ENTITIES: 'entities',
  FAQ: 'faq',
  SMALLTALK: 'smalltalk',
  APP_CONTEXT: 'app_context',
};

// ============================
// UI-Konfiguration
// ============================

/**
 * Verzögerung in Millisekunden für Animationen
 */
export const ANIMATION_DURATION = 300;

/**
 * Maximale mobile Bildschirmbreite für responsive Design
 */
export const MOBILE_BREAKPOINT = 768;

/**
 * Minimale und maximale Größen für den Chat-Container
 */
export const CHAT_CONTAINER_DIMENSIONS = {
  MIN_WIDTH: 300,
  MAX_WIDTH: 400,
  MIN_HEIGHT: 400,
  MAX_HEIGHT: 600,
};

/**
 * Positionen für das Chat-Widget
 */
export type ChatPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export const DEFAULT_CHAT_POSITION: ChatPosition = 'bottom-right';

// ============================
// Feature-Flags
// ============================

/**
 * Feature-Flags für die Aktivierung/Deaktivierung von Funktionen
 */
export const FEATURES = {
  VOICE_INPUT: false,
  FILE_UPLOAD: false,
  FEEDBACK: true,
  ANALYTICS: true,
  CONTEXT_AWARENESS: true,
  MULTILINGUAL: true,
  SMALLTALK: true,
};

// ============================
// Regex-Muster
// ============================

/**
 * Reguläre Ausdrücke für verschiedene Validierungen
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  URL: /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
  PHONE_DE: /^(\+49|0)[0-9]{2,}[0-9]{7,}$/,
};

// ============================
// Theme-Konfiguration
// ============================

/**
 * Unterstützte Theme-Modi
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Standard-Theme-Modus
 */
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

/**
 * Event-Name für Theme-Änderungen
 */
export const THEME_CHANGE_EVENT = 'mindfluence-theme-change';

// ============================
// API-Konfiguration
// ============================

/**
 * Basis-URL für externe API-Aufrufe
 * (Für Produktionsumgebung anpassen)
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Timeout für API-Anfragen in Millisekunden
 */
export const API_TIMEOUT = 10000;

// ============================
// Analytik-Konfiguration
// ============================

/**
 * Ereignistypen für Analytik
 */
export const ANALYTICS_EVENTS = {
  CHAT_OPENED: 'chat_opened',
  CHAT_CLOSED: 'chat_closed',
  MESSAGE_SENT: 'message_sent',
  RESPONSE_RECEIVED: 'response_received',
  LANGUAGE_CHANGED: 'language_changed',
  FEEDBACK_GIVEN: 'feedback_given',
  ERROR_OCCURRED: 'error_occurred',
};

// ============================
// Sonstiges
// ============================

/**
 * Verzögerung in Millisekunden für das erneute Laden von Ressourcen
 */
export const RESOURCE_RELOAD_DELAY = 5 * 60 * 1000; // 5 Minuten