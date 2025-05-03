// Using type-only imports for all types (required with verbatimModuleSyntax)
import type { 
  Intent,
  NLPModel,
  Language,
  IntentDetectionOptions,
  IntentItem
} from '@/types/nlp.types';
import { config } from '../config';
import { basicTokenize, containsToken } from '../utils/tokenizer';

// IMPORTANT: The function loadJsonData must be exported from '../utils/jsonDataLoader'
// If not available, implementing a stub function below to avoid errors
// Implementation to be provided in ../utils/jsonDataLoader.ts
// For now, we'll create a local implementation
async function loadJsonData<T>(filePath: string): Promise<T> {
  console.warn(`[DEBUG] Using stub implementation of loadJsonData for ${filePath}`);
  try {
    // In a real implementation, this would load data from the file
    // For now, return an empty array or object to keep TypeScript happy
    return [] as unknown as T;
  } catch (error) {
    console.error(`[DEBUG] Error loading JSON data from ${filePath}:`, error);
    throw error;
  }
}

/**
 * Typensichere Version von Array.includes für Strings
 */
function stringInList(value: string | undefined | null, list: string[]): boolean {
  return typeof value === 'string' && list.includes(value);
}

/**
 * Typensichere Version von String.includes
 */
function stringContains(value: string | undefined | null, searchString: string): boolean {
  return typeof value === 'string' && value.includes(searchString);
}

/**
 * Typensichere Version von String.startsWith
 */
function stringStartsWith(value: string | undefined | null, prefix: string): boolean {
  return typeof value === 'string' && value.startsWith(prefix);
}

// Intent types as constants
const INTENT_TYPES = {
  FAQ: 'faq',
  SMALLTALK: 'smalltalk',
  FUNCTION: 'function',
  UNKNOWN: 'unknown'
} as const;

