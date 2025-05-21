// src/components/UserDashboard.jsx
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import UserQRCode from './UserQRCode';
import TimekeepingStatus from './TimekeepingStatus';
import timekeepingService from '../services/timekeepingService';
import './userQRCode.css';
import './dashboard.css';

/**
 * Enhanced user dashboard component with timekeeping status
 */
const UserDashboard = () => {
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [monthlyStats, setMonthlyStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Recupera le informazioni dell'utente al caricamento
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("Utente non autenticato");
        }

        // Recupera i dati dell'utente da Firestore
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUserData({
            id: currentUser.uid,
            email: currentUser.email,
            ...userDoc.data()
          });
        } else {
          setUserData({
            id: currentUser.uid,
            email: currentUser.email
          });
        }
        
        // Auto-close any open sessions from previous days
        await timekeepingService.autoCloseOpenSessions(currentUser.uid);
      } catch (err) {
        console.error("Errore nel recupero dei dati utente:", err);
        setError("Impossibile caricare i dati. Riprova più tardi.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);
  
  // Load monthly timekeeping statistics
  useEffect(() => {
    const fetchMonthlyStats = async () => {
      if (!userData) return;
      
      setIsLoadingStats(true);
      try {
        const currentDate = new Date();
        const currentMonth = (currentDate.getMonth() + 1).toString();
        const currentYear = currentDate.getFullYear().toString();
        
        // Get timekeeping records for the current month
        const records = await timekeepingService.getUserTimekeepingHistory(userData.id, {
          month: currentMonth,
          year: currentYear
        });
        
        // Calculate statistics
        const totalDays = records.length;
        const completedDays = records.filter(r => 
          r.status === 'completed' || r.status === 'auto-closed'
        ).length;
        
        const totalStandardHours = records.reduce((sum, record) => {
          if (record.status === 'completed' || record.status === 'auto-closed') {
            return sum + (record.standardHours || 0);
          }
          return sum;
        }, 0);
        
        const totalOvertimeHours = records.reduce((sum, record) => {
          if (record.status === 'completed' || record.status === 'auto-closed') {
            return sum + (record.overtimeHours || 0);
          }
          return sum;
        }, 0);
        
        const autoClosedDays = records.filter(r => r.status === 'auto-closed').length;
        
        setMonthlyStats({
          month: currentMonth,
          year: currentYear,
          totalDays,
          completedDays,
          totalStandardHours,
          totalOvertimeHours,
          totalHours: totalStandardHours + totalOvertimeHours,
          autoClosedDays
        });
      } catch (err) {
        console.error("Error loading monthly statistics:", err);
        // Don't set error - this is a non-critical feature
      } finally {
        setIsLoadingStats(false);
      }
    };
    
    fetchMonthlyStats();
  }, [userData]);

  // Funzione per formattare la data corrente
  const getCurrentDate = () => {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return new Date().toLocaleDateString('it-IT', options);
  };
  
  // Get month name from month number
  const getMonthName = (month) => {
    const months = [
      "Gennaio", "Febbraio", "Marzo", "Aprile", 
      "Maggio", "Giugno", "Luglio", "Agosto", 
      "Settembre", "Ottobre", "Novembre", "Dicembre"
    ];
    return months[parseInt(month) - 1] || '';
  };

  if (isLoading) {
    return <div className="loading">Caricamento dashboard...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <p className="current-date">{getCurrentDate()}</p>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-main">
          {/* Timekeeping Status Card */}
          <TimekeepingStatus />
          
          {/* Timekeeping Monthly Stats */}
          {monthlyStats && !isLoadingStats && (
            <div className="monthly-stats-card">
              <h3>Statistiche di {getMonthName(monthlyStats.month)} {monthlyStats.year}</h3>
              
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{monthlyStats.totalDays}</div>
                  <div className="stat-label">Giorni Lavorati</div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-value">{monthlyStats.totalHours}</div>
                  <div className="stat-label">Ore Totali</div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-value">{monthlyStats.totalOvertimeHours}</div>
                  <div className="stat-label">Ore Straordinario</div>
                </div>
                
                {monthlyStats.autoClosedDays > 0 && (
                  <div className="stat-item warning">
                    <div className="stat-value">{monthlyStats.autoClosedDays}</div>
                    <div className="stat-label">Giorni Auto-Chiusi</div>
                  </div>
                )}
              </div>
              
              <div className="stat-note">
                I giorni auto-chiusi sono quelli in cui la timbratura di uscita è mancante e il sistema ha automaticamente registrato 8 ore.
              </div>
            </div>
          )}
          
          {/* QR Code as main element */}
          <div className="dashboard-card qrcode-card">
            <UserQRCode />
            <div className="qrcode-instructions">
              <h4>Come utilizzare il tuo QR code:</h4>
              <ol>
                <li>Mostra questo QR code al dispositivo di scansione all'inizio del turno per timbrare l'entrata.</li>
                <li>Alla fine del turno, mostra nuovamente il QR code per timbrare l'uscita.</li>
                <li>Le ore verranno calcolate automaticamente, inclusi eventuali straordinari oltre le 8 ore.</li>
                <li>In caso di mancata timbratura di uscita, il sistema chiuderà automaticamente la giornata con 8 ore standard.</li>
              </ol>
            </div>
          </div>

          {/* Card Informazioni utente */}
          <div className="dashboard-card user-info-card">
            <h3>Informazioni Utente</h3>
            <div className="user-info-content">
              <p><strong>Nome:</strong> {userData?.nome || 'N/D'}</p>
              <p><strong>Cognome:</strong> {userData?.cognome || 'N/D'}</p>
              <p><strong>Email:</strong> {userData?.email || 'N/D'}</p>
              <p><strong>Ruolo:</strong> {userData?.role === 'admin' ? 'Amministratore' : 'Dipendente'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;