'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// TS1484 fix: Use type-only imports for types
// TS2304 fix: Assume Language is also in chatbot.types and import it
import type { Message, ChatbotContextType, Language } from '@/types/chatbot.types'; // Assuming Language, Message, ChatbotContextType are defined here
import { v4 as uuidv4 } from 'uuid';
// TS2304 fix: Import config
import { config } from '@/features/nlp-engine/config'; // Adjust path if necessary


// Interface for internal state management (assuming Language and Message are imported)
interface ChatbotState {
  isChatOpen: boolean;
  messages: Message[]; // Message type is now imported
  language: Language; // Language type is now imported
  botName: string;
}

// Default values (assuming Language is imported)
const DEFAULT_LANGUAGE: Language = 'de';
const DEFAULT_BOT_NAME = 'Assistent';

// Minimal fallback responses (only used if API is unavailable)
// Assuming Language enum/type is used correctly here
const FALLBACK_RESPONSES: Record<Language, { welcome: string; error: string }> = {
  de: {
    welcome: "Willkommen! Wie kann ich dir helfen?",
    error: "Entschuldigung, es gab ein technisches Problem. Bitte versuche es später noch einmal."
  },
  en: {
    welcome: "Welcome! How can I help you?",
    error: "Sorry, there was a technical issue. Please try again later."
  }
};

// Provider component
interface ChatbotProviderProps {
  children: React.ReactNode;
  initialLanguage?: Language; // Assuming Language is imported
  initialBotName?: string;
}

// Korrektur: Typisieren des initialen Kontextwerts korrekt
// Korrektur: Füge dummy-Implementierungen hinzu, um den Typ ChatbotContextType zu erfüllen
export const ChatbotContext = createContext<ChatbotContextType>({
  messages: [],
  isChatOpen: false,
  isProcessing: false,
  // Dummy Funktionen für den Initialwert
  addMessage: (message: Message) => { console.warn('addMessage called on default context'); },
  toggleChat: () => { console.warn('toggleChat called on default context'); },
  setProcessingStatus: (status: boolean) => { console.warn('setProcessingStatus called on default context', status); },
  sendMessage: async (content: string) => { console.warn('sendMessage called on default context', content); },
});


// Custom hook for easy access
export const useChatbot = () => useContext(ChatbotContext);

