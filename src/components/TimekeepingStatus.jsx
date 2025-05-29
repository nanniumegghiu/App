// src/components/TimekeepingStatus.jsx - With improved error handling
import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import timekeepingService from '../services/timekeepingService';
import './timekeepingStatus.css';

/**
 * Component to display current timekeeping status on the user dashboard
 */
const TimekeepingStatus = () => {
  const [status, setStatus] = useState(null);
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
    const intervalId = setInterval(loadTimekeepingStatus, 300000); // 5 minutes
    
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
      // Parse clock-in time
      const today = new Date();
      const [clockInHours, clockInMinutes] = status.clockInTime.split(':').map(Number);
      
      // Create Date objects for comparison
      const clockInDate = new Date(today);
      clockInDate.setHours(clockInHours, clockInMinutes, 0, 0);
      
      // Calculate difference in minutes
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
        return 'In Corso';
      case 'completed':
        return 'Giornata Conclusa';
      case 'auto-closed':
        return 'Auto-Chiusa per Mancata Uscita';
      case 'not-started':
        return 'Nessun Ingresso Registrato';
      default:
        return status.status;
    }
  };
  
  // Format time as HH:MM AM/PM
  const formatTimeAMPM = (date) => {
    try {
      let hours = date.getHours();
      let minutes = date.getMinutes();
      
      // Add leading zero if needed
      minutes = minutes < 10 ? '0' + minutes : minutes;
      
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
        <p>Loading timekeeping status...</p>
      </div>
    );
  }
  
  if (error && !status) {
    return (
      <div className="timekeeping-status-card error">
        <h3>Timekeeping Status</h3>
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
        <h3>Ore Lavorative Odierne</h3>
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
        </div>
        
        <div className="time-details">
          {status?.status === 'in-progress' && (
            <>
              <div className="time-entry">
                <div className="time-label">Ingresso:</div>
                <div className="time-value">{formatTime(status.clockInTime)}</div>
              </div>
              
              <div className="time-entry highlighted">
                <div className="time-label">Trascorse:</div>
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
                <div className="time-label">Totale:</div>
                <div className="time-value">
                  {status.totalHours} 
                  {status.status === 'auto-closed' && <span className="auto-note">(Auto)</span>}
                </div>
              </div>
              
              <div className="hours-breakdown">
                <div className="breakdown-item">
                  <span className="breakdown-label">Standard:</span>
                  <span className="breakdown-value">{status.standardHours}</span>
                </div>
                
                <div className="breakdown-item">
                  <span className="breakdown-label">Straordinario:</span>
                  <span className="breakdown-value">{status.overtimeHours}</span>
                </div>
              </div>
            </>
          )}
          
          {status?.status === 'not-started' && (
            <div className="not-started-message">
              <p>Non hai timbrato oggi.</p>
              <p className="hint">Usa il tuo QRCode per timbrare.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TimekeepingStatus;