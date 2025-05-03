// features/ticketing/ticketService.ts

import { v4 as uuidv4 } from 'uuid';

export interface Ticket {
  id: string;
  userId: string;
  userName: string;
  message: string;
  createdAt: Date;
  status: 'open' | 'in-progress' | 'closed';
  agentId?: string;
  agentName?: string;
  responses?: Array<{
    message: string;
    sender: 'agent' | 'system';
    timestamp: Date;
  }>;
}

export interface TicketCreationParams {
  userId: string;
  userName: string;
  message: string;
}

// Konstante für den Entwicklungsmodus
const DEV_MODE = process.env.NODE_ENV !== 'production';

class TicketService {
  // API-URL für das Admin-Dashboard
  private adminDashboardApiUrl: string;
  private isApiAvailable: boolean;

  constructor(adminDashboardApiUrl: string = process.env.ADMIN_DASHBOARD_API_URL || '') {
    this.adminDashboardApiUrl = adminDashboardApiUrl;
    this.isApiAvailable = !!adminDashboardApiUrl;
    
    // Logging im Entwicklungsmodus
    if (DEV_MODE && !this.isApiAvailable) {
      console.log('TicketService läuft im Entwicklungsmodus ohne API-Verbindung.');
    }
  }

  /**
   * Erstellt ein neues Ticket im Admin-Dashboard-System
   */
  async createTicket(params: TicketCreationParams): Promise<Ticket> {
    const newTicket: Ticket = {
      id: uuidv4(),
      userId: params.userId,
      userName: params.userName,
      message: params.message,
      createdAt: new Date(),
      status: 'open',
      responses: []
    };

    // Im Entwicklungsmodus ohne API-URL sofort das lokale Ticket zurückgeben
    if (DEV_MODE && !this.isApiAvailable) {
      console.log('Entwicklungsmodus: Verwende lokales Mock-Ticket (keine API-Verbindung konfiguriert)');
      return newTicket;
    }

    try {
      // Ticket an das Admin-Dashboard-API senden
      const response = await fetch(`${this.adminDashboardApiUrl}/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newTicket),
      });

      if (!response.ok) {
        throw new Error(`Fehler beim Erstellen des Tickets: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Im Entwicklungsmodus: Weniger beunruhigende Nachricht anzeigen
      if (DEV_MODE) {
        console.warn('API nicht erreichbar: Verwende lokales Mock-Ticket für die Entwicklung');
      } else {
        console.error('Fehler beim Erstellen des Tickets:', error);
      }
      
      // In beiden Fällen lokales Ticket zurückgeben
      return newTicket;
    }
  }

  /**
   * Generiert eine automatische Bestätigungsnachricht für den Benutzer
   */
  generateTicketConfirmation(ticketId: string, locale: string = 'de'): string {
    // Für den Entwicklungsmodus eine spezielle Nachricht hinzufügen
    const devModeNote = DEV_MODE ? ' (Entwicklungsmodus: Ticket wird lokal simuliert)' : '';
    
    const messages = {
      de: `Vielen Dank für Ihre Anfrage! Ihr Ticket wurde erstellt und hat die ID: ${ticketId}. Ein Mitarbeiter wird sich in Kürze mit Ihnen in Verbindung setzen.${devModeNote}`,
      en: `Thank you for your request! Your ticket has been created with ID: ${ticketId}. An employee will contact you shortly.${devModeNote}`
    };

    return messages[locale as keyof typeof messages] || messages.de;
  }

  /**
   * Prüft den Status eines Tickets
   */
  async checkTicketStatus(ticketId: string): Promise<string> {
    // Im Entwicklungsmodus ohne API-URL sofort einen Standardstatus zurückgeben
    if (DEV_MODE && !this.isApiAvailable) {
      console.log('Entwicklungsmodus: Simuliere Ticket-Status-Abfrage');
      return 'open';
    }

    try {
      const response = await fetch(`${this.adminDashboardApiUrl}/tickets/${ticketId}`);
      if (!response.ok) {
        throw new Error(`Fehler beim Abrufen des Ticket-Status: ${response.statusText}`);
      }

      const ticket = await response.json();
      return ticket.status;
    } catch (error) {
      // Im Entwicklungsmodus: Weniger beunruhigende Nachricht anzeigen
      if (DEV_MODE) {
        console.warn('API nicht erreichbar: Simuliere Ticket-Status für die Entwicklung');
        return 'open';
      } else {
        console.error('Fehler beim Abrufen des Ticket-Status:', error);
        return 'unknown';
      }
    }
  }
}

export default new TicketService();