'use client';

import React, { useState, useEffect } from 'react';
import { useChatbot } from '@/features/chatbot/provider/ChatbotProvider';
import { IoChatbubbleEllipsesOutline, IoClose } from "react-icons/io5";
import { motion, AnimatePresence } from 'framer-motion';

export default function ChatToggle() {
  // Improved error handling for context
  const chatbotContext = useChatbot();
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  // Safely access context properties with error handling
  const isChatOpen = chatbotContext?.isChatOpen || false;
  
  // Wrapped toggle function with debugging and error handling
  const handleToggle = () => {
    try {
      console.log('[ChatToggle] Toggle clicked. Current state:', isChatOpen);
      if (chatbotContext && typeof chatbotContext.toggleChat === 'function') {
        chatbotContext.toggleChat();
        console.log('[ChatToggle] Toggle function called. New state should be:', !isChatOpen);
      } else {
        console.error('[ChatToggle] toggleChat function not available in context:', chatbotContext);
        setHasError(true);
      }
    } catch (error) {
      console.error('[ChatToggle] Error toggling chat:', error);
      setHasError(true);
    }
  };
  
  // Check context on mount
  useEffect(() => {
    if (chatbotContext && typeof chatbotContext.toggleChat === 'function') {
      setIsLoaded(true);
      console.log('[ChatToggle] ChatbotContext loaded successfully');
    } else {
      console.error('[ChatToggle] ChatbotContext not properly loaded:', chatbotContext);
      setHasError(true);
    }
  }, [chatbotContext]);

  // Dynamic ARIA label text
  const ariaLabel = isChatOpen ? "Chat schließen" : "Chat öffnen";
  
  // If there's an error, show a disabled button
  if (hasError) {
    return (
      <button 
        disabled
        className="fixed bottom-4 right-4 sm:right-6 md:right-8 z-50 p-3 rounded-full bg-gray-400 text-white shadow-lg opacity-70 cursor-not-allowed"
        aria-label="Chat nicht verfügbar"
      >
        <IoChatbubbleEllipsesOutline className="w-6 h-6" />
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.button
        onClick={handleToggle}
        className="fixed bottom-4 right-4 sm:right-6 md:right-8 z-50 p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors duration-200"
        aria-label={ariaLabel}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: isLoaded ? 1 : 0.7, 
          scale: isLoaded ? 1 : 0.9,
          rotate: isLoaded ? 0 : 10
        }}
        transition={{ 
          type: "spring", 
          stiffness: 400, 
          damping: 17 
        }}
      >
        {isChatOpen ? (
          <motion.div
            initial={{ rotate: -180, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 180, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <IoClose className="w-6 h-6" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <IoChatbubbleEllipsesOutline className="w-6 h-6" />
          </motion.div>
        )}
      </motion.button>
    </AnimatePresence>
  );
}