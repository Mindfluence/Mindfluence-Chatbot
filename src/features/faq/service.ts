import type { Language, EnhancedEntity, Entity } from '@/types/nlp.types';
import { searchFaqsByQuery, hasFAQs } from '@/lib/databaseWrapper';

// Zentrales Intent-Daten-Objekt für mehrsprachige Behandlung
// Enthält sowohl Suchbegriffe als auch Anzeigenamen für jede Sprache
const INTENT_DATA = {
  'faq_cancel_subscription': {
    search: {
      // Erweiterte Suchbegriffe für bessere Abdeckung
      'de': 'kündigung kündigen abo abonnement abonnent abos beenden stornieren storno vertrag löschen entfernen',
      'en': 'cancel cancellation subscription terminate termination end delete remove'
    },
    display: {
      'de': 'Kündigung',
      'en': 'Subscription Cancellation'
    }
  },
  'faq_pricing_info': {
    search: {
      // Erweiterte Suchbegriffe für bessere Abdeckung
      'de': 'preis preise kosten preismodell gebühren bezahlung zahlung geld tarif tarife',
      'en': 'price pricing cost costs fee fees payment pay money rate rates'
    },
    display: {
      'de': 'Preisgestaltung',
      'en': 'Pricing'
    }
  },
  'faq_feature_list': {
    search: {
      'de': 'funktionen features leistungen umfang möglichkeiten können',
      'en': 'features functionality capabilities options possibilities functions'
    },
    display: {
      'de': 'Funktionen',
      'en': 'Features'
    }
  },
  'faq_app_updates': {
    search: {
      'de': 'updates aktualisierung version neuerungen änderungen neu verbessert',
      'en': 'updates update version new features changes improved enhancement'
    },
    display: {
      'de': 'App-Updates',
      'en': 'App Updates'
    }
  },
  'faq_device_compatibility': {
    search: {
      'de': 'kompatibilität geräte unterstützt browser system betriebssystem plattform',
      'en': 'compatibility device supported browsers system operating platform'
    },
    display: {
      'de': 'Gerätekompatibilität',
      'en': 'Device Compatibility'
    }
  },
  'faq_offline_mode': {
    search: {
      'de': 'offline modus ohne internet verbindung netz netzwerk datenverbindung',
      'en': 'offline mode without internet connection network data'
    },
    display: {
      'de': 'Offline-Modus',
      'en': 'Offline Mode'
    }
  },
  'faq_show_alternatives': {
    search: {
      'de': 'alternativen konkurrenz andere anbieter vergleich wettbewerb',
      'en': 'alternatives competitors other providers comparison competition'
    },
    display: {
      'de': 'Alternativen',
      'en': 'Alternatives'
    }
  },
  'faq_find_invoice': {
    search: {
      'de': 'rechnung rechnungen suchen finden anzeigen herunterladen download invoice',
      'en': 'invoice invoices find search show download view'
    },
    display: {
      'de': 'Rechnungen finden',
      'en': 'Find Invoices'
    }
  },
  'faq_general': {
    search: {
      'de': 'allgemein fragen hilfe information unterstützung',
      'en': 'general questions help information support'
    },
    display: {
      'de': 'Allgemeine Informationen',
      'en': 'General Information'
    }
  },
  'faq_headphones_needed': {
    search: {
      'de': 'kopfhörer kopfhoerer nötig notwendig erforderlich brauchen benutzen binaural beats stereo lautsprecher',
      'en': 'headphones needed required necessary use binaural beats stereo speakers'
    },
    display: {
      'de': 'Kopfhörer-Nutzung',
      'en': 'Headphone Usage'
    }
  },
  'faq_how_subliminals_work': {
    search: {
      'de': 'subliminal funktion wirkung wirkungsweise unterbewusstsein affirmationen technik wie funktioniert',
      'en': 'subliminal function effect how work subconscious affirmations technique explanation'
    },
    display: {
      'de': 'Funktionsweise Subliminals',
      'en': 'How Subliminals Work'
    }
  },
  'faq_how_often_listen': {
    search: {
      'de': 'wie oft hören dauer häufigkeit anwendung empfehlung täglich minuten wochen wie lange',
      'en': 'how often listen duration frequency recommendation daily minutes weeks how long usage routine'
    },
    display: {
      'de': 'Hörfrequenz/-dauer',
      'en': 'Listening Frequency/Duration'
    }
  },
  'faq_download_offline': {
    search: {
      'de': 'download herunterladen anleitung offline speichern wie button finden',
      'en': 'download offline save how instruction button find'
    },
    display: {
      'de': 'Download-Anleitung',
      'en': 'Download Instructions'
    }
  },
  'faq_change_email': {
    search: {
      'de': 'email mail adresse ändern aktualisieren kontaktdaten profil konto',
      'en': 'email mail address change update contact profile account'
    },
    display: {
      'de': 'E-Mail ändern',
      'en': 'Change Email'
    }
  },
  'faq_delete_account': {
    search: {
      'de': 'konto löschen account entfernen profil daten dauerhaft kündigen schließen',
      'en': 'delete account remove profile data permanently cancel close'
    },
    display: {
      'de': 'Konto löschen',
      'en': 'Delete Account'
    }
  },
  'faq_playback_error': {
    search: {
      'de': 'wiedergabe fehler spielt nicht problem audio ton störung cache internet',
      'en': 'playback error not playing problem audio sound issue cache internet connection'
    },
    display: {
      'de': 'Wiedergabefehler',
      'en': 'Playback Error'
    }
  },
  'faq_login_error': {
    search: {
      'de': 'login anmelden anmeldung fehler problem passwort falsch kennwort zugang',
      'en': 'login signin signup error problem password wrong credentials access'
    },
    display: {
      'de': 'Login-Problem',
      'en': 'Login Problem'
    }
  },
  'faq_data_security': {
    search: {
      'de': 'daten sicherheit datenschutz dsgvo sicher verschlüsselung privacy',
      'en': 'data security privacy gdpr safe encryption secure'
    },
    display: {
      'de': 'Datensicherheit',
      'en': 'Data Security'
    }
  },
  'faq_scientific_basis': {
    search: {
      'de': 'wissenschaftlich bewiesen studie forschung wirksamkeit beleg evidenz',
      'en': 'scientific proven study research effectiveness evidence proof basis'
    },
    display: {
      'de': 'Wissenschaftliche Grundlage',
      'en': 'Scientific Basis'
    }
  },
  'faq_medical_disclaimer': {
    search: {
      'de': 'medizin therapie ersatz arzt behandlung gesundheit disclaimer krankheit',
      'en': 'medical therapy replacement doctor treatment health disclaimer illness disease'
    },
    display: {
      'de': 'Medizinischer Hinweis',
      'en': 'Medical Disclaimer'
    }
  },
  'faq_premium_benefits': {
    search: {
      'de': 'premium vorteile nutzen mehrwert funktionen lohnt sich upgrade unterschied offline werbefrei',
      'en': 'premium benefits advantages value features worth upgrade difference offline adfree exclusive'
    },
    display: {
      'de': 'Premium-Vorteile',
      'en': 'Premium Benefits'
    }
  },
  'faq_session_duration_impact': {
    search: {
      'de': 'hördauer dauer unterschied wirkung effekt lang kurz 10 30 minuten',
      'en': 'listening duration time difference effect long short 10 30 minutes impact'
    },
    display: {
      'de': 'Auswirkung Hördauer',
      'en': 'Impact of Listening Duration'
    }
  },
  'faq_refund_annual_subscription': {
    search: {
      'de': 'jahresabo kündigen rückerstattung geld zurück anteilig bedingungen',
      'en': 'annual subscription cancel refund money back partial conditions terms'
    },
    display: {
      'de': 'Rückerstattung Jahresabo',
      'en': 'Annual Subscription Refund'
    }
  },
  'faq_payment_security': { 
    search: { 
      'de': 'zahlung sicherheit kreditkarte daten pci stripe', 
      'en': 'payment security credit card data pci stripe' 
    }, 
    display: { 
      'de': 'Zahlungssicherheit', 
      'en': 'Payment Security' 
    } 
  },
  'faq_combine_subliminals_meditation': { 
    search: { 
      'de': 'kombinieren subliminal meditation gleichzeitig anwendung', 
      'en': 'combine subliminal meditation simultaneously application practice' 
    }, 
    display: { 
      'de': 'Subliminals & Meditation', 
      'en': 'Subliminals & Meditation' 
    } 
  },
  'faq_multitasking_effectiveness': { 
    search: { 
      'de': 'multitasking nebenbei ablenkung wirkung effektivität hören', 
      'en': 'multitasking distraction effect effectiveness listening attention' 
    }, 
    display: { 
      'de': 'Effektivität bei Ablenkung', 
      'en': 'Effectiveness with Multitasking' 
    } 
  },
  'faq_account_recovery': { 
    search: { 
      'de': 'konto wiederherstellen zugang email verloren hilfe support', 
      'en': 'account recovery access email lost help support verification' 
    }, 
    display: { 
      'de': 'Kontowiederherstellung', 
      'en': 'Account Recovery' 
    } 
  },
  'faq_sound_quality_issues': { 
    search: { 
      'de': 'tonqualität sound schlecht verzerrt knackt rauscht probleme kopfhörer', 
      'en': 'sound quality bad distorted crackles noise problems headphones connection' 
    }, 
    display: { 
      'de': 'Tonqualitätsprobleme', 
      'en': 'Sound Quality Issues' 
    } 
  },
  'faq_shared_wifi': { 
    search: { 
      'de': 'wlan wifi öffentlich hotspot netzwerk sicherheit nutzen streaming', 
      'en': 'wifi public hotspot network security use streaming connection' 
    }, 
    display: { 
      'de': 'Öffentliches WLAN', 
      'en': 'Public WiFi' 
    } 
  },
  'faq_beta_testing': { 
    search: { 
      'de': 'beta test tester programm teilnehmen neue funktionen vorschau', 
      'en': 'beta test tester program participate new features preview feedback' 
    }, 
    display: { 
      'de': 'Beta-Test', 
      'en': 'Beta Testing' 
    } 
  },
  'faq_content_duration_sleep': { 
    search: { 
      'de': 'schlaf audio dauer länge lang nacht einschlafen durchschlafen', 
      'en': 'sleep audio duration length long night fall asleep stay asleep deep sleep' 
    }, 
    display: { 
      'de': 'Dauer Schlaf-Audios', 
      'en': 'Sleep Audio Duration' 
    } 
  },
  'faq_search_tips': { 
    search: { 
      'de': 'suche suchen finden tipps trick stichwörter keywords filter kategorien', 
      'en': 'search find tips trick keywords filter categories discover audio' 
    }, 
    display: { 
      'de': 'Suchtipps', 
      'en': 'Search Tips' 
    } 
  },
  'faq_cancel_during_trial': { 
    search: { 
      'de': 'testphase probeabo kündigen während kostenlos frist rechtzeitig', 
      'en': 'trial period cancel free timely prevent costs subscription settings' 
    }, 
    display: { 
      'de': 'Kündigung Probeabo', 
      'en': 'Trial Cancellation' 
    } 
  },
  'faq_data_usage_streaming': { 
    search: { 
      'de': 'datenvolumen verbrauch streaming mobilfunk mobile daten internet kosten mb gb', 
      'en': 'data usage streaming mobile cellular internet cost consumption offline download wifi' 
    }, 
    display: { 
      'de': 'Datenverbrauch Streaming', 
      'en': 'Streaming Data Usage' 
    } 
  },
  'faq_subliminals_while_driving': { 
    search: { 
      'de': 'autofahren auto fahren sicherheit hören subliminal binaural beats warnung verboten gefährlich', 
      'en': 'driving car safety listening subliminal binaural beats warning forbidden dangerous attention' 
    }, 
    display: { 
      'de': 'Hören beim Autofahren', 
      'en': 'Listening While Driving' 
    } 
  },
  'faq_age_restriction': { 
    search: { 
      'de': 'altersbeschränkung jugendschutz nutzungsbedingungen agb mindestalter 18 kinder eltern', 
      'en': 'age restriction minimum terms conditions minor children parents consent' 
    }, 
    display: { 
      'de': 'Altersbeschränkung', 
      'en': 'Age Restriction' 
    } 
  },
  'faq_evidence_vs_belief': { 
    search: { 
      'de': 'glaube glauben wirkung funktionieren placebo einstellung wissenschaft skepsis', 
      'en': 'belief believe effect works placebo mindset science skepticism subconscious' 
    }, 
    display: { 
      'de': 'Glaube vs. Wirkung', 
      'en': 'Belief vs. Effect' 
    } 
  },
  'faq_payment_receipt': { 
    search: { 
      'de': 'rechnung quittung beleg zahlungsbestätigung email bekommen historie profil', 
      'en': 'invoice receipt payment confirmation email get history profile proof' 
    }, 
    display: { 
      'de': 'Zahlungsbeleg', 
      'en': 'Payment Receipt' 
    } 
  },
  'faq_playlist_limit': { 
    search: { 
      'de': 'limit begrenzung anzahl playlists favoriten tracks speichern download', 
      'en': 'limit number playlists favorites tracks save download storage' 
    }, 
    display: { 
      'de': 'Limits Playlists/Favoriten', 
      'en': 'Playlist/Favorite Limits' 
    } 
  },
  'faq_offline_playback_quality': { 
    search: { 
      'de': 'offline download audioqualität qualität unterschied streaming bitrate premium', 
      'en': 'offline download audio quality difference streaming bitrate premium high standard settings' 
    }, 
    display: { 
      'de': 'Offline Audioqualität', 
      'en': 'Offline Audio Quality' 
    } 
  },
  'faq_pause_subscription': { 
    search: { 
      'de': 'abo pausieren pause unterbrechen mitgliedschaft statt kündigen alternative', 
      'en': 'pause subscription hold membership instead cancel alternative feature' 
    }, 
    display: { 
      'de': 'Abo pausieren', 
      'en': 'Pause Subscription' 
    } 
  },
  'faq_subliminal_language_impact': { 
    search: { 
      'de': 'subliminal sprache wirkung muttersprache anderssprachig deutsch englisch unterbewusstsein', 
      'en': 'subliminal language effect native foreign german english subconscious effectiveness' 
    }, 
    display: { 
      'de': 'Wirkung Fremdsprache', 
      'en': 'Foreign Language Effect' 
    } 
  },
  'faq_isochronic_tones_safety': { 
    search: { 
      'de': 'isochrone töne sicherheit sicher risiko nebenwirkungen epilepsie neurologisch arzt', 
      'en': 'isochronic tones safety safe risk side effects epilepsy neurological doctor warning' 
    }, 
    display: { 
      'de': 'Sicherheit Isochrone Töne', 
      'en': 'Isochronic Tones Safety' 
    } 
  },
  'faq_listening_with_others': { 
    search: { 
      'de': 'zusammen hören gemeinsam partner lautsprecher kopfhörer binaural beats subliminal', 
      'en': 'listen together partner others speakers headphones binaural beats subliminal isochronic' 
    }, 
    display: { 
      'de': 'Gemeinsam Hören', 
      'en': 'Listening Together' 
    } 
  },
  'faq_changing_affirmations': { 
    search: { 
      'de': 'affirmationen ändern updates version neu optimiert inhalt audio', 
      'en': 'affirmations change updates version new optimized content audio revised quality' 
    }, 
    display: { 
      'de': 'Änderung von Affirmationen', 
      'en': 'Changing Affirmations' 
    } 
  },
  'faq_delete_downloaded_content': { 
    search: { 
      'de': 'download löschen entfernen offline inhalte audio datei speicherplatz verwalten', 
      'en': 'download delete remove offline content audio file storage manage instruction' 
    }, 
    display: { 
      'de': 'Downloads löschen', 
      'en': 'Delete Downloads' 
    } 
  },
  'faq_account_security_tips': { 
    search: { 
      'de': 'kontosicherheit sicherheit tipps passwort stark 2fa schutz login phishing', 
      'en': 'account security tips password strong 2fa protection login phishing sharing' 
    }, 
    display: { 
      'de': 'Kontosicherheit Tipps', 
      'en': 'Account Security Tips' 
    } 
  },
  'faq_push_notifications': { 
    search: { 
      'de': 'push benachrichtigungen notifications mitteilungen wofür zweck inhalt neu angebot update einstellungen', 
      'en': 'push notifications purpose content new offer update settings disable enable customize' 
    }, 
    display: { 
      'de': 'Push-Benachrichtigungen', 
      'en': 'Push Notifications' 
    } 
  },
  'faq_troubleshooting_general': { 
    search: { 
      'de': 'problembehandlung troubleshooting hilfe fehler funktioniert nicht app erste schritte internet neustart cache update support', 
      'en': 'troubleshooting help error not working app first steps internet restart cache update support guide' 
    }, 
    display: { 
      'de': 'Allg. Problembehandlung', 
      'en': 'General Troubleshooting' 
    } 
  },
  'faq_social_media': { 
    search: { 
      'de': 'social media soziale netzwerke facebook instagram twitter finden folgen community kontakt', 
      'en': 'social media networks facebook instagram twitter find follow community contact links profile' 
    }, 
    display: { 
      'de': 'Social Media', 
      'en': 'Social Media' 
    } 
  },
  'faq_binaural_vs_isochronic': { 
    search: { 
      'de': 'binaural beats isochrone töne unterschied vergleich besser wirkung effektivität kopfhörer', 
      'en': 'binaural beats isochronic tones difference comparison better effect effectiveness headphones speakers preference' 
    }, 
    display: { 
      'de': 'Binaural vs. Isochron', 
      'en': 'Binaural vs. Isochronic' 
    } 
  },
  'faq_affirmation_volume': { 
    search: { 
      'de': 'affirmationen lautstärke regeln einstellen separat subliminal unterschwellig leise pegel', 
      'en': 'affirmations volume adjust separate subliminal subconscious quiet level mix' 
    }, 
    display: { 
      'de': 'Affirmations-Lautstärke', 
      'en': 'Affirmation Volume' 
    } 
  },
  'faq_listening_while_working': { 
    search: { 
      'de': 'arbeit lernen während hören büro fokus konzentration audio subliminal ablenkung produktivität', 
      'en': 'work study listening office focus concentration audio subliminal distraction productivity headphones' 
    }, 
    display: { 
      'de': 'Hören bei der Arbeit', 
      'en': 'Listening While Working' 
    } 
  },
  'faq_effects_duration': { 
    search: { 
      'de': 'wirkung dauer wie lange anhält effekt spürbar kurzfristig langfristig nachhaltig subliminal', 
      'en': 'effect duration how long last noticeable short term long term sustainable subliminal application habit' 
    }, 
    display: { 
      'de': 'Wirkungsdauer', 
      'en': 'Effect Duration' 
    } 
  },
  'faq_can_i_share_account': { 
    search: { 
      'de': 'konto teilen account sharing mehrere nutzer familie freunde abo erlaubnis bedingungen agb', 
      'en': 'share account multiple users family friends subscription allowed terms conditions policy family plan' 
    }, 
    display: { 
      'de': 'Konto teilen', 
      'en': 'Account Sharing' 
    } 
  },
  'faq_payment_failed': { 
    search: { 
      'de': 'zahlung fehlgeschlagen zahlungsproblem abbuchung fehler kreditkarte paypal abo problem hilfe support bank', 
      'en': 'payment failed problem charge error credit card paypal subscription help support bank limit funds update' 
    }, 
    display: { 
      'de': 'Zahlung fehlgeschlagen', 
      'en': 'Payment Failed' 
    } 
  },
  'faq_supported_countries': { 
    search: { 
      'de': 'verfügbar länder regionen international weltweit app store google play download einschränkungen', 
      'en': 'available countries regions international worldwide app store google play download restrictions payment methods' 
    }, 
    display: { 
      'de': 'Verfügbare Länder', 
      'en': 'Supported Countries' 
    } 
  },
  'faq_storage_space': { 
    search: { 
      'de': 'speicherplatz größe download offline audio datei wie viel benötigen voll verwalten mb gb qualität', 
      'en': 'storage space size download offline audio file how much need full manage delete mb gb quality settings' 
    }, 
    display: { 
      'de': 'Speicherplatzbedarf', 
      'en': 'Storage Space' 
    } 
  },
  'faq_background_playback': { 
    search: { 
      'de': 'hintergrund wiedergabe abspielen app geschlossen bildschirm aus sperrbildschirm multitasking musik', 
      'en': 'background playback playing app closed screen off lockscreen multitasking music continues' 
    }, 
    display: { 
      'de': 'Hintergrundwiedergabe', 
      'en': 'Background Playback' 
    } 
  },
  'faq_custom_affirmations': { 
    search: { 
      'de': 'eigene affirmationen hinzufügen erstellen benutzerdefiniert anpassen audio funktion feature wunsch feedback', 
      'en': 'custom affirmations add create user defined customize audio function feature request feedback personalization' 
    }, 
    display: { 
      'de': 'Eigene Affirmationen', 
      'en': 'Custom Affirmations' 
    } 
  },
  'faq_specific_frequencies_meaning': { 
    search: { 
      'de': 'frequenzen hertz hz 5hz 10hz bedeutung gehirnwellen delta theta alpha binaural beats', 
      'en': 'frequencies hertz hz 5hz 10hz meaning brainwaves delta theta alpha beta gamma binaural beats technique effect resonance' 
    }, 
    display: { 
      'de': 'Bedeutung Frequenzen', 
      'en': 'Frequency Meanings' 
    } 
  },
  'faq_stereo_mono_headphones': { 
    search: { 
      'de': 'kopfhörer stereo mono unterschied voraussetzung notwendig binaural beats subliminal isochrone töne', 
      'en': 'headphones stereo mono difference requirement necessary binaural beats technique effect subliminal isochronic sound experience' 
    }, 
    display: { 
      'de': 'Stereo/Mono Kopfhörer', 
      'en': 'Stereo/Mono Headphones' 
    } 
  },
  'faq_listening_volume_binaural': { 
    search: { 
      'de': 'lautstärke binaural beats hören empfehlung wie laut moderat angenehm leise pegel schutz', 
      'en': 'volume binaural beats listening recommendation how loud moderate comfortable quiet level hearing protection' 
    }, 
    display: { 
      'de': 'Lautstärke Binaural Beats', 
      'en': 'Binaural Beats Volume' 
    } 
  },
  'faq_feeling_nothing': { 
    search: { 
      'de': 'wirkung effekt spüre nichts fühle nichts kein unterschied normal geduld zeit prozess regelmäßig subliminal', 
      'en': 'effect feel nothing no difference normal patience time process regular application subliminal binaural beats subtle' 
    }, 
    display: { 
      'de': 'Keine Wirkung spürbar?', 
      'en': 'Feeling No Effects?' 
    } 
  },
  'faq_headache_discomfort': { 
    search: { 
      'de': 'kopfschmerzen unwohl schwindel übelkeit nebenwirkungen problem hören lautstärke pause arzt warnung', 
      'en': 'headache discomfort dizzy nausea side effects problem listening volume break doctor warning sensitive frequency' 
    }, 
    display: { 
      'de': 'Unwohlsein/Kopfschmerzen', 
      'en': 'Discomfort/Headache' 
    } 
  },
  'faq_managing_family_members': { 
    search: { 
      'de': 'familienplan family plan verwalten administration mitglieder hinzufügen einladen entfernen löschen abo einstellungen', 
      'en': 'family plan manage administration members add invite remove delete subscription settings admin household' 
    }, 
    display: { 
      'de': 'Familienplan verwalten', 
      'en': 'Manage Family Plan' 
    } 
  },
  'faq_switching_devices_playback': { 
    search: { 
      'de': 'gerätewechsel geräte synchronisation fortschritt wiedergabe anhalten fortsetzen weiterhören konto sync', 
      'en': 'switch devices synchronization progress playback pause resume continue account seamless sync cross device' 
    }, 
    display: { 
      'de': 'Gerätewechsel Wiedergabe', 
      'en': 'Switching Device Playback' 
    } 
  },
  'faq_subscription_payment_date': { 
    search: { 
      'de': 'abbuchung zahlung datum wann tag monat jahr abrechnung zyklus periode fälligkeit abo profil', 
      'en': 'charge payment date when day month year billing cycle period due subscription profile renewal' 
    }, 
    display: { 
      'de': 'Abrechnungsdatum', 
      'en': 'Billing Date' 
    } 
  },
  'faq_contact_support_response_time': { 
    search: { 
      'de': 'support antwortzeit wie schnell dauer bearbeitung kundendienst kundenservice kontakt email ticket werktage', 
      'en': 'support response time how fast duration processing customer service contact email ticket business days wait' 
    }, 
    display: { 
      'de': 'Support-Antwortzeit', 
      'en': 'Support Response Time' 
    } 
  },
  'faq_background_data_usage': { 
    search: { 
      'de': 'datenverbrauch datenvolumen hintergrund inaktiv app geschlossen synchronisation push benachrichtigungen minimal akku', 
      'en': 'data usage consumption background inactive app closed synchronization push notifications minimal battery drain' 
    }, 
    display: { 
      'de': 'Hintergrund-Datenverbrauch', 
      'en': 'Background Data Usage' 
    } 
  },
  'faq_account_verification': { 
    search: { 
      'de': 'konto verifizieren verifizierung email bestätigen bestätigung registrierung anmeldung sicherheit link', 
      'en': 'account verify verification email confirm confirmation registration signup security step link' 
    }, 
    display: { 
      'de': 'Kontoverifizierung', 
      'en': 'Account Verification' 
    } 
  },
  'faq_cancel_confirmation_missing': { 
    search: { 
      'de': 'kündigung bestätigung email nicht erhalten fehlt spam abo status profil support problem', 
      'en': 'cancellation confirmation email not received missing spam subscription status profile support help issue check' 
    }, 
    display: { 
      'de': 'Fehlende Kündigungsbestätigung', 
      'en': 'Missing Cancellation Confirmation' 
    } 
  },
  'faq_why_headphones_binaural': { 
    search: { 
      'de': 'warum kopfhörer binaural beats notwendig erklärung frequenz unterschied ohr stereo gehirn effekt differenzton', 
      'en': 'why headphones binaural beats necessary required explanation technique frequency difference ear stereo brain effect differential tone perception' 
    }, 
    display: { 
      'de': 'Warum Kopfhörer für Binaurals?', 
      'en': 'Why Headphones for Binaurals?' 
    } 
  },
  'faq_iso_vs_binaural_headphones': { 
    search: { 
      'de': 'isochrone töne kopfhörer brauchen nötig ohne lautsprecher technik unterschied binaural beats', 
      'en': 'isochronic tones headphones need required without speakers technique difference binaural beats comparison' 
    }, 
    display: { 
      'de': 'Kopfhörer für Isochrone Töne?', 
      'en': 'Headphones for Isochronic Tones?' 
    } 
  },
  'faq_subliminal_effectiveness_skeptic': { 
    search: { 
      'de': 'skeptisch skepsis funktioniert das wirkung zweifel glaube wissenschaft beweis erfahrung placebo', 
      'en': 'skeptic skepticism does it work effect doubt belief science proof experience placebo try open minded' 
    }, 
    display: { 
      'de': 'Skepsis gegenüber Subliminals', 
      'en': 'Skepticism about Subliminals' 
    } 
  },
  'faq_family_plan_location': { 
    search: { 
      'de': 'familienplan family plan land standort haushalt wohnsitz bedingungen agb regel', 
      'en': 'family plan country location household residence conditions terms requirement rule same' 
    }, 
    display: { 
      'de': 'Familienplan Standort', 
      'en': 'Family Plan Location' 
    } 
  },
  'faq_subscription_gift_card': { 
    search: { 
      'de': 'zahlung bezahlen geschenkkarte guthabenkarte app store google play itunes guthaben abo möglich', 
      'en': 'payment pay gift card voucher app store google play itunes balance subscription possible use' 
    }, 
    display: { 
      'de': 'Zahlung mit Geschenkkarte', 
      'en': 'Payment with Gift Card' 
    } 
  },
  'faq_delete_data_vs_account': { 
    search: { 
      'de': 'unterschied daten löschen konto löschen account profil dsgvo vergessenwerden was passiert', 
      'en': 'difference delete data delete account profile gdpr forget impact what happens personal information' 
    }, 
    display: { 
      'de': 'Daten vs. Konto löschen', 
      'en': 'Delete Data vs. Account' 
    } 
  },
  'faq_new_content_notification_how': { 
    search: { 
      'de': 'neue inhalte benachrichtigung notification push info wie erfahren updates newsletter social media einstellungen', 
      'en': 'new content notification push info how find out updates newsletter social media settings subscribe' 
    }, 
    display: { 
      'de': 'Benachrichtigung neue Inhalte', 
      'en': 'New Content Notification' 
    } 
  },
  'faq_playlist_automatic': { 
    search: { 
      'de': 'playlist wiedergabeliste automatisch generiert kuratiert empfehlung mix vorschlag entdecken', 
      'en': 'playlist automatic generated curated recommendation mix suggestion discover personalized themed mood' 
    }, 
    display: { 
      'de': 'Automatische Playlists', 
      'en': 'Automatic Playlists' 
    } 
  },
  'faq_casting_to_speakers': { 
    search: { 
      'de': 'bluetooth lautsprecher smart speaker google home amazon echo alexa cast casting übertragen streaming audio sound', 
      'en': 'bluetooth speaker smart speaker google home amazon echo alexa cast casting transmit stream audio sound output' 
    }, 
    display: { 
      'de': 'Audio an Lautsprecher senden', 
      'en': 'Casting to Speakers' 
    } 
  },
  'faq_why_affirmations_positive': { 
    search: { 
      'de': 'affirmationen positiv formulierung warum grund keine verneinung unterbewusstsein wirkung sprache', 
      'en': 'affirmations positive phrasing why reason no negation subconscious effect language processing suggestion' 
    }, 
    display: { 
      'de': 'Warum positive Affirmationen?', 
      'en': 'Why Positive Affirmations?' 
    } 
  },
  'faq_subscription_benefits_change': { 
    search: { 
      'de': 'premium vorteile änderung abo bedingungen zukunft anpassen funktionen inhalte', 
      'en': 'premium benefits change subscription terms future adapt features content communication policy' 
    }, 
    display: { 
      'de': 'Änderung Premium-Vorteile', 
      'en': 'Changes to Premium Benefits' 
    } 
  },
  'faq_specific_subliminal_topic': { 
    search: { 
      'de': 'spezifisches thema suchen finden subliminal inhalt wunsch flugangst prüfungsangst feedback', 
      'en': 'specific topic search find subliminal content request fear of flying exam anxiety feedback suggestion' 
    }, 
    display: { 
      'de': 'Spezifische Subliminal-Themen', 
      'en': 'Specific Subliminal Topics' 
    } 
  },
  'faq_offline_playback_issues': { 
    search: { 
      'de': 'offline download fehler spielt nicht problem premium wiedergabe datei neustart support troubleshooting', 
      'en': 'offline download error not playing problem premium playback file restart support troubleshooting corrupted active subscription' 
    }, 
    display: { 
      'de': 'Offline-Wiedergabeprobleme', 
      'en': 'Offline Playback Issues' 
    } 
  },
  'faq_app_permissions': { 
    search: { 
      'de': 'berechtigungen permissions app datenschutz funktion internet speicher mikrofon standort zugriff warum', 
      'en': 'permissions app privacy function internet storage microphone location access why necessary required explanation' 
    }, 
    display: { 
      'de': 'App-Berechtigungen', 
      'en': 'App Permissions' 
    } 
  },
  'faq_binaural_beats_risks': { 
    search: { 
      'de': 'binaural beats risiken sicherheit nebenwirkungen warnung gesundheit epilepsie herzschrittmacher neurologisch psychisch arzt', 
      'en': 'binaural beats risks safety side effects warning health epilepsy pacemaker neurological psychological doctor consult caution' 
    }, 
    display: { 
      'de': 'Risiken Binaural Beats', 
      'en': 'Binaural Beats Risks' 
    } 
  },
  'faq_vat_id_input': { 
    search: { 
      'de': 'umsatzsteuer id vat id ust id rechnung geschäftskunde eu firma unternehmen reverse charge steuer', 
      'en': 'vat id invoice business customer company eu reverse charge tax number input field b2b' 
    }, 
    display: { 
      'de': 'Umsatzsteuer-ID', 
      'en': 'VAT ID' 
    } 
  },
  'faq_update_billing_address': { 
    search: { 
      'de': 'rechnungsadresse adresse ändern konto profil abo aktualisieren daten abrechnung', 
      'en': 'billing address change update account profile subscription data info management' 
    }, 
    display: { 
      'de': 'Rechnungsadresse aktualisieren', 
      'en': 'Update Billing Address' 
    } 
  },
  'faq_email_change_impact': { 
    search: { 
      'de': 'email ändern auswirkung login konto benachrichtigung was passiert benutzername bestätigung', 
      'en': 'email change impact effect login account notification what happens username confirmation verification primary' 
    }, 
    display: { 
      'de': 'Auswirkung E-Mail-Änderung', 
      'en': 'Impact of Email Change' 
    } 
  },
  'faq_cancel_refund_appstore': { 
    search: { 
      'de': 'kündigen abo app store google play ios android stornieren verwalten einstellungen store konto', 
      'en': 'cancel subscription app store google play ios android manage settings store account refund request platform rules' 
    }, 
    display: { 
      'de': 'Kündigung über App Store', 
      'en': 'Cancellation via App Store' 
    } 
  },
  'faq_customer_support_languages': { 
    search: { 
      'de': 'support sprachen kundendienst hilfe international deutsch englisch kundenservice', 
      'en': 'support languages customer service help international german english spanish french contact translation' 
    }, 
    display: { 
      'de': 'Support-Sprachen', 
      'en': 'Support Languages' 
    } 
  },
  'faq_app_permissions_explained': { 
    search: { 
      'de': 'berechtigungen permissions erklärung datenschutz app internet speicher mikrofon standort zugriff warum notwendig', 
      'en': 'permissions explanation privacy app internet storage microphone location access why necessary required breakdown functionality' 
    }, 
    display: { 
      'de': 'Erklärung Berechtigungen', 
      'en': 'Permissions Explained' 
    } 
  }
};

