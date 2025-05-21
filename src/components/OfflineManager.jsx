// src/components/OfflineManager.jsx
import React, { useState, useEffect } from 'react';
import timekeepingService from '../services/timekeepingService';
import './offlineManager.css';

/**
 * Component that manages offline records and syncs them when connection is restored
 * This can be mounted in App.jsx to provide app-wide offline sync management
 */
const OfflineManager = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineRecords, setOfflineRecords] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [showNotification, setShowNotification] = useState(false);

  // Load offline records from localStorage
  useEffect(() => {
    const loadOfflineRecords = () => {
      const storedRecords = localStorage.getItem('timekeeping_offline_records');
      if (storedRecords) {
        try {
          const records = JSON.parse(storedRecords);
          setOfflineRecords(records);
          
          // Show notification if there are records to sync and we're online
          if (records.length > 0 && navigator.onLine) {
            setShowNotification(true);
          }
        } catch (error) {
          console.error('Error parsing offline records:', error);
          localStorage.removeItem('timekeeping_offline_records');
        }
      }
    };
    
    loadOfflineRecords();
    
    // Set up listeners for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      // Reload records to check if we need to sync
      loadOfflineRecords();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      // Hide notification if we go offline
      setShowNotification(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-hide notification after 10 seconds
  useEffect(() => {
    if (showNotification) {
      const timer = setTimeout(() => {
        setShowNotification(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [showNotification]);

  // Function to sync offline records
  const syncRecords = async () => {
    if (offlineRecords.length === 0 || !isOnline || isSyncing) return;
    
    setIsSyncing(true);
    setSyncResult(null);
    
    try {
      const result = await timekeepingService.syncOfflineRecords(offlineRecords);
      
      // Clear offline storage if some records were successfully synced
      if (result.success > 0) {
        localStorage.removeItem('timekeeping_offline_records');
        setOfflineRecords([]);
      } else if (result.failed > 0 && result.success === 0) {
        // If all syncs failed, keep the records for future attempts
        // But we might want to implement a retry limit or aging mechanism
        console.log('All sync attempts failed');
      }
      
      setSyncResult(result);
    } catch (error) {
      console.error('Error syncing offline records:', error);
      setSyncResult({
        error: true,
        message: error.message || 'An unknown error occurred'
      });
    } finally {
      setIsSyncing(false);
      
      // Hide the notification after sync
      setTimeout(() => {
        setShowNotification(false);
      }, 5000);
    }
  };

  // Don't render anything if there's nothing to sync
  if (offlineRecords.length === 0) {
    return null;
  }

  // Don't render visible component if notification is hidden
  if (!showNotification) {
    return null;
  }

  return (
    <div className={`offline-manager ${showNotification ? 'visible' : ''}`}>
      <div className="offline-notification">
        <div className="notification-content">
          <div className="notification-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="currentColor"/>
              <path d="M12 17C12.5523 17 13 16.5523 13 16C13 15.4477 12.5523 15 12 15C11.4477 15 11 15.4477 11 16C11 16.5523 11.4477 17 12 17Z" fill="currentColor"/>
              <path d="M12 7V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="notification-text">
            <h4>Timbrature offline da sincronizzare</h4>
            <p>Hai {offlineRecords.length} timbrature salvate offline. Sincronizzale ora per aggiornarle nel sistema.</p>
          </div>
        </div>
        
        <div className="notification-actions">
          <button 
            className="sync-button"
            onClick={syncRecords}
            disabled={isSyncing || !isOnline}
          >
            {isSyncing ? 'Sincronizzazione...' : 'Sincronizza ora'}
          </button>
          <button 
            className="dismiss-button"
            onClick={() => setShowNotification(false)}
          >
            Chiudi
          </button>
        </div>
        
        {!isOnline && (
          <div className="offline-warning">
            Connessione offline. Attendi di essere online per sincronizzare.
          </div>
        )}
        
        {syncResult && (
          <div className={`sync-result ${syncResult.error ? 'error' : 'success'}`}>
            {syncResult.error ? (
              <p>Errore: {syncResult.message}</p>
            ) : (
              <p>Sincronizzate con successo {syncResult.success} di {syncResult.total} timbrature.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfflineManager;