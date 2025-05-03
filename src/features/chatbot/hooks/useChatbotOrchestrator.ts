'use client';

import { useContext, useState, useEffect, useCallback } from 'react';
import { ChatbotContext } from '../provider/ChatbotProvider';
// FIX 1484: Add 'type' keyword for type import
import { type Message } from '@/types/chatbot.types';

// Note: Local Language type is defined here. If '@/types/nlp.types'
// is consistently used as the source of truth for Language throughout the project,
// this local definition might be redundant and could be removed or commented out
// to avoid potential confusion, although it doesn't cause a TS error here.
type Language = 'de' | 'en';

/**
 * Hook für die Orchestrierung des Chatbots, verantwortlich für die Initialisierung
 * der NLP-Engine und die Delegation der Nachrichtenverarbeitung an den ChatbotProvider.
 */
export function useChatbotOrchestrator() {
  const context = useContext(ChatbotContext);
  const [isEngineReady, setIsEngineReady] = useState(false);

  // --- Robustheitscheck für den Kontext ---
  // This check is correct and ensures context is not null before destructuring
  if (!context) {
    throw new Error("useChatbotOrchestrator muss innerhalb eines ChatbotProvider verwendet werden.");
  }

  // Destructure sendMessage after checking context is not null
  const { sendMessage } = context;

  // --- Initialisierung der NLP-Engine (vereinfacht) ---
  useEffect(() => {
    let isActive = true;

    const initializeEngine = async () => {
      try {
        // Hier würde eine Initialisierungslogik stattfinden, falls nötig
        // Zum Beispiel: Modell-Caching vorbereiten oder erste Sprachdateien laden
        // (Dieser Teil ist ein Platzhalter und benötigt keine Fixes basierend auf den Fehlern)

        // Kurze Verzögerung, um sicherzustellen, dass alles bereit ist
        await new Promise(resolve => setTimeout(resolve, 100));

        if (isActive) {
          console.log("NLP Engine initialisiert.");
          setIsEngineReady(true);
        }
      } catch (error) {
        console.error("Fehler beim Initialisieren der NLP Engine:", error);
        if (isActive) {
          setIsEngineReady(false);
        }
      }
    };

    initializeEngine();

    // Cleanup function for the effect
    return () => {
      isActive = false;
    };
  }, []); // Empty dependency array means this effect runs only once on mount

  /**
   * Überarbeitete Funktion zur Verarbeitung der Benutzereingabe.
   * Prüft zunächst, ob die Engine bereit ist, und leitet dann
   * die Nachricht an die sendMessage-Funktion des Providers weiter.
   */
  const handleUserMessageSubmit = useCallback(async (userText: string) => {
    // Check if engine is ready
    if (!isEngineReady) {
      console.warn("NLP Engine ist noch nicht bereit.");
      return;
    }

    // Check if userText is empty or just whitespace - Handles null/undefined implicitly
    if (!userText || userText.trim() === '') {
      return; // Do not process empty messages
    }

    // Use the sendMessage function from the Context
    // Since context is guaranteed not null by the check above,
    // and sendMessage is destructured, we assume sendMessage exists
    // on the Context type. No optional chaining needed here unless
    // the ChatbotContext type allows sendMessage to be optional.
    await sendMessage(userText.trim());

  }, [isEngineReady, sendMessage]); // Dependencies are correctly listed

  // The hook returns the function that can be called by the UI,
  // and optionally the engine status
  return {
    handleUserMessageSubmit,
    isEngineReady,
    // Direct export of sendMessage for convenience
    sendUserMessage: sendMessage // Exposing the function from context
  };
}