import { useState, useEffect } from 'react';

/**
 * Hook für das Debouncing von Werten
 * Nützlich, um API-Aufrufe oder teure Operationen bei schnell ändernden Werten zu verzögern
 * 
 * @param value Der Wert, der debounced werden soll
 * @param delay Die Verzögerungszeit in Millisekunden
 * @returns Der debounced Wert
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  // State für den debounced Wert
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    // Setze einen Timer, der den Wert aktualisiert, nachdem die Verzögerung abgelaufen ist
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    // Cleanup: Lösche den Timer, wenn sich der Wert oder die Verzögerung ändert
    // oder wenn die Komponente unmounted wird
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Hook für das Debouncing von Funktionen
 * Nützlich für Event-Handler wie Scroll, Resize oder Input
 * 
 * @param callback Die Funktion, die debounced werden soll
 * @param delay Die Verzögerungszeit in Millisekunden
 * @returns Die debounced Funktion
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T, 
  delay: number = 300
): (...args: Parameters<T>) => void {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);
  
  // Erstelle eine neue Funktion, die den Aufruf verzögert
  const debouncedFunction = (...args: Parameters<T>): void => {
    // Lösche einen vorhandenen Timer
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Setze einen neuen Timer
    const id = setTimeout(() => {
      callback(...args);
    }, delay);
    
    setTimeoutId(id);
  };
  
  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);
  
  return debouncedFunction;
}

export default useDebounce;
