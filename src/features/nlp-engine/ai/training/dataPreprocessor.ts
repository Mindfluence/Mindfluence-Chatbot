/**
 * features/nlp-engine/ai/training/dataPreprocessor.ts
 * 
 * Responsible for preparing and transforming data for NLP model training
 * Provides utilities for cleaning, augmentation, and normalization
 */

import type { 
  IntentItem, 
  EntityItem, 
  Language, 
  Intent,
  Entity
} from '@/types/nlp.types';
import { tokenize } from '../../utils/tokenizer';
import { config } from '../../config';

// Configuration for preprocessing operations
export interface PreprocessingConfig {
  removeStopwords?: boolean;         // Whether to remove stopwords
  stemming?: boolean;                // Whether to apply stemming
  lowercase?: boolean;               // Whether to convert to lowercase
  removeSpecialChars?: boolean;      // Whether to remove special characters
  removeNumbers?: boolean;           // Whether to remove numbers
  removePunctuation?: boolean;       // Whether to remove punctuation
  normalizeWhitespace?: boolean;     // Whether to normalize whitespace
  normalizeGermanUmlauts?: boolean;  // Whether to normalize German umlauts
  minTokenLength?: number;           // Minimum token length to keep
  maxTokenLength?: number;           // Maximum token length to keep
  language?: Language;               // Language for language-specific processing
}

// Configuration for intent data preprocessing
export interface IntentPreprocessingConfig extends PreprocessingConfig {
  augment?: boolean;                 // Whether to apply data augmentation
  balance?: boolean;                 // Whether to balance class distribution
  minExamplesPerIntent?: number;     // Minimum examples per intent after preprocessing
  maxExamplesPerIntent?: number;     // Maximum examples per intent after preprocessing
  deduplicateExamples?: boolean;     // Whether to remove duplicate examples
  augmentationFactor?: number;       // Factor for data augmentation (1.0 = no augmentation)
  randomSeed?: number;               // Random seed for reproducibility
}

// Configuration for entity data preprocessing
export interface EntityPreprocessingConfig extends PreprocessingConfig {
  generateVariants?: boolean;        // Whether to generate entity variants
  includeContext?: boolean;          // Whether to include context in entity examples
  contextWindowSize?: number;        // Size of context window around entities
  maxVariantsPerEntity?: number;     // Maximum variants to generate per entity
  entityPadding?: boolean;           // Whether to pad entities with spaces
  entityCasing?: 'preserve' | 'lowercase' | 'uppercase' | 'titlecase'; // Casing for entities
}

// Configuration for context data preprocessing
export interface ContextPreprocessingConfig extends PreprocessingConfig {
  maxConversationLength?: number;    // Maximum conversation length
  minConversationLength?: number;    // Minimum conversation length
  includeMetadata?: boolean;         // Whether to include metadata in context
  normalizeContextLabels?: boolean;  // Whether to normalize context labels
  generateSequenceVariations?: boolean; // Whether to generate sequence variations
}

// Define type for conversation data
export interface ConversationData {
  messages: string[];
  contexts: string[];
}

// Default configurations
const DEFAULT_PREPROCESSING_CONFIG: PreprocessingConfig = {
  removeStopwords: false,
  stemming: false,
  lowercase: true,
  removeSpecialChars: false,
  removeNumbers: false,
  removePunctuation: false,
  normalizeWhitespace: true,
  normalizeGermanUmlauts: true,
  minTokenLength: 1,
  maxTokenLength: 50,
  language: 'de'
};

const DEFAULT_INTENT_CONFIG: IntentPreprocessingConfig = {
  ...DEFAULT_PREPROCESSING_CONFIG,
  augment: true,
  balance: true,
  minExamplesPerIntent: 3,
  maxExamplesPerIntent: 100,
  deduplicateExamples: true,
  augmentationFactor: 1.5,
  randomSeed: 42
};

const DEFAULT_ENTITY_CONFIG: EntityPreprocessingConfig = {
  ...DEFAULT_PREPROCESSING_CONFIG,
  generateVariants: true,
  includeContext: true,
  contextWindowSize: 5,
  maxVariantsPerEntity: 5,
  entityPadding: true,
  entityCasing: 'preserve'
};

const DEFAULT_CONTEXT_CONFIG: ContextPreprocessingConfig = {
  ...DEFAULT_PREPROCESSING_CONFIG,
  maxConversationLength: 10,
  minConversationLength: 2,
  includeMetadata: true,
  normalizeContextLabels: true,
  generateSequenceVariations: true
};

// Stopwords for supported languages
const STOPWORDS: Record<Language, string[]> = {
  de: [
    'der', 'die', 'das', 'den', 'dem', 'des', 
    'ein', 'eine', 'einer', 'eines', 'einem', 'einen',
    'und', 'oder', 'aber', 'wenn', 'weil', 'denn',
    'als', 'wie', 'wo', 'was', 'wer', 'warum',
    'in', 'mit', 'für', 'von', 'zu', 'um', 'an', 'auf',
    'ist', 'sind', 'war', 'waren', 'sein', 'gewesen',
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie'
  ],
  en: [
    'the', 'a', 'an', 'and', 'or', 'but', 'if', 'because', 
    'as', 'what', 'which', 'who', 'when', 'where', 'how', 'why',
    'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them'
  ]
};

// Data augmentation templates for supported languages
const AUGMENTATION_TEMPLATES: Record<Language, Record<string, string[]>> = {
  de: {
    greeting: [
      'Hallo {0}',
      'Hi {0}',
      'Guten Tag {0}',
      'Servus {0}',
      'Moin {0}',
      'Grüß Gott {0}'
    ],
    question: [
      '{0}?',
      'Kannst du mir sagen {0}?',
      'Ich möchte wissen {0}?',
      'Weißt du {0}?',
      'Hast du Informationen über {0}?',
      'Wie ist {0}?'
    ],
    request: [
      '{0} bitte',
      'Kannst du bitte {0}',
      'Ich würde gerne {0}',
      'Bitte {0}',
      'Kannst du mir helfen zu {0}'
    ],
    statement: [
      '{0}.',
      'Ich denke {0}.',
      'Es ist so, dass {0}.',
      'Meiner Meinung nach {0}.'
    ]
  },
  en: {
    greeting: [
      'Hello {0}',
      'Hi {0}',
      'Good day {0}',
      'Hey {0}',
      'Greetings {0}',
      'Welcome {0}'
    ],
    question: [
      '{0}?',
      'Can you tell me {0}?',
      'I want to know {0}?',
      'Do you know {0}?',
      'Do you have information about {0}?',
      'How is {0}?'
    ],
    request: [
      '{0} please',
      'Can you please {0}',
      'I would like to {0}',
      'Please {0}',
      'Could you help me to {0}'
    ],
    statement: [
      '{0}.',
      'I think {0}.',
      'It is the case that {0}.',
      'In my opinion {0}.'
    ]
  }
};

