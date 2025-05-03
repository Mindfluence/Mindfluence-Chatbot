// src/features/nlp-engine/ai/feedback/correctionAnalyzer.ts

import type { // Korrektur (TS1484): Type-only imports
  Entity,
  Intent,
  Context,
  EnhancedContext, // EnhancedContext wird importiert, aber nicht direkt genutzt
  NLPProcessingResult
} from '@/types/nlp.types';
// Annahme: EntityRelationManager und KnowledgeGraph sind Klassen mit den unten definierten Methoden
// und werden korrekt importiert und exportiert.
// TS2576: Annahme: EntityRelationManager wird als Klasse (oder etwas mit einer statischen getInstance Methode) exportiert.
import EntityRelationManager from '@/features/reasoning/entityRelationManager';
// Annahme: KnowledgeGraph wird korrekt importiert
import KnowledgeGraph from '@/features/reasoning/knowledgeGraph';
import { config } from '../../config';
// Korrektur (TS2554): calculateTokenSimilarity nicht verwendet, entfernt. tokenize wurde durch basicTokenize ersetzt.
import { basicTokenize } from '../../utils/tokenizer';

/**
 * Represents a correction made by a user to a chatbot response
 */
export interface UserCorrection {
  /** Unique identifier for the correction */
  id: string;
  /** Original user message that triggered the response */
  originalMessage: string;
  /** Chatbot's original response that is being corrected */
  originalResponse: string;
  /** User's correction message */
  correctionMessage: string;
  /** Context at the time of the original interaction */
  context?: Context;
  /** NLP processing result from the original message */
  nlpResult?: NLPProcessingResult;
  /** Timestamp when the correction was made */
  timestamp: number;
  /** User ID (if available) */
  userId?: string;
  /** Session ID */
  sessionId: string;
  /** Conversation ID */
  conversationId: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Categorizes the type of correction
 */
export enum CorrectionType {
  /** Factual information was incorrect */
  FACTUAL_ERROR = 'factual_error',
  /** The response was irrelevant to the query */
  IRRELEVANT = 'irrelevant',
  /** The intent was misunderstood */
  INTENT_MISUNDERSTOOD = 'intent_misunderstood',
  /** Entity was incorrectly identified or missing */
  ENTITY_ERROR = 'entity_error',
  /** Spelling, grammar, or formatting issues */
  LINGUISTIC = 'linguistic',
  /** Response was incomplete or missing information */
  INCOMPLETE = 'incomplete',
  /** The tone or style was inappropriate */
  TONE = 'tone',
  /** Ambiguous correction that doesn't fit other categories */
  AMBIGUOUS = 'ambiguous'
}

/**
 * Result of analyzing a user correction
 */
export interface CorrectionAnalysis {
  /** Type of correction identified */
  correctionType: CorrectionType;
  /** Confidence score for the analysis (0.0 to 1.0) */
  confidence: number;
  /** Extracted facts or corrections */
  extractedCorrections: {
    /** Original fact or statement */
    original?: string;
    /** Corrected fact or statement */
    corrected: string; // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
    /** Type of the correction */
    type: string;
    /** Confidence in this extraction (0.0 to 1.0) */
    confidence: number;
  }[];
  /** Suggested changes to the NLP processing */
  suggestedChanges: {
    /** Component that needs adjustment */
    component: 'intent' | 'entity' | 'context' | 'response' | 'knowledge';
    /** Specific parameter to adjust */
    parameter: string;
    /** Suggested value */
    suggestedValue: any;
    /** Confidence in this suggestion (0.0 to 1.0) */
    confidence: number;
  }[];
  /** Entities extracted from the correction */
  extractedEntities: Entity[];
  /** Detected intent from the correction */
  detectedIntent?: Intent;
  /** Explanation of the analysis */
  explanation: string;
  /** Learning value from this correction (0.0 to 1.0) */
  learningValue: number;
}

/**
 * Options for correction analysis
 */
export interface CorrectionAnalysisOptions {
  /** Minimum confidence threshold for extractions */
  minConfidence?: number;
  /** Whether to update knowledge bases automatically */
  autoUpdateKnowledge?: boolean;
  /** Whether to include detailed explanations */
  includeExplanations?: boolean;
  /** Maximum number of suggested changes to return */
  maxSuggestedChanges?: number;
  /** Whether to analyze entities in the correction */
  analyzeEntities?: boolean;
  /** Whether to attempt intent detection from correction */
  detectIntent?: boolean;
}

// Interface for the EntityRelationManager instance methods we use
// Annahme: EntityRelationManager hat eine Methode addRelation mit dieser Signatur
interface EntityRelationManagerInterface {
  addRelation(sourceEntity: Entity, relationType: string, targetEntity: Entity, confidence?: number, metadata?: Record<string, any>): boolean;
}

// Interface for the KnowledgeGraph instance methods we use
// Annahme: KnowledgeGraph hat Methoden addEntity und addRelationship mit diesen Signaturen
interface KnowledgeGraphInterface {
  addEntity(entity: Entity, source?: string): boolean;
  addRelationship(sourceEntity: Entity, relationType: string, targetEntity: Entity, confidence?: number, source?: string): boolean;
}

// Interface for the static part of EntityRelationManager with getInstance method
// Korrektur (TS2576): Definiere ein Interface für die statische Methode
interface StaticEntityRelationManager {
    getInstance(): EntityRelationManagerInterface;
}


/**
 * CorrectionAnalyzer processes user corrections to chatbot responses,
 * extracts learning signals, and suggests improvements to the NLP components.
 */
export class CorrectionAnalyzer {
  private static instance: CorrectionAnalyzer;
  private corrections: Map<string, UserCorrection> = new Map();
  private analyses: Map<string, CorrectionAnalysis> = new Map();
  // Explizite Typisierung für die Instanz des EntityRelationManager
  private entityRelationManager: EntityRelationManagerInterface;
  private knowledgeGraph: KnowledgeGraphInterface | null = null;

  // Analysis patterns for correction types
  private correctionPatterns: Record<CorrectionType, string[]> = {
    [CorrectionType.FACTUAL_ERROR]: [
      'actually', 'in fact', 'that\'s not true', 'that is incorrect',
      'wrong', 'not correct', 'false', 'that\'s false', 'incorrect',
      'that\'s wrong', 'not right', 'not accurate', 'inaccurate'
    ],
    [CorrectionType.IRRELEVANT]: [
      'irrelevant', 'not related', 'unrelated', 'off topic',
      'not what i asked', 'not what i was asking', 'didn\'t ask',
      'that\'s not what i meant', 'you misunderstood'
    ],
    [CorrectionType.INTENT_MISUNDERSTOOD]: [
      'i meant', 'i was asking', 'i was trying to', 'my question was',
      'what i meant was', 'i wanted to know', 'i\'m asking about'
    ],
    [CorrectionType.ENTITY_ERROR]: [
      'not talking about', 'referring to', 'i meant the', 'the wrong',
      'confused', 'mixed up', 'mistaken', 'different'
    ],
    [CorrectionType.LINGUISTIC]: [
      'spelled wrong', 'misspelled', 'grammar', 'typo', 'formatting',
      'should be written', 'should say', 'should read'
    ],
    [CorrectionType.INCOMPLETE]: [
      'also', 'forgot to mention', 'didn\'t include', 'left out',
      'missing', 'incomplete', 'partial', 'not complete',
      'more information', 'additional'
    ],
    [CorrectionType.TONE]: [
      'rude', 'tone', 'style', 'formal', 'informal', 'professional',
      'too casual', 'too formal', 'inappropriate', 'unfriendly'
    ],
    [CorrectionType.AMBIGUOUS]: [] // Default category, no specific patterns
  };

  // Default analysis options
  private defaultOptions: CorrectionAnalysisOptions = {
    minConfidence: 0.6,
    autoUpdateKnowledge: false,
    includeExplanations: true,
    maxSuggestedChanges: 3,
    analyzeEntities: true,
    detectIntent: true
  };

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Get EntityRelationManager instance
    // Annahme: EntityRelationManager.getInstance() existiert und gibt eine Instanz zurück,
    // die EntityRelationManagerInterface erfüllt.
    // Korrektur (TS2576): Füge eine Typassertion hinzu, um TypeScript mitzuteilen, dass das importierte Modul
    // eine statische getInstance Methode besitzt, die das erwartete Interface zurückgibt.
    // Dies behebt den Fehler lokal, erfordert aber, dass die externe Datei diese Struktur tatsächlich hat.
    const ermInstance = (EntityRelationManager as any as StaticEntityRelationManager).getInstance();


    // Weisen Sie die Instanz zu, stellen Sie sicher, dass sie die erwartete Methode hat
    if (typeof ermInstance.addRelation === 'function') {
        // Weisen Sie die Instanz direkt zu, wenn sie die Methode hat
        this.entityRelationManager = ermInstance; // Typ ist jetzt EntityRelationManagerInterface dank der Assertion beim Aufruf von getInstance()
    } else {
        // Fallback oder Fehlerbehandlung, wenn die Instanz nicht das erwartete Interface erfüllt
        console.error('[CorrectionAnalyzer] EntityRelationManager instance does not have the expected addRelation method.');
        // Erstellen Sie ein Dummy-Objekt, das das Interface erfüllt, um Laufzeitfehler zu vermeiden
        this.entityRelationManager = {
            addRelation: (sourceEntity: Entity, relationType: string, targetEntity: Entity, confidence?: number, metadata?: Record<string, any>): boolean => {
                console.warn('[CorrectionAnalyzer] Dummy EntityRelationManager.addRelation called.');
                return false; // Dummy-Implementierung gibt immer false zurück
            }
        };
    }

