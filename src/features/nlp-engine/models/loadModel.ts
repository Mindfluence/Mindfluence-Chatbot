import type { NLPModel, ModelType, Language, ModelOptions, Entity, IntentItem, EntityItem } from '@/types/nlp.types';
import { config } from '../config';
import { basicTokenize, jaccardSimilarity } from '../utils/tokenizer';
import type { ModelMetadata, AIModelType } from '@/features/nlp-engine/ai/models/modelRegistry';
// Keep the Node.js imports
import * as fs from 'fs';
import * as path from 'path';

// Cache für bereits geladene Modelle, um wiederholtes Laden zu vermeiden
const modelCache: Record<string, NLPModel> = {};

/**
 * Generiert einen eindeutigen Schlüssel für das Modell-Caching basierend auf Typ und Sprache
 */
const getModelCacheKey = (modelType: ModelType, language: Language, options?: ModelOptions): string => {
  const baseKey = `${modelType}_${language}`;
  if (!options) return baseKey;
  
  // Füge modellspezifische Optionen zum Schlüssel hinzu, falls vorhanden
  const optionsKey = Object.entries(options)
    .map(([key, value]) => `${key}_${value}`)
    .join('_');
    
  return optionsKey ? `${baseKey}_${optionsKey}` : baseKey;
};

/**
 * Erstellt die Standardeigenschaften für ein NLPModel-Objekt
 */
function createBaseModelProperties(modelType: ModelType, data: any = null): Partial<NLPModel> {
  const currentTime = Date.now();
  const modelId = `${modelType}_${currentTime}`;
  const metadata: ModelMetadata = {
    modelId: modelId,
    type: modelType as AIModelType,
    lastAccessed: currentTime,
    framework: 'rule-based',
    cached: false,
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  };
  
  return {
    type: modelType as AIModelType,
    data,
    modelId: modelId,
    metadata: metadata,
    instance: Math.random().toString(36).substring(2, 15),
    getInfo: () => metadata
  };
}

/**
 * WICHTIGE FUNKTION: Stellt sicher, dass das Modell eine gültige predict-Funktion hat
 * Diese Funktion wird sowohl beim Erstellen als auch beim Abrufen aus dem Cache verwendet
 */
function ensureModelHasPredictFunction(model: NLPModel, modelType: ModelType): NLPModel {
  // Überprüfe, ob das Modell existiert
  if (!model) {
    console.error(`[ensureModelHasPredictFunction] Modell ist null oder undefined - erstelle Fallback`);
    return createFallbackModel(modelType);
  }

  // Detaillierte Überprüfung der predict-Funktion
  if (!model.predict) {
    console.error(`[ensureModelHasPredictFunction] Modell hat keine predict-Eigenschaft - erstelle Fallback`);
    return createFallbackModel(modelType);
  }

  if (typeof model.predict !== 'function') {
    console.error(`[ensureModelHasPredictFunction] model.predict ist keine Funktion, sondern ${typeof model.predict} - erstelle Fallback`);
    console.dir(model.predict); // Mehr Informationen für Debugging
    return createFallbackModel(modelType);
  }

  // Überprüfe, ob getInfo vorhanden ist
  if (!model.getInfo || typeof model.getInfo !== 'function') {
    console.warn(`[ensureModelHasPredictFunction] Modell hat keine gültige getInfo-Funktion - füge sie hinzu`);
    model.getInfo = () => ({
      modelId: model.modelId || `${modelType}_${Date.now()}`,
      type: model.type || (modelType as AIModelType),
      lastAccessed: Date.now(),
      framework: 'rule-based',
      cached: false
    });
  }

  // Überprüfe, ob instance vorhanden ist
  if (!model.instance) {
    console.warn(`[ensureModelHasPredictFunction] Modell hat keine instance-Eigenschaft - füge sie hinzu`);
    model.instance = Math.random().toString(36).substring(2, 15);
  }

  // Zusätzlicher Schutz: Wrappen der predict-Funktion in einen try-catch-Block
  const originalPredict = model.predict;
  
  // Angepasste predict-Funktion, die mit unterschiedlichen Eingabetypen umgehen kann
  model.predict = async (input: any) => {
    try {
      // Wir rufen die originalPredict Funktion mit dem korrekten Argumenttyp auf
      return await originalPredict(input);
    } catch (error) {
      console.error(`[model.predict] Fehler bei Ausführung von predict für ${modelType}:`, error);
      // Fallback-Ergebnis basierend auf Modelltyp zurückgeben
      switch (modelType) {
        case 'intent':
          return { name: 'error_predict_failed', confidence: 0.1, type: 'unknown' };
        case 'entity':
          return [] as Entity[];
        case 'context':
          return { context: 'error', confidence: 0.1 };
        default:
          return { error: 'predict_failed', confidence: 0 };
      }
    }
  };

  console.log(`[ensureModelHasPredictFunction] Modell überprüft und sicher gemacht: ${modelType}`);
  return model;
}

/**
 * Lädt ein NLP-Modell für den spezifizierten Typ und die Sprache
 * 
 * @param modelType - Art des zu ladenden Modells (intent, entity, sentiment, etc.)
 * @param language - Sprachcode (de, en, etc.)
 * @param options - Zusätzliche Optionen für das Modell (Größe, Genauigkeit, etc.)
 * @param forceReload - Wenn true, wird der Cache ignoriert und das Modell neu geladen
 * @returns Das geladene NLP-Modell
 */
