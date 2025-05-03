'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatbot } from '@/features/chatbot/provider/ChatbotProvider';
import { IoClose } from 'react-icons/io5';
import { FaHeadset } from 'react-icons/fa';
import { MdEmail } from 'react-icons/md';
import ChatInput from './ChatInput';
import ChatMessages from './ChatMessages';
import ticketService from '@/features/ticketing/ticketService';
import type { Message } from '@/types/chatbot.types';
import type { Language } from '@/types/nlp.types';

// Base64-encoded short "Pop" sound als Fallback
const FALLBACK_POP_SOUND = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAASAAAeMwAUFBQUFCIiIiIiIjAwMDAwMD09PT09PUVFRUVFRVJSUlJSUmBgYGBgYG1tbW1tbXt7e3t7e4qKioqKipKSkpKSkqCgoKCgoK+vr6+vr76+vr6+vsbGxsbGxtDQ0NDQ0NjY2NjY2ODg4ODg4Orq6urq6vLy8vLy8v39/f39/f///////////////0xhdmY1OC4xMi4xMDAAAAAAAAAAAAAAACQCgAAAAAAAAAR4nDDPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAwAAABVAB0dHR0dHSUlJSUlJTExMTExMUFBQUFBQVFRUVFRUWBgYGBgYHBwcHBwcIGBgYGBgZGRkZGRkaGhoaGhobGxsbGxscHBwcHBwdLS0tLS0uLi4uLi4vz8/Pz8/P7+/v7+/v///////////0xhdmM1OC4xMy4xMDAAAAAAAAAAAAAAABwmVADIAAAAAAAAAR+4AIxjR/AAAAAAAAAAAAAAAAAAAAAA//sUZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sUZB4P8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sUZDwP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sUZFoP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sUZHgP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sUZJYP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sUZLQP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

// Animationsvarianten
const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut"
    }
  },
  exit: { 
    opacity: 0, 
    y: 20,
    transition: {
      duration: 0.3
    }
  }
};

const supportOptionVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { 
    opacity: 1, 
    height: 'auto',
    transition: {
      duration: 0.3
    }
  },
  exit: { 
    opacity: 0, 
    height: 0,
    transition: {
      duration: 0.2
    }
  }
};

// Bekannte Ablehnungsphrasen
const rejectionPhrases = [
  'nein', 'danke nein', 'kein', 'keine', 'nicht', 'brauche nicht',
  'benötige nicht', 'benötige keine', 'brauche keine', 'danke aber nein',
  'keine hilfe', 'nicht nötig', 'nicht notwendig', 'nicht erforderlich',
  'will nicht', 'möchte nicht', 'danke aber ich brauche keine',
  'danke aber ich benötige keine', 'ich komme zurecht', 'ich komme klar',
  'ich schaffe das alleine', 'ich schaffe das selbst', 'ich brauche keine hilfe',
  'ich benötige keine hilfe', 'danke ich benötige keine hilfe'
];

// Inaktivitätszeit in Millisekunden (15 Minuten)
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

/**
 * Zentrale ChatInterface-Komponente
 * Implementiert einen autonomen Chatbot mit generativen KI-Antworten über API-Calls
 * ohne direkte SQLite-Abhängigkeiten im Browser
 */
