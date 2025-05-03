import type { Entity, Context, Intent } from '@/types/nlp.types';
import type { EntityRelationType } from './entityRelationManager';
import type { Fact } from './inferenceEngine';

/**
 * Represents a node in the knowledge graph
 */
export interface KnowledgeNode {
  /** Unique identifier for the node */
  id: string;
  /** Type of entity this node represents */
  type: string;
  /** Value/name of the entity */
  value: string;
  /** Additional properties for this entity */
  properties: Record<string, any>;
  /** Confidence score for this entity's existence (0.0 to 1.0) */
  confidence: number;
  /** When this node was created or last updated */
  timestamp: number;
  /** Source of this information (e.g., user, system, inference) */
  source?: string;
  /** Domain categories this node belongs to */
  domains?: string[];
}

/**
 * Represents a directed edge in the knowledge graph
 */
export interface KnowledgeEdge {
  /** Unique identifier for the edge */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Type of relationship */
  type: string;
  /** Properties of this relationship */
  properties: Record<string, any>;
  /** Confidence score (0.0 to 1.0) */
  confidence: number;
  /** When this edge was created or last updated */
  timestamp: number;
  /** Source of this information */
  source?: string;
}

/**
 * Represents a path in the knowledge graph
 */
export interface KnowledgePath {
  /** Nodes in the path */
  nodes: KnowledgeNode[];
  /** Edges in the path */
  edges: KnowledgeEdge[];
  /** Total confidence score of the path */
  confidence: number;
  /** Path description in natural language */
  description?: string;
}

/**
 * Query result from the knowledge graph
 */
export interface GraphQueryResult {
  /** Facts derived from the query */
  facts: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    metadata?: Record<string, any>;
  }>;
  /** Overall confidence in the result */
  confidence: number;
  /** Natural language explanation of the result */
  explanation?: string;
  /** Paths found in the graph */
  paths?: KnowledgePath[];
}

/**
 * Options for querying the knowledge graph
 */
export interface GraphQueryOptions {
  /** Maximum path length for traversals */
  maxPathLength?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Whether to include explanations */
  includeExplanations?: boolean;
  /** Filter by relation types */
  relationTypes?: string[];
  /** Filter by entity types */
  entityTypes?: string[];
  /** Specific domains to include */
  domains?: string[];
  /** Query intent type (relationship, property, entity, etc.) */
  intent?: string;
}

/** Type for query intent result */
interface QueryIntent {
  intent: string;
  confidence: number;
}

/**
 * KnowledgeGraph represents a semantic network of entities and their relationships.
 * It supports querying, traversal, and inference to extract insights from connected data.
 */
export class KnowledgeGraph {
  private static instance: KnowledgeGraph | null = null;
  
  // Main data structures
  private nodes: Map<string, KnowledgeNode> = new Map();
  private edges: Map<string, KnowledgeEdge> = new Map();
  
  // Index for fast lookups
  private outgoingEdges: Map<string, Set<string>> = new Map();
  private incomingEdges: Map<string, Set<string>> = new Map();
  private edgesByType: Map<string, Set<string>> = new Map();
  private nodesByType: Map<string, Set<string>> = new Map();
  private nodesByValue: Map<string, Set<string>> = new Map();
  
  // Statistics
  private nodeCount: number = 0;
  private edgeCount: number = 0;
  private lastModified: number = 0;
  