// Type für die bekannten Intent-Namen
type KnownIntentName = keyof typeof INTENT_DATA;

// Type Guard Funktion, um zu prüfen, ob ein Intent bekannt ist
function isKnownIntent(intentName: string): intentName is KnownIntentName {
  return intentName in INTENT_DATA;
}

/**
 * Ruft eine FAQ-Antwort basierend auf dem Intent und den erkannten Entitäten ab
 * @param intentName Name des erkannten Intents
 * @param entities Erkannte Entitäten in der Benutzeranfrage
 * @param language Aktuelle Sprache
 * @param contextType Optionaler Kontexttyp für bessere Antwortauswahl
 * @returns Die passende FAQ-Antwort als String
 */
export async function getFaqResponse(
  intentName: string,
  entities: Entity[] = [],
  language: Language = 'de',
  contextType?: string
): Promise<string> {
  console.log(`[DEBUG] getFaqResponse aufgerufen mit: intentName=${intentName}, language=${language}, contextType=${contextType || 'nicht angegeben'}`);

  try {
    // Prüfe zuerst, ob überhaupt FAQs in der Datenbank vorhanden sind
    const faqsExist = await hasFAQs(language);
    if (!faqsExist) {
      console.log(`[DEBUG] Keine FAQs in der Datenbank für Sprache ${language} gefunden`);
      return generateNoFaqsResponse(language);
    }

    // Entities als EnhancedEntity behandeln - mit defensiver Programmierung
    const enhancedEntities = (Array.isArray(entities) ? entities : []).map(entity => {
      return {
        ...entity,
        isNew: (entity as EnhancedEntity).isNew ?? false,
        fromPreviousContext: (entity as EnhancedEntity).fromPreviousContext ?? false,
        timestamp: (entity as EnhancedEntity).timestamp ?? Date.now(),
        confidence: entity.confidence ?? 0.5
      } as EnhancedEntity;
    });
    
    // PRIMÄRSTRATEGIE: Verwende das zentrale Intent-Mapping für bekannte Intents
    if (typeof intentName === 'string' && isKnownIntent(intentName) && language in INTENT_DATA[intentName].search) {
      const mappedQuery = INTENT_DATA[intentName].search[language];
      console.log(`[DEBUG] Verwende sprachspezifisches Intent-Mapping für '${intentName}': "${mappedQuery}"`);
      
      // Erste Suche mit genau dem gemappten Intent durchführen
      const mappedResults = await searchFaqsByQuery(mappedQuery, language, 1);
      
      // ROBUSTERE KORREKTUR FÜR TS2532 (Zeilen 992-993)
      if (mappedResults && mappedResults.length > 0 && mappedResults[0] != null) {
        // Innerhalb dieses Blocks sicher auf question/answer zugreifen
        if (mappedResults[0].question != null) {
          console.log(`[DEBUG] FAQ gefunden durch sprachspezifisches Mapping: "${mappedResults[0].question}"`);
          // Stellt sicher, dass wir answer zurückgeben oder einen Fallback, wenn answer undefined/null ist
          return mappedResults[0].answer ?? generateGenericFallbackResponse(language);
        }
      }
      
      // Wenn die primäre Suche fehlschlägt, versuchen wir eine erweiterte Suche
      // mit den wichtigsten Entitäten zusammen mit den gemappten Keywords
      const entityTerms = getRelevantEntityTerms(enhancedEntities);
      if (entityTerms.length > 0) {
        const enhancedQuery = `${mappedQuery} ${entityTerms}`;
        console.log(`[DEBUG] Versuche erweiterte Suche mit Entitäten: "${enhancedQuery}"`);
        
        const enhancedResults = await searchFaqsByQuery(enhancedQuery, language, 1);
        // Robustere Prüfung des Ergebnisses
        if (enhancedResults && enhancedResults.length > 0 && enhancedResults[0] != null) {
          // Sicherer Zugriff auf question/answer
          if (enhancedResults[0].question != null) {
            console.log(`[DEBUG] FAQ gefunden durch erweiterte Suche: "${enhancedResults[0].question}"`);
            return enhancedResults[0].answer ?? generateGenericFallbackResponse(language);
          }
        }
      }
      
      // Wenn beide Strategien fehlschlagen, Fallback mit sprachspezifischem Anzeigenamen
      console.log(`[DEBUG] Keine FAQ gefunden trotz sprachspezifischem Mapping`);
      return generateMappedFallbackResponse(intentName, language);
    }
    
    // SEKUNDÄRSTRATEGIE: Für nicht explizit gemappte Intents
    // Eine optimierte Suchanfrage bauen
    const searchQuery = buildOptimizedSearchQuery(intentName, enhancedEntities, language, contextType);
    console.log(`[DEBUG] Optimierte Suchanfrage für nicht-gemappten Intent: "${searchQuery}"`);

    // Suche in der Datenbank nach passenden FAQs
    let faqResults = await searchFaqsByQuery(searchQuery, language, 1);
    
    // Wenn keine Ergebnisse gefunden wurden, versuche eine vereinfachte Anfrage
    if (!faqResults || faqResults.length === 0) {
      const simplifiedQuery = simplifySearchQuery(searchQuery);
      if (simplifiedQuery !== searchQuery) {
        console.log(`[DEBUG] Keine genauen Treffer, versuche vereinfachte Suchanfrage: "${simplifiedQuery}"`);
        faqResults = await searchFaqsByQuery(simplifiedQuery, language, 2);
      }
      
      // Wenn immer noch keine Ergebnisse, versuche es mit den wichtigsten 2-3 Wörtern
      if ((!faqResults || faqResults.length === 0) && searchQuery.split(' ').length > 1) {
        const keyTerms = getKeyTerms(searchQuery, 3);
        console.log(`[DEBUG] Immer noch keine Treffer, versuche mit Schlüsselbegriffen: "${keyTerms}"`);
        faqResults = await searchFaqsByQuery(keyTerms, language, 2);
      }
    }
    
    // ROBUSTERE KORREKTUR FÜR TS2532 (Zeilen 1005-1006)
    if (faqResults && faqResults.length > 0 && faqResults[0] != null) {
      // Innerhalb dieses Blocks sicher auf question/answer zugreifen
      if (faqResults[0].question != null) {
        console.log(`[DEBUG] FAQ in der Datenbank gefunden: "${faqResults[0].question}"`);
        return faqResults[0].answer ?? generateGenericFallbackResponse(language);
      }
    }
    
    console.log(`[DEBUG] Keine FAQ in der Datenbank gefunden für Suchanfrage "${searchQuery}"`);
    
    // Generiere eine kontextbezogene Fallback-Antwort
    const fallbackResponse = generateContextAwareFallback(intentName, enhancedEntities, language, contextType);
    
    // Stellen Sie sicher, dass wir nicht über die Array-Grenzen hinaus zugreifen
    const previewLength = Math.min(fallbackResponse.length, 40);
    console.log(`[DEBUG] Verwende kontextbezogene Fallback-Antwort: "${fallbackResponse.substring(0, previewLength)}..."`);
    return fallbackResponse;
    
  } catch (error) {
    console.error(`[DEBUG] Fehler beim Abrufen der FAQ-Antwort:`, error);
    
    // Einfacher Fallback bei Fehlern
    return language === 'de'
      ? "Entschuldigung, es gab ein technisches Problem bei der Suche nach einer Antwort. Bitte versuche es später noch einmal."
      : "Sorry, there was a technical issue while searching for an answer. Please try again later.";
  }
}