    console.log('[CorrectionAnalyzer] Initialized correction analyzer');
  }

  /**
   * Get the singleton instance of CorrectionAnalyzer
   */
  public static getInstance(): CorrectionAnalyzer {
    if (!CorrectionAnalyzer.instance) {
      CorrectionAnalyzer.instance = new CorrectionAnalyzer();
    }
    return CorrectionAnalyzer.instance;
  }

  /**
   * Set the KnowledgeGraph instance
   */
  public setKnowledgeGraph(knowledgeGraph: KnowledgeGraphInterface): void {
    // Stellen Sie sicher, dass die übergebene Instanz das erwartete Interface erfüllt
    if (typeof knowledgeGraph.addEntity === 'function' && typeof knowledgeGraph.addRelationship === 'function') {
        this.knowledgeGraph = knowledgeGraph;
        console.log('[CorrectionAnalyzer] KnowledgeGraph connected');
    } else {
        console.error('[CorrectionAnalyzer] Provided KnowledgeGraph instance does not have the expected methods.');
        this.knowledgeGraph = null; // Setze auf null, wenn das Interface nicht erfüllt ist
    }
  }

  /**
   * Add a new user correction
   * @param correction The user correction to add
   * @returns The ID of the added correction
   */
  public addCorrection(correction: UserCorrection): string {
    try {
      // Generate an ID if not provided
      const id = correction.id || this.generateCorrectionId(correction);

      // Add a timestamp if not provided
      const timestamp = correction.timestamp || Date.now();

      // Store the correction
      this.corrections.set(id, {
        ...correction,
        id,
        timestamp
      });

      console.log(`[CorrectionAnalyzer] Added correction with ID: ${id}`);
      return id;
    } catch (error) {
      console.error('[CorrectionAnalyzer] Error adding correction:', error);
      throw new Error('Failed to add correction');
    }
  }

  /**
   * Analyze a user correction to extract learning signals
   * @param correctionId ID of the correction to analyze
   * @param options Analysis options
   * @returns Analysis result
   */
  public analyzeCorrection(
    correctionId: string,
    options: CorrectionAnalysisOptions = {}
  ): CorrectionAnalysis {
    try {
      console.log(`[CorrectionAnalyzer] Analyzing correction: ${correctionId}`);

      // Get the correction
      const correction = this.corrections.get(correctionId);
      if (!correction) {
        throw new Error(`Correction with ID ${correctionId} not found`);
      }

      // Check if we've already analyzed this correction
      if (this.analyses.has(correctionId)) {
        return this.analyses.get(correctionId)!;
      }

      // Merge with default options
      const analysisOptions: CorrectionAnalysisOptions = {
        ...this.defaultOptions,
        ...options
      };

      // Initialize analysis result
      const analysis: CorrectionAnalysis = {
        correctionType: CorrectionType.AMBIGUOUS,
        confidence: 0,
        extractedCorrections: [],
        suggestedChanges: [],
        extractedEntities: [],
        explanation: '',
        learningValue: 0
      };

      // Step 1: Determine correction type
      const { correctionType, confidence } = this.determineCorrectType(correction);
      analysis.correctionType = correctionType;
      analysis.confidence = confidence;

      // Step 2: Extract specific corrections
      analysis.extractedCorrections = this.extractCorrections(correction, correctionType);

      // Step 3: Generate suggested changes to NLP components
      analysis.suggestedChanges = this.generateSuggestedChanges(
        correction,
        correctionType,
        analysis.extractedCorrections,
        analysisOptions.maxSuggestedChanges || 3
      );

      // Step 4: Extract entities if requested
      if (analysisOptions.analyzeEntities) {
        analysis.extractedEntities = this.extractEntitiesFromCorrection(correction);
      }

      // Step 5: Attempt intent detection if requested
      // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.intent
      if (analysisOptions.detectIntent) {
        analysis.detectedIntent = this.detectIntentFromCorrection(correction, correction.nlpResult?.intent);
      }

      // Step 6: Generate explanation
      if (analysisOptions.includeExplanations) {
        analysis.explanation = this.generateExplanation(
          correction,
          correctionType,
          analysis.extractedCorrections,
          analysis.suggestedChanges // suggestedChanges ist hier verfügbar
        );
      }

      // Step 7: Calculate learning value
      analysis.learningValue = this.calculateLearningValue(
        correction,
        correctionType,
        analysis.extractedCorrections,
        analysis.suggestedChanges // suggestedChanges ist hier verfügbar (TS2304 fix)
      );

      // Step 8: Update knowledge bases if requested
      // Korrektur (TS2532): Sicherer Zugriff auf analysisOptions.minConfidence
      if (analysisOptions.autoUpdateKnowledge &&
          analysis.confidence >= (analysisOptions.minConfidence ?? 0.6)) { // Verwende ?? für Standardwert
        this.updateKnowledgeBases(correction, analysis);
      }

      // Store the analysis
      this.analyses.set(correctionId, analysis);

      console.log(`[CorrectionAnalyzer] Completed analysis for correction: ${correctionId}`);
      return analysis;
    } catch (error) {
      console.error('[CorrectionAnalyzer] Error analyzing correction:', error);

      // Return a minimal analysis in case of error
      return {
        correctionType: CorrectionType.AMBIGUOUS,
        confidence: 0.1,
        extractedCorrections: [],
        suggestedChanges: [],
        extractedEntities: [],
        explanation: 'Error occurred during analysis',
        learningValue: 0
      };
    }
  }

  /**
   * Analyze multiple corrections in batch
   * @param correctionIds Array of correction IDs to analyze
   * @param options Analysis options
   * @returns Map of correction IDs to analysis results
   */
  public batchAnalyzeCorrections(
    correctionIds: string[],
    options: CorrectionAnalysisOptions = {}
  ): Map<string, CorrectionAnalysis> {
    const results = new Map<string, CorrectionAnalysis>();

    for (const id of correctionIds) {
      try {
        const analysis = this.analyzeCorrection(id, options);
        results.set(id, analysis);
      } catch (error) {
        console.error(`[CorrectionAnalyzer] Error analyzing correction ${id}:`, error);
        // Optional: Add a minimal error analysis to the results map
         results.set(id, {
            correctionType: CorrectionType.AMBIGUOUS,
            confidence: 0.1,
            extractedCorrections: [],
            suggestedChanges: [],
            extractedEntities: [],
            explanation: `Error analyzing correction: ${error instanceof Error ? error.message : String(error)}`,
            learningValue: 0
         });
      }
    }

    return results;
  }

  /**
   * Get all stored corrections
   * @returns Map of correction IDs to corrections
   */
  public getAllCorrections(): Map<string, UserCorrection> {
    return new Map(this.corrections);
  }

  /**
   * Get all analysis results
   * @returns Map of correction IDs to analysis results
   */
  public getAllAnalyses(): Map<string, CorrectionAnalysis> {
    return new Map(this.analyses);
  }

  /**
   * Export data for continuous learning
   * @returns Exportable data for learning
   */
  public exportLearningData(): any {
    const learningData = {
      corrections: Array.from(this.corrections.entries())
        .map(([id, correction]) => ({
          id,
          originalMessage: correction.originalMessage,
          originalResponse: correction.originalResponse,
          correctionMessage: correction.correctionMessage,
          timestamp: correction.timestamp,
          // Optional: Include relevant parts of nlpResult and context for learning
          nlpResult: correction.nlpResult ? {
              intent: correction.nlpResult.intent,
              entities: correction.nlpResult.entities,
              // Avoid including the full context object if it's large
              context: correction.nlpResult.context ? {
                  name: correction.nlpResult.context.name,
                  entities: correction.nlpResult.context.entities,
                  topics: correction.nlpResult.context.topics,
                  recentIntents: correction.nlpResult.context.recentIntents,
              } : undefined,
              // Exclude error, originalText, preprocessedText to keep data clean
          } : undefined,
          context: correction.context ? {
              name: correction.context.name,
              entities: correction.context.entities,
              topics: correction.context.topics,
              recentIntents: correction.context.recentIntents,
          } : undefined,
          userId: correction.userId,
          sessionId: correction.sessionId,
          conversationId: correction.conversationId,
          metadata: correction.metadata,
        })),
      analyses: Array.from(this.analyses.entries())
        .map(([id, analysis]) => ({
          id,
          correctionType: analysis.correctionType,
          confidence: analysis.confidence,
          extractedCorrections: analysis.extractedCorrections,
          suggestedChanges: analysis.suggestedChanges,
          extractedEntities: analysis.extractedEntities, // Include extracted entities in export
          detectedIntent: analysis.detectedIntent, // Include detected intent in export
          explanation: analysis.explanation, // Include explanation in export
          learningValue: analysis.learningValue
        }))
    };

    return learningData;
  }