/**
 * Main class for data preprocessing operations
 */
class DataPreprocessor {
  /**
   * Preprocesses intent data for training
   * 
   * @param intents The intent data to preprocess
   * @param config Preprocessing configuration
   * @returns Preprocessed intent data
   */
  public async preprocessIntentData(
    intents: IntentItem[],
    config: Partial<IntentPreprocessingConfig> = {}
  ): Promise<IntentItem[]> {
    try {
      const fullConfig: IntentPreprocessingConfig = { ...DEFAULT_INTENT_CONFIG, ...config };
      const language = fullConfig.language || 'de';
      
      console.log(`[dataPreprocessor] Preprocessing ${intents.length} intents with config:`, 
        JSON.stringify(fullConfig, null, 2));
      
      // Create a deep copy to avoid modifying the original data
      let processedIntents = JSON.parse(JSON.stringify(intents)) as IntentItem[];
      
      // Step 1: Preprocess each intent's examples
      processedIntents = await this.preprocessIntentExamples(processedIntents, fullConfig);
      
      // Step 2: Deduplicate examples if configured
      if (fullConfig.deduplicateExamples) {
        processedIntents = this.deduplicateIntentExamples(processedIntents);
      }
      
      // Step 3: Apply data augmentation if configured
      if (fullConfig.augment) {
        processedIntents = await this.augmentIntentData(processedIntents, language, fullConfig.augmentationFactor);
      }
      
      // Step 4: Balance class distribution if configured
      if (fullConfig.balance) {
        processedIntents = this.balanceIntentDistribution(
          processedIntents, 
          fullConfig.minExamplesPerIntent || 3,
          fullConfig.maxExamplesPerIntent || 100
        );
      }
      
      // Step 5: Perform final validation and cleanup
      processedIntents = this.finalizeIntentData(processedIntents, fullConfig);
      
      // Log preprocessing results
      const totalExamples = processedIntents.reduce((sum: number, intent: IntentItem) => sum + (intent.examples?.length || 0), 0);
      console.log(`[dataPreprocessor] Preprocessed ${processedIntents.length} intents with ${totalExamples} total examples`);
      
      return processedIntents;
    } catch (error) {
      console.error(`[dataPreprocessor] Error preprocessing intent data:`, error);
      // Return the original intents if preprocessing fails
      return intents;
    }
  }
  
  /**
   * Preprocesses entity data for training
   * 
   * @param entities The entity data to preprocess
   * @param config Preprocessing configuration
   * @returns Preprocessed entity data
   */
  public async preprocessEntityData(
    entities: EntityItem[],
    config: Partial<EntityPreprocessingConfig> = {}
  ): Promise<EntityItem[]> {
    try {
      const fullConfig: EntityPreprocessingConfig = { ...DEFAULT_ENTITY_CONFIG, ...config };
      const language = fullConfig.language || 'de';
      
      console.log(`[dataPreprocessor] Preprocessing ${entities.length} entity types with config:`, 
        JSON.stringify(fullConfig, null, 2));
      
      // Create a deep copy to avoid modifying the original data
      let processedEntities = JSON.parse(JSON.stringify(entities)) as EntityItem[];
      
      // Step 1: Preprocess entity values
      processedEntities = await this.preprocessEntityValues(processedEntities, fullConfig);
      
      // Step 2: Generate entity variants if configured
      if (fullConfig.generateVariants) {
        processedEntities = await this.generateEntityVariants(
          processedEntities, 
          language,
          fullConfig.maxVariantsPerEntity || 5
        );
      }
      
      // Step 3: Add context if configured
      if (fullConfig.includeContext) {
        processedEntities = this.addEntityContext(
          processedEntities,
          fullConfig.contextWindowSize || 5
        );
      }
      
      // Step 4: Apply entity-specific processing
      processedEntities = this.applyEntitySpecificProcessing(processedEntities, fullConfig);
      
      // Log preprocessing results
      const totalExamples = processedEntities.reduce(
        (sum: number, entity: EntityItem) => sum + (entity.examples?.length || 0) + (entity.data?.length || 0), 
        0
      );
      console.log(`[dataPreprocessor] Preprocessed ${processedEntities.length} entity types with ${totalExamples} total examples`);
      
      return processedEntities;
    } catch (error) {
      console.error(`[dataPreprocessor] Error preprocessing entity data:`, error);
      // Return the original entities if preprocessing fails
      return entities;
    }
  }
  
