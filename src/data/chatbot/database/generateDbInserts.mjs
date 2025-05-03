// generateDbInserts.mjs
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Konfiguration ---
const INPUT_JSON_PATH = './intents_de.json';
const OUTPUT_SQL_PATH = './generated_populate_db_de.sql';         // Ausgabedatei für SQL
const LANGUAGE = 'de';                                             // Sprache für die Einträge

// Deutsche Stoppwörter (kann erweitert werden)
const STOPWORDS_DE = new Set([
  'a', 'ab', 'aber', 'ach', 'acht', 'achte', 'achten', 'achter', 'achtes', 'ag', 'alle', 'allein', 'allem', 'allen', 'aller', 'allerdings',
  'alles', 'allgemeinen', 'als', 'also', 'am', 'an', 'andere', 'anderen', 'andern', 'anders', 'au', 'auch', 'auf', 'aus', 'ausser', 'außer',
  'ausserdem', 'außerdem', 'b', 'bald', 'bei', 'beide', 'beiden', 'beim', 'beispiel', 'bekannt', 'bereits', 'besonders', 'besser', 'besten',
  'bin', 'bis', 'bisher', 'bist', 'c', 'd', 'd.h', 'da', 'dabei', 'dadurch', 'dafür', 'dagegen', 'daher', 'dahin', 'dahinter', 'damals', 'damit',
  'danach', 'daneben', 'dank', 'dann', 'daran', 'darauf', 'daraus', 'darf', 'darfst', 'darin', 'darüber', 'darum', 'darunter', 'darüber', 'das',
  'dasein', 'daselbst', 'dass', 'dasselbe', 'davon', 'davor', 'dazu', 'dazwischen', 'dein', 'deine', 'deinem', 'deinen', 'deiner', 'deines', 'dem',
  'dementsprechend', 'demgegenüber', 'demgemäss', 'demgemäß', 'demselben', 'demzufolge', 'den', 'denen', 'denn', 'denselben', 'der', 'deren',
  'derjenige', 'derjenigen', 'dermassen', 'dermaßen', 'derselbe', 'derselben', 'des', 'deshalb', 'desselben', 'dessen', 'deswegen', 'dich',
  'die', 'diejenige', 'diejenigen', 'dies', 'diese', 'dieselbe', 'dieselben', 'diesem', 'diesen', 'dieser', 'dieses', 'dir', 'doch', 'dort', 'drei',
  'drin', 'dritte', 'dritten', 'dritter', 'drittes', 'du', 'durch', 'durchaus', 'dürfen', 'dürft', 'durfte', 'durften', 'e', 'eben', 'ebenso',
  'ehrlich', 'ei', 'ei,', 'eigen', 'eigene', 'eigenen', 'eigener', 'eigenes', 'ein', 'eine', 'einem', 'einen', 'einer', 'eines', 'einige',
  'einigen', 'einiger', 'einiges', 'einmal', 'eins', 'elf', 'en', 'ende', 'endlich', 'entweder', 'er', 'ernst', 'erst', 'erste', 'ersten',
  'erster', 'erstes', 'es', 'etwa', 'etwas', 'euch', 'euer', 'eure', 'eurem', 'euren', 'eurer', 'eures', 'f', 'fast', 'ferner', 'finde', 'finden',
  'folgende', 'folgenden', 'folgender', 'folgendes', 'fordern', 'fortsetzen', 'fragen', 'frau', 'frei', 'freie', 'freier', 'freies', 'fünf',
  'fünfte', 'fünften', 'fünfter', 'fünftes', 'für', 'g', 'gab', 'ganz', 'ganze', 'ganzen', 'ganzer', 'ganzes', 'gar', 'gedurft', 'gegen', 'gegenüber',
  'gehabt', 'gehen', 'geht', 'gekannt', 'gekonnt', 'gemacht', 'gemocht', 'gemusst', 'genug', 'genommen', 'gerade', 'gern', 'gesagt', 'geschweige',
  'gewesen', 'gewollt', 'geworden', 'gibt', 'ging', 'gleich', 'gott', 'gross', 'grosse', 'grossen', 'grosser', 'grosses', 'groß', 'große', 'großen',
  'großer', 'großes', 'gut', 'gute', 'guten', 'guter', 'gutes', 'h', 'hab', 'habe', 'haben', 'habt', 'hast', 'hat', 'hatte', 'hatten', 'hattest',
  'hattet', 'heisst', 'herr', 'heute', 'hier', 'hin', 'hinter', 'hoch', 'hätte', 'hätten', 'i', 'ich', 'ihm', 'ihn', 'ihnen', 'ihr', 'ihre', 'ihrem',
  'ihren', 'ihrer', 'ihres', 'ihretwegen', 'im', 'immer', 'in', 'indem', 'infolgedessen', 'ins', 'irgend', 'ist', 'j', 'ja', 'jahr', 'jahre', 'jahren',
  'je', 'jede', 'jedem', 'jeden', 'jeder', 'jedermann', 'jedermanns', 'jedes', 'jedoch', 'jemand', 'jemandem', 'jemanden', 'jene', 'jenem', 'jenen',
  'jener', 'jenes', 'jetzt', 'k', 'kam', 'kann', 'kannst', 'kaum', 'kein', 'keine', 'keinem', 'keinen', 'keiner', 'keines', 'klar', 'klare', 'klaren',
  'klarer', 'klares', 'klein', 'kleine', 'kleinen', 'kleiner', 'kleines', 'kommen', 'kommt', 'können', 'könnt', 'konnte', 'konnten', 'kurz', 'l',
  'lang', 'lange', 'längst', 'lassen', 'legt', 'lehnen', 'leicht', 'leide', 'lieber', 'los', 'm', 'machen', 'macht', 'machte', 'mag', 'magst', 'mahn',
  'man', 'manche', 'manchem', 'manchen', 'mancher', 'manches', 'mann', 'mehr', 'mein', 'meine', 'meinem', 'meinen', 'meiner', 'meines', 'mich', 'mir',
  'mit', 'mittel', 'mochte', 'möchte', 'mögen', 'möglich', 'mögt', 'morgen', 'muss', 'musst', 'musste', 'mussten', 'müssen', 'müsst', 'n', 'na', 'nach',
  'nachdem', 'nahm', 'natürlich', 'neben', 'nein', 'neue', 'neuen', 'neun', 'neunte', 'neunten', 'neunter', 'neuntes', 'nicht', 'nichts', 'nie', 'niemand',
  'niemandem', 'niemanden', 'noch', 'nun', 'nur', 'o', 'ob', 'oben', 'oder', 'offen', 'oft', 'ohne', 'ordnung', 'p', 'q', 'r', 'recht', 'rechte', 'rechten',
  'rechter', 'rechtes', 'richtig', 'rund', 's', 'sa', 'sache', 'sagt', 'sagte', 'sah', 'satt', 'schlecht', 'schluss', 'schon', 'sechs', 'sechste',
  'sechsten', 'sechster', 'sechstes', 'sehr', 'sei', 'seid', 'seien', 'sein', 'seine', 'seinem', 'seinen', 'seiner', 'seines', 'seit', 'seitdem', 'selbst',
  'sich', 'sie', 'sieben', 'siebente', 'siebenten', 'siebenter', 'siebentes', 'sind', 'so', 'solang', 'solche', 'solchem', 'solchen', 'solcher', 'solches',
  'soll', 'sollen', 'sollst', 'sollt', 'sollte', 'sollten', 'sondern', 'sonst', 'soweit', 'sowie', 'später', 'starten', 'statt', 'steht', 'suche', 'suchen',
  't', 'tag', 'tage', 'tagen', 'tat', 'teil', 'tel', 'tritt', 'trotzdem', 'tun', 'u', 'uhr', 'um', 'und', 'und?', 'uns', 'unser', 'unsere', 'unserem', 'unseren',
  'unserer', 'unseres', 'unter', 'v', 'vergangenen', 'viel', 'viele', 'vielem', 'vielen', 'vielleicht', 'vier', 'vierte', 'vierten', 'vierter', 'viertes',
  'vom', 'von', 'vor', 'w', 'wahr?', 'während', 'währenddem', 'währenddessen', 'wann', 'war', 'warauf', 'waren', 'warst', 'wart', 'warum', 'was', 'weg',
  'wegen', 'weil', 'weit', 'weiter', 'weitere', 'weiteren', 'weiterer', 'weiteres', 'welche', 'welchem', 'welchen', 'welcher', 'welches', 'wem', 'wen',
  'wenig', 'wenige', 'weniger', 'weniges', 'wenigstens', 'wenn', 'wer', 'werde', 'werden', 'werdet', 'weshalb', 'wessen', 'wie', 'wieder', 'wieso', 'will',
  'willst', 'wir', 'wird', 'wirklich', 'wirst', 'wisst', 'wo', 'woher', 'wohin', 'wohl', 'wollen', 'wollt', 'wollte', 'wollten', 'worden', 'wurde', 'wurden',
  'während', 'währenddem', 'währenddessen', 'wäre', 'würde', 'würden', 'x', 'y', 'z', 'z.b', 'zehn', 'zehnte', 'zehnten', 'zehnter', 'zehntes', 'zeit', 'zu',
  'zuerst', 'zugleich', 'zum', 'zunächst', 'zur', 'zurück', 'zusammen', 'zwanzig', 'zwei', 'zweite', 'zweiten', 'zweiter', 'zweites', 'zwischen', 'zwölf',
  'über', 'überhaupt', 'übrigens', 'bitte', 'danke', 'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'könnte', 'könnten', 'würdest', 'sollten', 'tun',
  'machen', 'gehen', 'sagen', 'geben', 'nehmen', 'sehen', 'lassen', 'stehen', 'liegen', 'sitzen', 'heißen', 'denken', 'wissen', 'glauben', 'meinen',
  'dürfen', 'müssen', 'mögen', 'wollen', 'sollen', 'werden', 'sein', 'haben', '?', '!', '.', ',', ';', ':', '"', '\'', '`', '(', ')', '[', ']', '{', '}'
]);
// --- Ende Konfiguration ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeGermanUmlauts(text) {
  return text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function tokenize(text) {
  if (!text) return [];
  // 1. Normalisieren (Umlaute, Kleinbuchstaben)
  let normalized = normalizeGermanUmlauts(text.toLowerCase());
  // 2. Satzzeichen entfernen (außer vielleicht Bindestriche in Wörtern?)
  normalized = normalized.replace(/[.,!?;:"()[\]{}]/g, ' ');
  // 3. In Wörter aufteilen und leere Strings entfernen
  return normalized.split(/\s+/).filter(token => token.length > 0);
}

function extractKeywords(examples, minWordLength = 3, maxKeywords = 10) {
  const wordCounts = {};
  let totalWords = 0;

  examples.forEach(example => {
    const tokens = tokenize(example);
    tokens.forEach(token => {
      if (token.length >= minWordLength && !STOPWORDS_DE.has(token)) {
        wordCounts[token] = (wordCounts[token] || 0) + 1;
        totalWords++;
      }
    });
  });

  // Sortiere Wörter nach Häufigkeit
  const sortedWords = Object.entries(wordCounts).sort(([, countA], [, countB]) => countB - countA);

  // Nimm die Top-Keywords, maximal maxKeywords
  const keywords = sortedWords.slice(0, maxKeywords).map(([word]) => word);

  return keywords.join(', '); // Komma-separiert für DB
}

function deriveSmalltalkTopic(intentName) {
  if (!intentName || !intentName.startsWith('smalltalk_')) {
    return null; // Oder einen Default-Topic?
  }
  // Wandelt 'smalltalk_request_joke' in 'REQUEST_JOKE' um
  return intentName.substring('smalltalk_'.length).toUpperCase();
}

async function generateSql() {
  const intentFilePath = path.resolve(__dirname, INPUT_JSON_PATH);
  const outputSqlFilePath = path.resolve(__dirname, OUTPUT_SQL_PATH);

  let sqlStatements = `-- =================================================================================\n`;
  sqlStatements += `-- SQL Script zum Befüllen der chatbot_knowledge.db für DEUTSCH ('${LANGUAGE}')\n`;
  sqlStatements += `-- Generiert am: ${new Date().toISOString()}\n`;
  sqlStatements += `-- Basierend auf: ${INPUT_JSON_PATH}\n`;
  sqlStatements += `-- WICHTIG: Antworten und Keywords sind automatisch generierte Vorschläge/Platzhalter.\n`;
  sqlStatements += `--          Bitte überprüfe und passe sie manuell an!\n`;
  sqlStatements += `-- =================================================================================\n\n`;

  try {
    const intentsJson = await fs.readFile(intentFilePath, 'utf-8');
    const intentsData = JSON.parse(intentsJson);

    // --- FAQs ---
    sqlStatements += `-- === FAQs (${LANGUAGE}) ===\n`;
    const faqIntents = intentsData.filter(intent => intent.type === 'faq');
    if (faqIntents.length === 0) {
        sqlStatements += `-- Keine FAQ-Intents gefunden in ${INPUT_JSON_PATH}\n`;
    } else {
        sqlStatements += `INSERT INTO faqs (language, intent_name, question, answer, keywords) VALUES\n`;
        const faqValues = faqIntents.map(intent => {
            const intentName = intent.name;
            // Nimm das erste Beispiel als Standardfrage (oder Intent-Namen falls keine Beispiele)
            const question = intent.examples && intent.examples.length > 0 ? intent.examples[0] : intentName;
            const answerPlaceholder = `[ANTWORT für ${intentName}] Bitte spezifische Antwort hier einfügen.`;
            // Extrahiere Keywords aus Beispielen
            const keywords = intent.examples && intent.examples.length > 0 ? extractKeywords(intent.examples) : '';

            // SQL-String-Escaping (einfach für ')
            const escapedQuestion = question.replace(/'/g, "''");
            const escapedAnswer = answerPlaceholder.replace(/'/g, "''");
            const escapedKeywords = keywords.replace(/'/g, "''");
            const escapedIntentName = intentName.replace(/'/g, "''");

            return `('${LANGUAGE}', '${escapedIntentName}', '${escapedQuestion}', '${escapedAnswer}', '${escapedKeywords}')`;
        }).join(',\n');
        sqlStatements += faqValues + ';\n\n';
    }

    // --- Smalltalk ---
    sqlStatements += `\n-- === Smalltalk Responses (${LANGUAGE}) ===\n`;
    const smalltalkIntents = intentsData.filter(intent => intent.type === 'smalltalk');

     if (smalltalkIntents.length === 0) {
        sqlStatements += `-- Keine Smalltalk-Intents gefunden in ${INPUT_JSON_PATH}\n`;
    } else {
        sqlStatements += `INSERT INTO smalltalk_responses (language, topic, response) VALUES\n`;
        const smalltalkValues = [];
        smalltalkIntents.forEach(intent => {
            const topic = deriveSmalltalkTopic(intent.name);
            if (topic) {
                // Generiere 2 Platzhalter-Antworten pro Topic
                for (let i = 1; i <= 2; i++) {
                    const responsePlaceholder = `[ANTWORTVARIANTE ${i} für ${topic}] Bitte hier eine Antwortvariante einfügen.`;
                    const escapedResponse = responsePlaceholder.replace(/'/g, "''");
                    const escapedTopic = topic.replace(/'/g, "''");
                    smalltalkValues.push(`('${LANGUAGE}', '${escapedTopic}', '${escapedResponse}')`);
                }
            } else {
                console.warn(`Konnte Topic für Smalltalk-Intent nicht ableiten: ${intent.name}`);
            }
        });

        if (smalltalkValues.length > 0) {
            sqlStatements += smalltalkValues.join(',\n') + ';\n';
        } else {
             sqlStatements += `-- Keine gültigen Smalltalk-Topics zum Einfügen gefunden.\n`;
        }
    }

    await fs.writeFile(outputSqlFilePath, sqlStatements);
    console.log(`SQL-Skript erfolgreich generiert: ${outputSqlFilePath}`);
    console.log(`\nWICHTIG: Öffne die Datei "${path.basename(outputSqlFilePath)}" und ersetze die [PLATZHALTER] durch deine tatsächlichen Inhalte, bevor du das Skript in DB Browser for SQLite ausführst!`);

  } catch (error) {
    console.error('Fehler beim Generieren des SQL-Skripts:', error);
    if (error.code === 'ENOENT') {
        console.error(`Stelle sicher, dass die Datei ${INPUT_JSON_PATH} existiert.`);
    } else if (error instanceof SyntaxError) {
        console.error(`Die Datei ${INPUT_JSON_PATH} scheint kein gültiges JSON zu sein.`);
    }
  }
}

generateSql();