const ChatbotProvider = ({
  children,
  initialLanguage = DEFAULT_LANGUAGE,
  initialBotName = DEFAULT_BOT_NAME,
}: ChatbotProviderProps) => {
  // Main state
  const [chatbotState, setChatbotState] = useState<ChatbotState>({
    isChatOpen: false,
    messages: [],
    language: initialLanguage,
    botName: initialBotName,
  });

  // Helper state
  const [isProcessing, setIsProcessing] = useState(false);

  // Memoize addMessage as it's used in sendMessage dependencies
  const addMessage = useCallback((message: Message) => {
    // Basic validation for message structure if needed
    if (!message || !message.id || !message.text || !message.timestamp || !message.sender) {
        console.warn('[Provider] Attempted to add invalid message:', message);
        return;
    }
    setChatbotState((prev) => ({
      ...prev,
      // Prevent adding duplicate messages if using UUIDs and there's a risk of rapid calls
      messages: [...prev.messages.filter(msg => msg.id !== message.id), message]
    }));
     console.log(`[Provider] Added message ${message.id} from ${message.sender}.`);
  }, []); // No dependencies needed for this memoized function

  // Load welcome message
  useEffect(() => {
    // TS2532 fix: Access FALLBACK_RESPONSES safely
    const welcomeMessageText = FALLBACK_RESPONSES[chatbotState.language]?.welcome ?? FALLBACK_RESPONSES[DEFAULT_LANGUAGE].welcome;

    const welcomeMessage: Message = {
      id: 'welcome',
      text: welcomeMessageText,
      timestamp: new Date(),
      sender: 'bot',
      // TS2353 fix: Add metadata property. REQUIRES updating Message interface in types/chatbot.types.ts
      metadata: { isWelcome: true }
    };

    // Only set welcome message if there are no messages yet and the message list is truly empty
    setChatbotState((prev) => {
        if (prev.messages.length === 0) {
             console.log('[Provider] Adding welcome message.');
            return {
                ...prev,
                messages: [welcomeMessage]
            };
        }
        // If there are already messages (e.g., from loadState), don't add welcome again
        return prev;
    });
  }, [chatbotState.language]); // Re-run if language changes


  // Open/close chat
  const toggleChat = useCallback(() => {
    setChatbotState((prev) => ({
      ...prev,
      isChatOpen: !prev.isChatOpen
    }));
    console.log('[Provider] Toggling chat:', !chatbotState.isChatOpen);
  }, [chatbotState.isChatOpen]); // Add isChatOpen as dependency to log the correct state

  // Set processing status
  const setProcessingStatus = useCallback((status: boolean) => {
    setIsProcessing(status);
  }, []); // No dependencies needed as it only uses the status parameter


  // Send a message and get a response via API
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    console.log(`[Provider] User sending message: "${content}"`);

    // Add user message
    const userMessageId = uuidv4();
    const userMessage: Message = {
      id: userMessageId,
      text: content.trim(), // Trim whitespace
      timestamp: new Date(),
      sender: 'user',
       // TS2353 fix: Add metadata property. REQUIRES updating Message interface in types/chatbot.types.ts
       metadata: { originalText: content.trim() }
    };

    // Add user message to state immediately
    addMessage(userMessage); // Use the memoized addMessage


    // Show loading indicator
    setIsProcessing(true);

    try {
      // Open chat if closed
      // This uses chatbotState, so chatbotState needs to be a dependency IF you don't memoize this effect
      // But useCallback memoizes the *function* itself, not the state it closes over.
      // For simplicity and correctness with useState, access state directly within the effect or use functional updates
      // Since this is an async function within useCallback, accessing chatbotState directly is fine.
      if (!chatbotState.isChatOpen) {
        // Functional update is safer if toggleChat could be called concurrently
        setChatbotState(prev => ({ ...prev, isChatOpen: true }));
         console.log('[Provider] Opening chat.');
      }

      // Call the API to get a response
      console.log('[Provider] Calling /api/chatbot/response API...');
      const apiResponse = await fetch('/api/chatbot/response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.text, // Use the message text we just added
          language: chatbotState.language, // Use current language from state
          // Add conversation history for context if needed by the API route
          // History should likely exclude the current message being sent to avoid echo
          // Map messages to a simpler format for history
          conversationHistory: chatbotState.messages.map(msg => `${msg.sender}: ${msg.text}`), // Example: include sender/text
          currentMessageId: userMessageId // Pass the ID of the current user message
        }),
      });

      if (!apiResponse.ok) {
        console.error(`[Provider] API request failed with status ${apiResponse.status}`);
        // Try to read error body if available
         const errorBody = await apiResponse.text().catch(() => "No error message available");
         console.error('[Provider] API Error Response Body:', errorBody);
        throw new Error(`API request failed with status ${apiResponse.status}: ${apiResponse.statusText}`);
      }

      // Explicitly type the expected API response structure based on FollowUpGeneratorResponse and potential other fields
      interface ChatbotApiResponse {
          response: string;
          followUpQuestions?: string[]; // Using type from FollowUpGeneratorResponse
          suggestedActions?: string[]; // Using type from FollowUpGeneratorResponse
          relatedTopics?: string[]; // Using type from FollowUpGeneratorResponse
          confidence?: number; // Using type from FollowUpGeneratorResponse
          nlpProcessingResult?: any; // Using any, replace with actual type if needed elsewhere
          context?: any; // Using any, replace with actual type if needed elsewhere
          // Include any other expected fields from your API response
      }

      const data: ChatbotApiResponse = await apiResponse.json();

      const botResponseText = data.response ?? FALLBACK_RESPONSES[chatbotState.language]?.error ?? FALLBACK_RESPONSES[DEFAULT_LANGUAGE].error; // TS2532 fix: Safe access + fallback

      console.log('[Provider] API response received:', data);

      // Artificial delay for more natural typing behavior
      // TS2304 fix: Use config after importing it. Use optional chaining ?.
      const minDelay = config?.nlp?.responseDelay?.min ?? 500;
      const charsPerMs = config?.nlp?.responseDelay?.maxPerChar ?? 10;
      const maxDelay = config?.nlp?.responseDelay?.max ?? 3000;
      const delay = Math.min(minDelay + botResponseText.length * charsPerMs, maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));

      // Add bot response
      const botMessageId = uuidv4(); // Generate ID for bot message
      const botMessage: Message = {
        id: botMessageId, // Unique ID for bot message
        text: botResponseText,
        timestamp: new Date(),
        sender: 'bot',
        // TS2353 fix: Store data in metadata. REQUIRES updating Message interface in types/chatbot.types.ts
        metadata: {
            followUp: data.followUpQuestions, // Use followUpQuestions from API response
            suggestedActions: data.suggestedActions,
            relatedTopics: data.relatedTopics,
            confidence: data.confidence,
            nlpProcessingResult: data.nlpProcessingResult, // Store full NLP result if needed elsewhere
            context: data.context // Store updated context if needed elsewhere
        }
      };

      addMessage(botMessage); // Use the memoized addMessage

    } catch (error: any) { // Catch error with explicit type any for easier handling
      console.error('[Provider] Fatal error processing message:', error);

      // TS2532 fix: Access FALLBACK_RESPONSES safely for error message
      const errorMessageText = FALLBACK_RESPONSES[chatbotState.language]?.error ?? FALLBACK_RESPONSES[DEFAULT_LANGUAGE].error;

      // Add error message
      const errorMessage: Message = {
        id: uuidv4(), // Unique ID for error message
        text: errorMessageText,
        timestamp: new Date(),
        sender: 'bot',
        isError: true, // Mark as error message
        // TS2353 fix: Add metadata property. REQUIRES updating Message interface in types/chatbot.types.ts
        metadata: {
            errorMessage: error.message || 'An unknown error occurred.', // Store error details
             errorStack: process.env.NODE_ENV !== 'production' ? error.stack : undefined // Avoid exposing stack in production
        }
      };

      addMessage(errorMessage); // Use the memoized addMessage

    } finally {
      // Remove loading indicator
      setIsProcessing(false);
       console.log('[Provider] Processing finished.');
    }
  }, [addMessage, chatbotState.language, chatbotState.messages, chatbotState.isChatOpen]); // Dependencies for useCallback
  // Note: chatbotState.messages is included as a dependency because sendMessage accesses it directly for conversationHistory.
  // If conversationHistory were managed differently or not sent to the API, this dependency could potentially be removed.


  // Context value
  const contextValue: ChatbotContextType = {
    messages: chatbotState.messages, // Pass state directly
    isChatOpen: chatbotState.isChatOpen, // Pass state directly
    isProcessing, // Pass processing state
    addMessage, // Pass memoized function
    toggleChat, // Pass memoized function
    setProcessingStatus, // Pass memoized function
    sendMessage, // Pass memoized function
    // Add other context values from state or config if needed
    // language: chatbotState.language, // Example: expose language
    // botName: chatbotState.botName // Example: expose bot name
  };


  return (
    <ChatbotContext.Provider value={contextValue}>
      {children}
    </ChatbotContext.Provider>
  );
};

export default ChatbotProvider;