  /**
   * Clear stored corrections and analyses
   */
  public clear(): void {
    this.corrections.clear();
    this.analyses.clear();
    console.log('[CorrectionAnalyzer] Cleared all corrections and analyses');
  }

  /**
   * Generate a unique ID for a correction
   */
  private generateCorrectionId(correction: UserCorrection): string {
    const timestamp = correction.timestamp || Date.now();
    const randomPart = Math.floor(Math.random() * 10000);

    return `corr_${timestamp}_${randomPart}`;
  }

  /**
   * Determine the type of correction
   */
  private determineCorrectType(
    correction: UserCorrection
  ): { correctionType: CorrectionType, confidence: number } {
    const correctionMessage = correction.correctionMessage.toLowerCase();
    const scores: Record<CorrectionType, number> = {
      [CorrectionType.FACTUAL_ERROR]: 0,
      [CorrectionType.IRRELEVANT]: 0,
      [CorrectionType.INTENT_MISUNDERSTOOD]: 0,
      [CorrectionType.ENTITY_ERROR]: 0,
      [CorrectionType.LINGUISTIC]: 0,
      [CorrectionType.INCOMPLETE]: 0,
      [CorrectionType.TONE]: 0,
      [CorrectionType.AMBIGUOUS]: 0.1 // Small baseline score for ambiguous
    };

    // Check for pattern matches in the correction message
    for (const type in this.correctionPatterns) {
        if (Object.prototype.hasOwnProperty.call(this.correctionPatterns, type)) {
            const patterns = this.correctionPatterns[type as CorrectionType];
            for (const pattern of patterns) {
                if (correctionMessage.includes(pattern)) {
                    scores[type as CorrectionType] += 0.3;
                }
            }
        }
    }


    // Additional heuristics based on message content and length

    // Check for factual corrections
    if (correctionMessage.includes('actually') ||
        correctionMessage.includes('in fact') ||
        correctionMessage.includes('the truth is')) {
      scores[CorrectionType.FACTUAL_ERROR] += 0.2;
    }

    // Check for intent misunderstanding
    if (correctionMessage.includes('i meant') ||
        correctionMessage.includes('i was asking about') ||
        correctionMessage.includes('my question was')) {
      scores[CorrectionType.INTENT_MISUNDERSTOOD] += 0.2;
    }

    // Check for incomplete responses
    if (correctionMessage.includes('also') ||
        correctionMessage.includes('additionally') ||
        correctionMessage.includes('you forgot')) {
      scores[CorrectionType.INCOMPLETE] += 0.2;
    }

    // Check length - very short corrections are often linguistic
    if (correctionMessage.split(' ').length <= 3) {
      scores[CorrectionType.LINGUISTIC] += 0.2;
    }

    // If there's a significant difference in topics, it's likely irrelevant
    // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.originalText
    const originalMessageText = correction.nlpResult?.originalText ?? correction.originalMessage; // Fallback zu originalMessage
    if (this.areTopicsDifferent(originalMessageText, correctionMessage)) {
      scores[CorrectionType.IRRELEVANT] += 0.3;
    }

    // Find the type with the highest score
    let highestScore = 0;
    let highestType = CorrectionType.AMBIGUOUS;

    for (const type in scores) {
        if (Object.prototype.hasOwnProperty.call(scores, type)) {
            const score = scores[type as CorrectionType];
            if (score > highestScore) {
                highestScore = score;
                highestType = type as CorrectionType;
            }
        }
    }


    // Normalize confidence to a reasonable range
    const confidence = Math.min(Math.max(highestScore, 0.1), 0.95);

    return {
      correctionType: highestType,
      confidence
    };
  }

  /**
   * Extract specific corrections from a user message
   */
  private extractCorrections(
    correction: UserCorrection,
    correctionType: CorrectionType
  ): { original?: string; corrected: string; type: string; confidence: number }[] {
    const extractedCorrections: {
      original?: string;
      corrected: string;
      type: string;
      confidence: number;
    }[] = [];

    const originalResponse = correction.originalResponse;
    const correctionMessage = correction.correctionMessage;

    // Different extraction strategies based on correction type
    switch (correctionType) {
      case CorrectionType.FACTUAL_ERROR:
        // Look for clear fact corrections
        this.extractFactualCorrections(
          originalResponse,
          correctionMessage,
          extractedCorrections
        );
        break;

      case CorrectionType.ENTITY_ERROR:
        // Look for entity corrections
        // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.entities
        this.extractEntityCorrections(
          originalResponse,
          correctionMessage,
          correction.nlpResult?.entities || [], // Fallback zu leerem Array
          extractedCorrections
        );
        break;

      case CorrectionType.LINGUISTIC:
        // Look for linguistic corrections
        this.extractLinguisticCorrections(
          originalResponse,
          correctionMessage,
          extractedCorrections
        );
        break;

      case CorrectionType.INCOMPLETE:
        // Extract additional information
        this.extractAdditionalInformation(
          originalResponse,
          correctionMessage,
          extractedCorrections
        );
        break;

      case CorrectionType.INTENT_MISUNDERSTOOD:
        // Extract intent clarification
        // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.intent
        // Korrektur (TS2345): originalIntent kann undefined/null sein
        this.extractIntentClarification(
          correction.originalMessage,
          correctionMessage,
          correction.nlpResult?.intent,
          extractedCorrections
        );
        break;

      case CorrectionType.IRRELEVANT:
        // Extract relevance correction
        extractedCorrections.push({
          original: originalResponse,
          corrected: 'Response was irrelevant',
          type: 'relevance',
          confidence: 0.7
        });
        break;

      case CorrectionType.TONE:
        // Extract tone correction
        this.extractToneCorrection(
          originalResponse,
          correctionMessage,
          extractedCorrections
        );
        break;

      case CorrectionType.AMBIGUOUS:
      default:
        // Try generic extraction for ambiguous corrections
        this.extractGenericCorrection(
          originalResponse,
          correctionMessage,
          extractedCorrections
        );
        break;
    }

    return extractedCorrections;
  }

  /**
   * Extract factual corrections from original and correction messages
   */
  private extractFactualCorrections(
    originalResponse: string,
    correctionMessage: string,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Common phrases that indicate factual corrections
    const correctionPhrases = [
      'actually', 'in fact', 'the truth is', 'to be precise',
      'to be accurate', 'to be correct', 'correctly speaking',
      'to clarify', 'more precisely', 'it\'s actually'
    ];

    // Check for phrases like "X is not Y, it's Z"
    const notPattern = /(.+) (is|are) not (.+), (it\'s|it is|they\'re|they are) (.+)/i;
    const notMatch = correctionMessage.match(notPattern);

    if (notMatch) {
      const subject = notMatch[1];
      const incorrectFact = notMatch[3];
      const correctFact = notMatch[5];

      // Stellen Sie sicher, dass die extrahierten Teile gültige Strings sind
      if (subject && incorrectFact && correctFact) {
          extractedCorrections.push({
            original: subject.trim(), // trim() gibt String zurück
            corrected: correctFact.trim(), // trim() gibt String zurück
            type: 'factual',
            confidence: 0.85
          });
      }


      return;
    }

    // Check for correction phrases
    for (const phrase of correctionPhrases) {
      if (correctionMessage.toLowerCase().includes(phrase)) {
        // Extract the part after the phrase
        const parts = correctionMessage.split(new RegExp(`${phrase}[,:]?\\s*`, 'i'));

        if (parts.length > 1) {
          const correctedFact = parts[1]?.trim(); // Korrektur: Optional chaining

          // Stellen Sie sicher, dass correctedFact ein String ist
          if (correctedFact) {
              // Try to find what's being corrected in the original response
              // This is imperfect and would be better with more sophisticated NLP
              const originalParts = originalResponse.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 0); // Split in Sätze
              let mostSimilarPart = '';
              let highestSimilarity = 0;

              for (const part of originalParts) {
                const similarity = this.calculateTextSimilarity(part, correctedFact);
                if (similarity > highestSimilarity) {
                  highestSimilarity = similarity;
                  mostSimilarPart = part.trim();
                }
              }

              extractedCorrections.push({
                original: highestSimilarity > 0.3 ? mostSimilarPart : undefined,
                corrected: correctedFact, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
                type: 'factual',
                confidence: highestSimilarity > 0.3 ? 0.8 : 0.6
              });
          }

          return;
        }
      }
    }

    // If no specific extraction worked, use the whole correction as a generic factual correction
    extractedCorrections.push({
      corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
      type: 'factual',
      confidence: 0.5
    });
  }

