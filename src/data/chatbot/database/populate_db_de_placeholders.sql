-- =================================================================================
-- SQL Script zum Befüllen der chatbot_knowledge.db mit PLATZHALTERN für DEUTSCH ('de')
-- =================================================================================
-- WICHTIG: Dieses Skript enthält nur PLATZHALTER für Antworten und Keywords.
--          Du MUSST diese Platzhalter durch echte Inhalte ersetzen,
--          entweder direkt in diesem Skript VOR der Ausführung,
--          oder nachträglich mit dem DB Browser for SQLite.
-- =================================================================================

-- === FAQs Deutsch ('de') ===
-- Füge hier Einträge für JEDEN faq_* Intent aus deiner intents_de.json ein.

INSERT INTO faqs (language, intent_name, question, answer, keywords) VALUES
('de', 'faq_cancel_subscription', 'Wie kann ich mein Abo kündigen?', '[PLATZHALTER] Antwort für faq_cancel_subscription. Beschreibe hier den Kündigungsprozess in den Profileinstellungen.', 'kündigen, abo, abonnement, stornieren, beenden, vertrag, kündigung'),
('de', 'faq_pricing_info', 'Was kostet das Abo?', '[PLATZHALTER] Antwort für faq_pricing_info. Nenne hier die Preise für die verschiedenen Abo-Modelle (Basis, Premium etc.).', 'preis, kosten, gebühr, abo, abonnement, zahlen, tarif, premium'),
('de', 'faq_feature_list', 'Welche Funktionen gibt es?', '[PLATZHALTER] Antwort für faq_feature_list. Liste hier die Hauptfunktionen der App auf, ggf. Unterschiede Basis/Premium.', 'funktionen, features, was kann die app, umfang, möglichkeiten, liste, premium'),
('de', 'faq_app_updates', 'Gibt es Updates für die App?', '[PLATZHALTER] Antwort für faq_app_updates. Erkläre hier, wie Updates bereitgestellt werden und wo man Infos findet.', 'update, neu, version, aktualisieren, neuheiten, changelog, roadmap'),
('de', 'faq_device_compatibility', 'Auf welchen Geräten läuft die App?', '[PLATZHALTER] Antwort für faq_device_compatibility. Liste hier unterstützte Plattformen (iOS, Android, Web?) und ggf. Mindestanforderungen.', 'geräte, kompatibel, plattform, ios, android, handy, tablet, pc, mac'),
('de', 'faq_offline_mode', 'Kann ich die Inhalte offline hören?', '[PLATZHALTER] Antwort für faq_offline_mode. Erkläre hier die Offline-Funktion (Verfügbarkeit, wie herunterladen etc.).', 'offline, download, herunterladen, ohne internet, flugmodus, speichern'),
('de', 'faq_how_subliminals_work', 'Wie funktionieren Subliminals?', '[PLATZHALTER] Antwort für faq_how_subliminals_work. Gib hier eine einfache Erklärung zur Wirkungsweise.', 'subliminal, funktion, wirkung, unterbewusstsein, affirmationen, technik, wissenschaft'),
('de', 'faq_headphones_needed', 'Brauche ich Kopfhörer?', '[PLATZHALTER] Antwort für faq_headphones_needed. Erkläre hier, wann Kopfhörer nötig (Binaural Beats) oder empfohlen sind.', 'kopfhörer, nötig, erforderlich, binaural beats, stereo, lautsprecher, wirkung'),
('de', 'faq_how_often_listen', 'Wie oft und wie lange soll ich hören?', '[PLATZHALTER] Antwort für faq_how_often_listen. Gib hier Empfehlungen zur Nutzungsdauer und -frequenz.', 'hören, oft, dauer, frequenz, wie lange, täglich, empfehlung, routine, wirkung'),
('de', 'faq_download_offline', 'Wie lade ich Inhalte herunter?', '[PLATZHALTER] Antwort für faq_download_offline. Gib hier eine kurze Anleitung zum Download-Vorgang in der App.', 'download, anleitung, herunterladen, speichern, offline, button, finden, wie'),
('de', 'faq_change_email', 'Wie ändere ich meine E-Mail Adresse?', '[PLATZHALTER] Antwort für faq_change_email. Beschreibe hier, wo in den Einstellungen die E-Mail geändert werden kann.', 'email, mail, adresse ändern, aktualisieren, kontaktdaten, profil, konto'),
('de', 'faq_delete_account', 'Wie lösche ich mein Konto?', '[PLATZHALTER] Antwort für faq_delete_account. Erkläre hier den Prozess zur Kontolöschung und weise auf die Konsequenzen hin.', 'konto löschen, account entfernen, profil löschen, daten löschen, kündigen, permanent'),
('de', 'faq_playback_error', 'Was tun bei Wiedergabefehlern?', '[PLATZHALTER] Antwort für faq_playback_error. Gib hier erste Schritte zur Fehlerbehebung (Internet, Neustart, Cache) und den Hinweis auf den Support.', 'wiedergabe, fehler, spielt nicht, ton, probleme, streaming, hängt, absturz, player'),
('de', 'faq_login_error', 'Was tun bei Login-Problemen?', '[PLATZHALTER] Antwort für faq_login_error. Hinweise zur Passwortprüfung, "Passwort vergessen"-Funktion und Support-Kontakt.', 'login, anmelden, passwort falsch, zugang, fehler, einloggen, authentifizierung'),
('de', 'faq_data_security', 'Wie sicher sind meine Daten?', '[PLATZHALTER] Antwort für faq_data_security. Gib hier eine Zusicherung zum Datenschutz, Verweis auf die Datenschutzerklärung.', 'daten, sicherheit, datenschutz, dsgvo, verschlüsselung, privacy, sicher'),
('de', 'faq_scientific_basis', 'Ist die Wirkung wissenschaftlich belegt?', '[PLATZHALTER] Antwort für faq_scientific_basis. Erwähne hier den Stand der Forschung (untersucht, aber individuell), Verweis auf Website-Infos, Hinweis auf keine medizinische Beratung.', 'wissenschaft, studie, beleg, wirksamkeit, forschung, evidenz, placebo, nachweis'),
('de', 'faq_medical_disclaimer', 'Ersetzt die App eine medizinische Behandlung?', '[PLATZHALTER] Antwort für faq_medical_disclaimer. Stelle klar, dass die App keine medizinische/therapeutische Behandlung ersetzt und man bei Beschwerden Fachleute konsultieren soll.', 'medizin, therapie, arzt, behandlung, disclaimer, gesundheit, krankheit, heilung, ersatz'),
('de', 'faq_show_alternatives', 'Gibt es Alternativen?', '[PLATZHALTER] Antwort für faq_show_alternatives. Biete hier an, Alternativen zu nennen oder Vergleiche anzustellen, wenn der Nutzer präzisiert, wozu er Alternativen sucht.', 'alternative, anders, optionen, vergleich, ähnlich, konkurrenz, weiteres'),
('de', 'faq_premium_benefits', 'Was sind die Vorteile von Premium?', '[PLATZHALTER] Antwort für faq_premium_benefits. Liste hier die konkreten Vorteile des Premium-Abos auf (z.B. Offline-Modus, alle Inhalte, keine Werbung etc.).', 'vorteile, premium, nutzen, mehrwert, funktionen, lohnt sich, upgrade, unterschied'),
('de', 'faq_find_invoice', 'Wo finde ich meine Rechnungen?', '[PLATZHALTER] Antwort für faq_find_invoice. Beschreibe hier den Ort in den Kontoeinstellungen, wo Rechnungen/Zahlungshistorie zu finden sind.', 'rechnung, rechnungen, zahlung, abbuchung, beleg, quittung, historie, finden, sehen, download');