// Linguistic patterns for different languages
// Enhanced pattern recognition with comprehensive keywords and variations
const LINGUISTIC_PATTERNS = {
  de: {
    // Question words for better question detection
    questionWords: ['wie', 'was', 'wo', 'wann', 'warum', 'wieso', 'weshalb', 'welche', 'welcher', 'wer', 'wem', 'wen', 'inwiefern', 'wozu'],
    
    // Patterns for functional requests (for detecting function calls)
    functionPatterns: [
      { pattern: /passwort\s+(ändern|vergessen|neu|zurücksetzen|reset|wechseln|erneuern)/i, intent: 'function_change_password', confidence: 0.85 },
      { pattern: /abmelden|ausloggen|logout|session\s+beenden|abschalten/i, intent: 'function_logout', confidence: 0.85 },
      { pattern: /feedback\s+(geben|senden|mitteilen|teilen)/i, intent: 'function_give_feedback', confidence: 0.85 },
      { pattern: /(suche|finde|zeige|suchen|finden|zeigen)\s+(.+)/i, intent: 'function_find_specific_content', confidence: 0.8 },
      { pattern: /(kontakt|support|hilfe)\s+(team|kontaktieren|erreichen|ansprechen)/i, intent: 'function_contact_support', confidence: 0.85 },
      { pattern: /account\s+(löschen|entfernen|deaktivieren|kündigen)/i, intent: 'function_delete_account', confidence: 0.85 },
      { pattern: /(wie|wo)\s+(kann|kann\s+ich|könnte\s+ich)\s+(mein|das)\s+passwort/i, intent: 'function_change_password', confidence: 0.8 }
    ],
    
    // Word groups for different intent types for better classification
    // Added more synonyms and variations, especially for pricing/costs
    intentIndicators: {
      'faq_pricing_info': [
        'preis', 'preise', 'preisliste', 'preismodell', 'preisgestaltung', 
        'kosten', 'kostenpunkt', 'kostet', 'koste', 'kostenübersicht',
        'gebühr', 'gebühren', 'abo', 'abonnement', 'abos',
        'zahlen', 'bezahlen', 'zahlung', 'bezahlung', 'zahlungsmethode',
        'teuer', 'günstig', 'billig', 'wert', 'tarif', 'tarife',
        'wie viel', 'wieviel', 'preis-leistung', 'angebot', 'angebote',
        'monatlich', 'jährlich', 'finanzierung', 'finanzieren', 'geld',
        'rabatt', 'vergünstigung', 'gratis', 'kostenlos', 'umsonst',
        'probeabo', 'testversion', 'free', 'premium'
      ],
      'faq_premium_benefits': [
        'vorteil', 'vorteile', 'nutzen', 'mehrwert', 'gewinn', 
        'premium', 'premium-konto', 'premium-version', 'premium-funktionen',
        'lohnt', 'lohnenswert', 'lohnend', 'sinnvoll', 'rentabel',
        'bekomme', 'bekommen', 'erhalten', 'kriegen', 'bietet',
        'besser', 'verbesserung', 'optimierung', 'erweitert',
        'extra', 'zusätzlich', 'spezial', 'besonderheit', 'privilegien',
        'unterschied', 'vergleich', 'freischalten', 'upgrade', 'plus',
        'exklusiv', 'vip', 'pro', 'vollversion', 'komplett',
        'werbefrei', 'offline', 'unbegrenzt', 'uneingeschränkt'
      ],
      'faq_cancel_subscription': [
        'kündigen', 'kündigung', 'kündigungsfrist', 'kündigungsprozess',
        'stornieren', 'stornierung', 'storno', 'widerruf', 'widerrufen',
        'beenden', 'beendigung', 'beendigen', 'auflösen', 'auflösung',
        'abbestellen', 'abbestellung', 'abmelden', 'austragen',
        'vertrag', 'vertragsende', 'vertragslaufzeit', 'laufzeit',
        'wie kann ich', 'möchte', 'will', 'nicht mehr nutzen',
        'loswerden', 'entfernen', 'deaktivieren', 'schließen',
        'abbrechen', 'rückgängig', 'stoppen', 'abo beenden',
        'mitgliedschaft beenden', 'vertragsauflösung'
      ],
      'faq_find_invoice': [
        'rechnung', 'rechnungen', 'abbuchung', 'abbuchungen', 'zahlung', 'zahlungen', 
        'zahlungshistorie', 'beleg', 'quittung', 'invoice', 'rechnungsübersicht',
        'belege', 'quittungen', 'zahlungsbeleg', 'zahlungsbelege', 'rechnungskopie',
        'rechnung finden', 'rechnung einsehen', 'rechnung ansehen', 'rechnungshistorie',
        'zahlungsnachweis', 'kassenzettel', 'buchungsbeleg', 'kaufbeleg', 
        'kostennachweise', 'zahlungsnachweise', 'buchungsnachweis'
      ],
      'faq_feature_list': [
        'funktion', 'funktionen', 'features', 'feature', 'möglichkeiten',
        'können', 'kann', 'funktionsumfang', 'funktionsübersicht',
        'leistung', 'leistungen', 'option', 'optionen', 'angebot',
        'fähigkeiten', 'was kann', 'welche funktionen', 'was bietet',
        'umfang', 'welche features', 'leistungsmerkmale', 'eigenschaften',
        'was enthält', 'was beinhaltet', 'inhalt', 'inhalte'
      ],
      'faq_app_updates': [
        'update', 'updates', 'aktualisierung', 'aktualisierungen', 'version',
        'neu', 'neue', 'neuerung', 'änderung', 'verbessert', 
        'verbesserte', 'verbesserung', 'upgrade', 'aktuell',
        'entwicklung', 'veröffentlichung', 'release', 'features',
        'patchnotes', 'changelog', 'was ist neu', 'neuste'
      ],
      'faq_device_compatibility': [
        'kompatibel', 'kompatibilität', 'geräte', 'unterstützt', 'läuft',
        'system', 'betriebssystem', 'plattform', 'ios', 'android',
        'windows', 'mac', 'browser', 'app', 'tablet', 
        'smartphone', 'handy', 'welche geräte', 'version',
        'kompatibel mit', 'läuft auf', 'unterstützte geräte', 'systemvoraussetzungen',
        'kompatibilitätsliste', 'iphone', 'samsung'
      ],
      'faq_offline_mode': [
        'offline', 'ohne internet', 'ohne netz', 'ohne wifi', 'ohne wlan',
        'ohne daten', 'ohne datenverbindung', 'herunterladen', 'download',
        'speichern', 'flugmodus', 'verfügbar offline', 'datenvolumen', 
        'mobil', 'unterwegs', 'keine verbindung', 'funktioniert ohne',
        'nutzen offline', 'kein internet', 'kein netz'
      ],
      'faq_show_alternatives': [
        'alternative', 'alternativen', 'andere', 'ähnlich', 'vergleichbar',
        'konkurrenz', 'wettbewerb', 'ähnliche', 'andere anbieter', 'vergleich',
        'unterschied', 'anstatt', 'stattdessen', 'gleich wie', 'ähnlich wie',
        'besser als', 'schlechter als', 'apps wie', 'dienste wie', 'statt'
      ],
      'faq_how_subliminals_work': [
        'subliminal', 'subliminals', 'funktionsweise', 'wie funktioniert', 
        'wirkungsweise', 'wirken', 'wirkung', 'unterbewusstsein', 'mechanismus',
        'wie wirkt', 'technik', 'technologie', 'prinzip', 'methode',
        'unterschwellig', 'botschaft', 'affirmation', 'wahrnehmung',
        'unterschwellige', 'arbeitet', 'arbeiten', 'gehirn', 'frequenz'
      ],
      'faq_headphones_needed': [
        'kopfhörer', 'kopfhoerer', 'nötig', 'notwendig', 'erforderlich', 
        'brauchen', 'brauche', 'benötigen', 'benötige', 'benutzen',
        'kopfhörerpflicht', 'lautsprecher', 'boxen', 'stereo', 'mono',
        'binaural', 'beats', 'hörer', 'ohrhörer', 'inear', 'airpods'
      ],
      'faq_how_often_listen': [
        'wie oft', 'wie lange', 'häufigkeit', 'frequenz', 'dauer', 
        'regelmäßig', 'täglich', 'tägliche', 'wöchentlich', 'stunden',
        'minuten', 'tage', 'wochen', 'wiederholen', 'wiederholung',
        'empfehlung', 'sollte', 'dauert', 'maximale', 'mindestens',
        'genug', 'ausreichend', 'hördauer', 'zu oft', 'routine'
      ],
      'faq_download_offline': [
        'download', 'downloaden', 'herunterladen', 'speichern', 'offline',
        'anleitung', 'wie kann ich', 'wie kann man', 'verfügbar machen',
        'gespeichert', 'auf gerät', 'offline speichern', 'offline hören',
        'button', 'knopf', 'symbol', 'icon', 'verfügbar',
        'lokal', 'ohne internet', 'pfeil', 'downloadbutton'
      ],
      'faq_change_email': [
        'email', 'ändern', 'e-mail', 'adresse', 'aktualisieren', 
        'neue email', 'neue e-mail', 'mailadresse', 'anmeldeadresse',
        'kontaktdaten', 'anmeldung', 'profil', 'konto', 'account',
        'überschreiben', 'mail', 'kommunikation', 'korrektur',
        'aktivieren', 'primäre', 'hauptadresse'
      ],
      'faq_delete_account': [
        'löschen', 'account', 'konto', 'profil', 'daten', 'entfernen',
        'dauerhaft', 'permanent', 'schließen', 'kündigen', 'abmelden',
        'deaktivieren', 'beenden', 'auflösen', 'dsgvo', 'datenschutz',
        'recht auf vergessenwerden', 'vergessenwerden', 'entfernung',
        'löschung', 'nutzerdaten', 'persönlich', 'information'
      ],
      'faq_playback_error': [
        'wiedergabe', 'fehler', 'spielt nicht', 'problem', 'audio', 
        'ton', 'sound', 'hören', 'störung', 'geht nicht',
        'abspielen', 'playback', 'fehlermeldung', 'abstürzen', 'funktioniert nicht',
        'streaming', 'stoppt', 'stockt', 'hängt', 'puffern', 'pufferung',
        'lädt nicht', 'app crasht', 'kein ton', 'kein sound'
      ],
      'faq_login_error': [
        'login', 'anmelden', 'anmeldung', 'einloggen', 'fehler', 
        'problem', 'passwort', 'kennwort', 'falsch', 'zugang',
        'account', 'konto', 'authentifizierung', 'gesperrt', 'blockiert',
        'verweigert', 'nicht möglich', 'klappt nicht', 'fehlgeschlagen',
        'geht nicht', 'komme nicht rein', 'vergessen', 'zurücksetzen'
      ],
      'faq_data_security': [
        'daten', 'sicherheit', 'datenschutz', 'dsgvo', 'schutz', 
        'privatsphäre', 'privacy', 'sicher', 'verschlüsselung', 'verschlüsselt',
        'https', 'vertraulich', 'geschützt', 'hacker', 'gehackt',
        'gespeichert', 'speicherung', 'server', 'cloud', 'sammeln',
        'tracking', 'überwacht', 'speichern', 'anonymisiert', 'persönlich'
      ],
      'faq_scientific_basis': [
        'wissenschaftlich', 'wissenschaft', 'bewiesen', 'beweis', 'studie', 
        'studien', 'forschung', 'forscher', 'evidenz', 'nachweis',
        'belegt', 'glaubwürdig', 'seriös', 'effektiv', 'wirksamkeit',
        'fakten', 'referenz', 'quelle', 'zitation', 'validiert',
        'untersucht', 'bestätigt', 'experiment', 'methodik'
      ],
      'faq_medical_disclaimer': [
        'medizin', 'medizinisch', 'arzt', 'ärztlich', 'therapie', 
        'therapeut', 'behandlung', 'krank', 'krankheit', 'gesundheit',
        'heilung', 'heilen', 'diagnose', 'diagnostizieren', 'symptom',
        'ersatz', 'alternative', 'ergänzung', 'medikament', 'nebenwirkung',
        'hinweis', 'warnung', 'risiko', 'disclaimer', 'ausschluss'
      ],
      'smalltalk_greeting': [
        'hallo', 'hi', 'hey', 'grüß', 'gruß', 'grüß dich', 
        'tag', 'guten tag', 'guten morgen', 'guten abend',
        'moin', 'servus', 'mahlzeit', 'grüezi', 'grüßgott',
        'nabend', 'tach', 'tagchen', 'hallöchen', 'huhu',
        'hallihallo', 'na', 'jo', 'yo', 'gude'
      ],
      'smalltalk_farewell': [
        'tschüss', 'tschau', 'auf wiedersehen', 'bis später',
        'bye', 'ciao', 'adieu', 'ade', 'bis bald',
        'schönen tag', 'schönen abend', 'mach\'s gut', 'machs gut',
        'bis die tage', 'bis dann', 'au revoir', 'man sieht sich',
        'bis morgen', 'wir hören uns', 'aufwiedersehen', 'tschö',
        'tschüssikowski', 'tschüsschen', 'mach et jut'
      ],
      'smalltalk_thanks': [
        'danke', 'dank', 'danke dir', 'danke sehr', 'vielen dank',
        'bedanken', 'dankeschön', 'herzlichen dank', 'merci',
        'super', 'toll', 'klasse', 'perfekt', 'hervorragend',
        'danke für', 'dankbar', 'ich danke', 'besten dank',
        'vielen lieben dank', 'tausend dank', 'gracias', 'thank'
      ],
      'smalltalk_who_are_you': [
        'wer bist du', 'was bist du', 'wie heißt du', 
        'wie ist dein name', 'dein name', 'stelle dich vor',
        'stell dich vor', 'bot', 'chatbot', 'assistent',
        'ki', 'künstliche intelligenz', 'ai', 'wer spricht',
        'mit wem spreche ich', 'bist du ein mensch', 'menschlich',
        'programm', 'software', 'identität', 'vorstellen'
      ],
      'smalltalk_joke': [
        'witz', 'witze', 'joke', 'etwas lustiges', 'was lustiges',
        'zum lachen', 'lustig', 'humor', 'spaß', 'scherz',
        'unterhalte mich', 'erzähl mir einen witz', 'kennst du witze',
        'witzig', 'komisch', 'amüsant', 'zum schmunzeln', 'gag',
        'unterhaltung', 'lachen', 'einen witz', 'etwas komisches'
      ],
      'smalltalk_request_help': [
        'hilfe', 'helfen', 'hilfst', 'hilf', 'unterstützung',
        'unterstütze', 'hilfestellung', 'anleitung', 'erklärung',
        'wie funktioniert', 'wie geht', 'zeigen', 'zeig mir',
        'weiterhelfen', 'verstehe nicht', 'ratlos', 'verloren',
        'stehe auf dem schlauch', 'nicht weiter', 'festgefahren',
        'keinen plan', 'hinweis', 'tipp', 'tipps', 'orientierungslos'
      ],
      'smalltalk_compliment_bot': [
        'gut gemacht', 'hilfreich', 'toller bot', 'super app',
        'gefällt mir', 'nützlich', 'klug', 'danke', 'perfekt',
        'super', 'beeindruckend', 'toll', 'genial', 'schlau',
        'intelligent', 'brilliant', 'hervorragend', 'ausgezeichnet',
        'erstaunlich', 'besten', 'fantastisch', 'großartig', 'clever'
      ],
      'smalltalk_user_confused': [
        'verstehe nicht', 'nicht klar', 'was meinst du',
        'erklären', 'kapiere nicht', 'hä', 'keinen sinn',
        'verwirrend', 'versteh ich nicht', 'was bedeutet das',
        'nicht folgen', 'raff das nicht', 'unklar', 'kompliziert',
        'nicht verstehen', 'verwirrt', 'unverständlich', 'nicht nachvollziehbar',
        'zu hoch', 'wiederholen', 'langsamer'
      ],
      'smalltalk_ask_identity': [
        'wer bist du', 'was bist du', 'name', 'deine identität',
        'ki oder mensch', 'mensch oder ki', 'echt', 'robot',
        'chatbot', 'vorstellen', 'entwickelt', 'programmiert',
        'hersteller', 'gebaut', 'erfunden', 'entstanden',
        'humanoide', 'android', 'funktionsweise', 'menschlich',
        'künstliche intelligenz', 'arbeitsweise', 'funktion'
      ],
      'smalltalk_request_joke': [
        'witz', 'witze', 'erzähl einen witz', 'was lustiges',
        'bring mich zum lachen', 'etwas komisches', 'humorvoll',
        'joke', 'lustig', 'spaß', 'zum lachen', 'komisch',
        'humor', 'scherz', 'witzig', 'unterhaltsam', 'lustige geschichte',
        'was zum schmunzeln', 'kennst du witze', 'zum kichern'
      ],
      'smalltalk_affirmation': [
        'ja', 'okay', 'ok', 'klar', 'richtig', 'stimmt',
        'genau', 'sicher', 'natürlich', 'selbstverständlich', 'in ordnung',
        'jo', 'jep', 'jup', 'auf jeden fall', 'gerne',
        'alles klar', 'einverstanden', 'bestätige', 'akzeptiert',
        'verstanden', 'bestätigt', 'korrekt', 'mach das', 'tu das'
      ],
      'smalltalk_negation': [
        'nein', 'nicht', 'ne', 'nö', 'falsch', 'stimmt nicht',
        'eben nicht', 'niemals', 'keineswegs', 'keinesfalls', 'ablehnen',
        'ablehnung', 'abgelehnt', 'nicht wirklich', 'gar nicht',
        'will nicht', 'möchte nicht', 'auf keinen fall',
        'niemals', 'nie', 'nee', 'kein', 'keine', 'niemand'
      ],
      'smalltalk_language_switch': [
        'englisch', 'english', 'switch to english', 'change language',
        'sprache wechseln', 'sprache ändern', 'andere sprache',
        'in english', 'in englisch', 'spreche englisch', 'speak english',
        'verstehst du englisch', 'können wir englisch sprechen',
        'englische sprache', 'language english', 'sprachauswahl',
        'sprachumstellung', 'deutsch zu englisch', 'übersetzen'
      ],
      'smalltalk_user_angry': [
        'wütend', 'sauer', 'verärgert', 'genervt', 'frustriert',
        'nerven', 'ärgerlich', 'ärgere', 'mist', 'scheiße',
        'verdammt', 'verflucht', 'unzufrieden', 'schrecklich',
        'nutzlos', 'blöd', 'dumm', 'dämlich', 'inkompetent',
        'lächerlich', 'unglaublich', 'enttäuscht', 'versagt',
        'zornig', 'fuck', 'ausrasten', 'rasend', 'wahnsinnig'
      ]
    }
  },
  en: {
    questionWords: ['how', 'what', 'where', 'when', 'why', 'which', 'who', 'whom', 'whose', 'to what extent', 'in what way'],
    
    functionPatterns: [
      { pattern: /password\s+(change|forgot|reset|new|update)/i, intent: 'function_change_password', confidence: 0.85 },
      { pattern: /log\s*out|sign\s*out|exit|end\s+session/i, intent: 'function_logout', confidence: 0.85 },
      { pattern: /give\s+feedback|send\s+feedback|provide\s+feedback|share\s+feedback/i, intent: 'function_give_feedback', confidence: 0.85 },
      { pattern: /(search|find|show|look\s+for|locate)\s+(.+)/i, intent: 'function_find_specific_content', confidence: 0.8 },
      { pattern: /(contact|support|help)\s+(team|staff|service|representative)/i, intent: 'function_contact_support', confidence: 0.85 },
      { pattern: /delete\s+(account|profile|my\s+account)|deactivate\s+account/i, intent: 'function_delete_account', confidence: 0.85 },
      { pattern: /(how|where)\s+(can|can\s+i|could\s+i)\s+(change|reset|update)\s+(my|the)\s+password/i, intent: 'function_change_password', confidence: 0.8 }
    ],
    
    // Enhanced keyword lists for better intent matching
    intentIndicators: {
      'faq_pricing_info': [
        'price', 'prices', 'pricing', 'price list', 'price model',
        'cost', 'costs', 'fee', 'fees', 'charge', 'charges',
        'pay', 'payment', 'subscription', 'subscribing', 'subscribe',
        'expensive', 'cheap', 'affordable', 'value', 'rate', 'rates',
        'how much', 'price point', 'offer', 'offers', 'deal', 'deals',
        'monthly', 'yearly', 'annual', 'financing', 'finance'
      ],
      'faq_premium_benefits': [
        'benefit', 'benefits', 'advantage', 'advantages', 'value',
        'premium', 'premium account', 'premium version', 'premium features',
        'worth', 'worthwhile', 'valuable', 'useful', 'profitable',
        'get', 'receive', 'obtain', 'gain', 'offers', 'offer',
        'better', 'improvement', 'optimization', 'enhanced',
        'extra', 'additional', 'special', 'specialty', 'privileges',
        'difference', 'comparison', 'unlock', 'upgrade', 'plus'
      ],
      'faq_cancel_subscription': [
        'cancel', 'cancellation', 'cancelling', 'canceling',
        'terminate', 'termination', 'ending', 'revoke',
        'end', 'stop', 'cease', 'discontinue', 'break',
        'unsubscribe', 'opt out', 'remove', 'delete',
        'contract', 'agreement', 'term', 'period', 'duration',
        'how do i', 'want to', 'no longer use', 'need to',
        'get rid of', 'deactivate', 'close', 'quit'
      ],
      'faq_find_invoice': [
        'invoice', 'invoices', 'bill', 'bills', 'payment', 'payments',
        'payment history', 'receipt', 'receipts', 'transaction', 
        'transactions', 'billing', 'billing history', 'purchase history',
        'payment record', 'payment records', 'invoice copy', 'find invoice',
        'view invoice', 'see invoice', 'invoice history', 'my invoices'
      ],
      'smalltalk_greeting': [
        'hello', 'hi', 'hey', 'good day', 'morning',
        'afternoon', 'evening', 'greetings', 'howdy',
        'welcome', 'yo', 'sup', "what's up", 'hiya'
      ],
      'smalltalk_farewell': [
        'bye', 'goodbye', 'see you', 'farewell', 'later',
        'take care', 'have a good day', 'have a nice day',
        'until next time', 'catch you later', 'adios', 'ciao'
      ],
      'smalltalk_thanks': [
        'thank', 'thanks', 'thank you', 'thanks a lot', 'many thanks',
        'appreciate', 'grateful', 'thankful', 'cheers',
        'great', 'awesome', 'excellent', 'perfect', 'fantastic'
      ],
      'smalltalk_who_are_you': [
        'who are you', 'what are you', "what's your name", 
        'your name', 'introduce yourself', 'tell me about yourself',
        'bot', 'chatbot', 'assistant', 'ai', 'identity'
      ],
      'smalltalk_joke': [
        'joke', 'jokes', 'tell me a joke', 'something funny',
        'make me laugh', 'funny', 'humor', 'fun', 'jest',
        'entertain me', 'know any jokes', 'got any jokes'
      ]
    }
  }
};

