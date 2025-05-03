'use client';

import React, { useState, useContext, useRef, useEffect } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatbotContext } from '@/features/chatbot/provider/ChatbotProvider';
import { IoSend } from "react-icons/io5";

// Erweiterung der Komponente um customSendMessage und onSend
interface ChatInputProps {
  onSend?: () => void; // Callback, der ausgelöst wird, wenn eine Nachricht gesendet wird
  customSendMessage?: (content: string) => void; // Custom Funktion zum Senden von Nachrichten
}

export default function ChatInput({ 
  onSend, 
  customSendMessage
}: ChatInputProps = {}) {
  const [inputValue, setInputValue] = useState<string>('');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [botStatusText, setBotStatusText] = useState<string>("Überlege..."); 
  const context = useContext(ChatbotContext);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Use mutable object pattern to avoid read-only errors
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Bei Initialisierung Fokus auf das Eingabefeld setzen
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Automatische Höhenanpassung des Textareas
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 150); // Max-Höhe: 150px
      textarea.style.height = `${newHeight}px`;
    }
  }, [inputValue]);

  // --- Robustheitscheck für den Kontext ---
  if (!context) {
    console.error("ChatInput: ChatbotContext wurde nicht gefunden. Stelle sicher, dass ChatbotProvider korrekt im Layout eingebunden ist.");
    // Optional: Zeige eine deaktivierte Input-Variante oder null
    return (
      <div className="flex items-center p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <motion.textarea
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0.8 }}
          placeholder="Chat nicht verfügbar..."
          className="flex-grow p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none dark:bg-gray-700 dark:text-gray-400"
          rows={1}
          disabled={true}
          aria-label="Chat nicht verfügbar"
        />
        <motion.button
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          disabled={true}
          className="ml-2 p-2.5 rounded-full text-white bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
          aria-label="Senden nicht verfügbar"
        >
          <IoSend className="w-5 h-5" />
        </motion.button>
      </div>
    );
  }
  // --- Ende Kontext-Check ---

  // Hole sendMessage statt addMessage, um die Bot-Antwort auszulösen
  const { sendMessage, isProcessing } = context;

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(event.target.value);
  };

  // Safely initialize audio element only once
  useEffect(() => {
    try {
      // Only create audio element if it doesn't exist yet
      if (!audioRef.current) {
        const audio = new Audio();
        audio.volume = 0.3;
        audio.src = '/sounds/message-pop.mp3';
        audioRef.current = audio;
      }
      
      // Clean up function
      return () => {
        // Safely cleanup audio
        if (audioRef.current) {
          const audio = audioRef.current;
          audio.pause();
          audio.src = '';
          audioRef.current = null;
        }
      };
    } catch (error) {
      console.log("Audio initialization failed:", error);
      // FIXED: Add return statement in catch block to fix TypeScript error
      return () => {
        // No-op cleanup function for error case
      };
    }
  }, []);

  // Safe function to play sound
  const playSound = () => {
    try {
      if (audioRef.current) {
        // Create a promise to handle the sound playing
        const playPromise = audioRef.current.play();
        
        // Modern browsers return a promise from play()
        if (playPromise !== undefined) {
          playPromise.then(() => {
            // Playback started successfully
          }).catch(err => {
            // Auto-play was prevented or there was another error
            console.log("Sound playback failed:", err);
          });
        }
      }
    } catch (error) {
      // Ignore sound errors
      console.log("Sound error caught:", error);
    }
  };

  const handleSendMessage = () => {
    const trimmedInput = inputValue.trim();
    if (trimmedInput && !isProcessing) {
      // Setze lokalen Bot-Status
      setBotStatusText("Verarbeite deine Anfrage...");

      // Verwende die custom Funktion, wenn vorhanden, sonst die Standard-Funktion
      if (customSendMessage) {
        customSendMessage(trimmedInput);
      } else {
        // Nutze sendMessage, um sowohl die Benutzernachricht zu senden als auch die Bot-Antwort auszulösen
        sendMessage(trimmedInput);
      }
      
      setInputValue(''); // Eingabefeld leeren
      
      // Try to play sound safely
      playSound();
      
      // Wenn ein onSend-Callback übergeben wurde, diesen aufrufen
      if (onSend) {
        onSend();
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Standard-Formularabsendung verhindern
    handleSendMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Senden bei "Enter", aber nicht bei "Shift + Enter" (für Zeilenumbruch)
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // Verhindert Zeilenumbruch im Textarea
      handleSendMessage();
    }
  };

  // Update Status-Text basierend auf der Verarbeitungszeit
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (isProcessing) {
      // Statusmeldungen
      const phrases: string[] = [
        "Überlege...",
        "Verarbeite deine Anfrage...",
        "Suche nach relevanten Informationen...",
        "Erstelle eine Antwort für dich...",
        "Analysiere die Daten...",
        "Prüfe verschiedene Optionen..."
      ];
      
      // Wähle einen zufälligen Status mit Fallback
      const randomIndex = Math.floor(Math.random() * phrases.length);
      
      // Die problematische Zeile - jetzt korrigiert mit Fallback
      setBotStatusText(phrases[randomIndex] || "Überlege...");
      
      // Status nach einer Weile aktualisieren
      timer = setTimeout(() => {
        setBotStatusText("Formuliere eine hilfreiche Antwort...");
      }, 3000);
    }
    
    // Cleanup-Funktion
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isProcessing]);

  const canSubmit = inputValue.trim().length > 0 && !isProcessing;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 backdrop-blur-sm"
    >
      {/* Optional: Typing-Indikator, wenn Bot antwortet */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50"
          >
            <div className="typing-indicator mx-2 my-1">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              
              {/* Bot Status Text */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="bot-status ml-3"
              >
                {botStatusText}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={handleSubmit}
        className="flex items-start p-3 gap-2"
      >
        {/* Haupteingabefeld mit animiertem Fokus-Effekt */}
        <div className={`flex-grow relative transition-all duration-200 ${isFocused ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}>
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isProcessing ? "Bot antwortet..." : "Nachricht eingeben..."}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg resize-none focus:outline-none dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 disabled:opacity-60 transition-all duration-200"
            style={{ minHeight: '44px', maxHeight: '150px' }}
            disabled={isProcessing}
            aria-label="Chat Nachrichteneingabe"
          />
        </div>

        {/* Senden-Button mit Animationen */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="submit"
          disabled={!canSubmit}
          className={`p-2.5 self-end rounded-full text-white transition-all duration-200 focus:outline-none ${
            canSubmit
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md hover:shadow-lg'
              : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-70'
          }`}
          aria-label="Nachricht senden"
        >
          {/* Loading-Spinner oder Sende-Icon */}
          {isProcessing ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <IoSend className="w-5 h-5" />
          )}
        </motion.button>
      </form>

      {/* Hinweistext für Tastenkombination */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        className="text-xs text-center text-gray-500 dark:text-gray-400 pb-2"
      >
        Drücke Enter zum Senden, Shift+Enter für Zeilenumbruch
      </motion.div>
    </motion.div>
  );
}