export async function loadModel(
  modelType: ModelType,
  language: Language = 'de',
  options?: ModelOptions,
  forceReload: boolean = false
): Promise<NLPModel> {
  try {
    // Cache-Schlüssel erstellen
    const cacheKey = getModelCacheKey(modelType, language, options);
    
    // Prüfen, ob das Modell bereits im Cache ist und ob Neuladen nicht erzwungen wird
    if (!forceReload && modelCache[cacheKey]) {
      console.log(`[loadModel] Modell aus Cache geladen: ${cacheKey}`);
      
      // VERBESSERUNG: Verwende die gemeinsame Funktion zur Überprüfung des gecachten Modells
      return ensureModelHasPredictFunction(modelCache[cacheKey], modelType);
    }
    
    console.log(`[loadModel] Lade Modell: ${modelType} für Sprache: ${language}`);
    
    // Basispfad für Modelle aus der Konfiguration
    const modelBasePath = (config && config.nlp && config.nlp.modelBasePath) || './models';
    
    // Modellspezifischer Pfad
    const modelPath = `${modelBasePath}/${modelType}/${language}`;
    
    // Je nach Modelltyp unterschiedliche Ladelogik verwenden
    let model: NLPModel;
    
    try {
      switch (modelType) {
        case 'intent':
          model = await loadIntentDetectionModel(modelPath, language, options);
          break;
        case 'entity':
          model = await loadEntityExtractionModel(modelPath, language, options);
          break;
        case 'sentiment':
          model = await loadSentimentAnalysisModel(modelPath, options);
          break;
        case 'context':
          model = await loadContextModel(modelPath, options);
          break;
        default:
          throw new Error(`Unbekannter Modelltyp: ${modelType}`);
      }
      
      // Sicherstellen, dass model definiert ist
      if (!model) {
        console.error(`[loadModel] Modell konnte nicht geladen werden: ${modelType}`);
        model = createFallbackModel(modelType);
      }
      
    } catch (modelLoadError) {
      console.error(`[loadModel] Fehler beim Laden des spezifischen Modells (${modelType}):`, modelLoadError);
      model = createFallbackModel(modelType);
    }
    
    // VERBESSERUNG: Verwende die gemeinsame Funktion zur Überprüfung des neu geladenen Modells
    model = ensureModelHasPredictFunction(model, modelType);
    
    // Modell im Cache speichern
    modelCache[cacheKey] = model;
    
    return model;
  } catch (error) {
    console.error(`[loadModel] Allgemeiner Fehler beim Laden des Modells (${modelType}, ${language}):`, error);
    
    // Erstelle ein Notfall-Modell anstatt einen Fehler zu werfen
    const fallbackModel = createFallbackModel(modelType);
    
    // Fallback-Modell NICHT cachen, damit bei nächstem Aufruf ein erneuter Versuch stattfindet
    // modelCache[cacheKey] = fallbackModel;
    
    return fallbackModel;
  }
}

/**
 * Erstellt ein minimales Fallback-Modell, das zumindest nicht abstürzt
 */
function createFallbackModel(modelType: ModelType): NLPModel {
  console.log(`[loadModel] Erstelle Fallback-Modell für Typ: ${modelType}`);
  
  // Basismodell erstellen mit den erforderlichen Eigenschaften
  const currentTime = Date.now();
  const modelId = `${modelType}_fallback_${currentTime}`;
  const metadata: ModelMetadata = {
    modelId: modelId,
    type: modelType as AIModelType,
    lastAccessed: currentTime,
    framework: 'rule-based',
    cached: false,
    createdAt: new Date().toISOString(),
    version: '1.0.0'
  };
  
  const baseModel: NLPModel = {
    type: modelType as AIModelType,
    modelId: modelId,
    metadata: metadata,
    instance: `fallback_${Math.random().toString(36).substring(2, 15)}`,
    getInfo: () => metadata,
    predict: async () => ({ error: 'fallback_model', confidence: 0 })
  };
  
  // Je nach Modelltyp ein unterschiedliches Fallback erstellen
  switch (modelType) {
    case 'intent':
      return {
        ...baseModel,
        predict: async (input: string | string[]) => {
          // Einfache Keyword-basierte Intent-Erkennung als Fallback
          const text = Array.isArray(input) ? input.join(' ') : input;
          // Tokenisiere den Input
          const tokens = basicTokenize(text, { toLowerCase: true });
          
          // Grundlegende Intents erkennen basierend auf Tokens
          if (tokens.includes('hallo') || tokens.includes('hi') || tokens.includes('tag')) {
            return { name: 'greeting', confidence: 0.7, type: 'smalltalk' };
          } else if (tokens.includes('danke') || tokens.includes('dankeschön')) {
            return { name: 'thanks', confidence: 0.7, type: 'smalltalk' };
          } else if (tokens.includes('tschüss') || tokens.includes('wiedersehen')) {
            return { name: 'farewell', confidence: 0.7, type: 'smalltalk' };
          }
          
          return { name: 'fallback_intent', confidence: 0.1, type: 'unknown' };
        }
      };
    case 'entity':
      return {
        ...baseModel,
        predict: async () => [] as Entity[]
      };
    case 'sentiment':
      return {
        ...baseModel,
        predict: async () => ({ sentiment: 'neutral', score: 0, confidence: 0.1 })
      };
    case 'context':
      return {
        ...baseModel,
        predict: async (input: any) => {
          // Akzeptiere sowohl einfache als auch komplexe Eingaben
          return { context: 'fallback', confidence: 0.1 };
        }
      };
    default:
      return baseModel;
  }
}

/**
 * Lädt ein Intent-Detektionsmodell mit verbesserter Erkennungslogik
 */
