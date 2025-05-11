// src/components/Header.jsx
import React, { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const Header = ({ userRole, isAdminView, onToggleView }) => {
  const [userData, setUserData] = useState(null);

  // Recupera nome e cognome dal database
  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = () => {
    signOut(auth).catch((error) => {
      console.error("Errore durante il logout:", error);
    });
  };

  return (
    <header style={{
      background: "#f0f0f0",
      padding: "10px 20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center"
    }}>
      <h1>Gestione Ore Lavorative</h1>

      {userData && (
        <div className="user-actions" style={{ 
          textAlign: "right", 
          display: "flex", 
          alignItems: "center", 
          gap: "10px" 
        }}>
          {/* Pulsante per passare alla vista admin/utente, visibile solo per gli admin */}
          {userRole === 'admin' && onToggleView && (
            <button 
              className="btn btn-secondary" 
              onClick={onToggleView}
              style={{
                backgroundColor: '#6c757d',
                color: 'white',
                borderRadius: '4px',
                padding: '8px 16px',
                cursor: 'pointer',
                border: 'none'
              }}
            >
              {isAdminView ? 'Passa a Vista Utente' : 'Passa a Vista Admin'}
            </button>
          )}
          
          <div style={{ marginLeft: '10px' }}>
            <p style={{ margin: 0 }}>
              👤 {userData.nome} {userData.cognome}
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