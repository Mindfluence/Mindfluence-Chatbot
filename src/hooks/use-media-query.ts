import { useState, useEffect } from 'react';

/**
 * Hook für die einfache Verwendung von CSS Media Queries in React-Komponenten
 * 
 * @param query Die Media Query als String, z.B. '(min-width: 768px)'
 * @returns Boolean, der angibt, ob die Media Query zutrifft
 */
export function useMediaQuery(query: string): boolean {
  // SSR-sichere Initialisierung
  const getMatches = (): boolean => {
    // Prüfe, ob wir im Browser sind
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  };
  
  // State für das aktuelle Match-Ergebnis
  const [matches, setMatches] = useState<boolean>(getMatches());
  
  // Aktualisiere den State, wenn die Media Query sich ändert
  useEffect(() => {
    // Handler-Funktion für Media-Query-Änderungen
    function handleChange() {
      setMatches(getMatches());
    }
    
    // Initialer Check
    handleChange();
    
    // Media Query Observer erstellen
    const matchMedia = window.matchMedia(query);
    
    // Event-Listener hinzufügen (mit Kompatibilität für ältere Browser)
    if (matchMedia.addEventListener) {
      matchMedia.addEventListener('change', handleChange);
    } else {
      // Fallback für ältere Browser
      matchMedia.addListener(handleChange);
    }
    
    // Cleanup: Event-Listener entfernen
    return () => {
      if (matchMedia.removeEventListener) {
        matchMedia.removeEventListener('change', handleChange);
      } else {
        // Fallback für ältere Browser
        matchMedia.removeListener(handleChange);
      }
    };
  }, [query]);
  
  return matches;
}

// Voreingestellte Media Queries für gängige Breakpoints
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () => useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsDarkMode = () => useMediaQuery('(prefers-color-scheme: dark)');

export default useMediaQuery;