async function loadIntentDetectionModel(modelPath: string, language: Language = 'de', options?: ModelOptions): Promise<NLPModel> {
  try {
    // Lade die Intents-Daten aus der entsprechenden Sprachdatei
    console.log(`[loadIntentDetectionModel] Lade Intent-Modell aus: @/data/chatbot/database/intents_${language}.json`);
    
    let intentsData;
    try {
      // VERBESSERUNG: Robustere Importlogik
      try {
        // Versuche erst den direkten Import
        const importedModule = await import(`@/data/chatbot/database/intents_${language}.json`);
        intentsData = importedModule.default || importedModule;
      } catch (importError) {
        // Fallback: Versuche den relativen Pfad vom aktuellen Arbeitsverzeichnis
        console.log(`[loadIntentDetectionModel] Erster Import fehlgeschlagen, versuche alternativen Pfad...`);
        
        try {
          // Versuche zuerst den relativen Pfad vom App-Root
          const importedModule = await import(`../../../data/chatbot/database/intents_${language}.json`);
          intentsData = importedModule.default || importedModule;
        } catch (secondImportError) {
          // Letzter Versuch: Versuche einen absoluten Pfad mit dem aktuellen Arbeitsverzeichnis
          console.log(`[loadIntentDetectionModel] Zweiter Import fehlgeschlagen, versuche absoluten Pfad...`);
          
          const currentDir = typeof process !== 'undefined' ? (process.cwd ? process.cwd() : '') : '';
          const filePath = path.resolve(currentDir, `data/chatbot/database/intents_${language}.json`);
          
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            intentsData = JSON.parse(fileContent);
          } else {
            throw new Error(`Datei nicht gefunden: ${filePath}`);
          }
        }
      }
      
      console.log(`[loadIntentDetectionModel] JSON-Datei geladen, Daten verfügbar: ${!!intentsData}`);
    } catch (importError) {
      console.error(`[loadIntentDetectionModel] Fehler beim Importieren der JSON-Datei:`, importError);
      
      // Rückgabe eines Minimal-Modells statt Fehlerweiterleitung
      return createFallbackModel('intent');
    }
    
    // Verbesserte Daten-Extraktionslogik mit mehr Robustheit
    let intents: IntentItem[] = [];
    
    if (Array.isArray(intentsData)) {
      intents = intentsData;
    } else if (intentsData && typeof intentsData === 'object') {
      if (Array.isArray(intentsData.intents)) {
        intents = intentsData.intents;
      } else if (intentsData.default && Array.isArray(intentsData.default)) {
        intents = intentsData.default;
      } else {
        // Suche nach einem Array-Feld in den Daten
        const arrayField = Object.keys(intentsData).find(key => Array.isArray(intentsData[key]));
        if (arrayField) {
          intents = intentsData[arrayField];
        } else {
          console.warn(`[loadIntentDetectionModel] Keine Array-Struktur in den Daten gefunden`);
        }
      }
    }
    
    if (intents.length === 0) {
      console.warn(`[loadIntentDetectionModel] Keine Intents in der geladenen Datei gefunden!`);
    } else {
      console.log(`[loadIntentDetectionModel] Intent-Modell geladen mit ${intents.length} definierten Intents`);
    }
    
    // Optional: Logge die Intent-Namen und -Typen für Debugging
    if (intents.length > 0) {
      console.log('[loadIntentDetectionModel] Verfügbare Intents:');
      intents.forEach(intent => {
        const examplesCount = intent.examples ? intent.examples.length : 0;
        console.log(`- ${intent.name} (Typ: ${intent.type || 'nicht angegeben'}, ${examplesCount} Beispiele)`);
      });
    }
    
    // Erstelle ein vollständiges Modell mit allen erforderlichen Eigenschaften
    const currentTime = Date.now();
    const modelId = `intent_${currentTime}`;
    const metadata: ModelMetadata = {
      modelId: modelId,
      type: 'intent' as AIModelType,
      lastAccessed: currentTime,
      framework: 'rule-based',
      cached: false,
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // Erstelle ein verbessertes Modell-Objekt mit erweiterter Intent-Erkennungslogik
    const model: NLPModel = {
      type: 'intent' as AIModelType,
      modelId: modelId,
      metadata: metadata,
      data: intents,
      instance: `intent_${Math.random().toString(36).substring(2, 15)}`,
      getInfo: () => metadata,
      
      // Verbesserte Methodenimplementierung für die Vorhersage mit Tokenizer
      predict: async (input: string | string[]) => {
        // Handle both string and string[] inputs
        const text = Array.isArray(input) ? input.join(' ') : input;
        const normalizedText = text.toLowerCase().trim();
        
        console.log(`[intentModel.predict] Suche Intent für Text: "${normalizedText}"`);
        
        // Tokenisiere den Input für Token-basierte Vergleiche
        const inputTokens = basicTokenize(normalizedText, { toLowerCase: true });
        
        // Fallback-Intent (wird zurückgegeben, wenn nichts gefunden wird)
        let bestMatch = {
          name: 'unknown',
          confidence: 0.0,
          type: 'unknown',
        };
        
        // Prüfe, ob intents ein Array ist und durchsuche es
        if (Array.isArray(intents) && intents.length > 0) {
          // Verbesserte Matching-Logik, jetzt vollständig Token-basiert
          
          // Sammlung von Intent-Scores für jedes Intent
          const intentScores = intents.map(intent => {
            const examples = intent.examples || [];
            if (examples.length === 0) {
              return { intent, score: 0, matchType: 'none' };
            }
            
            // Verschiedene Scoring-Methoden für jedes Beispiel berechnen
            const exampleScores = examples.map(example => {
              const normalizedExample = example.toLowerCase().trim();
              
              // 1. Exakte Übereinstimmung (höchste Konfidenz)
              if (normalizedText === normalizedExample) {
                return { score: 1.0, matchType: 'exact' };
              }
              
              // 2. Token-basierte Ähnlichkeit mit jaccardSimilarity statt calculateTokenSimilarity
              const exampleTokens = basicTokenize(normalizedExample, { toLowerCase: true });
              const similarityScore = jaccardSimilarity(inputTokens, exampleTokens);
              
              // Bestimme den Typ des Matches basierend auf dem Score
              let matchType = 'none';
              if (similarityScore > 0.8) matchType = 'high';
              else if (similarityScore > 0.5) matchType = 'medium';
              else if (similarityScore > 0.3) matchType = 'low';
              
              return { score: similarityScore, matchType };
            });
            
            // Nehme den höchsten Score aller Beispiele
            const bestExampleScore = exampleScores.reduce(
              (best, current) => current.score > best.score ? current : best, 
              { score: 0, matchType: 'none' }
            );
            
            return { 
              intent, 
              score: bestExampleScore.score, 
              matchType: bestExampleScore.matchType 
            };
          });
          
          // Sortiere nach Score (höchster zuerst)
          intentScores.sort((a, b) => b.score - a.score);
          
          // Log die Top-3 Treffer für Debugging
          const top3 = intentScores.slice(0, 3);
          if (top3.length > 0) {
            console.log('[intentModel.predict] Top-3 Intent-Matches:');
            top3.forEach((match, idx) => {
              console.log(`  ${idx+1}. ${match.intent.name}: ${match.score.toFixed(2)} (${match.matchType})`);
            });
          }
          
          // Wenn wir einen Match mit ausreichender Konfidenz gefunden haben
          if (intentScores.length > 0 && intentScores[0] && intentScores[0].score > 0.3) {
            const topMatch = intentScores[0];
            
            // Erstelle das Intent-Objekt mit dem gefundenen Match
            if (topMatch && topMatch.intent) {
              bestMatch = {
                name: topMatch.intent.name,
                confidence: topMatch.score,
                // Wichtig: Verwende den in der JSON-Datei definierten Typ, wenn vorhanden
                type: topMatch.intent.type || 'unknown',
              };
              
              console.log(`[intentModel.predict] Bester Intent-Match: ${bestMatch.name} (Typ: ${bestMatch.type}, Konfidenz: ${bestMatch.confidence.toFixed(2)})`);
            }
          } else {
            console.log('[intentModel.predict] Kein Intent mit ausreichender Konfidenz gefunden');
          }
        } else {
          console.warn(`[intentModel.predict] Keine gültige Intent-Datenstruktur gefunden!`);
          
          // Minimale Intent-Erkennung hinzufügen, falls keine Intents geladen werden konnten
          if (inputTokens.includes('hallo') || inputTokens.includes('hi') || inputTokens.includes('tag')) {
            return { name: 'greeting', confidence: 0.7, type: 'smalltalk' };
          } else if (inputTokens.includes('danke') || inputTokens.includes('dankeschön')) {
            return { name: 'thanks', confidence: 0.7, type: 'smalltalk' };
          } else if (inputTokens.includes('tschüss') || inputTokens.includes('wiedersehen')) {
            return { name: 'farewell', confidence: 0.7, type: 'smalltalk' };
          }
        }
        
        return bestMatch;
      }
    };
    
    // Überprüfe, ob predict eine Funktion ist
    console.log(`[loadIntentDetectionModel] Modell erstellt. predict ist ${typeof model.predict}`);
    
    return model;
  } catch (error) {
    console.error(`[loadIntentDetectionModel] Fehler:`, error);
    
    // Fallback-Modell bei jedem Fehler
    return createFallbackModel('intent');
  }
}

