// src/components/TimekeepingStatus.jsx - Versione finale corretta
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import timekeepingService from '../services/timekeepingService';
import './timekeepingStatus.css';

/**
 * Component to display current shift status with improved error handling and debugging
 */
const TimekeepingStatus = () => {
  const [shiftStatus, setShiftStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [debugInfo, setDebugInfo] = useState(null);
  
  // Update current time every minute
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Function to get current shift status with improved error handling
  const getCurrentShiftStatus = async (userId) => {
    try {
      console.log(`[TimekeepingStatus] Getting shift status for user: ${userId}`);
      setDebugInfo(`Checking shifts for user: ${userId}`);
      
      // Auto-close any expired sessions first (with error handling)
      try {
        console.log(`[TimekeepingStatus] Auto-closing expired sessions...`);
        await timekeepingService.autoCloseOpenSessions(userId);
        console.log(`[TimekeepingStatus] Auto-close completed`);
      } catch (closeError) {
        console.warn("Error auto-closing sessions (non-blocking):", closeError);
        setDebugInfo(`Auto-close warning: ${closeError.message}`);
      }
      
      const timekeepingRef = collection(db, "timekeeping");
      
      // STEP 1: Look for any active shifts (without orderBy first to avoid index issues)
      console.log(`[TimekeepingStatus] Querying for active shifts...`);
      
      const activeQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "==", "in-progress"),
        limit(10) // Get up to 10 to handle multiple active sessions
      );
      
      const activeSnapshot = await getDocs(activeQuery);
      console.log(`[TimekeepingStatus] Active query returned ${activeSnapshot.size} documents`);
      
      if (!activeSnapshot.empty) {
        // Sort manually by timestamp if we have multiple
        const activeDocs = activeSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort by clockInTimestamp (most recent first)
        activeDocs.sort((a, b) => {
          const aTime = a.clockInTimestamp?.toDate?.() || new Date(a.clockInTimestamp);
          const bTime = b.clockInTimestamp?.toDate?.() || new Date(b.clockInTimestamp);
          return bTime - aTime;
        });
        
        const shiftData = activeDocs[0];
        console.log(`[TimekeepingStatus] Found active shift:`, shiftData);
        
        setDebugInfo(`Active shift found: ${shiftData.date} at ${shiftData.clockInTime}`);
        
        return {
          status: "in-progress",
          message: `Turno in corso dal ${shiftData.date} alle ${shiftData.clockInTime}`,
          clockInDate: shiftData.date,
          clockInTime: shiftData.clockInTime,
          shiftNumber: shiftData.shiftNumber || 1,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log(`[TimekeepingStatus] No active shift found, looking for recent completed shifts...`);
      
      // STEP 2: Look for recent completed/auto-closed shifts
      const recentQuery = query(
        timekeepingRef,
        where("userId", "==", userId),
        where("status", "in", ["completed", "auto-closed"]),
        limit(10) // Get multiple to sort manually
      );
      
      const recentSnapshot = await getDocs(recentQuery);
      console.log(`[TimekeepingStatus] Recent query returned ${recentSnapshot.size} documents`);
      
      if (!recentSnapshot.empty) {
        // Sort manually by clockOutTimestamp
        const recentDocs = recentSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Sort by clockOutTimestamp (most recent first)
        recentDocs.sort((a, b) => {
          const aTime = a.clockOutTimestamp?.toDate?.() || new Date(a.clockOutTimestamp || 0);
          const bTime = b.clockOutTimestamp?.toDate?.() || new Date(b.clockOutTimestamp || 0);
          return bTime - aTime;
        });
        
        const shiftData = recentDocs[0];
        console.log(`[TimekeepingStatus] Found recent completed shift:`, shiftData);
        
        setDebugInfo(`Recent shift found: ${shiftData.status} on ${shiftData.date}`);
        
        return {
          status: shiftData.status,
          message: shiftData.status === "completed" 
            ? `Ultimo turno completato: ${shiftData.clockInTime} - ${shiftData.clockOutTime}`
            : `Ultimo turno auto-chiuso: ${shiftData.clockInTime} - ${shiftData.clockOutTime}`,
          clockInDate: shiftData.date,
          clockInTime: shiftData.clockInTime,
          clockOutDate: shiftData.clockOutDate,
          clockOutTime: shiftData.clockOutTime,
          totalHours: shiftData.totalHours,
          standardHours: shiftData.standardHours,
          overtimeHours: shiftData.overtimeHours,
          autoClosedReason: shiftData.autoClosedReason,
          isMultiDay: shiftData.isMultiDay,
          timestamp: new Date().toISOString()
        };
      }
      
      console.log(`[TimekeepingStatus] No shifts found at all`);
      setDebugInfo(`No shifts found for user ${userId}`);
      
      // No shifts found at all
      return {
        status: "no-active-shift",
        message: "Nessun turno registrato",
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`[TimekeepingStatus] Error getting current shift status:`, error);
      setDebugInfo(`Error: ${error.message}`);
      throw error;
    }
  };
  
  // Load the current shift status
  useEffect(() => {
    const loadShiftStatus = async () => {
      setLoading(true);
      setError(null);
      setDebugInfo("Starting to load shift status...");
      
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error('User not authenticated');
        }
        
        console.log(`[TimekeepingStatus] Loading shift status for user: ${user.uid}`);
        
        // Get current shift status
        const status = await getCurrentShiftStatus(user.uid);
        console.log(`[TimekeepingStatus] Shift status loaded successfully:`, status);
        
        setShiftStatus(status);
        setError(null);
        setDebugInfo(`Status loaded: ${status.status}`);
      } catch (err) {
        console.error('[TimekeepingStatus] Error loading shift status:', err);
        const errorMessage = `Errore: ${err.message}`;
        setError(errorMessage);
        setDebugInfo(`Failed: ${err.message}`);
        
        // Set fallback status when error occurs
        setShiftStatus({
          status: "no-active-shift",
          message: "Impossibile caricare lo stato del turno",
          timestamp: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    };
    
    // Only load if user is authenticated
    if (auth.currentUser) {
      loadShiftStatus();
      
      // Refresh status every 2 minutes
      const intervalId = setInterval(() => {
        if (auth.currentUser) {
          loadShiftStatus();
        }
      }, 120000);
      
      return () => clearInterval(intervalId);
    } else {
      setLoading(false);
      setError("Utente non autenticato");
      setDebugInfo("User not authenticated");
    }
  }, []);
  
  // Format time as HH:MM
  const formatTime = (timeString) => {
    if (!timeString) return '--:--';
    return timeString;
  };
  
  // Format date in Italian style (DD/MM/YYYY)
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return dateString;
    }
  };
  
  // Format date and time together
  const formatDateTime = (dateString, timeString) => {
    if (!dateString || !timeString) return '';
    return `${formatTime(timeString)} del ${formatDate(dateString)}`;
  };
  
  // Calculate elapsed time since clock-in for active shifts
  const calculateElapsedTime = () => {
    if (!shiftStatus || shiftStatus.status !== 'in-progress' || !shiftStatus.clockInTime || !shiftStatus.clockInDate) {
      return null;
    }
    
    try {
      // Parse clock-in time and date
      const [clockInHours, clockInMinutes] = shiftStatus.clockInTime.split(':').map(Number);
      const clockInDateTime = new Date(shiftStatus.clockInDate);
      clockInDateTime.setHours(clockInHours, clockInMinutes, 0, 0);
      
      // Calculate difference in minutes
      const now = new Date();
      const diffMs = now - clockInDateTime;
      const diffMinutes = Math.floor(diffMs / 60000);
      
      if (diffMinutes < 0) return null;
      
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      
      return {
        hours,
        minutes,
        totalMinutes: diffMinutes
      };
    } catch (err) {
      console.error('Error calculating elapsed time:', err);
      return null;
    }
  };
  
  // Get the elapsed time display
  const elapsedTime = calculateElapsedTime();
  
  // Format the elapsed time display
  const formatElapsedTime = () => {
    if (!elapsedTime) return '';
    
    const { hours, minutes } = elapsedTime;
    
    if (hours === 0) {
      return `${minutes} minuti`;
    } else if (hours === 1) {
      return minutes > 0 ? `1 ora e ${minutes} minuti` : '1 ora';
    } else {
      return minutes > 0 ? `${hours} ore e ${minutes} minuti` : `${hours} ore`;
    }
  };
  
  // Get appropriate status class
  const getStatusClass = () => {
    if (!shiftStatus) return '';
    
    switch (shiftStatus.status) {
      case 'in-progress':
        return 'status-in-progress';
      case 'completed':
        return 'status-completed';
      case 'auto-closed':
        return 'status-auto-closed';
      case 'no-active-shift':
      default:
        return 'status-not-started';
    }
  };
  
  // Get the status display text
  const getStatusDisplay = () => {
    if (!shiftStatus) return 'Stato Sconosciuto';
    
    switch (shiftStatus.status) {
      case 'in-progress':
        return 'Turno in Corso';
      case 'completed':
        return 'Ultimo Turno Completato';
      case 'auto-closed':
        return 'Ultimo Turno Auto-Chiuso';
      case 'no-active-shift':
        return 'Nessun Turno Attivo';
      default:
        return shiftStatus.status;
    }
  };
  
  // Format time as HH:MM
  const formatTimeAMPM = (date) => {
    try {
      let hours = date.getHours();
      let minutes = date.getMinutes();
      
      // Add leading zero if needed
      minutes = minutes < 10 ? '0' + minutes : minutes;
      hours = hours < 10 ? '0' + hours : hours;
      
      return `${hours}:${minutes}`;
    } catch (err) {
      console.error('Error formatting time:', err);
      return '--:--';
    }
  };
  
  // Retry loading function
  const retryLoading = async () => {
    const user = auth.currentUser;
    if (!user) {
      setError("Utente non autenticato");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    setDebugInfo("Retrying...");
    
    try {
      console.log(`[TimekeepingStatus] Retrying to load shift status...`);
      const status = await getCurrentShiftStatus(user.uid);
      setShiftStatus(status);
      setError(null);
      setDebugInfo(`Retry successful: ${status.status}`);
    } catch (err) {
      console.error('[TimekeepingStatus] Error retrying to load shift status:', err);
      const errorMessage = `Errore: ${err.message}`;
      setError(errorMessage);
      setDebugInfo(`Retry failed: ${err.message}`);
      
      setShiftStatus({
        status: "no-active-shift",
        message: "Impossibile caricare lo stato del turno",
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) {
    return (
      <div className="timekeeping-status-card loading">
        <div className="card-spinner"></div>
        <p>Caricamento stato turno...</p>
      </div>
    );
  }
  
  if (error && !shiftStatus) {
    return (
      <div className="timekeeping-status-card error">
        <h3>Stato Turno Lavorativo</h3>
        <div className="status-error">
          <p>{error}</p>
          <button className="retry-btn" onClick={retryLoading}>
            Riprova
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`timekeeping-status-card ${getStatusClass()}`}>
      <div className="status-header">
        <h3>Stato Turno Lavorativo</h3>
        <div className="current-time">{formatTimeAMPM(currentTime)}</div>
      </div>
      
      {error && (
        <div className="status-warning" style={{
          padding: '8px 12px',
          marginBottom: '10px',
          backgroundColor: 'rgba(243, 156, 18, 0.1)',
          borderLeft: '3px solid #f39c12',
          color: 'white',
          fontSize: '0.9rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button 
            onClick={retryLoading}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Riprova
          </button>
        </div>
      )}
      
      <div className="status-content">
        <div className="status-indicator">
          <div className="status-badge">
            {getStatusDisplay()}
          </div>
          {shiftStatus?.clockInDate && (
            <div className="status-date">
              Turno del {formatDate(shiftStatus.clockInDate)}
            </div>
          )}
        </div>
        
        <div className="time-details">
          {shiftStatus?.status === 'in-progress' && (
            <>
              <div className="time-entry">
                <div className="time-label">Ingresso:</div>
                <div className="time-value">
                  {formatDateTime(shiftStatus.clockInDate, shiftStatus.clockInTime)}
                </div>
              </div>
              
              <div className="time-entry highlighted">
                <div className="time-label">Durata turno:</div>
                <div className="time-value">{formatElapsedTime()}</div>
              </div>
              
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${Math.min((elapsedTime?.hours || 0) / 8 * 100, 100)}%`,
                    backgroundColor: (elapsedTime?.hours || 0) >= 8 ? 'var(--success)' : 'var(--primary)'
                  }}
                >
                </div>
              </div>
              
              <div className="shift-info">
                <p style={{ 
                  fontSize: '0.9rem', 
                  color: 'rgba(255, 255, 255, 0.8)', 
                  fontStyle: 'italic',
                  textAlign: 'center',
                  marginTop: '10px'
                }}>
                  💡 Il turno può proseguire anche domani secondo le regole aziendali
                </p>
              </div>
            </>
          )}
          
          {(shiftStatus?.status === 'completed' || shiftStatus?.status === 'auto-closed') && (
            <>
              <div className="time-entry">
                <div className="time-label">Ingresso:</div>
                <div className="time-value">
                  {formatDateTime(shiftStatus.clockInDate, shiftStatus.clockInTime)}
                </div>
              </div>
              
              <div className="time-entry">
                <div className="time-label">Uscita:</div>
                <div className="time-value">
                  {formatDateTime(shiftStatus.clockOutDate, shiftStatus.clockOutTime)}
                  {shiftStatus.status === 'auto-closed' && (
                    <span className="auto-note"> (Auto-chiuso)</span>
                  )}
                </div>
              </div>
              
              <div className="time-entry highlighted">
                <div className="time-label">Durata totale:</div>
                <div className="time-value">
                  {shiftStatus.totalHours} ore
                  {shiftStatus.status === 'auto-closed' && (
                    <span className="auto-note"> (Stimato)</span>
                  )}
                </div>
              </div>
              
              <div className="hours-breakdown">
                <div className="breakdown-item">
                  <span className="breakdown-label">Standard:</span>
                  <span className="breakdown-value">{shiftStatus.standardHours || 0}h</span>
                </div>
                
                <div className="breakdown-item">
                  <span className="breakdown-label">Straordinario:</span>
                  <span className="breakdown-value">{shiftStatus.overtimeHours || 0}h</span>
                </div>
              </div>
              
              {shiftStatus.isMultiDay && (
                <div className="multi-day-info" style={{
                  backgroundColor: 'rgba(52, 152, 219, 0.1)',
                  padding: '10px',
                  borderRadius: '5px',
                  marginTop: '10px',
                  textAlign: 'center'
                }}>
                  <strong>🌅 Turno Multi-Giornata</strong>
                  <p style={{ margin: '5px 0', fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.9)' }}>
                    Le ore sono state distribuite automaticamente sui giorni interessati
                  </p>
                </div>
              )}
              
              {shiftStatus.status === 'auto-closed' && shiftStatus.autoClosedReason && (
                <div className="auto-close-info" style={{
                  backgroundColor: 'rgba(243, 156, 18, 0.1)',
                  padding: '10px',
                  borderRadius: '5px',
                  marginTop: '10px',
                  fontSize: '0.9rem'
                }}>
                  <strong>⚠️ Motivo auto-chiusura:</strong>
                  <p style={{ margin: '5px 0', color: 'rgba(255, 255, 255, 0.9)' }}>{shiftStatus.autoClosedReason}</p>
                </div>
              )}
            </>
          )}
          
          {shiftStatus?.status === 'no-active-shift' && (
            <div className="not-started-message">
              <p>Non hai turni attivi al momento.</p>
              <p className="hint">Usa il tuo QR Code per iniziare un nuovo turno.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimekeepingStatus;