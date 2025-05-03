import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/**
 * Hook für die Erkennung von Klicks außerhalb eines Elements
 * 
 * @param callback Die Funktion, die ausgeführt wird, wenn außerhalb geklickt wird
 * @param initialRef Optional: Eine bestehende Referenz auf das Element
 * @returns Eine Referenz, die an das Element angehängt werden muss
 */
export function useOutsideClick<T extends HTMLElement = HTMLElement>(
  callback: () => void,
  initialRef?: RefObject<T>
): RefObject<T> {
  // Erstelle eine Referenz, wenn keine übergeben wurde
  const ref = initialRef || useRef<T>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Prüfe, ob der Klick außerhalb des referenzierten Elements war
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    }
    
    // Füge den Event-Listener hinzu
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup: Entferne den Event-Listener beim Unmount
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, callback]);
  
  return ref;
}

export default useOutsideClick;