// Known smalltalk intent names for better type derivation
const SMALLTALK_INTENTS = [
  'greeting', 'farewell', 'thanks', 'how_are_you',
  'who_are_you', 'joke', 'help', 'fallback', 'cancel', 'stop',
  'affirmation', 'negation', 'confirmation', 'repeat', 'confused',
  'language_switch', 'user_angry', 'compliment_bot', 'request_help',
  'ask_identity', 'request_joke'
];

// Cache for loaded intent metadata
const intentMetadataCache: Record<Language, IntentItem[] | undefined> = {
  de: undefined,
  en: undefined,
};

/**
 * Detects the intent in a user message using a multi-stage strategy
 * 
 * 1. Pattern-based pre-analysis for common patterns (questions, function calls)
 * 2. NLP model prediction
 * 3. Post-validation and enhancement of results
 * 4. Context-aware processing
 *
 * @param text The text of the user message
 * @param model The intent detection model
 * @param language The language of the text
 * @param options Additional options for intent detection
 * @returns An Intent object or null if no intent was detected
 */
export async function detectIntent(
  text: string,
  model: NLPModel,
  language: Language = 'de',
  options: IntentDetectionOptions = {}
): Promise<Intent | null> {
  try {
    // Early validation of input data
    if (!text || text.trim().length === 0) {
      console.log('[DEBUG] Empty text, no intent detection possible');
      return null;
    }

    if (!model || typeof model.predict !== 'function') {
      console.error('[DEBUG] Invalid model or model.predict is not a function');
      return createErrorIntent('error_invalid_model');
    }

    // Preprocessing of text for model prediction
    const processedText = applyPreprocessing(text, options);
    
    // Tokenize the preprocessed text (words only, lowercase)
    const wordTokens = basicTokenize(processedText, { 
        preservePunctuation: false, // We mostly need just words
        toLowerCase: true,         // Consistency with keyword lists
        normalizeGermanUmlauts: options.normalizeGermanUmlauts === true
    });
    console.log(`[DEBUG] Tokens (words): ${wordTokens.join(' | ')}`);

    // Tokens with punctuation for special checks
    const tokensWithPunct = basicTokenize(processedText, { 
        preservePunctuation: true, 
        toLowerCase: true,
        normalizeGermanUmlauts: options.normalizeGermanUmlauts === true
    });
    
    console.log(`[DEBUG] Intent detection for: "${processedText}" (${language})`);

    // PHASE 1: Pattern-based pre-analysis
    // This can already detect certain intents before involving the ML model
    const patternBasedIntent = detectPatternBasedIntent(processedText, wordTokens, tokensWithPunct, language);
    
    // Initialize patternHint outside the block to avoid TypeScript errors
    let patternHint: Intent | null = null;
    
    if (patternBasedIntent) {
      // Safely access intent type with default
      const patternType = patternBasedIntent.type || INTENT_TYPES.UNKNOWN;
      console.log(`[DEBUG] Pattern-based intent detection: ${patternBasedIntent.name} (${patternType})`);
      
      // If a functional intent with high confidence is detected, use it directly
      if (patternType === INTENT_TYPES.FUNCTION && patternBasedIntent.confidence > 0.8) {
        return patternBasedIntent;
      }
      
      // For other pattern-based intents, set the information for post-processing
      patternHint = patternBasedIntent;
    }

    // PHASE 2: Main NLP model prediction
    try {
      console.log('[DEBUG] Applying NLP model...');
      const prediction = await model.predict(processedText);
      
      // Check if prediction is valid
      if (isValidPrediction(prediction)) {
        const modelIntent = createIntentFromPrediction(prediction);
        const modelType = modelIntent.type || INTENT_TYPES.UNKNOWN;
        console.log(`[DEBUG] NLP model prediction: ${modelIntent.name} (${modelType}) with confidence ${modelIntent.confidence}`);
        
        // PHASE 3: Post-processing and intent fusion
        // Enhance the model result with linguistic analysis and pattern hint
        const enhancedIntent = enhanceIntent(modelIntent, processedText, wordTokens, language, patternHint);
        
        // If confidence is sufficient, use the enhanced intent
        if (isConfidentEnough(enhancedIntent)) {
          const enhancedType = enhancedIntent.type || INTENT_TYPES.UNKNOWN;
          console.log(`[DEBUG] Enhanced intent detection: ${enhancedIntent.name} (${enhancedType}) with confidence ${enhancedIntent.confidence}`);
          
          // PHASE 4: Enrichment and context
          if (options.enrichIntents) {
            await enrichIntentWithMetadata(enhancedIntent, language);
          }
          
          return enhancedIntent;
        } else {
          console.log(`[DEBUG] Intent confidence too low: ${enhancedIntent.confidence}`);
          // Better fallback detection with direct intent confidence check
          const fallbackIntent = attemptFallbackIntent(processedText, wordTokens, tokensWithPunct, language, enhancedIntent);
          
          // If a reasonable fallback was found, use it
          if (fallbackIntent) {
            const fallbackType = fallbackIntent.type || INTENT_TYPES.UNKNOWN;
            const fallbackConfidence = fallbackIntent.confidence || 0;
            
            // Use centralized config for minimum confidence
            const thresholdsByType = config?.nlp?.intentThresholds?.byType;
            const fallbackTypeKey = fallbackType.toLowerCase();
            
            // Safe access to nested properties with fallbacks
            const minimumConfidence = 
              thresholdsByType && 
              typeof fallbackTypeKey === 'string' && 
              fallbackTypeKey in thresholdsByType ? 
                (thresholdsByType as any)[fallbackTypeKey] : // Type assertion for indexing
                thresholdsByType?.default ?? 
                config?.nlp?.intentThresholds?.low ?? 
                0.4; // Default if all checks fail
              
            if (fallbackConfidence >= minimumConfidence) {
              return fallbackIntent;
            }
          }
          
          // Last resort: return the original intent with a warning about low confidence
          console.log(`[DEBUG] Using original intent despite low confidence: ${enhancedIntent.name}`);
          return enhancedIntent;
        }
      } else {
        console.warn('[DEBUG] Model did not provide a valid prediction');
        // If pattern hint exists, use it as fallback
        if (patternHint) {
          console.log(`[DEBUG] Using pattern hint as fallback: ${patternHint.name}`);
          return patternHint;
        }
        return attemptFallbackIntent(processedText, wordTokens, tokensWithPunct, language, null);
      }
    } catch (modelError) {
      console.error('[DEBUG] Error in model prediction:', modelError);
      // Also here: If pattern hint exists, use it for model errors
      if (patternHint) {
        console.log(`[DEBUG] Using pattern hint after model error: ${patternHint.name}`);
        return patternHint;
      }
      return handleModelError(processedText, wordTokens, tokensWithPunct, language, modelError);
    }
  } catch (error) {
    console.error(`[DEBUG] General error in detectIntent for text "${text}":`, error);
    return null;
  }
}

