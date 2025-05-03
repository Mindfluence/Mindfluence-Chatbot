// src/features/reasoning/entityRelationManager.ts

// TS1484: Add 'type' keyword for imports that are only used as types
import { type Entity, type EnhancedEntity, type Context, type EnhancedContext } from '@/types/nlp.types';
import { getErrorMessage, removeDuplicates } from '@/lib/utils'; // Import utils

/**
 * Type of relationship between entities (Union of string literals)
 */
export type EntityRelationType =
  | 'isA'           // Taxonomy/inheritance (e.g., "Smartphone is a Device")
  | 'hasPart'       // Composition (e.g., "Smartphone has Camera")
  | 'isPart'        // Inverse of hasPart (e.g., "Camera is part of Smartphone")
  | 'belongsTo'     // Ownership/categorization (e.g., "Product belongs to Category")
  | 'contains'      // Containment (e.g., "Category contains Products")
  | 'relatedTo'     // Generic relationship
  | 'causes'        // Causality (e.g., "Issue causes Error")
  | 'locatedIn'     // Spatial relationship
  | 'before'        // Temporal relationship
  | 'after'         // Temporal relationship
  | 'usedFor'       // Functional relationship
  | 'requires'      // Dependency relationship
  | 'sameAs'        // Symmetric relationship for identical entities
  | 'compatibleWith'; // Compatibility relationship (e.g., "Device compatible with Feature")
   // Add other potential types as needed

/**
 * Represents a relationship between two entities
 */
export interface EntityRelation {
  /** ID of the source entity */
  sourceEntityId: string; // Required
  /** ID of the target entity */
  targetEntityId: string; // Required
  /** Type of relationship */
  relationType: EntityRelationType; // Required
  /** Confidence score of the relationship (0.0 to 1.0) */
  confidence: number; // Required
  /** When the relationship was created/updated */
  timestamp: number; // Required (Unix timestamp)
  /** Optional additional information about the relationship */
  metadata?: Record<string, any>; // Optional
}

/**
 * Map structure to store entity relationships by source entity ID
 */
interface EntityRelationMap {
  [entityId: string]: EntityRelation[]; // Array of relations can be empty
}

/**
 * Result format for finding relations
 * TS2614: Export this interface so it can be imported by other modules (like InferenceEngine)
 */
export interface RelationSearchResult {
  sourceEntity: Entity; // The entity from which the relation originates
  relation: EntityRelation; // The relation object itself
  targetEntity: Entity; // The entity to which the relation points
  confidence: number; // Confidence of this specific relation instance
}

/**
 * Options for querying entity relationships
 * Export this interface if it's used outside this file.
 */
export interface RelationQueryOptions {
  minConfidence?: number; // Optional
  relationTypes?: EntityRelationType[]; // Optional, array can be empty
  includeInferred?: boolean; // Optional
  maxResults?: number; // Optional
  bidirectional?: boolean; // Optional - check relations where entity is source or target
}

// Cache for storing entity relations during runtime
// Using a simple in-memory object as cache
const entityRelationsCache: EntityRelationMap = {};
const entityStoreCache: Map<string, Entity> = new Map(); // Cache for entities themselves

/**
 * EntityRelationManager verwaltet semantische Beziehungen zwischen Entitäten.
 * Die Klasse unterstützt das Speichern, Abfragen und Ableiten von Beziehungen
 * zwischen Entitäten, die in Benutzernachrichten erkannt wurden.
 *
 * The EntityRelationManager manages semantic relationships between entities.
 * It supports storing, querying, and inferring relationships between entities
 * detected in user messages.
 */
export class EntityRelationManager {
  private static instance: EntityRelationManager;
  private relationMap: EntityRelationMap = {};
  private inferredRelationMap: EntityRelationMap = {}; // Store inferred relations separately
  private entityStore: Map<string, Entity> = new Map(); // Store unique entities by ID
  private isDirty: boolean = false; // Flag to indicate if the relation map has changed

  // Default query options
  private defaultQueryOptions: RelationQueryOptions = {
    minConfidence: 0.6,
    includeInferred: true,
    maxResults: 10,
    bidirectional: true
  };

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    // Initialize with cached relations and entities if available
    // Perform a deep copy if cache contains mutable objects to prevent unintended modifications
    this.relationMap = JSON.parse(JSON.stringify(entityRelationsCache)); // Simple deep copy for plain objects/arrays
    this.entityStore = new Map(entityStoreCache); // Map constructor creates a shallow copy

    console.log(`[EntityRelationManager] Initialized with ${Object.keys(this.relationMap).length} cached relation groups and ${this.entityStore.size} cached entities`);

