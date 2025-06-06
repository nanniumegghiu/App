// src/components/NotificationCenter.jsx
import React, { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import { getUserUnreadNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../firebase';
import NotificationItem from './NotificationItem';
import './notificationCenter.css';

const NotificationCenter = () => {
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
      console.log('NotificationCenter: Caricamento notifiche...');
      const userNotifications = await getUserUnreadNotifications(auth.currentUser.uid);
      console.log('NotificationCenter: Notifiche caricate:', userNotifications);
      
      setNotifications(userNotifications);
      setUnreadCount(userNotifications.length);
      setError(null);
    } catch (err) {
      console.error('NotificationCenter: Errore nel caricamento delle notifiche:', err);
      
      // Gestisci errori specifici di Firestore
      if (err.code === 'permission-denied') {
        setError('Permessi insufficienti per accedere alle notifiche');
      } else if (err.code === 'failed-precondition') {
        setError('Indice database mancante - contatta l\'amministratore');
      } else if (err.message.includes('index')) {
        setError('Configurazione database in corso - riprova tra qualche minuto');
      } else {
        setError('Impossibile caricare le notifiche');
      }
      
      // Imposta valori di fallback
      setNotifications([]);
      setUnreadCount(0);
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
      await markNotificationAsRead(notificationId);
      
      // Rimuovi la notifica dalla lista locale
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Errore nel segnare la notifica come letta:', err);
    }
  };

  // Segna tutte le notifiche come lette
  const handleMarkAllAsRead = async () => {
    if (!auth.currentUser || notifications.length === 0) return;

    try {
      const deletedCount = await markAllNotificationsAsRead(auth.currentUser.uid);
      
      if (deletedCount > 0) {
        setNotifications([]);
        setUnreadCount(0);
        
        // Mostra un feedback visivo
        console.log(`${deletedCount} notifiche segnate come lette`);
      }
    } catch (err) {
      console.error('Errore nel segnare tutte le notifiche come lette:', err);
    }
  };

  // Formatta la data della notifica
  const formatNotificationDate = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const notificationDate = date instanceof Date ? date : new Date(date);
    const diffInMs = now - notificationDate;
    const diffInHours = diffInMs / (1000 * 60 * 60);
    const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      return diffInMinutes <= 1 ? 'Appena ora' : `${diffInMinutes} minuti fa`;
    } else if (diffInHours < 24) {
      const hours = Math.floor(diffInHours);
      return hours === 1 ? '1 ora fa' : `${hours} ore fa`;
    } else if (diffInDays < 7) {
      const days = Math.floor(diffInDays);
      return days === 1 ? '1 giorno fa' : `${days} giorni fa`;
    } else {
      return notificationDate.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  };

  // Ottieni l'icona in base al tipo di notifica
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'report_status':
        return '📋';
      case 'request_status':
        return '📝';
      default:
        return '🔔';
    }
  };

  return (
    <div className="notification-center">
      {/* Campanella delle notifiche */}
      <div className="notification-bell" ref={bellRef}>
        <button 
          className="bell-button"
          onClick={toggleDropdown}
          aria-label={`Notifiche ${unreadCount > 0 ? `(${unreadCount} non lette)` : ''}`}
        >
          <span className="bell-icon">🔔</span>
          {unreadCount > 0 && (
            <span className="notification-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Dropdown delle notifiche */}
      {isOpen && (
        <div className="notification-dropdown" ref={dropdownRef}>
          <div className="notification-header">
            <h3>
              <span className="header-icon">🔔</span>
              Notifiche
              {unreadCount > 0 && (
                <span className="header-count">({unreadCount})</span>
              )}
            </h3>
            
            {notifications.length > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={handleMarkAllAsRead}
                title="Segna tutte come lette"
              >
                ✓ Segna tutte
              </button>
            )}
          </div>

          <div className="notification-content">
            {isLoading ? (
              <div className="notification-loading">
                <div className="loading-spinner"></div>
                <p>Caricamento notifiche...</p>
              </div>
            ) : error ? (
              <div className="notification-error">
                <span className="error-icon">⚠️</span>
                <p>{error}</p>
                <button onClick={loadNotifications} className="retry-btn">
                  Riprova
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <span className="empty-icon">🔕</span>
                <p>Nessuna notifica</p>
                <small>Le tue notifiche appariranno qui</small>
              </div>
            ) : (
              <div className="notification-list">
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    formatDate={formatNotificationDate}
                    getIcon={getNotificationIcon}
                  />
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-footer">
              <small>
                {notifications.length === 1 
                  ? '1 notifica non letta' 
                  : `${notifications.length} notifiche non lette`}
              </small>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;