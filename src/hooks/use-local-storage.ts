import { useState, useEffect } from 'react';

/**
 * Hook für den einfachen Zugriff und Speicherung im LocalStorage
 * 
 * @param key Der Schlüssel im LocalStorage
 * @param initialValue Der initiale Wert, falls kein Wert im LocalStorage vorhanden ist
 * @returns Ein State-Wert und eine Setter-Funktion, ähnlich wie bei useState
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  // State zur Speicherung unseres Wertes
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // Prüfe, ob wir im Browser sind (nicht SSR)
      if (typeof window === 'undefined') {
        return initialValue;
      }
      
      // Versuche den Wert aus dem LocalStorage zu bekommen
      const item = window.localStorage.getItem(key);
      
      // Parsen oder Rückgabe des Initial-Wertes
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // Bei einem Fehler den Initial-Wert zurückgeben
      console.error(`Fehler beim Lesen aus localStorage für Schlüssel ${key}:`, error);
      return initialValue;
    }
  });
  
  // Funktion zum Speichern des Wertes im LocalStorage
  const setValue = (value: T) => {
    try {
      // Speichere den neuen Wert im State
      setStoredValue(value);
      
      // Speichere den neuen Wert im LocalStorage
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
        
        // Sende ein Event, damit andere Komponenten reagieren können
        const event = new Event('local-storage-change');
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.error(`Fehler beim Schreiben in localStorage für Schlüssel ${key}:`, error);
    }
  };
  
  // Reagiere auf Änderungen des Schlüssels
  useEffect(() => {
    // Wenn der Schlüssel sich ändert, aktualisiere den State mit dem neuen Wert
    try {
      if (typeof window !== 'undefined') {
        const item = window.localStorage.getItem(key);
        setStoredValue(item ? JSON.parse(item) : initialValue);
      }
    } catch (error) {
      console.error(`Fehler beim Aktualisieren des Werts für Schlüssel ${key}:`, error);
    }
  }, [key, initialValue]);
  
  // Listener für Storage-Events, wenn der Wert in einem anderen Tab geändert wird
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === key) {
        try {
          setStoredValue(e.newValue ? JSON.parse(e.newValue) : initialValue);
        } catch (error) {
          console.error(`Fehler beim Verarbeiten des geänderten Werts für Schlüssel ${key}:`, error);
        }
      }
    }
    
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      
      // Cleanup
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
    return undefined;
  }, [key, initialValue]);
  
  return [storedValue, setValue];
}

export default useLocalStorage;
