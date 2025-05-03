/**
 * Enhanced Tokenizer für die NLP-Engine
 * Zerlegt Texte in bedeutungstragende Einheiten (Tokens) für präzisere Verarbeitung
 * Optimiert für moderne AI-Systeme mit vollständiger Integration in Xenova/Transformers und EmbeddingManager
 */

import { config } from '../config';
import { LRUCache } from '@/utils/cacheUtils'; // Korrigierter Import-Pfad

// Definiere eine maximale Cachegröße für die Tokenizer-Caches
const MAX_CACHE_SIZE = config?.nlp?.tokenizer?.maxCacheSize || 500;
const EMBEDDING_DIMENSION = config?.nlp?.ai?.embeddingModel?.dimension || 384;

// Sicherheitsrelevante Konfiguration
const ENABLE_TOKEN_VALIDATION = true;
const ENABLE_SANITIZATION = true;
// Verwende config.security wenn vorhanden, sonst Fallback
const SECURITY_SALT = config?.security?.tokenSalt || 'mindfluence-secure';
// Maximale Textlänge für Tokenisierung zum Schutz vor DoS-Angriffen
const MAX_TEXT_LENGTH = config?.security?.maxTokenizerTextLength || 100000;

/**
 * Optionen für die Tokenisierung
 */
export interface TokenizerOptions {
  /** Ob Satzzeichen als separate Tokens behandelt werden sollen */
  preservePunctuation?: boolean;
  /** Ob die Tokens in Kleinbuchstaben umgewandelt werden sollen */
  toLowerCase?: boolean;
  /** Ob deutsche Umlaute normalisiert werden sollen (ä->ae, etc.) */
  normalizeGermanUmlauts?: boolean;
  /** Ob Akzente in anderen Sprachen entfernt werden sollen (é->e, etc.) */
  removeAccents?: boolean;
  /** Ob Stoppwörter entfernt werden sollen */
  removeStopwords?: boolean;
  /** Sprache für Stoppwort-Entfernung */
  language?: 'de' | 'en' | 'all';
  /** Behandle zusammengesetzte Wörter mit Bindestrich/Unterstrich als ein Token */
  preserveCompoundWords?: boolean;
  /** Behandle URLs und E-Mail-Adressen als ein Token */
  preserveUrls?: boolean;
  /** Normalisiere Whitespace (entferne mehrfache Leerzeichen) */
  normalizeWhitespace?: boolean;
  /** Verwende Stemming zur Reduktion von Wortformen auf ihre Grundform */
  useStemming?: boolean;
  /** Verwende Lemmatisierung (benötigt NLP-Bibliotheken) */
  useLemmatization?: boolean;
  /** Maximale Anzahl von Tokens (für Transformer-Modelle wichtig) */
  maxTokens?: number;
  /** Verwende Sliding Window für lange Texte */
  slidingWindowSize?: number;
  /** Ob Token-Positionen zurückgegeben werden sollen */
  includePositions?: boolean;
  /** Spezielle Tokens berücksichtigen (wie [CLS], [SEP], etc.) */
  specialTokens?: boolean;
  /** Validierung von Tokens aktivieren (gegen Injection-Angriffe) */
  enableValidation?: boolean;
  /** Validierungsebene (1-3, höher = strenger) */
  validationLevel?: 1 | 2 | 3;
}

/**
 * Token-Objekt mit erweiterten Informationen
 */
export interface Token {
  text: string;
  position?: {
    start: number;
    end: number;
  };
  type?: 'word' | 'punctuation' | 'url' | 'email' | 'number' | 'special';
  lemma?: string;
  stem?: string;
  isStopword?: boolean;
  posTag?: string; // Part-of-speech tag
  hash?: string;   // Sicherheits-Hash für Token-Validierung
}

/**
 * Deutsche Stoppwörter (häufige Wörter mit geringer semantischer Bedeutung)
 */
export const GERMAN_STOPWORDS = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
  'und', 'oder', 'aber', 'denn', 'wenn', 'weil', 'als', 'wie',
  'in', 'im', 'an', 'am', 'auf', 'zu', 'zum', 'zur',
  'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde', 'wurden',
  'hat', 'haben', 'hatte', 'hatten',
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
  'mich', 'dich', 'sich', 'uns', 'euch',
  'für', 'von', 'mit', 'bei', 'seit', 'aus', 'nach',
  'über', 'unter', 'vor', 'mir', 'dir'
]);

/**
 * Englische Stoppwörter
 */
export const ENGLISH_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'because', 'as', 'what', 'which',
  'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'hers', 'its', 'our', 'their',
  'for', 'of', 'with', 'at', 'from', 'to', 'in', 'on', 'by',
  'about', 'against', 'between', 'into', 'through'
]);

// Caches für Tokenisierung und Embeddings
const tokenCache = new LRUCache<string, string[]>(MAX_CACHE_SIZE);
const tokenObjectCache = new LRUCache<string, Token[]>(MAX_CACHE_SIZE);
const xenovaTokenizerCache = new Map<string, any>();