/**
 * Detects intents based on linguistic patterns
 * This function analyzes the text for known patterns and keywords
 * Improved handling of near-matches and multiple intent candidates using tokens
 */
function detectPatternBasedIntent(
  text: string, 
  wordTokens: string[], 
  tokensWithPunct: string[], 
  language: Language
): Intent | null {
  const patterns = LINGUISTIC_PATTERNS[language] || LINGUISTIC_PATTERNS.de;
  const processedText = text.toLowerCase().trim();
  
  // 1. Check for function patterns (e.g., "change password")
  // For regex patterns, we still use the processedText
  for (const funcPattern of patterns.functionPatterns) {
    if (funcPattern.pattern.test(processedText)) {
      console.log(`[DEBUG] Function pattern detected: ${funcPattern.intent}`);
      return {
        name: funcPattern.intent,
        type: INTENT_TYPES.FUNCTION,
        confidence: funcPattern.confidence || 0.85 // High confidence as function patterns are very specific
      };
    }
  }
  
  // 2. Analyze keyword matches for different intents using tokens
  // Track multiple intent candidates and score them more accurately
  const intentCandidates: {intent: string, count: number, total: number, score: number}[] = [];
  
  for (const [intent, keywords] of Object.entries(patterns.intentIndicators)) {
    // Count how many keywords occur in the tokens
    const matches = keywords.filter(keyword => {
      // For multi-word keywords, we need special handling
      if (keyword.includes(' ')) {
        // For simplicity, we'll check if all words in the keyword are in the tokens
        const keywordTokens = basicTokenize(keyword, { toLowerCase: true });
        return keywordTokens.every(token => containsToken(wordTokens, token));
      }
      
      // For single-word keywords, just check if it's in the tokens
      return containsToken(wordTokens, keyword);
    });
    
    if (matches.length > 0) {
      const matchRatio = matches.length / keywords.length;
      // Calculate a more nuanced score that considers both match count and ratio
      const score = (matches.length * 0.7) + (matchRatio * 0.3);
      
      intentCandidates.push({
        intent,
        count: matches.length,
        total: keywords.length,
        score
      });
    }
  }
  
  // Sort candidates by score
  intentCandidates.sort((a, b) => b.score - a.score);
  
  // If we have a significant match (min. 25% of keywords or strong score)
  if (intentCandidates.length > 0) {
    const bestIntent = intentCandidates[0];
    
    // Safe check: we know we have at least one element from the length check
    // but TypeScript needs reassurance
    if (!bestIntent) {
      return null;
    }
    
    // Only consider significant matches
    if (bestIntent.count / bestIntent.total >= 0.25 || bestIntent.score >= 0.6) {
      const intentType = bestIntent.intent.startsWith('faq_') ? INTENT_TYPES.FAQ :
                        bestIntent.intent.startsWith('smalltalk_') ? INTENT_TYPES.SMALLTALK :
                        bestIntent.intent.startsWith('function_') ? INTENT_TYPES.FUNCTION :
                        INTENT_TYPES.UNKNOWN;
                        
      // More sophisticated confidence calculation based on:
      // - Match ratio (keywords matched / total keywords)
      // - Absolute match count (more matches = higher confidence)
      // - Text length (shorter texts with matches should have higher confidence)
      // - Intent type (FAQ might need higher confidence than smalltalk)
      
      const matchRatio = bestIntent.count / bestIntent.total;
      const textLengthFactor = Math.max(0.8, 1.2 - (wordTokens.length / 20)); // Shorter texts get higher scores
      
      // Base confidence from match ratio
      let confidence = 0.4 + Math.min(0.4, matchRatio * 0.6);
      
      // Adjust for absolute match count
      if (bestIntent.count >= 3) confidence += 0.1;
      if (bestIntent.count >= 5) confidence += 0.05;
      
      // Adjust for text length (shorter text with matches = more confident)
      confidence *= textLengthFactor;
      
      console.log(`[DEBUG] Keyword match: ${bestIntent.intent} with ${bestIntent.count}/${bestIntent.total} matches (score: ${bestIntent.score.toFixed(2)}, confidence: ${confidence.toFixed(2)})`);
      
      return {
        name: bestIntent.intent,
        type: intentType,
        confidence
      };
    }
  }
  
  // 3. Check for question patterns (for FAQ detection)
  // Better question pattern detection using tokens
  const hasQuestionMark = containsToken(tokensWithPunct, '?');
  
  // Use stringInList to safely check if the first token is a question word
  const firstToken = wordTokens.length > 0 ? wordTokens[0] : undefined;
  const startsWithQuestionWord = stringInList(firstToken, patterns.questionWords);
      
  // For complex patterns like question verbs, we still use the full text approach
  const hasQuestionVerb = /\b(kann|kannst|könntest|könnte|ist|sind|haben|hat)\b.*\?/i.test(processedText);
  
  if (hasQuestionMark || startsWithQuestionWord || hasQuestionVerb) {
    console.log('[DEBUG] Question pattern detected, likely FAQ');
    
    // Analyze question type based on contained words
    // More targeted FAQ detection with clearer patterns using tokens
    if (wordTokens.some(token => ['preis', 'preise', 'kosten', 'teuer', 'zahlen', 'gebühr', 'abo', 'subscription', 'tarif'].includes(token))) {
      return {
        name: 'faq_pricing_info',
        type: INTENT_TYPES.FAQ,
        confidence: hasQuestionMark ? 0.75 : 0.7 // Higher confidence with question mark
      };
    } else if (wordTokens.some(token => ['vorteil', 'vorteile', 'premium', 'lohnt', 'bekommen', 'besser', 'unterschied', 'compare', 'vergleich'].includes(token))) {
      return {
        name: 'faq_premium_benefits',
        type: INTENT_TYPES.FAQ,
        confidence: hasQuestionMark ? 0.75 : 0.7
      };
    } else if (wordTokens.some(token => ['kündigen', 'stornieren', 'beenden', 'auflösen', 'abbestellen', 'cancel', 'stop'].includes(token))) {
      return {
        name: 'faq_cancel_subscription',
        type: INTENT_TYPES.FAQ,
        confidence: hasQuestionMark ? 0.75 : 0.7
      };
    } else if (wordTokens.some(token => ['rechnung', 'rechnungen', 'beleg', 'quittung', 'zahlungshistorie', 'invoice'].includes(token))) {
      return {
        name: 'faq_find_invoice',
        type: INTENT_TYPES.FAQ,
        confidence: hasQuestionMark ? 0.75 : 0.7
      };
    }
    
    // Fallback for general questions
    return {
      name: 'faq_general',
      type: INTENT_TYPES.FAQ,
      confidence: 0.6
    };
  }
  
  // No clear pattern detected
  return null;
}

