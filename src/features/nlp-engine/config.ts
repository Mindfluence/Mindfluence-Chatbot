/**
 * Konfigurationsdatei für die NLP-Engine
 * 
 * Diese Datei enthält alle Konfigurationseinstellungen für die NLP-Engine,
 * einschließlich Modellpfade, Schwellenwerte und Feature-Flags.
 */

import type { NLPEngineConfig, Language } from '@/types/nlp.types';

/**
 * Hauptkonfigurationsobjekt für die NLP-Engine
 */
export const config: NLPEngineConfig = {
  // Standard-Sprache
  defaultLanguage: 'de',
  
  // Basis-Verzeichnis für NLP-Modelle (angepasst auf lokalen Pfad)
  modelBasePath: './models',
  
  // Schwellenwerte für Intent-Erkennung (beibehalten für Abwärtskompatibilität)
  // @deprecated - Bitte nutze stattdessen config.nlp.intentThresholds
  intentThresholds: {
    high: 0.8,    // Hohe Konfidenz - kann ohne Rückfrage verwendet werden
    medium: 0.5,  // Mittlere Konfidenz - evtl. Rückfrage nötig
    low: 0.3,     // Niedrige Konfidenz - sollte Rückfrage erfordern
  },
  
  // NLP-spezifische Konfiguration
  nlp: {
    modelBasePath: './models',
    
    // Erweiterte Schwellenwerte für Intent-Erkennung 
    intentThresholds: {
      // Allgemeine Konfidenz-Level
      high: 0.8,    // Hohe Konfidenz - kann ohne Rückfrage verwendet werden
      medium: 0.5,  // Mittlere Konfidenz - evtl. Rückfrage nötig
      low: 0.3,     // Niedrige Konfidenz - sollte Rückfrage erfordern
      
      // Typspezifische Schwellenwerte für verschiedene Intent-Typen
      byType: {
        faq: 0.35,          // FAQ-Intents benötigen mittlere Konfidenz
        smalltalk: 0.30,    // Smalltalk kann mit niedrigerer Konfidenz akzeptiert werden
        function: 0.45,     // Funktions-Intents erfordern höhere Konfidenz
        default: 0.40       // Standard-Schwellenwert für andere Intent-Typen
      }
    },
    
    // Feature-Flags
    useSentimentAnalysis: true,
    useContextTracking: true,
    useFallbackResponse: true,
    useSemanticIntentRefinement: false, // Deaktiviert, da Embeddings Probleme verursachen
    
    // AKTUALISIERTE KONFIGURATION: Generatives LLM mit lokalem Pfad
    generativeLLM: {
      enabled: true,                    // Generativer Modus aktiviert
      modelName: './models/gpt2-small', // Lokaler Pfad zum Modell
      temperature: 0.7,                 // Kreativität des Modells (0.0 - 1.0)
      maxLength: 150,                   // Maximale Anzahl Token für die Generierung
      loadOnStartup: true,              // Modell beim Start laden
      useHybridMode: true,              // Kombination aus regelbasiert und generativ
      
      // Hybridmodus-Einstellungen
      hybridMode: {
        // Wann wird generative Antwort bevorzugt?
        preferGenerative: {
          lowConfidence: true,         // Bei niedriger Intent-Konfidenz
          unknownIntent: true,         // Bei unbekanntem Intent
          followUp: true,              // Bei Folgefragen
        },
        // Intent-Typen, bei denen generative Antworten bevorzugt werden
        preferredIntentTypes: ['smalltalk', 'unknown'],
        // Intent-Typen, bei denen regelbasierte Antworten bevorzugt werden
        preferredRuleBasedTypes: ['function', 'faq'],
        // Schwellenwert für die Konfidenz, unterhalb dessen generative Antworten bevorzugt werden
        confidenceThreshold: 0.5
      },
      
      // Prompt-Einstellungen
      promptConfig: {
        systemPrompt: {
          de: "Du bist ein hilfreicher Assistent für die Mindfluence App, eine Anwendung für Persönlichkeitsentwicklung und mentales Training. Antworte kurz und präzise, aber sei freundlich und hilfreich.",
          en: "You are a helpful assistant for the Mindfluence App, an application for personal development and mental training. Answer concisely but be friendly and helpful."
        },
        // Maximale Länge der Konversationshistorie im Prompt
        maxHistoryLength: 5,
        // Ob Intent und Entitäten im Prompt berücksichtigt werden sollen
        includeIntentInfo: true,
        includeEntityInfo: true
      }
    },
    
    // Verzögerungszeit (ms) für natürlicheres Bot-Verhalten
    responseDelay: {
      min: 500,        // Minimale Verzögerung
      maxPerChar: 10,  // Maximale zusätzliche Verzögerung pro Zeichen 
      max: 3000,       // Absolute Obergrenze für Verzögerung
    },
    
    // Cache-Einstellungen
    modelCaching: {
      enabled: true,
      maxAge: 3600000, // Cache-Lebensdauer in Millisekunden (1 Stunde)
    },
    
    // Lokalisierung
    defaultLanguage: 'de',
    supportedLanguages: ['de', 'en'],
    
    // Logging-Einstellungen
    logging: {
      enabled: true,
      level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
      saveToFile: false,
    },
    
    // Einstellungen für das Kontext-Management
    contextManagement: {
      maxContextWindow: 10,           // Maximale Anzahl von Nachrichten für Kontext-Betrachtung
      maxCachedConversations: 20,     // Maximale Anzahl von Gesprächsabläufen im Cache
      persistentEntityTypes: [        // Entity-Typen, die über Turns hinweg bestehen bleiben sollen
        'user', 'location', 'product', 'service', 'feature', 'category'
      ],
      highConfidenceThreshold: 0.8,   // Schwellenwert für hohe Konfidenz bei Entitäten
      enableEnhancedContext: true,    // Aktiviert erweiterte Kontext-Features (Sentiment, etc.)
      contextCacheTimeout: 30 * 60 * 1000, // Timeout für Kontext-Cache in Millisekunden (30 Min)
    },
    
    // Pfad für die Speicherung von Embedding-Vektoren
    embeddingStoragePath: './data/embeddings',
    
    // AI-Konfiguration für den EmbeddingManager und verwandte KI-Features
    ai: {
      // Embedding-Modell-Konfiguration (aktualisierte Pfade)
      embeddingModel: {
        modelPath: './models/embeddings/multilingual-e5-small/model.onnx',  // Angepasster Pfad zur ONNX-Datei
        tokenizerPath: './models/embeddings/multilingual-e5-small',  // Angepasster Pfad zum Tokenizer-Verzeichnis
        name: 'multilingual-e5-small',  // Name des Modells
        dimension: 384,                 // Dimension der Embeddings (geändert zu 384 für das e5-small-Modell)
        maxSeqLength: 256,              // Maximale Sequenzlänge (erhöht für längere Texte)
        // Zusätzliche Parameter für das Embedding-Modell
        parameters: {
          cacheResults: true,           // Caching von Embedding-Ergebnissen
          normalizeVectors: true,       // Vektoren normalisieren
          poolingStrategy: 'mean',      // Pooling-Strategie (mean, cls, max)
          batchSize: 16                 // Batch-Größe für Embedding-Berechnungen
        }
      },
      
      // Einstellungen für semantische Suche/Ähnlichkeitsvergleich
      semanticSearch: {
        similarityThreshold: 0.70,     // Angepasster Schwellenwert für Ähnlichkeitsvergleich
        maxResults: 5,                 // Maximale Anzahl von Ergebnissen
        useContextWeighting: true,     // Kontext-basierte Gewichtung
        // Neue Parameter für die Intent-Verfeinerung
        intentRefinement: {
          fusionMethod: 'weighted',    // Methode zur Fusion (weighted, max, override)
          minConfidenceGain: 0.15,     // Mindestverbesserung, um Intent zu ersetzen
          highConfidenceThreshold: 0.85, // Schwellenwert, ab dem keine Verbesserung mehr nötig ist
          fallbackToSemantic: true,    // Fallback auf semantische Ergebnisse bei niedrigen Konfidenzwerten
          useExampleWeighting: true    // Gewichtung basierend auf Beispielanzahl
        }
      },
      
      // Sprachmodell-Konfiguration (angepasst auf lokalen Modus)
      languageModel: {
        modelType: 'local',           // Auf 'local' gesetzt statt 'remote'
        maxTokens: 256,
        temperature: 0.7
      }
    }
  },
  
  // Modellkonfigurationen
  models: {
    // Intent-Modell Konfiguration
    intent: {
      // Modell-spezifische Parameter
      parameters: {
        method: 'hybrid', // Geändert zu 'hybrid' für Kombination aus regelbasiert und ML
        maxCandidates: 3,
        fallbackIntent: 'unknown'
      }
    },
    
    // Entity-Modell Konfiguration
    entity: {
      // Modell-spezifische Parameter
      parameters: {
        method: 'rule-based', // Alternativen: 'ml', 'hybrid'
        allowPartialMatches: true
      }
    },
    
    // Kontext-Modell Konfiguration
    context: {
      // Modell-spezifische Parameter
      parameters: {
        maxHistoryLength: 10,
        sessionTimeout: 30 * 60 * 1000, // 30 Minuten
        useDecayingWeights: true,
        // Parameter für erweitertes Kontext-Management
        enhancedContextFeatures: {
          enableSentimentAnalysis: true,
          enableTopicDetection: true,
          enableContextBreakDetection: true,
          enableIntentTransitionTracking: true,
          enableComplexityAssessment: true
        }
      }
    },
    
    // Sentiment-Modell Konfiguration (optional)
    sentiment: {
      // Modell-spezifische Parameter
      parameters: {
        source: 'rule-based', // Alternativen: 'ml', 'hybrid'
        threshold: 0.5
      }
    },
    
    // Generatives Modell Konfiguration (neu hinzugefügt)
    generative: {
      modelPath: './models/gpt2-small',
      parameters: {
        temperature: 0.7,
        maxLength: 150,
        model_max_length: 1024,
        local: true,
        useLocalModel: true
      }
    }
  },
  
  // Fallback-Antworten nach Sprache und Kategorie
  fallbacks: {
    de: {
      general: [
        "Entschuldigung, ich habe das nicht verstanden. Könntest du das anders formulieren?",
        "Das ist mir leider nicht klar. Kannst du das genauer erklären?",
        "Ich bin mir nicht sicher, was du meinst. Kannst du es bitte nochmal versuchen?"
      ],
      intent: [
        "Ich verstehe deine Absicht nicht ganz. Kannst du es anders formulieren?",
        "Leider kann ich nicht erkennen, was du möchtest. Könntest du es genauer beschreiben?"
      ],
      entity: [
        "Ich habe Schwierigkeiten, die wichtigen Informationen zu erkennen. Könntest du das bitte genauer beschreiben?"
      ]
    },
    en: {
      general: [
        "Sorry, I didn't understand that. Could you rephrase it?",
        "I'm not sure what you mean. Could you explain in more detail?",
        "I'm having trouble understanding. Can you try again differently?"
      ],
      intent: [
        "I'm not quite understanding your intention. Could you phrase it differently?",
        "I can't determine what you want. Could you describe it more precisely?"
      ],
      entity: [
        "I'm having trouble identifying the important information. Could you please describe it more specifically?"
      ]
    }
  },
  
  // AI-spezifische Konfiguration (für die Hauptebene)
  ai: {
    modelBasePath: './models',
    onnxThreads: 4,
    onnxLogLevel: 'warning',
    onnxSimd: true,
    onnxProxy: false,
    onnxInitTimeout: 30000
  }
};