/**
 * features/firebase/firestoreService.ts
 * 
 * This module provides server-side Firestore operations for the Mindfluence Chatbot.
 * It handles storage and retrieval of chatbot-specific data such as conversation history
 * and user feedback using the Firebase Admin SDK.
 */

import * as admin from 'firebase-admin';
import { initializeFirebaseAdmin } from './authProvider';

// Collection names as constants for easy reference and modification
const CONVERSATIONS_COLLECTION = 'conversations';
const FEEDBACK_COLLECTION = 'feedback';
const SETTINGS_COLLECTION = 'chatbot_settings';

// Type definitions for the data structures
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: admin.firestore.Timestamp | Date;
  messageId?: string; // Optional unique identifier for specific messages
}

export interface ConversationData {
  userId?: string | null;
  messages: ChatMessage[];
  updatedAt: admin.firestore.Timestamp | Date;
  metadata?: Record<string, any>; // Optional additional data about the conversation
}

export interface FeedbackData {
  conversationId: string;
  messageId: string; // ID of the message the feedback refers to
  rating: number;    // e.g. 1-5 scale
  comment?: string;  // Optional user comment
  userId?: string;   // Optional user identifier
  timestamp: admin.firestore.Timestamp | Date;
}

export interface ChatbotSetting {
  name: string;
  value: any;
  updatedAt: admin.firestore.Timestamp | Date;
}

/**
 * Ensures Firebase Admin is initialized before performing any Firestore operations
 * 
 * @returns Firestore instance
 */
function getFirestore(): admin.firestore.Firestore {
  initializeFirebaseAdmin(); // Ensure Firebase Admin is initialized
  return admin.firestore();
}

/**
 * Converts JavaScript Date objects to Firestore Timestamps within an object
 * 
 * @param obj - The object containing Date fields to convert
 * @returns A new object with Date fields converted to Firestore Timestamps
 */
function convertDatesToTimestamps<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  
  Object.entries(result).forEach(([key, value]) => {
    if (value instanceof Date) {
      (result as any)[key] = admin.firestore.Timestamp.fromDate(value);
    } else if (typeof value === 'object' && value !== null) {
      (result as any)[key] = convertDatesToTimestamps(value);
    }
  });
  
  return result;
}

/**
 * Converts Firestore Timestamps to JavaScript Date objects within an object
 * 
 * @param obj - The object containing Timestamp fields to convert
 * @returns A new object with Timestamp fields converted to Date objects
 */
function convertTimestampsToDates<T extends Record<string, any>>(obj: T): T {
  const result = { ...obj };
  
  Object.entries(result).forEach(([key, value]) => {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
      (result as any)[key] = value.toDate();
    } else if (typeof value === 'object' && value !== null) {
      (result as any)[key] = convertTimestampsToDates(value);
    }
  });
  
  return result;
}

/**
 * Saves or updates a conversation history in Firestore
 * 
 * @param conversationId - Unique identifier for the conversation
 * @param messages - Array of chat messages to save
 * @param userId - Optional user identifier associated with the conversation
 * @param metadata - Optional additional data about the conversation
 * @returns Promise that resolves when the save operation is complete
 */
