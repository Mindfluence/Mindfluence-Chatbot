/**
 * Theme-Konfiguration
 * 
 * Diese Datei definiert das Theme-System der Anwendung
 * mit Farbpaletten, Typografie und anderen Design-Tokens.
 * Sie erweitert die Tailwind-Konfiguration und ermöglicht
 * konsistentes Styling über die gesamte Anwendung.
 */

import type { ThemeMode } from '../lib/constants';

// ============================
// Basis-Farbpalette
// ============================

/**
 * Primäre Farbpalette für die gesamte Anwendung
 * Jede Farbe hat Abstufungen von 50-900
 */
export const colors = {
  primary: {
    50: '#ecf5fc',
    100: '#d9ebf9',
    200: '#b3d7f2',
    300: '#8ec3ec',
    400: '#68afe5',
    500: '#429bdf', // Hauptfarbe
    600: '#357cb2',
    700: '#285d86',
    800: '#1a3e59',
    900: '#0d1f2d',
  },
  secondary: {
    50: '#f0f5f9',
    100: '#e1ebf2',
    200: '#c3d7e6',
    300: '#a5c3d9',
    400: '#87afcc',
    500: '#699bc0', // Hauptfarbe
    600: '#547c9a',
    700: '#3f5d73',
    800: '#2a3e4d',
    900: '#151f26',
  },
  accent: {
    50: '#ede9f6',
    100: '#dbd3ed',
    200: '#b7a7db',
    300: '#927bc9',
    400: '#6e4fb7',
    500: '#4a23a5', // Hauptfarbe
    600: '#3b1c84',
    700: '#2d1563',
    800: '#1e0e42',
    900: '#0f0721',
  },
  success: {
    50: '#edf7f1',
    100: '#dbefe3',
    200: '#b7dfc7',
    300: '#94d0ab',
    400: '#70c08f',
    500: '#4cb073', // Hauptfarbe
    600: '#3d8d5c',
    700: '#2e6a45',
    800: '#1e462e',
    900: '#0f2317',
  },
  warning: {
    50: '#fdf6e9',
    100: '#faecd2',
    200: '#f5daa6',
    300: '#f0c779',
    400: '#ebb54d',
    500: '#e6a220', // Hauptfarbe
    600: '#b8821a',
    700: '#8a6113',
    800: '#5c410d',
    900: '#2e2006',
  },
  error: {
    50: '#fbeaed',
    100: '#f7d5db',
    200: '#efacb7',
    300: '#e78293',
    400: '#df596f',
    500: '#d7304b', // Hauptfarbe
    600: '#ac263c',
    700: '#811d2d',
    800: '#56131e',
    900: '#2b090f',
  },
  neutral: {
    50: '#f7f7f8',
    100: '#eeeef1',
    200: '#dddde3',
    300: '#ccced5',
    400: '#bbbed8',
    500: '#aaaeba', // Hauptfarbe
    600: '#888b95',
    700: '#666870',
    800: '#44454b',
    900: '#222225',
  },
  // Semantische Farben für spezifische Komponenten wie den Chat
  chat: {
    userBg: '#429bdf',      // Benutzer-Nachrichtenhintergrund (primary.500)
    userText: '#ffffff',    // Benutzer-Nachrichtentext
    botBg: '#f7f7f8',       // Bot-Nachrichtenhintergrund (neutral.50)
    botText: '#222225',     // Bot-Nachrichtentext (neutral.900)
    inputBg: '#ffffff',     // Eingabefeld-Hintergrund
    inputText: '#222225',   // Eingabefeld-Text
    inputBorder: '#dddde3', // Eingabefeld-Rand (neutral.200)
    timestamp: '#888b95',   // Zeitstempel (neutral.600)
  }
};

// ============================
// Erweiterte Themekonfiguration
// ============================

/**
 * Allgemeine Typdefinition für die Theme-Konfiguration
 */
export interface ThemeConfig {
  colors: typeof colors;
  borderRadius: Record<string, string>;
  fontSize: Record<string, [string, { lineHeight: string }]>;
  fontFamily: Record<string, string[]>;
  boxShadow: Record<string, string>;
  transition: Record<string, string>;
  zIndex: Record<string, number>;
}

/**
 * Die Haupttheme-Konfiguration
 */