/**
 * Lädt ein Entity-Extraktionsmodell mit verbesserter Regex-basierter Erkennung
 */
async function loadEntityExtractionModel(modelPath: string, language: Language = 'de', options?: ModelOptions): Promise<NLPModel> {
  try {
    console.log(`[loadEntityExtractionModel] Lade Entity-Modell aus: @/data/chatbot/database/entities_${language}.json`);
    
    let entitiesData;
    try {
      // Robuste Importlogik
      try {
        const importedModule = await import(`@/data/chatbot/database/entities_${language}.json`);
        entitiesData = importedModule.default || importedModule;
      } catch (importError) {
        try {
          const importedModule = await import(`../../../data/chatbot/database/entities_${language}.json`);
          entitiesData = importedModule.default || importedModule;
        } catch (secondImportError) {
          const currentDir = typeof process !== 'undefined' ? (process.cwd ? process.cwd() : '') : '';
          const filePath = path.resolve(currentDir, `data/chatbot/database/entities_${language}.json`);
          
          if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8');
            entitiesData = JSON.parse(fileContent);
          } else {
            throw new Error(`Datei nicht gefunden: ${filePath}`);
          }
        }
      }
    } catch (importError) {
      console.error(`[loadEntityExtractionModel] Fehler beim Importieren der JSON-Datei:`, importError);
      return createFallbackModel('entity');
    }
    
    // Extrahiere die Entity-Definitionen aus der Dateistruktur
    let entities: EntityItem[] = [];
    
    if (Array.isArray(entitiesData)) {
      entities = entitiesData;
    } else if (entitiesData && typeof entitiesData === 'object') {
      if (entitiesData.default && Array.isArray(entitiesData.default)) {
        entities = entitiesData.default;
      } else {
        const arrayField = Object.keys(entitiesData).find(key => Array.isArray(entitiesData[key]));
        if (arrayField) {
          entities = entitiesData[arrayField];
        } else {
          console.warn(`[loadEntityExtractionModel] Keine Array-Struktur in den Daten gefunden`);
        }
      }
    }
    
    console.log(`[loadEntityExtractionModel] Entity-Modell geladen mit ${entities.length} definierten Entity-Typen`);
    
    // Vorauswertung: Kompiliere Regex-Muster einmalig
    const compiledPatterns: Record<string, { pattern: RegExp, type: string, minLength: number }[]> = {};
    
    // Konvertiere die Entity-Daten in wiederverwendbare Regex-Muster
    entities.forEach(entityType => {
      // Initialisiere für jeden Entitäts-Typ ein Array im compiledPatterns-Objekt
      const entityName = entityType.name;
      if (!compiledPatterns[entityName]) {
        compiledPatterns[entityName] = [];
      }
      
      // Werte aus beiden Quellen nehmen (falls vorhanden)
      const patterns = (entityType as any).patterns || []; // Type Assertion für Regex-Muster
      const valuesToCheck = entityType.data || entityType.examples || [];
      
      // Regex-Muster kompilieren (falls vorhanden)
      patterns.forEach((patternStr: string) => {
        try {
          // Analysiere den Pattern-String (Format: pattern|flags)
          const patternParts = patternStr.split('|');
          // Stellen sicher, dass patternParts[0] existiert
          if (patternParts[0]) {
            const pattern = new RegExp(patternParts[0], patternParts.length > 1 ? patternParts[1] : 'i');
            
            // Füge das kompilierte Muster zum Array für diesen Entitäts-Typ hinzu
            const patternsArray = compiledPatterns[entityName];
            if (patternsArray) {
              patternsArray.push({
                pattern,
                type: entityName,
                minLength: 0 // Minimale Länge für Regex-basierte Treffer
              });
            }
          }
        } catch (regexError) {
          console.error(`[loadEntityExtractionModel] Fehler beim Kompilieren des Regex-Musters für ${entityName}:`, regexError);
        }
      });
      
      // Für jede Entität auch ein wortbasiertes Pattern erstellen
      if (valuesToCheck.length > 0) {
        // Für Wortlisten erstellen wir ein Muster, das nur ganze Wörter erkennt
        const wordBoundaryValues = valuesToCheck
          .filter(v => v && v.length > 2) // Nur Werte mit mehr als 2 Zeichen
          .map(value => {
            // Escape special regex characters
            const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return escapedValue;
          });
        
        if (wordBoundaryValues.length > 0) {
          try {
            // Erstelle ein Pattern, das nur vollständige Wörter (mit Wortgrenzen) erkennt 
            // und groß/kleinschreibung ignoriert
            const pattern = new RegExp(`\\b(${wordBoundaryValues.join('|')})\\b`, 'i');
            
            // Füge das wortbasierte Muster hinzu
            const patternsArray = compiledPatterns[entityName];
            if (patternsArray) {
              patternsArray.push({
                pattern,
                type: entityName,
                minLength: 3 // Minimale Länge für wortbasierte Treffer
              });
            }
          } catch (regexError) {
            console.error(`[loadEntityExtractionModel] Fehler beim Erstellen des Wortmuster-Regex für ${entityName}:`, regexError);
          }
        }
      }
    });
    
    // Erstelle ein vollständiges Modell mit allen erforderlichen Eigenschaften
    const currentTime = Date.now();
    const modelId = `entity_${currentTime}`;
    const metadata: ModelMetadata = {
      modelId: modelId,
      type: 'entity' as AIModelType,
      lastAccessed: currentTime,
      framework: 'rule-based',
      cached: false,
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // Erstelle ein verbessertes Modell mit Regex-basierter Entity-Erkennung
    const model: NLPModel = {
      type: 'entity' as AIModelType,
      modelId: modelId,
      metadata: metadata,
      data: entities,
      instance: `entity_${Math.random().toString(36).substring(2, 15)}`,
      getInfo: () => metadata,
      
      predict: async (input: string | string[]) => {
        const text = Array.isArray(input) ? input.join(' ') : input;
        const normalizedText = text.toLowerCase();
        const foundEntities: Entity[] = [];
        
        // SICHERHEITSMECHANISMUS: Begrenzen der erkannten Entities pro Typ
        const maxEntitiesPerType = 2;
        const typeCount: Record<string, number> = {};
        
        // Durchlaufe alle vorbereiteten Regex-Patterns
        Object.keys(compiledPatterns).forEach(entityType => {
          // Initialisiere Zähler für diesen Typ
          typeCount[entityType] = 0;
          
          // Stelle sicher, dass compiledPatterns[entityType] existiert
          const patternsForType = compiledPatterns[entityType];
          if (patternsForType) {
            // Durchlaufe alle Muster für diesen Typ
            patternsForType.forEach(patternData => {
              // Nur fortfahren, wenn wir das Limit für diesen Typ noch nicht erreicht haben
              const currentCount = typeCount[entityType] || 0;
              if (currentCount >= maxEntitiesPerType) return;
              
              // Suche alle Übereinstimmungen mit diesem Muster
              const matches = normalizedText.match(patternData.pattern);
              
              if (matches && matches.length > 0) {
                // Für jede gefundene Übereinstimmung
                for (const match of matches) {
                  // Prüfe, ob die Übereinstimmung die Mindestlänge erfüllt
                  if (match.length <= patternData.minLength) continue;
                  
                  // Berechne die Position im Text
                  const startIndex = normalizedText.indexOf(match.toLowerCase());
                  
                  // Nur hinzufügen, wenn wir das Limit für diesen Typ noch nicht erreicht haben
                  const currentTypeCount = typeCount[entityType] || 0;
                  if (currentTypeCount < maxEntitiesPerType) {
                    // Berechne die Konfidenz basierend auf der Länge des Matches
                    // Längere Treffer bekommen eine höhere Konfidenz
                    let confidence = Math.min(0.5 + (match.length / 20), 0.95);
                    
                    // Prioritäten für bestimmte Entity-Typen
                    // EMAIL und PHONE bekommen höhere Konfidenz, da sie strukturell eindeutiger sind
                    if (entityType === 'EMAIL' || entityType === 'PHONE_NUMBER') {
                      confidence = Math.min(confidence + 0.15, 0.98);
                    }
                    
                    // COUNTRY_NAME und LANGUAGE_NAME bekommen niedrigere Konfidenz
                    // da sie oft irrelevant oder Fehlerkennungen sein können
                    if (entityType === 'COUNTRY_NAME' || entityType === 'LANGUAGE_NAME') {
                      confidence = Math.max(confidence - 0.25, 0.3);
                    }
                    
                    // WICHTIG: Confidence-Schwellenwert für Ländernamen und Sprachen
                    // nur sehr eindeutige Treffer akzeptieren
                    if ((entityType === 'COUNTRY_NAME' || entityType === 'LANGUAGE_NAME') && confidence < 0.8) {
                      continue; // Überspringe diesen Treffer wegen zu niedriger Konfidenz
                    }
                    
                    // Füge die erkannte Entity hinzu
                    foundEntities.push({
                      type: entityType,
                      value: match,
                      start: startIndex,
                      end: startIndex + match.length,
                      confidence: confidence,
                    });
                    
                    // Erhöhe den Zähler für diesen Typ
                    typeCount[entityType] = (typeCount[entityType] || 0) + 1;
                  }
                }
              }
            });
          }
        });
        
        // Sortiere gefundene Entities nach Konfidenz (absteigend)
        // Mit Nullish Coalescing für undefined confidence-Werte
        foundEntities.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
        
        // Begrenze die Gesamtzahl der zurückgegebenen Entities
        const limitedEntities = foundEntities.slice(0, 5);
        
        // Logging für Debugging
        if (limitedEntities.length > 0) {
          console.log(`[entityModel.predict] ${limitedEntities.length} Entities gefunden: ${limitedEntities.map(e => e.type).join(', ')}`);
        } else {
          console.log(`[entityModel.predict] Keine Entities in der Anfrage gefunden`);
        }
        
        return limitedEntities;
      }
    };
    
    return model;
  } catch (error) {
    console.error(`[loadEntityExtractionModel] Fehler:`, error);
    
    // Fallback-Modell bei jedem Fehler
    return createFallbackModel('entity');
  }
}