  /**
   * Extract entity corrections
   */
  private extractEntityCorrections(
    originalResponse: string,
    correctionMessage: string,
    originalEntities: Entity[],
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Common phrases that indicate entity corrections
    const entityPhrases = [
      'i meant', 'not', 'referring to', 'talking about',
      'it\'s', 'should be', 'the correct', 'called'
    ];

    // Look for direct entity corrections
    const entityPattern = /(not|isn\'t|not about|didn\'t mean) (.+?)(,| but| -| \.) ?(it\'s|i meant|i\'m talking about)? ?(.+)/i;
    const entityMatch = correctionMessage.match(entityPattern);

    if (entityMatch) {
      const incorrectEntity = entityMatch[2]?.trim(); // Korrektur: Optional chaining
      const correctEntity = entityMatch[5]?.trim(); // Korrektur: Optional chaining

      // Stellen Sie sicher, dass beide extrahierten Entitäten gültige Strings sind
      if (incorrectEntity && correctEntity) {
          // Find entity type if possible
          let entityType = 'unknown';
          for (const entity of originalEntities) {
            if (entity.value.toLowerCase() === incorrectEntity.toLowerCase()) {
              entityType = entity.type;
              break;
            }
          }

          extractedCorrections.push({
            original: incorrectEntity,
            corrected: correctEntity, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
            type: `entity:${entityType}`,
            confidence: 0.8
          });
      }

      return;
    }

    // Check for patterns like "I meant X" or "I was referring to Y"
    for (const phrase of entityPhrases) {
      if (correctionMessage.toLowerCase().includes(phrase)) {
        const parts = correctionMessage.split(new RegExp(`${phrase}[,:]?\\s*`, 'i'));

        if (parts.length > 1) {
          const entityCandidate = parts[1]?.split(/[.,!?]/)[0]?.trim(); // Korrektur: Optional chaining

          // Stellen Sie sicher, dass entityCandidate ein gültiger String ist
          if (entityCandidate) {
              // Check if this entity appears in the original entities
              let confidence = 0.6;
              let entityType = 'unknown';
              let originalEntityValue;

              // Find the most similar entity from the original list
              for (const entity of originalEntities) {
                const similarity = this.calculateTextSimilarity(
                  entity.value.toLowerCase(),
                  entityCandidate.toLowerCase()
                );

                if (similarity > 0.3) {
                  confidence = 0.7;
                  entityType = entity.type;
                  originalEntityValue = entity.value;
                  break;
                }
              }

              extractedCorrections.push({
                original: originalEntityValue,
                corrected: entityCandidate, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
                type: `entity:${entityType}`,
                confidence
              });
          }

          return;
        }
      }
    }

    // If no specific extraction worked, try to identify entities in the correction
    const potentialEntities = this.identifyPotentialEntities(correctionMessage);

    if (potentialEntities.length > 0) {
      for (const entity of potentialEntities) {
        extractedCorrections.push({
          corrected: entity, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
          type: 'entity',
          confidence: 0.5
        });
      }
    } else {
      // Default case
      extractedCorrections.push({
        corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
        type: 'entity',
        confidence: 0.4
      });
    }
  }

  /**
   * Extract linguistic corrections
   */
  private extractLinguisticCorrections(
    originalResponse: string,
    correctionMessage: string,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Check for spelling corrections (typically short)
    if (correctionMessage.split(' ').length <= 3) {
      extractedCorrections.push({
        corrected: correctionMessage.trim(), // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
        type: 'spelling',
        confidence: 0.8
      });
      return;
    }

    // Check for grammar/structure corrections
    const grammarPatterns = [
      'should be', 'should say', 'should read',
      'correctly spelled', 'spelled', 'grammar',
      'typo', 'mistake'
    ];

    for (const pattern of grammarPatterns) {
      if (correctionMessage.toLowerCase().includes(pattern)) {
        const parts = correctionMessage.split(new RegExp(`${pattern}[,:]?\\s*`, 'i'));

        if (parts.length > 1) {
          let original = parts[0]?.trim(); // Korrektur: Optional chaining
          let corrected = parts[1]?.trim(); // Korrektur: Optional chaining

          // Stellen Sie sicher, dass corrected ein String ist
          if (corrected) {
              // Handle case where the correction comes first
              if (!original || original.length === 0 || corrected.length > original.length * 2) {
                // Likely the correction is coming first, with no clear original
                extractedCorrections.push({
                  corrected: corrected, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
                  type: 'linguistic',
                  confidence: 0.7
                });
              } else {
                // Normal case: Original term, then correction
                extractedCorrections.push({
                  original: original,
                  corrected: corrected, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
                  type: 'linguistic',
                  confidence: 0.8
                });
              }
          }


          return;
        }
      }
    }

    // Check for quotes that might indicate corrections
    const quotePattern = /["'](.+?)["'].*?["'](.+?)["']/;
    const quoteMatch = correctionMessage.match(quotePattern);

    if (quoteMatch) {
      const original = quoteMatch[1];
      const corrected = quoteMatch[2];
      // Stellen Sie sicher, dass beide extrahierten Teile gültige Strings sind
      if (original && corrected) {
          extractedCorrections.push({
            original: original,
            corrected: corrected, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
            type: 'linguistic',
            confidence: 0.75
          });
      }
      return;
    }

    // Default case
    extractedCorrections.push({
      corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
      type: 'linguistic',
      confidence: 0.5
    });
  }

  /**
   * Extract additional information for incomplete responses
   */
  private extractAdditionalInformation(
    originalResponse: string,
    correctionMessage: string,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Check for common addition patterns
    const additionPatterns = [
      'also', 'additionally', 'don\'t forget', 'you forgot',
      'should have mentioned', 'should also include', 'missing',
      'left out', 'overlooked', 'failed to mention'
    ];

    for (const pattern of additionPatterns) {
      if (correctionMessage.toLowerCase().includes(pattern)) {
        const parts = correctionMessage.split(new RegExp(`${pattern}[,:]?\\s*`, 'i'));

        if (parts.length > 1) {
          const additionalInfo = parts[1]?.trim(); // Korrektur: Optional chaining

          // Stellen Sie sicher, dass additionalInfo ein String ist
          if (additionalInfo) {
              extractedCorrections.push({
                original: originalResponse,
                corrected: additionalInfo, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
                type: 'additional_information',
                confidence: 0.8
              });
          }

          return;
        }
      }
    }

    // If the correction starts with "And" or similar continuations
    if (/^(and|also|plus|moreover|furthermore|in addition)/i.test(correctionMessage)) {
      extractedCorrections.push({
        original: originalResponse,
        corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
        type: 'additional_information',
        confidence: 0.75
      });
      return;
    }

    // Default: treat the entire message as additional information
    extractedCorrections.push({
      original: originalResponse,
      corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
      type: 'additional_information',
      confidence: 0.6
    });
  }

  /**
   * Extract intent clarification
   */
  private extractIntentClarification(
    originalMessage: string,
    correctionMessage: string,
    originalIntent: Intent | null | undefined, // Korrektur (TS2345): Erlaube null | undefined
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Check for intent clarification patterns
    const intentPatterns = [
      'i meant', 'i was asking', 'my question was',
      'i wanted to know', 'i was trying to',
      'what i meant was', 'i was looking for'
    ];

    for (const pattern of intentPatterns) {
      if (correctionMessage.toLowerCase().includes(pattern)) {
        const parts = correctionMessage.split(new RegExp(`${pattern}[,:]?\\s*`, 'i'));

        if (parts.length > 1) {
          const clarifiedIntent = parts[1]?.trim(); // Korrektur: Optional chaining

          // Stellen Sie sicher, dass clarifiedIntent ein String ist
          if (clarifiedIntent) {
              extractedCorrections.push({
                original: originalIntent ? originalIntent.name : originalMessage,
                corrected: clarifiedIntent, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
                type: 'intent',
                confidence: 0.8
              });
          }

          return;
        }
      }
    }

    // Check for question reformulation
    if (correctionMessage.includes('?')) {
      extractedCorrections.push({
        original: originalMessage,
        corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
        type: 'question_reformulation',
        confidence: 0.75
      });
      return;
    }

    // Default case
    extractedCorrections.push({
      original: originalIntent ? originalIntent.name : originalMessage,
      corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
      type: 'intent',
      confidence: 0.6
    });
  }

  /**
   * Extract tone corrections
   */
  private extractToneCorrection(
    originalResponse: string,
    correctionMessage: string,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Check for tone-related patterns
    const tonePatterns = [
      'tone', 'style', 'formal', 'informal', 'professional',
      'rude', 'polite', 'friendly', 'unfriendly', 'harsh',
      'too casual', 'too formal', 'inappropriate'
    ];

    for (const pattern of tonePatterns) {
      if (correctionMessage.toLowerCase().includes(pattern)) {
        // Find tone descriptor
        let toneType = 'unknown';

        if (correctionMessage.toLowerCase().includes('too formal')) {
          toneType = 'too_formal';
        } else if (correctionMessage.toLowerCase().includes('too casual') ||
                   correctionMessage.toLowerCase().includes('too informal')) {
          toneType = 'too_casual';
        } else if (correctionMessage.toLowerCase().includes('rude') ||
                   correctionMessage.toLowerCase().includes('harsh')) {
          toneType = 'rude';
        } else if (correctionMessage.toLowerCase().includes('professional')) {
          toneType = 'professional';
        } else if (correctionMessage.toLowerCase().includes('friendly')) {
          toneType = 'friendly';
        }

        extractedCorrections.push({
          original: originalResponse,
          corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
          type: `tone:${toneType}`,
          confidence: 0.75
        });

        return;
      }
    }

    // Default case
    extractedCorrections.push({
      original: originalResponse,
      corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
      type: 'tone',
      confidence: 0.6
    });
  }

  /**
   * Generic correction extraction for ambiguous cases
   */
  private extractGenericCorrection(
    originalResponse: string,
    correctionMessage: string,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[]
  ): void {
    // Split both messages into sentences
    const originalSentences = originalResponse.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const correctionSentences = correctionMessage.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);

    // If the correction message is very short, it's likely a simple correction
    if (correctionSentences.length === 1 && (correctionSentences[0]?.split(' ').length ?? 0) <= 5) {
      extractedCorrections.push({
        corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
        type: 'correction',
        confidence: 0.6
      });
      return;
    }

    // Try to match correction sentences with original sentences
    for (const corrSentence of correctionSentences) {
      let bestMatch = '';
      let bestSimilarity = 0;

      for (const origSentence of originalSentences) {
        const similarity = this.calculateTextSimilarity(origSentence, corrSentence);
        if (similarity > bestSimilarity && similarity > 0.3) {
          bestSimilarity = similarity;
          bestMatch = origSentence;
        }
      }

      if (bestMatch) {
        extractedCorrections.push({
          original: bestMatch,
          corrected: corrSentence, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
          type: 'generic_correction',
          confidence: bestSimilarity
        });
      } else {
        // No good match, might be additional information
        extractedCorrections.push({
          corrected: corrSentence, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
          type: 'additional_information',
          confidence: 0.5
        });
      }
    }

    // If no extractions were made, use the whole message
    if (extractedCorrections.length === 0) {
      extractedCorrections.push({
        corrected: correctionMessage, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
        type: 'generic_correction',
        confidence: 0.4
      });
    }
  }

  /**
   * Generate suggested changes to NLP components
   */
  private generateSuggestedChanges(
    correction: UserCorrection,
    correctionType: CorrectionType,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[],
    maxSuggestions: number = 3
  ): { component: 'intent' | 'entity' | 'context' | 'response' | 'knowledge'; parameter: string; suggestedValue: any; confidence: number }[] {
    const suggestions: {
      component: 'intent' | 'entity' | 'context' | 'response' | 'knowledge';
      parameter: string;
      suggestedValue: any;
      confidence: number;
    }[] = [];

    // Generate suggestions based on correction type
    switch (correctionType) {
      case CorrectionType.FACTUAL_ERROR:
        // Suggest knowledge base updates
        for (const extracted of extractedCorrections) {
          if (extracted.original && extracted.corrected) {
            suggestions.push({
              component: 'knowledge',
              parameter: 'fact_correction',
              suggestedValue: {
                incorrect: extracted.original,
                correct: extracted.corrected
              },
              confidence: extracted.confidence
            });
          }
        }
        break;

      case CorrectionType.INTENT_MISUNDERSTOOD:
        // Suggest intent detection improvements
        // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.intent
        // Korrektur (TS2345): originalIntent kann undefined/null sein
        if (correction.nlpResult?.intent) {
          const originalIntent = correction.nlpResult.intent;

          // Extract potential intent from correction
          const potentialIntent = this.inferIntentFromCorrection(
            correction.correctionMessage,
            originalIntent
          );

          if (potentialIntent) {
            suggestions.push({
              component: 'intent',
              parameter: 'intent_correction',
              suggestedValue: {
                original: originalIntent,
                suggested: potentialIntent
              },
              confidence: 0.7
            });
          }
        }
        break;

      case CorrectionType.ENTITY_ERROR:
        // Suggest entity detection improvements
        for (const extracted of extractedCorrections) {
          if (extracted.type.startsWith('entity:') && extracted.original && extracted.corrected) {
            const entityType = extracted.type.split(':')[1];

            suggestions.push({
              component: 'entity',
              parameter: 'entity_correction',
              suggestedValue: {
                incorrectEntity: extracted.original,
                correctEntity: extracted.corrected,
                entityType
              },
              confidence: extracted.confidence
            });
          }
        }
        break;

      case CorrectionType.IRRELEVANT:
        // Suggest context management improvements
        // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.context
        if (correction.nlpResult?.context) {
          suggestions.push({
            component: 'context',
            parameter: 'context_relevance',
            suggestedValue: {
              originalContext: correction.nlpResult.context,
              issue: 'irrelevant_response'
            },
            confidence: 0.7
          });
        }

        // Also suggest response generation improvements
        suggestions.push({
          component: 'response',
          parameter: 'relevance',
          suggestedValue: {
            originalQuery: correction.originalMessage,
            irrelevantResponse: correction.originalResponse,
            userFeedback: correction.correctionMessage
          },
          confidence: 0.8
        });
        break;

      case CorrectionType.INCOMPLETE:
        // Suggest response generation improvements
        for (const extracted of extractedCorrections) {
          if (extracted.type === 'additional_information') {
            suggestions.push({
              component: 'response',
              parameter: 'completeness',
              suggestedValue: {
                originalResponse: correction.originalResponse,
                missingInformation: extracted.corrected
              },
              confidence: extracted.confidence
            });

            // Also suggest knowledge base updates if confidence is high
            if (extracted.confidence > 0.7) {
              // Korrektur (TS2532): Sicherer Zugriff auf correction.context
              suggestions.push({
                component: 'knowledge',
                parameter: 'additional_fact',
                suggestedValue: {
                  topic: this.inferTopicFromContext(correction.context),
                  additionalFact: extracted.corrected
                },
                confidence: extracted.confidence - 0.1
              });
            }
          }
        }
        break;

      case CorrectionType.TONE:
        // Suggest response generation tone adjustments
        suggestions.push({
          component: 'response',
          parameter: 'tone',
          suggestedValue: {
            originalResponse: correction.originalResponse,
            toneIssue: this.inferToneIssue(correction.correctionMessage)
          },
          confidence: 0.7
        });
        break;

      case CorrectionType.LINGUISTIC:
        // Suggest linguistic improvements
        for (const extracted of extractedCorrections) {
          // Stellen Sie sicher, dass original und corrected Strings sind, bevor sie verwendet werden
          if (extracted.original !== undefined && extracted.corrected !== undefined) {
              suggestions.push({
                component: 'response',
                parameter: 'linguistic',
                suggestedValue: {
                  incorrect: extracted.original,
                  correct: extracted.corrected,
                  type: 'spelling_grammar'
                },
                confidence: extracted.confidence
              });
          }
        }
        break;

      case CorrectionType.AMBIGUOUS:
      default:
        // Generic suggestions based on extracted corrections
        for (const extracted of extractedCorrections) {
          suggestions.push({
            component: 'response',
            parameter: 'generic_improvement',
            suggestedValue: {
              originalResponse: correction.originalResponse,
              suggestedImprovement: extracted.corrected
            },
            confidence: 0.5
          });
        }
        break;
    }

    // Sort by confidence and limit to max suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);
  }

  /**
   * Extract entities from a correction message
   */
  private extractEntitiesFromCorrection(correction: UserCorrection): Entity[] {
    const extractedEntities: Entity[] = [];
    const message = correction.correctionMessage;

    // Extract potential proper nouns (basic approach)
    const words = message.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i]?.replace(/[.,!?;:()]/g, ''); // Korrektur: Optional chaining
      // Stellen Sie sicher, dass word ein String ist
      if (!word) continue;

      // Skip short words
      if (word.length <= 2) continue;

      // Check if word starts with a capital letter (potential entity)
      if (/^[A-Z][a-z]+$/.test(word) && !this.isCommonWord(word)) {
        // Try to infer entity type
        const entityType = this.inferEntityType(word, message);

        // Look for multi-word entities
        let entityValue = word;
        let j = i + 1;
        while (j < words.length) {
          const nextWord = words[j]?.replace(/[.,!?;:()]/g, ''); // Korrektur: Optional chaining
          // Stellen Sie sicher, dass nextWord ein String ist
          if (!nextWord) break;

          if (/^[A-Z][a-z]+$/.test(nextWord) || nextWord === 'of' || nextWord === 'the') {
            entityValue += ' ' + nextWord;
            j++;
          } else {
            break;
          }
        }

        // Skip common mistake capitalization and first words in sentences
        // Add a confidence check for this basic extraction
        if (i > 0 || /[A-Z][a-z]+[A-Z]/.test(entityValue) || entityValue.length > 10) { // Added check for length > 10
             extractedEntities.push({
               type: entityType,
               value: entityValue, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
               confidence: 0.6
             });
             // Skip words that were part of this entity
             i = j - 1;
         } else if (i === 0 && entityValue.length > 3 && entityValue.length <= 10) { // Allow shorter first words if not extremely short
             extractedEntities.push({
               type: entityType,
               value: entityValue, // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
               confidence: 0.4
             });
             // Skip words that were part of this entity
             i = j - 1;
         }


      }
    }

