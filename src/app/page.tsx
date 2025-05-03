// src/app/page.tsx
import React from 'react';
import ChatInterface from '@/components/chatbot/ChatInterface'; // Die Haupt-UI des Chatbots
import ChatToggle from '@/components/chatbot/ChatToggle'; // Der Button zum Öffnen/Schließen

// Diese Page-Komponente ist standardmäßig eine Server Component.
// Sie rendert lediglich die Struktur und die Chatbot-Komponenten.
// Die Interaktivität (State, Events) wird in ChatInterface und ChatToggle
// gehandhabt, welche als Client Components ('use client') implementiert sein müssen.

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between p-4 md:p-8 lg:p-12">
      {/* 
        Hier könnte der Hauptinhalt der "anderen Anwendung" stehen,
        an die der Chatbot angeschlossen wird.
        Für den Moment lassen wir es einfach oder fügen Platzhalter ein.
      */}
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/90">
          Platzhalter: Hauptanwendungsbereich
        </p>
        {/* Weitere Elemente des Haupt-Layouts könnten hier sein */}
      </div>

      {/*
        Die eigentlichen Chatbot-UI-Elemente.
        ChatInterface wird vermutlich nur gerendert, wenn der Chat geöffnet ist
        (gesteuert über den ChatbotContext).
        ChatToggle ist typischerweise immer sichtbar und steuert den Zustand.
        Beide Komponenten MÜSSEN als Client Components ('use client') definiert sein.
      */}
      <ChatInterface />
      <ChatToggle />

      {/* Weiterer Inhalt der Hauptseite, falls vorhanden */}
      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-4 lg:text-left">
         {/* Beispielhafte Links oder Sektionen */}
      </div>
    </main>
  );
}