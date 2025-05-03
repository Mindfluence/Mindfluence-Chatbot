import { useState, useEffect } from 'react';
import { getThemeMode, setThemeMode } from '@/styles/theme.config';
import type { ThemeMode } from '@/lib/constants';

/**
 * Hook für die Verwaltung des Theme-Modus (Light/Dark/System)
 * 
 * @returns Ein Objekt mit dem aktuellen Theme-Modus, Funktionen zum Ändern des Modus
 *          und ein Flag, das angibt, ob tatsächlich der Dark Mode aktiv ist
 */
export function useTheme() {
  // State für den Theme-Modus
  const [mode, setMode] = useState<ThemeMode>('system');
  
  // State für den tatsächlichen Zustand (ob Dark Mode aktiv ist oder nicht)
  const [isDark, setIsDark] = useState<boolean>(false);
  
  // Lade den initialen Theme-Modus
  useEffect(() => {
    // Setze den State auf den gespeicherten Modus
    setMode(getThemeMode());
    
    // Prüfe auch, ob tatsächlich der Dark Mode aktiv ist
    const dataTheme = document.documentElement.getAttribute('data-theme');
    setIsDark(dataTheme === 'dark');
    
    // Listener für Theme-Änderungen
    const handleThemeChange = (e: Event) => {
      const event = e as CustomEvent;
      if (event.detail?.mode) {
        setMode(event.detail.mode);
      }
      
      // Prüfe, ob tatsächlich der Dark Mode aktiv ist
      const dataTheme = document.documentElement.getAttribute('data-theme');
      setIsDark(dataTheme === 'dark');
    };
    
    // Listener für System-Präferenz-Änderungen
    const handleSystemChange = (e: MediaQueryListEvent) => {
      if (mode === 'system') {
        setIsDark(e.matches);
      }
    };
    
    // Füge Event-Listener hinzu
    document.addEventListener('mindfluence-theme-change', handleThemeChange);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', handleSystemChange);
    
    // Cleanup: Event-Listener entfernen
    return () => {
      document.removeEventListener('mindfluence-theme-change', handleThemeChange);
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', handleSystemChange);
    };
  }, [mode]);
  
  // Funktion zum Ändern des Theme-Modus
  const changeTheme = (newMode: ThemeMode) => {
    setThemeMode(newMode);
    setMode(newMode);
  };
  
  // Hilfsfunktionen für häufige Aktionen
  const toggleDarkMode = () => {
    const newMode = isDark ? 'light' : 'dark';
    changeTheme(newMode);
  };
  
  const enableDarkMode = () => changeTheme('dark');
  const enableLightMode = () => changeTheme('light');
  const useSystemTheme = () => changeTheme('system');
  
  return {
    mode,           // Der aktuelle Theme-Modus (light, dark, system)
    isDark,         // Boolean, der angibt, ob der Dark Mode aktiv ist
    changeTheme,    // Funktion zum Ändern des Theme-Modus
    toggleDarkMode, // Funktion zum Umschalten zwischen Light und Dark
    enableDarkMode, // Funktion zum Aktivieren des Dark Mode
    enableLightMode, // Funktion zum Aktivieren des Light Mode
    useSystemTheme  // Funktion zum Verwenden der Systemeinstellung
  };
}

export default useTheme;
