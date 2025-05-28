// src/components/TimekeepingStatus.jsx - Con Sistema Turnazioni
import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import timekeepingService from '../services/timekeepingService';
import './timekeepingStatus.css';

/**
 * Component to display current timekeeping status with shift information
 */
const TimekeepingStatus = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [shiftStats, setShiftStats] = useState(null);
  
  // Update current time every minute
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Load the timekeeping status for today
  useEffect(() => {
    const loadTimekeepingStatus = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (!user) {
          throw new Error('User not authenticated');
        }
        
        // Load status for today
        const todayStatus = await timekeepingService.getTodayStatus(user.uid);
        setStatus(todayStatus);
        
        // Load shift statistics for current month
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        const stats = await timekeepingService.getShiftStatistics(user.uid, {
          month: currentMonth,
          year: currentYear
        });
        setShiftStats(stats);
        
        setError(null);
      } catch (err) {
        console.error('Error loading timekeeping status:', err);
        setError('Could not load timekeeping status');
        
        // Set default status when error occurs
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        setStatus({
          status: "not-started",
          message: "Unable to retrieve status",
          date: dateString,
          timestamp: now.toISOString()
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadTimekeepingStatus();
    
    // Refresh status every 5 minutes
    const intervalId = setInterval(loadTimekeepingStatus, 300000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Format time as HH:MM
  const formatTime = (timeString) => {
    if (!timeString) return '--:--';
    return timeString;
  };
  
  // Format date in Italian style
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };
  
  // Calculate elapsed time since clock-in
  const calculateElapsedTime = () => {
    if (!status || !status.clockInTime || status.status !== 'in-progress') {
      return null;
    }
    
    try {
      const today = new Date();
      const [clockInHours, clockInMinutes] = status.clockInTime.split(':').map(Number);
      
      const clockInDate = new Date(today);
      clockInDate.setHours(clockInHours, clockInMinutes, 0, 0);
      
      const diffMs = today - clockInDate;
      const diffMinutes = Math.floor(diffMs / 60000);
      
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      
      return {
        hours,
        minutes,
        totalMinutes: diffMinutes
      };
    } catch (err) {
      console.error('Error calculating elapsed time:', err);
      return {
        hours: 0,
        minutes: 0,
        totalMinutes: 0
      };
    }
  };
  
  // Get the elapsed time display
  const elapsedTime = calculateElapsedTime();
  
  // Format the elapsed time display
  const formatElapsedTime = () => {
    if (!elapsedTime) return '';
    
    const { hours, minutes } = elapsedTime;
    return `${hours}h ${minutes}m`;
  };
  
  // Get appropriate status class
  const getStatusClass = () => {
    if (!status) return '';
    
    switch (status.status) {
      case 'in-progress':
        return 'status-in-progress';
      case 'completed':
        return 'status-completed';
      case 'auto-closed':
        return 'status-auto-closed';
      default:
        return 'status-not-started';
    }
  };
  
  // Get the status display text
  const getStatusDisplay = () => {
    if (!status) return 'Status Unknown';
    
    switch (status.status) {
      case 'in-progress':
        return 'Turno in Corso';
      case 'completed':
        return status.sessionsCount > 1 ? `${status.sessionsCount} Turni Conclusi` : 'Turno Concluso';
      case 'auto-closed':
        return 'Auto-Chiuso per Superamento Tempo';
      case 'not-started':
        return 'Nessun Turno Iniziato';
      default:
        return status.status;
    }
  };
  
  // Get shift info display
  const getShiftInfoDisplay = () => {
    if (!status?.shiftInfo) return null;
    
    return {
      name: status.shiftInfo.name,
      maxTime: status.shiftInfo.maxClockOutTime,
      maxDate: formatDate(status.shiftInfo.maxClockOutDate),
      description: status.shiftInfo.description
    };
  };
  
  // Format time as HH:MM
  const formatTimeAMPM = (date) => {
    try {
      let hours = date.getHours();
      let minutes = date.getMinutes();
      
      minutes = minutes < 10 ? '0' + minutes : minutes;
      
      return `${hours}:${minutes}`;
    } catch (err) {
      console.error('Error formatting time:', err);
      return '--:--';
    }
  };
  
  // Calculate shift progress for active shifts
  const getShiftProgress = () => {
    if (!status || status.status !== 'in-progress' || !elapsedTime) {
      return null;
    }
    
    // Assume standard 8-hour shift for progress calculation
    const standardShiftMinutes = 8 * 60;
    const progressPercent = Math.min((elapsedTime.totalMinutes / standardShiftMinutes) * 100, 100);
    
    return {
      percent: progressPercent,
      isOvertime: elapsedTime.totalMinutes > standardShiftMinutes
    };
  };
  
  const shiftProgress = getShiftProgress();
  const shiftInfo = getShiftInfoDisplay();
  
  if (loading) {
    return (
      <div className="timekeeping-status-card loading">
        <div className="card-spinner"></div>
        <p>Loading shift status...</p>
      </div>
    );
  }
  
  if (error && !status) {
    return (
      <div className="timekeeping-status-card error">
        <h3>Shift Status</h3>
        <div className="status-error">
          <p>{error}</p>
          <button className="retry-btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`timekeeping-status-card ${getStatusClass()}`}>
      <div className="status-header">
        <h3>Stato Turni di Oggi</h3>
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
          {error} (Using cached data)
        </div>
      )}
      
      <div className="status-content">
        <div className="status-indicator">
          <div className="status-badge">
            {getStatusDisplay()}
          </div>
          <div className="status-date">
            {formatDate(status?.date)}
          </div>
          
          {/* Shift Information */}
          {shiftInfo && (
            <div className="shift-info">
              <div className="shift-type">
                <span className="shift-name">{shiftInfo.name}</span>
              </div>
              <div className="shift-limits">
                Uscita entro le {shiftInfo.maxTime} del {shiftInfo.maxDate}
              </div>
            </div>
          )}
        </div>
        
        <div className="time-details">
          {status?.status === 'in-progress' && (
            <>
              <div className="time-entry">
                <div className="time-label">Ingresso:</div>
                <div className="time-value">{formatTime(status.clockInTime)}</div>
              </div>
              
              <div className="time-entry highlighted">
                <div className="time-label">Tempo trascorso:</div>
                <div className="time-value">{formatElapsedTime()}</div>
              </div>
              
              {shiftProgress && (
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar" 
                    style={{ 
                      width: `${Math.min(shiftProgress.percent, 100)}%`,
                      backgroundColor: shiftProgress.isOvertime ? 'var(--warning)' : 'var(--primary)'
                    }}
                  />
                  <div className="progress-label">
                    {shiftProgress.isOvertime ? 'Straordinario' : 'Turno Standard'}
                  </div>
                </div>
              )}
              
              {shiftInfo && (
                <div className="shift-reminder">
                  <small>
                    💡 Ricorda di timbrare l'uscita entro le {shiftInfo.maxTime}
                  </small>
                </div>
              )}
            </>
          )}
          
          {(status?.status === 'completed' || status?.status === 'auto-closed') && (
            <>
              <div className="time-entry">
                <div className="time-label">Ingresso:</div>
                <div className="time-value">{formatTime(status.clockInTime)}</div>
              </div>
              
              <div className="time-entry">
                <div className="time-label">Uscita:</div>
                <div className="time-value">{formatTime(status.clockOutTime)}</div>
              </div>
              
              <div className="time-entry highlighted">
                <div className="time-label">Totale Ore:</div>
                <div className="time-value">
                  {status.totalHours}h
                  {status.status === 'auto-closed' && <span className="auto-note">(Auto)</span>}
                </div>
              </div>
              
              <div className="hours-breakdown">
                <div className="breakdown-item">
                  <span className="breakdown-label">Standard:</span>
                  <span className="breakdown-value">{status.standardHours}h</span>
                </div>
                
                <div className="breakdown-item">
                  <span className="breakdown-label">Straordinario:</span>
                  <span className="breakdown-value">{status.overtimeHours}h</span>
                </div>
                
                {status.sessionsCount > 1 && (
                  <div className="breakdown-item">
                    <span className="breakdown-label">Turni:</span>
                    <span className="breakdown-value">{status.sessionsCount}</span>
                  </div>
                )}
              </div>
            </>
          )}
          
          {status?.status === 'not-started' && (
            <div className="not-started-message">
              <p>Non hai iniziato nessun turno oggi.</p>
              <p className="hint">Usa il tuo QR Code per timbrare l'ingresso.</p>
            </div>
          )}
        </div>
        
        {/* Monthly Statistics */}
        {shiftStats && (
          <div className="monthly-stats-summary">
            <h4>Statistiche Mensili</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-value">{shiftStats.totalShifts}</span>
                <span className="stat-label">Turni</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{shiftStats.totalHours}h</span>
                <span className="stat-label">Ore Totali</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{shiftStats.dayShifts}</span>
                <span className="stat-label">Turni Diurni</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{shiftStats.eveningNightShifts}</span>
                <span className="stat-label">Turni Serali</span>
              </div>
            </div>
            
            {shiftStats.splitShifts > 0 && (
              <div className="split-shifts-info">
                <small>
                  📅 {shiftStats.splitShifts} turni su più giorni questo mese
                </small>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TimekeepingStatus;