// AdminNotificationCenter.jsx - Centro notifiche per amministratori
import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../../firebase';
import { getAdminUnreadNotifications, markAdminNotificationAsRead } from '../../firebase';
import './adminNotificationCenter.css';

const AdminNotificationCenter = () => {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);
  const bellRef = useRef(null);

  // Carica le notifiche quando il componente si monta
  useEffect(() => {
    loadNotifications();
    
    // Polling per aggiornare le notifiche ogni 30 secondi
    const intervalId = setInterval(loadNotifications, 30000);
    
    return () => clearInterval(intervalId);
  }, []);

  // Gestisce il click fuori dal dropdown per chiuderlo
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        bellRef.current &&
        !bellRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Carica le notifiche dal database
  const loadNotifications = async () => {
    if (!auth.currentUser) return;

    setIsLoading(true);
    try {
      const adminNotifications = await getAdminUnreadNotifications(auth.currentUser.uid);
      setNotifications(adminNotifications);
      setUnreadCount(adminNotifications.length);
      setError(null);
    } catch (err) {
      console.error('Errore nel caricamento delle notifiche admin:', err);
      setError('Impossibile caricare le notifiche');
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle del dropdown
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      // Quando si apre, ricarica le notifiche
      loadNotifications();
    }
  };

  // Segna una singola notifica come letta
  const handleMarkAsRead = async (notificationId) => {
    try {
      await markAdminNotificationAsRead(notificationId, auth.currentUser.uid);
      
      // Rimuovi la notifica dalla lista locale
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
      
    } catch (err) {
      console.error('Errore nel segnare la notifica come letta:', err);
    }
  };

  // Gestisce il click su una notifica
  const handleNotificationClick = async (notification) => {
    // Segna come letta
    await handleMarkAsRead(notification.id);
    
    // Naviga alla sezione appropriata in base al tipo
    if (notification.type === 'new_report') {
      // Naviga alle segnalazioni
      window.location.hash = '#admin-reports';
    } else if (notification.type === 'new_request') {
      // Naviga alle richieste
      window.location.hash = '#admin-requests';
    }
    
    // Chiudi il dropdown
    setIsOpen(false);
  };

  // Formatta il tempo relativo
  const getRelativeTime = (date) => {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Ora';
    if (minutes < 60) return `${minutes}m fa`;
    if (hours < 24) return `${hours}h fa`;
    if (days < 7) return `${days}g fa`;
    return date.toLocaleDateString('it-IT');
  };

  // Ottieni l'icona per il tipo di notifica
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'new_report':
        return '📝';
      case 'new_request':
        return '📋';
      default:
        return '🔔';
    }
  };

  // Ottieni il colore per il tipo di notifica
  const getNotificationColor = (type) => {
    switch (type) {
      case 'new_report':
        return '#e74c3c'; // Rosso per segnalazioni
      case 'new_request':
        return '#3498db'; // Blu per richieste
      default:
        return '#95a5a6'; // Grigio di default
    }
  };

  return (
    <div className="admin-notification-center">
      <div className="admin-notification-bell" ref={bellRef}>
        <button
          className="admin-bell-button"
          onClick={toggleDropdown}
          aria-label="Notifiche amministratore"
          title="Notifiche amministratore"
        >
          <span className="admin-bell-icon">🔔</span>
          {unreadCount > 0 && (
            <span className="admin-notification-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="admin-notification-dropdown" ref={dropdownRef}>
          <div className="admin-notification-header">
            <h3>Notifiche Admin</h3>
            <button
              className="admin-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Chiudi notifiche"
            >
              ✕
            </button>
          </div>

          <div className="admin-notification-content">
            {isLoading ? (
              <div className="admin-notification-loading">
                <div className="admin-loading-spinner"></div>
                <span>Caricamento notifiche...</span>
              </div>
            ) : error ? (
              <div className="admin-notification-error">
                <span className="admin-error-icon">⚠️</span>
                <span>{error}</span>
                <button
                  className="admin-retry-btn"
                  onClick={loadNotifications}
                >
                  Riprova
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="admin-notification-empty">
                <span className="admin-empty-icon">📭</span>
                <span>Nessuna notifica</span>
              </div>
            ) : (
              <div className="admin-notification-list">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="admin-notification-item"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="admin-notification-icon-wrapper">
                      <span 
                        className="admin-notification-type-icon"
                        style={{ color: getNotificationColor(notification.type) }}
                      >
                        {getNotificationIcon(notification.type)}
                      </span>
                    </div>
                    
                    <div className="admin-notification-content-wrapper">
                      <div className="admin-notification-title">
                        {notification.title}
                      </div>
                      <div className="admin-notification-message">
                        {notification.message}
                      </div>
                      
                      {notification.data && (
                        <div className="admin-notification-metadata">
                          {notification.data.category && (
                            <span className="admin-notification-tag">
                              {notification.data.category}
                            </span>
                          )}
                          {notification.data.priority && notification.data.priority !== 'normale' && (
                            <span className={`admin-notification-priority priority-${notification.data.priority}`}>
                              {notification.data.priority}
                            </span>
                          )}
                        </div>
                      )}
                      
                      <div className="admin-notification-time">
                        {getRelativeTime(notification.createdAt)}
                      </div>
                    </div>
                    
                    <button
                      className="admin-notification-mark-read"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notification.id);
                      }}
                      aria-label="Segna come letta"
                      title="Segna come letta"
                    >
                      ✓
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="admin-notification-footer">
              <button
                className="admin-view-all-btn"
                onClick={() => {
                  window.location.hash = '#admin-notifications';
                  setIsOpen(false);
                }}
              >
                Vedi tutte le notifiche
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminNotificationCenter;