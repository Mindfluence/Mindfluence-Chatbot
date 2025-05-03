// src/features/smalltalk/service.ts

// Type-only imports for types to comply with verbatimModuleSyntax
import type { Entity, Language } from '@/types/nlp.types';
// Regular import for the function
import { getRandomSmalltalkResponse } from '@/lib/databaseWrapper';

// Central Smalltalk Topics mapping for better organization and multi-language support
// Similar to how the FAQ service handles intent mappings
const SMALLTALK_TOPICS = {
  'smalltalk_greeting': {
    topic: 'GREETING',
    responses: {
      'de': ["Hallo! Wie kann ich dir helfen?", "Guten Tag! Wie geht es dir?", "Hey! Schön, dass du da bist!"],
      'en': ["Hello! How can I help you?", "Hi there! How are you?", "Hey! Nice to see you!"]
    }
  },
  'smalltalk_farewell': {
    topic: 'FAREWELL',
    responses: {
      'de': ["Auf Wiedersehen! Bis zum nächsten Mal.", "Tschüss! Komm bald wieder!", "Bis bald!"],
      'en': ["Goodbye! See you next time.", "Bye! Come back soon!", "See you later!"]
    }
  },
  'smalltalk_thanks': {
    topic: 'THANKS',
    responses: {
      'de': ["Gerne! Ich helfe immer gern.", "Kein Problem! Dafür bin ich da.", "Gern geschehen!"],
      'en': ["You're welcome! Always happy to help.", "No problem! That's what I'm here for.", "My pleasure!"]
    }
  },
  'smalltalk_how_are_you': {
    topic: 'MOOD_QUERY',
    responses: {
      'de': ["Mir geht es gut, danke der Nachfrage! Wie kann ich dir helfen?", "Danke, mir geht es prima! Und dir?"],
      'en': ["I'm doing well, thanks for asking! How can I help you?", "Thanks, I'm great! How about you?"]
    }
  },
  'smalltalk_who_are_you': {
    topic: 'IDENTITY',
    responses: {
      'de': ["Ich bin ein KI-Assistent, der dir bei Fragen zu unserer App helfen kann.", "Ich bin dein virtueller Assistent."],
      'en': ["I'm an AI assistant that can help you with questions about our app.", "I'm your virtual assistant."]
    }
  },
  'smalltalk_joke': {
    topic: 'JOKE',
    responses: {
      'de': ["Warum können Skelette so schlecht lügen? Weil man sie leicht durchschauen kann!", "Was macht ein Clown im Büro? Faxen!"],
      'en': ["Why don't scientists trust atoms? Because they make up everything!", "What do you call a fake noodle? An impasta!"]
    }
  },
  'smalltalk_help': {
    topic: 'HELP',
    responses: {
      'de': ["Ich kann dir mit Informationen zu unserer App helfen. Was möchtest du wissen?"],
      'en': ["I can help you with information about our app. What would you like to know?"]
    }
  },
  'smalltalk_user_confused': {
    topic: 'CONFUSED',
    responses: {
      'de': ["Kein Problem, lass es mich anders erklären.", "Entschuldige die Verwirrung. Ich versuche es anders zu formulieren."],
      'en': ["No problem, let me explain it differently.", "Sorry for the confusion. Let me try to phrase it another way."]
    }
  },
  'smalltalk_compliment_bot': {
    topic: 'COMPLIMENT',
    responses: {
      'de': ["Vielen Dank! Ich freue mich, dass ich helfen konnte.", "Das ist nett von dir! Ich gebe mein Bestes."],
      'en': ["Thank you! I'm glad I could help.", "That's kind of you! I do my best."]
    }
  },
  'smalltalk_request_help': {
    topic: 'HELP',
    responses: {
      'de': ["Natürlich helfe ich dir gerne. Was möchtest du wissen?"],
      'en': ["I'd be happy to help. What would you like to know?"]
    }
  },
  'smalltalk_ask_identity': {
    topic: 'IDENTITY',
    responses: {
      'de': ["Ich bin ein KI-Assistent, der entwickelt wurde, um dir bei Fragen zu helfen."],
      'en': ["I'm an AI assistant designed to help you with your questions."]
    }
  },
  'smalltalk_request_joke': {
    topic: 'JOKE',
    responses: {
      'de': ["Hier ist ein Witz: Wie nennt man einen Bumerang, der nicht zurückkommt? Stock!"],
      'en': ["Here's a joke: What do you call a boomerang that doesn't come back? A stick!"]
    }
  },
  'smalltalk_affirmation': {
    topic: 'AFFIRMATION',
    responses: {
      'de': ["Super, dann machen wir weiter!", "Wunderbar, dann sind wir uns einig."],
      'en': ["Great, let's continue!", "Wonderful, we're on the same page then."]
    }
  },
  'smalltalk_negation': {
    topic: 'NEGATION',
    responses: {
      'de': ["Alles klar, kein Problem. Womit kann ich dir stattdessen helfen?"],
      'en': ["Alright, no problem. How else can I help you?"]
    }
  },
  'smalltalk_language_switch': {
    topic: 'LANGUAGE_SWITCH',
    responses: {
      'de': ["Kein Problem, ich kann auf Englisch wechseln. How can I help you?"],
      'en': ["No problem, I can switch to German. Wie kann ich dir helfen?"]
    }
  },
  'smalltalk_user_angry': {
    topic: 'USER_ANGRY',
    responses: {
      'de': ["Ich entschuldige mich für die Unannehmlichkeit. Lass mich versuchen, das Problem zu lösen."],
      'en': ["I apologize for the inconvenience. Let me try to solve the problem."]
    }
  }
};

// Legacy mapping for backward compatibility
const LEGACY_TOPIC_MAPPING: Record<string, string> = {
  // Direct mappings
  'greeting': 'GREETING',
  'farewell': 'FAREWELL',
  'thanks': 'THANKS',
  'how_are_you': 'MOOD_QUERY',
  'who_are_you': 'IDENTITY',
  'joke': 'JOKE',
  'help': 'HELP',
  'weather': 'WEATHER_INQUIRY',
  'mood_negative': 'NEGATIVE_REACTION',
  'mood_positive': 'POSITIVE_REACTION',
  'user_confused': 'CONFUSED',
  'compliment_bot': 'COMPLIMENT',
  'request_help': 'HELP',
  'ask_identity': 'IDENTITY',
  'request_joke': 'JOKE',
  'affirmation': 'AFFIRMATION',
  'negation': 'NEGATION',
  'language_switch': 'LANGUAGE_SWITCH',
  'user_angry': 'USER_ANGRY',

  // Legacy ST_-Format mappings
  'ST_GREETING_HELLO': 'GREETING',
  'ST_FAREWELL': 'FAREWELL',
  'ST_THANKS': 'THANKS',
  'ST_MOOD_QUERY': 'MOOD_QUERY',
  'ST_IDENTITY': 'IDENTITY',
  'ST_SMALLTALK_JOKE': 'JOKE',
  'ST_HELP': 'HELP',
  'ST_WEATHER_INQUIRY': 'WEATHER_INQUIRY',
  'ST_GENERIC_NEGATIVE_REACTION': 'NEGATIVE_REACTION',
  'ST_GENERIC_POSITIVE_REACTION': 'POSITIVE_REACTION'
};

/**
 * Helper to check if an intent is a known smalltalk intent
 * @param intentName The intent to check
 * @returns True if it's a known smalltalk intent
 */
function isKnownSmalltalkIntent(intentName: string | undefined): intentName is keyof typeof SMALLTALK_TOPICS {
  if (!intentName) return false;
  return intentName in SMALLTALK_TOPICS;
}

/**
 * Retrieves a smalltalk response based on the intent and recognized entities
 * @param intentName Name of the detected intent (can be undefined if no intent was recognized)
 * @param entities Recognized entities in the user request
 * @param language Current language
 * @returns The appropriate smalltalk response as a string
 */
