// src/services/NotificationService.js
import { 
  createNotification,
  createReportStatusNotification,
  createRequestStatusNotification 
} from '../firebase';

/**
 * Servizio per la gestione automatica delle notifiche
 * Fornisce funzioni di alto livello per creare notifiche in risposta agli eventi dell'applicazione
 */
class NotificationService {
  
  /**
   * Crea una notifica quando lo stato di una segnalazione cambia
   * @param {string} userId - ID dell'utente
   * @param {string} reportId - ID della segnalazione
   * @param {Object} reportData - Dati della segnalazione
   * @param {string} oldStatus - Stato precedente
   * @param {string} newStatus - Nuovo stato
   * @param {string} adminNotes - Note dell'amministratore (opzionale)
   * @returns {Promise<Object|null>} - Notifica creata o null se non necessaria
   */
  static async notifyReportStatusChange(userId, reportId, reportData, oldStatus, newStatus, adminNotes = '') {
    try {
      console.log(`NotificationService: Valutazione notifica per cambio stato segnalazione ${reportId}: ${oldStatus} -> ${newStatus}`);
      
      // Non creare notifiche per cambi di stato che non sono rilevanti per l'utente
      if (oldStatus === newStatus) {
        console.log('NotificationService: Nessun cambio di stato, notifica non necessaria');
        return null;
      }
      
      // Non notificare quando lo stato passa da "In attesa" se non c'è un cambio significativo
      if (oldStatus === 'In attesa' && newStatus === 'In attesa') {
        console.log('NotificationService: Stato rimane "In attesa", notifica non necessaria');
        return null;
      }
      
      // Crea la notifica usando la funzione specifica di Firebase
      const notification = await createReportStatusNotification(
        userId,
        reportId,
        oldStatus,
        newStatus,
        reportData.date || new Date().toISOString().split('T')[0],
        adminNotes
      );
      
      console.log('NotificationService: Notifica segnalazione creata:', notification.id);
      return notification;
      
    } catch (error) {
      console.error('NotificationService: Errore nella creazione notifica segnalazione:', error);
      // Non propagare l'errore per non bloccare l'operazione principale
      return null;
    }
  }

  /**
   * Crea una notifica quando lo stato di una richiesta cambia
   * @param {string} userId - ID dell'utente
   * @param {string} requestId - ID della richiesta
   * @param {Object} requestData - Dati della richiesta
   * @param {string} oldStatus - Stato precedente
   * @param {string} newStatus - Nuovo stato
   * @param {string} adminNotes - Note dell'amministratore (opzionale)
   * @returns {Promise<Object|null>} - Notifica creata o null se non necessaria
   */
  static async notifyRequestStatusChange(userId, requestId, requestData, oldStatus, newStatus, adminNotes = '') {
    // In NotificationService.js, all'inizio del metodo notifyRequestStatusChange
console.log('NotificationService.notifyRequestStatusChange chiamato con:', {
    userId,
    requestId,
    oldStatus,
    newStatus,
    adminNotes
  });
    try {
      console.log(`NotificationService: Valutazione notifica per cambio stato richiesta ${requestId}: ${oldStatus} -> ${newStatus}`);
      
      // Non creare notifiche per cambi di stato che non sono rilevanti
      if (oldStatus === newStatus) {
        console.log('NotificationService: Nessun cambio di stato, notifica non necessaria');
        return null;
      }
      
      // Notifica solo per stati finali (approved/rejected) o cambi significativi
      const significantStates = ['approved', 'rejected'];
      if (!significantStates.includes(newStatus) && oldStatus === 'pending') {
        console.log('NotificationService: Cambio di stato non significativo, notifica non necessaria');
        return null;
      }
      
      // Crea la notifica usando la funzione specifica di Firebase
      const notification = await createRequestStatusNotification(
        userId,
        requestId,
        requestData,
        oldStatus,
        newStatus,
        adminNotes
      );
      
      console.log('NotificationService: Notifica richiesta creata:', notification.id);
      return notification;
      
    } catch (error) {
      console.error('NotificationService: Errore nella creazione notifica richiesta:', error);
      // Non propagare l'errore per non bloccare l'operazione principale
      return null;
    }
  }

  /**
   * Crea una notifica personalizzata
   * @param {string} userId - ID dell'utente destinatario
   * @param {string} type - Tipo di notifica
   * @param {string} relatedId - ID dell'elemento correlato
   * @param {string} title - Titolo della notifica
   * @param {string} message - Messaggio della notifica
   * @param {Object} data - Dati aggiuntivi
   * @returns {Promise<Object|null>} - Notifica creata o null in caso di errore
   */
  static async createCustomNotification(userId, type, relatedId, title, message, data = {}) {
    try {
      console.log(`NotificationService: Creazione notifica personalizzata per utente ${userId}`);
      
      const notification = await createNotification(userId, type, relatedId, title, message, data);
      
      console.log('NotificationService: Notifica personalizzata creata:', notification.id);
      return notification;
      
    } catch (error) {
      console.error('NotificationService: Errore nella creazione notifica personalizzata:', error);
      return null;
    }
  }

