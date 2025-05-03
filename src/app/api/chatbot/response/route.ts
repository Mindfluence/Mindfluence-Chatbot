export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import type { Language } from '@/types/nlp.types'; // Dieser Alias sollte funktionieren, da er oft auf src/types zeigt
import { config } from '@/features/nlp-engine/config';
import * as fs from 'fs';
import * as path from 'path';
import { mkdir, copyFile, access } from 'fs/promises';

// Importiere die Funktion zur ONNX Runtime Initialisierung
// FIX: TypeScript Fehler 2307 - Verwenden Sie relativen Pfad, um Alias-Problem zu umgehen
// Stellen Sie sicher, dass dieser Pfad von der Position dieser Datei (app/api/chatbot/response)
// zum Zielordner (features/nlp-engine/utils) korrekt ist.
// Der Pfad sollte ".../../../features/nlp-engine/utils/onnx-env" sein
// Option 1: If you have a tsconfig path alias set up for '@'
// import { getOnnxRuntime } from '@/features/nlp-engine/utils/onnx-env';

// Option 2: If you do not use path aliases, ensure the relative path is correct and the file exists
import { getOnnxRuntime } from '@/utils/onnx-env';

// Importiere die Haupt-NLP-Engine Klasse und die Funktion zum Abrufen der Singleton-Instanz
// FIX: TypeScript Fehler 2724 - Die fehlende Typdefinition 'GenerativePipelineStatus'
// wird direkt hier im File definiert, da der Import aus engine.ts fehlschlägt.
// Die NLPEngine selbst wird korrekt importiert.
import { NLPEngine, getEngine } from '@/features/nlp-engine/engine';


// FIX: TypeScript Fehler 2724 - Definieren Sie den benötigten Typ hier lokal
// Annahme: Dies ist die Struktur, die von engine.getGenerativePipelineStatus() zurückgegeben wird.
type GenerativePipelineStatus = {
    isReady: boolean;
    fallbackMode: boolean;
    modelName: string;
    // Fügen Sie weitere Eigenschaften hinzu, falls die Statusmethode in engine.ts diese liefert
};


// Intent-Typen als Konstanten (unverändert)
const INTENT_TYPES = {
  FAQ: 'faq',
  SMALLTALK: 'smalltalk',
  FUNCTION: 'function',
  UNKNOWN: 'unknown'
};