  /**
   * Preprocesses context data for training
   * 
   * @param conversations The conversation data to preprocess
   * @param config Preprocessing configuration
   * @returns Preprocessed conversation data
   */
  public async preprocessContextData(
    conversations: ConversationData[],
    config: Partial<ContextPreprocessingConfig> = {}
  ): Promise<ConversationData[]> {
    try {
      const fullConfig: ContextPreprocessingConfig = { ...DEFAULT_CONTEXT_CONFIG, ...config };
      
      console.log(`[dataPreprocessor] Preprocessing ${conversations.length} conversations with config:`, 
        JSON.stringify(fullConfig, null, 2));
      
      // Create a deep copy to avoid modifying the original data
      let processedConversations = JSON.parse(JSON.stringify(conversations)) as ConversationData[];
      
      // Step 1: Normalize messages
      processedConversations = await this.normalizeConversationMessages(processedConversations, fullConfig);
      
      // Step 2: Normalize context labels if configured
      if (fullConfig.normalizeContextLabels) {
        processedConversations = this.normalizeContextLabels(processedConversations);
      }
      
      // Step 3: Generate sequence variations if configured
      if (fullConfig.generateSequenceVariations) {
        processedConversations = await this.generateConversationVariations(
          processedConversations,
          fullConfig.maxConversationLength || 10
        );
      }
      
      // Step 4: Filter conversations by length constraints
      processedConversations = this.filterConversationsByLength(
        processedConversations,
        fullConfig.minConversationLength || 2,
        fullConfig.maxConversationLength || 10
      );
      
      // Log preprocessing results
      const totalMessages = processedConversations.reduce((sum: number, conv: ConversationData) => sum + conv.messages.length, 0);
      console.log(`[dataPreprocessor] Preprocessed ${processedConversations.length} conversations with ${totalMessages} total messages`);
      
      return processedConversations;
    } catch (error) {
      console.error(`[dataPreprocessor] Error preprocessing context data:`, error);
      // Return the original conversations if preprocessing fails
      return conversations;
    }
  }
  
  /**
   * Processes text according to the preprocessing configuration
   * 
   * @param text The text to preprocess
   * @param config Preprocessing configuration
   * @returns Preprocessed text
   */
  public preprocessText(text: string, config: PreprocessingConfig = DEFAULT_PREPROCESSING_CONFIG): string {
    try {
      // Skip empty text
      if (!text) return text;
      
      let processedText = text;
      const language = config.language || 'de';
      
      // Lowercase if configured
      if (config.lowercase) {
        processedText = processedText.toLowerCase();
      }
      
      // Normalize whitespace if configured
      if (config.normalizeWhitespace) {
        processedText = processedText.replace(/\s+/g, ' ').trim();
      }
      
      // Normalize German umlauts if configured
      if (config.normalizeGermanUmlauts && language === 'de') {
        processedText = this.normalizeGermanUmlauts(processedText);
      }
      
      // Remove special characters if configured
      if (config.removeSpecialChars) {
        processedText = processedText.replace(/[^\w\s.,?!]/g, '');
      }
      
      // Remove numbers if configured
      if (config.removeNumbers) {
        processedText = processedText.replace(/\d+/g, '');
      }
      
      // Remove punctuation if configured
      if (config.removePunctuation) {
        processedText = processedText.replace(/[.,?!;:]/g, '');
      }
      
      // Tokenize for further processing
      let tokens = tokenize(processedText, { 
        preservePunctuation: !config.removePunctuation,
        toLowerCase: config.lowercase
      });
      
      // Remove stopwords if configured
      if (config.removeStopwords) {
        const stopwords = STOPWORDS[language] || [];
        tokens = tokens.filter(token => !stopwords.includes(token));
      }
      
      // Apply token length filters
      if (config.minTokenLength || config.maxTokenLength) {
        tokens = tokens.filter(token => {
          const length = token.length;
          if (config.minTokenLength && length < config.minTokenLength) return false;
          if (config.maxTokenLength && length > config.maxTokenLength) return false;
          return true;
        });
      }
      
      // Apply stemming if configured (simplified implementation)
      if (config.stemming) {
        tokens = this.applyStemming(tokens, language);
      }
      
      // Rejoin tokens
      processedText = tokens.join(' ');
      
      return processedText;
    } catch (error) {
      console.error(`[dataPreprocessor] Error preprocessing text: ${text}`, error);
      // Return the original text if preprocessing fails
      return text;
    }
  }
  
  /**
   * Preprocesses each intent's examples
   * 
   * @param intents The intents to process
   * @param config Preprocessing configuration
   * @returns Intents with preprocessed examples
   */
  private async preprocessIntentExamples(
    intents: IntentItem[],
    config: IntentPreprocessingConfig
  ): Promise<IntentItem[]> {
    return intents.map(intent => {
      // Skip if no examples
      if (!intent.examples || intent.examples.length === 0) {
        return intent;
      }
      
      // Process each example
      const processedExamples = intent.examples.map(example => 
        this.preprocessText(example, config)
      ).filter(example => example.trim().length > 0); // Remove empty examples
      
      return {
        ...intent,
        examples: processedExamples
      };
    });
  }
  
  /**
   * Removes duplicate examples from intents
   * 
   * @param intents The intents to deduplicate
   * @returns Intents with deduplicated examples
   */
  private deduplicateIntentExamples(intents: IntentItem[]): IntentItem[] {
    return intents.map(intent => {
      // Skip if no examples
      if (!intent.examples || intent.examples.length === 0) {
        return intent;
      }
      
      // Use Set to remove duplicates
      const uniqueExamples = Array.from(new Set(intent.examples));
      
      // Log if duplicates were found
      if (uniqueExamples.length < intent.examples.length) {
        console.log(`[dataPreprocessor] Removed ${intent.examples.length - uniqueExamples.length} duplicate examples from intent "${intent.name}"`);
      }
      
      return {
        ...intent,
        examples: uniqueExamples
      };
    });
  }
  