/**
 * Enhances the intent detected by the model with linguistic analysis
 * More sophisticated fusion logic with better confidence adjustment and token-based analysis
 */
function enhanceIntent(
  modelIntent: Intent, 
  text: string, 
  wordTokens: string[], 
  language: Language, 
  patternHint: Intent | null
): Intent {
  const patterns = LINGUISTIC_PATTERNS[language] || LINGUISTIC_PATTERNS.de;
  
  // If we don't have a patternHint or the modelIntent is very confident, keep modelIntent
  if (!patternHint || modelIntent.confidence > 0.85) {
    return modelIntent;
  }
  
  // We need type safety for accessing intentIndicators
  // Better type handling and safety checks
  const intentIndicators = patterns.intentIndicators as Record<string, string[]>;
  
  // Calculate modelIntent match with tokens
  const modelIntentKeywords = intentIndicators[modelIntent.name] || [];
  const modelMatches = modelIntentKeywords.filter(keyword => {
    // For multi-word keywords, we need special handling
    if (keyword.includes(' ')) {
      const keywordTokens = basicTokenize(keyword, { toLowerCase: true });
      return keywordTokens.every(token => containsToken(wordTokens, token));
    }
    
    return containsToken(wordTokens, keyword);
  }).length;
  
  const modelMatchRatio = modelIntentKeywords.length > 0 ? modelMatches / modelIntentKeywords.length : 0;
  
  // Calculate patternHint match with tokens
  const patternHintKeywords = intentIndicators[patternHint.name] || [];
  const patternMatches = patternHintKeywords.filter(keyword => {
    // For multi-word keywords, we need special handling
    if (keyword.includes(' ')) {
      const keywordTokens = basicTokenize(keyword, { toLowerCase: true });
      return keywordTokens.every(token => containsToken(wordTokens, token));
    }
    
    return containsToken(wordTokens, keyword);
  }).length;
  
  const patternMatchRatio = patternHintKeywords.length > 0 ? patternMatches / patternHintKeywords.length : 0;
  
  // Check if the text explicitly mentions the intent subject
  // This helps with ambiguous sentences, now based on token presence
  const hasExplicitMention = (intentName: string, tokens: string[]): boolean => {
    if (intentName === 'faq_pricing_info' && 
        tokens.some(token => ['preis', 'kosten', 'gebühr'].includes(token))) return true;
    if (intentName === 'faq_premium_benefits' && 
        tokens.some(token => ['premium', 'vorteil', 'besser'].includes(token))) return true;
    if (intentName === 'faq_cancel_subscription' && 
        tokens.some(token => ['kündigen', 'stornieren', 'beenden'].includes(token))) return true;
    if (intentName === 'faq_find_invoice' && 
        tokens.some(token => ['rechnung', 'beleg', 'quittung'].includes(token))) return true;
    if (intentName === 'smalltalk_greeting' && 
        tokens.some(token => ['hallo', 'hi', 'tag'].includes(token))) return true;
    if (intentName === 'smalltalk_farewell' && 
        tokens.some(token => ['tschüss', 'bye', 'wiedersehen'].includes(token))) return true;
    return false;
  };
  
  const modelHasExplicitMention = hasExplicitMention(modelIntent.name, wordTokens);
  const patternHasExplicitMention = hasExplicitMention(patternHint.name, wordTokens);
  
  // Guaranteed type strings for safe comparison
  const modelIntentType: string = modelIntent.type || INTENT_TYPES.UNKNOWN;
  const patternIntentType: string = patternHint.type || INTENT_TYPES.UNKNOWN;
  
  // Decide which intent to use
  if (modelIntentType === patternIntentType) {
    // Same intent type: Choose the one with better keyword match
    if ((patternMatchRatio > modelMatchRatio * 1.2 || patternHasExplicitMention) && patternHint.confidence > 0.5) {
      console.log(`[DEBUG] Replacing model intent with pattern hint due to better keyword match (${patternMatchRatio.toFixed(2)} vs ${modelMatchRatio.toFixed(2)})`);
      
      // Adjust confidence up slightly when explicit keywords are present
      if (patternHasExplicitMention && patternHint.confidence < 0.9) {
        return {
          ...patternHint,
          confidence: Math.min(0.95, patternHint.confidence + 0.1)
        };
      }
      
      return patternHint;
    }
    // Otherwise keep the model intent, but potentially increase confidence
    if (modelMatchRatio > 0.2 && modelIntent.confidence < 0.8) {
      // More nuanced confidence adjustment based on match quality
      let confidenceBoost = 0;
      
      if (modelMatchRatio > 0.5) confidenceBoost = 0.15; // Very good match
      else if (modelMatchRatio > 0.3) confidenceBoost = 0.1; // Good match
      else confidenceBoost = 0.05; // Some match
      
      // Additional boost for explicit mentions
      if (modelHasExplicitMention) confidenceBoost += 0.05;
      
      const enhancedConfidence = Math.min(0.95, modelIntent.confidence + confidenceBoost);
      
      console.log(`[DEBUG] Increasing confidence from ${modelIntent.confidence} to ${enhancedConfidence} based on keyword match quality`);
      return { ...modelIntent, confidence: enhancedConfidence };
    }
  } else {
    // Different intent types: More complex decision
    
    // Better weighting for different scenarios
    
    // If patternHint is a function intent and has good match, prefer it
    if (patternIntentType === INTENT_TYPES.FUNCTION && 
        (patternMatchRatio > 0.3 || patternHasExplicitMention)) {
      console.log(`[DEBUG] Prefer Function intent (${patternHint.name}) over Model intent (${modelIntent.name})`);
      return patternHint;
    }
    
    // For FAQ vs Smalltalk, use explicit mentions as a tiebreaker
    if ((patternIntentType === INTENT_TYPES.FAQ && modelIntentType === INTENT_TYPES.SMALLTALK) ||
        (patternIntentType === INTENT_TYPES.SMALLTALK && modelIntentType === INTENT_TYPES.FAQ)) {
      if (patternHasExplicitMention && !modelHasExplicitMention) {
        console.log(`[DEBUG] Choosing pattern hint (${patternHint.name}) due to explicit keyword mention`);
        return patternHint;
      } else if (!patternHasExplicitMention && modelHasExplicitMention) {
        console.log(`[DEBUG] Keeping model intent (${modelIntent.name}) due to explicit keyword mention`);
        return modelIntent;
      }
    }
    
    // For other cases, weigh confidence and match ratio
    // Better scoring formula that considers both confidence and keyword relevance
    const modelScore = modelIntent.confidence * (1 + modelMatchRatio * 1.5) * (modelHasExplicitMention ? 1.3 : 1);
    const hintScore = patternHint.confidence * (1 + patternMatchRatio * 1.5) * (patternHasExplicitMention ? 1.3 : 1);
    
    console.log(`[DEBUG] Intent scores - Model: ${modelScore.toFixed(2)} vs Pattern: ${hintScore.toFixed(2)}`);
    
    if (hintScore > modelScore * 1.15) { // 15% threshold for overwriting
      console.log(`[DEBUG] Pattern hint has significantly better score (${hintScore.toFixed(2)} vs ${modelScore.toFixed(2)})`);
      return patternHint;
    }
  }
  
  // Default: Keep the original modelIntent
  return modelIntent;
}

