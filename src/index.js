// src/index.js - Aggiornato per supportare modalità kiosk
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './admin.css';
import './kioskMode.css'; // Aggiungi CSS per modalità kiosk
import KioskRouter from './KioskRouter'; // Usa KioskRouter invece di App

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <KioskRouter />
  </React.StrictMode>
);