// Antwort-Registry: Zentrales Repository für alle möglichen Antworten (unverändert)
const RESPONSE_REGISTRY = {
  // Standardantworten für Fehlerbehandlung
  fallback: {
    de: {
      welcome: "Willkommen! Wie kann ich dir helfen?",
      unknown: "Entschuldigung, ich habe das nicht verstanden. Kannst du das anders formulieren?",
      error: "Entschuldigung, es gab ein technisches Problem. Bitte versuche es später noch einmal.",
      lowConfidence: "Ich bin mir nicht ganz sicher, was du meinst. Könntest du es bitte anders formulieren?"
    },
    en: {
      welcome: "Welcome! How can I help you?",
      unknown: "Sorry, I didn't understand that. Could you rephrase?",
      error: "Sorry, there was a technical issue. Please try again later.",
      lowConfidence: "I'm not quite sure what you mean. Could you phrase it differently?"
    }
  },

  // Smalltalk-Antworten (unverändert)
  smalltalk: {
    de: {
      greeting: [
        "Hallo! Schön, von dir zu hören!",
        "Guten Tag! Wie kann ich dir helfen?",
        "Hallo! Was kann ich für dich tun?"
      ],
      farewell: [
        "Auf Wiedersehen! Komm bald wieder.",
        "Bis zum nächsten Mal!",
        "Tschüss! Schön, dass du da warst."
      ],
      thanks: [
        "Gerne! Kann ich sonst noch etwas für dich tun?",
        "Kein Problem! Ich helfe gerne weiter.",
        "Bitte schön! Ich stehe dir jederzeit zur Verfügung."
      ],
      how_are_you: [
        "Mir geht es gut, danke der Nachfrage! Wie kann ich dir helfen?",
        "Ich bin immer bereit zu helfen! Was kann ich für dich tun?",
        "Danke der Nachfrage! Ich bin startklar für deine Fragen."
      ],
      who_are_you: [
        "Ich bin dein Assistent und helfe dir bei Fragen rund um unseren Service.",
        "Ich bin ein KI-Assistent, der entwickelt wurde, um dir bei Fragen zu helfen.",
        "Ich bin ein digitaler Assistent und stehe für deine Fragen zur Verfügung."
      ]
    },
    en: {
      greeting: [
        "Hello! Nice to hear from you!",
        "Hi there! How can I help you?",
        "Hello! What can I do for you?"
      ],
      farewell: [
        "Goodbye! Come back soon.",
        "See you next time!",
        "Bye! It was nice talking to you."
      ],
      thanks: [
        "You're welcome! Is there anything else I can help with?",
        "No problem! Happy to help.",
        "My pleasure! I'm here if you need anything else."
      ],
      how_are_you: [
        "I'm doing well, thanks for asking! How can I help you?",
        "I'm always ready to help! What can I do for you?",
        "Thanks for asking! I'm all set to answer your questions."
      ],
      who_are_you: [
        "I'm your assistant, helping with questions about our service.",
        "I'm an AI assistant designed to help with your questions.",
        "I'm a digital assistant, available to answer your questions."
      ]
    }
  },

  // Funktions-bezogene Antworten (unverändert)
  function: {
    de: {
      function_change_password: "Du kannst dein Passwort in deinen Profileinstellungen ändern. Navigiere zum Menü 'Mein Konto' und dann zum Tab 'Passwort & Sicherheit'.",
      function_reset_password: "Um dein Passwort zurückzusetzen, klicke auf der Login-Seite auf 'Passwort vergessen' und folge den Anweisungen, die wir dir per E-Mail senden.",
      function_logout: "Um dich abzumelden, klicke oben rechts auf deinen Namen und wähle 'Abmelden' aus dem Dropdown-Menü.",
      function_give_feedback: "Danke für deine Bereitschaft! Du kannst Feedback über den 'Feedback'-Button in den Einstellungen einreichen oder uns eine E-Mail an feedback@example.com senden.",
      function_find_specific_content: "Ich kann dir helfen, Inhalte zu finden. Was genau suchst du?",
      function_contact_support: "Unser Support-Team ist per E-Mail unter support@example.com oder telefonisch unter +49 123 456789 erreichbar.",
      function_delete_account: "Um deinen Account zu löschen, gehe zu den Kontoeinstellungen und wähle 'Account löschen'. Bitte beachte, dass dies alle deine Daten unwiderruflich entfernt.",
      default: "Ich verstehe deinen Wunsch. Diese Funktion kann ich noch nicht direkt ausführen. Bitte versuche es über das entsprechende Menü in der App."
    },
    en: {
      function_change_password: "You can change your password in your profile settings. Navigate to the 'My Account' menu and then to the 'Password & Security' tab.",
      function_reset_password: "To reset your password, click on 'Forgot password' on the login page and follow the instructions we send to your email.",
      function_logout: "To log out, click on your name in the top right corner and select 'Log out' from the dropdown menu.",
      function_give_feedback: "Thanks for your willingness! You can submit feedback via the 'Feedback' button in the settings or send us an email at feedback@example.com.",
      function_find_specific_content: "I can help you find content. What exactly are you looking for?",
      function_contact_support: "Our support team can be reached via email at support@example.com or by phone at +49 123 456789.",
      function_delete_account: "To delete your account, go to account settings and select 'Delete account'. Please note that this will irrevocably remove all your data.",
      default: "I understand your request. I can't execute this function directly yet. Please try using the corresponding menu in the app."
    }
  },

  // FAQ-bezogene Antworten (unverändert)
  faq: {
    de: {
      faq_find_invoice: "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.",
      faq_pricing_info: "Unser Basispaket beginnt bei 9,99€ pro Monat. Premium-Funktionen sind für 19,99€ verfügbar. Alle Pakete können monatlich oder jährlich abgerechnet werden, wobei du bei jährlicher Zahlung 20% sparst.",
      faq_cancel_subscription: "Du kannst dein Abonnement jederzeit in deinen Kontoeinstellungen unter 'Abonnement verwalten' kündigen. Die Kündigung wird zum Ende deiner aktuellen Zahlungsperiode wirksam.",
      default: "Hier ist eine Antwort auf deine Frage. Falls du weitere Details benötigst, kannst du gerne nachfragen."
    },
    en: {
      faq_find_invoice: "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically.",
      faq_pricing_info: "Our basic package starts at $9.99 per month. Premium features are available for $19.99. All packages can be billed monthly or annually, with annual payment saving you 20%.",
      faq_cancel_subscription: "You can cancel your subscription anytime in your account settings under 'Manage Subscription'. The cancellation will take effect at the end of your current billing period.",
      default: "Here's an answer to your question. If you need more details, feel free to ask."
    }
  }
};

// Definierte Liste der Smalltalk-Intents, die direkt aus der Registry bedient werden (unverändert)
// Alle anderen gehen an den Smalltalk-Service (Database)
const REGISTRY_SERVED_SMALLTALK = [
  'greeting',
  'farewell',
  'thanks',
  'how_are_you',
  'who_are_you'
];

/**
 * Optimierte Funktion zum Kopieren des GPT-2 Modells mit umfassender Fehlerbehandlung
 * und Unterstützung für verschiedene Quell- und Zielpfade
 */