/**
 * Extrahiert relevante Terme aus Entitäten für die Suche
 */
function getRelevantEntityTerms(entities: EnhancedEntity[]): string {
  // Sicherstellen, dass entities ein Array ist und nicht null/undefined
  const safeEntities = Array.isArray(entities) ? entities : [];
  
  const keywordEntities = safeEntities.filter(entity => 
    // Stelle sicher, dass entity und entity.type existieren, bevor wir sie prüfen
    entity && typeof entity.type === 'string' &&
    (entity.type === 'keyword' || 
     entity.type === 'topic' || 
     entity.type === 'product' ||
     entity.type === 'service' ||
     entity.type === 'feature' ||
     entity.type === 'category')
  );
  
  // Priorisiere neue Entitäten mit hoher Konfidenz
  const sortedEntities = [...keywordEntities].sort((a, b) => {
    // Neue Entitäten bevorzugen
    const aIsNew = a.isNew === true; // Expliziter Boolean-Vergleich
    const bIsNew = b.isNew === true; // Expliziter Boolean-Vergleich
    if (aIsNew && !bIsNew) return -1;
    if (!aIsNew && bIsNew) return 1;
    
    // Nach Konfidenz sortieren (sicher zugreifen mit ??)
    const aConfidence = a.confidence ?? 0.5;
    const bConfidence = b.confidence ?? 0.5;
    return bConfidence - aConfidence;
  });
  
  // Nimm maximal die 3 besten Entitäten
  // Stelle sicher, dass jede Entität einen gültigen value hat, bevor wir darauf zugreifen
  return sortedEntities.slice(0, 3)
    .filter(e => e && typeof e.value === 'string') // Nur Entitäten mit gültigem value behalten
    .map(e => e.value)  // Es ist jetzt sicher, auf e.value zuzugreifen
    .join(' ');
}

