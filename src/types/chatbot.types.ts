/**
 * Types related to the chatbot UI and functionality.
 * This file provides the main interfaces and types for the chatbot system.
 */

/**
 * Supported languages for the chatbot.
 * Used throughout the application for localization and NLP processing.
 */
export type Language = 'de' | 'en';

/**
 * Represents a single message within the chat interface.
 */
export interface Message {
  /** A unique identifier for the message (e.g., timestamp-based string). Essential for React keys. */
  id: string;
  /** The textual content of the message. */
  text: string;
  /** Indicates whether the message originated from the user, the bot, or a system notification. */
  sender: 'user' | 'bot' | 'system';
  /** The date and time when the message was created or received. */
  timestamp: Date;
  /** Optional flag to indicate if this message represents an error from the bot. */
  isError?: boolean;
  /** Optional additional data related to the message. */
  metadata?: Record<string, any>; // <-- Diese Zeile hinzugefügt, um den TS2353 Fehler zu beheben
  // Potential future additions:
  // relatedIntent?: string; // The intent that led to this bot response
  // confidenceScore?: number; // Confidence of the bot's response/understanding
}

/**
 * Defines the shape of the value provided by the ChatbotContext.
 * This includes the chat state and functions to modify it.
 */
export interface ChatbotContextType {
  /** The array containing all messages currently displayed in the chat. */
  messages: Message[];
  /** Boolean flag indicating whether the main chat interface is visible. */
  isChatOpen: boolean;
  /** Boolean flag indicating if the bot is currently processing a request (e.g., waiting for NLP). */
  isProcessing: boolean;
  /** Function to add a new message (from user or bot) to the messages array. */
  addMessage: (message: Message) => void;
  /** Function to toggle the visibility state of the chat interface. */
  toggleChat: () => void;
  /** Function to explicitly set the processing status of the bot. */
  setProcessingStatus: (status: boolean) => void;
  /** Function to send a user message and generate a bot response. */
  sendMessage: (content: string) => Promise<void>;
  // Add other potential states or actions here if needed in the future
  // (e.g., clearMessages: () => void;)
  // (e.g., engineStatus: 'idle' | 'loading' | 'ready' | 'error';)
}

/**
 * Optional: Type for the configuration or initialization status of the NLP engine,
 * could be part of the context if needed globally.
 */
export type NlpEngineStatus = 'initializing' | 'ready' | 'error' | 'idle';

/**
 * Position options for the chat widget in the UI
 */
export type ChatPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

/**
 * Theme options for the application
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Ticket-bezogene Typen für die Support-Funktionalität
 */
export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: Date;
  status: 'open' | 'in-progress' | 'closed';
  agentId?: string;
  agentName?: string;
  responses?: Array<{
    message: string;
    sender: 'agent' | 'system'; // Assuming agent or system can respond
    timestamp: Date;
    // Optional: metadata for ticket responses too?
    // metadata?: Record<string, any>;
  }>;
  // Optional: Link back to conversation if applicable
  conversationId?: string;
  // Optional: Category or topic for the ticket
  category?: string;
  // Optional: Priority level
  priority?: 'low' | 'medium' | 'high';
}

export interface TicketCreationParams {
  userId: string;
  userName: string;
  message: string;
   // Optional: Include conversation history or relevant context in the ticket params
   conversationHistory?: string[];
   context?: Record<string, any>;
}

// Export relevant types explicitly if not using default export for all
// export type { Language, Message, ChatbotContextType, NlpEngineStatus, ChatPosition, ThemeMode, Ticket, TicketCreationParams };