async function copyModelFilesToNodeModules(): Promise<boolean> {
  console.log('⏳ Starte Modellkopier-Prozess...');

  try {
    // Definition aller möglichen Quellpfade in Prioritätsreihenfolge
    const modelName = 'gpt2-small';
    const possibleSourcePaths = [
      path.join(process.cwd(), 'models', modelName),
      path.join(process.cwd(), 'src', 'models', modelName),
      path.join(process.cwd(), 'public', 'models', modelName),
      path.join(process.cwd(), 'app', 'models', modelName)
    ];

    // Zwei verschiedene Zielpfadvarianten testen
    // Variante 1: Neue Struktur für @xenova/transformers >= 2.6
    const xenovaBasePath1 = path.join(
      process.cwd(),
      'node_modules',
      '@xenova',
      'transformers',
      'dist',
      'models'
    );

    // Variante 2: Ältere Struktur für @xenova/transformers < 2.6
    const xenovaBasePath2 = path.join(
      process.cwd(),
      'node_modules',
      '@xenova',
      'transformers',
      'models'
    );

    // Teste beide Pfade und wähle den existierenden
    // Fallback zur älteren Struktur, falls die neue nicht existiert
    let xenovaBasePath = xenovaBasePath2; // Standard: ältere Struktur
    try {
        await access(xenovaBasePath1);
        xenovaBasePath = xenovaBasePath1; // Neue Struktur existiert, verwenden
        console.log(`📂 Verwende Basis-Zielpfad (neue Struktur): ${xenovaBasePath}`);
    } catch {
        console.log(`📂 Verwende Basis-Zielpfad (ältere Struktur, neue nicht gefunden): ${xenovaBasePath}`);
    }

    // Vollständige Zielpfade
    const targetBaseDir = path.join(xenovaBasePath, modelName);
    const targetOnnxDir = path.join(targetBaseDir, 'onnx');

    console.log(`📂 Vollständiger Zielordner für Modell: ${targetBaseDir}`);
    console.log(`📂 ONNX-Zielordner: ${targetOnnxDir}`);

    // Finde einen gültigen Quellpfad
    let validSourcePath: string | null = null;

    for (const sourcePath of possibleSourcePaths) {
      try {
        await access(sourcePath);
        // Prüfe, ob eine der relevanten Modelldateien existiert (z.B. config.json oder .onnx)
        const hasConfigFile = fs.existsSync(path.join(sourcePath, 'config.json'));
        const hasOnnxFile1 = fs.existsSync(path.join(sourcePath, 'model.onnx'));
        const hasOnnxFile2 = fs.existsSync(path.join(sourcePath, 'onnx', 'decoder_model_merged.onnx'));

        if (hasConfigFile || hasOnnxFile1 || hasOnnxFile2) {
          validSourcePath = sourcePath;
          console.log(`✅ Gültiger Quellpfad gefunden: ${sourcePath}`);
          // Fügen Sie hier eine Logik hinzu, um die tatsächlich gefundenen relevanten Dateien zu bestätigen
          if (hasConfigFile) console.log(` - config.json gefunden`);
          if (hasOnnxFile1) console.log(` - model.onnx gefunden`);
          if (hasOnnxFile2) console.log(` - onnx/decoder_model_merged.onnx gefunden`);
          break;
        } else {
          console.log(`⚠️ Pfad existiert, aber benötigte Modelldateien (config.json, .onnx) fehlen: ${sourcePath}`);
        }
      } catch {
        console.log(`❌ Quellpfad nicht verfügbar: ${sourcePath}`);
      }
    }

    if (!validSourcePath) {
      console.error('🚫 Kein gültiger Quellpfad für Modelldateien gefunden!');
      return false;
    }

    // Zielverzeichnisse erstellen
    await mkdir(targetBaseDir, { recursive: true });
    await mkdir(targetOnnxDir, { recursive: true });
    console.log(`📁 Zielverzeichnisse erstellt/verifiziert`);

    // Dateien kopieren mit Statusverfolgung
    let copiedCount = 0;
    let copiedOnnx = false;
    let copiedOnnxQuantized = false;
    let copiedNonOnnxCount = 0;


    // Liste der Dateien, die kopiert werden sollen (alle relevanten, auch wenn sie in Unterordnern liegen)
    // FIX: TypeScript Fehler 2322 - Specify encoding to ensure string[] return type
    const filesToCopy: string[] = fs.readdirSync(validSourcePath, { recursive: true, encoding: 'utf8' });
    console.log(`📁 Gefundene Dateien im Quellpfad: ${validSourcePath}`, filesToCopy);


    for (const fileRelative of filesToCopy) {
        const sourcePathFull = path.join(validSourcePath, fileRelative);
        // targetBaseDir und fileRelative sind Strings. path.join gibt String zurück.
        const targetPathFullBase = path.join(targetBaseDir, fileRelative);

        let targetPathEffective: string;
        let isOnnxFile = false;

        // Sicherstellen, dass es sich um eine Datei handelt, keine Verzeichnisse
        try {
            const stats = fs.statSync(sourcePathFull);
            if (!stats.isFile()) {
                 console.log(`⏭️ Überspringe Verzeichnis/Socket etc: ${sourcePathFull}`);
                 continue;
            }
        } catch (statError) {
            console.warn(`⚠️ Fehler beim Statten von Datei ${sourcePathFull}, überspringe.`, statError);
            continue;
        }


        // Spezifische Behandlung für ONNX-Dateien, die ins 'onnx' Unterverzeichnis müssen
        // fileRelative ist hier sicher ein String. endsWith ist korrekt.
        if (fileRelative.endsWith('.onnx') || fileRelative.endsWith('.onnx.json')) {
             // Konstruiere den Zielpfad IMMER im ONNX-Unterverzeichnis
             const onnxFileName = path.basename(fileRelative); // Nur Dateiname beibehalten
             targetPathEffective = path.join(targetOnnxDir, onnxFileName);
             isOnnxFile = true;

             if (onnxFileName.includes('quantized')) {
                 copiedOnnxQuantized = true;
             } else {
                 copiedOnnx = true;
             }

        } else {
            // Andere Dateien (config, tokenizer, vocab etc.) in den Basisordner
             // Stelle sicher, dass der relative Pfad korrekt übernommen wird
             targetPathEffective = path.join(targetBaseDir, fileRelative);
             copiedNonOnnxCount++;
        }


        try {
             // Stelle sicher, dass das Zielverzeichnis für die Datei existiert
             await mkdir(path.dirname(targetPathEffective), { recursive: true });

             // sourcePathFull und targetPathEffective sind Strings. copyFile erwartet Strings.
             await copyFile(sourcePathFull, targetPathEffective);
             console.log(`✅ Kopiert: ${sourcePathFull} nach ${targetPathEffective}`);
             copiedCount++;
        } catch (copyError) {
             console.error(`❌ Fehler beim Kopieren von ${sourcePathFull} nach ${targetPathEffective}:`, copyError);
             // Bei Kopierfehler abbrechen oder weitermachen? Für Robustheit weitermachen, aber loggen.
        }
    }

    // FIX: TypeScript Fehler 2365 - Addition von Booleans ist kein Standard.
    // Verwenden Sie bedingten Ausdruck (true ? 1 : 0) oder Number().
    const totalOnnxCopiesReported = Number(copiedOnnx) + Number(copiedOnnxQuantized);
    console.log(`📊 ${copiedCount} Dateien wurden kopiert (${copiedNonOnnxCount} nicht-ONNX, ${totalOnnxCopiesReported} ONNX Varianten)`);

    // Verifiziere kritische ONNX-Dateien im ZIEL-ONNX-Ordner
    const targetOnnxFiles = fs.readdirSync(targetOnnxDir);
    const foundQuantized = targetOnnxFiles.some(f => f.includes('quantized') && f.endsWith('.onnx'));
    const foundRegular = targetOnnxFiles.some(f => !f.includes('quantized') && f.endsWith('.onnx'));

    if (foundQuantized || foundRegular) {
        console.log(`✅ ONNX-Verifizierung im Ziel (${targetOnnxDir}) erfolgreich:`);
        if (foundQuantized) console.log(` - Quantisierte ONNX-Datei(en) gefunden`);
        if (foundRegular) console.log(` - Reguläre ONNX-Datei(en) gefunden`);
         if (copiedOnnx && !foundRegular) console.warn(`⚠️ ONNX Kopie gemeldet, aber reguläre Datei nicht im Ziel gefunden!`);
         if (copiedOnnxQuantized && !foundQuantized) console.warn(`⚠️ ONNX Quantized Kopie gemeldet, aber quantized Datei nicht im Ziel gefunden!`);

    } else {
      console.warn(`⚠️ WARNUNG: Es wurde KEINE .onnx Datei im Ziel-ONNX-Ordner gefunden!`);
      return false; // Betrachten wir als Fehler, wenn keine ONNX-Datei ankommt
    }

    // Verifiziere kritische NICHT-ONNX Dateien im ZIEL-Basisordner
    const targetBaseFiles = fs.readdirSync(targetBaseDir);
    const hasConfigJson = targetBaseFiles.includes('config.json');
    const hasVocabJson = targetBaseFiles.includes('vocab.json'); // Beispiel
    const hasTokenizerJson = targetBaseFiles.includes('tokenizer.json'); // Beispiel
    const hasMergesTxt = targetBaseFiles.includes('merges.txt'); // Beispiel
    const hasSpecialTokensMapJson = targetBaseFiles.includes('special_tokens_map.json'); // Beispiel
    const hasTokenizerConfigJson = targetBaseFiles.includes('tokenizer_config.json'); // Beispiel


    // Fügen Sie hier weitere kritische Dateien hinzu, die ein Modell benötigt
    const neededNonOnnxFiles = [
        'config.json',
        'vocab.json',
        'tokenizer.json',
        'merges.txt',
        'special_tokens_map.json',
        'tokenizer_config.json',
    ];
    const missingNonOnnxFiles = neededNonOnnxFiles.filter(file => !targetBaseFiles.includes(file));

    if (missingNonOnnxFiles.length === 0) {
         console.log(`✅ Nicht-ONNX Verifizierung im Ziel (${targetBaseDir}) erfolgreich: Alle kritischen Dateien gefunden.`);
    } else {
         console.warn(`⚠️ WARNUNG: Es fehlen kritische Nicht-ONNX Dateien im Ziel (${targetBaseDir}):`, missingNonOnnxFiles.join(', '));
         // Je nach Kritikalität hier ggf. false zurückgeben
         // return false; // Wenn z.B. config.json fehlt, ist das Modell unbrauchbar
    }


    // Erfolg, wenn Dateien kopiert wurden UND mindestens eine ONNX da ist
    return copiedCount > 0 && (foundQuantized || foundRegular);

  } catch (error) {
    console.error(`🚨 Fehler beim Kopieren der Modelldateien:`, error);
    return false;
  }
}