/**
 * Extrahiert die wichtigsten Schlüsselbegriffe aus einer Suchanfrage
 */
function getKeyTerms(query: string, maxTerms: number = 2): string {
  // Sicherstellen, dass query ein String ist und nicht null/undefined
  if (!query) return '';
  
  return query.split(/\s+/)
    .filter(term => term.length > 3)  // Nur längere Wörter
    .slice(0, maxTerms)               // Maximal X Begriffe
    .join(' ');
}

/**
 * Erstellt eine Fallback-Antwort mit dem sprachspezifischen Anzeigenamen aus dem Mapping
 */
function generateMappedFallbackResponse(intentName: KnownIntentName, language: Language): string {
  // Sicherer Zugriff auf den Anzeigenamen: Optional chaining für INTENT_DATA[intentName]?.display
  const displayData = INTENT_DATA[intentName]?.display;
  // Prüfe, ob displayData existiert und language ein gültiger Schlüssel ist
  const displayName = displayData && language in displayData ? displayData[language] : null;
  
  if (displayName) {
    return language === 'de'
      ? `Entschuldigung, ich habe keine spezifischen Informationen zu "${displayName}". Möchtest du deine Frage umformulieren oder nach etwas anderem fragen?`
      : `I'm sorry, I don't have specific information about "${displayName}". Would you like to rephrase your question or ask about something else?`;
  }
  
  // Fallback, wenn kein Anzeigename verfügbar ist
  return generateGenericFallbackResponse(language);
}

