// src/KioskApp.jsx - Modalità kiosk dedicata per dispositivi Android
import React, { useState, useEffect } from 'react';
import TimekeepingScanner from './components/TimekeepingScanner';
import Notification from './components/Notification';
import timekeepingService from './services/timekeepingService';
import './kioskMode.css';

/**
 * Applicazione in modalità kiosk per dispositivi Android dedicati
 * Mostra solo lo scanner QR per le timbrature
 */
const KioskApp = () => {
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('online');

  // Inizializzazione dell'app kiosk
  useEffect(() => {
    // Controlla se siamo in modalità kiosk (parametro URL)
    const urlParams = new URLSearchParams(window.location.search);
    const kioskMode = urlParams.get('kiosk');
    
    if (kioskMode === 'true') {
      initializeKioskMode();
    }
    
    // Monitora stato connessione
    const handleOnline = () => setConnectionStatus('online');
    const handleOffline = () => setConnectionStatus('offline');
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Monitora livello batteria (se supportato)
    if ('getBattery' in navigator) {
      navigator.getBattery().then(battery => {
        setBatteryLevel(Math.round(battery.level * 100));
        
        battery.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      });
    }
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Inizializza modalità kiosk
  const initializeKioskMode = () => {
    // Rimuovi barre di scorrimento
    document.body.style.overflow = 'hidden';
    
    // Forza schermo sempre acceso (se supportato)
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen').catch(err => {
        console.log('Wake lock not supported:', err);
      });
    }
    
    // Entra in modalità fullscreen
    requestFullscreen();
    
    // Previeni zoom e scroll
    document.addEventListener('touchmove', preventDefault, { passive: false });
    document.addEventListener('wheel', preventDefault, { passive: false });
    document.addEventListener('keydown', preventKeyboard);
    
    // Carica info dispositivo dal localStorage
    const savedDeviceId = localStorage.getItem('kiosk_device_id');
    const savedDeviceName = localStorage.getItem('kiosk_device_name');
    
    if (savedDeviceId && savedDeviceName) {
      setDeviceId(savedDeviceId);
      setDeviceName(savedDeviceName);
      setIsAuthenticated(true);
    }
  };

  // Entra in modalità fullscreen
  const requestFullscreen = () => {
    const element = document.documentElement;
    
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
    
    setIsFullscreen(true);
  };

  // Previeni azioni indesiderate
  const preventDefault = (e) => {
    e.preventDefault();
  };

  const preventKeyboard = (e) => {
    // Blocca F12, Ctrl+Shift+I, Ctrl+U, etc.
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.key === 'u') ||
        e.key === 'F5' ||
        (e.ctrlKey && e.key === 'r')) {
      e.preventDefault();
    }
  };

  // Autentica dispositivo kiosk
  const authenticateDevice = async () => {
    if (!deviceId || !deviceName || !authCode) {
      showNotification('Compila tutti i campi richiesti', 'error');
      return;
    }
    
    // Codice di autenticazione per modalità kiosk (da configurare)
    if (authCode !== 'KIOSK2025') {
      showNotification('Codice di autenticazione non valido', 'error');
      return;
    }
    
    try {
      // Verifica che il dispositivo sia registrato
      await timekeepingService.registerTimekeepingDevice(deviceId, deviceName, {
        deviceType: 'kiosk',
        kioskMode: true,
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        registeredAt: new Date().toISOString()
      });
      
      // Salva info dispositivo
      localStorage.setItem('kiosk_device_id', deviceId);
      localStorage.setItem('kiosk_device_name', deviceName);
      localStorage.setItem('kiosk_auth_time', new Date().toISOString());
      
      setIsAuthenticated(true);
      showNotification('Dispositivo autenticato con successo', 'success');
      
    } catch (error) {
      console.error('Errore autenticazione:', error);
      showNotification('Errore durante l\'autenticazione: ' + error.message, 'error');
    }
  };

  // Logout dispositivo (per manutenzione)
  const logoutDevice = () => {
    const confirmLogout = window.confirm('Sei sicuro di voler disconnettere questo dispositivo?');
    if (confirmLogout) {
      localStorage.removeItem('kiosk_device_id');
      localStorage.removeItem('kiosk_device_name');
      localStorage.removeItem('kiosk_auth_time');
      setIsAuthenticated(false);
      setDeviceId('');
      setDeviceName('');
      setAuthCode('');
    }
  };

  // Mostra notifica
  const showNotification = (message, type) => {
    setNotification({
      show: true,
      message,
      type
    });
    
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  // Ottieni ora corrente
  const getCurrentTime = () => {
    return new Date().toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Se non autenticato, mostra schermata di setup
  if (!isAuthenticated) {
    return (
      <div className="kiosk-setup">
        <div className="setup-container">
          <div className="setup-header">
            <h1>🔒 Configurazione Dispositivo Kiosk</h1>
            <p>Configura questo dispositivo per le timbrature</p>
          </div>
          
          <div className="setup-form">
            <div className="form-group">
              <label htmlFor="deviceId">ID Dispositivo</label>
              <input
                type="text"
                id="deviceId"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="es. tablet-ingresso-01"
                autoComplete="off"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="deviceName">Nome Dispositivo</label>
              <input
                type="text"
                id="deviceName"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="es. Tablet Ingresso Principale"
                autoComplete="off"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="authCode">Codice Autorizzazione</label>
              <input
                type="password"
                id="authCode"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="Inserisci codice di autorizzazione"
                autoComplete="off"
              />
            </div>
            
            <button 
              className="setup-button"
              onClick={authenticateDevice}
            >
              Configura Dispositivo
            </button>
          </div>
          
          {notification.show && (
            <Notification
              message={notification.message}
              isVisible={notification.show}
              onClose={() => setNotification(prev => ({ ...prev, show: false }))}
              type={notification.type}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="kiosk-app">
      {/* Header con info dispositivo */}
      <div className="kiosk-header">
        <div className="device-info">
          <div className="device-name">
            📱 {deviceName}
          </div>
          <div className="device-status">
            <span className="time">{getCurrentTime()}</span>
            <span className={`connection ${connectionStatus}`}>
              {connectionStatus === 'online' ? '🟢' : '🔴'} {connectionStatus}
            </span>
            {batteryLevel !== null && (
              <span className="battery">
                🔋 {batteryLevel}%
              </span>
            )}
          </div>
        </div>
        
        {/* Pulsante nascosto per logout (doppio tap + hold) */}
        <div 
          className="hidden-logout"
          onDoubleClick={(e) => {
            // Solo per emergenze - richiede doppio click + conferma
            setTimeout(() => {
              const secret = prompt('Inserisci codice di manutenzione:');
              if (secret === 'MANUTENZIONE2025') {
                logoutDevice();
              }
            }, 1000);
          }}
        >
          ⚙️
        </div>
      </div>

      {/* Scanner principale */}
      <div className="kiosk-scanner-container">
        <TimekeepingScanner 
          isAdmin={false}
          deviceId={deviceId}
          kioskMode={true}
        />
      </div>

      {/* Footer con istruzioni */}
      <div className="kiosk-footer">
        <div className="instructions">
          <div className="instruction-item">
            <div className="icon">⬇️</div>
            <div className="text">Avvicina il QR Code alla camera</div>
          </div>
          <div className="instruction-item">
            <div className="icon">✅</div>
            <div className="text">Attendi la conferma della timbratura</div>
          </div>
        </div>
      </div>

      {/* Notifiche */}
      {notification.show && (
        <div className="kiosk-notification">
          <Notification
            message={notification.message}
            isVisible={notification.show}
            onClose={() => setNotification(prev => ({ ...prev, show: false }))}
            type={notification.type}
          />
        </div>
      )}
      
      {/* Overlay per prevenire interazioni indesiderate */}
      <div className="interaction-overlay" />
    </div>
  );
};

export default KioskApp;