  /**
   * Augments intent data by generating variations of examples
   * 
   * @param intents The intents to augment
   * @param language The language for augmentation templates
   * @param factor Augmentation factor (1.0 = no augmentation)
   * @returns Augmented intents
   */
  private async augmentIntentData(
    intents: IntentItem[],
    language: Language = 'de',
    factor: number = 1.5
  ): Promise<IntentItem[]> {
    // Skip if factor <= 1
    if (factor <= 1) {
      return intents;
    }
    
    // Templates for the specified language
    const templates = AUGMENTATION_TEMPLATES[language] || AUGMENTATION_TEMPLATES.en;
    
    return intents.map(intent => {
      // Skip if no examples
      if (!intent.examples || intent.examples.length === 0) {
        return intent;
      }
      
      const originalExamples = [...intent.examples];
      const augmentedExamples = [...originalExamples];
      
      // Determine how many augmented examples to generate
      const targetCount = Math.ceil(originalExamples.length * factor);
      const toGenerate = targetCount - originalExamples.length;
      
      if (toGenerate <= 0) {
        return intent;
      }
      
      // Determine which template type to use based on intent type or name
      let templateType: 'greeting' | 'question' | 'request' | 'statement' = 'statement';
      
      if (intent.type === 'smalltalk' && intent.name.includes('greeting')) {
        templateType = 'greeting';
      } else if (intent.type === 'faq' || intent.name.includes('faq') || intent.name.includes('question')) {
        templateType = 'question';
      } else if (intent.type === 'function' || intent.name.includes('function') || intent.name.includes('request')) {
        templateType = 'request';
      }
      
      // Get templates for this type
      const typeTemplates = templates[templateType] || templates.statement;
      
      // Generate new examples
      for (let i = 0; i < toGenerate; i++) {
        // Select a random example
        const example = originalExamples[Math.floor(Math.random() * originalExamples.length)];
        
        // Select a random template
        const template = typeTemplates ? typeTemplates[Math.floor(Math.random() * typeTemplates.length)] : undefined;
        
        // Apply template to example
        const augmented = template ? template.replace('{0}', example || '') : example || '';
        
        // Add to augmented examples
        augmentedExamples.push(augmented);
      }
      
      return {
        ...intent,
        examples: augmentedExamples
      };
    });
  }
  
  /**
   * Balances intent distribution to ensure a minimum number of examples per intent
   * 
   * @param intents The intents to balance
   * @param minExamples Minimum examples per intent
   * @param maxExamples Maximum examples per intent
   * @returns Balanced intents
   */
  private balanceIntentDistribution(
    intents: IntentItem[],
    minExamples: number = 3,
    maxExamples: number = 100
  ): IntentItem[] {
    // First pass: Count examples and identify candidates for augmentation
    const intentStats = intents.map(intent => ({
      name: intent.name,
      count: intent.examples ? intent.examples.length : 0,
      needsMore: (intent.examples ? intent.examples.length : 0) < minExamples,
      needsLess: (intent.examples ? intent.examples.length : 0) > maxExamples
    }));
    
    // Log balancing stats
    console.log(`[dataPreprocessor] Intent distribution before balancing:`);
    intentStats.forEach(stat => {
      console.log(`  - ${stat.name}: ${stat.count} examples`);
    });
    
    // Second pass: Balance intents
    return intents.map(intent => {
      // Skip if no examples
      if (!intent.examples || intent.examples.length === 0) {
        return intent;
      }
      
      // Get current count
      const currentCount = intent.examples.length;
      
      // Case 1: Too few examples, duplicate some
      if (currentCount < minExamples && currentCount > 0) {
        const examples = [...intent.examples];
        
        // Duplicate examples until we reach the minimum
        while (examples.length < minExamples) {
          const exampleToClone = examples[Math.floor(Math.random() * examples.length)];
          if (exampleToClone) {
            examples.push(exampleToClone);
          }
        }
        
        console.log(`[dataPreprocessor] Added ${examples.length - currentCount} examples to intent "${intent.name}" to reach minimum`);
        
        return { ...intent, examples };
      }
      
      // Case 2: Too many examples, sample some
      if (currentCount > maxExamples) {
        // Randomly sample maxExamples from the available examples
        const shuffled = [...intent.examples].sort(() => 0.5 - Math.random());
        const examples = shuffled.slice(0, maxExamples);
        
        console.log(`[dataPreprocessor] Reduced intent "${intent.name}" from ${currentCount} to ${examples.length} examples`);
        
        return { ...intent, examples };
      }
      
      // Case 3: Within range, keep as is
      return intent;
    });
  }
  
  /**
   * Performs final validation and cleanup on intent data
   * 
   * @param intents The intents to finalize
   * @param config Preprocessing configuration
   * @returns Finalized intents
   */
  private finalizeIntentData(
    intents: IntentItem[],
    config: IntentPreprocessingConfig
  ): IntentItem[] {
    return intents.filter(intent => {
      // Ensure the intent has a name
      if (!intent.name) {
        console.warn(`[dataPreprocessor] Removing intent with missing name`);
        return false;
      }
      
      // Ensure the intent has examples
      if (!intent.examples || intent.examples.length === 0) {
        console.warn(`[dataPreprocessor] Removing intent "${intent.name}" with no examples`);
        return false;
      }
      
      // Ensure the intent has enough examples
      if (intent.examples.length < (config.minExamplesPerIntent || 3)) {
        console.warn(`[dataPreprocessor] Removing intent "${intent.name}" with insufficient examples: ${intent.examples.length}`);
        return false;
      }
      
      // Ensure all examples are non-empty
      intent.examples = intent.examples.filter(example => example.trim().length > 0);
      
      // Derive intent type if not provided
      if (!intent.type) {
        intent.type = this.deriveIntentType(intent.name);
      }
      
      return true;
    });
  }
  
  /**
   * Preprocesses entity values
   * 
   * @param entities The entities to process
   * @param config Preprocessing configuration
   * @returns Entities with preprocessed values
   */
  private async preprocessEntityValues(
    entities: EntityItem[],
    config: EntityPreprocessingConfig
  ): Promise<EntityItem[]> {
    return entities.map(entity => {
      // Process examples
      let processedExamples: string[] = [];
      if (entity.examples && entity.examples.length > 0) {
        processedExamples = entity.examples.map(example => {
          // Apply entity-specific casing
          let processedExample = this.applyEntityCasing(example, config.entityCasing || 'preserve');
          
          // Add padding if configured
          if (config.entityPadding) {
            processedExample = ` ${processedExample} `;
          }
          
          return processedExample;
        }).filter(example => example.trim().length > 0); // Remove empty examples
      }
      
      // Process data/values
      let processedData: string[] = [];
      if (entity.data && entity.data.length > 0) {
        processedData = entity.data.map(value => {
          // Apply entity-specific casing
          let processedValue = this.applyEntityCasing(value, config.entityCasing || 'preserve');
          
          // Add padding if configured
          if (config.entityPadding) {
            processedValue = ` ${processedValue} `;
          }
          
          return processedValue;
        }).filter(value => value.trim().length > 0); // Remove empty values
      } else if (entity.values && entity.values.length > 0) {
        // Support for 'values' property as an alternative to 'data'
        processedData = entity.values.map(value => {
          // Apply entity-specific casing
          let processedValue = this.applyEntityCasing(value, config.entityCasing || 'preserve');
          
          // Add padding if configured
          if (config.entityPadding) {
            processedValue = ` ${processedValue} `;
          }
          
          return processedValue;
        }).filter(value => value.trim().length > 0); // Remove empty values
      }
      
      return {
        ...entity,
        examples: processedExamples,
        data: processedData
      };
    });
  }
  