/**
 * Generiert eine generische Fallback-Antwort
 */
function generateGenericFallbackResponse(language: Language): string {
  return language === 'de'
    ? "Entschuldigung, ich konnte keine passende Antwort finden. Könntest du deine Frage umformulieren oder präzisieren?"
    : "I'm sorry, I couldn't find a matching answer. Could you rephrase or be more specific with your question?";
}

/**
 * Generiert eine Meldung, wenn keine FAQs in der Datenbank existieren
 */
function generateNoFaqsResponse(language: Language): string {
  return language === 'de'
    ? "Unsere Wissensdatenbank wird derzeit aufgebaut. Bitte versuche es später noch einmal oder kontaktiere unseren Support."
    : "Our knowledge base is currently being built. Please try again later or contact our support team.";
}

/**
 * Baut eine optimierte Suchanfrage aus dem Intent-Namen und den Entitäten
 * Nur für Intents, die nicht explizit im INTENT_DATA-Mapping definiert sind
 */
function buildOptimizedSearchQuery(
  intentName: string, 
  entities: EnhancedEntity[],
  language: Language,
  contextType?: string
): string {
  // 1. Beginne mit dem bereinigten Intent-Namen (handle null/undefined)
  const safeIntentName = intentName ?? '';
  let query = safeIntentName
    .replace(/^faq_/i, '')           // Entferne ein "faq_" Präfix
    .replace(/_/g, ' ');             // Ersetze Unterstriche durch Leerzeichen
  
  // 2. Sortiere Entitäten nach Relevanz und Aktualität
  // Stelle sicher, dass entities ein Array ist
  const safeEntities = Array.isArray(entities) ? entities : [];
  const sortedEntities = [...safeEntities].sort((a, b) => {
    // Priorisiere neue Entitäten
    const aIsNew = a.isNew === true;
    const bIsNew = b.isNew === true;
    if (aIsNew && !bIsNew) return -1;
    if (!aIsNew && bIsNew) return 1;
    
    // Dann nach Konfidenz sortieren, falls vorhanden
    const aConfidence = a.confidence ?? 0.5;
    const bConfidence = b.confidence ?? 0.5;
    return bConfidence - aConfidence;
  });
  
  // 3. Füge relevante Entitäten hinzu, gewichtet nach ihrer Bedeutung
  const keywordEntities = sortedEntities
    .filter(entity => 
      // Sicherstellen, dass entity und entity.type existieren
      entity && typeof entity.type === 'string' &&
      (entity.type === 'keyword' || 
       entity.type === 'topic' || 
       entity.type === 'product' ||
       entity.type === 'service' ||
       entity.type === 'feature' ||
       entity.type === 'category')
    );
  
  // Primäre (neue) Entitäten haben höhere Priorität
  const primaryEntities = keywordEntities.filter(e => e.isNew || !e.fromPreviousContext);
  const secondaryEntities = keywordEntities.filter(e => !e.isNew && e.fromPreviousContext);
  
  // Zuerst primäre Entitäten hinzufügen
  if (primaryEntities.length > 0) {
    query += ' ' + primaryEntities
      // Stelle sicher, dass jede Entität einen gültigen value hat
      .filter(entity => entity && typeof entity.value === 'string')
      .map(entity => entity.value)
      .join(' ');
  }
  
  // Dann sekundäre Entitäten, falls keine primären vorhanden sind
  if (primaryEntities.length === 0 && secondaryEntities.length > 0) {
    query += ' ' + secondaryEntities
      // Stelle sicher, dass jede Entität einen gültigen value hat
      .filter(entity => entity && typeof entity.value === 'string')
      .map(entity => entity.value)
      .join(' ');
  }
  
  // 4. Füge kontextspezifische Schlüsselwörter hinzu
  if (contextType) {
    const contextualKeywords = getContextualKeywords(contextType, language);
    if (contextualKeywords) {
      query += ' ' + contextualKeywords;
    }
  }
  
  return query.trim();
}

