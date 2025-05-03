'use client';

import React, { Suspense } from 'react';
import ChatbotProvider from '@/features/chatbot/provider/ChatbotProvider';

interface ClientLayoutProps {
  children: React.ReactNode;
}

/**
 * Client-seitige Layout-Komponente
 * Enthält Client-spezifische Wrapper wie ChatbotProvider und Suspense
 * Wichtig: In Client-Komponenten keine <html> oder <body> Tags verwenden
 */
export default function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen">Loading...</div>}>
      <ChatbotProvider>
        <main className="min-h-screen">
          {children}
        </main>
      </ChatbotProvider>
    </Suspense>
  );
}