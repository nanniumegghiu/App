// src/components/Navigation.jsx
import React from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const Navigation = ({ isAdmin, userData }) => {
  const handleLogout = () => {
    signOut(auth).catch((error) => {
      console.error("Errore durante il logout:", error);
    });
  };

  return (
    <nav className="main-navigation">
      <div className="nav-container">
        <div className="nav-title">
          <h1>Iacuzzo Construction Group</h1>
        </div>
        
        <div className="nav-user">
          {userData && (
            <>
              <div className="user-info-nav">
                <p className="user-name">
                  👤 {userData.nome} {userData.cognome}
                </p>
                <p className="user-role">
                  {isAdmin ? 'Amministratore' : 'Utente'}
                </p>
              </div>
              
              <button 
                className="logout-button" 
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;