/**
 * Ermittelt kontextspezifische Schlüsselwörter für die Suche
 */
function getContextualKeywords(contextType: string, language: Language): string | null {
  // Handle null/undefined contextType
  const safeContextType = contextType ?? '';
  
  if (language === 'de') {
    switch (safeContextType) {
      case 'question':
        return 'information hilfe erklärung';
      case 'clarification':
        return 'erklären details genauer';
      case 'topic_change':
        return 'thema';
      case 'initial':
        return 'anfang start einführung';
      default:
        return null;
    }
  } else {
    // Englische Variante
    switch (safeContextType) {
      case 'question':
        return 'information help explanation';
      case 'clarification':
        return 'clarify explain detail';
      case 'topic_change':
        return 'topic';
      case 'initial':
        return 'start begin introduction';
      default:
        return null;
    }
  }
}

/**
 * Vereinfacht eine Suchanfrage für breitere Ergebnisse
 */
function simplifySearchQuery(query: string): string {
  // Handle null/undefined query
  if (!query) return '';
  
  // Entferne sehr spezifische Begriffe, behalte nur die wichtigsten
  const words = query.split(' ');
  
  // Behalte nur die ersten 2-3 wichtigen Wörter
  if (words.length > 3) {
    return words
      .filter(word => word.length > 3) // Filtere kleine Wörter
      .slice(0, 2)                    // Behalte nur die ersten 2
      .join(' ');
  }
  
  return query;
}

