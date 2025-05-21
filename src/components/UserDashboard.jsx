// src/components/UserDashboard.jsx (finale molto semplificato)
import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import UserQRCode from './UserQRCode';
import './userQRCode.css';

/**
 * Componente dashboard principale per gli utenti
 * Mostra solo il QR code personale come elemento principale
 */
const UserDashboard = () => {
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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
      } catch (err) {
        console.error("Errore nel recupero dei dati utente:", err);
        setError("Impossibile caricare i dati. Riprova più tardi.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);

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

      <div className="dashboard-content simplified">
        <div className="dashboard-main">
          {/* Solo QR Code come elemento principale */}
          <div className="dashboard-card qrcode-card">
            <UserQRCode />
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