// Kopiere die Dateien beim ersten Aufruf der API (oder beim Start, falls möglich)
// Dies ist eine einfache Flagge, die in einer produktiven Serverless-Umgebung
// möglicherweise nicht zuverlässig über Anfragen hinweg funktioniert.
// Für den Dev-Modus ist sie aber nützlich.
let filesReady = false;


// --- HILFSFUNKTIONEN FÜR ANTWORTEN (unverändert) ---
/**
 * Funktion zum Abrufen einer zufälligen Antwort aus einem Array (unverändert)
 */
function getRandomResponse(responses: string[]): string {
  if (!responses || responses.length === 0) {
    return "";
  }
  const randomIndex = Math.floor(Math.random() * responses.length);
  return responses[randomIndex] ?? "";
}

/**
 * Prüft, ob die Nachricht eine Anfrage nach Rechnungen enthält (unverändert)
 */
function isInvoiceQuery(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const invoiceKeywords = ['rechnung', 'rechnungen', 'invoice', 'invoices', 'payment', 'zahlung', 'bezahlung', 'quittung', 'kosten']; // Mehr Keywords hinzugefügt
  return invoiceKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Gibt eine spezifische Antwort für Rechnungsanfragen (unverändert)
 */
function getInvoiceResponse(language: Language): string {
  return language === 'en'
    ? "You can find your invoices in your account area under 'My Invoices'. All your payments and invoices are listed there chronologically."
    : "Deine Rechnungen findest du in deinem Kontobereich unter 'Meine Rechnungen'. Dort sind alle Zahlungen und Rechnungen chronologisch aufgelistet.";
}


/**
 * Funktion zum Abrufen der passenden Antwort für einen Intent (unverändert)
 * Diese Funktion wird nur aufgerufen, wenn KEINE generierte Antwort vom LLM kommt
 */
async function getResponseForIntent(
  intentName: string,
  intentType: string,
  entities: any[],
  language: Language,
  userMessage: string // Die ursprüngliche Benutzernachricht kann hier relevant sein
): Promise<string> {
  console.log(`[API] Suche Antwort für Intent: ${intentName} (${intentType}) (Falllback/Regel-basiert)`);

  // Prüfe zuerst, ob es eine Frage nach Rechnungen ist (wiederholen wir hier als zusätzliche Sicherheit, falls LLM nicht antwortet)
  if (isInvoiceQuery(userMessage)) {
    console.log(`[API] Erkenne Rechnungsanfrage in: "${userMessage}" (Fallback)`);
    return getInvoiceResponse(language);
  }

  try {
    switch (intentType.toLowerCase()) {
      case INTENT_TYPES.FAQ:
        // FAQ-Antworten direkt aus der Registry oder alternativ aus dem Service abrufen
        console.log(`[API] Hole FAQ-Antwort für Intent: ${intentName} (Fallback/Regel-basiert)`);

        // Prüfe, ob wir eine direkte Antwort in der Registry haben
        const faqResponses = RESPONSE_REGISTRY.faq[language];
        if (faqResponses && intentName in faqResponses) {
          const response = faqResponses[intentName as keyof typeof faqResponses];
          console.log(`[API] Direkte FAQ-Antwort gefunden für: ${intentName} (Fallback)`);
          return response;
        }

        // Fallback zum Service (falls implementiert und verwendet)
        try {
           // Dynamischer Import des FAQ Service
           const { getFaqResponse } = await import('../../../../features/faq/service'); // Relativer Pfad
           const faqServiceResponse = await getFaqResponse(intentName, entities, language);
            if (faqServiceResponse) {
                console.log(`[API] FAQ-Antwort vom Service erhalten für: ${intentName} (Fallback)`);
                return faqServiceResponse;
            }
        } catch (serviceError) {
             console.error(`[API] Fehler beim Abrufen der FAQ-Antwort vom Service:`, serviceError);
        }


        // Fallback, wenn weder Registry noch Service eine Antwort liefern
        console.log(`[API] Keine spezifische FAQ-Antwort in Registry oder Service gefunden für: ${intentName}, verwende Fallback`);
        return RESPONSE_REGISTRY.fallback[language].unknown;


      case INTENT_TYPES.SMALLTALK:
        // Smalltalk-Antworten direkt oder aus dem Service abrufen
        console.log(`[API] Verarbeite Smalltalk-Intent: ${intentName} (Fallback/Regel-basiert)`);

        // Extrahieren des Basis-Namens ohne "smalltalk_" Präfix
        const basicName = intentName.replace(/^smalltalk_/i, '');

        // Prüfen, ob dieser Smalltalk-Intent aus der Registry bedient werden soll
        if (REGISTRY_SERVED_SMALLTALK.includes(basicName)) {
          // Überprüfe, ob wir eine direkte Antwort in der Registry haben
          const smalltalkLang = RESPONSE_REGISTRY.smalltalk[language];
          if (smalltalkLang && basicName in smalltalkLang) {
            const smalltalkResponses = smalltalkLang[basicName as keyof typeof smalltalkLang];

            if (Array.isArray(smalltalkResponses) && smalltalkResponses.length > 0) {
              console.log(`[API] Direkte Smalltalk-Antwort gefunden für: ${basicName} (Fallback)`);
              return getRandomResponse(smalltalkResponses);
            }
          }
        }

        // Fallback auf den Smalltalk-Service für alle anderen Smalltalk-Intents (falls implementiert und verwendet)
        console.log(`[API] Keine direkte Antwort in Registry, versuche Smalltalk-Service für: ${intentName} (Fallback)`);
        try {
             // Dynamischer Import des Smalltalk Service
            const { getSmalltalkResponse } = await import('../../../../features/smalltalk/service'); // Relativer Pfad
            const smalltalkServiceResponse = await getSmalltalkResponse(intentName, entities, language);
            if (smalltalkServiceResponse) {
                 console.log(`[API] Smalltalk-Antwort vom Service erhalten für: ${intentName} (Fallback)`);
                 return smalltalkServiceResponse;
            }
        } catch (serviceError) {
             console.error(`[API] Fehler beim Abrufen der Smalltalk-Antwort vom Service:`, serviceError);
        }

        // Fallback, wenn weder Registry noch Service eine Antwort liefern
        console.log(`[API] Keine Smalltalk-Antwort in Registry oder Service gefunden für: ${intentName}, verwende Fallback`);
        return RESPONSE_REGISTRY.fallback[language].unknown;


      case INTENT_TYPES.FUNCTION:
        // Antworten für Funktions-Intents aus der Registry abrufen
        console.log(`[API] Verarbeite Funktions-Intent: ${intentName} (Fallback/Regel-basiert)`);

        // Abrufen der entsprechenden Funktionsantwort oder Standardantwort
        const functionResponses = RESPONSE_REGISTRY.function[language];

        if (intentName in functionResponses) {
          // Die Eigenschaft wird sicher als string getypt
          const response = functionResponses[intentName as keyof typeof functionResponses];
          console.log(`[API] Direkte Funktions-Antwort gefunden für: ${intentName} (Fallback)`);
          return response;
        } else {
          console.log(`[API] Keine spezifische Funktions-Antwort in Registry gefunden für: ${intentName}, verwende Standard (Fallback)`);
          return functionResponses.default;
        }

      default:
        console.log(`[API] Unbekannter Intent-Typ: ${intentType}, verwende Fallback für unbekannten Intent`);
        return RESPONSE_REGISTRY.fallback[language].unknown;
    }
  } catch (error) {
    console.error(`[API] Schwerwiegender Fehler beim Abrufen der Fallback/Regel-basierten Antwort für Intent ${intentName}:`, error);
    return RESPONSE_REGISTRY.fallback[language].error; // Immer eine Fehlerantwort liefern
  }
}


/**
 * Hauptfunktion für die API-Route
 */
export async function POST(request: Request) {
  console.log("[API] Chatbot response route aufgerufen");
  let botResponseText = '';
  // Initialize with default language that's guaranteed to be valid
  const defaultLanguage: Language = 'de'; // Sicherstellen, dass dies immer gesetzt ist

  try {
    // --- SICHERSTELLEN, DASS ONNX RUNTIME INITIALISIERT IST ---
    // Dies muss passieren, BEVOR die NLP Engine initialisiert wird,
    // da die Engine und JSLLM ONNX Runtime für das LLM benötigen.
    console.log("[API] Sicherstellen, dass ONNX Runtime initialisiert ist...");
    try {
       // getOnnxRuntime wartet, falls Initialisierung läuft, oder führt sie einmal durch
       // Dies sollte sicherstellen, dass globalThis.onnxruntime gesetzt ist, wenn die Engine geladen wird.
       await getOnnxRuntime();
       console.log("[API] ONNX Runtime Initialisierung abgeschlossen.");
    } catch (onnxInitError) {
       // Dies sollte nur bei einem schwerwiegenden Fehler im getOnnxRuntime selbst auftreten (z.B. Modul nicht gefunden)
       console.error("[API] Schwerwiegender Fehler bei der ONNX Runtime Initialisierung (im getOnnxRuntime):", onnxInitError);
       // Wir protokollieren den Fehler und fahren fort. Die LLM-Initialisierung wird fehlschlagen,
       // aber der Fallback-Generator in JSLLM sollte aktiv werden.
    }
    // --- ENDE ONNX INITIALISIERUNG ---


    // --- MODELDATEIEN KOPIEREN ---
    // Die Modellkopier-Logik muss nach der ONNX Initialisierung erfolgen,
    // da der Zielpfad für die ONNX-Dateien von der @xenova/transformers Version abhängen kann,
    // die wiederum importiert werden muss (was getOnnxRuntime indirekt tut, falls noch nicht geschehen).
    if (!filesReady) {
      console.log("[API] Erste Ausführung: Kopiere Modelldateien nach node_modules...");
      // copyModelFilesToNodeModules wurde aktualisiert, um robustere Pfade zu verwenden und TypeScript-Fehler zu beheben
      filesReady = await copyModelFilesToNodeModules();
      if (!filesReady) {
        // Fehler beim Kopieren, sinnvolle Fehlermeldung zurückgeben
        console.error("[API] Fehler beim Kopieren der Modelldateien, Chatbot kann nicht gestartet werden.");
        // Verwenden Sie den Fallback-Error in der Default-Sprache
        return NextResponse.json({ response: RESPONSE_REGISTRY.fallback[defaultLanguage].error }, { status: 500 });
      }
      console.log("[API] Kopieren der Modelldateien abgeschlossen.");
    }
    // --- ENDE KOPIER-LOGIK ---


    // Nachricht aus der Anfrage extrahieren (unverändert)
    const body = await request.json();
    const messageContent: string = body.message || '';
    const language: Language = (body.language || defaultLanguage) as Language; // Sicherstellen des Typs

    if (!messageContent) {
      console.warn("[API] Anfrage ohne Nachricht erhalten.");
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    console.log(`[API] Verarbeite Nachricht: "${messageContent}" in ${language}`);

    // DIREKTE ÜBERPRÜFUNG AUF KRITISCHE ANFRAGEN (Rechnungen, Kündigung etc.) (unverändert)
    // Diese Logik greift IMMER, auch wenn das LLM nicht lädt oder nicht verwendet wird.
    if (isInvoiceQuery(messageContent)) {
      console.log('[API] Erkenne Rechnungsanfrage, liefere direkte Antwort (Vorkonfiguriert)');
      botResponseText = getInvoiceResponse(language);

      console.log(`[API] Sende direkte Rechnungsantwort: "${botResponseText.substring(0, 50)}${botResponseText.length > 50 ? '...' : ''}"`);
      return NextResponse.json({ response: botResponseText });
    }

    // --- HAUPT-NLP-VERARBEITUNG ---
    try {
      // Importiere die NLP-Engine (erst jetzt, nachdem ONNX initialisiert sein sollte)
      console.log("[API] Importiere NLP-Engine...");
      // getEngine stellt sicher, dass die Singleton-Instanz initialisiert ist (lädt Basis-Modelle)
      const engine = await getEngine();
      console.log("[API] NLP-Engine Instanz erhalten.");


      // Initialisiere den generativen Modus (LLM).
      // initializeGenerativeMode versucht, das LLM zu laden, oder schaltet auf Fallback um.
      // Wir fangen den Fehler, falls initializeGenerativeMode selbst eine Exception wirft.
      let generativeModeStatus: GenerativePipelineStatus = { isReady: false, fallbackMode: true, modelName: 'none' }; // Standardstatus: nicht bereit, Fallback aktiv
      try {
           // initializeGenerativeMode versucht, das echte LLM zu laden.
           // Unabhängig vom Erfolg, sollte die GenerativePipeline eine Statusmethode haben.
           await engine.initializeGenerativeMode();

           // FIX: TypeScript Fehler 2339 - Stellen Sie sicher, dass die NLPEngine eine Methode getGenerativePipelineStatus hat,
           // die ein Objekt vom Typ GenerativePipelineStatus zurückgibt.
           // Der Aufruf wird mit Typ-Assertion durchgeführt, falls die Methode nicht existiert.
           if (typeof (engine as any).getGenerativePipelineStatus === 'function') {
               // Der Status wird synchron zurückgegeben, wie in JSLLM/GenerativePipeline implementiert
               generativeModeStatus = (engine as any).getGenerativePipelineStatus() as GenerativePipelineStatus;
           } else {
               console.warn("[API] NLPEngine.getGenerativePipelineStatus Methode nicht gefunden.");
               // Bleiben Sie beim Standard-Fallback-Status
           }


           console.log(`[API] Generativer Modus Status: Ready=${generativeModeStatus.isReady}, Fallback=${generativeModeStatus.fallbackMode}, Model=${generativeModeStatus.modelName}`);


      } catch (genInitError) {
        console.error('[API] Unerwarteter Fehler während des Aufrufs von initializeGenerativeMode:', genInitError);
         // Wenn initializeGenerativeMode eine Exception wirft, ist der generative Modus wahrscheinlich nicht nutzbar,
         // aber der Fallback sollte in der Prozessierung greifen.
         generativeModeStatus = { isReady: false, fallbackMode: true, modelName: 'error' }; // Status nach Fehler
        console.log('[API] Generativer Modus Initialisierung schlug fehl.');
      }

      // Bestimmen Sie, ob das ECHTE LLM geladen wurde (nicht nur Fallback)
      const realLLMLoaded = generativeModeStatus.isReady && !generativeModeStatus.fallbackMode;


      // Starte die Haupt-NLP-Verarbeitung (Intent, Entity, Kontext, UND Generierung, falls aktiv)
      // processMessage ruft die generative Pipeline intern auf, wenn sie im Engine-Status als nutzbar markiert ist.
      console.log("[API] Starte processMessage...");
      // processMessage liefert jetzt auch die generierte Antwort, wenn der generative Modus aktiv war und erfolgreich generierte.
      const processingResult = await engine.processMessage(messageContent, language);

      // Protokolliere das Ergebnis für Debugging-Zwecke
      console.log("[API] processMessage Ergebnis:", JSON.stringify({
        intentName: processingResult?.intent?.name,
        intentType: processingResult?.intent?.type,
        intentConfidence: processingResult?.intent?.confidence,
        entitiesCount: processingResult?.entities?.length,
        hasGeneratedResponse: !!processingResult?.generatedResponse, // Check if the result object contains a generatedResponse
        realLLMLoaded: realLLMLoaded // Log if the real LLM was successfully loaded
      }));


      // --- ANTWORTGENERIERUNG ---

      // 1. Wenn processMessage eine generierte Antwort geliefert hat, verwenden wir diese (vom echten LLM oder Fallback-Generator)
      if (processingResult?.generatedResponse && processingResult.generatedResponse.trim().length > 0) {
        console.log(`[API] Verwende generierte Antwort vom LLM/Fallback (${processingResult.generatedResponse.length} Zeichen)`);
        botResponseText = processingResult.generatedResponse;

        // Optional: Überprüfen, ob die generierte Antwort generisch ist und ggf. durch eine Regel-basierte ersetzen (Hybridstrategie)
        // Diese Logik wird nur aktiv, wenn Sie den generativen Modus nutzen und eine Hybridstrategie wünschen.
        // Beispiel (auskommentiert gelassen, da nicht im Plan):
        // if (realLLMLoaded && isGenericGeneratedResponse(botResponseText, language)) { ... }


      }
      // 2. Wenn processMessage KEINE oder eine leere generierte Antwort geliefert hat
      else {
        console.log("[API] Keine oder leere generierte Antwort erhalten, verwende Regel-basierte/Fallback-Logik.");
        const intent = processingResult?.intent;
        const entities = processingResult?.entities || [];

        if (intent && intent.name) {
          console.log(`[API] Intent erkannt: ${intent.name} (${intent.type || 'unknown'}) mit Konfidenz ${intent.confidence || 0}`);

          // Bestimme Konfidenz-Schwellenwert basierend auf Intent-Typ
          const intentType = (intent.type || 'unknown').toLowerCase();
          const thresholds = config.nlp?.intentThresholds?.byType || {};
          // FIX: TypeScript Fehler 2339 - Stellen Sie sicher, dass config.nlp.intentThresholds?.default sicher behandelt wird.
          // Verwenden Sie den Nullish Coalescing Operator für den gesamten Ausdruck.
          const defaultThreshold = config.nlp?.intentThresholds?.medium ?? 0.5; // Fallback für den Default-Wert
          const threshold = (
            intentType in thresholds
              ? (thresholds[intentType as keyof typeof thresholds] ?? defaultThreshold)
              : defaultThreshold
          );


          // Prüfe Konfidenz gegen Schwellenwert
          if (intent.confidence !== undefined && intent.confidence >= threshold) { // Check confidence !== undefined
            console.log(`[API] Intent ${intent.name} hat ausreichende Konfidenz: ${intent.confidence} >= ${threshold}`);

            // Hole passende Antwort basierend auf Intent (Regel-basiert/Service)
            botResponseText = await getResponseForIntent(
              intent.name,
              intent.type || INTENT_TYPES.UNKNOWN,
              entities,
              language,
              messageContent // Originalnachricht übergeben
            );
             // Wenn getResponseForIntent einen leeren String zurückgibt, Fallback
             if (!botResponseText || botResponseText.trim().length === 0) {
                  console.warn(`[API] getResponseForIntent lieferte leere Antwort für ${intent.name}, verwende Fallback.`);
                  botResponseText = RESPONSE_REGISTRY.fallback[language].unknown;
             }
            console.log(`[API] Regel-basierte Antwort erhalten (${botResponseText.length} Zeichen)`);

          } else {
            console.log(`[API] Intent ${intent.name} hat zu niedrige Konfidenz: ${intent.confidence || 0} < ${threshold}`);
            botResponseText = RESPONSE_REGISTRY.fallback[language].lowConfidence;
          }
        } else {
          console.log('[API] Kein Intent erkannt, verwende Fallback');
          botResponseText = RESPONSE_REGISTRY.fallback[language].unknown;
        }
      }
      // --- ENDE ANTWORTGENERIERUNG ---


    } catch (processingError) {
      // Dies fängt Fehler in der NLP-Verarbeitung selbst
      console.error("[API] Fehler bei der Haupt-NLP-Verarbeitung:", processingError);
      console.error("[API] Stack-Trace:", processingError instanceof Error ? processingError.stack : "Kein Stack-Trace verfügbar");
      botResponseText = RESPONSE_REGISTRY.fallback[language].error; // Sicherstellen, dass eine Fehlerantwort geliefert wird
    }

    // Stelle sicher, dass am Ende immer eine Antwort zurückkommt
    if (!botResponseText || botResponseText.trim().length === 0) {
      console.warn("[API] Am Ende der Verarbeitung war botResponseText leer, verwende generischen Fallback.");
      botResponseText = RESPONSE_REGISTRY.fallback[language].error; // Oder einen allgemeineren Fallback
    }

    console.log(`[API] Sende finale Antwort: "${botResponseText.substring(0, 50)}${botResponseText.length > 50 ? '...' : ''}"`);

    // Sende die Antwort an den Client
    return NextResponse.json({ response: botResponseText });

  } catch (error) {
    // Dies fängt fatale Fehler im obersten try-Block ab (sehr unwahrscheinlich jetzt)
    console.error("[API] FATALER, UNERWARTETER FEHLER im POST Handler:", error);
    console.error("[API] Stack-Trace:", error instanceof Error ? error.stack : "Kein Stack-Trace verfügbar");

    // Verwenden Sie immer die Default-Sprache für den Fallback, um TypeScript-Fehler zu vermeiden
    return NextResponse.json({
      response: RESPONSE_REGISTRY.fallback[defaultLanguage].error
    });
  }
}

// Helper function example for hybrid strategy (unverändert, falls Sie diese Logic später nutzen möchten)
// function isGenericGeneratedResponse(response: string, language: Language): boolean {
//     const genericPhrasesDe = ["Ich verstehe deine Frage", "Lass mich darüber nachdenken", "Wie kann ich dir helfen"];
//     const genericPhrasesEn = ["I understand your question", "Let me think about it", "How can I help you"];
//     const genericPhrases = language === 'de' ? genericPhrasesDe : genericPhrasesEn;
//     const lowerResponse = response.toLowerCase();
//     return genericPhrases.some(phrase => lowerResponse.includes(phrase.toLowerCase()));
// }

// FIX: Diese Typdefinition wird nun lokal im File verwendet, da der Import fehlschlug
// Stellen Sie sicher, dass diese Definition mit dem übereinstimmt, was getGenerativePipelineStatus zurückgibt
// in engine.ts
// Sie können diese Definition auch in einem geteilten nlp.types.ts oder einem neuen File
// wie generativePipeline.types.ts definieren und von dort importieren.
// Solange der Import aus engine.ts nicht funktioniert, ist dies eine valide Lösung FÜR DIESES FILE.
/*
export type GenerativePipelineStatus = {
    isReady: boolean;
    fallbackMode: boolean;
    modelName: string;
};
*/