/**
 * Generiert eine kontextbezogene Fallback-Antwort für nicht gemappte Intents
 */
function generateContextAwareFallback(
  intentName: string, 
  entities: EnhancedEntity[], 
  language: Language,
  contextType?: string
): string {
  // Handle null/undefined intentName
  const safeIntentName = intentName ?? '';
  
  // Für bekannte Intents im Mapping, verwende den sprachspezifischen Anzeigenamen
  if (isKnownIntent(safeIntentName) && language in INTENT_DATA[safeIntentName].display) {
    const displayName = INTENT_DATA[safeIntentName].display[language];
    return language === 'de'
      ? `Entschuldigung, ich habe keine spezifischen Informationen zu "${displayName}". Möchtest du deine Frage umformulieren oder nach etwas anderem fragen?`
      : `I'm sorry, I don't have specific information about "${displayName}". Would you like to rephrase your question or ask about something else?`;
  }
  
  // Für andere FAQ-Intents, extrahiere das Thema aus dem Intent-Namen
  if (safeIntentName.startsWith('faq_')) {
    const topic = safeIntentName.replace(/^faq_/i, '').replace(/_/g, ' ');
    
    if (topic) {
      return language === 'de'
        ? `Entschuldigung, ich habe keine spezifischen Informationen zu "${topic}". Möchtest du deine Frage umformulieren?`
        : `I'm sorry, I don't have specific information about "${topic}". Would you like to rephrase your question?`;
    }
  }
  
  // ROBUSTERE KORREKTUR FÜR TS2532 (Zeilen 1040-1041): Explizite Prüfung für topEntity.value
  // Versuche, eine Antwort basierend auf Entitäten zu erstellen
  const safeEntities = Array.isArray(entities) ? entities : [];
  const topEntity = safeEntities.find(e => e.isNew) ?? safeEntities[0] ?? null;
  
  // Explizite Prüfung: Nur weitermachen wenn topEntity und topEntity.value existieren
  if (topEntity && topEntity.value != null) {
    return language === 'de'
      ? `Ich habe leider keine genauen Informationen zu "${topEntity.value}". Kann ich dir mit etwas anderem helfen?`
      : `I couldn't find exact information about "${topEntity.value}". Can I help you with something else?`;
  }
  
  // Kontextbezogene Antworten
  const safeContextType = contextType ?? '';
  if (safeContextType) {
    switch (safeContextType) {
      case 'question':
        return language === 'de'
          ? "Entschuldigung, ich konnte keine Antwort auf diese spezifische Frage finden. Möchtest du die Frage anders formulieren?"
          : "I'm sorry, I couldn't find an answer to this specific question. Would you like to rephrase your question?";
      case 'clarification':
        return language === 'de'
          ? "Ich verstehe deine Frage, habe aber keine passende Information dazu. Kannst du es anders ausdrücken?"
          : "I understand your question, but I don't have matching information. Can you express it differently?";
      case 'topic_change':
        return language === 'de'
          ? "Zu diesem neuen Thema habe ich leider keine Informationen. Kann ich dir mit etwas anderem helfen?"
          : "I don't have information about this new topic. Can I help you with something else?";
    }
  }
  
  // Generischer Fallback
  return generateGenericFallbackResponse(language);
}