  /**
   * Determina se una notifica deve essere creata in base ai cambiamenti
   * @param {string} type - Tipo di notifica ('report_status' | 'request_status')
   * @param {string} oldStatus - Stato precedente
   * @param {string} newStatus - Nuovo stato
   * @param {Object} context - Contesto aggiuntivo
   * @returns {boolean} - true se la notifica deve essere creata
   */
  static shouldCreateNotification(type, oldStatus, newStatus, context = {}) {
    // Nessun cambio di stato
    if (oldStatus === newStatus) {
      return false;
    }

    switch (type) {
      case 'report_status':
        return this.shouldCreateReportNotification(oldStatus, newStatus, context);
      
      case 'request_status':
        return this.shouldCreateRequestNotification(oldStatus, newStatus, context);
      
      default:
        return true; // Default: crea sempre la notifica per tipi sconosciuti
    }
  }

  /**
   * Logica specifica per notifiche di segnalazioni
   * @private
   */
  static shouldCreateReportNotification(oldStatus, newStatus, context) {
    // Notifica sempre per cambi significativi
    const significantChanges = [
      'In attesa -> Presa in carico',
      'In attesa -> Conclusa',
      'Presa in carico -> Conclusa'
    ];
    
    const changeKey = `${oldStatus} -> ${newStatus}`;
    return significantChanges.includes(changeKey);
  }

  /**
   * Logica specifica per notifiche di richieste
   * @private
   */
  static shouldCreateRequestNotification(oldStatus, newStatus, context) {
    // Notifica per approvazioni e rifiuti
    if (newStatus === 'approved' || newStatus === 'rejected') {
      return true;
    }
    
    // Notifica per modifiche di note su richieste già processate
    if (context.adminNotesChanged && (oldStatus === 'approved' || oldStatus === 'rejected')) {
      return true;
    }
    
    return false;
  }

  /**
   * Formatta un messaggio di notifica in base al template
   * @param {string} template - Template del messaggio
   * @param {Object} data - Dati per sostituire i placeholder
   * @returns {string} - Messaggio formattato
   */
  static formatMessage(template, data) {
    let message = template;
    
    // Sostituisci i placeholder con i dati reali
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      message = message.replace(new RegExp(placeholder, 'g'), data[key]);
    });
    
    return message;
  }

  /**
   * Ottieni templates di messaggi predefiniti
   * @param {string} type - Tipo di template
   * @param {string} action - Azione specifica
   * @returns {Object} - Template con title e message
   */
  static getMessageTemplate(type, action) {
    const templates = {
      report_status: {
        'presa_in_carico': {
          title: 'Segnalazione presa in carico',
          message: 'La tua segnalazione del {date} è stata presa in carico e verrà verificata a breve.'
        },
        'conclusa': {
          title: 'Segnalazione conclusa',
          message: 'La tua segnalazione del {date} è stata conclusa.'
        }
      },
      request_status: {
        'approved': {
          title: 'Richiesta {requestType} approvata',
          message: 'La tua richiesta di {requestType} del {date} è stata approvata.'
        },
        'rejected': {
          title: 'Richiesta {requestType} rifiutata',
          message: 'La tua richiesta di {requestType} del {date} è stata rifiutata.'
        }
      }
    };

    return templates[type]?.[action] || {
      title: 'Aggiornamento',
      message: 'C\'è un aggiornamento per te.'
    };
  }

  /**
   * Pulisce notifiche vecchie (funzione di utilità per manutenzione)
   * @param {number} daysOld - Età in giorni delle notifiche da eliminare
   * @returns {Promise<number>} - Numero di notifiche eliminate
   */
  static async cleanupOldNotifications(daysOld = 30) {
    try {
      console.log(`NotificationService: Pulizia notifiche più vecchie di ${daysOld} giorni`);
      
      // Questa funzione richiederebbe implementazione lato server per efficienza
      // Per ora, è solo un placeholder per future implementazioni
      
      console.log('NotificationService: Funzione di pulizia non ancora implementata');
      return 0;
      
    } catch (error) {
      console.error('NotificationService: Errore nella pulizia notifiche:', error);
      return 0;
    }
  }

  /**
   * Ottieni statistiche sulle notifiche per debugging
   * @param {string} userId - ID dell'utente
   * @returns {Promise<Object>} - Statistiche delle notifiche
   */
  static async getNotificationStats(userId) {
    try {
      // Implementazione futura per statistiche dettagliate
      return {
        total: 0,
        unread: 0,
        byType: {},
        lastWeek: 0
      };
    } catch (error) {
      console.error('NotificationService: Errore nel recupero statistiche:', error);
      return {};
    }
  }
}

export default NotificationService;