  /**
   * Generates variants of entity values
   * 
   * @param entities The entities to augment
   * @param language The language for variant generation
   * @param maxVariants Maximum variants per entity
   * @returns Entities with additional variants
   */
  private async generateEntityVariants(
    entities: EntityItem[],
    language: Language = 'de',
    maxVariants: number = 5
  ): Promise<EntityItem[]> {
    return entities.map(entity => {
      // Skip if no data or examples
      const hasData = entity.data && entity.data.length > 0;
      const hasExamples = entity.examples && entity.examples.length > 0;
      
      if (!hasData && !hasExamples) {
        return entity;
      }
      
      // Combine data and examples
      const values = [
        ...(entity.data || []),
        ...(entity.examples || [])
      ];
      
      // Generate variants based on entity type
      const variants = this.generateVariantsForEntityType(
        entity.name,
        values,
        language,
        maxVariants
      );
      
      // Add variants to data
      const newData = [...(entity.data || []), ...variants];
      
      // Remove duplicates
      const uniqueData = Array.from(new Set(newData));
      
      // Log variant generation results
      const newVariantsCount = uniqueData.length - (entity.data?.length || 0);
      if (newVariantsCount > 0) {
        console.log(`[dataPreprocessor] Generated ${newVariantsCount} variants for entity "${entity.name}"`);
      }
      
      return {
        ...entity,
        data: uniqueData
      };
    });
  }
  
  /**
   * Adds context around entity examples
   * 
   * @param entities The entities to process
   * @param contextWindowSize Size of context window
   * @returns Entities with context-enriched examples
   */
  private addEntityContext(
    entities: EntityItem[],
    contextWindowSize: number = 5
  ): EntityItem[] {
    // Define context templates for different entity types
    const contextTemplates: Record<string, string[]> = {
      'location': [
        'Ich bin in {0}',
        'Wir gehen nach {0}',
        'Hast du schon mal {0} besucht?',
        'Ich komme aus {0}',
        'Die Stadt {0} ist schön'
      ],
      'person': [
        'Ich habe {0} getroffen',
        'Kennst du {0}?',
        '{0} hat mir geschrieben',
        'Ich spreche mit {0}',
        'Das ist {0}s Idee'
      ],
      'date': [
        'Der Termin ist am {0}',
        'Treffen wir uns am {0}',
        'Am {0} habe ich Zeit',
        'Der {0} passt mir gut',
        'Ich kann am {0} nicht'
      ],
      'time': [
        'Der Termin ist um {0}',
        'Treffen wir uns um {0}',
        'Um {0} habe ich Zeit',
        'Die Zeit {0} passt mir gut',
        'Ich kann um {0} nicht'
      ],
      'product': [
        'Ich möchte {0} kaufen',
        'Hast du {0} im Angebot?',
        'Wie viel kostet {0}?',
        'Ich suche {0}',
        '{0} ist mein Lieblingsprodukt'
      ],
      'default': [
        'Ich suche {0}',
        'Kennst du {0}?',
        'Was ist mit {0}?',
        'Ich mag {0}',
        'Bitte zeige mir {0}'
      ]
    };
    
    return entities.map(entity => {
      // Skip if no data or examples
      const hasData = entity.data && entity.data.length > 0;
      
      if (!hasData) {
        return entity;
      }
      
      // Determine templates to use
      const templates = contextTemplates[entity.name.toLowerCase()] || contextTemplates.default;
      
      // Generate context examples
      const contextExamples = (entity.data || []).flatMap(value => {
        // Take a random sample of templates (up to contextWindowSize)
        const shuffledTemplates = templates ? [...templates].sort(() => 0.5 - Math.random()) : [];
        const selectedTemplates = shuffledTemplates.slice(0, Math.min(contextWindowSize, templates?.length || 0));
        
        // Apply value to templates
        return selectedTemplates.map(template => template.replace('{0}', value));
      });
      
      // Combine existing examples with new context examples
      const allExamples = [
        ...(entity.examples || []),
        ...contextExamples
      ];
      
      // Remove duplicates
      const uniqueExamples = Array.from(new Set(allExamples));
      
      // Log context enrichment results
      const newExamplesCount = uniqueExamples.length - (entity.examples?.length || 0);
      if (newExamplesCount > 0) {
        console.log(`[dataPreprocessor] Added ${newExamplesCount} context examples for entity "${entity.name}"`);
      }
      
      return {
        ...entity,
        examples: uniqueExamples
      };
    });
  }
  