/**
 * Funktion zum Abrufen einer FAQ-Antwort basierend auf dem Abfragetext
 * Diese Funktion wird von anderen Modulen aufgerufen
 * 
 * @param queryText Abfragetext aus der Benutzereingabe
 * @param entities Erkannte Entitäten in der Anfrage
 * @param language Sprache für die Antwort (de oder en)
 * @returns FAQ-Antwort als String
 */
export async function getFaqAnswer(
  queryText: string | null | undefined,
  entities: Entity[] = [],
  language: Language = 'de'
): Promise<string> {
  // Validierung der Eingabe
  const safeQueryText = queryText ?? '';
  if (!safeQueryText.trim()) {
    return language === 'de' 
      ? "Bitte gib eine Frage ein, damit ich dir helfen kann."
      : "Please enter a question so I can help you.";
  }

  try {
    // Direktes Suchen nach FAQs basierend auf dem Abfragetext
    const faqResults = await searchFaqsByQuery(safeQueryText, language, 2);
    
    // Robuste Prüfung der Suchergebnisse
    if (faqResults && faqResults.length > 0 && faqResults[0] != null) {
      // Sicherer Zugriff auf die Antwort mit Fallback
      if (faqResults[0].question != null) {
        return faqResults[0].answer ?? generateGenericFallbackResponse(language);
      }
    }
    
    // Wenn keine direkten FAQ-Treffer, dann über Intent-Mapping versuchen
    // Hier können zusätzliche NLP-Verarbeitungen stattfinden
    // ...
    
    // Fallback-Antwort
    return language === 'de'
      ? `Entschuldigung, ich konnte keine passende FAQ zu "${safeQueryText}" finden. Kannst du die Frage anders formulieren?`
      : `I'm sorry, I couldn't find a matching FAQ for "${safeQueryText}". Could you rephrase your question?`;
    
  } catch (error) {
    console.error(`[ERROR] Fehler beim Abrufen der FAQ-Antwort: ${error}`);
    return language === 'de'
      ? "Entschuldigung, es ist ein Fehler bei der Verarbeitung deiner Anfrage aufgetreten. Bitte versuche es später noch einmal."
      : "Sorry, an error occurred while processing your request. Please try again later.";
  }
}