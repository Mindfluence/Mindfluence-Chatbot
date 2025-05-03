/**
 * Konfigurationsdatei für die Frontend-Chatbot-Komponente
 * 
 * Diese Datei enthält Einstellungen für das Frontend des Chatbots,
 * getrennt von der NLP-Engine-Konfiguration.
 */

// Unterstützte Sprachen
export type Language = 'de' | 'en';

/**
 * Hauptkonfigurationsobjekt für den Chatbot
 */
export const config = {
  // Standard-Sprache
  defaultLanguage: 'de' as Language,
  
  // UI-Einstellungen
  ui: {
    // Maximale Anzahl sichtbarer Nachrichten im Chat-Fenster
    maxVisibleMessages: 50,
    
    // Animationsdauer in Millisekunden
    animationDuration: 300,
    
    // Automatisches Scrollen
    autoScroll: true,
    
    // Avatar-Einstellungen
    avatars: {
      bot: '/images/bot-avatar.png',
      user: '/images/user-avatar.png'
    },
    
    // Standardmäßiger Öffnungszustand
    defaultOpen: false,
    
    // Eingabefeld-Einstellungen
    inputField: {
      placeholder: {
        de: 'Schreibe eine Nachricht...',
        en: 'Type a message...'
      },
      maxLength: 500,
      submitOnEnter: true
    },
    
    // Schaltflächen-Labels
    buttonLabels: {
      send: {
        de: 'Senden',
        en: 'Send'
      },
      open: {
        de: 'Chat öffnen',
        en: 'Open chat'
      },
      close: {
        de: 'Schließen',
        en: 'Close'
      }
    }
  },
  
  // Nachrichten-Einstellungen
  messages: {
    // Maximale Nachrichtenlänge
    maxLength: 500,
    
    // Tipp-Simulation-Einstellungen (für natürlicheres Verhalten)
    typing: {
      // Tippverzögerung (ms pro Zeichen)
      delayPerCharacter: 10,
      
      // Minimale Verzögerung für beliebige Nachricht (ms)
      minDelay: 500,
      
      // Maximale Verzögerung für beliebige Nachricht (ms)
      maxDelay: 2000,
      
      // Tipp-Simulation aktivieren/deaktivieren
      enabled: true,
      
      // Text der Tipp-Anzeige
      indicator: {
        de: 'Assistent schreibt...',
        en: 'Assistant is typing...'
      }
    },
    
    // Vorgefertigte Nachrichten
    predefined: {
      welcome: {
        de: "Willkommen! Wie kann ich dir helfen?",
        en: "Welcome! How can I help you?"
      },
      error: {
        de: "Entschuldigung, es ist ein Fehler aufgetreten. Bitte versuche es später noch einmal.",
        en: "Sorry, an error occurred. Please try again later."
      }
    }
  },
  
  // Theme-Einstellungen
  theme: {
    // Primärfarben
    primary: '#3b82f6',
    secondary: '#4f46e5',
    
    // Bot-Nachrichtenfarben
    botMessage: {
      background: '#f0f7ff',
      text: '#1e3a8a'
    },
    
    // Benutzer-Nachrichtenfarben
    userMessage: {
      background: '#3b82f6',
      text: '#ffffff'
    },
    
    // Fehler-Nachrichtenfarben
    errorMessage: {
      background: '#fee2e2',
      text: '#b91c1c'
    },
    
    // Dunkles Theme (optional)
    dark: {
      botMessage: {
        background: '#1e2937',
        text: '#d1d5db'
      },
      userMessage: {
        background: '#2563eb',
        text: '#ffffff'
      }
    }
  },
  
  // API-Einstellungen
  api: {
    // Endpunkt für Chatbot-Anfragen
    endpoint: '/api/chatbot',
    
    // Timeout in Millisekunden
    timeout: 10000,
    
    // Maximal zulässige Nachrichtenhistorie, die zum Server gesendet wird
    maxHistoryLength: 10,
    
    // Fehler-Handling
    errorHandling: {
      retryCount: 2,
      retryDelay: 1000
    }
  },
  
  // Integrationseinstellungen für die Context-Management-Funktionen
  contextManagement: {
    // Aktiviert erweiterte Kontext-Features im Frontend
    enableEnhancedContext: true,
    
    // Speichert Kontext im lokalen Speicher, um ihn bei Neuladen der Seite beizubehalten
    persistContextInLocalStorage: true,
    
    // Maximale Anzahl gespeicherter Konversationen
    maxStoredConversations: 5,
    
    // Lebensdauer des lokalen Kontextes in Millisekunden (24 Stunden)
    contextExpiry: 24 * 60 * 60 * 1000
  }
};

export default config;