  /**
   * Applies entity-specific processing based on entity type
   * 
   * @param entities The entities to process
   * @param config Preprocessing configuration
   * @returns Processed entities
   */
  private applyEntitySpecificProcessing(
    entities: EntityItem[],
    config: EntityPreprocessingConfig
  ): EntityItem[] {
    return entities.map(entity => {
      // Apply different processing based on entity type
      switch (entity.name.toLowerCase()) {
        case 'email':
          // Ensure all emails are lowercase
          return {
            ...entity,
            data: entity.data?.map(email => email.toLowerCase()),
            examples: entity.examples?.map(example => example.toLowerCase())
          };
          
        case 'phone_number':
          // Normalize phone number formats
          return {
            ...entity,
            data: entity.data?.map(phone => this.normalizePhoneNumber(phone)),
            examples: entity.examples?.map(example => this.normalizePhoneNumber(example))
          };
          
        case 'date':
          // Normalize date formats (simplified)
          return {
            ...entity,
            data: entity.data?.map(date => date.replace(/\//g, '-')),
            examples: entity.examples?.map(example => example.replace(/\//g, '-'))
          };
          
        case 'time':
          // Normalize time formats (simplified)
          return {
            ...entity,
            data: entity.data?.map(time => time.replace(/\./g, ':')),
            examples: entity.examples?.map(example => example.replace(/\./g, ':'))
          };
          
        case 'number':
          // Remove non-numeric characters
          return {
            ...entity,
            data: entity.data?.map(num => num.replace(/[^\d.,]/g, '')),
            examples: entity.examples?.map(example => example.replace(/[^\d.,]/g, ''))
          };
          
        default:
          // Default processing based on config
          return entity;
      }
    });
  }
  
  /**
   * Normalizes messages in conversations
   * 
   * @param conversations The conversations to normalize
   * @param config Preprocessing configuration
   * @returns Conversations with normalized messages
   */
  private async normalizeConversationMessages(
    conversations: ConversationData[],
    config: ContextPreprocessingConfig
  ): Promise<ConversationData[]> {
    return conversations.map(conversation => {
      // Skip if no messages
      if (!conversation.messages || conversation.messages.length === 0) {
        return conversation;
      }
      
      // Process each message
      const processedMessages = conversation.messages.map(message => 
        this.preprocessText(message, config)
      ).filter(message => message.trim().length > 0); // Remove empty messages
      
      // If we have fewer messages after preprocessing, adjust contexts
      const contexts = conversation.contexts;
      if (processedMessages.length < conversation.messages.length && contexts) {
        // Find indices of non-empty messages
        const nonEmptyIndices = conversation.messages.map((message, index) => {
          const processed = this.preprocessText(message, config);
          return processed.trim().length > 0 ? index : -1;
        }).filter(index => index !== -1);
        
        // Keep contexts corresponding to non-empty messages and filter out undefined
        const adjustedContexts = nonEmptyIndices
          .map(index => contexts[index])
          .filter((context): context is string => context !== undefined);
        
        return {
          messages: processedMessages,
          contexts: adjustedContexts
        };
      }
      
      return {
        messages: processedMessages,
        contexts: conversation.contexts
      };
    }).filter(conversation => {
      // Remove conversations without messages
      if (!conversation.messages || conversation.messages.length === 0) {
        console.warn(`[dataPreprocessor] Removing conversation with no messages`);
        return false;
      }
      
      // Remove conversations with mismatched messages/contexts
      if (conversation.contexts && conversation.messages.length !== conversation.contexts.length) {
        console.warn(`[dataPreprocessor] Removing conversation with mismatched messages/contexts: ${conversation.messages.length} vs ${conversation.contexts.length}`);
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Normalizes context labels in conversations
   * 
   * @param conversations The conversations to normalize
   * @returns Conversations with normalized context labels
   */
  private normalizeContextLabels(
    conversations: ConversationData[]
  ): ConversationData[] {
    // Collect all context labels
    const allContexts = new Set<string>();
    conversations.forEach(conversation => {
      if (conversation.contexts) {
        conversation.contexts.forEach(context => {
          allContexts.add(context);
        });
      }
    });
    
    // Map for storing context name mappings
    const contextMap: Record<string, string> = {};
    
    // Normalize context names
    allContexts.forEach(context => {
      // Convert to lowercase and replace spaces with underscores
      const normalizedContext = context.toLowerCase().replace(/\s+/g, '_');
      contextMap[context] = normalizedContext;
    });
    
    // Apply normalization to conversations
    return conversations.map(conversation => {
      // Skip if no contexts
      if (!conversation.contexts || conversation.contexts.length === 0) {
        return conversation;
      }
      
      // Normalize contexts
      const normalizedContexts = conversation.contexts.map(context => 
        contextMap[context] || context
      );
      
      return {
        messages: conversation.messages,
        contexts: normalizedContexts
      };
    });
  }
  
  /**
   * Generates variations of conversations
   * 
   * @param conversations The conversations to augment
   * @param maxLength Maximum conversation length
   * @returns Augmented conversations
   */
  private async generateConversationVariations(
    conversations: ConversationData[],
    maxLength: number = 10
  ): Promise<ConversationData[]> {
    // Collection to store all conversations and variations
    const allConversations = [...conversations];
    
    // Generate variations based on conversation length
    conversations.forEach(conversation => {
      // Skip short conversations
      if (conversation.messages.length < 3) {
        return;
      }
      
      // Generate sub-conversations of different lengths
      for (let length = 2; length <= Math.min(conversation.messages.length - 1, maxLength); length++) {
        // Generate a sub-conversation starting from the beginning
        const startSubConversation = {
          messages: conversation.messages.slice(0, length),
          contexts: conversation.contexts ? conversation.contexts.slice(0, length) : []
        };
        
        // Generate a sub-conversation ending at the end
        const endSubConversation = {
          messages: conversation.messages.slice(-length),
          contexts: conversation.contexts ? conversation.contexts.slice(-length) : []
        };
        
        // Add sub-conversations if they're different from the original
        if (length < conversation.messages.length) {
          allConversations.push(startSubConversation);
          
          // Only add end sub-conversation if it's different from the start one
          if (length < conversation.messages.length - 1) {
            allConversations.push(endSubConversation);
          }
        }
      }
    });
    
    // Log variation generation results
    const newVariationsCount = allConversations.length - conversations.length;
    if (newVariationsCount > 0) {
      console.log(`[dataPreprocessor] Generated ${newVariationsCount} conversation variations`);
    }
    
    return allConversations;
  }
  
  /**
   * Filters conversations based on length constraints
   * 
   * @param conversations The conversations to filter
   * @param minLength Minimum conversation length
   * @param maxLength Maximum conversation length
   * @returns Filtered conversations
   */
  private filterConversationsByLength(
    conversations: ConversationData[],
    minLength: number = 2,
    maxLength: number = 10
  ): ConversationData[] {
    const filtered = conversations.filter(conversation => {
      const length = conversation.messages.length;
      return length >= minLength && length <= maxLength;
    });
    
    // Log filtering results
    const removedCount = conversations.length - filtered.length;
    if (removedCount > 0) {
      console.log(`[dataPreprocessor] Removed ${removedCount} conversations outside length constraints (${minLength}-${maxLength})`);
    }
    
    return filtered;
  }
  
  /**
   * Applies stemming to tokens (simplified implementation)
   * 
   * @param tokens The tokens to stem
   * @param language The language for stemming rules
   * @returns Stemmed tokens
   */
  private applyStemming(tokens: string[], language: Language): string[] {
    // This is a simplified implementation of stemming
    // A real implementation would use a proper stemming algorithm like Porter or Snowball
    
    if (language === 'de') {
      // Simple German stemming rules
      return tokens.map(token => {
        // Remove common German suffixes
        if (token.endsWith('ung')) return token.slice(0, -3);
        if (token.endsWith('heit')) return token.slice(0, -4);
        if (token.endsWith('keit')) return token.slice(0, -4);
        if (token.endsWith('en')) return token.slice(0, -2);
        if (token.endsWith('er')) return token.slice(0, -2);
        if (token.endsWith('est')) return token.slice(0, -3);
        if (token.endsWith('e')) return token.slice(0, -1);
        return token;
      });
    } else if (language === 'en') {
      // Simple English stemming rules
      return tokens.map(token => {
        // Remove common English suffixes
        if (token.endsWith('ing')) return token.slice(0, -3);
        if (token.endsWith('ed')) return token.slice(0, -2);
        if (token.endsWith('ly')) return token.slice(0, -2);
        if (token.endsWith('s')) return token.slice(0, -1);
        if (token.endsWith('es')) return token.slice(0, -2);
        return token;
      });
    }
    
    // For other languages, return the original tokens
    return tokens;
  }
  
  /**
   * Normalizes German umlauts
   * 
   * @param text The text to normalize
   * @returns Text with normalized umlauts
   */
  private normalizeGermanUmlauts(text: string): string {
    return text
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/Ä/g, 'Ae')
      .replace(/Ö/g, 'Oe')
      .replace(/Ü/g, 'Ue');
  }
  
  /**
   * Applies casing to entity values
   * 
   * @param text The text to process
   * @param casing The casing to apply
   * @returns Text with the specified casing
   */
  private applyEntityCasing(
    text: string,
    casing: 'preserve' | 'lowercase' | 'uppercase' | 'titlecase'
  ): string {
    switch (casing) {
      case 'lowercase':
        return text.toLowerCase();
      case 'uppercase':
        return text.toUpperCase();
      case 'titlecase':
        return text.replace(/\w\S*/g, (word) => {
          return word.charAt(0).toUpperCase() + word.substring(1).toLowerCase();
        });
      case 'preserve':
      default:
        return text;
    }
  }
  
  /**
   * Normalizes phone number formats (simplified)
   * 
   * @param phone The phone number to normalize
   * @returns Normalized phone number
   */
  private normalizePhoneNumber(phone: string): string {
    // Remove all non-digit characters except + at the beginning
    let normalized = phone.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, add the German country code
    if (!normalized.startsWith('+')) {
      if (normalized.startsWith('00')) {
        normalized = '+' + normalized.substring(2);
      } else if (normalized.startsWith('0')) {
        normalized = '+49' + normalized.substring(1);
      } else {
        normalized = '+49' + normalized;
      }
    }
    
    return normalized;
  }
  
  /**
   * Derives intent type from intent name
   * 
   * @param intentName The intent name
   * @returns Derived intent type
   */
  private deriveIntentType(intentName: string): string {
    if (intentName.startsWith('faq_')) {
      return 'faq';
    } else if (intentName.startsWith('smalltalk_')) {
      return 'smalltalk';
    } else if (intentName.startsWith('function_')) {
      return 'function';
    } else {
      return 'unknown';
    }
  }
  
  /**
   * Generates variants for a specific entity type
   * 
   * @param entityType The type of entity
   * @param values The values to generate variants from
   * @param language The language for variant generation
   * @param maxVariants Maximum variants to generate
   * @returns Generated variants
   */
  private generateVariantsForEntityType(
    entityType: string,
    values: string[],
    language: Language,
    maxVariants: number
  ): string[] {
    // Return empty array if no values
    if (!values || values.length === 0) {
      return [];
    }
    
    const variants: string[] = [];
    const lowerEntityType = entityType.toLowerCase();
    
    // Apply different variant generation strategies based on entity type
    switch (lowerEntityType) {
      case 'location':
        // Generate location variants
        values.forEach(location => {
          // Add preposition variants (in, near, from, to)
          if (language === 'de') {
            variants.push(`in ${location}`);
            variants.push(`nach ${location}`);
            variants.push(`aus ${location}`);
            variants.push(`bei ${location}`);
          } else {
            variants.push(`in ${location}`);
            variants.push(`to ${location}`);
            variants.push(`from ${location}`);
            variants.push(`near ${location}`);
          }
        });
        break;
        
      case 'date':
        // Generate date variants
        values.forEach(date => {
          // Add different date formats
          const parts = date.split(/[-/.]/);
          if (parts.length === 3) {
            const [day, month, year] = parts;
            // Different formats
            variants.push(`${day}.${month}.${year}`);
            variants.push(`${day}/${month}/${year}`);
            variants.push(`${day}-${month}-${year}`);
            
            // With prepositions
            if (language === 'de') {
              variants.push(`am ${day}.${month}.${year}`);
              variants.push(`zum ${day}.${month}.${year}`);
            } else {
              variants.push(`on ${day}/${month}/${year}`);
              variants.push(`for ${day}/${month}/${year}`);
            }
          }
        });
        break;
        
      case 'time':
        // Generate time variants
        values.forEach(time => {
          // Add different time formats
          const parts = time.split(/[:]/);
          if (parts.length === 2) {
            const [hour, minute] = parts;
            // Different formats
            variants.push(`${hour}:${minute}`);
            variants.push(`${hour}.${minute}`);
            
            // With prepositions
            if (language === 'de') {
              variants.push(`um ${hour}:${minute}`);
              variants.push(`gegen ${hour}:${minute}`);
            } else {
              variants.push(`at ${hour}:${minute}`);
              variants.push(`around ${hour}:${minute}`);
            }
          }
        });
        break;
        
      case 'person':
        // Generate person variants
        values.forEach(person => {
          // Add prefix variants
          if (language === 'de') {
            variants.push(`Herr ${person}`);
            variants.push(`Frau ${person}`);
            variants.push(`Dr. ${person}`);
          } else {
            variants.push(`Mr. ${person}`);
            variants.push(`Mrs. ${person}`);
            variants.push(`Dr. ${person}`);
          }
        });
        break;
        
      case 'product':
        // Generate product variants
        values.forEach(product => {
          // Add definite/indefinite articles
          if (language === 'de') {
            variants.push(`das ${product}`);
            variants.push(`ein ${product}`);
            variants.push(`mein ${product}`);
          } else {
            variants.push(`the ${product}`);
            variants.push(`a ${product}`);
            variants.push(`my ${product}`);
          }
        });
        break;
        
      default:
        // Default variant generation
        values.forEach(value => {
          // Generate simple variations
          if (language === 'de') {
            variants.push(`der ${value}`);
            variants.push(`die ${value}`);
            variants.push(`das ${value}`);
          } else {
            variants.push(`the ${value}`);
            variants.push(`a ${value}`);
            variants.push(`an ${value}`);
          }
        });
        break;
    }
    
    // Limit the number of variants
    return variants.slice(0, maxVariants);
  }
  
  /**
   * Creates a training data split
   * 
   * @param data The data to split
   * @param trainRatio The ratio for the training set (0-1)
   * @param devRatio The ratio for the development set (0-1)
   * @param randomSeed Random seed for reproducibility
   * @returns Split data sets
   */
  public createDataSplit<T>(
    data: T[],
    trainRatio: number = 0.7,
    devRatio: number = 0.15,
    randomSeed: number = 42
  ): { train: T[], dev: T[], test: T[] } {
    // Validate the ratios
    if (trainRatio + devRatio > 1.0) {
      console.warn(`[dataPreprocessor] Invalid split ratios. Using defaults.`);
      trainRatio = 0.7;
      devRatio = 0.15;
    }
    
    // Shuffle the data using the random seed
    const shuffled = [...data];
    const testRatio = 1.0 - trainRatio - devRatio;
    
    // Simple deterministic shuffle using the seed
    const rng = (n: number) => {
      let x = Math.sin(n + randomSeed) * 10000;
      return x - Math.floor(x);
    };
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng(i) * (i + 1));
      [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
    }
    
    // Calculate split indices
    const trainEndIndex = Math.floor(shuffled.length * trainRatio);
    const devEndIndex = Math.floor(shuffled.length * (trainRatio + devRatio));
    
    // Create the splits
    const train = shuffled.slice(0, trainEndIndex);
    const dev = shuffled.slice(trainEndIndex, devEndIndex);
    const test = shuffled.slice(devEndIndex);
    
    console.log(`[dataPreprocessor] Created data split: train=${train.length}, dev=${dev.length}, test=${test.length}`);
    
    return { train, dev, test };
  }
  
  /**
   * Creates a stratified split for intent data
   * 
   * @param intents The intent data to split
   * @param trainRatio The ratio for the training set (0-1)
   * @param devRatio The ratio for the development set (0-1)
   * @param randomSeed Random seed for reproducibility
   * @returns Split intent data
   */
  public createStratifiedIntentSplit(
    intents: IntentItem[],
    trainRatio: number = 0.7,
    devRatio: number = 0.15,
    randomSeed: number = 42
  ): { train: IntentItem[], dev: IntentItem[], test: IntentItem[] } {
    // Create split sets
    const train: IntentItem[] = [];
    const dev: IntentItem[] = [];
    const test: IntentItem[] = [];
    
    // Process each intent separately to maintain distribution
    intents.forEach(intent => {
      // Skip if no examples
      if (!intent.examples || intent.examples.length === 0) {
        return;
      }
      
      // Create splits for this intent's examples
      const { train: trainExamples, dev: devExamples, test: testExamples } = this.createDataSplit(
        intent.examples,
        trainRatio,
        devRatio,
        randomSeed
      );
      
      // Add to the respective sets if examples exist
      if (trainExamples.length > 0) {
        train.push({
          ...intent,
          examples: trainExamples
        });
      }
      
      if (devExamples.length > 0) {
        dev.push({
          ...intent,
          examples: devExamples
        });
      }
      
      if (testExamples.length > 0) {
        test.push({
          ...intent,
          examples: testExamples
        });
      }
    });
    
    console.log(`[dataPreprocessor] Created stratified intent split: train=${train.length}, dev=${dev.length}, test=${test.length}`);
    
    return { train, dev, test };
  }
  
  /**
   * Creates CV folds for cross-validation
   * 
   * @param data The data to split
   * @param numFolds Number of folds
   * @param randomSeed Random seed for reproducibility
   * @returns Array of folds
   */
  public createCVFolds<T>(
    data: T[],
    numFolds: number = 5,
    randomSeed: number = 42
  ): T[][] {
    // Validate number of folds
    if (numFolds < 2) {
      console.warn(`[dataPreprocessor] Invalid number of folds. Using 5.`);
      numFolds = 5;
    }
    
    // Shuffle the data using the random seed
    const shuffled = [...data];
    
    // Simple deterministic shuffle using the seed
    const rng = (n: number) => {
      let x = Math.sin(n + randomSeed) * 10000;
      return x - Math.floor(x);
    };
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng(i) * (i + 1));
      [shuffled[i]!, shuffled[j]!] = [shuffled[j]!, shuffled[i]!];
    }
    
    // Create the folds
    const folds: T[][] = Array.from({ length: numFolds }, (): T[] => []);
    
    // Distribute items among folds
    shuffled.forEach((item, index) => {
      const foldIndex = index % numFolds;
      folds[foldIndex]?.push(item);
    });
    
    // Log fold sizes
    console.log(`[dataPreprocessor] Created ${numFolds} CV folds with sizes: ${folds.map(f => f.length).join(', ')}`);
    
    return folds;
  }
}

// Export a singleton instance
export const dataPreprocessor = new DataPreprocessor();