export const themeConfig: ThemeConfig = {
  colors,
  
  // Abgerundete Ecken für verschiedene Komponenten
  borderRadius: {
    none: '0',
    sm: '0.125rem',
    default: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
    '2xl': '1rem',
    '3xl': '1.5rem',
    full: '9999px',
  },
  
  // Schriftgrößen mit entsprechenden Zeilenhöhen
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    '5xl': ['3rem', { lineHeight: '1' }],
    '6xl': ['3.75rem', { lineHeight: '1' }],
  },
  
  // Schriftfamilien
  fontFamily: {
    sans: [
      'var(--font-inter)',
      'ui-sans-serif',
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      '"Noto Sans"',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
      '"Noto Color Emoji"',
    ],
    serif: [
      'ui-serif', 
      'Georgia', 
      'Cambria', 
      '"Times New Roman"', 
      'Times', 
      'serif'
    ],
    mono: [
      'ui-monospace',
      'SFMono-Regular',
      'Menlo',
      'Monaco',
      'Consolas',
      '"Liberation Mono"',
      '"Courier New"',
      'monospace',
    ],
  },
  
  // Schatten für verschiedene Erhebungen
  boxShadow: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    default: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
    outline: '0 0 0 3px rgba(66, 153, 225, 0.5)',
    none: 'none',
  },
  
  // Übergangseffekte
  transition: {
    DEFAULT: 'all 0.3s ease',
    fast: 'all 0.15s ease',
    slow: 'all 0.5s ease',
  },
  
  // Z-Index-Werte für Stapelreihenfolge
  zIndex: {
    auto: 0,
    0: 0,
    10: 10,
    20: 20,
    30: 30,
    40: 40,
    50: 50,
    chatWidget: 100,
    modal: 200,
    tooltip: 300,
  },
};

// ============================
// Dark Mode Overrides
// ============================

/**
 * Dark-Mode-Überschreibungen für bestimmte Farbwerte
 */
export const darkModeOverrides = {
  chat: {
    botBg: '#2a2a2e',          // Dunklerer Hintergrund für Bot-Nachrichten
    botText: '#f7f7f8',         // Hellerer Text für Bot-Nachrichten
    inputBg: '#1e1e20',         // Dunklerer Hintergrund für Eingabefeld
    inputText: '#f7f7f8',       // Hellerer Text für Eingabefeld
    inputBorder: '#44454b',     // Dunklerer Rand für Eingabefeld
    timestamp: '#aaaeba',       // Hellerer Zeitstempel
  }
};

// ============================
// Theme-Utility-Funktionen
// ============================

/**
 * Gibt die aktuelle Theme-Mode aus dem document.documentElement
 * oder den localStorage zurück
 */
export function getThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  
  // Versuche zuerst, den Wert aus dem data-theme-Attribut zu lesen
  const dataTheme = document.documentElement.getAttribute('data-theme');
  if (dataTheme === 'dark' || dataTheme === 'light') {
    return dataTheme;
  }
  
  // Fallback: Versuche, den Wert aus dem localStorage zu lesen
  try {
    const storedTheme = localStorage.getItem('mindfluence-chatbot-theme');
    if (storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system') {
      return storedTheme;
    }
  } catch (error) {
    console.error('Fehler beim Lesen des Themes aus localStorage:', error);
  }
  
  return 'system';
}

/**
 * Setzt den Theme-Modus im document.documentElement
 * und speichert ihn im localStorage
 */
export function setThemeMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  
  try {
    // Speichere die Benutzereinstellung im localStorage
    localStorage.setItem('mindfluence-chatbot-theme', mode);
    
    // Wende den Theme-Modus direkt an
    if (mode === 'system') {
      const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', systemDarkMode ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', mode);
    }
    
    // Sende ein Event, damit andere Komponenten reagieren können
    const event = new CustomEvent('mindfluence-theme-change', { detail: { mode } });
    document.dispatchEvent(event);
  } catch (error) {
    console.error('Fehler beim Setzen des Themes:', error);
  }
}

/**
 * Initialisiert das Theme beim ersten Laden
 */
export function initializeTheme(): void {
  if (typeof window === 'undefined') return;
  
  // Lese den gespeicherten Modus
  const mode = getThemeMode();
  
  // Wenn der Modus 'system' ist, verwende die Systemeinstellung
  if (mode === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const systemDarkMode = mediaQuery.matches;
    document.documentElement.setAttribute('data-theme', systemDarkMode ? 'dark' : 'light');
    
    // Überwache Änderungen der Systemeinstellung
    mediaQuery.addEventListener('change', (e) => {
      if (getThemeMode() === 'system') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

export default themeConfig;