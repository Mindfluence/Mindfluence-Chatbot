import { type ClassValue, clsx } from 'clsx'; // Hinzufügen von 'type' vor ClassValue
import { twMerge } from 'tailwind-merge';
import { type Language } from '@/types/chatbot.types'; // Hinzufügen von 'type' vor Language (gute Praxis)

/**
 * Kombiniert mehrere CSS-Klassen-Werte und optimiert sie mit Tailwind Merge
 * Diese Funktion vereint clsx und tailwind-merge, um doppelte oder widersprüchliche
 * Tailwind-Klassen zu bereinigen.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatiert ein Datum in ein lesbares Format entsprechend der Sprache
 */
export function formatDate(date: Date, language: Language = 'de'): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  return date.toLocaleDateString(
    language === 'de' ? 'de-DE' : 'en-US',
    options
  );
}

/**
 * Formatiert eine Zeit in ein lesbares Format entsprechend der Sprache
 */
export function formatTime(date: Date, language: Language = 'de'): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };

  return date.toLocaleTimeString(
    language === 'de' ? 'de-DE' : 'en-US',
    options
  );
}

/**
 * Kürzt einen Text auf eine bestimmte Länge und fügt ggf. Auslassungszeichen hinzu
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

/**
 * Generiert eine eindeutige ID (nützlich für temporäre IDs in der UI)
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Verzögert die Ausführung einer Funktion für eine bestimmte Zeit
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simuliert Tippverzögerungen für natürlichere Bot-Antworten
 * @param text Der Text, für den die Tippzeit berechnet wird
 * @param minDelay Minimale Verzögerung in Millisekunden
 * @param charsPerSecond Durchschnittliche Anzahl an Zeichen, die pro Sekunde "getippt" werden
 * @param maxDelay Maximale Verzögerung in Millisekunden
 */
export function calculateTypingDelay(
  text: string,
  minDelay: number = 500,
  charsPerSecond: number = 15,
  maxDelay: number = 3000
): number {
  // Berechne die Zeit basierend auf der Textlänge
  const calculatedDelay = (text.length / charsPerSecond) * 1000;

  // Stelle sicher, dass die Verzögerung innerhalb der Grenzen liegt
  return Math.min(Math.max(calculatedDelay, minDelay), maxDelay);
}

/**
 * Extrahiert den reinen Textinhalt aus HTML-Markup
 */