/**
 * Checks if a prediction is valid and has the required properties
 */
function isValidPrediction(prediction: any): boolean {
  return prediction 
    && typeof prediction === 'object' 
    && typeof prediction.name === 'string'
    && typeof prediction.confidence === 'number';
}

/**
 * Creates an Intent object from a prediction
 */
function createIntentFromPrediction(prediction: any): Intent {
  const intentName = prediction.name;
  const confidence = prediction.confidence;
  
  // Use the type from the prediction or derive it
  const intentType = typeof prediction.type === 'string' 
    ? prediction.type 
    : getIntentTypeFromName(intentName);
  
  return {
    name: intentName,
    confidence,
    type: intentType
  };
}

/**
 * Creates an error intent for specific error situations
 */
function createErrorIntent(errorType: string): Intent {
  return {
    name: errorType,
    confidence: 0,
    type: INTENT_TYPES.UNKNOWN
  };
}

/**
 * Checks if an intent has sufficient confidence
 * Uses centralized configuration from config.ts
 */
function isConfidentEnough(intent: Intent): boolean {
  // Ensure intent confidence is a number, default to 0 if undefined
  const intentConfidence = intent.confidence ?? 0; 
  
  // Ensure intentType is a valid string, default to UNKNOWN and convert to lowercase
  const intentType: string = (intent.type || INTENT_TYPES.UNKNOWN).toLowerCase();

  // Validate the configuration structure
  if (!config?.nlp?.intentThresholds) {
    console.error('[DEBUG] Error in configuration: Missing nlp.intentThresholds');
    return intentConfidence >= 0.4; // Default fallback if config is missing
  }

  const thresholds = config.nlp.intentThresholds;
  
  // First check for type-specific threshold from centralized config
  if (thresholds.byType) {
    const byType = thresholds.byType;
    // Check if this intent type has a specific threshold in the config
    if (typeof intentType === 'string' && intentType in byType) {
      const typeThreshold = (byType as any)[intentType] ?? thresholds.low ?? 0.4;
      return intentConfidence >= typeThreshold;
    }
    
    // If no type-specific threshold found, use the default from byType
    if ('default' in byType) {
      return intentConfidence >= (byType.default ?? thresholds.low ?? 0.4);
    }
  }
  
  // Special case handling for specific intent names
  // This can be kept for backward compatibility or specific intent fine-tuning
  if (intentType === INTENT_TYPES.FAQ.toLowerCase()) {
    if (intent.name === 'faq_pricing_info' || intent.name === 'faq_cancel_subscription' || intent.name === 'faq_find_invoice') {
      // Critical FAQs might need higher confidence
      return intentConfidence >= Math.max(0.35, thresholds.low ?? 0.4);
    }
  }

  // Fall back to general low threshold from config
  return intentConfidence >= (thresholds.low ?? 0.4);
}

