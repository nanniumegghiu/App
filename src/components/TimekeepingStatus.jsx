// src/components/TimekeepingStatus.jsx - Versione per gestire turni multi-data
import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import './timekeepingStatus.css';

/**
 * Function to get current shift status
 */
const getCurrentShiftStatus = async (userId) => {
  try {
    // Import service dinamically to avoid circular dependencies
    const timekeepingService = (await import('../services/timekeepingService')).default;
    
    // Auto-close any expired sessions first
    try {
      await timekeepingService.autoCloseOpenSessions(userId);
    } catch (closeError) {
      console.error("Error auto-closing sessions:", closeError);
    }
    
    // Get the most recent active shift (in-progress)
    const { db } = await import('../firebase');
    const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
    
    const timekeepingRef = collection(db, "timekeeping");
    
    // Look for active shift first (can be from any date)
    const activeQuery = query(
      timekeepingRef,
      where("userId", "==", userId),
      where("status", "==", "in-progress"),
      orderBy("clockInTimestamp", "desc"),
      limit(1)
    );
    
    const activeSnapshot = await getDocs(activeQuery);
    
    if (!activeSnapshot.empty) {
      const shiftData = activeSnapshot.docs[0].data();
      return {
        status: "in-progress",
        message: `Turno in corso dal ${shiftData.date} alle ${shiftData.clockInTime}`,
        clockInDate: shiftData.date,
        clockInTime: shiftData.clockInTime,
        shiftNumber: shiftData.shiftNumber || 1,
        timestamp: new Date().toISOString()
      };
    }
    
    // No active shift, get the most recent completed/auto-closed shift
    const recentQuery = query(
      timekeepingRef,
      where("userId", "==", userId),
      where("status", "in", ["completed", "auto-closed"]),
      orderBy("clockOutTimestamp", "desc"),
      limit(1)
    );
    
    const recentSnapshot = await getDocs(recentQuery);
    
    if (!recentSnapshot.empty) {
      const shiftData = recentSnapshot.docs[0].data();
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
    
    // No shifts found at all
    return {
      status: "no-active-shift",
      message: "Nessun turno registrato",
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error("Error getting current shift status:", error);
    throw error;
  }
};

/**
 * Component to display current shift status (not daily status)
 * Shows ongoing shifts that can span multiple days
 */
const TimekeepingStatus = () => {
  const [shiftStatus, setShiftStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Update current time every minute
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Load the current shift status
  useEffect(() => {
    const loadShiftStatus = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error('User not authenticated');
        }
        
        // Get current shift status (not daily status)
        const status = await getCurrentShiftStatus(user.uid);
        setShiftStatus(status);
        setError(null);
      } catch (err) {
        console.error('Error loading shift status:', err);
        setError('Impossibile caricare lo stato del turno');
        
        // Set default status when error occurs
        setShiftStatus({
          status: "no-active-shift",
          message: "Nessun turno attivo",
          timestamp: new Date().toISOString()
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadShiftStatus();
    
    // Refresh status every 2 minutes (less frequent since it's shift-based)
    const intervalId = setInterval(loadShiftStatus, 120000); // 2 minutes
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Format time as HH:MM
  const formatTime = (timeString) => {
    if (!timeString) return '--:--';
    return timeString;
  };
  
  // Format date in Italian style (DD/MM/YYYY)
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
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
          <button className="retry-btn" onClick={() => window.location.reload()}>
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
          color: '#f39c12',
          fontSize: '0.9rem'
        }}>
          {error} (Usando dati locali)
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
                  color: '#666', 
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
                  <p style={{ margin: '5px 0', fontSize: '0.9rem' }}>
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
                  <p style={{ margin: '5px 0' }}>{shiftStatus.autoClosedReason}</p>
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