  // Default query options
  private defaultQueryOptions: GraphQueryOptions = {
    maxPathLength: 3,
    minConfidence: 0.5,
    maxResults: 10,
    includeExplanations: true
  };

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    console.log('[KnowledgeGraph] Initializing knowledge graph');
    this.lastModified = Date.now();
  }

  /**
   * Get the singleton instance of KnowledgeGraph
   */
  public static getInstance(): KnowledgeGraph {
    if (!KnowledgeGraph.instance) {
      KnowledgeGraph.instance = new KnowledgeGraph();
    }
    return KnowledgeGraph.instance;
  }

  /**
   * Add a node to the knowledge graph
   * @param node Node to add
   * @returns True if successful
   */
  public addNode(node: KnowledgeNode): boolean {
    try {
      if (!node) {
        console.error('[KnowledgeGraph] Cannot add null or undefined node');
        return false;
      }

      const nodeId = node.id || this.generateNodeId(node);
      const timestamp = Date.now();
      
      // Check if node already exists
      const existingNode = this.nodes.get(nodeId);
      if (existingNode) {
        // Update existing node if new confidence is higher
        if (node.confidence > existingNode.confidence) {
          this.nodes.set(nodeId, {
            ...node,
            id: nodeId,
            properties: { ...existingNode.properties, ...node.properties },
            timestamp
          });
        } else {
          // Still update properties
          this.nodes.set(nodeId, {
            ...existingNode,
            properties: { ...existingNode.properties, ...node.properties },
            timestamp
          });
        }
      } else {
        // Add new node
        const newNode: KnowledgeNode = {
          ...node,
          id: nodeId,
          properties: node.properties || {},
          timestamp
        };
        
        this.nodes.set(nodeId, newNode);
        this.nodeCount++;
        
        // Update indexes
        this.addToTypeIndex(newNode);
        this.addToValueIndex(newNode);
      }
      
      this.lastModified = timestamp;
      return true;
    } catch (error) {
      console.error('[KnowledgeGraph] Error adding node:', error);
      return false;
    }
  }

  /**
   * Add an edge to the knowledge graph
   * @param edge Edge to add
   * @returns True if successful
   */
  public addEdge(edge: KnowledgeEdge): boolean {
    try {
      if (!edge) {
        console.error('[KnowledgeGraph] Cannot add null or undefined edge');
        return false;
      }
      
      // Check if source and target nodes exist
      if (!this.nodes.has(edge.sourceId)) {
        console.warn(`[KnowledgeGraph] Source node ${edge.sourceId} does not exist`);
        return false;
      }
      
      if (!this.nodes.has(edge.targetId)) {
        console.warn(`[KnowledgeGraph] Target node ${edge.targetId} does not exist`);
        return false;
      }
      
      const edgeId = edge.id || this.generateEdgeId(edge);
      const timestamp = Date.now();
      
      // Check if edge already exists
      const existingEdge = this.edges.get(edgeId);
      if (existingEdge) {
        // Update existing edge if new confidence is higher
        if (edge.confidence > existingEdge.confidence) {
          this.edges.set(edgeId, {
            ...edge,
            id: edgeId,
            properties: { ...existingEdge.properties, ...edge.properties },
            timestamp
          });
        } else {
          // Still update properties
          this.edges.set(edgeId, {
            ...existingEdge,
            properties: { ...existingEdge.properties, ...edge.properties },
            timestamp
          });
        }
      } else {
        // Add new edge
        const newEdge: KnowledgeEdge = {
          ...edge,
          id: edgeId,
          properties: edge.properties || {},
          timestamp
        };
        
        this.edges.set(edgeId, newEdge);
        this.edgeCount++;
        
        // Update indexes
        this.addToEdgeIndexes(newEdge);
      }
      
      this.lastModified = timestamp;
      return true;
    } catch (error) {
      console.error('[KnowledgeGraph] Error adding edge:', error);
      return false;
    }
  }

  /**
   * Creates a node from an entity
   * @param entity Entity to convert
   * @param source Source of the entity
   * @returns True if successful
   */
  public addEntity(entity: Entity, source: string = 'user'): boolean {
    try {
      if (!entity || !entity.type || !entity.value) {
        console.error('[KnowledgeGraph] Cannot add invalid entity:', entity);
        return false;
      }

      const node: KnowledgeNode = {
        id: this.generateNodeIdFromEntity(entity),
        type: entity.type,
        value: entity.value,
        properties: entity.metadata || {},
        confidence: entity.confidence ?? 0.8,
        timestamp: Date.now(),
        source
      };
      
      return this.addNode(node);
    } catch (error) {
      console.error('[KnowledgeGraph] Error adding entity:', error);
      return false;
    }
  }

  /**
   * Creates a relationship between two entities
   * @param sourceEntity Source entity
   * @param relationType Type of relationship
   * @param targetEntity Target entity
   * @param confidence Confidence score
   * @param source Source of the relationship
   * @returns True if successful
   */
  public addRelationship(
    sourceEntity: Entity,
    relationType: string,
    targetEntity: Entity,
    confidence: number = 0.8,
    source: string = 'user'
  ): boolean {
    try {
      if (!sourceEntity || !targetEntity || !relationType) {
        console.error('[KnowledgeGraph] Invalid relationship parameters');
        return false;
      }
      
      // First ensure both entities exist as nodes
      const sourceAdded = this.addEntity(sourceEntity, source);
      const targetAdded = this.addEntity(targetEntity, source);
      
      if (!sourceAdded || !targetAdded) {
        console.error('[KnowledgeGraph] Failed to add entities for relationship');
        return false;
      }
      
      // Create the edge
      const sourceId = this.generateNodeIdFromEntity(sourceEntity);
      const targetId = this.generateNodeIdFromEntity(targetEntity);
      
      const edge: KnowledgeEdge = {
        id: `${sourceId}|${relationType}|${targetId}`,
        sourceId,
        targetId,
        type: relationType,
        properties: {},
        confidence,
        timestamp: Date.now(),
        source
      };
      
      return this.addEdge(edge);
    } catch (error) {
      console.error('[KnowledgeGraph] Error adding relationship:', error);
      return false;
    }
  }

  /**
   * Query the knowledge graph
   * @param query Natural language query
   * @param entities Entities to consider in the query
   * @param options Query options
   * @returns Query results
   */
  public query(
    query: string,
    entities: Entity[],
    options: GraphQueryOptions = {}
  ): GraphQueryResult[] {
    try {
      if (!query) {
        console.warn('[KnowledgeGraph] Empty query string provided');
        return [];
      }

      console.log(`[KnowledgeGraph] Processing query: "${query}"`);
      
      // Merge with default options
      const queryOptions: GraphQueryOptions = {
        ...this.defaultQueryOptions,
        ...options
      };
      
      // Extract query intent
      const queryIntent = this.analyzeQuery(query);
      console.log(`[KnowledgeGraph] Query intent: ${queryIntent.intent}`);
      
      // Add entities to graph if not already present
      for (const entity of entities) {
        if (entity) {
          this.addEntity(entity, 'query');
        }
      }
      
      const results: GraphQueryResult[] = [];
      
      // Handle different query types
      const intent = queryOptions.intent || queryIntent.intent;
      
      switch (intent) {
        case 'relationship':
          if (entities.length >= 2) {
            // Find relationships between entities
            for (let i = 0; i < entities.length - 1; i++) {
              for (let j = i + 1; j < entities.length; j++) {
                const entityI = entities[i];
                const entityJ = entities[j];
                
                if (!entityI || !entityJ) continue;
                
                const sourceId = this.generateNodeIdFromEntity(entityI);
                const targetId = this.generateNodeIdFromEntity(entityJ);
                
                const paths = this.findPaths(
                  sourceId,
                  targetId,
                  queryOptions.maxPathLength ?? 3,
                  queryOptions.minConfidence ?? 0.5,
                  queryOptions.relationTypes
                );
                
                if (paths.length > 0) {
                  // Convert paths to facts
                  const facts = this.pathsToFacts(paths);
                  
                  results.push({
                    facts,
                    confidence: this.calculateAverageConfidence(paths),
                    explanation: paths[0] ? this.generatePathExplanation(paths[0]) : "No clear path found.",
                    paths
                  });
                }
                
                // Try reverse direction if no paths found
                if (paths.length === 0) {
                  const reversePaths = this.findPaths(
                    targetId,
                    sourceId,
                    queryOptions.maxPathLength ?? 3,
                    queryOptions.minConfidence ?? 0.5,
                    queryOptions.relationTypes
                  );
                  
                  if (reversePaths.length > 0) {
                    // Convert paths to facts
                    const facts = this.pathsToFacts(reversePaths);
                    
                    results.push({
                      facts,
                      confidence: this.calculateAverageConfidence(reversePaths),
                      explanation: reversePaths[0] ? this.generatePathExplanation(reversePaths[0]) : "No clear reverse path found.",
                      paths: reversePaths
                    });
                  }
                }
              }
            }
          }
          break;
          
        case 'property':
          // Find properties of entities
          for (const entity of entities) {
            if (!entity) continue;
            
            const nodeId = this.generateNodeIdFromEntity(entity);
            const node = this.nodes.get(nodeId);
            
            if (node) {
              const properties = node.properties;
              const facts: Array<{
                subject: string;
                predicate: string;
                object: string;
                confidence: number;
                metadata?: Record<string, any>;
              }> = [];
              
              // Convert properties to facts
              for (const [key, value] of Object.entries(properties)) {
                if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                  facts.push({
                    subject: entity.value,
                    predicate: key,
                    object: String(value),
                    confidence: node.confidence,
                    metadata: {
                      source: node.source,
                      entityType: entity.type
                    }
                  });
                }
              }
              
              if (facts.length > 0) {
                results.push({
                  facts,
                  confidence: node.confidence,
                  explanation: `Properties of ${entity.value} (${entity.type})`
                });
              }
            }
            
            // Also check for relationships where this entity is the source
            const outEdgeIds = this.outgoingEdges.get(nodeId);
            if (outEdgeIds && outEdgeIds.size > 0) {
              const relationFacts: Array<{
                subject: string;
                predicate: string;
                object: string;
                confidence: number;
                metadata?: Record<string, any>;
              }> = [];
              
              for (const edgeId of outEdgeIds) {
                const edge = this.edges.get(edgeId);
                if (edge && edge.confidence >= (queryOptions.minConfidence ?? 0.5)) {
                  const targetNode = this.nodes.get(edge.targetId);
                  if (targetNode) {
                    relationFacts.push({
                      subject: entity.value,
                      predicate: edge.type,
                      object: targetNode.value,
                      confidence: edge.confidence,
                      metadata: {
                        source: edge.source,
                        sourceType: entity.type,
                        targetType: targetNode.type
                      }
                    });
                  }
                }
              }
              
              if (relationFacts.length > 0) {
                results.push({
                  facts: relationFacts,
                  confidence: this.calculateAverageConfidenceFromFacts(relationFacts),
                  explanation: `Relationships where ${entity.value} is the source`
                });
              }
            }
          }
          break;
          
        case 'entity':
          // Find information about specific entities
          for (const entity of entities) {
            if (!entity) continue;
            
            const nodeId = this.generateNodeIdFromEntity(entity);
            const facts: Array<{
              subject: string;
              predicate: string;
              object: string;
              confidence: number;
              metadata?: Record<string, any>;
            }> = [];
            
            // Collect all relationships where this entity is involved
            const outEdgeIds = this.outgoingEdges.get(nodeId);
            const inEdgeIds = this.incomingEdges.get(nodeId);
            
            // Add outgoing relationships
            if (outEdgeIds) {
              for (const edgeId of outEdgeIds) {
                const edge = this.edges.get(edgeId);
                if (edge && edge.confidence >= (queryOptions.minConfidence ?? 0.5)) {
                  const targetNode = this.nodes.get(edge.targetId);
                  if (targetNode) {
                    facts.push({
                      subject: entity.value,
                      predicate: edge.type,
                      object: targetNode.value,
                      confidence: edge.confidence,
                      metadata: {
                        source: edge.source,
                        sourceType: entity.type,
                        targetType: targetNode.type
                      }
                    });
                  }
                }
              }
            }
            
            // Add incoming relationships
            if (inEdgeIds) {
              for (const edgeId of inEdgeIds) {
                const edge = this.edges.get(edgeId);
                if (edge && edge.confidence >= (queryOptions.minConfidence ?? 0.5)) {
                  const sourceNode = this.nodes.get(edge.sourceId);
                  if (sourceNode) {
                    facts.push({
                      subject: sourceNode.value,
                      predicate: edge.type,
                      object: entity.value,
                      confidence: edge.confidence,
                      metadata: {
                        source: edge.source,
                        sourceType: sourceNode.type,
                        targetType: entity.type
                      }
                    });
                  }
                }
              }
            }
            
            if (facts.length > 0) {
              results.push({
                facts,
                confidence: this.calculateAverageConfidenceFromFacts(facts),
                explanation: `Information about ${entity.value} (${entity.type})`
              });
            }
          }
          break;
          
        case 'general':
        default:
          // For general queries, combine entity and relationship queries
          const entityResults = this.query(query, entities, {
            ...queryOptions,
            maxResults: queryOptions.maxResults ? Math.floor(queryOptions.maxResults / 2) : 5,
            intent: 'entity'
          });
          
          const relationshipResults = this.query(query, entities, {
            ...queryOptions,
            maxResults: queryOptions.maxResults ? Math.floor(queryOptions.maxResults / 2) : 5,
            intent: 'relationship'
          });
          
          results.push(...entityResults, ...relationshipResults);
          break;
      }
      
      // Sort by confidence and limit results
      results.sort((a, b) => b.confidence - a.confidence);
      return results.slice(0, queryOptions.maxResults ?? 10);
    } catch (error) {
      console.error('[KnowledgeGraph] Error querying graph:', error);
      return [];
    }
  }

  /**
   * Answer a natural language question using the knowledge graph
   * @param question The question to answer
   * @param entities Relevant entities from the question
   * @param context Optional conversation context
   * @returns Answer with explanation and confidence
   */
  public answerQuestion(
    question: string,
    entities: Entity[] = [],
    context?: Context
  ): { answer: string, explanation?: string, confidence: number } {
    try {
      if (!question) {
        return {
          answer: "I can't answer an empty question.",
          explanation: "No question was provided.",
          confidence: 0
        };
      }

      console.log(`[KnowledgeGraph] Answering question: "${question}"`);
      
      // Extract entities from context if not provided
      let relevantEntities: Entity[] = [];
      
      if (entities.length === 0 && context && context.entities) {
        relevantEntities = context.entities.filter(Boolean);
      } else {
        relevantEntities = entities.filter(Boolean);
      }
      
      // If still no entities, try to extract from question
      if (relevantEntities.length === 0) {
        const extractedEntities = this.extractEntitiesFromText(question);
        if (extractedEntities.length > 0) {
          relevantEntities = extractedEntities;
        }
      }
      
      // Analyze question type
      const questionType = this.analyzeQuestionType(question);
      console.log(`[KnowledgeGraph] Question type: ${questionType}`);
      
      // Set up query options based on question type
      const queryOptions: GraphQueryOptions = {
        maxPathLength: 3,
        minConfidence: 0.5,
        includeExplanations: true
      };
      
      // Adjust query options based on question type
      if (questionType === 'relation') {
        queryOptions.maxPathLength = 3;
      } else if (questionType === 'factual') {
        queryOptions.minConfidence = 0.7;
      }
      
      // Query the graph
      const results = this.query(question, relevantEntities, {
        ...queryOptions,
        intent: this.mapQuestionTypeToQueryIntent(questionType)
      });
      
      if (results.length === 0) {
        return {
          answer: "I don't have enough information to answer that question.",
          explanation: "No relevant information found in knowledge graph.",
          confidence: 0.1
        };
      }
      
      // Use the highest confidence result
      const bestResult = results[0];
      
      // Generate an answer based on the query results and question type
      const answer = bestResult ? this.generateAnswer(question, bestResult, questionType, relevantEntities) : 
                                 "I don't have enough information to answer that question.";
      
      return {
        answer,
        explanation: bestResult?.explanation || "Based on knowledge graph analysis.",
        confidence: bestResult?.confidence || 0.1
      };
    } catch (error) {
      console.error('[KnowledgeGraph] Error answering question:', error);
      return {
        answer: "I'm sorry, I encountered an error while trying to answer your question.",
        explanation: "Error in knowledge graph processing.",
        confidence: 0
      };
    }
  }

  /**
   * Explain the relationship between two entities
   * @param sourceEntity Source entity
   * @param targetEntity Target entity
   * @param options Query options
   * @returns Explanation of the relationship with confidence
   */
  public explainRelationship(
    sourceEntity: Entity,
    targetEntity: Entity,
    options: GraphQueryOptions = {}
  ): { explanation: string, confidence: number, path: string[] } {
    try {
      if (!sourceEntity || !targetEntity) {
        return {
          explanation: "Cannot explain relationship between undefined entities.",
          confidence: 0,
          path: []
        };
      }

      console.log(`[KnowledgeGraph] Explaining relationship between ${sourceEntity.value} and ${targetEntity.value}`);
      
      // Add entities to graph if not already present
      this.addEntity(sourceEntity, 'relation_query');
      this.addEntity(targetEntity, 'relation_query');
      
      const sourceId = this.generateNodeIdFromEntity(sourceEntity);
      const targetId = this.generateNodeIdFromEntity(targetEntity);
      
      // Find paths from source to target
      const forwardPaths = this.findPaths(
        sourceId,
        targetId,
        options.maxPathLength ?? 3,
        options.minConfidence ?? 0.5,
        options.relationTypes
      );
      
      // Find paths from target to source (reverse direction)
      const reversePaths = this.findPaths(
        targetId,
        sourceId,
        options.maxPathLength ?? 3,
        options.minConfidence ?? 0.5,
        options.relationTypes
      );
      
      // Combine and sort by confidence
      const allPaths = [...forwardPaths, ...reversePaths];
      allPaths.sort((a, b) => b.confidence - a.confidence);
      
      if (allPaths.length === 0) {
        return {
          explanation: `I don't have information about how ${sourceEntity.value} relates to ${targetEntity.value}.`,
          confidence: 0,
          path: []
        };
      }
      
      // Use the highest confidence path
      const bestPath = allPaths[0];
      
      if (!bestPath) {
        return {
          explanation: `I don't have information about how ${sourceEntity.value} relates to ${targetEntity.value}.`,
          confidence: 0,
          path: []
        };
      }
      
      const pathDescription = this.generatePathExplanation(bestPath);
      const pathStrings = this.pathToStringArray(bestPath);
      
      return {
        explanation: pathDescription,
        confidence: bestPath.confidence,
        path: pathStrings
      };
    } catch (error) {
      console.error('[KnowledgeGraph] Error explaining relationship:', error);
      return {
        explanation: "An error occurred while analyzing the relationship.",
        confidence: 0,
        path: []
      };
    }
  }

  /**
   * Find paths between two nodes in the graph
   * @param sourceId Source node ID
   * @param targetId Target node ID
   * @param maxLength Maximum path length
   * @param minConfidence Minimum confidence threshold
   * @param relationTypes Optional filter for relation types
   * @returns Array of paths found
   */
  public findPaths(
    sourceId: string,
    targetId: string,
    maxLength: number = 3,
    minConfidence: number = 0.5,
    relationTypes?: string[]
  ): KnowledgePath[] {
    if (!sourceId || !targetId) {
      console.error('[KnowledgeGraph] Invalid source or target ID for path finding');
      return [];
    }
    
    // Check if nodes exist
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return [];
    }
    
    // Breadth-first search to find paths
    const paths: KnowledgePath[] = [];
    
    // Queue structure to track path exploration
    interface QueueItem {
      currentId: string;
      path: {
        nodes: KnowledgeNode[];
        edges: KnowledgeEdge[];
        visited: Set<string>; 
        confidence: number;
      };
    }
    
    const queue: QueueItem[] = [];
    
    // Start from source node
    const sourceNode = this.nodes.get(sourceId);
    if (!sourceNode) {
      return [];
    }
    
    queue.push({
      currentId: sourceId,
      path: {
        nodes: [sourceNode],
        edges: [],
        visited: new Set([sourceId]),
        confidence: 1.0
      }
    });
    
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      
      const { currentId, path } = current;
      
      // If we've reached the target, add the path to results
      if (currentId === targetId && path.edges.length > 0) {
        paths.push({
          nodes: [...path.nodes],
          edges: [...path.edges],
          confidence: path.confidence
        });
        
        // Continue to find other paths
        continue;
      }
      
      // If we've reached the maximum path length, stop exploring this path
      if (path.edges.length >= maxLength) {
        continue;
      }
      
      // Get outgoing edges
      const outEdgeIds = this.outgoingEdges.get(currentId);
      if (!outEdgeIds) continue;
      
      // Explore each edge
      for (const edgeId of outEdgeIds) {
        if (!edgeId) continue;
        
        const edge = this.edges.get(edgeId);
        if (!edge || edge.confidence < minConfidence) continue;
        
        // Filter by relation type if specified
        if (relationTypes && relationTypes.length > 0) {
          const typeMatches = relationTypes.some(type => type === edge.type);
          if (!typeMatches) {
            continue;
          }
        }
        
        const targetNodeId = edge.targetId;
        
        // Skip if we've already visited this node in this path (avoid cycles)
        if (path.visited.has(targetNodeId)) {
          continue;
        }
        
        const targetNode = this.nodes.get(targetNodeId);
        if (!targetNode) continue;
        
        // Create new path with this edge
        const newPath = {
          nodes: [...path.nodes, targetNode],
          edges: [...path.edges, edge],
          visited: new Set([...path.visited, targetNodeId]),
          confidence: path.confidence * edge.confidence // Multiply confidences
        };
        
        // Add to queue for further exploration
        queue.push({
          currentId: targetNodeId,
          path: newPath
        });
      }
    }
    
    // Sort paths by confidence (highest first)
    paths.sort((a, b) => b.confidence - a.confidence);
    
    return paths;
  }

  /**
   * Import knowledge from facts
   * @param facts Array of facts to import
   * @param source Source of the facts
   * @returns Number of facts successfully imported
   */
  public importFacts(facts: Fact[], source: string = 'import'): number {
    if (!facts || !Array.isArray(facts)) {
      return 0;
    }
    
    let successCount = 0;
    
    for (const fact of facts) {
      try {
        if (!fact || !fact.subject || !fact.predicate || !fact.object) {
          console.warn('[KnowledgeGraph] Skipping invalid fact:', fact);
          continue;
        }
        
        // Create nodes for subject and object
        const subjectNode: KnowledgeNode = {
          id: `entity:${fact.subject.toLowerCase()}`,
          type: this.inferEntityType(fact.subject, fact.predicate, 'subject'),
          value: fact.subject,
          properties: {},
          confidence: fact.confidence,
          timestamp: Date.now(),
          source
        };
        
        const objectNode: KnowledgeNode = {
          id: `entity:${fact.object.toLowerCase()}`,
          type: this.inferEntityType(fact.object, fact.predicate, 'object'),
          value: fact.object,
          properties: {},
          confidence: fact.confidence,
          timestamp: Date.now(),
          source
        };
        
        // If fact is a property, add it to the subject node
        if (fact.predicate === 'hasProperty' || 
            fact.predicate === 'hasAttribute' || 
            fact.predicate === 'hasValue') {
          
          const existingNode = this.nodes.get(subjectNode.id);
          if (existingNode) {
            existingNode.properties[fact.object] = true;
            this.nodes.set(subjectNode.id, existingNode);
            successCount++;
            continue;
          }
          
          subjectNode.properties[fact.object] = true;
          this.addNode(subjectNode);
          successCount++;
          continue;
        }
        
        // Add nodes and edge
        this.addNode(subjectNode);
        this.addNode(objectNode);
        
        const edge: KnowledgeEdge = {
          id: `${subjectNode.id}|${fact.predicate}|${objectNode.id}`,
          sourceId: subjectNode.id,
          targetId: objectNode.id,
          type: fact.predicate,
          properties: fact.metadata ?? {},
          confidence: fact.confidence,
          timestamp: Date.now(),
          source
        };
        
        if (this.addEdge(edge)) {
          successCount++;
        }
      } catch (error) {
        console.error(`[KnowledgeGraph] Error importing fact: ${fact?.subject} ${fact?.predicate} ${fact?.object}`, error);
      }
    }
    
    return successCount;
  }

  /**
   * Export the entire knowledge graph
   * @returns Serializable representation of the graph
   */
  public exportGraph(): { nodes: KnowledgeNode[], edges: KnowledgeEdge[], stats: Record<string, any> } {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      stats: {
        nodeCount: this.nodeCount,
        edgeCount: this.edgeCount,
        lastModified: this.lastModified
      }
    };
  }

  /**
   * Import a previously exported graph
   * @param data Exported graph data
   * @returns True if successful
   */
  public importGraph(data: { nodes: KnowledgeNode[], edges: KnowledgeEdge[] }): boolean {
    try {
      if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
        console.error('[KnowledgeGraph] Invalid data for graph import');
        return false;
      }
      
      // Clear existing graph
      this.clear();
      
      // Import nodes
      for (const node of data.nodes) {
        if (node) {
          this.addNode(node);
        }
      }
      
      // Import edges
      for (const edge of data.edges) {
        if (edge) {
          this.addEdge(edge);
        }
      }
      
      console.log(`[KnowledgeGraph] Imported ${this.nodeCount} nodes and ${this.edgeCount} edges`);
      return true;
    } catch (error) {
      console.error('[KnowledgeGraph] Error importing graph:', error);
      return false;
    }
  }

  /**
   * Clear the knowledge graph
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.outgoingEdges.clear();
    this.incomingEdges.clear();
    this.edgesByType.clear();
    this.nodesByType.clear();
    this.nodesByValue.clear();
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.lastModified = Date.now();
    
    console.log('[KnowledgeGraph] Graph cleared');
  }

  /**
   * Get statistics about the knowledge graph
   */
  public getStats(): Record<string, any> {
    const nodeTypeStats: Record<string, number> = {};
    const edgeTypeStats: Record<string, number> = {};
    
    // Count nodes by type
    this.nodesByType.forEach((nodes, type) => {
      if (type) {
        nodeTypeStats[type] = nodes.size;
      }
    });
    
    // Count edges by type
    this.edgesByType.forEach((edges, type) => {
      if (type) {
        edgeTypeStats[type] = edges.size;
      }
    });
    
    return {
      nodeCount: this.nodeCount,
      edgeCount: this.edgeCount,
      nodeTypes: nodeTypeStats,
      edgeTypes: edgeTypeStats,
      lastModified: this.lastModified
    };
  }

  /**
   * Add a node to the type index
   */
  private addToTypeIndex(node: KnowledgeNode): void {
    if (!node || !node.type) return;
    
    const type = node.type;
    if (!this.nodesByType.has(type)) {
      this.nodesByType.set(type, new Set<string>());
    }
    
    const nodeSet = this.nodesByType.get(type);
    if (nodeSet) {
      nodeSet.add(node.id);
    }
  }

  /**
   * Add a node to the value index
   */
  private addToValueIndex(node: KnowledgeNode): void {
    if (!node || !node.value) return;
    
    const normalizedValue = node.value.toLowerCase();
    if (!this.nodesByValue.has(normalizedValue)) {
      this.nodesByValue.set(normalizedValue, new Set<string>());
    }
    
    const nodeSet = this.nodesByValue.get(normalizedValue);
    if (nodeSet) {
      nodeSet.add(node.id);
    }
  }

  /**
   * Add an edge to the indexes
   */
  private addToEdgeIndexes(edge: KnowledgeEdge): void {
    if (!edge) return;
    
    // Add to outgoing edges index
    if (!this.outgoingEdges.has(edge.sourceId)) {
      this.outgoingEdges.set(edge.sourceId, new Set<string>());
    }
    
    const outEdges = this.outgoingEdges.get(edge.sourceId);
    if (outEdges) {
      outEdges.add(edge.id);
    }
    
    // Add to incoming edges index
    if (!this.incomingEdges.has(edge.targetId)) {
      this.incomingEdges.set(edge.targetId, new Set<string>());
    }
    
    const inEdges = this.incomingEdges.get(edge.targetId);
    if (inEdges) {
      inEdges.add(edge.id);
    }
    
    // Add to edge type index
    if (!this.edgesByType.has(edge.type)) {
      this.edgesByType.set(edge.type, new Set<string>());
    }
    
    const typeEdges = this.edgesByType.get(edge.type);
    if (typeEdges) {
      typeEdges.add(edge.id);
    }
  }

  /**
   * Generate a node ID from an entity
   */
  private generateNodeIdFromEntity(entity: Entity): string {
    if (!entity || !entity.type || !entity.value) {
      throw new Error('Invalid entity for ID generation');
    }
    return `${entity.type}:${entity.value.toLowerCase()}`;
  }

  /**
   * Generate a node ID
   */
  private generateNodeId(node: KnowledgeNode): string {
    if (!node || !node.type || !node.value) {
      throw new Error('Invalid node for ID generation');
    }
    return `${node.type}:${node.value.toLowerCase()}`;
  }

  /**
   * Generate an edge ID
   */
  private generateEdgeId(edge: KnowledgeEdge): string {
    if (!edge || !edge.sourceId || !edge.type || !edge.targetId) {
      throw new Error('Invalid edge for ID generation');
    }
    return `${edge.sourceId}|${edge.type}|${edge.targetId}`;
  }

  /**
   * Convert paths to facts
   */
  private pathsToFacts(paths: KnowledgePath[]): Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    metadata?: Record<string, any>;
  }> {
    const facts: Array<{
      subject: string;
      predicate: string;
      object: string;
      confidence: number;
      metadata?: Record<string, any>;
    }> = [];
    
    if (!paths || !Array.isArray(paths)) {
      return facts;
    }
    
    for (const path of paths) {
      if (!path || !path.nodes || !path.edges || path.nodes.length < 2) continue;
      
      // For direct relationships (path length 1)
      if (path.edges.length === 1) {
        const edge = path.edges[0];
        const sourceNode = path.nodes[0];
        const targetNode = path.nodes[1];
        
        if (!edge || !sourceNode || !targetNode) continue;
        
        facts.push({
          subject: sourceNode.value,
          predicate: edge.type,
          object: targetNode.value,
          confidence: edge.confidence,
          metadata: {
            sourceType: sourceNode.type,
            targetType: targetNode.type,
            source: edge.source
          }
        });
      } 
      // For longer paths, create a fact that summarizes the relationship
      else if (path.edges.length > 1) {
        const sourceNode = path.nodes[0];
        const targetNode = path.nodes[path.nodes.length - 1];
        
        if (!sourceNode || !targetNode) continue;
        
        facts.push({
          subject: sourceNode.value,
          predicate: 'relatedTo',
          object: targetNode.value,
          confidence: path.confidence,
          metadata: {
            sourceType: sourceNode.type,
            targetType: targetNode.type,
            pathLength: path.edges.length,
            isInferred: true
          }
        });
        
        // Also add each step in the path as a separate fact
        for (let i = 0; i < path.edges.length; i++) {
          const edge = path.edges[i];
          const srcNode = path.nodes[i];
          const tgtNode = path.nodes[i + 1];
          
          if (!edge || !srcNode || !tgtNode) continue;
          
          facts.push({
            subject: srcNode.value,
            predicate: edge.type,
            object: tgtNode.value,
            confidence: edge.confidence,
            metadata: {
              sourceType: srcNode.type,
              targetType: tgtNode.type,
              pathStep: i + 1,
              pathLength: path.edges.length,
              source: edge.source
            }
          });
        }
      }
    }
    
    return facts;
  }

  /**
   * Calculate average confidence from paths
   */
  private calculateAverageConfidence(paths: KnowledgePath[]): number {
    if (!paths || !Array.isArray(paths) || paths.length === 0) return 0;
    
    let total = 0;
    let count = 0;
    
    for (const path of paths) {
      if (path) {
        total += path.confidence;
        count++;
      }
    }
    
    return count > 0 ? total / count : 0;
  }

  /**
   * Calculate average confidence from facts
   */
  private calculateAverageConfidenceFromFacts(facts: Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
    metadata?: Record<string, any>;
  }>): number {
    if (!facts || !Array.isArray(facts) || facts.length === 0) return 0;
    
    let total = 0;
    let count = 0;
    
    for (const fact of facts) {
      if (fact) {
        total += fact.confidence;
        count++;
      }
    }
    
    return count > 0 ? total / count : 0;
  }

  /**
   * Generate a human-readable explanation of a path
   */
  private generatePathExplanation(path: KnowledgePath): string {
    if (!path || !path.nodes || !path.edges || path.nodes.length < 2) {
      return "No relationship found.";
    }
    
    const sourceNode = path.nodes[0];
    const targetNode = path.nodes[path.nodes.length - 1];
    
    if (!sourceNode || !targetNode) {
      return "Invalid path nodes.";
    }
    
    // Direct relationship
    if (path.edges.length === 1) {
      const edge = path.edges[0];
      if (!edge) return "Invalid path edge.";
      
      return `${sourceNode.value} ${this.humanizeRelationType(edge.type)} ${targetNode.value}.`;
    }
    
    // Multi-step path
    if (path.edges.length > 1) {
      let explanation = `${sourceNode.value} is related to ${targetNode.value} through ${path.edges.length} connections: `;
      
      for (let i = 0; i < path.edges.length; i++) {
        const edge = path.edges[i];
        const source = path.nodes[i];
        const target = path.nodes[i + 1];
        
        if (!edge || !source || !target) continue;
        
        explanation += `${source.value} ${this.humanizeRelationType(edge.type)} ${target.value}`;
        
        if (i < path.edges.length - 1) {
          explanation += ", and ";
        }
      }
      
      explanation += ".";
      return explanation;
    }
    
    return "No clear relationship found.";
  }

  /**
   * Convert a path to an array of string representations
   */
  private pathToStringArray(path: KnowledgePath): string[] {
    if (!path || !path.nodes || !path.edges) return [];
    
    const result: string[] = [];
    
    for (let i = 0; i < path.edges.length; i++) {
      const edge = path.edges[i];
      const sourceNode = path.nodes[i];
      const targetNode = path.nodes[i + 1];
      
      if (!edge || !sourceNode || !targetNode) continue;
      
      result.push(`${sourceNode.value} ${edge.type} ${targetNode.value}`);
    }
    
    return result;
  }

  /**
   * Convert a relation type to a human-readable form
   */
  private humanizeRelationType(relationType: string): string {
    if (!relationType) return '';
    
    const mapping: Record<string, string> = {
      'isA': 'is a',
      'hasPart': 'has a part called',
      'isPart': 'is part of',
      'contains': 'contains',
      'belongsTo': 'belongs to',
      'relatedTo': 'is related to',
      'causes': 'causes',
      'locatedIn': 'is located in',
      'before': 'happens before',
      'after': 'happens after',
      'usedFor': 'is used for',
      'requires': 'requires',
      'hasProperty': 'has property',
      'hasAttribute': 'has attribute',
      'hasFunction': 'has function',
      'compatibleWith': 'is compatible with',
      'similarTo': 'is similar to',
      'sameAs': 'is the same as',
      'differFrom': 'differs from'
    };
    
    return mapping[relationType] || relationType.replace(/([A-Z])/g, ' $1').toLowerCase();
  }

  /**
   * Analyze a query to determine its intent
   */
  private analyzeQuery(query: string): QueryIntent {
    if (!query) {
      return { intent: 'general', confidence: 0.5 };
    }
    
    const queryLower = query.toLowerCase();
    
    // Check for relationship queries
    if (queryLower.includes(" related to ") || 
        queryLower.includes(" connection between ") ||
        queryLower.includes(" relationship ") ||
        queryLower.includes(" connected to ") ||
        queryLower.includes(" linked to ")) {
      return { intent: 'relationship', confidence: 0.9 };
    }
    
    // Check for property queries
    if (queryLower.includes(" property ") ||
        queryLower.includes(" attribute ") ||
        queryLower.includes(" feature ") ||
        queryLower.includes(" characteristic ") ||
        queryLower.includes(" what is ") ||
        queryLower.includes(" what are ")) {
      return { intent: 'property', confidence: 0.8 };
    }
    
    // Default to entity information
    return { intent: 'entity', confidence: 0.7 };
  }

  /**
   * Analyze a question to determine its type
   */
  private analyzeQuestionType(question: string): string {
    if (!question) return 'general';
    
    const lowerQuestion = question.toLowerCase().trim();
    
    // Check for different question types
    if (lowerQuestion.includes(" related to ") || 
        lowerQuestion.includes(" connection between ") ||
        lowerQuestion.includes(" relationship ") ||
        (lowerQuestion.includes(" how does ") && lowerQuestion.includes(" relate to "))) {
      return 'relation';
    }
    
    if (lowerQuestion.startsWith("what is ") || 
        lowerQuestion.startsWith("what are ") ||
        lowerQuestion.startsWith("what does ") ||
        lowerQuestion.includes(" mean")) {
      return 'definition';
    }
    
    if (lowerQuestion.startsWith("how does ") || 
        lowerQuestion.startsWith("how do ") ||
        lowerQuestion.startsWith("how can ") ||
        lowerQuestion.startsWith("how to ")) {
      return 'instruction';
    }
    
    if (lowerQuestion.startsWith("why ") || 
        lowerQuestion.includes(" reason ") ||
        lowerQuestion.includes(" because ")) {
      return 'explanation';
    }
    
    if (lowerQuestion.startsWith("where ") ||
        lowerQuestion.includes(" location ") ||
        lowerQuestion.includes(" located ")) {
      return 'location';
    }
    
    if (lowerQuestion.startsWith("when ") ||
        lowerQuestion.includes(" time ") ||
        lowerQuestion.includes(" date ")) {
      return 'temporal';
    }
    
    if (lowerQuestion.startsWith("who ") ||
        lowerQuestion.includes(" person ") ||
        lowerQuestion.includes(" people ")) {
      return 'person';
    }
    
    if (lowerQuestion.startsWith("is ") || 
        lowerQuestion.startsWith("are ") ||
        lowerQuestion.startsWith("can ") ||
        lowerQuestion.startsWith("does ") ||
        lowerQuestion.startsWith("do ")) {
      return 'yesno';
    }
    
    if (lowerQuestion.includes(" vs ") ||
        lowerQuestion.includes(" versus ") ||
        lowerQuestion.includes(" compared to ") ||
        lowerQuestion.includes(" difference between ")) {
      return 'comparison';
    }
    
    // Default to factual for any other question type
    return 'factual';
  }

  /**
   * Map question type to query intent
   */
  private mapQuestionTypeToQueryIntent(questionType: string): string {
    if (!questionType) return 'general';
    
    const mapping: Record<string, string> = {
      'relation': 'relationship',
      'definition': 'property',
      'instruction': 'property',
      'explanation': 'relationship',
      'location': 'property',
      'temporal': 'property',
      'person': 'entity',
      'yesno': 'entity',
      'comparison': 'relationship',
      'factual': 'entity'
    };
    
    return mapping[questionType] || 'general';
  }

  /**
   * Generate an answer from query results
   */
  private generateAnswer(
    question: string,
    result: GraphQueryResult,
    questionType: string,
    entities: Entity[]
  ): string {
    if (!result || !result.facts || result.facts.length === 0) {
      return "I don't have enough information to answer that question.";
    }
    
    // Sort facts by confidence
    const sortedFacts = [...result.facts].sort((a, b) => b.confidence - a.confidence);
    if (sortedFacts.length === 0) {
      return "I don't have relevant facts to answer that question.";
    }
    
    const mostRelevantFact = sortedFacts[0];
    if (!mostRelevantFact) {
      return "I couldn't find relevant information to answer your question.";
    }
    
    // Handle different question types
    switch (questionType) {
      case 'definition':
        for (const fact of sortedFacts) {
          if (!fact) continue;
          
          if (fact.predicate === 'isA' || fact.predicate === 'hasType') {
            return `${fact.subject} is a ${fact.object}.`;
          }
          if (fact.predicate === 'hasDefinition' || fact.predicate === 'means') {
            return `${fact.subject} means ${fact.object}.`;
          }
        }
        return `${mostRelevantFact.subject} ${this.humanizeRelationType(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
      
      case 'relation':
        if (result.paths && result.paths.length > 0) {
          const firstPath = result.paths[0];
          if (firstPath) {
            return this.generatePathExplanation(firstPath);
          }
        }
        
        if (entities.length >= 2) {
          const entity1 = entities[0];
          const entity2 = entities[1];
          
          if (entity1 && entity2) {
            // Check if there's a direct relation
            for (const fact of sortedFacts) {
              if (!fact) continue;
              
              if ((fact.subject === entity1.value && fact.object === entity2.value) ||
                  (fact.subject === entity2.value && fact.object === entity1.value)) {
                return `${fact.subject} ${this.humanizeRelationType(fact.predicate)} ${fact.object}.`;
              }
            }
          }
        }
        
        return `Based on my knowledge, ${mostRelevantFact.subject} ${this.humanizeRelationType(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
      
      case 'yesno':
        // For yes/no questions, check confidence
        if (result.confidence > 0.7) {
          return `Yes, ${mostRelevantFact.subject} ${this.humanizeRelationType(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
        } else if (result.confidence > 0.3) {
          return `It's possible that ${mostRelevantFact.subject} ${this.humanizeRelationType(mostRelevantFact.predicate)} ${mostRelevantFact.object}, but I'm not entirely certain.`;
        } else {
          return "I don't have enough information to answer that question with confidence.";
        }
      
      case 'comparison':
        if (entities.length >= 2) {
          const entity1 = entities[0];
          const entity2 = entities[1];
          
          if (entity1 && entity2) {
            // Try to find direct comparison facts
            const comparisons: string[] = [];
            for (const fact of sortedFacts) {
              if (!fact) continue;
              
              if ((fact.subject === entity1.value && fact.object === entity2.value) ||
                  (fact.subject === entity2.value && fact.object === entity1.value)) {
                comparisons.push(`${fact.subject} ${this.humanizeRelationType(fact.predicate)} ${fact.object}`);
              }
            }
            
            if (comparisons.length > 0) {
              return `The difference is that ${comparisons.join(" and ")}.`;
            }
          }
        }
        
        return `Based on my knowledge, ${mostRelevantFact.subject} ${this.humanizeRelationType(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
      
      default:
        // For other types, use the most relevant fact
        return `${mostRelevantFact.subject} ${this.humanizeRelationType(mostRelevantFact.predicate)} ${mostRelevantFact.object}.`;
    }
  }

  /**
   * Extract entities from text using simple pattern matching
   * Note: This is a basic implementation. In a real system, use a proper NER model.
   */
  private extractEntitiesFromText(text: string): Entity[] {
    if (!text) return [];
    
    const entities: Entity[] = [];
    const words = text.split(/\s+/);
    
    // Look for entity candidates (capitalized words)
    let currentEntity = '';
    let currentType = '';
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;
      
      const cleanWord = word.replace(/[.,!?;:"\[\](){}]/g, '');
      
      // Skip empty or short words
      if (!cleanWord || cleanWord.length <= 1) continue;
      
      // Check if word starts with capital letter (potential entity)
      if (/^[A-Z]/.test(cleanWord)) {
        // Check if this might be part of a multi-word entity
        if (currentEntity) {
          currentEntity += ' ' + cleanWord;
        } else {
          currentEntity = cleanWord;
          
          // Try to determine entity type based on context
          if (i > 0) {
            const prevWord = words[i - 1]?.toLowerCase();
            if (prevWord && ['in', 'at', 'from', 'to'].includes(prevWord)) {
              currentType = 'location';
            } else if (prevWord && ['by', 'from', 'with'].includes(prevWord)) {
              currentType = 'person';
            } else if (prevWord && ['the', 'a', 'an'].includes(prevWord) && i > 1) {
              const prevPrevWord = words[i - 2]?.toLowerCase();
              if (prevPrevWord === 'company' || prevPrevWord === 'organization') {
                currentType = 'organization';
              } else if (prevPrevWord === 'product') {
                currentType = 'product';
              }
            }
          }
          
          if (!currentType) {
            // Look for known entity types in our graph
            const normalizedValue = cleanWord.toLowerCase();
            if (this.nodesByValue.has(normalizedValue)) {
              const nodeIds = this.nodesByValue.get(normalizedValue);
              if (nodeIds && nodeIds.size > 0) {
                const nodeId = Array.from(nodeIds)[0];
                if (nodeId) {
                  const node = this.nodes.get(nodeId);
                  if (node) {
                    currentType = node.type;
                  }
                }
              }
            }
            
            // Default entity type if we still don't have one
            if (!currentType) {
              currentType = 'entity';
            }
          }
        }
      } else if (currentEntity) {
        // End of entity
        entities.push({
          type: currentType,
          value: currentEntity,
          confidence: 0.7
        });
        
        currentEntity = '';
        currentType = '';
      }
    }
    
    // Add final entity if any
    if (currentEntity) {
      entities.push({
        type: currentType,
        value: currentEntity,
        confidence: 0.7
      });
    }
    
    return entities;
  }

  /**
   * Infer entity type based on predicate and role
   */
  private inferEntityType(
    value: string,
    predicate: string,
    role: 'subject' | 'object'
  ): string {
    if (!value || !predicate || !role) return 'entity';
    
    // Check if we already know this entity
    const normalizedValue = value.toLowerCase();
    if (this.nodesByValue.has(normalizedValue)) {
      const nodeIds = this.nodesByValue.get(normalizedValue);
      if (nodeIds && nodeIds.size > 0) {
        const nodeId = Array.from(nodeIds)[0];
        if (nodeId) {
          const node = this.nodes.get(nodeId);
          if (node) {
            return node.type;
          }
        }
      }
    }
    
    // Infer type based on relationship type and role
    switch (predicate) {
      case 'isA':
        return role === 'subject' ? 'entity' : 'category';
      
      case 'hasPart':
        return role === 'subject' ? 'product' : 'component';
      
      case 'isPart':
        return role === 'subject' ? 'component' : 'product';
      
      case 'belongsTo':
        return role === 'subject' ? 'entity' : 'category';
      
      case 'contains':
        return role === 'subject' ? 'container' : 'content';
      
      case 'locatedIn':
        return role === 'subject' ? 'entity' : 'location';
      
      case 'causes':
        return role === 'subject' ? 'cause' : 'effect';
      
      default:
        return 'entity';
    }
  }
}

// Export default instance
export default KnowledgeGraph.getInstance();