export async function saveConversation(
  conversationId: string,
  messages: ChatMessage[],
  userId?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
  
  // Convert Date objects to Firestore Timestamps
  const messagesToStore = messages.map(msg => ({
    ...msg,
    timestamp: msg.timestamp instanceof Date 
      ? admin.firestore.Timestamp.fromDate(msg.timestamp) 
      : msg.timestamp
  }));
  
  // Prepare the data to store
  const conversationData: ConversationData = {
    userId: userId || null,
    messages: messagesToStore,
    updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
    ...(metadata ? { metadata: convertDatesToTimestamps(metadata) } : {})
  };
  
  try {
    await docRef.set(conversationData, { merge: true });
    console.log(`Conversation ${conversationId} saved successfully.`);
  } catch (error) {
    console.error(`Error saving conversation ${conversationId}:`, error);
    throw new Error(`Failed to save conversation history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads a conversation history from Firestore
 * 
 * @param conversationId - Unique identifier for the conversation to load
 * @returns Promise that resolves to the conversation messages or null if not found
 */
export async function loadConversation(conversationId: string): Promise<ChatMessage[] | null> {
  const db = getFirestore();
  const docRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
  
  try {
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data() as ConversationData | undefined;
      
      if (!data || !Array.isArray(data.messages)) {
        console.warn(`Conversation ${conversationId} exists but has invalid data structure.`);
        return null;
      }
      
      // Convert Firestore Timestamps back to Date objects
      const messages = data.messages.map(msg => ({
        ...msg,
        timestamp: (msg.timestamp as any)?.toDate?.() || new Date()
      }));
      
      return messages;
    } else {
      console.log(`Conversation ${conversationId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`Error loading conversation ${conversationId}:`, error);
    throw new Error(`Failed to load conversation history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads complete conversation data including metadata from Firestore
 * 
 * @param conversationId - Unique identifier for the conversation to load
 * @returns Promise that resolves to the complete conversation data or null if not found
 */
export async function loadCompleteConversation(conversationId: string): Promise<ConversationData | null> {
  const db = getFirestore();
  const docRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
  
  try {
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data() as ConversationData | undefined;
      
      if (!data) {
        console.warn(`Conversation ${conversationId} exists but has invalid data.`);
        return null;
      }
      
      // Convert all Firestore Timestamps to Date objects
      return convertTimestampsToDates(data);
    } else {
      console.log(`Conversation ${conversationId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`Error loading complete conversation ${conversationId}:`, error);
    throw new Error(`Failed to load complete conversation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Saves user feedback about a specific message or conversation
 * 
 * @param feedbackData - The feedback data to save
 * @returns Promise that resolves to the ID of the newly created feedback document
 */
export async function saveFeedback(
  feedbackData: Omit<FeedbackData, 'timestamp'> & { timestamp?: Date }
): Promise<string> {
  const db = getFirestore();
  const feedbackCollectionRef = db.collection(FEEDBACK_COLLECTION);
  
  // Prepare the data to store
  const dataToStore = {
    ...feedbackData,
    userId: feedbackData.userId || null,
    timestamp: feedbackData.timestamp 
      ? admin.firestore.Timestamp.fromDate(feedbackData.timestamp) 
      : admin.firestore.FieldValue.serverTimestamp()
  };
  
  try {
    const docRef = await feedbackCollectionRef.add(dataToStore);
    console.log(`Feedback saved with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error('Error saving feedback:', error);
    throw new Error(`Failed to save feedback: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads feedback for a specific conversation
 * 
 * @param conversationId - The conversation ID to get feedback for
 * @returns Promise that resolves to an array of feedback items
 */
export async function loadFeedbackForConversation(conversationId: string): Promise<FeedbackData[]> {
  const db = getFirestore();
  
  try {
    const querySnapshot = await db.collection(FEEDBACK_COLLECTION)
      .where('conversationId', '==', conversationId)
      .get();
    
    if (querySnapshot.empty) {
      return [];
    }
    
    const feedbackItems: FeedbackData[] = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data() as FeedbackData;
      // Convert Firestore Timestamps to Date objects
      feedbackItems.push(convertTimestampsToDates(data));
    });
    
    return feedbackItems;
  } catch (error) {
    console.error(`Error loading feedback for conversation ${conversationId}:`, error);
    throw new Error(`Failed to load feedback: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Saves a chatbot setting in Firestore
 * 
 * @param name - The setting name/key
 * @param value - The setting value
 * @returns Promise that resolves when the setting is saved
 */
export async function saveChatbotSetting(name: string, value: any): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(SETTINGS_COLLECTION).doc(name);
  
  const setting: ChatbotSetting = {
    name,
    value: typeof value === 'object' ? convertDatesToTimestamps(value) : value,
    updatedAt: admin.firestore.FieldValue.serverTimestamp() as any
  };
  
  try {
    await docRef.set(setting);
    console.log(`Chatbot setting '${name}' saved successfully.`);
  } catch (error) {
    console.error(`Error saving chatbot setting '${name}':`, error);
    throw new Error(`Failed to save chatbot setting: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Loads a chatbot setting from Firestore
 * 
 * @param name - The setting name/key to load
 * @returns Promise that resolves to the setting value or null if not found
 */
export async function getChatbotSetting<T = any>(name: string): Promise<T | null> {
  const db = getFirestore();
  const docRef = db.collection(SETTINGS_COLLECTION).doc(name);
  
  try {
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data() as ChatbotSetting;
      // Convert any Firestore Timestamps to Date objects if the value is an object
      const value = typeof data.value === 'object' && data.value !== null 
        ? convertTimestampsToDates(data.value) 
        : data.value;
      
      return value as T;
    } else {
      console.log(`Chatbot setting '${name}' not found.`);
      return null;
    }
  } catch (error) {
    console.error(`Error loading chatbot setting '${name}':`, error);
    throw new Error(`Failed to load chatbot setting: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Deletes a conversation from Firestore
 * 
 * @param conversationId - The ID of the conversation to delete
 * @returns Promise that resolves when the deletion is complete
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(CONVERSATIONS_COLLECTION).doc(conversationId);
  
  try {
    await docRef.delete();
    console.log(`Conversation ${conversationId} deleted successfully.`);
  } catch (error) {
    console.error(`Error deleting conversation ${conversationId}:`, error);
    throw new Error(`Failed to delete conversation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Lists conversations for a specific user
 * 
 * @param userId - The user ID to get conversations for
 * @param limit - Maximum number of conversations to retrieve
 * @returns Promise that resolves to an array of conversation data
 */
export async function listUserConversations(
  userId: string, 
  limit: number = 10
): Promise<Array<ConversationData & { id: string }>> {
  const db = getFirestore();
  
  try {
    const querySnapshot = await db.collection(CONVERSATIONS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    
    if (querySnapshot.empty) {
      return [];
    }
    
    const conversations: Array<ConversationData & { id: string }> = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data() as ConversationData;
      // Convert Firestore Timestamps to Date objects
      conversations.push({
        ...convertTimestampsToDates(data),
        id: doc.id
      });
    });
    
    return conversations;
  } catch (error) {
    console.error(`Error listing conversations for user ${userId}:`, error);
    throw new Error(`Failed to list user conversations: ${error instanceof Error ? error.message : String(error)}`);
  }
}