export default function ChatInterface() {
  const { messages, isProcessing, toggleChat, addMessage, sendMessage } = useChatbot();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement>(null);
  const [showTicketOption, setShowTicketOption] = useState<boolean>(false);
  const [showSupportIcon, setShowSupportIcon] = useState<boolean>(false);
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [hasShownInactivityPrompt, setHasShownInactivityPrompt] = useState<boolean>(false);
  const [inactivityPromptDisabled, setInactivityPromptDisabled] = useState<boolean>(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoEmailTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [soundInitialized, setSoundInitialized] = useState<boolean>(false);
  const [hasUserInteracted, setHasUserInteracted] = useState<boolean>(false);
  const rejectionResponseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [supportMessageSent, setSupportMessageSent] = useState<boolean>(false);
  const lastSupportCheckRef = useRef<number>(0);
  
  // KI-spezifische States
  const [isAIProcessing, setIsAIProcessing] = useState<boolean>(false);
  const [aiInitialized, setAIInitialized] = useState<boolean>(false);
  const [language, setLanguage] = useState<Language>('de');
  const apiAbortControllerRef = useRef<AbortController | null>(null);
  
  // Zustandsverfolgung
  const prevMessagesCountRef = useRef<number>(0);
  const hasShownIntroMessageRef = useRef<boolean>(false);
  const messageRequestMapRef = useRef<Map<string, boolean>>(new Map());
  
  // Email-bezogene States
  const [emailAddress, setEmailAddress] = useState<string>('');
  const [emailError, setEmailError] = useState<string>('');
  const [showEmailOption, setShowEmailOption] = useState<boolean>(false);
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const [transcriptAutoSent, setTranscriptAutoSent] = useState<boolean>(false);
  const [showChatOptions, setShowChatOptions] = useState<boolean>(false);
  const [ticketCreated, setTicketCreated] = useState<boolean>(false);
  const [currentTicketId, setCurrentTicketId] = useState<string>('');
  const [userIpAddress, setUserIpAddress] = useState<string>('');

  // State für aktuelle Verarbeitungsnachricht
  const [currentProcessingMessage, setCurrentProcessingMessage] = useState<string>("");

  // Hilfsfunktionen
  const containsRejection = useCallback((text: string): boolean => {
    const lowercaseText = text.toLowerCase();
    return rejectionPhrases.some(phrase => lowercaseText.includes(phrase));
  }, []);

  const getUserInfo = useCallback(() => {
    return {
      id: 'temp-user-id',
      name: 'Anonymer Benutzer'
    };
  }, []);

  // Verarbeitet eine Benutzer-Eingabe und erstellt eine passende Antwort
  const playMessageSound = useCallback((): void => {
    try {
      // Primärsound verwenden, wenn initialisiert
      if (soundInitialized && audioRef.current) {
        audioRef.current.currentTime = 0;
        
        // Promise-Muster für Fehlerbehandlung
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.log("[Chat] Primärer Sound fehlgeschlagen, versuche Fallback:", error.message);
            
            // Bei Fehler auf Fallback ausweichen
            if (fallbackAudioRef.current) {
              fallbackAudioRef.current.currentTime = 0;
              fallbackAudioRef.current.play().catch((fallbackError) => {
                console.log("[Chat] Fallback-Sound fehlgeschlagen:", fallbackError.message);
              });
            }
          });
        }
      } 
      // Fallback direkt verwenden, wenn kein Sound initialisiert
      else if (fallbackAudioRef.current) {
        fallbackAudioRef.current.currentTime = 0;
        
        const fallbackPlayPromise = fallbackAudioRef.current.play();
        
        if (fallbackPlayPromise !== undefined) {
          fallbackPlayPromise.catch((error) => {
            console.log("[Chat] Fallback-Sound fehlgeschlagen:", error.message);
          });
        }
      }
    } catch (error) {
      // Fehler sicher behandeln - explizite Typprüfung und Konvertierung
      const errorMessage: string = error instanceof Error ? error.message : String(error || "Unbekannter Fehler");
      console.log("[Chat] Sound-Wiedergabefehler:", errorMessage);
    }
  }, [soundInitialized]);

  const containsSupportRequest = useCallback((text: string): boolean => {
    const lowercaseText = text.toLowerCase();
    const supportPhrases = [
      'mitarbeiter', 'support', 'mensch', 'person', 'agent', 'berater',
      'echter mensch', 'echte person', 'hilfe von einem menschen',
      'mit jemandem sprechen', 'mit jemand sprechen', 'mit einem menschen',
      'verbinden', 'ticket erstellen', 'problem melden'
    ];
    
    return supportPhrases.some(phrase => lowercaseText.includes(phrase));
  }, []);

  const calculateSimilarity = useCallback((text1: string, text2: string): number => {
    // Einfache Implementierung: Prüft, ob der längere Text den kürzeren enthält
    const shorter = text1.length < text2.length ? text1 : text2;
    const longer = text1.length < text2.length ? text2 : text1;
    
    if (longer.includes(shorter) && shorter.length > 10) {
      return 0.9;
    }
    
    // Gemeinsame Wörter zählen
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    let commonWords = 0;
    
    words1.forEach(word => {
      if (words2.includes(word) && word.length > 3) {
        commonWords++;
      }
    });
    
    return commonWords / Math.max(words1.length, words2.length);
  }, []);

  // Gesprächsverlauf für den Kontext abrufen
  const getConversationHistory = useCallback((): string[] => {
    return messages.map(msg => msg.text);
  }, [messages]);

  // Verarbeite die Nachricht mit der NLP-Engine über API anstatt direkt
  const processMessageWithAPI = useCallback(async (message: string): Promise<string> => {
    // Brich laufende API-Anfragen ab, um Doppelantworten zu vermeiden
    if (apiAbortControllerRef.current) {
      apiAbortControllerRef.current.abort();
    }
    
    // Neuen AbortController erstellen
    apiAbortControllerRef.current = new AbortController();
    const { signal } = apiAbortControllerRef.current;
    
    // Eindeutige Request-ID generieren
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    setIsAIProcessing(true);
    
    // Im Dev-Modus: Wir simulieren GPT-2-Antworten, wenn kein API-Endpunkt existiert
    try {
      // Die letzten 3 Nachrichten für Kontext verwenden
      const conversationHistory = getConversationHistory().slice(-3);
      
      console.log(`[Chat] Sende API-Anfrage mit ID ${requestId} für "${message.substring(0, 30)}${message.length > 30 ? '...' : ''}"`);
      
      // Versuche zuerst regulären API-Aufruf mit Abbruchmöglichkeit
      try {
        const response = await fetch('/api/chatbot/response', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Request-ID': requestId
          },
          body: JSON.stringify({
            message,
            language,
            conversationHistory
          }),
          signal
        });
        
        if (response.ok) {
          const data = await response.json();
          setIsAIProcessing(false);
          
          if (data && data.response) {
            // Explizite String-Typumwandlung durch Konkatenation mit leerem String
            const responseText: string = "" + (data.response ?? "Ich konnte keine passende Antwort finden.");
            console.log(`[Chat] API-Antwort für ${requestId} erhalten: "${responseText.substring(0, 30)}${responseText.length > 30 ? '...' : ''}"`);
            return responseText;
          }
        }
        
        // Wenn wir hier sind, war die API nicht erfolgreich - fallen wir auf GPT-2 Simulation zurück
        throw new Error("API nicht verfügbar, verwende GPT-2 Simulation");
      } catch (apiError) {
        console.log("[Chat] API-Fehler, verwende GPT-2 Simulation");
        
        // Verzögerung simulieren für natürlicheres Gefühl
        await new Promise(resolve => setTimeout(resolve, 800 + message.length * 10));
        
        // Simuliere GPT-2-artige Antworten basierend auf der Benutzereingabe
        // Typensichere Zuweisung mit expliziter Initialisierung
        let simulatedResponse: string = "";
        
        // Einfache regelbasierte Antwortgenerierung für häufige Anfragen
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('hallo') || lowerMessage.includes('hi') || lowerMessage.includes('guten tag')) {
          simulatedResponse = "Hallo! Wie kann ich Ihnen heute behilflich sein?";
        } 
        else if (lowerMessage.includes('danke') || lowerMessage.includes('dank')) {
          simulatedResponse = "Gerne! Ich helfe Ihnen jederzeit weiter.";
        }
        else if (lowerMessage.includes('wer bist du') || lowerMessage.includes('was bist du')) {
          simulatedResponse = "Ich bin der Mindfluence-Assistent, ein KI-Chatbot, der Ihnen bei Fragen zur Mindfluence-App und Persönlichkeitsentwicklung hilft.";
        }
        else if (lowerMessage.includes('wie') && (lowerMessage.includes('funktioniert') || lowerMessage.includes('geht'))) {
          simulatedResponse = "Die Funktionsweise ist relativ einfach. Könnten Sie mir mitteilen, welchen spezifischen Aspekt Sie verstehen möchten?";
        }
        else if (lowerMessage.includes('problem') || lowerMessage.includes('fehler') || lowerMessage.includes('hilfe')) {
          simulatedResponse = "Es tut mir leid, dass Sie Probleme haben. Können Sie das genauer beschreiben, damit ich Ihnen besser helfen kann?";
        }
        else {
          // Generische Antworten für andere Anfragen
          const genericResponses: string[] = [
            `Ich verstehe Ihre Frage zu "${message.substring(0, 20)}${message.length > 20 ? '...' : ''}". Lassen Sie mich darüber nachdenken.`,
            "Das ist eine interessante Frage. Aus meiner Sicht gibt es mehrere relevante Aspekte zu beachten.",
            "Vielen Dank für Ihre Anfrage. Ich stehe Ihnen gerne zur Verfügung und helfe Ihnen weiter.",
            "Ihre Frage ist wichtig. Ich möchte Ihnen eine möglichst hilfreiche Antwort geben.",
            "Ich verstehe Ihr Anliegen und bin hier, um Ihnen zu helfen. Lassen Sie mich die Informationen für Sie zusammenstellen."
          ];
          
          // Explizite Typensicherung durch Auswahl mit Index-Check
          const responseIndex = Math.min(
            Math.floor(Math.random() * genericResponses.length), 
            genericResponses.length - 1
          );
          // Nullish Coalescing stellt sicher, dass selbst bei leerem Array ein String zurückkommt
          simulatedResponse = genericResponses[responseIndex] ?? "Ich helfe Ihnen gerne weiter.";
        }
        
        setIsAIProcessing(false);
        return simulatedResponse;
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('[Chat] API-Anfrage abgebrochen:', requestId);
      } else {
        console.error("[Chat] Fehler bei API-Aufruf:", error);
      }
      
      setIsAIProcessing(false);
      
      // Fallback-Antwort
      return "Ich bin hier, um Ihnen zu helfen. Wie kann ich Ihnen weiterhelfen?";
    }
  }, [language, getConversationHistory]);

  // Auto-Email-Timer zurücksetzen
  const resetAutoEmailTimer = useCallback(() => {
    if (autoEmailTimeoutRef.current) {
      clearTimeout(autoEmailTimeoutRef.current);
      autoEmailTimeoutRef.current = null;
    }
    
    if (!transcriptAutoSent && messages.length > 0) {
      autoEmailTimeoutRef.current = setTimeout(() => {
        console.log("[Chat] Inaktivitäts-Timeout erreicht - sende Transkript automatisch");
        
        // An Mindfluence senden
        sendChatTranscript('info@mindfluence.ch', currentTicketId || `auto-${Date.now()}`);
        
        // Wenn Benutzer-E-Mail vorhanden und gültig
        if (emailAddress && validateEmail(emailAddress)) {
          sendChatTranscript(emailAddress, currentTicketId || `auto-${Date.now()}`);
        }
        
        setTranscriptAutoSent(true);
      }, INACTIVITY_TIMEOUT);
    }
  }, [messages.length, transcriptAutoSent, currentTicketId, emailAddress]);

  // Benutzerinteraktion aufzeichnen
  const handleUserInteraction = useCallback(() => {
    setHasUserInteracted(true);
    setInactivityPromptDisabled(true);
    setLastActivity(Date.now());
    setTranscriptAutoSent(false);
    resetAutoEmailTimer();
  }, [resetAutoEmailTimer]);

  // E-Mail-Validierung
  const validateEmail = (email: string): boolean => {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email);
  };

  // Inaktivitäts-Timer zurücksetzen
  const resetInactivityTimer = useCallback(() => {
    setLastActivity(Date.now());
    
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    
    if (!inactivityPromptDisabled && !hasUserInteracted) {
      inactivityTimeoutRef.current = setTimeout(() => {
        if (Date.now() - lastActivity >= 3 * 60 * 1000 && !hasShownInactivityPrompt) {
          addMessage({
            id: `inactivity-${Date.now()}`,
            text: "Brauchen Sie Hilfe? Wenn Sie möchten, kann ich Sie gerne beraten.",
            sender: 'bot',
            timestamp: new Date()
          });
          
          setHasShownInactivityPrompt(true);
          setInactivityPromptDisabled(true);
        }
      }, 3 * 60 * 1000); // 3 Minuten
    }
    
    resetAutoEmailTimer();
  }, [lastActivity, hasShownInactivityPrompt, inactivityPromptDisabled, hasUserInteracted, addMessage, resetAutoEmailTimer]);

  // Chat-Transkript per E-Mail senden
  const sendChatTranscript = useCallback(async (emailAddress: string, ticketId: string) => {
    try {
      // Gespräch als Text formatieren
      const transcript = messages
        .map(msg => `${msg.sender === 'user' ? 'Sie' : 'Bot'}: ${msg.text}`)
        .join('\n\n');
      
      const userInfo = getUserInfo();
      
      // E-Mail-Daten vorbereiten
      const emailData = {
        to: emailAddress,
        cc: 'info@mindfluence.ch',
        subject: `Chat Transcript - ${ticketId ? `Ticket ${ticketId}` : 'Ohne Ticket'}`,
        body: transcript,
        ticketId: ticketId || `no-ticket-${Date.now()}`,
        userInfo: {
          ...userInfo,
          ip: userIpAddress
        }
      };
      
      // E-Mail-API verwenden, falls vorhanden
      try {
        const response = await fetch('/api/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emailData),
        });
        
        return response.ok;
      } catch (apiError) {
        console.error("[Chat] E-Mail API Fehler:", apiError);
        // Mock-Rückgabe für Demonstrations- und Testzwecke
        console.log('[Chat] Mock E-Mail-Versand mit Daten:', emailData);
        return true;
      }
    } catch (error) {
      console.error("[Chat] Fehler beim Senden des Chat-Transkripts:", error);
      return false;
    }
  }, [messages, getUserInfo, userIpAddress]);

  // E-Mail-Versand mit Validierung
  const handleSendEmail = useCallback(() => {
    if (!emailAddress) {
      setEmailError('Bitte geben Sie eine E-Mail-Adresse ein');
      return;
    }
    
    if (!validateEmail(emailAddress)) {
      setEmailError('Bitte geben Sie eine gültige E-Mail-Adresse ein');
      return;
    }
    
    setEmailError('');
    
    const emailTicketId = currentTicketId || `chat-${Date.now()}`;
    
    sendChatTranscript(emailAddress, emailTicketId)
      .then(success => {
        if (success) {
          setEmailSent(true);
          
          addMessage({
            id: `email-confirm-${Date.now()}`,
            text: `Eine E-Mail mit dem Chatverlauf ${currentTicketId ? `und der Ticket-Nummer ${currentTicketId}` : ''} wurde an ${emailAddress} gesendet.`,
            sender: 'bot',
            timestamp: new Date()
          });
          
          setShowEmailOption(false);
          setShowChatOptions(true);
        } else {
          setEmailError('E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.');
        }
      });
  }, [emailAddress, currentTicketId, addMessage, sendChatTranscript]);

  // Chat-Zustand vollständig zurücksetzen
  const resetChatState = useCallback(() => {
    // UI-States zurücksetzen
    setShowTicketOption(false);
    setShowSupportIcon(false);
    setHasShownInactivityPrompt(false);
    setInactivityPromptDisabled(false);
    setSupportMessageSent(false);
    setEmailAddress('');
    setEmailError('');
    setShowEmailOption(false);
    setEmailSent(false);
    setShowChatOptions(false);
    setTicketCreated(false);
    setCurrentTicketId('');
    setTranscriptAutoSent(false);
    
    // Referenzen zurücksetzen
    prevMessagesCountRef.current = 0;
    hasShownIntroMessageRef.current = false;
    lastSupportCheckRef.current = 0;
    messageRequestMapRef.current.clear();
    
    // Timeouts löschen
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
      inactivityTimeoutRef.current = null;
    }
    if (autoEmailTimeoutRef.current) {
      clearTimeout(autoEmailTimeoutRef.current);
      autoEmailTimeoutRef.current = null;
    }
    if (rejectionResponseTimeoutRef.current) {
      clearTimeout(rejectionResponseTimeoutRef.current);
      rejectionResponseTimeoutRef.current = null;
    }
    
    // Aktivitätsverfolgung zurücksetzen
    setLastActivity(Date.now());
    setHasUserInteracted(false);
    
    // Alle Nachrichten löschen und neuen Chat starten
    addMessage({
      id: `system-reset-${Date.now()}`,
      text: "__RESET_CHAT__", // Spezieller Marker für den Renderer
      sender: 'system',
      timestamp: new Date(),
      metadata: { isReset: true }
    });
    
    // Willkommensnachricht nach kurzer Verzögerung anzeigen
    setTimeout(() => {
      addMessage({
        id: `welcome-${Date.now()}`,
        text: "Wie kann ich Ihnen in diesem neuen Chat helfen?",
        sender: 'bot',
        timestamp: new Date()
      });
    }, 100);
  }, [addMessage]);

  // Neuen Chat starten
  const handleStartNewChat = useCallback(() => {
    if (messages.length > 0) {
      // Finales Transkript vor dem Zurücksetzen senden
      sendChatTranscript('info@mindfluence.ch', currentTicketId || `chat-${Date.now()}`);
      
      if (emailAddress && validateEmail(emailAddress)) {
        sendChatTranscript(emailAddress, currentTicketId || `chat-${Date.now()}`);
      }
    }
    
    resetChatState();
  }, [messages, currentTicketId, emailAddress, sendChatTranscript, resetChatState]);

  // Lokales Mock-Ticket erstellen, wenn API nicht verfügbar
  const createMockTicket = useCallback((userId: string, userName: string, message: string) => {
    return {
      id: `local-${Date.now()}`,
      userId,
      userName,
      message,
      createdAt: new Date(),
      status: 'open',
      responses: []
    };
  }, []);

  // Support-Ticket erstellen
  const createSupportTicket = useCallback(async () => {
    const user = getUserInfo();
    
    try {
      const lastUserMessage = [...messages].reverse().find(msg => msg.sender === 'user');
      const ticketMessage = lastUserMessage?.text || "Anfrage nach Unterstützung durch einem Mitarbeiter";
      
      let ticket;
      let usedMockTicket = false;
      
      try {
        ticket = await ticketService.createTicket({
          userId: user.id,
          userName: user.name,
          message: ticketMessage
        });
      } catch (serviceError) {
        console.warn("[Chat] Ticket konnte nicht über API erstellt werden, verwende lokales Mock-Ticket:", serviceError);
        ticket = createMockTicket(user.id, user.name, ticketMessage);
        usedMockTicket = true;
      }
      
      setCurrentTicketId(ticket.id);
      setTicketCreated(true);
      
      let confirmationMessage;
      
      if (usedMockTicket) {
        confirmationMessage = `Vielen Dank für Ihre Anfrage! Ihre Ticket-ID lautet: ${ticket.id}. Ein Mitarbeiter wird sich in Kürze mit Ihnen in Verbindung setzen. (Hinweis: Sie befinden sich im Demo-Modus)`;
      } else {
        confirmationMessage = ticketService.generateTicketConfirmation(ticket.id);
      }
      
      addMessage({
        id: `ticket-${Date.now()}`,
        text: confirmationMessage,
        sender: 'bot',
        timestamp: new Date()
      });
      
      // Transkript automatisch an Mindfluence senden
      sendChatTranscript('info@mindfluence.ch', ticket.id)
        .then(success => {
          console.log('[Chat] Auto-Versand des Transkripts an Mindfluence Status:', success ? 'erfolgreich' : 'fehlgeschlagen');
        });
      
      setShowTicketOption(false);
      setShowEmailOption(true);
      setShowSupportIcon(false);
      
    } catch (error) {
      console.error("[Chat] Fehler beim Erstellen des Tickets:", error);
      addMessage({
        id: `error-${Date.now()}`,
        text: "Es gab ein Problem beim Erstellen Ihres Support-Tickets. Bitte versuchen Sie es später erneut.",
        sender: 'bot',
        isError: true,
        timestamp: new Date()
      });
    }
  }, [messages, getUserInfo, createMockTicket, addMessage, sendChatTranscript]);

  // Erkennen, ob Support angeboten werden sollte
  const detectSupportNeed = useCallback((messages: Message[]): boolean => {
    const now = Date.now();
    if (now - lastSupportCheckRef.current < 5000) {
      return false;
    }
    lastSupportCheckRef.current = now;
    
    const recentMessages = messages.slice(-3);
    
    const userIsFrustrated = recentMessages.some((msg: Message) => {
      if (msg.sender !== 'user') return false;
      
      const text = msg.text.toLowerCase();
      return text.includes('verstehe nicht') || 
             text.includes('funktioniert nicht') || 
             text.includes('falsch') ||
             text.includes('blöd') ||
             text.includes('dumm') ||
             text.includes('schlecht') ||
             text.includes('?!') ||
             text.includes('???') ||
             text.includes('!!!');
    });
    
    let botRepetitiveAnswers = false;
    const botMessages = recentMessages.filter((msg: Message) => msg.sender === 'bot');
    
    if (botMessages.length >= 2) {
      const lastMessage = botMessages[botMessages.length - 1];
      const previousMessage = botMessages[botMessages.length - 2];
      
      if (lastMessage && previousMessage) {
        const lastBotMessage = lastMessage.text;
        const previousBotMessage = previousMessage.text;
        
        const similarityThreshold = 0.7;
        if (calculateSimilarity(lastBotMessage, previousBotMessage) > similarityThreshold) {
          botRepetitiveAnswers = true;
        }
      }
    }
    
    if (userIsFrustrated || botRepetitiveAnswers) {
      setShowSupportIcon(true);
      return true;
    }
    
    return false;
  }, [calculateSimilarity]);

  // Generiere eine zufällige Verarbeitungsmeldung basierend auf dem Kontext
  const getProcessingMessage = useCallback((context?: {
    isConnectingToAgent?: boolean;
    isSearching?: boolean;
    isThinking?: boolean;
    isAnalyzing?: boolean;
    isSummarizing?: boolean;
  }): string => {
    // Default-Kontext, falls keiner übergeben wurde
    const ctx = context || { isThinking: true };
    
    // Nachrichten für verschiedene Verarbeitungszustände
    const messages = {
      connectingToAgent: [
        "Verbinde mit einem Mitarbeiter...",
        "Leite Ihre Anfrage an unseren Support weiter...",
        "Stelle Verbindung zum Kundenservice her...",
        "Verbinde Sie mit dem Support-Team...",
        "Übergebe an einen Mitarbeiter..."
      ],
      searching: [
        "Suche nach relevanten Informationen...",
        "Recherchiere passende Antworten...",
        "Durchsuche meine Wissensdatenbank...",
        "Suche nach hilfreichen Inhalten...",
        "Finde die besten Antworten für Sie..."
      ],
      thinking: [
        "Verarbeite Ihre Anfrage...",
        "Analysiere Ihre Nachricht...",
        "Überprüfe den Kontext...", 
        "Denke über Ihre Frage nach...",
        "Einen Moment bitte..."
      ],
      analyzing: [
        "Analysiere die Details Ihrer Anfrage...",
        "Untersuche den Sachverhalt genauer...",
        "Bewerte die möglichen Antworten...",
        "Extrahiere die wichtigsten Informationen...",
        "Prüfe alle relevanten Aspekte..."
      ],
      summarizing: [
        "Fasse die Informationen zusammen...",
        "Erstelle eine kompakte Antwort...",
        "Bereite eine präzise Antwort vor...",
        "Formuliere eine hilfreiche Rückmeldung...",
        "Organisiere meine Erkenntnisse für Sie..."
      ]
    };
    
    // Wähle die passende Nachrichtenkategorie basierend auf dem Kontext
    let category = 'thinking'; // Standardkategorie
    if (ctx.isConnectingToAgent) category = 'connectingToAgent';
    else if (ctx.isSearching) category = 'searching';
    else if (ctx.isAnalyzing) category = 'analyzing';
    else if (ctx.isSummarizing) category = 'summarizing';
    
    // Wähle eine zufällige Nachricht aus der Kategorie mit Typensicherheit
    const selectedMessages = messages[category as keyof typeof messages] || messages.thinking;
    const index = Math.floor(Math.random() * selectedMessages.length);
    
    // Null-Coalescing zur Typensicherheit (string | undefined -> string)
    return selectedMessages[index] ?? "Verarbeite Ihre Anfrage...";
  }, []);

  // Komplett überarbeitete sendMessage-Funktion, um doppelte Nachrichten zu vermeiden
  const handleSendMessage = useCallback(async (content: string) => {
    // Verhindere leere Nachrichten
    if (!content || content.trim() === '') {
      console.log('[Chat] Leere Nachricht ignoriert');
      return;
    }

    // Erstelle eindeutige ID für diese Nachricht basierend auf Inhalt und Zeitstempel
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
    const messageId = `msg-${uniqueId}`;
    
    // Prüfe, ob bereits eine identische Nachricht in Bearbeitung ist
    const normalizedContent = content.toLowerCase().trim();
    // Wir prüfen nur nach dem Nachrichteninhalt, nicht nach dem Wert in der Map (der jetzt ein Boolean ist)
    const existingMessage = Array.from(messageRequestMapRef.current.keys())
                              .find(key => key.includes(normalizedContent));
    
    if (existingMessage) {
      console.log(`[Chat] Doppelte Nachricht verhindert: "${content.substring(0, 20)}..."`);
      return;
    }
    
    // Verfolge diese Nachricht (Boolean für aktiven Zustand, String für Nachrichteninhalt)
    messageRequestMapRef.current.set(messageId, true);
    
    // Bei bereits gesendeter Support-Nachricht
    if (supportMessageSent) {
      setSupportMessageSent(false);
      messageRequestMapRef.current.delete(messageId);
      return;
    }

    // Ablehnungsphrasen erkennen
    if (containsRejection(content)) {
      addMessage({
        id: `user-${uniqueId}`,
        text: content,
        sender: 'user',
        timestamp: new Date(),
        metadata: { isBeingHandled: true }
      });
      
      setTimeout(() => {
        addMessage({
          id: `rejection-response-${uniqueId}`,
          text: "Alles klar! Melde dich einfach, wenn du doch Hilfe benötigst.",
          sender: 'bot',
          timestamp: new Date()
        });
        
        if (showTicketOption) {
          setShowTicketOption(false);
        }
      }, 500);
      
      messageRequestMapRef.current.delete(messageId);
      return;
    }

    // Support-Anfragen erkennen
    const isAskingForSupport = containsSupportRequest(content);

    if (isAskingForSupport) {
      setSupportMessageSent(true);
      
      addMessage({
        id: `user-${uniqueId}`,
        text: content,
        sender: 'user',
        timestamp: new Date(),
        metadata: { isBeingHandled: true }
      });
      
      // Setze entsprechende Verarbeitungsnachricht für Support-Anfrage
      setCurrentProcessingMessage(getProcessingMessage({isConnectingToAgent: true}));
      
      setShowSupportIcon(true);
      setShowTicketOption(true);
      
      setTimeout(() => {
        addMessage({
          id: `support-offer-${uniqueId}`,
          text: "Es scheint, als ob Sie Hilfe von einem Mitarbeiter benötigen. Möchten Sie ein Support-Ticket erstellen?",
          sender: 'bot',
          timestamp: new Date()
        });
        messageRequestMapRef.current.delete(messageId);
      }, 100);
    } else {
      // Benutzernachricht hinzufügen - nur einmal
      addMessage({
        id: `user-${uniqueId}`,
        text: content,
        sender: 'user',
        timestamp: new Date()
      });
      
      // Kontextbezogene Verarbeitungsnachricht setzen
      if (content.toLowerCase().includes('suche') || content.toLowerCase().includes('finde')) {
        setCurrentProcessingMessage(getProcessingMessage({isSearching: true}));
      } else if (content.endsWith('?')) {
        setCurrentProcessingMessage(getProcessingMessage({isThinking: true}));
      } else if (content.length > 50) {
        setCurrentProcessingMessage(getProcessingMessage({isAnalyzing: true}));
      } else {
        // Zufällige Kategorie für abwechslungsreiche Nachrichten
        const randomCategory = Math.random() > 0.5 ? {isThinking: true} : {isAnalyzing: true};
        setCurrentProcessingMessage(getProcessingMessage(randomCategory));
      }
      
      try {
        // KI-generierte Antwort über API holen
        setIsAIProcessing(true);
        
        let botResponse = "Entschuldigung, ich konnte keine passende Antwort finden.";
        
        if (aiInitialized) {
          try {
            // Verwende lokale GPT-Instanz im Dev-Modus
            botResponse = await processMessageWithAPI(content);
          } catch (apiError) {
            console.log("[Chat] API-Fehler, verwende simulierte GPT-2 Antwort:", apiError);
            
            // Simulierte GPT-2 Antworten im Dev-Modus
            const gpt2Responses = [
              "Das ist eine interessante Frage. Lassen Sie mich kurz darüber nachdenken.",
              "Ich verstehe Ihr Anliegen. Hier sind einige Informationen, die helfen könnten.",
              "Danke für Ihre Anfrage. Ich stehe Ihnen gerne zur Verfügung.",
              "Das ist ein wichtiges Thema. Aus meiner Sicht gibt es mehrere Aspekte zu beachten.",
              "Ich freue mich, Ihnen dabei zu helfen. Lassen Sie mich das für Sie recherchieren."
            ];
            
            // Wähle eine zufällige GPT-2 ähnliche Antwort
            botResponse = gpt2Responses[Math.floor(Math.random() * gpt2Responses.length)] ?? "Ich helfe Ihnen gerne weiter.";
          } finally {
            setIsAIProcessing(false);
          }
        } else {
          // Fallback im Offline-Modus
          setIsAIProcessing(false);
          
          // Verzögerung simulieren für natürlicheres Gefühl
          await new Promise(resolve => setTimeout(resolve, 800));
          
          botResponse = "Ich stehe Ihnen zur Verfügung. Wie kann ich Ihnen weiterhelfen?";
        }
        
        // Bot-Antwort hinzufügen
        addMessage({
          id: `bot-${uniqueId}`,
          text: botResponse,
          sender: 'bot',
          timestamp: new Date()
        });
        
      } catch (error) {
        console.error("[Chat] Unerwarteter Fehler:", error);
        
        // Fehler-Fallback
        addMessage({
          id: `bot-error-${uniqueId}`,
          text: "Entschuldigung, es gab ein technisches Problem. Bitte versuchen Sie es später erneut.",
          sender: 'bot',
          timestamp: new Date()
        });
      } finally {
        // Nachrichtenverarbeitung abschließen
        messageRequestMapRef.current.delete(messageId);
        setIsAIProcessing(false);
      }
    }
    
    // Timer zurücksetzen
    resetInactivityTimer();
    resetAutoEmailTimer();
    
    // Sicherheitsnetz: Bei vergessenen Nachrichten nach X Sekunden bereinigen
    setTimeout(() => {
      if (messageRequestMapRef.current.has(messageId)) {
        console.log(`[Chat] Bereinige vergessene Nachricht nach Timeout: ${messageId}`);
        messageRequestMapRef.current.delete(messageId);
      }
    }, 15000); // Nach 15 Sekunden
  }, [
    addMessage, 
    containsRejection, 
    containsSupportRequest, 
    resetInactivityTimer, 
    resetAutoEmailTimer, 
    aiInitialized,
    processMessageWithAPI,
    supportMessageSent,
    showTicketOption,
    getProcessingMessage
  ]);

  // Initialisierung der Health-Check-API mit Retry-Mechanismus
  useEffect(() => {
    const checkAPIAvailability = async () => {
      let retries = 0;
      const maxRetries = 3;
      const retryDelay = 2000; // 2 Sekunden zwischen den Versuchen
      
      const attemptCheck = async () => {
        try {
          const requestId = `health-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const response = await fetch('/api/chatbot/health', { 
            method: 'GET',
            cache: 'no-store',
            headers: { 'X-Request-ID': requestId }
          });
          
          if (response.ok) {
            setAIInitialized(true);
            console.log("[Chat] Chatbot API erfolgreich verfügbar");
            return true;
          } else {
            // Nur zur Entwicklung loggen, nicht im UI anzeigen
            console.log("[Chat] Chatbot API nicht verfügbar (erwartet im Dev-Modus)");
            // Trotz 404-Fehler GPT-2 aktivieren
            setAIInitialized(true);
            return true;
          }
        } catch (error) {
          console.log("[Chat] Chatbot API-Check fehlgeschlagen (erwartet im Dev-Modus)");
          // Trotz Fehler GPT-2 aktivieren
          setAIInitialized(true);
          return true;
        }
      };
      
      // Nur ein Versuch - kein Retry im Entwicklungsmodus nötig
      await attemptCheck();
    };
    
    checkAPIAvailability();
  }, []);

  // Sound-Initialisierung - verbesserte Fehlerbehandlung
  useEffect(() => {
    const tryLoadSounds = () => {
      try {
        // Überprüfe Browser-Kompatibilität
        const testAudio = new Audio();
        if (!testAudio.canPlayType) {
          console.log("[Chat] Browser unterstützt Audio-API nicht, überspringe Sound-Initialisierung");
          return;
        }
        
        // Verwende direkt das eingebettete Base64-Audio statt externer Dateien
        if (fallbackAudioRef.current) {
          fallbackAudioRef.current.volume = 0.3;
          
          // Versuche das Fallback-Audio zu initialisieren (Base64)
          try {
            // Nur für Initialisierung abspielen - wird sofort pausiert
            const playPromise = fallbackAudioRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  // Sofort pausieren nach erfolgreicher Initialisierung
                  fallbackAudioRef.current?.pause();
                  fallbackAudioRef.current?.load();
                  setSoundInitialized(true);
                  console.log("[Chat] Fallback-Sound erfolgreich initialisiert");
                })
                .catch(error => {
                  // Vermutlich Browser-Einschränkung ohne Benutzerinteraktion
                  console.log("[Chat] Fallback-Sound konnte nicht initialisiert werden:", error.message);
                  setSoundInitialized(false);
                });
            }
          } catch (fallbackError) {
            console.log("[Chat] Fallback-Sound-Initialisierungsfehler:", fallbackError);
            setSoundInitialized(false);
          }
        }
      } catch (error) {
        console.log("[Chat] Allgemeiner Sound-Initialisierungsfehler:", error);
        setSoundInitialized(false);
      }
    };

    const timer = setTimeout(tryLoadSounds, 1000);
    return () => clearTimeout(timer);
  }, []);

  // IP-Adresse des Benutzers abrufen
  useEffect(() => {
    const fetchIpAddress = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (response.ok) {
          const data = await response.json();
          setUserIpAddress(data.ip);
        }
      } catch (error) {
        console.log("[Chat] IP-Adresse konnte nicht abgerufen werden:", error);
      }
    };
    
    fetchIpAddress();
  }, []);

  // Auto-Email-Timer bei Komponentenmontage einrichten
  useEffect(() => {
    resetAutoEmailTimer();
    
    return () => {
      if (autoEmailTimeoutRef.current) {
        clearTimeout(autoEmailTimeoutRef.current);
      }
    };
  }, [resetAutoEmailTimer]);

  // Timeouts bei Komponentenabbau bereinigen
  useEffect(() => {
    return () => {
      if (rejectionResponseTimeoutRef.current) {
        clearTimeout(rejectionResponseTimeoutRef.current);
      }
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      if (autoEmailTimeoutRef.current) {
        clearTimeout(autoEmailTimeoutRef.current);
      }
      if (apiAbortControllerRef.current) {
        apiAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Aktivitäts-Timer bei Benutzerinteraktionen zurücksetzen
  useEffect(() => {
    const handleUserActivity = () => resetInactivityTimer();
    
    document.addEventListener('mousedown', handleUserActivity);
    document.addEventListener('keydown', handleUserActivity);
    document.addEventListener('touchstart', handleUserActivity);
    
    return () => {
      document.removeEventListener('mousedown', handleUserActivity);
      document.removeEventListener('keydown', handleUserActivity);
      document.removeEventListener('touchstart', handleUserActivity);
    };
  }, [resetInactivityTimer]);

  // Nachrichtenüberwachung
  useEffect(() => {
    if (messages.length === prevMessagesCountRef.current) {
      return;
    }

    const currentMessagesCount = messages.length;
    prevMessagesCountRef.current = currentMessagesCount;
    
    if (currentMessagesCount > 0) {
      const latestMessage = messages[currentMessagesCount - 1];
      
      if (latestMessage) {
        if (latestMessage.sender === 'bot') {
          playMessageSound();
        }
        
        if (latestMessage.sender === 'user') {
          setHasUserInteracted(true);
          setInactivityPromptDisabled(true);
          
          // Setze eine neue, zufällige Verarbeitungsnachricht
          if (latestMessage.text.toLowerCase().includes('mitarbeiter') || 
              latestMessage.text.toLowerCase().includes('mensch') ||
              latestMessage.text.toLowerCase().includes('person')) {
            setCurrentProcessingMessage(getProcessingMessage({isConnectingToAgent: true}));
          } else if (latestMessage.text.toLowerCase().includes('suche') || 
                     latestMessage.text.toLowerCase().includes('finde')) {
            setCurrentProcessingMessage(getProcessingMessage({isSearching: true}));
          } else if (latestMessage.text.endsWith('?')) {
            setCurrentProcessingMessage(getProcessingMessage({isThinking: true}));
          } else if (latestMessage.text.length > 50) {
            setCurrentProcessingMessage(getProcessingMessage({isAnalyzing: true}));
          } else {
            // Zufällige Kategorie für abwechslungsreiche Nachrichten
            const randomCategory = Math.random() > 0.5 ? {isThinking: true} : {isAnalyzing: true};
            setCurrentProcessingMessage(getProcessingMessage(randomCategory));
          }
          
          if (containsRejection(latestMessage.text) && !latestMessage.metadata?.isBeingHandled) {
            latestMessage.metadata = { ...(latestMessage.metadata || {}), isBeingHandled: true };
            
            if (rejectionResponseTimeoutRef.current) {
              clearTimeout(rejectionResponseTimeoutRef.current);
            }
            
            setSupportMessageSent(false);
          }
        }
        
        if (!supportMessageSent && currentMessagesCount >= 2) {
          detectSupportNeed(messages);
        }
        
        if (!transcriptAutoSent) {
          resetAutoEmailTimer();
        }
      }
    }
  }, [
    messages, 
    playMessageSound, 
    containsRejection, 
    supportMessageSent, 
    detectSupportNeed,
    transcriptAutoSent,
    resetAutoEmailTimer,
    getProcessingMessage
  ]);

  // Render-Ausgabe - überarbeitet mit korrekter Reasoning-Anzeige Positionierung
  return (
    <motion.div
      className="chatbot-container relative" // 'relative' hinzugefügt für korrekte Positionierung der Reasoning-Anzeige
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Sound-Effekte - primär und Fallback */}
      <audio ref={audioRef} src="/sounds/message-pop.mp3" preload="auto" />
      <audio ref={fallbackAudioRef} src={FALLBACK_POP_SOUND} preload="auto" />
      
      {/* Header */}
      <div className="chatbot-header">
        <h3 className="font-medium text-white">Chatbot</h3>
        <div className="flex items-center space-x-3">
          {showSupportIcon && (
            <motion.button 
              onClick={() => setShowTicketOption(!showTicketOption)}
              className="text-white hover:text-blue-100 transition-colors"
              aria-label="Mit Mitarbeiter verbinden"
              title="Mit Mitarbeiter verbinden"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <FaHeadset className="w-5 h-5" />
            </motion.button>
          )}
          <motion.button 
            onClick={toggleChat}
            className="text-white hover:text-blue-100 transition-colors"
            aria-label="Chat schließen"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <IoClose className="w-5 h-5" />
          </motion.button>
        </div>
      </div>

      {/* Support-Ticket Option */}
      <AnimatePresence>
        {showTicketOption && (
          <motion.div 
            className="p-3 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800"
            variants={supportOptionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              Möchten Sie mit einem Mitarbeiter verbunden werden?
            </p>
            <div className="flex space-x-2">
              <motion.button 
                onClick={createSupportTicket}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors shadow-sm"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                Ja, bitte
              </motion.button>
              <motion.button 
                onClick={() => {
                  setShowTicketOption(false);
                  addMessage({
                    id: `continue-with-bot-${Date.now()}`,
                    text: "Verstanden. Ich stehe Ihnen weiterhin gerne zur Verfügung. Wie kann ich Ihnen helfen?",
                    sender: 'bot',
                    timestamp: new Date()
                  });
                }}
                className="px-3 py-1 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-sm rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                Nein, danke
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* E-Mail Option */}
      <AnimatePresence>
        {showEmailOption && (
          <motion.div 
            className="p-3 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800"
            variants={supportOptionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              Möchten Sie den Chatverlauf mit Ihrer Ticketnummer per E-Mail erhalten?
            </p>
            <div className="flex flex-col space-y-2">
              <div className="relative">
                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => {
                    setEmailAddress(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  placeholder="Ihre E-Mail-Adresse"
                  className={`px-3 py-1 text-sm rounded border ${
                    emailError 
                      ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20' 
                      : 'border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800'
                  } w-full`}
                />
                {emailError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1">{emailError}</p>
                )}
              </div>
              <div className="flex space-x-2">
                <motion.button 
                  onClick={handleSendEmail}
                  className={`px-3 py-1 text-white text-sm rounded-full shadow-sm flex items-center space-x-1 ${
                    emailAddress ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-300 cursor-not-allowed'
                  }`}
                  whileHover={emailAddress ? { scale: 1.03 } : {}}
                  whileTap={emailAddress ? { scale: 0.98 } : {}}
                >
                  <MdEmail className="w-4 h-4" />
                  <span>Senden</span>
                </motion.button>
                <motion.button 
                  onClick={() => {
                    setShowEmailOption(false);
                    setShowChatOptions(true);
                    
                    addMessage({
                      id: `skip-email-${Date.now()}`,
                      text: "In Ordnung, wir senden keine E-Mail. Wie möchten Sie fortfahren?",
                      sender: 'bot',
                      timestamp: new Date()
                    });
                  }}
                  className="px-3 py-1 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-sm rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Überspringen
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat-Fortsetzungsoptionen */}
      <AnimatePresence>
        {showChatOptions && (
          <motion.div 
            className="p-3 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800"
            variants={supportOptionVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
              Möchten Sie den Chat fortsetzen oder einen neuen Chat beginnen?
            </p>
            <div className="flex space-x-2">
              <motion.button 
                onClick={() => {
                  setShowChatOptions(false);
                  addMessage({
                    id: `continue-chat-${Date.now()}`,
                    text: "Wie kann ich Ihnen weiterhelfen?",
                    sender: 'bot',
                    timestamp: new Date()
                  });
                }}
                className="px-3 py-1 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors shadow-sm"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                Chat fortsetzen
              </motion.button>
              <motion.button 
                onClick={handleStartNewChat}
                className="px-3 py-1 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 text-sm rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                Neuer Chat
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reasoning-Anzeige (Verarbeitungsmeldung) - korrigierte Positionierung */}
      {(isProcessing || isAIProcessing) && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 px-3 py-1 bg-gray-200 dark:bg-gray-700 
                      rounded-full text-xs text-gray-700 dark:text-gray-200 shadow-md z-10">
          <div className="flex items-center space-x-1">
            <div className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse"></div>
            <span>{currentProcessingMessage || "Verarbeite Anfrage..."}</span>
          </div>
        </div>
      )}

      {/* Chat-Nachrichten */}
      <ChatMessages />

      {/* Chat-Eingabe */}
      <ChatInput 
        onSend={handleUserInteraction} 
        customSendMessage={handleSendMessage} 
      />
    </motion.div>
  );
}