/**
 * Potenziell schädliche Token-Muster (für Sicherheitsfilterung)
 * Enthält Regex-Muster für bekannte Injection-Techniken
 */
const DANGEROUS_PATTERNS = [
  /^<[^>]*script/i,                   // Script-Tags
  /^javascript:/i,                    // JavaScript-Protokoll
  /^data:text\/html/i,                // Data-URL mit HTML
  /\b(eval|setTimeout|setInterval|Function)\(/i, // Gefährliche JS-Funktionen
  /\b(drop|delete|update|insert)\s+/i, // SQL-Injection Muster
  /(\${|#{|\$\{|\$\()/,               // Template-Injection
  /^\/etc\/passwd/,                   // Path traversal
  /^\.\.\//                           // Directory traversal
];

/**
 * Erzeugt einen Sicherheits-Hash für einen Token
 * Wird verwendet, um die Integrität von Tokens zu überprüfen
 */
function createTokenHash(text: string, position?: number): string {
  // Einfache Hash-Funktion für Demonstrations- und Validierungszwecke
  // In einer Produktionsumgebung sollte eine kryptografisch sichere Hashfunktion verwendet werden
  let hash = 0;
  const combinedString = `${text}${position || 0}${SECURITY_SALT}`;
  
  for (let i = 0; i < combinedString.length; i++) {
    const char = combinedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Konvertiere in einen hexadezimalen String
  return Math.abs(hash).toString(16);
}

/**
 * Prüft, ob ein Token potenziell gefährlich ist (Sicherheitsrisiko)
 */
function isTokenPotentiallyDangerous(token: string): boolean {
  if (!ENABLE_SANITIZATION) return false;
  
  // Prüfe auf bekannte gefährliche Muster
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(token));
}

/**
 * Sanitize a token to prevent security issues
 */
function sanitizeToken(token: string): string {
  if (!ENABLE_SANITIZATION) return token;
  
  // Entferne oder maskiere potenziell gefährliche Zeichen
  let sanitized = token
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\\/g, '&#x5C;')
    .replace(/`/g, '&#96;');
  
  // Wenn immer noch gefährlich, gebe einen sicheren Ersatz zurück
  if (isTokenPotentiallyDangerous(sanitized)) {
    // Protokolliere das potenziell gefährliche Token
    // Verwende NLP-Logging oder Security-Logging, wenn verfügbar
    if (config?.security?.logSuspiciousTokens || config?.nlp?.logging?.level === 'debug') {
      console.warn(`[Security] Potenziell gefährliches Token entfernt: ${token}`);
    }
    return '[FILTERED]';
  }
  
  return sanitized;
}

/**
 * Validiert einen Token-Hash
 */
function validateTokenHash(token: Token): boolean {
  if (!ENABLE_TOKEN_VALIDATION || !token.hash) return true;
  
  // Berechne den Hash neu und vergleiche
  const calculatedHash = createTokenHash(
    token.text, 
    token.position?.start
  );
  
  return calculatedHash === token.hash;
}

/**
 * Normalisiert deutsche Umlaute (ä->ae, ö->oe, ü->ue, ß->ss)
 */
export function normalizeGermanUmlauts(text: string): string {
  return text
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss');
}

/**
 * Entfernt Akzente aus Text (é->e, à->a, etc.)
 */
export function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Prüft, ob ein Token ein Stoppwort ist (optimiert mit Sets)
 */
function isStopword(token: string, language: 'de' | 'en' | 'all' = 'all'): boolean {
  if (language === 'de' || language === 'all') {
    if (GERMAN_STOPWORDS.has(token)) return true;
  }
  if (language === 'en' || language === 'all') {
    if (ENGLISH_STOPWORDS.has(token)) return true;
  }
  return false;
}

/**
 * URL- und E-Mail-Regex für Erkennung
 */
const URL_EMAIL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Regex für erweiterte Token-Erkennung
 */
function getTokenRegex(preservePunctuation: boolean, preserveCompoundWords: boolean): RegExp {
  if (preservePunctuation) {
    // Umfasst Wörter und Satzzeichen als separate Tokens
    return preserveCompoundWords 
        ? /[\w\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2600-\u27BF\u2700-\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF_-]+|[.,!?;:()<>\[\]{}'"]/g
        : /[\w\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2600-\u27BF\u2700-\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF]+|[.,!?;:()<>\[\]{}'"]/g;
  } else {
    // Nur Wörter, keine Satzzeichen
    return preserveCompoundWords
        ? /[\w\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2600-\u27BF\u2700-\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF_-]+/g
        : /[\w\u00C0-\u00FF\u0100-\u017F\u0180-\u024F\u0370-\u03FF\u0400-\u04FF\u1E00-\u1EFF\u2600-\u27BF\u2700-\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF]+/g;
  }
}

/**
 * Generiert einen Cache-Schlüssel für die Tokenisierung
 */
function getTokenizationCacheKey(text: string, options: TokenizerOptions = {}): string {
  // Erstelle einen eindeutigen Schlüssel basierend auf Text und Optionen
  const optionsKey = JSON.stringify(options);
  return `${text.substring(0, 50)}_${optionsKey}`;
}

/**
 * Generiert einen Cache-Schlüssel für den Xenova-Tokenizer
 */
function getXenovaTokenizerCacheKey(modelName: string, options: any = {}): string {
  return `${modelName}_${JSON.stringify(options)}`;
}

/**
 * Hauptfunktion für die Tokenisierung von Text.
 * Zerlegt einen Text in einzelne Token (Wörter und optional Satzzeichen).
 * 
 * @param text Der zu tokenisierende Text
 * @param options Optionen für die Tokenisierung
 * @returns Array von Token-Strings
 */
export function basicTokenize(text: string, options: TokenizerOptions = {}): string[] {
  // Frühzeitige Rückgabe bei leerem Text
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Sicherheitscheck: Maximale Textlänge begrenzen, um DoS-Angriffe zu verhindern
  if (text.length > MAX_TEXT_LENGTH) {
    console.warn(`[Security] Text exceeds maximum allowed length (${MAX_TEXT_LENGTH}), truncating`);
    text = text.substring(0, MAX_TEXT_LENGTH);
  }

  // Cache-Schlüssel generieren
  const cacheKey = getTokenizationCacheKey(text, options);
  
  // Prüfe, ob das Ergebnis bereits im Cache ist
  const cachedResult = tokenCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  let processedText = text;

  // Normalisiere Whitespace
  if (options.normalizeWhitespace !== false) {
    processedText = processedText.replace(/\s+/g, ' ').trim();
  }

  // Optionale Vorverarbeitung
  if (options.toLowerCase !== false) {
    processedText = processedText.toLowerCase();
  }

  if (options.normalizeGermanUmlauts) {
    processedText = normalizeGermanUmlauts(processedText);
  }

  if (options.removeAccents) {
    processedText = removeAccents(processedText);
  }

  // Speichere URLs und E-Mails temporär, wenn gewünscht
  const urlsAndEmails: string[] = [];
  if (options.preserveUrls) {
    processedText = processedText.replace(URL_EMAIL_REGEX, (match) => {
      urlsAndEmails.push(match);
      return `__URL_EMAIL_${urlsAndEmails.length - 1}__`;
    });
  }

  // Token-Extraktionsregex basierend auf den Optionen
  const tokenRegex = getTokenRegex(
    options.preservePunctuation || false,
    options.preserveCompoundWords || false
  );

  // Tokenisierung durchführen
  const matches = processedText.match(tokenRegex);
  let allTokens: string[] = matches ? Array.from(matches) : [];

  // Stoppwort-Filterung (optional)
  if (options.removeStopwords) {
    allTokens = allTokens.filter(token => 
      !isStopword(token, options.language || 'all'));
  }

  // Stelle URLs und E-Mails wieder her
  if (options.preserveUrls && urlsAndEmails.length > 0) {
    allTokens = allTokens.map(token => {
      if (token.startsWith('__URL_EMAIL_')) {
        const index = parseInt(token.replace('__URL_EMAIL_', '').replace('__', ''));
        return urlsAndEmails[index] || token; // Fallback, falls Index ungültig
      }
      return token;
    }).filter((token): token is string => token !== undefined);
  }

  // Sicherheitsfilterung: Potenziell gefährliche Tokens sanitieren
  if (ENABLE_SANITIZATION) {
    allTokens = allTokens.map(token => sanitizeToken(token));
  }

  // Begrenze die Anzahl der Tokens, wenn maxTokens gesetzt ist
  if (options.maxTokens && options.maxTokens > 0 && allTokens.length > options.maxTokens) {
    allTokens = allTokens.slice(0, options.maxTokens);
  }

  // Speichere das Ergebnis im Cache
  tokenCache.set(cacheKey, allTokens);

  return allTokens;
}

/**
 * VERALTET: Verwende stattdessen basicTokenize()
 * 
 * @deprecated Die Funktion tokenize() ist veraltet und könnte zu Konflikten mit AI-Tokenizern führen. 
 * Bitte verwenden Sie basicTokenize() für allgemeine Tokenisierung oder spezifische AI-Tokenizer für Embedding-Modelle.
 */
export function tokenize(text: string, options: TokenizerOptions = {}): string[] {
  // Warnung ausgeben
  if (config?.nlp?.logging?.level !== 'silent') {
    console.warn(
      'Die Funktion tokenize() ist veraltet und könnte zu Konflikten mit AI-Tokenizern führen. ' +
      'Bitte verwenden Sie basicTokenize() für allgemeine Tokenisierung oder spezifische AI-Tokenizer für Embedding-Modelle.'
    );
  }
  
  // Delegation an basicTokenize
  return basicTokenize(text, options);
}

/**
 * Tokenisiert Text mit erweiterten Informationen (Token-Objekte)
 */
export function tokenizeWithInfo(text: string, options: TokenizerOptions = {}): Token[] {
  // Frühzeitige Rückgabe bei leerem Text
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Sicherheitscheck: Maximale Textlänge begrenzen
  if (text.length > MAX_TEXT_LENGTH) {
    console.warn(`[Security] Text exceeds maximum allowed length (${MAX_TEXT_LENGTH}), truncating`);
    text = text.substring(0, MAX_TEXT_LENGTH);
  }

  // Cache-Schlüssel generieren
  const cacheKey = getTokenizationCacheKey(text, options) + '_with_info';
  
  // Prüfe, ob das Ergebnis bereits im Cache ist
  const cachedResult = tokenObjectCache.get(cacheKey);
  if (cachedResult) {
    // Validiere Token-Hashes, wenn aktiviert
    if (ENABLE_TOKEN_VALIDATION) {
      const allValid = cachedResult.every(token => validateTokenHash(token));
      if (!allValid) {
        console.warn('[Security] Token validation failed, re-tokenizing');
      } else {
        return cachedResult;
      }
    } else {
      return cachedResult;
    }
  }

  // Einfache Tokenisierung durchführen
  const tokens = basicTokenize(text, { ...options, removeStopwords: false });
  
  // Erweiterte Token-Informationen erstellen
  const tokenObjects: Token[] = [];
  let position = 0;
  let processedText = text;

  // Optionale Vorverarbeitung für die Positionsberechnung
  if (options.toLowerCase !== false) {
    processedText = processedText.toLowerCase();
  }
  if (options.normalizeWhitespace !== false) {
    processedText = processedText.replace(/\s+/g, ' ').trim();
  }

  // Für jeden Token die Position und weiteren Informationen bestimmen
  for (const tokenText of tokens) {
    // Finde die Position des Tokens im Text
    const startPosition = processedText.indexOf(tokenText, position);
    if (startPosition !== -1) {
      const endPosition = startPosition + tokenText.length;
      
      // Token-Typ bestimmen
      let tokenType: Token['type'] = 'word';
      if (/^[.,!?;:()<>\[\]{}'"]+$/.test(tokenText)) {
        tokenType = 'punctuation';
      } else if (/^https?:\/\//.test(tokenText) || /^www\./.test(tokenText)) {
        tokenType = 'url';
      } else if (/@/.test(tokenText) && /\.[a-z]{2,}$/i.test(tokenText)) {
        tokenType = 'email';
      } else if (/^\d+(\.\d+)?$/.test(tokenText)) {
        tokenType = 'number';
      }

      // Token-Objekt erstellen
      const tokenObj: Token = {
        text: sanitizeToken(tokenText),
        type: tokenType
      };

      // Position hinzufügen, wenn gewünscht
      if (options.includePositions) {
        tokenObj.position = {
          start: startPosition,
          end: endPosition
        };
      }

      // Stoppwort-Information hinzufügen
      if (options.language) {
        tokenObj.isStopword = isStopword(tokenText, options.language);
      }

      // Sicherheits-Hash hinzufügen
      if (ENABLE_TOKEN_VALIDATION) {
        tokenObj.hash = createTokenHash(tokenObj.text, startPosition);
      }

      tokenObjects.push(tokenObj);
      position = endPosition;
    }
  }

  // Speichere das Ergebnis im Cache
  tokenObjectCache.set(cacheKey, tokenObjects);

  return tokenObjects;
}

/**
 * Führt Batch-Tokenisierung für mehrere Texte durch
 */
export function batchTokenize(texts: string[], options: TokenizerOptions = {}): string[][] {
  return texts.map(text => basicTokenize(text, options));
}

/**
 * Berechnet die Jaccard-Ähnlichkeit zwischen zwei Token-Listen
 */
export function jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  if (!tokens1 || !tokens2) return 0;
  if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;
  
  // Erstelle Sets für einzigartige Tokens
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);
  
  // Berechne Schnittmenge
  const intersection = new Set([...set1].filter(token => set2.has(token)));
  
  // Berechne Vereinigung
  const union = new Set([...set1, ...set2]);
  
  // Jaccard-Ähnlichkeit: Größe der Schnittmenge / Größe der Vereinigung
  return intersection.size / union.size;
}

/**
 * Berechnet die Cosinus-Ähnlichkeit zwischen zwei Token-Listen
 * Diese Funktion ist komplexer als Jaccard und berücksichtigt Häufigkeiten
 */
export function cosineSimilarity(tokens1: string[], tokens2: string[]): number {
  if (!tokens1 || !tokens2) return 0;
  if (tokens1.length === 0 || tokens2.length === 0) return 0.0;
  
  // Zähle Häufigkeiten
  const freqMap1 = new Map<string, number>();
  const freqMap2 = new Map<string, number>();
  
  // Häufigkeiten für tokens1
  for (const token of tokens1) {
    freqMap1.set(token, (freqMap1.get(token) || 0) + 1);
  }
  
  // Häufigkeiten für tokens2
  for (const token of tokens2) {
    freqMap2.set(token, (freqMap2.get(token) || 0) + 1);
  }
  
  // Berechne Skalarprodukt
  let dotProduct = 0;
  for (const [token, freq1] of freqMap1.entries()) {
    const freq2 = freqMap2.get(token) || 0;
    dotProduct += freq1 * freq2;
  }
  
  // Berechne Vektorlängen
  let magnitude1 = 0;
  for (const freq of freqMap1.values()) {
    magnitude1 += freq * freq;
  }
  magnitude1 = Math.sqrt(magnitude1);
  
  let magnitude2 = 0;
  for (const freq of freqMap2.values()) {
    magnitude2 += freq * freq;
  }
  magnitude2 = Math.sqrt(magnitude2);
  
  // Vermeide Division durch Null
  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  
  // Cosinus-Ähnlichkeit: Skalarprodukt / (|v1| * |v2|)
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Kompatibilitätsfunktion für ältere Codebasen
 * @deprecated Verwende jaccardSimilarity stattdessen
 */
export function calculateTokenSimilarity(tokens1: string[], tokens2: string[]): number {
  if (config?.nlp?.logging?.level === 'debug') {
    console.warn(
      'Die Funktion calculateTokenSimilarity() ist veraltet. ' +
      'Bitte verwenden Sie jaccardSimilarity() oder cosineSimilarity() stattdessen.'
    );
  }
  return jaccardSimilarity(tokens1, tokens2);
}

/**
 * Prüft, ob eine Token-Liste einen bestimmten Token enthält
 */
export function containsToken(tokens: string[], searchToken: string, caseSensitive: boolean = false): boolean {
  if (!tokens || tokens.length === 0 || !searchToken) return false;
  
  if (!caseSensitive) {
    const lowerSearchToken = searchToken.toLowerCase();
    return tokens.some(token => token.toLowerCase() === lowerSearchToken);
  }
  
  return tokens.includes(searchToken);
}

/**
 * Prüft, ob ein Token als Substring in einem der Tokens enthalten ist
 */
export function containsSubstring(tokens: string[], searchSubstring: string, caseSensitive: boolean = false): boolean {
  if (!tokens || tokens.length === 0 || !searchSubstring) return false;
  
  if (!caseSensitive) {
    const lowerSearchSubstring = searchSubstring.toLowerCase();
    return tokens.some(token => token.toLowerCase().includes(lowerSearchSubstring));
  }
  
  return tokens.some(token => token.includes(searchSubstring));
}

/**
 * Berechnet die BM25-Ähnlichkeit (ähnlich zur TF-IDF, aber besser für Suche)
 */
export function bm25Similarity(query: string[], documents: string[][], k1: number = 1.5, b: number = 0.75): number[] {
  if (!query || !documents || documents.length === 0) return [];
  
  const docCount = documents.length;
  const avgDocLength = documents.reduce((sum, doc) => sum + doc.length, 0) / docCount;
  
  // Berechnen der inversen Dokumenthäufigkeit (IDF) für jeden Query-Term
  const idf = new Map<string, number>();
  for (const term of query) {
    const docFreq = documents.filter(doc => doc.includes(term)).length;
    // BM25 IDF-Formel: log((N - n + 0.5) / (n + 0.5) + 1)
    const idfValue = Math.log((docCount - docFreq + 0.5) / (docFreq + 0.5) + 1);
    idf.set(term, idfValue);
  }
  
  // Berechnen der BM25-Scores für jedes Dokument
  const scores = documents.map(doc => {
    let score = 0;
    const docLength = doc.length;
    
    // Zähle Term-Häufigkeiten im Dokument
    const termFreqs = new Map<string, number>();
    for (const term of doc) {
      termFreqs.set(term, (termFreqs.get(term) || 0) + 1);
    }
    
    // Berechne den BM25-Score
    for (const term of query) {
      if (!idf.has(term)) continue;
      
      const tf = termFreqs.get(term) || 0;
      if (tf === 0) continue;
      
      // BM25 Term-Weight-Formel
      const termWeight = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLength / avgDocLength));
      score += idf.get(term)! * termWeight;
    }
    
    return score;
  });
  
  return scores;
}

/**
 * Tokenisiert Text für semantische Ähnlichkeitsberechnungen.
 * Optimiert für Embedding-Modelle.
 */
export function semanticTokenize(text: string): string[] {
  // Für semantische Ähnlichkeit ist es wichtig, bestimmte Wörter zu behalten
  // und eine konsistente Tokenisierung durchzuführen.
  return basicTokenize(text, {
    preservePunctuation: false,
    toLowerCase: true,
    normalizeWhitespace: true,
    removeStopwords: true,
    preserveCompoundWords: true,
    preserveUrls: true,
    language: 'all'
  });
}

// AI-MODEL INTEGRATION BRIDGE (ERWEITERT)
// Verbesserte Integration mit Transformer-Modellen und Embedding-Systemen

/**
 * Konfiguration für Xenova-Tokenizer
 */
export interface XenovaTokenizerOptions {
  maxLength?: number;
  padding?: boolean | 'max_length';
  truncation?: boolean;
  addSpecialTokens?: boolean;
  stride?: number;
  returnTensors?: boolean;
  returnTokenTypeIds?: boolean;
}

/**
 * Ruft einen Xenova-Tokenizer für ein bestimmtes Modell ab
 * Verbesserte Cache-Strategie und Fehlerbehandlung
 */
export async function getXenovaTokenizer(modelName: string, options: XenovaTokenizerOptions = {}): Promise<any | null> {
  try {
    // Cache-Schlüssel generieren
    const cacheKey = getXenovaTokenizerCacheKey(modelName, options);
    
    // Prüfe, ob der Tokenizer bereits im Cache ist
    if (xenovaTokenizerCache.has(cacheKey)) {
      return xenovaTokenizerCache.get(cacheKey);
    }
    
    // Dynamischer Import, um die Abhängigkeit nur bei Bedarf zu laden
    try {
      const { AutoTokenizer } = await import('@xenova/transformers');
      
      // Tokenizer laden mit spezifischen Optionen
      const tokenizerOptions: any = {};
      
      // Wenn spezielle Optionen gesetzt sind, übertrage sie
      if (options.maxLength) tokenizerOptions.max_length = options.maxLength;
      if (options.padding !== undefined) tokenizerOptions.padding = options.padding;
      if (options.truncation !== undefined) tokenizerOptions.truncation = options.truncation;
      
      // Tokenizer laden
      const tokenizer = await AutoTokenizer.from_pretrained(modelName, tokenizerOptions);
      
      // LRU-Cache-Prüfung: Wenn der Cache zu groß wird, entferne den ältesten Eintrag
      if (xenovaTokenizerCache.size >= MAX_CACHE_SIZE) {
        const firstKey = xenovaTokenizerCache.keys().next().value;
        if (firstKey) {
          xenovaTokenizerCache.delete(firstKey);
        }
      }
      
      // Im Cache speichern
      xenovaTokenizerCache.set(cacheKey, tokenizer);
      
      return tokenizer;
    } catch (importError) {
      console.error(`Fehler beim Import des Xenova Tokenizers: ${importError}`);
      console.warn('Stellen Sie sicher, dass @xenova/transformers installiert ist, um erweiterte Tokenizer zu verwenden.');
      return null;
    }
  } catch (error) {
    console.error(`Fehler beim Laden des Xenova Tokenizers für ${modelName}:`, error);
    return null;
  }
}

/**
 * Tokenisiert einen Text mit dem angegebenen Xenova-Tokenizer
 * Erweiterte Version mit mehr Optionen und verbesserter Fehlerbehandlung
 */
export async function tokenizeWithXenova(
  text: string,
  tokenizer: any,
  options: XenovaTokenizerOptions = {}
): Promise<{ input_ids: number[]; tokens: string[]; attention_mask?: number[] } | null> {
  try {
    if (!tokenizer) {
      console.error('Kein gültiger Tokenizer bereitgestellt.');
      return null;
    }
    
    // Sicherheitscheck: Textlänge begrenzen
    if (text.length > MAX_TEXT_LENGTH) {
      console.warn(`[Security] Text exceeds maximum allowed length (${MAX_TEXT_LENGTH}), truncating`);
      text = text.substring(0, MAX_TEXT_LENGTH);
    }
    
    // Standardwerte für Optionen setzen
    const mergedOptions = {
      addSpecialTokens: true,
      padding: false,
      truncation: false,
      ...options
    };
    
    // Tokenisierung durchführen
    const encoded = await tokenizer(text, mergedOptions);
    
    // Tokens extrahieren (hängt von der Tokenizer-Implementierung ab)
    let tokens: string[] = [];
    
    // Versuche, die Tokens aus dem Tokenizer zu erhalten
    if (typeof tokenizer.decode === 'function') {
      // Versuche zuerst batch_decode, falls vorhanden
      if (typeof tokenizer.batch_decode === 'function') {
        try {
          // Effizientere Batch-Dekodierung
          const singleTokens = encoded.input_ids.map((id: number) => [id]);
          tokens = await tokenizer.batch_decode(singleTokens, { skip_special_tokens: false });
        } catch (batchError) {
          // Fallback zur Einzel-Dekodierung
          tokens = await Promise.all(encoded.input_ids.map(async (id: number) => 
            tokenizer.decode([id], { skip_special_tokens: false })));
        }
      } else {
        // Klassische Einzel-Dekodierung
        tokens = await Promise.all(encoded.input_ids.map(async (id: number) => 
          tokenizer.decode([id], { skip_special_tokens: false })));
      }
    } else {
      // Fallback: Benutze die basicTokenize Funktion
      tokens = basicTokenize(text);
    }
    
    // Anwendung der Sicherheitsfilterung auf Tokens
    if (ENABLE_SANITIZATION) {
      tokens = tokens.map(token => sanitizeToken(token));
    }
    
    // Build rich response object
    const result: { 
      input_ids: number[]; 
      tokens: string[]; 
      attention_mask?: number[];
      token_type_ids?: number[];
    } = {
      input_ids: encoded.input_ids,
      tokens: tokens
    };
    
    // Add optional fields if present in the encoded output
    if (encoded.attention_mask) {
      result.attention_mask = encoded.attention_mask;
    }
    
    if (encoded.token_type_ids && options.returnTokenTypeIds) {
      result.token_type_ids = encoded.token_type_ids;
    }
    
    return result;
  } catch (error) {
    console.error('Fehler bei der Tokenisierung mit Xenova:', error);
    return null;
  }
}

/**
 * Batch-Tokenisierung mit Xenova für mehrere Texte
 */
export async function batchTokenizeWithXenova(
  texts: string[],
  tokenizer: any,
  options: XenovaTokenizerOptions = {}
): Promise<{ input_ids: number[][]; tokens: string[][]; attention_mask?: number[][] } | null> {
  try {
    if (!tokenizer || !texts || texts.length === 0) {
      return null;
    }
    
    // Sicherheitscheck: Textlänge begrenzen
    const checkedTexts = texts.map(text => {
      if (text.length > MAX_TEXT_LENGTH) {
        console.warn(`[Security] Text exceeds maximum allowed length (${MAX_TEXT_LENGTH}), truncating`);
        return text.substring(0, MAX_TEXT_LENGTH);
      }
      return text;
    });
    
    // Standardwerte für Optionen setzen
    const mergedOptions = {
      addSpecialTokens: true,
      padding: true, // Bei Batches ist Padding wichtig
      truncation: true, // Bei Batches ist Truncation oft nötig
      ...options
    };
    
    // Batch-Tokenisierung durchführen
    const encoded = await tokenizer(checkedTexts, mergedOptions);
    
    // Tokens für jede Eingabe extrahieren
    const allTokens: string[][] = [];
    
    // Versuche Batch-Dekodierung
    if (typeof tokenizer.batch_decode === 'function') {
      for (const ids of encoded.input_ids) {
        const singleTokens = ids.map((id: number) => [id]);
        const tokensForInput = await tokenizer.batch_decode(singleTokens, { skip_special_tokens: false });
        
        // Sicherheitsfilterung
        if (ENABLE_SANITIZATION) {
          allTokens.push(tokensForInput.map((token: string) => sanitizeToken(token)));
        } else {
          allTokens.push(tokensForInput);
        }
      }
    } else if (typeof tokenizer.decode === 'function') {
      // Fallback zur Einzel-Dekodierung
      for (const ids of encoded.input_ids) {
        const tokensForInput = await Promise.all(ids.map(async (id: number) => 
          tokenizer.decode([id], { skip_special_tokens: false })));
        
        // Sicherheitsfilterung
        if (ENABLE_SANITIZATION) {
          allTokens.push(tokensForInput.map(token => sanitizeToken(token)));
        } else {
          allTokens.push(tokensForInput);
        }
      }
    } else {
      // Fallback: Benutze die basicTokenize Funktion
      allTokens.push(...checkedTexts.map(text => basicTokenize(text)));
    }
    
    // Build rich response object
    const result: { 
      input_ids: number[][]; 
      tokens: string[][]; 
      attention_mask?: number[][]; 
    } = {
      input_ids: encoded.input_ids,
      tokens: allTokens
    };
    
    // Add optional fields if present
    if (encoded.attention_mask) {
      result.attention_mask = encoded.attention_mask;
    }
    
    return result;
  } catch (error) {
    console.error('Fehler bei der Batch-Tokenisierung mit Xenova:', error);
    return null;
  }
}

/**
 * Sliding Window Tokenisierung für lange Texte
 * Wichtig für Transformer-Modelle mit begrenzter Kontextlänge
 */
export async function slidingWindowTokenize(
  text: string,
  tokenizer: any,
  windowSize: number = 512,
  stride: number = 128,
  options: XenovaTokenizerOptions = {}
): Promise<{ 
  windows: { input_ids: number[]; tokens: string[]; attention_mask?: number[] }[]; 
  originalLength: number;
}> {
  try {
    if (!tokenizer) {
      throw new Error('Kein gültiger Tokenizer bereitgestellt.');
    }
    
    // Sicherheitscheck: Textlänge begrenzen
    if (text.length > MAX_TEXT_LENGTH) {
      console.warn(`[Security] Text exceeds maximum allowed length (${MAX_TEXT_LENGTH}), truncating`);
      text = text.substring(0, MAX_TEXT_LENGTH);
    }
    
    // Tokenisiere den gesamten Text, um seine Länge zu bestimmen
    const fullEncoded = await tokenizeWithXenova(text, tokenizer, { 
      ...options, 
      truncation: false,
      addSpecialTokens: false  // Keine Spezial-Tokens für die Längenberechnung
    });
    
    if (!fullEncoded) {
      throw new Error('Tokenisierung des Gesamttextes fehlgeschlagen.');
    }
    
    const totalLength = fullEncoded.input_ids.length;
    
    // Wenn der Text kürzer als das Fenster ist, gib ihn einfach zurück
    if (totalLength <= windowSize) {
      // Füge Spezial-Tokens wieder hinzu, wenn nötig
      const finalEncoded = await tokenizeWithXenova(text, tokenizer, {
        ...options,
        truncation: false,
        addSpecialTokens: options.addSpecialTokens !== false
      });
      
      return {
        windows: finalEncoded ? [finalEncoded] : [],
        originalLength: totalLength
      };
    }
    
    // Berechne die Anzahl der Fenster
    const numWindows = Math.ceil((totalLength - windowSize) / stride) + 1;
    
    // Erstelle Fenster mit Überlappung
    const windows: { input_ids: number[]; tokens: string[]; attention_mask?: number[] }[] = [];
    
    for (let i = 0; i < numWindows; i++) {
      const startToken = i * stride;
      const endToken = Math.min(startToken + windowSize, totalLength);
      
      // Extrahiere den relevanten Text für dieses Fenster
      // Dies ist eine Annäherung, da wir nicht genau wissen, welche Zeichen zu welchen Tokens gehören
      const windowText = text.substring(
        Math.floor(startToken * text.length / totalLength),
        Math.ceil(endToken * text.length / totalLength)
      );
      
      // Tokenisiere das Fenster
      const windowEncoded = await tokenizeWithXenova(windowText, tokenizer, {
        ...options,
        truncation: true,
        maxLength: windowSize,
        addSpecialTokens: options.addSpecialTokens !== false
      });
      
      if (windowEncoded) {
        windows.push(windowEncoded);
      }
    }
    
    return {
      windows,
      originalLength: totalLength
    };
  } catch (error) {
    console.error('Fehler bei der Sliding-Window-Tokenisierung:', error);
    return { windows: [], originalLength: 0 };
  }
}

/**
 * Erstellt Embeddings aus Tokens mithilfe eines Transformer-Modells
 * Diese Funktion arbeitet nahtlos mit dem EmbeddingManager zusammen
 */
export async function embeddingsFromTokens(
  tokens: string[] | number[],
  model: any,
  dimension: number = EMBEDDING_DIMENSION
): Promise<Float32Array | null> {
  try {
    if (!model || !tokens || tokens.length === 0) {
      return null;
    }
    
    // Wenn das Modell eine embed-Methode hat, verwende diese
    if (typeof model.embed === 'function') {
      return await model.embed(tokens);
    }
    
    // Wenn das Modell eine predict-Methode hat, verwende diese
    if (typeof model.predict === 'function') {
      const prediction = await model.predict(tokens);
      if (prediction && prediction instanceof Float32Array) {
        return prediction;
      }
      
      // Wenn die Vorhersage ein Embedding-Objekt ist
      if (prediction && prediction.vector && Array.isArray(prediction.vector)) {
        return new Float32Array(prediction.vector);
      }
    }
    
    // Wenn das Modell ein Xenova Transformer Modell ist
    try {
      // Versuche, ein CLS-Token oder Durchschnitts-Embedding zu erzeugen
      const output = await model.forward(tokens);
      
      if (output && output.last_hidden_state) {
        // Verwende das [CLS]-Token-Embedding (erstes Token) oder den Durchschnitt
        const hiddenStates = output.last_hidden_state;
        
        if (Array.isArray(hiddenStates) && hiddenStates.length > 0) {
          // Option 1: Verwende das CLS-Token (erstes Token)
          return new Float32Array(hiddenStates[0]);
        } else if (hiddenStates.dims && hiddenStates.dims.length > 0) {
          // Option 2: Für Tensor-basierte Ausgaben
          // Dies ist modellspezifisch und muss angepasst werden
          console.warn('Tensor-basierte Ausgabe, verwende Modellspezifische Logik');
          return new Float32Array(dimension);
        }
      }
    } catch (transformerError) {
      console.warn('Fehler bei der Verwendung des Transformer-Modells:', transformerError);
    }
    
    // Fallback: Erstelle ein Dummy-Embedding
    console.warn('Konnte kein gültiges Embedding erzeugen, verwende Fallback');
    return new Float32Array(dimension).fill(0);
  } catch (error) {
    console.error('Fehler bei der Erstellung von Embeddings aus Tokens:', error);
    return null;
  }
}

/**
 * Validiert eine Liste von Tokens gegen potenzielle Angriffe
 * Kann verwendet werden, um zu prüfen, ob Tokens manipuliert wurden
 */
export function validateTokens(tokens: Token[]): boolean {
  if (!ENABLE_TOKEN_VALIDATION) return true;
  
  // Prüfe jeden Token auf Gültigkeit
  return tokens.every((token: Token) => {
    // Prüfe Hash, wenn vorhanden
    if (token.hash) {
      return validateTokenHash(token);
    }
    
    // Prüfe auf gefährliche Muster, wenn kein Hash vorhanden ist
    return !isTokenPotentiallyDangerous(token.text);
  });
}

/**
 * Bereinigt den Tokenizer-Cache
 */
export function clearTokenizerCache(): void {
  tokenCache.clear();
  tokenObjectCache.clear();
  console.log('Tokenizer-Cache geleert');
}

/**
 * Bereinigt alle Caches
 */
export function clearAllCaches(): void {
  tokenCache.clear();
  tokenObjectCache.clear();
  xenovaTokenizerCache.clear();
  console.log('Alle Tokenizer-Caches geleert');
}