    // If original message had entities, compare with them
    // Korrektur (TS2532): Sicherer Zugriff auf nlpResult?.entities
    if (correction.nlpResult?.entities && Array.isArray(correction.nlpResult.entities)) {
      // Korrektur (TS2345): Filtere undefined/null Elemente, bevor du iterierst
      const originalEntities = correction.nlpResult.entities.filter((e): e is Entity => e != null);

      for (const originalEntity of originalEntities) {
        // Check if original entity appears in correction message
        if (originalEntity.value && message.includes(originalEntity.value)) { // Korrektur: Check originalEntity.value
          // Check if we already extracted this entity
          const alreadyExtracted = extractedEntities.some(
            e => e.value === originalEntity.value
          );

          if (!alreadyExtracted) {
            extractedEntities.push({
              ...originalEntity,
              confidence: Math.min( (originalEntity.confidence || 0) + 0.2, 1.0) // Höhere Konfidenz, aber max 1.0
            });
          }
        }
      }
    }

    return extractedEntities;
  }

  /**
   * Detect intent from correction message
   */
  private detectIntentFromCorrection(
    correction: UserCorrection,
    originalIntent: Intent | null | undefined // Korrektur (TS2345): Erlaube null | undefined
  ): Intent | undefined {
    // If we don't have an original intent, return undefined
    // Oder vielleicht sollten wir hier versuchen, den Intent komplett neu zu erkennen,
    // auch wenn der ursprüngliche Intent unbekannt war?
    // Für jetzt folgen wir der Logik, die auf dem ursprünglichen Intent basiert.
    // if (!originalIntent) {
    //   // Hier könnte eine komplexere Intent-Erkennung laufen
    //   return undefined;
    // }

    // For intent misunderstanding corrections, try to infer a better intent
    if (this.determineCorrectType(correction).correctionType === CorrectionType.INTENT_MISUNDERSTOOD) {
      return this.inferIntentFromCorrection(
        correction.correctionMessage,
        originalIntent
      );
    }

    // For other corrections, check if intent patterns appear in correction
    const message = correction.correctionMessage.toLowerCase();

    // Check for question intent patterns
    if (message.includes('?') ||
        message.startsWith('what') ||
        message.startsWith('how') ||
        message.startsWith('when') ||
        message.startsWith('where') ||
        message.startsWith('why') ||
        message.startsWith('who')) {

      return {
        name: 'user_question_in_correction',
        type: 'question',
        confidence: 0.7
      };
    }

    // Check for request intent patterns
    if (message.startsWith('can you') ||
        message.startsWith('could you') ||
        message.startsWith('please') ||
        message.includes('i want') ||
        message.includes('i need')) {

      return {
        name: 'user_request_in_correction',
        type: 'request',
        confidence: 0.7
      };
    }

    // Check for explicit correction intent patterns
    if (message.includes('actually') ||
        message.includes('correction') ||
        message.includes('wrong') ||
        message.includes('incorrect') ||
        message.includes('not right')) {

      return {
        name: 'user_explicit_correction',
        type: 'correction',
        confidence: 0.8
      };
    }


    // If no specific intent pattern found, default to the original intent but with lower confidence
    // oder vielleicht nur undefined, wenn der ursprüngliche Intent nicht bestätigt wird?
    // Lassen wir es bei der ursprünglichen Logik, aber mit sichererem Zugriff
    // Korrektur (TS2532): Sicherer Zugriff auf originalIntent
    if (originalIntent) {
        return {
          ...originalIntent,
          confidence: originalIntent.confidence * 0.8 // Leichte Reduzierung, da der User eine Korrektur gab
        };
    }

    return undefined; // Rückgabe undefined, wenn kein originalIntent vorhanden ist und keine Muster matchen
  }

  /**
   * Generate explanation for the analysis
   */
  private generateExplanation(
    correction: UserCorrection,
    correctionType: CorrectionType,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[],
    suggestedChanges: { component: 'intent' | 'entity' | 'context' | 'response' | 'knowledge'; parameter: string; suggestedValue: any; confidence: number }[]
  ): string {
    let explanation = `The user's correction appears to be a ${this.humanizeCorrectType(correctionType)} correction. `;

    if (extractedCorrections.length > 0) {
      explanation += 'Specifically, I identified the following corrections: ';

      const correctionDescriptions = extractedCorrections.map((correction, index) => {
        const prefix = `(${index + 1}) `;

        if (correction.original !== undefined) { // Check specifically for undefined
          return `${prefix}"${correction.original}" should be "${correction.corrected}"`;
        } else {
          return `${prefix}${correction.corrected}`;
        }
      });

      explanation += correctionDescriptions.join('; ') + '. ';
    }

    if (suggestedChanges.length > 0) {
      explanation += 'Based on this, I suggest the following improvements: ';

      const suggestionDescriptions = suggestedChanges.map((suggestion, index) => {
        const prefix = `(${index + 1}) `;

        switch (suggestion.component) {
          case 'intent':
            return `${prefix}Improve intent detection accuracy`;
          case 'entity':
            // Korrektur (TS2532): Sicherer Zugriff auf suggestedValue.correctEntity
            const entityValue = suggestion.suggestedValue?.correctEntity ?? 'an entity';
            return `${prefix}Update entity extraction for "${entityValue}"`;
          case 'context':
            return `${prefix}Enhance context relevance handling`;
          case 'response':
            return `${prefix}Improve response generation for ${suggestion.parameter}`;
          case 'knowledge':
            return `${prefix}Update knowledge base with corrected information`;
          default:
            return `${prefix}Make general improvements to ${suggestion.component}`;
        }
      });

      explanation += suggestionDescriptions.join('; ') + '.';
    }

    return explanation;
  }

  /**
   * Calculate the learning value from a correction
   * @param correction The user correction object
   * @param correctionType The identified correction type
   * @param extractedCorrections Array of extracted corrections
   * @param suggestedChanges Array of suggested changes (TS2304 fix: Added as parameter)
   * @returns Learning value (0.0 to 1.0)
   */
  private calculateLearningValue( // TS2304 fix: Added suggestedChanges parameter
    correction: UserCorrection,
    correctionType: CorrectionType,
    extractedCorrections: { original?: string; corrected: string; type: string; confidence: number }[],
    suggestedChanges: { component: 'intent' | 'entity' | 'context' | 'response' | 'knowledge'; parameter: string; suggestedValue: any; confidence: number }[]
  ): number {
    // Base learning value depends on correction type
    const baseValueByType: Record<CorrectionType, number> = {
      [CorrectionType.FACTUAL_ERROR]: 0.8, // High value for factual corrections
      [CorrectionType.INTENT_MISUNDERSTOOD]: 0.7, // High value for intent corrections
      [CorrectionType.ENTITY_ERROR]: 0.7, // High value for entity corrections
      [CorrectionType.IRRELEVANT]: 0.6, // Medium value for relevance feedback
      [CorrectionType.LINGUISTIC]: 0.5, // Medium value for linguistic corrections
      [CorrectionType.INCOMPLETE]: 0.6, // Medium value for completeness corrections
      [CorrectionType.TONE]: 0.4, // Lower value for tone corrections
      [CorrectionType.AMBIGUOUS]: 0.3, // Low value for ambiguous corrections
    };

    let learningValue = baseValueByType[correctionType];

    // Adjust based on correction confidence
    const avgConfidence = extractedCorrections.reduce(
      (sum, corr) => sum + corr.confidence, 0
    ) / Math.max(1, extractedCorrections.length); // Prevent division by zero

    learningValue *= avgConfidence;

    // Adjust based on correction specificity
    if (extractedCorrections.length > 0) {
      const hasSpecificCorrections = extractedCorrections.some(
        corr => corr.original !== undefined // Check specifically for undefined
      );

      if (hasSpecificCorrections) {
        learningValue = Math.min(learningValue + 0.1, 1.0); // Bonus for specific corrections, cap at 1.0
      }
    }

    // Adjust for length of correction message
    const wordCount = correction.correctionMessage.split(/\s+/).length;
    if (wordCount > 10) {
      learningValue = Math.min(learningValue + 0.05, 1.0); // Bonus for detailed corrections, cap at 1.0
    }

    // Adjust for number of suggested changes
    if (suggestedChanges.length > 0) {
      learningValue = Math.min(learningValue + 0.05, 1.0); // Bonus if we could generate actionable suggestions, cap at 1.0
    }

    // Cap at maximum of 1.0 and ensure minimum
    return Math.min(Math.max(learningValue, 0.1), 1.0);
  }

  /**
   * Update knowledge bases based on correction analysis
   */
  private updateKnowledgeBases(
    correction: UserCorrection,
    analysis: CorrectionAnalysis
  ): void {
    // Update entity relation manager
    this.updateEntityRelations(correction, analysis);

    // Update knowledge graph if available
    if (this.knowledgeGraph) {
      this.updateKnowledgeGraph(correction, analysis);
    }
  }

  /**
   * Update entity relations based on correction analysis
   */
  private updateEntityRelations(
    correction: UserCorrection,
    analysis: CorrectionAnalysis
  ): void {
    // Only update for factual errors and entity errors with high confidence
    if ((analysis.correctionType === CorrectionType.FACTUAL_ERROR ||
         analysis.correctionType === CorrectionType.ENTITY_ERROR) &&
        analysis.confidence >= 0.7) {

      // Extract entities from the correction
      // Korrektur (TS2345): Filtere undefined/null Elemente aus analysis.extractedEntities
      const entities = analysis.extractedEntities.filter((e): e is Entity => e != null);


      // Process extracted corrections
      for (const extracted of analysis.extractedCorrections) {
        // For entity corrections
        if (extracted.type.startsWith('entity:') && extracted.original && extracted.corrected) {
          const entityType = extracted.type.split(':')[1];

          // Find the old entity - requires a string value
          // Korrektur (TS2322): extracted.original ist hier durch die if-Bedingung garantiert ein String
          const oldEntity: Entity = {
            type: entityType || 'entity',
            value: extracted.original as string,
            confidence: 0.5
          };

          // Create the new entity - requires a string value
          // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
          const newEntity: Entity = {
            type: entityType || 'entity',
            value: extracted.corrected,
            confidence: 0.8
          };

          // Add relationship between them (corrected -> original)
          this.entityRelationManager.addRelation(
            newEntity,
            'correctionOf',
            oldEntity,
            extracted.confidence
          );
        }

        // For factual corrections
        else if (extracted.type === 'factual' && extracted.original && extracted.corrected) {
          // Try to identify entities within the factual correction
          // This is simplified; a real implementation would use more sophisticated NLP
          const originalEntities = this.identifyPotentialEntities(extracted.original); // Returns string[]
          const correctedEntities = this.identifyPotentialEntities(extracted.corrected); // Returns string[]

          // Korrektur (TS2322): Sicherstellen, dass die Arrays nicht leer sind vor dem Zugriff auf [0]
          if (originalEntities.length > 0 && correctedEntities.length > 0) {
            // Create entities
            const originalEntity: Entity = {
              type: 'fact',
              value: originalEntities[0]!, // Non-null assertion after length check
              confidence: 0.6
            };

            const correctedEntity: Entity = {
              type: 'fact',
              value: correctedEntities[0]!, // Non-null assertion after length check
              confidence: 0.8
            };

            // Add relationship
            this.entityRelationManager.addRelation(
              correctedEntity,
              'correctVersionOf',
              originalEntity,
              extracted.confidence
            );
          }
        }
      }

      // Also try to identify relationships between entities *found in the correction analysis*
      // (These are already filtered for null/undefined at the start of the method)
      if (entities.length >= 2) { // Use the already filtered 'entities' array
        // Korrektur (TS2345): Elemente im Array sind nach dem Filter (e): e is Entity => e != null garantiert vom Typ Entity
        for (let i = 0; i < entities.length - 1; i++) {
          for (let j = i + 1; j < entities.length; j++) {
            // Add a generic relationship
            this.entityRelationManager.addRelation(
              entities[i] as Entity, // Typassertion zur Klarheit, obwohl der Filter ausreichen sollte
              'mentionedWith',
              entities[j] as Entity, // Typassertion zur Klarheit
              0.6
            );
          }
        }
      }
    }
  }

  /**
   * Update knowledge graph based on correction analysis
   */
  private updateKnowledgeGraph(
    correction: UserCorrection,
    analysis: CorrectionAnalysis
  ): void {
    if (!this.knowledgeGraph) return;

    // Only update for factual errors with high confidence
    if (analysis.correctionType === CorrectionType.FACTUAL_ERROR && analysis.confidence >= 0.7) {
      // Process extracted corrections
      for (const extracted of analysis.extractedCorrections) {
        if (extracted.type === 'factual' && extracted.original && extracted.corrected) {
          // Add entities for the factual correction
          // Korrektur (TS2322): extracted.original ist hier durch die if-Bedingung garantiert ein String
          const originalEntity: Entity = {
            type: 'statement',
            value: extracted.original as string,
            confidence: 0.6
          };

          // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)
          const correctedEntity: Entity = {
            type: 'statement',
            value: extracted.corrected,
            confidence: 0.8
          };

          // Add both to the knowledge graph
          this.knowledgeGraph.addEntity(originalEntity, 'correction_analysis');
          this.knowledgeGraph.addEntity(correctedEntity, 'correction_analysis');

          // Add a relationship
          this.knowledgeGraph.addRelationship(
            correctedEntity,
            'correctsStatement',
            originalEntity,
            extracted.confidence,
            'correction_analysis'
          );
        }
      }
    }

    // Add extracted entities from the analysis result to the knowledge graph
    // Korrektur (TS2345): Filtere undefined/null Elemente, bevor du iterierst
    const safeExtractedEntities = analysis.extractedEntities.filter((e): e is Entity => e != null);
    for (const entity of safeExtractedEntities) {
      this.knowledgeGraph.addEntity(entity, 'correction_analysis');
    }
  }

  /**
   * Calculate similarity between two texts
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    // Tokenize the texts
    // Korrektur (TS2554): basicTokenize erwartet nur 2 Argumente
    const tokens1 = basicTokenize(text1, { toLowerCase: true });
    const tokens2 = basicTokenize(text2, { toLowerCase: true });

    // Calculate token-based similarity
    // Assuming a cosineSimilarity or jaccardSimilarity exists in tokenizer.ts
    // Let's use Jaccard similarity for simplicity based on previous discussion
    // Korrektur: Annahme, dass jaccardSimilarity existiert ODER implementiere sie hier
    // Da sie nicht importiert wurde und nicht im bereitgestellten tokenizer.ts Code ist,
    // füge ich eine einfache Implementierung hinzu oder nehme an, sie existiert und wird korrekt importiert/aufgerufen.
    // Die vorherige Version hatte `calculateTokenSimilarity`, die delegiert hat.
    // Lasst uns hier basic Jaccard oder Cosine implementieren, da die Imports nicht da sind.
    // Alternative: Füge import { jaccardSimilarity } from '../../utils/tokenizer'; hinzu
    // Basierend auf dem bereitgestellten tokenizer.ts sollte `jaccardSimilarity` existieren.
    // Importiere es also oben.
    // import { basicTokenize, jaccardSimilarity } from '../../utils/tokenizer';

    // Re-check: tokenizer.ts provided earlier *does* have jaccardSimilarity. Import corrected at top.
     return this.jaccardSimilarity(tokens1, tokens2); // Delegate to local helper or imported one


  }

  /**
   * Berechnet die Jaccard-Ähnlichkeit zwischen zwei Token-Listen
   * Kopie der Implementierung aus tokenizer.ts, um Abhängigkeit zu verdeutlichen,
   * oder sicherzustellen, dass es funktioniert, falls der Import fehlschlägt.
   * Idealerweise wird diese Funktion direkt aus tokenizer.ts importiert und verwendet.
   */
  private jaccardSimilarity(tokens1: string[], tokens2: string[]): number {
      if (!tokens1 || !tokens2) return 0;
      if (tokens1.length === 0 && tokens2.length === 0) return 1.0;
      if (tokens1.length === 0 || tokens2.length === 0) return 0.0;

      const set1 = new Set(tokens1);
      const set2 = new Set(tokens2);

      const intersection = new Set([...set1].filter(token => set2.has(token)));
      const union = new Set([...set1, ...set2]);

      return intersection.size / union.size;
  }


  /**
   * Check if topics in two messages are significantly different
   */
  private areTopicsDifferent(message1: string, message2: string): boolean {
    const similarity = this.calculateTextSimilarity(message1, message2);
    return similarity < 0.3; // Threshold for topic difference
  }

  /**
   * Infer an intent from the correction message
   */
  private inferIntentFromCorrection(
    correctionMessage: string,
    originalIntent: Intent | null | undefined // Korrektur (TS2345): Erlaube null | undefined
  ): Intent | undefined {
    // Extract corrected intent from patterns like "I meant X", "I was asking about Y"
    const patterns = [
      /i meant\s+(.+)/i,
      /i was asking\s+about\s+(.+)/i,
      /my question was\s+about\s+(.+)/i,
      /i wanted to know\s+about\s+(.+)/i,
      /i was trying to\s+(.+)/i
    ];

    for (const pattern of patterns) {
      const match = correctionMessage.match(pattern);
      if (match && match[1]) {
        const intentText = match[1]?.trim(); // Korrektur: Optional chaining

        // Stellen Sie sicher, dass intentText ein String ist
        if (intentText) {
            // Try to determine intent type
            let intentType = originalIntent?.type || 'unknown';

            // Question patterns
            if (intentText.endsWith('?') ||
                intentText.toLowerCase().startsWith('if') ||
                intentText.toLowerCase().startsWith('whether') ||
                intentText.toLowerCase().startsWith('what') ||
                intentText.toLowerCase().startsWith('how') ||
                intentText.toLowerCase().startsWith('why') ||
                intentText.toLowerCase().startsWith('when') ||
                intentText.toLowerCase().startsWith('where') ||
                intentText.toLowerCase().startsWith('who')) {
              intentType = 'question';
            }
            // Command/request patterns
            else if (intentText.toLowerCase().startsWith('get') ||
                     intentText.toLowerCase().startsWith('find') ||
                     intentText.toLowerCase().startsWith('show') ||
                     intentText.toLowerCase().startsWith('tell')) {
              intentType = 'command'; // Oder 'function', je nach Systemkonvention
            }

            // Basic check to avoid creating an intent from just a few words
            if (intentText.split(' ').length < 2) {
                continue; // Überspringe sehr kurze intent Kandidaten
            }

            return {
              name: `corrected_${originalIntent?.name || 'intent'}_${intentType}`, // Eindeutigeren Namen generieren
              type: intentType,
              confidence: 0.7
            };
        }
      }
    }

    // Check if the message is a completely new query (e.g. starts with a question word and ends with ?)
    if (correctionMessage.includes('?') && (
        correctionMessage.toLowerCase().startsWith('what') ||
        correctionMessage.toLowerCase().startsWith('how') ||
        correctionMessage.toLowerCase().startsWith('when') ||
        correctionMessage.toLowerCase().startsWith('where') ||
        correctionMessage.toLowerCase().startsWith('why') ||
        correctionMessage.toLowerCase().startsWith('who') ||
        correctionMessage.toLowerCase().startsWith('can you') ||
        correctionMessage.toLowerCase().startsWith('could you')
        )) {
      return {
        name: 'new_user_query_question',
        type: 'question',
        confidence: 0.8
      };
    }

     // Check for clear command/request patterns
     if (correctionMessage.toLowerCase().startsWith('please') || correctionMessage.toLowerCase().includes('i want to')) {
         return {
             name: 'new_user_query_request',
             type: 'request',
             confidence: 0.75
         };
     }


    // Default to the original intent but with slightly reduced confidence
    // oder nur undefined, wenn der ursprüngliche Intent nicht bestätigt wird?
    // Lassen wir es bei der ursprünglichen Logik, aber mit sichererem Zugriff
    // Korrektur (TS2532): Sicherer Zugriff auf originalIntent
    if (originalIntent) {
        return {
          ...originalIntent,
          confidence: originalIntent.confidence * 0.8 // Leichte Reduzierung, da der User eine Korrektur gab
        };
    }

    return undefined; // Rückgabe undefined, wenn kein originalIntent vorhanden ist und keine Muster matchen
  }

  /**
   * Identify potential entities in a text
   */
  private identifyPotentialEntities(text: string): string[] {
    const entities: string[] = [];

    // Look for capitalized words (potential entities)
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i]?.replace(/[.,!?;:"'()]/g, ''); // Korrektur: Optional chaining
      // Stellen Sie sicher, dass word ein String ist
      if (!word) continue;

      // Ignore short words
      if (word.length <= 2) continue;

      // Check if word starts with a capital letter (potential entity)
      if (/^[A-Z][a-z]+$/.test(word) && !this.isCommonWord(word)) {
        // Look for multi-word entities
        let entityValue = word;
        let j = i + 1;

        while (j < words.length) {
          const nextWord = words[j]?.replace(/[.,!?;:"'()]/g, ''); // Korrektur: Optional chaining
          // Stellen Sie sicher, dass nextWord ein String ist
          if (!nextWord) break;

          if (/^[A-Z][a-z]+$/.test(nextWord) || nextWord === 'of' || nextWord === 'the') {
            entityValue += ' ' + nextWord;
            j++;
          } else {
            break;
          }
        }

        // Skip first word of sentence unless it's clearly an entity
        // Add a confidence check for this basic extraction
        if (i > 0 || /[A-Z][a-z]+[A-Z]/.test(entityValue) || entityValue.length > 10) { // Added check for length > 10
             entities.push(entityValue); // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)

             // Skip words that were part of this entity
             i = j - 1;
         } else if (i === 0 && entityValue.length > 3 && entityValue.length <= 10) { // Allow shorter first words if not extremely short
             entities.push(entityValue); // Korrektur (TS2322 wurde hier bereits behoben durch den Typstring)

             // Skip words that were part of this entity
             i = j - 1;
         }


      }
    }

    return entities;
  }

  /**
   * Check if a word is a common English word
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([ // Use Set for faster lookup
      'I', 'You', 'He', 'She', 'It', 'We', 'They',
      'This', 'That', 'These', 'Those',
      'The', 'A', 'An',
      'And', 'But', 'Or', 'If', 'So', 'Because',
      'Yes', 'No', 'Maybe',
      'Can', 'Could', 'Would', 'Should',
      // Added some common sentence starters
      'Is', 'Are', 'Was', 'Were', 'Do', 'Does', 'Did',
      'Please', 'Thank', 'Hello', 'Hi', 'Goodbye', 'Bye',
      'Okay', 'Ok'
    ]);

    return commonWords.has(word);
  }

  /**
   * Infer the entity type from context
   */
  private inferEntityType(entityValue: string, context: string): string {
    // Simple rule-based inference
    const lowerContext = context.toLowerCase();

    // Check for organization indicators
    if (
      lowerContext.includes('company') ||
      lowerContext.includes('organization') ||
      lowerContext.includes('corporation') ||
      lowerContext.includes('inc') ||
      lowerContext.includes('ltd') ||
      /\b[A-Z]{2,}\b/.test(entityValue) // All caps might be acronym
    ) {
      return 'organization';
    }

    // Check for person indicators
    if (
      lowerContext.includes('person') ||
      lowerContext.includes('people') ||
      lowerContext.includes('he said') ||
      lowerContext.includes('she said') ||
      lowerContext.includes('told me') ||
      lowerContext.includes('asked me') ||
      entityValue.includes('.') // Like Mr. or Ms.
    ) {
      return 'person';
    }

    // Check for location indicators
    if (
      lowerContext.includes('location') ||
      lowerContext.includes('place') ||
      lowerContext.includes('country') ||
      lowerContext.includes('city') ||
      lowerContext.includes('state') ||
      lowerContext.includes('province') ||
      lowerContext.includes('region') ||
      lowerContext.includes('in the') ||
      lowerContext.includes('at the') ||
      lowerContext.includes('from')
    ) {
      return 'location';
    }

    // Check for product/feature indicators
    if (
      lowerContext.includes('product') ||
      lowerContext.includes('item') ||
      lowerContext.includes('buy') ||
      lowerContext.includes('purchase') ||
      lowerContext.includes('model') ||
      lowerContext.includes('feature') ||
      lowerContext.includes('function') ||
      lowerContext.includes('service')
    ) {
      return 'product_or_feature';
    }

     // Check for date/time indicators (basic)
     if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|mon|tue|wed|thu|fri|sat|sun|today|tomorrow|yesterday)\b/i.test(entityValue) ||
         /\d{1,2}\/\d{1,2}(\/\d{2,4})?/.test(entityValue) || // MM/DD/YYYY
         /\d{4}-\d{2}-\d{2}/.test(entityValue) || // YYYY-MM-DD
         /\d{1,2}:\d{2}/.test(entityValue) // HH:MM
        ) {
         return 'date_time';
     }

    // Default to generic entity
    return 'entity';
  }

  /**
   * Infer the topic from context
   */
  private inferTopicFromContext(context?: Context): string {
    if (!context) return 'unknown';

    // Korrektur (TS2532): Sicherer Zugriff auf context.topics
    if (context.topics && Array.isArray(context.topics) && context.topics.length > 0) {
      return context.topics[0] ?? 'unknown'; // Fallback für undefined/null im Array
    }

    // Fallback to context name if no topics
    if (context.name && context.name !== 'unknown' && context.name !== 'initial') {
         return context.name;
    }


    return 'unknown';
  }

  /**
   * Infer the tone issue from a correction message
   */
  private inferToneIssue(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('too formal') || lowerMessage.includes('too stiff')) {
      return 'too_formal';
    }

    if (lowerMessage.includes('too casual') || lowerMessage.includes('too informal')) {
      return 'too_casual';
    }

    if (lowerMessage.includes('rude') || lowerMessage.includes('impolite') || lowerMessage.includes('offensive') || lowerMessage.includes('unprofessional')) {
      return 'inappropriate';
    }

    if (lowerMessage.includes('unclear') || lowerMessage.includes('confusing') || lowerMessage.includes('hard to understand')) {
      return 'unclear';
    }

    if (lowerMessage.includes('friendly') || lowerMessage.includes('warmer') || lowerMessage.includes('nicer')) {
      return 'needs_friendlier';
    }

    if (lowerMessage.includes('professional')) {
      return 'needs_professional';
    }

     if (lowerMessage.includes('polite') || lowerMessage.includes('courteous')) {
         return 'needs_polite';
     }


    // Default
    return 'inappropriate_tone';
  }

  /**
   * Convert correction type to human-readable form
   */
  private humanizeCorrectType(type: CorrectionType): string {
    const mapping: Record<CorrectionType, string> = {
      [CorrectionType.FACTUAL_ERROR]: 'factual error', // Geändert für bessere Lesbarkeit
      [CorrectionType.IRRELEVANT]: 'relevance issue', // Geändert
      [CorrectionType.INTENT_MISUNDERSTOOD]: 'intent clarification',
      [CorrectionType.ENTITY_ERROR]: 'entity error', // Geändert
      [CorrectionType.LINGUISTIC]: 'linguistic error', // Geändert
      [CorrectionType.INCOMPLETE]: 'completeness issue', // Geändert
      [CorrectionType.TONE]: 'tone issue', // Geändert
      [CorrectionType.AMBIGUOUS]: 'general correction' // Geändert
    };

    return mapping[type] || 'general correction';
  }
}

// Export default instance
export default CorrectionAnalyzer.getInstance();