/**
 * Lädt ein Sentimentanalyse-Modell
 */
async function loadSentimentAnalysisModel(modelPath: string, options?: ModelOptions): Promise<NLPModel> {
  try {
    // Hier würde das eigentliche Sentiment-Modell geladen
    console.log(`[loadSentimentAnalysisModel] Lade Sentiment-Modell`);

    // Erstelle ein vollständiges Modell mit allen erforderlichen Eigenschaften
    const currentTime = Date.now();
    const modelId = `sentiment_${currentTime}`;
    const metadata: ModelMetadata = {
      modelId: modelId,
      type: 'sentiment' as AIModelType,
      lastAccessed: currentTime,
      framework: 'rule-based',
      cached: false,
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    };

    // Erstelle ein einfaches Modell-Objekt
    const model: NLPModel = {
      type: 'sentiment' as AIModelType,
      modelId: modelId,
      metadata: metadata,
      instance: `sentiment_${Math.random().toString(36).substring(2, 15)}`,
      getInfo: () => metadata,
      
      // Methodenimplementierung für die Vorhersage
      predict: async (input: string | string[]) => {
        // Handle both string and string[] inputs
        const text = Array.isArray(input) ? input.join(' ') : input;
        
        // Tokensisiere für bessere Analyse
        const tokens = basicTokenize(text, { toLowerCase: true });
        
        // Positive und negative Schlüsselwörter für eine einfache Sentiment-Analyse
        const positiveWords = ['gut', 'toll', 'großartig', 'exzellent', 'wunderbar', 'schön'];
        const negativeWords = ['schlecht', 'furchtbar', 'schrecklich', 'böse', 'traurig', 'ärgerlich'];
        
        let score = 0;
        
        // Berechne einen einfachen Sentiment-Score basierend auf Tokens
        for (const word of positiveWords) {
          if (tokens.includes(word)) score += 1;
        }
        
        for (const word of negativeWords) {
          if (tokens.includes(word)) score -= 1;
        }
        
        // Klassifiziere das Sentiment basierend auf dem Score
        let sentiment;
        if (score > 0) sentiment = 'positive';
        else if (score < 0) sentiment = 'negative';
        else sentiment = 'neutral';
        
        console.log(`[sentimentModel.predict] Sentiment-Analyse: ${sentiment} (Score: ${score})`);
        
        return {
          sentiment,
          score,
          confidence: Math.min(Math.abs(score) / 3, 1), // Einfache Konfidenzberechnung
        };
      }
    };
    
    return model;
  } catch (error) {
    console.error(`[loadSentimentAnalysisModel] Fehler:`, error);
    
    // Fallback-Modell bei jedem Fehler
    return createFallbackModel('sentiment');
  }
}

