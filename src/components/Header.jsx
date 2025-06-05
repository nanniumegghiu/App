// src/components/Header.jsx - Versione aggiornata con Kiosk Mode
import React, { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import NotificationCenter from './NotificationCenter';

const Header = ({ userRole, isAdminView, onToggleView }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Recupera nome e cognome dal database
  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (user) {
          const docRef = doc(db, "users", user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          } else {
            // Se il documento non esiste, usa almeno l'email dell'utente
            setUserData({ email: user.email });
          }
        }
      } catch (error) {
        console.error("Errore durante il recupero dei dati utente:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log("Logout effettuato con successo");
    } catch (error) {
      console.error("Errore durante il logout:", error);
    }
  };

  // Funzione per attivare la modalità kiosk
  const handleKioskMode = () => {
    // Salva lo stato kiosk nel localStorage
    localStorage.setItem('kiosk_mode', 'true');
    
    // Ricarica la pagina per attivare la modalità kiosk
    window.location.reload();
  };

  // Determina il nome da visualizzare
  const displayName = userData ? 
    (userData.nome && userData.cognome ? `${userData.nome} ${userData.cognome}` : userData.email) : 
    'Utente';

  return (
    <header className="header" style={{
      background: "#f0f0f0",
      padding: "10px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      <h1>Iacuzzo Construction Group App</h1>

      {auth.currentUser && (
  <div className="user-actions" style={{ 
    textAlign: "right", 
    display: "flex", 
    alignItems: "center", 
    gap: "15px" // Aumentato per fare spazio al NotificationCenter
  }}>
    {/* Pulsanti per gli admin */}
    {userRole === 'admin' && (
      <div className="admin-buttons" style={{
        display: "flex",
        gap: "10px"
      }}>
        {/* Pulsante per passare alla vista admin/utente */}
        {onToggleView && (
          <button 
            className="btn btn-secondary" 
            onClick={onToggleView}
            style={{
              backgroundColor: '#6c757d',
              color: 'white',
              borderRadius: '4px',
              padding: '8px 16px',
              cursor: 'pointer',
              border: 'none',
              fontSize: '0.9rem'
            }}
          >
            {isAdminView ? 'Passa a Vista Utente' : 'Passa a Vista Admin'}
          </button>
        )}
        
        {/* Pulsante per modalità kiosk */}
        <button 
          className="btn btn-kiosk" 
          onClick={handleKioskMode}
          style={{
            backgroundColor: '#9b59b6',
            color: 'white',
            borderRadius: '4px',
            padding: '8px 16px',
            cursor: 'pointer',
            border: 'none',
            fontSize: '0.9rem',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#8e44ad';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#9b59b6';
          }}
          title="Attiva modalità kiosk per timbrature"
        >
          🖥️ Modalità Kiosk
        </button>
      </div>
    )}
    
    {/* NUOVO: Centro Notifiche - Visibile per tutti gli utenti */}
    <NotificationCenter />
    
    <div style={{ marginLeft: '10px' }}>
      <p style={{ margin: 0 }}>
        👤 {displayName}
        {userRole === 'admin' && <span style={{ marginLeft: '5px', color: '#007bff' }}>(Admin)</span>}
      </p>
      <button 
        onClick={handleLogout}
        style={{
          border: 'none',
          background: 'none',
          color: '#dc3545',
          cursor: 'pointer',
          padding: '5px 0',
          textAlign: 'right',
          width: '100%'
        }}
      >
        Logout
      </button>
    </div>
  </div>
)}
    </header>
  );
};

export default Header;