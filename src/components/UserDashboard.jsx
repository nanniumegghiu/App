// src/components/UserDashboard.jsx - Versione semplificata con design pulito
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import UserQRCode from './UserQRCode';
import TimekeepingStatus from './TimekeepingStatus';
import timekeepingService from '../services/timekeepingService';
import './userQRCode.css';
import './dashboard.css';

/**
 * Dashboard utente semplificata con design pulito
 */
const UserDashboard = () => {
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch user information on load
  useEffect(() => {
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          throw new Error("User not authenticated");
        }

        // Get user data from Firestore
        const userDocRef = doc(db, "users", currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          setUserData({
            id: currentUser.uid,
            email: currentUser.email,
            ...userDoc.data()
          });
        } else {
          // Create minimal user object if document doesn't exist
          setUserData({
            id: currentUser.uid,
            email: currentUser.email
          });
          console.warn("User document not found in Firestore");
        }
        
        setError(null);
        
        // Auto-close any open sessions from previous days
        try {
          await timekeepingService.autoCloseOpenSessions(currentUser.uid);
        } catch (sessionError) {
          console.error("Error in automatic closing of sessions:", sessionError);
          // Don't block interface if this operation fails
        }
      } catch (err) {
        console.error("Error fetching user data:", err);
        setError("Impossibile caricare i dati. Riprova più tardi.");
        
        // Set minimal user data if available
        if (auth.currentUser) {
          setUserData({
            id: auth.currentUser.uid,
            email: auth.currentUser.email
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);
  
  // Format current date
  const getCurrentDate = () => {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return new Date().toLocaleDateString('it-IT', options);
  };

  // Get user display name
  const getUserDisplayName = () => {
    if (!userData) return 'Utente';
    
    if (userData.nome && userData.cognome) {
      return `${userData.nome} ${userData.cognome}`;
    }
    
    return userData.email || 'Utente';
  };

  if (isLoading) {
    return (
      <div className="dashboard-container">
        <div className="loading-container">
          <div className="loading">Caricamento dashboard...</div>
        </div>
      </div>
    );
  }

  // If there's an error but userData is available, show some dashboard elements
  if (error && userData) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h2>Benvenuto, {getUserDisplayName()}</h2>
            <p className="current-date">{getCurrentDate()}</p>
          </div>
        </div>
        
        <div className="error-message">
          <h4>⚠️ Attenzione</h4>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn btn-primary"
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Ricarica Pagina
          </button>
        </div>

        <div className="dashboard-content">
          <div className="dashboard-main">
            {/* Always show QR code regardless of other errors */}
            <div className="dashboard-card qrcode-card">
              <h3>Il tuo QR Code</h3>
              <UserQRCode />
              <div className="qrcode-instructions">
                <h4>Come usare il QR Code:</h4>
                <ol>
                  <li>Mostra questo QR Code alle postazioni fisse con scanner per la timbratura di ingresso</li>
                  <li>A fine giornata lavorativa, timbra l'uscita mostrando nuovamente il QR Code</li>
                  <li>Il sistema calcolerà automaticamente le ore lavorate, inclusi eventuali straordinari</li>
                  <li>Se dimentichi di timbrare l'uscita, verrà registrata una giornata standard di 8 ore</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If there's an error and userData is not available, show only error message
  if (error && !userData) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <div>
            <h2>Dashboard Personale</h2>
            <p className="current-date">{getCurrentDate()}</p>
          </div>
        </div>
        
        <div className="error-message">
          <h4>❌ Errore di Caricamento</h4>
          <p>{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="btn btn-primary"
            style={{
              marginTop: '15px',
              padding: '10px 20px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            Ricarica la pagina
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div>
          <h2>Benvenuto, {getUserDisplayName()}</h2>
          <p className="current-date">{getCurrentDate()}</p>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-main">
          {/* Timekeeping Status Card */}
          <TimekeepingStatus />
          
          {/* QR Code Card */}
          <div className="dashboard-card qrcode-card">
            <h3>Il tuo QR Code Personale</h3>
            <UserQRCode />
            <div className="qrcode-instructions">
              <h4>📱 Come usare il QR Code:</h4>
              <ol>
                <li><strong>Ingresso:</strong> Mostra il QR Code al lettore per registrare l'entrata</li>
                <li><strong>Uscita:</strong> Scansiona nuovamente il QR Code a fine giornata</li>
                <li><strong>Calcolo automatico:</strong> Le ore verranno calcolate automaticamente</li>
                <li><strong>Straordinari:</strong> Ore oltre le 8 giornaliere saranno conteggiate come straordinario</li>
                <li><strong>Importante:</strong> Non dimenticare di timbrare l'uscita per evitare calcoli errati</li>
              </ol>
            </div>
          </div>

          {/* Quick Info Card */}
          <div className="dashboard-card">
            <h3>📋 Informazioni Rapide</h3>
            <div style={{ 
              padding: '0 20px 20px 20px',
              display: 'grid',
              gap: '15px'
            }}>
              <div style={{
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '1rem' }}>
                  🕒 Timbratura
                </h4>
                <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem' }}>
                  Ricorda di timbrare correttamente ingresso ed uscita per non perdere le ore lavorative ed eventuali straordinari
                </p>
              </div>

              <div style={{
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '1rem' }}>
                  📊 Gestione Ore
                </h4>
                <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem' }}>
                  Consulta il riepilogo mensile nella sezione "Gestione Ore" del menu principale e segnala eventuali incongruenze indicando più informazioni possibili: cantiere e responsabile di cantiere
                </p>
              </div>

              <div style={{
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#495057', fontSize: '1rem' }}>
                  📝 Richieste
                </h4>
                <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem' }}>
                  Invia richieste di permessi, ferie o malattia dalla sezione dedicata
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;