export async function getSmalltalkResponse(
  intentName: string | undefined,
  entities: Entity[] = [],
  language: Language = 'de'
): Promise<string> {
  console.log(`[DEBUG] getSmalltalkResponse called with: intentName=${intentName}, language=${language}`);

  try {
    // Determine the smalltalk topic based on the intent name
    const topic = mapIntentToTopic(intentName);
    console.log(`[DEBUG] Derived smalltalk topic: "${topic}"`);

    // First, check if we have a direct match in our enhanced SMALLTALK_TOPICS
    if (intentName && isKnownSmalltalkIntent(intentName)) {
      const topicData = SMALLTALK_TOPICS[intentName];
      const languageResponses = topicData.responses[language] || topicData.responses['en']; // Fallback to English
      
      if (languageResponses && languageResponses.length > 0) {
        // Return a random response from our predefined list
        const randomIndex = Math.floor(Math.random() * languageResponses.length);
        // FIX: Use explicit type assertion to solve TypeScript error
        return String(languageResponses[randomIndex]);
      }
    }

    // If not found in predefined responses, search in the database
    const response = await getRandomSmalltalkResponse(topic, language);

    if (response) {
      console.log(`[DEBUG] Response found in database for topic "${topic}"`);
      return response;
    }

    // If no response was found in the database, use a general fallback response
    console.log(`[DEBUG] No response found in database for topic "${topic}"`);

    // Different fallback responses based on the derived topic
    if (topic.includes('GREETING')) {
      return language === 'de' ? "Hallo! Wie kann ich dir helfen?" : "Hello! How can I help you?";
    } else if (topic.includes('FAREWELL')) {
      return language === 'de' ? "Auf Wiedersehen! Bis zum nächsten Mal." : "Goodbye! See you next time.";
    } else if (topic.includes('THANKS')) {
      return language === 'de' ? "Gerne! Ich helfe immer gern." : "You're welcome! Always happy to help.";
    } else if (topic === 'UNKNOWN') {
       return language === 'de'
        ? "Entschuldigung, ich bin mir nicht sicher, wie ich darauf antworten soll. Kann ich dir mit etwas anderem helfen?"
        : "I'm sorry, I'm not sure how to respond to that. Can I help you with something else?";
    }
    else {
      // Generic fallback response for all other topics not explicitly handled
      return language === 'de'
        ? `Ich habe leider keine spezifische Smalltalk-Antwort zum Thema "${topic}". Kann ich dir mit etwas anderem helfen?`
        : `I don't have a specific smalltalk response for the topic "${topic}". Can I help you with something else?`;
    }
  } catch (error) {
    console.error(`[DEBUG] Error retrieving smalltalk response:`, error);

    // Simple fallback for errors
    return language === 'de'
      ? "Entschuldigung, es gab ein technisches Problem. Bitte versuche es später noch einmal."
      : "Sorry, there was a technical issue. Please try again later.";
  }
}

/**
 * Maps an intent name to a topic for database queries
 * @param intentName The intent name (can be undefined)
 * @returns The derived topic as a string (guaranteed not undefined)
 */
function mapIntentToTopic(intentName: string | undefined): string {
  // Handle undefined/null safely at the beginning
  const safeIntentName = intentName ?? '';

  // Normalize the intent name
  // If it starts with "smalltalk_", remove this prefix
  let topic = safeIntentName;

  if (topic.startsWith('smalltalk_')) {
    topic = topic.substring(10);
  }

  // First check in the enhanced SMALLTALK_TOPICS
  if (intentName && isKnownSmalltalkIntent(intentName)) {
    return SMALLTALK_TOPICS[intentName].topic;
  }

  // Then check in the legacy mapping
  const legacyTopic = LEGACY_TOPIC_MAPPING[topic];
  if (legacyTopic) {
    // This is now safe because we've checked legacyTopic exists
    return legacyTopic;
  }

  // If the intent name starts with "ST_", remove this prefix and use the rest
  if (topic.startsWith('ST_')) {
    return topic.substring(3);
  }

  // If the original intent name was empty or couldn't be mapped
  if (safeIntentName === '') {
    return 'UNKNOWN';
  }

  // Otherwise return the intent name (normalized to uppercase for consistency with database)
  // This serves as a fallback if the intent name has no known prefix or mapping
  return topic.toUpperCase();
}