/**
 * Enhanced preprocessing of the input text
 */
function applyPreprocessing(text: string, options: IntentDetectionOptions): string {
  let processedText = text;

  // Optional preprocessing steps
  if (options.toLowerCase !== false) {
    processedText = processedText.toLowerCase();
  }

  if (options.removePunctuation) {
    // Replace punctuation with spaces, but preserve question marks for pattern recognition
    processedText = processedText.replace(/[.,!;:/\\#$%^&*{}=\-_`~()]/g, ' ');
  }

  if (options.normalizeWhitespace !== false) {
    processedText = processedText.replace(/\s+/g, ' ').trim();
  }

  // Additional normalization for German umlauts
  if (options.normalizeGermanUmlauts === true) {
    processedText = processedText
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss');
  }

  return processedText;
}

/**
 * Attempts to detect a fallback intent based on text patterns
 * Added token-based matching and original intent parameter for more informed fallbacks
 */
function attemptFallbackIntent(
  text: string, 
  wordTokens: string[], 
  tokensWithPunct: string[],
  language: Language = 'de', 
  originalIntent: Intent | null = null
): Intent | null {
  // Use the linguistic patterns for the language
  const patterns = LINGUISTIC_PATTERNS[language] || LINGUISTIC_PATTERNS.de;
  
  // Use the original intent type if available to provide a better-typed fallback
  if (originalIntent && originalIntent.type) {
    const intentType = originalIntent.type;
    
    // If we at least know it's a FAQ, Smalltalk, or Function, use that knowledge
    if (intentType === INTENT_TYPES.FAQ) {
      if (containsToken(tokensWithPunct, '?') || 
          (wordTokens.length > 0 && patterns.questionWords && stringInList(wordTokens[0], patterns.questionWords))) {
        return createFallbackQuestionIntent(language);
      }
    }
    
    // For potential Smalltalk with low confidence, check if it matches common patterns
    if (intentType === INTENT_TYPES.SMALLTALK) {
      // Check if any greeting words are in the tokens
      const greetingWords = patterns.intentIndicators?.smalltalk_greeting || [];
      if (wordTokens.some(token => greetingWords.includes(token))) {
        return {
          name: 'smalltalk_greeting',
          confidence: 0.5,
          type: INTENT_TYPES.SMALLTALK
        };
      }
      
      // Check if any farewell words are in the tokens
      const farewellWords = patterns.intentIndicators?.smalltalk_farewell || [];
      if (wordTokens.some(token => farewellWords.includes(token))) {
        return {
          name: 'smalltalk_farewell',
          confidence: 0.5,
          type: INTENT_TYPES.SMALLTALK
        };
      }
    }
  }
  
  // Check for question marks
  if (containsToken(tokensWithPunct, '?')) {
    return createFallbackQuestionIntent(language);
  }
  
  // Check for question words at the beginning
  if (wordTokens.length > 0 && patterns.questionWords && stringInList(wordTokens[0], patterns.questionWords)) {
    return createFallbackQuestionIntent(language);
  }
  
  // Better detection of commands/instructions using tokens
  const commandTokens = ['zeig', 'zeige', 'gib', 'erkläre', 'erklär', 'beschreibe', 'beschreib', 'witz', 'witze', 'joke', 'erzähl', 'erzähle'];
  const firstToken = wordTokens.length > 0 ? wordTokens[0] : undefined;
  
  if (stringInList(firstToken, commandTokens)) {
    if (wordTokens.some(token => ['witz', 'witze', 'joke'].includes(token))) {
      return {
        name: 'smalltalk_joke',
        confidence: 0.45,
        type: INTENT_TYPES.SMALLTALK
      };
    }
    
    if (wordTokens.some(token => ['erkläre', 'erklär', 'beschreibe', 'beschreib'].includes(token))) {
      return {
        name: 'faq_general',
        confidence: 0.45,
        type: INTENT_TYPES.FAQ
      };
    }
    
    return {
      name: 'function_request',
      confidence: 0.45,
      type: INTENT_TYPES.FUNCTION
    };
  }
  
  // If checking for pricing-related keywords
  const pricingKeywords = patterns.intentIndicators?.faq_pricing_info || [];
  if (wordTokens.some(token => pricingKeywords.includes(token))) {
    return {
      name: 'faq_pricing_info',
      confidence: 0.4,
      type: INTENT_TYPES.FAQ
    };
  }
  
  // If checking for subscription-related keywords
  const subscriptionKeywords = patterns.intentIndicators?.faq_cancel_subscription || [];
  if (wordTokens.some(token => subscriptionKeywords.includes(token))) {
    return {
      name: 'faq_cancel_subscription',
      confidence: 0.4,
      type: INTENT_TYPES.FAQ
    };
  }
  
  // If checking for invoice-related keywords
  const invoiceKeywords = patterns.intentIndicators?.faq_find_invoice || [];
  if (wordTokens.some(token => invoiceKeywords.includes(token))) {
    return {
      name: 'faq_find_invoice',
      confidence: 0.4,
      type: INTENT_TYPES.FAQ
    };
  }
  
  // If no specific patterns were detected, return null
  return null;
}

/**
 * Creates a standardized question fallback intent
 */
function createFallbackQuestionIntent(language: Language): Intent {
  return {
    name: 'faq_general',
    confidence: 0.5,
    type: INTENT_TYPES.FAQ
  };
}

/**
 * Handles errors in model prediction and tries to find a suitable fallback
 * Now uses tokens for more precise fallback intent detection
 */
function handleModelError(
  text: string, 
  wordTokens: string[], 
  tokensWithPunct: string[],
  language: Language, 
  error: any
): Intent | null {
  console.error('[DEBUG] Attempting error handling for model prediction:', error);
  
  // For certain error types, we can respond specifically
  if (error.message && typeof error.message === 'string' && stringContains(error.message, 'timeout')) {
    return {
      name: 'error_model_timeout',
      confidence: 0,
      type: INTENT_TYPES.UNKNOWN
    };
  }
  
  // For unknown errors, try the fallback intent
  return attemptFallbackIntent(text, wordTokens, tokensWithPunct, language);
}

/**
 * Derives the intent type from the intent name, if not directly available
 * Now correctly handles undefined input
 */
function getIntentTypeFromName(intentName: string | undefined): string {
  if (!intentName || typeof intentName !== 'string') {
    return INTENT_TYPES.UNKNOWN;
  }

  // Based on the prefix
  if (stringStartsWith(intentName, 'faq_')) {
    return INTENT_TYPES.FAQ;
  } else if (stringStartsWith(intentName, 'smalltalk_')) {
    return INTENT_TYPES.SMALLTALK;
  } else if (stringStartsWith(intentName, 'function_')) {
    return INTENT_TYPES.FUNCTION;
  }
  
  // Based on known smalltalk intents
  const baseName = intentName.includes('_') ? intentName.split('_')[0] : intentName;
  
  // Safe check if the intent name is in SMALLTALK_INTENTS
  if (stringInList(intentName, SMALLTALK_INTENTS) || stringInList(baseName, SMALLTALK_INTENTS)) {
    return INTENT_TYPES.SMALLTALK;
  }

  // Default type if no specific rule applies
  console.warn(`[DEBUG] Could not derive intent type for "${intentName}". Using 'unknown'.`);
  return INTENT_TYPES.UNKNOWN;
}

/**
 * Enrichment of the intent object with additional metadata
 */
async function enrichIntentWithMetadata(intent: Intent, language: Language = 'de'): Promise<void> {
  console.log(`[DEBUG] enrichIntentWithMetadata called for intent: ${intent.name}, language: ${language}`);
  
  try {
    // Load intent metadata from JSON file if not cached
    if (!intentMetadataCache[language]) {
      const filePath = `/data/chatbot/database/intents_${language}.json`;
      try {
        // Use the loadJsonData function to load the JSON file
        const loadedData = await loadJsonData<IntentItem[]>(filePath);
        if (Array.isArray(loadedData) && loadedData.every(item => item && typeof item.name === 'string')) {
          intentMetadataCache[language] = loadedData;
          console.log(`[DEBUG] Loaded intent metadata from ${filePath}`);
        } else {
          console.error(`[DEBUG] Invalid data format loaded from ${filePath}`);
          intentMetadataCache[language] = []; // Empty array to avoid repeated errors
        }
      } catch (loadError) {
        console.error(`[DEBUG] Failed to load intent metadata from ${filePath}:`, loadError);
        intentMetadataCache[language] = []; // Empty array on error
      }
    }
    
    // Safe retrieval of the metadata object
    const intentsArray = intentMetadataCache[language] || [];
    const intentMetadata = intentsArray.find(item => item && item.name === intent.name);
    
    // Safe update of the intent object with optional chaining
    if (intentMetadata) {
      // Only assign if the property exists
      if (typeof intentMetadata.type === 'string') {
        intent.type = intentMetadata.type;
      }
      
      // Add additional properties only if they are supported in the intent object
      // TypeScript-safe access with targeted type conversions
      const intentWithExtras = intent as Intent & { 
        description?: string;
        category?: string;
        examples?: string[];
        responses?: string[];
        patterns?: string[];
      };
      
      if (typeof intentMetadata.description === 'string') {
        intentWithExtras.description = intentMetadata.description;
      }
      
      if (typeof intentMetadata.category === 'string') {
        intentWithExtras.category = intentMetadata.category;
      }
      
      if (Array.isArray(intentMetadata.examples)) {
        intentWithExtras.examples = intentMetadata.examples;
      }
      
      if (Array.isArray(intentMetadata.responses)) {
        intentWithExtras.responses = intentMetadata.responses;
      }
      
      if (Array.isArray(intentMetadata.patterns)) {
        intentWithExtras.patterns = intentMetadata.patterns;
      }
    } else {
      console.warn(`[DEBUG] No metadata found for intent "${intent.name}" in ${language} data.`);
    }
  } catch (error) {
    console.warn(`[DEBUG] Metadata for ${intent.name} (${language}) could not be loaded:`, error);
  }
}

/**
 * Helper function to check an intent's confidence level against thresholds
 */
export function getIntentConfidenceLevel(confidence: number | undefined): 'high' | 'medium' | 'low' | 'none' {
  const conf = confidence ?? 0; // Default to 0 if undefined
  
  // Defensive check of configuration
  if (!config?.nlp?.intentThresholds) {
    console.error('[DEBUG] ERROR: Configuration for intentThresholds is missing or invalid!');
    return 'none';
  }
  
  const { intentThresholds } = config.nlp;
  
  // Safely access thresholds with defaults
  const highThreshold = intentThresholds.high ?? 0.8;
  const mediumThreshold = intentThresholds.medium ?? 0.6;
  const lowThreshold = intentThresholds.low ?? 0.4;

  if (conf >= highThreshold) {
    return 'high';
  } else if (conf >= mediumThreshold) {
    return 'medium';
  } else if (conf >= lowThreshold) {
    return 'low';
  } else {
    return 'none';
  }
}

/**
 * Helper function to decide whether an intent should be automatically used
 * or requires a confirmation based on its confidence
 */
export function shouldConfirmIntent(intent: Intent | null): boolean {
  if (!intent) return false;

  const confidenceLevel = getIntentConfidenceLevel(intent.confidence);
  
  // Quick decision for clear cases
  if (confidenceLevel === 'high') return false;
  if (confidenceLevel === 'none') return true;
  
  // Differentiated decision for medium confidence
  if (confidenceLevel === 'medium') {
    // Ensure intent.type is a valid string
    const intentType: string = intent.type || getIntentTypeFromName(intent.name);
    
    // Specific intent types that don't require confirmation
    if (intentType === INTENT_TYPES.SMALLTALK) {
      return false;
    }
    
    // More critical intents require confirmation
    if (intentType === INTENT_TYPES.FUNCTION) {
      return true;
    }
    
    // Special handling for FAQ intents
    if (intentType === INTENT_TYPES.FAQ) {
      // Certain FAQ intents might be less critical
      if (intent.name === 'faq_general' || intent.name === 'faq_help') {
        return false;
      }
      return true;
    }
  }
  
  // For low confidence, generally confirm
  return true;
}