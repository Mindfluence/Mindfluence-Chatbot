'use client'; // Required for hooks (useContext, useRef, useEffect)
import React, { useContext, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// KORREKTER Import: Der Context wird direkt exportiert
import { ChatbotContext } from '@/features/chatbot/provider/ChatbotProvider';
import type { Message } from '@/types/chatbot.types';

export interface ActionButton {
  label: string;
  href: string;
}

export default function ChatMessages() {
  // Verwende den direkt importierten Context
  const context = useContext(ChatbotContext);
  const messagesEndRef = useRef<HTMLDivElement>(null); // Ref for the bottom div
 
  // --- Robustheitscheck für den Kontext ---
  if (!context) {
    console.error("ChatMessages: ChatbotContext wurde nicht gefunden.");
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 p-4">
        Chat-Kontext nicht geladen.
      </div>
    );
  }
  // --- Ende Kontext-Check ---
 
  const { messages } = context;
 
  // Funktion zum automatischen Scrollen zum Ende
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
 
  // Effekt zum Scrollen, wenn Nachrichten sich ändern oder Komponente mountet
  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Abhängigkeit: Scrollt, wenn `messages` aktualisiert wird

  // Prüfe auf mögliche Weiterleitungen im Text
  const extractActions = (text: string): ActionButton[] => {
    // Einfache Erkennung von URLs wie "rechnungen" oder "einstellungen"
    const keywords = [
      { keyword: 'rechnung', label: 'Rechnungen anzeigen', href: '/rechnungen' },
      { keyword: 'einstellung', label: 'Zu Einstellungen', href: '/einstellungen' },
      { keyword: 'profil', label: 'Zum Profil', href: '/profil' },
      { keyword: 'dashboard', label: 'Zum Dashboard', href: '/dashboard' },
      { keyword: 'dokument', label: 'Dokumente ansehen', href: '/dokumente' },
    ];
    
    const actions: ActionButton[] = [];
    const lowerText = text.toLowerCase();
    
    keywords.forEach(item => {
      if (lowerText.includes(item.keyword)) {
        actions.push({ label: item.label, href: item.href });
      }
    });
    
    return actions;
  };
 
  // Animation Varianten
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  const messageVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      scale: 0.8 
    },
    visible: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 25,
        duration: 0.3 
      } 
    }
  };

  return (
    <motion.div 
      className="flex-grow p-4 space-y-4 overflow-y-auto"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence>
        {messages.length === 0 ? (
          <motion.div 
            key="empty-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center text-gray-500 dark:text-gray-400 pt-8"
          >
            Beginne eine Konversation!
          </motion.div>
        ) : (
          messages.map((message: Message) => {
            const isBot = message.sender !== 'user';
            // Actions nur für Bot-Nachrichten extrahieren
            const actions = isBot ? extractActions(message.text) : [];
            
            return (
              <motion.div
                key={message.id}
                className={`flex ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                layout
              >
                <motion.div
                  className={`px-4 py-3 rounded-lg max-w-xs sm:max-w-sm md:max-w-md break-words shadow-sm ${
                    message.sender === 'user'
                      ? 'chat-bubble-user' // User message style from globals.css
                      : 'chat-bubble-bot' // Bot message style from globals.css
                  }`}
                  whileHover={{ scale: 1.01 }}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                  
                  {/* Aktions-Buttons nur für Bot-Nachrichten anzeigen */}
                  {isBot && actions.length > 0 && (
                    <motion.div 
                      className="mt-3 flex flex-wrap gap-2"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      {actions.map((action, index) => (
                        <a 
                          href={action.href} 
                          key={index}
                          className="action-button"
                        >
                          {action.label}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              </motion.div>
            );
          })
        )}
      </AnimatePresence>
      
      {/* Leeres Div am Ende, zu dem gescrollt wird */}
      <div ref={messagesEndRef} />
    </motion.div>
  );
}