    // Re-perform reasoning on loaded data to populate inferredRelationMap
    // This is important if inferred relations are not explicitly cached/persisted
    this.performReasoning(); // Initial reasoning based on loaded data
  }

  /**
   * Get the singleton instance of the EntityRelationManager
   */
  public static getInstance(): EntityRelationManager {
    if (!EntityRelationManager.instance) {
      EntityRelationManager.instance = new EntityRelationManager();
    }
    return EntityRelationManager.instance;
  }

  /**
   * Adds or updates a relationship between two entities
   *
   * @param sourceEntity The source entity
   * @param targetEntity The target entity
   * @param relationType The type of relationship
   * @param confidence The confidence score of the relationship
   * @param metadata Optional additional data about the relationship
   * @returns Boolean indicating success
   */
  public addRelation(
    sourceEntity: Entity,
    targetEntity: Entity,
    relationType: EntityRelationType,
    confidence: number = 0.8, // Default confidence
    metadata?: Record<string, any> // Optional metadata
  ): boolean {
    try {
       // Basic validation for input entities and confidence
       if (!sourceEntity || typeof sourceEntity !== 'object' || typeof sourceEntity.type !== 'string' || typeof sourceEntity.value !== 'string' ||
           !targetEntity || typeof targetEntity !== 'object' || typeof targetEntity.type !== 'string' || typeof targetEntity.value !== 'string' ||
           typeof relationType !== 'string' || relationType.length === 0 ||
           typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
           console.warn('[EntityRelationManager] Skipping addRelation due to invalid input parameters:', { sourceEntity, targetEntity, relationType, confidence });
           return false;
       }


      // Generate unique IDs for entities
      const sourceId = this.getEntityId(sourceEntity);
      const targetId = this.getEntityId(targetEntity);

      // Store entities in the entity store for later retrieval
      // Use a deep copy to avoid modifying the original entity objects if they are modified elsewhere
      this.entityStore.set(sourceId, JSON.parse(JSON.stringify(sourceEntity)));
      this.entityStore.set(targetId, JSON.parse(JSON.stringify(targetEntity)));

      // Create the relation object
      const relation: EntityRelation = {
        sourceEntityId: sourceId,
        targetEntityId: targetId,
        relationType, // Use validated relationType
        confidence, // Use validated confidence
        timestamp: Date.now(),
        metadata: metadata ? { ...metadata } : {} // Copy metadata if provided
      };

      // Initialize relation array for sourceId if it doesn't exist
      if (!this.relationMap[sourceId]) {
        this.relationMap[sourceId] = [];
      }

      // Check if relation with the same source, target, and type already exists
      const existingRelations = this.relationMap[sourceId];
      let existingIndex = -1;
      if (Array.isArray(existingRelations)) { // Check if it's an array
         existingIndex = existingRelations.findIndex(
           r => r.targetEntityId === targetId && r.relationType === relationType
         );
      }

      if (existingIndex >= 0) {
        // Update existing relation if new confidence is higher
        // Access the element safely after confirming index exists
        if (
          Array.isArray(existingRelations) &&
          existingIndex >= 0 &&
          existingRelations[existingIndex] !== undefined &&
          confidence > (existingRelations[existingIndex]?.confidence ?? 0)
        ) {
          existingRelations[existingIndex] = relation; // Replace with new relation object
          this.isDirty = true; // Mark for cache update
          console.log(`[EntityRelationManager] Updated relation: ${sourceId} -[${relationType}]-> ${targetId} (Conf: ${confidence})`);
        } else {
           // console.log(`[EntityRelationManager] Relation already exists with higher or equal confidence: ${sourceId} -[${relationType}]-> ${targetId}`);
        }
      } else {
        // Add new relation
        // Ensure the array exists before pushing
        if (!this.relationMap[sourceId]) {
             this.relationMap[sourceId] = [];
        }
        this.relationMap[sourceId].push(relation);
        this.isDirty = true; // Mark for cache update
        console.log(`[EntityRelationManager] Added new relation: ${sourceId} -[${relationType}]-> ${targetId} (Conf: ${confidence})`);
      }

      // Update cache if marked dirty
      if (this.isDirty) {
        this.updateCache(); // Update in-memory cache
        // Note: This does *not* save to persistent storage like a file or database
      }

      // Trigger reasoning to update inferred relations after adding/updating a direct relation
      this.performReasoning(); // Update inferred relations

      return true;
    } catch (error) {
      console.error('[EntityRelationManager] Error adding relation:', getErrorMessage(error));
      return false;
    }
  }

  /**
   * Finds relationships originating from or pointing to an entity.
   *
   * @param entity The entity to find relationships for. Must be a valid Entity object.
   * @param relationType Optional specific relation type to find.
   * @param options Query options (minConfidence, includeInferred, maxResults, bidirectional).
   * @returns Array of relationship results (RelationSearchResult[]). Returns empty array on error or no results.
   */
  public findRelations(
    entity: Entity,
    relationType?: EntityRelationType, // Optional filter
    options?: RelationQueryOptions // Optional options object
  ): RelationSearchResult[] {
    try {
       // Basic validation for input entity
       if (!entity || typeof entity !== 'object' || typeof entity.type !== 'string' || typeof entity.value !== 'string') {
           console.warn('[EntityRelationManager] Invalid entity provided to findRelations.');
           return [];
       }

      const queryOptions = { ...this.defaultQueryOptions, ...options };
       // Ensure relationTypes filter is an array if provided
       const relationTypesFilter = Array.isArray(queryOptions.relationTypes) ? queryOptions.relationTypes : undefined;

      const entityId = this.getEntityId(entity);
      const results: RelationSearchResult[] = [];

      // Helper function to add valid relation results to the results array
      const addValidRelationResult = (rel: EntityRelation, isSource: boolean) => {
          // Ensure relation object is valid and meets confidence/type filters
           if (rel && typeof rel === 'object' && typeof rel.sourceEntityId === 'string' && typeof rel.targetEntityId === 'string' && typeof rel.relationType === 'string' && typeof rel.confidence === 'number' && rel.confidence >= 0 && rel.confidence <= 1 &&
               rel.confidence >= (queryOptions.minConfidence ?? 0)) { // Check min confidence

               // Check relation type filter if applied
               if (relationTypesFilter && relationTypesFilter.length > 0 && !relationTypesFilter.includes(rel.relationType)) {
                   return; // Skip if type filter is active and doesn't match
               }

               // Get source and target entities by ID
               const currentSourceEntity = this.getEntityById(rel.sourceEntityId);
               const currentTargetEntity = this.getEntityById(rel.targetEntityId);

               // Ensure both entities can be retrieved
               if (currentSourceEntity && currentTargetEntity) {
                   results.push({
                       sourceEntity: currentSourceEntity, // The entity that is the subject of the fact
                       relation: rel, // The relation object itself
                       targetEntity: currentTargetEntity, // The entity that is the object of the fact
                       confidence: rel.confidence // Confidence of this specific relation
                   });
               } else {
                   // console.warn(`[EntityRelationManager] Could not retrieve source or target entity for relation: ${rel.sourceEntityId} -[${rel.relationType}]-> ${rel.targetEntityId}`);
               }
           } else {
              // console.warn('[EntityRelationManager] Skipping invalid relation object during findRelations:', rel);
           }
      };


      // Find direct relations where the input entity is the source
      const directOutgoingRelations = this.relationMap[entityId];
      if (Array.isArray(directOutgoingRelations)) { // Ensure it's an array
        directOutgoingRelations.forEach(rel => addValidRelationResult(rel, true));
      }

      // Find direct relations where the input entity is the target (if bidirectional is enabled)
      if (queryOptions.bidirectional) {
        Object.keys(this.relationMap).forEach(sourceId => {
           const outgoingRelations = this.relationMap[sourceId];
           if (Array.isArray(outgoingRelations)) { // Ensure it's an array
               outgoingRelations.forEach(relation => {
                   if (relation && typeof relation === 'object' && relation.targetEntityId === entityId) { // Check if this relation points to the input entity
                       addValidRelationResult(relation, false); // Add this relation result
                   }
               });
           }
        });
      }

      // Include inferred relations if requested
      if (queryOptions.includeInferred) {
         // Find inferred relations where the input entity is the source
         const inferredOutgoingRelations = this.inferredRelationMap[entityId];
         if (Array.isArray(inferredOutgoingRelations)) { // Ensure it's an array
             inferredOutgoingRelations.forEach(rel => addValidRelationResult(rel, true));
         }

        // Find inferred relations where the input entity is the target (if bidirectional is enabled)
        if (queryOptions.bidirectional) {
          Object.keys(this.inferredRelationMap).forEach(sourceId => {
             const outgoingRelations = this.inferredRelationMap[sourceId];
             if (Array.isArray(outgoingRelations)) { // Ensure it's an array
                 outgoingRelations.forEach(relation => {
                     if (relation && typeof relation === 'object' && relation.targetEntityId === entityId) { // Check if this relation points to the input entity
                         addValidRelationResult(relation, false); // Add this relation result
                     }
                 });
             }
          });
        }
      }

       // Remove duplicate results (same source, target, type, relation type) - optional but good practice
       // Note: This might be complex if confidence varies for duplicates.
       // Let's filter based on a unique key for the result tuple (source ID, relation type, target ID)
       const uniqueResultsMap = new Map<string, RelationSearchResult>();
       results.forEach(res => {
           // Ensure res and its properties are valid before creating the key
           if (res && res.sourceEntity && res.relation && res.targetEntity) {
               const uniqueKey = `${res.sourceEntity.type}:${res.sourceEntity.value}-${res.relation.relationType}->${res.targetEntity.type}:${res.targetEntity.value}`;
               // Keep the one with higher confidence if duplicate keys exist
               if (!uniqueResultsMap.has(uniqueKey) || (res.confidence ?? 0) > (uniqueResultsMap.get(uniqueKey)?.confidence ?? 0)) {
                    uniqueResultsMap.set(uniqueKey, res);
               }
           } else {
               console.warn('[EntityRelationManager] Skipping invalid result during duplicate filtering:', res);
           }
       });
       const uniqueResults = Array.from(uniqueResultsMap.values());


      // Sort by confidence descending
      uniqueResults.sort((a, b) => b.confidence - a.confidence);

      // Return limited results based on maxResults option
      const maxRes = queryOptions.maxResults ?? this.defaultQueryOptions.maxResults;
      const limitedResults = uniqueResults.slice(0, maxRes ?? 10); // Fallback to 10

      console.log(`[EntityRelationManager] Found ${limitedResults.length} relations for entity ${entityId} (including inferred).`);
      return limitedResults;

    } catch (error) {
      console.error(`[EntityRelationManager] Error finding relations for entity ${entity?.type}:${entity?.value}:`, getErrorMessage(error));
      return []; // Return empty array on error
    }
  }

  /**
   * Gets entities related to the given entity by finding relations and extracting connected entities.
   *
   * @param entity The entity to find related entities for.
   * @param relationType Optional specific relation type to filter by.
   * @param options Query options.
   * @returns Array of unique related entities. Returns empty array on error or no related entities.
   */
  public getRelatedEntities(
    entity: Entity,
    relationType?: EntityRelationType,
    options?: RelationQueryOptions
  ): Entity[] {
    try {
       // Basic validation
       if (!entity || typeof entity !== 'object') {
            console.warn('[EntityRelationManager] Invalid entity provided to getRelatedEntities.');
            return [];
       }

      const relations = this.findRelations(entity, relationType, options);

      // Extract unique entities from the relation results
      const relatedEntities: Entity[] = [];
       // Ensure relations is a valid array
      if (Array.isArray(relations)) {
         relations.forEach(r => {
            // Ensure relation result has valid source and target entities
            if (r && r.sourceEntity && r.targetEntity) {
               // Add the entity that is *not* the input entity to the list
               // Use the private areEntitiesEqual method within the class
               if (this.areEntitiesEqual(r.sourceEntity, entity)) {
                  relatedEntities.push(r.targetEntity);
               } else {
                  relatedEntities.push(r.sourceEntity);
               }
            }
         });
      }


      // Filter for unique entities based on their ID (type + value)
      return this.filterUniqueEntities(relatedEntities);

    } catch (error) {
      console.error(`[EntityRelationManager] Error getting related entities for ${entity?.type}:${entity?.value}:`, getErrorMessage(error));
      return []; // Return empty array on error
    }
  }

  /**
   * Performs entity reasoning based on known direct relationships to infer new ones.
   * Currently implements transitivity and symmetry rules.
   * Updates the `inferredRelationMap`.
   *
   * @returns Number of newly inferred relationships added in this run.
   */
  public performReasoning(): number {
    let inferredCount = 0;

    // Clear previous inferred relations before recalculating
    this.inferredRelationMap = {};
    // console.log('[EntityRelationManager] Clearing previous inferred relations.');

    try {
      // 1. Transitive reasoning (if A relates to B and B relates to C, then A might relate to C)
      // Iterate through all entities that are sources of relations
      Object.keys(this.relationMap).forEach(entityIdA => {
        const relationsAB = this.relationMap[entityIdA]; // Relations where A is the source
        if (!Array.isArray(relationsAB)) return; // Ensure it's an array

        relationsAB.forEach(relationAB => {
           // Ensure relationAB is valid
           if (!relationAB || typeof relationAB !== 'object' || typeof relationAB.targetEntityId !== 'string') return;

          const entityIdB = relationAB.targetEntityId; // B is the target of relation A->B

          // Check if B also has relationships to other entities (B -> C)
          const relationsBC = this.relationMap[entityIdB]; // Relations where B is the source
          if (Array.isArray(relationsBC)) { // Ensure it's an array
               relationsBC.forEach((relationBC: EntityRelation) => { // Explicitly type parameter to fix TS7006
                  // Ensure relationBC is valid
                  if (!relationBC || typeof relationBC !== 'object' || typeof relationBC.targetEntityId !== 'string') return;

                 const entityIdC = relationBC.targetEntityId; // C is the target of relation B->C

                 // Skip if C is the same as A (prevent circular inference)
                 if (entityIdC === entityIdA) return;

                 // Determine if we can infer a transitive A -> C relation based on rule logic
                 if (this.canInferTransitiveRelation(relationAB.relationType, relationBC.relationType)) {
                   // Get the type of the inferred relation A -> C
                   const inferredType = this.getInferredRelationType(
                     relationAB.relationType,
                     relationBC.relationType
                   );

                   // Calculate combined confidence (weakest link principle, then apply modifier)
                   // Ensure confidence values are numbers, use fallback if not
                   const confidenceAB = relationAB.confidence ?? 0.0;
                   const confidenceBC = relationBC.confidence ?? 0.0;
                   const inferredConfidence = Math.min(confidenceAB, confidenceBC) * 0.8; // Apply a general discount (0.8) for inference

                   // Only add if inferred confidence is reasonable (e.g., >= 0.5)
                   if (inferredConfidence >= 0.5) {
                     this.addInferredRelation(
                       entityIdA, // Source of inferred relation is A
                       entityIdC, // Target of inferred relation is C
                       inferredType, // Inferred relation type
                       inferredConfidence, // Calculated confidence
                       { // Metadata about the inference
                         inferred: true,
                         inferenceType: 'transitive',
                         inferenceChain: [entityIdA, entityIdB, entityIdC], // The chain of entities
                         sourceRelationAB: relationAB.relationType, // Type of the first relation
                         sourceRelationBC: relationBC.relationType // Type of the second relation
                       }
                     );

                     inferredCount++;
                   }
                 }
               });
           }
        });
      });

      // 2. Symmetric relation inference (if A relates to B with a symmetric relation, then B relates to A)
      // Iterate through all direct relations
      Object.keys(this.relationMap).forEach(entityIdA => {
        const relationsAB = this.relationMap[entityIdA]; // Relations where A is the source
         if (!Array.isArray(relationsAB)) return; // Ensure it's an array

        relationsAB.forEach(relationAB => {
           // Ensure relationAB is valid
           if (!relationAB || typeof relationAB !== 'object' || typeof relationAB.targetEntityId !== 'string') return;

          const entityIdB = relationAB.targetEntityId; // B is the target of relation A->B

          // Check if the relation type is symmetric
          const symmetricRelationType = this.getSymmetricRelation(relationAB.relationType);
          if (symmetricRelationType) {
             // Infer B -> A relation using the symmetric type
            this.addInferredRelation(
              entityIdB, // Source of inferred relation is B
              entityIdA, // Target of inferred relation is A
              symmetricRelationType, // Symmetric relation type
              (relationAB.confidence ?? 0.0) * 0.95, // Slightly lower confidence (0.95) for inferred symmetric relation
              { // Metadata about the inference
                inferred: true,
                inferenceType: 'symmetric',
                symmetricOfRelation: relationAB.relationType, // The original relation type
                sourceRelation: `${entityIdA}-[${relationAB.relationType}]->${entityIdB}` // The original relation instance
              }
            );

            inferredCount++;
          }
        });
      });

      console.log(`[EntityRelationManager] Reasoning completed. Inferred ${inferredCount} new relations.`);
      return inferredCount;

    } catch (error) {
      console.error('[EntityRelationManager] Error performing reasoning:', getErrorMessage(error));
      return 0; // Return 0 on error
    }
  }

  /**
   * Checks if two entities are related, considering direct and inferred relationships.
   *
   * @param entityA First entity.
   * @param entityB Second entity.
   * @param relationType Optional specific relation type to check for.
   * @param options Query options.
   * @returns Boolean indicating if the entities are related above the minimum confidence threshold.
   */
  public areEntitiesRelated(
    entityA: Entity,
    entityB: Entity,
    relationType?: EntityRelationType,
    options?: RelationQueryOptions
  ): boolean {
    // Basic validation for entities
    if (!entityA || typeof entityA !== 'object' || typeof entityA.type !== 'string' || typeof entityA.value !== 'string' ||
        !entityB || typeof entityB !== 'object' || typeof entityB.type !== 'string' || typeof entityB.value !== 'string') {
        console.warn('[EntityRelationManager] Invalid entities provided to areEntitiesRelated.');
        return false;
    }

    const entityIdA = this.getEntityId(entityA);
    const entityIdB = this.getEntityId(entityB);

    // If it's the same entity, they are "related" trivially (or based on specific self-relations like 'isA' self)
    // For most purposes, we assume an entity isn't related *to itself* in the sense of external relationships.
    // If self-relations are important, this logic needs refinement. For now, treat as not related if IDs are identical.
     if (entityIdA === entityIdB) {
         // Special case: check for self-relations explicitly if needed, e.g., isA self?
         // For typical relationships, assume false.
         return false;
     }


    const queryOptions = { ...this.defaultQueryOptions, ...options };
     // Ensure minConfidence is a number, use fallback
     const minConfidence = queryOptions.minConfidence ?? 0.0; // Use 0.0 as default min confidence for existence check

    // Helper to check if a relation matches the type filter and confidence threshold
    const isMatch = (rel: EntityRelation): boolean => {
        // Ensure relation is valid
        if (!rel || typeof rel !== 'object' || typeof rel.relationType !== 'string' || typeof rel.confidence !== 'number') {
            return false; // Invalid relation object
        }
        // Check type filter if applied
        const typeMatch = !relationType || rel.relationType === relationType;
        // Check confidence threshold
        const confidenceMatch = rel.confidence >= minConfidence;

        return typeMatch && confidenceMatch;
    };


    // Check direct relations from A to B
    const directRelationsA = this.relationMap[entityIdA];
    if (Array.isArray(directRelationsA) && directRelationsA.some(r => r.targetEntityId === entityIdB && isMatch(r))) {
      // console.log(`[EntityRelationManager] Found direct relation A->B for ${entityIdA} and ${entityIdB}.`);
      return true;
    }

    // Check direct relations from B to A if bidirectional is enabled
    if (queryOptions.bidirectional) {
      const directRelationsB = this.relationMap[entityIdB];
      if (Array.isArray(directRelationsB) && directRelationsB.some(r => r.targetEntityId === entityIdA && isMatch(r))) {
          // console.log(`[EntityRelationManager] Found direct relation B->A for ${entityIdA} and ${entityIdB}.`);
        return true;
      }
    }

    // Check inferred relations if requested
    if (queryOptions.includeInferred) {
      // Check inferred relations from A to B
      const inferredRelationsA = this.inferredRelationMap[entityIdA];
      if (Array.isArray(inferredRelationsA) && inferredRelationsA.some(r => r.targetEntityId === entityIdB && isMatch(r))) {
           // console.log(`[EntityRelationManager] Found inferred relation A->B for ${entityIdA} and ${entityIdB}.`);
        return true;
      }

      // Check inferred relations from B to A if bidirectional is enabled
      if (queryOptions.bidirectional) {
        const inferredRelationsB = this.inferredRelationMap[entityIdB];
        if (Array.isArray(inferredRelationsB) && inferredRelationsB.some(r => r.targetEntityId === entityIdA && isMatch(r))) {
             // console.log(`[EntityRelationManager] Found inferred relation B->A for ${entityIdA} and ${entityIdB}.`);
          return true;
        }
      }
    }

    // If no matching direct or inferred relation found above threshold
    return false;
  }

  /**
   * Updates entity relationships based on newly identified entities and conversation context.
   * Tries to infer relationships between new entities based on their types and the context.
   *
   * @param entities Array of new or current entities from user input. Can be Entity or EnhancedEntity.
   * @param context Optional conversation context (Context or EnhancedContext).
   * @returns Number of relationships added or updated.
   */
  public updateRelationsFromEntities(
    entities: Entity[] | EnhancedEntity[],
    context?: Context | EnhancedContext // Allow both Context types
  ): number {
    // Ensure entities is a valid array with at least two entities to potentially find relations between
    if (!Array.isArray(entities) || entities.length < 2) {
        // console.log('[EntityRelationManager] updateRelationsFromEntities received less than 2 entities, skipping.');
        return 0;
    }

    let updateCount = 0;
    const timestamp = Date.now();

    // Extract context type if available, default to 'unknown'
    // Safely access context?.name
    const contextType = context?.name || 'unknown';

    // Process all unique pairs of entities
    // Iterate through indices to get pairs
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entityA = entities[i];
        const entityB = entities[j];

         // Basic validation for entity objects in the array
         if (!entityA || typeof entityA !== 'object' || typeof entityA.type !== 'string' || typeof entityA.value !== 'string' ||
             !entityB || typeof entityB !== 'object' || typeof entityB.type !== 'string' || typeof entityB.value !== 'string') { // Added type checks for entityA/B
             console.warn(`[EntityRelationManager] Skipping invalid entity pair at index ${i}, ${j}.`);
             continue; // Skip this pair if entities are malformed
         }


        // Infer possible relationship type based on entity types and current context type
        const possibleRelation = this.inferRelationFromEntityTypes(
          entityA.type, // Type of the first entity
          entityB.type, // Type of the second entity
          contextType // Type of the current conversation context
        );

        // If a possible relationship was inferred
        if (possibleRelation && typeof possibleRelation === 'object' && typeof possibleRelation.relationType === 'string' && typeof possibleRelation.direction === 'string' && typeof possibleRelation.confidence === 'number') { // Validate structure
          // Add the inferred relation to the relation map
          // The direction property tells us which entity is the source and which is the target
          if (possibleRelation.direction === 'AtoB') {
            this.addRelation(
              entityA, // Entity A is the source
              entityB, // Entity B is the target
              possibleRelation.relationType, // The inferred type
              possibleRelation.confidence, // The inferred confidence
              { detectedAt: timestamp, contextType, inferredFromTypes: true } // Metadata
            );
            updateCount++; // Increment counter if relation was added/updated
          } else if (possibleRelation.direction === 'BtoA') {
            this.addRelation(
              entityB, // Entity B is the source
              entityA, // Entity A is the target
              possibleRelation.relationType, // The inferred type
              possibleRelation.confidence, // The inferred confidence
              { detectedAt: timestamp, contextType, inferredFromTypes: true } // Metadata
            );
            updateCount++; // Increment counter
          } else {
               console.warn(`[EntityRelationManager] Invalid direction "${possibleRelation.direction}" inferred for relation between ${entityA.type} and ${entityB.type}.`);
          }
        }
      }
    }
    // console.log(`[EntityRelationManager] updateRelationsFromEntities added/updated ${updateCount} relations.`);
    return updateCount; // Return total count of added/updated relations
  }

  /**
   * Retrieves the most relevant entities for a specific query based on text matching and relation count.
   *
   * @param query The query string or topic.
   * @param entityType Optional entity type to filter by.
   * @param limit Maximum number of entities to return.
   * @returns Array of relevant entities, sorted by score. Returns empty array on error.
   */
  public getRelevantEntitiesForQuery(
    query: string,
    entityType?: string, // Optional filter by entity type
    limit: number = 5 // Default limit
  ): Entity[] {
    try {
       // Basic validation for query string
       if (typeof query !== 'string' || query.trim().length === 0) {
           // console.log('[EntityRelationManager] Empty or invalid query for getRelevantEntitiesForQuery.');
           return []; // Return empty array for invalid query
       }

      // Convert query to lowercase for case-insensitive matching
      const normalizedQuery = query.toLowerCase();

      // Collect all entities from the entity store
      const allEntities: Entity[] = [];
      this.entityStore.forEach(entity => {
         // Ensure entity is valid before adding
         if (entity && typeof entity === 'object' && typeof entity.type === 'string' && typeof entity.value === 'string') {
              // Filter by entity type if entityType filter is provided
             if (!entityType || (typeof entityType === 'string' && entity.type === entityType)) {
               allEntities.push(entity);
             }
         } else {
             console.warn('[EntityRelationManager] Skipping invalid entity in entityStore during collection.');
         }
      });

      // Score entities based on relevance to the query and their connectivity (relation count)
      const scoredEntities = allEntities.map(entity => {
        let score = 0;

        // Score based on text matching with the query (case-insensitive)
        const normalizedValue = entity.value.toLowerCase();

        // Give a base score if the entity value contains the query text
        if (normalizedValue.includes(normalizedQuery)) {
          score += 2; // Base score for inclusion
          // Add bonus if the entity value starts with the query text
           if (normalizedValue.startsWith(normalizedQuery)) {
             score += 1; // Bonus for starting with the query
           }
           // Add bonus if the entity value is an exact match for the query text
           if (normalizedValue === normalizedQuery) {
              score += 2; // Higher bonus for exact match
           }
        }

        // Score based on the number of relations (more connected entities might be more relevant/important)
        const entityId = this.getEntityId(entity);
        const relationCount = (this.relationMap[entityId]?.length ?? 0) +
                             (this.inferredRelationMap[entityId]?.length ?? 0);

        // Add score based on relation count, capping at a certain value to prevent dominance
        score += Math.min(relationCount / 3, 3); // Cap at 3 points (e.g., 9 relations)

        // Include the entity's confidence in the total score
        score += (entity.confidence ?? 0.5); // Use nullish coalescing for optional confidence, add up to 1 point

        return { entity, score };
      });

      // Sort by score (descending)
      scoredEntities.sort((a, b) => b.score - a.score);

      // Take the top 'limit' entities and return the entity objects
      const relevantEntities = scoredEntities.slice(0, limit).map(item => item.entity);

      // console.log(`[EntityRelationManager] Found ${relevantEntities.length} relevant entities for query "${truncateText(query, 50)}".`);
      return relevantEntities;

    } catch (error) {
      console.error('[EntityRelationManager] Error getting relevant entities:', getErrorMessage(error));
      return []; // Return empty array on error
    }
  }

  /**
   * Exports all direct entity relationships and the entity store for persistence.
   * Inferred relations are not exported as they are recalculated during import.
   *
   * @returns Serializable object with direct entity relationships and entities.
   */
  public exportRelations(): Record<string, any> {
    try {
       // Return a deep copy to prevent external modification of internal state
      return {
        relations: JSON.parse(JSON.stringify(this.relationMap)), // Deep copy of relation map
        entities: Array.from(this.entityStore.entries()) // Export entity store as array of [id, entity] tuples
      };
    } catch (error) {
      console.error('[EntityRelationManager] Error exporting relations:', getErrorMessage(error));
      return { relations: {}, entities: [] }; // Return empty structure on error
    }
  }

  /**
   * Imports entity relationships from a previously exported state.
   * Clears existing data before importing. Recalculates inferred relations after import.
   *
   * @param data The exported relationship data object.
   * @returns Number of direct imported relations. Returns 0 on error or invalid data.
   */
  public importRelations(data: Record<string, any>): number {
    try {
       // Basic validation for input data structure
      if (!data || typeof data !== 'object' || !data.relations || typeof data.relations !== 'object' || !Array.isArray(data.entities)) {
         console.warn('[EntityRelationManager] Invalid data structure provided for importRelations.');
         return 0;
      }

      // Clear existing direct relations and entities
      this.relationMap = {};
      this.entityStore.clear();
      this.isDirty = true; // Mark as dirty as we are modifying state

      // Import entities from the provided data array
      // Ensure each item in the entities array is a valid [id, entity] tuple
      for (const item of data.entities) {
         if (Array.isArray(item) && item.length === 2) {
             const [id, entity] = item;
             // Validate id and entity structure before adding
             if (typeof id === 'string' && id.length > 0 && entity && typeof entity === 'object' && typeof entity.type === 'string' && typeof entity.value === 'string') {
                 // Store a deep copy of the entity
                 this.entityStore.set(id, JSON.parse(JSON.stringify(entity)));
             } else {
                 console.warn('[EntityRelationManager] Skipping invalid entity item during import:', item);
             }
         } else {
             console.warn('[EntityRelationManager] Skipping invalid entities array item during import:', item);
         }
      }

      // Import direct relations from the provided data object
      // Iterate through source IDs in the relations object
      let importedCount = 0;
      Object.keys(data.relations).forEach(sourceId => {
          const relationsArray = data.relations[sourceId];
          // Ensure the value for this sourceId is a valid array
          if (Array.isArray(relationsArray)) {
              // Ensure the array contains valid EntityRelation objects
              const validRelations = relationsArray.filter(rel =>
                 rel && typeof rel === 'object' && typeof rel.sourceEntityId === 'string' && typeof rel.targetEntityId === 'string' && typeof rel.relationType === 'string' && typeof rel.confidence === 'number' && typeof rel.timestamp === 'number'
              );
              // Assign the filtered array to the relationMap
              if (validRelations.length > 0) {
                  this.relationMap[sourceId] = JSON.parse(JSON.stringify(validRelations)); // Deep copy
                  importedCount += validRelations.length;
              } else if (relationsArray.length > 0) {
                   console.warn(`[EntityRelationManager] All relations for sourceId ${sourceId} were invalid during import.`);
              }
          } else {
              console.warn(`[EntityRelationManager] Relations data for sourceId ${sourceId} is not a valid array during import.`);
          }
      });


      // Update in-memory cache after importing
      this.updateCache();

      // Regenerate inferred relations based on the newly imported direct relations
      const inferredCount = this.performReasoning();

      console.log(`[EntityRelationManager] Imported ${importedCount} direct relations and inferred ${inferredCount} relations.`);
      return importedCount; // Return the count of direct relations imported

    } catch (error) {
      console.error('[EntityRelationManager] Error importing relations:', getErrorMessage(error));
      return 0; // Return 0 on error
    }
  }

  /**
   * Clears all relationship data (direct and inferred) and the entity store.
   */
  public clearRelations(): void {
    this.relationMap = {}; // Reset direct relations
    this.inferredRelationMap = {}; // Reset inferred relations
    this.entityStore.clear(); // Clear the entity store
    this.isDirty = true; // Mark as dirty
    this.updateCache(); // Update in-memory cache
    console.log('[EntityRelationManager] All relation data cleared');
  }

  /**
   * Generates a unique string ID for an entity based on its type and value.
   *
   * @param entity The entity object. Must have type and value properties.
   * @returns A unique string ID or a default string if entity is invalid.
   */
  private getEntityId(entity: Entity): string {
    // Ensure entity and its required properties are valid strings
     if (!entity || typeof entity !== 'object' || typeof entity.type !== 'string' || typeof entity.value !== 'string') {
         console.warn('[EntityRelationManager] Invalid entity provided to getEntityId:', entity);
         // Return a default or throw an error, depending on desired behavior.
         // Returning a unique-ish default might prevent crashes but mask issues.
         // Let's return a default indicating invalidity.
         return `invalid_entity:${Date.now()}`; // Unique default to avoid collisions
     }
     // Return ID in the format "type:value"
    return `${entity.type}:${entity.value}`;
  }

  /**
   * Checks if two Entity objects represent the same conceptual entity
   * based on their type and value.
   * This method is private as it's an internal helper for the manager.
   *
   * @param entityA First entity.
   * @param entityB Second entity.
   * @returns Boolean indicating if they are equal. Returns false if inputs are invalid.
   */
  private areEntitiesEqual(entityA: Entity | null | undefined, entityB: Entity | null | undefined): boolean {
    // Check if both entities are valid objects with type and value
     if (!entityA || typeof entityA !== 'object' || typeof entityA.type !== 'string' || typeof entityA.value !== 'string' ||
         !entityB || typeof entityB !== 'object' || typeof entityB.type !== 'string' || typeof entityB.value !== 'string') {
         // console.warn('[EntityRelationManager] Invalid entity(ies) provided to areEntitiesEqual.');
         return false; // Cannot be equal if inputs are invalid
     }
    // Compare type and value for equality (case-sensitive)
    return entityA.type === entityB.type && entityA.value === entityB.value;
  }

  /**
   * Retrieves an Entity object from the entity store using its unique ID.
   * If not found, attempts to reconstruct a basic entity from the ID format "type:value".
   *
   * @param entityId The unique ID of the entity.
   * @returns The Entity object or null if it cannot be retrieved or reconstructed.
   */
  private getEntityById(entityId: string): Entity | null {
    // Ensure entityId is a valid string
     if (typeof entityId !== 'string' || entityId.length === 0) {
         console.warn('[EntityRelationManager] Invalid entityId provided to getEntityById.');
         return null;
     }

    // Try to get from the entity store cache first
    const entity = this.entityStore.get(entityId);
    // Return a deep copy if found to prevent external modification
    if (entity) return JSON.parse(JSON.stringify(entity));

    // If not found in the store, attempt to reconstruct a basic entity from the ID format
    const parts = entityId.split(':', 2); // Split by the first colon
    // Ensure the ID has at least two parts (type and value)
    if (parts.length === 2) {
      const [type, value] = parts;
       // Ensure type and value are non-empty strings after splitting
       if (type && value && type.length > 0 && value.length > 0) {
           // console.warn(`[EntityRelationManager] Entity ID "${entityId}" not found in store, reconstructing basic entity.`);
           // Return a basic entity object (confidence defaulted)
           return {
             type, // Extracted type
             value, // Extracted value
             confidence: 0.5 // Default confidence when reconstructing
           };
       }
    }

    // If the ID format is invalid or cannot be reconstructed
    console.warn(`[EntityRelationManager] Could not retrieve or reconstruct entity for ID: "${entityId}"`);
    return null; // Return null if entity cannot be found or reconstructed
  }

  /**
   * Adds an inferred relationship to the inferredRelationMap.
   * Updates an existing inferred relation if a new one with higher confidence is provided.
   *
   * @param sourceId ID of the source entity.
   * @param targetId ID of the target entity.
   * @param relationType Type of the inferred relationship.
   * @param confidence Confidence score of the inference.
   * @param metadata Optional metadata about the inference.
   */
  private addInferredRelation(
    sourceId: string,
    targetId: string,
    relationType: EntityRelationType,
    confidence: number, // Already validated in performReasoning
    metadata: Record<string, any> // Assumed valid object
  ): void {
    // Ensure sourceId, targetId, relationType are valid strings
    if (typeof sourceId !== 'string' || sourceId.length === 0 || typeof targetId !== 'string' || targetId.length === 0 || typeof relationType !== 'string' || relationType.length === 0) {
        console.warn('[EntityRelationManager] Skipping addInferredRelation due to invalid IDs or relationType.');
        return;
    }


    // Initialize inferred relation array for sourceId if it doesn't exist
    if (!this.inferredRelationMap[sourceId]) {
      this.inferredRelationMap[sourceId] = [];
    }

    // Check if an inferred relation with the same source, target, and type already exists
    const existingIndex = this.inferredRelationMap[sourceId].findIndex(
      r => r.targetEntityId === targetId && r.relationType === relationType
    );
    
    const relation: EntityRelation = {
      sourceEntityId: sourceId, // Use validated sourceId
      targetEntityId: targetId, // Use validated targetId
      relationType, // Use validated relationType
      confidence: Math.max(0.0, Math.min(1.0, confidence)), // Clamp confidence just in case
      timestamp: Date.now(),
      metadata: metadata ? { ...metadata } : {} // Copy metadata
    };

    if (existingIndex >= 0) {
      // Update if new confidence is higher
      if (this.inferredRelationMap[sourceId] && 
          this.inferredRelationMap[sourceId][existingIndex] &&
          relation.confidence > this.inferredRelationMap[sourceId][existingIndex].confidence) {
        this.inferredRelationMap[sourceId][existingIndex] = relation; // Replace with new relation object
        // console.log(`[EntityRelationManager] Updated inferred relation: ${sourceId} -[${relationType}]-> ${targetId} (Conf: ${relation.confidence})`);
      }
       // else { console.log(`[EntityRelationManager] Inferred relation already exists with higher or equal confidence: ${sourceId} -[${relationType}]-> ${targetId}`); }
    } else {
      // Add new inferred relation
      this.inferredRelationMap[sourceId].push(relation);
      // console.log(`[EntityRelationManager] Added new inferred relation: ${sourceId} -[${relationType}]-> ${targetId} (Conf: ${relation.confidence})`);
    }
  }

  /**
   * Determines if a transitive relation A->C can be inferred from A->B and B->C.
   * Defines the rules for valid transitive combinations of relation types.
   *
   * @param relationTypeAB Type of the relation from A to B.
   * @param relationTypeBC Type of the relation from B to C.
   * @returns Boolean indicating if a transitive inference is possible based on these types.
   */
  private canInferTransitiveRelation(
    relationTypeAB: EntityRelationType,
    relationTypeBC: EntityRelationType
  ): boolean {
    // Ensure relation types are valid strings
     if (typeof relationTypeAB !== 'string' || typeof relationTypeBC !== 'string') {
         return false;
     }

    // Implement rules for which relations can be combined transitively

    // "isA" + "isA" -> "isA" (transitive)
    if (relationTypeAB === 'isA' && relationTypeBC === 'isA') {
      return true;
    }

    // "isPart" + "isPart" -> "isPart" (transitive)
    if (relationTypeAB === 'isPart' && relationTypeBC === 'isPart') {
      return true;
    }

    // "hasPart" + "hasPart" -> "hasPart" (transitive) - Careful: this might be tricky in practice (e.g., Car has Part Wheel, Wheel has Part Spoke -> Car has Part Spoke). Depth limit helps.
    if (relationTypeAB === 'hasPart' && relationTypeBC === 'hasPart') {
      return true;
    }

    // "belongsTo" + "belongsTo" -> "belongsTo" (transitive)
    if (relationTypeAB === 'belongsTo' && relationTypeBC === 'belongsTo') {
      return true;
    }

    // "contains" + "contains" -> "contains" (transitive)
    if (relationTypeAB === 'contains' && relationTypeBC === 'contains') {
      return true;
    }

    // "locatedIn" + "locatedIn" -> "locatedIn" (transitive spatial containment)
    if (relationTypeAB === 'locatedIn' && relationTypeBC === 'locatedIn') {
      return true;
    }

    // "before" + "before" -> "before" (transitive temporal relationship)
    if (relationTypeAB === 'before' && relationTypeBC === 'before') {
      return true;
    }

    // "after" + "after" -> "after" (transitive temporal relationship)
    if (relationTypeAB === 'after' && relationTypeBC === 'after') {
      return true;
    }

    // "requires" + "requires" -> "requires" (transitive for dependencies)
    if (relationTypeAB === 'requires' && relationTypeBC === 'requires') {
      return true;
    }

     // Example: "causes" + "causes" -> "causes" (transitive causal chain)
     if (relationTypeAB === 'causes' && relationTypeBC === 'causes') {
         return true;
     }

    // Add more transitive rules here as needed

    // If none of the defined transitive rules match, return false
    return false;
  }

  /**
   * Gets the type of the inferred relation A->C based on the combination of A->B and B->C relation types.
   *
   * @param relationTypeAB Type of the relation from A to B.
   * @param relationTypeBC Type of the relation from B to C.
   * @returns The inferred EntityRelationType for A->C.
   */
  private getInferredRelationType(
    relationTypeAB: EntityRelationType,
    relationTypeBC: EntityRelationType
  ): EntityRelationType {
     // Ensure relation types are valid strings
     if (typeof relationTypeAB !== 'string' || typeof relationTypeBC !== 'string') {
         // Fallback to a generic relation type if input is invalid
         return 'relatedTo';
     }

    // Special cases where combination results in a different type than the source relation type
    // e.g., hasPart + isPart might indicate they are "relatedTo" but not a direct part-whole relationship
    // This rule is debatable and depends on the specific ontology/use case.
    // For now, we keep it as defined.
    if (relationTypeAB === 'hasPart' && relationTypeBC === 'isPart') {
      return 'relatedTo'; // The relationship becomes more generic
    }

    // If A->B is 'before' and B->C is 'after', A and C might be 'relatedTo' in a complex temporal way,
    // or this could indicate a contradiction. Returning 'relatedTo' is safest.
    if (relationTypeAB === 'before' && relationTypeBC === 'after') {
      return 'relatedTo'; // Complex or contradictory temporal relationships
    }

    // In most transitive cases (like isA + isA -> isA), the inferred type is the same as the input types.
    // We can simply return the type of the first relation (A->B) as a common fallback.
    return relationTypeAB;
  }

  /**
   * Returns the symmetric relation type for a given relation type, if it exists.
   *
   * @param relationType The relation type to check.
   * @returns The symmetric EntityRelationType or null if none exists.
   */
  private getSymmetricRelation(relationType: EntityRelationType): EntityRelationType | null {
     // Ensure relationType is a valid string
     if (typeof relationType !== 'string') return null;

    switch (relationType) {
      case 'hasPart': return 'isPart';
      case 'isPart': return 'hasPart';
      case 'contains': return 'belongsTo';
      case 'belongsTo': return 'contains';
      case 'before': return 'after';
      case 'after': return 'before';
      case 'relatedTo': return 'relatedTo'; // 'relatedTo' is typically symmetric
      case 'sameAs': return 'sameAs'; // 'sameAs' is symmetric
      case 'compatibleWith': return 'compatibleWith'; // 'compatibleWith' is symmetric
      // Add other symmetric pairs here

      default:
        // For any other relation type, assume it is not symmetric unless explicitly defined.
        return null;
    }
  }

  /**
   * Infers a possible relationship type and direction between two entities
   * based primarily on their entity types and potentially the conversation context.
   *
   * @param typeA Type of the first entity.
   * @param typeB Type of the second entity.
   * @param contextType Type of the current conversation context.
   * @returns An object describing the inferred relation type, direction, and confidence, or null if no specific relation could be inferred.
   */
  private inferRelationFromEntityTypes(
    typeA: string,
    typeB: string,
    contextType: string
  ): { relationType: EntityRelationType, direction: 'AtoB' | 'BtoA', confidence: number } | null {
    // Ensure entity types are valid strings
     if (typeof typeA !== 'string' || typeA.length === 0 || typeof typeB !== 'string' || typeB.length === 0) {
         // console.warn('[EntityRelationManager] Invalid entity types provided for inference:', { typeA, typeB });
         return null; // Cannot infer from invalid types
     }
      // Ensure contextType is a string
      if (typeof contextType !== 'string') contextType = 'unknown';


    // --- Define Rules for Type-Based Inference ---
    // These rules map pairs of entity types (and optional context) to a likely relationship type and direction.

    // Product and Category relationship
    if (typeA === 'product' && typeB === 'category') {
      return {
        relationType: 'belongsTo', // A product belongs to a category
        direction: 'AtoB', // Direction is from product to category
        confidence: 0.8 // High confidence for this common relationship
      };
    }
    // Reverse relationship: Category and Product
    if (typeA === 'category' && typeB === 'product') {
      return {
        relationType: 'contains', // A category contains products
        direction: 'AtoB', // Direction is from category to product
        confidence: 0.8 // High confidence
      };
    }

    // Feature and Product relationship
    if (typeA === 'feature' && typeB === 'product') {
      return {
        relationType: 'isPart', // A feature is part of a product
        direction: 'AtoB', // Direction is from feature to product
        confidence: 0.7 // Moderate confidence
      };
    }
    // Reverse relationship: Product and Feature
    if (typeA === 'product' && typeB === 'feature') {
      return {
        relationType: 'hasPart', // A product has features
        direction: 'AtoB', // Direction is from product to feature
        confidence: 0.7 // Moderate confidence
      };
    }

    // Location relationships (e.g., Organization located in Country)
    if (typeA === 'location' && typeB === 'country') {
       return { relationType: 'isPart', direction: 'AtoB', confidence: 0.75 }; // Location is part of a country
    }
     if (typeA === 'country' && typeB === 'location') {
        return { relationType: 'contains', direction: 'AtoB', confidence: 0.75 }; // Country contains locations
     }
     if (typeA === 'organization' && typeB === 'location') {
       return { relationType: 'locatedIn', direction: 'AtoB', confidence: 0.7 }; // Organization located in a location
     }
     if (typeA === 'location' && typeB === 'organization') {
        return { relationType: 'locatedIn', direction: 'BtoA', confidence: 0.7 }; // Location contains an organization (reverse perspective)
     }


    // Temporal relationships between date/time entities
    // We can't determine the exact temporal relationship (before/after) solely from types,
    // but we know they are temporally related.
    if (typeA === 'date' && typeB === 'date') {
      return {
        relationType: 'relatedTo', // Generic temporal relationship
        direction: 'AtoB', // Direction is arbitrary here
        confidence: 0.6 // Lower confidence as specific relation is unknown
      };
    }
     if ((typeA === 'date' || typeA === 'time' || typeA === 'duration') && (typeB === 'date' || typeB === 'time' || typeB === 'duration')) {
        return { relationType: 'relatedTo', direction: 'AtoB', confidence: 0.6 };
     }


    // Error and Issue relationships
    if (typeA === 'error' && typeB === 'issue' || typeA === 'issue' && typeB === 'error') {
      // In troubleshooting context, one might *cause* the other, otherwise just related
       if (contextType === 'troubleshooting' || contextType === 'error') {
            return {
              relationType: 'causes', // Error causes issue
              direction: typeA === 'error' ? 'AtoB' : 'BtoA', // Direction depends on which is Error vs Issue
              confidence: 0.8 // Higher confidence in relevant context
            };
       }
       return {
         relationType: 'relatedTo', // Generic relationship outside specific context
         direction: 'AtoB', // Direction is arbitrary
         confidence: 0.7 // Moderate confidence
       };
    }

     // Frequency and Audio relationship (e.g. Binaural Beat isPart of an Audio)
     if (typeA === 'FREQUENCY_TYPE' && typeB === 'AUDIO_TITLE') {
         return { relationType: 'isPart', direction: 'AtoB', confidence: 0.7 };
     }
     if (typeA === 'AUDIO_TITLE' && typeB === 'FREQUENCY_TYPE') {
         return { relationType: 'hasPart', direction: 'AtoB', confidence: 0.7 };
     }
     if (typeA === 'FREQUENCY_VALUE' && typeB === 'FREQUENCY_TYPE') {
          return { relationType: 'isA', direction: 'AtoB', confidence: 0.8 }; // Specific frequency IS-A type
     }


    // Context-specific relationships - apply higher confidence or specific types within contexts
    // Note: These rules might override general rules above if they match
    if (contextType === 'faq_premium_benefits' || contextType === 'faq_pricing_info') { // Context about premium/pricing
      if (typeA === 'PLAN_NAME' && typeB === 'FEATURE_NAME') {
        return {
          relationType: 'hasPart', // A plan has features
          direction: 'AtoB',
          confidence: 0.9 // High confidence in pricing context
        };
      }
       if (typeA === 'FEATURE_NAME' && typeB === 'PLAN_NAME') {
         return {
           relationType: 'belongsTo', // A feature belongs to a plan
           direction: 'AtoB',
           confidence: 0.9
         };
       }
    }

     if (contextType === 'faq_device_compatibility' || contextType === 'playback_error') { // Context about devices/playback
       if (typeA === 'DEVICE_TYPE' && typeB === 'FEATURE_NAME') {
          return {
             relationType: 'compatibleWith', // Device type compatible with feature
             direction: 'AtoB',
             confidence: 0.8
          };
       }
        if (typeA === 'FEATURE_NAME' && typeB === 'DEVICE_TYPE') {
           return {
              relationType: 'compatibleWith', // Feature compatible with device type
              direction: 'BtoA', // Symmetric perspective
              confidence: 0.8
           };
        }
        if (typeA === 'DEVICE_TYPE' && typeB === 'PLAYBACK_OPTION') {
            return {
              relationType: 'compatibleWith', // Device type compatible with playback option
              direction: 'AtoB',
              confidence: 0.8
            };
        }
     }


    // If the entity types are the same, they are likely related in some generic way
    if (typeA === typeB) {
      // Avoid creating 'relatedTo' self-relations if possible, unless context suggests comparison
      // A simple type match is a weak signal without more context
      if (contextType === 'comparison') { // If the context is comparison, relatedTo makes sense
         return {
           relationType: 'relatedTo',
           direction: 'AtoB',
           confidence: 0.6 // Moderate confidence
         };
      }
       // Otherwise, don't infer relation just because types match
       return null;
    }

    // If no specific relationship could be inferred from the entity types and context
    return null;
  }

  /**
   * Filters an array of Entity objects to return only unique entities
   * based on their generated ID (type + value). Keeps the one with highest confidence in case of duplicates.
   *
   * @param entities Array of Entity objects (can contain duplicates).
   * @returns Array of unique Entity objects. Returns empty array if input is invalid.
   */
  private filterUniqueEntities(entities: Entity[]): Entity[] {
     // Ensure input is a valid array
     if (!Array.isArray(entities)) {
         console.warn('[EntityRelationManager] Invalid input provided to filterUniqueEntities.');
         return []; // Return empty array if input is not an array
     }

    const uniqueMap: Map<string, Entity> = new Map(); // Use Map for uniqueness based on ID

    for (const entity of entities) {
       // Ensure entity is a valid object before processing
       if (!entity || typeof entity !== 'object' || typeof entity.type !== 'string' || typeof entity.value !== 'string') {
           console.warn('[EntityRelationManager] Skipping invalid entity during unique filtering:', entity);
           continue; // Skip this entity if it's malformed
       }

      const entityId = this.getEntityId(entity); // Get the unique ID

      // Check if the ID is already in the map
      const existingEntity = uniqueMap.get(entityId);

      if (!existingEntity) {
        // If the ID is not in the map, add the current entity
        uniqueMap.set(entityId, entity);
      } else {
        // If the ID is already in the map, compare confidence scores
        // Keep the entity with the higher confidence score
        if ((entity.confidence ?? 0) > (existingEntity.confidence ?? 0)) { // Use nullish coalescing for confidence comparison
          uniqueMap.set(entityId, entity); // Replace with the higher confidence entity
        }
      }
    }

    // Return an array containing the unique entities stored in the map
    return Array.from(uniqueMap.values());
  }

  /**
   * Updates the in-memory cache with the current state of direct relations and entities.
   * Should be called after any modifications to `relationMap` or `entityStore`.
   * This cache is intended for subsequent instantiations within the same process/session.
   */
  private updateCache(): void {
    try {
       // Perform a deep copy of the current relation map into the cache
      Object.assign(entityRelationsCache, JSON.parse(JSON.stringify(this.relationMap)));
       // Copy the current entity store Map into the cache
      entityStoreCache.clear(); // Clear the cache map first
      Array.from(this.entityStore.entries()).forEach(([id, entity]) => {
          entityStoreCache.set(id, JSON.parse(JSON.stringify(entity))); // Store deep copies of entities
      });

      this.isDirty = false; // Reset the dirty flag
      // console.log('[EntityRelationManager] In-memory cache updated.');
    } catch (error) {
      console.error('[EntityRelationManager] Error updating in-memory cache:', getErrorMessage(error));
      // Log error but don't rethrow, caching is not critical for core functionality
    }
  }
}

// Export default singleton instance of EntityRelationManager
export default EntityRelationManager.getInstance();