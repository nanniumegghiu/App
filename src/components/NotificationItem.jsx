// src/components/NotificationItem.jsx
import React, { useState } from 'react';

const NotificationItem = ({ 
  notification, 
  onMarkAsRead, 
  formatDate, 
  getIcon 
}) => {
  const [isMarking, setIsMarking] = useState(false);

  // Gestisce il click per segnare come letta
  const handleMarkAsRead = async (e) => {
    e.stopPropagation(); // Previene la propagazione del click
    
    if (isMarking) return;
    
    setIsMarking(true);
    try {
      await onMarkAsRead(notification.id);
    } catch (error) {
      console.error('Errore nel segnare la notifica come letta:', error);
    } finally {
      setIsMarking(false);
    }
  };

  // Ottieni la classe CSS in base al tipo di notifica
  const getNotificationClass = () => {
    const baseClass = 'notification-item';
    const typeClass = `notification-${notification.type}`;
    
    return `${baseClass} ${typeClass}`;
  };

  // Ottieni il colore del badge in base al tipo
  const getBadgeColor = () => {
    switch (notification.type) {
      case 'report_status':
        return 'var(--primary)'; // Blu per segnalazioni
      case 'request_status':
        return 'var(--success)'; // Verde per richieste
      default:
        return 'var(--gray)';
    }
  };

  // Ottieni informazioni aggiuntive specifiche per tipo
  const getNotificationDetails = () => {
    const data = notification.data || {};
    
    switch (notification.type) {
      case 'report_status':
        return {
          subtitle: `Segnalazione del ${data.reportDate || ''}`,
          statusText: data.newStatus || '',
          statusColor: getStatusColor(data.newStatus)
        };
      case 'request_status':
        return {
          subtitle: `Richiesta ${data.requestType || ''} del ${data.dateFrom || ''}`,
          statusText: data.newStatus || '',
          statusColor: getStatusColor(data.newStatus)
        };
      default:
        return {
          subtitle: '',
          statusText: '',
          statusColor: '#666'
        };
    }
  };

  // Ottieni il colore per lo stato
  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
      case 'Conclusa':
        return 'var(--success)';
      case 'rejected':
        return 'var(--danger)';
      case 'Presa in carico':
        return 'var(--warning)';
      default:
        return '#666';
    }
  };

  // Tronca il messaggio se troppo lungo
  const truncateMessage = (message, maxLength = 120) => {
    if (!message) return '';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const details = getNotificationDetails();

  return (
    <div className={getNotificationClass()}>
      <div className="notification-item-content">
        {/* Icona e badge del tipo */}
        <div className="notification-icon-container">
          <div 
            className="notification-type-badge"
            style={{ backgroundColor: getBadgeColor() }}
          >
            {getIcon(notification.type)}
          </div>
        </div>

        {/* Contenuto principale */}
        <div className="notification-main">
          <div className="notification-title-row">
            <h4 className="notification-title">
              {notification.title}
            </h4>
            <span className="notification-date">
              {formatDate(notification.createdAt)}
            </span>
          </div>

          {details.subtitle && (
            <div className="notification-subtitle">
              {details.subtitle}
              {details.statusText && (
                <span 
                  className="notification-status"
                  style={{ color: details.statusColor }}
                >
                  • {details.statusText}
                </span>
              )}
            </div>
          )}

          <div className="notification-message">
            {truncateMessage(notification.message)}
          </div>

          {/* Note aggiuntive se presenti */}
          {notification.data?.adminNotes && (
            <div className="notification-admin-notes">
              <strong>Note:</strong> {truncateMessage(notification.data.adminNotes, 80)}
            </div>
          )}
        </div>

        {/* Azioni */}
        <div className="notification-actions">
          <button
            className="mark-read-btn"
            onClick={handleMarkAsRead}
            disabled={isMarking}
            title="Segna come letta"
            aria-label="Segna notifica come letta"
          >
            {isMarking ? (
              <span className="loading-dots">⏳</span>
            ) : (
              <span className="check-icon">✓</span>
            )}
          </button>
        </div>
      </div>

      {/* Indicatore di notifica non letta */}
      <div className="notification-unread-indicator"></div>
    </div>
  );
};

export default NotificationItem;