export function stripHtml(html: string): string {
  // Einfache Implementierung, die HTML-Tags entfernt
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Testet, ob der Code in einer Serverumgebung läuft (und nicht im Browser)
 */
export function isServer(): boolean {
  return typeof window === 'undefined';
}

/**
 * Testet, ob der Code in einer Browserumgebung läuft
 */
export function isBrowser(): boolean {
  return !isServer();
}

/**
 * Lädt eine sprachspezifische Ressource dynamisch
 */
export async function loadLanguageResource<T>(
  resourcePath: string,
  language: Language
): Promise<T> {
  try {
    // Stelle sicher, dass der Pfad korrekt ist und .json endet
    const finalPath = resourcePath.endsWith('.json') ? resourcePath : `${resourcePath}_${language}.json`;

    // Dynamischer Import mit Template-Literal, um den Pfad zusammenzusetzen
    // Beachte: Dynamische Importe in diesem Kontext können je nach Build-Tool
    // (Webpack, SWC etc.) und Konfiguration variieren.
    // Ein häufiges Muster ist, den Basispfad konstant zu halten und nur den 
    // Dateinamen (mit Sprache) dynamisch zu machen.
    // Beispiel: `@/data/chatbot/${language}/${resourceName}.json`
    // Da dein Originalpfad `@/data/chatbot/${resourcePath}_${language}.json` war,
    // nehmen wir an, dass resourcePath hier NUR der "Basisname" ist, z.B. "faq".
    // Dann wäre der Import:
     const module = await import(`@/data/chatbot/${resourcePath}_${language}.json`);
     return module.default as T; // Bei JSON-Importen oft .default nötig

  } catch (error) {
    console.error(`Fehler beim Laden der Sprachressource ${resourcePath} für ${language}:`, error);

    // Fallback auf Englisch, falls verfügbar und nicht die angefragte Sprache
    if (language !== 'en') {
      try {
         const module = await import(`@/data/chatbot/${resourcePath}_en.json`);
         return module.default as T; // Bei JSON-Importen oft .default nötig
      } catch (fallbackError) {
        console.error(`Fehler beim Laden der Fallback-Ressource ${resourcePath} für en:`, fallbackError);
        // Werfe den ursprünglichen Fehler, wenn auch der Fallback fehlschlägt
        throw error;
      }
    }

    // Werfe den ursprünglichen Fehler, wenn kein Fallback versucht wurde (z.B. wenn language bereits 'en' war)
    throw error;
  }
}


/**
 * Überprüft, ob ein Objekt leer ist
 */
export function isEmptyObject(obj: Record<string, any>): boolean {
  // Stellt sicher, dass obj tatsächlich ein Objekt ist und nicht null/undefined
  return typeof obj === 'object' && obj !== null && Object.keys(obj).length === 0 && obj.constructor === Object;
}

/**
 * Gruppiert ein Array von Objekten nach einem Schlüssel
 */
export function groupBy<T extends Record<string, any>>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((result, item) => {
    const groupKey = String(item[key]);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {} as Record<string, T[]>);
}

/**
 * Fügt Tausendertrennzeichen zu einer Zahl hinzu (sprachabhängig)
 */
export function formatNumber(num: number, language: Language = 'de'): string {
  // Überprüft, ob num eine endliche Zahl ist
  if (typeof num !== 'number' || !isFinite(num)) {
      return String(num); // Gibt den Wert als String zurück, falls ungültig
  }
  return num.toLocaleString(language === 'de' ? 'de-DE' : 'en-US');
}

/**
 * Formatiert einen Geldbetrag mit Währungssymbol (sprachabhängig)
 */
export function formatCurrency(
  amount: number,
  currency: string = 'EUR',
  language: Language = 'de'
): string {
  // Überprüft, ob amount eine endliche Zahl ist
   if (typeof amount !== 'number' || !isFinite(amount)) {
      return String(amount); // Gibt den Wert als String zurück, falls ungültig
  }
  return new Intl.NumberFormat(
    language === 'de' ? 'de-DE' : 'en-US',
    { style: 'currency', currency }
  ).format(amount);
}

/**
 * Entfernt doppelte Objekte aus einem Array basierend auf einem Schlüssel
 */
export function removeDuplicates<T extends Record<string, any>>(array: T[], key: keyof T): T[] {
    // Überprüft, ob das Array gültig ist
    if (!Array.isArray(array)) {
        return [];
    }
    return Array.from(
        new Map(array.map(item => [item[key], item])).values()
    );
}

/**
 * Debounce-Funktion, die die Anzahl der Aufrufe einer Funktion begrenzt
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle-Funktion, die sicherstellt, dass eine Funktion höchstens einmal
 * in einem angegebenen Zeitraum aufgerufen wird
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return function(...args: Parameters<T>): void {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Liest Werte aus dem Local Storage und konvertiert sie in den richtigen Typ
 */
export function getFromLocalStorage<T>(key: string, defaultValue: T): T {
  if (!isBrowser()) return defaultValue;

  try {
    const item = localStorage.getItem(key);
     // Rückgabe von defaultValue, wenn item null ist (Schlüssel nicht gefunden)
    return item === null ? defaultValue : JSON.parse(item);
  } catch (error) {
    console.error(`Fehler beim Lesen aus localStorage für Schlüssel ${key}:`, error);
    return defaultValue;
  }
}

/**
 * Speichert Werte im Local Storage
 */
export function setToLocalStorage(key: string, value: any): void {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Fehler beim Schreiben in localStorage für Schlüssel ${key}:`, error);
     // Optional: Überprüfen auf QUOTA_EXCEEDED_ERR (Code 22)
     if (error instanceof DOMException && error.code === 22) {
         console.warn("localStorage quota exceeded.");
         // Hier könnte man eine Strategie zur Freigabe von Speicher implementieren
     }
  }
}

/**
 * Hilfsfunktion für das Extrahieren von Fehlermeldungen aus verschiedenen Fehlertypen
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
   // Wenn der Fehler ein Objekt ist, versuchen Sie, es in einen JSON-String zu konvertieren
   if (typeof error === 'object' && error !== null) {
       try {
           return JSON.stringify(error);
       } catch {
           // Fallback, falls JSON.stringify fehlschlägt (z.B. wegen zirkulärer Referenzen)
           return 'Ein unbekannter Fehler ist aufgetreten (konnte nicht stringifiziert werden).';
       }
   }
  return String(error); // Für primitive Typen oder andere Fälle
}