/**
 * Prüft, ob ein Token in einer Liste enthalten ist und stellt sicher, dass der Typ-Check funktioniert
 */
function isStringInList(value: string | undefined, list: string[]): boolean {
  return typeof value === 'string' && list.includes(value);
}

/**
 * Lädt ein verbessertes Kontext-Tracking-Modell
 * 
 * ANGEPASST: Um mit dem neuen formatierten Input-String aus context-management.ts umzugehen
 */
async function loadContextModel(modelPath: string, options?: ModelOptions): Promise<NLPModel> {
  try {
    console.log(`[loadContextModel] Lade Kontext-Modell`);
    
    // Erstelle ein vollständiges Modell mit allen erforderlichen Eigenschaften
    const currentTime = Date.now();
    const modelId = `context_${currentTime}`;
    const metadata: ModelMetadata = {
      modelId: modelId,
      type: 'context' as AIModelType,
      lastAccessed: currentTime,
      framework: 'rule-based',
      cached: false,
      createdAt: new Date().toISOString(),
      version: '1.0.0'
    };
    
    // Erstelle ein intelligenteres Modell-Objekt basierend auf Intent-Typen und Texteigenschaften
    const model: NLPModel = {
      type: 'context' as AIModelType,
      modelId: modelId,
      metadata: metadata,
      instance: `context_${Math.random().toString(36).substring(2, 15)}`,
      getInfo: () => metadata,
      
      // Erweiterte Implementierung für die Kontextvorhersage, die das neue Eingabeformat verwendet
      predict: async (input: any) => {
        try {
          // NEU: Verarbeite das speziell formatierte Input-String-Format
          let previousContextName: string | undefined = undefined;
          let currentIntentName: string | undefined = undefined;
          let currentIntentType: string | undefined = undefined;
          let currentIntentConfidence: number = 0.5;
          let actualMessageContent: string = '';
          
          if (typeof input === 'string') {
            // Analysiere den formatierten String, um Metainformationen zu extrahieren
            console.log(`[contextModel.predict] Verarbeite formatierten Input-String: "${input.substring(0, 100)}..."`);
            
            // Extrahiere vorherigen Kontext mit Regex (wenn vorhanden)
            const prevCtxMatch = input.match(/__PREV_CTX:([a-z_]+)__/);
            if (prevCtxMatch && prevCtxMatch[1]) {
              previousContextName = prevCtxMatch[1];
              console.log(`[contextModel.predict] Extrahierter vorheriger Kontext: ${previousContextName}`);
            }
            
            // Extrahiere Intent-Name mit Regex (wenn vorhanden)
            const intentMatch = input.match(/__INTENT:([a-z_]+)__/);
            if (intentMatch && intentMatch[1]) {
              currentIntentName = intentMatch[1];
              console.log(`[contextModel.predict] Extrahierter Intent-Name: ${currentIntentName}`);
            }
            
            // Extrahiere Intent-Typ mit Regex (wenn vorhanden)
            const typeMatch = input.match(/__TYPE:([a-z_]+)__/);
            if (typeMatch && typeMatch[1]) {
              currentIntentType = typeMatch[1];
              console.log(`[contextModel.predict] Extrahierter Intent-Typ: ${currentIntentType}`);
            }
            
            // Extrahiere Intent-Konfidenz mit Regex (wenn vorhanden)
            const confMatch = input.match(/__CONF:([0-9.]+)__/);
            if (confMatch && confMatch[1]) {
              currentIntentConfidence = parseFloat(confMatch[1]);
              console.log(`[contextModel.predict] Extrahierte Intent-Konfidenz: ${currentIntentConfidence}`);
            }
            
            // Extrahiere den eigentlichen Nachrichteninhalt (alles nach den Metadaten)
            // Versuche zuerst, den Hauptteil nach allen Metadaten-Tags zu finden
            const metadataPattern = /__[A-Z_]+:[^_]+__\s*/g;
            actualMessageContent = input.replace(metadataPattern, '').trim();
            
            if (!actualMessageContent) {
              // Fallback: Nimm alles nach dem letzten "__"
              const lastTagPos = input.lastIndexOf('__');
              if (lastTagPos !== -1 && lastTagPos + 2 < input.length) {
                actualMessageContent = input.substring(lastTagPos + 2).trim();
              } else {
                // Notfall-Fallback: Verwende den gesamten String
                actualMessageContent = input;
              }
            }
            
            console.log(`[contextModel.predict] Extrahierter Nachrichteninhalt: "${actualMessageContent.substring(0, 50)}..."`);
          } else if (typeof input === 'object' && input !== null) {
            // Unterstütze weiterhin das alte Objektformat für Abwärtskompatibilität
            if (Array.isArray(input)) {
              // Array von Nachrichten
              actualMessageContent = input.join(' ');
            } else {
              // Komplexes Objekt
              if (input.messages) {
                if (Array.isArray(input.messages)) {
                  actualMessageContent = input.messages.join(' ');
                } else if (typeof input.messages === 'string') {
                  actualMessageContent = input.messages;
                }
              }
              
              previousContextName = input.previousContext;
              
              if (input.currentIntent) {
                currentIntentName = input.currentIntent.name;
                currentIntentType = input.currentIntent.type;
                currentIntentConfidence = input.currentIntent.confidence || 0.5;
              }
            }
          } else {
            // Unbekanntes Format
            console.warn(`[contextModel.predict] Unbekanntes Input-Format: ${typeof input}`);
            return { context: 'initial', confidence: 0.5 };
          }
          
          // Wenn keine aktuelle Nachricht extrahiert werden konnte, ist es initial
          if (!actualMessageContent) {
            console.log(`[contextModel.predict] Keine aktuelle Nachricht gefunden, verwende 'initial' als Fallback`);
            return { context: 'initial', confidence: 1.0 };
          }
          
          // Tokenisiere die Nachricht für bessere Analyse
          const messageTokens = basicTokenize(actualMessageContent, { toLowerCase: true, preservePunctuation: true });
          
          // VERBESSERTE KONTEXT-BESTIMMUNGS-LOGIK:
          // Nutze nun alle verfügbaren Informationen: vorheriger Kontext, aktueller Intent, Nachrichteninhalt
          
          // WICHTIG: FAQ-Intents haben höchste Priorität und überschreiben alles
          if (currentIntentType === 'faq' || (currentIntentName && currentIntentName.startsWith('faq_'))) {
            console.log(`[contextModel.predict] FAQ-Intent erkannt, setze Kontext auf 'question'`);
            return { context: 'question', confidence: 0.95 };
          }
          
          // Auswertung basierend auf Intent-Typ
          if (currentIntentType) {
            // Typen-basierte Regeln haben zweithöchste Priorität
            if (currentIntentType === 'smalltalk') {
              if (currentIntentName) {
                // Spezifische Smalltalk-Intent-Namen auswerten
                if (currentIntentName.includes('greeting')) {
                  return { context: 'initial', confidence: 0.9 };
                }
                if (currentIntentName.includes('farewell')) {
                  return { context: 'closing', confidence: 0.9 };
                }
                if (currentIntentName.includes('thank')) {
                  return { context: 'confirmation', confidence: 0.85 };
                }
              }
              // Generischer Smalltalk führt zu followup
              return { context: 'followup', confidence: 0.7 };
            } else if (currentIntentType === 'function') {
              // Funktionale Intents sind typischerweise Anweisungen
              return { context: 'instruction', confidence: 0.85 };
            }
          }
          
          // Intent-Name-basierte Auswertung
          if (currentIntentName) {
            // Prüfe auf Frage-Intents
            if (currentIntentName.includes('question') || 
                currentIntentName.startsWith('what_') || 
                currentIntentName.startsWith('how_') || 
                currentIntentName.startsWith('where_') || 
                currentIntentName.startsWith('when_') || 
                currentIntentName.startsWith('why_')) {
              return { context: 'question', confidence: 0.85 };
            }
            
            // Prüfe auf Bestätigung/Zustimmung
            if (currentIntentName.includes('confirm') || 
                currentIntentName.includes('yes') || 
                currentIntentName.includes('agree')) {
              return { context: 'confirmation', confidence: 0.9 };
            }
            
            // Prüfe auf Ablehnung/Verneinung
            if (currentIntentName.includes('deny') || 
                currentIntentName.includes('no') || 
                currentIntentName.includes('disagree')) {
              return { context: 'negation', confidence: 0.9 };
            }
            
            // Prüfe auf Klärungsbedarf
            if (currentIntentName.includes('clarify') || 
                currentIntentName.includes('explain') || 
                currentIntentName.includes('unclear')) {
              return { context: 'clarification', confidence: 0.85 };
            }
          }
          
          // Vorheriger Kontext beeinflusst den aktuellen Kontext
          if (previousContextName) {
            // Wenn vorheriger Kontext eine Frage war
            if (previousContextName === 'question') {
              // Prüfe, ob die aktuelle Nachricht ebenfalls eine Frage enthält
              if (messageTokens.includes('?')) {
                return { context: 'question', confidence: 0.8 }; // Neue Frage
              } else {
                // Wenn keine neue Frage, ist es wahrscheinlich ein Followup
                return { context: 'followup', confidence: 0.75 };
              }
            }
            
            // Nach einer Anweisung folgt oft Bestätigung oder Ablehnung
            if (previousContextName === 'instruction') {
              const confirmationTokens = ['ja', 'genau', 'ok', 'okay', 'richtig', 'stimmt', 'korrekt'];
              const negationTokens = ['nein', 'ne', 'nö', 'nicht', 'falsch'];
              
              if (messageTokens.some(token => confirmationTokens.includes(token))) {
                return { context: 'confirmation', confidence: 0.85 };
              }
              if (messageTokens.some(token => negationTokens.includes(token))) {
                return { context: 'negation', confidence: 0.85 };
              }
              
              // Keine klare Bestätigung/Ablehnung, wahrscheinlich Followup
              return { context: 'followup', confidence: 0.7 };
            }
            
            // Nach einer Klärung folgt oft eine weitere Frage oder Followup
            if (previousContextName === 'clarification') {
              if (messageTokens.includes('?')) {
                return { context: 'question', confidence: 0.8 };
              }
              return { context: 'followup', confidence: 0.75 };
            }
          }
          
          // Nachrichteninhalt-basierte Auswertung
          
          // 1. Prüfe auf Frage (Fragezeichen oder fragende Wörter)
          const fragWortListe = ['was', 'wie', 'wo', 'wer', 'warum', 'weshalb', 'wann', 'kann', 'könnt'];
          
          // Überprüfe den ersten Token, wenn vorhanden
          const firstToken = messageTokens.length > 0 ? messageTokens[0] : undefined;
          const isFragewort = isStringInList(firstToken, fragWortListe);
          
          if (
            messageTokens.includes('?') ||
            isFragewort ||
            messageTokens.includes('erklären') ||
            messageTokens.includes('erzählen')
          ) {
            return { context: 'question', confidence: 0.85 };
          }
          
          // 2. Prüfe auf Begrüßung
          if (
            messageTokens.includes('hallo') ||
            messageTokens.includes('hi') ||
            messageTokens.includes('hey') ||
            messageTokens.includes('tag') ||
            messageTokens.includes('morgen') ||
            messageTokens.includes('abend') ||
            messageTokens.includes('grüß')
          ) {
            return { context: 'initial', confidence: 0.9 };
          }
          
          // 3. Prüfe auf Verabschiedung
          if (
            messageTokens.includes('tschüss') ||
            messageTokens.includes('wiedersehen') ||
            messageTokens.includes('bye') ||
            messageTokens.includes('ciao') ||
            messageTokens.includes('später') ||
            messageTokens.includes('bald')
          ) {
            return { context: 'closing', confidence: 0.9 };
          }
          
          // 4. Prüfe auf Anweisung/Aufforderung
          const anweisungWortListe = ['öffne', 'zeige', 'starte', 'erstelle', 'finde', 'suche', 'beende'];
          const isAnweisung = isStringInList(firstToken, anweisungWortListe);
          
          if (
            isAnweisung ||
            (messageTokens.includes('bitte') && !messageTokens.includes('?'))
          ) {
            return { context: 'instruction', confidence: 0.8 };
          }
          
          // 5. Prüfe auf Themenwechsel
          if (
            messageTokens.includes('thema') ||
            messageTokens.includes('sprechen') ||
            messageTokens.includes('way') ||
            messageTokens.includes('übrigens')
          ) {
            return { context: 'topic_change', confidence: 0.85 };
          }
          
          // 6. Prüfe auf Bestätigung/Zustimmung
          const confirmationTokens = ['ja', 'ok', 'okay', 'genau', 'stimmt', 'richtig', 'korrekt', 'gerne', 'natürlich', 'sicher'];
          
          if (messageTokens.length === 1 && isStringInList(firstToken, confirmationTokens)) {
            return { context: 'confirmation', confidence: 0.85 };
          }
          
          // 7. Prüfe auf Ablehnung/Verneinung
          const negationTokens = ['nein', 'ne', 'nö', 'nicht', 'falsch', 'keineswegs', 'keinen'];
          if (messageTokens.length === 1 && isStringInList(firstToken, negationTokens)) {
            return { context: 'negation', confidence: 0.85 };
          }
          
          // 8. Prüfe auf Dankesäußerung
          if (
            messageTokens.includes('danke') ||
            messageTokens.includes('dankeschön') ||
            messageTokens.includes('vielen') || 
            messageTokens.includes('besten')
          ) {
            return { context: 'confirmation', confidence: 0.9 };
          }
          
          // 9. Prüfe auf Verwirrung/Klärungsbedarf
          if (
            messageTokens.includes('verstehe') ||
            messageTokens.includes('verstanden') ||
            messageTokens.includes('meinst') ||
            messageTokens.includes('bitte') ||
            messageTokens.includes('nochmal') ||
            messageTokens.includes('bedeutet') ||
            messageTokens.includes('erklären')
          ) {
            return { context: 'clarification', confidence: 0.8 };
          }
          
          // Wenn die aktuelle Nachricht die erste ist, aber keine der obigen Kategorien, dann initial
          if (!previousContextName) {
            return { context: 'initial', confidence: 0.7 };
          }
          
          // Standard für alle anderen Fälle: Allgemeines Followup
          return { 
            context: 'followup', 
            confidence: 0.7
          };
        } catch (error) {
          console.error(`[contextModel.predict] Fehler bei der Kontextvorhersage:`, error);
          // Robust gegenüber Fehlern - liefere einen vernünftigen Fallback
          return { context: 'followup', confidence: 0.5 };
        }
      }
    };
    
    return model;
  } catch (error) {
    console.error(`[loadContextModel] Fehler:`, error);
    
    // Fallback-Modell bei jedem Fehler
    return createFallbackModel('context');
  }
}

/**
 * Bereinigt den Modell-Cache
 * @param modelType Optional: Wenn angegeben, werden nur Modelle dieses Typs aus dem Cache entfernt
 * @param language Optional: Wenn angegeben, werden nur Modelle dieser Sprache aus dem Cache entfernt
 */
export function clearModelCache(modelType?: ModelType, language?: Language): void {
  if (!modelType && !language) {
    // Lösche den gesamten Cache
    Object.keys(modelCache).forEach(key => delete modelCache[key]);
    console.log('Modell-Cache vollständig geleert');
    return;
  }
  
  // Filtere basierend auf modelType und/oder language
  Object.keys(modelCache).forEach(key => {
    const shouldClear = 
      (!modelType || key.startsWith(`${modelType}_`)) &&
      (!language || key.includes(`_${language}`));
      
    if (shouldClear) {
      delete modelCache[key];
      console.log(`Modell aus Cache entfernt: ${key}`);
    }
  });
}

/**
 * Gibt Informationen über den aktuellen Zustand des Modell-Caches zurück
 */
export function getModelCacheInfo(): { count: number, models: string[] } {
  const cacheKeys = Object.keys(modelCache);
  return {
    count: cacheKeys.length,
    models: cacheKeys,
  };
}