-- Füge hier INSERTs für weitere faq_* Intents hinzu, falls es noch welche gibt!
-- Beispiel:
-- ('de', 'faq_general', 'Allgemeine Frage', '[PLATZHALTER] Dies ist eine allgemeine Antwort. Bitte präzisiere deine Frage.', 'allgemein, frage, info'),


-- === Smalltalk Deutsch ('de') ===
-- Füge hier Einträge für JEDEN smalltalk_* Intent ein, der nicht in der route.ts RESPONSE_REGISTRY ist.
-- Leite den 'topic' vom Intent-Namen ab (z.B. smalltalk_ask_identity -> ASK_IDENTITY).
-- Füge MEHRERE Antwortvarianten pro Topic hinzu!

INSERT INTO smalltalk_responses (language, topic, response) VALUES
('de', 'REQUEST_JOKE', '[PLATZHALTER] Witz 1: Warum summen Bienen? Weil sie den Text nicht kennen!'),
('de', 'REQUEST_JOKE', '[PLATZHALTER] Witz 2: Was ist der Unterschied zwischen einem Zoo und einem Finanzamt? Im Zoo sitzen die Affen hinter Gittern.'),
('de', 'REQUEST_JOKE', '[PLATZHALTER] Witz 3: Fragt der Richter den Angeklagten: "Wieso haben Sie das Auto gestohlen?" - "Ich musste schnell zur Arbeit." - "Aber warum haben Sie nicht den Bus genommen?" - "Dafür hatte ich keinen Führerschein."'),
('de', 'REQUEST_HELP', '[PLATZHALTER] Hilfe 1: Natürlich, wobei kann ich dir behilflich sein?'),
('de', 'REQUEST_HELP', '[PLATZHALTER] Hilfe 2: Klar doch! Was möchtest du wissen oder tun?'),
('de', 'REQUEST_HELP', '[PLATZHALTER] Hilfe 3: Ich helfe gerne. Beschreibe einfach dein Anliegen.'),
('de', 'ASK_IDENTITY', '[PLATZHALTER] Identität 1: Ich bin der Mindfluence Assistent, eine KI, die dir bei Fragen zur App hilft.'),
('de', 'ASK_IDENTITY', '[PLATZHALTER] Identität 2: Mein Name ist Mindfluence Chatbot. Ich bin hier, um deine Fragen zu beantworten.'),
('de', 'ASK_IDENTITY', '[PLATZHALTER] Identität 3: Du sprichst mit einer künstlichen Intelligenz von Mindfluence.'),
('de', 'COMPLIMENT_BOT', '[PLATZHALTER] Kompliment 1: Danke, das ist sehr nett von dir!'),
('de', 'COMPLIMENT_BOT', '[PLATZHALTER] Kompliment 2: Freut mich, wenn ich nützlich bin! Danke für das Lob.'),
('de', 'COMPLIMENT_BOT', '[PLATZHALTER] Kompliment 3: Dankeschön! Ich lerne immer dazu.'),
('de', 'USER_CONFUSED', '[PLATZHALTER] Verwirrt 1: Entschuldige, wenn das unklar war. Kannst du mir sagen, was genau du nicht verstanden hast?'),
('de', 'USER_CONFUSED', '[PLATZHALTER] Verwirrt 2: Okay, ich versuche es anders zu formulieren. Was ist dir nicht klar?'),
('de', 'USER_CONFUSED', '[PLATZHALTER] Verwirrt 3: Kein Problem. Frag einfach nochmal nach, was du wissen möchtest.');

-- Füge hier Platzhalter für weitere Smalltalk-Topics hinzu, falls benötigt (z.B. AFFIRMATION, NEGATION, LANGUAGE_SWITCH, COMPLAINT_FRUSTRATION etc.)
-- Beispiel:
-- ('de', 'AFFIRMATION', '[PLATZHALTER] Bestätigung 1: Okay.'),
-- ('de', 'AFFIRMATION', '[PLATZHALTER] Bestätigung 2: Verstanden.'),
-- ('de', 'NEGATION', '[PLATZHALTER] Verneinung 1: Alles klar, nicht.'),
-- ('de', 'NEGATION', '[PLATZHALTER] Verneinung 2: Okay, ich mache es nicht.'),


-- === ENDE DES SKRIPTS ===
-- Nicht vergessen: Änderungen in DB Browser for SQLite speichern ("Write Changes")!