// src/KioskRouter.jsx - Router per gestire modalità kiosk
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import KioskApp from './KioskApp';

/**
 * Router principale che decide se mostrare l'app normale o la modalità kiosk
 */
const KioskRouter = () => {
  const [isKioskMode, setIsKioskMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Controlla se l'app deve essere avviata in modalità kiosk
    const checkKioskMode = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const kioskParam = urlParams.get('kiosk');
      const savedKioskMode = localStorage.getItem('kiosk_mode');
      
      // Se c'è il parametro URL o se è già stato impostato in precedenza
      if (kioskParam === 'true' || savedKioskMode === 'true') {
        setIsKioskMode(true);
        localStorage.setItem('kiosk_mode', 'true');
        
        // Rimuovi il parametro dall'URL per sicurezza
        if (kioskParam) {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, document.title, newUrl);
        }
      }
      
      setIsLoading(false);
    };

    checkKioskMode();
    
    // Event listener per uscire dalla modalità kiosk (solo per debug)
    const handleKeyDown = (e) => {
      // Combinazione segreta per uscire dalla modalità kiosk: Ctrl+Alt+Shift+K
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key === 'K') {
        const password = prompt('Inserisci password di emergenza:');
        if (password === 'EXIT_KIOSK_2025') {
          localStorage.removeItem('kiosk_mode');
          window.location.reload();
        }
      }
    };
    
    if (isKioskMode) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isKioskMode]);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '1.2rem',
        fontFamily: 'system-ui'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⏳</div>
          <div>Inizializzazione in corso...</div>
        </div>
      </div>
    );
  }

  // Se siamo in modalità kiosk, mostra solo KioskApp
  if (isKioskMode) {
    return <KioskApp />;
  }

  // Altrimenti, mostra l'app normale con routing
  return (
    <Router>
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </Router>
  );
};

export default KioskRouter;